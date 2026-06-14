// Websocket handler compatibility module.
//
// Runtime command handling is intentionally centralized in server/server.js.
// This module exists only for older imports that expect server/lib/handlers.

function createUnavailableHandler(name) {
    return () => {
        throw new Error(`${name} is handled by server/server.js; import the live server module instead.`);
    };
}

module.exports = {
    handleCreateGame: createUnavailableHandler('handleCreateGame'),
    handleGameList: createUnavailableHandler('handleGameList'),
    handleGameStart: createUnavailableHandler('handleGameStart'),
    handleJoinGame: createUnavailableHandler('handleJoinGame'),
    handleChangeRace: createUnavailableHandler('handleChangeRace'),
    handleLeaveGame: createUnavailableHandler('handleLeaveGame'),
    handleAddAi: createUnavailableHandler('handleAddAi'),
    handleSurrender: createUnavailableHandler('handleSurrender'),
    handleGetUnlockedRaces: createUnavailableHandler('handleGetUnlockedRaces'),
    handleGetCurrentGame: createUnavailableHandler('handleGetCurrentGame')
};
