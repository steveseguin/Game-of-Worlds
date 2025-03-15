const WebSocketServer = require('websocket').server;
const http = require('http');
const mysql = require('mysql');
const fs = require('fs');
const url = require('url');
const path = require('path');
// Import game mechanics modules
const MapSystem = require('./lib/map');
const CombatSystem = require('./lib/combat');
const TechSystem = require('./lib/tech');

// Create MySQL connection
const db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'bitnami',
    database: 'game'
});

// Connect to database
db.connect(err => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    console.log('Connected to database');
});

// Create HTTP server
const server = http.createServer((request, response) => {
    console.log(`${new Date()} Received request for ${request.url}`);
    response.writeHead(404);
    response.end();
});

// Start server
const PORT = 1337;
server.listen(PORT, () => {
    console.log(`${new Date()} Server is listening on port ${PORT}`);
});

// Create WebSocket server
const wsServer = new WebSocketServer({
    httpServer: server,
    maxReceivedFrameSize: 64 * 1024 * 1024,   // 64MiB
    maxReceivedMessageSize: 64 * 1024 * 1024, // 64MiB
    fragmentOutgoingMessages: false,
    keepalive: true,
    disableNagleAlgorithm: false,
    autoAcceptConnections: true
});

// Game state
const clients = [];
const gameTimer = {};
const clientMap = {};
const turns = {};
const activeGames = {};

// WebSocket connection handler
wsServer.on('connect', connection => {
    connection.name = 'unknown';
    clients.push(connection);

    console.log(`${new Date()} Connection accepted - Protocol Version ${connection.webSocketVersion}`);
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

        // Handle various commands
        if (data.indexOf("//start") === 0) {
            handleGameStart(connection);
        } else if (data.indexOf("//colonize") === 0) {
            colonizePlanet(connection);
        } else if (data.indexOf("//buytech:") === 0) {
            buyTech(data, connection);
        } else if (data.indexOf("//probe:") === 0) {
            probeSector(data, connection);
        } else if (data.indexOf("//buyship:") === 0) {
            buyShip(data, connection);
        } else if (data.indexOf("//buybuilding:") === 0) {
            buyBuilding(data, connection);
        } else if (data.indexOf("//move:") === 0) {
            moveFleet(data, connection);
        } else if (data.indexOf("//sector tile") === 0 || data.indexOf("//sector ") === 0) {
            updateSector(data, connection);
        } else if (data.indexOf("//mmove:") === 0) {
            surroundShips(data, connection);
        } else if (data.indexOf("//sendmmf:") === 0) {
            preMoveFleet(data, connection);
        } else if (data.indexOf("//update") === 0) {
            updateResources(connection);
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
            broadcastPlayerList(connection.gameid, connection.name);
        }
    });
});

server.on('request', (request, response) => {
    console.log(`${new Date()} Received request for ${request.url}`);
    
    // Parse the URL
    const urlPath = url.parse(request.url).pathname;
    
    if (urlPath === '/' || urlPath === '/index.html') {
        // Serve index page
        fs.readFile(path.join(__dirname, 'game.html'), (err, data) => {
            if (err) {
                response.writeHead(404);
                response.end('File not found');
                return;
            }
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.end(data);
        });
        return;
    }
    
    // Check for JS files
    if (urlPath.endsWith('.js')) {
        fs.readFile(path.join(__dirname, urlPath), (err, data) => {
            if (err) {
                response.writeHead(404);
                response.end('File not found');
                return;
            }
            response.writeHead(200, {'Content-Type': 'application/javascript'});
            response.end(data);
        });
        return;
    }
    
    // Check for image files
    if (['.jpg', '.png', '.gif'].some(ext => urlPath.endsWith(ext))) {
        const contentType = urlPath.endsWith('.jpg') ? 'image/jpeg' :
                           urlPath.endsWith('.png') ? 'image/png' : 'image/gif';
        
        fs.readFile(path.join(__dirname, '..', urlPath), (err, data) => {
            if (err) {
                response.writeHead(404);
                response.end('File not found');
                return;
            }
            response.writeHead(200, {'Content-Type': contentType});
            response.end(data);
        });
        return;
    }
    
    // Default 404 response
    response.writeHead(404);
    response.end();
});

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

