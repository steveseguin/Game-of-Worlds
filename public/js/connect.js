/**
 * connect.js - Client-side WebSocket connection and game state management
 * 
 * Handles the WebSocket connection to the server, message parsing,
 * and updating the UI based on server responses. This file also contains
 * functions for sending commands to the server.
 * 
 * This module is client-side only and does not directly access the database.
 * It serves as the main communication layer between client and server.
 * 
 * Dependencies:
 * - Used by game.js for game initialization
 * - Uses GameUI, BattleSystem, GalaxyMap for UI updates
 */
// Get WebSocket URL based on current location
let server = window.location.protocol === 'https:' 
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`;
let websocket;
let turnTimer = 180; // 3 minutes per turn
let turnInterval;

// Game state
const GAME_STATE = {
    player: {
        resources: {
            metal: 0,
            crystal: 0,
            research: 0
        },
        techLevels: {}
    },
    selectedSector: null,
    selectedSectorData: null
};

// Update timer display
function updateTimer() {
    if (turnTimer <= 0) {
        document.getElementById("turnRedFlashWhenLow").innerHTML = " (..loading)";
    } else {
        document.getElementById("turnRedFlashWhenLow").innerHTML = turnTimer + "s";
        turnTimer = turnTimer - 1;
        
        // Flash when time is running low
        if (turnTimer < 30) {
            document.getElementById("turnRedFlashWhenLow").style.color = turnTimer % 2 === 0 ? "#FF0000" : "#FFFFFF";
        }
    }
}

// Game action functions
function nextTurn() {
    websocket.send("//start");
}

function buyTech(techId) {
    websocket.send("//buytech:" + techId);
}

function buyShip(shipId) {
    websocket.send("//buyship:" + shipId);
}

function buyBuilding(buildingId) {
    websocket.send("//buybuilding:" + buildingId);
}

// Authentication function
function authUser() {
    const userId = getCookie("userId");
    const tempKey = getCookie("tempKey");
    
    if (userId && tempKey) {
        websocket.send("//auth:" + userId + ":" + tempKey);
        return userId;
    }
    
    return null;
}

function initializeWebSocket() {
    // Use the current host for connection if available
    const serverUrl = `ws://${window.location.hostname}:1337`;
    websocket = new WebSocket(serverUrl);
    
    websocket.onopen = function() {
        console.log("Connection established");
        document.getElementById("status").innerHTML = "Connected";
        
        // Auto-authenticate if credentials exist
        authUser();
    };
    
    websocket.onmessage = function(evt) {
        handleWebSocketMessage(evt.data);
    };
    
    websocket.onerror = function(evt) {
        console.error("WebSocket error:", evt);
        document.getElementById("status").innerHTML = "Connection error";
    };
    
    websocket.onclose = function() {
        console.log("Connection closed");
        document.getElementById("status").innerHTML = "Disconnected";
        document.getElementById("lobbyWindow").style.display = "block";
        
        // Auto-reconnect after delay
        setTimeout(function() {
            if (window.WebSocket && document.getElementById("lobbyWindow").style.display === "block") {
                initializeWebSocket();
            }
        }, 5000);
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
    console.log("Received message:", message);
    
    // Connected users count
    if (message.indexOf("$^$") === 0) {
        document.getElementById("connected").innerHTML = message.split("$^$")[1];
    }
    // Battle information
    else if (message.indexOf("battle:") === 0) {
        if (window.BattleSystem) {
            window.BattleSystem.createBattleVisualization(message);
        }
    } 
    // Lobby information
    else if (message.indexOf("lobby::") === 0) {
        // Game not started yet
        if (window.ChatSystem) {
            window.ChatSystem.displayMessage("Waiting for game to start...");
        }
    }
    // Game started
    else if (message.indexOf("startgame::") === 0) {
        // Hide lobby and show game
        document.getElementById("lobbyWindow").style.display = "none";
        document.getElementById("gameWindow").style.display = "block";
        
        // Initialize game UI
        if (window.GameUI && window.GameUI.initialize) {
            window.GameUI.initialize();
        }
        
        // Request initial game state
        websocket.send("//update");
    }
    // Max build notification
    else if (message.indexOf("maxbuild::") === 0) {
        const buildingType = message.split("::")[1];
        const buildingBtn = document.getElementById(`bb${buildingType}`);
        if (buildingBtn) {
            buildingBtn.style.background = '#222';
        }
    }
    // Player list
    else if (message.indexOf("pl:") === 0) {
        updatePlayerList(message);
    }
    // Probe only notification
    else if (message.indexOf("probeonly:") === 0) {
        const sectorId = message.split(":")[1];
        if (confirm('You do not control this sector. Would you like to use a probe to scan it? (cost: 300 Crystal)')) {
            websocket.send("//probe:" + sectorId);
        }
    }
    // Multiple move options
    else if (message.indexOf("mmoptions:") === 0) {
        if (window.GameUI && window.GameUI.showMultiMoveOptions) {
            const parts = message.split(':');
            const targetSector = parts[1];
            const shipsData = message.substring(message.indexOf(targetSector) + targetSector.length);
            window.GameUI.showMultiMoveOptions(targetSector, shipsData);
        }
    }
    // New turn
    else if (message.indexOf("newturn::") === 0) {
        const turnNumber = message.split("::")[1];
        document.getElementById("nextTurnText").innerHTML = `Turn ${turnNumber}`;
        document.getElementById("turnRedFlashWhenLow").innerHTML = '180s';
        turnTimer = 180;
        clearInterval(turnInterval);
        turnInterval = setInterval(updateTimer, 1000);
    }
    // New round (legacy)
    else if (message === "newround:") {
        document.getElementById("nextTurnText").innerHTML = 'Next Turn';
        document.getElementById("turnRedFlashWhenLow").innerHTML = '180s';
        turnTimer = 180;
        clearInterval(turnInterval);
        turnInterval = setInterval(updateTimer, 1000);
    }
    // Owned sector information
    else if (message.indexOf("ownsector:") === 0) {
        updateOwnedSector(message);
    }
    // Fleet information
    else if (message.indexOf("fleet:") === 0) {
        updateFleet(message);
    }
    // Technology information
    else if (message.indexOf("tech:") === 0) {
        updateTechLevels(message);
    }
    // 10 second countdown
    else if (message === "start10:") {
        document.getElementById("nextTurnText").innerHTML = '';
        document.getElementById("turnRedFlashWhenLow").innerHTML = '10s';
        turnTimer = 10;
        clearInterval(turnInterval);
        turnInterval = setInterval(updateTimer, 1000);
    }
    // Sector information
    else if (message.indexOf("sector::") === 0) {
        updateSectorInfo(message);
    }
    // Generic information
    else if (message.indexOf("info:") === 0) {
        updateSectorStatus(message);
    }
    // Update buildings
    else if (message.indexOf("ub:") === 0) {
        updateBuildings(message);
    }
    // Resources update
    else if (message.indexOf("resources::") === 0) {
        updateResources(message);
    }
    // Chat or other messages
    else {
        if (window.ChatSystem) {
            window.ChatSystem.displayMessage(message);
        }
    }
}

