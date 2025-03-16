// Galaxy Map implementation using SVG for better rendering
window.GalaxyMap = (function() {
    // Sector status constants
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

    // Status colors
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

    // Stroke colors
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

    // Internal state
    let state = {
        width: 14,
        height: 8,
        sectors: {},
        selectedSector: null,
        containerElement: null
    };

    // Initialize the map
    function initialize(width, height, containerId) {
        state.width = width || 14;
        state.height = height || 8;
        state.containerElement = document.getElementById(containerId);
        
        if (!state.containerElement) {
            console.error(`Container element ${containerId} not found`);
            return;
        }
        
        // Clear existing content
        state.containerElement.innerHTML = '';
        
        // Calculate optimal hex size
        const containerWidth = state.containerElement.clientWidth;
        const containerHeight = state.containerElement.clientHeight;
        
        // Horizontal and vertical spacing for hexagons
        const hexWidth = containerWidth / (state.width + 0.5);
        const hexHeight = (containerHeight - 10) / (state.height * 0.75 + 0.25);
        
        // Use the smaller dimension to ensure proper fit
        const hexSize = Math.min(hexWidth / 2, hexHeight / 2);
        
        // Create sectors
        let id = 1;
        for (let y = 0; y < state.height; y++) {
            for (let x = 0; x < state.width; x++) {
                createHexagon(id, x, y, hexSize);
                id++;
            }
        }
        
        // Handle window resize
        window.addEventListener('resize', function() {
            if (state.resizeTimer) {
                clearTimeout(state.resizeTimer);
            }
            state.resizeTimer = setTimeout(function() {
                resize();
            }, 250);
        });
        
        return true;
    }
	
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
			
			const hexColor = Math.round(currentValue).toString(16).padStart(2, '0');
			element.setAttribute("fill", `#${hexColor}${hexColor}${hexColor}`);
		}, 50);
	}
    
    // Create a hexagon
    function createHexagon(id, gridX, gridY, hexSize) {
        const svgNS = "http://www.w3.org/2000/svg";
        
        // Calculate center position
        let centerX, centerY;
        
        // Offset every other row
        if (gridY % 2 === 0) {
            centerX = (gridX * 2 + 1) * hexSize;
        } else {
            centerX = (gridX * 2 + 2) * hexSize;
        }
        
        centerY = (gridY * 1.5 + 1) * hexSize;
        
        // Create SVG element
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("id", `tileholder${id}`);
        svg.setAttribute("viewBox", "0 0 110 100");
        svg.setAttribute("width", `${hexSize * 2}px`);
        svg.setAttribute("height", `${Math.sqrt(3) * hexSize}px`);
        svg.style.position = "absolute";
        svg.style.left = `${centerX - hexSize}px`;
        svg.style.top = `${centerY - hexSize}px`;
        
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
        
        // Store in state
        state.sectors[id] = {
            id,
            element: svg,
            path: hexPath,
            text: text,
            fleetText: fleetText,
            colonizedText: colonizedText,
            status: SECTOR_STATUS.UNKNOWN,
            x: centerX - hexSize,
            y: centerY - hexSize
        };
        
        // Add to container
        state.containerElement.appendChild(svg);
    }
    
    // Select a sector
    function selectSector(sectorId) {
        state.selectedSector = sectorId;
        changeSector(sectorId.toString(16).toUpperCase());
    }
    
    // Update sector status
    function updateSectorStatus(sectorId, status, details = {}) {
        const sector = state.sectors[sectorId];
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
    
    // Resize handler
    function resize() {
        if (!state.containerElement) return;
        
        // Calculate new hex size
        const containerWidth = state.containerElement.clientWidth;
        const containerHeight = state.containerElement.clientHeight;
        
        const hexWidth = containerWidth / (state.width + 0.5);
        const hexHeight = (containerHeight - 10) / (state.height * 0.75 + 0.25);
        
        const hexSize = Math.min(hexWidth / 2, hexHeight / 2);
        
        // Update size and position of all hexagons
        let id = 1;
        for (let y = 0; y < state.height; y++) {
            for (let x = 0; x < state.width; x++) {
                let centerX, centerY;
                
                // Offset every other row
                if (y % 2 === 0) {
                    centerX = (x * 2 + 1) * hexSize;
                } else {
                    centerX = (x * 2 + 2) * hexSize;
                }
                
                centerY = (y * 1.5 + 1) * hexSize;
                
                const sector = state.sectors[id];
                if (sector && sector.element) {
                    sector.element.setAttribute("width", `${hexSize * 2}px`);
                    sector.element.setAttribute("height", `${Math.sqrt(3) * hexSize}px`);
                    sector.element.style.left = `${centerX - hexSize}px`;
                    sector.element.style.top = `${centerY - hexSize}px`;
                }
                
                id++;
            }
        }
    }
    
    // Return public API
    return {
        initialize,
        selectSector,
        updateSectorStatus,
        SECTOR_STATUS
    };
})();

// Initialize map when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if minimap container exists
    const minimapContainer = document.getElementById('minimapid');
    if (minimapContainer) {
        window.GalaxyMap.initialize(14, 8, 'minimapid');
    }
});