function broadcastPlayerList(gameId, excludePlayer) {
    let playerList = "pl";
    
    // Build list of players in this game
    clients.forEach(client => {
        if (client.gameid === gameId && (client.name !== excludePlayer || !excludePlayer)) {
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

// Authentication and Game Management Functions

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
                updateResources(connection);
                updateAllSectors(connection.gameid, connection);
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

function handleGameStart(connection) {
    if (!connection.gameid) {
        connection.sendUTF("You are not in a game");
        return;
    }
    
    const gameId = connection.gameid;
    
    if (turns[gameId] === undefined) {
        // Game is not started yet, start it
        console.log(`Game ${gameId} is starting`);
        turns[gameId] = 0;
        
        // Notify players
        broadcastToGame({ gameid: gameId }, "The game is starting in 10 seconds");
        broadcastToGame({ gameid: gameId }, "start10:");
        
        // Update database
        db.query('UPDATE games SET turn = 0 WHERE id = ?', [gameId]);
        
        // Schedule game start
        setTimeout(() => startGame(gameId), 10000);
    } else if (turns[gameId] !== 0) {
        // Game is in progress, player ready for next turn
        handlePlayerReady(connection);
    } else {
        console.log("Game is in starting phase, can't start next round yet.");
    }
}

function handlePlayerReady(connection) {
    // Mark player as ready for next turn
    connection.ready = 1;
    
    // Check if all players are ready
    let allReady = true;
    let playersInGame = 0;
    
    clients.forEach(client => {
        if (client.gameid === connection.gameid) {
            playersInGame++;
            if (!client.ready) {
                allReady = false;
                console.log(`Player ${client.name} is not ready for next turn`);
            } else {
                console.log(`Player ${client.name} is ready for next turn`);
            }
        }
    });
    
    // If all players are ready, advance to next turn
    if (allReady && playersInGame > 0) {
        console.log("All players ready, advancing to next turn");
        
        // Reset ready status
        clients.forEach(client => {
            if (client.gameid === connection.gameid) {
                client.ready = 0;
            }
        });
        
        // Clear and reset timer
        clearInterval(gameTimer[connection.gameid]);
        gameTimer[connection.gameid] = setInterval(() => nextTurn(connection.gameid), 180000);
        
        // Advance turn
        nextTurn(connection.gameid);
    }
}

function startGame(gameId) {
    // Set turn to 1 in database
    db.query('UPDATE games SET turn = 1 WHERE id = ?', [gameId]);
    turns[gameId] = 1;
    
    console.log(`Game ${gameId} starting`);
    
    // Load map data
    db.query('SELECT * FROM map' + gameId, (err, mapResults) => {
        if (err) {
            console.error("Error loading map data:", err);
            return;
        }
        
        // Initialize game state
        if (!activeGames[gameId]) {
            activeGames[gameId] = {
                id: gameId,
                sectors: mapResults,
                players: {},
                turn: 1
            };
        }

        // Assign homeworlds to players
        mapResults.forEach(sector => {
            if (sector.sectortype === 10 && clientMap[sector.ownerid]) {
                const client = clientMap[sector.ownerid];
                
                client.sendUTF(`sector:${sector.sectorid.toString(16).toUpperCase()}:owner:${sector.ownerid}:type:${sector.sectortype}:artifact:${sector.artifact}:metalbonus:${sector.metalbonus}:crystalbonus:${sector.crystalbonus}:terraform:${sector.terraformlvl}`);
                client.sectorid = sector.sectorid;
                client.sendUTF(`ownsector:${sector.sectorid.toString(16).toUpperCase()}`);
                
                console.log(`Player ${sector.ownerid} assigned to sector ${sector.sectorid.toString(16).toUpperCase()}`);
                
                updateSector2(sector.sectorid, client);
            }
        });
    });
    
    // Notify all players
    clients.forEach(client => {
        if (client.gameid === gameId) {
            client.sendUTF("GAME HAS STARTED!");
            client.sendUTF("newround:");
            updateResources(client);
        }
    });
    
    // Start turn timer
    gameTimer[gameId] = setInterval(() => nextTurn(gameId), 180000);
}

function nextTurn(gameId) {
    turns[gameId]++;
    
    // Update database
    db.query('UPDATE games SET turn = turn + 1 WHERE id = ?', [gameId]);
    
    // Process game mechanics (resources, ship building, etc.)
    gameMechanics(gameId);
    
    // Notify players
    clients.forEach(client => {
        if (client.gameid === gameId) {
            client.sendUTF("newround:");
        }
    });
}

function updateResources(connection) {
    db.query('SELECT * FROM players' + connection.gameid + ' WHERE playerid = ? LIMIT 1', 
        [connection.name], (err, results) => {
            if (err) {
                console.error("Error updating resources:", err);
                return;
            }
            
            if (results.length === 0) {
                console.error(`No player data found for player ${connection.name}`);
                return;
            }
            
            const result = results[0];
            connection.sendUTF(`resources:${result.metal}:${result.crystal}:${result.research}`);
            connection.sendUTF(`tech:${result.tech1}:${result.tech2}:${result.tech3}:${result.tech4}:${result.tech5}:${result.tech6}:${result.tech7}:${result.tech8}:${result.tech9}`);
        }
    );
}

// Fleet Movement and Ship Building

function surroundShips(message, connection) {
    const msid = parseInt(message.utf8Data.split(":")[1], 16);
    
    db.query('SELECT * FROM map' + connection.gameid, (err, results) => {
        if (err) {
            console.error("Error retrieving map data:", err);
            return;
        }
        
        let targetSector;
        let sendchunk = '';
        
        // Find target sector first
        for (const sector of results) {
            if (sector.sectorid === msid) {
                targetSector = sector;
                break;
            }
        }
        
        if (!targetSector) {
            connection.sendUTF('Error: Target sector not found');
            return;
        }
        
        // Find ships in nearby sectors
        for (const sector of results) {
            // Check if player owns the sector and it has ships
            if (sector.ownerid == connection.name && 
                (sector.totalship1 || sector.totalship2 || sector.totalship3 || 
                 sector.totalship4 || sector.totalship5 || sector.totalship6 || 
                 sector.totalship7 || sector.totalship8 || sector.totalship9)) {
                
                // Check if the sector can see the target sector (adjacency or warp gate)
                const isAdjacent = MapSystem.areSectorsAdjacent(sector.sectorid, msid, 16) || 
                                 targetSector.warpgate === 1 || 
                                 sector.totalship9 > 0; // Carriers can move anywhere
                
                if (isAdjacent) {
                    // Add sector to send chunk
                    sendchunk += `:${sector.sectorid.toString(16).toUpperCase()}:${sector.totalship1}:${sector.totalship2}:${sector.totalship3}:${sector.totalship4}:${sector.totalship5}:${sector.totalship6}:${sector.totalship7}:${sector.totalship8}:${sector.totalship9}`;
                }
            }
        }
        
        if (sendchunk === '') {
            connection.sendUTF('You have no ships in nearby sectors.');
        } else {
            connection.sendUTF(`mmoptions:${msid.toString(16).toUpperCase()}${sendchunk}`);
        }
    });
}

function preMoveFleet(message, connection) {
    console.log("Processing fleet movement:", message.utf8Data);
    const arr = message.utf8Data.split(":");
    const msid = parseInt(arr[1], 16);
    
    // Get player's resources
    db.query('SELECT * FROM players' + connection.gameid + ' WHERE playerid = ? LIMIT 1', 
        [connection.name], (err, resultsp) => {
            if (err) {
                console.error("Error retrieving player data:", err);
                return;
            }
            
            if (resultsp.length === 0) {
                connection.sendUTF('Error: Player data not found');
                return;
            }
            
            const player = resultsp[0];
            
            // Calculate fleet movement cost
            let sumofships = 0;
            for (let y = 4; y <= (arr.length - 1); y += 3) {
                const shipType = parseInt(arr[y - 1]);
                const count = parseInt(arr[y]);
                
                switch (shipType) {
                    case 1: sumofships += count * 2; break; // Frigate
                    case 2: sumofships += count * 2; break; // Destroyer
                    case 3: sumofships += count * 1; break; // Scout
                    case 4: sumofships += count * 2; break; // Cruiser
                    case 5: sumofships += count * 3; break; // Battleship
                    case 6: sumofships += count * 2; break; // Colony Ship
                    case 7: sumofships += count * 5; break; // Dreadnought
                    case 8: sumofships += count * 2; break; // Intruder
                    case 9: sumofships += count * 3; break; // Carrier
                }
            }
            
            const crystalCost = sumofships * 100;
            
            // Check if player has enough crystal
            if (crystalCost > player.crystal) {
                connection.sendUTF(`You do not have enough crystal to send this fleet. Needed: ${crystalCost}`);
                return;
            }
            
            // Get map data
            db.query('SELECT * FROM map' + connection.gameid, (err, mapResults) => {
                if (err) {
                    console.error("Error retrieving map data:", err);
                    return;
                }
                
                let targetSector;
                let ships = {
                    s1: 0, s2: 0, s3: 0, s4: 0, s5: 0,
                    s6: 0, s7: 0, s8: 0, s9: 0
                };
                
                // Find target sector
                for (const sector of mapResults) {
                    if (sector.sectorid === msid) {
                        targetSector = sector;
                        break;
                    }
                }
                
                if (!targetSector) {
                    connection.sendUTF('Error: Target sector not found');
                    return;
                }
                
                // Process ship movements
                for (const sourceSector of mapResults) {
                    if (sourceSector.ownerid == connection.name) {
                        // Look for ships in this sector that match the request
                        for (let x = 2; x <= (arr.length - 1); x += 3) {
                            const sourceSectorId = parseInt(arr[x], 16);
                            
                            if (sourceSectorId === sourceSector.sectorid && 
                                arr[x + 2] !== undefined && arr[x + 1] !== undefined) {
                                
                                const shipType = parseInt(arr[x + 1]);
                                const count = parseInt(arr[x + 2]);
                                
                                // Check if sector is adjacent or has warp capabilities
                                const canMove = MapSystem.areSectorsAdjacent(sourceSector.sectorid, msid, 16) || 
                                              targetSector.warpgate === 1 || 
                                              sourceSector.totalship9 > 0; // Carriers can move anywhere
                                
                                if (canMove) {
                                    // Move ships based on type
                                    switch (shipType) {
                                        case 1:
                                            if (sourceSector.totalship1 >= count) {
                                                ships.s1 += count;
                                                sourceSector.totalship1 -= count;
                                            }
                                            break;
                                        case 2:
                                            if (sourceSector.totalship2 >= count) {
                                                ships.s2 += count;
                                                sourceSector.totalship2 -= count;
                                            }
                                            break;
                                        case 3:
                                            if (sourceSector.totalship3 >= count) {
                                                ships.s3 += count;
                                                sourceSector.totalship3 -= count;
                                            }
                                            break;
                                        case 4:
                                            if (sourceSector.totalship4 >= count) {
                                                ships.s4 += count;
                                                sourceSector.totalship4 -= count;
                                            }
                                            break;
                                        case 5:
                                            if (sourceSector.totalship5 >= count) {
                                                ships.s5 += count;
                                                sourceSector.totalship5 -= count;
                                            }
                                            break;
                                        case 6:
                                            if (sourceSector.totalship6 >= count) {
                                                ships.s6 += count;
                                                sourceSector.totalship6 -= count;
                                            }
                                            break;
                                        case 7:
                                            if (sourceSector.totalship7 >= count) {
                                                ships.s7 += count;
                                                sourceSector.totalship7 -= count;
                                            }
                                            break;
                                        case 8:
                                            if (sourceSector.totalship8 >= count) {
                                                ships.s8 += count;
                                                sourceSector.totalship8 -= count;
                                            }
                                            break;
                                        case 9:
                                            if (sourceSector.totalship9 >= count) {
                                                ships.s9 += count;
                                                sourceSector.totalship9 -= count;
                                            }
                                            break;
                                    }
                                    
                                    // Update source sector in database
                                    db.query(`UPDATE map${connection.gameid} SET 
                                        totalship1 = ?, totalship2 = ?, totalship3 = ?, 
                                        totalship4 = ?, totalship5 = ?, totalship6 = ?,
                                        totalship7 = ?, totalship8 = ?, totalship9 = ?
                                        WHERE sectorid = ?`, 
                                        [
                                            sourceSector.totalship1, sourceSector.totalship2, 
                                            sourceSector.totalship3, sourceSector.totalship4, 
                                            sourceSector.totalship5, sourceSector.totalship6,
                                            sourceSector.totalship7, sourceSector.totalship8,
                                            sourceSector.totalship9, sourceSector.sectorid
                                        ]
                                    );
                                }
                            }
                        }
                    }
                }
                
                // Check if any ships are actually moving
                const totalShips = ships.s1 + ships.s2 + ships.s3 + ships.s4 + 
                                 ships.s5 + ships.s6 + ships.s7 + ships.s8 + ships.s9;
                
                if (totalShips > 0) {
                    // Deduct crystal cost
                    db.query(`UPDATE players${connection.gameid} SET crystal = crystal - ? WHERE playerid = ?`, 
                        [crystalCost, connection.name]
                    );
                    
                    // Schedule fleet arrival
                    setTimeout(() => 
                        endTravel(
                            ships.s1, ships.s2, ships.s3, ships.s4, ships.s5, 
                            ships.s6, ships.s7, ships.s8, ships.s9, 
                            connection.name, connection.gameid, 
                            targetSector, player, msid, connection
                        ), 
                        10000
                    );
                    
                    connection.sendUTF(`Our fleet successfully departed at a cost of ${crystalCost} crystal and should arrive in sector ${msid.toString(16).toUpperCase()} in 10 seconds.`);
                    updateAllSectors(connection.gameid, connection);
                } else {
                    connection.sendUTF("You did not select any ships to move. Please try again");
                }
            });
        }
    );
}

function endTravel(s1, s2, s3, s4, s5, s6, s7, s8, s9, playerId, gameId, targetSector, playerData, sectorId, connection) {
    // Get latest player data
    db.query('SELECT * FROM players' + gameId + ' WHERE playerid = ? LIMIT 1', 
        [playerId], (err, resultsp) => {
            if (err) {
                console.error("Error retrieving player data:", err);
                return;
            }
            
            // Get fresh target sector data
            db.query('SELECT * FROM map' + gameId + ' WHERE sectorid = ? LIMIT 1',
                [sectorId], (err, results) => {
                    if (err) {
                        console.error("Error retrieving target sector data:", err);
                        return;
                    }
                    
                    if (results.length === 0) {
                        connection.sendUTF('Error: Target sector not found');
                        return;
                    }
                    
                    const targetSector = results[0];
                    
                    // Start with full fleet
                    let arrivalShips = {
                        s1, s2, s3, s4, s5, s6, s7, s8, s9
                    };
                    
                    // Flag to track if ships survived travel
                    let endtravel = 1;
                    
                    // Handle special sector types
                    if (targetSector.sectortype === 2) { // Black hole
                        connection.sendUTF(`Fleet arrived in sector ${sectorId.toString(16).toUpperCase()}... but the sector contained a blackhole! UH-OH! Our fleet was crushed by the immense gravity of the black hole!`);
                        updateAllSectors(gameId, connection);
                        updateResources(connection);
                        connection.sendUTF(`info:${sectorId.toString(16).toUpperCase()}:2`);
                        endtravel = 0;
                    } 
                    else if (targetSector.sectortype === 1 && targetSector.ownerid != playerId) { // Asteroid field (random damage)
                        const startTravel = s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8 + s9;
                        
                        // Apply random damage to ships
                        arrivalShips = {
                            s1: Math.round(s1 * Math.random()),
                            s2: Math.round(s2 * Math.random()),
                            s3: Math.round(s3 * Math.random()),
                            s4: Math.round(s4 * Math.random()),
                            s5: Math.round(s5 * Math.random()),
                            s6: Math.round(s6 * Math.random()),
                            s7: Math.round(s7 * Math.random()),
                            s8: Math.round(s8 * Math.random()),
                            s9: Math.round(s9 * Math.random())
                        };
                        
                        const endTravel = arrivalShips.s1 + arrivalShips.s2 + arrivalShips.s3 + 
                                      arrivalShips.s4 + arrivalShips.s5 + arrivalShips.s6 +
                                      arrivalShips.s7 + arrivalShips.s8 + arrivalShips.s9;
                        
                        if (endTravel === 0) {
                            connection.sendUTF('Our fleet warped into an asteroid belt and were hit hard. Ouch! We lost our entire fleet!');
                            updateAllSectors(gameId, connection);
                            updateResources(connection);
                        } else if (endTravel === startTravel) {
                            connection.sendUTF('Our fleet warped into an asteroid belt, but we avoided being hit. Whew! As long as we control this sector, we should be safe to move more ships in.');
                        } else {
                            connection.sendUTF(`Our fleet warped into an asteroid belt and were hit hard. Ouch! We lost ${startTravel - endTravel} ships. If we can control the sector though, that should not happen to us again.`);
                        }
                        
                        connection.sendUTF(`info:${sectorId.toString(16).toUpperCase()}:1`);
                    }
                    
                    // Process arrival if ships survived
                    if (endtravel !== 0) {
                        if (targetSector.ownerid == 0) {
                            // Empty sector - take control
                            db.query(`UPDATE map${gameId} SET 
                                totalship1 = ?, totalship2 = ?, totalship3 = ?, 
                                totalship4 = ?, totalship5 = ?, totalship6 = ?,
                                totalship7 = ?, totalship8 = ?, totalship9 = ?,
                                ownerid = ?
                                WHERE sectorid = ?`, 
                                [
                                    arrivalShips.s1, arrivalShips.s2, arrivalShips.s3, 
                                    arrivalShips.s4, arrivalShips.s5, arrivalShips.s6,
                                    arrivalShips.s7, arrivalShips.s8, arrivalShips.s9,
                                    playerId, sectorId
                                ]
                            );
                            
                            if (targetSector.sectortype !== 2) {
                                connection.sendUTF('Fleet moved; you took control of the sector without issue.');
                            }
                            updateAllSectors(gameId, connection);
                            updateResources(connection);
                        } else if (targetSector.ownerid == playerId) {
                            // Player's own sector - add ships
                            db.query(`UPDATE map${gameId} SET 
                                totalship1 = totalship1 + ?, totalship2 = totalship2 + ?, 
                                totalship3 = totalship3 + ?, totalship4 = totalship4 + ?, 
                                totalship5 = totalship5 + ?, totalship6 = totalship6 + ?,
                                totalship7 = totalship7 + ?, totalship8 = totalship8 + ?,
                                totalship9 = totalship9 + ?
                                WHERE sectorid = ?`, 
                                [
                                    arrivalShips.s1, arrivalShips.s2, arrivalShips.s3, 
                                    arrivalShips.s4, arrivalShips.s5, arrivalShips.s6,
                                    arrivalShips.s7, arrivalShips.s8, arrivalShips.s9,
                                    sectorId
                                ]
                            );
                            
                            connection.sendUTF('Fleet moved successfully.');
                            updateAllSectors(gameId, connection);
                            updateResources(connection);
                        } else {
                            // Enemy sector - initiate battle
                            const defenderId = targetSector.ownerid;
                            
                            // Get defender's tech levels
                            db.query(`SELECT * FROM players${gameId} WHERE playerid = ? LIMIT 1`, [defenderId], 
                                (err, defenderResults) => {
                                    if (err || defenderResults.length === 0) {
                                        console.error("Error getting defender data:", err);
                                        return;
                                    }
                                    
                                    const defenderData = defenderResults[0];
                                    
                                    // Prepare attacker fleet
                                    const attackerFleet = {
                                        ship1: arrivalShips.s1,
                                        ship2: arrivalShips.s2,
                                        ship3: arrivalShips.s3,
                                        ship4: arrivalShips.s4,
                                        ship5: arrivalShips.s5,
                                        ship6: arrivalShips.s6,
                                        ship7: arrivalShips.s7,
                                        ship8: arrivalShips.s8,
                                        ship9: arrivalShips.s9
                                    };
                                    
                                    // Prepare defender fleet
                                    const defenderFleet = {
                                        ship1: targetSector.totalship1,
                                        ship2: targetSector.totalship2,
                                        ship3: targetSector.totalship3,
                                        ship4: targetSector.totalship4,
                                        ship5: targetSector.totalship5,
                                        ship6: targetSector.totalship6,
                                        ship7: targetSector.totalship7,
                                        ship8: targetSector.totalship8,
                                        ship9: targetSector.totalship9,
                                        orbitalTurret: targetSector.orbitalturret || 0,
                                        groundTurret: targetSector.groundturret || 0
                                    };
                                    
                                    // Prepare tech levels
                                    const attackerTech = {
                                        weapons: playerData.tech4 || 0,
                                        hull: playerData.tech5 || 0,
                                        shields: playerData.tech6 || 0
                                    };
                                    
                                    const defenderTech = {
                                        weapons: defenderData.tech4 || 0,
                                        hull: defenderData.tech5 || 0,
                                        shields: defenderData.tech6 || 0
                                    };
                                    
                                    // Conduct battle
                                    const battleResult = CombatSystem.conductBattle(
                                        attackerFleet, defenderFleet, attackerTech, defenderTech
                                    );
                                    
                                    // Process battle results
                                    CombatSystem.processBattleResult(
                                        battleResult, 
                                        { db, clients, clientMap }, 
                                        playerId, 
                                        defenderId, 
                                        sectorId,
                                        gameId
                                    );
                                }
                            );
                        }
                    }
                }
            );
        }
    );
}

function updateSector(message, connection) {
    let sectorId;
    
    // Handle both old and new format
    if (message.indexOf("//sector tile") === 0) {
        sectorId = parseInt(message.split("//sector tile")[1], 16);
    } else {
        sectorId = parseInt(message.split("//sector ")[1], 16);
    }
    
    db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`, [sectorId], 
        (err, results) => {
            if (err) {
                console.error("Error retrieving sector data:", err);
                return;
            }
            
            if (results.length === 0) {
                connection.sendUTF("Error: Sector not found");
                return;
            }
            
            const sector = results[0];
            
            if (sector.ownerid == connection.name) {
                // Player owns the sector, send full information
                connection.sendUTF(`sector:${sectorId.toString(16).toUpperCase()}:owner:${sector.ownerid}:type:${sector.sectortype}:artifact:${sector.artifact}:metalbonus:${sector.metalbonus}:crystalbonus:${sector.crystalbonus}:terraform:${sector.terraformlvl}`);
                connection.sendUTF(`ub:${sector.metallvl}:${sector.crystallvl}:${sector.academylvl}:${sector.shipyardlvl}:${sector.orbitalturret}:${sector.warpgate}`);
                
                // Store selected sector
                connection.sectorid = sectorId;
                clientMap[connection.name] = connection;
                
                connection.sendUTF(`Updated sector ${sectorId.toString(16).toUpperCase()} successfully.`);
                connection.sendUTF(`fleet:${sector.totalship1}:${sector.totalship2}:${sector.totalship3}:${sector.totalship4}:${sector.totalship5}:${sector.totalship6}:${sector.totalship7}:${sector.totalship8}:${sector.totalship9}:${sector.totship1build}:${sector.totship2build}:${sector.totship3build}:${sector.totship4build}:${sector.totship5build}:${sector.totship6build}:${sector.totship7build}:${sector.totship8build}:${sector.totship9build}`);
            } else {
                // Player does not own sector, offer probe option
                connection.sendUTF(`probeonly:${sectorId}`);
            }
        }
    );
}

function updateSector2(sectorId, connection) {
    if (sectorId === undefined) {
        console.log("No sector selected to refresh; is player dead?");
        return;
    }
    
    const sectorHex = sectorId.toString(16).toUpperCase();
    connection.sectorid = sectorId;
    clientMap[connection.name] = connection;
    
    db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`, [sectorId], 
        (err, results) => {
            if (err) {
                console.error("Error retrieving sector data:", err);
                return;
            }
            
            if (results.length === 0) {
                console.error(`Sector ${sectorId} not found`);
                return;
            }
            
            const sector = results[0];
            
            if (sector.ownerid == connection.name) {
                // Send sector info
                connection.sendUTF(`sector:${sectorHex}:owner:${sector.ownerid}:type:${sector.sectortype}:artifact:${sector.artifact}:metalbonus:${sector.metalbonus}:crystalbonus:${sector.crystalbonus}:terraform:${sector.terraformlvl}`);
                connection.sendUTF(`ub:${sector.metallvl}:${sector.crystallvl}:${sector.academylvl}:${sector.shipyardlvl}:${sector.orbitalturret}:${sector.warpgate}`);
                connection.sendUTF(`fleet:${sector.totalship1}:${sector.totalship2}:${sector.totalship3}:${sector.totalship4}:${sector.totalship5}:${sector.totalship6}:${sector.totalship7}:${sector.totalship8}:${sector.totalship9}:${sector.totship1build}:${sector.totship2build}:${sector.totship3build}:${sector.totship4build}:${sector.totship5build}:${sector.totship6build}:${sector.totship7build}:${sector.totship8build}:${sector.totship9build}`);
                
                // Create owner sector info
                const totalShipCount = sector.totalship1 + sector.totalship2 + sector.totalship3 + 
                                   sector.totalship4 + sector.totalship5 + sector.totalship6 +
                                   sector.totalship7 + sector.totalship8 + sector.totalship9;
                
                let indicator = '';
                
                if (sector.sectortype === 1) {
                    indicator = 'A'; // Asteroid
                } else if (sector.warpgate === 1) {
                    indicator = 'W'; // Warp gate
                } else if (sector.colonized === 1) {
                    indicator = 'C'; // Colonized
                } else if (sector.sectortype === 10) {
                    indicator = 'H'; // Homeworld
                } else if (sector.sectortype === 2) {
                    indicator = 'BH'; // Black hole
                } else if (sector.sectortype > 5) {
                    indicator = 'P'; // Planet
                }
                
                connection.sendUTF(`ownsector:${sectorHex}:${totalShipCount}:${indicator}`);
            }
        }
    );
}

function updateAllSectors(gameId, connection) {
    db.query(`SELECT * FROM map${gameId}`, (err, sectors) => {
        if (err) {
            console.error("Error retrieving map data:", err);
            return;
        }
        
        for (const sector of sectors) {
            if (sector.ownerid == connection.name) {
                // If player has no selected sector, set this as default
                if (connection.sectorid === undefined) {
                    connection.sectorid = sector.sectorid;
                    
                    // Send sector details for UI
                    connection.sendUTF(`sector:${sector.sectorid.toString(16).toUpperCase()}:owner:${sector.ownerid}:type:${sector.sectortype}:artifact:${sector.artifact}:metalbonus:${sector.metalbonus}:crystalbonus:${sector.crystalbonus}:terraform:${sector.terraformlvl}`);
                    connection.sendUTF(`ub:${sector.metallvl}:${sector.crystallvl}:${sector.academylvl}:${sector.shipyardlvl}:${sector.orbitalturret}:${sector.warpgate}`);
                    connection.sendUTF(`fleet:${sector.totalship1}:${sector.totalship2}:${sector.totalship3}:${sector.totalship4}:${sector.totalship5}:${sector.totalship6}:${sector.totalship7}:${sector.totalship8}:${sector.totalship9}:${sector.totship1build}:${sector.totship2build}:${sector.totship3build}:${sector.totship4build}:${sector.totship5build}:${sector.totship6build}:${sector.totship7build}:${sector.totship8build}:${sector.totship9build}`);
                } else if (connection.sectorid === sector.sectorid) {
                    // Update selected sector UI
                    connection.sendUTF(`sector:${sector.sectorid.toString(16).toUpperCase()}:owner:${sector.ownerid}:type:${sector.sectortype}:artifact:${sector.artifact}:metalbonus:${sector.metalbonus}:crystalbonus:${sector.crystalbonus}:terraform:${sector.terraformlvl}`);
                    connection.sendUTF(`ub:${sector.metallvl}:${sector.crystallvl}:${sector.academylvl}:${sector.shipyardlvl}:${sector.orbitalturret}:${sector.warpgate}`);
                    connection.sendUTF(`fleet:${sector.totalship1}:${sector.totalship2}:${sector.totalship3}:${sector.totalship4}:${sector.totalship5}:${sector.totalship6}:${sector.totalship7}:${sector.totalship8}:${sector.totalship9}:${sector.totship1build}:${sector.totship2build}:${sector.totship3build}:${sector.totship4build}:${sector.totship5build}:${sector.totship6build}:${sector.totship7build}:${sector.totship8build}:${sector.totship9build}`);
                }
                
                // Send minimap data for owned sector
                const totalShipCount = sector.totalship1 + sector.totalship2 + sector.totalship3 + 
                                   sector.totalship4 + sector.totalship5 + sector.totalship6 +
                                   sector.totalship7 + sector.totalship8 + sector.totalship9;
                
                let indicator = '';
                
                if (sector.sectortype === 1) {
                    indicator = 'A'; // Asteroid
                } else if (sector.warpgate === 1) {
                    indicator = 'W'; // Warp gate
                } else if (sector.colonized === 1) {
                    indicator = 'C'; // Colonized
                } else if (sector.sectortype === 10) {
                    indicator = 'H'; // Homeworld
                } else if (sector.sectortype === 2) {
                    indicator = 'BH'; // Black hole
                } else if (sector.sectortype > 5) {
                    indicator = 'P'; // Planet
                }
                
                connection.sendUTF(`ownsector:${sector.sectorid.toString(16).toUpperCase()}:${totalShipCount}:${indicator}`);
            }
        }
    });
}

// Building and Research Functions

function buyBuilding(message, connection) {
    const buildingId = parseInt(message.utf8Data.split("//buybuilding:")[1]);
    
    console.log(`Player ${connection.name} is trying to buy building: ${buildingId}`);
    
    if (connection.sectorid === undefined) {
        connection.sendUTF('You need to select a sector first');
        return;
    }
    
    // Get sector data
    db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`, [connection.sectorid], 
        (err, results) => {
            if (err) {
                console.error("Error retrieving sector data:", err);
                return;
            }
            
            if (results.length === 0) {
                connection.sendUTF('Error: Sector not found');
                return;
            }
            
            const sector = results[0];
            
            // Check if player owns the sector and it's colonized
            if (sector.ownerid == connection.name && sector.terraformlvl === 0 && 
                sector.colonized === 1 && sector.sectortype > 5) {
                
                // Get player's resources
                db.query(`SELECT * FROM players${connection.gameid} WHERE playerid = ? LIMIT 1`, [connection.name], 
                    (err, playerResults) => {
                        if (err) {
                            console.error("Error retrieving player data:", err);
                            return;
                        }
                        
                        if (playerResults.length === 0) {
                            connection.sendUTF('Error: Player data not found');
                            return;
                        }
                        
                        const player = playerResults[0];
                        
                        switch (buildingId) {
                            case 1: // Metal Extractor
                                const metalCost = 100 * (sector.metallvl + 1);
                                const maxMetalLvl = (sector.sectortype - 4) * 2;
                                
                                if (player.metal >= metalCost && maxMetalLvl >= sector.metallvl + 1) {
                                    connection.sendUTF(`Building a metal extractor in sector: ${connection.sectorid.toString(16).toUpperCase()}`);
                                    
                                    db.query(`UPDATE map${connection.gameid} SET metallvl = metallvl + 1 WHERE sectorid = ?`, [connection.sectorid]);
                                    db.query(`UPDATE players${connection.gameid} SET metal = metal - ? WHERE playerid = ?`, [metalCost, connection.name]);
                                    
                                    updateResources(connection);
                                    updateSector2(connection.sectorid, connection);
                                } else if (maxMetalLvl < sector.metallvl + 1) {
                                    connection.sendUTF("You have reached the planet's maximum limit for metal extractors.");
                                } else {
                                    connection.sendUTF('Not enough Metal');
                                }
                                
                                if (maxMetalLvl <= sector.metallvl + 1) {
                                    connection.sendUTF("maxbuild::1");
                                }
                                break;
                                
                            case 2: // Crystal Refinery
                                const crystalCost = 100 * (sector.crystallvl + 1);
                                const maxCrystalLvl = (sector.sectortype - 4) * 2;
                                
                                if (player.metal >= crystalCost && maxCrystalLvl >= sector.crystallvl + 1) {
                                    connection.sendUTF(`Building a crystal refinery in sector: ${connection.sectorid.toString(16).toUpperCase()}`);
                                    
                                    db.query(`UPDATE map${connection.gameid} SET crystallvl = crystallvl + 1 WHERE sectorid = ?`, [connection.sectorid]);
                                    db.query(`UPDATE players${connection.gameid} SET metal = metal - ? WHERE playerid = ?`, [crystalCost, connection.name]);
                                    
                                    updateResources(connection);
                                    updateSector2(connection.sectorid, connection);
                                } else if (maxCrystalLvl < sector.crystallvl + 1) {
                                    connection.sendUTF("You have reached the planet's maximum limit for crystal refineries.");
                                } else {
                                    connection.sendUTF('Not enough Metal');
                                }
                                
                                if (maxCrystalLvl <= sector.crystallvl + 1) {
                                    connection.sendUTF("maxbuild::2");
                                }
                                break;
                                
                            case 3: // Research Academy
                                const academyCost = 100 * (sector.academylvl + 1);
                                const maxAcademyLvl = (sector.sectortype - 4) * 2;
                                
                                if (player.metal >= academyCost && maxAcademyLvl >= sector.academylvl + 1) {
                                    connection.sendUTF(`Building a research academy in sector: ${connection.sectorid.toString(16).toUpperCase()}`);
                                    
                                    db.query(`UPDATE map${connection.gameid} SET academylvl = academylvl + 1 WHERE sectorid = ?`, [connection.sectorid]);
                                    db.query(`UPDATE players${connection.gameid} SET metal = metal - ? WHERE playerid = ?`, [academyCost, connection.name]);
                                    
                                    updateResources(connection);
                                    updateSector2(connection.sectorid, connection);
                                } else if (maxAcademyLvl < sector.academylvl + 1) {
                                    connection.sendUTF("You have reached the planet's maximum limit for research academies.");
                                } else {
                                    connection.sendUTF('Not enough Metal');
                                }
                                
                                if (maxAcademyLvl <= sector.academylvl + 1) {
                                    connection.sendUTF("maxbuild::3");
                                }
                                break;
                                
                            case 4: // Spaceport
                                const spaceportCost = 100 * (sector.shipyardlvl + 1);
                                
                                if (player.metal >= spaceportCost) {
                                    connection.sendUTF(`Building a spaceport in sector: ${connection.sectorid.toString(16).toUpperCase()}`);
                                    
                                    db.query(`UPDATE map${connection.gameid} SET shipyardlvl = shipyardlvl + 1 WHERE sectorid = ?`, [connection.sectorid]);
                                    db.query(`UPDATE players${connection.gameid} SET metal = metal - ? WHERE playerid = ?`, [spaceportCost, connection.name]);
                                    
                                    updateResources(connection);
                                    updateSector2(connection.sectorid, connection);
                                } else {
                                    connection.sendUTF('Not enough Metal');
                                }
                                break;
                                
                            case 5: // Orbital Turret
                                const turretCost = 100 * (sector.orbitalturret + 1);
                                
                                if (player.metal >= turretCost) {
                                    connection.sendUTF(`Building an orbital defense turret in sector: ${connection.sectorid.toString(16).toUpperCase()}`);
                                    
                                    db.query(`UPDATE map${connection.gameid} SET orbitalturret = orbitalturret + 1, groundturret = groundturret + 1 WHERE sectorid = ?`, [connection.sectorid]);
                                    db.query(`UPDATE players${connection.gameid} SET metal = metal - ? WHERE playerid = ?`, [turretCost, connection.name]);
                                    
                                    updateResources(connection);
                                    updateSector2(connection.sectorid, connection);
                                } else {
                                    connection.sendUTF('Not enough Metal');
                                }
                                break;
                                
                            case 6: // Warp Gate
                                const warpgateCost = 10000;
                                
                                if (player.metal >= warpgateCost && sector.warpgate < 1) {
                                    connection.sendUTF(`Building a warp gate in sector: ${connection.sectorid.toString(16).toUpperCase()}`);
                                    
                                    db.query(`UPDATE map${connection.gameid} SET warpgate = 1 WHERE sectorid = ?`, [connection.sectorid]);
                                    db.query(`UPDATE players${connection.gameid} SET metal = metal - ? WHERE playerid = ?`, [warpgateCost, connection.name]);
                                    
                                    updateResources(connection);
                                    updateSector2(connection.sectorid, connection);
                                } else if (sector.warpgate >= 1) {
                                    connection.sendUTF('This sector already contains a warp gate.');
                                } else {
                                    connection.sendUTF('Not enough Metal');
                                }
                                break;
                                
                            default:
                                connection.sendUTF('That build option does not exist');
                        }
                    }
                );
            } else if (sector.colonized !== 1) {
                connection.sendUTF('You first need to colonize this sector before you can build on it');
            } else if (sector.sectortype <= 5) {
                connection.sendUTF('This sector contains no planets; building and terraforming not possible');
            } else if (sector.terraformlvl !== 0) {
                connection.sendUTF('This sector needs terraforming before you can build on it.');
            } else {
                connection.sendUTF('You need to own this sector first');
            }
        }
    );
}

function buyShip(message, connection) {
    const shipId = parseInt(message.utf8Data.split("//buyship:")[1]);
    
    console.log(`Player ${connection.name} is trying to buy ship: ${shipId}`);
    
    if (connection.sectorid === undefined) {
        connection.sendUTF('You need to select a sector first');
        return;
    }
    
    connection.sendUTF(`Building a ship in sector: ${connection.sectorid}`);
    
    // Get sector data
    db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`, [connection.sectorid], 
        (err, results) => {
            if (err) {
                console.error("Error retrieving sector data:", err);
                return;
            }
            
            if (results.length === 0) {
                connection.sendUTF('Error: Sector not found');
                return;
            }
            
            const sector = results[0];
            
            // Calculate available build slots
            const usedSlots = sector.totship1build * 3 + 
                          sector.totship2build * 5 + 
                          sector.totship3build * 1 + 
                          sector.totship4build * 8 + 
                          sector.totship5build * 12 + 
                          sector.totship6build * 7 +
                          sector.totship7build * 20 +
                          sector.totship8build * 5 +
                          sector.totship9build * 15;
            
            const availableSlots = sector.shipyardlvl - usedSlots;
            
            // Check if sector has enough build slots for the requested ship
            let requiredSlots = 0;
            let metalCost = 0;
            let shipField = '';
            
            switch (shipId) {
                case 1: // Frigate
                    requiredSlots = 3;
                    metalCost = 300;
                    shipField = 'totship1build';
                    break;
                case 2: // Destroyer
                    requiredSlots = 5;
                    metalCost = 500;
                    shipField = 'totship2build';
                    break;
                case 3: // Scout
                    requiredSlots = 1;
                    metalCost = 200;
                    shipField = 'totship3build';
                    break;
                case 4: // Cruiser
                    requiredSlots = 8;
                    metalCost = 900;
                    shipField = 'totship4build';
                    break;
                case 5: // Battleship
                    requiredSlots = 12;
                    metalCost = 1600;
                    shipField = 'totship5build';
                    break;
                case 6: // Colony Ship
                    requiredSlots = 7;
                    metalCost = 1000;
                    shipField = 'totship6build';
                    break;
                case 7: // Dreadnought
                    requiredSlots = 20;
                    metalCost = 4400;
                    shipField = 'totship7build';
                    break;
                case 8: // Intruder
                    requiredSlots = 5;
                    metalCost = 1200;
                    shipField = 'totship8build';
                    break;
                case 9: // Carrier
                    requiredSlots = 15;
                    metalCost = 3000;
                    shipField = 'totship9build';
                    // Additional requirement: Warp gate
                    if (sector.warpgate !== 1) {
                        connection.sendUTF('You need a Warp Gate in this sector to build Carriers.');
                        return;
                    }
                    break;
                default:
                    connection.sendUTF('Invalid ship type');
                    return;
            }
            
            if (availableSlots >= requiredSlots && sector.ownerid == connection.name) {
                // Check if player has enough resources
                db.query(`SELECT * FROM players${connection.gameid} WHERE playerid = ? LIMIT 1`, [connection.name], 
                    (err, playerResults) => {
                        if (err) {
                            console.error("Error retrieving player data:", err);
                            return;
                        }
                        
                        if (playerResults.length === 0) {
                            connection.sendUTF('Error: Player data not found');
                            return;
                        }
                        
                        const player = playerResults[0];
                        
                        if (player.metal >= metalCost) {
                            // Build ship
                            db.query(`UPDATE players${connection.gameid} SET metal = metal - ? WHERE playerid = ?`, [metalCost, connection.name]);
                            db.query(`UPDATE map${connection.gameid} SET ${shipField} = ${shipField} + 1 WHERE sectorid = ?`, [connection.sectorid]);
                            
                            connection.sendUTF('You started construction on a ship in this sector.');
                            updateResources(connection);
                            updateAllSectors(connection.gameid, connection);
                        } else {
                            connection.sendUTF('You do not have enough resources for this purchase.');
                        }
                    }
                );
            } else if (sector.ownerid != connection.name) {
                connection.sendUTF('You do not own this sector. Cannot build ship.');
            } else {
                connection.sendUTF('Your shipyard does not have enough free space to build this ship. Please upgrade it accordingly.');
            }
        }
    );
}

function buyTech(message, connection) {
    const techId = parseInt(message.utf8Data.split("//buytech:")[1]);
    
    console.log(`Player ${connection.name} is trying to buy tech: ${techId}`);
    
    // Get player's current tech levels and resources
    db.query(`SELECT * FROM players${connection.gameid} WHERE playerid = ? LIMIT 1`, [connection.name], 
        (err, results) => {
            if (err) {
                console.error("Error retrieving player data:", err);
                return;
            }
            
            if (results.length === 0) {
                connection.sendUTF('Error: Player data not found');
                return;
            }
            
            const player = results[0];
            
            // Calculate tech cost based on current level
            let techCost = 0;
            const techField = `tech${techId}`;
            const currentLevel = player[techField] || 0;
            
            // Special calculation for terraforming (tech7)
            if (techId === 7) {
                techCost = Math.round(Math.pow(8, currentLevel + 2) + 36);
            } else {
                techCost = Math.round(Math.pow(1.5, currentLevel + 13) + 5);
            }
            
            // Check if player has enough research
            if (player.research >= techCost) {
                // Purchase tech
                db.query(`UPDATE players${connection.gameid} SET 
                    research = research - ?, 
                    ${techField} = ${techField} + 1
                    WHERE playerid = ?`, 
                    [techCost, connection.name]
                );
                
                connection.sendUTF("Tech purchased.");
                updateResources(connection);
            } else {
                connection.sendUTF(`You do not have enough research to get this tech. Needed: ${techCost}`);
            }
        }
    );
}

// Export utility functions for use in other modules
module.exports = {
    updateAllSectors,
    updateSector2,
    updateResources,
    broadcastToGame,
    colonizePlanet,
    buyTech,
    buyShip,
    buyBuilding,
    probeSector,
    moveFleet,
    handleGameStart,
    nextTurn
};