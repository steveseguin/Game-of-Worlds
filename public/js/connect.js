/**
 * connect.js - Client-side WebSocket connection and game state management
 * 
 * Handles the WebSocket connection to the server, message parsing,
 * and updating the UI based on server responses. This file also contains
 * functions for sending commands to the server.
 * 
 * This module is client-side only and does not directly access the database.
 * It serves as the main communication layer between client and server.
 * 
 * Dependencies:
 * - Used by game.js for game initialization
 * - Uses GameUI, BattleSystem, GalaxyMap for UI updates
 */
function getWebSocketUrl() {
    if (window.GAME_SERVER_URL) {
        return window.GAME_SERVER_URL;
    }

    const isSecure = window.location.protocol === 'https:';
    const protocol = isSecure ? 'wss' : 'ws';
    const hostname = window.location.hostname;

    let port = window.location.port;
    if (port) {
        if ((isSecure && port === '443') || (!isSecure && port === '80')) {
            port = '';
        }
    } else if (!isSecure) {
        port = '1337';
    }

    const portSegment = port ? `:${port}` : '';
    return `${protocol}://${hostname}${portSegment}`;
}

// Get WebSocket URL based on current location
let server = getWebSocketUrl();
let websocket;
let reconnectTimerId = null;
let shouldAutoReconnect = true;
let pendingLobbyRedirect = false;
let lobbyRedirectFallbackId = null;
let turnTimer = 180; // 3 minutes per turn
let turnInterval;
let lastResources = { metal: 0, crystal: 0, research: 0 };
let pendingTurnDigest = null; // Track pending turn for resource digest
let lastTurnDigest = [];
let eventPanel;
let countdownOverlay;
let standingOrdersState = { autoRebuild: false, autoScout: false, targetScouts: 2 }; // Kept for AI, UI removed for humans
let eventFilter = 'all';
let eventEntries = [];
const MESSAGE_HANDLERS = {
    connectedCount(payload) {
        const el = document.getElementById("connected");
        if (el) el.textContent = payload || '-';
    },
    battle(payload) {
        if (window.BattleSystem) {
            window.BattleSystem.createBattleVisualization(payload);
        }
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify("Battle update", "Combat detected. Check the map for details.", "info", 5000);
        }
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('explosion');
        }
    },
    battlereport(payload) {
        let report = null;
        try {
            report = JSON.parse(payload);
        } catch (e) {
            // fallback to legacy format
        }
        if (!report || typeof report !== 'object') {
            const parts = payload.split("::");
            report = {
                sector: parts[0],
                winner: parts[1],
                participants: parts.slice(2).filter(Boolean),
                summary: []
            };
        }
        const sector = report.sector || '?';
        const winner = report.winner || 'Unknown';
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify(
                "Battle resolved",
                `Sector ${sector}: ${winner} wins.`,
                "info",
                6000
            );
        }
        pushEventFeed(`Battle in sector ${sector}: ${winner} wins.`, 'battles');
        if (window.GalaxyMap?.highlightSector && sector) {
            window.GalaxyMap.highlightSector(parseInt(sector, 10));
        }
        showCombatReportModal(report);
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('explosion');
        }
    },
    gameover(payload) {
        const parts = payload.split("::");
        const winnerId = parseInt(parts[0], 10);
        const reason = parts[1] || "Victory condition met";
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify("Game Over", `Player ${winnerId} wins (${reason}).`, "success", 8000);
        } else {
            alert(`Game over! Player ${winnerId} wins! Reason: ${reason}`);
        }
        if (window.NotificationSystem?.confirm) {
            window.NotificationSystem.confirm(
                "Game Over",
                `Player ${winnerId} wins (${reason}). Return to lobby?`,
                () => navigateToLobby(),
                null
            );
        }
        if (window.NotificationSystem?.modal) {
            window.NotificationSystem.modal(
                'Game Complete',
                `<div style="line-height:1.5;">Player ${winnerId} wins (${reason}).</div>`,
                [
                    { label: 'Return to lobby', action: () => navigateToLobby(), primary: true },
                    { label: 'Stay here', action: null }
                ]
            );
        }
        pushEventFeed(`Game over: Player ${winnerId} wins (${reason}).`, 'system');
        if (window.MediaManager?.playMusic) {
            window.MediaManager.playMusic('victory');
        }
    }
};

