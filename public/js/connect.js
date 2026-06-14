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
let awaitingAuth = false;
let hasAuthenticated = false;
let pendingInitialUpdate = false;
let turnTimer = 180; // 3 minutes per turn
let turnInterval;
let turnFrozen = false; // true while a battle theater is playing (clock paused for everyone)
let battleFreezeTimer = null;
let currentTurnNumber = null;
let currentGameModeLabel = 'Quick Match';
let lastResources = { metal: 0, crystal: 0, research: 0 };
let pendingTurnDigest = null; // Track pending turn for resource digest
let lastTurnDigest = [];
let eventPanel;
let countdownOverlay;
let standingOrdersState = { autoRebuild: false, autoScout: false, targetScouts: 2 }; // Kept for AI, UI removed for humans
let eventFilter = 'all';
let eventEntries = [];
let lastMapConfigReplayKey = null;
const MESSAGE_HANDLERS = {
    connectedCount(payload) {
        const el = document.getElementById("connected");
        if (el) el.textContent = payload || '-';
    },
    battle(payload) {
        const battle = parseBattlePayload(payload);
        const sectorLabel = battle.sectorId ? formatSectorLabel(battle.sectorId) : '';

        // Where does this viewer stand in this fight?
        const myId = Number(getCookie('userId'));
        let viewerRole = 'observer';
        if (Number.isFinite(myId)) {
            if (battle.attackerId === myId) viewerRole = 'attacker';
            else if (battle.defenderId === myId) viewerRole = 'defender';
        }
        // Did the viewer win? (null for observers.)
        let viewerWon = null;
        if (viewerRole !== 'observer' && battle.result) {
            const winnerRole = battle.result === 'att' ? 'attacker' : 'defender';
            viewerWon = viewerRole === winnerRole;
        }

        if (battle.sectorId && window.GalaxyMap?.markBattleSector) {
            window.GalaxyMap.markBattleSector(battle.sectorId, true);
        }
        if (battle.sectorId && window.GameScreen?.setTitle) {
            window.GameScreen.setTitle(`Battle in Sector ${sectorLabel}`, `Battle in Sector ${sectorLabel} - Game of Worlds`);
        }
        // Prefer the cinematic 3D theater; fall back to the 2D system when WebGL is absent.
        const theater = (window.Battle3D && window.Battle3D.isAvailable && window.Battle3D.isAvailable())
            ? window.Battle3D
            : window.BattleSystem;
        if (theater) {
            theater.createBattleVisualization(battle.message, {
                sectorId: battle.sectorId,
                sectorLabel,
                durationMs: window.__battlePauseMs || 0,
                battleResult: battle.result, // 'att' | 'def' | null — authoritative banner
                viewerRole,                  // 'attacker' | 'defender' | 'observer'
                viewerWon,                   // true | false | null
                planetType: battle.planetType || 0,
                onComplete: () => {
                    if (window.MediaManager?.playMusic) {
                        window.MediaManager.playMusic('peace');
                    }
                }
            });
        }
        // Start-of-battle alert, written from the viewer's point of view.
        if (window.NotificationSystem?.notify) {
            if (viewerRole === 'observer') {
                window.NotificationSystem.notify('Battle detected',
                    `Long-range sensors register a great battle near Sector ${sectorLabel}.`, 'info', 5000);
            } else {
                window.NotificationSystem.notify('Fleet engaged!',
                    `Your fleet has engaged the enemy in Sector ${sectorLabel}.`, 'warning', 6000);
            }
        }
        if (window.Advisor) {
            window.Advisor.say('battleStart', { sector: battle.sectorId });
        }
        if (window.MediaManager?.playMusic) {
            window.MediaManager.playMusic('battle');
        }
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx(viewerRole === 'observer' ? 'notification' : 'warp');
        }
    },
    battlePause(payload) {
        // Wire: `<freezeMs>::<playbackMs>` — freezeMs holds the turn clock (it
        // covers the theater PLUS a buffer so the world resumes only after playback
        // ends everywhere); playbackMs is the theater animation budget. Multiple
        // battles in one turn accumulate (played back-to-back), capped to the ceiling.
        const parts = String(payload).split('::');
        const freezeMs = Math.max(0, parseInt(parts[0], 10) || 0);
        const playbackMs = Math.max(0, parseInt(parts[1], 10) || freezeMs); // old single-value fallback
        window.__battlePauseMs = playbackMs;
        const now = Date.now();
        const base = (window.__battleFreezeUntil && window.__battleFreezeUntil > now) ? window.__battleFreezeUntil : now;
        window.__battleFreezeUntil = Math.min(base + freezeMs, now + 26000);
        turnFrozen = true;
        const el = document.getElementById('turnRedFlashWhenLow');
        if (el) { el.textContent = 'BATTLE'; el.style.color = '#ff8a6a'; }
        clearTimeout(battleFreezeTimer);
        battleFreezeTimer = setTimeout(() => {
            turnFrozen = false;
            window.__battlePauseMs = 0;
            window.__battleFreezeUntil = 0;
            renderTurnTimer();
        }, Math.max(1, window.__battleFreezeUntil - now));
    },
    battleSummary(payload) {
        const summary = parseBattleSummaryPayload(payload);
        const sectorLabel = formatSectorLabel(summary.sectorId);
        const title = `Battle in Sector ${sectorLabel}`;
        const detail = `Limited telemetry: winner ${summary.winnerId || 'unknown'}, losses ${summary.attackerLosses || 0}/${summary.defenderLosses || 0}.`;

        if (summary.sectorId && window.GalaxyMap?.markBattleSector) {
            window.GalaxyMap.markBattleSector(summary.sectorId, true);
            setTimeout(() => {
                if (window.GalaxyMap?.clearBattleSector) {
                    window.GalaxyMap.clearBattleSector(summary.sectorId);
                }
                if (window.GalaxyMap?.highlightSector) {
                    window.GalaxyMap.highlightSector(summary.sectorId);
                }
                if (window.GameScreen?.restoreTitle) {
                    window.GameScreen.restoreTitle();
                }
            }, 10000);
        }
        if (window.GameScreen?.setTitle) {
            window.GameScreen.setTitle(title, `${title} - Game of Worlds`);
        }
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify("Battle summary", `${detail} ${summary.reason}`.trim(), "info", 7000);
        }
        renderBattleSummaryCard(summary, title, detail);
        pushEventFeed(`${title}: ${detail} ${summary.reason}`.trim(), 'battles');
        // Stealth/summary viewers don't see the theater but the game is still
        // frozen for them — give them the battle score so the pause feels intentional.
        if (window.MediaManager?.playMusic) {
            window.MediaManager.playMusic('battle');
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
        if (window.GalaxyMap?.clearBattleSector && sector) {
            window.GalaxyMap.clearBattleSector(sector);
        }
        if (window.GalaxyMap?.highlightSector && sector) {
            window.GalaxyMap.highlightSector(sector);
        }
        if (window.GameScreen?.setTitle && sector) {
            window.GameScreen.setTitle(`Battle Resolved: Sector ${formatSectorLabel(sector)}`, `Battle Resolved: Sector ${formatSectorLabel(sector)} - Game of Worlds`);
        }
        showCombatReportModal(report);
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('explosion');
        }
    },
    gameover(payload) {
        const parts = payload.split("::");
        const winnerId = parseInt(parts[0], 10);
        const hasWinner = Number.isFinite(winnerId);
        const reason = safeDecodeURIComponent(parts[1] || "Victory condition met");
        if (window.Battle3D?.cleanupBattleVisualization) {
            window.Battle3D.cleanupBattleVisualization();
        }
        if (window.BattleSystem?.cleanupBattleVisualization) {
            window.BattleSystem.cleanupBattleVisualization();
        }
        renderGameOverModal(winnerId, reason);
        if (window.NotificationSystem?.notify) {
            const message = hasWinner
                ? `Player ${winnerId} wins (${reason}).`
                : `Game ended: ${reason}.`;
            window.NotificationSystem.notify("Game Over", message, hasWinner ? "success" : "info", 8000);
        } else {
            alert(hasWinner
                ? `Game over! Player ${winnerId} wins! Reason: ${reason}`
                : `Game over! ${reason}`);
        }
        pushEventFeed(hasWinner
            ? `Game over: Player ${winnerId} wins (${reason}).`
            : `Game over: ${reason}.`, 'system');
        const iWon = Number(winnerId) === Number(getCookie('userId'));
        if (hasWinner && window.MediaManager?.playMusic) {
            window.MediaManager.playMusic(iWon ? 'victory' : 'defeat');
        }
        if (hasWinner && window.Advisor) {
            window.Advisor.say(iWon ? 'gameWon' : 'gameLost');
        }
    }
};

