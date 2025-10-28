/**
 * index.js - Server-side entry point
 * 
 * Main entry point for the Game of Words server. Sets up HTTP and WebSocket servers,
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
const mysql2 = require('mysql2');
const url = require('url');

// Import server logic
const serverLogic = require('./server');

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
    '.js',
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
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'SAMEORIGIN'
};

const PORT = process.env.PORT || 1337;
const DB_CONFIG = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseDbPort(process.env.DB_PORT),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'game'
};
const DB_POOL_SIZE = parsePoolSize(process.env.DB_POOL_SIZE);

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

connectToDatabase();

// Create HTTP server
const httpServer = http.createServer((request, response) => {
    console.log(`${new Date()} Received request for ${request.url}`);
    
    // Parse URL
    const parsedUrl = url.parse(request.url);
    let pathname = parsedUrl.pathname;
    
    // Handle API endpoints
    if (pathname === '/login' && request.method === 'POST') {
        serverLogic.handleLogin(request, response);
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
    
    if (pathname === '/api/payment/spend-crystals' && request.method === 'POST') {
        serverLogic.handleSpendCrystals(request, response);
        return;
    }
    
    // Handle balance query
    const balanceMatch = pathname.match(/^\/api\/user\/(\d+)\/balance$/);
    if (balanceMatch && request.method === 'GET') {
        serverLogic.handleGetBalance(request, response, balanceMatch[1]);
        return;
    }
    
    // Handle owned items query
    const ownedMatch = pathname.match(/^\/api\/user\/(\d+)\/owned-items$/);
    if (ownedMatch && request.method === 'GET') {
        serverLogic.handleGetOwnedItems(request, response, ownedMatch[1]);
        return;
    }
    
    // Handle purchase history query
    const historyMatch = pathname.match(/^\/api\/user\/(\d+)\/purchase-history$/);
    if (historyMatch && request.method === 'GET') {
        serverLogic.handleGetPurchaseHistory(request, response, historyMatch[1]);
        return;
    }
    
    // Default to index.html for root path
    if (pathname === '/') {
      pathname = `/${DEFAULT_DOCUMENT}`;
    }
    
    // Protected pages that require authentication
    const protectedPages = ['/index.html', '/game.html', '/lobby.html', '/purchase-race.html'];
    
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
            if (err || results.length === 0 || results[0].tempkey !== tempKey) {
                // Invalid credentials, redirect to login
                response.writeHead(302, {'Location': '/login.html'});
                response.end();
                return;
            }
            
            // Valid authentication, serve the file
            serveFile(pathname, response, request.method);
        });
        return;
    }
    
    // For non-protected pages, serve directly
    serveFile(pathname, response, request.method);
});

// Helper function to serve files
function serveFile(pathname, response, method = 'GET') {
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

        if (method === 'HEAD') {
            headers['Content-Length'] = stats.size;
            response.writeHead(200, headers);
            response.end();
            return;
        }

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
        
        const data = message.utf8Data;
        console.log(`Incoming message: ${data}`);
        
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
            broadcastToGame(connection, `Player ${connection.name} says: ${data}`);
        }
    });
    
    // Connection close handler
    connection.on('close', (reasonCode, description) => {
        const index = clients.indexOf(connection);
        if (index !== -1) {
            clients.splice(index, 1);
        }
        
        if (clientMap[connection.name]) {
            delete clientMap[connection.name];
        }
        
        console.log(`${new Date()} Peer ${connection.remoteAddress} disconnected`);
        broadcastConnectedUsers();
        
        // Notify other players in the same game
        if (connection.gameid) {
            broadcastPlayerList(connection.gameid);
        }
    });
});

// Handle commands from clients
function handleCommand(data, connection) {
    const command = data.split(":")[0].substring(2);
    
    switch (command) {
        case "start":
            serverLogic.handleGameStart(connection);
            break;
        case "colonize":
            serverLogic.colonizePlanet(connection);
            break;
        case "buytech":
            serverLogic.buyTech(data, connection);
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
        case "mmove":
            serverLogic.surroundShips(data, connection);
            break;
        case "sendmmf":
            serverLogic.preMoveFleet(data, connection);
            break;
        case "update":
            serverLogic.updateResources(connection);
            break;
        case "joingame":
            serverLogic.handleJoinGame(data, connection);
            break;
        case "getunlockedraces":
            serverLogic.handleGetUnlockedRaces(connection);
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
    let playerList = "pl";
    
    // Build list of players in this game
    clients.forEach(client => {
        if (client.gameid === gameId) {
            playerList += ":" + client.name;
        }
    });
    
    // Only broadcast if we have players
    if (playerList !== "pl") {
        clients.forEach(client => {
            if (client.gameid === gameId) {
                client.sendUTF(playerList);
            }
        });
    }
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
        
        if (user.tempkey === tempKey && user.currentgame) {
            // Authentication successful
            connection.name = playerId;
            connection.gameid = user.currentgame;
            clientMap[playerId] = connection;
            
            console.log(`Player ${playerId} authenticated, joining game ${user.currentgame}`);
            
            // Handle game state
            if (turns[connection.gameid] > 0) {
                connection.sendUTF("You have re-connected to a game that is already in progress.");
                serverLogic.updateResources(connection);
                serverLogic.updateAllSectors(connection.gameid, connection);
            } else {
                connection.sendUTF("lobby::");
                connection.sendUTF("The game has yet to begin. Welcome.");
            }
            
            // Broadcast player list to all players in the game
            broadcastPlayerList(connection.gameid);
        } else if (!user.currentgame) {
            connection.sendUTF("Please join a game first.");
            console.log("No game set for player. Authentication failed.");
            connection.close();
        } else {
            connection.sendUTF("Invalid credentials");
            console.log("Wrong credentials. Authentication failed.");
            connection.close();
        }
    });
}
