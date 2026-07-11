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
    }

    // Set up responsive sizing
    function setupResponsiveSizing() {
        // Clear any legacy zoom/sizing applied by older code paths.
        // CSS media queries already handle responsive layout for game.html.
        document.body.style.zoom = '';
        document.body.style.width = '';
        document.body.style.height = '';
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
        const multiMove = document.getElementById('multiMove');
        if (multiMove) {
            multiMove.style.display = 'none';
        }

        // Hide all panels
        const panels = ['build', 'fleet', 'techtree', 'colonize', 'analytics'];
        panels.forEach(panel => {
            const element = document.getElementById(panel);
            if (element) element.classList.add('hidden');
        });

        // Show selected panel
        const selectedPanel = document.getElementById(tabName);
        if (selectedPanel) selectedPanel.classList.remove('hidden');

        // Update tab buttons
        const tabButtons = {
            build: 'buildtab',
            fleet: 'fleettab',
            techtree: 'techtab',
            colonize: 'colonizetab',
            analytics: 'analyticstab'
        };
        panels.forEach(panel => {
            const button = document.getElementById(tabButtons[panel]);
            if (button) {
                button.classList.remove('active');
                if (panel === tabName) button.classList.add('active');
            }
        });
    }

    // Update UI state
    function updateUIState() {
        // Make sure the correct tab is displayed
        switchTab(state.selectedTab);
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

    // Update sector display
    function updateSectorDisplay(sectorData) {
        if (!sectorData) return;

        // Update basic sector info
        document.getElementById('sectorid').textContent = `Sector ${sectorData.id || 'N/A'}`;
        document.getElementById('planetowner').textContent = sectorData.owner || 'N/A';

        // Set sector type
        let planetType = 'Unknown';
        switch (sectorData.type) {
            case 0: planetType = 'Empty Space'; break;
            case 1: planetType = 'Asteroid Belt'; break;
            case 2: planetType = 'Black Hole'; break;
            case 3: planetType = 'Unstable Star'; break;
            case 4: planetType = 'Brown Dwarf'; break;
            case 5: planetType = 'Small Moon'; break;
            case 6: planetType = 'Micro Planet (2 slots)'; break;
            case 7: planetType = 'Small Planet (3 slots)'; break;
            case 8: planetType = 'Medium Planet (4 slots)'; break;
            case 9: planetType = 'Large Planet (5 slots)'; break;
            case 10: planetType = 'Homeworld (6 slots)'; break;
        }
        document.getElementById('planettype').textContent = planetType;

        // Update resource bonuses
        if (sectorData.type > 5) {
            // Set metal bonus
            const metalBonus = document.getElementById('metalbonus');
            let metalColor = 'yellow';
            if (sectorData.metalBonus < 100) {
                metalColor = 'red';
            } else if (sectorData.metalBonus >= 200) {
                metalColor = 'green';
            }
            metalBonus.innerHTML = `<span style="color:${metalColor}">${sectorData.metalBonus}%</span>`;

            // Set crystal bonus
            const crystalBonus = document.getElementById('crystalbonus');
            let crystalColor = 'yellow';
            if (sectorData.crystalBonus < 100) {
                crystalColor = 'red';
            } else if (sectorData.crystalBonus >= 200) {
                crystalColor = 'green';
            }
            crystalBonus.innerHTML = `<span style="color:${crystalColor}">${sectorData.crystalBonus}%</span>`;

            // Set terraform requirement
            document.getElementById('terraformlvl').textContent = sectorData.terraformLevel || 0;
        } else {
            // Non-colonizable sector
            document.getElementById('metalbonus').textContent = 'N/A';
            document.getElementById('crystalbonus').textContent = 'N/A';
            document.getElementById('terraformlvl').textContent = 'Cannot be colonized';
        }

        // Building slots: mirrors BUILDING_SLOTS_BY_TYPE on the server.
        const slotsByType = { 1: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6 };
        const slotsEl = document.getElementById('sectorslots');
        if (slotsEl) {
            const maxSlots = slotsByType[sectorData.type] || 0;
            const used = Array.isArray(sectorData.buildings) ? sectorData.buildings.length : 0;
            slotsEl.textContent = maxSlots > 0 ? `${used}/${maxSlots}` : 'none';
        }

        // Update sector image (legacy backdrop; only type1-9.jpg exist, homeworld uses planet art)
        const sectorImg = document.getElementById('sectorimg');
        if (sectorImg) {
            const imagePath = sectorData.type === 10
                ? './images/planet10.jpg'
                : `./images/type${sectorData.type}.jpg`;
            sectorImg.style.backgroundImage = `url(${imagePath})`;
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

    function updateFleetDisplay(ships) {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
        const playerId = (() => {
            const match = document.cookie.match(/(?:^|;\s*)userId=([^;]+)/);
            return match ? Number(decodeURIComponent(match[1])) : null;
        })();

        if (Array.isArray(ships)) {
            ships.forEach(ship => {
                const owner = Number(ship.owner);
                const type = Number(ship.type);
                const count = Number(ship.count) || 0;
                if (playerId && owner !== playerId) {
                    return;
                }
                if (counts[type] !== undefined) {
                    counts[type] += count;
                }
            });
        }

        const fields = {
            'fleet-scouts': counts[3],
            'fleet-frigates': counts[1],
            'fleet-destroyers': counts[2],
            'fleet-cruisers': counts[4],
            'fleet-battleships': counts[5],
            'fleet-intruders': counts[8],
            'fleet-dreadnoughts': counts[7],
            'fleet-carriers': counts[9],
            'fleet-colony': counts[6]
        };

        Object.entries(fields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = String(value || 0);
            }
        });
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

		// Update sector display: show decimal, keep the hex wire token aside
		const sectorDisplay = document.getElementById('sectorofattack');
		if (sectorDisplay) {
			sectorDisplay.dataset.token = targetSector;
			const decimal = parseInt(targetSector, 16);
			sectorDisplay.textContent = Number.isFinite(decimal) ? String(decimal) : targetSector;
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

				// Add options for each ship type (hex token in value, decimal in label)
				const sectorLabel = Number.isFinite(parseInt(sectorId, 16)) ? parseInt(sectorId, 16) : sectorId;
				shipCounts.forEach((count, idx) => {
					if (count > 0) {
						for (let k = 1; k <= count; k++) {
							const option = document.createElement('option');
							option.value = `${sectorId}:${idx + 1}:${k}`;
							option.text = `${shipNames[idx]} ${k} in sector ${sectorLabel}`;
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
		updateFleetDisplay,
		updateOwnedSector,
		showMultiMoveOptions,
		switchTab,
		toggleFullScreen
	};
})();

// Export to window for connect.js and game.js access
window.GameUI = GameUI;