function parseBattlePayload(payload) {
    const hexSector = tok => {
        const decimal = parseInt(tok, 16);
        return Number.isFinite(decimal) ? decimal : tok;
    };

    // Full header: battle::<sectorHex>::<att|def>::<attackerId>::<defenderId>::<planetType>::battle:...
    const full = /^battle::([^:]+)::(att|def)::(\d+)::(\d+)::(\d+)::(battle:.*)$/i.exec(payload);
    if (full) {
        return {
            sectorId: hexSector(full[1]),
            result: full[2].toLowerCase(),
            attackerId: Number(full[3]),
            defenderId: Number(full[4]),
            planetType: Number(full[5]),
            message: full[6]
        };
    }

    // Back-compat: side only — battle::<sectorHex>::<att|def>::battle:...
    const withResult = /^battle::([^:]+)::(att|def)::(battle:.*)$/i.exec(payload);
    if (withResult) {
        return {
            sectorId: hexSector(withResult[1]),
            result: withResult[2].toLowerCase(),
            attackerId: null, defenderId: null, planetType: 0,
            message: withResult[3]
        };
    }

    // Back-compat: bare scope — battle::<sectorHex>::battle:...
    const scopedMatch = /^battle::([^:]+)::(battle:.*)$/i.exec(payload);
    if (scopedMatch) {
        return {
            sectorId: hexSector(scopedMatch[1]),
            result: null, attackerId: null, defenderId: null, planetType: 0,
            message: scopedMatch[2]
        };
    }

    return { sectorId: null, result: null, attackerId: null, defenderId: null, planetType: 0, message: payload };
}

function parseBattleSummaryPayload(payload) {
    const parts = payload.split("::");
    const sectorDecimal = parseInt(parts[0], 16);
    return {
        sectorId: Number.isFinite(sectorDecimal) ? sectorDecimal : (parts[0] || null),
        reason: safeDecodeURIComponent(parts[1] || ''),
        winnerId: parts[2] || '',
        attackerLosses: Number.parseInt(parts[3], 10) || 0,
        defenderLosses: Number.parseInt(parts[4], 10) || 0,
        forceRatio: Number.parseFloat(parts[5]) || 0,
        result: parts[6] || ''
    };
}

function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value;
    }
}

// Human-facing sector labels are decimal everywhere (map tiles, panel,
// messages); hex tokens only ever travel on the wire.
function formatSectorLabel(value) {
    if (value === null || value === undefined || value === '') return '?';
    const text = String(value).trim();
    const number = /[a-f]/i.test(text) ? parseInt(text, 16) : parseInt(text, 10);
    return Number.isFinite(number) ? String(number) : text.toUpperCase();
}

// Parse a sector reference that may be a hex wire token or a decimal label.
function parseSectorRef(value) {
    const text = String(value ?? '').trim();
    if (!text) return NaN;
    return /[a-f]/i.test(text) ? parseInt(text, 16) : parseInt(text, 10);
}

