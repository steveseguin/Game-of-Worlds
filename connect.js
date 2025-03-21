// WebSocket server connection
const server = "ws://127.0.0.1:1337";
let websocket;
let turnTimer = 180; // 3 minutes per turn
let turnInterval;
let chatID = 1;
let chatHistory = [];
let chatHistoryTime = [];
let timeSinceCounter;

// Game state object to track player data
const GAME_STATE = {
    player: {
        resources: {
            metal: 0,
            crystal: 0,
            research: 0
        

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

// Time since and chat history functions
function pushLog() {
    const d = new Date();
    document.getElementById('timeSince').innerHTML = "0 seconds ago.";
    chatHistoryTime.push(d.getTime());
    chatHistory.push(document.getElementById("log").innerHTML);
    clearInterval(timeSinceCounter);
    timeSinceCounter = setInterval("timelogupdate(1)", 1000);
    chatID = 1;
}

function showChatHistory() {
    chatID++;
    if (chatID > chatHistoryTime.length) {
        chatID = chatHistoryTime.length;
    }
    const d = new Date();
    document.getElementById("log").innerHTML = chatHistory[chatHistory.length - chatID];
    document.getElementById('timeSince').innerHTML = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - chatID]) / 1000) + " seconds ago.";
    startchatfade();
}

function timelogupdate() {
    const d = new Date();
    document.getElementById('timeSince').innerHTML = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - parseInt(chatID)]) / 1000) + " seconds ago.";
}

// Chat fade effects
let chatfadetimer;
let chatfadebegin;
let chatfadevalue = 100;

function chatfade(logid) {
    chatfade2();
    function chatfade2() {
        if (chatfadevalue > 0) {
            chatfadevalue -= 2;
            setalpha(logid, chatfadevalue);
            chatfadetimer = setTimeout(chatfade2, 60);
        }
    }
}

function startchatfade() {
    clearTimeout(chatfadetimer);
    clearTimeout(chatfadebegin);
    setalpha(document.getElementById("empireupdates"), 100);
    chatfadevalue = 100;
    chatfadebegin = setTimeout('chatfade(document.getElementById("empireupdates"))', 16000);
}

function setalpha(itemid, opvalue) {
    if (!itemid) return;
    itemid.style.filter = 'alpha(opacity=' + opvalue + ')';
    opvalue = opvalue / 100;
    itemid.style.opacity = opvalue;
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

// Helper to get cookies
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Initialize WebSocket when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeWebSocket();
    
    // Add event listener for next turn button
    const nextTurnBtn = document.getElementById('nextTurnText');
    if (nextTurnBtn && nextTurnBtn.parentElement) {
        nextTurnBtn.parentElement.addEventListener('click', nextTurn);
    }
    
    // Add event listener for chat form
    const chatForm = document.querySelector('form');
    if (chatForm) {
        chatForm.addEventListener('submit', sendChat);
    }
});,
        techLevels: {}
    },
    selectedSector: null,
    selectedSectorData: null
};

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
        battle(message);
    }
    // Lobby information
    else if (message.indexOf("lobby::") === 0) {
        // Game not started yet, no special handling needed
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
        const players = message.split(":");
        for (let i = 1; i < players.length; i++) {
            if (players[i]) {
                const playerNameElement = document.getElementById(`player${i}name`);
                if (playerNameElement) {
                    playerNameElement.textContent = "Player " + players[i];
                }
            }
        }
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
        mmfleet({data: message});
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
        document.getElementById("nextTurnText").innerHTML = '';
        document.getElementById("turnRedFlashWhenLow").innerHTML = '10s';
        turnTimer = 10;
        clearInterval(turnInterval);
        turnInterval = setInterval(updateTimer, 1000);
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
}

// Function to update sector status for enemy sectors
function setInfo(message) {
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
    } else {
        // Legacy update
        const tile = document.getElementById(`tile${sectorId}`);
        if (tile) {
            if (sectorType === 2) {
                tile.setAttribute("stroke", "#000000");
                const colonizedText = document.getElementById(`colonizedtxt${sectorId}`);
                if (colonizedText) {
                    colonizedText.textContent = "BH";
                    colonizedText.style.display = "block";
                }
            } else if (sectorType === 1) {
                tile.setAttribute("stroke", "#644028");
                const colonizedText = document.getElementById(`colonizedtxt${sectorId}`);
                if (colonizedText) {
                    colonizedText.textContent = "A";
                    colonizedText.style.display = "block";
                }
            } else {
                tile.setAttribute("stroke", "#C80000");
                const fleetText = document.getElementById(`txtfleetid${sectorId}`);
                if (fleetText) {
                    fleetText.style.display = "none";
                }
                
                const colonizedText = document.getElementById(`colonizedtxt${sectorId}`);
                if (colonizedText) {
                    colonizedText.style.display = "none";
                }
            }
        }
    }
}

