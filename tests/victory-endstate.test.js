const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const server = require('../server/server');
const victory = require('../server/lib/victory');
const techSystem = require('../server/lib/tech');
const { createMockDatabase } = require('../server/lib/mock-db');

function resetGameState() {
    const { clients, clientMap, gameTimer, turns, activeGames } = server.gameState;
    clients.length = 0;
    Object.keys(clientMap).forEach(key => delete clientMap[key]);
    Object.keys(gameTimer).forEach(key => {
        clearInterval(gameTimer[key]);
        delete gameTimer[key];
    });
    Object.keys(turns).forEach(key => delete turns[key]);
    Object.keys(activeGames).forEach(key => delete activeGames[key]);
}

function dbQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

function execJson(handler, payload) {
    return new Promise((resolve, reject) => {
        const req = new EventEmitter();
        const res = {
            statusCode: 200,
            headers: {},
            writeHead(status, headers = {}) {
                res.statusCode = status;
                res.headers = headers;
            },
            end(body) {
                if (!body) {
                    resolve({ statusCode: res.statusCode, body: undefined });
                    return;
                }
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
                } catch (err) {
                    reject(err);
                }
            }
        };

        handler(req, res);
        req.emit('data', Buffer.from(JSON.stringify(payload)));
        req.emit('end');
    });
}

function createConnection(userId) {
    const messages = [];
    return {
        name: String(userId),
        gameid: null,
        raceid: null,
        messages,
        sendUTF(message) {
            messages.push(message);
        }
    };
}

function attach(connection) {
    server.gameState.clients.push(connection);
    server.gameState.clientMap[connection.name] = connection;
}

async function waitFor(connection, predicate, timeoutMs = 1000) {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
        const message = connection.messages.find(predicate);
        if (message) return message;
        await delay(10);
    }
    throw new Error('Timed out waiting for message');
}

async function waitUntil(predicate, timeoutMs = 1000) {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
        if (predicate()) return;
        await delay(10);
    }
    throw new Error('Timed out waiting for condition');
}

async function createGuest(username) {
    const response = await execJson(server.handleGuestLogin, { username });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    return response.body.userId;
}

async function createJoinedGame(host, name = 'Endstate Room', maxPlayers = 2) {
    server.handleCreateGame(`//creategame:${encodeURIComponent(name)}:${maxPlayers}:quick`, host);
    const created = await waitFor(host, message => message.startsWith('creategame::success::'));
    const gameId = Number(created.split('::')[2]);
    server.handleJoinGame(`//joingame:${gameId}:1`, host);
    await waitFor(host, message => message.startsWith('joingame::success::'));
    return gameId;
}

async function joinGame(connection, gameId) {
    server.handleJoinGame(`//joingame:${gameId}:1`, connection);
    await waitFor(connection, message => message.startsWith('joingame::success::'));
}

async function startGame(connection) {
    server.handleGameStart(connection);
    await waitFor(connection, message => message === 'startgame::');
}

test('scientific victory follows the canonical tech tree and excludes placeholder victories', async () => {
    const db = createMockDatabase();
    const gameState = { turns: { 1: 12 }, activeGames: {}, gameTimer: {}, clients: [] };

    await dbQuery(db, 'INSERT INTO users (username, password, salt, email, tempkey) VALUES (?, ?, ?, ?, ?)', ['p1', '', '', '', '']);
    await dbQuery(db, 'INSERT INTO users (username, password, salt, email, tempkey) VALUES (?, ?, ?, ?, ?)', ['p2', '', '', '', '']);
    await dbQuery(db, 'INSERT INTO games (name, creator, maxplayers, status, mode) VALUES (?, ?, ?, ?, ?)', ['Victory', 1, 2, 'in-progress', 'quick']);
    await dbQuery(db, 'INSERT INTO players1 (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)', [1, 1, 300, 300, 100]);
    await dbQuery(db, 'INSERT INTO players1 (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)', [2, 1, 300, 300, 100]);
    await dbQuery(db, 'UPDATE map1 SET owner = ? WHERE sectorid = ?', [1, 1]);
    await dbQuery(db, 'UPDATE map1 SET owner = ? WHERE sectorid = ?', [2, 2]);

    const levels = {};
    Object.values(techSystem.TECHNOLOGIES).forEach(tech => {
        levels[tech.id] = 1;
    });
    await dbQuery(db, 'UPDATE players1 SET tech = ? WHERE userid = ?', [techSystem.serializeTechLevels(levels), 1]);

    const { victoryResult, progress } = await new Promise((resolve, reject) => {
        victory.checkVictoryConditions(1, 1, gameState, db, (result, allProgress) => {
            resolve({ victoryResult: result, progress: allProgress });
        });
    });

    assert.equal(victoryResult.condition, 'Scientific Victory');
    assert.equal(progress.some(row => row.condition === 'Wonder Victory'), false);
    assert.equal(progress.some(row => row.condition === 'Alliance Victory'), false);
});

