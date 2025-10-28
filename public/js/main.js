/**
 * main.js - Client-side primary game code
 * 
 * Contains core game functionality for the client side application.
 * Handles game state updates, UI interactions, and communication with the server.
 * This appears to be a fragment or partial file in the codebase.
 * 
 * This module is client-side only and does not directly access the database.
 * 
 * Dependencies:
 * - Uses GalaxyMap for map visualization
 * - May be used by or incorporated into other client modules
 */
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

// Update fleet information
function updateFleetInfo(message) {
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
            cancelButton.style.display = parseInt(parts[i + 9]) > 0 ? 'inline' : 'none';
        }
    }
    
    // Update ship selection lists if visible
    updateShipSelectionLists(parts);
}

// Update ship selection lists for fleet movement
function updateShipSelectionLists(fleetData) {
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
        const count = parseInt(fleetData[shipType.id]) || 0;
        for (let i = 1; i <= count; i++) {
            const option = document.createElement('option');
            option.value = `${shipType.id < 7 ? String.fromCharCode(96 + shipType.id) : shipType.id}${i}`;
            option.text = `${shipType.name} ${i}`;
            shipsFrom.add(option);
        }
    });
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
    
    // If using the new tech UI, update that as well
    if (window.TechSystem && document.getElementById('techtree')) {
        window.TechSystem.renderTechUI(
            GAME_STATE.player.techLevels,
            GAME_STATE.player.resources.research,
            document.getElementById('techtree')
        );
    }
}

// Update sector information
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
        sectorImage.style.backgroundImage = `url(./images/type${sectorData.type}.gif)`;
    }
}

// Update sector status (for enemy sectors)
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

// Update buildings
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
    // Building levels
    for (let i = 1; i <= 5; i++) {
        const levelDisplay = document.getElementById(`bbb${i}`);
        if (levelDisplay) {
            levelDisplay.textContent = parts[i] || '0';
        }
    }
    
    // Next level display
    for (let i = 1; i <= 5; i++) {
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
    } else {
        const warpgateButton = document.getElementById('bb6');
        if (warpgateButton) {
            warpgateButton.style.background = 'orange';
        }
    }
    
    // Update building UI opacity based on planet type
    updateBuildingUIOpacity();
}

