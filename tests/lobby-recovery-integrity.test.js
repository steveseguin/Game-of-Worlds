const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server/server');

test.afterEach(() => {
    if (server.gameState.gameTimer[91]) clearInterval(server.gameState.gameTimer[91]);
    delete server.gameState.gameTimer[91];
    delete server.gameState.activeGames[91];
    delete server.gameState.turns[91];
});

function connection() {
    return { name: 7, gameid: 91, raceid: 1, sent: [], sendUTF(message) { this.sent.push(message); } };
}
function install(handler) {
    server.setDatabase({ isMock: true, query(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        if (sql.startsWith('SHOW COLUMNS')) return callback(null, [{ Field: 'present' }]);
        handler(sql, params, callback);
    } });
}
for (const failure of ['game', 'player', 'count', 'schema']) {
    test(`reconnect preserves membership after a ${failure} lookup failure`, async () => {
        const c = connection();
        server.setDatabase({ isMock: true, query(sql, params, callback) {
            if (typeof params === 'function') { callback = params; params = []; }
            if (sql.startsWith('SELECT * FROM games')) return callback(failure === 'game' ? new Error('outage') : null, [{ id: 91, started: 0 }]);
            if (sql.startsWith('SHOW COLUMNS')) return callback(failure === 'schema' ? new Error('outage') : null, [{}]);
            if (sql.startsWith('SELECT * FROM players')) return callback(failure === 'player' ? new Error('outage') : null, [{ userid: 7, race_id: 1 }]);
            if (sql.startsWith('SELECT COUNT')) return callback(new Error('outage'));
            assert.fail(`unexpected membership write: ${sql}`);
        } });
        await new Promise(resolve => server.handleCurrentGame(c, (error, payload) => {
            assert.match(error.message, /outage/); assert.equal(payload, null); resolve();
        }));
        assert.equal(c.gameid, 91);
        assert.equal(c.raceid, 1);
        assert.deepEqual(c.sent, ['Error: Current game is temporarily unavailable; please try again']);
    });
}
for (const status of ['completed', 'abandoned']) {
    test(`reconnecting to a ${status} game cannot resurrect its turn timer`, () => {
        const c = connection();
        install((sql, params, callback) => {
            if (sql.startsWith('SELECT * FROM games')) return callback(null, [{ id: 91, started: 1, status }]);
            if (sql.startsWith('UPDATE users SET currentgame')) return callback(null, { affectedRows: 1 });
            if (sql.includes('FROM games')) return callback(null, []); // refreshed lobby list
            assert.fail(`terminal game must not be restored: ${sql}`);
        });
        server.handleCurrentGame(c);
        assert.equal(c.gameid, null);
        assert.ok(c.sent.includes('currentgame::null'));
        assert.equal(server.gameState.gameTimer[91], undefined);
    });
}
test('startup player lookup failure cannot abandon a persisted game', async () => {
    install((sql, params, callback) => {
        if (sql.includes('FROM games')) return callback(null, [{ id: 91, started: 1, status: 'in-progress' }]);
        if (sql.startsWith('SELECT userid, is_ai')) return callback(new Error('temporary player outage'));
        assert.fail(`startup must not write abandonment: ${sql}`);
    });
    assert.equal(await server.resumeActiveGamesFromDatabase(), 0);
});
for (const failure of ['lookup', 'delete']) {
    test(`failed leave ${failure} does not detach the player or delete their empire`, () => {
        const c = connection();
        install((sql, params, callback) => {
            if (sql.startsWith('SELECT creator')) return callback(failure === 'lookup' ? new Error('outage') : null, [{ started: 1, creator: 7 }]);
            if (sql.startsWith('DELETE FROM players')) return callback(new Error('outage'));
            assert.fail(`unexpected destructive write: ${sql}`);
        });
        server.handleLeaveGame(c);
        assert.equal(c.gameid, 91);
        assert.equal(c.raceid, 1);
        assert.match(c.sent[0], /Unable to leave/);
    });
}
for (const status of ['in-progress', 'completed', 'abandoned']) {
    test(`race changes are rejected in ${status} games`, () => {
        const c = connection();
        install((sql, params, callback) => {
            if (sql.startsWith('SELECT started')) return callback(null, [{ started: 1, status }]);
            assert.fail(`race change must not proceed: ${sql}`);
        });
        server.handleChangeRace('//changerace:2', c);
        assert.equal(c.raceid, 1);
        assert.match(c.sent[0], /only allowed before/);
    });
}
test('race changes reject partial or missing IDs instead of selecting a default race', () => {
    install(() => assert.fail('malformed race must not query database'));
    for (const data of ['//changerace:', '//changerace:2junk', '//changerace:0', '//changerace:99', '//changerace:2:3']) {
        const c = connection();
        server.handleChangeRace(data, c);
        assert.match(c.sent[0], /Invalid race/);
    }
});
test('joining cannot treat a membership lookup outage as a new player', () => {
    const c = connection(); c.gameid = null;
    install((sql, params, callback) => {
        if (sql.includes('FROM games')) return callback(null, [{ id: 91, started: 0 }]);
        if (sql.startsWith('SELECT * FROM players')) return callback(new Error('outage'));
        assert.fail(`join must stop before reserving another seat: ${sql}`);
    });
    server.handleJoinGame('//joingame:91:1', c);
    assert.match(c.sent[0], /Unable to verify game membership/);
    assert.equal(c.gameid, null);
});

for (const status of ['completed', 'abandoned']) {
    test(`start command cannot restart a ${status} game`, () => {
        const c = connection();
        install((sql, params, callback) => {
            if (sql.includes('FROM games')) return callback(null, [{ id: 91, started: 1, status, creator: 7 }]);
            assert.fail(`terminal game must not start: ${sql}`);
        });
        server.handleGameStart(c);
        assert.deepEqual(c.sent, ['Error: This game has ended']);
        assert.equal(server.gameState.gameTimer[91], undefined);
    });
}


test('game start waits for an in-flight race change to settle', () => {
    const c = connection();
    let releaseRaceLookup;
    install((sql, params, callback) => {
        if (sql.startsWith('SELECT started, status')) { releaseRaceLookup = callback; return; }
        if (sql.startsWith('SELECT id, creator')) return callback(null, [{ id: 91, creator: 7, started: 0 }]);
        assert.fail(`game initialization must wait: ${sql}`);
    });
    server.handleChangeRace('//changerace:2', c);
    server.handleGameStart(c);
    assert.match(c.sent[0], /still joining/);
    releaseRaceLookup(new Error('test cleanup'));
    assert.match(c.sent[1], /Unable to load game/);
});