function renderBattleSummaryCard(summary, title, detail) {
    const existing = document.getElementById('battleSummaryCard');
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
    }

    const card = document.createElement('aside');
    card.id = 'battleSummaryCard';
    const resultClass = String(summary.result || 'unknown').replace(/[^a-z0-9_-]/gi, '');
    card.className = `battle-summary-card ${resultClass || 'unknown'}`;
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');
    card.innerHTML = `
        <button class="battle-summary-close" type="button" aria-label="Dismiss battle summary">&times;</button>
        <div class="battle-summary-eyebrow">Battle Summary</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(detail)}</p>
        ${summary.reason ? `<p class="battle-summary-reason">${escapeHtml(summary.reason)}</p>` : ''}
        <div class="battle-summary-stats">
            <span>Attacker losses: ${summary.attackerLosses || 0}</span>
            <span>Defender losses: ${summary.defenderLosses || 0}</span>
            <span>Force ratio: ${(summary.forceRatio || 0).toFixed(2)}</span>
        </div>
    `;
    card.querySelector('.battle-summary-close')?.addEventListener('click', () => card.remove());
    document.body.appendChild(card);
}

function renderGameOverModal(winnerId, reason) {
    const existing = document.getElementById('gameOverModal');
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
    }

    const hasWinner = Number.isFinite(Number(winnerId));
    const iWon = hasWinner && Number(winnerId) === Number(getCookie('userId'));
    const isGuest = localStorage.getItem('gowIsGuest') === '1';
    const guestPrompt = isGuest
        ? '<p class="game-over-guest-prompt">Register this guest commander to protect your progress before clearing browser storage or switching devices.</p>'
        : '';
    const title = hasWinner ? (iWon ? 'Victory' : 'Defeat') : 'Game Ended';
    const body = hasWinner
        ? `Player ${winnerId} won. ${reason || 'Completed'}.`
        : `No winner was recorded. ${reason || 'Completed'}.`;
    const modal = document.createElement('div');
    modal.id = 'gameOverModal';
    modal.className = 'game-over-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="game-over-card">
            <div class="game-over-eyebrow">Game Complete</div>
            <h2 id="gameOverTitle">${escapeHtml(title)}</h2>
            <p id="gameOverBody">${escapeHtml(body)}</p>
            ${guestPrompt}
            <div class="game-over-actions">
                ${isGuest ? '<button type="button" id="gameOverRegisterBtn" class="primary">Register to Save</button>' : ''}
                <button type="button" id="gameOverLobbyBtn" class="primary">Return to Lobby</button>
                <button type="button" id="gameOverStayBtn" class="ghost">Stay Here</button>
            </div>
        </div>
    `;
    modal.querySelector('#gameOverRegisterBtn')?.addEventListener('click', () => {
        window.location.href = '/login.html?upgrade=1';
    });
    modal.querySelector('#gameOverLobbyBtn')?.addEventListener('click', navigateToLobby);
    modal.querySelector('#gameOverStayBtn')?.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    document.body.appendChild(modal);
}

function renderProbeSuggestionCard(title, body, onProbe) {
    const existing = document.getElementById('probeSuggestionCard');
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
    }

    const card = document.createElement('aside');
    card.id = 'probeSuggestionCard';
    card.className = 'probe-suggestion-card';
    card.innerHTML = `
        <button class="probe-suggestion-close" type="button" aria-label="Dismiss probe suggestion">&times;</button>
        <div class="probe-suggestion-eyebrow">Optional Scan</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
        <div class="probe-suggestion-actions">
            <button class="primary" type="button" id="probeSuggestionSend">Send Probe</button>
            <button class="ghost" type="button" id="probeSuggestionDismiss">Move / Ignore</button>
        </div>
    `;
    const close = () => card.remove();
    card.querySelector('.probe-suggestion-close')?.addEventListener('click', close);
    card.querySelector('#probeSuggestionDismiss')?.addEventListener('click', close);
    card.querySelector('#probeSuggestionSend')?.addEventListener('click', () => {
        close();
        onProbe();
    });
    document.body.appendChild(card);
}

// Render probe intel (spy ladder results) into the sector panel + a notification.
function renderSectorIntel(sectorId, intel) {
    const lines = [];
    if (intel.note) {
        lines.push(`<div style="color:#ffb86b;">${escapeHtml(intel.note)}</div>`);
    }
    if (Number.isFinite(Number(intel.advantage)) && intel.advantage !== null) {
        const adv = Number(intel.advantage);
        const tone = adv > 0 ? '#7ee787' : (adv < 0 ? '#ff7b72' : '#cfd7ff');
        lines.push(`<div>Spy advantage: <b style="color:${tone};">${adv > 0 ? '+' : ''}${adv}</b></div>`);
    }
    if (intel.ownerResources) {
        const r = intel.ownerResources;
        lines.push(`<div>Enemy ledgers: ${Math.floor(r.metal)}M · ${Math.floor(r.crystal)}C · ${Math.floor(r.research)}R</div>`);
    }
    if (intel.ownerTech && window.TechSystem?.getTechnology) {
        const techs = Object.entries(intel.ownerTech)
            .map(([id, level]) => {
                const tech = window.TechSystem.getTechnology(id);
                return tech ? `${tech.name} ${level}` : null;
            })
            .filter(Boolean);
        if (techs.length) {
            lines.push(`<div>Enemy research: ${escapeHtml(techs.join(', '))}</div>`);
        }
    }
    if (!lines.length) {
        lines.push('<div>Probe scan complete - sector details updated.</div>');
    }

    const box = document.getElementById('sectorIntel');
    if (box) {
        box.innerHTML = `<div style="font-weight:700;color:#d65db1;margin-bottom:4px;">Probe Intel - Sector ${sectorId}</div>${lines.join('')}`;
        box.style.display = 'block';
    }
    if (window.NotificationSystem?.notify) {
        const summary = lines.map(line => line.replace(/<[^>]+>/g, '')).join(' ');
        window.NotificationSystem.notify(`Probe intel: sector ${sectorId}`, summary, 'info', 7000);
    }
}

// Game state
const GAME_STATE = {
    player: {
        resources: {
            metal: 0,
            crystal: 0,
            research: 0
        },
        techLevels: {},
        homeworld: null
    },
    selectedSector: null,
    selectedSectorData: null,
    mapSectors: {},
    empire: null
};

function setNextTurnButtonLabel(label) {
    const nextTurnText = document.getElementById("nextTurnText");
    if (nextTurnText) {
        nextTurnText.textContent = label;
    }
}

function renderTurnHeader() {
    const modeLabel = document.getElementById('gameModeLabel');
    if (!modeLabel) {
        return;
    }
    modeLabel.textContent = currentTurnNumber
        ? `${currentGameModeLabel} - Turn ${currentTurnNumber}`
        : currentGameModeLabel;
}

function setGameModeLabel(mode) {
    currentGameModeLabel = mode === 'epic' ? 'Epic Campaign' : 'Quick Match';
    renderTurnHeader();
}

function renderTurnTimer() {
    const timerEl = document.getElementById("turnRedFlashWhenLow");
    if (!timerEl) {
        return;
    }

    if (turnTimer <= 0) {
        timerEl.textContent = 'syncing';
        timerEl.style.color = "#ffd3a8";
    } else {
        timerEl.textContent = `${turnTimer}s`;
        timerEl.style.color = turnTimer < 30 && turnTimer % 2 === 0 ? "#FF0000" : "#ffd3a8";
    }
}

// Update timer display
function updateTimer() {
    // Battle theater on screen: the turn clock is paused for everyone.
    if (turnFrozen) {
        return;
    }
    if (turnTimer > 0) {
        turnTimer = turnTimer - 1;
    }
    renderTurnTimer();
}

function beginTurnCountdown(turnNumber, seconds = 180) {
    currentTurnNumber = Number.parseInt(turnNumber, 10) || currentTurnNumber || 1;
    turnTimer = Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? Number(seconds) : 180;
    setNextTurnButtonLabel('End Turn');
    clearInterval(turnInterval);
    renderTurnHeader();
    renderTurnTimer();
    turnInterval = setInterval(updateTimer, 1000);
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
        awaitingAuth = true;
        hasAuthenticated = false;
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
        window.websocket = websocket;
        if (window.Onboarding?.attach) {
            window.Onboarding.attach(websocket);
        }
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
        pendingInitialUpdate = window.location.pathname.includes('game.html');
        if (window.NotificationSystem && typeof window.NotificationSystem.initialize === 'function') {
            window.NotificationSystem.initialize();
        }
        
        // Auto-authenticate if credentials exist
        if (!authUser()) {
            pendingInitialUpdate = false;
        }
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
        awaitingAuth = false;
        hasAuthenticated = false;
        pendingInitialUpdate = false;
        if (!pendingLobbyRedirect) {
            document.getElementById("lobbyWindow").style.display = "block";
        }
        
        // Auto-reconnect after delay if needed
        scheduleReconnect();
    };
}

function isAuthSuccessMessage(message) {
    return message === "lobby::" ||
        message.indexOf("currentgame::") === 0 ||
        message === "The game has yet to begin. Welcome." ||
        message.indexOf("You have re-connected") === 0 ||
        message.indexOf("resources::") === 0 ||
        message.indexOf("techstate::") === 0 ||
        message.indexOf("empire::") === 0 ||
        message.indexOf("victoryprogress::") === 0 ||
        message.indexOf("sector::") === 0 ||
        message.indexOf("pl:") === 0 ||
        message.indexOf("gamelist::") === 0 ||
        message.indexOf("races::") === 0;
}

function markAuthenticatedFromMessage(message) {
    if (!awaitingAuth || hasAuthenticated || !isAuthSuccessMessage(message)) {
        return;
    }

    awaitingAuth = false;
    hasAuthenticated = true;
    flushAuthenticatedCommands();
}

function flushAuthenticatedCommands() {
    if (!pendingInitialUpdate) {
        return;
    }
    pendingInitialUpdate = false;
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send("//update");
        websocket.send("//victoryprogress");
    }
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
    if (window.Onboarding?.observe) {
        window.Onboarding.observe(message);
    }

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
    markAuthenticatedFromMessage(message);
    if (message.indexOf("currentgame::") === 0) {
        const rawSnapshot = message.replace("currentgame::", "");
        if (rawSnapshot && rawSnapshot !== 'null') {
            try {
                const snapshot = JSON.parse(rawSnapshot);
                if (snapshot.raceId && window.Advisor) {
                    window.Advisor.setRace(snapshot.raceId);
                }
                if (snapshot.mode) {
                    setGameModeLabel(snapshot.mode);
                }
                if (snapshot.started && window.SoundSystem?.playContextualMusic) {
                    window.SoundSystem.playContextualMusic('game');
                }
                if (snapshot.started) {
                    beginTurnCountdown(snapshot.turn || currentTurnNumber || 1);
                } else {
                    setNextTurnButtonLabel('Start Game');
                    currentTurnNumber = null;
                    renderTurnHeader();
                    renderTurnTimer();
                }
            } catch (err) {
                // snapshot parse failure is non-fatal
            }
        }
        return;
    }
    if (message === "The game has yet to begin. Welcome." || message.indexOf("You have re-connected") === 0) {
        return;
    }
    // Battle information
    if (message.indexOf("battle_summary::") === 0) {
        return MESSAGE_HANDLERS.battleSummary(message.replace("battle_summary::", ""));
    }
    if (message.indexOf("battlepause::") === 0) {
        return MESSAGE_HANDLERS.battlePause(message.replace("battlepause::", ""));
    }
    if (message.indexOf("battle::") === 0 || message.indexOf("battle:") === 0) {
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
        const lobbyWindow = document.getElementById("lobbyWindow");
        if (lobbyWindow) {
            lobbyWindow.style.display = "none";
        }
        const gameWindow = document.getElementById("gameWindow");
        if (gameWindow) {
            gameWindow.style.display = "block";
        }

        // Initialize game UI
        if (window.GameUI && window.GameUI.initialize) {
            window.GameUI.initialize();
        }

        // Exploration underway: switch from menu music to the campaign theme.
        if (window.SoundSystem?.playContextualMusic) {
            window.SoundSystem.playContextualMusic('game');
        }

        // Request initial game state
        beginTurnCountdown(currentTurnNumber || 1);
        websocket.send("//update");
        websocket.send("//victoryprogress");
    }
    // Max build notification
    else if (message.indexOf("maxbuild::") === 0) {
        const buildingType = message.split("::")[1];
        const buildingButtonIndex = (Number.parseInt(buildingType, 10) || 0) + 1;
        const buildingBtn = document.getElementById(`bb${buildingButtonIndex}`);
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
        const numericSectorId = parseInt(sectorId, 16);
        const knownState = GAME_STATE.mapSectors[numericSectorId];
        const sectorLabel = Number.isFinite(numericSectorId)
            ? String(numericSectorId)
            : sectorId;
        const staleMemory = knownState && knownState.seen && !knownState.live;
        const title = staleMemory ? `Stale intel: Sector ${sectorLabel}` : `Unknown Sector ${sectorLabel}`;
        const body = staleMemory
            ? 'You only have old memory here. Send a probe to refresh live intel, or move ships there from the fleet menu if you want to risk exploration.'
            : 'Long-range sensors cannot see in. Launch a probe to scan it? (300 Crystal; probes can be lost to hazards or counter-intelligence.)';
        const sendProbe = () => websocket.send("//probe:" + sectorId);
        renderProbeSuggestionCard(title, body, sendProbe);
        if (typeof window.NotificationSystem?.notify === 'function') {
            window.NotificationSystem.notify(title, 'Probe scan is optional; fleet movement remains available if ships are nearby.', 'info', 5000);
        }
        return;
    }
    // Multiple move options
    else if (message.indexOf("mmoptions:") === 0) {
        if (window.GameUI && window.GameUI.showMultiMoveOptions) {
            const parts = message.split(':');
            const targetSector = parts[1];
            const shipsData = parts.slice(2).join(':');
            window.GameUI.showMultiMoveOptions(targetSector, shipsData);
        }
    }
    // New turn
    else if (message.indexOf("newturn::") === 0) {
        const turnNumber = message.split("::")[1];
        beginTurnCountdown(turnNumber);
        if (window.MediaManager?.playSfx) {
            window.MediaManager.playSfx('notification');
        }
        // Mark that we have a pending turn digest - will emit when resources arrive
        pendingTurnDigest = turnNumber;
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send("//victoryprogress");
        }
    }
    // New round (legacy)
    else if (message === "newround:") {
        beginTurnCountdown(currentTurnNumber || 1);
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
    else if (message.indexOf("techstate::") === 0) {
        updateTechState(message);
    }
    else if (message.indexOf("empire::") === 0) {
        updateEmpireSummary(message);
    }
    else if (message.indexOf("victoryprogress::") === 0) {
        updateVictoryProgress(message);
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
    // Map dimensions update
    else if (message.indexOf("mapconfig::") === 0) {
        updateMapConfig(message);
    }
    // Map state update (full map data)
    else if (message.indexOf("mapstate::") === 0) {
        updateMapState(message);
    }
    // Fleet movement broadcast (visible to everyone with sensor coverage)
    else if (message.indexOf("fleetmove::") === 0) {
        handleFleetMove(message);
    }
    // Chat or other messages
    else {
        updateMapFromPlainTextMessage(message);
        if (window.Advisor) {
            window.Advisor.observe(message);
        }
        if (window.ChatSystem) {
            window.ChatSystem.displayMessage(message);
        }
    }
}

function updateMapFromPlainTextMessage(message) {
    const battleReport = /Battle report:\s+(?:Victory|Defeat)\s+in sector\s+([0-9a-f]+)/i.exec(message);
    const sectorCapture = battleReport || /(?:Victory|Defeat)!.*sector\s+([0-9a-f]+)/i.exec(message);
    if (!sectorCapture) return;

    // Battle reports now use decimal sector numbers; old ones used hex tokens.
    const sector = parseSectorRef(sectorCapture[1]);
    if (!Number.isFinite(sector)) return;
    if (window.GalaxyMap?.clearBattleSector) {
        window.GalaxyMap.clearBattleSector(sector);
    }
    if (window.GalaxyMap?.highlightSector) {
        window.GalaxyMap.highlightSector(sector);
    }
    if (window.GameScreen?.setTitle) {
        window.GameScreen.setTitle(`Battle Resolved: Sector ${sector}`, `Battle Resolved: Sector ${sector} - Game of Worlds`);
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
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

function getBuildingCounts(buildings) {
    const counts = {
        metalExtractor: 0,
        crystalRefinery: 0,
        researchAcademy: 0,
        spaceport: 0,
        orbitalTurret: 0,
        warpgate: 0
    };

    const assignCount = (type, count = 1) => {
        const numericType = Number(type);
        const numericCount = Number(count) || 0;
        if (numericCount <= 0) return;
        switch (numericType) {
            case 0: counts.metalExtractor += numericCount; break;
            case 1: counts.crystalRefinery += numericCount; break;
            case 2: counts.researchAcademy += numericCount; break;
            case 3: counts.spaceport += numericCount; break;
            case 4: counts.orbitalTurret += numericCount; break;
            case 5: counts.warpgate += numericCount; break;
        }
    };

    if (Array.isArray(buildings)) {
        buildings.forEach(building => assignCount(building && building.type, building && building.count ? building.count : 1));
    } else if (buildings && typeof buildings === 'object') {
        Object.entries(buildings).forEach(([type, count]) => assignCount(type, count));
    }

    return counts;
}

function updateSectorInfo(message) {
    const parts = message.split('::');
    if (parts.length < 3) return;

    const sectorId = parseInt(parts[1]);
    try {
        const data = JSON.parse(parts[2]);
        const rawSector = data.sector || {};
        const sectorType = Number(rawSector.type ?? rawSector.sectortype ?? 0);
        const ownerId = rawSector.owner ?? rawSector.ownerid ?? null;
        const metalBonus = Number(rawSector.metalBonus ?? rawSector.metalbonus ?? 100);
        const crystalBonus = Number(rawSector.crystalBonus ?? rawSector.crystalbonus ?? 100);
        const terraformLevel = Number(rawSector.terraformLevel ?? rawSector.terraformlvl ?? 0);

        // Parse sector data
        const sectorData = {
            id: sectorId,
            owner: ownerId,
            ownerid: ownerId,
            type: sectorType,
            x: rawSector.x,
            y: rawSector.y,
            metalBonus: Number.isFinite(metalBonus) ? metalBonus : 100,
            crystalBonus: Number.isFinite(crystalBonus) ? crystalBonus : 100,
            terraformLevel: Number.isFinite(terraformLevel) ? terraformLevel : 0,
            ships: data.ships || [],
            buildings: data.buildings || []
        };

        const playerId = getCookie('userId');
        const numericOwnerId = Number(ownerId);
        const numericPlayerId = Number(playerId);
        const selectedFromMap = Number(window.GalaxyMap?.getSelectedSector?.() || GAME_STATE.selectedSector || 0);
        const isMyHomeworld = sectorType === 10 && numericOwnerId && numericOwnerId === numericPlayerId;
        const shouldFocusPanel = selectedFromMap === sectorId || (!GAME_STATE.selectedSector && isMyHomeworld);

        GAME_STATE.mapSectors[sectorId] = {
            ...(GAME_STATE.mapSectors[sectorId] || {}),
            id: sectorId,
            status: isMyHomeworld ? 'homeworld' : undefined,
            type: sectorType,
            live: true,
            seen: true
        };

        if (shouldFocusPanel) {
            GAME_STATE.selectedSectorData = sectorData;
            GAME_STATE.selectedSector = sectorId;
            if (window.Galaxy3D && window.Galaxy3D.setSectorDetail) {
                window.Galaxy3D.setSectorDetail(sectorData);
            }
        }

        // Probe intel report (spy ladder results travel with probed sector data)
        if (data.intel) {
            renderSectorIntel(sectorId, data.intel);
        } else if (shouldFocusPanel) {
            const intelBox = document.getElementById('sectorIntel');
            if (intelBox) intelBox.style.display = 'none';
        }

        // Update minimap for this sector
        let status = 'neutral';

        if (sectorType === 2) {
            status = 'blackhole';
        } else if (sectorType === 1 || sectorType === 3) {
            status = 'hazard';
        } else if (numericOwnerId && numericOwnerId === numericPlayerId) {
            status = sectorType === 10 ? 'homeworld' : 'owned';
        } else if (numericOwnerId) {
            status = 'enemy';
        } else if (sectorType === 10) {
            status = 'homeworld';
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

        if (window.GalaxyMap && window.GalaxyMap.updateSectorStatus) {
            const statusMap = {
                neutral: window.GalaxyMap.SECTOR_STATUS.UNKNOWN,
                owned: window.GalaxyMap.SECTOR_STATUS.OWNED,
                enemy: window.GalaxyMap.SECTOR_STATUS.ENEMY,
                hazard: window.GalaxyMap.SECTOR_STATUS.HAZARD,
                blackhole: window.GalaxyMap.SECTOR_STATUS.BLACKHOLE,
                colonized: window.GalaxyMap.SECTOR_STATUS.COLONIZED,
                homeworld: window.GalaxyMap.SECTOR_STATUS.HOMEWORLD
            };
            window.GalaxyMap.updateSectorStatus(
                sectorId,
                statusMap[status] ?? window.GalaxyMap.SECTOR_STATUS.UNKNOWN,
                {
                    owner: ownerId,
                    fleetSize,
                    buildings: sectorData.buildings,
                    indicator: numericOwnerId && numericOwnerId === numericPlayerId ? 'C' : null
                }
            );
        }

        // Update UI
        if (shouldFocusPanel && window.GameUI && window.GameUI.updateSectorDisplay) {
            window.GameUI.updateSectorDisplay(sectorData);
        }

        if (shouldFocusPanel && window.GameUI && window.GameUI.updateBuildings) {
            window.GameUI.updateBuildings(getBuildingCounts(sectorData.buildings));
        }

        // Update ship counts
        if (shouldFocusPanel && window.GameUI && window.GameUI.updateFleetDisplay) {
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
    renderTechTree();

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

function updateMapConfig(message) {
    const parts = message.split('::');
    const width = parseInt(parts[1], 10);
    const height = parseInt(parts[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return;
    }
    const replayKey = `${width}x${height}`;
    if (window.GalaxyMap && window.GalaxyMap.initialize) {
        window.GalaxyMap.initialize(width, height, 'minimapid');
    }
    if (replayKey !== lastMapConfigReplayKey && websocket && websocket.readyState === WebSocket.OPEN) {
        lastMapConfigReplayKey = replayKey;
        setTimeout(() => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send('//update');
            }
        }, 100);
    }
}

function updateMapState(message) {
    // Format: mapstate::sectorId:status:fleetSize:sectorType:live:flags,...
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
        'artifact': 8,   // ARTIFACT
        'fleet': 9       // FLEET - your ships hold an unclaimed sector
    };

    const sectorData = parts[1] ? parts[1].split(',') : [];
    sectorData.forEach(data => {
        const [sectorId, status, fleetSize, sectorType, liveFlag, flagsRaw] = data.split(':');
        const id = parseInt(sectorId, 10);
        if (!Number.isFinite(id)) return;
        const fleet = parseInt(fleetSize, 10) || 0;
        const numericStatus = statusMap[status] !== undefined ? statusMap[status] : 0;
        const flags = parseInt(flagsRaw, 10) || 0;
        const live = liveFlag !== '0';
        const details = {
            fleetSize: fleet,
            live,
            flags,
            indicator: mapFlagsToIndicator(flags, status)
        };
        const parsedType = parseInt(sectorType, 10);
        if (Number.isFinite(parsedType)) {
            details.type = parsedType;
        }

        GAME_STATE.mapSectors[id] = {
            id,
            status,
            fleetSize: fleet,
            type: Number.isFinite(parsedType) ? parsedType : null,
            live,
            flags,
            seen: true
        };
        if (flags & 1) {
            GAME_STATE.player.homeworld = id;
        }

        // Update minimap + 3D galaxy view
        if (window.GalaxyMap && window.GalaxyMap.updateSectorStatus) {
            window.GalaxyMap.updateSectorStatus(id, numericStatus, details);
        }
    });
}

function handleFleetMove(message) {
    const parts = message.split('::');
    if (parts.length < 5) return;
    const from = parseSectorRef(parts[1]);
    const to = parseSectorRef(parts[2]);
    const ownerId = Number(parts[3]);
    const count = Number(parts[4]) || 0;
    const viaWarpGate = parts[5] === '1';
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    const mine = ownerId === Number(getCookie('userId'));
    if (typeof g3dCall === 'function') {
        g3dCall('animateFleetMove', from, to, { mine, count, warp: viaWarpGate });
    }
    if (window.GalaxyMap?.flashSector) {
        window.GalaxyMap.flashSector(to, mine ? '#66d9ff' : '#ff6b6b');
    }
    if (!mine) {
        const text = `Enemy fleet (${count} ship${count === 1 ? '' : 's'}) moved from sector ${from} to ${to}${viaWarpGate ? ' via warp gate' : ''}.`;
        pushEventFeed(text, 'battles');
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify('Enemy fleet movement', text, 'warning', 6000);
        }
    }
}

function mapFlagsToIndicator(flags, status) {
    const labels = [];
    if ((flags & 1) || status === 'homeworld') labels.push('H');
    if (flags & 4) labels.push('C');
    if (flags & 2) labels.push('T');
    if (flags & 8) labels.push('W');
    if (flags & 16) labels.push('E');
    return labels.join('');
}

function focusHomeworld() {
    const homeworld = Number(GAME_STATE.player.homeworld);
    if (!Number.isFinite(homeworld) || homeworld <= 0) {
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify('Homeworld unknown', 'Homeworld data has not arrived yet.', 'warning', 3000);
        }
        return;
    }
    if (window.GalaxyMap?.selectSector) {
        window.GalaxyMap.selectSector(homeworld);
    } else {
        changeSector(homeworld.toString(16).toUpperCase());
    }
}

function colonizeSelectedSector() {
    const selected = Number(window.GalaxyMap?.getSelectedSector?.() || GAME_STATE.selectedSector);
    const suffix = Number.isFinite(selected) && selected > 0
        ? `:${selected.toString(16).toUpperCase()}`
        : '';
    const multiMove = document.getElementById('multiMove');
    if (multiMove) {
        multiMove.style.display = 'none';
    }
    websocket.send(`//colonize${suffix}`);
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