test('time victory is achievable at the turn cap and resolves ties deterministically', async () => {
    const db = createMockDatabase();
    const gameState = { turns: { 1: 300 }, activeGames: {}, gameTimer: {}, clients: [] };

    await dbQuery(db, 'INSERT INTO users (username, password, salt, email, tempkey) VALUES (?, ?, ?, ?, ?)', ['p1', '', '', '', '']);
    await dbQuery(db, 'INSERT INTO users (username, password, salt, email, tempkey) VALUES (?, ?, ?, ?, ?)', ['p2', '', '', '', '']);
    await dbQuery(db, 'INSERT INTO games (name, creator, maxplayers, status, mode) VALUES (?, ?, ?, ?, ?)', ['Time', 1, 2, 'in-progress', 'quick']);
    await dbQuery(db, 'INSERT INTO players1 (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)', [1, 1, 300, 300, 100]);
    await dbQuery(db, 'INSERT INTO players1 (userid, race_id, metal, crystal, research) VALUES (?, ?, ?, ?, ?)', [2, 1, 300, 300, 100]);
    await dbQuery(db, 'UPDATE map1 SET owner = ? WHERE sectorid = ?', [1, 1]);
    await dbQuery(db, 'UPDATE map1 SET owner = ? WHERE sectorid = ?', [2, 2]);

    const winner = await new Promise((resolve, reject) => {
        victory.checkAllPlayersForVictory(1, gameState, db, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    assert.deepEqual(winner, {
        playerId: 1,
        condition: 'Time Victory',
        priority: 4,
        playerOrder: 0
    });
});

test('surrender records a completed game with winner and clears player sessions', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('endHost');
        const joinerId = await createGuest('endJoiner');
        const host = createConnection(hostId);
        const joiner = createConnection(joinerId);
        attach(host);
        attach(joiner);

        const gameId = await createJoinedGame(host, 'Surrender Endstate');
        await joinGame(joiner, gameId);
        await startGame(host);

        server.handleSurrender(joiner);
        await waitFor(host, message => message.startsWith(`gameover::${hostId}::`));
        await waitFor(joiner, message => message.startsWith(`gameover::${hostId}::`));
        await waitUntil(() => {
            const game = db.games.find(row => row.id === gameId);
            return game && game.status === 'completed' && Number(game.winner) === Number(hostId);
        });

        const game = db.games.find(row => row.id === gameId);
        assert.equal(game.status, 'completed');
        assert.equal(game.winner, hostId);
        assert.equal(db.users.find(row => row.id === hostId).currentgame, null);
        assert.equal(db.users.find(row => row.id === joinerId).currentgame, null);
        assert.equal(server.gameState.gameTimer[gameId], undefined);
        assert.equal(server.gameState.activeGames[gameId], undefined);
    } finally {
        resetGameState();
    }
});

test('surrender in a larger game removes only that player and the match continues', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('threeHost');
        const joinerId = await createGuest('threeJoiner');
        const thirdId = await createGuest('threeThird');
        const host = createConnection(hostId);
        const joiner = createConnection(joinerId);
        const third = createConnection(thirdId);
        attach(host);
        attach(joiner);
        attach(third);

        const gameId = await createJoinedGame(host, 'Three Player Surrender', 3);
        await joinGame(joiner, gameId);
        await joinGame(third, gameId);
        await startGame(host);

        server.handleSurrender(host);
        await waitFor(host, message => message === 'gameover::::Surrendered');
        await waitUntil(() => {
            const game = db.games.find(row => row.id === gameId);
            return game && game.status === 'in-progress' && Number(game.creator) === Number(joinerId);
        });

        const players = await dbQuery(db, `SELECT userid, is_ai FROM players${gameId}`);
        assert.deepEqual(players.map(row => Number(row.userid)).sort((a, b) => a - b), [joinerId, thirdId].sort((a, b) => a - b));
        assert.equal(db.users.find(row => row.id === hostId).currentgame, null);
        assert.equal(db.users.find(row => row.id === joinerId).currentgame, gameId);
        assert.equal(db.users.find(row => row.id === thirdId).currentgame, gameId);
        assert.equal(host.gameid, null);
        assert.equal(joiner.gameid, gameId);
        assert.equal(third.gameid, gameId);
        assert.equal(joiner.messages.some(message => message.startsWith('gameover::')), false);
        assert.equal(third.messages.some(message => message.startsWith('gameover::')), false);
        assert.ok(server.gameState.activeGames[gameId]);

        const surrenderedSectors = await dbQuery(db, `SELECT * FROM map${gameId} WHERE owner = ?`, [hostId]);
        assert.equal(surrenderedSectors.length, 0);
    } finally {
        resetGameState();
    }
});