// Update building UI opacity based on selected planet
function updateBuildingUIOpacity() {
    if (!GAME_STATE.selectedSectorData) return;
    
    const planetType = GAME_STATE.selectedSectorData.type;
    const buildDiv = document.getElementById('build');
    const fleetDiv = document.getElementById('fleet');
    const buildTab = document.getElementById('buildtab');
    const fleetTab = document.getElementById('fleettab');
    
    if (planetType <= 5) {
        // Non-colonizable planets
        if (buildDiv) buildDiv.style.opacity = '0.2';
        if (fleetDiv) fleetDiv.style.opacity = '0.2';
        if (buildTab) buildTab.style.opacity = '0.2';
        if (fleetTab) fleetTab.style.opacity = '0.2';
    } else {
        // Colonizable planets
        if (buildDiv) buildDiv.style.opacity = '1';
        if (fleetDiv) fleetDiv.style.opacity = '1';
        if (buildTab) buildTab.style.opacity = '1';
        if (fleetTab) fleetTab.style.opacity = '1';
        
        // Check max building levels based on planet size
        let maxBuildings = 4; // Default for micro planet
        
        if (planetType === 7) maxBuildings = 6;      // Small planet
        else if (planetType === 8) maxBuildings = 8; // Medium planet
        else if (planetType === 9) maxBuildings = 10; // Large planet
        else if (planetType === 10) maxBuildings = 12; // Homeworld
        
        // Disable building buttons if at max level for planet size
        for (let i = 1; i <= 3; i++) { // Resource buildings
            const button = document.getElementById(`bb${i}`);
            const level = GAME_STATE.selectedSectorData.buildings ?
                (i === 1 ? GAME_STATE.selectedSectorData.buildings.metalExtractor :
                 i === 2 ? GAME_STATE.selectedSectorData.buildings.crystalRefinery :
                 GAME_STATE.selectedSectorData.buildings.researchAcademy) : 0;
                 
            if (button && level >= maxBuildings / 2) {
                button.style.background = '#222';
            } else if (button) {
                button.style.background = 'lightgreen';
            }
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
    document.getElementById('metalresource').innerHTML = ` ${resources.metal} Metal,`;
    document.getElementById('crystalresource').innerHTML = ` ${resources.crystal} Crystal,`;
    document.getElementById('researchresource').innerHTML = ` ${resources.research} Research`;
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

// Create battle visualization
function createBattleVisualization(message) {
    console.log("Creating battle visualization", message);
    
    // Parse battle data
    const parts = message.split(':');
    if (parts.length < 20) return;
    
    // Create battle container
    const battleDiv = document.createElement('div');
    battleDiv.id = 'battleGround';
    battleDiv.style.position = 'absolute';
    battleDiv.style.left = '10%';
    battleDiv.style.width = '80%';
    battleDiv.style.height = '80%';
    battleDiv.style.top = '10%';
    battleDiv.style.background = '#000';
    battleDiv.style.backgroundImage = 'url(./images/spacebak.jpg)';
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
        groundImg.id = '1d0' + (9);
        groundImg.style.position = 'absolute';
        groundImg.style.left = '0%';
        groundImg.style.top = '10%';
        groundImg.style.height = '90%';
        groundImg.src = './images/ground.gif';
        battleDiv.appendChild(groundImg);
        
        const baseImg = document.createElement('img');
        baseImg.id = '1d0' + (10);
        baseImg.style.position = 'absolute';
        baseImg.style.left = '15%';
        baseImg.style.top = '60%';
        baseImg.src = './images/base.png';
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
        img.style.webkitTransform = 'scaleX(-1)';
    } else {
        img.style.left = Math.round(Math.random() * 20 + 20) + '%';
    }
    
    img.style.top = Math.round(Math.random() * 60 + 20) + '%';
    img.src = './images/ship' + shipType + '.gif';
    container.appendChild(img);
}

// Animate a battle round
function animateBattleRound(battleData, round, container) {
    const delay = 5000 * round;
    
    setTimeout(() => {
        // Get ship counts before and after this round
        let ships = [];
        
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
                        ship.src = './images/boom.gif';
                    }
                }, Math.random() * 2000);
            }
        }
    }, delay);
}

// Disble max building
function disableMaxBuilding(buildingType) {
    const buildingButton = document.getElementById(`bb${buildingType}`);
    if (buildingButton) {
        buildingButton.style.background = '#222';
    }
}

// Move ships between lists
function moveShips(fromId, toId) {
    const fromList = document.getElementById(fromId);
    const toList = document.getElementById(toId);
    
    if (!fromList || !toList) return;
    
    // Get selected options
    const selectedOptions = [];
    for (let i = 0; i < fromList.options.length; i++) {
        if (fromList.options[i].selected) {
            selectedOptions.push({
                value: fromList.options[i].value,
                text: fromList.options[i].text
            });
        }
    }
    
    // Move selected options to target list
    selectedOptions.forEach(option => {
        // Remove from source list
        for (let i = 0; i < fromList.options.length; i++) {
            if (fromList.options[i].value === option.value) {
                fromList.remove(i);
                break;
            }
        }
        
        // Add to target list
        const newOption = document.createElement('option');
        newOption.value = option.value;
        newOption.text = option.text;
        toList.add(newOption);
    });
}

