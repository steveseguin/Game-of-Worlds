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

function queryAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
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

function normalizeGameMode(mode) {
    const lowered = typeof mode === 'string' ? mode.toLowerCase().trim() : '';
    return lowered === 'epic' ? 'epic' : 'quick';
}

function getTurnInterval(mode) {
    const normalized = normalizeGameMode(mode);
    return TURN_SPEEDS_MS[normalized] || TURN_SPEEDS_MS[DEFAULT_GAME_MODE];
}

function ensureGamesModeColumn(callback = () => {}) {
    if (hasEnsuredGameModeColumn || !db || db.isOffline || db.isMock) {
        callback(null);
        return;
    }
    const ddl = "ALTER TABLE games ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT 'quick'";
    db.query(ddl, err => {
        if (err && !(err.code === 'ER_DUP_FIELDNAME' || /duplicate/i.test(err.message || ''))) {
            console.warn('Could not ensure games.mode column (continuing with default=quick):', err.message || err);
        }
        hasEnsuredGameModeColumn = true;
        callback(null);
    });
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
function handleGameStart(connection) {
    if (!connection.gameid) {
        connection.sendUTF("Error: Not in a game");
        return;
    }

    const gameId = Number(connection.gameid);
    const playerId = Number(connection.name);

    if (!Number.isFinite(gameId) || !Number.isFinite(playerId)) {
        connection.sendUTF("Error: Unable to verify game context");
        return;
    }

    verifyStartConditions(gameId, playerId, err => {
        if (err) {
            if (typeof err === 'string') {
                connection.sendUTF(err);
            } else {
                console.error('Error verifying start conditions:', err);
                connection.sendUTF("Error: Unable to start game");
            }
            return;
        }

        // Prevent multiple countdowns
        const active = ensureActiveGameState(gameId);
        if (active.countdown) {
            connection.sendUTF("Error: Start countdown already running");
            return;
        }

        // In tests/mock DB, start immediately to keep suites fast
        if (db.isMock) {
            initializeGame(gameId, connection);
            return;
        }

        // Lock lobby (no joins/changes), broadcast countdown, then start
        startCountdown(gameId, connection);
    });
}

function verifyStartConditions(gameId, playerId, callback) {
    db.query(
        'SELECT creator, maxplayers, started FROM games WHERE id = ? LIMIT 1',
        [gameId],
        (gameErr, rows) => {
            if (gameErr) {
                callback(gameErr);
                return;
            }

            if (!rows || rows.length === 0) {
                callback("Error: Game not found");
                return;
            }

            const game = rows[0];
            if (game.started) {
                callback("Error: Game has already started");
                return;
            }

            loadWaitingGameRoster(gameId, (rosterErr, roster) => {
                if (rosterErr) {
                    callback(rosterErr);
                    return;
                }

                if (!Array.isArray(roster) || roster.length === 0) {
                    callback("Error: No players remain in this game");
                    return;
                }

                const normalizedPlayerId = Number(playerId);
                if (!Number.isFinite(normalizedPlayerId)) {
                    callback("Error: Unable to verify player identity");
                    return;
                }

                const rosterIds = roster
                    .map(entry => entry.userId)
                    .filter(Number.isFinite);

                if (!rosterIds.includes(normalizedPlayerId)) {
                    callback("Error: You are no longer part of this game's lobby");
                    return;
                }

                const canonicalCreator = roster[0].userId;
                if (!Number.isFinite(canonicalCreator)) {
                    callback("Error: Unable to determine game creator");
                    return;
                }

                if (normalizedPlayerId !== canonicalCreator) {
                    console.warn(`[startgame] Player ${normalizedPlayerId} denied for game ${gameId}. Expected creator ${canonicalCreator}, roster=${rosterIds.join(',')}`);
                    callback("Error: Only the game creator can start the game");
                    return;
                }

                const normalizedCreator = Number(game.creator);
                if (!Number.isFinite(normalizedCreator) || normalizedCreator !== canonicalCreator) {
                    db.query(
                        'UPDATE games SET creator = ? WHERE id = ?',
                        [canonicalCreator, gameId],
                        updateErr => {
                            if (updateErr) {
                                console.error(`Failed to update creator for game ${gameId}:`, updateErr);
                            }
                        }
                    );
                }

                const readinessError = validateRosterReady(roster, game);
                if (readinessError) {
                    callback(readinessError);
                    return;
                }

                callback(null);
            });
        }
    );
}

function loadWaitingGameRoster(gameId, callback) {
    ensurePlayerTableSchema(gameId, schemaErr => {
        if (schemaErr) {
            callback(schemaErr);
            return;
        }

        const tableName = mysql2.escapeId(`players${gameId}`);
        db.query(
            `SELECT userid, race_id, joined_at FROM ${tableName} ORDER BY joined_at ASC, userid ASC`,
            (playerErr, rows) => {
                if (playerErr) {
                    callback(playerErr);
                    return;
                }

                if (!Array.isArray(rows)) {
                    callback(null, []);
                    return;
                }

                const roster = rows
                    .map(row => ({
                        userId: Number(row.userid),
                        raceId: row.race_id === null ? null : Number(row.race_id),
                        joinedAt: row.joined_at || null
                    }))
                    .filter(entry => Number.isFinite(entry.userId));

                callback(null, roster);
            }
        );
    });
}

function validateRosterReady(roster, game) {
    const maxPlayers = Number(game.maxplayers);
    const requiredPlayers = Number.isFinite(maxPlayers) && maxPlayers > 0
        ? Math.min(maxPlayers, MIN_PLAYERS_TO_START)
        : MIN_PLAYERS_TO_START;

    if (roster.length < requiredPlayers) {
        return `Error: At least ${requiredPlayers} players required to start the game`;
    }

    const hasMissingRace = roster.some(player => !Number.isFinite(player.raceId) || player.raceId <= 0);
    if (hasMissingRace) {
        return "Error: All players must select a race before starting";
    }

    return null;
}

function startCountdown(gameId, connection, seconds = 10) {
    const state = ensureActiveGameState(gameId);
    let remaining = seconds;
    const broadcast = () => broadcastToGame(gameId, `countdown::${remaining}`);
    broadcast();
    state.countdown = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(state.countdown);
            state.countdown = null;
            initializeGame(gameId, connection);
        } else {
            broadcast();
        }
    }, 1000);
}

function cancelCountdown(gameId) {
    const state = ensureActiveGameState(gameId);
    if (state.countdown) {
        clearInterval(state.countdown);
        state.countdown = null;
        broadcastToGame(gameId, "countdown::cancel");
    }
}

function initializeGame(gameId, connection) {
    db.query('UPDATE games SET started = 1 WHERE id = ?', [gameId], err => {
        if (err) {
            connection.sendUTF("Error: Failed to start game");
            return;
        }

        getGameModeOrDefault(gameId, (modeErr, mode) => {
            if (modeErr) {
                console.error('Error loading game mode (defaulting to quick):', modeErr);
            }
            const normalizedMode = normalizeGameMode(mode || DEFAULT_GAME_MODE);
            const activeState = ensureActiveGameState(gameId);
            activeState.mode = normalizedMode;
            if (activeState.countdown) {
                clearInterval(activeState.countdown);
                activeState.countdown = null;
            }
            hydrateStandingOrdersDefaults(gameId, normalizedMode);
            gameState.turns[gameId] = 1;

            // Fetch map size from game settings (with defaults)
            db.query('SELECT mapwidth, mapheight FROM games WHERE id = ?', [gameId], (mapErr, mapResults) => {
                const mapSize = {
                    width: mapResults?.[0]?.mapwidth || 14,
                    height: mapResults?.[0]?.mapheight || 8
                };

                db.query(`SELECT userid FROM players${gameId}`, (playerErr, results) => {
                if (playerErr) {
                    console.error("Error getting players:", playerErr);
                    return;
                }

                const playerCount = Array.isArray(results) && results.length > 0 ? results.length : 1;
                const generatedMap = mapSystem.generateMap(mapSize.width, mapSize.height, playerCount);
                const mapSectors = Array.isArray(generatedMap)
                    ? generatedMap
                    : (generatedMap && Array.isArray(generatedMap.sectors) ? generatedMap.sectors : []);
                const homeworlds = generatedMap && Array.isArray(generatedMap.homeworlds)
                    ? generatedMap.homeworlds
                    : [];

                // Insert all map sectors first
                const mapInsertPromises = mapSectors.map((sector, index) => {
                    const x = index % mapSize.width;
                    const y = Math.floor(index / mapSize.width);
                    const sectorType = Number.isFinite(sector?.sectortype) ? sector.sectortype : Number(sector?.type) || 0;

                    return queryAsync(
                        `INSERT INTO map${gameId} (sectorid, x, y, type, sectortype) VALUES (?, ?, ?, ?, ?)`,
                        [index, x, y, sectorType, sectorType]
                    ).catch(insertErr => {
                        console.error("Error inserting map sector:", insertErr);
                    });
                });

                // Wait for all map sectors to be created before assigning ownership
                Promise.all(mapInsertPromises).then(() => {
                    // Now assign homeworlds and ownership
                    const playerUpdatePromises = results.map((row, index) => {
                        const homeworld = Number(homeworlds[index]) || assignHomeworld(index, mapSize);

                        const playerUpdate = queryAsync(
                            `UPDATE players${gameId} SET
                             metal = 100, crystal = 100, research = 50,
                             homeworld = ?, currentsector = ?
                             WHERE userid = ?`,
                            [homeworld, homeworld, row.userid]
                        ).catch(updateErr => {
                            console.error("Error updating player:", updateErr);
                        });

                        const ownershipUpdate = queryAsync(
                            `UPDATE map${gameId} SET owner = ?, ownerid = ? WHERE sectorid = ?`,
                            [row.userid, row.userid, homeworld]
                        ).catch(ownershipErr => {
                            console.error("Error updating map ownership:", ownershipErr);
                        });

                        return Promise.all([playerUpdate, ownershipUpdate]);
                    });

                    // Wait for all player and ownership updates to complete
                    return Promise.all(playerUpdatePromises);
                }).then(() => {
                    // Now safe to start the game
                    startTurnTimer(gameId, normalizedMode);
                    broadcastToGame(gameId, 'startgame::');
                    // Kick off AI loop if AI seats are present
                    hydrateAiPlayers(gameId);
                }).catch(err => {
                    console.error("Error during game initialization:", err);
                });
                });
            });
        });
    });
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

function startTurnTimer(gameId, mode = DEFAULT_GAME_MODE) {
    const interval = getTurnInterval(mode);
    if (gameState.gameTimer[gameId]) {
        clearInterval(gameState.gameTimer[gameId]);
    }
    gameState.gameTimer[gameId] = setInterval(() => {
        processTurn(gameId);
    }, interval);
}

function processTurn(gameId) {
    gameState.turns[gameId]++;
    triggerAiTurn(gameId);
    
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
                    const mode = (gameState.activeGames[gameId]?.mode) || DEFAULT_GAME_MODE;
                    const resourceFactor = mode === 'epic' ? EPIC_RESOURCE_MULTIPLIER : 1;
                    metalGen = Math.floor(metalGen * resourceFactor);
                    crystalGen = Math.floor(crystalGen * resourceFactor);
                    researchGen = Math.floor(researchGen * resourceFactor);

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

                    if (mode === 'epic' && EPIC_AUTO_BUILD_ENABLED) {
                        applyEpicEconomyAssist(gameId, player.userid, player.homeworld);
                    }
                }
            );
        });
    });

    applyStandingOrdersForGame(gameId);
    
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