// Function to update sector information based on server data
function getSector(message) {
    const parts = message.split(':');
    if (parts.length < 8) return;
    
    // Get key sector data
    const sectorId = parts[1];
    const ownerId = parts[3];
    const sectorType = parseInt(parts[5]) || 0;
    const artifactType = parseInt(parts[7]) || 0;
    const metalBonus = parseFloat(parts[9]) || 0;
    const crystalBonus = parseFloat(parts[11]) || 0;
    const terraformLevel = parseInt(parts[13]) || 0;
    
    // Update sector ID display
    const sectorIdDisplay = document.getElementById('sectorid');
    if (sectorIdDisplay) {
        sectorIdDisplay.textContent = `Sector ${sectorId}`;
    }
    
    // Update owner display
    const ownerDisplay = document.getElementById('planetowner');
    if (ownerDisplay) {
        ownerDisplay.textContent = `Owner: ${ownerId}`;
    }
    
    // Update sector type display
    const planetTypeDisplay = document.getElementById('planettype');
    if (planetTypeDisplay) {
        let planetTypeText = 'Unknown';
        
        switch (sectorType) {
            case 1: planetTypeText = 'Asteroid Belt'; break;
            case 2: planetTypeText = 'Black Hole'; break;
            case 3: planetTypeText = 'Unstable Star'; break;
            case 4: planetTypeText = 'Brown Dwarf'; break;
            case 5: planetTypeText = 'Small Moon'; break;
            case 6: planetTypeText = 'Micro Planet (4)'; break;
            case 7: planetTypeText = 'Small Planet (6)'; break;
            case 8: planetTypeText = 'Medium Planet (8)'; break;
            case 9: planetTypeText = 'Large Planet (10)'; break;
            case 10: planetTypeText = 'Homeworld Planet (12)'; break;
        }
        
        planetTypeDisplay.textContent = `Type: ${planetTypeText}`;
    }
    
    // Update production bonuses if this is a planet
    if (sectorType > 5) {
        const metalBonusDisplay = document.getElementById('metalbonus');
        if (metalBonusDisplay) {
            let color = 'yellow';
            if (metalBonus < 100) {
                color = 'red';
            } else if (metalBonus >= 200) {
                color = 'green';
            }
            metalBonusDisplay.innerHTML = `Metal Production: <font color="${color}">${metalBonus}%</font>`;
        }
        
        const crystalBonusDisplay = document.getElementById('crystalbonus');
        if (crystalBonusDisplay) {
            let color = 'yellow';
            if (crystalBonus < 100) {
                color = 'red';
            } else if (crystalBonus >= 200) {
                color = 'green';
            }
            crystalBonusDisplay.innerHTML = `Crystal Production: <font color="${color}">${crystalBonus}%</font>`;
        }
        
        const terraformDisplay = document.getElementById('terraformlvl');
        if (terraformDisplay) {
            terraformDisplay.textContent = `Terraform Req: ${terraformLevel}`;
        }
    } else {
        // Non-colonizable sectors
        const metalBonusDisplay = document.getElementById('metalbonus');
        if (metalBonusDisplay) {
            metalBonusDisplay.textContent = 'Metal Production: N/A';
        }
        
        const crystalBonusDisplay = document.getElementById('crystalbonus');
        if (crystalBonusDisplay) {
            crystalBonusDisplay.textContent = 'Crystal Production: N/A';
        }
        
        const terraformDisplay = document.getElementById('terraformlvl');
        if (terraformDisplay) {
            terraformDisplay.textContent = 'Cannot be colonized';
        }
    }
    
    // Update sector image if available
    const sectorImg = document.getElementById('sectorimg');
    if (sectorImg) {
        sectorImg.style.backgroundImage = `url(type${sectorType}.gif)`;
    }
}

