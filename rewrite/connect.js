// WebSocket server connection
const server = "ws://127.0.0.1:1337";
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


// Chat fade effects
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

// Initialize WebSocket connection
function initializeWebSocket() {
    // Support for Firefox
    if (window.MozWebSocket) {
        window.WebSocket = window.MozWebSocket;
    }

    // Create new WebSocket connection
    const server = "ws://127.0.0.1:1337";
    websocket = new WebSocket(server);
    
    // Connection established
    websocket.onopen = function() {
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
    websocket.onclose = function() {
        document.getElementById("status").innerHTML = "Connection closed";
        document.getElementById("lobbyWindow").style.display = "block";
        console.log("WebSocket connection closed");
    };
}

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
        } else {
            createBattleVisualization(message);
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
    } else {
        // Fallback to manual DOM updates
        // Building levels
        for (let i = 1; i <= 6; i++) {
            const levelDisplay = document.getElementById(`bbb${i}`);
            if (levelDisplay) {
                levelDisplay.textContent = parts[i] || '0';
            }
        }
        
        // Next level display
        for (let i = 1; i <= 6; i++) {
            const nextLevelDisplay = document.getElementById(`b${i}`);
            if (nextLevelDisplay) {
                nextLevelDisplay.textContent = (parseInt(parts[i]) || 0) + 1;
            }
        }
        
        // Building costs
        for (let i = 1; i <= 5; i++) {
            const costDisplay = document.getElementById(`m${i}`);
            if (costDisplay) {
                costDisplay.textContent = ((parseInt(parts[i]) || 0) + 1) * 100;
            }
        }
        
        // Warp gate special case
        if (parseInt(parts[6]) > 0) {
            const warpgateButton = document.getElementById('bb6');
            if (warpgateButton) {
                warpgateButton.style.background = '#222';
            }
        }
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
    } else {
        // Fallback to manual DOM updates
        document.getElementById('sectorid').textContent = `Sector: ${sectorData.id}`;
        document.getElementById('planetowner').textContent = `Owner: ${sectorData.owner}`;
        
        // Set planet type
        let planetType = 'Unknown';
        switch (sectorData.type) {
            case 1: planetType = 'Asteroid Belt'; break;
            case 2: planetType = 'Black Hole'; break;
            case 3: planetType = 'Unstable Star'; break;
            case 4: planetType = 'Brown Dwarf'; break;
            case 5: planetType = 'Small Moon'; break;
            case 6: planetType = 'Micro Planet (4)'; break;
            case 7: planetType = 'Small Planet (6)'; break;
            case 8: planetType = 'Medium Planet (8)'; break;
            case 9: planetType = 'Large Planet (10)'; break;
            case 10: planetType = 'Homeworld Planet (12)'; break;
        }
        document.getElementById('planettype').textContent = `Type: ${planetType}`;
        
        // Set production bonuses
        if (sectorData.type > 5) {
            // Handle metal bonus
            const metalBonusElement = document.getElementById('metalbonus');
            if (metalBonusElement) {
                let color = 'yellow';
                if (sectorData.metalBonus < 100) {
                    color = 'red';
                } else if (sectorData.metalBonus >= 200) {
                    color = 'green';
                }
                metalBonusElement.innerHTML = `Metal Production:<font color="${color}"> ${sectorData.metalBonus}%</font>`;
            }
            
            // Handle crystal bonus
            const crystalBonusElement = document.getElementById('crystalbonus');
            if (crystalBonusElement) {
                let color = 'yellow';
                if (sectorData.crystalBonus < 100) {
                    color = 'red';
                } else if (sectorData.crystalBonus >= 200) {
                    color = 'green';
                }
                crystalBonusElement.innerHTML = `Crystal Production:<font color="${color}"> ${sectorData.crystalBonus}%</font>`;
            }
            
            // Set terraform requirement
            document.getElementById('terraformlvl').textContent = `Terraform Req: ${sectorData.terraformLevel}`;
        } else {
            // Non-colonizable sector
            document.getElementById('metalbonus').textContent = 'N/A';
            document.getElementById('crystalbonus').textContent = 'N/A';
            document.getElementById('terraformlvl').textContent = 'Cannot be colonized';
        }
        
        // Update sector image if available
        const sectorImage = document.getElementById('sectorimg');
        if (sectorImage) {
            sectorImage.style.backgroundImage = `url(type${sectorData.type}.gif)`;
        }
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


function colorSector(message) {
    const parts = message.split(':');
    if (parts.length < 3) return;
    
    const sectorId = parseInt(parts[1], 16);
    const fleetSize = parseInt(parts[2]) || 0;
    const indicator = parts[3] || '';
    
    // Update map visualization
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
        // Legacy map update
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
    } else {
        // Fallback to manual DOM updates
        // Update ship counts
        for (let i = 1; i <= 9; i++) {
            const shipCount = document.getElementById(`f${i}`);
            if (shipCount) {
                shipCount.textContent = parts[i] || '0';
            }
            
            // Ships being built
            const buildingCount = document.getElementById(`fa${i}`);
            if (buildingCount) {
                buildingCount.textContent = parts[i + 9] || '0';
            }
            
            // Show/hide cancel buttons
            const cancelButton = document.getElementById(`fc${i}`);
            if (cancelButton) {
                cancelButton.style.display = parseInt(parts[i + 9]) > 0 ? 'inline' : 'none';
            }
        }
    }
    
    // Update ship selection lists if visible
    updateShipSelectionLists(fleet);
}

