/**
 * index.js - Server-side entry point
 * 
 * Main entry point for the Game of Worlds server. Sets up HTTP and WebSocket servers,
 * handles file serving, database connection, and initializes the game server.
 * 
 * This module is server-side and has full access to database connections
 * and server-side game state. It coordinates all server functionality.
 * 
 * Dependencies:
 * - Depends on server.js for WebSocket server functionality
 * - Uses map.js, combat.js, tech.js for game mechanics
 */
// Load environment variables
require('dotenv').config();

// Validate environment configuration
const { validateAndInitialize } = require('./config/env-validator');
validateAndInitialize();

const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mysql2 = require('mysql2');
const url = require('url');

// Import server logic
const serverLogic = require('./server');
const { createMockDatabase } = require('./lib/mock-db');
const security = require('./lib/security');
const { FROZEN_GAMEPLAY_COMMANDS } = require('./lib/websocket-protocol');

// Use shared game state from server.js
const { gameState } = serverLogic;
const { clients, clientMap, gameTimer, turns, activeGames } = gameState;

// Configuration
function parseDbPort(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 3306;
}

function parsePoolSize(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

const PUBLIC_ROOT = path.resolve(__dirname, '..', 'public');
const DEFAULT_DOCUMENT = 'landing.html';
const CACHEABLE_EXTENSIONS = new Set([
    '.css',
    '.json',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.webp',
    '.woff',
    '.woff2',
    '.ttf'
]);
const CONTENT_TYPE_MAP = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};
/* ============================================================
   TEXT GOES OUT COMPRESSED — it never used to, and that was the landing page's
   single largest load cost.

   Measured on the real files in public/: the landing page alone ships
   landing.min.js (100 KB), landing.min.css (52 KB) and, on any machine with a GPU,
   three.module.min.js + three.core.min.js + five postprocessing addons (~750 KB).
   Every byte of that left the server RAW, because this handler has only ever done
   createReadStream().pipe(). Roughly 1.1 MB of JavaScript on a cold hardware load,
   of which ~75% is whitespace-and-identifier redundancy that any HTTP client on
   the internet has been able to inflate for twenty years.

   The whole win is in these three sets and the negotiation below. Nothing about
   the files on disk changes, so `node tools/build-landing.js` and the cache-busting
   checks are untouched.

   WHY IT IS CACHED, AND WHY THE KEY IS THE MTIME
   Brotli on a 384 KB module is not free. Doing it per-request would trade a network
   cost for a CPU cost and, on a box serving several players, lose. These are static
   files, so the compressed bytes are a pure function of (path, mtime) — compress
   once, keep the buffer, and every later request is a memcpy. The mtime in the key
   is what makes `git pull && systemctl restart` unnecessary for correctness: touch a
   file and its cache entry is abandoned on the next request.

   Bounded on purpose. An unbounded map keyed by path is a slow memory leak on a
   long-lived process, so entries above SIZE_MAX are never cached (they are still
   compressed, just not remembered) and the whole map is dropped once it exceeds
   CACHE_MAX. Dropping the map wholesale rather than evicting an LRU is deliberate:
   the working set here is a few dozen files that all get re-requested immediately,
   so the simple thing costs one refill and needs no bookkeeping.
   ============================================================ */
const COMPRESSIBLE_EXTENSIONS = new Set([
    '.html', '.js', '.mjs', '.css', '.json', '.svg', '.map', '.txt', '.xml'
]);
// Below this, framing and the CPU cost outweigh anything compression saves.
const COMPRESS_MIN_BYTES = 1024;
// Compress-but-do-not-remember above this, so one huge asset cannot pin memory.
const COMPRESS_CACHE_SIZE_MAX = 2 * 1024 * 1024;
const COMPRESS_CACHE_MAX = 48 * 1024 * 1024;
/* Quality 6, not brotli's default of 11. Quality 11 on three.core.min.js takes over
   a second of blocked CPU to save about 3% more than 6 does, and the first visitor
   after every restart pays it. 6 is the knee of that curve. */
const BROTLI_OPTS = {
    params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT
    }
};
const compressCache = new Map();
let compressCacheBytes = 0;

/* Which encoding the client actually asked for.
   A token-by-token parse rather than a clever regex, because the clever regex was
   written first and got `gzip, deflate, br` — the single most common Accept-Encoding
   on the internet — wrong, silently, in the direction that still worked. Splitting on
   commas and reading each q-value is the whole specification and it fits in ten lines.
   `br` wins ties with gzip at equal q: it is 15-20% smaller on this project's files. */
