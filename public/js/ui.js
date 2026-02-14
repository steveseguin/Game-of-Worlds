/**
 * ui.js - Client-side map visualization system
 * 
 * Implements the interactive galaxy map using SVG for visualization.
 * Handles sector rendering, selection, and status updates.
 * This is the GalaxyMap module for the client-side UI.
 * 
 * This module is client-side only and does not directly access the database.
 * It communicates sector selections to the server via the main code.
 * 
 * Dependencies:
 * - Used by game.js for map rendering and interaction
 */
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
        initialized: false,
        width: 14,
        height: 8,
        sectors: {},
        selectedSector: null,
        containerElement: null,
        tooltip: null,
        lastHoverSound: 0
    };

    // Initialize the map
    function initialize(width, height, containerId) {
        // Prevent multiple initializations
        if (state.initialized) {
            console.log('GalaxyMap already initialized, skipping');
            return;
        }

        state.width = width || 14;
        state.height = height || 8;
        state.containerElement = document.getElementById(containerId);

        if (!state.containerElement) {
            console.error(`Container element ${containerId} not found`);
            return;
        }

        state.initialized = true;

        // Clear existing content
        state.containerElement.innerHTML = '';
        createTooltip();
        
        // Calculate optimal hex size to fill container
        const containerWidth = state.containerElement.clientWidth;
        const containerHeight = state.containerElement.clientHeight;

        // For flat-top hexagons:
        // - Total width = hexWidth * (0.75 * columns + 0.25)
        // - Total height = hexHeight * (rows + 0.5) for column offset
        // Where hexWidth = 2 * hexSize, hexHeight = sqrt(3) * hexSize

        const cols = state.width;
        const rows = state.height;

        // Calculate hexSize from width constraint
        const hexSizeFromWidth = containerWidth / (2 * (0.75 * cols + 0.25));

        // Calculate hexSize from height constraint
        const hexSizeFromHeight = containerHeight / (Math.sqrt(3) * (rows + 0.5));

        // Use the smaller to ensure grid fits
        const hexSize = Math.min(hexSizeFromWidth, hexSizeFromHeight);
        
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

    function createTooltip() {
        if (state.tooltip) return;
        const tip = document.createElement('div');
        tip.id = 'sector-tooltip';
        tip.style.position = 'fixed';
        tip.style.pointerEvents = 'none';
        tip.style.background = 'rgba(10,12,20,0.92)';
        tip.style.border = '1px solid rgba(255,255,255,0.08)';
        tip.style.borderRadius = '10px';
        tip.style.padding = '8px 10px';
        tip.style.color = '#e8ecff';
        tip.style.fontSize = '12px';
        tip.style.boxShadow = '0 8px 20px rgba(0,0,0,0.35)';
        tip.style.zIndex = 2000;
        tip.style.display = 'none';
        document.body.appendChild(tip);
        state.tooltip = tip;
    }
	
    function normalizeHexColor(color, fallback) {
        if (typeof color !== 'string') return fallback;
        const trimmed = color.trim();
        if (!trimmed) return fallback;
        if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
        if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
        return fallback;
    }

    function shiftColor(color, delta) {
        const normalized = normalizeHexColor(color, '#888888');
        const r = Math.max(0, Math.min(255, parseInt(normalized.slice(1, 3), 16) + delta));
        const g = Math.max(0, Math.min(255, parseInt(normalized.slice(3, 5), 16) + delta));
        const b = Math.max(0, Math.min(255, parseInt(normalized.slice(5, 7), 16) + delta));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    function getTextColorForFill(fillColor) {
        const normalized = normalizeHexColor(fillColor, '#888888');
        const r = parseInt(normalized.slice(1, 3), 16);
        const g = parseInt(normalized.slice(3, 5), 16);
        const b = parseInt(normalized.slice(5, 7), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 150 ? '#0f172a' : '#f5f8ff';
    }

    function getBaseFillForSector(sectorId) {
        const sector = state.sectors[sectorId];
        if (!sector || !sector.path) return STATUS_COLORS[SECTOR_STATUS.UNKNOWN];
        const baseFill = sector.path.getAttribute('data-base-fill');
        return normalizeHexColor(baseFill, STATUS_COLORS[sector.status] || STATUS_COLORS[SECTOR_STATUS.UNKNOWN]);
    }
    
    // Create a hexagon
    function createHexagon(id, gridX, gridY, hexSize) {
        const svgNS = "http://www.w3.org/2000/svg";

        // Flat-top hexagon dimensions
        const hexWidth = hexSize * 2;
        const hexHeight = hexSize * Math.sqrt(3);

        // Horizontal spacing: 3/4 of hex width for proper tessellation
        const horizSpacing = hexWidth * 0.75;
        // Vertical spacing: full hex height
        const vertSpacing = hexHeight;

        // Calculate position - offset odd columns by half height
        const xPos = gridX * horizSpacing;
        const yPos = gridY * vertSpacing + (gridX % 2 === 1 ? vertSpacing / 2 : 0);

        // Create SVG element
        // Use viewBox that matches hex proportions: width=100, height=100*sqrt(3)/2 = 86.6
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("id", `tileholder${id}`);
        svg.setAttribute("viewBox", "0 0 100 86.6");
        svg.setAttribute("width", `${hexWidth}px`);
        svg.setAttribute("height", `${hexHeight}px`);
        svg.style.position = "absolute";
        svg.style.left = `${xPos}px`;
        svg.style.top = `${yPos}px`;

        // Create hexagon path
        const hexPath = document.createElementNS(svgNS, "path");
        hexPath.setAttribute("id", `tile${id}`);
        hexPath.setAttribute("fill", STATUS_COLORS[SECTOR_STATUS.UNKNOWN]);
        hexPath.setAttribute("data-base-fill", STATUS_COLORS[SECTOR_STATUS.UNKNOWN]);
        hexPath.setAttribute("stroke", STROKE_COLORS[SECTOR_STATUS.UNKNOWN]);
        hexPath.setAttribute("stroke-width", "2");

        // Flat-top hexagon that fills the viewBox exactly
        // ViewBox is 100 x 86.6, hex radius = 50, centered at (50, 43.3)
        const points = [];
        const hexRadius = 50;
        const centerX = 50;
        const centerY = 43.3;
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = centerX + hexRadius * Math.cos(angle);
            const y = centerY + hexRadius * Math.sin(angle);
            points.push(`${x},${y}`);
        }
        
        hexPath.setAttribute("d", `M ${points.join(" L ")} Z`);
        
        // Add event listeners
        hexPath.addEventListener("mouseover", function() {
            const baseFill = getBaseFillForSector(id);
            this.setAttribute("fill", shiftColor(baseFill, 18));
        });
        
        hexPath.addEventListener("mouseout", function() {
            this.setAttribute("fill", getBaseFillForSector(id));
        });
        hexPath.addEventListener("mousemove", function(evt) {
            showTooltip(evt, id);
        });
        hexPath.addEventListener("mouseleave", hideTooltip);
        
        hexPath.addEventListener("mousedown", function() {
            selectSector(id);
        });
        
        // Add hexagon to SVG
        svg.appendChild(hexPath);
        
        // Add sector ID text
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("id", `textid${id}`);
        text.setAttribute("x", "50");
        text.setAttribute("y", "40");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "12");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("fill", "#0f172a");
        text.textContent = id.toString(16).toUpperCase();
        
        // Add event listeners to text
        text.addEventListener("mouseover", function() {
            const tile = document.getElementById(`tile${id}`);
            if (!tile) return;
            tile.setAttribute("fill", shiftColor(getBaseFillForSector(id), 18));
        });
        
        text.addEventListener("mouseout", function() {
            const tile = document.getElementById(`tile${id}`);
            if (!tile) return;
            tile.setAttribute("fill", getBaseFillForSector(id));
        });
        text.addEventListener("mousemove", function(evt) {
            showTooltip(evt, id);
        });
        text.addEventListener("mouseleave", hideTooltip);
        
        text.addEventListener("mousedown", function(evt) {
            selectSector(id);
            evt.preventDefault();
            return false;
        });
        
        svg.appendChild(text);
        
        // Add fleet size text (hidden by default)
        const fleetText = document.createElementNS(svgNS, "text");
        fleetText.setAttribute("id", `txtfleetid${id}`);
        fleetText.setAttribute("x", "50");
        fleetText.setAttribute("y", "55");
        fleetText.setAttribute("text-anchor", "middle");
        fleetText.setAttribute("font-size", "10");
        fleetText.setAttribute("font-weight", "bold");
        fleetText.setAttribute("fill", "#FFFFFF");
        fleetText.style.display = "none";
        svg.appendChild(fleetText);
        
        // Add colonized indicator text (hidden by default)
        const colonizedText = document.createElementNS(svgNS, "text");
        colonizedText.setAttribute("id", `colonizedtxt${id}`);
        colonizedText.setAttribute("x", "50");
        colonizedText.setAttribute("y", "68");
        colonizedText.setAttribute("text-anchor", "middle");
        colonizedText.setAttribute("font-size", "10");
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
            explored: false,
            x: xPos,
            y: yPos,
            owner: null,
            buildings: []
        };
        
        // Add to container
        state.containerElement.appendChild(svg);
    }
    
    // Select a sector
    function selectSector(sectorId, options = {}) {
        const normalizedSectorId = Number(sectorId);
        if (!Number.isFinite(normalizedSectorId)) {
            return;
        }

        const notifyServer = options.notifyServer !== false;
        state.selectedSector = normalizedSectorId;

        if (notifyServer && typeof window.changeSector === 'function') {
            window.changeSector(normalizedSectorId.toString(16).toUpperCase(), { syncMap: false });
        }

        hideTooltip();
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('click');
        }
    }

    // Update sector status
    function updateSectorStatus(sectorId, status, details = {}) {
        const sector = state.sectors[sectorId];
        if (!sector) return;
        
        // Update status
        const normalizedStatus = Number.isFinite(Number(status)) ? Number(status) : SECTOR_STATUS.UNKNOWN;
        sector.status = normalizedStatus;
        sector.explored = normalizedStatus !== SECTOR_STATUS.UNKNOWN;
        if (details.owner !== undefined) {
            sector.owner = details.owner;
        }
        if (details.buildings !== undefined) {
            sector.buildings = details.buildings;
        }
        
        // Update colors
        const fillColor = STATUS_COLORS[normalizedStatus] || STATUS_COLORS[SECTOR_STATUS.UNKNOWN];
        sector.path.setAttribute("fill", fillColor);
        sector.path.setAttribute("data-base-fill", fillColor);
        sector.path.setAttribute("stroke", STROKE_COLORS[normalizedStatus] || STROKE_COLORS[SECTOR_STATUS.UNKNOWN]);
        sector.text.setAttribute("fill", getTextColorForFill(fillColor));
        
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

        // Calculate new hex size (same logic as initialize)
        const containerWidth = state.containerElement.clientWidth;
        const containerHeight = state.containerElement.clientHeight;

        const cols = state.width;
        const rows = state.height;

        // Calculate hexSize from width constraint
        const hexSizeFromWidth = containerWidth / (2 * (0.75 * cols + 0.25));

        // Calculate hexSize from height constraint
        const hexSizeFromHeight = containerHeight / (Math.sqrt(3) * (rows + 0.5));

        // Use the smaller to ensure grid fits
        const hexSize = Math.min(hexSizeFromWidth, hexSizeFromHeight);

        // Calculate spacing (same as createHexagon)
        const actualHexWidth = hexSize * 2;
        const actualHexHeight = hexSize * Math.sqrt(3);
        const horizSpacing = actualHexWidth * 0.75;
        const vertSpacing = actualHexHeight;

        // Update size and position of all hexagons
        let id = 1;
        for (let y = 0; y < state.height; y++) {
            for (let x = 0; x < state.width; x++) {
                // Same positioning as createHexagon - offset odd columns
                const xPos = x * horizSpacing;
                const yPos = y * vertSpacing + (x % 2 === 1 ? vertSpacing / 2 : 0);

                const sector = state.sectors[id];
                if (sector && sector.element) {
                    sector.element.setAttribute("width", `${actualHexWidth}px`);
                    sector.element.setAttribute("height", `${actualHexHeight}px`);
                    sector.element.style.left = `${xPos}px`;
                    sector.element.style.top = `${yPos}px`;
                }

                id++;
            }
        }
    }

    function hideTooltip() {
        if (state.tooltip) {
            state.tooltip.style.display = 'none';
        }
    }

    function normalizeBuildingCounts(buildings) {
        const counts = { 0: 0, 1: 0, 2: 0 };
        if (Array.isArray(buildings)) {
            buildings.forEach(entry => {
                const type = typeof entry === 'object' ? Number(entry.type) : Number(entry);
                if (Number.isFinite(type)) {
                    counts[type] = (counts[type] || 0) + 1;
                }
            });
        } else if (buildings && typeof buildings === 'object') {
            const mapping = {
                metalExtractor: 0,
                crystalRefinery: 1,
                researchAcademy: 2
            };
            Object.keys(mapping).forEach(key => {
                const type = mapping[key];
                const value = Number(buildings[key]) || 0;
                if (value > 0) counts[type] = value;
            });
        }
        return counts;
    }

    function estimateProduction(counts) {
        const metal = (counts[0] || 0) * 10;
        const crystal = (counts[1] || 0) * 10;
        const research = (counts[2] || 0) * 5;
        return { metal, crystal, research };
    }

    function showTooltip(evt, sectorId) {
        if (!state.tooltip) return;
        const sector = state.sectors[sectorId];
        if (!sector) return;
        const x = evt.clientX + 12;
        const y = evt.clientY + 12;
        state.tooltip.style.left = `${x}px`;
        state.tooltip.style.top = `${y}px`;

        if (sector.status === SECTOR_STATUS.UNKNOWN) {
            state.tooltip.innerHTML = `
                <div style="font-weight:700;margin-bottom:4px;">Sector ${sectorId}</div>
                <div>Unexplored</div>
                <div style="opacity:0.85;margin-top:4px;">Scout or probe this area first.</div>
            `;
            state.tooltip.style.display = 'block';
            return;
        }

        const owner = sector.owner || 'Unknown';
        const statusLabel = Object.keys(SECTOR_STATUS).find(key => SECTOR_STATUS[key] === sector.status) || 'Unknown';
        const fleetText = sector.fleetText && sector.fleetText.textContent ? sector.fleetText.textContent : 'None';
        const buildingCounts = normalizeBuildingCounts(sector.buildings);
        const projections = estimateProduction(buildingCounts);
        const buildingLabel = Object.values(buildingCounts).some(v => v > 0)
            ? `Buildings: ${buildingCounts[0] || 0} metal, ${buildingCounts[1] || 0} crystal, ${buildingCounts[2] || 0} research`
            : '';
        state.tooltip.innerHTML = `
            <div style="font-weight:700;margin-bottom:4px;">Sector ${sectorId}</div>
            <div>Owner: ${owner}</div>
            <div>Status: ${statusLabel}</div>
            <div>Fleet: ${fleetText}</div>
            ${buildingLabel ? `<div>${buildingLabel}</div>` : ''}
            <div style="margin-top:4px;opacity:0.85;">Est. yields/turn: M ${projections.metal} · C ${projections.crystal} · R ${projections.research}</div>
        `;
        state.tooltip.style.display = 'block';
        if (window.MediaManager?.playSfx) {
            const now = Date.now();
            if (now - state.lastHoverSound > 300) {
                window.MediaManager.playSfx('hover');
                state.lastHoverSound = now;
            }
        }
    }

    // Return public API
    return {
        initialize,
        selectSector,
        updateSectorStatus,
        SECTOR_STATUS,
        highlightSector: function(sectorId) {
            const sector = state.sectors[sectorId];
            if (!sector) return;
            sector.path.setAttribute('stroke', '#ffd166');
            sector.path.setAttribute('stroke-width', '3');
            setTimeout(() => {
                sector.path.setAttribute('stroke-width', '1');
                sector.path.setAttribute('stroke', STROKE_COLORS[sector.status] || '#555');
            }, 1800);
        }
    };
})();

// Map initialization is handled by game.js to ensure proper ordering
