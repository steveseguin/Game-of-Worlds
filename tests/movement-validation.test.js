const test = require('node:test');
const assert = require('node:assert/strict');

const server = require('../server/server');

function makeConnection(overrides = {}) {
    const sent = [];
    return {
        name: '7',
        gameid: 1,
        sent,
        sendUTF(message) {
            sent.push(message);
        },
        ...overrides
    };
}

function setDb(db) {
    server.gameState.activeGames[1] = { mapSize: { width: 14, height: 8 } };
    server.setDatabase({
        isMock: true,
        query(sql, params, callback) {
            db.query(sql, params, callback);
        }
    });
}

test('moveFleet rejects missing ship fields before database access', () => {
    setDb({
        query() {
            assert.fail('malformed move should not query the database');
        }
    });

    const connection = makeConnection();

    assert.doesNotThrow(() => server.moveFleet('//move:1:2', connection));
    assert.deepEqual(connection.sent, ['Error: Invalid fleet order']);
});

test('moveFleet rejects partial hexadecimal sector tokens', () => {
    setDb({
        query() {
            assert.fail('invalid sector token should not query the database');
        }
    });

    const connection = makeConnection();

    server.moveFleet('//move:1zz:2:3:1', connection);
    assert.deepEqual(connection.sent, ['Error: Invalid fleet order']);
});

test('moveFleet rejects an off-map destination before charging or moving ships', () => {
    setDb({ query() { assert.fail('off-map move should not query the database'); } });
    const connection = makeConnection();

    server.moveFleet('//move:1:ffff:3:1', connection);

    assert.deepEqual(connection.sent, ['Error: Invalid fleet order']);
});

test('moveFleet does not reject a supported large-map sector while runtime restoration is pending', async () => {
    setDb({
        query(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            if (/^SELECT sectorid FROM map1/.test(sql)) return callback(null, [{ sectorid: 1 }, { sectorid: 120 }]);
            if (/^SELECT sectorid, owner FROM map1/.test(sql)) return callback(null, []);
            if (/^SELECT crystal, tech FROM players1/.test(sql)) return callback(new Error('startup still restoring'));
            assert.fail(`unexpected query: ${sql}`);
        }
    });
    delete server.gameState.activeGames[1];
    const connection = makeConnection();

    await server.moveFleet('//move:1:78:3:1', connection); // hex 0x78 = sector 120

    assert.deepEqual(connection.sent, ['Error: Could not get player data']);
});

test('moveFleet reports restoration lookup failures as temporarily unavailable', async () => {
    setDb({ query(sql, params, callback) { callback(new Error('database unavailable')); } });
    delete server.gameState.activeGames[1];
    const connection = makeConnection();

    await server.moveFleet('//move:1:78:3:1', connection);

    assert.deepEqual(connection.sent, ['Error: Map validation is temporarily unavailable; try again']);
});

test('probeSector rejects sector zero before charging crystal', () => {
    setDb({
        query() {
            assert.fail('invalid probe sector should not query the database');
        }
    });

    const connection = makeConnection();

    server.probeSector('//probe:0', connection);
    assert.deepEqual(connection.sent, ['Error: Invalid sector']);
});

test('preMoveFleet rejects malformed triplet tokens before database access', () => {
    setDb({
        query() {
            assert.fail('malformed multi-move should not query the database');
        }
    });

    const connection = makeConnection();

    server.preMoveFleet('//sendmmf:2:1:3zz:1', connection);
    assert.deepEqual(connection.sent, ['Error: Invalid fleet order']);
});

test('preMoveFleet rejects off-map targets and sources before database access', () => {
    setDb({ query() { assert.fail('off-map multi-move should not query the database'); } });
    const targetConnection = makeConnection();
    const sourceConnection = makeConnection();

    server.preMoveFleet('//sendmmf:ffff:1:3:1', targetConnection);
    server.preMoveFleet('//sendmmf:2:ffff:3:1', sourceConnection);

    assert.deepEqual(targetConnection.sent, ['Error: Invalid fleet order']);
    assert.deepEqual(sourceConnection.sent, ['Error: Invalid fleet order']);
});

test('moveFleet rejects over-requested ship counts before moving a partial fleet', () => {
    const queries = [];
    setDb({
        query(sql, params, callback) {
            queries.push(sql);
            if (sql.startsWith('SELECT crystal, tech FROM players1')) {
                callback(null, [{ crystal: 1000, tech: '' }]);
                return;
            }
            if (sql.startsWith('SELECT id, type FROM ships1')) {
                callback(null, [{ id: 10, type: 3 }]);
                return;
            }
            assert.fail(`unexpected query after over-request validation: ${sql}`);
        }
    });

    const connection = makeConnection();

    server.moveFleet('//move:1:2:3:2', connection);

    assert.deepEqual(connection.sent, ['Error: Not enough ships in sector 1']);
    assert.equal(queries.some(sql => sql.startsWith('UPDATE ships1')), false);
});

test('moveFleet does not move ships when the guarded crystal charge loses a race', () => {
    const queries = [];
    setDb({
        query(sql, params, callback) {
            queries.push(sql);
            if (sql.startsWith('SELECT crystal, tech FROM players1')) {
                callback(null, [{ crystal: 1000, tech: '' }]);
                return;
            }
            if (sql.startsWith('SELECT id, type FROM ships1')) {
                callback(null, [{ id: 10, type: 3 }]);
                return;
            }
            if (sql.startsWith('UPDATE players1 SET crystal = crystal -')) {
                callback(null, { affectedRows: 0 });
                return;
            }
            assert.fail(`unexpected query: ${sql}`);
        }
    });
    const connection = makeConnection();

    server.moveFleet('//move:1:2:3:1', connection);

    assert.deepEqual(connection.sent, ['Error: Not enough crystal for movement (need 1)']);
    assert.equal(queries.some(sql => sql.startsWith('UPDATE ships1')), false);
});

test('moveFleet refunds crystal when the selected fleet changed before its write', () => {
    const queries = [];
    setDb({
        query(sql, params, callback) {
            queries.push(sql);
            if (sql.startsWith('SELECT crystal, tech FROM players1')) {
                callback(null, [{ crystal: 1000, tech: '' }]);
                return;
            }
            if (sql.startsWith('SELECT id, type FROM ships1')) {
                callback(null, [{ id: 10, type: 3 }]);
                return;
            }
            if (sql.startsWith('UPDATE players1 SET crystal = crystal -')) {
                callback(null, { affectedRows: 1 });
                return;
            }
            if (sql.startsWith('UPDATE ships1 SET sectorid =')) {
                callback(null, { affectedRows: 0 });
                return;
            }
            if (sql.startsWith('UPDATE players1 SET crystal = crystal +')) {
                callback(null, { affectedRows: 1 });
                return;
            }
            if (sql.startsWith('SELECT metal, crystal, research FROM players1')) {
                callback(null, [{ metal: 0, crystal: 1000, research: 0 }]);
                return;
            }
            assert.fail(`unexpected query: ${sql}`);
        }
    });
    const connection = makeConnection();

    server.moveFleet('//move:1:2:3:1', connection);

    assert.ok(connection.sent.includes('Error: Fleet changed before movement; crystal refunded'));
    assert.equal(queries.some(sql => sql.startsWith('UPDATE players1 SET crystal = crystal +')), true);
});