// Game state
const GAME_STATE = {
    player: {
        resources: {
            metal: 0,
            crystal: 0,
            research: 0
        },
        techLevels: {}
    },
    selectedSector: null,
    selectedSectorData: null
};

// Update timer display
function updateTimer() {
    if (turnTimer <= 0) {
        document.getElementById("turnRedFlashWhenLow").innerHTML = " (..loading)";
    } else {
        document.getElementById("turnRedFlashWhenLow").innerHTML = turnTimer + "s";
        turnTimer = turnTimer - 1;
        
        // Flash when time is running low
        if (turnTimer < 30) {
            document.getElementById("turnRedFlashWhenLow").style.color = turnTimer % 2 === 0 ? "#FF0000" : "#FFFFFF";
        }
    }
}

// Game action functions
function nextTurn() {
    websocket.send("//start");
}

function buyTech(techId) {
    websocket.send("//buytech:" + techId);
}

function buyShip(shipId) {
    websocket.send("//buyship:" + shipId);
}

function buyBuilding(buildingId) {
    websocket.send("//buybuilding:" + buildingId);
}

// Authentication function
function authUser() {
    const userId = getCookie("userId");
    const tempKey = getCookie("tempKey");
    
    if (userId && tempKey) {
        websocket.send("//auth:" + userId + ":" + tempKey);
        return userId;
    }
    
    return null;
}

