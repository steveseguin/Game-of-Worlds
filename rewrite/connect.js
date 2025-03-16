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

const ServerFunctions = require('./server.js');

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
    // Use the current host for connection
    const serverUrl = `ws://${window.location.hostname}:1337`;
    websocket = new WebSocket(serverUrl);
    
    websocket.onopen = function() {
        console.log("Connection established");
        document.getElementById("status").innerHTML = "Connected";
        
        // Auto-authenticate if credentials exist
        const userId = getCookie("userId");
        const tempKey = getCookie("tempKey");
        if (userId && tempKey) {
            websocket.send(`//auth:${userId}:${tempKey}`);
        }
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

function preMoveFleet(message, connection) {
    console.log("Processing fleet movement:", message);
    const arr = message.split(":");
    if (arr.length < 2) {
        connection.sendUTF("Invalid move format");
        return;
    }
    
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
                const count = parseInt(arr[y]) || 1;
                
                switch (shipType) {
                    case 1: sumofships += count * 2; break; // Frigate
                    case 2: sumofships += count * 3; break; // Destroyer
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
            
            // Process the fleet movement
            moveFleetMulti(arr, connection, crystalCost, player);
        }
    );
}

function moveFleetMulti(moveData, connection, crystalCost, playerData) {
    const targetSectorId = parseInt(moveData[1], 16);
    
    // First, deduct the crystal cost
    db.query(`UPDATE players${connection.gameid} SET crystal = crystal - ? WHERE playerid = ?`, 
        [crystalCost, connection.name]
    );
    
    // Process all ship movements
    const shipMovements = [];
    
    for (let i = 2; i < moveData.length; i += 3) {
        const sourceSectorId = parseInt(moveData[i], 16);
        const shipType = parseInt(moveData[i+1]);
        const count = parseInt(moveData[i+2]) || 1;
        
        if (isNaN(sourceSectorId) || isNaN(shipType) || isNaN(count) || 
            shipType < 1 || shipType > 9 || count <= 0) {
            continue;
        }
        
        // Add to ship movements
        shipMovements.push({
            sourceSectorId,
            shipType,
            count
        });
    }
    
    // Process each ship movement sequentially
    processShipMovements(shipMovements, 0, targetSectorId, connection, () => {
        // After all movements, notify player and update UI
        connection.sendUTF(`Fleet dispatched to sector ${targetSectorId.toString(16).toUpperCase()}. Cost: ${crystalCost} crystal`);
        updateResources(connection);
        updateAllSectors(connection.gameid, connection);
        
        // Schedule fleet arrival
        setTimeout(() => {
            fleetArrival(targetSectorId, connection);
        }, 10000);
    });
}


