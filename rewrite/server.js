// WebSocket Server for Galaxy Conquest
const WebSocketServer = require('websocket').server;
const http = require('http');
const mysql = require('mysql');

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
const gameMap = {};

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
        } else if (data.indexOf("//sector ") === 0) {
            updateSector(data, connection);
        } else if (data.indexOf("//mmove:") === 0) {
            surroundShips(data, connection);
        } else if (data.indexOf("//sendmmf:") === 0) {
            preMoveFleet(data, connection);
        } else if (data.indexOf("//update") === 0) {
            updateResources(connection);
        } else {
            // Regular chat message
            console.log(`Received chat message of ${data.length} characters`);
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
        broadcastToGame(connection, "The game is starting in 10 seconds");
        broadcastToGame(connection, "start10:");
        
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

// Include the rest of the game mechanics functions here (gameMechanics, updateResources, etc.)
// They will need refactoring from the existing code

// Export for testing purposes
module.exports = {
    server,
    wsServer,
    clients,
    gameTimer,
    clientMap,
    turns,
    gameMap
};