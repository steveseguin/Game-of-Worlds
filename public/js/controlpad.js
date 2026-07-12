/**
 * controlpad.js - Client-side control pad UI manager
 * 
 * Handles the control pad tabs (build, fleet, tech, colonize)
 * and related UI interactions. Manages tab switching and provides
 * methods for sending build, research, and fleet commands.
 * 
 * This module is client-side only and does not directly access the database.
 * It communicates with the server via websocket messages.
 * 
 * Dependencies:
 * - None, but is used by game.js
 */
const ControlPad = (function() {
    const TABS = {
        BUILD: 'build',
        FLEET: 'fleet',
        TECH: 'techtree',
        COLONIZE: 'colonize',
        ANALYTICS: 'analytics'
    };
    
    let currentTab = null;
	
    function buyTech(techId) {
        // Send tech purchase request to server
        websocket.send("//buytech:" + techId);
    }
    
	function initialize() {
		// BuildSystem owns building and ship button events.
		// ControlPad only wires controls that are not handled elsewhere.

		// Set up tech buttons
		for (let i = 1; i <= 9; i++) {
			document.getElementById(`t${i}`)?.addEventListener('click', () => buyTech(i));
		}
	}
    
    function switchTab(tabName) {
        if (currentTab === tabName) return;
        
        // Hide all tabs
        document.getElementById(TABS.BUILD)?.classList.add('hidden');
        document.getElementById(TABS.FLEET)?.classList.add('hidden');
        document.getElementById(TABS.TECH)?.classList.add('hidden');
        document.getElementById(TABS.COLONIZE)?.classList.add('hidden');
        document.getElementById(TABS.ANALYTICS)?.classList.add('hidden');
        
        // Show selected tab
        document.getElementById(tabName)?.classList.remove('hidden');
        
        // Update active tab button
        document.getElementById('buildtab')?.classList.remove('active');
        document.getElementById('fleettab')?.classList.remove('active');
        document.getElementById('techtab')?.classList.remove('active');
        document.getElementById('colonizetab')?.classList.remove('active');
        document.getElementById('analyticstab')?.classList.remove('active');
        
        document.getElementById(tabName + 'tab')?.classList.add('active');
        
        currentTab = tabName;
    }
    
    return {
        initialize,
        switchTab
    };
})();

window.ControlPad = ControlPad;
