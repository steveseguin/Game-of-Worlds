const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server/server');
const { MockDatabase } = require('../server/lib/mock-db');
function connection() { return { name: 7, gameid: 96, sent: [], sendUTF(message) { this.sent.push(String(message)); } }; }
const query = (db, sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
for (const [label, command, multi] of [
    ['self move', '//move:1:1:3:1', false],
    ['extra single fields', '//move:1:2:3:1:ignored', false],
    ['self multi move', '//sendmmf:1:1:3:1', true],
    ['truncated multi move', '//sendmmf:5:1:3:1:2:3', true],
    ['extra multi field', '//sendmmf:5:1:3:1:ignored', true]
]) {
    test(`${label} is rejected before charging or moving any hulls`, async () => {
        server.gameState.activeGames[96] = { mapSize: { width: 14, height: 8 } };
        server.setDatabase({ isMock: true, query() { assert.fail('invalid move reached database'); } });
        const c = connection();
        if (multi) server.preMoveFleet(command, c); else await server.moveFleet(command, c);
        assert.match(c.sent[0], /^Error: Invalid fleet order/);
        delete server.gameState.activeGames[96];
    });
}
async function seed() {
    const db = new MockDatabase(); server.setDatabase(db);
    server.gameState.activeGames[96] = { mapSize: { width: 14, height: 8 } };
    await query(db, 'INSERT INTO players96 (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)', [7, 1, 0, 1000, 0]);
    await query(db, 'UPDATE map96 SET type = ?, owner = NULL WHERE sectorid = ?', [2, 2]);
    await query(db, 'INSERT INTO ships96 (owner, type, sectorid) VALUES (?, ?, ?)', [7, 3, 1]);
    return db;
}
async function run(multi, c) {
    if (!multi) return server.moveFleet('//move:1:5:3:1', c);
    server.preMoveFleet('//sendmmf:5:1:3:1', c);
    for (let i = 0; i < 40; i++) await new Promise(resolve => setImmediate(resolve));
}
for (const multi of [false, true]) {
    test(`${multi ? 'multi' : 'single'} fleet destroyed in transit cannot reveal its unvisited destination`, async () => {
        const db = await seed(); const c = connection();
        try {
            await run(multi, c);
            assert.equal(db._ships.get(96).length, 0);
            const explored = await query(db, 'SELECT sectorid FROM explored_sectors96 WHERE playerid = ?', [7]);
            assert.ok(explored.some(row => row.sectorid === 2), 'the fatal black hole is discovered');
            assert.equal(explored.some(row => row.sectorid === 5), false, 'unvisited destination must remain unknown');
        } finally { delete server.gameState.activeGames[96]; }
    });
    test(`${multi ? 'multi' : 'single'} movement rolls back instead of treating missing route data as safe`, async () => {
        const db = await seed(); const c = connection();
        const original = db.query.bind(db);
        db.query = (sql, params, cb) => {
            if (sql.startsWith('SELECT sectorid, type, owner FROM map96')) return setImmediate(() => cb(null, []));
            original(sql, params, cb);
        };
        try {
            await run(multi, c);
            assert.equal(db._ships.get(96)[0].sectorid, 1);
            const players = await query(db, 'SELECT crystal FROM players96 WHERE userid = ?', [7]);
            assert.equal(players[0].crystal, 1000);
            assert.ok(c.sent.some(message => message.includes('rolled back')));
        } finally { delete server.gameState.activeGames[96]; }
    });
}


for (const transactional of [false, true]) {
    test(`partial departure restores its moved ships before refund (${transactional ? 'transaction' : 'mock'})`, async () => {
        const db = await seed(); const c = connection();
        await query(db, 'INSERT INTO ships96 (owner, type, sectorid) VALUES (?, ?, ?)', [7, 3, 1]);
        const original = db.query.bind(db);
        let rolledBack = false;
        if (transactional) {
            db.getConnection = callback => {
                // Another order moved one selected ship after selection, before this transaction.
                db._ships.get(96)[0].sectorid = 3;
                let snapshot;
                callback(null, {
                    beginTransaction(done) { snapshot = structuredClone(db._ships.get(96)); done(); },
                    query: original,
                    commit() { assert.fail('a partial departure must never commit'); },
                    rollback(done) { rolledBack = true; db._ships.set(96, snapshot); done(); },
                    release() {}
                });
            };
        } else {
            let raced = false;
            db.query = (sql, params, callback) => {
                if (!raced && sql.startsWith('UPDATE ships96 SET sectorid')) {
                    raced = true; db._ships.get(96)[0].sectorid = 3;
                }
                original(sql, params, callback);
            };
        }
        try {
            await server.moveFleet('//move:1:2:3:2', c);
            assert.deepEqual(db._ships.get(96).map(ship => ship.sectorid), [3, 1]);
            const players = await query(db, 'SELECT crystal FROM players96 WHERE userid = ?', [7]);
            assert.equal(players[0].crystal, 1000);
            if (transactional) assert.equal(rolledBack, true);
            assert.ok(c.sent.some(message => message.includes('Fleet changed before movement')));
        } finally { delete server.gameState.activeGames[96]; }
    });
}

test('mock parameterized fleet deletion respects both selected IDs and ownership', async () => {
    const db = new MockDatabase();
    await query(db, 'INSERT INTO ships96 (owner, type, sectorid) VALUES (?, ?, ?)', [7, 3, 1]);
    await query(db, 'INSERT INTO ships96 (owner, type, sectorid) VALUES (?, ?, ?)', [8, 3, 1]);
    const result = await query(db, 'DELETE FROM ships96 WHERE id IN (?,?) AND owner = ?', [1, 2, 7]);
    assert.equal(result.affectedRows, 1);
    assert.equal(db._ships.get(96)[0].owner, 8);
});


for (const multi of [false, true]) {
    test(`${multi ? 'multi' : 'single'} fleet movement reports only hulls that survive transit`, async () => {
        const db = await seed(); const c = connection();
        await query(db, 'UPDATE map96 SET type = ? WHERE sectorid = ?', [1, 2]);
        await query(db, 'UPDATE map96 SET type = ? WHERE sectorid = ?', [0, 5]);
        await query(db, 'INSERT INTO ships96 (owner, type, sectorid) VALUES (?, ?, ?)', [7, 3, 1]);
        const random = Math.random; let rolls = 0;
        Math.random = () => ++rolls === 1 ? 0 : 0.999;
        server.gameState.clients.push(c);
        try {
            if (multi) {
                server.preMoveFleet('//sendmmf:5:1:3:1:1:3:2', c);
            } else {
                await server.moveFleet('//move:1:5:3:2', c);
            }
            for (let i = 0; i < 60; i++) await new Promise(resolve => setImmediate(resolve));
            assert.equal(db._ships.get(96).length, 1);
            const messages = c.sent.filter(message => message.startsWith('fleetmove::'));
            assert.deepEqual(messages, ['fleetmove::1::5::7::1::0']);
        } finally {
            Math.random = random;
            server.gameState.clients.splice(server.gameState.clients.indexOf(c), 1);
            delete server.gameState.activeGames[96];
        }
    });
}


for (const unavailable of [false, true]) {
    test(`transactional departure ${unavailable ? 'refunds on connection failure' : 'commits a complete move'}`, async () => {
        const db = await seed(); const c = connection();
        await query(db, 'UPDATE map96 SET type = ? WHERE sectorid = ?', [0, 2]);
        const original = db.query.bind(db); let committed = false; let released = false;
        db.getConnection = callback => {
            if (unavailable) return callback(new Error('pool unavailable'));
            callback(null, {
                beginTransaction(done) { done(); }, query: original,
                commit(done) { committed = true; done(); },
                rollback() { assert.fail('successful transaction should not roll back'); },
                release() { released = true; }
            });
        };
        try {
            await server.moveFleet('//move:1:2:3:1', c);
            assert.equal(db._ships.get(96)[0].sectorid, unavailable ? 1 : 2);
            const players = await query(db, 'SELECT crystal FROM players96 WHERE userid = ?', [7]);
            assert.equal(players[0].crystal, unavailable ? 1000 : 999);
            assert.equal(committed, !unavailable);
            assert.equal(released, !unavailable);
        } finally { delete server.gameState.activeGames[96]; }
    });
}