function renderTechTree() {
    const root = document.getElementById('techTreeRoot');
    const techSystem = window.TechSystem;
    if (!root || !techSystem || typeof techSystem.listByBranch !== 'function') return;

    const levels = GAME_STATE.player.techLevels || {};
    const research = Number(GAME_STATE.player.resources.research) || 0;
    const access = GAME_STATE.player.raceAccess || {};
    const researchEl = document.getElementById('techResearchAvailable');
    if (researchEl) {
        researchEl.textContent = String(Math.floor(research));
    }

    const branches = techSystem.BRANCHES || {};
    const byBranch = techSystem.listByBranch();
    root.innerHTML = '';

    Object.keys(byBranch).forEach(branchKey => {
        const branch = branches[branchKey] || { name: branchKey, color: '#4c7cff', blurb: '' };
        const wrapper = document.createElement('section');
        wrapper.className = 'tech-branch';
        wrapper.style.borderColor = `${branch.color}66`;

        const title = document.createElement('div');
        title.className = 'tech-branch-title';
        title.style.background = `${branch.color}2b`;
        title.innerHTML = `<span>${escapeHtml(branch.name)}</span><small>${escapeHtml(branch.blurb || '')}</small>`;
        wrapper.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'tech-grid';

        byBranch[branchKey].forEach(tech => {
            const current = Number(levels[tech.id]) || 0;

            // Per-race cap: absent map => full access; cap 0 => branch locked.
            const cap = access.techCaps && tech.id in access.techCaps
                ? Number(access.techCaps[tech.id])
                : tech.maxLevel;
            const displayMax = Math.min(tech.maxLevel, cap);
            const locked = cap <= 0;
            const cappedOut = !locked && current >= cap && cap < tech.maxLevel;

            const maxed = current >= tech.maxLevel;
            const cost = techSystem.nextLevelCost(tech.id, current);
            const check = techSystem.canResearch(tech.id, levels, research);
            const missing = techSystem.missingRequirements(tech, levels);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tech-card';
            button.dataset.techId = String(tech.id);
            button.style.borderLeft = `5px solid ${branch.color}`;
            button.disabled = maxed || locked || cappedOut || !check.ok;
            if (locked || cappedOut) button.classList.add('tech-locked');

            const raceLabel = access.raceName || 'your race';
            const reason = locked
                ? `Locked for ${raceLabel}.`
                : cappedOut
                    ? `${raceLabel} can't research past Lv${cap}.`
                    : maxed
                        ? 'Max level reached.'
                        : (missing.length ? `Requires ${missing.join(', ')}.` : (!check.ok ? check.reason : ''));
            const showReason = locked || cappedOut || (reason && !check.ok);
            const costLabel = locked ? 'LOCKED' : (maxed || cappedOut) ? 'MAX' : `${cost}R`;
            button.innerHTML = `
                <div class="tech-name">${escapeHtml(tech.name)} Lv${current}/${displayMax}</div>
                <div class="tech-cost">${costLabel}</div>
                <div class="tech-summary">${escapeHtml(tech.summary || '')}</div>
                ${showReason ? `<div class="tech-req">${escapeHtml(reason)}</div>` : ''}
            `;
            button.addEventListener('click', () => buyTech(tech.id));
            grid.appendChild(button);
        });

        wrapper.appendChild(grid);
        root.appendChild(wrapper);
    });
}

