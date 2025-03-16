const BuildSystem = (function() {
    function initialize() {
        // Set up building buttons
        setupBuildingButtons();
        
        // Set up ship building buttons
        setupShipButtons();
    }
    
    function setupBuildingButtons() {
        for (let i = 1; i <= 6; i++) {
            const buildBtn = document.getElementById(`bb${i}`);
            if (buildBtn) {
                buildBtn.addEventListener('click', function() {
                    buyBuilding(i);
                });
            }
        }
    }
    
    function setupShipButtons() {
        const shipButtons = document.querySelectorAll('.ship-button');
        shipButtons.forEach(button => {
            const shipId = button.getAttribute('data-ship-id');
            if (shipId) {
                button.addEventListener('click', function() {
                    buyShip(parseInt(shipId));
                });
            }
        });
    }
    
    function updateBuildingUI(sector) {
        if (!sector) return;
        
        // Update building levels display
        for (let i = 1; i <= 6; i++) {
            const levelDisplay = document.getElementById(`bbb${i}`);
            if (levelDisplay) {
                let level = 0;
                
                switch (i) {
                    case 1: level = sector.metallvl; break;
                    case 2: level = sector.crystallvl; break;
                    case 3: level = sector.academylvl; break;
                    case 4: level = sector.shipyardlvl; break;
                    case 5: level = sector.orbitalturret; break;
                    case 6: level = sector.warpgate; break;
                }
                
                levelDisplay.textContent = level || '0';
            }
        }
        
        // Disable max level buildings
        if (sector.sectortype > 5) {
            const maxLevels = {
                6: 4,  // Micro planet
                7: 6,  // Small planet
                8: 8,  // Medium planet
                9: 10, // Large planet
                10: 12 // Homeworld
            };
            
            const maxLevel = maxLevels[sector.sectortype] || 4;
            
            // Check resource buildings against max level
            for (let i = 1; i <= 3; i++) {
                const buildBtn = document.getElementById(`bb${i}`);
                let currentLevel = 0;
                
                switch (i) {
                    case 1: currentLevel = sector.metallvl; break;
                    case 2: currentLevel = sector.crystallvl; break;
                    case 3: currentLevel = sector.academylvl; break;
                }
                
                if (buildBtn && currentLevel >= maxLevel / 2) {
                    buildBtn.classList.add('disabled');
                    buildBtn.disabled = true;
                } else if (buildBtn) {
                    buildBtn.classList.remove('disabled');
                    buildBtn.disabled = false;
                }
            }
            
            // Disable warp gate button if already built
            const warpBtn = document.getElementById(`bb6`);
            if (warpBtn && sector.warpgate >= 1) {
                warpBtn.classList.add('disabled');
                warpBtn.disabled = true;
            } else if (warpBtn) {
                warpBtn.classList.remove('disabled');
                warpBtn.disabled = false;
            }
        }
    }
    
    function updateShipBuildingUI(sector, playerResources) {
        if (!sector) return;
        
        // Calculate available build slots
        const usedSlots = (sector.totship1build || 0) * 3 + 
                         (sector.totship2build || 0) * 5 + 
                         (sector.totship3build || 0) * 1 + 
                         (sector.totship4build || 0) * 8 + 
                         (sector.totship5build || 0) * 12 + 
                         (sector.totship6build || 0) * 7 +
                         (sector.totship7build || 0) * 20 +
                         (sector.totship8build || 0) * 5 +
                         (sector.totship9build || 0) * 15;
        
        const availableSlots = (sector.shipyardlvl || 0) - usedSlots;
        
        // Update ships in construction display
        for (let i = 1; i <= 9; i++) {
            const buildingCount = document.getElementById(`fa${i}`);
            if (buildingCount) {
                buildingCount.textContent = sector[`totship${i}build`] || '0';
            }
            
            // Show/hide cancel buttons
            const cancelButton = document.getElementById(`fc${i}`);
            if (cancelButton) {
                cancelButton.style.display = (parseInt(sector[`totship${i}build`]) || 0) > 0 ? 'inline-block' : 'none';
            }
            
            // Disable ship buttons if not enough slots or resources
            const shipButton = document.querySelector(`.ship-button[data-ship-id="${i}"]`);
            if (shipButton) {
                // Get required slots and cost
                let requiredSlots = 0;
                let metalCost = 0;
                
                switch (i) {
                    case 1: requiredSlots = 3; metalCost = 300; break; // Frigate
                    case 2: requiredSlots = 5; metalCost = 500; break; // Destroyer
                    case 3: requiredSlots = 1; metalCost = 200; break; // Scout
                    case 4: requiredSlots = 8; metalCost = 900; break; // Cruiser
                    case 5: requiredSlots = 12; metalCost = 1600; break; // Battleship
                    case 6: requiredSlots = 7; metalCost = 1000; break; // Colony Ship
                    case 7: requiredSlots = 20; metalCost = 4400; break; // Dreadnought
                    case 8: requiredSlots = 5; metalCost = 1200; break; // Intruder
                    case 9: requiredSlots = 15; metalCost = 3000; break; // Carrier
                }
                
                // Check for warp gate requirement for carriers
                if (i === 9 && (!sector.warpgate || sector.warpgate < 1)) {
                    shipButton.classList.add('disabled');
                    shipButton.disabled = true;
                }
                // Check if enough slots available
                else if (availableSlots < requiredSlots) {
                    shipButton.classList.add('disabled');
                    shipButton.disabled = true;
                }
                // Check if enough metal
                else if ((playerResources?.metal || 0) < metalCost) {
                    shipButton.classList.add('disabled');
                    shipButton.disabled = true;
                }
                else {
                    shipButton.classList.remove('disabled');
                    shipButton.disabled = false;
                }
            }
        }
    }
    
    return {
        initialize,
        updateBuildingUI,
        updateShipBuildingUI
    };
})();

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', BuildSystem.initialize);
window.BuildSystem = BuildSystem;