function fleetArrival(sectorId, connection) {
    // Get target sector data
    db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`,
        [sectorId],
        (err, results) => {
            if (err || results.length === 0) {
                console.error("Error retrieving target sector data:", err);
                return;
            }
            
            const sector = results[0];
            
            // Check if hazard sector (apply losses)
            let shipsLost = 0;
            if (sector.sectortype === 1) { // Asteroid field
                // 50% chance of losing ships
                const hazardLoss = 0.5;
                
                // Update query parts
                let updateFields = '';
                
                // Process each ship type
                for (let i = 1; i <= 9; i++) {
                    const comingField = `totship${i}coming`;
                    const coming = sector[comingField] || 0;
                    
                    if (coming > 0) {
                        // Calculate survivors (random between 50-100%)
                        const survivalRate = Math.random() * hazardLoss + (1 - hazardLoss);
                        const survivors = Math.round(coming * survivalRate);
                        const lost = coming - survivors;
                        shipsLost += lost;
                        
                        // Update field
                        updateFields += `${comingField} = 0, totalship${i} = totalship${i} + ${survivors}, `;
                    }
                }
                
                // Remove trailing comma and space
                if (updateFields.length > 0) {
                    updateFields = updateFields.substring(0, updateFields.length - 2);
                }
                
                // Update sector with survivors
                if (updateFields) {
                    db.query(`UPDATE map${connection.gameid} SET ${updateFields} WHERE sectorid = ?`,
                        [sectorId],
                        (err) => {
                            if (err) {
                                console.error("Error updating sector with survivors:", err);
                            }
                            
                            if (shipsLost > 0) {
                                connection.sendUTF(`Fleet arrived at asteroid field in sector ${sectorId.toString(16).toUpperCase()}. ${shipsLost} ships were lost to asteroid collisions.`);
                            } else {
                                connection.sendUTF(`Fleet arrived safely at asteroid field in sector ${sectorId.toString(16).toUpperCase()}.`);
                            }
                            
                            updateSector2(sectorId, connection);
                        }
                    );
                }
            }
            // Handle black hole - complete destruction
            else if (sector.sectortype === 2) {
                // Clear all incoming ships
                let updateFields = '';
                
                for (let i = 1; i <= 9; i++) {
                    updateFields += `totship${i}coming = 0, `;
                }
                
                // Remove trailing comma and space
                updateFields = updateFields.substring(0, updateFields.length - 2);
                
                db.query(`UPDATE map${connection.gameid} SET ${updateFields} WHERE sectorid = ?`,
                    [sectorId],
                    (err) => {
                        if (err) {
                            console.error("Error clearing ships in black hole:", err);
                        }
                        
                        connection.sendUTF(`Your fleet was lost in the black hole at sector ${sectorId.toString(16).toUpperCase()}.`);
                        updateSector2(sectorId, connection);
                    }
                );
            }
            // Normal sector - check for combat or peaceful arrival
            else {
                if (sector.ownerid !== connection.name && sector.ownerid !== '0') {
                    // Enemy sector - initiate combat
                    initiateCombat(sectorId, connection);
                } else {
                    // Friendly or empty sector - peaceful arrival
                    let updateFields = '';
                    
                    for (let i = 1; i <= 9; i++) {
                        const comingField = `totship${i}coming`;
                        const coming = sector[comingField] || 0;
                        
                        if (coming > 0) {
                            updateFields += `${comingField} = 0, totalship${i} = totalship${i} + ${coming}, `;
                        }
                    }
                    
                    // Remove trailing comma and space
                    if (updateFields.length > 0) {
                        updateFields = updateFields.substring(0, updateFields.length - 2);
                        
                        // If empty sector, claim it
                        if (sector.ownerid === '0') {
                            updateFields += `, ownerid = '${connection.name}'`;
                        }
                        
                        // Update sector
                        db.query(`UPDATE map${connection.gameid} SET ${updateFields} WHERE sectorid = ?`,
                            [sectorId],
                            (err) => {
                                if (err) {
                                    console.error("Error updating sector with arriving ships:", err);
                                }
                                
                                connection.sendUTF(`Fleet arrived at sector ${sectorId.toString(16).toUpperCase()}.`);
                                updateSector2(sectorId, connection);
                                updateAllSectors(connection.gameid, connection);
                            }
                        );
                    }
                }
            }
        }
    );
}

function initiateCombat(sectorId, connection) {
    // Get defender information
    db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`,
        [sectorId],
        (err, results) => {
            if (err || results.length === 0) {
                console.error("Error retrieving target sector for combat:", err);
                return;
            }
            
            const sector = results[0];
            const defenderId = sector.ownerid;
            
            // Prepare attacker fleet (convert incoming to actual)
            let attackerFleet = {
                ship1: sector.totship1coming || 0,
                ship2: sector.totship2coming || 0,
                ship3: sector.totship3coming || 0,
                ship4: sector.totship4coming || 0,
                ship5: sector.totship5coming || 0,
                ship6: sector.totship6coming || 0,
                ship7: sector.totship7coming || 0,
                ship8: sector.totship8coming || 0,
                ship9: sector.totship9coming || 0
            };
            
            // Prepare defender fleet
            let defenderFleet = {
                ship1: sector.totalship1 || 0,
                ship2: sector.totalship2 || 0,
                ship3: sector.totalship3 || 0,
                ship4: sector.totalship4 || 0,
                ship5: sector.totalship5 || 0,
                ship6: sector.totalship6 || 0,
                ship7: sector.totalship7 || 0,
                ship8: sector.totalship8 || 0,
                ship9: sector.totalship9 || 0,
                orbitalTurret: sector.orbitalturret || 0,
                groundTurret: sector.groundturret || 0
            };
            
            // Get tech levels for both players
            db.query(`SELECT tech4, tech5, tech6 FROM players${connection.gameid} WHERE playerid IN (?, ?)`,
                [connection.name, defenderId],
                (err, techResults) => {
                    if (err) {
                        console.error("Error retrieving tech levels:", err);
                        return;
                    }
                    
                    // Default tech levels
                    let attackerTech = { weapons: 0, hull: 0, shields: 0 };
                    let defenderTech = { weapons: 0, hull: 0, shields: 0 };
                    
                    // Assign tech levels from results
                    techResults.forEach(tech => {
                        if (tech.playerid === connection.name) {
                            attackerTech = {
                                weapons: tech.tech4 || 0,
                                hull: tech.tech5 || 0,
                                shields: tech.tech6 || 0
                            };
                        } else {
                            defenderTech = {
                                weapons: tech.tech4 || 0,
                                hull: tech.tech5 || 0,
                                shields: tech.tech6 || 0
                            };
                        }
                    });
                    
                    // Conduct battle
                    const battleResult = CombatSystem.conductBattle(
                        attackerFleet, defenderFleet, attackerTech, defenderTech
                    );
                    
                    // Process battle results
                    processBattleResult(battleResult, sectorId, connection, defenderId);
                }
            );
        }
    );
}

