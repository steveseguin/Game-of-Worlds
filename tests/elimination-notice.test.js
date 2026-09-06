// A player who loses their last world AND their last ship has no legal move left:
// nothing to build from, nothing to move, nothing to colonise with. The game used to
// leave them sitting in front of a running turn clock with no message at all.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.USE_MOCK_DB = process.env.USE_MOCK_DB || '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const { MockDatabase } = require('../server/lib/mock-db');
const serverLogic = require('../server/server');

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

test('a player stripped of every world and ship is told their empire has fallen', async () => {
    const db = new MockDatabase();
    serverLogic.setDatabase(db);
    const gameId = 1;

    await query(db, `CREATE TABLE IF NOT EXISTS map${gameId} (sectorid INT)`);
    await query(db, `CREATE TABLE IF NOT EXISTS players${gameId} (userid INT)`);
    await query(db, `CREATE TABLE IF NOT EXISTS ships${gameId} (id INT)`);

    // Two commanders. Player 1 holds a world; player 2 holds nothing at all.
    await query(db, `INSERT INTO players${gameId} (userid, race_id, metal, crystal, research, is_ai, ai_difficulty, ai_strategy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [1, 1, 0, 0, 0, 0, 'medium', 'balanced']);
    await query(db, `INSERT INTO players${gameId} (userid, race_id, metal, crystal, research, is_ai, ai_difficulty, ai_strategy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [2, 1, 0, 0, 0, 0, 'medium', 'balanced']);
    await query(db, `INSERT INTO map${gameId} (sectorid, x, y, type, metalbonus, crystalbonus, terraformlvl, artifact) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [1, 0, 0, 10, 100, 100, 0, 0]);
    await query(db, `UPDATE map${gameId} SET owner = 1 WHERE sectorid = 1`);

    const survivor = makeClient(1, gameId);
    const fallen = makeClient(2, gameId);
    serverLogic.gameState.clients.push(survivor, fallen);

    try {
        await serverLogic.notifyEliminatedPlayers(gameId);

        const defeat = fallen.messages.find(m => m.startsWith('gameover::'));
        assert.ok(defeat, 'the eliminated player should receive a game-over notice');
        assert.match(decodeURIComponent(defeat), /empire has fallen/i);
        assert.equal(fallen.gameid, null, 'the eliminated player should be detached from the game');

        assert.ok(
            survivor.messages.some(m => m.includes('wiped out')),
            'survivors should be told a rival fell'
        );
        assert.ok(
            !survivor.messages.some(m => m.startsWith('gameover::')),
            'a player who still holds a world is not eliminated'
        );

        // Idempotent: a second sweep must not spam an already-eliminated player.
        fallen.messages.length = 0;
        survivor.messages.length = 0;
        await serverLogic.notifyEliminatedPlayers(gameId);
        assert.equal(fallen.messages.length, 0, 'elimination should only be announced once');
        assert.equal(survivor.messages.length, 0, 'survivors should not be re-notified');
    } finally {
        [survivor, fallen].forEach(client => {
            const index = serverLogic.gameState.clients.indexOf(client);
            if (index >= 0) serverLogic.gameState.clients.splice(index, 1);
        });
        delete serverLogic.gameState.activeGames[gameId];
    }
});


test('a fleet lookup outage cannot eliminate a player or clear their current game', async () => {
    const id = 72;
    const client = makeClient(7, id);
    serverLogic.gameState.clients.push(client);
    serverLogic.gameState.activeGames[id] = {};
    serverLogic.setDatabase({ isMock: true, query(sql, params, callback) {
        if (typeof params === 'function') callback = params;
        if (sql.startsWith('SELECT userid')) return callback(null, [{ userid: 7, is_ai: 0 }]);
        if (sql.startsWith('SELECT * FROM map')) return callback(null, [{ sectorid: 1, owner: 8, type: 10 }]);
        if (sql.includes('FROM ships')) return callback(new Error('fleet lookup unavailable'));
        assert.fail(`unexpected write: ${sql}`);
    } });
    try {
        await assert.rejects(serverLogic.notifyEliminatedPlayers(id), /fleet lookup unavailable/);
        assert.equal(client.gameid, id);
        assert.deepEqual(client.messages, []);
        assert.equal(serverLogic.gameState.activeGames[id].eliminatedPlayers.has(7), false);
    } finally {
        serverLogic.gameState.clients.splice(serverLogic.gameState.clients.indexOf(client), 1);
        delete serverLogic.gameState.activeGames[id];
    }
});
