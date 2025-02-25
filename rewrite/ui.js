// Minimap Rendering System for Galaxy Conquest
// This provides client-side rendering of the game map

/**
 * Sector status for coloring
 */
const SECTOR_STATUS = {
    UNKNOWN: 0,      // Gray - unexplored
    OWNED: 1,        // Green - controlled by player
    ENEMY: 2,        // Red - controlled by enemy
    HAZARD: 3,       // Brown/Orange - hazardous sector
    BLACKHOLE: 4,    // Black - black hole
    COLONIZED: 5,    // Blue-green - colonized owned sector
    HOMEWORLD: 6,    // Gold - homeworld
    WARPGATE: 7,     // Purple - contains warp gate
    ARTIFACT: 8      // Cyan - contains artifact
};

/**
 * Color definitions for sector status
 */
const STATUS_COLORS = {
    [SECTOR_STATUS.UNKNOWN]: "#888888",
    [SECTOR_STATUS.OWNED]: "#40C040",
    [SECTOR_STATUS.ENEMY]: "#C04040",
    [SECTOR_STATUS.HAZARD]: "#C08040",
    [SECTOR_STATUS.BLACKHOLE]: "#202020",
    [SECTOR_STATUS.COLONIZED]: "#40C0A0",
    [SECTOR_STATUS.HOMEWORLD]: "#FFC040",
    [SECTOR_STATUS.WARPGATE]: "#8040C0",
    [SECTOR_STATUS.ARTIFACT]: "#40C0FF"
};

/**
 * Sector stroke colors based on status
 */
const STROKE_COLORS = {
    [SECTOR_STATUS.UNKNOWN]: "#666666",
    [SECTOR_STATUS.OWNED]: "#208020",
    [SECTOR_STATUS.ENEMY]: "#802020",
    [SECTOR_STATUS.HAZARD]: "#805020",
    [SECTOR_STATUS.BLACKHOLE]: "#000000",
    [SECTOR_STATUS.COLONIZED]: "#208060",
    [SECTOR_STATUS.HOMEWORLD]: "#C09020",
    [SECTOR_STATUS.WARPGATE]: "#602080",
    [SECTOR_STATUS.ARTIFACT]: "#2080C0"
};

/**
 * Initialize minimap elements
 * @param {number} width - Map width in sectors
 * @param {number} height - Map height in sectors
 * @param {string} containerId - ID of container element
 */
