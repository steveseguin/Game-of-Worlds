// rewrite/game.js - Complete implementation

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
    
    // Set up global event handlers
    setupEventListeners();
    
    // Disable selection on game elements
    disableSelection(document);
    
    console.log('Galaxy Conquest initialized');
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
    
    element.onselectstart = function() { return false; };
    element.style.userSelect = "none";
    
    const children = element.getElementsByTagName('*');
    for (let i = 0; i < children.length; i++) {
        disableSelection(children[i]);
    }
}


function initializeGame() {
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
    
    // Initialize WebSocket connection
    initializeWebSocket();
    
    console.log('Galaxy Conquest initialized');
}

document.getElementById('chatForm')?.addEventListener('submit', function(e) {
    e.preventDefault();
    sendChat(e);
});

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
    
    // Initialize WebSocket connection
    initializeWebSocket();
    
    console.log('Galaxy Conquest initialized');
});