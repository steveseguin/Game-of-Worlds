
const MiniMap = (function() {
    let hexElements = {};
    let width = 14;
    let height = 8;
    
    function initialize(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return false;
        
        container.innerHTML = '';
        
        let id = 1;
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
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
        
        // Position with even/odd row offset
        const yPos = y * 42 + (x % 2 === 0 ? 21 : 0);
        const xPos = x * 35 + 2;
        
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
        hex.setAttribute("stroke", "#666666");
        hex.setAttribute("stroke-width", "2");
        
        // Text for sector ID
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("id", "textid" + id);
        text.setAttribute("x", "20");
        text.setAttribute("y", "20");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.setAttribute("fill", "#000000");
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
            this.setAttribute("fill", "#BBBBBB");
        });
        
        hex.addEventListener('mouseout', function() {
            this.setAttribute("fill", "#DDDDDD");
        });
        
        hex.addEventListener('click', function() {
            changeSector(id);
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
    
    function updateSector(id, status, fleetSize, indicator) {
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
        
        elem.hex.setAttribute("fill", fillColor);
        elem.hex.setAttribute("stroke", strokeColor);
        
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