function initializeWebSocket() {
    if (websocket && (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    if (reconnectTimerId) {
        clearTimeout(reconnectTimerId);
        reconnectTimerId = null;
    }

    try {
        websocket = new WebSocket(getWebSocketUrl());
    } catch (error) {
        console.error("WebSocket initialization failed:", error);
        document.getElementById("status").innerHTML = "Connection error";
        scheduleReconnect();
        return;
    }
    
    websocket.onopen = function() {
        console.log("Connection established");
        document.getElementById("status").innerHTML = "Connected";
        shouldAutoReconnect = true;
        pendingLobbyRedirect = false;
        if (window.NotificationSystem && typeof window.NotificationSystem.initialize === 'function') {
            window.NotificationSystem.initialize();
        }
        if (window.location.pathname.includes('game.html')) {
            // Request initial game state after auth
            setTimeout(() => {
                websocket.send("//update");
            }, 400);
        }
        
        // Auto-authenticate if credentials exist
        authUser();
    };
    
    websocket.onmessage = function(evt) {
        handleWebSocketMessage(evt.data);
    };
    
    websocket.onerror = function(evt) {
        console.error("WebSocket error:", evt);
        document.getElementById("status").innerHTML = "Connection error";
    };
    
    websocket.onclose = function() {
        console.log("Connection closed");
        document.getElementById("status").innerHTML = "Disconnected";
        if (!pendingLobbyRedirect) {
            document.getElementById("lobbyWindow").style.display = "block";
        }
        
        // Auto-reconnect after delay if needed
        scheduleReconnect();
    };
}

function scheduleReconnect() {
    if (!shouldAutoReconnect) {
        return;
    }
    if (reconnectTimerId) {
        return;
    }
    reconnectTimerId = setTimeout(() => {
        reconnectTimerId = null;
        if (window.WebSocket) {
            initializeWebSocket();
        }
    }, 5000);
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
    console.log("Received message:", message);
    
    if (message.indexOf("countdown::") === 0) {
        return handleCountdownMessage(message.split("::")[1]);
    }
    if (message.indexOf("standingorders::state::") === 0) {
        try {
            const payload = JSON.parse(message.replace("standingorders::state::", ""));
            standingOrdersState = { ...standingOrdersState, ...payload };
            syncStandingOrdersUI();
        } catch (e) {
            console.warn('Failed to parse standing order state', e);
        }
        return;
    }
    if (message.indexOf("standingorders::applied::") === 0) {
        try {
            const summary = JSON.parse(message.replace("standingorders::applied::", ""));
            summary.forEach(line => pushEventFeed(line, 'orders'));
            if (window.NotificationSystem?.notify) {
                window.NotificationSystem.notify('Standing orders executed', summary.join(' · '), 'info', 5000);
            }
        } catch (e) {
            console.warn('Failed to parse standing order summary', e);
        }
        return;
    }
    if (message === "standingorders::noop") {
        pushEventFeed('Standing orders: nothing to run this turn.', 'orders');
        return;
    }
    if (message.indexOf("standingorders::error::") === 0) {
        const text = message.replace("standingorders::error::", "") || 'Unable to update standing orders';
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify('Standing orders error', text, 'error', 4000);
        }
        return;
    }
    // Connected users count
    if (message.indexOf("$^$") === 0) {
        return MESSAGE_HANDLERS.connectedCount(message.split("$^$")[1]);
    }
    // Battle information
    if (message.indexOf("battle:") === 0) {
        return MESSAGE_HANDLERS.battle(message);
    } 
    if (message.indexOf("battlereport::") === 0) {
        return MESSAGE_HANDLERS.battlereport(message.replace("battlereport::", ""));
    }
    if (message.indexOf("gameover::") === 0) {
        return MESSAGE_HANDLERS.gameover(message.replace("gameover::", ""));
    }
    // Lobby information
    else if (message.indexOf("lobby::") === 0) {
        if (pendingLobbyRedirect) {
            navigateToLobby();
            return;
        }
        if (window.ChatSystem) {
            window.ChatSystem.displayMessage("Waiting for game to start...");
        }
    }
    // Game started
    else if (message.indexOf("startgame::") === 0) {
        // Hide lobby and show game
        document.getElementById("lobbyWindow").style.display = "none";
        document.getElementById("gameWindow").style.display = "block";
        
        // Initialize game UI
        if (window.GameUI && window.GameUI.initialize) {
            window.GameUI.initialize();
        }
        
        // Request initial game state
        websocket.send("//update");
    }
    // Max build notification
    else if (message.indexOf("maxbuild::") === 0) {
        const buildingType = message.split("::")[1];
        const buildingBtn = document.getElementById(`bb${buildingType}`);
        if (buildingBtn) {
            buildingBtn.style.background = '#222';
        }
    }
    // Player list
    else if (message.indexOf("pl:") === 0) {
        updatePlayerList(message);
    }
    // Probe only notification
    else if (message.indexOf("probeonly:") === 0) {
        const sectorId = message.split(":")[1];
        if (confirm('You do not control this sector. Would you like to use a probe to scan it? (cost: 300 Crystal)')) {
            websocket.send("//probe:" + sectorId);
        }
    }
    // Multiple move options
    else if (message.indexOf("mmoptions:") === 0) {
        if (window.GameUI && window.GameUI.showMultiMoveOptions) {
            const parts = message.split(':');
            const targetSector = parts[1];
            const shipsData = message.substring(message.indexOf(targetSector) + targetSector.length);
            window.GameUI.showMultiMoveOptions(targetSector, shipsData);
        }
    }
    // New turn
    else if (message.indexOf("newturn::") === 0) {
        const turnNumber = message.split("::")[1];
        document.getElementById("nextTurnText").innerHTML = `Turn ${turnNumber}`;
        document.getElementById("turnRedFlashWhenLow").innerHTML = '180s';
        turnTimer = 180;
        clearInterval(turnInterval);
        turnInterval = setInterval(updateTimer, 1000);
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('notification');
        }
        // Mark that we have a pending turn digest - will emit when resources arrive
        pendingTurnDigest = turnNumber;
    }
    // New round (legacy)
    else if (message === "newround:") {
        document.getElementById("nextTurnText").innerHTML = 'Next Turn';
        document.getElementById("turnRedFlashWhenLow").innerHTML = '180s';
        turnTimer = 180;
        clearInterval(turnInterval);
        turnInterval = setInterval(updateTimer, 1000);
    }
    // Owned sector information
    else if (message.indexOf("ownsector:") === 0) {
        updateOwnedSector(message);
    }
    // Fleet information
    else if (message.indexOf("fleet:") === 0) {
        updateFleet(message);
    }
    // Technology information
    else if (message.indexOf("tech:") === 0) {
        updateTechLevels(message);
    }
    // 10 second countdown
    else if (message === "start10:") {
        document.getElementById("nextTurnText").innerHTML = '';
        document.getElementById("turnRedFlashWhenLow").innerHTML = '10s';
        turnTimer = 10;
        clearInterval(turnInterval);
        turnInterval = setInterval(updateTimer, 1000);
    }
    // Sector information
    else if (message.indexOf("sector::") === 0) {
        updateSectorInfo(message);
    }
    // Generic information
    else if (message.indexOf("info:") === 0) {
        updateSectorStatus(message);
    }
    // Update buildings
    else if (message.indexOf("ub:") === 0) {
        updateBuildings(message);
    }
    // Resources update
    else if (message.indexOf("resources::") === 0) {
        updateResources(message);
    }
    // Map state update (full map data)
    else if (message.indexOf("mapstate::") === 0) {
        updateMapState(message);
    }
    // Chat or other messages
    else {
        if (window.ChatSystem) {
            window.ChatSystem.displayMessage(message);
        }
    }
}