// Send multiple move fleet command
function sendmmf() {
    const sectorId = document.getElementById('sectorofattack').innerHTML;
    const shipList = document.getElementById('shipsFromNearBy');
    
    if (!sectorId || !shipList) return;
    
    let message = sectorId;
    let totalShips = 0;
    let sumOfShips = 0;
    
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
    
    // Calculate crystal cost
    const selectedValues = message.split(':');
    for (let y = 3; y <= (selectedValues.length - 1); y += 3) {
        const shipType = parseInt(selectedValues[y - 1]);
        const count = parseInt(selectedValues[y]) || 1;
        
        switch (shipType) {
            case 1: sumOfShips += count * 2; break; // Frigate
            case 2: sumOfShips += count * 3; break; // Destroyer
            case 3: sumOfShips += count * 1; break; // Scout
            case 4: sumOfShips += count * 2; break; // Cruiser
            case 5: sumOfShips += count * 3; break; // Battleship
            case 6: sumOfShips += count * 2; break; // Colony Ship
            case 7: sumOfShips += count * 5; break; // Dreadnought
            case 8: sumOfShips += count * 2; break; // Intruder
            case 9: sumOfShips += count * 3; break; // Carrier
        }
    }
    
    // Confirm movement
    if (confirm(`Are you sure you wish to send these ${totalShips} ships to sector ${sectorId}? It will cost you ${sumOfShips * 100} crystal.`)) {
        websocket.send("//sendmmf:" + message);
        document.getElementById('multiMove').style.display = 'none';
    }
}

// Send all ships from nearby sectors
function sendallmm() {
    const sectorId = document.getElementById('sectorofattack').innerHTML;
    const shipList = document.getElementById('shipsFromNearBy');
    
    if (!sectorId || !shipList) return;
    
    if (shipList.options.length === 0) {
        alert("No ships available");
        return;
    }
    
    let message = sectorId;
    let totalShips = 0;
    let sumOfShips = 0;
    
    // Add all ships to message
    for (let i = 0; i < shipList.options.length; i++) {
        message += ":" + shipList.options[i].value;
        totalShips++;
    }
    
    // Calculate crystal cost
    const selectedValues = message.split(':');
    for (let y = 3; y <= (selectedValues.length - 1); y += 3) {
        const shipType = parseInt(selectedValues[y - 1]);
        const count = parseInt(selectedValues[y]) || 1;
        
        switch (shipType) {
            case 1: sumOfShips += count * 2; break;
            case 2: sumOfShips += count * 3; break;
            case 3: sumOfShips += count * 1; break;
            case 4: sumOfShips += count * 2; break;
            case 5: sumOfShips += count * 3; break;
            case 6: sumOfShips += count * 2; break;
            case 7: sumOfShips += count * 5; break;
            case 8: sumOfShips += count * 2; break;
            case 9: sumOfShips += count * 3; break;
        }
    }
    
    // Confirm movement
    if (confirm(`Are you sure you wish to send all ${totalShips} ships to sector ${sectorId}? It will cost you ${sumOfShips * 100} crystal.`)) {
        websocket.send("//sendmmf:" + message);
        document.getElementById('multiMove').style.display = 'none';
    }
}

// Send only attack ships (excluding scouts and colony ships)
function sendaamm() {
    const sectorId = document.getElementById('sectorofattack').innerHTML;
    const shipList = document.getElementById('shipsFromNearBy');
    
    if (!sectorId || !shipList) return;
    
    let message = sectorId;
    let totalShips = 0;
    let sumOfShips = 0;
    
    // Add all attack ships to message (exclude scouts and colony ships)
    for (let i = 0; i < shipList.options.length; i++) {
        const value = shipList.options[i].value;
        const parts = value.split(':');
        const shipType = parseInt(parts[1]);
        
        // Skip scouts (type 3) and colony ships (type 6)
        if (shipType !== 3 && shipType !== 6) {
            message += ":" + value;
            totalShips++;
        }
    }
    
    if (totalShips === 0) {
        alert("No attack ships available");
        return;
    }
    
    // Calculate crystal cost
    const selectedValues = message.split(':');
    for (let y = 3; y <= (selectedValues.length - 1); y += 3) {
        const shipType = parseInt(selectedValues[y - 1]);
        const count = parseInt(selectedValues[y]) || 1;
        
        switch (shipType) {
            case 1: sumOfShips += count * 2; break;
            case 2: sumOfShips += count * 3; break;
            case 4: sumOfShips += count * 2; break;
            case 5: sumOfShips += count * 3; break;
            case 7: sumOfShips += count * 5; break;
            case 8: sumOfShips += count * 2; break;
            case 9: sumOfShips += count * 3; break;
        }
    }
    
    // Confirm movement
    if (confirm(`Are you sure you wish to send these ${totalShips} attack ships to sector ${sectorId}? It will cost you ${sumOfShips * 100} crystal.`)) {
        websocket.send("//sendmmf:" + message);
        document.getElementById('multiMove').style.display = 'none';
    }
}