function updateBuildings(message) {
    const parts = message.split(':');
    if (parts.length < 7) return;
    
    // Parse building levels
    const buildings = {
        metalExtractor: parseInt(parts[1]) || 0,
        crystalRefinery: parseInt(parts[2]) || 0,
        researchAcademy: parseInt(parts[3]) || 0,
        spaceport: parseInt(parts[4]) || 0,
        orbitalTurret: parseInt(parts[5]) || 0,
        warpgate: parseInt(parts[6]) || 0
    };
    
    // Store in selected sector data
    if (GAME_STATE.selectedSectorData) {
        GAME_STATE.selectedSectorData.buildings = buildings;
    }
    
    // Update UI
    if (window.GameUI && window.GameUI.updateBuildings) {
        window.GameUI.updateBuildings(buildings);
    }
}

function updateSectorInfo(message) {
    const parts = message.split('::');
    if (parts.length < 3) return;
    
    const sectorId = parseInt(parts[1]);
    try {
        const data = JSON.parse(parts[2]);
        
        // Parse sector data
        const sectorData = {
            id: sectorId,
            owner: data.sector.owner,
            type: data.sector.type,
            x: data.sector.x,
            y: data.sector.y,
            ships: data.ships || [],
            buildings: data.buildings || []
        };
        
        // Store in game state
        GAME_STATE.selectedSectorData = sectorData;
        GAME_STATE.selectedSector = sectorId;
        
        // Update UI
        if (window.GameUI && window.GameUI.updateSectorDisplay) {
            window.GameUI.updateSectorDisplay(sectorData);
        }
        
        // Update ship counts
        if (window.GameUI && window.GameUI.updateFleetDisplay) {
            window.GameUI.updateFleetDisplay(sectorData.ships);
        }
    } catch (e) {
        console.error('Error parsing sector data:', e);
    }
}

