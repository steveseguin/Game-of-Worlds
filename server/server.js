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

const VALID_LOBBY_PLAYER_COUNTS = new Set([2, 3, 4, 6, 8]);
const DEFAULT_MAX_PLAYERS = 4;
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

function getAdjacentSectorIds(sectorId, width = 14, height = 8) {
    const id = Number(sectorId);
    if (!Number.isFinite(id) || id < 0 || id >= width * height) {
        return [];
    }

    const x = id % width;
    const y = Math.floor(id / width);
    const adjacent = [];

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            adjacent.push((ny * width) + nx);
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
            owner INT DEFAULT NULL
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
        return;
    }

    const parts = data.split(':');
    const encodedName = parts[1] || '';
    const gameName = safeDecodeURIComponent(encodedName, '').trim();
    const maxPlayers = Math.max(2, Math.min(8, parsePositiveInt(parts[2], 4)));
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
            processTurn(gameId);
            return;
        }

        if (creatorId !== String(connection.name)) {
            connection.sendUTF("Error: Only the game creator can start the game");
            return;
        }

        initializeGame(gameId, connection);
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

async function initializeGame(gameId, connection) {
    try {
        await queryDb('UPDATE games SET started = 1 WHERE id = ?', [gameId]);

        // Initialize turn counter.
        gameState.turns[gameId] = 1;
        gameState.activeGames[gameId] = {
            ...(gameState.activeGames[gameId] || {}),
            status: 'in-progress'
        };

        // Create and persist the game map before players can interact with sectors.
        const mapSize = { width: 14, height: 8 };
        const generatedMap = mapSystem.generateMap(mapSize.width, mapSize.height);
        const map = Array.isArray(generatedMap)
            ? generatedMap
            : (generatedMap && Array.isArray(generatedMap.sectors) ? generatedMap.sectors : []);

        await Promise.all(map.map((sector, index) => {
            const x = index % mapSize.width;
            const y = Math.floor(index / mapSize.width);
            const sectorType = Number(sector && sector.type) || 0;
            return queryDb(
                `INSERT INTO map${gameId} (sectorid, x, y, type) VALUES (?, ?, ?, ?)`,
                [index, x, y, sectorType]
            );
        }));

        // Initialize players in deterministic join order so homeworld assignment is stable.
        const players = await queryDb(
            `SELECT userid FROM players${gameId} ORDER BY joined_at ASC, userid ASC`
        );

        await Promise.all((players || []).map((row, index) => {
            const homeworld = assignHomeworld(index, mapSize);
            return (async () => {
                await queryDb(
                    `UPDATE players${gameId} SET 
                     metal = 100, crystal = 100, research = 50,
                     homeworld = ?, currentsector = ?
                     WHERE userid = ?`,
                    [homeworld, homeworld, row.userid]
                );
                await queryDb(
                    `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`,
                    [row.userid, homeworld]
                );
                // Spawn starter ships so players can take actions immediately.
                await queryDb(
                    `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                    [row.userid, 3, homeworld]
                );
                await queryDb(
                    `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                    [row.userid, 5, homeworld]
                );
            })();
        }));

        // Start turn timer after setup is complete.
        startTurnTimer(gameId);

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
    // Distribute players evenly across the map
    const positions = [
        0, mapSize.width - 1,
        mapSize.width * (mapSize.height - 1), 
        mapSize.width * mapSize.height - 1
    ];
    
    return positions[playerIndex % positions.length];
}

function startTurnTimer(gameId) {
    if (gameState.gameTimer[gameId]) {
        clearInterval(gameState.gameTimer[gameId]);
    }
    gameState.gameTimer[gameId] = setInterval(() => {
        processTurn(gameId);
    }, 180000); // 3 minutes per turn
}

function processTurn(gameId) {
    gameState.turns[gameId]++;
    
    // Process resource generation with race modifiers
    db.query(`SELECT * FROM players${gameId}`, (err, players) => {
        if (err) return;
        
        players.forEach(player => {
            // Get race modifiers
            const race = Object.values(raceSystem.RACE_TYPES).find(r => r.id === player.race_id) || raceSystem.RACE_TYPES.TERRAN;
            
            // Get player's buildings
            db.query(
                `SELECT b.type, COUNT(*) as count FROM buildings${gameId} b
                 JOIN map${gameId} m ON b.sectorid = m.sectorid
                 WHERE m.owner = ? GROUP BY b.type`,
                [player.userid],
                (err, buildings) => {
                    if (err) return;
                    
                    let metalGen = 10; // Base generation
                    let crystalGen = 10;
                    let researchGen = 5;
                    
                    buildings.forEach(building => {
                        switch(building.type) {
                            case 0: metalGen += building.count * 10; break; // Metal Extractor
                            case 1: crystalGen += building.count * 10; break; // Crystal Refinery
                            case 2: researchGen += building.count * 5; break; // Research Academy
                        }
                    });
                    
                    // Apply race modifiers
                    metalGen = Math.floor(metalGen * race.bonuses.metalProduction);
                    crystalGen = Math.floor(crystalGen * race.bonuses.crystalProduction);
                    researchGen = Math.floor(researchGen * race.bonuses.researchSpeed);
                    
                    // Update resources and stats
                    db.query(
                        `UPDATE players${gameId} SET 
                         metal = metal + ?,
                         crystal = crystal + ?,
                         research = research + ?
                         WHERE userid = ?`,
                        [metalGen, crystalGen, researchGen, player.userid]
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
                }
            );
        });
    });
    
    // Process battles
    processBattles(gameId);
    
    // Check victory conditions
    victorySystem.checkAllPlayersForVictory(gameId, gameState, db, (err, winner) => {
        if (!err && winner) {
            // End the game
            victorySystem.endGame(gameId, winner.playerId, winner.condition, gameState, db, (err, result) => {
                if (!err) {
                    broadcastToGame(gameId, `gameover::${winner.playerId}::${winner.condition}`);
                }
            });
        }
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
            ? fullBattleMessage
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
            ? fullBattleMessage
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
                 WHERE owner = ? AND sectorid = ? AND type = 5 LIMIT 1`,
                [playerId, sectorId],
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
                            
                            if (sector[0].type < 1 || sector[0].type > 10) {
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
            
            if (player.research < tech.cost) {
                connection.sendUTF("Error: Not enough research points");
                return;
            }
            
            // Check prerequisites
            if (tech.requires && !playerTech.includes(tech.requires)) {
                connection.sendUTF("Error: Missing prerequisite technology");
                return;
            }
            
            // Buy the tech
            playerTech.push(techId);
            const newTech = playerTech.join(',');
            
            db.query(
                `UPDATE players${gameId} SET research = research - ?, tech = ? WHERE userid = ?`,
                [tech.cost, newTech, playerId],
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
    const targetSector = parseInt(parts[1]);
    const playerId = connection.name;
    const gameId = connection.gameid;
    
    // Check if player has probe technology
    db.query(
        `SELECT tech FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) {
                connection.sendUTF("Error: Could not get player data");
                return;
            }
            
            const playerTech = results[0].tech ? results[0].tech.split(',').map(Number) : [];
            if (!playerTech.includes(15)) { // Probe Scanner tech ID
                connection.sendUTF("Error: Probe Scanner technology required");
                return;
            }
            
            // Get sector information
            db.query(
                `SELECT * FROM map${gameId} WHERE sectorid = ?`,
                [targetSector],
                (err, sector) => {
                    if (err || sector.length === 0) {
                        connection.sendUTF("Error: Invalid sector");
                        return;
                    }
                    
                    // Get ships in sector
                    db.query(
                        `SELECT owner, type, COUNT(*) as count 
                         FROM ships${gameId} 
                         WHERE sectorid = ? 
                         GROUP BY owner, type`,
                        [targetSector],
                        (err, ships) => {
                            if (err) ships = [];
                            
                            const probeData = {
                                sector: sector[0],
                                ships: ships
                            };
                            
                            connection.sendUTF(`probe::${targetSector}::${JSON.stringify(probeData)}`);
                        }
                    );
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
                `SELECT owner FROM map${gameId} WHERE sectorid = ?`,
                [player.currentsector],
                (err, sector) => {
                    if (err || sector.length === 0 || sector[0].owner !== playerId) {
                        connection.sendUTF("Error: You don't own this sector");
                        return;
                    }
                    
                    // Check building limit (max 3 per sector)
                    db.query(
                        `SELECT COUNT(*) as count FROM buildings${gameId} WHERE sectorid = ?`,
                        [player.currentsector],
                        (err, count) => {
                            if (err || count[0].count >= 3) {
                                connection.sendUTF("Error: Building limit reached");
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
    if (!areAdjacentSectors(fromSector, toSector)) {
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
                                            
                                            // If all ships moved, deduct crystal
                                            if (moved === totalShips) {
                                                db.query(
                                                    `UPDATE players${gameId} SET crystal = crystal - ? WHERE userid = ?`,
                                                    [totalShips, playerId]
                                                );
                                                
                                                connection.sendUTF("Success: Fleet moved");
                                                updateResources(connection);
                                                updateSector2(gameId, fromSector);
                                                updateSector2(gameId, toSector);
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

function areAdjacentSectors(sector1, sector2) {
    const mapWidth = 14;
    const x1 = sector1 % mapWidth;
    const y1 = Math.floor(sector1 / mapWidth);
    const x2 = sector2 % mapWidth;
    const y2 = Math.floor(sector2 / mapWidth);
    
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    
    // Check if adjacent (including diagonals)
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
}

function updateSector(data, connection) {
    const parts = data.split(":");
    const sectorId = parseSectorToken(parts[1]);
    const gameId = connection.gameid;

    if (!Number.isFinite(sectorId)) {
        connection.sendUTF("Error: Invalid sector");
        return;
    }

    updateSector2(gameId, sectorId);
    sendMultiMoveOptions(connection, gameId, sectorId);
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
                            
                            // Broadcast to all players in game
                            broadcastToGame(gameId, `sector::${sectorId}::${JSON.stringify(sectorData)}`);
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
    const adjacentIds = getAdjacentSectorIds(targetSector);
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
        if (!areAdjacentSectors(entry.sourceSector, targetSector)) {
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

                                updateResources(connection);
                                updateSector2(gameId, targetSector);
                                touchedSectors.forEach(sectorId => {
                                    if (sectorId !== targetSector) {
                                        updateSector2(gameId, sectorId);
                                    }
                                });

                                connection.sendUTF(`Success: Fleet moved to sector ${formatSectorToken(targetSector)}`);
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

function updateAllSectors(gameId, connection) {
    // Send all sector data to reconnecting player
    db.query(
        `SELECT sectorid FROM map${gameId}`,
        (err, sectors) => {
            if (err) return;
            
            sectors.forEach(sector => {
                updateSector2(gameId, sector.sectorid);
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

                db.query(`SELECT * FROM players${gameId} WHERE userid = ? LIMIT 1`, [playerId], (existingErr, existing) => {
                    if (!existingErr && existing && existing.length > 0) {
                        connection.gameid = gameId;
                        connection.raceid = existing[0].race_id || raceId;
                        sendJoinSuccess(connection, game, connection.raceid, playerCount);
                        broadcastPlayerList(gameId);
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
        if (client.gameid === gameId) {
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

// Export functions for use by index.js
module.exports = {
    setDatabase,
    handleLogin,
    handleRegister,
    handleCreateGame,
    handleGameList,
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
    gameState
};
