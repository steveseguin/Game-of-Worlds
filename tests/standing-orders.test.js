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
        `UPDATE map${gameId} SET owner = ?, type = 10 WHERE sectorid = ?`,
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
            // `configured` is what setStandingOrders stamps when a player chooses these in
            // the Standing Orders panel. A human without it is left alone — see the
            // consent tests below — so seeding orders as if they had been chosen is what
            // this test means by "a player who has standing orders".
            1: { autoRebuild: true, autoScout: true, targetScouts: 2, configured: true }
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

// Consent. applyStandingOrdersForGame runs over EVERY player, and defaultStandingOrders
// turns autoRebuild and autoScout ON in Epic — so before this rule a human in an Epic game
// had metal and crystal spent for them by settings with no panel and no off switch. The
// client comment claimed the feature was "kept for AI", but nothing had ever restricted it
// to AI. AI still runs on mode defaults; a human is left alone until they choose.

/** Stand up an Epic game with one player, seeded orders, and a spaceport. */
async function seedGame(gameId, { isAi, orders }) {
    const db = new MockDatabase();
    server.setDatabase(db);
    const run = (sql, params) => new Promise(res => db.query(sql, params, res));

    await run('INSERT INTO games (name, creator, maxplayers, status, mode) VALUES (?, ?, ?, ?, ?)',
        ['Consent', 1, 4, 'waiting', 'epic']);
    await run(`INSERT INTO players${gameId} (userid, race_id, metal, crystal, research, is_ai) VALUES (?, ?, ?, ?, ?, ?)`,
        [1, 1, 500, 200, 50, isAi ? 1 : 0]);
    await run(`UPDATE players${gameId} SET homeworld = ?, currentsector = ? WHERE userid = ?`, [1, 1, 1]);
    await run(`UPDATE map${gameId} SET owner = ?, type = 10 WHERE sectorid = ?`, [1, 1]);
    await run(`INSERT INTO buildings${gameId} (sectorid, type, owner) VALUES (?, ?, ?)`, [1, 3, 1]);

    server.gameState.activeGames[gameId] = { mode: 'epic', standingOrders: { 1: orders } };
    return db;
}

function spentMetal(db, gameId) {
    return new Promise((resolve, reject) => {
        db.query(`SELECT metal FROM players${gameId} WHERE userid = ?`, [1], (err, rows) => {
            if (err) reject(err); else resolve(500 - Number(rows[0].metal));
        });
    });
}

test('a human is not automated until they ask for it', async () => {
    const gameId = 41;
    // Exactly what the Epic mode defaults produce, but never chosen by the player.
    const db = await seedGame(gameId, {
        isAi: false,
        orders: { autoRebuild: true, autoScout: true, targetScouts: 2 }
    });

    const summary = await server.applyStandingOrdersForPlayer(gameId, 1);

    assert.deepEqual(summary, [], 'nothing should be built for a human who never opted in');
    assert.equal(await spentMetal(db, gameId), 0, 'no resources may be spent uninvited');
});

test('a human who configures standing orders does get them', async () => {
    const gameId = 42;
    const db = await seedGame(gameId, {
        isAi: false,
        orders: { autoRebuild: true, autoScout: true, targetScouts: 2, configured: true }
    });

    const summary = await server.applyStandingOrdersForPlayer(gameId, 1);

    assert.ok(summary.length > 0, 'a player who asked for automation should get it');
    assert.ok(await spentMetal(db, gameId) > 0, 'and it should spend their resources');
});

test('AI still runs on mode defaults without configuring anything', async () => {
    const gameId = 43;
    const db = await seedGame(gameId, {
        isAi: true,
        orders: { autoRebuild: true, autoScout: true, targetScouts: 2 }
    });

    const summary = await server.applyStandingOrdersForPlayer(gameId, 1);

    assert.ok(summary.length > 0, 'the AI must keep its automation - it has no panel to click');
    assert.ok(await spentMetal(db, gameId) > 0);
});

