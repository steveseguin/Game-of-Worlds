/**
 * server.js - Core server-side game logic
 * 
 * Implements the core game logic on the server side, including
 * game state management, player actions processing, and database interactions.
 * This module exports functions to be used by index.js.
 * 
 * Dependencies:
 * - Depends on lib/map.js, lib/combat.js, lib/tech.js for game mechanics
 * - Used by index.js as the main server implementation
 */

const mysql2 = require('mysql2');
const crypto = require('crypto');

// Import game mechanics modules
const mapSystem = require('./lib/map');
const combatSystem = require('./lib/combat');
const techSystem = require('./lib/tech');
const raceSystem = require('./lib/races');
const securitySystem = require('./lib/security');
const victorySystem = require('./lib/victory');
const aiSystem = require('./lib/ai');
const diplomacySystem = require('./lib/diplomacy');
const { PaymentManager } = require('./lib/payments');
const PaymentEndpoints = require('./lib/payment-endpoints');

// Game state (shared with index.js)
const gameState = {
    clients: [],
    clientMap: {},
    gameTimer: {},
    turns: {},
    activeGames: {}
};
const aiManager = new aiSystem.AIManager();

// Database connection (will be set by index.js)
let db = null;
let paymentManager = null;
let paymentEndpoints = null;
let hasEnsuredGameModeColumn = false;

// Expose game state for other modules that rely on it
global.gameState = gameState;

const VALID_LOBBY_PLAYER_COUNTS = new Set([2, 3, 4, 6, 8, 12, 25, 50, 100, 250, 500, 1000]);
const DEFAULT_MAX_PLAYERS = 4;
const MAX_LOBBY_PLAYERS = 1000;
const GAME_LIST_LIMIT = 25;
const DEFAULT_CREATOR_RACE_ID = 1;
const MIN_PLAYERS_TO_START = 1;
const TURN_SPEEDS_MS = {
    quick: Number(process.env.TURN_INTERVAL_QUICK_MS) || 180000, // 3 minutes
    epic: Number(process.env.TURN_INTERVAL_EPIC_MS) || 86400000 // 24 hours
};
const DEFAULT_GAME_MODE = 'quick';
const EPIC_RESOURCE_MULTIPLIER = Number(process.env.EPIC_RESOURCE_MULTIPLIER) || 12;
const EPIC_AUTO_BUILD_ENABLED = String(process.env.EPIC_AUTO_BUILD || 'true').toLowerCase() !== 'false';
const BUILDING_COSTS = {
    0: { name: "Metal Extractor", metal: 50, crystal: 20 },
    1: { name: "Crystal Refinery", metal: 40, crystal: 30 },
    2: { name: "Research Academy", metal: 60, crystal: 40 },
    3: { name: "Spaceport", metal: 100, crystal: 50 },
    4: { name: "Orbital Turret", metal: 80, crystal: 60 },
    5: { name: "Warp Gate", metal: 200, crystal: 150 }
};
const DEFAULT_STANDING_ORDERS = {
    autoRebuild: false,
    autoScout: false
};
const SCOUT_SHIP_ID = combatSystem.SHIP_TYPES?.SCOUT?.id || 3;
const COLONY_SHIP_ID = combatSystem.SHIP_TYPES?.COLONY_SHIP?.id || 6;
const PROBE_COST_CRYSTAL = 300;
// Enough crystal for one opening probe (300) plus some fleet moves — probing
// versus blind exploration is the game's first meaningful decision.
const STARTING_RESOURCES = Object.freeze({ metal: 300, crystal: 400, research: 100 });
// Building slots scale with the body being built on.
const BUILDING_SLOTS_BY_TYPE = Object.freeze({
    1: 1,  // secured asteroid belt: one mining rig
    6: 2,  // micro planet
    7: 3,  // small planet
    8: 4,  // medium planet
    9: 5,  // large planet
    10: 6  // homeworld
});
const STARTING_BUILDINGS = Object.freeze([0, 4]); // Metal Extractor + Orbital Turret, matching the PHP start.
const GAME_TABLE_SUFFIXES = [
    'map',
    'players',
    'ships',
    'buildings',
    'diplomacy',
    'wonders',
    'game_snapshots'
];

function ensureGamesModeColumn() {
    if (hasEnsuredGameModeColumn || !db || db.isOffline || typeof db.query !== 'function') {
        return;
    }

    hasEnsuredGameModeColumn = true;

    if (db.isMock) {
        return;
    }

    db.query("SHOW COLUMNS FROM games LIKE 'mode'", (showErr, rows) => {
        if (showErr) {
            console.warn('Unable to verify games.mode column:', showErr.message || showErr);
            return;
        }

        if (Array.isArray(rows) && rows.length > 0) {
            return;
        }

        db.query("ALTER TABLE games ADD COLUMN mode VARCHAR(16) DEFAULT 'quick'", alterErr => {
            if (alterErr && alterErr.code !== 'ER_DUP_FIELDNAME') {
                console.warn('Unable to ensure games.mode column:', alterErr.message || alterErr);
            }
        });
    });
}

// Set the database connection
function setDatabase(database) {
    db = database;
    
    if (!database || database.isOffline) {
        paymentManager = null;
        paymentEndpoints = null;
        return;
    }
    
    // Initialize payment manager with database
    paymentManager = new PaymentManager(db);
    // Initialize payment endpoints
    paymentEndpoints = new PaymentEndpoints(paymentManager, db);
    ensureGamesModeColumn();
}

// Authentication functions
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function generateTempKey() {
    return crypto.randomBytes(32).toString('hex');
}

const LOBBY_LIST_LIMIT = 200;
const AI_DIFFICULTIES = new Set(['chill', 'medium', 'aggressive']);
const AI_STRATEGIES = new Set(['balanced', 'aggressive', 'economic']);
const BATTLE_VISIBILITY_CONFIG = Object.freeze({
    OVERWHELMING_FORCE_RATIO: 4.5,
    OVERWHELMING_MIN_SHIPS: 8,
    STEALTH_CONCEALMENT_THRESHOLD: 0.45
});
const SHIP_TYPE_MODIFIER_KEYS = Object.freeze({
    1: 'frigate',
    2: 'destroyer',
    3: 'scout',
    4: 'cruiser',
    5: 'battleship',
    6: 'colony',
    7: 'dreadnought',
    8: 'intruder',
    9: 'carrier'
});
const SHIP_TYPE_IDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const SHIP_TYPE_NAME_BY_ID = Object.freeze(
    Object.values(combatSystem.SHIP_TYPES).reduce((acc, ship) => {
        if (ship && ship.id) {
            acc[ship.id] = ship.name || `Ship ${ship.id}`;
        }
        return acc;
    }, {})
);
const COMBAT_TELEMETRY_RECENT_BATTLES = 120;
const COMBAT_TELEMETRY_MAX_GAMES = 64;
const combatTelemetryStore = new Map();

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSectorToken(value) {
    if (value === undefined || value === null) {
        return NaN;
    }
    const raw = String(value).trim();
    if (!raw) {
        return NaN;
    }

    // Client map labels and selection protocol use hexadecimal sector IDs.
    const parsedHex = Number.parseInt(raw, 16);
    return Number.isFinite(parsedHex) ? parsedHex : NaN;
}

function formatSectorToken(sectorId) {
    return Number(sectorId).toString(16).toUpperCase();
}

function calculateMapSize(maxPlayers) {
    const players = Math.max(2, Math.min(MAX_LOBBY_PLAYERS, parsePositiveInt(maxPlayers, DEFAULT_MAX_PLAYERS)));
    if (players <= 8) {
        return { width: 14, height: 8 };
    }

    const targetSectors = Math.max(112, players * 4);
    const aspect = 14 / 8;
    const width = Math.ceil(Math.sqrt(targetSectors * aspect));
    const height = Math.ceil(targetSectors / width);
    return { width, height };
}

function getGameMapSizeSync(gameId) {
    const active = gameState.activeGames[gameId];
    if (active && active.mapSize && active.mapSize.width && active.mapSize.height) {
        return active.mapSize;
    }
    return { width: 14, height: 8 };
}

function rememberGameMapSize(gameId, mapSize) {
    if (!gameState.activeGames[gameId]) {
        gameState.activeGames[gameId] = {};
    }
    gameState.activeGames[gameId].mapSize = {
        width: Number(mapSize.width) || 14,
        height: Number(mapSize.height) || 8
    };
}

function getAdjacentSectorIds(sectorId, width = 14, height = 8) {
    const id = Number(sectorId);
    if (!Number.isFinite(id) || id < 1 || id > width * height) {
        return [];
    }

    const zeroBased = id - 1;
    const x = zeroBased % width;
    const y = Math.floor(zeroBased / width);
    const adjacent = [];

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            adjacent.push((ny * width) + nx + 1);
        }
    }

    return adjacent;
}

function normalizeMode(mode) {
    return mode === 'epic' ? 'epic' : 'quick';
}

function normalizeAiDifficulty(raw) {
    const value = (raw || '').toLowerCase();
    return AI_DIFFICULTIES.has(value) ? value : 'medium';
}

function normalizeAiStrategy(raw) {
    const value = (raw || '').toLowerCase();
    return AI_STRATEGIES.has(value) ? value : 'balanced';
}

function getRaceById(raceId) {
    return Object.values(raceSystem.RACE_TYPES).find(race => race.id === raceId) || raceSystem.RACE_TYPES.TERRAN;
}

function safeDecodeURIComponent(value, fallback = '') {
    if (typeof value !== 'string') {
        return fallback;
    }
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return fallback;
    }
}

function createGameTables(gameId, callback) {
    const statements = [
        `CREATE TABLE IF NOT EXISTS map${gameId} (
            sectorid INT PRIMARY KEY,
            x INT NOT NULL,
            y INT NOT NULL,
            type INT DEFAULT 0,
            owner INT DEFAULT NULL,
            metalbonus INT DEFAULT 100,
            crystalbonus INT DEFAULT 100,
            terraformlvl INT DEFAULT 0,
            artifact INT DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS players${gameId} (
            userid INT PRIMARY KEY,
            race_id INT DEFAULT 1,
            is_ai TINYINT DEFAULT 0,
            ai_difficulty VARCHAR(16) DEFAULT 'medium',
            ai_strategy VARCHAR(16) DEFAULT 'balanced',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            alliance_id INT DEFAULT NULL,
            metal INT DEFAULT 100,
            crystal INT DEFAULT 100,
            research INT DEFAULT 50,
            tech VARCHAR(255) DEFAULT '',
            homeworld INT DEFAULT NULL,
            currentsector INT DEFAULT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS ships${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner INT NOT NULL,
            type INT NOT NULL,
            sectorid INT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS buildings${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sectorid INT NOT NULL,
            type INT NOT NULL,
            owner INT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS wonders${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner INT NOT NULL,
            type VARCHAR(64) NOT NULL,
            turn_built INT DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS explored_sectors${gameId} (
            playerid INT NOT NULL,
            sectorid INT NOT NULL,
            discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (playerid, sectorid)
        )`
    ];

    let index = 0;
    const runNext = () => {
        if (index >= statements.length) {
            callback(null);
            return;
        }

        const sql = statements[index++];
        db.query(sql, err => {
            if (err) {
                callback(err);
                return;
            }
            runNext();
        });
    };

    runNext();
}

function ensurePlayerTableColumns(gameId, callback) {
    const requiredColumns = [
        { name: 'joined_at', sql: `ALTER TABLE players${gameId} ADD COLUMN joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` },
        { name: 'is_ai', sql: `ALTER TABLE players${gameId} ADD COLUMN is_ai TINYINT DEFAULT 0` },
        { name: 'ai_difficulty', sql: `ALTER TABLE players${gameId} ADD COLUMN ai_difficulty VARCHAR(16) DEFAULT 'medium'` },
        { name: 'ai_strategy', sql: `ALTER TABLE players${gameId} ADD COLUMN ai_strategy VARCHAR(16) DEFAULT 'balanced'` }
    ];

    let idx = 0;
    const ensureNext = () => {
        if (idx >= requiredColumns.length) {
            callback(null);
            return;
        }

        const column = requiredColumns[idx++];
        db.query(`SHOW COLUMNS FROM players${gameId} LIKE '${column.name}'`, (showErr, rows) => {
            if (showErr) {
                callback(showErr);
                return;
            }

            if (rows && rows.length > 0) {
                ensureNext();
                return;
            }

            db.query(column.sql, alterErr => {
                if (alterErr) {
                    callback(alterErr);
                    return;
                }
                ensureNext();
            });
        });
    };

    ensureNext();
}

// Handle login endpoint
async function handleLogin(request, response) {
    let body = '';
    request.on('data', chunk => {
        body += chunk.toString();
    });
    
    request.on('end', () => {
        try {
            const { username, password } = JSON.parse(body);
            
            // Validate input
            const usernameValidation = securitySystem.validateUsername(username);
            if (!usernameValidation.valid) {
                response.writeHead(400, {'Content-Type': 'application/json'});
                response.end(JSON.stringify({error: usernameValidation.error}));
                return;
            }
            
            db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
                if (err) {
                    response.writeHead(500, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({error: 'Database error'}));
                    return;
                }
                
                if (results.length === 0) {
                    response.writeHead(401, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({error: 'Invalid username or password'}));
                    return;
                }
                
                const user = results[0];
                const hashedPassword = hashPassword(password, user.salt);
                
                if (hashedPassword !== user.password) {
                    response.writeHead(401, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({error: 'Invalid username or password'}));
                    return;
                }
                
                // Generate temporary key for WebSocket authentication
                const tempKey = generateTempKey();
                
                db.query('UPDATE users SET tempkey = ? WHERE id = ?', [tempKey, user.id], (err) => {
                    if (err) {
                        response.writeHead(500, {'Content-Type': 'application/json'});
                        response.end(JSON.stringify({error: 'Database error'}));
                        return;
                    }
                    
                    response.writeHead(200, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({
                        success: true,
                        userId: user.id,
                        username: user.username,
                        tempKey: tempKey
                    }));
                });
            });
        } catch (e) {
            response.writeHead(400, {'Content-Type': 'application/json'});
            response.end(JSON.stringify({error: 'Invalid request'}));
        }
    });
}

// Handle registration endpoint
async function handleRegister(request, response) {
    let body = '';
    request.on('data', chunk => {
        body += chunk.toString();
    });
    
    request.on('end', () => {
        try {
            const { username, password, email } = JSON.parse(body);
            
            // Validate input
            const usernameValidation = securitySystem.validateUsername(username);
            const passwordValidation = securitySystem.validatePassword(password);
            const emailValidation = securitySystem.validateEmail(email);
            
            if (!usernameValidation.valid) {
                response.writeHead(400, {'Content-Type': 'application/json'});
                response.end(JSON.stringify({error: usernameValidation.error}));
                return;
            }
            
            if (!passwordValidation.valid) {
                response.writeHead(400, {'Content-Type': 'application/json'});
                response.end(JSON.stringify({error: passwordValidation.error}));
                return;
            }
            
            if (!emailValidation.valid) {
                response.writeHead(400, {'Content-Type': 'application/json'});
                response.end(JSON.stringify({error: emailValidation.error}));
                return;
            }
            
            // Check if username already exists
            db.query('SELECT id FROM users WHERE username = ?', [username], (err, results) => {
                if (err) {
                    response.writeHead(500, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({error: 'Database error'}));
                    return;
                }
                
                if (results.length > 0) {
                    response.writeHead(400, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({error: 'Username already exists'}));
                    return;
                }
                
                // Create new user
                const salt = generateSalt();
                const hashedPassword = hashPassword(password, salt);
                const tempKey = generateTempKey();
                
                db.query(
                    'INSERT INTO users (username, password, salt, email, tempkey) VALUES (?, ?, ?, ?, ?)',
                    [username, hashedPassword, salt, email, tempKey],
                    (err, result) => {
                        if (err) {
                            response.writeHead(500, {'Content-Type': 'application/json'});
                            response.end(JSON.stringify({error: 'Database error'}));
                            return;
                        }
                        
                        response.writeHead(200, {'Content-Type': 'application/json'});
                        response.end(JSON.stringify({
                            success: true,
                            userId: result.insertId,
                            username: username,
                            tempKey: tempKey
                        }));
                    }
                );
            });
        } catch (e) {
            response.writeHead(400, {'Content-Type': 'application/json'});
            response.end(JSON.stringify({error: 'Invalid request'}));
        }
    });
}

