/**
 * lib/gui.js - Client-side UI component building utilities
 * 
 * Provides utility functions for building complex UI components
 * such as control panels, building interfaces, and tech trees.
 * Centralizes UI generation code for reuse across the application.
 * 
 * This module is client-side only and does not directly access the database.
 * It's a helper library for UI generation.
 * 
 * Dependencies:
 * - Used by game.js and other UI modules
 */
const GUI = {
    buildControlPanel: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Create tab buttons
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'tab-buttons';
        
        // Add build tab
        const buildTab = document.createElement('button');
        buildTab.id = 'buildtab';
        buildTab.className = 'tab-button active';
        buildTab.textContent = 'Upgrade Sector';
        tabsDiv.appendChild(buildTab);
        
        // Add fleet tab
        const fleetTab = document.createElement('button');
        fleetTab.id = 'fleettab';
        fleetTab.className = 'tab-button';
        fleetTab.textContent = 'Build Ships';
        tabsDiv.appendChild(fleetTab);
        
        // Add tech tab
        const techTab = document.createElement('button');
        techTab.id = 'techtab';
        techTab.className = 'tab-button';
        techTab.textContent = 'Research Technologies';
        tabsDiv.appendChild(techTab);
        
        // Add colonize tab
        const colonizeTab = document.createElement('button');
        colonizeTab.id = 'colonizetab';
        colonizeTab.className = 'tab-button';
        colonizeTab.textContent = 'Colonize Planet';
        tabsDiv.appendChild(colonizeTab);
        
        container.appendChild(tabsDiv);
        
        // Create panel containers
        this.createBuildPanel(container);
        this.createFleetPanel(container);
        this.createTechPanel(container);
        this.createColonizePanel(container);
    },
    
    createBuildPanel: function(container) {
        const panel = document.createElement('div');
        panel.id = 'build';
        panel.className = 'tab-panel';
        
        // Add building buttons
        const buildings = [
            { id: 1, name: 'Metal Extractor', cost: 100 },
            { id: 2, name: 'Crystal Refinery', cost: 100 },
            { id: 3, name: 'Research Academy', cost: 100 },
            { id: 4, name: 'Spaceport', cost: 100 },
            { id: 5, name: 'Orbital Turret', cost: 300 },
            { id: 6, name: 'Warp Gate', cost: 2000 }
        ];
        
        buildings.forEach(building => {
            const row = document.createElement('div');
            row.className = 'building-row';
            
            // Building info
            const info = document.createElement('div');
            info.className = 'building-info';
            info.innerHTML = `<b>${building.name}</b>: Level <span id="bbb${building.id}">0</span> → <span id="b${building.id}">1</span>`;
            
            // Cost display
            const cost = document.createElement('div');
            cost.className = 'building-cost';
            cost.innerHTML = `Cost: <span id="m${building.id}">${building.cost}</span> Metal`;
            
            // Build button
            const button = document.createElement('button');
            button.id = `bb${building.id}`;
            button.className = 'building-button';
            button.textContent = 'Build';
            button.onclick = function() { buyBuilding(building.id); };
            
            row.appendChild(info);
            row.appendChild(cost);
            row.appendChild(button);
            panel.appendChild(row);
        });
        
        container.appendChild(panel);
    },
    
    createFleetPanel: function(container) {
        const panel = document.createElement('div');
        panel.id = 'fleet';
        panel.className = 'tab-panel hidden';
        
        // Add ship building options
        const ships = [
            { id: 1, name: 'Frigate', cost: 300, attack: 1, defense: 1 },
            { id: 2, name: 'Destroyer', cost: 500, attack: 2, defense: 2 },
            { id: 3, name: 'Scout', cost: 200, attack: 0, defense: 1 },
            { id: 4, name: 'Cruiser', cost: 900, attack: 3, defense: 3 },
            { id: 5, name: 'Battleship', cost: 1600, attack: 6, defense: 5 },
            { id: 6, name: 'Colony Ship', cost: 1000, attack: 0, defense: 1 },
            { id: 7, name: 'Dreadnought', cost: 4400, attack: 16, defense: 16 },
            { id: 8, name: 'Intruder', cost: 1200, attack: 8, defense: 1 },
            { id: 9, name: 'Carrier', cost: 3000, attack: 4, defense: 8 }
        ];
        
        ships.forEach(ship => {
            const row = document.createElement('div');
            row.className = 'ship-row';
            
            // Ship info
            const info = document.createElement('div');
            info.className = 'ship-info';
            info.innerHTML = `<b>${ship.name}</b>: <span id="f${ship.id}">0</span> (Building: <span id="fa${ship.id}">0</span>)`;
            
            // Cancel button (hidden by default)
            const cancel = document.createElement('button');
            cancel.id = `fc${ship.id}`;
            cancel.className = 'ship-cancel';
            cancel.textContent = 'Cancel';
            cancel.style.display = 'none';
            
            // Buy button
            const button = document.createElement('button');
            button.className = 'ship-button';
            button.textContent = 'Build';
            button.onclick = function() { buyShip(ship.id); };
            
            // Cost display
            const cost = document.createElement('div');
            cost.className = 'ship-cost';
            cost.innerHTML = `Cost: ${ship.cost} Metal`;
            
            row.appendChild(info);
            row.appendChild(cancel);
            row.appendChild(cost);
            row.appendChild(button);
            panel.appendChild(row);
        });
        
        // Add fleet management section
        const fleetManagement = document.createElement('div');
        fleetManagement.className = 'fleet-management';
        fleetManagement.innerHTML = `
            <h3>Fleet Management</h3>
            <div class="fleet-selectors">
                <div>
                    <h4>Ships Available</h4>
                    <select id="shipsFrom" multiple size="6"></select>
                </div>
                <div class="fleet-move-buttons">
                    <button onclick="moveShips('shipsFrom', 'shipsTo')">→</button>
                    <button onclick="moveShips('shipsTo', 'shipsFrom')">←</button>
                </div>
                <div>
                    <h4>Ships to Move</h4>
                    <select id="shipsTo" multiple size="6"></select>
                </div>
            </div>
            <button id="sendFleetBtn">Send Fleet</button>
        `;
        
        panel.appendChild(fleetManagement);
        container.appendChild(panel);
    },
    
    createTechPanel: function(container) {
        const panel = document.createElement('div');
        panel.id = 'techtree';
        panel.className = 'tab-panel hidden';
        
        const techs = [
            { id: 1, name: 'Metal Production', cost: 'varies' },
            { id: 2, name: 'Crystal Production', cost: 'varies' },
            { id: 3, name: 'Research Efficiency', cost: 'varies' },
            { id: 4, name: 'Weapons', cost: 'varies' },
            { id: 5, name: 'Hull', cost: 'varies' },
            { id: 6, name: 'Shields', cost: 'varies' },
            { id: 7, name: 'Terraform', cost: 'varies' },
            { id: 8, name: 'Sensor', cost: 'varies' },
            { id: 9, name: 'Wave Dampening', cost: 'varies' }
        ];
        
        // Basic tech UI
        techs.forEach(tech => {
            const row = document.createElement('div');
            row.className = 'tech-row';
            
            // Tech info
            const info = document.createElement('div');
            info.className = 'tech-info';
            info.innerHTML = `<b>${tech.name}</b>: Level <span id="ttt${tech.id}">0</span> → <span id="tt${tech.id}">1</span>`;
            
            // Cost display
            const cost = document.createElement('div');
            cost.className = 'tech-cost';
            cost.innerHTML = `Cost: <span id="tc${tech.id}">0</span> Research`;
            
            // Research button
            const button = document.createElement('button');
            button.id = `t${tech.id}`;
            button.className = 'tech-button';
            button.textContent = 'Research';
            button.onclick = function() { buyTech(tech.id); };
            
            row.appendChild(info);
            row.appendChild(cost);
            row.appendChild(button);
            panel.appendChild(row);
        });
        
        container.appendChild(panel);
    },
    
    createColonizePanel: function(container) {
        const panel = document.createElement('div');
        panel.id = 'colonizediv';
        panel.className = 'tab-panel hidden';
        
        panel.innerHTML = `
            <button id="colonizeBtn" class="colonize-button">Attempt to Colonize Sector</button>
            <div class="colonize-info">
                <h3>To colonize a sector, the following must be met:</h3>
                <ul>
                    <li>You need a Colony Ship in the sector</li>
                    <li>You need a terraform tech level equal or greater to the sector's terraform requirement</li>
                    <li>The sector must contain a planet</li>
                </ul>
            </div>
        `;
        
        container.appendChild(panel);
    }
};