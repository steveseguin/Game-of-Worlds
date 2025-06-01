/**
 * loader.js - Client-side module loader
 * 
 * Handles loading and initialization of client-side modules in the correct order.
 * Ensures dependencies are loaded before dependent modules are initialized.
 * 
 * This module is client-side only and does not directly access the database.
 * It coordinates the initialization flow of client-side modules.
 * 
 * Dependencies:
 * - Depends on all client-side modules (GameUI, GalaxyMap, etc.)
 */

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