function updateTechState(message) {
    const payload = message.replace('techstate::', '');
    try {
        const data = JSON.parse(payload);
        GAME_STATE.player.techLevels = data.levels || {};
        GAME_STATE.player.raceAccess = {
            raceId: Number(data.raceId) || 1,
            raceName: data.raceName || '',
            techCaps: data.techCaps || null,
            shipAccess: Array.isArray(data.shipAccess) ? data.shipAccess : null
        };
        if (typeof refreshShipBuildAccess === 'function') refreshShipBuildAccess();
        if (Number.isFinite(Number(data.research))) {
            GAME_STATE.player.resources.research = Number(data.research);
            const researchEl = document.getElementById('researchresource');
            if (researchEl) {
                researchEl.textContent = ` ${Math.floor(Number(data.research))} Research`;
            }
        }
        if (Number.isFinite(Number(data.homeworld))) {
            GAME_STATE.player.homeworld = Number(data.homeworld);
            const btn = document.getElementById('homeworldBtn');
            if (btn) {
                btn.title = `Focus homeworld sector ${GAME_STATE.player.homeworld}`;
            }
        }
        renderTechTree();
    } catch (err) {
        console.warn('Failed to parse tech state', err);
    }
}

// Grey out + lock ship hulls this race can't build. The resource/slot logic in
// build.js owns enabling; this only ever *removes* options (and re-applies after
// every sector refresh), so a locked hull can never be clicked into existence.
function refreshShipBuildAccess() {
    const access = (GAME_STATE.player && GAME_STATE.player.raceAccess) || {};
    const allowed = Array.isArray(access.shipAccess) ? access.shipAccess : null;
    if (!allowed) return; // no profile yet => leave the panel untouched
    const raceLabel = access.raceName || 'your race';
    document.querySelectorAll('.ship-button[data-ship-id]').forEach(button => {
        const shipId = Number(button.getAttribute('data-ship-id'));
        const locked = !allowed.includes(shipId);
        button.classList.toggle('ship-locked', locked);
        if (locked) {
            button.disabled = true;
            button.title = `${raceLabel} cannot build this hull`;
        } else if ((button.title || '').indexOf('cannot build this hull') !== -1) {
            button.removeAttribute('title');
        }
    });
}
window.refreshShipBuildAccess = refreshShipBuildAccess;