// Game command handlers
function handleCreateGame(data, connection) {
    if (!connection || !connection.name || connection.name === 'unknown') {
        return;
    }

    if (connection.gameid) {
        connection.sendUTF('creategame::error::Leave your current game before creating another.');
        sendCurrentGameSnapshot(connection, () => {});
        return;
    }

    const parts = data.split(':');
    const encodedName = parts[1] || '';
    const gameName = safeDecodeURIComponent(encodedName, '').trim();
    const maxPlayers = Math.max(2, Math.min(MAX_LOBBY_PLAYERS, parsePositiveInt(parts[2], DEFAULT_MAX_PLAYERS)));
    const mode = normalizeMode(parts[3]);
    const creatorId = Number(connection.name);

    if (!gameName) {
        connection.sendUTF('creategame::error::Game name is required.');
        return;
    }

    db.query(
        'INSERT INTO games (name, creator, maxplayers, status) VALUES (?, ?, ?, ?)',
        [gameName, creatorId, maxPlayers, 'waiting'],
        (err, result) => {
            if (err || !result || !result.insertId) {
                connection.sendUTF('creategame::error::Unable to create game.');
                return;
            }

            const gameId = result.insertId;
            createGameTables(gameId, tableErr => {
                if (tableErr) {
                    connection.sendUTF('creategame::error::Unable to initialize game data.');
                    return;
                }

                ensurePlayerTableColumns(gameId, ensureErr => {
                    if (ensureErr) {
                        connection.sendUTF('creategame::error::Unable to prepare player table.');
                        return;
                    }

                    gameState.activeGames[gameId] = {
                        mode,
                        creator: creatorId,
                        status: 'waiting'
                    };

                    connection.sendUTF(`creategame::success::${gameId}`);
                    handleGameList(connection);
                });
            });
        }
    );
}

function handleGameList(connection) {
    db.query(
        'SELECT id, name, maxplayers, started, status FROM games WHERE started = 0 ORDER BY created DESC LIMIT ?',
        [LOBBY_LIST_LIMIT],
        (err, games) => {
            if (err || !Array.isArray(games) || games.length === 0) {
                connection.sendUTF('gamelist::');
                return;
            }

            const rows = new Array(games.length);
            let pending = games.length;

            games.forEach((game, index) => {
                db.query(`SELECT COUNT(*) AS count FROM players${game.id}`, (countErr, counts) => {
                    const rawCount = counts && counts[0]
                        ? (counts[0].count ?? counts[0].c ?? 0)
                        : 0;
                    const playerCount = Number.isFinite(Number(rawCount)) ? Number(rawCount) : 0;
                    const maxPlayers = parsePositiveInt(game.maxplayers, 0);
                    const mode = normalizeMode(
                        (gameState.activeGames[game.id] && gameState.activeGames[game.id].mode) || game.mode
                    );
                    const gameStatus = countErr
                        ? 'waiting'
                        : (maxPlayers > 0 && playerCount >= maxPlayers ? 'full' : 'waiting');

                    rows[index] = [
                        game.id,
                        encodeURIComponent(game.name || `Game ${game.id}`),
                        playerCount,
                        maxPlayers,
                        gameStatus,
                        mode
                    ].join(',');

                    pending -= 1;
                    if (pending === 0) {
                        connection.sendUTF(`gamelist::${rows.filter(Boolean).join('|')}`);
                    }
                });
            });
        }
    );
}

function handleGameStart(connection) {
    if (!connection.gameid) {
        connection.sendUTF("Error: Not in a game");
        return;
    }
    
    const gameId = connection.gameid;

    db.query('SELECT creator, maxplayers, started FROM games WHERE id = ? LIMIT 1', [gameId], (err, results) => {
        if (err || results.length === 0) {
            connection.sendUTF("Error: Game not found");
            return;
        }

        const game = results[0];
        const creatorId = String(game.creator);
        const isStarted = Number(game.started) === 1;

        if (isStarted) {
            if (!gameState.turns[gameId]) {
                gameState.turns[gameId] = 1;
            }
            // Game already running: treat //start as "I'm done with my turn".
            // When every human player is done, the next turn begins early.
            markPlayerTurnDone(gameId, connection);
            return;
        }

        if (creatorId !== String(connection.name)) {
            connection.sendUTF("Error: Only the game creator can start the game");
            return;
        }

        initializeGame(gameId, connection, game);
    });
}