// Global game state
const GAME_STATE = {
    // Player data
    player: {
        id: null,
        name: null,
        resources: {
            metal: 0,
            crystal: 0,
            research: 0
        },
        techLevels: {}
    },
    
    // Game data
    gameId: null,
    gameStarted: false,
    turn: 0,
    
    // Selected sector
    selectedSector: null,
    selectedSectorData: null,
    
    // Building in progress
    buildingInProgress: false,
    
    // Fleet movement in progress
    fleetMovementInProgress: false
};

document.addEventListener('DOMContentLoaded', function() {
    // Initialize WebSocket connection
    initializeWebSocket();
    
    // Set up event listeners for UI
    setupEventListeners();
    
    // Disable selection on game elements
    disableSelection(document);
    
    console.log('Game of Words initialized');
});

function disableSelection(element) {
    if (!element) return;
    
    element.onselectstart = function() { return false; };
    element.style.userSelect = "none";
    
    const children = element.getElementsByTagName('*');
    for (let i = 0; i < children.length; i++) {
        disableSelection(children[i]);
    }
}

function setupEventListeners() {
    // Next turn button
    document.getElementById('nextTurnBtn')?.addEventListener('click', nextTurn);
    
    // Chat form
    document.querySelector('form#chatForm')?.addEventListener('submit', sendChat);
    
    // Chat history buttons
    document.getElementById('chatHistoryUp')?.addEventListener('click', showChatHistory);
    document.getElementById('chatHistoryDown')?.addEventListener('click', function() {
        chatID = 0;
        showChatHistory();
    });
    
    // Close multi-move button
    document.getElementById('closeMultiMove')?.addEventListener('click', function() {
        document.getElementById('multiMove').style.display = 'none';
    });
    
    // Move buttons
    document.getElementById('moveSelectedShips')?.addEventListener('click', sendmmf);
    document.getElementById('moveAllShips')?.addEventListener('click', sendallmm);
    document.getElementById('moveAttackShips')?.addEventListener('click', sendaamm);
}


// Set up ship selection controls
function setupShipSelectionControls() {
    const moveRightBtn = document.querySelector('button[onclick="moveShips(shipsFrom,shipsTo);"]');
    if (moveRightBtn) {
        moveRightBtn.removeAttribute('onclick');
        moveRightBtn.addEventListener('click', () => moveShips('shipsFrom', 'shipsTo'));
    }
    
    const moveLeftBtn = document.querySelector('button[onclick="moveShips(shipsTo,shipsFrom);"]');
    if (moveLeftBtn) {
        moveLeftBtn.removeAttribute('onclick');
        moveLeftBtn.addEventListener('click', () => moveShips('shipsTo', 'shipsFrom'));
    }
}

// Set up multi-move dialog controls
function setupMultiMoveControls() {
    // Close button
    const closeBtn = document.querySelector('#multiMove button[onclick="document.getElementById(\'multiMove\').style.display=\'none\';"]');
    if (closeBtn) {
        closeBtn.removeAttribute('onclick');
        closeBtn.addEventListener('click', () => {
            document.getElementById('multiMove').style.display = 'none';
        });
    }
    
    // Move selected ships button
    const moveSelectedBtn = document.querySelector('button[onclick="sendmmf();"]');
    if (moveSelectedBtn) {
        moveSelectedBtn.removeAttribute('onclick');
        moveSelectedBtn.addEventListener('click', sendmmf);
    }
    
    // Move all ships button
    const moveAllBtn = document.querySelector('button[onclick="sendallmm();"]');
    if (moveAllBtn) {
        moveAllBtn.removeAttribute('onclick');
        moveAllBtn.addEventListener('click', sendallmm);
    }
    
    // Move attack ships button
    const moveAttackBtn = document.querySelector('button[onclick="sendaamm();"]');
    if (moveAttackBtn) {
        moveAttackBtn.removeAttribute('onclick');
        moveAttackBtn.addEventListener('click', sendaamm);
    }
}

