// Movement compatibility facade.
//
// The production websocket handlers now live in server/server.js. This module
// remains so older imports keep working without duplicating movement logic.

let liveServer = null;

function server() {
    if (!liveServer) {
        liveServer = require('../../server');
    }
    return liveServer;
}

function delegate(name) {
    return (...args) => {
        const fn = server()[name];
        if (typeof fn !== 'function') {
            throw new Error(`Movement handler ${name} is not available`);
        }
        return fn(...args);
    };
}

function setDependencies() {
    // Kept for old tests/importers. Use server.setDatabase() for live runtime.
}

module.exports = {
    setDependencies,
    getAdjacentSectorIds: delegate('getAdjacentSectorIds'),
    areAdjacentSectors: delegate('areAdjacentSectors'),
    canPlayerSeeSector: delegate('canPlayerSeeSector'),
    markSectorExplored: delegate('markSectorExplored'),
    updateSector2: delegate('updateSector2'),
    updateSector: delegate('updateSector'),
    probeSector: delegate('probeSector'),
    moveFleet: delegate('moveFleet'),
    preMoveFleet: delegate('preMoveFleet'),
    surroundShips: delegate('surroundShips'),
    sendMultiMoveOptions: delegate('sendMultiMoveOptions')
};
