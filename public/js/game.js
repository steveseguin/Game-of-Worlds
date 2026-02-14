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

    // Initialize combat telemetry panel
    if (window.CombatAnalytics) {
        CombatAnalytics.initialize();
    }
    
    // Initialize shop system
    if (window.Shop) {
        // Get user ID from session/auth sources used by login/register flows.
        const userId = window.gameUserId || localStorage.getItem('userId') || getCookie('userId');
        if (userId) {
            Shop.initialize(userId);
        }
    }
    
    // Prefer MediaManager for game music to avoid overlapping tracks.
    if (window.MediaManager?.playMusic) {
        window.MediaManager.playMusic('spaceAmbient');
    } else if (window.SoundSystem) {
        SoundSystem.initialize();
        SoundSystem.playContextualMusic('menu');
    }
    
    // Set up global event handlers
    setupEventListeners();
    
    // Disable selection on game elements
    disableSelection(document);
    
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
    
    if (confirm(`Send all ships to sector ${sectorId}?`)) {
        websocket.send("//sendmmf:" + message);
        document.getElementById('multiMove').style.display = 'none';
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
        alert("No attack ships available");
        return;
    }
    
    if (confirm(`Send all attack ships to sector ${sectorId}?`)) {
        websocket.send("//sendmmf:" + message);
        document.getElementById('multiMove').style.display = 'none';
    }
}

function adjustViewport() {
    if (window.screen.availHeight < window.screen.availWidth) {
        document.body.style.zoom = window.screen.availHeight / 700;
    } else {
        document.body.style.zoom = window.screen.availWidth / 700;
    }
    document.body.style.width = window.screen.availWidth;
    document.body.style.height = window.screen.availHeight;
}

function disableSelection(element) {
    if (!element) return;

    const queue = [element];
    while (queue.length > 0) {
        const current = queue.pop();
        if (!current) continue;

        if (typeof current.onselectstart !== 'undefined') {
            current.onselectstart = function() { return false; };
        }

        // Document nodes do not have style; only apply to element nodes.
        if (current.nodeType === Node.ELEMENT_NODE && current.style) {
            current.style.userSelect = "none";
            current.style.webkitUserSelect = "none";
            current.style.msUserSelect = "none";
        }

        if (current.children && current.children.length) {
            for (let i = 0; i < current.children.length; i++) {
                queue.push(current.children[i]);
            }
        }
    }
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}