function negotiateEncoding(acceptEncoding) {
    const header = String(acceptEncoding || '').toLowerCase().trim();
    if (!header) return null;
    const q = { br: -1, gzip: -1, '*': -1 };
    for (const part of header.split(',')) {
        const [rawName, ...params] = part.trim().split(';');
        const name = rawName.trim();
        if (!(name in q)) continue;
        let weight = 1;
        for (const p of params) {
            const m = /^\s*q=([0-9.]+)\s*$/.exec(p);
            if (m) weight = parseFloat(m[1]);
        }
        if (Number.isFinite(weight)) q[name] = weight;
    }
    // A bare `*` stands in for anything not named explicitly.
    if (q.br < 0 && q['*'] > 0) q.br = q['*'];
    if (q.gzip < 0 && q['*'] > 0) q.gzip = q['*'];
    if (q.br > 0 && q.br >= q.gzip) return 'br';
    if (q.gzip > 0) return 'gzip';
    return null;
}

function compressBuffer(buffer, encoding) {
    return new Promise((resolve, reject) => {
        const done = (err, out) => (err ? reject(err) : resolve(out));
        if (encoding === 'br') zlib.brotliCompress(buffer, BROTLI_OPTS, done);
        else zlib.gzip(buffer, { level: 6 }, done);
    });
}

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    // Observe deployment requirements before enforcing CSP. Inline styles and
    // legacy templates are intentionally reported while they are migrated.
    'Content-Security-Policy-Report-Only': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'"
};
const STARTED_AT = new Date().toISOString();
const DEPLOY_INFO_PATH = path.resolve(__dirname, 'deploy-info.json');

const PORT = process.env.PORT || 3000;
const DB_CONFIG = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseDbPort(process.env.DB_PORT),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'game'
};
const DB_POOL_SIZE = parsePoolSize(process.env.DB_POOL_SIZE);
const USE_MOCK_DB = /^(true|1|yes)$/i.test((process.env.USE_MOCK_DB || '').trim());
const TEST_GAME_MODE_ENABLED = /^(true|1|yes)$/i.test((process.env.ENABLE_TEST_GAME_MODE || '').trim()) || process.env.NODE_ENV === 'test';
const MAX_WEBSOCKET_MESSAGE_BYTES = 4096;
const CHAT_RATE_LIMIT_MAX = 20;
const CHAT_RATE_LIMIT_WINDOW_MS = 10000;