// Set up tab controls
function setupTabControls() {
    // Implement tab navigation for side panels
    const tabs = document.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const target = this.getAttribute('data-target');
            
            // Hide all panels
            document.querySelectorAll('.tab-panel').forEach(panel => {
                panel.style.display = 'none';
            });
            
            // Show target panel
            const targetPanel = document.getElementById(target);
            if (targetPanel) {
                targetPanel.style.display = 'block';
            }
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });
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
        handleBattle(message);
    }
    // Lobby information
    else if (message.indexOf("lobby::") === 0) {
        // Game not started yet
        GAME_STATE.gameStarted = false;
    }
    // Max build notification
    else if (message.indexOf("maxbuild::") === 0) {
        const buildingType = parseInt(message.split("::")[1]);
        disableMaxBuilding(buildingType);
    }
    // Player list
    else if (message.indexOf("pl:") === 0) {
        updatePlayerList(message);
    }
    // Probe only notification
    else if (message.indexOf("probeonly:") === 0) {
        showProbeDialog(message);
    }
    // Multiple move options
    else if (message.indexOf("mmoptions:") === 0) {
        showMultiMoveOptions(message);
    }
    // New round
    else if (message === "newround:") {
        startNewRound();
    }
    // Owned sector information
    else if (message.indexOf("ownsector:") === 0) {
        updateOwnedSector(message);
    }
    // Fleet information
    else if (message.indexOf("fleet:") === 0) {
        updateFleetInfo(message);
    }
    // Technology information
    else if (message.indexOf("tech:") === 0) {
        updateTechLevels(message);
    }
    // 10 second countdown
    else if (message === "start10:") {
        startCountdown(10);
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
        displayChatMessage(message);
    }
}

// Handle battle display
function handleBattle(message) {
    // Create battle visualization
    createBattleVisualization(message);
}

// Update player list
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

// Show probe dialog
function showProbeDialog(message) {
    const sectorId = message.split(":")[1];
    if (confirm('You do not control this sector. Would you like to use a probe to scan it? (cost: 300 Crystal)')) {
        sendToServer(`//probe:${sectorId}`);
    }
}

// Show multi-move options
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
            
            // Next 6 values are ship counts for the sector
            const frigate = parseInt(parts[i++]) || 0;
            const destroyer = parseInt(parts[i++]) || 0;
            const scout = parseInt(parts[i++]) || 0;
            const cruiser = parseInt(parts[i++]) || 0;
            const battleship = parseInt(parts[i++]) || 0;
            const colonyShip = parseInt(parts[i++]) || 0;
            
            // Add options for each ship type
            addShipOptions(shipList, sectorId, 1, frigate, "Frigate");
            addShipOptions(shipList, sectorId, 2, destroyer, "Destroyer");
            addShipOptions(shipList, sectorId, 3, scout, "Scout");
            addShipOptions(shipList, sectorId, 4, cruiser, "Cruiser");
            addShipOptions(shipList, sectorId, 5, battleship, "Battleship");
            addShipOptions(shipList, sectorId, 6, colonyShip, "Colony Ship");
        }
    }
    
    // Show dialog
    multiMoveDiv.style.display = 'block';
}

// Add ship options to select element
function addShipOptions(selectElement, sectorId, shipType, count, shipName) {
    for (let i = 1; i <= count; i++) {
        const option = document.createElement('option');
        option.value = `${sectorId}:${shipType}:${i}`;
        option.text = `${shipName} ${i} in sector ${sectorId}`;
        selectElement.add(option);
    }
}

// Start new round
function startNewRound() {
    GAME_STATE.gameStarted = true;
    GAME_STATE.turn++;
    
    // Update UI
    const nextTurnText = document.getElementById('nextTurnText');
    if (nextTurnText) {
        nextTurnText.textContent = 'Next Turn';
    }
    
    startCountdown(180); // 3 minutes
}