// Function to update building levels and costs
function updateBuilds(message) {
    const parts = message.split(':');
    if (parts.length < 7) return;
    
    // Update building levels
    for (let i = 1; i <= 6; i++) {
        const levelDisplay = document.getElementById(`bbb${i}`);
        if (levelDisplay) {
            levelDisplay.textContent = parts[i] || '0';
        }
        
        // Next level display
        const nextLevelDisplay = document.getElementById(`b${i}`);
        if (nextLevelDisplay) {
            nextLevelDisplay.textContent = (parseInt(parts[i]) || 0) + 1;
        }
        
        // Building costs - different calculation for each type
        const costDisplay = document.getElementById(`m${i}`);
        if (costDisplay) {
            let cost = 0;
            
            if (i <= 4) {
                // Extractor, Refinery, Academy, Spaceport
                cost = 100 * ((parseInt(parts[i]) || 0) + 1);
            } else if (i === 5) {
                // Orbital Turret
                cost = 300 * ((parseInt(parts[i]) || 0) + 1);
            } else if (i === 6) {
                // Warp Gate
                cost = 2000;
            }
            
            costDisplay.textContent = cost;
        }
    }
    
    // Special case for warp gate button
    if (parseInt(parts[6]) > 0) {
        const warpGateButton = document.getElementById('bb6');
        if (warpGateButton) {
            warpGateButton.style.background = '#222';
        }
    }
}

// Handle battle visualization and processing
function battle(message) {
    createBattleVisualization(message);
}

// Create battle visualization
function createBattleVisualization(message) {
    console.log("Creating battle visualization", message);
    
    // Parse battle data
    const parts = message.split(':');
    if (parts.length < 20) return;
    
    // Create battle container if it doesn't exist
    let battleDiv = document.getElementById('battleGround');
    if (battleDiv) {
        // Remove existing battle visualization
        document.body.removeChild(battleDiv);
    }
    
    battleDiv = document.createElement('div');
    battleDiv.id = 'battleGround';
    battleDiv.style.position = 'absolute';
    battleDiv.style.left = '10%';
    battleDiv.style.width = '80%';
    battleDiv.style.height = '80%';
    battleDiv.style.top = '10%';
    battleDiv.style.background = '#000';
    battleDiv.style.backgroundImage = 'url(spacebak.jpg)';
    battleDiv.style.zIndex = '1000';
    document.body.appendChild(battleDiv);
    
    // Add skip button
    const skipButton = document.createElement('button');
    skipButton.id = 'stopBattle';
    skipButton.style.position = 'absolute';
    skipButton.style.right = '15%';
    skipButton.style.width = '5%';
    skipButton.style.height = '3%';
    skipButton.style.top = '10%';
    skipButton.innerHTML = 'SKIP';
    skipButton.onclick = () => {
        document.body.removeChild(battleDiv);
    };
    battleDiv.appendChild(skipButton);
    
    // Add headers
    const attackerHeader = document.createElement('h1');
    attackerHeader.id = 'atttxt';
    attackerHeader.style.position = 'absolute';
    attackerHeader.style.right = '15%';
    attackerHeader.style.top = '12%';
    attackerHeader.innerHTML = 'Attackers';
    battleDiv.appendChild(attackerHeader);
    
    const defenderHeader = document.createElement('h1');
    defenderHeader.id = 'deftxt';
    defenderHeader.style.position = 'absolute';
    defenderHeader.style.right = '80%';
    defenderHeader.style.top = '12%';
    defenderHeader.innerHTML = 'Defenders';
    battleDiv.appendChild(defenderHeader);
    
    // Create ships for attackers (index 1-9)
    for (let shipType = 0; shipType < 9; shipType++) {
        const shipCount = parseInt(parts[shipType + 1]) || 0;
        for (let i = 0; i < shipCount; i++) {
            createShipImage(battleDiv, '1a' + i + shipType, 'right', shipType + 1);
        }
    }
    
    // Create ships for defenders (index 10-18)
    for (let shipType = 0; shipType < 9; shipType++) {
        const shipCount = parseInt(parts[shipType + 10]) || 0;
        for (let i = 0; i < shipCount; i++) {
            createShipImage(battleDiv, '1d' + i + shipType, 'left', shipType + 1);
        }
    }
    
    // Add ground defenses if present
    const groundDefense = parseInt(parts[19]) || 0;
    if (groundDefense > 0) {
        const groundImg = document.createElement('img');
        groundImg.id = '1d09';
        groundImg.style.position = 'absolute';
        groundImg.style.left = '0%';
        groundImg.style.top = '10%';
        groundImg.style.height = '90%';
        groundImg.src = 'ground.gif';
        battleDiv.appendChild(groundImg);
        
        const baseImg = document.createElement('img');
        baseImg.id = '1d010';
        baseImg.style.position = 'absolute';
        baseImg.style.left = '15%';
        baseImg.style.top = '60%';
        baseImg.src = 'base.png';
        battleDiv.appendChild(baseImg);
    }
    
    // Animate battle with destruction sequence
    let round = 1;
    while ((round * 20 + 1) < parts.length && round < 10) {
        animateBattleRound(parts, round, battleDiv);
        round++;
    }
    
    // Automatically close after 20 seconds
    setTimeout(() => {
        if (document.getElementById('battleGround')) {
            document.body.removeChild(document.getElementById('battleGround'));
        }
    }, 20000);
}

