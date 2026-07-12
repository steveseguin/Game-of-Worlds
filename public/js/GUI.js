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

        const title = document.getElementById('sectorPanelTitle');
        if (title) title.textContent = `Sector ${sectorData.id}`;
        setIntelState('Live intel', 'live', 'Inside your current one-tile sensor range. Details are live.');
        updateLocalOrderContext(sectorData.id);

        // Update basic sector info
        document.getElementById('sectorid').textContent = `Sector ${sectorData.id || 'N/A'}`;
        document.getElementById('planetowner').textContent = ownerLabel(sectorData.owner);

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
            const empireTerraform = Number(window.TechSystem?.aggregateEffects?.(window.GAME_STATE?.player?.techLevels || {})?.terraform || 0);
            document.getElementById('terraformlvl').textContent = `${sectorData.terraformLevel || 0} required / ${empireTerraform} available`;
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
            const hasAuthoritativeLimit = sectorData.buildingSlotLimit !== null
                && sectorData.buildingSlotLimit !== undefined
                && Number.isFinite(Number(sectorData.buildingSlotLimit));
            const maxSlots = hasAuthoritativeLimit
                ? Number(sectorData.buildingSlotLimit)
                : (slotsByType[sectorData.type] || 0);
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
        renderBuildingInventory(sectorData.buildings);
        renderFleetSummary(sectorData.ships);
    }

    function ownerLabel(owner) {
        if (owner === null || owner === undefined || Number(owner) === 0) return 'Unclaimed';
        return window.GAME_STATE?.players?.[Number(owner)]?.name || `Player ${owner}`;
    }

    function renderBuildingInventory(buildings, fallback = 'No buildings detected') {
        const box = document.getElementById('sectorBuildings');
        if (!box) return;
        if (!Array.isArray(buildings)) {
            box.textContent = `Buildings: ${fallback}`;
            return;
        }
        const names = ['Metal Extractor', 'Crystal Refinery', 'Research Academy', 'Spaceport', 'Orbital Turret', 'Warp Gate'];
        const counts = new Map();
        let spaceportLevel = 0;
        buildings.forEach(item => {
            const type = Number(item?.type);
            if (type === 3) spaceportLevel = Math.max(spaceportLevel, Number(item?.level) || 1);
            counts.set(type, (counts.get(type) || 0) + (Number(item?.count) || 1));
        });
        if (spaceportLevel) names[3] = `Spaceport ${spaceportLevel}`;
        const labels = [...counts.entries()].map(([type, count]) => `${names[type] || `Building ${type}`} ×${count}`);
        box.textContent = `Buildings: ${labels.length ? labels.join(', ') : fallback}`;
    }

    function renderFleetSummary(ships, fallback = 'No ships detected') {
        const box = document.getElementById('sectorFleetSummary');
        if (!box) return;
        if (!Array.isArray(ships)) {
            box.textContent = `Fleet: ${fallback}`;
            return;
        }
        const total = ships.reduce((sum, ship) => sum + (Number(ship?.count) || 0), 0);
        box.textContent = `Fleet: ${total ? `${total} ship${total === 1 ? '' : 's'} detected` : fallback}`;
    }

    function updateSectorContact(contact) {
        showSectorSelection(contact.id, { live: true, seen: true, type: contact.type });
        const owner = document.getElementById('planetowner');
        if (owner) owner.textContent = ownerLabel(contact.owner);
        setIntelState('Sensor contact', 'sensor', 'Passive sensors identify terrain, control, and presence. Probe or enter the sector for economic, terraform, building, and fleet-composition detail.');
        renderBuildingInventory(null, 'Outside sensor resolution');
        renderFleetSummary(null, contact.fleetPresent ? `${contact.fleetSize} ship${contact.fleetSize === 1 ? '' : 's'} detected; composition unknown` : 'No ships detected');
    }

    function updateRememberedSectorDisplay(sectorData) {
        updateSectorDisplay(sectorData);
        const memory = sectorData.intelMemory || {};
        const age = memory.lastSeenTurn ? ` Last scanned on turn ${memory.lastSeenTurn}.` : '';
        setIntelState('Probe memory', 'memory', `These are stored scan results, not live readings.${age} Probe again to refresh ownership, fleets, and construction.`);
        renderBuildingInventory(sectorData.buildings, 'None recorded in scan');
        renderFleetSummary(sectorData.ships, 'None recorded in scan');
        updateFleetDisplay(sectorData.ships);
    }

    function markProbeScan(turn, scannedAt) {
        const when = turn ? ` on turn ${turn}` : '';
        setIntelState('Probe scan', 'live', `Probe scan completed${when}. These readings are current at scan time and will be retained as dated memory.`);
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

		const hasOptions = Boolean(shipList && shipList.options.length);
		const empty = document.getElementById('multiMoveEmpty');
		if (empty) {
			empty.hidden = hasOptions;
			empty.textContent = hasOptions ? '' : 'No eligible ships are in an adjacent sector. Move a fleet closer, then try again.';
		}
		['moveAttackShips', 'moveAllShips', 'moveSelectedShips'].forEach(id => {
			const button = document.getElementById(id);
			if (button) button.disabled = !hasOptions;
		});

		// Show dialog
		multiMoveDiv.style.display = 'block';
	}

	function summarizeMoveOptions(options) {
		const selected = Array.from(options || []);
		if (!selected.length) return {
			text: 'Select ships to review their plotted routes.',
			detail: 'Unmapped sectors remain unknown until a probe or fleet encounters them.',
			danger: false
		};
		const sources = new Map();
		const crystalCost = Math.max(1, Math.ceil(selected.reduce((sum, option) => sum + (Number(option.dataset.moveCost) || 0), 0)));
		selected.forEach(option => {
			const source = Number(option.dataset.source);
			if (!sources.has(source)) {
				sources.set(source, {
					distance: Number(option.dataset.distance) || 1,
					unknown: Number(option.dataset.unknown) || 0,
					asteroids: JSON.parse(option.dataset.asteroids || '[]'),
					blackHoles: JSON.parse(option.dataset.blackHoles || '[]')
					,viaWarp: option.dataset.viaWarp === '1'
				});
			}
		});
		const unknown = Math.max(...Array.from(sources.values()).map(source => source.unknown), 0);
		const distance = Math.max(...Array.from(sources.values()).map(source => source.distance), 1);
		const asteroids = [...new Set(Array.from(sources.values()).flatMap(source => source.asteroids))];
		const blackHoles = [...new Set(Array.from(sources.values()).flatMap(source => source.blackHoles))];
		const warpRoutes = Array.from(sources.values()).filter(source => source.viaWarp).length;
		let detail = `${selected.length} ship${selected.length === 1 ? '' : 's'} · ${sources.size} origin${sources.size === 1 ? '' : 's'} · up to ${distance} sector${distance === 1 ? '' : 's'} travelled · ${crystalCost} crystal.`;
		if (warpRoutes) detail += ` ${warpRoutes} route${warpRoutes === 1 ? '' : 's'} will use paired Warp Gates and bypass normal space.`;
		if (blackHoles.length) detail += ` KNOWN BLACK HOLE: sector ${blackHoles.join(', ')} guarantees destruction.`;
		if (asteroids.length) detail += ` Known asteroid risk: sector ${asteroids.join(', ')}; every ship rolls its own survival chance.`;
		if (unknown) detail += ` ${unknown} unmapped route sector${unknown === 1 ? '' : 's'} may conceal hazards.`;
		return {
			text: blackHoles.length ? 'Certain loss appears on at least one selected route.' : (asteroids.length ? 'Known collision risk appears on the plotted route.' : (unknown ? 'The plotted route contains unmapped space.' : 'No known unsecured hazard lies on the plotted route.')),
			detail,
			danger: blackHoles.length > 0,
			risk: asteroids.length > 0 || unknown > 0
		};
	}

	function renderMovePreflight(options) {
		const summary = summarizeMoveOptions(options);
		const summaryEl = document.getElementById('movePreflightSummary');
		const detailEl = document.getElementById('movePreflightDetail');
		if (summaryEl) {
			summaryEl.textContent = summary.text;
			summaryEl.className = summary.danger ? 'route-danger' : (summary.risk ? 'route-risk' : '');
		}
		if (detailEl) detailEl.textContent = summary.detail;
		return summary;
	}

	function showFleetMovePlan(plan) {
		const target = Number(plan?.target);
		const targetToken = Number.isSafeInteger(target) ? target.toString(16) : '';
		const sources = Array.isArray(plan?.sources) ? plan.sources : [];
		const flat = [];
		sources.forEach(source => {
			flat.push(Number(source.sector).toString(16), ...(source.counts || []).map(count => String(count || 0)));
		});
		showMultiMoveOptions(targetToken, flat.join(':'));
		const select = document.getElementById('shipsFromNearBy');
		if (!select) return;
		const bySource = new Map(sources.map(source => [Number(source.sector), source]));
		Array.from(select.options).forEach(option => {
			const sourceId = parseInt(option.value.split(':')[0], 16);
			const source = bySource.get(sourceId) || {};
			option.dataset.source = String(sourceId);
			option.dataset.distance = String(source.distance || 1);
			option.dataset.unknown = String(source.known?.unknown || 0);
			option.dataset.asteroids = JSON.stringify(source.known?.asteroids || []);
			option.dataset.blackHoles = JSON.stringify(source.known?.blackHoles || []);
			option.dataset.viaWarp = source.viaWarp ? '1' : '0';
			const shipType = Number(option.value.split(':')[1]);
			option.dataset.moveCost = String(source.unitCosts?.[shipType - 1] || 1);
		});
		select.onchange = () => renderMovePreflight(Array.from(select.selectedOptions));
		renderMovePreflight([]);
		const empty = document.getElementById('multiMoveEmpty');
		if (empty && !select.options.length) empty.textContent = 'No ships are available outside the destination sector.';
	}

	function describeFleetOrder(mode = 'selected') {
		const select = document.getElementById('shipsFromNearBy');
		if (!select) return summarizeMoveOptions([]);
		let options = Array.from(select.selectedOptions);
		if (mode === 'all') options = Array.from(select.options);
		if (mode === 'attack') options = Array.from(select.options).filter(option => {
			const type = Number(option.value.split(':')[1]);
			return type !== 3 && type !== 6;
		});
		return renderMovePreflight(options);
	}

	function setIntelState(label, className, summary) {
		const badge = document.getElementById('sectorIntelState');
		if (badge) {
			badge.textContent = label;
			badge.className = `sector-intel-state ${className}`;
		}
		const summaryEl = document.getElementById('sectorIntelSummary');
		if (summaryEl) summaryEl.textContent = summary;
	}

	function updateLocalOrderContext(sectorId) {
		const label = sectorId ? `Sector ${sectorId}` : 'no sector selected';
		const build = document.getElementById('buildSectorContext');
		if (build) build.textContent = `Construction destination: ${label}. Buildings, defenses, spaceports, and ships are local to this sector.`;
		const fleet = document.getElementById('fleetSectorContext');
		if (fleet) fleet.textContent = `Your fleet currently in ${label}`;
		const move = document.getElementById('sectorMoveShips');
		if (move) move.disabled = !sectorId;
	}

	function showSectorSelection(sectorId, knownState) {
		const title = document.getElementById('sectorPanelTitle');
		if (title) title.textContent = `Sector ${sectorId}`;
		updateLocalOrderContext(sectorId);
		const live = Boolean(knownState?.live);
		const remembered = Boolean(knownState?.seen && !live);
		setIntelState(
			live ? 'Sensor contact' : (remembered ? 'Old memory' : 'Unknown'),
			live ? 'sensor' : (remembered ? 'memory' : 'unknown'),
			live
				? 'Passive sensors reach one tile beyond your territory and fleets. Requesting current details...'
				: (remembered ? 'Terrain was seen before, but current ownership, fleets, and construction are unknown.' : 'Outside sensor range. Probe it safely, or risk moving an adjacent fleet into the unknown.')
		);
		const unknown = remembered ? 'Not currently visible' : 'Unknown';
		const values = {
			sectorid: `Sector ${sectorId}`,
			planetowner: unknown,
			planettype: knownState?.type === null || knownState?.type === undefined ? unknown : sectorTypeLabel(knownState.type),
			metalbonus: unknown,
			crystalbonus: unknown,
			terraformlvl: unknown,
			sectorslots: unknown
		};
		Object.entries(values).forEach(([id, value]) => {
			const el = document.getElementById(id);
			if (el) el.textContent = value;
		});
		for (let i = 1; i <= 9; i++) {
			const ship = document.getElementById(`f${i}`);
			if (ship) ship.textContent = unknown;
		}
		renderBuildingInventory(null, unknown);
		renderFleetSummary(null, unknown);
	}

	function sectorTypeLabel(type) {
		return ({ 0: 'Empty Space', 1: 'Asteroid Belt', 2: 'Black Hole', 3: 'Unstable Star', 4: 'Brown Dwarf', 5: 'Small Moon', 6: 'Micro Planet', 7: 'Small Planet', 8: 'Medium Planet', 9: 'Large Planet', 10: 'Homeworld' })[Number(type)] || 'Unknown';
	}

	function showMultiMoveLoading(targetSector) {
		showMultiMoveOptions(targetSector, '');
		const empty = document.getElementById('multiMoveEmpty');
		if (empty) {
			empty.hidden = false;
			empty.textContent = 'Checking adjacent sectors for eligible ships...';
		}
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
		showFleetMovePlan,
		describeFleetOrder,
		showMultiMoveLoading,
		showSectorSelection,
		updateSectorContact,
		updateRememberedSectorDisplay,
		markProbeScan,
		switchTab,
		toggleFullScreen
	};
})();

// Export to window for connect.js and game.js access
window.GameUI = GameUI;
