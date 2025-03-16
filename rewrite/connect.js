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
let server = "ws://127.0.0.1:1337";
let websocket;
let turnTimer = 180; // 3 minutes per turn
let turnInterval;
let chatID = 1;
let chatHistory = [];
let chatHistoryTime = [];
let timeSinceCounter;
let chatfadetimer;
let chatfadebegin;
let chatfadevalue = 100;

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

function sendChat(event) {
    if (event) event.preventDefault();
    const chatInput = document.getElementById("chat");
    if (chatInput && chatInput.value.trim() !== "") {
        websocket.send(chatInput.value);
        chatInput.value = "";
    }
}

function fade(from, to, element) {
    if (!element) return;
    
    let opacity = parseInt(from, 16);
    const targetOpacity = parseInt(to, 16);
    const diff = (targetOpacity - opacity) / 10;
    
    let currentValue = opacity;
    const fadeInterval = setInterval(() => {
        currentValue += diff;
        if ((diff > 0 && currentValue >= targetOpacity) || 
            (diff < 0 && currentValue <= targetOpacity)) {
            clearInterval(fadeInterval);
            currentValue = targetOpacity;
        }
        
        const hexColor = Math.round(currentValue).toString(16).padStart(2, '0');
        element.setAttribute("fill", `#${hexColor}${hexColor}${hexColor}`);
    }, 50);
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
        showMultiMoveOptions(message);
    }
    // New round
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
    else if (message.indexOf("sector:") === 0) {
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
    else if (message.indexOf("resources:") === 0) {
        updateResources(message);
    }
    // Chat or other messages
    else {
        if (window.ChatSystem) {
            window.ChatSystem.displayMessage(message);
        } else {
            displayChatMessage(message);
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
    const parts = message.split(':');
    if (parts.length < 8) return;
    
    // Parse sector data
    const sectorData = {
        id: parts[1],
        owner: parts[3],
        type: parseInt(parts[5]),
        artifact: parseInt(parts[7]),
        metalBonus: parseFloat(parts[9]),
        crystalBonus: parseFloat(parts[11]),
        terraformLevel: parseInt(parts[13])
    };
    
    // Store in game state
    GAME_STATE.selectedSectorData = sectorData;
    GAME_STATE.selectedSector = parseInt(sectorData.id, 16);
    
    // Update UI
    if (window.GameUI && window.GameUI.updateSectorDisplay) {
        window.GameUI.updateSectorDisplay(sectorData);
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
    const parts = message.split(':');
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
    
    if (window.GalaxyMap) {
        let status = window.GalaxyMap.SECTOR_STATUS.OWNED;
        
        if (indicator === 'A') {
            status = window.GalaxyMap.SECTOR_STATUS.HAZARD;
        } else if (indicator === 'BH') {
            status = window.GalaxyMap.SECTOR_STATUS.BLACKHOLE;
        } else if (indicator === 'C') {
            status = window.GalaxyMap.SECTOR_STATUS.COLONIZED;
        } else if (indicator === 'H') {
            status = window.GalaxyMap.SECTOR_STATUS.HOMEWORLD;
        } else if (indicator === 'W') {
            status = window.GalaxyMap.SECTOR_STATUS.WARPGATE;
        }
        
        window.GalaxyMap.updateSectorStatus(sectorId, status, {
            fleetSize: fleetSize,
            indicator: indicator
        });
    }
}

function showMultiMoveOptions(message) {
    const parts = message.split(':');
    if (parts.length < 2) return;
    
    const targetSector = parts[1];
    const multiMoveDiv = document.getElementById('multiMove');
    if (!multiMoveDiv) return;
    
    // Update sector display
    const sectorDisplay = document.getElementById('sectorofattack');
    if (sectorDisplay) {
        sectorDisplay.textContent = targetSector;
    }
    
    // Clear existing options
    const shipList = document.getElementById('shipsFromNearBy');
    if (shipList) {
        while (shipList.options.length > 0) {
            shipList.remove(0);
        }
        
        // Add ships from nearby sectors
        let i = 2;
        while (i < parts.length) {
            const sectorId = parts[i++];
            if (!sectorId) break;
            
            // Next 9 values are ship counts for the sector
            const ships = [];
            for (let j = 0; j < 9; j++) {
                ships.push(parseInt(parts[i++]) || 0);
            }
            
            // Ship type names
            const shipNames = [
                "Frigate", "Destroyer", "Scout", "Cruiser", 
                "Battleship", "Colony Ship", "Dreadnought", 
                "Intruder", "Carrier"
            ];
            
            // Add options for each ship type
            ships.forEach((count, idx) => {
                if (count > 0) {
                    for (let k = 1; k <= count; k++) {
                        const option = document.createElement('option');
                        option.value = `${sectorId}:${idx + 1}:${k}`;
                        option.text = `${shipNames[idx]} ${k} in sector ${sectorId}`;
                        shipList.add(option);
                    }
                }
            });
        }
    }
    
    // Show dialog
    multiMoveDiv.style.display = 'block';
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

function displayChatMessage(message) {
    // Update chat display
    const logElement = document.getElementById('log');
    if (logElement) {
        logElement.innerHTML = message + "<br>";
        
        // Trim log if it gets too long
        if (logElement.innerHTML.length > 1500) {
            logElement.innerHTML = "..." + logElement.innerHTML.substring(
                logElement.innerHTML.length - 1500,
                logElement.innerHTML.length
            );
        }
        
        // Save message to history
        pushLog();
        
        // Scroll to bottom
        logElement.scrollTop = logElement.scrollHeight;
    }
    
    // Add fade effect
    startchatfade();
}

function pushLog() {
    const d = new Date();
    const timeSince = document.getElementById('timeSince');
    if (timeSince) timeSince.innerHTML = "0 seconds ago";
    
    chatHistoryTime.push(d.getTime());
    chatHistory.push(document.getElementById("log").innerHTML);
    
    clearInterval(timeSinceCounter);
    timeSinceCounter = setInterval(updateTimeLog, 1000);
    chatID = 1;
}

function showChatHistory() {
    chatID++;
    if (chatID > chatHistoryTime.length) {
        chatID = chatHistoryTime.length;
    }
    
    const d = new Date();
    const logElement = document.getElementById("log");
    const timeSince = document.getElementById('timeSince');
    
    if (logElement && chatHistory.length >= chatID) {
        logElement.innerHTML = chatHistory[chatHistory.length - chatID];
    }
    
    if (timeSince && chatHistoryTime.length >= chatID) {
        timeSince.innerHTML = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - chatID]) / 1000) + " seconds ago";
    }
    
    startchatfade();
}

function updateTimeLog() {
    const d = new Date();
    const timeSince = document.getElementById('timeSince');
    if (timeSince && chatHistoryTime.length >= chatID) {
        timeSince.innerHTML = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - chatID]) / 1000) + " seconds ago";
    }
}

function startchatfade() {
    clearTimeout(chatfadetimer);
    clearTimeout(chatfadebegin);
    
    const updates = document.getElementById("empireupdates");
    if (!updates) return;
    
    setalpha(updates, 100);
    chatfadevalue = 100;
    chatfadebegin = setTimeout(() => chatFade(updates), 16000);
}

function chatFade(element) {
    if (chatfadevalue > 0) {
        chatfadevalue -= 2;
        setalpha(element, chatfadevalue);
        chatfadetimer = setTimeout(() => chatFade(element), 60);
    }
}

function setalpha(element, opacity) {
    if (!element) return;
    element.style.opacity = opacity / 100;
}

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
    websocket.send("//sector " + sectorId);
    
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
window.sendChat = sendChat;
window.sendmmf = sendmmf;
window.changeSector = changeSector;