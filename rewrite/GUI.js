
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
        // Tab switching
        document.getElementById('buildtab')?.addEventListener('click', () => switchTab('build'));
        document.getElementById('fleettab')?.addEventListener('click', () => switchTab('fleet'));
        document.getElementById('techtab')?.addEventListener('click', () => switchTab('techtree'));
        document.getElementById('colonizetab')?.addEventListener('click', () => switchTab('colonize'));
        
        // Chat history navigation
        document.getElementById('chatHistoryUp')?.addEventListener('click', showChatHistory);
        document.getElementById('chatHistoryDown')?.addEventListener('click', () => {
            chatID = 1;
            showChatHistory();
        });
    }
    
    // Switch tabs
    function switchTab(tabName) {
        state.selectedTab = tabName;
        
        // Hide all panels
        const panels = ['build', 'fleet', 'techtree', 'colonize'];
        panels.forEach(panel => {
            const element = document.getElementById(panel);
            if (element) element.classList.add('hidden');
        });
        
        // Show selected panel
        const selectedPanel = document.getElementById(tabName);
        if (selectedPanel) selectedPanel.classList.remove('hidden');
        
        // Update tab buttons
        panels.forEach(panel => {
            const button = document.getElementById(`${panel}tab`);
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
        document.getElementById('planetowner').textContent = `Owner: ${sectorData.owner || 'N/A'}`;
        
        // Set sector type
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
            metalBonus.innerHTML = `Metal Production: <font color="${metalColor}">${sectorData.metalBonus}%</font>`;
            
            // Set crystal bonus
            const crystalBonus = document.getElementById('crystalbonus');
            let crystalColor = 'yellow';
            if (sectorData.crystalBonus < 100) {
                crystalColor = 'red';
            } else if (sectorData.crystalBonus >= 200) {
                crystalColor = 'green';
            }
            crystalBonus.innerHTML = `Crystal Production: <font color="${crystalColor}">${sectorData.crystalBonus}%</font>`;
            
            // Set terraform requirement
            document.getElementById('terraformlvl').textContent = `Terraform Req: ${sectorData.terraformLevel || 0}`;
        } else {
            // Non-colonizable sector
            document.getElementById('metalbonus').textContent = 'Metal Production: N/A';
            document.getElementById('crystalbonus').textContent = 'Crystal Production: N/A';
            document.getElementById('terraformlvl').textContent = 'Cannot be colonized';
        }
        
        // Update sector image
        const sectorImg = document.getElementById('sectorimg');
        if (sectorImg) {
            sectorImg.style.backgroundImage = `url(type${sectorData.type}.gif)`;
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
    
    // Return public API
    return {
        initialize,
        updateResources,
        updateSectorDisplay,
        updateBuildings,
        updateFleet,
        switchTab,
        toggleFullScreen
    };
})();

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', GameUI.initialize);