document.addEventListener('DOMContentLoaded', function() {
    // Load modules in the right order
    if (window.GameUI) GameUI.initialize();
    if (window.GalaxyMap) GalaxyMap.initialize(14, 8, 'minimapid');
    if (window.ChatSystem) ChatSystem.initialize();
    if (window.ControlPad) ControlPad.initialize();
    
    // Initialize WebSocket last
    initializeWebSocket();
    
    console.log('Galaxy Conquest modules loaded successfully');
});