function readDeployInfo() {
    try {
        const raw = fs.readFileSync(DEPLOY_INFO_PATH, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function countKeys(value) {
    return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

function buildStatusPayload() {
    const databaseStatus = db && db.isOffline
        ? 'offline'
        : USE_MOCK_DB
            ? 'mock'
            : 'connected';

    return {
        ok: databaseStatus !== 'offline',
        status: databaseStatus === 'offline' ? 'degraded' : 'ok',
        service: 'game-of-worlds',
        startedAt: STARTED_AT,
        uptimeSeconds: Math.round(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        port: Number(PORT),
        database: {
            status: databaseStatus,
            reconnectScheduled: Boolean(reconnectTimer)
        },
        game: {
            clients: clients.length,
            activeGames: countKeys(activeGames),
            timers: countKeys(gameTimer),
            trackedTurns: countKeys(turns),
            resolvingTurns: Object.values(activeGames).filter(game => Boolean(game && game.turnResolution)).length
        },
        deploy: readDeployInfo()
    };
}

function sendJson(response, statusCode, payload, method = 'GET') {
    const body = JSON.stringify(payload, null, 2);
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        ...SECURITY_HEADERS,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': Buffer.byteLength(body, 'utf8')
    });
    if (method === 'HEAD') {
        response.end();
        return;
    }
    response.end(body);
}

function sendMethodNotAllowed(response, allowedMethods, method = 'GET') {
    const allow = allowedMethods.join(', ');
    const body = `Method not allowed. Allowed: ${allow}`;
    response.writeHead(405, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...SECURITY_HEADERS,
        'Allow': allow,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': Buffer.byteLength(body, 'utf8')
    });
    if (method === 'HEAD') {
        response.end();
        return;
    }
    response.end(body);
}

function parseCookies(cookieHeader) {
    if (!cookieHeader || typeof cookieHeader !== 'string') {
        return {};
    }

    return cookieHeader.split(';').reduce((acc, cookie) => {
        const separator = cookie.indexOf('=');
        if (separator === -1) {
            return acc;
        }
        const key = cookie.slice(0, separator).trim();
        const value = cookie.slice(separator + 1).trim();
        if (key) {
            acc[key] = value;
        }
        return acc;
    }, {});
}

function sendAuthError(response, statusCode, message) {
    sendJson(response, statusCode, { error: message });
}

function authorizeHttpUser(request, response, expectedUserId, callback) {
    const cookies = parseCookies(request.headers.cookie);
    const cookieUserId = String(cookies.userId || '').trim();
    const tempKey = String(cookies.tempKey || '').trim();
    const expected = expectedUserId === null || expectedUserId === undefined
        ? null
        : String(expectedUserId).trim();

    if (!/^\d+$/.test(cookieUserId) || !tempKey) {
        sendAuthError(response, 401, 'Authentication required');
        return;
    }

    if (expected && cookieUserId !== expected) {
        sendAuthError(response, 403, 'Forbidden');
        return;
    }

    db.query('SELECT tempkey FROM users WHERE id = ? LIMIT 1', [cookieUserId], (err, results) => {
        if (err) {
            sendAuthError(response, err.code === 'DB_OFFLINE' ? 503 : 500, 'Authentication unavailable');
            return;
        }

        const user = Array.isArray(results) && results.length > 0 ? results[0] : null;
        if (!user ||
            !user.tempkey ||
            !security.timingSafeEqualStrings(String(user.tempkey), tempKey)) {
            sendAuthError(response, 401, 'Authentication required');
            return;
        }

        callback({ userId: Number(cookieUserId) });
    });
}

function authorizeGameMember(request, response, gameId, callback) {
    const parsedGameId = Number.parseInt(gameId, 10);
    if (!Number.isSafeInteger(parsedGameId) || parsedGameId <= 0) {
        sendJson(response, 400, { error: 'Invalid game ID' });
        return;
    }

    authorizeHttpUser(request, response, null, auth => {
        db.query(`SELECT userid FROM players${parsedGameId} WHERE userid = ? LIMIT 1`, [auth.userId], (err, rows) => {
            if (err) {
                if (err.code === 'ER_NO_SUCH_TABLE') {
                    sendJson(response, 404, { error: 'Game not found' });
                    return;
                }
                sendJson(response, err.code === 'DB_OFFLINE' ? 503 : 500, { error: 'Authorization unavailable' });
                return;
            }

            if (!Array.isArray(rows) || rows.length === 0) {
                sendAuthError(response, 403, 'Forbidden');
                return;
            }

            callback(auth);
        });
    });
}

function handleChatMessage(connection, rawMessage) {
    if (!connection.gameid) {
        return;
    }

    const chatText = security.normalizeChatMessage(rawMessage);
    if (!chatText) {
        return;
    }

    const rateLimit = security.checkRateLimit(
        String(connection.name || connection.remoteAddress || 'unknown'),
        'chat',
        CHAT_RATE_LIMIT_MAX,
        CHAT_RATE_LIMIT_WINDOW_MS
    );

    if (!rateLimit.allowed) {
        connection.sendUTF(`Error: Chat rate limit exceeded. Try again in ${rateLimit.resetIn}s.`);
        return;
    }

    broadcastToGame(connection, `Player ${connection.name} says: ${chatText}`);
}

function buildPoolConfig() {
    return {
        ...DB_CONFIG,
        waitForConnections: true,
        connectionLimit: DB_POOL_SIZE,
        queueLimit: 0
    };
}

// Basic offline DB shim to avoid crashes while reconnecting
function createOfflineDb() {
    return {
        isOffline: true,
        query(query, params, callback) {
            const cb = typeof params === 'function' ? params : callback;
            if (typeof cb === 'function') {
                const err = new Error('Database connection is not available');
                err.code = 'DB_OFFLINE';
                process.nextTick(() => cb(err));
            }
        },
        getConnection(callback) {
            if (typeof callback === 'function') {
                const err = new Error('Database connection is not available');
                err.code = 'DB_OFFLINE';
                process.nextTick(() => callback(err));
            }
        },
        end(callback) {
            if (typeof callback === 'function') {
                process.nextTick(callback);
            }
        }
    };
}

let db = createOfflineDb();
let activePool = null;
let reconnectTimer = null;
serverLogic.setDatabase(db);

function scheduleReconnect() {
    if (reconnectTimer) {
        return;
    }
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectToDatabase();
    }, 5000);
    if (typeof reconnectTimer.unref === 'function') {
        reconnectTimer.unref();
    }
}

function teardownPool(pool, callback) {
    if (!pool || typeof pool.end !== 'function') {
        if (typeof callback === 'function') {
            callback();
        }
        return;
    }

    pool.end(err => {
        if (err) {
            console.error('Error closing database pool:', err.message || err);
        }
        if (typeof callback === 'function') {
            callback();
        }
    });
}

function setActiveDatabase(pool) {
    if (activePool && activePool !== pool) {
        teardownPool(activePool);
    }
    activePool = pool;
    pool.isOffline = false;
    db = pool;
    serverLogic.setDatabase(pool);
}

