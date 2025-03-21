/**
 * index.js - Server-side entry point
 * 
 * Main entry point for the Galaxy Conquest server. Sets up HTTP and WebSocket servers,
 * handles file serving, database connection, and initializes the game server.
 * 
 * This module is server-side and has full access to database connections
 * and server-side game state. It coordinates all server functionality.
 * 
 * Dependencies:
 * - Depends on server.js for WebSocket server functionality
 * - Uses map.js, combat.js, tech.js for game mechanics
 */
const WebSocketServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const url = require('url');

// Import game mechanics
const mapSystem = require('./lib/map');
const combatSystem = require('./lib/combat');
const techSystem = require('./lib/tech');


// Game state
const clients = [];
const gameTimer = {};
const clientMap = {};
const turns = {};
const activeGames = {};

// Configuration
const PORT = process.env.PORT || 1337;
const DB_CONFIG = {
    host: '127.0.0.1',
    user: 'root',
    password: 'bitnami',
    database: 'game'
};

function connectToDatabase() {
    const db = mysql.createConnection(DB_CONFIG);
    
    db.connect(err => {
        if (err) {
            console.error('Error connecting to database:', err);
            setTimeout(connectToDatabase, 5000); // Try to reconnect after 5 seconds
            return;
        }
        console.log('Connected to database');
    });
    
    db.on('error', err => {
        console.error('Database error:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            connectToDatabase();
        } else {
            throw err;
        }
    });
    
    return db;
}

const db = connectToDatabase();

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
    
    // Parse URL
    const parsedUrl = url.parse(request.url);
    let pathname = parsedUrl.pathname;
    
    // Default to index.html for root path
    if (pathname === '/') {
        pathname = '/game.html';
    }
    
    // Get the file extension
    const ext = path.parse(pathname).ext || '.html';
    
    // Map file extensions to content types
    const contentTypeMap = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };
    
    // Get content type
    const contentType = contentTypeMap[ext] || 'text/plain';
    
    // Read the file
    fs.readFile(path.join(__dirname, pathname.substr(1)), (err, data) => {
        if (err) {
            // If file not found, check if it's in parent directory
            fs.readFile(path.join(__dirname, '..', pathname.substr(1)), (err2, data2) => {
                if (err2) {
                    // File not found
                    response.writeHead(404);
                    response.end('File not found');
                    return;
                }
                
                // File found in parent directory
                response.writeHead(200, {'Content-Type': contentType});
                response.end(data2);
            });
            return;
        }
        
        // File found
        response.writeHead(200, {'Content-Type': contentType});
        response.end(data);
    });
});

// Start HTTP server
server.listen(PORT, () => {
    console.log(`${new Date()} Server is listening on port ${PORT}`);
});

// Create WebSocket server
const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});


server.on('request', (request, response) => {
    // Parse URL
    const parsedUrl = url.parse(request.url);
    let pathname = parsedUrl.pathname;
    
    // Default to index.html for root path
    if (pathname === '/') {
        pathname = '/index.html';
    }
    
    // Get file extension
    const ext = path.parse(pathname).ext || '.html';
    
    // Content type map
    const contentTypeMap = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif'
    };
    
    const contentType = contentTypeMap[ext] || 'text/plain';
    
    // Try to read from rewrite directory first, then from parent directory
    fs.readFile(path.join(__dirname, pathname.substr(1)), (err, data) => {
        if (err) {
            fs.readFile(path.join(__dirname, '..', pathname.substr(1)), (err2, data2) => {
                if (err2) {
                    response.writeHead(404);
                    response.end('File not found');
                    return;
                }
                response.writeHead(200, {'Content-Type': contentType});
                response.end(data2);
            });
            return;
        }
        response.writeHead(200, {'Content-Type': contentType});
        response.end(data);
    });
});

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
            handleGameStart(connection);
            break;
        case "colonize":
            colonizePlanet(connection);
            break;
        case "buytech":
            buyTech(data, connection);
            break;
        case "probe":
            probeSector(data, connection);
            break;
        case "buyship":
            buyShip(data, connection);
            break;
        case "buybuilding":
            buyBuilding(data, connection);
            break;
        case "move":
            moveFleet(data, connection);
            break;
        case "sector":
            updateSector(data, connection);
            break;
        case "mmove":
            surroundShips(data, connection);
            break;
        case "sendmmf":
            preMoveFleet(data, connection);
            break;
        case "update":
            updateResources(connection);
            break;
		case "joingame":
            handleJoinGame(connection);
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