function processBattleResult(battleResult, sectorId, connection, defenderId) {
    // Convert result to battle message for clients
    const battleMessage = CombatSystem.formatBattleMessage(battleResult);
    
    // Get clients for both players
    const attackerClient = connection;
    const defenderClient = clientMap[defenderId];
    
    // Send battle message to both players
    if (attackerClient) {
        attackerClient.sendUTF(battleMessage);
    }
    
    if (defenderClient) {
        defenderClient.sendUTF(battleMessage);
    }
    
    // Process outcome based on victor
    if (battleResult.result === "attackerVictory") {
        // Update sector ownership and remaining ships
        const remainingAttackers = battleResult.final.attackers;
        
        let updateQuery = "UPDATE map" + connection.gameid + " SET ";
        
        // Set ship counts
        for (let i = 1; i <= 9; i++) {
            updateQuery += `totalship${i} = ${remainingAttackers[i] || 0}, `;
            updateQuery += `totship${i}coming = 0, `;
        }
        
        // Change ownership and reset buildings if colonized
        if (sector.colonized === 1) {
            updateQuery += "ownerid = '" + connection.name + "', colonized = 0, ";
            updateQuery += "orbitalturret = 0, groundturret = 0, ";
            updateQuery += "metallvl = 0, crystallvl = 0, academylvl = 0, shipyardlvl = 0, warpgate = 0 ";
        } else {
            updateQuery += "ownerid = '" + connection.name + "', ";
            updateQuery += "orbitalturret = 0, groundturret = 0 ";
        }
        
        updateQuery += "WHERE sectorid = " + sectorId;
        
        db.query(updateQuery, (err) => {
            if (err) {
                console.error("Error updating sector after battle:", err);
                return;
            }
            
            // Notify both players
            if (attackerClient) {
                attackerClient.sendUTF(`Victory! Your forces have captured sector ${sectorId.toString(16).toUpperCase()}.`);
                updateSector2(sectorId, attackerClient);
                updateAllSectors(connection.gameid, attackerClient);
            }
            
            if (defenderClient) {
                defenderClient.sendUTF(`Defeat! Your forces lost control of sector ${sectorId.toString(16).toUpperCase()}.`);
                updateAllSectors(connection.gameid, defenderClient);
            }
        });
    } else {
        // Defender victory
        const remainingDefenders = battleResult.final.defenders;
        
        let updateQuery = "UPDATE map" + connection.gameid + " SET ";
        
        // Set ship counts and clear incoming
        for (let i = 1; i <= 9; i++) {
            updateQuery += `totalship${i} = ${remainingDefenders[i] || 0}, `;
            updateQuery += `totship${i}coming = 0, `;
        }
        
        // Update orbital turrets
        updateQuery += `orbitalturret = ${battleResult.final.orbitalTurrets || 0}, `;
        updateQuery += `groundturret = ${battleResult.final.groundTurrets || 0} `;
        
        updateQuery += "WHERE sectorid = " + sectorId;
        
        db.query(updateQuery, (err) => {
            if (err) {
                console.error("Error updating sector after battle:", err);
                return;
            }
            
            // Notify both players
            if (attackerClient) {
                attackerClient.sendUTF(`Defeat! Your attack on sector ${sectorId.toString(16).toUpperCase()} was repelled.`);
                updateAllSectors(connection.gameid, attackerClient);
            }
            
            if (defenderClient) {
                defenderClient.sendUTF(`Victory! Your forces successfully defended sector ${sectorId.toString(16).toUpperCase()}.`);
                updateSector2(sectorId, defenderClient);
                updateAllSectors(connection.gameid, defenderClient);
            }
        });
    }
}
// Helper function to process ship movements one by one
function processShipMovements(movements, index, targetSectorId, connection, callback) {
    if (index >= movements.length) {
        // All movements processed
        callback();
        return;
    }
    
    const movement = movements[index];
    
    // Get source sector information
    db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? AND ownerid = ? LIMIT 1`,
        [movement.sourceSectorId, connection.name],
        (err, results) => {
            if (err || results.length === 0) {
                // Skip this movement
                processShipMovements(movements, index + 1, targetSectorId, connection, callback);
                return;
            }
            
            const sector = results[0];
            const shipField = `totalship${movement.shipType}`;
            
            // Check if sector has enough ships
            if (sector[shipField] < movement.count) {
                // Not enough ships, skip
                processShipMovements(movements, index + 1, targetSectorId, connection, callback);
                return;
            }
            
            // Remove ships from source sector
            db.query(`UPDATE map${connection.gameid} SET ${shipField} = ${shipField} - ? WHERE sectorid = ?`,
                [movement.count, movement.sourceSectorId],
                (err) => {
                    if (err) {
                        console.error("Error updating source sector:", err);
                    }
                    
                    // Prepare ships for arrival with totshipXcoming field
                    const comingField = `totship${movement.shipType}coming`;
                    db.query(`UPDATE map${connection.gameid} SET ${comingField} = ${comingField} + ? WHERE sectorid = ?`,
                        [movement.count, targetSectorId],
                        (err) => {
                            if (err) {
                                console.error("Error updating target sector:", err);
                            }
                            
                            // Process next movement
                            processShipMovements(movements, index + 1, targetSectorId, connection, callback);
                        }
                    );
                }
            );
        }
    );
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
function createBattleVisualization(message) {
    if (window.BattleSystem) {
        BattleSystem.createBattleVisualization(message);
    }
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

function moveFleet(message, connection) {
    const parts = message.split(":");
    if (parts.length < 3) return;
    
    const targetSector = parseInt(parts[1], 16);
    const ships = parts[2].split(",");
    
    // Get player's current sector
    if (!connection.sectorid) {
        connection.sendUTF('You need to select a sector first');
        return;
    }
    
    // Get player's resources
    db.query(`SELECT * FROM players${connection.gameid} WHERE playerid = ? LIMIT 1`, 
        [connection.name], (err, playerResults) => {
            if (err || playerResults.length === 0) {
                console.error("Error retrieving player data:", err);
                connection.sendUTF('Error: Player data not found');
                return;
            }
            
            const player = playerResults[0];
            
            // Get source sector data
            db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`, 
                [connection.sectorid], (err, sourceResults) => {
                    if (err || sourceResults.length === 0) {
                        console.error("Error retrieving source sector data:", err);
                        connection.sendUTF('Error: Source sector not found');
                        return;
                    }
                    
                    const sourceSector = sourceResults[0];
                    
                    // Calculate movement cost
                    let movementCost = 0;
                    let fleetToMove = {
                        ship1: 0, ship2: 0, ship3: 0, ship4: 0, ship5: 0,
                        ship6: 0, ship7: 0, ship8: 0, ship9: 0
                    };
                    
                    // Parse requested ships to move
                    for (const ship of ships) {
                        const [type, count] = ship.split("=");
                        const shipType = parseInt(type);
                        const shipCount = parseInt(count);
                        
                        if (isNaN(shipType) || isNaN(shipCount) || shipType < 1 || shipType > 9) {
                            continue;
                        }
                        
                        // Check if player has enough ships
                        const availableShips = sourceSector[`totalship${shipType}`] || 0;
                        if (shipCount > availableShips) {
                            connection.sendUTF(`Not enough ships of type ${shipType}`);
                            return;
                        }
                        
                        fleetToMove[`ship${shipType}`] = shipCount;
                        
                        // Add movement cost
                        switch (shipType) {
                            case 1: movementCost += shipCount * 200; break; // Frigate
                            case 2: movementCost += shipCount * 300; break; // Destroyer
                            case 3: movementCost += shipCount * 100; break; // Scout
                            case 4: movementCost += shipCount * 200; break; // Cruiser
                            case 5: movementCost += shipCount * 300; break; // Battleship
                            case 6: movementCost += shipCount * 200; break; // Colony Ship
                            case 7: movementCost += shipCount * 500; break; // Dreadnought
                            case 8: movementCost += shipCount * 200; break; // Intruder
                            case 9: movementCost += shipCount * 300; break; // Carrier
                        }
                    }
                    
                    // Check if player has enough crystal
                    if (player.crystal < movementCost) {
                        connection.sendUTF(`Not enough crystal. Movement requires ${movementCost}`);
                        return;
                    }
                    
                    // Update player's crystal
                    db.query(`UPDATE players${connection.gameid} SET crystal = crystal - ? WHERE playerid = ?`, 
                        [movementCost, connection.name]);
                    
                    // Update source sector ships
                    let updateQuery = `UPDATE map${connection.gameid} SET `;
                    for (let i = 1; i <= 9; i++) {
                        updateQuery += `totalship${i} = totalship${i} - ${fleetToMove[`ship${i}`]}`;
                        if (i < 9) updateQuery += ', ';
                    }
                    updateQuery += ` WHERE sectorid = ?`;
                    
                    db.query(updateQuery, [connection.sectorid]);
                    
                    // Schedule fleet arrival
                    setTimeout(() => {
                        endTravel(
                            fleetToMove.ship1, fleetToMove.ship2, fleetToMove.ship3,
                            fleetToMove.ship4, fleetToMove.ship5, fleetToMove.ship6,
                            fleetToMove.ship7, fleetToMove.ship8, fleetToMove.ship9,
                            connection.name, connection.gameid, targetSector, 
                            player, targetSector, connection
                        );
                    }, 10000);
                    
                    connection.sendUTF(`Fleet dispatched to sector ${targetSector.toString(16).toUpperCase()}. Cost: ${movementCost} crystal`);
                    updateAllSectors(connection.gameid, connection);
                }
            );
        }
    );
}

