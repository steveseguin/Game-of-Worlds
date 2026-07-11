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
    assert.deepEqual(connection.sent, ['Error: No ships selected']);
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
