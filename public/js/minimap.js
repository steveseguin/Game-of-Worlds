/**
 * minimap.js - Client-side minimap implementation
 * 
 * Handles the rendering and interaction with the minimap UI element.
 * Manages sector display, highlighting, and selection events.
 * 
 * This module is client-side only and does not directly access the database.
 * It communicates sector selections to the server via the main code.
 * 
 * Dependencies:
 * - Used by game.js for minimap functionality
 */
const MiniMap = (function() {
    let hexElements = {};
    let width = 14;
    let height = 8;
    
    function initialize(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return false;
        
        container.innerHTML = '';
        
        let id = 1;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                createHexTile(container, id, x, y);
                id++;
            }
        }
        
        return true;
    }
    
    function createHexTile(container, id, x, y) {
        const tile = document.createElement('div');
        tile.id = 'tileholder' + id;
        tile.className = 'hex-tile';
        
        // Position with even/odd row offset for proper hexagon layout
        const hexWidth = 35;
        const hexHeight = 40;
        const yPos = y * hexHeight + (x % 2 === 0 ? hexHeight/2 : 0);
        const xPos = x * hexWidth + 2;
        
        tile.style.position = 'absolute';
        tile.style.left = xPos + 'px';
        tile.style.top = yPos + 'px';
        
        // Create SVG for hexagon
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "40");
        svg.setAttribute("height", "46");
        svg.setAttribute("viewBox", "0 0 40 46");
        
        const hex = document.createElementNS(svgNS, "polygon");
        hex.setAttribute("id", "tile" + id);
        hex.setAttribute("points", "10,0 30,0 40,23 30,46 10,46 0,23");
        hex.setAttribute("fill", "#101522");
        hex.setAttribute("stroke", "#263149");
        hex.setAttribute("stroke-width", "2");
        hex.setAttribute("stroke-dasharray", "2 4");
        hex.setAttribute("opacity", "0.42");
        hex.setAttribute("data-intel", "fog");
        hex.setAttribute("aria-label", "Unexplored sector " + id);
        
        // Text for sector ID
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("id", "textid" + id);
        text.setAttribute("x", "20");
        text.setAttribute("y", "20");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.setAttribute("fill", "#c7cede");
        text.setAttribute("opacity", "0");
        text.style.pointerEvents = "none";
        text.textContent = String(id);
        
        // Fleet size indicator (hidden by default)
        const fleetText = document.createElementNS(svgNS, "text");
        fleetText.setAttribute("id", "txtfleetid" + id);
        fleetText.setAttribute("x", "20");
        fleetText.setAttribute("y", "30");
        fleetText.setAttribute("text-anchor", "middle");
        fleetText.setAttribute("font-size", "10");
        fleetText.setAttribute("fill", "#FFFFFF");
        fleetText.style.pointerEvents = "none";
        fleetText.style.display = "none";
        
        // Colonized indicator (hidden by default)
        const colonizedText = document.createElementNS(svgNS, "text");
        colonizedText.setAttribute("id", "colonizedtxt" + id);
        colonizedText.setAttribute("x", "20");
        colonizedText.setAttribute("y", "40");
        colonizedText.setAttribute("text-anchor", "middle");
        colonizedText.setAttribute("font-size", "10");
        colonizedText.setAttribute("fill", "#FFFFFF");
        colonizedText.style.pointerEvents = "none";
        colonizedText.style.display = "none";
        
        // Add event listeners
        hex.addEventListener('mouseover', function() {
            this.setAttribute("fill-opacity", "0.86");
            this.style.filter = "brightness(1.16)";
        });

        hex.addEventListener('mouseout', function() {
            this.setAttribute("fill-opacity", "1");
            this.style.filter = "";
        });
        
        hex.addEventListener('click', function() {
            if (typeof changeSector === 'function') {
                changeSector(id);
            } else if (window.GameUI && typeof window.GameUI.changeSector === 'function') {
                window.GameUI.changeSector(id);
            }
        });
        
        svg.appendChild(hex);
        svg.appendChild(text);
        svg.appendChild(fleetText);
        svg.appendChild(colonizedText);
        
        tile.appendChild(svg);
        container.appendChild(tile);
        
        // Store reference
        hexElements[id] = {
            tile,
            hex,
            text,
            fleetText,
            colonizedText
        };
    }
    
    function updateSector(id, status, fleetSize, indicator, details = {}) {
        if (window.GalaxyMap?.updateSectorStatus) {
            const statusMap = {
                neutral: window.GalaxyMap.SECTOR_STATUS.UNKNOWN,
                owned: window.GalaxyMap.SECTOR_STATUS.OWNED,
                enemy: window.GalaxyMap.SECTOR_STATUS.ENEMY,
                hazard: window.GalaxyMap.SECTOR_STATUS.HAZARD,
                blackhole: window.GalaxyMap.SECTOR_STATUS.BLACKHOLE,
                colonized: window.GalaxyMap.SECTOR_STATUS.COLONIZED,
                homeworld: window.GalaxyMap.SECTOR_STATUS.HOMEWORLD,
                warpgate: window.GalaxyMap.SECTOR_STATUS.WARPGATE,
                artifact: window.GalaxyMap.SECTOR_STATUS.ARTIFACT
            };
            const numericStatus = statusMap[status] ?? window.GalaxyMap.SECTOR_STATUS.UNKNOWN;
            window.GalaxyMap.updateSectorStatus(id, numericStatus, { ...details, fleetSize, indicator });
        }

        const elem = hexElements[id];
        if (!elem) return;
        
        // Set color based on status
        let fillColor, strokeColor;
        
        switch (status) {
            case 'owned':
                fillColor = "#40C040";
                strokeColor = "#208020";
                break;
            case 'enemy':
                fillColor = "#C04040";
                strokeColor = "#802020";
                break;
            case 'hazard':
                fillColor = "#C08040";
                strokeColor = "#805020";
                break;
            case 'blackhole':
                fillColor = "#202020";
                strokeColor = "#000000";
                break;
            case 'colonized':
                fillColor = "#40C0A0";
                strokeColor = "#208060";
                break;
            case 'homeworld':
                fillColor = "#FFC040";
                strokeColor = "#C09020";
                break;
            case 'warpgate':
                fillColor = "#8040C0";
                strokeColor = "#602080";
                break;
            default:
                fillColor = "#DDDDDD";
                strokeColor = "#666666";
        }
        
        const known = status !== 'neutral' || details.live === false || details.live === true || details.type !== undefined;
        const live = details.live !== false;
        const appliedFill = known ? fillColor : "#101522";
        elem.hex.setAttribute("fill", appliedFill);
        elem.hex.setAttribute("stroke", known ? strokeColor : "#263149");
        elem.hex.setAttribute("opacity", known ? (live ? "1" : "0.50") : "0.42");
        elem.hex.setAttribute("stroke-dasharray", known ? (live ? "" : "4 3") : "2 4");
        elem.hex.setAttribute("data-intel", known ? (live ? "live" : "memory") : "fog");
        elem.hex.setAttribute("aria-label", (known ? (live ? "Live intel sector " : "Stale memory sector ") : "Unexplored sector ") + id);
        elem.hex.setAttribute("data-original-fill", appliedFill);
        elem.text.setAttribute("opacity", known ? (live ? "1" : "0.58") : "0");
        
        // Update fleet size
        if (known && fleetSize && fleetSize > 0) {
            elem.fleetText.textContent = "S:" + fleetSize;
            elem.fleetText.style.display = "block";
        } else {
            elem.fleetText.style.display = "none";
        }
        
        // Update indicator
        if (known && indicator) {
            elem.colonizedText.textContent = indicator;
            elem.colonizedText.style.display = "block";
        } else {
            elem.colonizedText.style.display = "none";
        }
    }
    
    return {
        initialize,
        updateSector,
        highlightSector: function(id) {
            if (window.GalaxyMap?.highlightSector) {
                window.GalaxyMap.highlightSector(id);
            }
        }
    };
})();

function fade(from, to, element) {
    if (!element) return;
    
    const fromColor = parseInt(from, 16);
    const toColor = parseInt(to, 16);
    const diff = (toColor - fromColor) / 10;
    
    let currentValue = fromColor;
    const fadeInterval = setInterval(() => {
        currentValue += diff;
        if ((diff > 0 && currentValue >= toColor) || 
            (diff < 0 && currentValue <= toColor)) {
            clearInterval(fadeInterval);
            currentValue = toColor;
        }
        
        const hexColor = Math.round(currentValue).toString(16).padStart(6, '0');
        element.setAttribute("fill", `#${hexColor}`);
    }, 50);
}

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    const minimapContainer = document.getElementById('minimapid');
    if (minimapContainer) {
        MiniMap.initialize('minimapid');
    }
});

// Export the module
if (typeof window !== 'undefined') {
    window.MiniMap = MiniMap;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MiniMap;
}