function updateShipSelectionLists(fleet) {
    const shipsFrom = document.getElementById('shipsFrom');
    if (!shipsFrom) return;
    
    // Clear existing options
    while (shipsFrom.options.length > 0) {
        shipsFrom.remove(0);
    }
    
    // Add options for each ship type
    const shipTypes = [
        { id: 1, name: 'Frigate' },
        { id: 2, name: 'Destroyer' },
        { id: 3, name: 'Scout' },
        { id: 4, name: 'Cruiser' },
        { id: 5, name: 'Battleship' },
        { id: 6, name: 'Colony Ship' },
        { id: 7, name: 'Dreadnought' },
        { id: 8, name: 'Intruder' },
        { id: 9, name: 'Carrier' }
    ];
    
    shipTypes.forEach(shipType => {
        const count = fleet[`ship${shipType.id}`] || 0;
        for (let i = 1; i <= count; i++) {
            const option = document.createElement('option');
            option.value = `${shipType.id < 7 ? String.fromCharCode(96 + shipType.id) : shipType.id}${i}`;
            option.text = `${shipType.name} ${i}`;
            shipsFrom.add(option);
        }
    });
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

function changeSector(sectorId) {
    // Request sector information from server
    websocket.send("//sector " + sectorId.toString(16).toUpperCase());
    
    // Update UI to indicate selected sector
    if (window.GalaxyMap && window.GalaxyMap.selectSector) {
        window.GalaxyMap.selectSector(parseInt(sectorId, 16));
    }
}

// Update tech levels
function updateTechLevels(message) {
    const parts = message.split(':');
    if (parts.length < 10) return;
    
    // Update tech levels in game state
    for (let i = 1; i <= 9; i++) {
        GAME_STATE.player.techLevels[i] = parseInt(parts[i]) || 0;
    }
    
    // Update UI display
    for (let i = 1; i <= 9; i++) {
        // Current level display
        const currentLevel = document.getElementById(`ttt${i}`);
        if (currentLevel) {
            currentLevel.textContent = GAME_STATE.player.techLevels[i] || '0';
        }
        
        // Next level display
        const nextLevel = document.getElementById(`tt${i}`);
        if (nextLevel) {
            nextLevel.textContent = (GAME_STATE.player.techLevels[i] || 0) + 1;
        }
        
        // Cost calculation
        const costDisplay = document.getElementById(`tc${i}`);
        if (costDisplay) {
            let cost = 0;
            
            // Special calculation for terraforming tech
            if (i === 7) {
                cost = Math.round(Math.pow(8, (GAME_STATE.player.techLevels[i] || 0) + 2) + 36);
            } else {
                cost = Math.round(Math.pow(1.5, (GAME_STATE.player.techLevels[i] || 0) + 13) + 5);
            }
            
            costDisplay.textContent = cost;
        }
    }
}

// Update resources
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
    } else {
        document.getElementById('metalresource').innerHTML = ` ${resources.metal} Metal,`;
        document.getElementById('crystalresource').innerHTML = ` ${resources.crystal} Crystal,`;
        document.getElementById('researchresource').innerHTML = ` ${resources.research} Research`;
    }
}

// Handle sector status
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

// Display chat message
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