function updateEmpireSummary(message) {
    const payload = message.replace('empire::', '');
    try {
        const data = JSON.parse(payload);
        GAME_STATE.empire = data;
        const income = data.income || {};
        const fleetTotal = Object.values(data.fleet || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
        const el = document.getElementById('empireSummary');
        if (el) {
            el.textContent = `Income: +${Math.floor(Number(income.metal) || 0)}M +${Math.floor(Number(income.crystal) || 0)}C +${Math.floor(Number(income.research) || 0)}R / turn | Worlds ${Number(data.worlds) || 0} | Sectors ${Number(data.sectors) || 0} | Fleet ${fleetTotal}`;
        }
    } catch (err) {
        console.warn('Failed to parse empire summary', err);
    }
}

function updateVictoryProgress(message) {
    const payload = message.replace('victoryprogress::', '');
    const el = document.getElementById('victoryProgress');
    if (!el) return;

    try {
        const data = JSON.parse(payload);
        const conditions = data.conditions || {};
        const order = [
            'Domination Victory',
            'Elimination Victory',
            'Economic Victory',
            'Scientific Victory',
            'Time Victory'
        ];
        const shortNames = {
            'Domination Victory': 'Dom',
            'Elimination Victory': 'Elim',
            'Economic Victory': 'Econ',
            'Scientific Victory': 'Sci',
            'Time Victory': 'Time'
        };

        const entries = Object.entries(conditions)
            .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
            .map(([name, detail]) => {
                const progress = Math.max(0, Math.min(100, Number(detail && detail.progress) || 0));
                const suffix = detail && detail.achieved ? ' ready' : '';
                return `${shortNames[name] || name.replace(' Victory', '')}: ${Math.floor(progress)}%${suffix}`;
            });

        el.textContent = entries.length > 0
            ? `Victory: ${entries.join(' | ')}`
            : 'Victory: none active';
        el.title = Object.entries(conditions)
            .map(([name, detail]) => `${name}: ${detail && detail.description ? detail.description : ''}`)
            .join('\n');
    } catch (err) {
        console.warn('Failed to parse victory progress', err);
    }
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
    renderTechTree();
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
    // The hex wire token lives in data-token; the visible text is decimal.
    const sectorEl = document.getElementById('sectorofattack');
    const sectorId = sectorEl ? (sectorEl.dataset.token || sectorEl.innerHTML) : '';
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
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify('Fleet Orders', 'No ships selected.', 'warn', 4000);
        }
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
window.focusHomeworld = focusHomeworld;
window.colonizeSelectedSector = colonizeSelectedSector;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('homeworldBtn')?.addEventListener('click', focusHomeworld);
    document.getElementById('colonizeBtn')?.addEventListener('click', colonizeSelectedSector);
    // Standing orders panel removed - human players manage their empire manually
    // AI players use server-side automation instead
});