// Create ship image for battle
function createShipImage(container, id, side, shipType) {
    const img = document.createElement('img');
    img.id = id;
    img.style.position = 'absolute';
    
    if (side === 'right') {
        img.style.left = Math.round(Math.random() * 20 + 60) + '%';
        img.style.transform = 'scaleX(-1)';
        img.style.webkitTransform = 'scaleX(-1)';
    } else {
        img.style.left = Math.round(Math.random() * 20 + 20) + '%';
    }
    
    img.style.top = Math.round(Math.random() * 60 + 20) + '%';
    img.src = 'ship' + shipType + '.png';
    container.appendChild(img);
}

// Animate a battle round
function animateBattleRound(battleData, round, container) {
    const delay = 5000 * round;
    
    setTimeout(() => {
        // Get ship counts before and after this round
        // For each ship type (9 attacker types + 9 defender types)
        for (let i = 0; i < 18; i++) {
            const beforeCount = parseInt(battleData[i + 1]) || 0;
            const afterCount = parseInt(battleData[i + 1 + round * 20]) || 0;
            
            // Calculate losses
            const losses = beforeCount - afterCount;
            
            // Animate destruction of lost ships
            for (let j = afterCount; j < beforeCount; j++) {
                const prefix = i < 9 ? '1a' : '1d';
                const shipType = i < 9 ? i : i - 9;
                const shipId = prefix + j + shipType;
                
                // Randomly time the explosions
                setTimeout(() => {
                    const ship = document.getElementById(shipId);
                    if (ship) {
                        ship.src = 'boom.gif';
                    }
                }, Math.random() * 2000);
            }
        }
    }, delay);
}

function handleBattle(message) {
    // Parse battle data and display battle animation
    battle(message);
}
// Function to color sector on the minimap based on ownership and type
function colorSector(message) {
    const parts = message.split(':');
    if (parts.length < 3) return;
    
    const sectorId = parseInt(parts[1], 16);
    const fleetSize = parseInt(parts[2]) || 0;
    const indicator = parts[3] || '';
    
    // Update sector representation on minimap
    if (window.GalaxyMap) {
        let status = window.GalaxyMap.SECTOR_STATUS.OWNED;
        
        // Determine status based on indicator
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
        
        // Update map
        window.GalaxyMap.updateSectorStatus(sectorId, status, {
            fleetSize: fleetSize,
            indicator: indicator
        });
    } else {
        // Legacy map update - using original code's approach
        const tile = document.getElementById(`tile${sectorId}`);
        if (tile) {
            // Set color based on indicator
            let strokeColor = "#40C040"; // Default green for owned
            
            if (indicator === 'A') {
                strokeColor = "#C08040"; // Brown for asteroid
            } else if (indicator === 'BH') {
                strokeColor = "#202020"; // Black for blackhole
            } else if (indicator === 'C') {
                strokeColor = "#40C0A0"; // Teal for colonized
            } else if (indicator === 'H') {
                strokeColor = "#FFC040"; // Gold for homeworld
            } else if (indicator === 'W') {
                strokeColor = "#8040C0"; // Purple for warpgate
            }
            
            tile.setAttribute("stroke", strokeColor);
            
            // Update fleet size display
            const fleetText = document.getElementById(`txtfleetid${sectorId}`);
            if (fleetText) {
                if (fleetSize > 0) {
                    fleetText.textContent = `S:${fleetSize}`;
                    fleetText.style.display = "block";
                } else {
                    fleetText.style.display = "none";
                }
            }
            
            // Update colonized indicator
            const colonizedText = document.getElementById(`colonizedtxt${sectorId}`);
            if (colonizedText) {
                if (indicator) {
                    colonizedText.textContent = indicator;
                    colonizedText.style.display = "block";
                } else {
                    colonizedText.style.display = "none";
                }
            }
        }
    }
}