function updateBuildings(message) {
    const parts = message.split(':');
    if (parts.length < 7) return;
    
    // Parse building levels
    const buildings = {
        metalExtractor: parseInt(parts[1]) || 0,
        crystalRefinery: parseInt(parts[2]) || 0,
        researchAcademy: parseInt(parts[3]) || 0,
        spaceport: parseInt(parts[4]) || 0,
        orbitalTurret: parseInt(parts[5]) || 0,
        warpgate: parseInt(parts[6]) || 0
    };
    
    // Store in selected sector data
    if (GAME_STATE.selectedSectorData) {
        GAME_STATE.selectedSectorData.buildings = buildings;
    }
    
    // Update UI
    if (window.GameUI && window.GameUI.updateBuildings) {
        window.GameUI.updateBuildings(buildings);
    }
}

function updateSectorInfo(message) {
    const parts = message.split('::');
    if (parts.length < 3) return;

    const sectorId = parseInt(parts[1]);
    try {
        const data = JSON.parse(parts[2]);

        // Parse sector data
        const sectorData = {
            id: sectorId,
            owner: data.sector.owner,
            ownerid: data.sector.ownerid,
            type: data.sector.type || data.sector.sectortype,
            x: data.sector.x,
            y: data.sector.y,
            ships: data.ships || [],
            buildings: data.buildings || []
        };

        // Store in game state
        GAME_STATE.selectedSectorData = sectorData;
        GAME_STATE.selectedSector = sectorId;

        // Update minimap for this sector
        const playerId = getCookie('userId');
        let status = 'neutral';
        const sectorType = data.sector.sectortype || data.sector.type || 0;

        if (sectorType === 0 || sectorType === 10) {
            status = 'blackhole';
        } else if (sectorType === 1 || sectorType === 3) {
            status = 'hazard';
        } else if (data.sector.ownerid == playerId) {
            status = 'owned';
        } else if (data.sector.ownerid) {
            status = 'enemy';
        }

        // Calculate total fleet size for this player
        let fleetSize = 0;
        if (sectorData.ships && playerId) {
            sectorData.ships.forEach(s => {
                if (s.owner == playerId) {
                    fleetSize += (s.count || 1);
                }
            });
        }

        if (window.MiniMap && window.MiniMap.updateSector) {
            window.MiniMap.updateSector(sectorId, status, fleetSize, null);
        }

        // Update UI
        if (window.GameUI && window.GameUI.updateSectorDisplay) {
            window.GameUI.updateSectorDisplay(sectorData);
        }

        // Update ship counts
        if (window.GameUI && window.GameUI.updateFleetDisplay) {
            window.GameUI.updateFleetDisplay(sectorData.ships);
        }
    } catch (e) {
        console.error('Error parsing sector data:', e);
    }
}

function updateSectorStatus(message) {
    const parts = message.split(':');
    if (parts.length < 3) return;
    
    const sectorId = parseInt(parts[1], 16);
    const sectorType = parseInt(parts[2]);
    
    // Update map visualization
    if (window.GalaxyMap) {
        let status = window.GalaxyMap.SECTOR_STATUS.ENEMY;
        
        if (sectorType === 2) {
            status = window.GalaxyMap.SECTOR_STATUS.BLACKHOLE;
        } else if (sectorType === 1) {
            status = window.GalaxyMap.SECTOR_STATUS.HAZARD;
        }
        
        window.GalaxyMap.updateSectorStatus(sectorId, status);
    }
}

