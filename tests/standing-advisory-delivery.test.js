const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server/server');

const GAME_ID = 88001;
const LINES = [
    'Standing advisory, this cluster.',
    'Two mouths are charted.',
    'Three shoals recorded.',
    'The old figures favour metal.'
];

function connection(playerId, sendUTF) {
    return {
        gameid: GAME_ID,
        name: String(playerId),
        sendUTF
    };
}

test.afterEach(() => {
    delete server.gameState.activeGames[GAME_ID];
});

test('the complete advisory is delivered only once to each player', () => {
    server.gameState.activeGames[GAME_ID] = {
        advisory: LINES.slice(),
        advisoryDelivered: new Set()
    };
    const first = [];
    const second = [];

    assert.equal(server.deliverStandingAdvisory(connection(10, message => first.push(message))), true);
    assert.equal(server.deliverStandingAdvisory(connection(10, message => first.push(message))), false);
    assert.equal(server.deliverStandingAdvisory(connection(11, message => second.push(message))), true);

    assert.deepEqual(first, LINES.map(line => `advisory::${line}`));
    assert.deepEqual(second, LINES.map(line => `advisory::${line}`));
    assert.deepEqual([...server.gameState.activeGames[GAME_ID].advisoryDelivered], ['10', '11']);
});

test('a failed socket does not consume the player reading', () => {
    server.gameState.activeGames[GAME_ID] = {
        advisory: LINES.slice(),
        advisoryDelivered: new Set()
    };
    let sends = 0;
    const broken = connection(10, () => {
        sends += 1;
        if (sends === 2) throw new Error('socket closed');
    });

    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        assert.equal(server.deliverStandingAdvisory(broken), false);
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(server.gameState.activeGames[GAME_ID].advisoryDelivered.has('10'), false);

    const retry = [];
    assert.equal(server.deliverStandingAdvisory(connection(10, message => retry.push(message))), true);
    assert.deepEqual(retry, LINES.map(line => `advisory::${line}`));
});
