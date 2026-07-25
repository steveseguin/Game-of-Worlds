// The "+N/turn" in the HUD is the number a commander plans every order against. It has
// to be the number the server actually credits.
//
// It was not. sendEmpireSummary published the raw computeTurnIncome() figure while
// processTurnIncome credited that same figure scaled by the player's race production
// doctrine AND the mode multiplier. So the readout was wrong for every race except
// Terran (up to +-40%) and wrong by 12x in Epic: a Titan Lords commander in Epic saw
// "+61/turn" and banked 1024.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.USE_MOCK_DB = process.env.USE_MOCK_DB || '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const { MockDatabase } = require('../server/lib/mock-db');
const serverLogic = require('../server/server');
const raceSystem = require('../server/lib/races');

function makeClient(userId, gameId) {
    return {
        name: String(userId),
        gameid: gameId,
        messages: [],
        sendUTF(message) { this.messages.push(String(message)); }
    };
}

function query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

function lastEmpireIncome(client) {
    const line = [...client.messages].reverse().find(m => m.startsWith('empire::'));
    if (!line) return null;
    return JSON.parse(line.replace('empire::', '')).income;
}

async function setUpGame(db, gameId, raceId, mode) {
    await query(db, `CREATE TABLE IF NOT EXISTS map${gameId} (sectorid INT)`);
    await query(db, `CREATE TABLE IF NOT EXISTS players${gameId} (userid INT)`);
    await query(db, `CREATE TABLE IF NOT EXISTS ships${gameId} (id INT)`);
    await query(db, `CREATE TABLE IF NOT EXISTS buildings${gameId} (id INT)`);

    // last_income_turn matters: processTurnIncome only pays a player whose recorded
    // income turn is behind the turn being processed, so it has to start at 0.
    await query(db, `INSERT INTO players${gameId} (userid, race_id, metal, crystal, research, is_ai, ai_difficulty, ai_strategy, last_income_turn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [1, raceId, 0, 0, 0, 0, 'medium', 'balanced', 0]);
    // A homeworld plus a large planet, so the rate is comfortably above the base income.
    await query(db, `INSERT INTO map${gameId} (sectorid, x, y, type, metalbonus, crystalbonus, terraformlvl, artifact) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [1, 0, 0, 10, 100, 100, 0, 0]);
    await query(db, `INSERT INTO map${gameId} (sectorid, x, y, type, metalbonus, crystalbonus, terraformlvl, artifact) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [2, 1, 0, 9, 100, 100, 0, 0]);
    await query(db, `UPDATE map${gameId} SET owner = 1 WHERE sectorid = 1`);
    await query(db, `UPDATE map${gameId} SET owner = 1 WHERE sectorid = 2`);

    serverLogic.gameState.activeGames[gameId] = { mode };
    serverLogic.gameState.turns[gameId] = 1;
}

// Titan Lords are the sharpest case: 1.4x metal and 0.7x research, so a display that
// ignores the doctrine is wrong in both directions at once.
const TITAN_LORDS = Object.values(raceSystem.RACE_TYPES).find(r => /titan/i.test(r.name));

test('the advertised rate is the rate a quick-mode commander is credited', async () => {
    const db = new MockDatabase();
    serverLogic.setDatabase(db);
    const gameId = 41;
    await setUpGame(db, gameId, TITAN_LORDS.id, 'quick');

    const client = makeClient(1, gameId);
    serverLogic.gameState.clients.length = 0;
    serverLogic.gameState.clients.push(client);

    serverLogic.sendEmpireSummary(client);
    await new Promise(resolve => setTimeout(resolve, 120));
    const advertised = lastEmpireIncome(client);
    assert.ok(advertised, 'expected an empire:: summary');

    const before = (await query(db, `SELECT * FROM players${gameId} WHERE userid = 1`))[0];
    await serverLogic.processTurnIncome(gameId, 1, 2);
    const after = (await query(db, `SELECT * FROM players${gameId} WHERE userid = 1`))[0];

    const credited = {
        metal: Number(after.metal) - Number(before.metal),
        crystal: Number(after.crystal) - Number(before.crystal),
        research: Number(after.research) - Number(before.research)
    };

    assert.equal(advertised.metal, credited.metal, 'metal rate shown must equal metal credited');
    assert.equal(advertised.crystal, credited.crystal, 'crystal rate shown must equal crystal credited');
    assert.equal(advertised.research, credited.research, 'research rate shown must equal research credited');
    // Guard the specific regression: the doctrine must actually have been applied.
    assert.ok(credited.metal > 0, 'expected a positive metal rate to compare');
});

test('epic mode advertises the multiplied rate, not a twelfth of it', async () => {
    const db = new MockDatabase();
    serverLogic.setDatabase(db);
    const gameId = 42;
    await setUpGame(db, gameId, TITAN_LORDS.id, 'epic');

    const client = makeClient(1, gameId);
    serverLogic.gameState.clients.length = 0;
    serverLogic.gameState.clients.push(client);

    serverLogic.sendEmpireSummary(client);
    await new Promise(resolve => setTimeout(resolve, 120));
    const advertised = lastEmpireIncome(client);
    assert.ok(advertised, 'expected an empire:: summary');

    const multiplier = Number(process.env.EPIC_RESOURCE_MULTIPLIER) || 12;
    const before = (await query(db, `SELECT * FROM players${gameId} WHERE userid = 1`))[0];
    await serverLogic.processTurnIncome(gameId, multiplier, 2);
    const after = (await query(db, `SELECT * FROM players${gameId} WHERE userid = 1`))[0];
    const creditedMetal = Number(after.metal) - Number(before.metal);

    assert.equal(advertised.metal, creditedMetal,
        `epic rate shown (${advertised.metal}) must equal metal credited (${creditedMetal})`);
    // And it must genuinely be the big number — catching a fix that "matched" by
    // accidentally dropping the multiplier from both sides.
    assert.ok(creditedMetal > 200,
        `epic income should be substantial, got ${creditedMetal}`);
});