function updateResources(message) {
    const parts = message.split('::');
    if (parts.length < 4) return;
    
    // Parse resource values
    const resources = {
        metal: parseInt(parts[1]) || 0,
        crystal: parseInt(parts[2]) || 0,
        research: parseInt(parts[3]) || 0
    };
    
    // Capture previous resources BEFORE updating
    const previous = { ...GAME_STATE.player.resources };

    // Update game state with new resources
    GAME_STATE.player.resources = resources;

    // Update UI
    if (window.GameUI && window.GameUI.updateResources) {
        window.GameUI.updateResources(resources.metal, resources.crystal, resources.research);
    }

    // If we have a pending turn digest, emit it now that resources are updated
    if (pendingTurnDigest !== null) {
        // Calculate deltas: new resources minus previous resources
        const deltaMetal = resources.metal - (previous.metal || 0);
        const deltaCrystal = resources.crystal - (previous.crystal || 0);
        const deltaResearch = resources.research - (previous.research || 0);

        const lines = [
            `Metal: ${deltaMetal >= 0 ? '+' : ''}${deltaMetal}`,
            `Crystal: ${deltaCrystal >= 0 ? '+' : ''}${deltaCrystal}`,
            `Research: ${deltaResearch >= 0 ? '+' : ''}${deltaResearch}`
        ];

        if (window.NotificationSystem && window.NotificationSystem.notify) {
            window.NotificationSystem.notify(
                `Turn ${pendingTurnDigest} ready`,
                lines.join(' · '),
                "info",
                6000
            );
        }
        pushEventFeed(`Turn ${pendingTurnDigest}: ${lines.join(' · ')}`, 'econ');
        pendingTurnDigest = null;
    }

    lastResources = previous;
}

function emitTurnDigest(turnNumber) {
    if (!lastResources) return;
    const current = GAME_STATE.player.resources || {};
    const deltaMetal = (current.metal || 0) - (lastResources.metal || 0);
    const deltaCrystal = (current.crystal || 0) - (lastResources.crystal || 0);
    const deltaResearch = (current.research || 0) - (lastResources.research || 0);
    const lines = [
        `Metal: ${deltaMetal >= 0 ? '+' : ''}${deltaMetal}`,
        `Crystal: ${deltaCrystal >= 0 ? '+' : ''}${deltaCrystal}`,
        `Research: ${deltaResearch >= 0 ? '+' : ''}${deltaResearch}`
    ];
    if (window.NotificationSystem && window.NotificationSystem.notify) {
        window.NotificationSystem.notify(
            `Turn ${turnNumber} ready`,
            lines.join(' · '),
            "info",
            6000
        );
    }
    pushEventFeed(`Turn ${turnNumber}: ${lines.join(' · ')}`, 'econ');
}

function updateMapState(message) {
    // Format: mapstate::sectorId:status:fleetSize,sectorId:status:fleetSize,...
    const parts = message.split('::');
    if (parts.length < 2) return;

    // Map string status to GalaxyMap numeric status values
    const statusMap = {
        'neutral': 0,    // UNKNOWN
        'owned': 1,      // OWNED
        'enemy': 2,      // ENEMY
        'hazard': 3,     // HAZARD
        'blackhole': 4,  // BLACKHOLE
        'colonized': 5,  // COLONIZED
        'homeworld': 6,  // HOMEWORLD
        'warpgate': 7,   // WARPGATE
        'artifact': 8    // ARTIFACT
    };

    const sectorData = parts[1].split(',');
    sectorData.forEach(data => {
        const [sectorId, status, fleetSize] = data.split(':');
        const id = parseInt(sectorId, 10);
        const fleet = parseInt(fleetSize, 10) || 0;
        const numericStatus = statusMap[status] !== undefined ? statusMap[status] : 0;

        // Update minimap using GalaxyMap
        if (window.GalaxyMap && window.GalaxyMap.updateSectorStatus) {
            window.GalaxyMap.updateSectorStatus(id, numericStatus, { fleetSize: fleet });
        }
    });
}

