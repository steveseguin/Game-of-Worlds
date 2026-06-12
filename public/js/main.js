(function(global) {
    /**
     * Legacy main.js shim
     *
     * Older builds referenced public/js/main.js directly. The modern client
     * replaces that implementation with the modules in connect.js, game.js,
     * and related files. This lightweight shim keeps backward compatibility
     * without breaking cached bundles by providing no-op handlers that
     * surface clear warnings when invoked.
     */

    if (global.LegacyGameShim) {
        return;
    }

    function deprecated(name) {
        return function(...args) {
            if (console && typeof console.warn === 'function') {
                console.warn(
                    `[LegacyGameShim] ${name} is deprecated. ` +
                    `The new client runtime should handle this automatically.`,
                    args
                );
            }
            return null;
        };
    }

    const legacyApi = {
        handleMessage: deprecated('handleMessage'),
        updateFleetInfo: deprecated('updateFleetInfo'),
        updateSectorInfo: deprecated('updateSectorInfo'),
        updateSectorStatus: deprecated('updateSectorStatus'),
        updateResources: deprecated('updateResources'),
        updateBuildings: deprecated('updateBuildings'),
        displayChatMessage: deprecated('displayChatMessage'),
        createBattleVisualization: deprecated('createBattleVisualization'),
        sendmmf: deprecated('sendmmf'),
        sendallmm: deprecated('sendallmm'),
        sendaamm: deprecated('sendaamm')
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = legacyApi;
    }

    global.LegacyGameShim = legacyApi;
})(typeof window !== 'undefined' ? window : globalThis);