// Function to update resource display based on server data
function getResources(message) {
    const parts = message.split(':');
    if (parts.length < 4) return;
    
    // Update resource displays in UI
    const metalDisplay = document.getElementById('metalresource');
    const crystalDisplay = document.getElementById('crystalresource');
    const researchDisplay = document.getElementById('researchresource');
    
    if (metalDisplay) {
        metalDisplay.textContent = ` ${parts[1]} Metal,`;
    }
    
    if (crystalDisplay) {
        crystalDisplay.textContent = ` ${parts[2]} Crystal,`;
    }
    
    if (researchDisplay) {
        researchDisplay.textContent = ` ${parts[3]} Research`;
    }
}

// Function to update technology levels based on server data
function modTech(message) {
    const parts = message.split(':');
    if (parts.length < 10) return;
    
    // Update tech levels in UI
    for (let i = 1; i <= 9; i++) {
        // Current level display
        const currentLevel = document.getElementById(`ttt${i}`);
        if (currentLevel) {
            currentLevel.textContent = parts[i] || '0';
        }
        
        // Next level display
        const nextLevel = document.getElementById(`tt${i}`);
        if (nextLevel) {
            nextLevel.textContent = (parseInt(parts[i]) || 0) + 1;
        }
        
        // Cost calculation
        const costDisplay = document.getElementById(`tc${i}`);
        if (costDisplay) {
            let cost = 0;
            
            // Special calculation for terraforming tech
            if (i === 7) {
                cost = Math.round(Math.pow(8, (parseInt(parts[i]) || 0) + 2) + 36);
            } else {
                cost = Math.round(Math.pow(1.5, (parseInt(parts[i]) || 0) + 13) + 5);
            }
            
            costDisplay.textContent = cost;
        }
    }
}

// Function to update fleet information based on server data
function updateFleet(message) {
    const parts = message.split(':');
    if (parts.length < 13) return;
    
    // Update ship counts in sector display
    for (let i = 1; i <= 9; i++) {
        const shipCount = document.getElementById(`f${i}`);
        if (shipCount) {
            shipCount.textContent = parts[i] || '0';
        }
    }
    
    // Update ships being built
    for (let i = 1; i <= 9; i++) {
        const buildingCount = document.getElementById(`fa${i}`);
        if (buildingCount) {
            buildingCount.textContent = parts[i + 9] || '0';
        }
        
        // Show/hide cancel buttons
        const cancelButton = document.getElementById(`fc${i}`);
        if (cancelButton) {
            cancelButton.style.display = parseInt(parts[i + 9]) > 0 ? 'inline-block' : 'none';
        }
    }
    
    // Update ship selection lists for fleet management
    updateShips(
        parseInt(parts[1]) || 0,
        parseInt(parts[2]) || 0,
        parseInt(parts[3]) || 0,
        parseInt(parts[4]) || 0,
        parseInt(parts[5]) || 0,
        parseInt(parts[6]) || 0
    );
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
    // Convert to uppercase hex if not already
    sectorId = sectorId.toString().toUpperCase();
    
    // Request sector information from server
    websocket.send("//sector " + sectorId);
    
    // Update UI to indicate selected sector
    if (window.GalaxyMap && window.GalaxyMap.selectedSector) {
        window.GalaxyMap.selectSector(parseInt(sectorId, 16));
    }
}

function authUser() {
    // This will be populated from PHP session in the original
    // For now, we'll use a simpler approach with query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const playerId = urlParams.get('playerId');
    const tempKey = urlParams.get('tempKey');
    
    if (playerId && tempKey) {
        websocket.send(`//auth:${playerId}:${tempKey}`);
        return playerId;
    }
    
    return null;
}