function updateSectorStatus(message) {
    const parts = message.split(':');
    if (parts.length < 3) return;
    
    const sectorId = parseInt(parts[1], 16);
    const sectorType = parseInt(parts[2]);
    
    // Update map visualization
    if (window.GalaxyMap) {
        let status = window.GalaxyMap.SECTOR_STATUS.ENEMY;
        
        if (sectorType === 2) {
            status = window.GalaxyMap.SECTOR_STATUS.BLACKHOLE;
        } else if (sectorType === 1) {
            status = window.GalaxyMap.SECTOR_STATUS.HAZARD;
        }
        
        window.GalaxyMap.updateSectorStatus(sectorId, status);
    }
}

function updateResources(message) {
    const parts = message.split('::');
    if (parts.length < 4) return;
    
    // Parse resource values
    const resources = {
        metal: parseInt(parts[1]) || 0,
        crystal: parseInt(parts[2]) || 0,
        research: parseInt(parts[3]) || 0
    };
    
    // Update game state
    GAME_STATE.player.resources = resources;
    
    // Update UI
    if (window.GameUI && window.GameUI.updateResources) {
        window.GameUI.updateResources(resources.metal, resources.crystal, resources.research);
    }
}

function updateTechLevels(message) {
    const parts = message.split(':');
    if (parts.length < 10) return;
    
    // Update tech levels in game state
    for (let i = 1; i <= 9; i++) {
        GAME_STATE.player.techLevels[i] = parseInt(parts[i]) || 0;
    }
}

function updateFleet(message) {
    const parts = message.split(':');
    if (parts.length < 13) return;
    
    // Parse fleet data
    const fleet = {
        ship1: parseInt(parts[1]) || 0,
        ship2: parseInt(parts[2]) || 0,
        ship3: parseInt(parts[3]) || 0,
        ship4: parseInt(parts[4]) || 0,
        ship5: parseInt(parts[5]) || 0,
        ship6: parseInt(parts[6]) || 0,
        ship7: parseInt(parts[7]) || 0,
        ship8: parseInt(parts[8]) || 0,
        ship9: parseInt(parts[9]) || 0,
        building1: parseInt(parts[10]) || 0,
        building2: parseInt(parts[11]) || 0,
        building3: parseInt(parts[12]) || 0,
        building4: parseInt(parts[13]) || 0,
        building5: parseInt(parts[14]) || 0,
        building6: parseInt(parts[15]) || 0,
        building7: parseInt(parts[16]) || 0,
        building8: parseInt(parts[17]) || 0,
        building9: parseInt(parts[18]) || 0
    };
    
    // Update UI
    if (window.GameUI && window.GameUI.updateFleet) {
        window.GameUI.updateFleet(fleet);
    }
}

function updateOwnedSector(message) {
    const parts = message.split(':');
    if (parts.length < 3) return;
    
    const sectorId = parseInt(parts[1], 16);
    const fleetSize = parseInt(parts[2]) || 0;
    const indicator = parts[3] || '';
    
    if (window.GameUI && window.GameUI.updateOwnedSector) {
        window.GameUI.updateOwnedSector(sectorId, fleetSize, indicator);
    }
}

function updatePlayerList(message) {
    const players = message.split(":");
    for (let i = 1; i < players.length; i++) {
        if (players[i]) {
            const playerNameElement = document.getElementById(`player${i}name`);
            if (playerNameElement) {
                playerNameElement.textContent = players[i];
            }
        }
    }
}

// Send multiple move fleet command
function sendmmf() {
    const sectorId = document.getElementById('sectorofattack').innerHTML;
    const shipList = document.getElementById('shipsFromNearBy');
    
    if (!sectorId || !shipList) return;
    
    let message = sectorId;
    let totalShips = 0;
    
    // Gather selected ships
    for (let i = 0; i < shipList.options.length; i++) {
        if (shipList.options[i].selected) {
            message += ":" + shipList.options[i].value;
            totalShips++;
        }
    }
    
    if (totalShips === 0) {
        alert("No ships selected");
        return;
    }
    
    // Send command to server
    websocket.send("//sendmmf:" + message);
    document.getElementById('multiMove').style.display = 'none';
}

function changeSector(sectorId) {
    // Request sector information from server
    websocket.send("//sector:" + sectorId);
    
    // Update UI to indicate selected sector
    if (window.GalaxyMap && window.GalaxyMap.selectSector) {
        window.GalaxyMap.selectSector(parseInt(sectorId, 16));
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Export functions that need to be globally accessible
window.initializeWebSocket = initializeWebSocket;
window.nextTurn = nextTurn;
window.buyTech = buyTech;
window.buyShip = buyShip;
window.buyBuilding = buyBuilding;
window.sendmmf = sendmmf;
window.changeSector = changeSector;