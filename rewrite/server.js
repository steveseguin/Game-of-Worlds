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

// Database connection (will be set by index.js)
let db = null;
let paymentManager = null;
let paymentEndpoints = null;

// Set the database connection
function setDatabase(database) {
    db = database;
    // Initialize payment manager with database
    paymentManager = new PaymentManager(db);
    // Initialize payment endpoints
    paymentEndpoints = new PaymentEndpoints(paymentManager, db);
    // Set global gameState for payment notifications
    global.gameState = gameState;
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
    
    const gameId = connection.gameid;
    
    // Check if player is the game creator
    db.query('SELECT creator FROM games WHERE id = ?', [gameId], (err, results) => {
        if (err || results.length === 0) {
            connection.sendUTF("Error: Game not found");
            return;
        }
        
        if (results[0].creator !== connection.name) {
            connection.sendUTF("Error: Only the game creator can start the game");
            return;
        }
        
        // Initialize game
        initializeGame(gameId, connection);
    });
}

function initializeGame(gameId, connection) {
    // Set game as started
    db.query('UPDATE games SET started = 1 WHERE id = ?', [gameId], (err) => {
        if (err) {
            connection.sendUTF("Error: Failed to start game");
            return;
        }
        
        // Initialize turn counter
        gameState.turns[gameId] = 1;
        
        // Create game map
        const mapSize = { width: 14, height: 8 };
        const map = mapSystem.generateMap(mapSize.width, mapSize.height);
        
        // Store map in database
        map.forEach((sector, index) => {
            const x = index % mapSize.width;
            const y = Math.floor(index / mapSize.width);
            
            db.query(
                `INSERT INTO map${gameId} (sectorid, x, y, type) VALUES (?, ?, ?, ?)`,
                [index, x, y, sector.type],
                (err) => {
                    if (err) console.error("Error inserting map sector:", err);
                }
            );
        });
        
        // Initialize players
        db.query(`SELECT userid FROM players${gameId}`, (err, results) => {
            if (err) {
                console.error("Error getting players:", err);
                return;
            }
            
            results.forEach((row, index) => {
                const homeworld = assignHomeworld(index, mapSize);
                
                // Update player with starting resources and homeworld
                db.query(
                    `UPDATE players${gameId} SET 
                     metal = 100, crystal = 100, research = 50,
                     homeworld = ?, currentsector = ?
                     WHERE userid = ?`,
                    [homeworld, homeworld, row.userid],
                    (err) => {
                        if (err) console.error("Error updating player:", err);
                    }
                );
                
                // Update map to show player owns their homeworld
                db.query(
                    `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`,
                    [row.userid, homeworld],
                    (err) => {
                        if (err) console.error("Error updating map ownership:", err);
                    }
                );
            });
        });
        
        // Start turn timer
        startTurnTimer(gameId);
        
        // Notify all players
        broadcastToGame(gameId, "The game has started!");
        broadcastToGame(gameId, "startgame::");
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

function startTurnTimer(gameId) {
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

function resolveBattle(gameId, sectorId, player1, player2) {
    // Get ships for both players
    Promise.all([
        getPlayerShips(gameId, sectorId, player1),
        getPlayerShips(gameId, sectorId, player2)
    ]).then(([ships1, ships2]) => {
        const result = combatSystem.resolveCombat(ships1, ships2);
        
        // Update ship counts based on battle results
        updateShipsAfterBattle(gameId, sectorId, player1, result.attacker);
        updateShipsAfterBattle(gameId, sectorId, player2, result.defender);
        
        // Notify players of battle results
        const message = `Battle in sector ${sectorId}: ${result.winner} wins!`;
        notifyPlayer(player1, message);
        notifyPlayer(player2, message);
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
    const gameId = parseInt(parts[1]);
    const raceId = parseInt(parts[2]) || 1; // Default to Terran if not specified
    const playerId = connection.name;
    
    // Check if game exists and has space
    db.query('SELECT * FROM games WHERE id = ? AND started = 0', [gameId], (err, games) => {
        if (err || games.length === 0) {
            connection.sendUTF("Error: Game not found or already started");
            return;
        }
        
        // Check if player already in game
        db.query(`SELECT * FROM players${gameId} WHERE userid = ?`, [playerId], (err, existing) => {
            if (!err && existing && existing.length > 0) {
                connection.sendUTF("Error: Already in this game");
                return;
            }
            
            // Verify race is unlocked for player
            getUserStats(playerId, (err, userStats) => {
                if (err) {
                    connection.sendUTF("Error: Failed to get user stats");
                    return;
                }
                
                raceSystem.isRaceUnlocked(playerId, raceId, userStats, db, (unlocked) => {
                    if (!unlocked) {
                        connection.sendUTF("Error: Race not unlocked");
                        return;
                    }
                    
                    // Get race bonuses
                    const race = Object.values(raceSystem.RACE_TYPES).find(r => r.id === raceId);
                    const startingResources = {
                        metal: Math.floor(100 * race.bonuses.metalProduction),
                        crystal: Math.floor(100 * race.bonuses.crystalProduction),
                        research: Math.floor(50 * race.bonuses.researchSpeed)
                    };
                    
                    // Add player to game with race
                    db.query(
                        `INSERT INTO players${gameId} (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)`,
                        [playerId, raceId, startingResources.metal, startingResources.crystal, startingResources.research],
                        (err) => {
                            if (err) {
                                connection.sendUTF("Error: Failed to join game");
                                return;
                            }
                            
                            // Update user's current game
                            db.query(
                                'UPDATE users SET currentgame = ? WHERE id = ?',
                                [gameId, playerId],
                                (err) => {
                                    if (err) {
                                        connection.sendUTF("Error: Failed to update user");
                                        return;
                                    }
                                    
                                    connection.gameid = gameId;
                                    connection.raceid = raceId;
                                    connection.sendUTF("Success: Joined game");
                                    broadcastPlayerList(gameId);
                                }
                            );
                        }
                    );
                });
            });
        });
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
    let playerList = "pl";
    
    gameState.clients.forEach(client => {
        if (client.gameid === gameId) {
            playerList += ":" + client.name;
        }
    });
    
    if (playerList !== "pl") {
        gameState.clients.forEach(client => {
            if (client.gameid === gameId) {
                client.sendUTF(playerList);
            }
        });
    }
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
    handleGetUnlockedRaces,
    handleCreatePaymentIntent,
    handleCreateSubscription,
    handlePaymentWebhook,
    handleSpendCrystals,
    handleGetBalance,
    handleGetOwnedItems,
    handleGetPurchaseHistory,
    gameState
};