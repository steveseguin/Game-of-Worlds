/**
 * GUI.js - Client-side UI component for Game of Words
 * 
 * Handles the game's main user interface components and interactions.
 * Manages tab navigation, resource display, sectors visualization,
 * building information, and fleet details in the UI.
 * 
 * This module is client-side only and does not directly access the database.
 * It receives data from server responses via websocket messages.
 * 
 * Dependencies:
 * - None, but is used by game.js
 */
const GameUI = (function() {
    // UI state
    let state = {
        isFullScreen: false,
        selectedTab: 'build',
        showBattleAnimation: true
    };
    
    // Initialize UI elements
    function initialize() {
        // Set up responsive sizing
        setupResponsiveSizing();
        
        // Set up event listeners
        setupEventListeners();
        
        // Initial UI state
        updateUIState();
        hideMultiMoveDialog();
    }
    
    // Set up responsive sizing
    function setupResponsiveSizing() {
        // Adjust game viewport based on screen size
        const adjustViewport = () => {
            if (window.screen.availHeight < window.screen.availWidth) {
                document.body.style.zoom = window.screen.availHeight / 700;
                document.body.style.width = window.screen.availWidth;
                document.body.style.height = window.screen.availHeight;
            } else {
                document.body.style.zoom = window.screen.availWidth / 700;
                document.body.style.width = window.screen.availWidth;
                document.body.style.height = window.screen.availHeight;
            }
        };
        
        // Apply initially
        adjustViewport();
        
        // Reapply on window resize
        window.addEventListener('resize', adjustViewport);
    }
    
    // Set up event listeners
	function setupEventListeners() {
		// Tab switching - needs to use our defined function instead of direct manipulation
		document.getElementById('buildtab')?.addEventListener('click', () => switchTab('build'));
		document.getElementById('fleettab')?.addEventListener('click', () => switchTab('fleet'));
		document.getElementById('techtab')?.addEventListener('click', () => switchTab('techtree'));
		document.getElementById('colonizetab')?.addEventListener('click', () => switchTab('colonize'));
		document.getElementById('analyticstab')?.addEventListener('click', () => switchTab('analytics'));
	}
    
    // Switch tabs
    function switchTab(tabName) {
        state.selectedTab = tabName;
        hideMultiMoveDialog();

        const tabs = [
            { panelId: 'build', buttonId: 'buildtab' },
            { panelId: 'fleet', buttonId: 'fleettab' },
            { panelId: 'techtree', buttonId: 'techtab' },
            { panelId: 'colonize', buttonId: 'colonizetab' },
            { panelId: 'analytics', buttonId: 'analyticstab' }
        ];

        // Hide all panels
        tabs.forEach(tab => {
            const panel = document.getElementById(tab.panelId);
            if (panel) {
                panel.classList.add('hidden');
            }
        });

        // Show selected panel
        const selectedPanel = document.getElementById(tabName);
        if (selectedPanel) {
            selectedPanel.classList.remove('hidden');
        }

        // Update tab buttons
        tabs.forEach(tab => {
            const button = document.getElementById(tab.buttonId);
            if (!button) {
                return;
            }
            button.classList.toggle('active', tab.panelId === tabName);
        });
    }
    
    // Update UI state
    function updateUIState() {
        // Make sure the correct tab is displayed
        switchTab(state.selectedTab);
    }

    function hideMultiMoveDialog() {
        const multiMove = document.getElementById('multiMove');
        if (multiMove) {
            multiMove.style.display = 'none';
        }
    }
    
    // Update resource display
    function updateResources(metal, crystal, research) {
        document.getElementById('metalresource').textContent = ` ${metal} Metal,`;
        document.getElementById('crystalresource').textContent = ` ${crystal} Crystal,`;
        document.getElementById('researchresource').textContent = ` ${research} Research`;
    }
    
    // Toggle fullscreen
    function toggleFullScreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable fullscreen: ${err.message}`);
            });
            state.isFullScreen = true;
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                state.isFullScreen = false;
            }
        }
    }

    function getNumericValue(source, paths, fallback = 0) {
        if (!source || typeof source !== 'object') {
            return fallback;
        }

        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            const segments = path.split('.');
            let value = source;

            for (let j = 0; j < segments.length; j++) {
                if (value == null || typeof value !== 'object') {
                    value = undefined;
                    break;
                }
                value = value[segments[j]];
            }

            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return fallback;
    }

    function getSectorType(sectorData) {
        return getNumericValue(
            sectorData,
            ['type', 'sectortype', 'sectorType', 'sector.type', 'sector.sectortype'],
            0
        );
    }
    
    // Update sector display
    function updateSectorDisplay(sectorData) {
        if (!sectorData) return;

        const sectorType = getSectorType(sectorData);
        const ownerName = sectorData.owner || sectorData?.sector?.owner || 'N/A';
        
        // Update basic sector info
        document.getElementById('sectorid').textContent = `Sector ${sectorData.id || 'N/A'}`;
        document.getElementById('planetowner').textContent = `Owner: ${ownerName}`;
        
        // Set sector type
        let planetType = 'Unknown';
        switch (sectorType) {
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
        
        // Update resource bonuses
        if (sectorType > 5) {
            const metalPercent = Math.round(getNumericValue(
                sectorData,
                ['metalBonus', 'metalbonus', 'sector.metalBonus', 'sector.metalbonus'],
                100
            ));
            const crystalPercent = Math.round(getNumericValue(
                sectorData,
                ['crystalBonus', 'crystalbonus', 'sector.crystalBonus', 'sector.crystalbonus'],
                100
            ));
            const terraformRequirement = Math.round(getNumericValue(
                sectorData,
                ['terraformLevel', 'terraformlvl', 'sector.terraformLevel', 'sector.terraformlvl'],
                0
            ));

            // Set metal bonus
            const metalBonus = document.getElementById('metalbonus');
            let metalColor = '#ffe28a';
            if (metalPercent < 100) {
                metalColor = '#ff8a8a';
            } else if (metalPercent >= 200) {
                metalColor = '#84f5a7';
            }
            metalBonus.innerHTML = `Metal Production: <span style="color:${metalColor};font-weight:700;">${metalPercent}%</span>`;
            
            // Set crystal bonus
            const crystalBonus = document.getElementById('crystalbonus');
            let crystalColor = '#ffe28a';
            if (crystalPercent < 100) {
                crystalColor = '#ff8a8a';
            } else if (crystalPercent >= 200) {
                crystalColor = '#84f5a7';
            }
            crystalBonus.innerHTML = `Crystal Production: <span style="color:${crystalColor};font-weight:700;">${crystalPercent}%</span>`;
            
            // Set terraform requirement
            document.getElementById('terraformlvl').textContent = `Terraform Req: ${terraformRequirement}`;
        } else {
            // Non-colonizable sector
            document.getElementById('metalbonus').textContent = 'Metal Production: N/A';
            document.getElementById('crystalbonus').textContent = 'Crystal Production: N/A';
            document.getElementById('terraformlvl').textContent = 'Cannot be colonized';
        }
        
        // Update sector image
        const sectorImg = document.getElementById('sectorimg');
        if (sectorImg) {
            const rawType = Number(sectorType);
            const imageType = Number.isFinite(rawType) && rawType >= 1 && rawType <= 10 ? rawType : 1;
            sectorImg.style.backgroundImage = `url(./images/type${imageType}.gif)`;
        }
    }
    
    // Update building levels
    function updateBuildings(buildings) {
        if (!buildings) return;
        
        // Update building levels
        for (let i = 1; i <= 6; i++) {
            const currentLevel = document.getElementById(`bbb${i}`);
            if (currentLevel) {
                let level = 0;
                
                switch (i) {
                    case 1: level = buildings.metalExtractor; break;
                    case 2: level = buildings.crystalRefinery; break;
                    case 3: level = buildings.researchAcademy; break;
                    case 4: level = buildings.spaceport; break;
                    case 5: level = buildings.orbitalTurret; break;
                    case 6: level = buildings.warpgate; break;
                }
                
                currentLevel.textContent = level || '0';
            }
            
            // Next level
            const nextLevel = document.getElementById(`b${i}`);
            if (nextLevel) {
                let level = 0;
                
                switch (i) {
                    case 1: level = buildings.metalExtractor; break;
                    case 2: level = buildings.crystalRefinery; break;
                    case 3: level = buildings.researchAcademy; break;
                    case 4: level = buildings.spaceport; break;
                    case 5: level = buildings.orbitalTurret; break;
                    case 6: level = buildings.warpgate; break;
                }
                
                nextLevel.textContent = (parseInt(level) || 0) + 1;
            }
            
            // Building costs
            const costDisplay = document.getElementById(`m${i}`);
            if (costDisplay) {
                let cost = 0;
                let level = 0;
                
                switch (i) {
                    case 1: level = buildings.metalExtractor; break;
                    case 2: level = buildings.crystalRefinery; break;
                    case 3: level = buildings.researchAcademy; break;
                    case 4: level = buildings.spaceport; break;
                    case 5: level = buildings.orbitalTurret; break;
                    case 6: break; // Warp Gate has fixed cost
                }
                
                if (i <= 5) {
                    cost = ((parseInt(level) || 0) + 1) * 100;
                } else {
                    cost = 2000; // Warp Gate cost
                }
                
                costDisplay.textContent = cost;
            }
        }
        
        // Special case for warp gate
        if (buildings.warpgate > 0) {
            const warpGateButton = document.getElementById('bb6');
            if (warpGateButton) {
                warpGateButton.style.background = '#222';
            }
        }
    }
    
    // Update fleet information
    function updateFleet(fleet) {
        if (!fleet) return;
        
        // Update ship counts
        for (let i = 1; i <= 9; i++) {
            const shipCount = document.getElementById(`f${i}`);
            if (shipCount) {
                shipCount.textContent = fleet[`ship${i}`] || '0';
            }
            
            // Ships being built
            const buildingCount = document.getElementById(`fa${i}`);
            if (buildingCount) {
                buildingCount.textContent = fleet[`building${i}`] || '0';
            }
            
            // Show/hide cancel buttons
            const cancelButton = document.getElementById(`fc${i}`);
            if (cancelButton) {
                cancelButton.style.display = (parseInt(fleet[`building${i}`]) || 0) > 0 ? 'inline-block' : 'none';
            }
        }
    }
    
	// Update owned sector display on minimap
	function updateOwnedSector(sectorId, fleetSize, indicator) {
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

	// Show multi-move options dialog
	function showMultiMoveOptions(targetSector, shipsData) {
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
			
			// Parse ship data and add to select
			const sectors = shipsData.split(':');
			let i = 0;
			
			while (i < sectors.length) {
				const sectorId = sectors[i++];
				if (!sectorId) break;
				
				const shipCounts = [];
				for (let j = 0; j < 9; j++) {
					shipCounts.push(parseInt(sectors[i++]) || 0);
				}
				
				// Ship type names
				const shipNames = [
					"Frigate", "Destroyer", "Scout", "Cruiser", 
					"Battleship", "Colony Ship", "Dreadnought", 
					"Intruder", "Carrier"
				];
				
				// Add options for each ship type
				shipCounts.forEach((count, idx) => {
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

	// Return public API
	return {
		initialize,
		updateResources,
		updateSectorDisplay,
		updateBuildings,
		updateFleet,
		updateOwnedSector,
		showMultiMoveOptions,
		switchTab,
		toggleFullScreen
	};
})();

// Export to window for connect.js and game.js access.
window.GameUI = GameUI;
