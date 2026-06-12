const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server/server');
const { MockDatabase } = require('../server/lib/mock-db');

test('epic defaults enable standing orders', () => {
    const defaults = server.defaultStandingOrders('epic');
    assert.equal(defaults.autoRebuild, true);
    assert.equal(defaults.autoScout, true);
});

test('standing orders build econ and scouts when resources allow', async () => {
    const db = new MockDatabase();
    server.setDatabase(db);

    const gameId = 1;
    // Seed game + player + map ownership
    await new Promise(res => db.query(
        'INSERT INTO games (name, creator, maxplayers, status, mode) VALUES (?, ?, ?, ?, ?)',
        ['Test', 1, 4, 'waiting', 'epic'],
        res
    ));
    await new Promise(res => db.query(
        `INSERT INTO players${gameId} (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)`,
        [1, 1, 500, 200, 50],
        res
    ));
    await new Promise(res => db.query(
        `UPDATE players${gameId} SET homeworld = ?, currentsector = ? WHERE userid = ?`,
        [1, 1, 1],
        res
    ));
    await new Promise(res => db.query(
        `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`,
        [1, 1],
        res
    ));
    // Spaceport so scouts can be built
    await new Promise(res => db.query(
        `INSERT INTO buildings${gameId} (sectorid, type, owner) VALUES (?, ?, ?)`,
        [1, 3, 1],
        res
    ));

    server.gameState.activeGames[gameId] = {
        mode: 'epic',
        standingOrders: {
            1: { autoRebuild: true, autoScout: true, targetScouts: 2 }
        }
    };

    const summary = await server.applyStandingOrdersForPlayer(gameId, 1);
    assert.ok(summary.length >= 2, 'summary should include built items');

    const playerRows = await new Promise((resolve, reject) => {
        db.query(`SELECT metal, crystal FROM players${gameId} WHERE userid = ?`, [1], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    assert.ok(playerRows[0].metal < 500, 'metal spent on standing orders');

    const buildings = await new Promise((resolve, reject) => {
        db.query(`SELECT type FROM buildings${gameId} WHERE sectorid = ? AND owner = ?`, [1, 1], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
    const types = buildings.map(b => b.type);
    assert.ok(types.includes(0), 'built metal extractor');
    assert.ok(types.includes(1), 'built crystal refinery');

    const ships = await new Promise((resolve, reject) => {
        db.query(`SELECT COUNT(*) as count FROM ships${gameId} WHERE owner = ? AND type = ?`, [1, 3], (err, rows) => {
            if (err) reject(err);
            else resolve(rows[0].count);
        });
    });
    assert.ok(ships >= 1, 'built scout for vision');
});
