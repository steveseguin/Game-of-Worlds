/**
 * game.html - Main game interface HTML structure
 * 
 * Defines the HTML structure of the main game interface, including
 * resource display, sector information, minimap, control panels,
 * and chat system. This file loads all required client-side JavaScript files.
 * 
 * This file is served to clients by the server and does not contain
 * executable server-side code.
 * 
 * Dependencies:
 * - Loads all client-side JavaScript modules
 * - CSS styles from style.css
 */
document.addEventListener('DOMContentLoaded', function() {
    if (window.__gameInitialized) {
        return;
    }
    window.__gameInitialized = true;
    
    const sanitizedUserId = getSanitizedUserId();
    if (sanitizedUserId) {
        window.gameUserId = sanitizedUserId;
    }

    // Initialize UI components
    if (window.GameUI) {
        GameUI.initialize();
    }
    
    // Initialize control pad
    if (window.ControlPad) {
        ControlPad.initialize();
    }
    
    // Initialize galaxy map
    if (window.GalaxyMap) {
        GalaxyMap.initialize(14, 8, 'minimapid');
    }
    
    // Initialize chat system
    if (window.ChatSystem) {
        ChatSystem.initialize();
    }
    
    // Initialize websocket connection
    initializeWebSocket();
    
    // Initialize shop system
    if (window.Shop) {
        Shop.initialize(sanitizedUserId || null);
    }
    
    // Initialize sound system
    if (window.SoundSystem) {
        SoundSystem.initialize();
        SoundSystem.playContextualMusic('menu');
    }
    
    // Set up global event handlers
    setupEventListeners();
    
    const leaveButton = document.getElementById('leaveGameBtn');
    if (leaveButton) {
        leaveButton.addEventListener('click', () => {
            if (typeof leaveCurrentGame === 'function') {
                leaveCurrentGame();
            } else {
                window.location.href = '/lobby.html';
            }
        });
    }
    
    // Disable selection on game elements
    disableSelection(document.body);
    
    console.log('Game of Words initialized');
});

function setupEventListeners() {
    // Listen for window resize
    window.addEventListener('resize', function() {
        adjustViewport();
    });
    
    // Next turn button
    document.getElementById('nextTurnBtn')?.addEventListener('click', nextTurn);
    
    // Multi-move controls
    document.getElementById('closeMultiMove')?.addEventListener('click', function() {
        document.getElementById('multiMove').style.display = 'none';
    });
    document.getElementById('moveSelectedShips')?.addEventListener('click', sendmmf);
    document.getElementById('moveAllShips')?.addEventListener('click', sendallmm);
    document.getElementById('moveAttackShips')?.addEventListener('click', sendaamm);
}

function sendallmm() {
    const sectorId = document.getElementById('sectorofattack').innerHTML;
    const shipList = document.getElementById('shipsFromNearBy');
    
    if (!sectorId || !shipList) return;
    
    let message = sectorId;
    
    // Add all ships
    for (let i = 0; i < shipList.options.length; i++) {
        message += ":" + shipList.options[i].value;
    }
    
    const dispatchAll = () => {
        websocket.send("//sendmmf:" + message);
        document.getElementById('multiMove').style.display = 'none';
    };
    if (window.NotificationSystem?.confirm) {
        window.NotificationSystem.confirm('Fleet Orders', `Send all ships to sector ${sectorId}?`, dispatchAll, null);
    } else {
        dispatchAll();
    }
}

function sendaamm() {
    const sectorId = document.getElementById('sectorofattack').innerHTML;
    const shipList = document.getElementById('shipsFromNearBy');
    
    if (!sectorId || !shipList) return;
    
    let message = sectorId;
    let totalShips = 0;
    
    // Add only attack ships (not scouts or colony ships)
    for (let i = 0; i < shipList.options.length; i++) {
        const value = shipList.options[i].value;
        const parts = value.split(':');
        const shipType = parseInt(parts[1]);
        
        if (shipType !== 3 && shipType !== 6) { // Skip scouts and colony ships
            message += ":" + value;
            totalShips++;
        }
    }
    
    if (totalShips === 0) {
        if (window.NotificationSystem?.notify) {
            window.NotificationSystem.notify('Fleet Orders', 'No attack ships available.', 'warn', 4000);
        }
        return;
    }

    const dispatchAttack = () => {
        websocket.send("//sendmmf:" + message);
        document.getElementById('multiMove').style.display = 'none';
    };
    if (window.NotificationSystem?.confirm) {
        window.NotificationSystem.confirm('Fleet Orders', `Send all attack ships to sector ${sectorId}?`, dispatchAttack, null);
    } else {
        dispatchAttack();
    }
}

function adjustViewport() {
    // Clear any legacy zoom/sizing — CSS media queries handle responsive layout.
    // The previous formula (screen.availHeight / 700) caused 1.5x+ zoom on modern monitors,
    // making elements overlap the viewport.
    document.body.style.zoom = '';
    document.body.style.width = '';
    document.body.style.height = '';
}

function disableSelection(element) {
    if (!element) return;
    
    element.onselectstart = function() { return false; };
    if (element.style) {
        element.style.userSelect = "none";
        element.style.webkitUserSelect = "none";
        element.style.MozUserSelect = "none";
        element.style.msUserSelect = "none";
    }
    
    const children = element.getElementsByTagName('*');
    for (let i = 0; i < children.length; i++) {
        disableSelection(children[i]);
    }
}

function getSanitizedUserId() {
    const candidates = [
        window.gameUserId,
        localStorage.getItem('userId'),
        getCookie('userId')
    ];
    
    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        const trimmed = String(candidate).trim();
        if (/^\d+$/.test(trimmed)) {
            return trimmed;
        }
    }
    return null;
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}