function setOfflineDatabase() {
    if (activePool) {
        const poolToClose = activePool;
        activePool = null;
        teardownPool(poolToClose);
    }

    const offlineDb = createOfflineDb();
    db = offlineDb;
    serverLogic.setDatabase(offlineDb);
}

function connectToDatabase() {
    const pool = mysql2.createPool(buildPoolConfig());

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error establishing database pool:', err.message || err);
            teardownPool(pool, () => {
                setOfflineDatabase();
                scheduleReconnect();
            });
            return;
        }

        connection.ping(pingErr => {
            connection.release();
            if (pingErr) {
                console.error('Database ping failed:', pingErr.message || pingErr);
                teardownPool(pool, () => {
                    setOfflineDatabase();
                    scheduleReconnect();
                });
                return;
            }

            console.log(`Connected to database (pool size: ${DB_POOL_SIZE})`);
            setActiveDatabase(pool);
            serverLogic.resumeActiveGamesFromDatabase()
                .then(count => {
                    if (count > 0) {
                        console.log(`Resumed turn timers for ${count} active game${count === 1 ? '' : 's'}`);
                    }
                })
                .catch(resumeErr => {
                    console.error('Unable to resume active game timers:', resumeErr.message || resumeErr);
                });
        });
    });

    pool.on('error', err => {
        console.error('Database pool error:', err);
        if (activePool === pool) {
            setOfflineDatabase();
            scheduleReconnect();
        }
    });
}

if (USE_MOCK_DB) {
    const mockDb = createMockDatabase();
    setActiveDatabase(mockDb);
    console.log('Using in-memory mock database (USE_MOCK_DB=1)');
} else {
    connectToDatabase();
}

