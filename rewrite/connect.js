// WebSocket server connection
const server = "ws://127.0.0.1:1337";
let websocket;
let turnTimer = 180; // 3 minutes per turn
let turnInterval;
let chatID = 1;
let chatHistory = [];
let chatHistoryTime = [];
let timeSinceCounter;

// Initialize WebSocket connection
function initializeWebSocket() {
    // Support for Firefox
    if (window.MozWebSocket) {
        window.WebSocket = window.MozWebSocket;
    }

    // Create new WebSocket connection
    websocket = new WebSocket(server);
    
    // Connection established
    websocket.onopen = function(evt) {
        const authUserID = authUser();
        document.getElementById("chat").style.visibility = 'visible';
        document.getElementById("status").innerHTML = "Connected" + (authUserID ? " (" + authUserID + ")" : "");
        console.log("WebSocket connection established");
    };
    
    // Message received
    websocket.onmessage = function(evt) {
        handleWebSocketMessage(evt.data);
    };
    
    // Connection error
    websocket.onerror = function(evt) {
        document.getElementById("status").innerHTML = "ERROR: " + evt.data;
        console.error("WebSocket error:", evt);
    };
    
    // Connection closed
    websocket.onclose = function(evt) {
        document.getElementById("status").innerHTML = "Connection closed";
        console.log("WebSocket connection closed");
        
        // Attempt to reconnect after 5 seconds
        setTimeout(function() {
            console.log("Attempting to reconnect...");
            initializeWebSocket();
        }, 5000);
    };
}

// Handle incoming WebSocket messages
function handleWebSocketMessage(message) {
    console.log("Received message:", message);
    
    // Connected users count
    if (message.indexOf("$^$") === 0) {
        document.getElementById("connected").innerHTML = message.split("$^$")[1];
    }
    // Battle information
    else if (message.indexOf("battle:") === 0) {
        handleBattle(message);
    }
    // Lobby information
    else if (message.indexOf("lobby::") === 0) {
        // Handle lobby information
    }
    // Max build notification
    else if (message.indexOf("maxbuild::") === 0) {
        handleMaxBuild(message);
    }
    // Player list
    else if (message.indexOf("pl:") === 0) {
        handlePlayerList(message);
    }
    // Probe only notification
    else if (message.indexOf("probeonly:") === 0) {
        handleProbeOnly(message);
    }
    // Multiple move options
    else if (message.indexOf("mmoptions:") === 0) {
        mmfleet(message);
    }
    // New round
    else if (message === "newround:") {
        handleNewRound();
    }
    // Owned sector information
    else if (message.indexOf("ownsector:") === 0) {
        colorSector(message);
    }
    // Fleet information
    else if (message.indexOf("fleet:") === 0) {
        updateFleet(message);
    }
    // Technology information
    else if (message.indexOf("tech:") === 0) {
        modTech(message);
    }
    // 10 second countdown
    else if (message === "start10:") {
        handleStart10();
    }
    // Sector information
    else if (message.indexOf("sector:") === 0) {
        getSector(message);
    }
    // Generic information
    else if (message.indexOf("info:") === 0) {
        setInfo(message);
    }
    // Update buildings
    else if (message.indexOf("ub:") === 0) {
        updateBuilds(message);
    }
    // Resources update
    else if (message.indexOf("resources:") === 0) {
        getResources(message);
    }
    // Chat or other messages
    else {
        handleChatMessage(message);
    }
}

// Handler functions for different message types

function handleBattle(message) {
    // Parse battle data and display battle animation
    battle(message);
}

function handleMaxBuild(message) {
    const buildingType = message.split("::")[1];
    document.getElementById("bb" + buildingType).style.background = "#222";
}

function handlePlayerList(message) {
    const players = message.split(":");
    for (let i = 1; i < players.length; i++) {
        if (players[i]) {
            document.getElementById("player" + i + "name").innerHTML = "Player " + players[i];
        }
    }
}

function handleProbeOnly(message) {
    const sectorId = message.split(":")[1];
    if (confirm('You do not control this sector. Would you like to use a probe to scan it? (cost: 300 Crystal)')) {
        websocket.send("//probe:" + sectorId);
    }
}

function handleNewRound() {
    document.getElementById("nextTurnText").innerHTML = 'Next Turn';
    document.getElementById("turnRedFlashWhenLow").innerHTML = '180s';
    turnTimer = 180;
    clearInterval(turnInterval);
    turnInterval = setInterval(updateTimer, 1000);
}

function handleStart10() {
    document.getElementById("nextTurnText").innerHTML = '';
    document.getElementById("turnRedFlashWhenLow").innerHTML = '10s';
    turnTimer = 10;
    clearInterval(turnInterval);
    turnInterval = setInterval(updateTimer, 1000);
}

function handleChatMessage(message) {
    startchatfade();
    document.getElementById("log").innerHTML = message + "<br>";
    pushLog();
    
    // Trim log if it gets too long
    if (document.getElementById("log").innerHTML.length > 1500) {
        document.getElementById("log").innerHTML = "</font>..." + 
            document.getElementById("log").innerHTML.substring(
                document.getElementById("log").innerHTML.length - 1500,
                document.getElementById("log").innerHTML.length
            );
    }
    
    // Scroll to bottom
    document.getElementById("log").scrollTop = document.getElementById("log").scrollHeight;
}

// Game action functions

function nextTurn() {
    websocket.send("//start");
}

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

function buyTech(techId) {
    websocket.send("//buytech:" + techId);
}

function buyShip(shipId) {
    websocket.send("//buyship:" + shipId);
}

function buyBuilding(buildingId) {
    websocket.send("//buybuilding:" + buildingId);
}

function sendChat() {
    event.preventDefault();
    const chatInput = document.getElementById("chat");
    websocket.send(chatInput.value);
    chatInput.value = "";
}

function changeSector(sectorId) {
    websocket.send("//sector " + sectorId);
}

// Authentication function
function authUser() {
    // This function should be defined elsewhere in the code
    // It authenticates the user with the server
    if (typeof window.authUser === 'function') {
        return window.authUser();
    } else {
        console.warn("authUser function not defined");
        return null;
    }
}

// Initialize WebSocket when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeWebSocket();
});