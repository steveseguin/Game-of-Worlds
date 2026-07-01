const test = require('node:test');
const assert = require('node:assert/strict');

const server = require('../server/server');

function resetClientMap() {
    Object.keys(server.gameState.clientMap).forEach(key => delete server.gameState.clientMap[key]);
}

test('disconnecting an old socket does not clear a newer reconnect from clientMap', () => {
    resetClientMap();

    try {
        const oldConnection = { name: '42' };
        const newConnection = { name: '42' };

        server.gameState.clientMap['42'] = newConnection;
        server.handlePlayerDisconnect(oldConnection);

        assert.equal(server.gameState.clientMap['42'], newConnection);

        server.handlePlayerDisconnect(newConnection);
        assert.equal(server.gameState.clientMap['42'], undefined);
    } finally {
        resetClientMap();
    }
});
