// Create file: rewrite/game.js
// This file brings together all game components

document.addEventListener('DOMContentLoaded', function() {
    // Initialize UI
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
    
    // Chat form
    document.getElementById('chatForm')?.addEventListener('submit', sendChat);
    
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