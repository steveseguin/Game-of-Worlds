const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server/server');
const { MockDatabase } = require('../server/lib/mock-db');
const query = (db, sql, params = []) => new Promise((resolve, reject) => db.query(sql, params,
    (err, rows) => err ? reject(err) : resolve(rows)));
for (const hazard of [1, 2]) {
    test(`hazard ${hazard} losses are visible to nearby observers but not distant enemies`, async () => {
        const db = new MockDatabase(); server.setDatabase(db);
        const id = 97;
        server.gameState.activeGames[id] = { mapSize: { width: 14, height: 8 } };
        const make = (name, gameid = id) => ({ name, gameid, sent: [], sendUTF(message) { this.sent.push(message); } });
        const mover = make(7), observer = make(8, String(id)), hidden = make(9);
        server.gameState.clients.push(mover, observer, hidden);
        const random = Math.random;
        try {
            for (const player of [7, 8, 9]) await query(db, `INSERT INTO players${id} (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)`, [player, 1, 100, 1000, 0]);
            await query(db, `UPDATE map${id} SET type = ?, owner = NULL WHERE sectorid = ?`, [hazard, 2]);
            await query(db, `UPDATE map${id} SET owner = ? WHERE sectorid = ?`, [8, 3]);
            await query(db, `UPDATE map${id} SET owner = ? WHERE sectorid = ?`, [9, 112]);
            await query(db, `INSERT INTO ships${id} (owner, type, sectorid) VALUES (?, ?, ?)`, [7, 3, 1]);
            Math.random = () => 0; // force an asteroid loss
            await server.moveFleet('//move:1:2:3:1', mover);
            for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
            const report = message => /An enemy fleet/.test(message);
            assert.ok(observer.sent.some(report), 'nearby observer should receive the loss report');
            assert.equal(hidden.sent.some(report), false, 'distant player must not learn the fleet location');
        } finally {
            Math.random = random;
            for (const client of [mover, observer, hidden]) server.gameState.clients.splice(server.gameState.clients.indexOf(client), 1);
            delete server.gameState.activeGames[id];
        }
    });
}
