// rewrite/controlpad.js - Complete implementation

const ControlPad = (function() {
    const TABS = {
        BUILD: 'build',
        FLEET: 'fleet',
        TECH: 'techtree',
        COLONIZE: 'colonize'
    };
    
    let currentTab = null;
    
    function initialize() {
        // Set up tabs
        document.getElementById('buildtab')?.addEventListener('click', () => switchTab(TABS.BUILD));
        document.getElementById('fleettab')?.addEventListener('click', () => switchTab(TABS.FLEET));
        document.getElementById('techtab')?.addEventListener('click', () => switchTab(TABS.TECH));
        document.getElementById('colonizetab')?.addEventListener('click', () => switchTab(TABS.COLONIZE));
        
        // Set up building buttons
        for (let i = 1; i <= 6; i++) {
            document.getElementById(`bb${i}`)?.addEventListener('click', () => buyBuilding(i));
        }
        
        // Set up ship buttons
        setupShipButtons();
        
        // Set up tech buttons
        for (let i = 1; i <= 9; i++) {
            document.getElementById(`t${i}`)?.addEventListener('click', () => buyTech(i));
        }
        
        // Set up fleet movement UI
        setupFleetUI();
        
        // Default to build tab
        switchTab(TABS.BUILD);
    }
    
    function setupShipButtons() {
        for (let i = 1; i <= 9; i++) {
            const shipBtn = document.querySelector(`button[onclick="buyShip(${i});"]`);
            if (shipBtn) {
                shipBtn.removeAttribute('onclick');
                shipBtn.addEventListener('click', () => buyShip(i));
            }
        }
    }
    
    function setupFleetUI() {
        // Move ships between lists
        document.getElementById('moveToShipsTo')?.addEventListener('click', () => moveShips('shipsFrom', 'shipsTo'));
        document.getElementById('moveToShipsFrom')?.addEventListener('click', () => moveShips('shipsTo', 'shipsFrom'));
        
        // Send fleet button
        document.getElementById('sendFleetBtn')?.addEventListener('click', popupSelectDestination);
        
        // Colonize button
        document.getElementById('colonizeBtn')?.addEventListener('click', () => websocket.send('//colonize'));
    }
    
    function switchTab(tabName) {
        if (currentTab === tabName) return;
        
        // Hide all tabs
        document.getElementById(TABS.BUILD)?.classList.add('hidden');
        document.getElementById(TABS.FLEET)?.classList.add('hidden');
        document.getElementById(TABS.TECH)?.classList.add('hidden');
        document.getElementById(TABS.COLONIZE)?.classList.add('hidden');
        
        // Show selected tab
        document.getElementById(tabName)?.classList.remove('hidden');
        
        // Update active tab button
        document.getElementById('buildtab')?.classList.remove('active');
        document.getElementById('fleettab')?.classList.remove('active');
        document.getElementById('techtab')?.classList.remove('active');
        document.getElementById('colonizetab')?.classList.remove('active');
        
        document.getElementById(tabName + 'tab')?.classList.add('active');
        
        currentTab = tabName;
    }
    
    function moveShips(fromId, toId) {
        const fromSelect = document.getElementById(fromId);
        const toSelect = document.getElementById(toId);
        
        if (!fromSelect || !toSelect) return;
        
        const selectedOptions = Array.from(fromSelect.selectedOptions);
        
        selectedOptions.forEach(option => {
            const newOption = document.createElement('option');
            newOption.value = option.value;
            newOption.text = option.text;
            toSelect.add(newOption);
        });
        
        // Remove selected options from source
        for (let i = fromSelect.options.length - 1; i >= 0; i--) {
            if (fromSelect.options[i].selected) {
                fromSelect.remove(i);
            }
        }
    }
    
    return {
        initialize,
        switchTab
    };
})();

window.ControlPad = ControlPad;