function queryDb(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

async function initializeGame(gameId, connection, game = {}) {
    try {
        await queryDb('UPDATE games SET started = 1 WHERE id = ?', [gameId]);

        // Initialize players in deterministic join order so homeworld assignment is stable.
        const players = await queryDb(
            `SELECT userid FROM players${gameId} ORDER BY joined_at ASC, userid ASC`
        );
        const playerRows = Array.isArray(players) ? players : [];

        // Initialize turn counter.
        gameState.turns[gameId] = 1;
        const maxPlayersForMap = parsePositiveInt(game.maxplayers, Math.max(playerRows.length, DEFAULT_MAX_PLAYERS));
        const mapSize = calculateMapSize(maxPlayersForMap);
        gameState.activeGames[gameId] = {
            ...(gameState.activeGames[gameId] || {}),
            status: 'in-progress',
            mapSize
        };

        // Create and persist the game map before players can interact with sectors.
        const generatedMap = mapSystem.generateMap(mapSize.width, mapSize.height, playerRows.length);
        const map = Array.isArray(generatedMap)
            ? generatedMap
            : (generatedMap && Array.isArray(generatedMap.sectors) ? generatedMap.sectors : []);
        const generatedHomeworlds = generatedMap && Array.isArray(generatedMap.homeworlds)
            ? generatedMap.homeworlds
            : [];

        await Promise.all(map.map((sector, index) => {
            const sectorId = Number(sector && sector.sectorid) || (index + 1);
            const x = Number.isFinite(Number(sector && sector.x)) ? Number(sector.x) : (index % mapSize.width);
            const y = Number.isFinite(Number(sector && sector.y)) ? Number(sector.y) : Math.floor(index / mapSize.width);
            const sectorType = Number(sector && (sector.type ?? sector.sectortype)) || 0;
            const metalBonus = Number(sector && sector.metalbonus) || 100;
            const crystalBonus = Number(sector && sector.crystalbonus) || 100;
            const terraformLevel = Number(sector && sector.terraformlvl) || 0;
            const artifact = Number(sector && sector.artifact) || 0;
            return queryDb(
                `INSERT INTO map${gameId} (sectorid, x, y, type, metalbonus, crystalbonus, terraformlvl, artifact) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [sectorId, x, y, sectorType, metalBonus, crystalBonus, terraformLevel, artifact]
            );
        }));

        await Promise.all(playerRows.map((row, index) => {
            const homeworld = generatedHomeworlds[index] || assignHomeworld(index, mapSize);
            return (async () => {
                await queryDb(
                    `UPDATE players${gameId} SET
                     metal = ?, crystal = ?, research = ?,
                     homeworld = ?, currentsector = ?
                     WHERE userid = ?`,
                    [STARTING_RESOURCES.metal, STARTING_RESOURCES.crystal, STARTING_RESOURCES.research, homeworld, homeworld, row.userid]
                );
                await queryDb(
                    `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`,
                    [row.userid, homeworld]
                );
                // Mark homeworld as explored
                await queryDb(
                    `INSERT IGNORE INTO explored_sectors${gameId} (playerid, sectorid) VALUES (?, ?)`,
                    [row.userid, homeworld]
                );
                // Spawn starter ships so players can scout and colonize immediately.
                await queryDb(
                    `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                    [row.userid, SCOUT_SHIP_ID, homeworld]
                );
                await queryDb(
                    `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                    [row.userid, COLONY_SHIP_ID, homeworld]
                );
                await Promise.all(STARTING_BUILDINGS.map(buildingType => queryDb(
                    `INSERT INTO buildings${gameId} (sectorid, type, owner) VALUES (?, ?, ?)`,
                    [homeworld, buildingType, row.userid]
                )));
            })();
        }));

        // Start turn timer after setup is complete.
        startTurnTimer(gameId);

        // Prime AI profiles and standing-order defaults for everyone in the game.
        hydrateAiPlayers(gameId);
        hydrateStandingOrdersDefaults(gameId, gameState.activeGames[gameId].mode);

        // Notify players only once the world is fully initialized.
        broadcastToGame(gameId, "The game has started!");
        broadcastToGame(gameId, "startgame::");
        broadcastToGame(gameId, `newturn::${gameState.turns[gameId]}`);
    } catch (error) {
        console.error("Error initializing game:", error);
        connection.sendUTF("Error: Failed to start game");
    }
}

function assignHomeworld(playerIndex, mapSize) {
    const total = mapSize.width * mapSize.height;
    return Math.min(total, Math.max(1, playerIndex + 1));
}

function startTurnTimer(gameId) {
    if (gameState.gameTimer[gameId]) {
        clearInterval(gameState.gameTimer[gameId]);
    }
    const mode = normalizeMode(gameState.activeGames[gameId] && gameState.activeGames[gameId].mode);
    const interval = TURN_SPEEDS_MS[mode] || TURN_SPEEDS_MS.quick;
    gameState.gameTimer[gameId] = setInterval(() => {
        processTurn(gameId);
    }, interval);
}

// Per-turn yields for owned sectors. Planets scale with their rolled
// metal/crystal bonuses (50–250%); securing an asteroid belt turns it into a
// modest mining operation. Buildings amplify the sector they sit in.
const SECTOR_YIELDS = {
    1: { metal: 8, crystal: 4, research: 0 },    // asteroid belt (when secured)
    6: { metal: 10, crystal: 6, research: 1 },   // micro planet
    7: { metal: 16, crystal: 9, research: 1 },   // small planet
    8: { metal: 22, crystal: 12, research: 2 },  // medium planet
    9: { metal: 30, crystal: 16, research: 2 },  // large planet
    10: { metal: 35, crystal: 18, research: 5 }  // homeworld
};
const BASE_INCOME = { metal: 5, crystal: 5, research: 5 };

async function computeTurnIncome(gameId, playerId) {
    const income = { ...BASE_INCOME };
    let sectors = [];
    try {
        sectors = await queryDb(
            `SELECT sectorid, type, metalbonus, crystalbonus FROM map${gameId} WHERE owner = ?`,
            [playerId]
        );
    } catch (err) {
        // Older games lack bonus columns; fall back to flat yields.
        sectors = await queryDb(
            `SELECT sectorid, type FROM map${gameId} WHERE owner = ?`,
            [playerId]
        ).catch(() => []);
    }

    const buildingRows = await queryDb(
        `SELECT sectorid, type, COUNT(*) as count FROM buildings${gameId} WHERE owner = ? GROUP BY sectorid, type`,
        [playerId]
    ).catch(() => []);
    const buildingsBySector = new Map();
    (buildingRows || []).forEach(row => {
        const sectorId = Number(row.sectorid);
        if (!buildingsBySector.has(sectorId)) buildingsBySector.set(sectorId, {});
        buildingsBySector.get(sectorId)[Number(row.type)] = Number(row.count) || 0;
    });

    (sectors || []).forEach(sector => {
        const yields = SECTOR_YIELDS[Number(sector.type)];
        if (!yields) return;
        const metalBonus = (Number(sector.metalbonus) || 100) / 100;
        const crystalBonus = (Number(sector.crystalbonus) || 100) / 100;
        const local = buildingsBySector.get(Number(sector.sectorid)) || {};
        const extractors = local[0] || 0;
        const refineries = local[1] || 0;
        const academies = local[2] || 0;
        income.metal += yields.metal * metalBonus * (1 + 0.6 * extractors);
        income.crystal += yields.crystal * crystalBonus * (1 + 0.6 * refineries);
        income.research += yields.research + 4 * academies;
    });

    return income;
}

function processTurn(gameId) {
    gameState.turns[gameId]++;

    // New turn: clear "done early" flags.
    if (gameState.activeGames[gameId] && gameState.activeGames[gameId].turnReady) {
        gameState.activeGames[gameId].turnReady.clear();
    }

    // Let AI opponents act, then run any player standing orders.
    triggerAiTurn(gameId);
    applyStandingOrdersForGame(gameId);

    const activeState = gameState.activeGames[gameId] || {};
    const isEpic = normalizeMode(activeState.mode) === 'epic';
    const modeMultiplier = isEpic ? EPIC_RESOURCE_MULTIPLIER : 1;

    // Process resource generation with race modifiers
    db.query(`SELECT * FROM players${gameId}`, (err, players) => {
        if (err) return;

        players.forEach(player => {
            // Get race modifiers
            const race = Object.values(raceSystem.RACE_TYPES).find(r => r.id === player.race_id) || raceSystem.RACE_TYPES.TERRAN;

            computeTurnIncome(gameId, player.userid).then(income => {
                const metalGen = Math.floor(income.metal * race.bonuses.metalProduction * modeMultiplier);
                const crystalGen = Math.floor(income.crystal * race.bonuses.crystalProduction * modeMultiplier);
                const researchGen = Math.floor(income.research * race.bonuses.researchSpeed * modeMultiplier);

                // Update resources and stats
                db.query(
                    `UPDATE players${gameId} SET
                     metal = metal + ?,
                     crystal = crystal + ?,
                     research = research + ?
                     WHERE userid = ?`,
                    [metalGen, crystalGen, researchGen, player.userid],
                    () => {
                        gameState.clients.forEach(client => {
                            if (Number(client.gameid) === Number(gameId) && Number(client.name) === Number(player.userid)) {
                                updateResources(client);
                                sendVisibleMapState(gameId, client);
                            }
                        });
                    }
                );

                // Update lifetime crystal earned for unlock tracking
                db.query(
                    `UPDATE user_stats SET
                     total_crystal_earned = total_crystal_earned + ?
                     WHERE user_id = ?`,
                    [crystalGen, player.userid]
                );

                // Handle special race abilities
                if (race.id === 6) { // Mechanicus auto-repair
                    autoRepairShips(gameId, player.userid);
                } else if (race.id === 7) { // Bioform evolution
                    evolveShips(gameId, player.userid);
                }
            }).catch(incomeErr => {
                console.warn(`Income calculation failed for player ${player.userid} in game ${gameId}:`, incomeErr.message || incomeErr);
            });
        });
    });

    // Process battles
    processBattles(gameId);
    
    // Check victory conditions
    victorySystem.checkAllPlayersForVictory(gameId, gameState, db, (err, winner) => {
        if (err || !winner) return;
        // Broadcast first so a bookkeeping failure can't swallow the result.
        broadcastToGame(gameId, `gameover::${winner.playerId}::${winner.condition}`);
        victorySystem.endGame(gameId, winner.playerId, winner.condition, gameState, db, (endErr) => {
            if (endErr) {
                console.error(`Game ${gameId} end bookkeeping failed:`, endErr.message || endErr);
            }
        });
    });
    
    // Notify players of new turn
    broadcastToGame(gameId, `newturn::${gameState.turns[gameId]}`);
}

function processBattles(gameId) {
    // Find sectors with ships from multiple players
    db.query(
        `SELECT sectorid, GROUP_CONCAT(DISTINCT owner) as owners 
         FROM ships${gameId} 
         GROUP BY sectorid 
         HAVING COUNT(DISTINCT owner) > 1`,
        [gameId],
        (err, conflicts) => {
            if (err || !conflicts) return;
            
            conflicts.forEach(conflict => {
                const owners = conflict.owners.split(',');
                // Process battle between owners[0] and owners[1]
                resolveBattle(gameId, conflict.sectorid, owners[0], owners[1]);
            });
        }
    );
}

function normalizeShipRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
        .map(row => ({
            type: Number(row.type),
            count: Number(row.count)
        }))
        .filter(row => Number.isFinite(row.type) && row.type >= 1 && row.type <= 9 && Number.isFinite(row.count) && row.count > 0);
}

function sumShipRows(rows) {
    return normalizeShipRows(rows).reduce((sum, row) => sum + row.count, 0);
}

function sumFleetCounts(countMap) {
    if (!countMap || typeof countMap !== 'object') return 0;
    let total = 0;
    for (let i = 1; i <= 9; i++) {
        total += Number(countMap[i]) || 0;
    }
    return total;
}

function getShipCount(rows, typeId) {
    const match = normalizeShipRows(rows).find(row => row.type === typeId);
    return match ? match.count : 0;
}

function buildFleetFromRows(rows) {
    const fleet = {};
    for (let i = 1; i <= 9; i++) {
        fleet[`ship${i}`] = 0;
    }

    normalizeShipRows(rows).forEach(row => {
        fleet[`ship${row.type}`] = row.count;
    });

    fleet.groundTurret = 0;
    fleet.orbitalTurret = 0;
    return fleet;
}

function parseBattleTech(techCsv) {
    const techSet = new Set(
        String(techCsv || '')
            .split(',')
            .map(value => Number.parseInt(value, 10))
            .filter(Number.isFinite)
    );

    return {
        weapons: techSet.has(4) ? 1 : 0,
        hull: techSet.has(5) ? 1 : 0,
        shields: techSet.has(6) ? 1 : 0
    };
}

function getRaceStealthScore(raceId, shipRows) {
    const race = getRaceById(Number(raceId) || 1);
    const modifiers = race && race.unitModifiers ? race.unitModifiers : {};
    const allStealth = modifiers.all && Number.isFinite(Number(modifiers.all.stealth))
        ? Number(modifiers.all.stealth)
        : 0;

    const rows = normalizeShipRows(shipRows);
    const totalShips = sumShipRows(rows);
    if (totalShips <= 0) return 0;

    let weightedStealth = 0;
    rows.forEach(row => {
        const key = SHIP_TYPE_MODIFIER_KEYS[row.type];
        const unitMods = key ? modifiers[key] : null;
        const unitStealth = unitMods && Number.isFinite(Number(unitMods.stealth))
            ? Number(unitMods.stealth)
            : 0;
        const shipStealth = Math.min(0.95, Math.max(0, allStealth + unitStealth));
        weightedStealth += shipStealth * row.count;
    });

    return weightedStealth / totalShips;
}

function getDetectionScore(shipRows) {
    const rows = normalizeShipRows(shipRows);
    const totalShips = sumShipRows(rows);
    if (totalShips <= 0) return 0.15;

    const scoutRatio = getShipCount(rows, 3) / totalShips;
    const intruderRatio = getShipCount(rows, 8) / totalShips;
    return Math.min(0.85, 0.15 + scoutRatio * 0.5 + intruderRatio * 0.2);
}

function getBattleViewModes(attackerRows, defenderRows, attackerRaceId, defenderRaceId) {
    const attackerTotal = sumShipRows(attackerRows);
    const defenderTotal = sumShipRows(defenderRows);
    const largerFleet = Math.max(attackerTotal, defenderTotal);
    const smallerFleet = Math.max(1, Math.min(attackerTotal, defenderTotal));
    const forceRatio = largerFleet / smallerFleet;

    if (largerFleet >= BATTLE_VISIBILITY_CONFIG.OVERWHELMING_MIN_SHIPS &&
        forceRatio >= BATTLE_VISIBILITY_CONFIG.OVERWHELMING_FORCE_RATIO) {
        return {
            attacker: { mode: 'summary', reason: `overwhelming force (${forceRatio.toFixed(1)}x)` },
            defender: { mode: 'summary', reason: `overwhelming force (${forceRatio.toFixed(1)}x)` },
            forceRatio
        };
    }

    const attackerStealth = getRaceStealthScore(attackerRaceId, attackerRows);
    const defenderStealth = getRaceStealthScore(defenderRaceId, defenderRows);
    const attackerDetection = getDetectionScore(attackerRows);
    const defenderDetection = getDetectionScore(defenderRows);

    const attackerSeesSummary = defenderStealth - attackerDetection >= BATTLE_VISIBILITY_CONFIG.STEALTH_CONCEALMENT_THRESHOLD;
    const defenderSeesSummary = attackerStealth - defenderDetection >= BATTLE_VISIBILITY_CONFIG.STEALTH_CONCEALMENT_THRESHOLD;

    return {
        attacker: {
            mode: attackerSeesSummary ? 'summary' : 'full',
            reason: attackerSeesSummary ? 'enemy stealth signature concealed battle telemetry' : 'full telemetry'
        },
        defender: {
            mode: defenderSeesSummary ? 'summary' : 'full',
            reason: defenderSeesSummary ? 'enemy stealth signature concealed battle telemetry' : 'full telemetry'
        },
        forceRatio
    };
}

function formatBattleSummaryMessage({
    sectorId,
    reason,
    winnerId,
    attackerLosses,
    defenderLosses,
    forceRatio,
    result
}) {
    const sectorHex = Number(sectorId).toString(16).toUpperCase();
    return `battle_summary::${sectorHex}::${encodeURIComponent(reason)}::${winnerId}::${attackerLosses}::${defenderLosses}::${forceRatio.toFixed(2)}::${result}`;
}

function createEmptyShipTypeCounterMap() {
    const counters = {};
    SHIP_TYPE_IDS.forEach(typeId => {
        counters[typeId] = 0;
    });
    return counters;
}

function createPlayerTelemetryRecord(playerId, raceId) {
    const byType = {};
    SHIP_TYPE_IDS.forEach(typeId => {
        byType[typeId] = {
            typeId,
            name: SHIP_TYPE_NAME_BY_ID[typeId] || `Ship ${typeId}`,
            deployed: 0,
            survivors: 0,
            losses: 0,
            kills: 0,
            shots: 0,
            hits: 0,
            damage: 0,
            battles: 0
        };
    });

    return {
        playerId: Number(playerId),
        raceId: Number(raceId) || 1,
        byType,
        orbitalTurret: {
            shots: 0,
            hits: 0,
            damage: 0,
            kills: 0
        },
        battles: 0,
        updatedAt: null
    };
}

function getOrCreateGameTelemetryRecord(gameId) {
    const normalizedGameId = Number(gameId);
    if (!combatTelemetryStore.has(normalizedGameId)) {
        if (combatTelemetryStore.size >= COMBAT_TELEMETRY_MAX_GAMES) {
            const oldestKey = combatTelemetryStore.keys().next().value;
            if (oldestKey !== undefined) {
                combatTelemetryStore.delete(oldestKey);
            }
        }

        combatTelemetryStore.set(normalizedGameId, {
            gameId: normalizedGameId,
            battles: 0,
            updatedAt: null,
            players: {},
            recentBattles: []
        });
    }

    return combatTelemetryStore.get(normalizedGameId);
}

function getOrCreatePlayerTelemetryRecord(gameTelemetry, playerId, raceId) {
    const normalizedPlayerId = Number(playerId);
    if (!gameTelemetry.players[normalizedPlayerId]) {
        gameTelemetry.players[normalizedPlayerId] = createPlayerTelemetryRecord(normalizedPlayerId, raceId);
    }

    const playerTelemetry = gameTelemetry.players[normalizedPlayerId];
    if (raceId) {
        playerTelemetry.raceId = Number(raceId) || playerTelemetry.raceId;
    }
    return playerTelemetry;
}

function getTypeMetric(counterMap, typeId) {
    return Number(counterMap && counterMap[typeId]) || 0;
}

function addSideTelemetryToPlayerRecord(playerTelemetry, sideTelemetry) {
    if (!playerTelemetry || !sideTelemetry) {
        return;
    }

    let touchedThisBattle = false;

    SHIP_TYPE_IDS.forEach(typeId => {
        const stat = playerTelemetry.byType[typeId];
        const deployed = getTypeMetric(sideTelemetry.deployedByType, typeId);
        const survivors = getTypeMetric(sideTelemetry.survivorsByType, typeId);
        const losses = getTypeMetric(sideTelemetry.lossesByType, typeId);
        const kills = getTypeMetric(sideTelemetry.killCreditsByType, typeId);
        const shots = getTypeMetric(sideTelemetry.shotsByType, typeId);
        const hits = getTypeMetric(sideTelemetry.hitsByType, typeId);
        const damage = getTypeMetric(sideTelemetry.damageByType, typeId);

        stat.deployed += deployed;
        stat.survivors += survivors;
        stat.losses += losses;
        stat.kills += kills;
        stat.shots += shots;
        stat.hits += hits;
        stat.damage += damage;

        if (deployed > 0 || shots > 0 || hits > 0 || damage > 0 || kills > 0 || losses > 0) {
            stat.battles += 1;
            touchedThisBattle = true;
        }
    });

    playerTelemetry.orbitalTurret.shots += Number(sideTelemetry.orbitalTurretShots) || 0;
    playerTelemetry.orbitalTurret.hits += Number(sideTelemetry.orbitalTurretHits) || 0;
    playerTelemetry.orbitalTurret.damage += Number(sideTelemetry.orbitalTurretDamage) || 0;
    playerTelemetry.orbitalTurret.kills += Number(sideTelemetry.orbitalTurretKillCredits) || 0;

    if ((Number(sideTelemetry.orbitalTurretShots) || 0) > 0) {
        touchedThisBattle = true;
    }

    if (touchedThisBattle) {
        playerTelemetry.battles += 1;
    }
    playerTelemetry.updatedAt = new Date().toISOString();
}

function deriveTopShipTelemetry(sideTelemetry) {
    if (!sideTelemetry) {
        return null;
    }

    let best = null;
    SHIP_TYPE_IDS.forEach(typeId => {
        const kills = getTypeMetric(sideTelemetry.killCreditsByType, typeId);
        const damage = getTypeMetric(sideTelemetry.damageByType, typeId);
        const losses = getTypeMetric(sideTelemetry.lossesByType, typeId);
        const shots = getTypeMetric(sideTelemetry.shotsByType, typeId);
        const hits = getTypeMetric(sideTelemetry.hitsByType, typeId);
        const deployed = getTypeMetric(sideTelemetry.deployedByType, typeId);

        if (deployed <= 0 && shots <= 0 && kills <= 0 && damage <= 0 && losses <= 0) {
            return;
        }

        const score = (kills * 100) + damage + (hits * 2);
        if (!best || score > best.score) {
            best = {
                typeId,
                shipName: SHIP_TYPE_NAME_BY_ID[typeId] || `Ship ${typeId}`,
                kills,
                losses,
                shots,
                hits,
                damage,
                score
            };
        }
    });

    if (!best) {
        return null;
    }

    const hitRate = best.shots > 0 ? best.hits / best.shots : 0;
    const killPerLoss = best.losses > 0 ? best.kills / best.losses : null;

    return {
        typeId: best.typeId,
        shipName: best.shipName,
        kills: Number(best.kills.toFixed(3)),
        losses: Number(best.losses.toFixed(3)),
        shots: best.shots,
        hits: best.hits,
        damage: Number(best.damage.toFixed(3)),
        hitRate: Number(hitRate.toFixed(3)),
        killPerLoss: killPerLoss === null ? null : Number(killPerLoss.toFixed(3))
    };
}

function formatShipTelemetryHint(sideTelemetry, prefix = 'Telemetry') {
    const topShip = deriveTopShipTelemetry(sideTelemetry);
    if (!topShip) {
        return `${prefix}: no ship telemetry available for this battle.`;
    }

    const killPerLossText = topShip.killPerLoss === null
        ? (topShip.kills > 0 ? `${topShip.kills.toFixed(2)}/0` : '0.00')
        : topShip.killPerLoss.toFixed(2);
    const hitRatePct = (topShip.hitRate * 100).toFixed(0);

    return `${prefix}: ${topShip.shipName} led your fleet (K/L ${killPerLossText}, hit ${hitRatePct}%, dmg ${topShip.damage.toFixed(1)}).`;
}

function recordCombatTelemetry({
    gameId,
    sectorId,
    attackerId,
    defenderId,
    attackerRaceId,
    defenderRaceId,
    winnerId,
    attackerLosses,
    defenderLosses,
    battleLog
}) {
    if (!battleLog || !battleLog.telemetry) {
        return;
    }

    const gameTelemetry = getOrCreateGameTelemetryRecord(gameId);
    const attackerTelemetry = getOrCreatePlayerTelemetryRecord(gameTelemetry, attackerId, attackerRaceId);
    const defenderTelemetry = getOrCreatePlayerTelemetryRecord(gameTelemetry, defenderId, defenderRaceId);

    addSideTelemetryToPlayerRecord(attackerTelemetry, battleLog.telemetry.attacker);
    addSideTelemetryToPlayerRecord(defenderTelemetry, battleLog.telemetry.defender);

    gameTelemetry.battles += 1;
    gameTelemetry.updatedAt = new Date().toISOString();

    const recentEntry = {
        timestamp: gameTelemetry.updatedAt,
        sector: formatSectorToken(sectorId),
        attackerId: Number(attackerId),
        defenderId: Number(defenderId),
        winnerId: Number(winnerId),
        attackerLosses: Number(attackerLosses) || 0,
        defenderLosses: Number(defenderLosses) || 0,
        attackerTopShip: deriveTopShipTelemetry(battleLog.telemetry.attacker),
        defenderTopShip: deriveTopShipTelemetry(battleLog.telemetry.defender),
        result: battleLog.result || 'unknown'
    };

    gameTelemetry.recentBattles.push(recentEntry);
    if (gameTelemetry.recentBattles.length > COMBAT_TELEMETRY_RECENT_BATTLES) {
        gameTelemetry.recentBattles.splice(0, gameTelemetry.recentBattles.length - COMBAT_TELEMETRY_RECENT_BATTLES);
    }

    const attackerTop = recentEntry.attackerTopShip ? recentEntry.attackerTopShip.shipName : 'n/a';
    const defenderTop = recentEntry.defenderTopShip ? recentEntry.defenderTopShip.shipName : 'n/a';
    console.log(
        `[CombatTelemetry] game=${gameId} sector=${recentEntry.sector} winner=P${winnerId} losses(A:${recentEntry.attackerLosses},D:${recentEntry.defenderLosses}) top(A:${attackerTop},D:${defenderTop})`
    );
}

function buildShipTelemetryView(stat) {
    const hitRate = stat.shots > 0 ? stat.hits / stat.shots : 0;
    const damagePerShot = stat.shots > 0 ? stat.damage / stat.shots : 0;
    const killPerLoss = stat.losses > 0 ? stat.kills / stat.losses : null;

    return {
        shipTypeId: stat.typeId,
        shipName: stat.name,
        deployed: stat.deployed,
        survivors: stat.survivors,
        losses: stat.losses,
        kills: Number(stat.kills.toFixed(3)),
        shots: stat.shots,
        hits: stat.hits,
        damage: Number(stat.damage.toFixed(3)),
        battles: stat.battles,
        hitRate: Number(hitRate.toFixed(3)),
        damagePerShot: Number(damagePerShot.toFixed(3)),
        killPerLoss: killPerLoss === null ? null : Number(killPerLoss.toFixed(3))
    };
}

function getCombatTelemetrySnapshot(gameId) {
    const normalizedGameId = Number(gameId);
    const gameTelemetry = combatTelemetryStore.get(normalizedGameId);
    if (!gameTelemetry) {
        return {
            gameId: normalizedGameId,
            battles: 0,
            updatedAt: null,
            recentBattles: [],
            players: []
        };
    }

    const players = Object.values(gameTelemetry.players)
        .sort((a, b) => a.playerId - b.playerId)
        .map(player => {
            const shipStats = SHIP_TYPE_IDS
                .map(typeId => buildShipTelemetryView(player.byType[typeId]))
                .filter(stat => stat.deployed > 0 || stat.shots > 0 || stat.kills > 0 || stat.losses > 0);

            return {
                playerId: player.playerId,
                raceId: player.raceId,
                raceName: getRaceById(player.raceId).name,
                battles: player.battles,
                orbitalTurret: {
                    shots: player.orbitalTurret.shots,
                    hits: player.orbitalTurret.hits,
                    damage: Number(player.orbitalTurret.damage.toFixed(3)),
                    kills: Number(player.orbitalTurret.kills.toFixed(3)),
                    hitRate: player.orbitalTurret.shots > 0
                        ? Number((player.orbitalTurret.hits / player.orbitalTurret.shots).toFixed(3))
                        : 0
                },
                shipStats
            };
        });

    return {
        gameId: gameTelemetry.gameId,
        battles: gameTelemetry.battles,
        updatedAt: gameTelemetry.updatedAt,
        recentBattles: gameTelemetry.recentBattles.slice(-25),
        players
    };
}

function handleGetCombatTelemetry(request, response, gameId) {
    const parsedGameId = parsePositiveInt(gameId, 0);
    if (!parsedGameId) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid game ID' }));
        return;
    }

    const payload = getCombatTelemetrySnapshot(parsedGameId);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
}

async function resolveBattle(gameId, sectorId, player1, player2) {
    const attackerId = Number(player1);
    const defenderId = Number(player2);
    if (!Number.isFinite(attackerId) || !Number.isFinite(defenderId) || attackerId === defenderId) {
        return;
    }

    try {
        const [attackerRows, defenderRows, attackerProfile, defenderProfile] = await Promise.all([
            getPlayerShips(gameId, sectorId, attackerId),
            getPlayerShips(gameId, sectorId, defenderId),
            getPlayerBattleProfile(gameId, attackerId),
            getPlayerBattleProfile(gameId, defenderId)
        ]);

        const attackerShips = normalizeShipRows(attackerRows);
        const defenderShips = normalizeShipRows(defenderRows);
        if (sumShipRows(attackerShips) === 0 || sumShipRows(defenderShips) === 0) {
            return;
        }

        const battleLog = combatSystem.conductBattle(
            buildFleetFromRows(attackerShips),
            buildFleetFromRows(defenderShips),
            parseBattleTech(attackerProfile.tech),
            parseBattleTech(defenderProfile.tech)
        );

        const attackerSurvivors = finalFleetToRows(battleLog.final && battleLog.final.attackers);
        const defenderSurvivors = finalFleetToRows(battleLog.final && battleLog.final.defenders);

        await Promise.all([
            replaceShipsAfterBattle(gameId, sectorId, attackerId, attackerSurvivors),
            replaceShipsAfterBattle(gameId, sectorId, defenderId, defenderSurvivors)
        ]);

        updateSector2(gameId, sectorId);

        const fullBattleMessage = combatSystem.formatBattleMessage(battleLog);
        const sectorBattleMessage = `battle::${sectorId}::${fullBattleMessage}`;
        const viewModes = getBattleViewModes(
            attackerShips,
            defenderShips,
            attackerProfile.race_id,
            defenderProfile.race_id
        );
        const winnerId = battleLog.result === 'attackerVictory' ? attackerId : defenderId;
        const attackerLosses = Math.max(0, sumShipRows(attackerShips) - sumFleetCounts(battleLog.final && battleLog.final.attackers));
        const defenderLosses = Math.max(0, sumShipRows(defenderShips) - sumFleetCounts(battleLog.final && battleLog.final.defenders));
        recordCombatTelemetry({
            gameId,
            sectorId,
            attackerId,
            defenderId,
            attackerRaceId: attackerProfile.race_id,
            defenderRaceId: defenderProfile.race_id,
            winnerId,
            attackerLosses,
            defenderLosses,
            battleLog
        });

        const attackerMessage = viewModes.attacker.mode === 'full'
            ? sectorBattleMessage
            : formatBattleSummaryMessage({
                sectorId,
                reason: viewModes.attacker.reason,
                winnerId,
                attackerLosses,
                defenderLosses,
                forceRatio: viewModes.forceRatio,
                result: battleLog.result
            });
        const defenderMessage = viewModes.defender.mode === 'full'
            ? sectorBattleMessage
            : formatBattleSummaryMessage({
                sectorId,
                reason: viewModes.defender.reason,
                winnerId,
                attackerLosses,
                defenderLosses,
                forceRatio: viewModes.forceRatio,
                result: battleLog.result
            });

        notifyPlayer(attackerId, attackerMessage);
        notifyPlayer(defenderId, defenderMessage);

        // Combat overrides fog: every other player in the game sees the battle too.
        gameState.clients.forEach(client => {
            if (Number(client.gameid) !== Number(gameId)) return;
            const clientId = Number(client.name);
            if (clientId === attackerId || clientId === defenderId) return;
            client.sendUTF(sectorBattleMessage);
        });

        const sectorHex = Number(sectorId).toString(16).toUpperCase();
        notifyPlayer(
            attackerId,
            battleLog.result === 'attackerVictory'
                ? `Battle report: Victory in sector ${sectorHex}. Enemy losses ${defenderLosses}, your losses ${attackerLosses}.`
                : `Battle report: Defeat in sector ${sectorHex}. Enemy losses ${defenderLosses}, your losses ${attackerLosses}.`
        );
        notifyPlayer(
            defenderId,
            battleLog.result === 'defenderVictory'
                ? `Battle report: Victory in sector ${sectorHex}. Enemy losses ${attackerLosses}, your losses ${defenderLosses}.`
                : `Battle report: Defeat in sector ${sectorHex}. Enemy losses ${attackerLosses}, your losses ${defenderLosses}.`
        );
        notifyPlayer(attackerId, formatShipTelemetryHint(battleLog.telemetry && battleLog.telemetry.attacker, 'Fleet telemetry'));
        notifyPlayer(defenderId, formatShipTelemetryHint(battleLog.telemetry && battleLog.telemetry.defender, 'Fleet telemetry'));
    } catch (error) {
        console.error(`Error resolving battle in game ${gameId}, sector ${sectorId}:`, error);
    }
}

function getPlayerBattleProfile(gameId, playerId) {
    return new Promise(resolve => {
        db.query(
            `SELECT race_id, tech FROM players${gameId} WHERE userid = ?`,
            [playerId],
            (err, rows) => {
                if (err || !rows || rows.length === 0) {
                    resolve({ race_id: 1, tech: '' });
                    return;
                }
                resolve({
                    race_id: Number(rows[0].race_id) || 1,
                    tech: rows[0].tech || ''
                });
            }
        );
    });
}

function getPlayerShips(gameId, sectorId, playerId) {
    return new Promise((resolve, reject) => {
        db.query(
            `SELECT type, COUNT(*) as count FROM ships${gameId} 
             WHERE sectorid = ? AND owner = ? 
             GROUP BY type`,
            [sectorId, playerId],
            (err, results) => {
                if (err) reject(err);
                else resolve(results || []);
            }
        );
    });
}

function finalFleetToRows(finalFleet) {
    const rows = [];
    if (!finalFleet || typeof finalFleet !== 'object') {
        return rows;
    }

    for (let i = 1; i <= 9; i++) {
        const count = Number(finalFleet[i]) || 0;
        if (count > 0) {
            rows.push({ type: i, count });
        }
    }
    return rows;
}

function replaceShipsAfterBattle(gameId, sectorId, playerId, ships) {
    return new Promise((resolve, reject) => {
        updateShipsAfterBattle(gameId, sectorId, playerId, ships, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function updateShipsAfterBattle(gameId, sectorId, playerId, ships, callback = () => {}) {
    const survivors = normalizeShipRows(ships);

    // Remove all ships first
    db.query(
        `DELETE FROM ships${gameId} WHERE sectorid = ? AND owner = ?`,
        [sectorId, playerId],
        (err) => {
            if (err) {
                callback(err);
                return;
            }

            const inserts = [];
            survivors.forEach(ship => {
                const count = Math.floor(ship.count);
                for (let i = 0; i < count; i++) {
                    inserts.push([playerId, ship.type, sectorId]);
                }
            });

            if (inserts.length === 0) {
                callback(null);
                return;
            }

            let remaining = inserts.length;
            let failed = false;
            inserts.forEach(params => {
                db.query(
                    `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                    params,
                    insertErr => {
                        if (failed) return;
                        if (insertErr) {
                            failed = true;
                            callback(insertErr);
                            return;
                        }
                        remaining -= 1;
                        if (remaining === 0) {
                            callback(null);
                        }
                    }
                );
            });
        }
    );
}

// Implement missing game functions
function colonizePlanet(connection) {
    const playerId = connection.name;
    const gameId = connection.gameid;
    
    // Get player's current sector
    db.query(
        `SELECT currentsector FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) {
                connection.sendUTF("Error: Could not get player location");
                return;
            }
            
            const sectorId = results[0].currentsector;
            
            // Check if player has a colony ship in this sector
            db.query(
                `SELECT id FROM ships${gameId} 
                 WHERE owner = ? AND sectorid = ? AND type = ? LIMIT 1`,
                [playerId, sectorId, COLONY_SHIP_ID],
                (err, ships) => {
                    if (err || ships.length === 0) {
                        connection.sendUTF("Error: No colony ship in this sector");
                        return;
                    }
                    
                    // Check if sector is colonizable
                    db.query(
                        `SELECT type, owner FROM map${gameId} WHERE sectorid = ?`,
                        [sectorId],
                        (err, sector) => {
                            if (err || sector.length === 0) {
                                connection.sendUTF("Error: Invalid sector");
                                return;
                            }
                            
                            if (sector[0].owner) {
                                connection.sendUTF("Error: Sector already owned");
                                return;
                            }
                            
                            if (sector[0].type < 6 || sector[0].type > 10) {
                                connection.sendUTF("Error: Cannot colonize this sector type");
                                return;
                            }
                            
                            // Colonize the planet
                            db.query(
                                `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`,
                                [playerId, sectorId],
                                (err) => {
                                    if (err) {
                                        connection.sendUTF("Error: Failed to colonize");
                                        return;
                                    }
                                    
                                    // Remove colony ship
                                    db.query(
                                        `DELETE FROM ships${gameId} WHERE id = ?`,
                                        [ships[0].id]
                                    );
                                    
                                    connection.sendUTF(`Success: Colonized sector ${sectorId}`);
                                    updateSector2(gameId, sectorId);
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}

function buyTech(data, connection) {
    const parts = data.split(":");
    const techId = parseInt(parts[1]);
    const playerId = connection.name;
    const gameId = connection.gameid;
    
    // Get tech cost
    const tech = techSystem.getTechnology(techId);
    if (!tech) {
        connection.sendUTF("Error: Invalid technology");
        return;
    }
    
    // Check if player has enough research
    db.query(
        `SELECT research, tech FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) {
                connection.sendUTF("Error: Could not get player data");
                return;
            }
            
            const player = results[0];
            const playerTech = player.tech ? player.tech.split(',').map(Number) : [];

            if (playerTech.includes(techId)) {
                connection.sendUTF("Error: Already have this technology");
                return;
            }

            const techCost = Number(tech.cost ?? tech.baseCost) || 0;
            if (player.research < techCost) {
                connection.sendUTF("Error: Not enough research points");
                return;
            }

            // Check prerequisites (stored as keys into TECHNOLOGIES)
            const prereqIds = (tech.prerequisites || [])
                .map(key => techSystem.TECHNOLOGIES[key] && techSystem.TECHNOLOGIES[key].id)
                .filter(Number.isFinite);
            if (!prereqIds.every(id => playerTech.includes(id))) {
                connection.sendUTF("Error: Missing prerequisite technology");
                return;
            }

            // Buy the tech
            playerTech.push(techId);
            const newTech = playerTech.join(',');

            db.query(
                `UPDATE players${gameId} SET research = research - ?, tech = ? WHERE userid = ?`,
                [techCost, newTech, playerId],
                (err) => {
                    if (err) {
                        connection.sendUTF("Error: Failed to buy technology");
                        return;
                    }
                    
                    connection.sendUTF(`Success: Purchased ${tech.name}`);
                    updateResources(connection);
                }
            );
        }
    );
}