function buildFleetFromRows(rows, extras = {}) {
    const fleet = { ...extras };
    (rows || []).forEach(row => {
        const type = Number(row.type);
        const count = Number(row.count) || 0;
        if (Number.isFinite(type)) {
            fleet[`ship${type}`] = count;
        }
    });
    return fleet;
}

async function resolveBattle(gameId, sectorId, player1, player2) {
    const owners = [Number(player1), Number(player2)].filter(Number.isFinite);
    if (owners.length < 2) return;
    try {
        const mapRows = await queryAsync(
            `SELECT ownerid, orbitalturret, groundturret FROM map${gameId} WHERE sectorid = ? LIMIT 1`,
            [sectorId]
        );
        const mapOwner = mapRows?.[0]?.ownerid;
        const defenderId = owners.includes(mapOwner) ? mapOwner : owners[0];
        const attackerId = owners.find(id => id !== defenderId) || defenderId;
        const [attackerShips, defenderShips] = await Promise.all([
            getPlayerShips(gameId, sectorId, attackerId),
            getPlayerShips(gameId, sectorId, defenderId)
        ]);

        const attackerFleet = buildFleetFromRows(attackerShips);
        const defenderFleet = buildFleetFromRows(defenderShips, {
            orbitalTurret: mapRows?.[0]?.orbitalturret || 0,
            groundTurret: mapRows?.[0]?.groundturret || 0
        });

        const attackerTech = { weapons: 0, hull: 0, shields: 0 };
        const defenderTech = { weapons: 0, hull: 0, shields: 0 };
        const battleLog = combatSystem.conductBattle(attackerFleet, defenderFleet, attackerTech, defenderTech);
        const winnerId = battleLog.result === "attackerVictory" ? attackerId : defenderId;

        await applyBattleOutcome(gameId, sectorId, {
            attackerId,
            defenderId,
            winnerId,
            battleLog
        });

        const summary = [
            `${battleLog.rounds?.length || 0} combat rounds`,
            battleLog.result === "attackerVictory" ? "Attacker seized control" : "Defender held the line"
        ];

        broadcastToGame(gameId, `battlereport::${JSON.stringify({
            sector: sectorId,
            winner: winnerId,
            attackerId,
            defenderId,
            summary,
            survivors: {
                attacker: battleLog.final?.attackers || {},
                defender: battleLog.final?.defenders || {}
            }
        })}`);
    } catch (err) {
        console.error(`Battle resolution failed for game ${gameId}, sector ${sectorId}:`, err.message || err);
    }
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

function updateShipsAfterBattle(gameId, sectorId, playerId, ships) {
    // Remove all ships first
    db.query(
        `DELETE FROM ships${gameId} WHERE sectorid = ? AND owner = ?`,
        [sectorId, playerId],
        (err) => {
            if (err) return;
            
            // Add surviving ships
            ships.forEach(ship => {
                if (ship.count > 0) {
                    for (let i = 0; i < ship.count; i++) {
                        db.query(
                            `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                            [playerId, ship.type, sectorId]
                        );
                    }
                }
            });
        }
    );
}

async function applyBattleOutcome(gameId, sectorId, context) {
    const { attackerId, defenderId, winnerId, battleLog } = context;
    const shipsTable = mysql2.escapeId(`ships${gameId}`);
    const mapTable = mysql2.escapeId(`map${gameId}`);
    const winnerShips = battleLog.result === "attackerVictory"
        ? (battleLog.final?.attackers || {})
        : (battleLog.final?.defenders || {});

    await queryAsync(
        `DELETE FROM ${shipsTable} WHERE sectorid = ? AND owner IN (?, ?)`,
        [sectorId, attackerId, defenderId]
    );

    for (const key of Object.keys(winnerShips)) {
        const type = Number(key);
        const count = Number(winnerShips[key]) || 0;
        if (!Number.isFinite(type) || count <= 0) continue;
        for (let i = 0; i < count; i++) {
            // eslint-disable-next-line no-await-in-loop
            await queryAsync(
                `INSERT INTO ${shipsTable} (owner, type, sectorid) VALUES (?, ?, ?)`,
                [winnerId, type, sectorId]
            );
        }
    }

    const survivors = [];
    for (let i = 1; i <= 9; i++) {
        survivors.push(Number(winnerShips[i]) || 0);
    }
    const orbitalTurrets = battleLog.result === "defenderVictory"
        ? (battleLog.final?.orbitalTurrets || 0)
        : 0;
    const groundTurrets = battleLog.result === "defenderVictory"
        ? (battleLog.final?.groundTurrets || 0)
        : 0;

    const updateSql = `
        UPDATE ${mapTable}
        SET ownerid = ?, colonized = 1,
            orbitalturret = ?, groundturret = ?,
            ${survivors.map((_, idx) => `totalship${idx + 1} = ?`).join(', ')}
        WHERE sectorid = ?`;
    await queryAsync(updateSql, [
        winnerId,
        orbitalTurrets,
        groundTurrets,
        ...survivors,
        sectorId
    ]);
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
                                `UPDATE map${gameId} SET owner = ?, ownerid = ? WHERE sectorid = ?`,
                                [playerId, playerId, sectorId],
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
    const techCost = Number.isFinite(tech.cost) ? tech.cost : (Number.isFinite(tech.baseCost) ? tech.baseCost : 100);
    
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
            
            if (player.research < techCost) {
                connection.sendUTF("Error: Not enough research points");
                return;
            }
            
            // Check prerequisites
            if (tech.requires && !playerTech.includes(tech.requires)) {
                connection.sendUTF("Error: Missing prerequisite technology");
                return;
            }
            
            // Buy the tech with atomic resource check
            playerTech.push(techId);
            const newTech = playerTech.join(',');

            db.query(
                `UPDATE players${gameId} SET research = research - ?, tech = ?
                 WHERE userid = ? AND research >= ?`,
                [techCost, newTech, playerId, techCost],
                (err, result) => {
                    if (err) {
                        connection.sendUTF("Error: Failed to buy technology");
                        return;
                    }

                    if (result.affectedRows === 0) {
                        connection.sendUTF("Error: Not enough research points");
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
        `SELECT metal, crystal, currentsector, tech FROM players${gameId} WHERE userid = ?`,
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
                    
                    // Buy the ship with atomic resource check and deduction
                    // This prevents race conditions where resources could go negative
                    db.query(
                        `UPDATE players${gameId} SET metal = metal - ?, crystal = crystal - ?
                         WHERE userid = ? AND metal >= ? AND crystal >= ?`,
                        [modifiedShip.cost.metal, modifiedShip.cost.crystal, playerId,
                         modifiedShip.cost.metal, modifiedShip.cost.crystal],
                        (err, result) => {
                            if (err) {
                                connection.sendUTF("Error: Failed to deduct resources");
                                return;
                            }

                            // Check if update succeeded (resources were sufficient)
                            if (result.affectedRows === 0) {
                                connection.sendUTF("Error: Not enough resources");
                                return;
                            }

                            // Create the ship
                            db.query(
                                `INSERT INTO ships${gameId} (owner, type, sectorid) VALUES (?, ?, ?)`,
                                [playerId, shipType, player.currentsector],
                                (err) => {
                                    if (err) {
                                        // Rollback the resource deduction on failure
                                        db.query(
                                            `UPDATE players${gameId} SET metal = metal + ?, crystal = crystal + ? WHERE userid = ?`,
                                            [modifiedShip.cost.metal, modifiedShip.cost.crystal, playerId]
                                        );
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
    
    const building = BUILDING_COSTS[buildingType];
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
                            
                            // Buy the building with atomic resource check
                            db.query(
                                `UPDATE players${gameId} SET metal = metal - ?, crystal = crystal - ?
                                 WHERE userid = ? AND metal >= ? AND crystal >= ?`,
                                [building.metal, building.crystal, playerId, building.metal, building.crystal],
                                (err, result) => {
                                    if (err) {
                                        connection.sendUTF("Error: Failed to deduct resources");
                                        return;
                                    }

                                    if (result.affectedRows === 0) {
                                        connection.sendUTF("Error: Not enough resources");
                                        return;
                                    }

                                    // Create the building
                                    db.query(
                                        `INSERT INTO buildings${gameId} (sectorid, type, owner) VALUES (?, ?, ?)`,
                                        [player.currentsector, buildingType, playerId],
                                        (err) => {
                                            if (err) {
                                                // Rollback resource deduction
                                                db.query(
                                                    `UPDATE players${gameId} SET metal = metal + ?, crystal = crystal + ? WHERE userid = ?`,
                                                    [building.metal, building.crystal, playerId]
                                                );
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
    const fromSector = parseInt(parts[1]);
    const toSector = parseInt(parts[2]);
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
                                const shipIds = ships.map(s => s.id);
                                const placeholders = shipIds.map(() => '?').join(',');
                                db.query(
                                    `UPDATE ships${gameId} SET sectorid = ? WHERE id IN (${placeholders})`,
                                    [toSector, ...shipIds],
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

function areAdjacentSectors(sector1, sector2, mapWidth = 14) {
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
    const sectorId = parseInt(parts[1]);
    const gameId = connection.gameid;
    
    updateSector2(gameId, sectorId);
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

function preMoveFleet(data, connection) {
    // This appears to be for validating fleet movements
    const parts = data.split(":");
    const fromSector = parseInt(parts[1]);
    const toSector = parseInt(parts[2]);
    
    if (areAdjacentSectors(fromSector, toSector)) {
        connection.sendUTF(`premove::valid::${fromSector}::${toSector}`);
    } else {
        connection.sendUTF(`premove::invalid::${fromSector}::${toSector}`);
    }
}

function updateResources(connection) {
    const playerId = connection.name;
    const gameId = connection.gameid;

    console.log(`[updateResources] playerId=${playerId}, gameId=${gameId}`);

    if (!gameId) {
        console.log(`[updateResources] No gameId set for player ${playerId}`);
        return;
    }

    db.query(
        `SELECT metal, crystal, research, homeworld FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err) {
                console.error(`[updateResources] DB error:`, err);
                return;
            }
            if (!results || results.length === 0) {
                console.log(`[updateResources] No results for player ${playerId} in game ${gameId}`);
                return;
            }

            const resources = results[0];
            console.log(`[updateResources] Sending resources to player ${playerId}: metal=${resources.metal}, crystal=${resources.crystal}`);
            connection.sendUTF(`resources::${resources.metal}::${resources.crystal}::${resources.research}`);

            // Also send full map state to this player
            sendMapStateToPlayer(gameId, playerId, results[0].homeworld, connection);

            // Send tech levels
            sendTechLevelsToPlayer(gameId, playerId, connection);
        }
    );
}

function sendMapStateToPlayer(gameId, playerId, homeworld, connection) {
    console.log(`[sendMapStateToPlayer] gameId=${gameId}, playerId=${playerId}, homeworld=${homeworld}`);
    // Get all sectors with their ownership and type
    db.query(
        `SELECT sectorid, owner, ownerid, type, sectortype FROM map${gameId} ORDER BY sectorid`,
        (err, sectors) => {
            if (err) {
                console.error(`[sendMapStateToPlayer] Map query error:`, err);
                return;
            }
            console.log(`[sendMapStateToPlayer] Found ${sectors?.length || 0} sectors`);

            // Get ships per sector
            db.query(
                `SELECT sectorid, owner, COUNT(*) as count FROM ships${gameId} GROUP BY sectorid, owner`,
                (shipErr, ships) => {
                    const shipsBySector = {};
                    if (!shipErr && ships) {
                        ships.forEach(s => {
                            if (!shipsBySector[s.sectorid]) shipsBySector[s.sectorid] = {};
                            shipsBySector[s.sectorid][s.owner] = s.count;
                        });
                    }

                    // Build compact map state: sectorId:status:fleetSize
                    const mapData = sectors.map(sector => {
                        let status = 'neutral';
                        const sectorType = sector.sectortype || sector.type || 0;

                        // Check ownership FIRST, then sector type for unowned sectors
                        if (sector.ownerid == playerId) {
                            if (sector.sectorid == homeworld) {
                                status = 'homeworld';
                            } else {
                                status = 'owned';
                            }
                        } else if (sector.ownerid && sector.ownerid != playerId) {
                            status = 'enemy';
                        } else {
                            // Only check sector type for unowned sectors
                            if (sectorType === 0 || sectorType === 10) {
                                status = 'blackhole';
                            } else if (sectorType === 1 || sectorType === 3) {
                                status = 'hazard';
                            }
                        }

                        // Get fleet size for this player in this sector
                        const fleetSize = shipsBySector[sector.sectorid]?.[playerId] || 0;

                        return `${sector.sectorid}:${status}:${fleetSize}`;
                    });

                    connection.sendUTF(`mapstate::${mapData.join(',')}`);
                }
            );
        }
    );
}

function sendTechLevelsToPlayer(gameId, playerId, connection) {
    db.query(
        `SELECT weapons, hulls, shields, engines FROM players${gameId} WHERE userid = ?`,
        [playerId],
        (err, results) => {
            if (err || results.length === 0) return;

            const tech = results[0];
            connection.sendUTF(`tech:${tech.weapons || 0}:${tech.hulls || 0}:${tech.shields || 0}:${tech.engines || 0}`);
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
    if (!db || db.isOffline) {
        connection.sendUTF("joingame::error::Service unavailable");
        return;
    }

    const parts = data.split(":");
    const gameId = parseInt(parts[1], 10);
    const raceId = parseInt(parts[2], 10) || DEFAULT_CREATOR_RACE_ID;
    const playerId = parseInt(connection.name, 10);

    if (!Number.isInteger(gameId)) {
        connection.sendUTF("joingame::error::Invalid game selection");
        return;
    }

    if (!Number.isInteger(playerId)) {
        connection.sendUTF("joingame::error::Authentication required");
        return;
    }

    db.query(
        'SELECT id, name, maxplayers, started, creator FROM games WHERE id = ? AND started = 0',
        [gameId],
        (gameErr, games) => {
            if (gameErr || !games || games.length === 0) {
                connection.sendUTF("joingame::error::Game not found or already started");
                return;
            }

            const game = games[0];
            const safeName = sanitizeGameName(game.name || '');
            const active = ensureActiveGameState(gameId);
            if (active.countdown) {
                connection.sendUTF("joingame::error::Game is preparing to start; cannot join now");
                return;
            }

            db.query(
                `SELECT * FROM players${gameId} WHERE userid = ? LIMIT 1`,
                [playerId],
                (playerErr, existingRows) => {
                    if (playerErr) {
                        console.error('Error checking existing player:', playerErr);
                        connection.sendUTF("joingame::error::Unable to verify player state");
                        return;
                    }

                    const isExisting = Array.isArray(existingRows) && existingRows.length > 0;

                    db.query(
                        `SELECT COUNT(*) AS count FROM players${gameId}`,
                        (countErr, counts) => {
                            if (countErr) {
                                console.error('Error counting players:', countErr);
                                connection.sendUTF("joingame::error::Unable to verify game capacity");
                                return;
                            }

                            const playerCount = counts && counts[0] ? counts[0].count : 0;

                            if (!isExisting && game.maxplayers && playerCount >= game.maxplayers) {
                                connection.sendUTF("joingame::error::Game is full");
                                return;
                            }

                            getUserStats(playerId, (statsErr, userStats) => {
                                if (statsErr) {
                                    connection.sendUTF("joingame::error::Failed to get user stats");
                                    return;
                                }

                                raceSystem.isRaceUnlocked(playerId, raceId, userStats, db, unlocked => {
                                    if (!unlocked) {
                                        connection.sendUTF("joingame::error::Race not unlocked");
                                        return;
                                    }

                                    const finalizeJoin = () => {
                                        connection.gameid = gameId;
                                        connection.raceid = raceId;
                                        getGameModeOrDefault(gameId, (modeErr, mode) => {
                                            if (modeErr) {
                                                console.error('Error fetching game mode:', modeErr);
                                            }
                                            sendJoinSuccess(connection, {
                                                gameId,
                                                gameName: safeName,
                                                maxPlayers: game.maxplayers || 0,
                                                playerCount: isExisting ? playerCount : playerCount + 1,
                                                creatorId: game.creator,
                                                raceId: raceId,
                                                mode
                                            });
                                            broadcastPlayerList(gameId);
                                            sendGameList();
                                        });
                                    };

                                    if (isExisting) {
                                        updatePlayerRaceForGame(gameId, playerId, raceId, updateErr => {
                                            if (updateErr) {
                                                console.error('Error updating race selection:', updateErr);
                                                connection.sendUTF("joingame::error::Failed to update race selection");
                                                return;
                                            }
                                            finalizeJoin();
                                        });
                                        return;
                                    }

                                    createPlayerEntryForGame(gameId, playerId, raceId, insertErr => {
                                        if (insertErr) {
                                            console.error('Error adding player to game:', insertErr);
                                            connection.sendUTF("joingame::error::Failed to join game");
                                            return;
                                        }
                                        finalizeJoin();
                                    });
                                });
                            });
                        }
                    );
                }
            );
        }
    );
}

function sendJoinSuccess(connection, details) {
    const payload = {
        gameId: Number(details.gameId) || 0,
        gameName: sanitizeGameName(details.gameName || ''),
        maxPlayers: Number(details.maxPlayers) || 0,
        playerCount: Number(details.playerCount) || 0,
        creatorId: String(details.creatorId ?? ''),
        raceId: Number(details.raceId ?? connection.raceid ?? DEFAULT_CREATOR_RACE_ID) || DEFAULT_CREATOR_RACE_ID,
        raceName: getRaceById(Number(details.raceId ?? connection.raceid ?? DEFAULT_CREATOR_RACE_ID))?.name || getRaceById(DEFAULT_CREATOR_RACE_ID)?.name || 'Unknown',
        mode: normalizeGameMode(details.mode || DEFAULT_GAME_MODE)
    };
    connection.sendUTF(`joingame::success::${JSON.stringify(payload)}`);
    connection.sendUTF("Success: Joined game");
}

function handleCreateGame(data, connection) {
    if (!db || db.isOffline) {
        connection.sendUTF("creategame::error::Service unavailable");
        return;
    }

    const creatorId = parseInt(connection.name, 10);
    if (!Number.isInteger(creatorId)) {
        connection.sendUTF("creategame::error::Authentication required");
        return;
    }

    const parts = data.split(":");
    const rawName = decodeCommandValue(parts[1] || "");
    const gameName = sanitizeGameName(rawName);
    if (!gameName) {
        connection.sendUTF("creategame::error::Please provide a valid game name");
        return;
    }

    const requestedMax = parseInt(parts[2], 10);
    const maxPlayers = VALID_LOBBY_PLAYER_COUNTS.has(requestedMax) ? requestedMax : DEFAULT_MAX_PLAYERS;
    const requestedMode = normalizeGameMode(parts[3] || DEFAULT_GAME_MODE);

    db.query('SELECT currentgame FROM users WHERE id = ? LIMIT 1', [creatorId], (userErr, users) => {
        if (userErr) {
            console.error('Error checking user state before creating game:', userErr);
            connection.sendUTF("creategame::error::Unable to verify account");
            return;
        }

        if (!users || users.length === 0) {
            connection.sendUTF("creategame::error::User account not found");
            return;
        }

        if (users[0].currentgame) {
            const gameId = users[0].currentgame;
            // Check if the game actually exists and is active - it may be stale or completed
            db.query('SELECT id, status, started FROM games WHERE id = ?', [gameId], (gameCheckErr, gameRows) => {
                if (gameCheckErr || !gameRows || gameRows.length === 0) {
                    // Game doesn't exist, clear the stale reference
                    db.query('UPDATE users SET currentgame = NULL WHERE id = ?', [creatorId], (clearErr) => {
                        if (clearErr) {
                            console.error('Error clearing stale currentgame:', clearErr);
                        }
                        proceedWithGameCreation();
                    });
                    return;
                }

                const game = gameRows[0];

                // If game is completed, clear the reference and allow creation
                if (game.status === 'completed') {
                    db.query('UPDATE users SET currentgame = NULL WHERE id = ?', [creatorId], (clearErr) => {
                        if (clearErr) {
                            console.error('Error clearing completed game reference:', clearErr);
                        }
                        proceedWithGameCreation();
                    });
                    return;
                }

                // Check if user is actually in this game's player table
                const playerTable = mysql2.escapeId(`players${gameId}`);
                db.query(`SELECT userid FROM ${playerTable} WHERE userid = ? LIMIT 1`, [creatorId], (playerErr, playerRows) => {
                    if (playerErr || !playerRows || playerRows.length === 0) {
                        // User not in player table, clear stale reference
                        db.query('UPDATE users SET currentgame = NULL WHERE id = ?', [creatorId], (clearErr) => {
                            if (clearErr) {
                                console.error('Error clearing orphaned currentgame:', clearErr);
                            }
                            proceedWithGameCreation();
                        });
                        return;
                    }
                    // User is actually in an active game, block creation
                    connection.sendUTF("creategame::error::Leave your current game before creating a new one");
                });
            });
            return;
        }

        proceedWithGameCreation();
    });

    function proceedWithGameCreation() {

        ensureGamesModeColumn(() => {
            const insertWithMode = 'INSERT INTO games (name, creator, maxplayers, status, mode) VALUES (?, ?, ?, ?, ?)';
            db.query(
                insertWithMode,
                [gameName, creatorId, maxPlayers, 'waiting', requestedMode],
                (insertErr, result) => {
                    if (insertErr && insertErr.code === 'ER_BAD_FIELD_ERROR') {
                        // Fallback for legacy schema
                        db.query(
                            'INSERT INTO games (name, creator, maxplayers, status) VALUES (?, ?, ?, ?)',
                            [gameName, creatorId, maxPlayers, 'waiting'],
                            (legacyErr, legacyResult) => {
                                handlePostCreate(legacyErr, legacyResult, 'quick');
                            }
                        );
                        return;
                    }
                    handlePostCreate(insertErr, result, requestedMode);
                }
            );
        });

        function handlePostCreate(insertErr, result, modeUsed) {
            if (insertErr) {
                console.error('Error creating game:', insertErr);
                connection.sendUTF("creategame::error::Failed to create game");
                return;
            }

            const gameId = result.insertId;
            createGameTables(gameId, tableErr => {
                if (tableErr) {
                    console.error(`Error preparing tables for game ${gameId}:`, tableErr);
                    db.query('DELETE FROM games WHERE id = ?', [gameId]);
                    sendGameList();
                    connection.sendUTF("creategame::error::Failed to prepare game resources");
                    return;
                }

                createPlayerEntryForGame(gameId, creatorId, DEFAULT_CREATOR_RACE_ID, joinErr => {
                    if (joinErr) {
                        console.error(`Error auto-joining creator for game ${gameId}:`, joinErr);
                        cleanupGame(gameId, cleanupErr => {
                            if (cleanupErr) {
                                console.error(`Error cleaning up game ${gameId} after failed join:`, cleanupErr);
                            }
                            sendGameList();
                        });
                        connection.sendUTF("creategame::error::Failed to join new game");
                        return;
                    }

                    connection.gameid = gameId;
                    connection.raceid = DEFAULT_CREATOR_RACE_ID;
                    connection.sendUTF(`creategame::success::${gameId}`);
                    sendJoinSuccess(connection, {
                        gameId,
                        gameName,
                        maxPlayers,
                        playerCount: 1,
                        creatorId: creatorId,
                        mode: modeUsed
                    });
                    broadcastPlayerList(gameId);
                    sendGameList();
                });
            });
        }
    }
}

function handleGameList(connection) {
    sendGameList(connection);
}

function handleLeaveGame(connection) {
    if (!db || db.isOffline) {
        connection.sendUTF("Error: Service unavailable");
        return;
    }

    const playerId = parseInt(connection.name, 10);
    const gameId = parseInt(connection.gameid, 10);

    if (!Number.isInteger(playerId) || !Number.isInteger(gameId)) {
        connection.sendUTF("Error: You are not currently in a lobby game");
        return;
    }

    db.query(
        'SELECT id, creator, started FROM games WHERE id = ? LIMIT 1',
        [gameId],
        (gameErr, games) => {
            if (gameErr || !games || games.length === 0) {
                connection.sendUTF("Error: Game not found");
                connection.gameid = null;
                connection.raceid = null;
                return;
            }

            const game = games[0];

            if (game.started) {
                // Allow forfeiting a started game
                db.query(
                    'UPDATE users SET currentgame = NULL WHERE id = ?',
                    [playerId],
                    (updateErr) => {
                        if (updateErr) {
                            console.error('Error clearing player game:', updateErr);
                            connection.sendUTF("Error: Failed to leave game");
                            return;
                        }

                        connection.gameid = null;
                        connection.raceid = null;
                        connection.sendUTF("lobby::");
                        connection.sendUTF("You have forfeited the game.");
                        handleGameList(connection);

                        // Check if game should end (only 1 player remaining)
                        victorySystem.checkVictoryConditions(db, game.id);
                    }
                );
                return;
            }

            removePlayerFromWaitingGame(game, playerId, (removeErr, result) => {
                if (removeErr) {
                    console.error('Error removing player from game:', removeErr);
                    connection.sendUTF("Error: Failed to leave game");
                    return;
                }

                connection.gameid = null;
                connection.raceid = null;
                connection.sendUTF("lobby::");
                handleGameList(connection);
                broadcastPlayerList(game.id);
                sendGameList();
                cancelCountdown(game.id);

                if (result && result.newCreator) {
                    console.log(`Player ${playerId} left game ${game.id}. Reassigned creator to player ${result.newCreator}.`);
                } else if (result && result.clearedGame) {
                    console.log(`Game ${game.id} closed because all players left.`);
                }
            });
        }
    );
}

function handlePlayerDisconnect(connection) {
    if (!db || db.isOffline) {
        return;
    }

    const playerId = parseInt(connection.name, 10);
    const gameId = parseInt(connection.gameid, 10);

    if (!Number.isInteger(playerId) || !Number.isInteger(gameId)) {
        return;
    }

    db.query(
        'SELECT id, creator, started FROM games WHERE id = ? LIMIT 1',
        [gameId],
        (gameErr, games) => {
            if (gameErr || !games || games.length === 0) {
                return;
            }

            const game = games[0];

            if (game.started) {
                return;
            }

            removePlayerFromWaitingGame(game, playerId, (removeErr, result) => {
                if (removeErr) {
                    console.error('Error cleaning up player after disconnect:', removeErr);
                    return;
                }

                sendGameList();
                broadcastPlayerList(game.id);
                cancelCountdown(game.id);

                if (result && result.newCreator) {
                    console.log(`Player ${playerId} disconnected from game ${game.id}. Reassigned creator to player ${result.newCreator}.`);
                } else if (result && result.clearedGame) {
                    console.log(`Game ${game.id} closed because all players disconnected.`);
                }
            });
        }
    );
}

function loadGamesWithMode(callback) {
    ensureGamesModeColumn(() => {
        const withModeSql = `SELECT id, name, maxplayers, started, status, mode 
            FROM games 
            WHERE started = 0 
            ORDER BY created DESC 
            LIMIT ?`;
        db.query(withModeSql, [GAME_LIST_LIMIT], (err, rows) => {
            if (err && err.code === 'ER_BAD_FIELD_ERROR') {
                db.query(
                    `SELECT id, name, maxplayers, started, status 
                     FROM games 
                     WHERE started = 0 
                     ORDER BY created DESC 
                     LIMIT ?`,
                    [GAME_LIST_LIMIT],
                    (fallbackErr, fallbackRows) => {
                        const normalized = (fallbackRows || []).map(r => ({
                            ...r,
                            mode: DEFAULT_GAME_MODE
                        }));
                        callback(fallbackErr, normalized);
                    }
                );
                return;
            }
            const normalized = (rows || []).map(r => ({
                ...r,
                mode: normalizeGameMode(r.mode || DEFAULT_GAME_MODE)
            }));
            callback(err, normalized);
        });
    });
}

function getGameModeOrDefault(gameId, callback) {
    if (!db || db.isOffline || db.isMock) {
        callback(null, DEFAULT_GAME_MODE);
        return;
    }
    ensureGamesModeColumn(() => {
        db.query('SELECT mode FROM games WHERE id = ? LIMIT 1', [gameId], (err, rows) => {
            if (err) {
                if (err.code === 'ER_BAD_FIELD_ERROR') {
                    callback(null, DEFAULT_GAME_MODE);
                    return;
                }
                callback(err);
                return;
            }
            const mode = normalizeGameMode(rows && rows[0] ? rows[0].mode : DEFAULT_GAME_MODE);
            callback(null, mode);
        });
    });
}

function sendGameList(targetConnection = null) {
    if (!db || db.isOffline) {
        if (targetConnection) {
            targetConnection.sendUTF("gamelist::");
        }
        return;
    }

    loadGamesWithMode((gameErr, games) => {
        if (gameErr) {
            console.error('Error loading game list:', gameErr);
            if (targetConnection) {
                targetConnection.sendUTF("gamelist::");
            }
            return;
        }

        if (!games || games.length === 0) {
            const emptyMessage = "gamelist::";
            if (targetConnection) {
                targetConnection.sendUTF(emptyMessage);
            } else {
                gameState.clients.forEach(client => {
                    if (client && client.connected !== false) {
                        client.sendUTF(emptyMessage);
                    }
                });
            }
            return;
        }

        db.query(
            `SELECT currentgame AS gameId, COUNT(*) AS count 
             FROM users 
             WHERE currentgame IS NOT NULL 
             GROUP BY currentgame`,
            (countErr, counts) => {
                const countMap = {};
                if (!countErr && Array.isArray(counts)) {
                    counts.forEach(row => {
                        countMap[row.gameId] = row.count;
                    });
                }

                const payload = games.map(game => {
                    const safeName = encodeURIComponent(game.name || `Game ${game.id}`);
                    const playerCount = countMap[game.id] || 0;
                    const status = (game.status || (game.started ? 'in-progress' : 'waiting')).toLowerCase();
                    const maxPlayers = game.maxplayers || DEFAULT_MAX_PLAYERS;
                    const mode = normalizeGameMode(game.mode || DEFAULT_GAME_MODE);
                    return `${game.id},${safeName},${playerCount},${maxPlayers},${status},${mode}`;
                }).join("|");

                const message = `gamelist::${payload}`;

                if (targetConnection) {
                    targetConnection.sendUTF(message);
                } else {
                    gameState.clients.forEach(client => {
                        if (client && client.connected !== false) {
                            client.sendUTF(message);
                        }
                    });
                }
            }
        );
    });
}

function handleAddAi(data, connection) {
    if (!db || db.isOffline) {
        connection.sendUTF("addai::error::Service unavailable");
        return;
    }
    const playerId = Number(connection.name);
    const gameId = Number(connection.gameid);
    if (!Number.isFinite(playerId) || !Number.isFinite(gameId)) {
        connection.sendUTF("addai::error::Join a game before adding AI");
        return;
    }
    const active = ensureActiveGameState(gameId);
    if (active.countdown) {
        connection.sendUTF("addai::error::Cannot add AI during start countdown");
        return;
    }

    const parts = data ? data.split(':').slice(1) : [];
    const difficulty = typeof parts[0] === 'string' && parts[0].trim() ? parts[0].trim().toLowerCase() : 'medium';
    const strategy = typeof parts[1] === 'string' && parts[1].trim() ? parts[1].trim().toLowerCase() : 'balanced';

    db.query('SELECT creator, maxplayers, started FROM games WHERE id = ? LIMIT 1', [gameId], (gameErr, games) => {
        if (gameErr || !games || games.length === 0) {
            connection.sendUTF("addai::error::Game not found");
            return;
        }
        const game = games[0];
        if (game.started) {
            connection.sendUTF("addai::error::Cannot add AI after the game has started");
            return;
        }
        if (Number(game.creator) !== playerId) {
            connection.sendUTF("addai::error::Only the game creator can add AI opponents");
            return;
        }

        ensurePlayerTableSchema(gameId, schemaErr => {
            if (schemaErr) {
                connection.sendUTF("addai::error::Unable to prepare game for AI");
                return;
            }

            const tableName = mysql2.escapeId(`players${gameId}`);
            db.query(`SELECT COUNT(*) AS count FROM ${tableName}`, (countErr, counts) => {
                if (countErr) {
                    connection.sendUTF("addai::error::Unable to check seats");
                    return;
                }
                const currentCount = counts && counts[0] ? Number(counts[0].count) : 0;
                if (game.maxplayers && currentCount >= game.maxplayers) {
                    connection.sendUTF("addai::error::Game is already full");
                    return;
                }

                createAiUser(gameId, (aiErr, aiUser) => {
                    if (aiErr || !aiUser) {
                        console.error('Failed to create AI user:', aiErr);
                        connection.sendUTF("addai::error::Unable to add AI");
                        return;
                    }

                    const raceId = DEFAULT_CREATOR_RACE_ID;
                    const resources = computeStartingResources(getRaceById(raceId));

                    db.query(
                        `INSERT INTO ${tableName} (userid, race_id, metal, crystal, research, is_ai, ai_difficulty, ai_strategy) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
                        [aiUser.id, raceId, resources.metal, resources.crystal, resources.research, difficulty, strategy],
                        insertErr => {
                            if (insertErr) {
                                console.error('Failed to add AI to players table:', insertErr);
                                connection.sendUTF("addai::error::Unable to seat AI");
                                return;
                            }
                            db.query('UPDATE users SET currentgame = ? WHERE id = ?', [gameId, aiUser.id], () => {});
                            trackAiProfile(gameId, aiUser.id, difficulty, strategy);
                            broadcastPlayerList(gameId);
                            sendGameList();
                            connection.sendUTF(`addai::success::${aiUser.username}`);
                        }
                    );
                });
            });
        });
    });
}

function createGameTables(gameId, callback) {
    const statements = [
        `CREATE TABLE IF NOT EXISTS map${gameId} (
            sectorid INT PRIMARY KEY,
            x INT NOT NULL,
            y INT NOT NULL,
            sectortype INT DEFAULT 0,
            type INT DEFAULT 0,
            ownerid INT DEFAULT NULL,
            owner INT DEFAULT NULL,
            colonized TINYINT DEFAULT 0,
            artifact INT DEFAULT 0,
            metalbonus INT DEFAULT 100,
            crystalbonus INT DEFAULT 100,
            orbitalturret INT DEFAULT 0,
            groundturret INT DEFAULT 0,
            warpgate INT DEFAULT 0,
            academylvl INT DEFAULT 0,
            shipyardlvl INT DEFAULT 0,
            metallvl INT DEFAULT 0,
            crystallvl INT DEFAULT 0,
            terraformlvl INT DEFAULT 0,
            totalship1 INT DEFAULT 0,
            totalship2 INT DEFAULT 0,
            totalship3 INT DEFAULT 0,
            totalship4 INT DEFAULT 0,
            totalship5 INT DEFAULT 0,
            totalship6 INT DEFAULT 0,
            totalship7 INT DEFAULT 0,
            totalship8 INT DEFAULT 0,
            totalship9 INT DEFAULT 0,
            totship1build INT DEFAULT 0,
            totship2build INT DEFAULT 0,
            totship3build INT DEFAULT 0,
            totship4build INT DEFAULT 0,
            totship5build INT DEFAULT 0,
            totship6build INT DEFAULT 0,
            totship7build INT DEFAULT 0,
            totship8build INT DEFAULT 0,
            totship9build INT DEFAULT 0,
            totship1coming INT DEFAULT 0,
            totship2coming INT DEFAULT 0,
            totship3coming INT DEFAULT 0,
            totship4coming INT DEFAULT 0,
            totship5coming INT DEFAULT 0,
            totship6coming INT DEFAULT 0,
            totship7coming INT DEFAULT 0,
            totship8coming INT DEFAULT 0,
            totship9coming INT DEFAULT 0,
            FOREIGN KEY (ownerid) REFERENCES users(id)
        )`,
        `CREATE TABLE IF NOT EXISTS players${gameId} (
            userid INT PRIMARY KEY,
            race_id INT DEFAULT 1,
            alliance_id INT DEFAULT NULL,
            metal INT DEFAULT 100,
            crystal INT DEFAULT 100,
            research INT DEFAULT 50,
            tech VARCHAR(255) DEFAULT '',
            homeworld INT DEFAULT NULL,
            currentsector INT DEFAULT NULL,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userid) REFERENCES users(id)
        )`,
        `CREATE TABLE IF NOT EXISTS ships${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner INT NOT NULL,
            type INT NOT NULL,
            sectorid INT NOT NULL,
            FOREIGN KEY (owner) REFERENCES users(id)
        )`,
        `CREATE TABLE IF NOT EXISTS buildings${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sectorid INT NOT NULL,
            type INT NOT NULL,
            owner INT NOT NULL,
            FOREIGN KEY (owner) REFERENCES users(id)
        )`,
        `CREATE TABLE IF NOT EXISTS diplomacy${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            player1_id INT NOT NULL,
            player2_id INT NOT NULL,
            status VARCHAR(32) DEFAULT 'neutral',
            created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (player1_id) REFERENCES users(id),
            FOREIGN KEY (player2_id) REFERENCES users(id),
            UNIQUE KEY unique_relationship (player1_id, player2_id)
        )`,
        `CREATE TABLE IF NOT EXISTS wonders${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            wonder_type VARCHAR(64) NOT NULL,
            level INT DEFAULT 1,
            sector_id INT NOT NULL,
            completed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )`,
        `CREATE TABLE IF NOT EXISTS game_snapshots${gameId} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            turn INT NOT NULL,
            snapshot_data JSON,
            created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_turn (turn)
        )`
    ];

    runSequentialQueries(statements, callback);
}

function runSequentialQueries(statements, callback, index = 0) {
    if (index >= statements.length) {
        callback(null);
        return;
    }

    db.query(statements[index], err => {
        if (err) {
            callback(err);
            return;
        }
        runSequentialQueries(statements, callback, index + 1);
    });
}

function ensurePlayerTableSchema(gameId, callback) {
    const tableName = mysql2.escapeId(`players${gameId}`);
    db.query(`SHOW COLUMNS FROM ${tableName} LIKE 'joined_at'`, (err, results) => {
        if (err) {
            callback(err);
            return;
        }
        const ensureJoinedAt = cb => {
            if (results && results.length > 0) {
                cb(null);
                return;
            }
            db.query(
                `ALTER TABLE ${tableName} ADD COLUMN joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
                cb
            );
        };

        ensureJoinedAt(joinedErr => {
            if (joinedErr) {
                callback(joinedErr);
                return;
            }
            db.query(`SHOW COLUMNS FROM ${tableName} LIKE 'is_ai'`, (aiErr, aiCols) => {
                if (aiErr) {
                    callback(aiErr);
                    return;
                }
                const ensureIsAi = cb => {
                    if (aiCols && aiCols.length > 0) {
                        cb(null);
                        return;
                    }
                    db.query(
                        `ALTER TABLE ${tableName} ADD COLUMN is_ai TINYINT(1) DEFAULT 0`,
                        cb
                    );
                };

                ensureIsAi(isAiErr => {
                    if (isAiErr) {
                        callback(isAiErr);
                        return;
                    }
                    db.query(`SHOW COLUMNS FROM ${tableName} LIKE 'ai_difficulty'`, (diffErr, diffCols) => {
                        if (diffErr) {
                            callback(diffErr);
                            return;
                        }
                        const ensureDifficulty = cb => {
                            if (diffCols && diffCols.length > 0) {
                                cb(null);
                                return;
                            }
                            db.query(
                                `ALTER TABLE ${tableName} ADD COLUMN ai_difficulty VARCHAR(16) DEFAULT 'medium'`,
                                cb
                            );
                        };

                        ensureDifficulty(diffAddErr => {
                            if (diffAddErr) {
                                callback(diffAddErr);
                                return;
                            }
                            db.query(`SHOW COLUMNS FROM ${tableName} LIKE 'ai_strategy'`, (stratErr, stratCols) => {
                                if (stratErr) {
                                    callback(stratErr);
                                    return;
                                }
                                if (stratCols && stratCols.length > 0) {
                                    callback(null);
                                    return;
                                }
                                db.query(
                                    `ALTER TABLE ${tableName} ADD COLUMN ai_strategy VARCHAR(16) DEFAULT 'balanced'`,
                                    callback
                                );
                            });
                        });
                    });
                });
            });
        });
    });
}

function getRaceById(raceId) {
    return Object.values(raceSystem.RACE_TYPES).find(race => race.id === raceId) || null;
}

function computeStartingResources(race) {
    const base = {
        metal: 100,
        crystal: 100,
        research: 50
    };

    if (!race || !race.bonuses) {
        return { ...base };
    }

    return {
        metal: Math.floor(base.metal * (race.bonuses.metalProduction || 1)),
        crystal: Math.floor(base.crystal * (race.bonuses.crystalProduction || 1)),
        research: Math.floor(base.research * (race.bonuses.researchSpeed || 1))
    };
}

function createAiUser(gameId, callback) {
    const rand = crypto.randomBytes(3).toString('hex');
    const username = `AI_${gameId}_${rand}`;
    const salt = generateSalt();
    const password = generateTempKey();
    const hashedPassword = hashPassword(password, salt);
    const tempKey = generateTempKey();

    db.query(
        'INSERT INTO users (username, password, salt, email, tempkey) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, salt, null, tempKey],
        (err, result) => {
            if (err) {
                callback(err);
                return;
            }
            callback(null, { id: result.insertId, username, tempKey });
        }
    );
}

function createPlayerEntryForGame(gameId, playerId, raceId, callback) {
    ensurePlayerTableSchema(gameId, schemaErr => {
        if (schemaErr) {
            callback(schemaErr);
            return;
        }

        const tableName = mysql2.escapeId(`players${gameId}`);
        const race = getRaceById(raceId);
        const resources = computeStartingResources(race);

        db.query(
            `INSERT INTO ${tableName} (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)`,
            [playerId, raceId, resources.metal, resources.crystal, resources.research],
            insertErr => {
                if (insertErr) {
                    callback(insertErr);
                    return;
                }

                db.query(
                    'UPDATE users SET currentgame = ? WHERE id = ?',
                    [gameId, playerId],
                    updateErr => {
                        if (updateErr) {
                            callback(updateErr);
                            return;
                        }
                        callback(null, { raceId, resources });
                    }
                );
            }
        );
    });
}

function updatePlayerRaceForGame(gameId, playerId, raceId, callback) {
    ensurePlayerTableSchema(gameId, schemaErr => {
        if (schemaErr) {
            callback(schemaErr);
            return;
        }

        const tableName = mysql2.escapeId(`players${gameId}`);
        const race = getRaceById(raceId);
        const resources = computeStartingResources(race);

        db.query(
            `UPDATE ${tableName} SET race_id = ?, metal = ?, crystal = ?, research = ? WHERE userid = ?`,
            [raceId, resources.metal, resources.crystal, resources.research, playerId],
            updateErr => {
                if (updateErr) {
                    callback(updateErr);
                    return;
                }
                db.query(
                    'UPDATE users SET currentgame = ? WHERE id = ?',
                    [gameId, playerId],
                    userErr => {
                        if (userErr) {
                            callback(userErr);
                            return;
                        }
                        callback(null, { raceId, resources });
                    }
                );
            }
        );
    });
}

function cleanupGame(gameId, callback) {
    const dropStatements = GAME_TABLE_SUFFIXES.map(suffix =>
        `DROP TABLE IF EXISTS ${mysql2.escapeId(`${suffix}${gameId}`)}`
    );

    runSequentialQueries(dropStatements, err => {
        if (err) {
            callback(err);
            return;
        }

        db.query('DELETE FROM games WHERE id = ?', [gameId], deleteErr => {
            if (deleteErr) {
                callback(deleteErr);
                return;
            }

            if (gameState.gameTimer[gameId]) {
                clearInterval(gameState.gameTimer[gameId]);
                delete gameState.gameTimer[gameId];
            }

            delete gameState.turns[gameId];
            delete gameState.activeGames[gameId];
            callback(null);
        });
    });
}

function removePlayerFromWaitingGame(game, playerId, callback) {
    ensurePlayerTableSchema(game.id, schemaErr => {
        if (schemaErr) {
            callback(schemaErr);
            return;
        }

        const tableName = mysql2.escapeId(`players${game.id}`);
        db.query(
            `DELETE FROM ${tableName} WHERE userid = ?`,
            [playerId],
            deleteErr => {
                if (deleteErr) {
                    callback(deleteErr);
                    return;
                }

                db.query(
                    'UPDATE users SET currentgame = NULL WHERE id = ? AND currentgame = ?',
                    [playerId, game.id],
                    updateErr => {
                        if (updateErr) {
                            callback(updateErr);
                            return;
                        }

                        db.query(
                            `SELECT userid FROM ${tableName} ORDER BY joined_at ASC`,
                            (listErr, rows) => {
                                if (listErr) {
                                    callback(listErr);
                                    return;
                                }

                                if (!rows || rows.length === 0) {
                                    cleanupGame(game.id, cleanupErr => {
                                        if (cleanupErr) {
                                            callback(cleanupErr);
                                            return;
                                        }
                                        callback(null, { clearedGame: true });
                                    });
                                    return;
                                }

                                const normalizedCreator = Number(game.creator);
                                const normalizedPlayer = Number(playerId);

                                if (Number.isFinite(normalizedCreator) && normalizedCreator === normalizedPlayer) {
                                    const firstRemainingId = Number(rows[0].userid);
                                    if (!Number.isFinite(firstRemainingId)) {
                                        callback(null, { remainingPlayers: rows.length });
                                        return;
                                    }
                                    const newCreator = firstRemainingId;
                                    db.query(
                                        'UPDATE games SET creator = ? WHERE id = ?',
                                        [newCreator, game.id],
                                        creatorErr => {
                                            if (creatorErr) {
                                                callback(creatorErr);
                                                return;
                                            }
                                            callback(null, {
                                                newCreator,
                                                remainingPlayers: rows.length
                                            });
                                        }
                                    );
                                    return;
                                }

                                callback(null, { remainingPlayers: rows.length });
                            }
                        );
                    }
                );
            }
        );
    });
}

function sanitizeGameName(name) {
    if (!name) {
        return "";
    }
    const trimmed = name.replace(/[|]/g, " ").replace(/[\r\n]+/g, " ").trim();
    return trimmed.substring(0, 64);
}

function decodeCommandValue(value) {
    try {
        return decodeURIComponent(value);
    } catch (err) {
        return "";
    }
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

function handleChangeRace(data, connection) {
    if (!db || db.isOffline) {
        connection.sendUTF("changerace::error::Service unavailable");
        return;
    }

    const playerId = parseInt(connection.name, 10);
    const raceId = parseInt(data.split(":")[1], 10);
    if (!Number.isInteger(playerId)) {
        connection.sendUTF("changerace::error::Authentication required");
        return;
    }
    if (!Number.isInteger(raceId)) {
        connection.sendUTF("changerace::error::Invalid race selection");
        return;
    }

    const resolveGameId = callback => {
        const gameId = Number(connection.gameid);
        if (Number.isFinite(gameId)) {
            callback(null, gameId);
            return;
        }
        db.query('SELECT currentgame FROM users WHERE id = ? LIMIT 1', [playerId], (err, rows) => {
            if (err) {
                callback(err);
                return;
            }
            const derivedId = rows && rows[0] ? Number(rows[0].currentgame) : null;
            if (!Number.isFinite(derivedId)) {
                callback(new Error('No active game found'));
                return;
            }
            callback(null, derivedId);
        });
    };

    resolveGameId((gameErr, gameId) => {
        if (gameErr || !Number.isFinite(gameId)) {
            connection.sendUTF("changerace::error::Unable to determine game context");
            return;
        }

        db.query('SELECT id, started FROM games WHERE id = ? LIMIT 1', [gameId], (lookupErr, rows) => {
            if (lookupErr || !rows || rows.length === 0) {
                connection.sendUTF("changerace::error::Game not found");
                return;
            }
            if (rows[0].started) {
                connection.sendUTF("changerace::error::Cannot change race after the game has started");
                return;
            }

            ensurePlayerTableSchema(gameId, schemaErr => {
                if (schemaErr) {
                    connection.sendUTF("changerace::error::Unable to update race");
                    return;
                }
                const tableName = mysql2.escapeId(`players${gameId}`);
                db.query(`SELECT race_id FROM ${tableName} WHERE userid = ? LIMIT 1`, [playerId], (playerErr, players) => {
                    if (playerErr) {
                        connection.sendUTF("changerace::error::Unable to verify player");
                        return;
                    }
                    if (!players || players.length === 0) {
                        connection.sendUTF("changerace::error::Join a game before selecting a race");
                        return;
                    }

                    getUserStats(playerId, (statsErr, userStats) => {
                        if (statsErr) {
                            connection.sendUTF("changerace::error::Unable to verify unlocks");
                            return;
                        }

                        raceSystem.isRaceUnlocked(playerId, raceId, userStats, db, unlocked => {
                            if (!unlocked) {
                                connection.sendUTF("changerace::error::Race not unlocked");
                                return;
                            }

                            updatePlayerRaceForGame(gameId, playerId, raceId, updateErr => {
                                if (updateErr) {
                                    console.error('Error updating race selection:', updateErr);
                                    connection.sendUTF("changerace::error::Failed to update race");
                                    return;
                                }
                                const raceName = getRaceById(raceId)?.name || 'Unknown';
                                connection.raceid = raceId;
                                connection.sendUTF(`changerace::success::${JSON.stringify({ raceId, raceName })}`);
                                broadcastPlayerList(gameId);
                            });
                        });
                    });
                });
            });
        });
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
    const tableName = mysql2.escapeId(`players${gameId}`);
    db.query(
        `SELECT p.userid, p.is_ai, p.race_id, p.ai_difficulty, p.ai_strategy, u.username 
         FROM ${tableName} p 
         LEFT JOIN users u ON u.id = p.userid
         ORDER BY p.joined_at ASC, p.userid ASC`,
        (err, rows) => {
            let payload = "pl";

            if (!err && Array.isArray(rows)) {
                rows.forEach(row => {
                    const username = row.username || `Player ${row.userid}`;
                    const token = [
                        row.userid,
                        encodeURIComponent(username),
                        row.is_ai ? 1 : 0,
                        row.race_id || 0,
                        row.ai_difficulty || '',
                        row.ai_strategy || ''
                    ].join('|');
                    payload += `:${token}`;
                });
            } else {
                gameState.clients.forEach(client => {
                    if (client.gameid === gameId) {
                        payload += `:${client.name}|Player ${client.name}|0`;
                    }
                });
            }

            gameState.clients.forEach(client => {
                if (client.gameid === gameId) {
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

function ensureActiveGameState(gameId) {
    if (!gameState.activeGames[gameId]) {
        gameState.activeGames[gameId] = {};
    }
    const state = gameState.activeGames[gameId];
    if (!state.aiProfiles) {
        state.aiProfiles = new Map();
    }
    if (!state.countdown) {
        state.countdown = null;
    }
    if (!state.standingOrders) {
        state.standingOrders = {};
    }
    return state;
}

function defaultStandingOrders(mode = DEFAULT_GAME_MODE) {
    const normalized = normalizeGameMode(mode);
    return {
        ...DEFAULT_STANDING_ORDERS,
        autoRebuild: normalized === 'epic',
        autoScout: normalized === 'epic'
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
        targetScouts: Number.isFinite(incoming.targetScouts) ? Math.max(0, Math.min(6, incoming.targetScouts)) : (current.targetScouts || 2)
    };
    return state.standingOrders[playerId];
}

async function applyStandingOrdersForPlayer(gameId, playerId) {
    const orders = getStandingOrders(gameId, playerId);
    const summary = [];
    if (!orders) return summary;

    const playersTable = mysql2.escapeId(`players${gameId}`);
    const mapTable = mysql2.escapeId(`map${gameId}`);
    const buildingsTable = mysql2.escapeId(`buildings${gameId}`);
    const shipsTable = mysql2.escapeId(`ships${gameId}`);

    try {
        const playerRows = await queryAsync(
            `SELECT metal, crystal, homeworld FROM ${playersTable} WHERE userid = ? LIMIT 1`,
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
            const sectorRows = await queryAsync(
                `SELECT ownerid FROM ${mapTable} WHERE sectorid = ? LIMIT 1`,
                [homeworld]
            );
            if (sectorRows?.[0]?.ownerid === Number(playerId)) {
                const buildingRows = await queryAsync(
                    `SELECT type, COUNT(*) as count FROM ${buildingsTable} WHERE sectorid = ? AND owner = ? GROUP BY type`,
                    [homeworld, playerId]
                );
                const buildingCounts = {};
                (buildingRows || []).forEach(row => {
                    buildingCounts[row.type] = row.count;
                });
                const needsMetal = !buildingCounts[0];
                const needsCrystal = !buildingCounts[1];
                if (needsMetal) {
                    const cost = BUILDING_COSTS[0];
                    if (metal >= cost.metal && crystal >= cost.crystal) {
                        metal -= cost.metal;
                        crystal -= cost.crystal;
                        await queryAsync(
                            `UPDATE ${playersTable} SET metal = ?, crystal = ? WHERE userid = ?`,
                            [metal, crystal, playerId]
                        );
                        await queryAsync(
                            `INSERT INTO ${buildingsTable} (sectorid, type, owner) VALUES (?, ?, ?)`,
                            [homeworld, 0, playerId]
                        );
                        summary.push('Auto-built metal extractor on homeworld');
                    }
                }
                if (needsCrystal) {
                    const cost = BUILDING_COSTS[1];
                    if (metal >= cost.metal && crystal >= cost.crystal) {
                        metal -= cost.metal;
                        crystal -= cost.crystal;
                        await queryAsync(
                            `UPDATE ${playersTable} SET metal = ?, crystal = ? WHERE userid = ?`,
                            [metal, crystal, playerId]
                        );
                        await queryAsync(
                            `INSERT INTO ${buildingsTable} (sectorid, type, owner) VALUES (?, ?, ?)`,
                            [homeworld, 1, playerId]
                        );
                        summary.push('Auto-built crystal refinery on homeworld');
                    }
                }
            }
        }

        if (orders.autoScout) {
            const scoutCost = combatSystem.SHIP_TYPES?.SCOUT?.cost || { metal: 200, crystal: 0 };
            const scoutCountRows = await queryAsync(
                `SELECT COUNT(*) as count FROM ${shipsTable} WHERE owner = ? AND type = ?`,
                [playerId, SCOUT_SHIP_ID]
            );
            const currentScouts = scoutCountRows?.[0]?.count || 0;
            const desiredScouts = Number.isFinite(orders.targetScouts) ? orders.targetScouts : 2;
            if (currentScouts < desiredScouts && metal >= scoutCost.metal && crystal >= scoutCost.crystal) {
                const hasSpaceportRows = await queryAsync(
                    `SELECT COUNT(*) as count FROM ${buildingsTable} WHERE owner = ? AND sectorid = ? AND type = 3`,
                    [playerId, homeworld]
                );
                const hasSpaceport = (hasSpaceportRows?.[0]?.count || 0) > 0;
                if (hasSpaceport) {
                    metal -= scoutCost.metal;
                    crystal -= scoutCost.crystal;
                    await queryAsync(
                        `UPDATE ${playersTable} SET metal = ?, crystal = ? WHERE userid = ?`,
                        [metal, crystal, playerId]
                    );
                    await queryAsync(
                        `INSERT INTO ${shipsTable} (owner, type, sectorid) VALUES (?, ?, ?)`,
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
    const tableName = mysql2.escapeId(`players${gameId}`);
    db.query(
        `SELECT userid FROM ${tableName}`,
        (err, rows) => {
            if (err || !Array.isArray(rows)) {
                return;
            }
            rows.forEach(row => {
                const playerId = Number(row.userid);
                if (!Number.isFinite(playerId) || state.standingOrders[playerId]) {
                    return;
                }
                state.standingOrders[playerId] = defaultStandingOrders(mode);
            });
        }
    );
}

async function handleApplyStandingOrders(connection) {
    if (!connection.gameid || !connection.name) return;
    try {
        const summary = await applyStandingOrdersForPlayer(connection.gameid, connection.name);
        if (Array.isArray(summary) && summary.length > 0) {
            connection.sendUTF(`standingorders::applied::${JSON.stringify(summary)}`);
        } else {
            connection.sendUTF("standingorders::noop");
        }
    } catch (err) {
        console.error('Failed to apply standing orders:', err);
        connection.sendUTF("standingorders::error::Unable to run standing orders right now");
    }
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

function applyStandingOrdersForGame(gameId) {
    const tableName = mysql2.escapeId(`players${gameId}`);
    db.query(
        `SELECT userid FROM ${tableName}`,
        (err, rows) => {
            if (err || !Array.isArray(rows)) {
                return;
            }
            rows.forEach(row => {
                applyStandingOrdersForPlayer(gameId, row.userid).catch(err => {
                    console.warn(`Standing orders tick failed for player ${row.userid} in game ${gameId}:`, err.message || err);
                });
            });
        }
    );
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
    const tableName = mysql2.escapeId(`players${gameId}`);
    db.query(
        `SELECT userid, ai_difficulty, ai_strategy FROM ${tableName} WHERE is_ai = 1`,
        (err, rows) => {
            if (err || !Array.isArray(rows)) {
                return;
            }
            rows.forEach(row => {
                trackAiProfile(gameId, row.userid, row.ai_difficulty, row.ai_strategy);
            });
        }
    );
}

function triggerAiTurn(gameId) {
    const tableName = mysql2.escapeId(`players${gameId}`);
    db.query(
        `SELECT userid, ai_difficulty, ai_strategy FROM ${tableName} WHERE is_ai = 1`,
        (err, rows) => {
            if (err || !Array.isArray(rows) || rows.length === 0) {
                return;
            }

            rows.forEach(row => {
                trackAiProfile(gameId, row.userid, row.ai_difficulty, row.ai_strategy);
                runAiActions(gameId, row.userid, row.ai_difficulty, row.ai_strategy);
            });
        }
    );
}

function runAiActions(gameId, playerId, difficulty = 'medium', strategy = 'balanced') {
    const diff = (difficulty || 'medium').toLowerCase();
    const strat = (strategy || 'balanced').toLowerCase();
    const aggressiveness = strat === 'aggressive' ? 1.2 : strat === 'chill' ? 0.6 : 1.0;
    const economyBias = strat === 'economic' ? 1.2 : 1.0;

    const connection = {
        name: String(playerId),
        gameid: gameId,
        sendUTF() {}
    };

    db.query(
        `SELECT userid, homeworld, metal, crystal, research FROM ${mysql2.escapeId(`players${gameId}`)} WHERE userid = ? LIMIT 1`,
        [playerId],
        (err, rows) => {
            if (err || !rows || rows.length === 0) return;
            const player = rows[0];
            const homeworld = Number(player.homeworld);
            if (!Number.isFinite(homeworld)) {
                return;
            }

            // Build extractors if affordable
            if (player.metal >= 50 * economyBias) {
                buyBuilding(`//buybuilding:0:${homeworld}`, connection);
            }

            // Build crystal refiners if crystal lags
            if (player.metal >= 50 * economyBias && player.crystal < player.metal * 0.6) {
                buyBuilding(`//buybuilding:1:${homeworld}`, connection);
            }

            // Build scout
            if (player.metal >= 120 * aggressiveness) {
                buyShip(`//buyship:1:${homeworld}`, connection);
            }

            // Build destroyer for light offense
            if (player.metal >= 200 * aggressiveness) {
                buyShip(`//buyship:2:${homeworld}`, connection);
            }

            // Build colony ship for expansion
            if (player.metal >= 800 && player.crystal >= 200) {
                buyShip(`//buyship:5:${homeworld}`, connection);
            }

            handleAiExpansion(gameId, playerId, homeworld);
            handleAiHarass(gameId, playerId, homeworld);
            aiResearchAndDefend(gameId, playerId);
        }
    );
}

function getAdjacentSectorIds(sectorId, mapWidth = 14, mapHeight = 8) {
    const x = sectorId % mapWidth;
    const y = Math.floor(sectorId / mapWidth);
    const ids = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) continue;
            ids.push(ny * mapWidth + nx);
        }
    }
    return ids;
}

function handleAiExpansion(gameId, playerId, homeSector) {
    const mapTable = mysql2.escapeId(`map${gameId}`);
    const shipsTable = mysql2.escapeId(`ships${gameId}`);

    // Find nearest neutral sector
    db.query(
        `SELECT sectorid FROM ${mapTable} WHERE owner IS NULL AND type BETWEEN 1 AND 10 LIMIT 25`,
        (err, rows) => {
            if (err || !Array.isArray(rows) || rows.length === 0) return;
            const target = rows
                .map(r => r.sectorid)
                .reduce((best, sector) => {
                    const dist = manhattanDistance(sector, homeSector);
                    if (!best || dist < best.dist) return { sector, dist };
                    return best;
                }, null);
            if (!target) return;

            // Locate colony ship
            db.query(
                `SELECT sectorid, id FROM ${shipsTable} WHERE owner = ? AND type = 5 LIMIT 1`,
                [playerId],
                (shipErr, ships) => {
                    if (shipErr || !ships || ships.length === 0) return;
                    const colony = ships[0];
                    const current = Number(colony.sectorid);
                    if (current === target.sector) {
                        // Colonize immediately
                        db.query(`DELETE FROM ${shipsTable} WHERE id = ?`, [colony.id]);
                        db.query(
                            `UPDATE ${mapTable} SET owner = ?, ownerid = ? WHERE sectorid = ? AND owner IS NULL`,
                            [playerId, playerId, target.sector],
                            () => {
                                db.query(
                                    `UPDATE ${mysql2.escapeId(`players${gameId}`)} SET metal = metal + 50, crystal = crystal + 50 WHERE userid = ?`,
                                    [playerId]
                                );
                                updateSector2(gameId, target.sector);
                            }
                        );
                        return;
                    }
                    const nextStep = nextStepTowards(current, target.sector);
                    moveFleet(`//move:${current}:${nextStep}:5:1`, connectionStub(playerId, gameId));
                }
            );
        }
    );
}

function handleAiHarass(gameId, playerId, homeSector) {
    const mapTable = mysql2.escapeId(`map${gameId}`);
    const shipsTable = mysql2.escapeId(`ships${gameId}`);

    db.query(
        `SELECT sectorid, owner FROM ${mapTable} WHERE owner IS NOT NULL AND owner <> ? LIMIT 50`,
        [playerId],
        (err, rows) => {
            if (err || !Array.isArray(rows) || rows.length === 0) return;
            // pick nearest enemy sector
            const target = rows.reduce((best, row) => {
                const dist = manhattanDistance(row.sectorid, homeSector);
                if (!best || dist < best.dist) return { sector: row.sectorid, dist };
                return best;
            }, null);
            if (!target) return;

            db.query(
                `SELECT sectorid, type, COUNT(*) AS count FROM ${shipsTable} WHERE owner = ? GROUP BY sectorid, type`,
                [playerId],
                (shipErr, shipRows) => {
                    if (shipErr || !Array.isArray(shipRows) || shipRows.length === 0) return;
                    // choose a sector with ships closest to target
                    const bestStack = shipRows.reduce((best, row) => {
                        const dist = manhattanDistance(row.sectorid, target.sector);
                        if (!best || dist < best.dist) {
                            return { sector: row.sectorid, type: row.type, count: row.count, dist };
                        }
                        return best;
                    }, null);
                    if (!bestStack) return;
                    const nextStep = nextStepTowards(bestStack.sector, target.sector);
                    moveFleet(`//move:${bestStack.sector}:${nextStep}:${bestStack.type}:1`, connectionStub(playerId, gameId));
                }
            );
        }
    );
}

function connectionStub(playerId, gameId) {
    return {
        name: String(playerId),
        gameid: gameId,
        sendUTF() {}
    };
}

function manhattanDistance(sectorA, sectorB, width = 14) {
    const ax = sectorA % width;
    const ay = Math.floor(sectorA / width);
    const bx = sectorB % width;
    const by = Math.floor(sectorB / width);
    return Math.abs(ax - bx) + Math.abs(ay - by);
}

function nextStepTowards(current, target, width = 14, height = 8) {
    if (current === target) return current;
    const cx = current % width;
    const cy = Math.floor(current / width);
    const tx = target % width;
    const ty = Math.floor(target / width);
    const stepX = cx === tx ? 0 : (cx < tx ? 1 : -1);
    const stepY = cy === ty ? 0 : (cy < ty ? 1 : -1);
    const nx = Math.min(Math.max(cx + stepX, 0), width - 1);
    const ny = Math.min(Math.max(cy + stepY, 0), height - 1);
    return ny * width + nx;
}

function aiResearchAndDefend(gameId, playerId) {
    const playersTable = mysql2.escapeId(`players${gameId}`);
    db.query(
        `SELECT research, tech, homeworld, metal FROM ${playersTable} WHERE userid = ? LIMIT 1`,
        [playerId],
        (err, rows) => {
            if (err || !rows || rows.length === 0) return;
            const player = rows[0];
            const techs = parsePlayerTech(player.tech);
            const affordable = pickAffordableTech(techs, player.research);
            if (affordable) {
                buyTech(`//buytech:${affordable.id}`, connectionStub(playerId, gameId));
            }
            // Defend home if enemy adjacent: build destroyer if affordable
            if (Number.isFinite(player.homeworld)) {
                db.query(
                    `SELECT owner FROM ${mysql2.escapeId(`map${gameId}`)} WHERE sectorid IN (?) AND owner IS NOT NULL AND owner <> ? LIMIT 1`,
                    [getAdjacentSectorIds(player.homeworld), playerId],
                    (adjErr, foes) => {
                        if (adjErr || !Array.isArray(foes) || foes.length === 0) return;
                        if (player.metal >= 200) {
                            buyShip(`//buyship:2:${player.homeworld}`, connectionStub(playerId, gameId));
                        }
                    }
                );
            }
        }
    );
}

function parsePlayerTech(techString) {
    if (!techString) return {};
    return techString.split(',')
        .map(x => x.trim())
        .filter(Boolean)
        .reduce((acc, val) => {
            const id = Number(val);
            if (Number.isFinite(id)) acc[id] = 1;
            return acc;
        }, {});
}

function pickAffordableTech(currentTechs, researchPoints) {
    const techModule = techSystem; // alias
    const candidates = Object.values(techModule.TECHNOLOGIES).map(t => ({
        id: t.id,
        key: Object.keys(techModule.TECHNOLOGIES).find(k => techModule.TECHNOLOGIES[k].id === t.id),
        tier: t.tier,
        baseCost: t.baseCost,
        prerequisites: t.prerequisites
    }));

    const ownedIds = new Set(Object.keys(currentTechs).map(Number));
    const affordable = candidates.filter(c => {
        if (ownedIds.has(c.id)) return false;
        const prereqsMet = (c.prerequisites || []).every(pr => ownedIds.has(techModule.TECHNOLOGIES[pr]?.id));
        const cost = techModule.calculateTechCost ? techModule.calculateTechCost(c.key, 0) : c.baseCost || 100;
        return prereqsMet && researchPoints >= cost;
    });

    if (affordable.length === 0) return null;
    // Pick the cheapest, prefer lower tier
    affordable.sort((a, b) => {
        const costA = techModule.calculateTechCost ? techModule.calculateTechCost(a.key, 0) : a.baseCost || 100;
        const costB = techModule.calculateTechCost ? techModule.calculateTechCost(b.key, 0) : b.baseCost || 100;
        if (costA !== costB) return costA - costB;
        return (a.tier || 0) - (b.tier || 0);
    });
    const selected = affordable[0];
    const cost = techModule.calculateTechCost ? techModule.calculateTechCost(selected.key, 0) : selected.baseCost || 100;
    return { id: selected.id, cost };
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

function applyEpicEconomyAssist(gameId, playerId, homeworld) {
    const costs = {
        0: { metal: 50, crystal: 20 }, // Metal Extractor
        1: { metal: 40, crystal: 30 }  // Crystal Refinery
    };
    if (!Number.isFinite(homeworld)) return;

    db.query(
        `SELECT owner FROM ${mysql2.escapeId(`map${gameId}`)} WHERE sectorid = ?`,
        [homeworld],
        (mapErr, mapRows) => {
            if (mapErr || !mapRows || mapRows.length === 0 || mapRows[0].owner !== playerId) {
                return;
            }
            db.query(
                `SELECT type FROM ${mysql2.escapeId(`buildings${gameId}`)} WHERE sectorid = ?`,
                [homeworld],
                (bErr, buildings) => {
                    if (bErr) return;
                    const count = buildings?.length || 0;
                    if (count >= 3) return;
                    const hasMetal = buildings?.some(b => b.type === 0);
                    const hasCrystal = buildings?.some(b => b.type === 1);
                    let targetType = null;
                    if (!hasMetal) targetType = 0;
                    else if (!hasCrystal) targetType = 1;
                    else return;
                    const cost = costs[targetType];
                    db.query(
                        `SELECT metal, crystal FROM ${mysql2.escapeId(`players${gameId}`)} WHERE userid = ? LIMIT 1`,
                        [playerId],
                        (pErr, players) => {
                            if (pErr || !players || players.length === 0) return;
                            const player = players[0];
                            if (player.metal < cost.metal || player.crystal < cost.crystal) return;
                            db.query(
                                `UPDATE ${mysql2.escapeId(`players${gameId}`)} SET metal = metal - ?, crystal = crystal - ? WHERE userid = ?`,
                                [cost.metal, cost.crystal, playerId],
                                updateErr => {
                                    if (updateErr) return;
                                    db.query(
                                        `INSERT INTO ${mysql2.escapeId(`buildings${gameId}`)} (sectorid, type, owner) VALUES (?, ?, ?)`,
                                        [homeworld, targetType, playerId],
                                        () => {
                                            updateSector2(gameId, homeworld);
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

// Export functions for use by index.js
module.exports = {
    setDatabase,
    handleLogin,
    handleRegister,
    handleGameStart,
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
    handleCreateGame,
    handleAddAi,
    handleGameList,
    handleLeaveGame,
    handlePlayerDisconnect,
    handleGetUnlockedRaces,
    handleChangeRace,
    handleCreatePaymentIntent,
    handleCreateSubscription,
    handlePaymentWebhook,
    handleSpendCrystals,
    handleGetBalance,
    handleGetOwnedItems,
    handleGetPurchaseHistory,
    handleStandingOrders,
    handleApplyStandingOrders,
    applyStandingOrdersForPlayer,
    defaultStandingOrders,
    gameState,
    // Test utilities
    processTurn
};
