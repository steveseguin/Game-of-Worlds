/**
 * lobby.js - Client-side game lobby manager
 *
 * Handles lobby UI, websocket messaging, and the pre-game waiting room.
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

const MIN_AUTO_START_PLAYERS = 1;

let websocket;
let userId;
let tempKey;
let isCreatingGame = false;
let isAwaitingRaceSelection = false;
let pendingJoinGameId = null;
let isLobbyReady = false;

let currentGameId = null;
let currentGameName = '';
let currentMaxPlayers = 0;
let currentPlayerCount = 0;
let currentPlayers = [];
let isCurrentGameCreator = false;
let isStartingGame = false;
let currentRaceId = null;
let currentRaceName = '';
let knownRaceMap = {};
let inviteGameId = null;
let currentGameStatus = 'waiting';
let currentGameStarted = false;
const AI_DIFFICULTY_OPTIONS = ['chill', 'medium', 'aggressive'];
const AI_STRATEGY_OPTIONS = ['balanced', 'aggressive', 'economic'];
const GAME_MODE_OPTIONS = [
    { value: 'quick', label: 'Quick (fast turns)' },
    { value: 'epic', label: 'Epic (1 turn/day)' }
];
let currentPlayerDetails = [];
let currentGameMode = 'quick';
let currentRegisteredOnly = false;
let currentMinLevel = 0;
let countdownSeconds = null;

function formatModeLabel(mode) {
    return mode === 'epic' ? 'Epic (1/day turn)' : 'Quick (fast turns)';
}

function renderAccessBadges(registeredOnly, minLevel) {
    const badges = [];
    if (registeredOnly) {
        badges.push('<span class="chip chip-waiting">Registered</span>');
    } else {
        badges.push('<span class="chip chip-mode">Guests OK</span>');
    }
    if (Number(minLevel) > 0) {
        badges.push(`<span class="chip chip-progress">Level ${Number(minLevel)}+</span>`);
    }
    return badges.join('');
}

function setLobbyConnectionState(state, message) {
    const normalizedState = state || 'connecting';
    isLobbyReady = normalizedState === 'ready';

    const labels = {
        connecting: 'Lobby: Connecting...',
        authorizing: 'Lobby: Authorizing...',
        ready: 'Lobby: Connected',
        disconnected: 'Lobby: Reconnecting...'
    };

    const pill = document.getElementById('lobbyConnectionState');
    if (pill) {
        pill.dataset.state = normalizedState;
        pill.textContent = message || labels[normalizedState] || labels.connecting;
    }

    setCreateGameButtonState(isCreatingGame);
    const refreshBtn = document.getElementById('refreshGamesBtn');
    if (refreshBtn) {
        refreshBtn.disabled = !isLobbyReady;
        refreshBtn.title = isLobbyReady ? '' : 'Waiting for lobby authentication';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    userId = getCookie('userId');
    tempKey = getCookie('tempKey');
    const params = new URLSearchParams(window.location.search);
    inviteGameId = params.get('game') ? Number(params.get('game')) : null;

    if (!userId || !tempKey) {
        window.location.href = '/login.html';
        return;
    }

    setLobbyConnectionState('connecting');
    configureGuestCreateOptions();
    initWebSocket();

    document.getElementById('createGameBtn').addEventListener('click', createGame);
    document.getElementById('refreshGamesBtn').addEventListener('click', refreshGames);
});

function configureGuestCreateOptions() {
    const isGuest = localStorage.getItem('gowIsGuest') === '1';
    const registeredOnly = document.getElementById('registeredOnly');
    const minLevel = document.getElementById('minLevel');
    if (registeredOnly) {
        registeredOnly.disabled = isGuest;
        registeredOnly.checked = false;
        registeredOnly.title = isGuest ? 'Register to create registered-only rooms' : '';
    }
    if (minLevel) {
        minLevel.disabled = isGuest;
        minLevel.value = '0';
        minLevel.title = isGuest ? 'Register to create level-gated rooms' : '';
    }
}

function initWebSocket() {
    websocket = new WebSocket(getWebSocketUrl());
    window.websocket = websocket;

    websocket.onopen = () => {
        console.log('Connected to server');
        setLobbyConnectionState('authorizing');
        websocket.send(`//auth:${userId}:${tempKey}`);
    };

    websocket.onmessage = evt => handleMessage(evt.data);
    websocket.onerror = evt => {
        console.error('WebSocket error:', evt);
        setLobbyConnectionState('connecting', 'Lobby: Connection issue');
    };
    websocket.onclose = () => {
        console.log('Disconnected from server');
        window.websocket = null;
        setLobbyConnectionState('disconnected');
        resetCreateGameState();
        renderGameListSkeleton('Reconnecting to server…');
        setTimeout(initWebSocket, 3000);
    };
}

function handleMessage(message) {
    console.log('Received:', message);

    if (message.startsWith('$^$')) {
        const count = message.substring(3) || '0';
        const el = document.getElementById('online-count');
        if (el) {
            el.textContent = count;
        }
        return;
    }

    if (message.startsWith('Error:')) {
        const errorText = message.substring('Error:'.length).trim() || 'An unexpected lobby error occurred.';
        showToast(errorText, 'error');
        if (isStartingGame) {
            isStartingGame = false;
            updateWaitingView();
        }
        return;
    }

    if (message.startsWith('countdown::')) {
        const payload = message.split('::')[1];
        if (payload === 'cancel') {
            countdownSeconds = null;
            isStartingGame = false;
            showToast('Start aborted — a player left or changed.', 'warning');
        } else {
            countdownSeconds = parseInt(payload, 10);
            isStartingGame = true;
        }
        updateWaitingView();
        return;
    }

    if (message.startsWith('currentgame::')) {
        setLobbyConnectionState('ready');
        handleCurrentGameMessage(message.substring('currentgame::'.length));
        return;
    }

    if (message.startsWith('lobby::')) {
        clearCurrentGameTracking();
        setLobbyConnectionState('ready');
        refreshGames();
        if (inviteGameId && Number.isFinite(inviteGameId)) {
            const targetInviteId = inviteGameId;
            inviteGameId = null;
            joinGame(targetInviteId);
        }
        return;
    }

    if (message.startsWith('gamelist::')) {
        setLobbyConnectionState('ready');
        updateGameList(message.substring('gamelist::'.length));
        return;
    }

    if (message.startsWith('creategame::success::')) {
        resetCreateGameState();
        const gameId = parseInt(message.split('::')[2], 10);
        const nameInput = document.getElementById('gameName');
        if (nameInput) {
            nameInput.value = '';
        }
        showToast('Game created! Select your race to join.', 'success');
        refreshGames();
        if (!Number.isNaN(gameId)) {
            joinGame(gameId);
        }
        return;
    }

    if (message.startsWith('creategame::error::')) {
        resetCreateGameState();
        const errorMessage = message.substring('creategame::error::'.length) || 'Unable to create game';
        showToast(errorMessage, 'error');
        if (errorMessage.includes('Leave your current game')) {
            requestCurrentGameSnapshot();
        }
        return;
    }

    if (message.startsWith('joingame::success::')) {
        setLobbyConnectionState('ready');
        try {
            const payload = JSON.parse(message.substring('joingame::success::'.length));
            currentRaceId = Number(payload.raceId) || currentRaceId || null;
            currentRaceName = payload.raceName || currentRaceName || '';
            hydrateCurrentGame(payload);
        } catch (error) {
            console.error('Failed to parse join success payload:', error);
        }
        return;
    }

    if (message.startsWith('Success: Joined game')) {
        // Legacy fallback - assign currentGameId before clearing pendingJoinGameId
        isAwaitingRaceSelection = false;
        if (!currentGameId && pendingJoinGameId) {
            currentGameId = pendingJoinGameId;
        }
        pendingJoinGameId = null;
        renderWaitingView();
        return;
    }

    if (message.startsWith('joingame::error::')) {
        const errorMessage = message.substring('joingame::error::'.length) || 'Unable to join game';
        isAwaitingRaceSelection = false;
        pendingJoinGameId = null;
        showToast(errorMessage, 'error');
        if (errorMessage.includes('Leave your current game')) {
            requestCurrentGameSnapshot();
        } else {
            renderGameListSkeleton('Please select a game to join.');
        }
        return;
    }

    if (message.startsWith('changerace::success::')) {
        try {
            const payload = JSON.parse(message.substring('changerace::success::'.length));
            currentRaceId = Number(payload.raceId) || currentRaceId;
            currentRaceName = payload.raceName || currentRaceName;
            isAwaitingRaceSelection = false;
            pendingJoinGameId = null;
            renderWaitingView();
            showToast(`Race updated to ${currentRaceName || getRaceName(currentRaceId) || 'selected race'}.`, 'success');
        } catch (error) {
            console.error('Failed to parse race change payload:', error);
        }
        return;
    }

    if (message.startsWith('changerace::error::')) {
        const errMsg = message.substring('changerace::error::'.length) || 'Unable to change race';
        isAwaitingRaceSelection = false;
        pendingJoinGameId = null;
        showToast(errMsg, 'error');
        updateWaitingView();
        return;
    }

    if (message.startsWith('addai::success::')) {
        const aiName = decodeURIComponentSafe(message.substring('addai::success::'.length) || 'AI opponent');
        showToast(`${aiName} added to your game.`, 'success');
        refreshGames();
        updateWaitingView();
        return;
    }

    if (message.startsWith('addai::error::')) {
        const errMsg = message.substring('addai::error::'.length) || 'Unable to add AI';
        showToast(errMsg, 'error');
        return;
    }

    if (message.startsWith('races::')) {
        const raceData = message.substring(7);
        updateKnownRaces(raceData);
        if (isAwaitingRaceSelection && pendingJoinGameId && window.RaceSelection) {
            window.RaceSelection.handleUnlockedRaces(raceData);
        }
        return;
    }

    if (message.startsWith('pl:')) {
        updatePlayerList(message.substring(3));
        return;
    }

    if (message.startsWith('startgame::')) {
        window.location.href = '/game.html';
        return;
    }

    if (message.startsWith('gameover::')) {
        clearCurrentGameTracking();
        showToast('Game ended. You can create or join another game.', 'info');
        refreshGames();
    }
}

function canSendLobbyCommand(showMessage = false) {
    const ready = !!(isLobbyReady && websocket && websocket.readyState === WebSocket.OPEN);
    if (!ready && showMessage) {
        showToast('Lobby connection is still syncing. Please wait a moment.', 'warn');
    }
    return ready;
}

function createGame() {
    const nameField = document.getElementById('gameName');
    const gameName = nameField ? nameField.value.trim() : '';
    if (!gameName) {
        showToast('Please enter a game name', 'warn');
        return;
    }

    if (!canSendLobbyCommand(true)) {
        return;
    }

    if (currentGameId) {
        showToast('Leave your current game before creating another.', 'warn');
        updateWaitingView();
        requestCurrentGameSnapshot();
        return;
    }

    if (isCreatingGame) {
        return;
    }

    const maxPlayers = document.getElementById('maxPlayers').value;
    const modeSelect = document.getElementById('gameMode');
    const mode = modeSelect ? modeSelect.value : 'quick';
    const registeredOnly = document.getElementById('registeredOnly')?.checked ? 1 : 0;
    const minLevelSelect = document.getElementById('minLevel');
    const minLevel = Math.max(0, Math.min(100, parseInt(minLevelSelect?.value || '0', 10) || 0));
    isCreatingGame = true;
    setCreateGameButtonState(true);
    websocket.send(`//creategame:${encodeURIComponent(gameName)}:${maxPlayers}:${mode}:${registeredOnly}:${minLevel}`);
}

function refreshGames() {
    if (currentGameId && currentGameStarted) {
        renderWaitingView();
        requestCurrentGameSnapshot();
        return;
    }

    if (!canSendLobbyCommand()) {
        renderGameListSkeleton('Authenticating lobby session…');
        return;
    }

    renderGameListSkeleton('Loading games…');
    if (canSendLobbyCommand(false)) {
        websocket.send('//gamelist');
    }
}

function requestCurrentGameSnapshot() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send('//currentgame');
    }
}

function handleCurrentGameMessage(rawPayload) {
    if (!rawPayload || rawPayload === 'null') {
        clearCurrentGameTracking();
        refreshGames();
        return;
    }

    try {
        const payload = JSON.parse(rawPayload);
        if (!payload || !payload.gameId) {
            clearCurrentGameTracking();
            refreshGames();
            return;
        }
        hydrateCurrentGame(payload);
    } catch (error) {
        console.error('Failed to parse current game payload:', error);
    }
}

function updateGameList(rawPayload) {
    const entries = rawPayload
        ? rawPayload.split('|').filter(Boolean)
        : [];

    let waitingGameUpdated = false;
    let renderedRows = 0;
    const rows = [];

    entries.forEach(gameData => {
        const parts = gameData.split(',');
        if (parts.length < 5) {
            return;
        }

        const gameId = parseInt(parts[0], 10);
        const name = decodeURIComponentSafe(parts[1] || '');
        const playerCount = parseInt(parts[2], 10) || 0;
        const maxPlayers = parseInt(parts[3], 10) || 0;
        const statusRaw = (parts[4] || 'waiting').toLowerCase();
        const mode = (parts[5] || 'quick').toLowerCase();
        const registeredOnly = parts[6] === '1';
        const minLevel = parseInt(parts[7], 10) || 0;

        const safeName = escapeHtml(name || `Game ${gameId}`);
        const statusLabel = statusRaw === 'waiting'
            ? (maxPlayers > 0 && playerCount >= maxPlayers ? 'Full' : 'Waiting')
            : 'In Progress';
        const canJoin = statusRaw === 'waiting' && (maxPlayers === 0 || playerCount < maxPlayers);
        const statusBadge = `<span class="chip ${statusRaw === 'waiting' ? 'chip-waiting' : statusRaw === 'full' ? 'chip-error' : 'chip-progress'}">${statusLabel}</span>`;
        const modeBadge = `<span class="chip chip-mode">${formatModeLabel(mode)}</span>`;
        const accessBadges = renderAccessBadges(registeredOnly, minLevel);

        if (currentGameId === gameId) {
            currentGameName = safeName;
            currentMaxPlayers = maxPlayers;
            currentPlayerCount = playerCount;
            currentGameMode = mode;
            currentRegisteredOnly = registeredOnly;
            currentMinLevel = minLevel;
            currentGameStatus = 'waiting';
            currentGameStarted = false;
            waitingGameUpdated = true;
            return;
        }

        const inviteUrl = `${window.location.origin}/lobby.html?game=${gameId}`;
        const actionDisabled = !isLobbyReady ? 'disabled title="Waiting for lobby authentication"' : '';
        const action = canJoin && Number.isInteger(gameId)
            ? `<div class="action-cell">
                   <button onclick="joinGame(${gameId})" ${actionDisabled}>Join</button>
                   <button onclick="copyInviteLink('${inviteUrl}')" class="ghost small" ${actionDisabled}>Invite</button>
               </div>`
            : statusBadge;
        const playersLabel = maxPlayers > 0 ? `${playerCount}/${maxPlayers}` : `${playerCount}`;

        rows.push(`
            <tr>
                <td data-label="Game ID">${gameId}</td>
                <td data-label="Name">${safeName}</td>
                <td data-label="Players">${playersLabel}</td>
                <td data-label="Mode">${modeBadge}</td>
                <td data-label="Access">${accessBadges}</td>
                <td data-label="Status">${statusBadge}</td>
                <td data-label="Action">${action}</td>
            </tr>
        `);
        renderedRows += 1;
    });

    if (currentGameId) {
        if (!waitingGameUpdated) {
            // Game no longer exists
            clearCurrentGameTracking();
            renderGameTable(rows, renderedRows);
        } else {
            updateWaitingView();
        }
        return;
    }

    renderGameTable(rows, renderedRows);
}

function renderGameTable(rows, renderedRows) {
    const gameList = document.getElementById('gameList');
    if (!gameList) {
        return;
    }

    let html = `
        <tr>
            <th>Game ID</th>
            <th>Name</th>
            <th>Players</th>
            <th>Mode</th>
            <th>Access</th>
            <th>Status</th>
            <th>Action</th>
        </tr>
    `;

    html += rows.join('');

    if (renderedRows === 0) {
        html += `
            <tr>
                <td colspan="7" style="text-align:center;">No games available</td>
            </tr>
        `;
    }

    gameList.innerHTML = html;
}

function renderWaitingView() {
    const gameList = document.getElementById('gameList');
    if (!gameList) {
        return;
    }

    if (!currentGameId) {
        refreshGames();
        return;
    }

    const maxLabel = currentMaxPlayers > 0 ? currentMaxPlayers : '∞';
    if (currentGameStarted) {
        renderActiveGameView();
        return;
    }

    const requiredPlayers = currentMaxPlayers > 0
        ? Math.min(currentMaxPlayers, MIN_AUTO_START_PLAYERS)
        : MIN_AUTO_START_PLAYERS;
    const readyToStart = currentPlayerCount >= requiredPlayers;
    const countdownActive = countdownSeconds !== null;
    const hasOpenSeat = currentMaxPlayers === 0 || currentPlayerCount < currentMaxPlayers;
    const raceLabel = escapeHtml(currentRaceName || getRaceName(currentRaceId) || 'Not selected');
    const inviteLink = `${window.location.origin}/lobby.html?game=${currentGameId}`;
    const modeLabel = formatModeLabel(currentGameMode);
    const titleName = currentGameName ? escapeHtml(currentGameName) : `Game ${currentGameId}`;
    const accessBadges = renderAccessBadges(currentRegisteredOnly, currentMinLevel);

    // Status pill (color depends on state)
    let statusText, statusClass;
    if (countdownActive) {
        statusText = `Launching in ${countdownSeconds}s`;
        statusClass = 'chip-progress';
    } else if (isCurrentGameCreator) {
        if (readyToStart) {
            statusText = currentPlayerCount >= 2 ? 'Ready to launch' : 'Solo / sandbox ready';
            statusClass = 'chip-waiting';
        } else {
            statusText = `Need ${requiredPlayers - currentPlayerCount} more`;
            statusClass = 'chip-mode';
        }
    } else {
        statusText = 'Waiting for host';
        statusClass = 'chip-mode';
    }

    // Player slots (filled + empty)
    const slots = [];
    currentPlayerDetails.forEach(p => slots.push(renderPlayerSlot(p)));
    if (currentMaxPlayers > 0) {
        for (let i = currentPlayerDetails.length; i < currentMaxPlayers; i++) {
            slots.push(`<li class="player-slot empty"><span class="slot-icon">+</span><span class="slot-text">Open seat</span></li>`);
        }
    }
    const playersHtml = `<ul class="player-slots">${slots.join('')}</ul>`;

    // Buttons
    const primaryBtn = isCurrentGameCreator && !countdownActive
        ? `<button class="primary lg" onclick="startGame()" ${(!readyToStart || isStartingGame || !isLobbyReady) ? 'disabled' : ''}>
              ${isStartingGame ? 'Starting…' : '▶ Start Game'}
           </button>`
        : (countdownActive
            ? `<button class="primary lg" disabled>Starting in ${countdownSeconds || 10}s</button>`
            : '');
    const aiSandboxBtn = isCurrentGameCreator && !countdownActive && hasOpenSeat
        ? `<button class="ghost lg" onclick="startAiSandbox()" ${isLobbyReady ? '' : 'disabled title="Waiting for lobby authentication"'}>Fill with AI &amp; Start</button>`
        : '';

    const aiControls = isCurrentGameCreator && hasOpenSeat && !countdownActive
        ? `
            <details class="ai-section" open>
                <summary>Add AI opponent</summary>
                <div class="ai-section-row">
                    <label>Difficulty
                        <select id="aiDifficulty" ${isLobbyReady ? '' : 'disabled'}>
                            ${AI_DIFFICULTY_OPTIONS.map(opt => `<option value="${opt}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('')}
                        </select>
                    </label>
                    <label>Strategy
                        <select id="aiStrategy" ${isLobbyReady ? '' : 'disabled'}>
                            ${AI_STRATEGY_OPTIONS.map(opt => `<option value="${opt}">${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`).join('')}
                        </select>
                    </label>
                    <button class="ghost" onclick="addAiPlayer()" ${isLobbyReady ? '' : 'disabled title="Waiting for lobby authentication"'}>Add AI Opponent</button>
                </div>
            </details>
          `
        : '';

    // If countdown is happening, prominently show "Open game view" (the player will need it once game starts)
    const openGameBanner = countdownActive
        ? `<a class="open-game-banner" href="/game.html">Game starting — open game view ➜</a>`
        : '';

    gameList.innerHTML = `
        <tr>
            <td colspan="7" class="waiting-cell">
                <div class="waiting-view">
                    <header class="waiting-header">
                        <div>
                            <div class="waiting-eyebrow">🎮 Waiting room · Game ${currentGameId}</div>
                            <h3>Waiting in Game ${currentGameId}</h3>
                            <div class="waiting-game-name">${titleName}</div>
                        </div>
                        <div class="waiting-meta">
                            <span class="chip ${statusClass}">${statusText}</span>
                            <span class="chip chip-mode">${modeLabel}</span>
                            ${accessBadges}
                            <span class="chip">Players: ${currentPlayerCount}/${maxLabel}</span>
                        </div>
                    </header>

                    ${openGameBanner}

                    <section class="waiting-players">
                        <div class="section-label">Commanders</div>
                        ${playersHtml}
                    </section>

                    <section class="waiting-controls">
                        <div class="race-row">
                            <div>
                                <div class="section-label">Your race</div>
                                <div class="race-name">${raceLabel}</div>
                            </div>
                            <button class="ghost" onclick="openRaceSelectorForCurrentGame()" ${isLobbyReady ? '' : 'disabled title="Waiting for lobby authentication"'}>Choose / Change</button>
                        </div>
                        ${aiControls}
                    </section>

                    <section class="waiting-actions">
                        ${primaryBtn}
                        ${aiSandboxBtn}
                    </section>

                    <details class="invite-block">
                        <summary>Invite a friend</summary>
                        <div class="invite-row">
                            <input type="text" value="${inviteLink}" readonly>
                            <button class="ghost" onclick="copyInviteLink('${inviteLink}')">Copy</button>
                        </div>
                    </details>

                    <div class="waiting-footer">
                        <a class="resume-link" href="/game.html">Open game view</a>
                        <button class="danger-link" onclick="leaveGame()">Leave game</button>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function renderActiveGameView() {
    const gameList = document.getElementById('gameList');
    if (!gameList) {
        return;
    }

    const titleName = currentGameName ? escapeHtml(currentGameName) : `Game ${currentGameId}`;
    const modeLabel = formatModeLabel(currentGameMode);
    const playerLabel = currentPlayerCount > 0 ? `${currentPlayerCount} players` : 'Players loading';
    const accessBadges = renderAccessBadges(currentRegisteredOnly, currentMinLevel);
    const playersHtml = currentPlayerDetails.length > 0
        ? `<section class="waiting-players">
               <div class="section-label">Commanders</div>
               <ul class="player-slots">${currentPlayerDetails.map(renderPlayerSlot).join('')}</ul>
           </section>`
        : '';

    gameList.innerHTML = `
        <tr>
            <td colspan="7" class="waiting-cell">
                <div class="waiting-view">
                    <header class="waiting-header">
                        <div>
                            <div class="waiting-eyebrow">Game in progress - Game ${currentGameId}</div>
                            <h3>${titleName}</h3>
                        </div>
                        <div class="waiting-meta">
                            <span class="chip chip-progress">In progress</span>
                            <span class="chip chip-mode">${modeLabel}</span>
                            ${accessBadges}
                            <span class="chip">${playerLabel}</span>
                        </div>
                    </header>

                    <a class="open-game-banner" href="/game.html">Open game view</a>
                    ${playersHtml}

                    <div class="waiting-footer">
                        <span class="section-label" style="margin:0;">Player ${escapeHtml(String(userId || ''))}</span>
                        <button class="danger-link" onclick="resignCurrentGame()">Resign</button>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function renderPlayerSlot(player) {
    const safeName = escapeHtml(player.name);
    const race = escapeHtml(player.race || 'No race');
    const isAi = player.isAi;
    const meBadge = player.isSelf ? `<span class="slot-me">you</span>` : '';
    const aiBadges = isAi
        ? `<span class="slot-tag ai">${escapeHtml(player.aiDiff || 'ai')}</span><span class="slot-tag ai">${escapeHtml(player.aiStrat || 'balanced')}</span>`
        : '';
    const accountBadges = isAi
        ? ''
        : `<span class="slot-tag level">Lvl ${Number(player.level) || 1}</span><span class="slot-tag ${player.isGuest ? 'guest' : 'registered'}">${player.isGuest ? 'Guest' : 'Registered'}</span>`;
    return `<li class="player-slot ${isAi ? 'is-ai' : ''}">
        <span class="slot-icon">${isAi ? '🤖' : '👤'}</span>
        <span class="slot-text">
            <span class="slot-name">${safeName}${meBadge}</span>
            <span class="slot-meta"><span class="slot-tag">${race}</span>${accountBadges}${aiBadges}</span>
        </span>
    </li>`;
}

function renderGameListSkeleton(message) {
    const gameList = document.getElementById('gameList');
    if (!gameList) {
        return;
    }

    gameList.innerHTML = `
        <tr>
            <th>Game ID</th>
            <th>Name</th>
            <th>Players</th>
            <th>Mode</th>
            <th>Access</th>
            <th>Status</th>
            <th>Action</th>
        </tr>
        <tr>
            <td colspan="7">${escapeHtml(message)}</td>
        </tr>
    `;
}

function setCreateGameButtonState(isLoading) {
    const button = document.getElementById('createGameBtn');
    if (!button) {
        return;
    }

    if (isLoading) {
        button.disabled = true;
        button.textContent = 'Creating…';
    } else {
        button.disabled = !isLobbyReady;
        button.textContent = 'Create Game';
        button.title = isLobbyReady ? '' : 'Waiting for lobby authentication';
    }
}

function resetCreateGameState() {
    if (isCreatingGame) {
        isCreatingGame = false;
    }
    setCreateGameButtonState(false);
}

function clearCurrentGameTracking() {
    currentGameId = null;
    currentGameName = '';
    currentMaxPlayers = 0;
    currentPlayerCount = 0;
    currentPlayers = [];
    isCurrentGameCreator = false;
    isStartingGame = false;
    isAwaitingRaceSelection = false;
    pendingJoinGameId = null;
    currentRaceId = null;
    currentRaceName = '';
    currentGameMode = 'quick';
    currentRegisteredOnly = false;
    currentMinLevel = 0;
    currentGameStatus = 'waiting';
    currentGameStarted = false;
    countdownSeconds = null;
}

function decodeURIComponentSafe(value) {
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value || '';
    }
}

function escapeHtml(value) {
    if (!value) {
        return '';
    }
    return value.replace(/[&<>"']/g, char => {
        switch (char) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return char;
        }
    });
}

function updateKnownRaces(rawPayload) {
    try {
        const races = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
        if (Array.isArray(races)) {
            knownRaceMap = races.reduce((acc, race) => {
                if (race && race.id) {
                    acc[race.id] = race.name || acc[race.id];
                }
                return acc;
            }, { ...knownRaceMap });
        }
    } catch (err) {
        console.error('Failed to cache race data:', err);
    }
}

function getRaceName(raceId) {
    if (!raceId) {
        return '';
    }
    if (knownRaceMap[raceId]) {
        return knownRaceMap[raceId];
    }
    if (raceId === 1) {
        return 'Terran Empire';
    }
    return '';
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function loadRaceSelectionScript(callback) {
    if (window.RaceSelection) {
        requestUnlockedRaces();
        callback();
        return;
    }

    const script = document.createElement('script');
    script.src = 'js/race-selection.js?v=20251212';
    script.onload = () => {
        requestUnlockedRaces();
        callback();
    };
    script.onerror = () => {
        console.error('Failed to load race selection script at', script.src);
        showToast('Unable to load race selection resources. Please refresh and try again.', 'error');
        isAwaitingRaceSelection = false;
        pendingJoinGameId = null;
        updateWaitingView();
    };
    document.head.appendChild(script);
}

function requestUnlockedRaces() {
    if (canSendLobbyCommand(false)) {
        websocket.send('//getunlockedraces');
    }
}

function openRaceSelectorForCurrentGame() {
    if (!currentGameId) {
        showToast('Join a game before selecting a race.', 'warn');
        return;
    }
    if (!canSendLobbyCommand(true)) {
        return;
    }

    pendingJoinGameId = currentGameId;
    isAwaitingRaceSelection = true;
    isStartingGame = false;

    loadRaceSelectionScript(() => {
        window.RaceSelection.initialize(raceId => {
            if (!isAwaitingRaceSelection || !pendingJoinGameId) {
                return;
            }
            isAwaitingRaceSelection = false;
            pendingJoinGameId = null;
            websocket.send(`//changerace:${raceId}`);
        }, currentRaceId);
    });
}

function joinGame(gameId) {
    if (!canSendLobbyCommand(true)) {
        return;
    }

    if (currentGameId) {
        if (Number(gameId) === Number(currentGameId)) {
            updateWaitingView();
        } else {
            showToast('Leave your current game before joining another one.', 'warn');
            requestCurrentGameSnapshot();
        }
        return;
    }

    if (isAwaitingRaceSelection && pendingJoinGameId === gameId) {
        return;
    }

    pendingJoinGameId = gameId;
    isAwaitingRaceSelection = true;
    isStartingGame = false;

    loadRaceSelectionScript(() => {
        window.RaceSelection.initialize(raceId => {
            if (!isAwaitingRaceSelection || !pendingJoinGameId) {
                return;
            }
            const targetGame = pendingJoinGameId;
            isAwaitingRaceSelection = false;
            pendingJoinGameId = null;
            websocket.send(`//joingame:${targetGame}:${raceId}`);
        }, currentRaceId);
    });
}

function leaveGame() {
    if (canSendLobbyCommand(false)) {
        websocket.send('//leavegame');
    } else {
        window.location.href = '/lobby.html';
    }
    clearCurrentGameTracking();
    renderGameListSkeleton('Leaving game…');
}

function resignCurrentGame() {
    if (!currentGameId) {
        showToast('No active game to resign from.', 'warn');
        return;
    }

    if (!window.confirm('Resign from this game?')) {
        return;
    }

    if (canSendLobbyCommand(true)) {
        websocket.send('//surrender');
        showToast('Resigning from game...', 'info');
    }
}

function startGame() {
    if (!canSendLobbyCommand(true)) {
        return;
    }
    if (!currentGameId || !isCurrentGameCreator || isStartingGame) {
        return;
    }

    const requiredPlayers = currentMaxPlayers > 0
        ? Math.min(currentMaxPlayers, MIN_AUTO_START_PLAYERS)
        : MIN_AUTO_START_PLAYERS;

    if (currentPlayerCount < requiredPlayers) {
        showToast(`You need at least ${requiredPlayers} players to start the game.`, 'warn');
        return;
    }

    isStartingGame = true;
    updateWaitingView();
    websocket.send('//start');
}

function hydrateCurrentGame(payload) {
    currentGameId = Number(payload.gameId);
    currentGameName = escapeHtml(payload.gameName || '');
    currentMaxPlayers = Number(payload.maxPlayers) || 0;
    currentPlayerCount = Number(payload.playerCount) || 1;
    isCurrentGameCreator = String(payload.creatorId) === String(userId);
    currentPlayers = [`You (Player ${userId})`];
    isAwaitingRaceSelection = false;
    pendingJoinGameId = null;
    isStartingGame = false;
    currentRaceId = Number(payload.raceId) || currentRaceId || null;
    currentRaceName = payload.raceName || currentRaceName || getRaceName(currentRaceId);
    currentGameMode = (payload.mode || 'quick').toLowerCase();
    currentRegisteredOnly = payload.registeredOnly === true || payload.registeredOnly === 1 || payload.registeredOnly === '1';
    currentMinLevel = Math.max(0, Math.min(100, Number(payload.minLevel) || 0));
    currentGameStatus = (payload.status || (payload.started ? 'in-progress' : 'waiting')).toLowerCase();
    currentGameStarted = Boolean(payload.started) || currentGameStatus === 'in-progress' || currentGameStatus === 'started';
    renderWaitingView();
}

function updatePlayerList(rawList) {
    if (!currentGameId) {
        return;
    }

    const entries = rawList.split(':').filter(Boolean);
    if (entries.length === 0) {
        return;
    }

    const players = entries.map(entry => {
        const [id, encodedName, isAi, raceIdRaw, aiDiffRaw, aiStratRaw, isGuestRaw, levelRaw] = entry.split('|');
        const decodedName = encodedName ? decodeURIComponent(encodedName) : `Player ${id}`;
        const isSelf = String(id) === String(userId);
        const raceLabel = getRaceName(Number(raceIdRaw)) || 'Race ?';
        return {
            id,
            name: decodedName,
            isAi: isAi === '1',
            race: raceLabel,
            aiDiff: (aiDiffRaw || 'medium').toLowerCase(),
            aiStrat: (aiStratRaw || 'balanced').toLowerCase(),
            isGuest: isGuestRaw === '1',
            level: Math.max(1, Number(levelRaw) || 1),
            isSelf
        };
    });

    currentPlayerDetails = players;
    currentPlayers = players.map(p => p.name);
    currentPlayerCount = players.length;
    updateWaitingView();
}

function updateWaitingView() {
    if (currentGameId) {
        renderWaitingView();
    }
}

function renderPlayerBadge(player) {
    const safeName = escapeHtml(player.name);
    const race = escapeHtml(player.race || 'Race ?');
    const aiChip = player.isAi
        ? `<span class="chip ai">${(player.aiDiff || 'ai')}</span><span class="chip ai">${(player.aiStrat || 'balanced')}</span>`
        : '';
    const selfLabel = player.isSelf ? '<span class="chip">You</span>' : '';
    return `<li style="margin:6px 0;">
        <span class="player-badge">
            <span>${player.isAi ? '🤖 ' : ''}${safeName}</span>
            ${selfLabel}
            <span class="chip">${race}</span>
            ${aiChip}
        </span>
    </li>`;
}

function addAiPlayer() {
    if (!isCurrentGameCreator) {
        showToast('Only the game creator can add AI opponents.', 'warn');
        return;
    }
    if (!canSendLobbyCommand(true)) {
        return;
    }
    const diffSel = document.getElementById('aiDifficulty');
    const stratSel = document.getElementById('aiStrategy');
    const diff = diffSel ? diffSel.value : 'medium';
    const strat = stratSel ? stratSel.value : 'balanced';
    websocket.send(`//addai:${diff}:${strat}`);
    showToast(`Adding AI (${diff}/${strat})…`, 'info');
}

function startAiSandbox() {
    if (!isCurrentGameCreator) {
        showToast('Only the creator can launch an AI sandbox.', 'warn');
        return;
    }
    if (!canSendLobbyCommand(true)) {
        return;
    }
    const targetSeats = currentMaxPlayers > 0 ? currentMaxPlayers : 4;
    const needed = Math.max(0, targetSeats - currentPlayerCount);
    const atLeastOne = currentPlayerCount < 2 ? 1 : 0;
    const toAdd = Math.max(needed, atLeastOne);
    for (let i = 0; i < toAdd; i++) {
        websocket.send('//addai:aggressive:balanced');
    }
    setTimeout(() => startGame(), 400);
}

async function copyInviteLink(link) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(link);
        } else {
            const tempInput = document.createElement('input');
            tempInput.value = link;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            tempInput.remove();
        }
        showToast('Invite link copied!', 'success');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Unable to copy link. Copy manually instead.', 'warn');
    }
}

// Toast notifications
function ensureToastRoot() {
    let root = document.getElementById('toast-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'toast-root';
        document.body.appendChild(root);
    }
    return root;
}

function showToast(message, type = 'info', duration = 2800) {
    const root = ensureToastRoot();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    root.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('visible');
    });

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

window.joinGame = joinGame;
window.leaveGame = leaveGame;
window.resignCurrentGame = resignCurrentGame;
window.startGame = startGame;
window.openRaceSelectorForCurrentGame = openRaceSelectorForCurrentGame;
window.addAiPlayer = addAiPlayer;