function probeSector(data, connection) {
    const parts = data.split(":");
    const targetSector = parseSectorToken(parts[1]);
    const playerId = connection.name;
    const gameId = connection.gameid;

    if (!Number.isFinite(targetSector)) {
        connection.sendUTF("Error: Invalid sector");
        return;
    }

    // Probes cost crystal and may be destroyed before revealing hazardous sectors.
    db.query(
        `UPDATE players${gameId} SET crystal = crystal - ? WHERE userid = ? AND crystal >= ?`,
        [PROBE_COST_CRYSTAL, playerId, PROBE_COST_CRYSTAL],
        (costErr, costResult) => {
            if (costErr || !costResult || costResult.affectedRows === 0) {
                connection.sendUTF(`Error: Probes cost ${PROBE_COST_CRYSTAL} crystal`);
                return;
            }

            revealProbedSector(gameId, playerId, targetSector, connection);
        }
    );
}

function revealProbedSector(gameId, playerId, targetSector, connection) {
    db.query(
        `SELECT * FROM map${gameId} WHERE sectorid = ?`,
        [targetSector],
        (err, sector) => {
            if (err || sector.length === 0) {
                updateResources(connection);
                connection.sendUTF("Error: Invalid sector");
                return;
            }

            const sectorType = Number(sector[0].type);
            const sectorOwner = sector[0].owner;

            if (sectorType === 2) {
                updateResources(connection);
                connection.sendUTF(`Error: Our probe was destroyed in sector ${formatSectorToken(targetSector)} - there's a BLACK HOLE there!`);
                return;
            }
            if (sectorType === 1 && Number(sectorOwner) !== Number(playerId)) {
                updateResources(connection);
                connection.sendUTF(`Error: Our probe was destroyed in sector ${formatSectorToken(targetSector)} - dangerous asteroid field!`);
                return;
            }

            markSectorExplored(gameId, playerId, targetSector);

            db.query(
                `SELECT owner, type, COUNT(*) as count
                 FROM ships${gameId}
                 WHERE sectorid = ?
                 GROUP BY owner, type`,
                [targetSector],
                (shipErr, ships) => {
                    if (shipErr) ships = [];

                    const probeData = {
                        sector: sector[0],
                        ships: ships,
                        buildings: []
                    };

                    updateResources(connection);
                    connection.sendUTF(`sector::${targetSector}::${JSON.stringify(probeData)}`);
                    updateSector2(gameId, targetSector);
                    sendVisibleMapState(gameId, connection);
                }
            );
        }
    );
}

function buyShip(data, connection) {
    const parts = data.split(":");
    const shipType = parseInt(parts[1]);
    const playerId = connection.name;
    const gameId = connection.gameid;
    
    // Get ship cost - need to find the ship type by id
    let shipData = null;
    for (const key in combatSystem.SHIP_TYPES) {
        if (combatSystem.SHIP_TYPES[key].id === shipType) {
            shipData = combatSystem.SHIP_TYPES[key];
            break;
        }
    }
    if (!shipData) {
        connection.sendUTF("Error: Invalid ship type");
        return;
    }
    
    // Get player data
    db.query(
        `SELECT metal, crystal, currentsector, tech, race_id FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) {
                connection.sendUTF("Error: Could not get player data");
                return;
            }
            
            const player = results[0];
            
            // Apply race modifiers to ship cost
            const race = Object.values(raceSystem.RACE_TYPES).find(r => r.id === player.race_id) || raceSystem.RACE_TYPES.TERRAN;
            const modifiedShip = raceSystem.applyShipModifiers(player.race_id, shipType, shipData);
            
            // Check resources
            if (player.metal < modifiedShip.cost.metal || player.crystal < modifiedShip.cost.crystal) {
                connection.sendUTF("Error: Not enough resources");
                return;
            }
            
            // Check if player has spaceport in current sector
            db.query(
                `SELECT id FROM buildings${gameId} b
                 JOIN map${gameId} m ON b.sectorid = m.sectorid
                 WHERE m.owner = ? AND b.sectorid = ? AND b.type = 3`,
                [playerId, player.currentsector],
                (err, buildings) => {
                    if (err || buildings.length === 0) {
                        connection.sendUTF("Error: Need a spaceport in this sector");
                        return;
                    }
                    
                    // Check tech requirements
                    const playerTech = player.tech ? player.tech.split(',').map(Number) : [];
                    if (shipData.techRequired && !playerTech.includes(shipData.techRequired)) {
                        connection.sendUTF("Error: Missing required technology");
                        return;
                    }
                    
                    // Buy the ship with race-modified costs
                    db.query(
                        `UPDATE players${gameId} SET metal = metal - ?, crystal = crystal - ? WHERE userid = ?`,
                        [modifiedShip.cost.metal, modifiedShip.cost.crystal, playerId],
                        (err) => {
                            if (err) {
                                connection.sendUTF("Error: Failed to deduct resources");
                                return;
                            }
                            
                            // Create the ship
                            db.query(
                                `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                                [playerId, shipType, player.currentsector],
                                (err) => {
                                    if (err) {
                                        connection.sendUTF("Error: Failed to create ship");
                                        return;
                                    }
                                    
                                    connection.sendUTF(`Success: Built ${shipData.name}`);
                                    updateResources(connection);
                                    updateSector2(gameId, player.currentsector);
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}

function buyBuilding(data, connection) {
    const parts = data.split(":");
    const buildingType = parseInt(parts[1]);
    const playerId = connection.name;
    const gameId = connection.gameid;
    
    // Define building costs
    const buildingCosts = {
        0: { name: "Metal Extractor", metal: 50, crystal: 20 },
        1: { name: "Crystal Refinery", metal: 40, crystal: 30 },
        2: { name: "Research Academy", metal: 60, crystal: 40 },
        3: { name: "Spaceport", metal: 100, crystal: 50 },
        4: { name: "Orbital Turret", metal: 80, crystal: 60 },
        5: { name: "Warp Gate", metal: 200, crystal: 150 }
    };
    
    const building = buildingCosts[buildingType];
    if (!building) {
        connection.sendUTF("Error: Invalid building type");
        return;
    }
    
    // Get player data
    db.query(
        `SELECT metal, crystal, currentsector FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) {
                connection.sendUTF("Error: Could not get player data");
                return;
            }
            
            const player = results[0];
            
            // Check resources
            if (player.metal < building.metal || player.crystal < building.crystal) {
                connection.sendUTF("Error: Not enough resources");
                return;
            }
            
            // Check if player owns the sector
            db.query(
                `SELECT owner, type FROM map${gameId} WHERE sectorid = ?`,
                [player.currentsector],
                (err, sector) => {
                    if (err || sector.length === 0 || Number(sector[0].owner) !== Number(playerId)) {
                        connection.sendUTF("Error: You don't own this sector");
                        return;
                    }

                    // Building slots scale with the planet (homeworld 6 … asteroid 1).
                    const slotLimit = BUILDING_SLOTS_BY_TYPE[Number(sector[0].type)] || 0;
                    if (slotLimit === 0) {
                        connection.sendUTF("Error: Nothing can be built in this sector");
                        return;
                    }

                    db.query(
                        `SELECT COUNT(*) as count FROM buildings${gameId} WHERE sectorid = ?`,
                        [player.currentsector],
                        (err, count) => {
                            if (err || count[0].count >= slotLimit) {
                                connection.sendUTF(`Error: Building limit reached (${slotLimit} slots here)`);
                                return;
                            }
                            
                            // Buy the building
                            db.query(
                                `UPDATE players${gameId} SET metal = metal - ?, crystal = crystal - ? WHERE userid = ?`,
                                [building.metal, building.crystal, playerId],
                                (err) => {
                                    if (err) {
                                        connection.sendUTF("Error: Failed to deduct resources");
                                        return;
                                    }
                                    
                                    // Create the building
                                    db.query(
                                        `INSERT INTO buildings${gameId} (sectorid, type, owner) VALUES (?, ?, ?)`,
                                        [player.currentsector, buildingType, playerId],
                                        (err) => {
                                            if (err) {
                                                connection.sendUTF("Error: Failed to create building");
                                                return;
                                            }
                                            
                                            connection.sendUTF(`Success: Built ${building.name}`);
                                            updateResources(connection);
                                            updateSector2(gameId, player.currentsector);
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}

function moveFleet(data, connection) {
    const parts = data.split(":");
    const fromSector = parseSectorToken(parts[1]);
    const toSector = parseSectorToken(parts[2]);
    const shipTypes = parts[3].split(",").map(Number);
    const shipCounts = parts[4].split(",").map(Number);
    const playerId = connection.name;
    const gameId = connection.gameid;

    // Validate movement
    if (!areAdjacentSectors(fromSector, toSector, gameId)) {
        connection.sendUTF("Error: Sectors are not adjacent");
        return;
    }

    // Check crystal cost (1 crystal per ship)
    const totalShips = shipCounts.reduce((a, b) => a + b, 0);

    db.query(
        `SELECT crystal FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) {
                connection.sendUTF("Error: Could not get player data");
                return;
            }

            if (results[0].crystal < totalShips) {
                connection.sendUTF("Error: Not enough crystal for movement");
                return;
            }

            // Move ships
            let moved = 0;
            shipTypes.forEach((type, index) => {
                const count = shipCounts[index];
                if (count > 0) {
                    // Get ships to move
                    db.query(
                        `SELECT id FROM ships${gameId}
                         WHERE owner = ? AND sectorid = ? AND type = ?
                         LIMIT ?`,
                        [playerId, fromSector, type, count],
                        (err, ships) => {
                            if (!err && ships.length > 0) {
                                const shipIds = ships.map(s => s.id).join(',');
                                db.query(
                                    `UPDATE ships${gameId} SET sectorid = ? WHERE id IN (${shipIds})`,
                                    [toSector],
                                    (err) => {
                                        if (!err) {
                                            moved += ships.length;

                                            // If all ships moved, deduct crystal and mark sectors explored
                                            if (moved === totalShips) {
                                                db.query(
                                                    `UPDATE players${gameId} SET crystal = crystal - ? WHERE userid = ?`,
                                                    [totalShips, playerId]
                                                );

                                                // Mark destination sector as explored
                                                markSectorExplored(gameId, playerId, toSector);

                                                // HAZARD HANDLING & AUTO-COLONIZATION
                                                applyArrivalEffects(gameId, playerId, toSector, connection, () => {
                                                    updateResources(connection);
                                                    updateSector2(gameId, fromSector);
                                                    updateSector2(gameId, toSector);
                                                });
                                            }
                                        }
                                    }
                                );
                            }
                        }
                    );
                }
            });
        }
    );
}

