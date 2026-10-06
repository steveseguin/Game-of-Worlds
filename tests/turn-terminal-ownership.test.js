const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const server = require('../server/server');
const { createMockDatabase } = require('../server/lib/mock-db');

function resetGameState() {
    const { clients, clientMap, gameTimer, turns, activeGames, battlePause } = server.gameState;
    clients.length = 0;
    Object.keys(clientMap).forEach(key => delete clientMap[key]);
    Object.keys(gameTimer).forEach(key => {
        clearInterval(gameTimer[key]);
        delete gameTimer[key];
    });
    Object.keys(battlePause).forEach(key => {
        if (battlePause[key] && battlePause[key].timer) {
            clearTimeout(battlePause[key].timer);
        }
        delete battlePause[key];
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


// Model callback latency with the shipped in-memory database. No MySQL server,
// browser, remote service, or payment account is needed.
const boundaries = [
    ['player preflight', sql => /^SELECT userid, is_ai FROM players\d+$/.test(sql)],
    ['turn advance', sql => sql.startsWith('UPDATE games SET turn = ?, turn_phase = ?')],
    ['automation read', sql => /^SELECT userid, last_automation_turn FROM players\d+$/.test(sql)],
    ['AI roster read', sql => /^SELECT userid, is_ai, ai_difficulty, ai_strategy FROM players\d+ WHERE is_ai = 1$/.test(sql)],
    ['standing orders read', sql => /^SELECT userid FROM players\d+$/.test(sql)],
    ['income phase marker', (sql, values) => sql.startsWith('UPDATE games SET turn_phase = ?') && values[0] === 'income'],
    ['income write', sql => /^UPDATE players\d+ SET metal = metal \+ \?, crystal = crystal \+ \?, research = research \+ \?, last_income_turn = \?/.test(sql)],
    ['battle phase marker', (sql, values) => sql.startsWith('UPDATE games SET turn_phase = ?') && values[0] === 'battles'],
    ['battle read', sql => sql.startsWith('SELECT sectorid, GROUP_CONCAT')],
    ['victory phase marker', (sql, values) => sql.startsWith('UPDATE games SET turn_phase = ?') && values[0] === 'victory'],
    ['elimination read', (sql, values, phase) => /^SELECT \* FROM map\d+$/.test(sql) && phase === 'victory'],
    ['victory read', sql => /^SELECT userid FROM players\d+ ORDER BY userid ASC$/.test(sql)],
    ['winning turn cleanup', (sql, values) => sql.startsWith('UPDATE games SET turn_phase = ?') && values[0] === null],
    ['nonwinning turn cleanup', (sql, values) => sql.startsWith('UPDATE games SET turn_phase = ?') && values[0] === null, false]
];

async function startedPair(db, economicWin) {
    server.setDatabase(db);
    const hostId = await createGuest('turnHost');
    const guestId = await createGuest('turnGuest');
    const host = createConnection(hostId);
    const guest = createConnection(guestId);
    attach(host);
    attach(guest);
    const gameId = await createJoinedGame(host, 'Terminal Turn');
    await joinGame(guest, gameId);
    await startGame(host);
    if (economicWin) {
        await dbQuery(db, `UPDATE players${gameId} SET metal = ? WHERE userid = ?`, [100001, hostId]);
    }
    return { gameId, host, hostId, guest, guestId };
}

for (const [name, matches, economicWin = true] of boundaries) {
    test(`surrender stays final while turn waits at ${name}`, async () => {
        const db = createMockDatabase();
        resetGameState();
        let release;
        let pendingTurn;
        try {
            const { gameId, host, hostId, guestId } = await startedPair(db, economicWin);
            let paused = false;
            let historyWrites = 0;
            let statsWrites = 0;
            server.setDatabase({
                isOffline: false,
                isMock: true,
                query(sql, params, callback) {
                    const cb = typeof params === 'function' ? params : callback;
                    const values = typeof params === 'function' ? [] : params;
                    const normalized = sql.replace(/\s+/g, ' ').trim();
                    if (normalized.startsWith('INSERT INTO game_history')) historyWrites++;
                    if (normalized.startsWith('UPDATE user_stats SET games_played')) statsWrites++;
                    if (!paused && matches(normalized, values, server.gameState.activeGames[gameId]?.turnResolution?.phase)) {
                        paused = true;
                        release = () => db.query(sql, values, cb);
                        return;
                    }
                    db.query(sql, values, cb);
                }
            });
            pendingTurn = server.processTurn(gameId);
            await waitUntil(() => paused);
            server.handleSurrender(host);
            await waitUntil(() => !server.gameState.activeGames[gameId]);
            const completedGame = db.games.find(row => row.id === gameId);
            assert.equal(completedGame.status, 'completed');
            assert.equal(completedGame.winner, guestId);
            assert.equal(historyWrites, 1);
            assert.equal(statsWrites, 2);
            release();
            release = null;
            assert.equal(await pendingTurn, false, 'old turn must stop at its next boundary');
            assert.equal(completedGame.winner, guestId, 'late victory must not overwrite surrender');
            assert.equal(historyWrites, 1, 'only the surrender creates game history');
            assert.equal(statsWrites, 2, 'each player receives only one result');
            assert.equal(server.gameState.activeGames[gameId], undefined);
            assert.equal(server.gameState.turns[gameId], undefined);
            assert.equal(server.gameState.gameTimer[gameId], undefined);
            assert.equal(db.users.find(row => row.id === hostId).currentgame, null);
            assert.equal(db.users.find(row => row.id === guestId).currentgame, null);
        } finally {
            if (release) release();
            if (pendingTurn) await pendingTurn;
            resetGameState();
        }
    });
}

test('an ended game cannot be restarted by a late turn trigger', async () => {
    const db = createMockDatabase();
    resetGameState();
    try {
        const { gameId, host, guestId } = await startedPair(db, true);
        server.handleSurrender(host);
        await waitUntil(() => !server.gameState.activeGames[gameId]);
        assert.equal(await server.processTurn(gameId), false);
        assert.equal(db.games.find(row => row.id === gameId).winner, guestId);
        assert.equal(server.gameState.activeGames[gameId], undefined);
        assert.equal(server.gameState.turns[gameId], undefined);
    } finally {
        resetGameState();
    }
});