function initializeMap(width, height, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container element ${containerId} not found`);
        return;
    }
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create SVG namespace elements
    const svgNS = "http://www.w3.org/2000/svg";
    
    // Track all hexagons
    window.galaxyMap = {
        width,
        height,
        sectors: {},
        selectedSector: null
    };
    
    // Calculate optimal hex size for the container
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Calculate horizontal and vertical spacing for hexagons
    const hexWidth = containerWidth / (width + 0.5);
    const hexHeight = (containerHeight - 10) / (height * 0.75 + 0.25);
    
    // Use the smaller dimension to ensure proper fit
    const hexSize = Math.min(hexWidth / 2, hexHeight / 2);
    
    // Create sectors
    let id = 1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Calculate center position of hexagon
            let centerX, centerY;
            
            // Offset every other row
            if (y % 2 === 0) {
                centerX = (x * 2 + 1) * hexSize;
            } else {
                centerX = (x * 2 + 2) * hexSize;
            }
            
            centerY = (y * 1.5 + 1) * hexSize;
            
            // Create hexagon
            createHexagon(id, centerX, centerY, hexSize, container, svgNS);
            id++;
        }
    }
}

/**
 * Create a hexagon for the map
 * @param {number} id - Sector ID
 * @param {number} centerX - X coordinate of hexagon center
 * @param {number} centerY - Y coordinate of hexagon center
 * @param {number} size - Size of hexagon
 * @param {HTMLElement} container - Container element
 * @param {string} svgNS - SVG namespace
 */
function createHexagon(id, centerX, centerY, size, container, svgNS) {
    // Create SVG element
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("id", `tileholder${id}`);
    svg.setAttribute("viewBox", "0 0 110 100");
    svg.setAttribute("width", `${size * 2}px`);
    svg.setAttribute("height", `${Math.sqrt(3) * size}px`);
    svg.style.position = "absolute";
    svg.style.left = `${centerX - size}px`;
    svg.style.top = `${centerY - size}px`;
    
    // Create hexagon path
    const hexPath = document.createElementNS(svgNS, "path");
    hexPath.setAttribute("id", `tile${id}`);
    hexPath.setAttribute("fill", STATUS_COLORS[SECTOR_STATUS.UNKNOWN]);
    hexPath.setAttribute("stroke", STROKE_COLORS[SECTOR_STATUS.UNKNOWN]);
    hexPath.setAttribute("stroke-width", "4");
    
    // Calculate hexagon points
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = 55 + 50 * Math.cos(angle);
        const y = 50 + 45 * Math.sin(angle);
        points.push(`${x},${y}`);
    }
    
    hexPath.setAttribute("d", `M ${points.join(" L ")} Z`);
    
    // Add event listeners
    hexPath.addEventListener("mouseover", function(evt) {
        window.tilefading = evt.target;
        evt.target.setAttribute("fill", "#bbbbbb");
    });
    
    hexPath.addEventListener("mouseout", function(evt) {
        window.tilefading = "";
        fade("bbbbbb", "dddddd", evt.target);
    });
    
    hexPath.addEventListener("mousedown", function(evt) {
        evt.target.setAttribute("fill", "#888888");
        selectSector(id);
    });
    
    // Add hexagon to SVG
    svg.appendChild(hexPath);
    
    // Add sector ID text
    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("id", `textid${id}`);
    text.setAttribute("x", "55");
    text.setAttribute("y", "43");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "13");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("fill", "#000000");
    text.textContent = id.toString(16).toUpperCase();
    
    // Add event listeners to text
    text.addEventListener("mouseover", function() {
        window.tilefading = document.getElementById(`tile${id}`);
        document.getElementById(`tile${id}`).setAttribute("fill", "#bbbbbb");
    });
    
    text.addEventListener("mouseout", function() {
        window.tilefading = "";
        fade("bbbbbb", "dddddd", document.getElementById(`tile${id}`));
    });
    
    text.addEventListener("mousedown", function(evt) {
        document.getElementById(`tile${id}`).setAttribute("fill", "#888888");
        selectSector(id);
        evt.preventDefault();
        return false;
    });
    
    svg.appendChild(text);
    
    // Add fleet size text (hidden by default)
    const fleetText = document.createElementNS(svgNS, "text");
    fleetText.setAttribute("id", `txtfleetid${id}`);
    fleetText.setAttribute("x", "55");
    fleetText.setAttribute("y", "60");
    fleetText.setAttribute("text-anchor", "middle");
    fleetText.setAttribute("font-size", "10");
    fleetText.setAttribute("font-weight", "bold");
    fleetText.setAttribute("fill", "#FFFFFF");
    fleetText.style.display = "none";
    svg.appendChild(fleetText);
    
    // Add colonized indicator text (hidden by default)
    const colonizedText = document.createElementNS(svgNS, "text");
    colonizedText.setAttribute("id", `colonizedtxt${id}`);
    colonizedText.setAttribute("x", "55");
    colonizedText.setAttribute("y", "75");
    colonizedText.setAttribute("text-anchor", "middle");
    colonizedText.setAttribute("font-size", "12");
    colonizedText.setAttribute("font-weight", "bold");
    colonizedText.setAttribute("fill", "#FFFFFF");
    colonizedText.style.display = "none";
    svg.appendChild(colonizedText);
    
    // Store in global map
    window.galaxyMap.sectors[id] = {
        id,
        element: svg,
        path: hexPath,
        text: text,
        fleetText: fleetText,
        colonizedText: colonizedText,
        status: SECTOR_STATUS.UNKNOWN
    };
    
    // Add to container
    container.appendChild(svg);
}

/**
 * Select a sector on the map
 * @param {number} sectorId - Sector ID
 * @param {boolean} longPress - Whether this is a long press (for fleet movement)
 */
function selectSector(sectorId, longPress = false) {
    // Store selected sector
    window.galaxyMap.selectedSector = sectorId;
    
    if (longPress) {
        // Show fleet movement dialog
        window.document.getElementById('sectorofattack').innerHTML = sectorId.toString(16).toUpperCase();
        window.document.getElementById('multiMove').style.display = 'block';
    } else {
        // Request sector info from server
        changeSector(sectorId.toString(16).toUpperCase());
    }
}

/**
 * Update sector status on the map
 * @param {number} sectorId - Sector ID
 * @param {number} status - New status (from SECTOR_STATUS)
 * @param {object} details - Additional details (fleet size, colonized indicator, etc.)
 */
function updateSectorStatus(sectorId, status, details = {}) {
    const sector = window.galaxyMap.sectors[sectorId];
    if (!sector) return;
    
    // Update status
    sector.status = status;
    
    // Update colors
    sector.path.setAttribute("fill", STATUS_COLORS[status]);
    sector.path.setAttribute("stroke", STROKE_COLORS[status]);
    
    // Update fleet size
    if (details.fleetSize !== undefined) {
        if (details.fleetSize > 0) {
            sector.fleetText.textContent = `S:${details.fleetSize}`;
            sector.fleetText.style.display = "block";
        } else {
            sector.fleetText.style.display = "none";
        }
    }
    
    // Update colonized indicator
    if (details.indicator !== undefined) {
        if (details.indicator) {
            sector.colonizedText.textContent = details.indicator;
            sector.colonizedText.style.display = "block";
        } else {
            sector.colonizedText.style.display = "none";
        }
    }
}

/**
 * Parse and apply updates from the server
 * @param {string} message - Server message
 */
function parseServerMapUpdate(message) {
    if (!message || typeof message !== 'string') return;
    
    // Own sector update
    if (message.startsWith('ownsector:')) {
        const parts = message.split(':');
        if (parts.length < 3) return;
        
        const sectorId = parseInt(parts[1], 16);
        const fleetSize = parseInt(parts[2]) || 0;
        const indicator = parts[3] || '';
        
        // Determine status based on indicator
        let status = SECTOR_STATUS.OWNED;
        
        if (indicator === 'A') {
            status = SECTOR_STATUS.HAZARD;
        } else if (indicator === 'BH') {
            status = SECTOR_STATUS.BLACKHOLE;
        } else if (indicator === 'C') {
            status = SECTOR_STATUS.COLONIZED;
        } else if (indicator === 'H') {
            status = SECTOR_STATUS.HOMEWORLD;
        } else if (indicator === 'W') {
            status = SECTOR_STATUS.WARPGATE;
        }
        
        updateSectorStatus(sectorId, status, { fleetSize, indicator });
    }
    // Enemy sector info
    else if (message.startsWith('info:')) {
        const parts = message.split(':');
        if (parts.length < 3) return;
        
        const sectorId = parseInt(parts[1], 16);
        const sectorType = parseInt(parts[2]);
        
        let status = SECTOR_STATUS.ENEMY;
        if (sectorType === 2) {
            status = SECTOR_STATUS.BLACKHOLE;
        } else if (sectorType === 1) {
            status = SECTOR_STATUS.HAZARD;
        }
        
        updateSectorStatus(sectorId, status);
    }
}

/**
 * Color fade animation for hexagons
 * @param {string} startcolor - Starting color (hex without #)
 * @param {string} endcolor - Ending color (hex without #)
 * @param {SVGElement} element - SVG element to animate
 */
function fade(startcolor, endcolor, element) {
    let fadetimer;
    let colorNumber = parseInt(startcolor, 16);
    const endNumber = parseInt(endcolor, 16);
    let hexString = '';
    
    element.setAttribute('fill', '#' + startcolor);
    
    function fadeagain() {
        if (window.tilefading !== element) {
            if (colorNumber > endNumber) {
                colorNumber = colorNumber - 131586;
                hexString = '#' + colorNumber.toString(16);
                element.setAttribute('fill', hexString);
                fadetimer = setTimeout(fadeagain, 20);
            } else if (colorNumber < endNumber) {
                colorNumber = colorNumber + 131586;
                hexString = '#' + colorNumber.toString(16);
                element.setAttribute('fill', hexString);
                fadetimer = setTimeout(fadeagain, 20);
            } else {
                element.setAttribute('fill', '#' + endcolor);
            }
        }
    }
    
    fadeagain();
}

/**
 * Set up long press detection for fleet movement
 */
function setupLongPressEvents() {
    let pressTimer;
    let pressedSectorId = null;
    
    // Add mousedown event to all hexagons
    Object.values(window.galaxyMap.sectors).forEach(sector => {
        sector.path.addEventListener('mousedown', function(evt) {
            pressedSectorId = sector.id;
            pressTimer = setTimeout(function() {
                selectSector(pressedSectorId, true);
            }, 500); // Long press threshold: 500ms
        });
        
        sector.path.addEventListener('mouseup', function() {
            clearTimeout(pressTimer);
        });
        
        sector.path.addEventListener('mouseout', function() {
            clearTimeout(pressTimer);
        });
    });
}

// Initialize minimap when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if minimap container exists
    const minimapContainer = document.getElementById('minimapid');
    if (minimapContainer) {
        // Default map size - adjust based on game settings
        initializeMap(14, 8, 'minimapid');
        setupLongPressEvents();
    }
});

// Export functions for use in main.js
window.GalaxyMap = {
    initializeMap,
    updateSectorStatus,
    parseServerMapUpdate,
    SECTOR_STATUS
};