// Create HTTP server
const httpServer = http.createServer((request, response) => {
    
    // Parse URL
    const parsedUrl = url.parse(request.url);
    let pathname = parsedUrl.pathname;
    console.log(`${new Date()} Received request for ${pathname}`);

    if (['/health', '/status', '/api/status', '/debug/deploy'].includes(pathname) && ['GET', 'HEAD'].includes(request.method)) {
        sendJson(response, 200, buildStatusPayload(), request.method);
        return;
    }
    
    // Handle API endpoints
    if (pathname === '/login' && request.method === 'POST') {
        serverLogic.handleLogin(request, response);
        return;
    }

    if (pathname === '/guest-login' && request.method === 'POST') {
        serverLogic.handleGuestLogin(request, response);
        return;
    }
    
    if (pathname === '/register' && request.method === 'POST') {
        serverLogic.handleRegister(request, response);
        return;
    }
    
    if (pathname === '/api/payment/create-intent' && request.method === 'POST') {
        serverLogic.handleCreatePaymentIntent(request, response);
        return;
    }
    
    if (pathname === '/api/payment/create-subscription' && request.method === 'POST') {
        serverLogic.handleCreateSubscription(request, response);
        return;
    }
    
    if (pathname === '/api/payment/webhook' && request.method === 'POST') {
        serverLogic.handlePaymentWebhook(request, response);
        return;
    }

    if (pathname === '/api/payment/confirm-test' && request.method === 'POST') {
        serverLogic.handleConfirmTestPayment(request, response);
        return;
    }
    
    if (pathname === '/api/payment/spend-crystals' && request.method === 'POST') {
        serverLogic.handleSpendCrystals(request, response);
        return;
    }
    if (pathname === '/config.js') {
        if (!['GET', 'HEAD'].includes(request.method)) {
            sendMethodNotAllowed(response, ['GET', 'HEAD'], request.method);
            return;
        }
        const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
        const paymentsEnabled = Boolean(process.env.STRIPE_SECRET_KEY && publishableKey);
        const payload = [
            `window.STRIPE_PUBLISHABLE_KEY = ${JSON.stringify(publishableKey)};`,
            `window.GAME_FEATURES = Object.assign({ paymentsEnabled: ${paymentsEnabled}, testGameMode: ${TEST_GAME_MODE_ENABLED} }, window.GAME_FEATURES || {});`
        ].join('\n');
        response.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            ...SECURITY_HEADERS,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Length': Buffer.byteLength(payload, 'utf8')
        });
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        response.end(payload);
        return;
    }

    if (pathname === '/api/config' && ['GET', 'HEAD'].includes(request.method)) {
        const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
        const paymentsEnabled = Boolean(process.env.STRIPE_SECRET_KEY && publishableKey);
        const body = JSON.stringify({
            stripePublishableKey: publishableKey,
            paymentsEnabled,
            testGameMode: TEST_GAME_MODE_ENABLED
        });
        response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            ...SECURITY_HEADERS,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Length': Buffer.byteLength(body, 'utf8')
        });
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        response.end(body);
        return;
    }
    
    // Handle balance query
    const balanceMatch = pathname.match(/^\/api\/user\/(\d+)\/balance$/);
    if (balanceMatch && request.method === 'GET') {
        authorizeHttpUser(request, response, balanceMatch[1], () => {
            serverLogic.handleGetBalance(request, response, balanceMatch[1]);
        });
        return;
    }
    
    // Handle owned items query
    const ownedMatch = pathname.match(/^\/api\/user\/(\d+)\/owned-items$/);
    if (ownedMatch && request.method === 'GET') {
        authorizeHttpUser(request, response, ownedMatch[1], () => {
            serverLogic.handleGetOwnedItems(request, response, ownedMatch[1]);
        });
        return;
    }
    
    // Handle purchase history query
    const historyMatch = pathname.match(/^\/api\/user\/(\d+)\/purchase-history$/);
    if (historyMatch && request.method === 'GET') {
        authorizeHttpUser(request, response, historyMatch[1], () => {
            serverLogic.handleGetPurchaseHistory(request, response, historyMatch[1]);
        });
        return;
    }

    // Handle active game query
    const currentGameMatch = pathname.match(/^\/api\/user\/(\d+)\/current-game$/);
    if (currentGameMatch && request.method === 'GET') {
        authorizeHttpUser(request, response, currentGameMatch[1], () => {
            serverLogic.handleGetCurrentGame(request, response, currentGameMatch[1]);
        });
        return;
    }

    // Handle live combat telemetry query
    const combatTelemetryMatch = pathname.match(/^\/api\/game\/(\d+)\/combat-telemetry$/);
    if (combatTelemetryMatch && request.method === 'GET') {
        authorizeGameMember(request, response, combatTelemetryMatch[1], auth => {
            serverLogic.handleGetCombatTelemetry(request, response, combatTelemetryMatch[1], auth.userId);
        });
        return;
    }

    const gameInvariantsMatch = pathname.match(/^\/api\/game\/(\d+)\/invariants$/);
    if (gameInvariantsMatch && request.method === 'GET' && process.env.NODE_ENV === 'test') {
        authorizeGameMember(request, response, gameInvariantsMatch[1], () => {
            serverLogic.handleGetGameInvariants(request, response, gameInvariantsMatch[1]);
        });
        return;
    }

    const testMapTerrainMatch = pathname.match(/^\/api\/game\/(\d+)\/test-map-terrain$/);
    if (testMapTerrainMatch && request.method === 'GET') {
        authorizeGameMember(request, response, testMapTerrainMatch[1], () => {
            serverLogic.handleGetTestMapTerrain(request, response, testMapTerrainMatch[1]);
        });
        return;
    }
    
    // Default to index.html for root path
    if (pathname === '/') {
      pathname = `/${DEFAULT_DOCUMENT}`;
    }

    if (pathname === '/index.html') {
        response.writeHead(302, {
            Location: '/landing.html',
            ...SECURITY_HEADERS,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        response.end();
        return;
    }

    if (pathname === '/js/shop.js') {
        if (!['GET', 'HEAD'].includes(request.method)) {
            sendMethodNotAllowed(response, ['GET', 'HEAD'], request.method);
            return;
        }
        const body = 'Legacy shop script disabled. Use shop-enhanced.js.';
        response.writeHead(410, {
            'Content-Type': 'text/plain; charset=utf-8',
            ...SECURITY_HEADERS,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Length': Buffer.byteLength(body, 'utf8')
        });
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        response.end(body);
        return;
    }

    if (pathname === '/race-selection.js') {
        if (!['GET', 'HEAD'].includes(request.method)) {
            sendMethodNotAllowed(response, ['GET', 'HEAD'], request.method);
            return;
        }
        serveFile('/js/race-selection.js', response, request.method, request.headers['accept-encoding']);
        return;
    }

    if (!['GET', 'HEAD'].includes(request.method)) {
        sendMethodNotAllowed(response, ['GET', 'HEAD'], request.method);
        return;
    }
    
    // Protected pages that require authentication
    const protectedPages = ['/game.html', '/lobby.html', '/purchase-race.html'];
    
    // Check if the requested page is protected
    if (protectedPages.includes(pathname)) {
        // Parse cookies to check authentication
        const cookies = request.headers.cookie ? request.headers.cookie.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {}) : {};
        
        const userId = cookies.userId;
        const tempKey = cookies.tempKey;
        
        // Verify authentication
        if (!userId || !tempKey) {
            // No authentication cookies, redirect to login
            response.writeHead(302, {'Location': '/login.html'});
            response.end();
            return;
        }
        
        // Verify credentials against database
        db.query('SELECT tempkey FROM users WHERE id = ?', [userId], (err, results) => {
            if (err ||
                results.length === 0 ||
                !results[0].tempkey ||
                !security.timingSafeEqualStrings(String(results[0].tempkey), String(tempKey || ''))) {
                // Invalid credentials, redirect to login
                response.writeHead(302, {'Location': '/login.html'});
                response.end();
                return;
            }
            
            // Valid authentication, serve the file
            serveFile(pathname, response, request.method, request.headers['accept-encoding']);
        });
        return;
    }
    
    // For non-protected pages, serve directly
    serveFile(pathname, response, request.method, request.headers['accept-encoding']);
});

