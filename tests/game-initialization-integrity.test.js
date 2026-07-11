const test = require('node:test');
const assert = require('node:assert/strict');

const server = require('../server/server');

test('failed MySQL game initialization rolls back before publishing started state', async () => {
    const sqlSeen = [];
    let began = false;
    let committed = false;
    let rolledBack = false;
    let released = false;
    const transactionConnection = {
        beginTransaction(callback) { began = true; callback(null); },
        commit(callback) { committed = true; callback(null); },
        rollback(callback) { rolledBack = true; callback(null); },
        release() { released = true; },
        query(sql, params, callback) {
            sqlSeen.push(String(sql));
            if (/^SELECT userid FROM players1/.test(sql)) {
                callback(null, [{ userid: 7 }]);
                return;
            }
            if (/^INSERT INTO map1/.test(sql)) {
                callback(new Error('simulated map write failure'));
                return;
            }
            callback(new Error(`unexpected query: ${sql}`));
        }
    };
    server.setDatabase({
        isOffline: true,
        getConnection(callback) { callback(null, transactionConnection); },
        query() { assert.fail('initialization should use the transaction connection'); }
    });
    const messages = [];

    await server.initializeGame(1, {
        name: '7',
        sendUTF(message) { messages.push(String(message)); }
    }, { creator: 7, maxplayers: 2, mode: 'quick' });

    assert.equal(began, true);
    assert.equal(committed, false);
    assert.equal(rolledBack, true);
    assert.equal(released, true);
    assert.equal(sqlSeen.some(sql => /^UPDATE games SET started = 1/.test(sql)), false);
    assert.deepEqual(messages, ['Error: Failed to start game']);
});