test('started games with no connected humans abandon after the stale-turn limit', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('staleHost');
        const joinerId = await createGuest('staleJoiner');
        const host = createConnection(hostId);
        const joiner = createConnection(joinerId);
        attach(host);
        attach(joiner);

        const gameId = await createJoinedGame(host, 'Stale Humans');
        await joinGame(joiner, gameId);
        await startGame(host);

        server.gameState.clients.length = 0;
        Object.keys(server.gameState.clientMap).forEach(key => delete server.gameState.clientMap[key]);
        server.gameState.turns[gameId] = 21;
        server.gameState.activeGames[gameId].lastHumanActivityTurn = 1;

        server.processTurn(gameId);
        await waitUntil(() => {
            const game = db.games.find(row => row.id === gameId);
            return game && game.status === 'abandoned';
        });

        const game = db.games.find(row => row.id === gameId);
        assert.equal(game.status, 'abandoned');
        assert.equal(game.winner, null);
        assert.equal(db.users.find(row => row.id === hostId).currentgame, null);
        assert.equal(db.users.find(row => row.id === joinerId).currentgame, null);
        assert.equal(server.gameState.gameTimer[gameId], undefined);
        assert.equal(server.gameState.activeGames[gameId], undefined);
    } finally {
        resetGameState();
    }
});

test('victory progress reports only active achievable end states', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('progressHost');
        const joinerId = await createGuest('progressJoiner');
        const host = createConnection(hostId);
        const joiner = createConnection(joinerId);
        attach(host);
        attach(joiner);

        const gameId = await createJoinedGame(host, 'Victory Progress');
        await joinGame(joiner, gameId);
        await startGame(host);

        server.handleVictoryProgressRequest(host);
        const message = await waitFor(host, row => row.startsWith('victoryprogress::'));
        const payload = JSON.parse(message.replace('victoryprogress::', ''));

        assert.equal(payload.turn, 1);
        assert.ok(payload.conditions['Domination Victory']);
        assert.ok(payload.conditions['Elimination Victory']);
        assert.ok(payload.conditions['Economic Victory']);
        assert.ok(payload.conditions['Scientific Victory']);
        assert.ok(payload.conditions['Time Victory']);
        assert.equal(payload.conditions['Wonder Victory'], undefined);
        assert.equal(payload.conditions['Alliance Victory'], undefined);
    } finally {
        resetGameState();
    }
});