test('setStandingOrders stamps consent, so the panel is the way in', () => {
    const gameId = 44;
    server.gameState.activeGames[gameId] = { mode: 'quick', standingOrders: {} };
    const saved = server.setStandingOrders(gameId, 1, { autoRebuild: true, autoScout: false, targetScouts: 3 });
    assert.equal(saved.configured, true, 'choosing orders must mark them as chosen');
    assert.equal(saved.autoRebuild, true);
    assert.equal(saved.targetScouts, 3);
});

function query(db, sql, params = []) {
    return new Promise((resolve, reject) => db.query(sql, params,
        (err, rows) => err ? reject(err) : resolve(rows)));
}

async function seedAutomatedGame(gameId, overrides = {}) {
    return seedGame(gameId, { isAi: false, orders: {
        configured: true, autoRebuild: false, autoScout: true, targetScouts: 2, ...overrides
    } });
}

test('standing orders cannot overfill a homeworld with economy buildings', async () => {
    const id = 51;
    const db = await seedAutomatedGame(id, { autoRebuild: true, autoScout: false });
    for (let i = 0; i < 5; i++) {
        await query(db, `INSERT INTO buildings${id} (sectorid, type, owner) VALUES (?, ?, ?)`, [1, 2, 1]);
    }
    assert.deepEqual(await server.applyStandingOrdersForPlayer(id, 1), []);
    assert.equal(await spentMetal(db, id), 0);
    const rows = await query(db, `SELECT COUNT(*) as count FROM buildings${id} WHERE sectorid = ?`, [1]);
    assert.equal(rows[0].count, 6);
});

test('standing scouts consume local production capacity and stop when exhausted', async () => {
    const id = 52;
    const db = await seedAutomatedGame(id);
    server.gameState.turns[id] = 1;
    await query(db, `UPDATE buildings${id} SET production_turn = ?, production_used = 0 WHERE id = ? AND production_turn <> ?`, [1, 1, 1]);
    await query(db, `UPDATE buildings${id} SET production_used = production_used + ? WHERE id = ? AND owner = ? AND production_turn = ? AND production_used + ? <= ?`, [12, 1, 1, 1, 12, 12]);
    assert.deepEqual(await server.applyStandingOrdersForPlayer(id, 1), []);
    assert.equal(await spentMetal(db, id), 0);
    server.gameState.turns[id] = 2;
    assert.equal((await server.applyStandingOrdersForPlayer(id, 1)).length, 1);
    const ports = await query(db, `SELECT type, level, production_turn, production_used FROM buildings${id} WHERE sectorid = ?`, [1]);
    assert.equal(ports[0].production_used, require('../server/lib/combat').SHIP_TYPES.SCOUT.buildSlots);
});

test('standing scouts use race-adjusted costs', async () => {
    const id = 53;
    const db = await seedAutomatedGame(id);
    const races = require('../server/lib/races');
    const scout = require('../server/lib/combat').SHIP_TYPES.SCOUT;
    const race = Object.values(races.RACE_TYPES).find(r =>
        races.canRaceBuildShip(r.id, scout.id) &&
        races.applyShipModifiers(r.id, scout.id, scout).cost.metal !== scout.cost.metal);
    assert.ok(race);
    await query(db, `UPDATE players${id} SET race_id = ? WHERE userid = ?`, [race.id, 1]);
    assert.equal((await server.applyStandingOrdersForPlayer(id, 1)).length, 1);
    assert.equal(await spentMetal(db, id), races.applyShipModifiers(race.id, scout.id, scout).cost.metal);
});

test('overlapping standing-order runs do not duplicate construction', async () => {
    const id = 54;
    const db = await seedAutomatedGame(id, { autoRebuild: true });
    const summaries = await Promise.all([
        server.applyStandingOrdersForPlayer(id, 1), server.applyStandingOrdersForPlayer(id, 1)
    ]);
    assert.deepEqual(summaries[1], []);
    const rows = await query(db, `SELECT type FROM buildings${id} WHERE sectorid = ?`, [1]);
    assert.equal(rows.filter(row => row.type === 0).length, 1);
    assert.equal(rows.filter(row => row.type === 1).length, 1);
});