// Chat history functions
function pushLog() {
    const d = new Date();
    document.getElementById('timeSince').innerHTML = "0 seconds ago.";
    chatHistoryTime.push(d.getTime());
    chatHistory.push(document.getElementById("log").innerHTML);
    clearInterval(timeSinceCounter);
    timeSinceCounter = setInterval(timelogupdate, 1000);
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

function startchatfade() {
    clearTimeout(chatfadetimer);
    clearTimeout(chatfadebegin);
    setalpha(document.getElementById("empireupdates"), 100);
    chatfadevalue = 100;
    chatfadebegin = setTimeout(() => chatfade(document.getElementById("empireupdates")), 16000);
}

function chatfade(logid) {
    if (chatfadevalue > 0) {
        chatfadevalue -= 2;
        setalpha(logid, chatfadevalue);
        chatfadetimer = setTimeout(() => chatfade(logid), 60);
    }
}

function setalpha(element, opacity) {
    if (!element) return;
    element.style.opacity = opacity / 100;
}
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

// Handle battle
function handleBattle(message) {
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
    battleDiv.style.display = 'block';
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

// Show multi-move options dialog
function showMultiMoveOptions(message) {
    // Show fleet movement options
    const multiMoveDiv = document.getElementById('multiMove');
    if (!multiMoveDiv) return;
    
    // Parse message and populate ship list
    const parts = message.split(':');
    const targetSector = parts[1];
    
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
            
            // Add options for each ship type
            if (ships[0] > 0) addShipOptions(shipList, sectorId, 1, ships[0], "Frigate");
            if (ships[1] > 0) addShipOptions(shipList, sectorId, 2, ships[1], "Destroyer");
            if (ships[2] > 0) addShipOptions(shipList, sectorId, 3, ships[2], "Scout");
            if (ships[3] > 0) addShipOptions(shipList, sectorId, 4, ships[3], "Cruiser");
            if (ships[4] > 0) addShipOptions(shipList, sectorId, 5, ships[4], "Battleship");
            if (ships[5] > 0) addShipOptions(shipList, sectorId, 6, ships[5], "Colony Ship");
            if (ships[6] > 0) addShipOptions(shipList, sectorId, 7, ships[6], "Dreadnought");
            if (ships[7] > 0) addShipOptions(shipList, sectorId, 8, ships[7], "Intruder");
            if (ships[8] > 0) addShipOptions(shipList, sectorId, 9, ships[8], "Carrier");
        }
    }
    
    // Show dialog
    multiMoveDiv.style.display = 'block';
}

// Add ship options to a select element
function addShipOptions(selectElement, sectorId, shipType, count, shipName) {
    for (let i = 1; i <= count; i++) {
        const option = document.createElement('option');
        option.value = `${sectorId}:${shipType}:${i}`;
        option.text = `${shipName} ${i} in sector ${sectorId}`;
        selectElement.add(option);
    }
}

// Authentication function
function authUser() {
    // First try cookies
    const userId = getCookie("userId");
    const tempKey = getCookie("tempKey");
    
    if (userId && tempKey) {
        websocket.send("//auth:" + userId + ":" + tempKey);
        return userId;
    }
    
    // Then try URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urlUserId = urlParams.get('userId');
    const urlTempKey = urlParams.get('tempKey');
    
    if (urlUserId && urlTempKey) {
        websocket.send("//auth:" + urlUserId + ":" + urlTempKey);
        return urlUserId;
    }
    
    return null;
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Disable text selection (to prevent accidental selection when clicking game elements)
function disableSelection(element) {
    if (!element) return;
    
    element.onselectstart = function() { return false; };
    element.style.userSelect = "none";
    
    const children = element.getElementsByTagName('*');
    for (let i = 0; i < children.length; i++) {
        disableSelection(children[i]);
    }
}

// Initialize WebSocket when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Initialize WebSocket connection
    initializeWebSocket();
    
    // Add event listener for next turn button
    const nextTurnBtn = document.getElementById('nextTurnBtn');
    if (nextTurnBtn) {
        nextTurnBtn.addEventListener('click', nextTurn);
    }
    
    // Add event listener for chat form
    const chatForm = document.getElementById('chatForm');
    if (chatForm) {
        chatForm.addEventListener('submit', sendChat);
    }
    
    // Disable selection on game elements
    disableSelection(document);
});