// Helper function to serve files
function serveFile(pathname, response, method = 'GET', acceptEncoding = null) {
    let requestedPath = pathname || '';
    if (requestedPath === '' || requestedPath === '/') {
        requestedPath = `/${DEFAULT_DOCUMENT}`;
    } else if (requestedPath.endsWith('/')) {
        requestedPath = `${requestedPath}index.html`;
    }

    const normalizedPath = path.posix.normalize(requestedPath.replace(/\\/g, '/'));
    const relativePath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;
    const absolutePath = path.resolve(PUBLIC_ROOT, relativePath);
    const relativeToRoot = path.relative(PUBLIC_ROOT, absolutePath);

    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
        response.writeHead(403, {
            'Content-Type': 'text/plain; charset=utf-8',
            ...SECURITY_HEADERS,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        response.end('Forbidden');
        return;
    }

    fs.stat(absolutePath, (statErr, stats) => {
        if (statErr || !stats.isFile()) {
            response.writeHead(404, {
                'Content-Type': 'text/plain; charset=utf-8',
                ...SECURITY_HEADERS,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            response.end('File not found');
            return;
        }

        const ext = path.extname(absolutePath).toLowerCase() || '.html';
        const contentType = CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
        const headers = {
            'Content-Type': contentType,
            ...SECURITY_HEADERS
        };

        if (CACHEABLE_EXTENSIONS.has(ext)) {
            headers['Cache-Control'] = 'public, max-age=31536000, immutable';
            headers['Last-Modified'] = stats.mtime.toUTCString();
        } else {
            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        }

        /* Announced even when this particular response went out identity: a shared
           cache that stored the raw bytes without it would go on to serve them to a
           client that asked for br, and vice versa. The header describes the URL's
           behaviour, not this one reply. */
        const compressible = COMPRESSIBLE_EXTENSIONS.has(ext) && stats.size >= COMPRESS_MIN_BYTES;
        if (compressible) headers['Vary'] = 'Accept-Encoding';

        if (method === 'HEAD') {
            // Identity length. A HEAD that promised a compressed length would have to
            // compress the file to know it, which is the one thing HEAD exists to avoid.
            headers['Content-Length'] = stats.size;
            response.writeHead(200, headers);
            response.end();
            return;
        }

        const encoding = compressible ? negotiateEncoding(acceptEncoding) : null;

        // Nothing to negotiate: images, fonts, tiny files, or a client that asked for
        // neither encoding. Stream it exactly as before.
        if (!encoding) {
            response.writeHead(200, headers);
            const stream = fs.createReadStream(absolutePath);
            stream.on('error', err => {
                console.error('Error streaming file:', err);
                if (!response.headersSent) {
                    response.writeHead(500, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        ...SECURITY_HEADERS,
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    });
                }
                response.end('Internal server error');
            });
            stream.pipe(response);
            return;
        }

        const cacheKey = `${encoding}:${absolutePath}:${stats.mtimeMs}:${stats.size}`;
        const hit = compressCache.get(cacheKey);
        if (hit) {
            headers['Content-Encoding'] = encoding;
            headers['Content-Length'] = hit.length;
            response.writeHead(200, headers);
            response.end(hit);
            return;
        }

        fs.readFile(absolutePath, (readErr, raw) => {
            if (readErr) {
                console.error('Error reading file:', readErr);
                if (!response.headersSent) {
                    response.writeHead(500, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        ...SECURITY_HEADERS,
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    });
                }
                response.end('Internal server error');
                return;
            }
            compressBuffer(raw, encoding).then(out => {
                /* A file that does not shrink goes out raw. Rare for text, but a
                   pre-compressed .json blob or an already-dense .map would otherwise
                   cost the client a decompression pass to receive MORE bytes. */
                if (out.length >= raw.length) {
                    headers['Content-Length'] = raw.length;
                    response.writeHead(200, headers);
                    response.end(raw);
                    return;
                }
                if (out.length <= COMPRESS_CACHE_SIZE_MAX) {
                    if (compressCacheBytes + out.length > COMPRESS_CACHE_MAX) {
                        compressCache.clear();
                        compressCacheBytes = 0;
                    }
                    compressCache.set(cacheKey, out);
                    compressCacheBytes += out.length;
                }
                headers['Content-Encoding'] = encoding;
                headers['Content-Length'] = out.length;
                response.writeHead(200, headers);
                response.end(out);
            }).catch(err => {
                // Compression is an optimisation and must never be the reason a page
                // fails to load. Fall back to the bytes on disk.
                console.error('Compression failed, serving identity:', err);
                headers['Content-Length'] = raw.length;
                response.writeHead(200, headers);
                response.end(raw);
            });
        });
    });
}

// Start HTTP server
httpServer.listen(PORT, () => {
    console.log(`${new Date()} Server is listening on port ${PORT}`);
});

// Create WebSocket server
const wsServer = new WebSocketServer({
    httpServer: httpServer,
    autoAcceptConnections: false
});


// Remove duplicate request handler - already handled in httpServer creation above

// WebSocket connection handler
wsServer.on('request', request => {
    const connection = request.accept(null, request.origin);
    connection.name = 'unknown';
    clients.push(connection);
    
    console.log(`${new Date()} Connection accepted from ${connection.remoteAddress}`);
    broadcastConnectedUsers();
    
    // Message handler
    connection.on('message', message => {
        if (message.type !== 'utf8') {
            console.log("Non-UTF data received. Closing connection.");
            connection.close();
            return;
        }
        
        const data = String(message.utf8Data || '');
        if (Buffer.byteLength(data, 'utf8') > MAX_WEBSOCKET_MESSAGE_BYTES) {
            console.log(`Rejected oversized WebSocket message from ${connection.remoteAddress}`);
            connection.sendUTF('Error: Message too large');
            return;
        }

        console.log(`Incoming WebSocket message (${Buffer.byteLength(data, 'utf8')} bytes)`);
        
        // Handle authentication
        if (connection.name === 'unknown') {
            if (data.indexOf("//auth:") === 0) {
                authUser(data, connection);
            } else {
                console.log("Unauthenticated user poking the server");
                connection.close();
            }
            return;
        }
        
        // Handle commands
        if (data.indexOf("//") === 0) {
            handleCommand(data, connection);
        } else {
            // Regular chat message
            handleChatMessage(connection, data);
        }
    });
    
    // Connection close handler
    connection.on('close', (reasonCode, description) => {
        const index = clients.indexOf(connection);
        if (index !== -1) {
            clients.splice(index, 1);
        }
        
        serverLogic.handlePlayerDisconnect(connection);
        
        console.log(`${new Date()} Peer ${connection.remoteAddress} disconnected`);
        broadcastConnectedUsers();
        
        // Notify other players in the same game
        if (connection.gameid) {
            serverLogic.broadcastPlayerList(connection.gameid);
        }
    });
});

// Handle commands from clients
function handleCommand(data, connection) {
    const command = data.split(":")[0].substring(2);
    const frozenCommands = new Set(FROZEN_GAMEPLAY_COMMANDS);
    if (connection.gameid && frozenCommands.has(command) && serverLogic.isBattlePauseActive(connection.gameid)) {
        connection.sendUTF('Error: Battle in progress; orders are temporarily frozen');
        return;
    }
    if (connection.gameid && frozenCommands.has(command) && serverLogic.isTurnProcessing(connection.gameid)) {
        connection.sendUTF('Error: Turn resolution in progress; orders will resume when the new turn is ready');
        return;
    }
    serverLogic.markPlayerGameActivity(connection);
    
    switch (command) {
        case "start":
            serverLogic.handleGameStart(connection);
            break;
        case "creategame":
            serverLogic.handleCreateGame(data, connection);
            break;
        case "gamelist":
            serverLogic.handleGameList(connection);
            break;
        case "currentgame":
            serverLogic.handleCurrentGame(connection);
            break;
        case "leavegame":
            serverLogic.handleLeaveGame(connection);
            break;
        case "addai":
            serverLogic.handleAddAi(data, connection);
            break;
        case "changerace":
            serverLogic.handleChangeRace(data, connection);
            break;
        case "surrender":
            serverLogic.handleSurrender(connection);
            break;
        case "colonize":
            serverLogic.colonizePlanet(connection, data);
            break;
        case "buytech":
            serverLogic.buyTech(data, connection);
            break;
        case "techstate":
            serverLogic.handleTechStateRequest(data, connection);
            break;
        case "victoryprogress":
            serverLogic.handleVictoryProgressRequest(connection);
            break;
        case "probe":
            serverLogic.probeSector(data, connection);
            break;
        case "buyship":
            serverLogic.buyShip(data, connection);
            break;
        case "buybuilding":
            serverLogic.buyBuilding(data, connection);
            break;
        case "move":
            serverLogic.moveFleet(data, connection);
            break;
        case "sector":
            serverLogic.updateSector(data, connection);
            break;
        case "namesector":
            serverLogic.nameSector(data, connection);
            break;
        case "moveoptions":
            serverLogic.requestMoveOptions(data, connection);
            break;
        case "mmove":
            serverLogic.surroundShips(data, connection);
            break;
        case "sendmmf":
            serverLogic.preMoveFleet(data, connection);
            break;
        case "update":
            serverLogic.updateResources(connection);
            if (connection.gameid) {
                serverLogic.sendTechState(connection);
                serverLogic.sendEmpireSummary(connection);
                serverLogic.sendVictoryProgress(connection);
                serverLogic.updateAllSectors(connection.gameid, connection);
                // The cluster reading, once per player. This is the first `//update` after the game
                // screen authenticates, which is the earliest moment the client is listening - the
                // advisory cannot be broadcast at game start because `startgame::` navigates the
                // browser to game.html and anything sent after it is lost.
                serverLogic.deliverStandingAdvisory(connection);
            }
            break;
        case "joingame":
            serverLogic.handleJoinGame(data, connection);
            break;
        case "getunlockedraces":
            serverLogic.handleGetUnlockedRaces(connection);
            break;
        case "standingorders":
            serverLogic.handleStandingOrders(data, connection);
            break;
        case "applyorders":
            serverLogic.handleApplyStandingOrders(connection);
            break;
        default:
            connection.sendUTF(`Unknown command: ${command}`);
    }
}

// Helper Functions
function broadcastConnectedUsers() {
    clients.forEach(client => {
        client.sendUTF(`$^$${clients.length}`);
    });
    console.log(`There are ${clients.length} clients connected`);
}

function broadcastToGame(sender, message) {
    if (!sender.gameid) return;
    
    clients.forEach(client => {
        if (client.gameid === sender.gameid) {
            client.sendUTF(message);
        }
    });
}

function broadcastPlayerList(gameId) {
    serverLogic.broadcastPlayerList(gameId);
}

// in rewrite/index.js - complete the authUser function
function authUser(message, connection) {
    const parts = message.split(":");
    if (parts.length < 3) {
        connection.sendUTF("Invalid authentication format");
        connection.close();
        return;
    }
    
    const playerId = parts[1];
    const tempKey = parts[2];
    
    console.log(`Player ${playerId} attempting to authenticate`);
    
    db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [playerId], (err, results) => {
        if (err) {
            console.error("Database error during authentication:", err);
            connection.sendUTF("Database error");
            connection.close();
            return;
        }
        
        if (results.length === 0) {
            connection.sendUTF("User not found");
            connection.close();
            return;
        }
        
        const user = results[0];
        
        if (!user.tempkey ||
            !tempKey ||
            !security.timingSafeEqualStrings(String(user.tempkey), String(tempKey))) {
            connection.sendUTF("Invalid credentials");
            console.log("Wrong credentials. Authentication failed.");
            connection.close();
            return;
        }

        connection.name = String(playerId);
        clientMap[playerId] = connection;

        if (user.currentgame) {
            connection.gameid = user.currentgame;
            console.log(`Player ${playerId} authenticated, joining game ${user.currentgame}`);

            serverLogic.handleCurrentGame(connection, (_err, payload) => {
                if (payload && payload.started) {
                    connection.sendUTF("You have re-connected to a game that is already in progress.");
                    serverLogic.updateResources(connection);
                    serverLogic.sendTechState(connection);
                    serverLogic.sendEmpireSummary(connection);
                    serverLogic.sendVictoryProgress(connection);
                    serverLogic.updateAllSectors(connection.gameid, connection);
                } else if (payload && payload.gameId) {
                    connection.sendUTF("The game has yet to begin. Welcome.");
                }
            });
            return;
        }

        connection.gameid = null;
        connection.sendUTF("lobby::");
        serverLogic.handleGameList(connection);
        console.log(`Player ${playerId} authenticated in lobby mode`);
    });
}

let shuttingDown = false;

function shutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(`${new Date()} Received ${signal}; shutting down server`);

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    Object.keys(gameTimer).forEach(gameId => {
        clearInterval(gameTimer[gameId]);
        delete gameTimer[gameId];
    });

    clients.slice().forEach(connection => {
        try {
            connection.close();
        } catch {
            // Ignore close failures during process shutdown.
        }
    });

    const forceExit = setTimeout(() => {
        console.error('Graceful shutdown timed out; exiting');
        process.exit(1);
    }, 5000);
    if (typeof forceExit.unref === 'function') {
        forceExit.unref();
    }

    httpServer.close(() => {
        teardownPool(activePool, () => {
            clearTimeout(forceExit);
            process.exit(0);
        });
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
