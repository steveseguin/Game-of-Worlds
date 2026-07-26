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
// Forward map updates to the 3D galaxy view; queue them if it hasn't loaded yet
// (galaxy3d.js is an ES module, so it executes after the classic scripts).
function g3dCall(method, ...args) {
    if (window.Galaxy3D && typeof window.Galaxy3D[method] === 'function') {
        window.Galaxy3D[method](...args);
    } else {
        (window.__g3dQueue = window.__g3dQueue || []).push([method, args]);
    }
}

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
        ARTIFACT: 8,     // Cyan - contains artifact
        FLEET: 9         // Teal - your ships hold this unclaimed sector
    };

    // Status colors
    const STATUS_COLORS = {
        [SECTOR_STATUS.UNKNOWN]: "#2e3442",
        [SECTOR_STATUS.OWNED]: "#40C040",
        [SECTOR_STATUS.ENEMY]: "#C04040",
        [SECTOR_STATUS.HAZARD]: "#C08040",
        [SECTOR_STATUS.BLACKHOLE]: "#202020",
        [SECTOR_STATUS.COLONIZED]: "#40C0A0",
        [SECTOR_STATUS.HOMEWORLD]: "#FFC040",
        [SECTOR_STATUS.WARPGATE]: "#8040C0",
        [SECTOR_STATUS.ARTIFACT]: "#40C0FF",
        [SECTOR_STATUS.FLEET]: "#3FC1C9"
    };

    // Stroke colors
    const STROKE_COLORS = {
        [SECTOR_STATUS.UNKNOWN]: "#596176",
        [SECTOR_STATUS.OWNED]: "#208020",
        [SECTOR_STATUS.ENEMY]: "#802020",
        [SECTOR_STATUS.HAZARD]: "#805020",
        [SECTOR_STATUS.BLACKHOLE]: "#000000",
        [SECTOR_STATUS.COLONIZED]: "#208060",
        [SECTOR_STATUS.HOMEWORLD]: "#C09020",
        [SECTOR_STATUS.WARPGATE]: "#602080",
        [SECTOR_STATUS.ARTIFACT]: "#2080C0",
        [SECTOR_STATUS.FLEET]: "#1F8A91"
    };

    const UNKNOWN_FILL = "#101522";
    const UNKNOWN_STROKE = "#263149";
    const MEMORY_OPACITY = "0.50";

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
        const nextWidth = width || 14;
        const nextHeight = height || 8;
        const nextContainer = document.getElementById(containerId);

        g3dCall('initialize', nextWidth, nextHeight);

        if (state.initialized) {
            if (state.width === nextWidth && state.height === nextHeight && state.containerElement === nextContainer) {
                resetSectorStatuses();
                return true;
            }
            state.sectors = {};
            state.selectedSector = null;
            state.initialized = false;
        }

        state.width = nextWidth;
        state.height = nextHeight;
        state.containerElement = nextContainer;

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

    function resetSectorStatuses() {
        Object.values(state.sectors).forEach(sector => {
            sector.status = SECTOR_STATUS.UNKNOWN;
            sector.owner = null;
            sector.buildings = [];
            sector.path.setAttribute("fill", UNKNOWN_FILL);
            sector.path.setAttribute("data-original-fill", UNKNOWN_FILL);
            sector.path.setAttribute("data-intel", "fog");
            sector.path.setAttribute("aria-label", `Unexplored sector ${sector.id}`);
            sector.path.setAttribute("stroke", UNKNOWN_STROKE);
            sector.path.setAttribute("stroke-dasharray", "2 4");
            sector.path.setAttribute("opacity", "0.42");
            sector.text.setAttribute("opacity", "0");
            sector.fleetText.style.display = "none";
            sector.colonizedText.style.display = "none";
            sector.live = false;
            sector.flags = 0;
            sector.type = null;
        });
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
	
	function fade(from, to, element) {
		if (!element) return;

		// Use the element's stored original fill if available (so fade restores
		// real status color, not a hard-coded gray).
		const originalFill = element.getAttribute('data-original-fill');
		const targetHex = (originalFill && /^#[0-9a-fA-F]{6}$/.test(originalFill))
			? originalFill.slice(1)
			: to;

		const fromColor = parseInt(from, 16);
		const toColor = parseInt(targetHex, 16);
		if (!Number.isFinite(fromColor) || !Number.isFinite(toColor)) {
			element.setAttribute("fill", `#${targetHex}`);
			return;
		}

		// Interpolate per channel so we always emit a valid 6-char hex.
		const fromR = (fromColor >> 16) & 0xff;
		const fromG = (fromColor >> 8) & 0xff;
		const fromB = fromColor & 0xff;
		const toR = (toColor >> 16) & 0xff;
		const toG = (toColor >> 8) & 0xff;
		const toB = toColor & 0xff;

		let step = 0;
		const steps = 8;
		const fadeInterval = setInterval(() => {
			step += 1;
			const t = step / steps;
			if (step >= steps) {
				clearInterval(fadeInterval);
				element.setAttribute("fill", `#${targetHex}`);
				return;
			}
			const r = Math.round(fromR + (toR - fromR) * t);
			const g = Math.round(fromG + (toG - fromG) * t);
			const b = Math.round(fromB + (toB - fromB) * t);
			const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
			element.setAttribute("fill", `#${hex}`);
		}, 40);
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
        hexPath.setAttribute("fill", UNKNOWN_FILL);
        hexPath.setAttribute("data-original-fill", UNKNOWN_FILL);
        hexPath.setAttribute("data-intel", "fog");
        hexPath.setAttribute("aria-label", `Unexplored sector ${id}`);
        hexPath.setAttribute("stroke", UNKNOWN_STROKE);
        hexPath.setAttribute("stroke-width", "2");
        hexPath.setAttribute("stroke-dasharray", "2 4");
        hexPath.setAttribute("opacity", "0.42");

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
        hexPath.addEventListener("mouseover", function(evt) {
            window.tilefading = evt.target;
            // Preserve current fill so we can restore it on mouseout
            const currentFill = evt.target.getAttribute('data-original-fill') || evt.target.getAttribute('fill');
            if (currentFill && /^#[0-9a-fA-F]{6}$/.test(currentFill)) {
                evt.target.setAttribute('data-original-fill', currentFill);
            }
            evt.target.setAttribute('fill-opacity', '0.85');
            evt.target.style.filter = 'brightness(1.18)';
        });

        hexPath.addEventListener("mouseout", function(evt) {
            window.tilefading = "";
            evt.target.setAttribute('fill-opacity', '1');
            evt.target.style.filter = '';
        });
        hexPath.addEventListener("mousemove", function(evt) {
            showTooltip(evt, id);
        });
        hexPath.addEventListener("mouseleave", hideTooltip);

        hexPath.addEventListener("mousedown", function(evt) {
            // Don't overwrite fill — selectSector will handle visual state
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
        text.setAttribute("fill", "#c7cede");
        text.setAttribute("opacity", "0");
        text.style.pointerEvents = "none";
        // Decimal labels: server messages refer to sectors by decimal number.
        text.textContent = String(id);
        
        // Add event listeners to text
        text.addEventListener("mouseover", function() {
            const tile = document.getElementById(`tile${id}`);
            if (!tile) return;
            window.tilefading = tile;
            tile.setAttribute('fill-opacity', '0.85');
            tile.style.filter = 'brightness(1.18)';
        });

        text.addEventListener("mouseout", function() {
            const tile = document.getElementById(`tile${id}`);
            if (!tile) return;
            window.tilefading = "";
            tile.setAttribute('fill-opacity', '1');
            tile.style.filter = '';
        });
        text.addEventListener("mousemove", function(evt) {
            showTooltip(evt, id);
        });
        text.addEventListener("mouseleave", hideTooltip);
        
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
        fleetText.setAttribute("x", "50");
        fleetText.setAttribute("y", "55");
        fleetText.setAttribute("text-anchor", "middle");
        fleetText.setAttribute("font-size", "10");
        fleetText.setAttribute("font-weight", "bold");
        fleetText.setAttribute("fill", "#FFFFFF");
        fleetText.style.pointerEvents = "none";
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
        colonizedText.style.pointerEvents = "none";
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
            x: xPos,
            y: yPos,
            gridX,
            gridY,
            owner: null,
            buildings: [],
            type: null,
            live: false,
            flags: 0
        };
        
        // Add to container
        state.containerElement.appendChild(svg);
    }
    
    // Select a sector
    // Record the selection and refresh the sensor overlay WITHOUT re-requesting the
    // sector from the server. The 3D view drives its own click handling, so it calls
    // this to keep the minimap's idea of "selected" in step (see markSelected below).
    function applySelection(sectorId) {
        state.selectedSector = sectorId;
        Object.values(state.sectors).forEach(sector => sector.path.removeAttribute('data-sensor-neighbor'));
        const selected = state.sectors[sectorId];
        const projectsSensors = selected && [
            SECTOR_STATUS.OWNED,
            SECTOR_STATUS.COLONIZED,
            SECTOR_STATUS.HOMEWORLD,
            SECTOR_STATUS.WARPGATE,
            SECTOR_STATUS.FLEET
        ].includes(selected.status);
        if (projectsSensors) {
            Object.values(state.sectors).forEach(sector => {
                const dx = Math.abs(Number(sector.gridX) - Number(selected.gridX));
                const dy = Math.abs(Number(sector.gridY) - Number(selected.gridY));
                if (dx <= 1 && dy <= 1 && dx + dy > 0) {
                    sector.path.setAttribute('data-sensor-neighbor', 'true');
                }
            });
        }
    }

    function selectSector(sectorId) {
        applySelection(sectorId);
        changeSector(sectorId.toString(16).toUpperCase());
        hideTooltip();
        g3dCall('setSelected', sectorId);
        g3dCall('focusSector', sectorId);
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('click');
        }
    }

    // Update sector status
    function updateSectorStatus(sectorId, status, details = {}) {
        g3dCall('updateSector', sectorId, status, details);
        const sector = state.sectors[sectorId];
        if (!sector) return;
        const normalizedStatus = STATUS_COLORS[status] ? status : SECTOR_STATUS.UNKNOWN;
        const hasTerrainMemory = details.live === false ||
            (details.type !== undefined && details.type !== null && Number.isFinite(Number(details.type)));
        const known = normalizedStatus !== SECTOR_STATUS.UNKNOWN || hasTerrainMemory;
        
        // Update status
        sector.status = normalizedStatus;
        if (details.owner !== undefined) {
            sector.owner = details.owner;
        }
        if (details.buildings !== undefined) {
            sector.buildings = details.buildings;
        }
        if (details.type !== undefined) {
            sector.type = details.type;
        }
        if (details.live !== undefined) {
            sector.live = Boolean(details.live);
        } else if (normalizedStatus !== SECTOR_STATUS.UNKNOWN) {
            sector.live = true;
        } else if (known) {
            sector.live = details.live !== false;
        }
        if (details.flags !== undefined) {
            sector.flags = Number(details.flags) || 0;
        }
        // Chart name, and who put it there. Both `mapstate::` and focused `sector::` detail can
        // carry these. Do not clear a known name when an older server or stale optional payload
        // omits it: the name is permanent.
        if (details.chartName !== undefined && details.chartName) {
            sector.chartName = String(details.chartName);
        }
        if (details.namedBy !== undefined && details.namedBy) {
            sector.namedBy = String(details.namedBy);
        }
        if (details.namedById !== undefined && details.namedById) {
            sector.namedById = Number(details.namedById) || null;
        }
        if (details.namedTurn !== undefined && details.namedTurn) {
            sector.namedTurn = Number(details.namedTurn) || null;
        }
        
        // Update colors. Unknown tiles remain selectable, but they do not reveal
        // labels or terrain until the server marks them explored.
        const fill = known ? STATUS_COLORS[normalizedStatus] : UNKNOWN_FILL;
        const stroke = known ? STROKE_COLORS[normalizedStatus] : UNKNOWN_STROKE;
        sector.path.setAttribute("fill", fill);
        sector.path.setAttribute("data-original-fill", fill);
        sector.path.setAttribute("stroke", stroke);
        sector.path.setAttribute("opacity", known ? (sector.live ? "1" : MEMORY_OPACITY) : "0.42");
        sector.path.setAttribute("stroke-dasharray", known ? (sector.live ? "" : "4 3") : "2 4");
        sector.text.setAttribute("opacity", known ? (sector.live ? "1" : "0.58") : "0");
        const intelState = known ? (sector.live ? "live" : "memory") : "fog";
        sector.path.setAttribute("data-intel", intelState);
        sector.element.setAttribute("data-intel", intelState);
        const labelPrefix = intelState === "fog"
            ? "Unexplored"
            : intelState === "memory"
                ? "Stale memory"
                : "Live intel";
        sector.path.setAttribute("aria-label", `${labelPrefix} sector ${sectorId}`);
        
        // Update fleet size
        if (details.fleetSize !== undefined) {
            if (known && details.fleetSize > 0) {
                sector.fleetText.textContent = (sector.flags & 16) ? `E:${details.fleetSize}` : `F:${details.fleetSize}`;
                sector.fleetText.style.display = "block";
            } else {
                sector.fleetText.style.display = "none";
            }
        }
        
        // Update colonized indicator
        if (details.indicator !== undefined) {
            if (known && details.indicator) {
                sector.colonizedText.textContent = details.indicator;
                sector.colonizedText.setAttribute("font-size", details.indicator.length > 2 ? "8" : "10");
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

    // Sector types, named and explained, for the hover tooltip.
    //
    // Two problems, one table. The tooltip has never named the type at all - a player hovering a
    // black hole was told Owner/Status/Intel/Markers/Fleet and not that it was a black hole.
    // (sectorTypeLabel() exists, but in GUI.js, feeding the detail panel rather than this.) And the
    // setting had no way of reaching a player who does not read a codex.
    //
    // So each entry carries the name and one line of why it matters. Ids and names are from
    // SECTOR_TYPES in server/lib/map.js and are pinned by tests/lore-sector-types-match-code.test.js;
    // the lines are condensed from lore/26-encyclopedia.md. Keep them to roughly a dozen words - this
    // is a hover, not a panel.
    /**
     * Minimal HTML escape for wire strings that end up inside an innerHTML template. The tooltip
     * is built as markup, and the chart name is the one piece of it that comes off the socket.
     */
    function escapeText(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const SECTOR_LORE = {
        0:  { name: 'Empty Space',   line: 'Open dark. Nothing to hold, nothing to fear, nothing to gain.' },
        1:  { name: 'Asteroid Belt', line: 'A shoal. Half your hulls crossing, a quarter arriving — and safe forever once swept.' },
        2:  { name: 'Black Hole',    line: 'A mouth. No roll, no survivors. Every one on the chart was found by a fleet that did not come back.' },
        3:  { name: 'Unstable Star', line: 'Free to cross, impossible to keep. The inverse of a shoal: it will not touch a fleet, and it will never be yours.' },
        4:  { name: 'Brown Dwarf',   line: 'A failed star. Too dim to fight over, bright enough to fix a position by. Permanent.' },
        5:  { name: 'Small Moon',    line: 'Worthless as ground, decisive as a position. A rock at a junction of traces is a door.' },
        6:  { name: 'Micro Planet',  line: 'Ore, and somewhere to put a yard. Nobody is from a micro planet.' },
        7:  { name: 'Small Planet',  line: 'It will grow something if you argue with it.' },
        8:  { name: 'Medium Planet', line: 'Grows willingly, and hides a problem. You find the problem in year three.' },
        9:  { name: 'Large Planet',  line: 'Good ground. Every one within reach was fought over before the Lamps went out.' },
        10: { name: 'Homeworld',     line: 'Where you were standing when the Lamps went out. Nobody chose their capital.' }
    };

    function showTooltip(evt, sectorId) {
        if (!state.tooltip) return;
        const sector = state.sectors[sectorId];
        if (!sector) return;
        const x = evt.clientX + 12;
        const y = evt.clientY + 12;
        const owner = sector.owner || 'Unknown';
        const hasKnownIntel = sector.status !== SECTOR_STATUS.UNKNOWN || sector.live === false || sector.type !== null;
        const statusLabel = sector.status === SECTOR_STATUS.UNKNOWN && hasKnownIntel
            ? 'Neutral'
            : (Object.keys(SECTOR_STATUS).find(key => SECTOR_STATUS[key] === sector.status) || 'Unknown');
        const freshness = !hasKnownIntel ? 'Fog' : (sector.live ? 'Live' : 'Memory');
        if (!hasKnownIntel) {
            state.tooltip.style.left = `${x}px`;
            state.tooltip.style.top = `${y}px`;
            state.tooltip.innerHTML = `
                <div style="font-weight:700;margin-bottom:4px;">Unknown sector</div>
                <div>Intel: Fog</div>
            `;
            state.tooltip.style.display = 'block';
            return;
        }
        const markers = sector.colonizedText && sector.colonizedText.textContent ? sector.colonizedText.textContent : 'None';
        const fleetText = sector.fleetText && sector.fleetText.textContent ? sector.fleetText.textContent : 'None';
        const buildingCounts = normalizeBuildingCounts(sector.buildings);
        const projections = estimateProduction(buildingCounts);
        const buildingLabel = Object.values(buildingCounts).some(v => v > 0)
            ? `Buildings: ${buildingCounts[0] || 0} metal, ${buildingCounts[1] || 0} crystal, ${buildingCounts[2] || 0} research`
            : '';
        state.tooltip.style.left = `${x}px`;
        state.tooltip.style.top = `${y}px`;
        // The type is only shown once we actually know it. Under fog the branch above returns
        // early, so a player is never told what is in a sector they have not reached - which is
        // the whole point of the setting and would be undone by a helpful tooltip.
        const lore = SECTOR_LORE[Number(sector.type)];
        // The chart name is the sector's identity and the type is its classification, so the name
        // leads and the type follows it. This is the only place a player's own decision is shown
        // back to them on the map, which is the whole reason the naming feature is not cosmetic.
        //
        // escapeText, not raw interpolation: the name arrives over the socket. The server composes
        // it from a fixed word list so it cannot currently contain markup, but "cannot currently"
        // is not a property worth relying on inside an innerHTML template.
        const named = sector.chartName ? escapeText(sector.chartName) : '';
        const namerId = Number(sector.namedById) || null;
        const resolvedNamer = sector.namedBy
            || (namerId && typeof getCookie === 'function' && Number(getCookie('userId')) === namerId
                ? 'you'
                : (namerId && window.GAME_STATE?.players?.[namerId]?.name) || null);
        const credit = named && (resolvedNamer || sector.namedTurn)
            ? [
                resolvedNamer ? `named by ${escapeText(resolvedNamer)}` : 'named',
                sector.namedTurn ? `turn ${sector.namedTurn}` : ''
            ].filter(Boolean).join(', ')
            : '';
        state.tooltip.innerHTML = `
            <div style="font-weight:700;margin-bottom:4px;">${named
                ? `${named}<span style="opacity:0.6;font-weight:400;"> — sector ${sectorId}${lore ? `, ${lore.name}` : ''}</span>`
                : `Sector ${sectorId}${lore ? ` — ${lore.name}` : ''}`}</div>
            ${credit ? `<div style="opacity:0.6;margin:-2px 0 4px;">${credit}</div>` : ''}
            <div>Owner: ${owner}</div>
            <div>Status: ${statusLabel}</div>
            <div>Intel: ${freshness}</div>
            <div>Markers: ${markers}</div>
            <div>Fleet: ${fleetText}</div>
            ${buildingLabel ? `<div>${buildingLabel}</div>` : ''}
            <div style="margin-top:4px;opacity:0.85;">Est. yields/turn: M ${projections.metal} · C ${projections.crystal} · R ${projections.research}</div>
            ${lore ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.10);max-width:280px;opacity:0.72;font-style:italic;line-height:1.35;">${lore.line}</div>` : ''}
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
        // Selection made elsewhere (3D map click, server sector:: reply). Keeps this
        // module's selectedSector authoritative so callers can't read a stale sector.
        markSelected: function(sectorId) {
            const id = Number(sectorId);
            if (!Number.isFinite(id) || id <= 0) return;
            applySelection(id);
        },
        focusSector: function(sectorId) {
            g3dCall('focusSector', Number(sectorId));
        },
        updateSectorStatus,
        SECTOR_STATUS,
        highlightSector: function(sectorId) {
            g3dCall('highlightSector', sectorId);
            const sector = state.sectors[sectorId];
            if (!sector) return;
            sector.path.setAttribute('stroke', '#ffd166');
            sector.path.setAttribute('stroke-width', '3');
            setTimeout(() => {
                sector.path.setAttribute('stroke-width', '2');
                sector.path.setAttribute('stroke', STROKE_COLORS[sector.status] || '#555');
            }, 1800);
        },
        // Brief stroke pulse used for fleet arrivals (teal for yours, red for enemy).
        flashSector: function(sectorId, color) {
            const sector = state.sectors[Number(sectorId)];
            if (!sector) return;
            sector.path.setAttribute('stroke', color || '#66d9ff');
            sector.path.setAttribute('stroke-width', '4');
            setTimeout(() => {
                sector.path.setAttribute('stroke-width', '2');
                sector.path.setAttribute('stroke', STROKE_COLORS[sector.status] || '#555');
            }, 1400);
        },
        clearBattleSector: function(sectorId) {
            g3dCall('clearBattleSector', sectorId);
        },
        getSelectedSector: function() {
            return state.selectedSector;
        },
        resize
    };
})();

// Map initialization is handled by game.js to ensure proper ordering