function areAdjacentSectors(sector1, sector2, gameId) {
    const mapSize = getGameMapSizeSync(gameId);
    const mapWidth = mapSize.width;
    const id1 = Number(sector1) - 1;
    const id2 = Number(sector2) - 1;
    if (!Number.isFinite(id1) || !Number.isFinite(id2) || id1 < 0 || id2 < 0) {
        return false;
    }

    const x1 = id1 % mapWidth;
    const y1 = Math.floor(id1 / mapWidth);
    const x2 = id2 % mapWidth;
    const y2 = Math.floor(id2 / mapWidth);

    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);

    // Check if adjacent (including diagonals)
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
}

// ============================================================================
// HAZARD MECHANICS - Restored from original 2012 game
// Black holes annihilate fleets, asteroids damage them (if not owned),
// and unowned planets are auto-colonized on arrival.
// ============================================================================
function applyArrivalEffects(gameId, playerId, sectorId, connection, done) {
    const finish = () => { try { done && done(); } catch (e) { console.error('arrival cb error:', e); } };

    db.query(
        `SELECT type, owner FROM map${gameId} WHERE sectorid = ?`,
        [sectorId],
        (err, sectorRows) => {
            if (err || !sectorRows || sectorRows.length === 0) {
                connection.sendUTF("Success: Fleet moved");
                return finish();
            }

            const sectorType = Number(sectorRows[0].type);
            const sectorOwner = sectorRows[0].owner;
            const numericPlayerId = Number(playerId);
            const ownsSector = Number(sectorOwner) === numericPlayerId;

            // BLACK HOLE: Annihilate the fleet
            if (sectorType === 2) {
                db.query(
                    `DELETE FROM ships${gameId} WHERE owner = ? AND sectorid = ?`,
                    [playerId, sectorId],
                    (delErr, result) => {
                        const lostCount = (result && result.affectedRows) || 0;
                        connection.sendUTF(`Error: Fleet arrived in sector ${sectorId}... but the sector contained a BLACK HOLE! UH-OH! Our fleet was crushed by the immense gravity!`);
                        // Notify other players
                        gameState.clients.forEach(c => {
                            if (c.gameid === gameId && Number(c.name) !== numericPlayerId) {
                                c.sendUTF(`Error: An enemy fleet was destroyed by the black hole in sector ${sectorId}!`);
                            }
                        });
                        finish();
                    }
                );
                return;
            }

            // ASTEROID BELT: Random damage unless owned
            if (sectorType === 1 && !ownsSector) {
                // Get ships that just arrived
                db.query(
                    `SELECT id FROM ships${gameId} WHERE owner = ? AND sectorid = ?`,
                    [playerId, sectorId],
                    (shipErr, ships) => {
                        if (shipErr || !ships || ships.length === 0) {
                            connection.sendUTF(`Success: Fleet moved into sector ${sectorId}`);
                            return finish();
                        }
                        const totalShips = ships.length;
                        // ~50% chance per ship of destruction
                        const destroyed = ships.filter(() => Math.random() > 0.5);
                        const destroyedCount = destroyed.length;

                        const proceed = () => {
                            let msg;
                            if (destroyedCount === 0) {
                                msg = `Success: We navigated the asteroid belt in sector ${sectorId} and avoided being hit. Whew!`;
                            } else if (destroyedCount === totalShips) {
                                msg = `Error: Asteroids in sector ${sectorId} destroyed our entire fleet! We lost everything!`;
                            } else {
                                msg = `Error: We lost ${destroyedCount} ships to asteroids in sector ${sectorId}. If we can control the sector though, that won't happen again.`;
                            }
                            connection.sendUTF(msg);
                            // Notify other players if there were losses
                            if (destroyedCount > 0) {
                                gameState.clients.forEach(c => {
                                    if (c.gameid === gameId && Number(c.name) !== numericPlayerId) {
                                        c.sendUTF(`Error: An enemy fleet lost ${destroyedCount} ships to asteroids in sector ${sectorId}!`);
                                    }
                                });
                            }
                            // Auto-colonize if survivors and unowned (asteroid belts are NOT colonizable per spec, skip)
                            finish();
                        };

                        if (destroyedCount === 0) {
                            proceed();
                        } else {
                            const destroyedIds = destroyed.map(s => s.id).join(',');
                            db.query(
                                `DELETE FROM ships${gameId} WHERE id IN (${destroyedIds})`,
                                proceed
                            );
                        }
                    }
                );
                return;
            }

            // AUTO-COLONIZATION: Unowned planets (types 6-9)
            if (sectorType >= 6 && sectorType <= 9 && !sectorOwner) {
                db.query(
                    `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`,
                    [playerId, sectorId],
                    (colErr) => {
                        if (!colErr) {
                            connection.sendUTF(`Success: Fleet claimed sector ${sectorId} for our empire!`);
                        } else {
                            connection.sendUTF(`Success: Fleet moved to sector ${sectorId}`);
                        }
                        finish();
                    }
                );
                return;
            }

            // Default: safe arrival
            connection.sendUTF("Success: Fleet moved");
            finish();
        }
    );
}

function updateSector(data, connection) {
    const parts = data.split(":");
    const sectorId = parseSectorToken(parts[1]);
    const gameId = connection.gameid;
    const playerId = Number(connection.name);

    if (!Number.isFinite(sectorId)) {
        connection.sendUTF("Error: Invalid sector");
        return;
    }

    canPlayerSeeSector(gameId, playerId, sectorId, (canSee) => {
        if (canSee) {
            db.query(
                `UPDATE players${gameId} SET currentsector = ? WHERE userid = ?`,
                [sectorId, playerId],
                () => {
                    updateSector2(gameId, sectorId);
                    sendMultiMoveOptions(connection, gameId, sectorId);
                }
            );
            return;
        }

        connection.sendUTF(`probeonly:${formatSectorToken(sectorId)}`);
        sendMultiMoveOptions(connection, gameId, sectorId);
    });
}

function canPlayerSeeSector(gameId, playerId, sectorId, callback) {
    // Player can see a sector if:
    // 1. They own it
    // 2. They have explored it
    // 3. They have a ship in it
    // 4. It's an allied sector

    db.query(
        `SELECT owner FROM map${gameId} WHERE sectorid = ?`,
        [sectorId],
        (err, sectors) => {
            if (err || !sectors.length) return callback(false);

            const sector = sectors[0];

            // Own it
            if (Number(sector.owner) === Number(playerId)) return callback(true);

            // Check if explored
            db.query(
                `SELECT sectorid FROM explored_sectors${gameId} WHERE playerid = ? AND sectorid = ?`,
                [playerId, sectorId],
                (err, explored) => {
                    if (!err && explored && explored.length > 0) return callback(true);

                    // Check if has ships there
                    db.query(
                        `SELECT id FROM ships${gameId} WHERE owner = ? AND sectorid = ? LIMIT 1`,
                        [playerId, sectorId],
                        (err, ships) => {
                            callback(!err && ships && ships.length > 0);
                        }
                    );
                }
            );
        }
    );
}

function markSectorExplored(gameId, playerId, sectorId) {
    // Mark sector as explored by player (ignore if already explored)
    db.query(
        `INSERT IGNORE INTO explored_sectors${gameId} (playerid, sectorid) VALUES (?, ?)`,
        [playerId, sectorId],
        (err) => {
            if (err) console.error('Error marking sector explored:', err);
        }
    );
}

function updateSector2(gameId, sectorId) {
    // Get sector data
    db.query(
        `SELECT * FROM map${gameId} WHERE sectorid = ?`,
        [sectorId],
        (err, sector) => {
            if (err || sector.length === 0) return;

            // Get ships in sector
            db.query(
                `SELECT owner, type, COUNT(*) as count
                 FROM ships${gameId}
                 WHERE sectorid = ?
                 GROUP BY owner, type`,
                [sectorId],
                (err, ships) => {
                    if (err) ships = [];

                    // Get buildings in sector
                    db.query(
                        `SELECT type FROM buildings${gameId} WHERE sectorid = ?`,
                        [sectorId],
                        (err, buildings) => {
                            if (err) buildings = [];

                            const sectorData = {
                                sector: sector[0],
                                ships: ships,
                                buildings: buildings
                            };

                            // Send sector data to each player who can see it
                            gameState.clients.forEach(client => {
                                if (Number(client.gameid) === Number(gameId)) {
                                    const playerId = Number(client.name);
                                    canPlayerSeeSector(gameId, playerId, sectorId, (canSee) => {
                                        if (canSee) {
                                            client.sendUTF(`sector::${sectorId}::${JSON.stringify(sectorData)}`);
                                        }
                                    });
                                }
                            });
                        }
                    );
                }
            );
        }
    );
}

function surroundShips(data, connection) {
    // This appears to be for moving multiple fleets - implement as needed
    connection.sendUTF("Error: Multi-move not yet implemented");
}

function sendMultiMoveOptions(connection, gameId, targetSector) {
    const playerId = Number(connection.name);
    const mapSize = getGameMapSizeSync(gameId);
    const adjacentIds = getAdjacentSectorIds(targetSector, mapSize.width, mapSize.height);
    if (!Number.isFinite(playerId) || adjacentIds.length === 0) {
        return;
    }

    db.query(
        `SELECT owner FROM map${gameId} WHERE sectorid = ?`,
        [targetSector],
        (sectorErr, sectorRows) => {
            if (sectorErr || !sectorRows || sectorRows.length === 0) {
                return;
            }

            db.query(
                `SELECT sectorid, type, COUNT(*) as count FROM ships${gameId} WHERE owner = ? GROUP BY sectorid, type`,
                [playerId],
                (shipsErr, shipRows) => {
                    if (shipsErr || !Array.isArray(shipRows) || shipRows.length === 0) {
                        return;
                    }

                    const bySector = new Map();
                    shipRows.forEach(row => {
                        const sectorId = Number(row.sectorid);
                        const type = Number(row.type);
                        const count = Number(row.count) || 0;
                        if (!adjacentIds.includes(sectorId) || count <= 0 || type < 1 || type > 9) {
                            return;
                        }

                        if (!bySector.has(sectorId)) {
                            bySector.set(sectorId, new Array(9).fill(0));
                        }
                        bySector.get(sectorId)[type - 1] += count;
                    });

                    if (bySector.size === 0) {
                        return;
                    }

                    const payload = ['mmoptions', formatSectorToken(targetSector)];
                    Array.from(bySector.entries())
                        .sort((a, b) => a[0] - b[0])
                        .forEach(([sectorId, counts]) => {
                            payload.push(formatSectorToken(sectorId));
                            counts.forEach(count => payload.push(String(count)));
                        });

                    connection.sendUTF(payload.join(':'));
                }
            );
        }
    );
}

function preMoveFleet(data, connection) {
    const parts = data.split(":");
    const playerId = Number(connection.name);
    const gameId = connection.gameid;
    const targetSector = parseSectorToken(parts[1]);

    if (!Number.isFinite(playerId) || !gameId || !Number.isFinite(targetSector)) {
        connection.sendUTF("Error: Invalid fleet order");
        return;
    }

    const requestedMoves = new Map();
    for (let i = 2; i + 2 < parts.length; i += 3) {
        const sourceSector = parseSectorToken(parts[i]);
        const shipType = Number.parseInt(parts[i + 1], 10);
        if (!Number.isFinite(sourceSector) || !Number.isFinite(shipType) || shipType < 1 || shipType > 9) {
            continue;
        }

        const key = `${sourceSector}:${shipType}`;
        requestedMoves.set(key, (requestedMoves.get(key) || 0) + 1);
    }

    if (requestedMoves.size === 0) {
        connection.sendUTF("Error: No ships selected");
        return;
    }

    const moveEntries = Array.from(requestedMoves.entries()).map(([key, count]) => {
        const [sourceSector, shipType] = key.split(':').map(Number);
        return { sourceSector, shipType, count };
    });

    for (const entry of moveEntries) {
        if (!areAdjacentSectors(entry.sourceSector, targetSector, gameId)) {
            connection.sendUTF(`Error: Sector ${formatSectorToken(entry.sourceSector)} is not adjacent to ${formatSectorToken(targetSector)}`);
            return;
        }
    }

    const totalShips = moveEntries.reduce((sum, entry) => sum + entry.count, 0);

    db.query(
        `SELECT crystal FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (resourceErr, resourceRows) => {
            if (resourceErr || !resourceRows || resourceRows.length === 0) {
                connection.sendUTF("Error: Could not get player data");
                return;
            }

            const crystals = Number(resourceRows[0].crystal) || 0;
            if (crystals < totalShips) {
                connection.sendUTF("Error: Not enough crystal for movement");
                return;
            }

            db.query(
                `SELECT id, sectorid, type FROM ships${gameId} WHERE owner = ?`,
                [playerId],
                (shipErr, shipRows) => {
                    if (shipErr || !Array.isArray(shipRows)) {
                        connection.sendUTF("Error: Could not verify fleet");
                        return;
                    }

                    const available = new Map();
                    shipRows.forEach(row => {
                        const source = Number(row.sectorid);
                        const type = Number(row.type);
                        const id = Number(row.id);
                        if (!Number.isFinite(source) || !Number.isFinite(type) || !Number.isFinite(id)) return;
                        const key = `${source}:${type}`;
                        if (!available.has(key)) {
                            available.set(key, []);
                        }
                        available.get(key).push(id);
                    });

                    for (const entry of moveEntries) {
                        const key = `${entry.sourceSector}:${entry.shipType}`;
                        const candidates = available.get(key) || [];
                        if (candidates.length < entry.count) {
                            connection.sendUTF(`Error: Not enough ships in sector ${formatSectorToken(entry.sourceSector)}`);
                            return;
                        }
                    }

                    const selectedIds = [];
                    const touchedSectors = new Set();
                    moveEntries.forEach(entry => {
                        const key = `${entry.sourceSector}:${entry.shipType}`;
                        const ids = available.get(key).slice(0, entry.count);
                        ids.forEach(id => selectedIds.push(id));
                        touchedSectors.add(entry.sourceSector);
                    });

                    if (selectedIds.length === 0) {
                        connection.sendUTF("Error: No valid ships selected");
                        return;
                    }

                    let completed = 0;
                    let failed = false;
                    const finishMovement = () => {
                        if (failed) return;
                        completed += 1;
                        if (completed !== selectedIds.length) return;

                        db.query(
                            `UPDATE players${gameId} SET crystal = crystal - ? WHERE userid = ?`,
                            [selectedIds.length, playerId],
                            deductErr => {
                                if (deductErr) {
                                    connection.sendUTF("Error: Failed to finalize movement");
                                    return;
                                }

                                markSectorExplored(gameId, playerId, targetSector);

                                // HAZARD HANDLING & AUTO-COLONIZATION
                                applyArrivalEffects(gameId, playerId, targetSector, connection, () => {
                                    updateResources(connection);
                                    updateSector2(gameId, targetSector);
                                    gameState.clients.forEach(client => {
                                        if (Number(client.gameid) === Number(gameId)) {
                                            sendVisibleMapState(gameId, client);
                                        }
                                    });
                                });
                            }
                        );
                    };

                    selectedIds.forEach(id => {
                        db.query(
                            `UPDATE ships${gameId} SET sectorid = ? WHERE id = ?`,
                            [targetSector, id],
                            updateErr => {
                                if (failed) return;
                                if (updateErr) {
                                    failed = true;
                                    connection.sendUTF("Error: Failed moving fleet");
                                    return;
                                }
                                finishMovement();
                            }
                        );
                    });
                }
            );
        }
    );
}

function updateResources(connection) {
    const playerId = connection.name;
    const gameId = connection.gameid;
    
    db.query(
        `SELECT metal, crystal, research FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) return;
            
            const resources = results[0];
            connection.sendUTF(`resources::${resources.metal}::${resources.crystal}::${resources.research}`);
        }
    );
}