function probeSector(message, connection) {
    const sectorId = parseInt(message.split(":")[1], 16);
    
    // Check if player has enough crystal
    db.query(`SELECT * FROM players${connection.gameid} WHERE playerid = ? LIMIT 1`, 
        [connection.name], (err, playerResults) => {
            if (err || playerResults.length === 0) {
                console.error("Error retrieving player data:", err);
                connection.sendUTF('Error: Player data not found');
                return;
            }
            
            const player = playerResults[0];
            
            // Probe costs 300 crystal
            if (player.crystal < 300) {
                connection.sendUTF('Not enough crystal. Probing requires 300 crystal');
                return;
            }
            
            // Deduct crystal
            db.query(`UPDATE players${connection.gameid} SET crystal = crystal - 300 WHERE playerid = ?`, 
                [connection.name]);
            
            // Get sector data
            db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`, 
                [sectorId], (err, sectorResults) => {
                    if (err || sectorResults.length === 0) {
                        console.error("Error retrieving sector data:", err);
                        connection.sendUTF('Error: Sector not found');
                        return;
                    }
                    
                    const sector = sectorResults[0];
                    
                    // Send basic sector data to client
                    connection.sendUTF(`sector:${sectorId.toString(16).toUpperCase()}:owner:${sector.ownerid}:type:${sector.sectortype}:artifact:${sector.artifact}:metalbonus:${sector.metalbonus}:crystalbonus:${sector.crystalbonus}:terraform:${sector.terraformlvl}`);
                    
                    // If player has advanced probe tech, send more information
                    db.query(`SELECT tech8 FROM players${connection.gameid} WHERE playerid = ? LIMIT 1`, 
                        [connection.name], (err, techResults) => {
                            if (!err && techResults.length > 0) {
                                const probeTech = techResults[0].tech8 || 0;
                                
                                // Higher probe tech gives more information
                                if (probeTech >= 3) {
                                    // Send building levels
                                    connection.sendUTF(`ub:${sector.metallvl}:${sector.crystallvl}:${sector.academylvl}:${sector.shipyardlvl}:${sector.orbitalturret}:${sector.warpgate}`);
                                }
                                
                                if (probeTech >= 5) {
                                    // Send fleet information
                                    connection.sendUTF(`fleet:${sector.totalship1}:${sector.totalship2}:${sector.totalship3}:${sector.totalship4}:${sector.totalship5}:${sector.totalship6}:${sector.totalship7}:${sector.totalship8}:${sector.totalship9}:${sector.totship1build}:${sector.totship2build}:${sector.totship3build}:${sector.totship4build}:${sector.totship5build}:${sector.totship6build}:${sector.totship7build}:${sector.totship8build}:${sector.totship9build}`);
                                }
                            }
                        }
                    );
                    
                    connection.sendUTF(`Probe sent to sector ${sectorId.toString(16).toUpperCase()}`);
                }
            );
        }
    );
}


function colonizePlanet(connection) {
    if (!connection.sectorid) {
        connection.sendUTF('You need to select a sector first');
        return;
    }
    
    // Get sector data
    db.query(`SELECT * FROM map${connection.gameid} WHERE sectorid = ? LIMIT 1`, [connection.sectorid], 
        (err, results) => {
            if (err || results.length === 0) {
                console.error("Error retrieving sector data:", err);
                return;
            }
            
            const sector = results[0];
            
            // Get player's terraform tech level
            db.query(`SELECT tech7 FROM players${connection.gameid} WHERE playerid = ? LIMIT 1`, 
                [connection.name], (err, techResults) => {
                    if (err || techResults.length === 0) {
                        console.error("Error retrieving tech data:", err);
                        return;
                    }
                    
                    const terraformLevel = techResults[0].tech7 || 0;
                    
                    // Check colonization requirements
                    if (sector.ownerid != connection.name) {
                        connection.sendUTF('You must control this sector to colonize it');
                        return;
                    }
                    
                    if (sector.colonized === 1) {
                        connection.sendUTF('This sector is already colonized');
                        return;
                    }
                    
                    if (sector.sectortype <= 5) {
                        connection.sendUTF('This sector has no planet to colonize');
                        return;
                    }
                    
                    if (terraformLevel < sector.terraformlvl) {
                        connection.sendUTF(`This planet requires terraform level ${sector.terraformlvl} to colonize`);
                        return;
                    }
                    
                    if (sector.totalship6 <= 0) {
                        connection.sendUTF('You need at least one colony ship in this sector to colonize');
                        return;
                    }
                    
                    // All requirements met, colonize the planet
                    db.query(`UPDATE map${connection.gameid} SET 
                        colonized = 1, 
                        totalship6 = totalship6 - 1
                        WHERE sectorid = ?`, 
                        [connection.sectorid], (err) => {
                            if (err) {
                                console.error("Error colonizing planet:", err);
                                return;
                            }
                            
                            connection.sendUTF(`Sector ${connection.sectorid.toString(16).toUpperCase()} has been successfully colonized!`);
                            updateSector2(connection.sectorid, connection);
                            updateAllSectors(connection.gameid, connection);
                        }
                    );
                }
            );
        }
    );
}

function gameMechanics(gameId) {
    // Process resource production
    db.query(`SELECT * FROM map${gameId} WHERE colonized = 1`, (err, sectors) => {
        if (err) {
            console.error("Error retrieving colonized sectors:", err);
            return;
        }
        
        // Group sectors by owner
        const ownerSectors = {};
        
        sectors.forEach(sector => {
            if (!ownerSectors[sector.ownerid]) {
                ownerSectors[sector.ownerid] = [];
            }
            ownerSectors[sector.ownerid].push(sector);
        });
        
        // Process each player's sectors
        for (const [ownerId, playerSectors] of Object.entries(ownerSectors)) {
            // Get player's tech levels
            db.query(`SELECT * FROM players${gameId} WHERE playerid = ? LIMIT 1`, 
                [ownerId], (err, playerResults) => {
                    if (err || playerResults.length === 0) {
                        console.error(`Error retrieving player ${ownerId} data:`, err);
                        return;
                    }
                    
                    const player = playerResults[0];
                    
                    // Calculate resource production for each sector
                    let totalMetal = 0;
                    let totalCrystal = 0;
                    let totalResearch = 0;
                    
                    playerSectors.forEach(sector => {
                        // Base production per level
                        const metalBase = sector.metallvl * 100;
                        const crystalBase = sector.crystallvl * 100;
                        const researchBase = sector.academylvl * 100;
                        
                        // Apply sector bonuses
                        const metalBonus = metalBase * (sector.metalbonus / 100);
                        const crystalBonus = crystalBase * (sector.crystalbonus / 100);
                        
                        // Apply tech bonuses
                        const metalProduction = Math.round(metalBonus * (1 + (player.tech1 * 0.1 || 0)));
                        const crystalProduction = Math.round(crystalBonus * (1 + (player.tech2 * 0.1 || 0)));
                        const researchProduction = Math.round(researchBase * (1 + (player.tech3 * 0.1 || 0)));
                        
                        totalMetal += metalProduction;
                        totalCrystal += crystalProduction;
                        totalResearch += researchProduction;
                    });
                    
                    // Update player's resources
                    db.query(`UPDATE players${gameId} SET 
                        metal = metal + ?, 
                        crystal = crystal + ?, 
                        research = research + ? 
                        WHERE playerid = ?`, 
                        [totalMetal, totalCrystal, totalResearch, ownerId]
                    );
                    
                    // Process ship construction
                    playerSectors.forEach(sector => {
                        for (let i = 1; i <= 9; i++) {
                            const buildingShips = sector[`totship${i}build`] || 0;
                            if (buildingShips > 0) {
                                db.query(`UPDATE map${gameId} SET 
                                    totalship${i} = totalship${i} + 1, 
                                    totship${i}build = totship${i}build - 1 
                                    WHERE sectorid = ?`, 
                                    [sector.sectorid]
                                );
                            }
                        }
                    });
                    
                    // Notify player if they're online
                    const client = clientMap[ownerId];
                    if (client) {
                        updateResources(client);
                        updateAllSectors(gameId, client);
                        client.sendUTF(`Resource production: ${totalMetal} Metal, ${totalCrystal} Crystal, ${totalResearch} Research`);
                    }
                }
            );
        }
    });
}

// Add to connect.js
function gameMechanics(gameId) {
    // Process resource production
    db.query(`SELECT * FROM map${gameId} WHERE colonized = 1`, (err, sectors) => {
        if (err) {
            console.error("Error retrieving colonized sectors:", err);
            return;
        }
        
        // Group sectors by owner
        const ownerSectors = {};
        
        sectors.forEach(sector => {
            if (!ownerSectors[sector.ownerid]) {
                ownerSectors[sector.ownerid] = [];
            }
            ownerSectors[sector.ownerid].push(sector);
        });
        
        // Process each player's sectors
        for (const [ownerId, playerSectors] of Object.entries(ownerSectors)) {
            // Get player's tech levels
            db.query(`SELECT * FROM players${gameId} WHERE playerid = ? LIMIT 1`, 
                [ownerId], (err, playerResults) => {
                    if (err || playerResults.length === 0) {
                        console.error(`Error retrieving player ${ownerId} data:`, err);
                        return;
                    }
                    
                    const player = playerResults[0];
                    
                    // Calculate resource production for each sector
                    let totalMetal = 0;
                    let totalCrystal = 0;
                    let totalResearch = 0;
                    
                    playerSectors.forEach(sector => {
                        // Base production per level
                        const metalBase = sector.metallvl * 100;
                        const crystalBase = sector.crystallvl * 100;
                        const researchBase = sector.academylvl * 100;
                        
                        // Apply sector bonuses
                        const metalBonus = metalBase * (sector.metalbonus / 100);
                        const crystalBonus = crystalBase * (sector.crystalbonus / 100);
                        
                        // Apply tech bonuses
                        const metalProduction = Math.round(metalBonus * (1 + (player.tech1 * 0.1 || 0)));
                        const crystalProduction = Math.round(crystalBonus * (1 + (player.tech2 * 0.1 || 0)));
                        const researchProduction = Math.round(researchBase * (1 + (player.tech3 * 0.1 || 0)));
                        
                        totalMetal += metalProduction;
                        totalCrystal += crystalProduction;
                        totalResearch += researchProduction;
                    });
                    
                    // Update player's resources
                    db.query(`UPDATE players${gameId} SET 
                        metal = metal + ?, 
                        crystal = crystal + ?, 
                        research = research + ? 
                        WHERE playerid = ?`, 
                        [totalMetal, totalCrystal, totalResearch, ownerId]
                    );
                    
                    // Process ship construction
                    playerSectors.forEach(sector => {
                        for (let i = 1; i <= 9; i++) {
                            const buildingShips = sector[`totship${i}build`] || 0;
                            if (buildingShips > 0) {
                                db.query(`UPDATE map${gameId} SET 
                                    totalship${i} = totalship${i} + 1, 
                                    totship${i}build = totship${i}build - 1 
                                    WHERE sectorid = ?`, 
                                    [sector.sectorid]
                                );
                            }
                        }
                    });
                    
                    // Notify player if they're online
                    const client = clientMap[ownerId];
                    if (client) {
                        updateResources(client);
                        updateAllSectors(gameId, client);
                        client.sendUTF(`Resource production: ${totalMetal} Metal, ${totalCrystal} Crystal, ${totalResearch} Research`);
                    }
                }
            );
        }
    });
}

// Helper function to get colonized sectors
function getColonizedSectors(gameId) {
    // Create a results array to hold colonized sectors
    const colonizedSectors = [];
    
    // This would normally be a database query
    // For now we'll iterate through current connections to find player sectors
    clients.forEach(client => {
        if (client.gameid === gameId) {
            // Query database for player's colonized sectors
            db.query(`SELECT * FROM map${gameId} WHERE ownerid = ? AND colonized = 1`, 
                [client.name], (err, results) => {
                    if (err) {
                        console.error("Error retrieving colonized sectors:", err);
                        return;
                    }
                    
                    // Add found sectors to the results array
                    results.forEach(sector => {
                        colonizedSectors.push(sector);
                    });
                }
            );
        }
    });
    
    return colonizedSectors;
}

// Helper function to process ship construction
function processShipConstruction(gameId) {
    // Get all sectors with ongoing ship production
    db.query(`SELECT * FROM map${gameId} WHERE 
              totship1build > 0 OR totship2build > 0 OR totship3build > 0 OR 
              totship4build > 0 OR totship5build > 0 OR totship6build > 0 OR 
              totship7build > 0 OR totship8build > 0 OR totship9build > 0`, 
        (err, sectors) => {
            if (err) {
                console.error("Error retrieving sectors with ship production:", err);
                return;
            }
            
            // Process each sector's ship construction
            sectors.forEach(sector => {
                // Check each ship type
                for (let i = 1; i <= 9; i++) {
                    const buildingShips = sector[`totship${i}build`] || 0;
                    
                    if (buildingShips > 0) {
                        // Complete one ship of this type
                        db.query(`UPDATE map${gameId} SET 
                            totalship${i} = totalship${i} + 1, 
                            totship${i}build = totship${i}build - 1 
                            WHERE sectorid = ?`, 
                            [sector.sectorid], (err) => {
                                if (err) {
                                    console.error(`Error updating ship construction for sector ${sector.sectorid}:`, err);
                                    return;
                                }
                                
                                // Notify player if they're online
                                const client = clientMap[sector.ownerid];
                                if (client) {
                                    client.sendUTF(`A new ship has been completed in sector ${sector.sectorid.toString(16).toUpperCase()}`);
                                    
                                    // Update player's view
                                    updateSector2(sector.sectorid, client);
                                }
                            }
                        );
                    }
                }
            });
        }
    );
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

window.initializeGame = initializeGame;