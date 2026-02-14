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
    let hasVisibilityData = false;

    function normalizeHexColor(color, fallback = '#DDDDDD') {
        if (typeof color !== 'string') return fallback;
        const trimmed = color.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
        if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
        return fallback;
    }

    function shiftColor(color, delta) {
        const normalized = normalizeHexColor(color);
        const r = Math.max(0, Math.min(255, parseInt(normalized.slice(1, 3), 16) + delta));
        const g = Math.max(0, Math.min(255, parseInt(normalized.slice(3, 5), 16) + delta));
        const b = Math.max(0, Math.min(255, parseInt(normalized.slice(5, 7), 16) + delta));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    function textColorForFill(color) {
        const normalized = normalizeHexColor(color, '#888888');
        const r = parseInt(normalized.slice(1, 3), 16);
        const g = parseInt(normalized.slice(3, 5), 16);
        const b = parseInt(normalized.slice(5, 7), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 150 ? '#0f172a' : '#f8fbff';
    }

    function isExploredStatus(status) {
        return status !== 'neutral' && status !== 'unknown' && status !== undefined && status !== null;
    }

    function notifyUnexploredSector(id) {
        const label = Number(id).toString(16).toUpperCase();
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify(
                'Unexplored Sector',
                `Sector ${label} must be explored before viewing details.`,
                'info',
                2200
            );
        }
    }
    
    function initialize(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return false;
        
        container.innerHTML = '';
        
        let id = 0;
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
        hex.setAttribute("fill", "#DDDDDD");
        hex.setAttribute("data-original-fill", "#DDDDDD");
        hex.setAttribute("stroke", "#666666");
        hex.setAttribute("stroke-width", "2");
        
        // Text for sector ID
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("id", "textid" + id);
        text.setAttribute("x", "20");
        text.setAttribute("y", "20");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.setAttribute("fill", "#0f172a");
        text.textContent = id.toString(16).toUpperCase();
        
        // Fleet size indicator (hidden by default)
        const fleetText = document.createElementNS(svgNS, "text");
        fleetText.setAttribute("id", "txtfleetid" + id);
        fleetText.setAttribute("x", "20");
        fleetText.setAttribute("y", "30");
        fleetText.setAttribute("text-anchor", "middle");
        fleetText.setAttribute("font-size", "10");
        fleetText.setAttribute("fill", "#FFFFFF");
        fleetText.style.display = "none";
        
        // Colonized indicator (hidden by default)
        const colonizedText = document.createElementNS(svgNS, "text");
        colonizedText.setAttribute("id", "colonizedtxt" + id);
        colonizedText.setAttribute("x", "20");
        colonizedText.setAttribute("y", "40");
        colonizedText.setAttribute("text-anchor", "middle");
        colonizedText.setAttribute("font-size", "10");
        colonizedText.setAttribute("fill", "#FFFFFF");
        colonizedText.style.display = "none";
        
        // Add event listeners
        hex.addEventListener('mouseover', function() {
            const originalFill = this.getAttribute('data-original-fill') || '#DDDDDD';
            this.setAttribute("fill", shiftColor(originalFill, 18));
        });
        
        hex.addEventListener('mouseout', function() {
            // Restore original color based on current state
            const originalFill = this.getAttribute('data-original-fill') || "#DDDDDD";
            this.setAttribute("fill", originalFill);
        });
        
        hex.addEventListener('click', function() {
            const currentState = hexElements[id];
            if (hasVisibilityData && currentState && !currentState.explored) {
                notifyUnexploredSector(id);
                return;
            }

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
            colonizedText,
            status: 'unknown',
            explored: false
        };
    }
    
    function updateSector(id, status, fleetSize, indicator) {
        const elem = hexElements[id];
        if (!elem) return;
        hasVisibilityData = true;
        
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

        elem.status = status || 'unknown';
        elem.explored = isExploredStatus(elem.status);
        
        elem.hex.setAttribute("fill", fillColor);
        elem.hex.setAttribute("stroke", strokeColor);
        elem.hex.setAttribute("data-original-fill", fillColor);
        elem.text.setAttribute("fill", textColorForFill(fillColor));
        
        // Update fleet size
        if (fleetSize && fleetSize > 0) {
            elem.fleetText.textContent = "S:" + fleetSize;
            elem.fleetText.style.display = "block";
        } else {
            elem.fleetText.style.display = "none";
        }
        
        // Update indicator
        if (indicator) {
            elem.colonizedText.textContent = indicator;
            elem.colonizedText.style.display = "block";
        } else {
            elem.colonizedText.style.display = "none";
        }
    }
    
    return {
        initialize,
        updateSector
    };
})();

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    const minimapContainer = document.getElementById('minimapid');
    if (minimapContainer) {
        MiniMap.initialize('minimapid');
    }
});

// Export the module
if (typeof window !== 'undefined') {
    // For browser environment
    window.MiniMap = MiniMap;
} else {
    // For Node.js environment
    module.exports = MiniMap;
}