function sendMapConfig(gameId, connection) {
    const mapSize = getGameMapSizeSync(gameId);
    connection.sendUTF(`mapconfig::${mapSize.width}::${mapSize.height}`);
}

function sectorStatusForPlayer(sector, playerId, fleetSize) {
    const type = Number(sector.type ?? sector.sectortype ?? 0);
    const owner = Number(sector.owner ?? sector.ownerid ?? 0);
    if (type === 2) return 'blackhole';
    // A secured asteroid belt is safe territory; show it as owned.
    if (owner && owner === Number(playerId)) return type === 10 ? 'homeworld' : 'owned';
    if (type === 1 || type === 3) return 'hazard';
    if (owner) return 'enemy';
    if (type === 10) return 'homeworld';
    if (fleetSize > 0) return 'owned';
    return 'neutral';
}

function sendVisibleMapState(gameId, connection) {
    const playerId = Number(connection.name);
    if (!Number.isFinite(playerId)) {
        return;
    }

    db.query(`SELECT * FROM map${gameId}`, (mapErr, sectors) => {
        if (mapErr || !Array.isArray(sectors)) {
            sendMapConfig(gameId, connection);
            return;
        }

        if (sectors.length > 0) {
            const width = Math.max(...sectors.map(sector => Number(sector.x) || 0)) + 1;
            const height = Math.max(...sectors.map(sector => Number(sector.y) || 0)) + 1;
            rememberGameMapSize(gameId, { width, height });
        }
        sendMapConfig(gameId, connection);

        const explored = new Set();
        db.query(
            `SELECT sectorid FROM explored_sectors${gameId} WHERE playerid = ?`,
            [playerId],
            (exploredErr, exploredRows) => {
                if (!exploredErr && Array.isArray(exploredRows)) {
                    exploredRows.forEach(row => explored.add(Number(row.sectorid)));
                }

                db.query(
                    `SELECT sectorid, COUNT(*) as count FROM ships${gameId} WHERE owner = ? GROUP BY sectorid`,
                    [playerId],
                    (shipsErr, shipRows) => {
                        const fleetBySector = new Map();
                        if (!shipsErr && Array.isArray(shipRows)) {
                            shipRows.forEach(row => {
                                fleetBySector.set(Number(row.sectorid), Number(row.count) || 0);
                            });
                        }

                        const visible = [];
                        sectors.forEach(sector => {
                            const sectorId = Number(sector.sectorid);
                            const owned = Number(sector.owner) === playerId;
                            const fleetSize = fleetBySector.get(sectorId) || 0;
                            if (!owned && fleetSize <= 0 && !explored.has(sectorId)) {
                                return;
                            }
                            const sectorType = Number(sector.type ?? sector.sectortype) || 0;
                            visible.push(`${sectorId}:${sectorStatusForPlayer(sector, playerId, fleetSize)}:${fleetSize}:${sectorType}`);
                        });

                        connection.sendUTF(`mapstate::${visible.join(',')}`);
                    }
                );
            }
        );
    });
}