// Start countdown timer
function startCountdown(seconds) {
    let timer = seconds;
    
    // Update timer display
    const timerDisplay = document.getElementById('turnRedFlashWhenLow');
    if (timerDisplay) {
        timerDisplay.textContent = `${timer}s`;
    }
    
    // Clear existing interval
    if (window.turnInterval) {
        clearInterval(window.turnInterval);
    }
    
    // Set new interval
    window.turnInterval = setInterval(() => {
        timer--;
        
        if (timer <= 0) {
            // Time's up
            clearInterval(window.turnInterval);
            
            if (timerDisplay) {
                timerDisplay.textContent = '(..loading)';
            }
        } else {
            if (timerDisplay) {
                timerDisplay.textContent = `${timer}s`;
                
                // Flash timer when time is running low
                if (timer < 30) {
                    timerDisplay.style.color = timer % 2 === 0 ? '#FF0000' : '#FFFFFF';
                }
            }
        }
    }, 1000);
}

function sendChat(event) {
    event.preventDefault();
    const chatInput = document.getElementById("chat");
    if (chatInput.value.trim().length > 0) {
        websocket.send(chatInput.value);
        chatInput.value = "";
    }
}

function pushLog() {
    const d = new Date();
    document.getElementById('timeSince').innerHTML = "0 seconds ago.";
    chatHistoryTime.push(d.getTime());
    chatHistory.push(document.getElementById("log").innerHTML);
    clearInterval(timeSinceCounter);
    timeSinceCounter = setInterval(() => timelogupdate(), 1000);
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
    element.style.opacity = opacity / 100;
}

// Game initialization
(function() {
    // Store modules
    const modules = {};
    
    // Initialize the game
    function initialize() {
        console.log('Game of Words initialization');
        
        // Register modules
        registerModules();
        
        // Initialize each module
        initializeModules();
        
        // Set up global event listeners
        setupGlobalEventListeners();
        
        console.log('Game of Words initialized successfully');
    }
    
    // Register all game modules
    function registerModules() {
        // Core modules
        modules.gameUI = window.GameUI;
        modules.galaxyMap = window.GalaxyMap;
        modules.controlPad = window.ControlPad;
        
        // Check for module availability
        if (!modules.gameUI) console.warn('GameUI module not found');
        if (!modules.galaxyMap) console.warn('GalaxyMap module not found');
        if (!modules.controlPad) console.warn('ControlPad module not found');
    }
    
    // Initialize registered modules
    function initializeModules() {
        // Initialize UI components
        if (modules.gameUI) modules.gameUI.initialize();
        
        // Initialize minimap
        if (modules.galaxyMap) {
            const minimapContainer = document.getElementById('minimapid');
            if (minimapContainer) {
                modules.galaxyMap.initialize(14, 8, 'minimapid');
            }
        }
        
        // Initialize control pad
        if (modules.controlPad) modules.controlPad.initialize();
    }
    
    // Set up global event listeners
    function setupGlobalEventListeners() {
        // Listen for window resize
        window.addEventListener('resize', handleWindowResize);
        
        // Listen for visibility change
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Prevent context menu on right-click
        document.addEventListener('contextmenu', e => e.preventDefault());
    }
    
    // Window resize handler
    function handleWindowResize() {
        // Adjust game viewport scaling
        if (window.screen.availHeight < window.screen.availWidth) {
            document.body.style.zoom = window.screen.availHeight / 700;
        } else {
            document.body.style.zoom = window.screen.availWidth / 700;
        }
    }
    
    // Visibility change handler (pause/resume game timers)
    function handleVisibilityChange() {
        if (document.hidden) {
            // Pause game timers when tab is not visible
            if (window.turnInterval) {
                window.turnIntervalPaused = window.turnInterval;
                clearInterval(window.turnInterval);
            }
        } else {
            // Resume game timers when tab becomes visible
            if (window.turnIntervalPaused) {
                window.turnInterval = setInterval(updateTimer, 1000);
                window.turnIntervalPaused = null;
            }
        }
    }
    
    // Initialize the game when document is ready
    document.addEventListener('DOMContentLoaded', initialize);
})();