function ensureEventPanel() {
    if (eventPanel) return eventPanel;
    eventPanel = document.createElement('div');
    eventPanel.id = 'event-panel';
    eventPanel.style.position = 'fixed';
    eventPanel.style.right = '16px';
    eventPanel.style.bottom = '80px';
    eventPanel.style.width = '340px';
    eventPanel.style.maxHeight = '42vh';
    eventPanel.style.overflowY = 'auto';
    eventPanel.style.background = 'rgba(12,16,33,0.9)';
    eventPanel.style.border = '1px solid rgba(255,255,255,0.08)';
    eventPanel.style.borderRadius = '12px';
    eventPanel.style.padding = '10px 10px 6px 10px';
    eventPanel.style.color = '#e8ecff';
    eventPanel.style.fontSize = '13px';
    eventPanel.style.boxShadow = '0 10px 30px rgba(0,0,0,0.45)';
    eventPanel.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
            <span>Recent events</span>
            <div id="event-filters" style="display:flex;gap:6px;">
                ${['all','battles','econ','orders','system'].map(f => `<button data-filter="${f}" style="padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:${eventFilter===f ? '#223455' : 'transparent'};color:#cfd7ff;cursor:pointer;font-size:11px;">${f}</button>`).join('')}
            </div>
        </div>
        <div id="event-feed-list"></div>`;
    document.body.appendChild(eventPanel);
    const filterBar = eventPanel.querySelector('#event-filters');
    if (filterBar) {
        filterBar.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                eventFilter = btn.getAttribute('data-filter');
                renderEventFeed();
            });
        });
    }
    return eventPanel;
}

function renderEventFeed() {
    ensureEventPanel();
    const list = document.getElementById('event-feed-list');
    if (!list) return;
    const filterBar = document.getElementById('event-filters');
    if (filterBar) {
        filterBar.querySelectorAll('button').forEach(btn => {
            btn.style.background = btn.getAttribute('data-filter') === eventFilter ? '#223455' : 'transparent';
        });
    }
    list.innerHTML = '';
    const filtered = eventEntries.filter(entry => eventFilter === 'all' || entry.type === eventFilter);
    filtered.slice(0, 18).forEach(entry => {
        const node = document.createElement('div');
        node.style.marginBottom = '6px';
        node.style.opacity = 0.95;
        node.textContent = entry.text;
        list.appendChild(node);
    });
}

function pushEventFeed(text, type = 'system') {
    eventEntries.unshift({ text, type, ts: Date.now() });
    if (eventEntries.length > 40) {
        eventEntries = eventEntries.slice(0, 40);
    }
    renderEventFeed();
}

function ensureCountdownOverlay() {
    if (countdownOverlay) return countdownOverlay;
    const wrapper = document.createElement('div');
    wrapper.id = 'countdown-overlay';
    wrapper.style.position = 'fixed';
    wrapper.style.top = '18px';
    wrapper.style.left = '50%';
    wrapper.style.transform = 'translateX(-50%)';
    wrapper.style.background = 'rgba(7,11,24,0.92)';
    wrapper.style.border = '1px solid rgba(255,255,255,0.1)';
    wrapper.style.borderRadius = '12px';
    wrapper.style.padding = '10px 16px';
    wrapper.style.display = 'none';
    wrapper.style.color = '#e8ecff';
    wrapper.style.boxShadow = '0 12px 30px rgba(0,0,0,0.35)';
    wrapper.style.zIndex = 2500;
    wrapper.innerHTML = `<div style="font-weight:700;">Match starting</div><div id="countdown-remaining" style="font-size:14px;">10s</div>`;
    document.body.appendChild(wrapper);
    countdownOverlay = wrapper;
    return countdownOverlay;
}

function hideCountdownOverlay(reason = '') {
    if (countdownOverlay) {
        countdownOverlay.style.display = 'none';
    }
    if (reason && window.NotificationSystem?.notify) {
        window.NotificationSystem.notify('Start cancelled', reason, 'warning', 4000);
    }
}

function handleCountdownMessage(payload) {
    const overlay = ensureCountdownOverlay();
    if (payload === 'cancel') {
        hideCountdownOverlay('A player left before launch.');
        pushEventFeed('Launch aborted.');
        return;
    }
    const remaining = parseInt(payload, 10);
    if (!Number.isFinite(remaining)) return;
    const label = document.getElementById('countdown-remaining');
    if (label) {
        label.textContent = `${remaining}s`;
    }
    overlay.style.display = 'flex';
    const turnLabel = document.getElementById("turnRedFlashWhenLow");
    if (turnLabel) {
        turnLabel.innerHTML = `${remaining}s`;
    }
    const nextTurnText = document.getElementById("nextTurnText");
    if (nextTurnText) {
        nextTurnText.innerHTML = 'Starting...';
    }
    if (remaining <= 0) {
        setTimeout(() => hideCountdownOverlay(), 1200);
    } else if (remaining === 10 && window.NotificationSystem?.notify) {
        window.NotificationSystem.notify('Match starting', 'Locking lobby — prepare to play.', 'info', 4000);
    }
}

// Standing orders UI removed for human players - AI players use server-side automation
function syncStandingOrdersUI() {
    // No-op: UI panel removed, keeping function stub for message handler compatibility
}

function formatShipSummary(map) {
    if (!map) return '—';
    const labels = {
        1: 'Frigate', 2: 'Destroyer', 3: 'Scout', 4: 'Cruiser',
        5: 'Battleship', 6: 'Colony', 7: 'Dread', 8: 'Intruder', 9: 'Carrier'
    };
    return Object.keys(map)
        .filter(k => map[k] > 0)
        .map(k => `${map[k]}× ${labels[k] || `Ship${k}`}`)
        .join(', ') || '—';
}

function showCombatReportModal(report) {
    if (!window.NotificationSystem?.modal) return;
    const attackerLabel = report.attackerName || (report.attackerId ? `Player ${report.attackerId}` : 'Attacker');
    const defenderLabel = report.defenderName || (report.defenderId ? `Player ${report.defenderId}` : 'Defender');
    const winnerLabel = report.winner || 'Unknown';
    const summary = Array.isArray(report.summary) ? report.summary : [];
    const survivors = report.survivors || {};

    const body = `
        <div style="margin-bottom:8px;font-weight:600;">Sector ${report.sector || '?'}</div>
        <div style="margin-bottom:6px;">Winner: <strong>${winnerLabel}</strong></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:10px;">
            <div style="background:rgba(255,255,255,0.04);padding:8px;border-radius:8px;">
                <div style="font-weight:600;margin-bottom:4px;">${attackerLabel}</div>
                <div>Remaining: ${formatShipSummary(survivors.attacker)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);padding:8px;border-radius:8px;">
                <div style="font-weight:600;margin-bottom:4px;">${defenderLabel}</div>
                <div>Remaining: ${formatShipSummary(survivors.defender)}</div>
            </div>
        </div>
        ${summary.length ? `<ul style="margin:0 0 6px 18px; padding:0;">${summary.map(s => `<li>${s}</li>`).join('')}</ul>` : '<div style="opacity:0.7;">No additional details.</div>'}
    `;

    const actions = [
        { label: 'Close', action: null }
    ];
    if (report.sector) {
        actions.push({
            label: 'Focus sector',
            action: () => changeSector(Number(report.sector).toString(16).toUpperCase())
        });
    }
    window.NotificationSystem.modal('Combat Report', body, actions);
}

function updateTechLevels(message) {
    const parts = message.split(':');
    if (parts.length < 5) return;

    // Format: tech:weapons:hulls:shields:engines
    const techLevels = {
        weapons: parseInt(parts[1]) || 0,
        hulls: parseInt(parts[2]) || 0,
        shields: parseInt(parts[3]) || 0,
        engines: parseInt(parts[4]) || 0
    };

    // Update game state
    GAME_STATE.player.techLevels = techLevels;

    // Update UI
    const tech1El = document.getElementById('tech1');
    const tech2El = document.getElementById('tech2');
    const tech3El = document.getElementById('tech3');
    const tech4El = document.getElementById('tech4');

    if (tech1El) tech1El.textContent = techLevels.weapons;
    if (tech2El) tech2El.textContent = techLevels.hulls;
    if (tech3El) tech3El.textContent = techLevels.shields;
    if (tech4El) tech4El.textContent = techLevels.engines;
}

function updateFleet(message) {
    const parts = message.split(':');
    if (parts.length < 13) return;
    
    // Parse fleet data
    const fleet = {
        ship1: parseInt(parts[1]) || 0,
        ship2: parseInt(parts[2]) || 0,
        ship3: parseInt(parts[3]) || 0,
        ship4: parseInt(parts[4]) || 0,
        ship5: parseInt(parts[5]) || 0,
        ship6: parseInt(parts[6]) || 0,
        ship7: parseInt(parts[7]) || 0,
        ship8: parseInt(parts[8]) || 0,
        ship9: parseInt(parts[9]) || 0,
        building1: parseInt(parts[10]) || 0,
        building2: parseInt(parts[11]) || 0,
        building3: parseInt(parts[12]) || 0,
        building4: parseInt(parts[13]) || 0,
        building5: parseInt(parts[14]) || 0,
        building6: parseInt(parts[15]) || 0,
        building7: parseInt(parts[16]) || 0,
        building8: parseInt(parts[17]) || 0,
        building9: parseInt(parts[18]) || 0
    };
    
    // Update UI
    if (window.GameUI && window.GameUI.updateFleet) {
        window.GameUI.updateFleet(fleet);
    }
}

function updateOwnedSector(message) {
    const parts = message.split(':');
    if (parts.length < 3) return;
    
    const sectorId = parseInt(parts[1], 16);
    const fleetSize = parseInt(parts[2]) || 0;
    const indicator = parts[3] || '';
    
    if (window.GameUI && window.GameUI.updateOwnedSector) {
        window.GameUI.updateOwnedSector(sectorId, fleetSize, indicator);
    }
}

function updatePlayerList(message) {
    const players = message.split(":");
    for (let i = 1; i < players.length; i++) {
        if (players[i]) {
            const playerNameElement = document.getElementById(`player${i}name`);
            if (playerNameElement) {
                playerNameElement.textContent = players[i];
            }
        }
    }
}

// Send multiple move fleet command
function sendmmf() {
    const sectorId = document.getElementById('sectorofattack').innerHTML;
    const shipList = document.getElementById('shipsFromNearBy');
    
    if (!sectorId || !shipList) return;
    
    let message = sectorId;
    let totalShips = 0;
    
    // Gather selected ships
    for (let i = 0; i < shipList.options.length; i++) {
        if (shipList.options[i].selected) {
            message += ":" + shipList.options[i].value;
            totalShips++;
        }
    }
    
    if (totalShips === 0) {
        alert("No ships selected");
        return;
    }
    
    // Send command to server
    websocket.send("//sendmmf:" + message);
    document.getElementById('multiMove').style.display = 'none';
}

let lastSectorRequest = null;
let lastSectorTime = 0;

function changeSector(sectorId) {
    // Debounce: prevent duplicate requests for the same sector within 100ms
    const now = Date.now();
    if (sectorId === lastSectorRequest && (now - lastSectorTime) < 100) {
        return;
    }
    lastSectorRequest = sectorId;
    lastSectorTime = now;

    // Request sector information from server
    websocket.send("//sector:" + sectorId);
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function navigateToLobby() {
    pendingLobbyRedirect = false;
    shouldAutoReconnect = false;
    if (reconnectTimerId) {
        clearTimeout(reconnectTimerId);
        reconnectTimerId = null;
    }
    if (lobbyRedirectFallbackId) {
        clearTimeout(lobbyRedirectFallbackId);
        lobbyRedirectFallbackId = null;
    }
    window.location.href = '/lobby.html';
}

function leaveCurrentGame() {
    if (lobbyRedirectFallbackId) {
        clearTimeout(lobbyRedirectFallbackId);
        lobbyRedirectFallbackId = null;
    }

    if (websocket && websocket.readyState === WebSocket.OPEN) {
        pendingLobbyRedirect = true;
        shouldAutoReconnect = false;
        const overlay = document.getElementById('lobbyWindow');
        if (overlay) {
            overlay.style.display = 'block';
        }
        websocket.send("//leavegame");
        lobbyRedirectFallbackId = setTimeout(() => {
            if (pendingLobbyRedirect) {
                navigateToLobby();
            }
        }, 2000);
    } else {
        navigateToLobby();
    }
}

// Export functions that need to be globally accessible
window.initializeWebSocket = initializeWebSocket;
window.nextTurn = nextTurn;
window.buyTech = buyTech;
window.buyShip = buyShip;
window.buyBuilding = buyBuilding;
window.sendmmf = sendmmf;
window.changeSector = changeSector;
window.leaveCurrentGame = leaveCurrentGame;

document.addEventListener('DOMContentLoaded', () => {
    // Standing orders panel removed - human players manage their empire manually
    // AI players use server-side automation instead
});