function updateAllSectors(gameId, connection) {
    sendVisibleMapState(gameId, connection);

    // Send visible sector data to reconnecting player
    const playerId = Number(connection.name);
    db.query(
        `SELECT currentsector FROM players${gameId} WHERE userid = ? LIMIT 1`,
        [playerId],
        (currentErr, currentRows) => {
            if (!currentErr && Array.isArray(currentRows) && currentRows.length > 0) {
                const currentSector = parsePositiveInt(currentRows[0].currentsector, 0);
                if (currentSector > 0) {
                    updateSector2(gameId, currentSector);
                }
            }
        }
    );

    db.query(
        `SELECT sectorid FROM map${gameId}`,
        (err, sectors) => {
            if (err) return;

            sectors.forEach(sector => {
                canPlayerSeeSector(gameId, playerId, sector.sectorid, (canSee) => {
                    if (canSee) {
                        // Get and send sector data directly to this connection
                        db.query(
                            `SELECT * FROM map${gameId} WHERE sectorid = ?`,
                            [sector.sectorid],
                            (err, sectorData) => {
                                if (err || !sectorData.length) return;

                                db.query(
                                    `SELECT owner, type, COUNT(*) as count
                                     FROM ships${gameId}
                                     WHERE sectorid = ?
                                     GROUP BY owner, type`,
                                    [sector.sectorid],
                                    (err, ships) => {
                                        if (err) ships = [];

                                        db.query(
                                            `SELECT type FROM buildings${gameId} WHERE sectorid = ?`,
                                            [sector.sectorid],
                                            (err, buildings) => {
                                                if (err) buildings = [];

                                                const data = {
                                                    sector: sectorData[0],
                                                    ships: ships,
                                                    buildings: buildings
                                                };

                                                connection.sendUTF(`sector::${sector.sectorid}::${JSON.stringify(data)}`);
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                });
            });
        }
    );
}

function handleJoinGame(data, connection) {
    const parts = data.split(":");
    const gameId = parsePositiveInt(parts[1], 0);
    const raceId = parsePositiveInt(parts[2], 1);
    const playerId = Number(connection.name);

    if (!gameId || !playerId) {
        connection.sendUTF('joingame::error::Invalid join request.');
        return;
    }

    if (connection.gameid && Number(connection.gameid) !== gameId) {
        connection.sendUTF('joingame::error::Leave your current game before joining another one.');
        sendCurrentGameSnapshot(connection, () => {});
        return;
    }

    ensurePlayerTableColumns(gameId, tableErr => {
        if (tableErr) {
            connection.sendUTF('joingame::error::Game is not ready yet. Please try again.');
            return;
        }

        db.query('SELECT id, name, maxplayers, started, creator FROM games WHERE id = ? AND started = 0', [gameId], (err, games) => {
            if (err || !games || games.length === 0) {
                connection.sendUTF('joingame::error::Game not found or already started.');
                return;
            }

            const game = games[0];

            db.query(`SELECT * FROM players${gameId} WHERE userid = ? LIMIT 1`, [playerId], (existingErr, existing) => {
                if (!existingErr && existing && existing.length > 0) {
                    db.query(`SELECT COUNT(*) AS count FROM players${gameId}`, (countErr, counts) => {
                        const playerCount = countErr
                            ? 1
                            : Number((counts && counts[0] && (counts[0].count ?? counts[0].c)) || 1);
                        connection.gameid = gameId;
                        connection.raceid = existing[0].race_id || raceId;
                        sendJoinSuccess(connection, game, connection.raceid, playerCount);
                        broadcastPlayerList(gameId);
                    });
                    return;
                }

                db.query(`SELECT COUNT(*) AS count FROM players${gameId}`, (countErr, counts) => {
                    if (countErr) {
                        connection.sendUTF('joingame::error::Unable to check available seats.');
                        return;
                    }

                    const playerCount = Number((counts && counts[0] && (counts[0].count ?? counts[0].c)) || 0);
                    const maxPlayers = parsePositiveInt(game.maxplayers, 0);
                    if (maxPlayers > 0 && playerCount >= maxPlayers) {
                        connection.sendUTF('joingame::error::Game is already full.');
                        return;
                    }

                    getUserStats(playerId, (statsErr, userStats) => {
                        if (statsErr) {
                            connection.sendUTF('joingame::error::Unable to load your account stats.');
                            return;
                        }

                        raceSystem.isRaceUnlocked(playerId, raceId, userStats, db, unlocked => {
                            if (!unlocked) {
                                connection.sendUTF('joingame::error::Race not unlocked.');
                                return;
                            }

                            const race = getRaceById(raceId);
                            const startingResources = {
                                metal: Math.floor(100 * race.bonuses.metalProduction),
                                crystal: Math.floor(100 * race.bonuses.crystalProduction),
                                research: Math.floor(50 * race.bonuses.researchSpeed)
                            };

                            db.query(
                                `INSERT INTO players${gameId} (userid, race_id, metal, crystal, research, is_ai, ai_difficulty, ai_strategy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                [playerId, raceId, startingResources.metal, startingResources.crystal, startingResources.research, 0, 'medium', 'balanced'],
                                insertErr => {
                                    if (insertErr) {
                                        connection.sendUTF('joingame::error::Unable to join this game.');
                                        return;
                                    }

                                    db.query(
                                        'UPDATE users SET currentgame = ? WHERE id = ?',
                                        [gameId, playerId],
                                        updateErr => {
                                            if (updateErr) {
                                                connection.sendUTF('joingame::error::Unable to update user state.');
                                                return;
                                            }

                                            connection.gameid = gameId;
                                            connection.raceid = raceId;
                                            sendJoinSuccess(connection, game, raceId, playerCount + 1);
                                            broadcastPlayerList(gameId);
                                        }
                                    );
                                }
                            );
                        });
                    });
                });
            });
        });
    });
}

function sendJoinSuccess(connection, game, raceId, playerCount) {
    const payload = {
        gameId: Number(game.id),
        gameName: game.name || `Game ${game.id}`,
        maxPlayers: parsePositiveInt(game.maxplayers, 0),
        playerCount: parsePositiveInt(playerCount, 1),
        creatorId: Number(game.creator),
        raceId,
        raceName: getRaceById(raceId).name,
        mode: normalizeMode((gameState.activeGames[game.id] && gameState.activeGames[game.id].mode) || game.mode)
    };

    connection.sendUTF(`joingame::success::${JSON.stringify(payload)}`);
}

function clearStaleCurrentGame(connection, gameId, callback) {
    const playerId = Number(connection && connection.name);
    if (!playerId) {
        if (callback) callback();
        return;
    }

    db.query(
        'UPDATE users SET currentgame = NULL WHERE id = ? AND currentgame = ?',
        [playerId, gameId],
        () => {
            if (connection) {
                connection.gameid = null;
                connection.raceid = null;
            }
            if (callback) callback();
        }
    );
}

function sendCurrentGameSnapshot(connection, callback) {
    if (!connection || !connection.name || connection.name === 'unknown') {
        if (callback) callback(null, null);
        return;
    }

    const playerId = Number(connection.name);
    const currentGameId = parsePositiveInt(connection.gameid, 0);
    if (!currentGameId || !playerId) {
        connection.sendUTF('currentgame::null');
        if (callback) callback(null, null);
        return;
    }

    db.query('SELECT * FROM games WHERE id = ? LIMIT 1', [currentGameId], (gameErr, games) => {
        const game = !gameErr && Array.isArray(games) && games.length > 0 ? games[0] : null;
        if (!game) {
            clearStaleCurrentGame(connection, currentGameId, () => {
                connection.sendUTF('currentgame::null');
                if (callback) callback(null, null);
            });
            return;
        }

        ensurePlayerTableColumns(currentGameId, tableErr => {
            if (tableErr) {
                connection.sendUTF('currentgame::null');
                if (callback) callback(tableErr, null);
                return;
            }

            db.query(`SELECT * FROM players${currentGameId} WHERE userid = ? LIMIT 1`, [playerId], (playerErr, players) => {
                const player = !playerErr && Array.isArray(players) && players.length > 0 ? players[0] : null;
                if (!player) {
                    clearStaleCurrentGame(connection, currentGameId, () => {
                        connection.sendUTF('currentgame::null');
                        if (callback) callback(null, null);
                    });
                    return;
                }

                db.query(`SELECT COUNT(*) AS count FROM players${currentGameId}`, (countErr, counts) => {
                    const rawCount = !countErr && counts && counts[0]
                        ? (counts[0].count ?? counts[0].c ?? 1)
                        : 1;
                    const playerCount = Number.isFinite(Number(rawCount)) ? Number(rawCount) : 1;
                    const raceId = parsePositiveInt(player.race_id, DEFAULT_CREATOR_RACE_ID);
                    const isStarted = Number(game.started) === 1 || String(game.status || '').toLowerCase() === 'in-progress';
                    const mode = normalizeMode((gameState.activeGames[currentGameId] && gameState.activeGames[currentGameId].mode) || game.mode);
                    const payload = {
                        gameId: Number(game.id),
                        gameName: game.name || `Game ${currentGameId}`,
                        maxPlayers: parsePositiveInt(game.maxplayers, 0),
                        playerCount,
                        creatorId: Number(game.creator),
                        raceId,
                        raceName: getRaceById(raceId).name,
                        mode,
                        started: isStarted,
                        status: isStarted ? 'in-progress' : 'waiting'
                    };

                    connection.gameid = currentGameId;
                    connection.raceid = raceId;
                    connection.sendUTF(`currentgame::${JSON.stringify(payload)}`);
                    if (callback) callback(null, payload);
                });
            });
        });
    });
}

function handleCurrentGame(connection, callback) {
    sendCurrentGameSnapshot(connection, (err, payload) => {
        if (payload && payload.gameId) {
            broadcastPlayerList(payload.gameId);
            if (callback) callback(err, payload);
            return;
        }
        if (!err) {
            handleGameList(connection);
        }
        if (callback) callback(err, payload);
    });
}

function handleChangeRace(data, connection) {
    if (!connection.gameid) {
        connection.sendUTF('changerace::error::Join a game before changing race.');
        return;
    }

    const parts = data.split(':');
    const raceId = parsePositiveInt(parts[1], 1);
    const playerId = Number(connection.name);
    const gameId = Number(connection.gameid);

    getUserStats(playerId, (statsErr, userStats) => {
        if (statsErr) {
            connection.sendUTF('changerace::error::Unable to load your account stats.');
            return;
        }

        raceSystem.isRaceUnlocked(playerId, raceId, userStats, db, unlocked => {
            if (!unlocked) {
                connection.sendUTF('changerace::error::Race not unlocked.');
                return;
            }

            db.query(
                `UPDATE players${gameId} SET race_id = ? WHERE userid = ?`,
                [raceId, playerId],
                err => {
                    if (err) {
                        connection.sendUTF('changerace::error::Failed to update race.');
                        return;
                    }

                    connection.raceid = raceId;
                    const race = getRaceById(raceId);
                    connection.sendUTF(`changerace::success::${JSON.stringify({
                        raceId,
                        raceName: race.name
                    })}`);
                    broadcastPlayerList(gameId);
                }
            );
        });
    });
}

function handleLeaveGame(connection) {
    if (!connection || !connection.gameid) {
        connection.sendUTF('lobby::');
        return;
    }

    const gameId = Number(connection.gameid);
    const playerId = Number(connection.name);

    db.query('SELECT creator, maxplayers, started FROM games WHERE id = ? LIMIT 1', [gameId], (gameErr, games) => {
        if (gameErr || !games || games.length === 0) {
            connection.gameid = null;
            connection.raceid = null;
            connection.sendUTF('lobby::');
            return;
        }

        const game = games[0];

        db.query(`DELETE FROM players${gameId} WHERE userid = ?`, [playerId], () => {
            db.query('UPDATE users SET currentgame = NULL WHERE id = ? AND currentgame = ?', [playerId, gameId], () => {
                connection.gameid = null;
                connection.raceid = null;
                connection.sendUTF('lobby::');

                db.query(`SELECT userid, is_ai FROM players${gameId} ORDER BY joined_at ASC, userid ASC`, (playersErr, remainingRows) => {
                    if (playersErr) {
                        broadcastPlayerList(gameId);
                        return;
                    }

                    const remaining = Array.isArray(remainingRows) ? remainingRows : [];
                    if (remaining.length === 0) {
                        db.query('DELETE FROM games WHERE id = ?', [gameId], () => {});
                        if (gameState.gameTimer[gameId]) {
                            clearInterval(gameState.gameTimer[gameId]);
                            delete gameState.gameTimer[gameId];
                        }
                        delete gameState.turns[gameId];
                        delete gameState.activeGames[gameId];
                        return;
                    }

                    if (String(game.creator) === String(playerId)) {
                        const nextCreator = remaining.find(player => Number(player.is_ai) !== 1) || remaining[0];
                        db.query('UPDATE games SET creator = ? WHERE id = ?', [nextCreator.userid, gameId], () => {});
                    }

                    broadcastPlayerList(gameId);
                });
            });
        });
    });
}

function createAiUser(callback) {
    const suffix = crypto.randomBytes(3).toString('hex');
    const username = `AI_${suffix}`;
    const salt = generateSalt();
    const password = hashPassword(generateTempKey(), salt);
    const email = `${username.toLowerCase()}@ai.local`;
    const tempKey = generateTempKey();

    db.query(
        'INSERT INTO users (username, password, salt, email, tempkey) VALUES (?, ?, ?, ?, ?)',
        [username, password, salt, email, tempKey],
        (err, result) => {
            if (err || !result || !result.insertId) {
                callback(err || new Error('Failed to create AI user'));
                return;
            }

            const userId = Number(result.insertId);
            db.query('INSERT INTO user_stats (user_id) VALUES (?)', [userId], () => {
                callback(null, {
                    id: userId,
                    username
                });
            });
        }
    );
}

function handleAddAi(data, connection) {
    if (!connection.gameid) {
        connection.sendUTF('addai::error::Join a game first.');
        return;
    }

    const gameId = Number(connection.gameid);
    const creatorId = Number(connection.name);
    const parts = data.split(':');
    const aiDifficulty = normalizeAiDifficulty(parts[1]);
    const aiStrategy = normalizeAiStrategy(parts[2]);

    db.query('SELECT creator, maxplayers, started FROM games WHERE id = ? LIMIT 1', [gameId], (gameErr, games) => {
        if (gameErr || !games || games.length === 0) {
            connection.sendUTF('addai::error::Game not found.');
            return;
        }

        const game = games[0];
        if (String(game.creator) !== String(creatorId)) {
            connection.sendUTF('addai::error::Only the game creator can add AI opponents.');
            return;
        }
        if (Number(game.started) === 1) {
            connection.sendUTF('addai::error::Cannot add AI after game start.');
            return;
        }

        db.query(`SELECT COUNT(*) AS count FROM players${gameId}`, (countErr, counts) => {
            if (countErr) {
                connection.sendUTF('addai::error::Unable to check lobby capacity.');
                return;
            }

            const playerCount = Number((counts && counts[0] && (counts[0].count ?? counts[0].c)) || 0);
            const maxPlayers = parsePositiveInt(game.maxplayers, 0);
            if (maxPlayers > 0 && playerCount >= maxPlayers) {
                connection.sendUTF('addai::error::Game is already full.');
                return;
            }

            createAiUser((createErr, aiUser) => {
                if (createErr || !aiUser) {
                    connection.sendUTF('addai::error::Unable to create AI opponent.');
                    return;
                }

                db.query(
                    `INSERT INTO players${gameId} (userid, race_id, metal, crystal, research, is_ai, ai_difficulty, ai_strategy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [aiUser.id, 1, 100, 100, 50, 1, aiDifficulty, aiStrategy],
                    insertErr => {
                        if (insertErr) {
                            connection.sendUTF('addai::error::Unable to add AI opponent.');
                            return;
                        }

                        db.query(
                            'UPDATE users SET currentgame = ? WHERE id = ?',
                            [gameId, aiUser.id],
                            () => {
                                connection.sendUTF(`addai::success::${encodeURIComponent(aiUser.username)}`);
                                broadcastPlayerList(gameId);
                            }
                        );
                    }
                );
            });
        });
    });
}

function handleSurrender(connection) {
    if (!connection || !connection.gameid) {
        connection.sendUTF('Error: Not in a game');
        return;
    }

    const gameId = Number(connection.gameid);
    const surrenderingId = Number(connection.name);
    const reason = 'Surrender';

    db.query(`SELECT userid FROM players${gameId}`, (winnerErr, winnerRows) => {
        if (winnerErr) {
            connection.sendUTF('Error: Unable to process surrender');
            return;
        }

        const winner = Array.isArray(winnerRows)
            ? winnerRows.find(row => Number(row.userid) !== surrenderingId)
            : null;
        const winnerId = winner ? Number(winner.userid) : null;
        db.query(
            'UPDATE games SET status = ? WHERE id = ?',
            ['completed', gameId],
            () => {
                if (gameState.gameTimer[gameId]) {
                    clearInterval(gameState.gameTimer[gameId]);
                    delete gameState.gameTimer[gameId];
                }
                delete gameState.turns[gameId];
                delete gameState.activeGames[gameId];

                db.query(`SELECT userid FROM players${gameId}`, (playersErr, players) => {
                    const playerIds = playersErr
                        ? []
                        : players.map(row => Number(row.userid)).filter(Number.isFinite);

                    playerIds.forEach(playerId => {
                        db.query(
                            'UPDATE users SET currentgame = NULL WHERE id = ? AND currentgame = ?',
                            [playerId, gameId],
                            () => {}
                        );
                    });

                    const finalMessage = `gameover::${winnerId || ''}::${encodeURIComponent(reason)}`;
                    gameState.clients.forEach(client => {
                        if (Number(client.gameid) === gameId) {
                            client.sendUTF(finalMessage);
                            client.gameid = null;
                            client.raceid = null;
                        }
                    });
                });
            }
        );
    });
}

// Get user stats helper
function getUserStats(userId, callback) {
    db.query('SELECT * FROM user_stats WHERE user_id = ?', [userId], (err, results) => {
        if (err) {
            callback(err, null);
        } else if (results.length === 0) {
            // Create default stats if none exist
            db.query('INSERT INTO user_stats (user_id) VALUES (?)', [userId], (err) => {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, {
                        user_id: userId,
                        games_played: 0,
                        wins: 0,
                        losses: 0,
                        total_planets_colonized: 0,
                        total_crystal_earned: 0,
                        total_ships_built: 0,
                        total_battles_won: 0,
                        total_sectors_explored: 0
                    });
                }
            });
        } else {
            callback(null, results[0]);
        }
    });
}

// Handle get unlocked races request
function handleGetUnlockedRaces(connection) {
    const userId = connection.name;
    
    raceSystem.getUnlockedRaces(userId, db, (err, races) => {
        if (err) {
            connection.sendUTF("Error: Failed to get unlocked races");
            return;
        }
        
        // Mark which races are unlocked
        const raceData = Object.values(raceSystem.RACE_TYPES).map(race => ({
            ...race,
            unlocked: races.some(r => r.id === race.id)
        }));
        
        connection.sendUTF(`races::${JSON.stringify(raceData)}`);
    });
}

// Helper functions
function broadcastToGame(gameId, message) {
    gameState.clients.forEach(client => {
        if (Number(client.gameid) === Number(gameId)) {
            client.sendUTF(message);
        }
    });
}

function broadcastPlayerList(gameId) {
    if (!gameId) {
        return;
    }

    db.query(
        `SELECT p.userid, p.is_ai, p.race_id, p.ai_difficulty, p.ai_strategy, u.username
         FROM players${gameId} p
         LEFT JOIN users u ON u.id = p.userid
         ORDER BY p.joined_at ASC, p.userid ASC`,
        (err, rows) => {
            if (err || !rows || rows.length === 0) {
                const fallback = 'pl';
                gameState.clients.forEach(client => {
                    if (Number(client.gameid) === Number(gameId)) {
                        client.sendUTF(fallback);
                    }
                });
                return;
            }

            const entries = rows.map(row => {
                const username = row.username || `Player ${row.userid}`;
                const encodedName = encodeURIComponent(username);
                const isAi = Number(row.is_ai) === 1 ? 1 : 0;
                const raceId = parsePositiveInt(row.race_id, 1);
                const aiDifficulty = normalizeAiDifficulty(row.ai_difficulty);
                const aiStrategy = normalizeAiStrategy(row.ai_strategy);
                return `${row.userid}|${encodedName}|${isAi}|${raceId}|${aiDifficulty}|${aiStrategy}`;
            });

            const payload = `pl:${entries.join(':')}`;
            gameState.clients.forEach(client => {
                if (Number(client.gameid) === Number(gameId)) {
                    client.sendUTF(payload);
                }
            });
        }
    );
}

function notifyPlayer(playerId, message) {
    const connection = gameState.clientMap[playerId];
    if (connection) {
        connection.sendUTF(message);
    }
}

function handlePlayerDisconnect(connection) {
    if (!connection) {
        return;
    }

    const playerId = connection.name ? String(connection.name) : '';
    if (playerId && playerId !== 'unknown' && gameState.clientMap[playerId] === connection) {
        delete gameState.clientMap[playerId];
    }
}

// Special race ability functions
function autoRepairShips(gameId, playerId) {
    // Mechanicus auto-repair: 5% hull repair per turn
    // This would need to be implemented with ship health tracking
    // For now, just a placeholder
}

function evolveShips(gameId, playerId) {
    // Bioform evolution: Ships gain 2% stats per turn
    // This would need ship age tracking
    // For now, just a placeholder
}

// Payment handler functions - delegate to enhanced endpoints
async function handleCreatePaymentIntent(request, response) {
    if (!paymentEndpoints) {
        response.writeHead(503, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({error: 'Payment system not available'}));
        return;
    }
    return paymentEndpoints.handleCreateIntent(request, response);
}

async function handleCreateSubscription(request, response) {
    if (!paymentEndpoints) {
        response.writeHead(503, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({error: 'Payment system not available'}));
        return;
    }
    return paymentEndpoints.handleCreateSubscription(request, response);
}

async function handlePaymentWebhook(request, response) {
    if (!paymentEndpoints) {
        response.writeHead(503, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({error: 'Payment system not available'}));
        return;
    }
    return paymentEndpoints.handleWebhook(request, response);
}

async function handleSpendCrystals(request, response) {
    if (!paymentEndpoints) {
        response.writeHead(503, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({error: 'Payment system not available'}));
        return;
    }
    return paymentEndpoints.handleSpendCrystals(request, response);
}

// Handle get balance request
async function handleGetBalance(request, response, userId) {
    if (!paymentEndpoints) {
        response.writeHead(503, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({error: 'Payment system not available'}));
        return;
    }
    return paymentEndpoints.handleGetBalance(request, response, userId);
}

// Handle get owned items
async function handleGetOwnedItems(request, response, userId) {
    if (!paymentEndpoints) {
        response.writeHead(503, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({error: 'Payment system not available'}));
        return;
    }
    return paymentEndpoints.handleGetOwnedItems(request, response, userId);
}

// Handle get purchase history
async function handleGetPurchaseHistory(request, response, userId) {
    if (!paymentEndpoints) {
        response.writeHead(503, {'Content-Type': 'application/json'});
        response.end(JSON.stringify({error: 'Payment system not available'}));
        return;
    }
    return paymentEndpoints.handleGetPurchaseHistory(request, response, userId);
}

function handleGetCurrentGame(request, response, userId) {
    const parsedUserId = parsePositiveInt(userId, 0);
    if (!parsedUserId) {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Invalid user ID' }));
        return;
    }

    db.query(
        'SELECT currentgame FROM users WHERE id = ? LIMIT 1',
        [parsedUserId],
        (err, rows) => {
            if (err) {
                response.writeHead(500, { 'Content-Type': 'application/json' });
                response.end(JSON.stringify({ error: 'Database error' }));
                return;
            }

            const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
            const currentGameId = parsePositiveInt(row && row.currentgame, 0);

            response.writeHead(200, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({
                userId: parsedUserId,
                currentGame: currentGameId || null
            }));
        }
    );
}

// ============================================================================
// ACTIVE GAME STATE, STANDING ORDERS & AI TURNS
// Restored after the modular reorganization dropped them. Standing orders let
// players (especially in epic/24h mode) automate rebuild/scout chores; the AI
// block gives computer opponents real turn behavior.
// ============================================================================

function ensureActiveGameState(gameId) {
    if (!gameState.activeGames[gameId]) {
        gameState.activeGames[gameId] = {};
    }
    const state = gameState.activeGames[gameId];
    if (!state.aiProfiles) {
        state.aiProfiles = new Map();
    }
    if (!state.standingOrders) {
        state.standingOrders = {};
    }
    if (!state.turnReady) {
        state.turnReady = new Set();
    }
    return state;
}

// "Finish turn early": each human can declare they're done; once everyone
// has, the next turn starts immediately instead of waiting out the clock.
function markPlayerTurnDone(gameId, connection) {
    const state = ensureActiveGameState(gameId);
    const playerId = Number(connection.name);
    if (!Number.isFinite(playerId)) return;
    state.turnReady.add(playerId);

    db.query(
        `SELECT userid, is_ai FROM players${gameId}`,
        (err, rows) => {
            if (err || !Array.isArray(rows)) return;
            const humans = rows.filter(row => Number(row.is_ai) !== 1).map(row => Number(row.userid));
            const readyCount = humans.filter(id => state.turnReady.has(id)).length;

            broadcastToGame(gameId, `turnready::${readyCount}::${humans.length}`);

            if (readyCount >= humans.length && humans.length > 0) {
                startTurnTimer(gameId); // restart the clock for the new turn
                processTurn(gameId);
            }
        }
    );
}

function defaultStandingOrders(mode = DEFAULT_GAME_MODE) {
    const normalized = normalizeMode(mode);
    return {
        ...DEFAULT_STANDING_ORDERS,
        autoRebuild: normalized === 'epic',
        autoScout: normalized === 'epic',
        targetScouts: 2
    };
}

function getStandingOrders(gameId, playerId) {
    const state = ensureActiveGameState(gameId);
    if (!state.standingOrders[playerId]) {
        state.standingOrders[playerId] = defaultStandingOrders(state.mode || DEFAULT_GAME_MODE);
    }
    return state.standingOrders[playerId];
}

function setStandingOrders(gameId, playerId, incoming = {}) {
    const state = ensureActiveGameState(gameId);
    const current = getStandingOrders(gameId, playerId);
    state.standingOrders[playerId] = {
        ...current,
        autoRebuild: Boolean(incoming.autoRebuild),
        autoScout: Boolean(incoming.autoScout),
        targetScouts: Number.isFinite(incoming.targetScouts)
            ? Math.max(0, Math.min(6, incoming.targetScouts))
            : (current.targetScouts || 2)
    };
    return state.standingOrders[playerId];
}

async function applyStandingOrdersForPlayer(gameId, playerId) {
    const orders = getStandingOrders(gameId, playerId);
    const summary = [];
    if (!orders) return summary;

    try {
        const playerRows = await queryDb(
            `SELECT metal, crystal, homeworld FROM players${gameId} WHERE userid = ? LIMIT 1`,
            [playerId]
        );
        if (!playerRows || playerRows.length === 0) {
            return summary;
        }
        const player = playerRows[0];
        let metal = Number(player.metal) || 0;
        let crystal = Number(player.crystal) || 0;
        const homeworld = Number(player.homeworld);
        if (!Number.isFinite(homeworld)) {
            return summary;
        }

        if (orders.autoRebuild) {
            const sectorRows = await queryDb(
                `SELECT owner FROM map${gameId} WHERE sectorid = ? LIMIT 1`,
                [homeworld]
            );
            if (sectorRows && sectorRows[0] && Number(sectorRows[0].owner) === Number(playerId)) {
                const buildingRows = await queryDb(
                    `SELECT type, COUNT(*) as count FROM buildings${gameId} WHERE sectorid = ? AND owner = ? GROUP BY type`,
                    [homeworld, playerId]
                );
                const buildingCounts = {};
                (buildingRows || []).forEach(row => {
                    buildingCounts[row.type] = row.count;
                });
                for (const [type, label] of [[0, 'metal extractor'], [1, 'crystal refinery']]) {
                    if (buildingCounts[type]) continue;
                    const cost = BUILDING_COSTS[type];
                    if (metal < cost.metal || crystal < cost.crystal) continue;
                    metal -= cost.metal;
                    crystal -= cost.crystal;
                    await queryDb(
                        `UPDATE players${gameId} SET metal = ?, crystal = ? WHERE userid = ?`,
                        [metal, crystal, playerId]
                    );
                    await queryDb(
                        `INSERT INTO buildings${gameId} (sectorid, type, owner) VALUES (?, ?, ?)`,
                        [homeworld, type, playerId]
                    );
                    summary.push(`Auto-built ${label} on homeworld`);
                }
            }
        }

        if (orders.autoScout) {
            const scoutCost = (combatSystem.SHIP_TYPES.SCOUT && combatSystem.SHIP_TYPES.SCOUT.cost) || { metal: 200, crystal: 0 };
            const scoutCountRows = await queryDb(
                `SELECT COUNT(*) as count FROM ships${gameId} WHERE owner = ? AND type = ?`,
                [playerId, SCOUT_SHIP_ID]
            );
            const currentScouts = (scoutCountRows && scoutCountRows[0] && scoutCountRows[0].count) || 0;
            const desiredScouts = Number.isFinite(orders.targetScouts) ? orders.targetScouts : 2;
            if (currentScouts < desiredScouts && metal >= scoutCost.metal && crystal >= (scoutCost.crystal || 0)) {
                const spaceportRows = await queryDb(
                    `SELECT COUNT(*) as count FROM buildings${gameId} WHERE owner = ? AND sectorid = ? AND type = 3`,
                    [playerId, homeworld]
                );
                const hasSpaceport = ((spaceportRows && spaceportRows[0] && spaceportRows[0].count) || 0) > 0;
                if (hasSpaceport) {
                    metal -= scoutCost.metal;
                    crystal -= (scoutCost.crystal || 0);
                    await queryDb(
                        `UPDATE players${gameId} SET metal = ?, crystal = ? WHERE userid = ?`,
                        [metal, crystal, playerId]
                    );
                    await queryDb(
                        `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                        [playerId, SCOUT_SHIP_ID, homeworld]
                    );
                    summary.push('Auto-built scout to keep vision online');
                }
            }
        }
    } catch (err) {
        console.warn(`Standing orders failed for player ${playerId} in game ${gameId}:`, err.message || err);
    }

    return summary;
}

function hydrateStandingOrdersDefaults(gameId, mode) {
    const state = ensureActiveGameState(gameId);
    db.query(`SELECT userid FROM players${gameId}`, (err, rows) => {
        if (err || !Array.isArray(rows)) {
            return;
        }
        rows.forEach(row => {
            const playerId = Number(row.userid);
            if (!Number.isFinite(playerId) || state.standingOrders[playerId]) {
                return;
            }
            state.standingOrders[playerId] = defaultStandingOrders(mode || state.mode || DEFAULT_GAME_MODE);
        });
    });
}

function applyStandingOrdersForGame(gameId) {
    db.query(`SELECT userid FROM players${gameId}`, (err, rows) => {
        if (err || !Array.isArray(rows)) {
            return;
        }
        rows.forEach(row => {
            applyStandingOrdersForPlayer(gameId, row.userid).then(summary => {
                if (!Array.isArray(summary) || summary.length === 0) return;
                const client = gameState.clientMap[String(row.userid)] || gameState.clientMap[row.userid];
                if (client && Number(client.gameid) === Number(gameId)) {
                    summary.forEach(line => client.sendUTF(`systemalert::${line}`));
                    updateResources(client);
                }
            }).catch(err2 => {
                console.warn(`Standing orders tick failed for player ${row.userid} in game ${gameId}:`, err2.message || err2);
            });
        });
    });
}

function handleStandingOrders(data, connection) {
    if (!connection.gameid || !connection.name) {
        connection.sendUTF("standingorders::error::Missing game context");
        return;
    }
    const payload = data.substring("//standingorders:".length);
    if (payload === "get") {
        const orders = getStandingOrders(connection.gameid, connection.name);
        connection.sendUTF(`standingorders::state::${JSON.stringify(orders)}`);
        return;
    }
    try {
        const parsed = JSON.parse(payload);
        const updated = setStandingOrders(connection.gameid, connection.name, parsed);
        connection.sendUTF(`standingorders::state::${JSON.stringify(updated)}`);
    } catch (err) {
        console.error('Failed to parse standing orders payload:', err);
        connection.sendUTF("standingorders::error::Invalid payload");
    }
}

async function handleApplyStandingOrders(connection) {
    if (!connection.gameid || !connection.name) return;
    try {
        const summary = await applyStandingOrdersForPlayer(connection.gameid, connection.name);
        if (Array.isArray(summary) && summary.length > 0) {
            connection.sendUTF(`standingorders::applied::${JSON.stringify(summary)}`);
            updateResources(connection);
        } else {
            connection.sendUTF("standingorders::noop");
        }
    } catch (err) {
        console.error('Failed to apply standing orders:', err);
        connection.sendUTF("standingorders::error::Unable to run standing orders right now");
    }
}

// ---------------------------------------------------------------------------
// AI opponents: each turn the AI develops its economy, expands with colony
// ships, researches tech, and (per strategy) harasses the nearest enemy.
// ---------------------------------------------------------------------------

function connectionStub(playerId, gameId) {
    return {
        name: String(playerId),
        gameid: gameId,
        sendUTF() {}
    };
}

function sectorXY(gameId, sectorId) {
    const { width } = getGameMapSizeSync(gameId);
    const zeroBased = Number(sectorId) - 1;
    return { x: zeroBased % width, y: Math.floor(zeroBased / width) };
}

function sectorDistance(gameId, a, b) {
    const pa = sectorXY(gameId, a);
    const pb = sectorXY(gameId, b);
    // Chebyshev distance: diagonal moves are legal, so this is true travel time.
    return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
}

async function nextStepTowards(gameId, current, target, playerId) {
    if (Number(current) === Number(target)) return null;
    const { width, height } = getGameMapSizeSync(gameId);
    const cur = sectorXY(gameId, current);
    const dst = sectorXY(gameId, target);
    const stepX = cur.x === dst.x ? 0 : (cur.x < dst.x ? 1 : -1);
    const stepY = cur.y === dst.y ? 0 : (cur.y < dst.y ? 1 : -1);

    const candidates = [];
    const pushCandidate = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const id = y * width + x + 1;
        if (id !== Number(current) && !candidates.includes(id)) candidates.push(id);
    };
    pushCandidate(cur.x + stepX, cur.y + stepY); // preferred: diagonal toward target
    pushCandidate(cur.x + stepX, cur.y);
    pushCandidate(cur.x, cur.y + stepY);

    if (candidates.length === 0) return null;

    try {
        const rows = await queryDb(
            `SELECT sectorid, type, owner FROM map${gameId} WHERE sectorid IN (${candidates.map(() => '?').join(',')})`,
            candidates
        );
        const info = new Map((rows || []).map(r => [Number(r.sectorid), r]));
        // Prefer candidates in order, skipping black holes and unowned asteroid belts.
        for (const id of candidates) {
            const row = info.get(id);
            if (!row) continue;
            const type = Number(row.type);
            if (type === 2) continue; // black hole: never
            if (type === 1 && Number(row.owner) !== Number(playerId)) continue; // asteroid: only if secured
            return id;
        }
        // All safe-ish routes blocked; accept an asteroid risk rather than stalling.
        for (const id of candidates) {
            const row = info.get(id);
            if (row && Number(row.type) !== 2) return id;
        }
    } catch (err) {
        console.warn(`AI pathing failed in game ${gameId}:`, err.message || err);
    }
    return null;
}

function trackAiProfile(gameId, playerId, difficulty = 'medium', strategy = 'balanced') {
    const state = ensureActiveGameState(gameId);
    state.aiProfiles.set(Number(playerId), {
        difficulty: (difficulty || 'medium').toLowerCase(),
        strategy: (strategy || 'balanced').toLowerCase(),
        lastTurn: 0
    });
}

function hydrateAiPlayers(gameId) {
    db.query(
        `SELECT userid, is_ai, ai_difficulty, ai_strategy FROM players${gameId} WHERE is_ai = 1`,
        (err, rows) => {
            if (err || !Array.isArray(rows)) {
                return;
            }
            rows.filter(row => Number(row.is_ai) === 1).forEach(row => {
                trackAiProfile(gameId, row.userid, row.ai_difficulty, row.ai_strategy);
            });
        }
    );
}

function triggerAiTurn(gameId) {
    db.query(
        `SELECT userid, is_ai, ai_difficulty, ai_strategy FROM players${gameId} WHERE is_ai = 1`,
        (err, rows) => {
            if (err || !Array.isArray(rows)) {
                return;
            }
            rows.filter(row => Number(row.is_ai) === 1).forEach(row => {
                trackAiProfile(gameId, row.userid, row.ai_difficulty, row.ai_strategy);
                runAiActions(gameId, row.userid, row.ai_difficulty, row.ai_strategy)
                    .catch(aiErr => console.warn(`AI turn failed for player ${row.userid} in game ${gameId}:`, aiErr.message || aiErr));
            });
        }
    );
}

async function runAiActions(gameId, playerId, difficulty = 'medium', strategy = 'balanced') {
    const strat = (strategy || 'balanced').toLowerCase();
    const aggressiveness = strat === 'aggressive' ? 1.2 : strat === 'chill' ? 0.6 : 1.0;
    const stub = connectionStub(playerId, gameId);

    const rows = await queryDb(
        `SELECT userid, homeworld, currentsector, metal, crystal, research FROM players${gameId} WHERE userid = ? LIMIT 1`,
        [playerId]
    );
    if (!rows || rows.length === 0) return;
    const player = rows[0];
    const homeworld = Number(player.homeworld);
    if (!Number.isFinite(homeworld) || homeworld <= 0) return;

    // Keep the AI's "current sector" anchored to its homeworld so purchases land there.
    if (Number(player.currentsector) !== homeworld) {
        await queryDb(`UPDATE players${gameId} SET currentsector = ? WHERE userid = ?`, [homeworld, playerId]);
    }

    const buildingRows = await queryDb(
        `SELECT type, COUNT(*) as count FROM buildings${gameId} WHERE sectorid = ? AND owner = ? GROUP BY type`,
        [homeworld, playerId]
    );
    const buildingCounts = {};
    (buildingRows || []).forEach(row => { buildingCounts[row.type] = row.count; });
    const hasSpaceport = Boolean(buildingCounts[3]);

    // Economy & infrastructure: spaceport first (ships unlock everything else).
    if (!hasSpaceport && player.metal >= BUILDING_COSTS[3].metal && player.crystal >= BUILDING_COSTS[3].crystal) {
        buyBuilding('//buybuilding:3', stub);
    } else {
        if (!buildingCounts[0] && player.metal >= BUILDING_COSTS[0].metal && player.crystal >= BUILDING_COSTS[0].crystal) {
            buyBuilding('//buybuilding:0', stub);
        }
        if (!buildingCounts[1] && player.metal >= BUILDING_COSTS[1].metal && player.crystal >= BUILDING_COSTS[1].crystal) {
            buyBuilding('//buybuilding:1', stub);
        }
    }

    if (hasSpaceport) {
        const scoutCost = combatSystem.SHIP_TYPES.SCOUT.cost;
        const frigateCost = combatSystem.SHIP_TYPES.FRIGATE.cost;
        const destroyerCost = combatSystem.SHIP_TYPES.DESTROYER.cost;
        const colonyCost = combatSystem.SHIP_TYPES.COLONY_SHIP.cost;

        const shipRows = await queryDb(
            `SELECT type, COUNT(*) as count FROM ships${gameId} WHERE sectorid = ? AND owner = ? GROUP BY type`,
            [homeworld, playerId]
        );
        const shipCounts = {};
        (shipRows || []).forEach(row => { shipCounts[row.type] = row.count; });

        let budget = Number(player.metal) || 0;
        // Keep a colony ship in production for expansion.
        const colonyRows = await queryDb(
            `SELECT COUNT(*) as count FROM ships${gameId} WHERE owner = ? AND type = ?`,
            [playerId, COLONY_SHIP_ID]
        );
        const colonyCount = (colonyRows && colonyRows[0] && colonyRows[0].count) || 0;
        if (colonyCount === 0 && budget >= colonyCost.metal + 400) {
            buyShip(`//buyship:${COLONY_SHIP_ID}`, stub);
            budget -= colonyCost.metal;
        }
        if (!shipCounts[SCOUT_SHIP_ID] && budget >= scoutCost.metal + 200) {
            buyShip(`//buyship:${SCOUT_SHIP_ID}`, stub);
            budget -= scoutCost.metal;
        }
        if (budget >= destroyerCost.metal * (2 - aggressiveness)) {
            buyShip(`//buyship:${combatSystem.SHIP_TYPES.DESTROYER.id}`, stub);
            budget -= destroyerCost.metal;
        } else if (budget >= frigateCost.metal * (2 - aggressiveness)) {
            buyShip(`//buyship:${combatSystem.SHIP_TYPES.FRIGATE.id}`, stub);
            budget -= frigateCost.metal;
        }
    }

    await handleAiExpansion(gameId, playerId, homeworld);
    if (strat === 'aggressive') {
        await handleAiHarass(gameId, playerId, homeworld);
    }
    await aiResearchAndDefend(gameId, playerId, strat);
}

async function handleAiExpansion(gameId, playerId, homeSector) {
    const colonyShips = await queryDb(
        `SELECT id, sectorid FROM ships${gameId} WHERE owner = ? AND type = ? LIMIT 1`,
        [playerId, COLONY_SHIP_ID]
    );
    if (!colonyShips || colonyShips.length === 0) return;
    const colony = colonyShips[0];
    const current = Number(colony.sectorid);

    const candidates = await queryDb(
        `SELECT sectorid, type FROM map${gameId} WHERE owner IS NULL AND type BETWEEN 6 AND 9`,
        []
    );
    if (!candidates || candidates.length === 0) return;

    const target = candidates.reduce((best, row) => {
        const dist = sectorDistance(gameId, row.sectorid, current);
        if (!best || dist < best.dist) return { sector: Number(row.sectorid), dist };
        return best;
    }, null);
    if (!target) return;

    if (current === target.sector) {
        // Standing on the prize: plant the flag.
        await queryDb(`UPDATE players${gameId} SET currentsector = ? WHERE userid = ?`, [current, playerId]);
        colonizePlanet(connectionStub(playerId, gameId));
        await queryDb(`UPDATE players${gameId} SET currentsector = ? WHERE userid = ?`, [homeSector, playerId]);
        return;
    }

    const step = await nextStepTowards(gameId, current, target.sector, playerId);
    if (!step) return;
    // moveFleet speaks the client wire protocol: sector tokens are hex.
    moveFleet(`//move:${formatSectorToken(current)}:${formatSectorToken(step)}:${COLONY_SHIP_ID}:1`, connectionStub(playerId, gameId));
}

async function handleAiHarass(gameId, playerId, homeSector) {
    const enemySectors = await queryDb(
        `SELECT sectorid, owner FROM map${gameId} WHERE owner IS NOT NULL AND owner != ? LIMIT 50`,
        [playerId]
    );
    if (!enemySectors || enemySectors.length === 0) return;

    const target = enemySectors.reduce((best, row) => {
        const dist = sectorDistance(gameId, row.sectorid, homeSector);
        if (!best || dist < best.dist) return { sector: Number(row.sectorid), dist };
        return best;
    }, null);
    if (!target) return;

    const stacks = await queryDb(
        `SELECT sectorid, type, COUNT(*) as count FROM ships${gameId} WHERE owner = ? GROUP BY sectorid, type`,
        [playerId]
    );
    if (!stacks || stacks.length === 0) return;

    const combatStacks = stacks.filter(row =>
        Number(row.type) !== COLONY_SHIP_ID && Number(row.type) !== SCOUT_SHIP_ID && Number(row.count) >= 2
    );
    if (combatStacks.length === 0) return;

    const bestStack = combatStacks.reduce((best, row) => {
        const dist = sectorDistance(gameId, row.sectorid, target.sector);
        if (!best || dist < best.dist) {
            return { sector: Number(row.sectorid), type: Number(row.type), count: Number(row.count), dist };
        }
        return best;
    }, null);
    if (!bestStack) return;

    const step = await nextStepTowards(gameId, bestStack.sector, target.sector, playerId);
    if (!step) return;
    moveFleet(`//move:${formatSectorToken(bestStack.sector)}:${formatSectorToken(step)}:${bestStack.type}:${bestStack.count}`, connectionStub(playerId, gameId));
}

async function aiResearchAndDefend(gameId, playerId, strategy = 'balanced') {
    const rows = await queryDb(
        `SELECT research, tech, homeworld, metal FROM players${gameId} WHERE userid = ? LIMIT 1`,
        [playerId]
    );
    if (!rows || rows.length === 0) return;
    const player = rows[0];

    const ownedIds = new Set(
        String(player.tech || '')
            .split(',')
            .map(value => Number(value.trim()))
            .filter(Number.isFinite)
    );

    const affordable = Object.values(techSystem.TECHNOLOGIES)
        .filter(tech => {
            if (ownedIds.has(tech.id)) return false;
            const prereqsMet = (tech.prerequisites || []).every(key => {
                const prereq = techSystem.TECHNOLOGIES[key];
                return prereq && ownedIds.has(prereq.id);
            });
            return prereqsMet && Number(player.research) >= (tech.baseCost || 100);
        })
        .sort((a, b) => (a.baseCost || 100) - (b.baseCost || 100) || (a.tier || 0) - (b.tier || 0));

    if (affordable.length > 0) {
        buyTech(`//buytech:${affordable[0].id}`, connectionStub(playerId, gameId));
    }
}

// Export functions for use by index.js
module.exports = {
    setDatabase,
    handleLogin,
    handleRegister,
    handleCreateGame,
    handleGameList,
    handleCurrentGame,
    handleLeaveGame,
    handleAddAi,
    handleChangeRace,
    handleSurrender,
    handleGameStart,
    processTurn,
    colonizePlanet,
    buyTech,
    probeSector,
    buyShip,
    buyBuilding,
    moveFleet,
    updateSector,
    surroundShips,
    preMoveFleet,
    updateResources,
    updateAllSectors,
    handleJoinGame,
    handleGetUnlockedRaces,
    broadcastPlayerList,
    handleCreatePaymentIntent,
    handleCreateSubscription,
    handlePaymentWebhook,
    handleSpendCrystals,
    handleGetBalance,
    handleGetOwnedItems,
    handleGetPurchaseHistory,
    handleGetCurrentGame,
    handleGetCombatTelemetry,
    handlePlayerDisconnect,
    handleStandingOrders,
    handleApplyStandingOrders,
    defaultStandingOrders,
    getStandingOrders,
    setStandingOrders,
    applyStandingOrdersForPlayer,
    triggerAiTurn,
    gameState
};
