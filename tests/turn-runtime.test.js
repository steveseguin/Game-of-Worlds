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
        if (message) {
            return message;
        }
        await delay(10);
    }
    throw new Error('Timed out waiting for message');
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

async function waitUntil(predicate, timeoutMs = 1000) {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
        if (predicate()) {
            return;
        }
        await delay(10);
    }
    throw new Error('Timed out waiting for condition');
}

async function createGuest(username) {
    const response = await execJson(server.handleGuestLogin, { username });
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.success);
    return response.body.userId;
}

async function createJoinedGame(host, {
    name = 'Runtime Room',
    maxPlayers = 2,
    mode = 'quick',
    raceId = 1
} = {}) {
    server.handleCreateGame(`//creategame:${encodeURIComponent(name)}:${maxPlayers}:${mode}`, host);
    const created = await waitFor(host, message => message.startsWith('creategame::success::'));
    const gameId = Number(created.split('::')[2]);

    server.handleJoinGame(`//joingame:${gameId}:${raceId}`, host);
    await waitFor(host, message => message.startsWith('joingame::success::'));
    return gameId;
}

async function joinGame(connection, gameId, raceId = 1) {
    server.handleJoinGame(`//joingame:${gameId}:${raceId}`, connection);
    await waitFor(connection, message => message.startsWith('joingame::success::'));
}

async function startGame(connection) {
    server.handleGameStart(connection);
    await waitFor(connection, message => message === 'startgame::');
}

async function createStartedSolo(db, username, name) {
    server.setDatabase(db);
    const hostId = await createGuest(username);
    const host = createConnection(hostId);
    attach(host);
    const gameId = await createJoinedGame(host, { name });
    await startGame(host);
    host.messages.length = 0;
    return { hostId, host, gameId };
}

test('started games resume turn timers from persisted state', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const registration = await execJson(server.handleRegister, {
            username: 'timerHost',
            password: 'Secure123',
            email: 'timer@example.com'
        });
        const hostId = registration.body.userId;
        const host = createConnection(hostId);
        attach(host);

        server.handleCreateGame('//creategame:Timer%20Room:2:epic', host);
        const created = await waitFor(host, message => message.startsWith('creategame::success::'));
        const gameId = Number(created.split('::')[2]);

        server.handleJoinGame(`//joingame:${gameId}:1`, host);
        await waitFor(host, message => message.startsWith('joingame::success::'));

        server.handleAddAi('//addai:chill:balanced', host);
        await waitFor(host, message => message.startsWith('addai::success::'));

        server.handleGameStart(host);
        await waitFor(host, message => message === 'startgame::');

        const game = db.games.find(row => row.id === gameId);
        assert.equal(game.started, 1);
        assert.equal(game.status, 'in-progress');
        assert.equal(game.mode, 'epic');
        assert.equal(game.turn, 1);
        assert.ok(server.gameState.gameTimer[gameId], 'timer starts when game starts');

        clearInterval(server.gameState.gameTimer[gameId]);
        delete server.gameState.gameTimer[gameId];
        delete server.gameState.turns[gameId];
        delete server.gameState.activeGames[gameId];

        const resumed = await server.resumeActiveGamesFromDatabase();
        assert.equal(resumed, 1);
        assert.ok(server.gameState.gameTimer[gameId], 'timer resumes after runtime reset');
        assert.equal(server.gameState.turns[gameId], 1);
        assert.equal(server.gameState.activeGames[gameId].mode, 'epic');

        server.processTurn(gameId);
        await delay(50);
        assert.equal(game.turn, 2);
    } finally {
        resetGameState();
    }
});

test('last player leaving a waiting room deletes the empty game', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('waitingLeave');
        const host = createConnection(hostId);
        attach(host);
        const gameId = await createJoinedGame(host, { name: 'Waiting Leave' });

        assert.ok(db.games.find(row => row.id === gameId));

        server.handleLeaveGame(host);
        await waitFor(host, message => message === 'lobby::');
        await waitUntil(() => !db.games.find(row => row.id === gameId));

        const user = db.users.find(row => row.id === hostId);
        assert.equal(user.currentgame, null);
        assert.equal(server.gameState.activeGames[gameId], undefined);
        assert.equal(server.gameState.gameTimer[gameId], undefined);
    } finally {
        resetGameState();
    }
});

test('last human leaving an active solo game abandons it and stops the timer', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('soloLeave');
        const host = createConnection(hostId);
        attach(host);
        const gameId = await createJoinedGame(host, { name: 'Solo Leave' });

        await startGame(host);
        assert.ok(server.gameState.gameTimer[gameId]);
        server.pauseTurnTimerForBattle(gameId, 5000);
        assert.ok(server.gameState.battlePause[gameId], 'battle pause exists before abandon cleanup');

        server.handleLeaveGame(host);
        await waitFor(host, message => message === 'lobby::');
        await waitUntil(() => db.games.find(row => row.id === gameId).status === 'abandoned');

        const game = db.games.find(row => row.id === gameId);
        const user = db.users.find(row => row.id === hostId);
        assert.equal(game.started, 1);
        assert.equal(game.status, 'abandoned');
        assert.equal(game.winner, null);
        assert.equal(user.currentgame, null);
        assert.equal(server.gameState.gameTimer[gameId], undefined);
        assert.equal(server.gameState.battlePause[gameId], undefined);
        assert.equal(server.gameState.activeGames[gameId], undefined);
    } finally {
        resetGameState();
    }
});

test('active games continue when one human leaves and another human remains', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('leavingHuman');
        const joinerId = await createGuest('remainingHuman');
        const host = createConnection(hostId);
        const joiner = createConnection(joinerId);
        attach(host);
        attach(joiner);

        const gameId = await createJoinedGame(host, { name: 'Human Continues' });
        await joinGame(joiner, gameId);
        await startGame(host);

        const hostOwnedBefore = await dbQuery(db, `SELECT * FROM map${gameId} WHERE owner = ?`, [hostId]);
        assert.ok(hostOwnedBefore.length > 0, 'host should own sectors before leaving');

        server.handleLeaveGame(host);
        await waitFor(host, message => message === 'lobby::');
        await waitUntil(() => {
            const game = db.games.find(row => row.id === gameId);
            const hostUser = db.users.find(row => row.id === hostId);
            const joinerUser = db.users.find(row => row.id === joinerId);
            return game
                && game.status === 'in-progress'
                && Number(game.creator) === Number(joinerId)
                && hostUser.currentgame === null
                && Number(joinerUser.currentgame) === Number(gameId)
                && server.gameState.gameTimer[gameId];
        });

        const hostPlayers = await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ? LIMIT 1`, [hostId]);
        const joinerPlayers = await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ? LIMIT 1`, [joinerId]);
        const hostSectors = await dbQuery(db, `SELECT * FROM map${gameId} WHERE owner = ?`, [hostId]);
        const hostShips = await dbQuery(db, `SELECT * FROM ships${gameId} WHERE owner = ?`, [hostId]);
        const hostBuildings = await dbQuery(db, `SELECT * FROM buildings${gameId} WHERE owner = ?`, [hostId]);

        assert.equal(hostPlayers.length, 0);
        assert.equal(joinerPlayers.length, 1);
        assert.equal(hostSectors.length, 0);
        assert.equal(hostShips.length, 0);
        assert.equal(hostBuildings.length, 0);
    } finally {
        resetGameState();
    }
});

test('last human leaving an active AI game abandons it and clears AI current game', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('aiOnlyAfterLeave');
        const host = createConnection(hostId);
        attach(host);
        const gameId = await createJoinedGame(host, { name: 'AI Only Leave' });

        server.handleAddAi('//addai:medium:balanced', host);
        await waitFor(host, message => message.startsWith('addai::success::'));
        const aiUser = db.users.find(row => String(row.username || '').startsWith('AI_'));
        assert.ok(aiUser);

        await startGame(host);
        server.handleLeaveGame(host);
        await waitFor(host, message => message === 'lobby::');
        await waitUntil(() => db.games.find(row => row.id === gameId).status === 'abandoned');

        const game = db.games.find(row => row.id === gameId);
        assert.equal(game.status, 'abandoned');
        assert.equal(db.users.find(row => row.id === hostId).currentgame, null);
        assert.equal(db.users.find(row => row.id === aiUser.id).currentgame, null);
        assert.equal(server.gameState.gameTimer[gameId], undefined);
    } finally {
        resetGameState();
    }
});

test('resume abandons active games with no human players instead of restarting timers', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('resumeAiOnly');
        const host = createConnection(hostId);
        attach(host);
        const gameId = await createJoinedGame(host, { name: 'Resume AI Only', mode: 'epic' });

        server.handleAddAi('//addai:medium:balanced', host);
        await waitFor(host, message => message.startsWith('addai::success::'));
        await startGame(host);

        await dbQuery(db, `DELETE FROM players${gameId} WHERE userid = ?`, [hostId]);
        await dbQuery(db, 'UPDATE users SET currentgame = NULL WHERE id = ? AND currentgame = ?', [hostId, gameId]);

        resetGameState();
        const resumed = await server.resumeActiveGamesFromDatabase();
        await waitUntil(() => db.games.find(row => row.id === gameId).status === 'abandoned');

        assert.equal(resumed, 0);
        assert.equal(server.gameState.gameTimer[gameId], undefined);
        assert.equal(server.gameState.activeGames[gameId], undefined);
        assert.equal(db.users.every(row => Number(row.currentgame) !== Number(gameId)), true);
    } finally {
        resetGameState();
    }
});

test('solo sandbox games abandon at the configured max turn instead of running forever', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const hostId = await createGuest('soloCap');
        const host = createConnection(hostId);
        attach(host);
        const gameId = await createJoinedGame(host, { name: 'Solo Cap' });

        await startGame(host);
        server.gameState.turns[gameId] = 300;
        db.games.find(row => row.id === gameId).turn = 300;

        server.processTurn(gameId);
        await waitUntil(() => db.games.find(row => row.id === gameId).status === 'abandoned');

        const game = db.games.find(row => row.id === gameId);
        const user = db.users.find(row => row.id === hostId);
        assert.equal(game.status, 'abandoned');
        assert.equal(game.turn, 300);
        assert.equal(user.currentgame, null);
        assert.equal(server.gameState.gameTimer[gameId], undefined);
        assert.equal(host.messages.some(message => message === 'newturn::301'), false);
    } finally {
        resetGameState();
    }
});

test('solo sandbox games advance turns without completing immediately', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const registration = await execJson(server.handleGuestLogin, {
            username: 'soloTimer'
        });
        const hostId = registration.body.userId;
        const host = createConnection(hostId);
        attach(host);

        server.handleCreateGame('//creategame:Solo%20Timer:2:quick', host);
        const created = await waitFor(host, message => message.startsWith('creategame::success::'));
        const gameId = Number(created.split('::')[2]);

        server.handleJoinGame(`//joingame:${gameId}:1`, host);
        await waitFor(host, message => message.startsWith('joingame::success::'));

        server.handleGameStart(host);
        await waitFor(host, message => message === 'startgame::');

        server.handleGameStart(host);
        await waitFor(host, message => message === 'newturn::2');
        await delay(75);

        const game = db.games.find(row => row.id === gameId);
        const user = db.users.find(row => row.id === hostId);
        assert.equal(game.turn, 2);
        assert.equal(game.status, 'in-progress');
        assert.equal(game.winner || null, null);
        assert.equal(user.currentgame, gameId);
        assert.ok(server.gameState.gameTimer[gameId], 'timer remains active after solo turn advance');
    } finally {
        resetGameState();
    }
});

test('simultaneous turn triggers schedule only one turn advance', async () => {
    const db = createMockDatabase();
    server.setDatabase(db);
    resetGameState();

    try {
        const registration = await execJson(server.handleGuestLogin, { username: 'turnLock' });
        const hostId = registration.body.userId;
        const host = createConnection(hostId);
        attach(host);
        const gameId = await createJoinedGame(host, { name: 'Turn Lock' });
        await startGame(host);
        host.messages.length = 0;

        server.processTurn(gameId);
        server.processTurn(gameId);

        await waitFor(host, message => message === 'newturn::2');
        await delay(100);
        assert.equal(server.gameState.turns[gameId], 2);
        assert.equal(db.games.find(row => row.id === gameId).turn, 2);
        assert.equal(host.messages.filter(message => message === 'newturn::2').length, 1);
        assert.equal(host.messages.some(message => message === 'newturn::3'), false);
    } finally {
        resetGameState();
    }
});

test('turn processing pauses instead of advancing runtime when persistence is unavailable', async () => {
    resetGameState();
    server.setDatabase({
        isOffline: true,
        query(sql, params, callback) {
            const cb = typeof params === 'function' ? params : callback;
            process.nextTick(() => cb(new Error('database unavailable')));
        }
    });
    server.gameState.turns[1] = 9;
    server.gameState.activeGames[1] = { mode: 'quick', status: 'in-progress' };

    try {
        server.processTurn(1);
        await delay(25);
        assert.equal(server.gameState.turns[1], 9);
    } finally {
        resetGameState();
    }
});

test('new turn waits for authoritative income writes and reconnect exposes the resolving phase', async () => {
    const db = createMockDatabase();
    resetGameState();

    try {
        const { hostId, host, gameId } = await createStartedSolo(db, 'sequencedTurn', 'Sequenced Turn');
        let incomeWriteWaiting = false;
        let incomeWriteCompleted = false;
        const delayedDb = {
            isOffline: false,
            isMock: true,
            query(sql, params, callback) {
                const cb = typeof params === 'function' ? params : callback;
                const values = typeof params === 'function' ? [] : params;
                if (/^UPDATE players\d+ SET metal = metal \+ \?, crystal = crystal \+ \?, research = research \+ \?, last_income_turn = \?/i.test(sql.replace(/\s+/g, ' ').trim())) {
                    incomeWriteWaiting = true;
                    db.query(sql, values, (err, result) => {
                        setTimeout(() => {
                            incomeWriteCompleted = true;
                            cb(err, result);
                        }, 80);
                    });
                    return;
                }
                db.query(sql, values, cb);
            }
        };
        server.setDatabase(delayedDb);

        const turnPromise = server.processTurn(gameId);
        await waitUntil(() => incomeWriteWaiting);
        assert.equal(server.isTurnProcessing(gameId), true);
        assert.equal(host.messages.some(message => message === 'newturn::2'), false);

        const reconnect = createConnection(hostId);
        reconnect.gameid = gameId;
        server.handleCurrentGame(reconnect);
        const snapshotMessage = await waitFor(reconnect, message => message.startsWith('currentgame::'));
        const snapshot = JSON.parse(snapshotMessage.replace('currentgame::', ''));
        assert.equal(snapshot.turn, 2);
        assert.equal(snapshot.turnResolution.phase, 'income');

        await turnPromise;
        assert.equal(incomeWriteCompleted, true);
        assert.equal(host.messages.some(message => message === 'newturn::2'), true);
        assert.equal(server.isTurnProcessing(gameId), false);
    } finally {
        resetGameState();
    }
});

test('failed income phase emits no new turn and retries the same turn idempotently', async () => {
    const db = createMockDatabase();
    resetGameState();

    try {
        const { hostId, host, gameId } = await createStartedSolo(db, 'retryIncome', 'Retry Income');
        const before = (await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ?`, [hostId]))[0];
        let failedOnce = false;
        server.setDatabase({
            isOffline: false,
            isMock: true,
            query(sql, params, callback) {
                const cb = typeof params === 'function' ? params : callback;
                const values = typeof params === 'function' ? [] : params;
                if (!failedOnce && /^UPDATE players\d+ SET metal = metal \+ \?, crystal = crystal \+ \?, research = research \+ \?, last_income_turn = \?/i.test(sql.replace(/\s+/g, ' ').trim())) {
                    failedOnce = true;
                    process.nextTick(() => cb(new Error('simulated income outage')));
                    return;
                }
                db.query(sql, values, cb);
            }
        });

        assert.equal(await server.processTurn(gameId), false);
        assert.equal(host.messages.some(message => message === 'newturn::2'), false);
        assert.equal(server.gameState.turns[gameId], 2);
        assert.equal(server.gameState.activeGames[gameId].turnResolution.phase, 'failed');
        assert.equal(server.gameState.activeGames[gameId].turnResolution.failedPhase, 'income');

        server.setDatabase(db);
        assert.equal(await server.processTurn(gameId), true);
        const after = (await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ?`, [hostId]))[0];
        assert.equal(server.gameState.turns[gameId], 2, 'retry must not increment the turn again');
        assert.equal(after.last_income_turn, 2);
        assert.ok(after.metal > before.metal);
        assert.equal(host.messages.filter(message => message === 'newturn::2').length, 1);
    } finally {
        resetGameState();
    }
});

test('turn persistence failure leaves runtime and clients on the prior turn', async () => {
    const db = createMockDatabase();
    resetGameState();

    try {
        const { host, gameId } = await createStartedSolo(db, 'persistTurn', 'Persist Turn');
        server.setDatabase({
            isOffline: false,
            isMock: true,
            query(sql, params, callback) {
                const cb = typeof params === 'function' ? params : callback;
                const values = typeof params === 'function' ? [] : params;
                if (/^UPDATE games SET turn = \?, turn_phase = \?, turn_phase_turn = \? WHERE id = \?/i.test(sql.replace(/\s+/g, ' ').trim())) {
                    process.nextTick(() => cb(new Error('simulated turn persistence failure')));
                    return;
                }
                db.query(sql, values, cb);
            }
        });

        assert.equal(await server.processTurn(gameId), false);
        assert.equal(server.gameState.turns[gameId], 1);
        assert.equal(db.games.find(game => game.id === gameId).turn, 1);
        assert.equal(host.messages.some(message => message === 'newturn::2'), false);
    } finally {
        resetGameState();
    }
});

test('runtime restart during battle pause resumes from persisted state without a stuck freeze', async () => {
    const db = createMockDatabase();
    resetGameState();

    try {
        const { host, gameId } = await createStartedSolo(db, 'battleRestart', 'Battle Restart');
        server.pauseTurnTimerForBattle(gameId, 10000);
        assert.equal(server.isBattlePauseActive(gameId), true);

        const pause = server.gameState.battlePause[gameId];
        if (pause?.timer) clearTimeout(pause.timer);
        delete server.gameState.battlePause[gameId];
        if (server.gameState.gameTimer[gameId]) clearInterval(server.gameState.gameTimer[gameId]);
        delete server.gameState.gameTimer[gameId];
        delete server.gameState.turns[gameId];
        delete server.gameState.activeGames[gameId];

        assert.equal(await server.resumeActiveGamesFromDatabase(), 1);
        assert.equal(server.isBattlePauseActive(gameId), false);
        assert.ok(server.gameState.gameTimer[gameId]);
        host.messages.length = 0;
        assert.equal(await server.processTurn(gameId), true);
        assert.equal(host.messages.some(message => message === 'newturn::2'), true);
    } finally {
        resetGameState();
    }
});

test('runtime restart resumes a persisted failed income phase without advancing or double-paying', async () => {
    const db = createMockDatabase();
    resetGameState();

    try {
        const { hostId, host, gameId } = await createStartedSolo(db, 'restartIncome', 'Restart Income');
        let failedOnce = false;
        server.setDatabase({
            isOffline: false,
            isMock: true,
            query(sql, params, callback) {
                const cb = typeof params === 'function' ? params : callback;
                const values = typeof params === 'function' ? [] : params;
                if (!failedOnce && /^UPDATE players\d+ SET metal = metal \+ \?, crystal = crystal \+ \?, research = research \+ \?, last_income_turn = \?/i.test(sql.replace(/\s+/g, ' ').trim())) {
                    failedOnce = true;
                    process.nextTick(() => cb(new Error('simulated crash boundary')));
                    return;
                }
                db.query(sql, values, cb);
            }
        });
        assert.equal(await server.processTurn(gameId), false);
        assert.equal(db.games.find(game => game.id === gameId).turn_phase, 'income');

        if (server.gameState.gameTimer[gameId]) clearInterval(server.gameState.gameTimer[gameId]);
        delete server.gameState.gameTimer[gameId];
        delete server.gameState.turns[gameId];
        delete server.gameState.activeGames[gameId];
        host.messages.length = 0;
        server.setDatabase(db);

        assert.equal(await server.resumeActiveGamesFromDatabase(), 1);
        await waitFor(host, message => message === 'newturn::2');
        const player = (await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ?`, [hostId]))[0];
        const game = db.games.find(row => row.id === gameId);
        assert.equal(game.turn, 2);
        assert.equal(game.turn_phase, null);
        assert.equal(player.last_automation_turn, 2);
        assert.equal(player.last_income_turn, 2);
        assert.equal(host.messages.filter(message => message === 'newturn::2').length, 1);
    } finally {
        resetGameState();
    }
});

test('turn phases preserve automation, income, battle, victory, then broadcast order', async () => {
    const db = createMockDatabase();
    resetGameState();

    try {
        const { host, gameId } = await createStartedSolo(db, 'phaseOrder', 'Phase Order');
        const events = [];
        const originalSend = host.sendUTF.bind(host);
        host.sendUTF = message => {
            if (message === 'newturn::2') events.push('broadcast');
            originalSend(message);
        };
        server.setDatabase({
            isOffline: false,
            isMock: true,
            query(sql, params, callback) {
                const cb = typeof params === 'function' ? params : callback;
                const values = typeof params === 'function' ? [] : params;
                const normalized = sql.replace(/\s+/g, ' ').trim();
                if (/^SELECT userid, is_ai, ai_difficulty, ai_strategy FROM players\d+ WHERE is_ai = 1/i.test(normalized)) events.push('ai');
                else if (/^SELECT userid FROM players\d+$/i.test(normalized)) events.push('standing');
                else if (/^UPDATE players\d+ SET metal = metal \+ \?, crystal = crystal \+ \?, research = research \+ \?, last_income_turn = \?/i.test(normalized)) events.push('income');
                else if (/^SELECT sectorid, GROUP_CONCAT/i.test(normalized)) events.push('battles');
                else if (/^SELECT userid FROM players\d+ ORDER BY userid ASC/i.test(normalized)) events.push('victory');
                db.query(sql, values, cb);
            }
        });

        assert.equal(await server.processTurn(gameId), true);
        const first = name => events.indexOf(name);
        assert.ok(first('ai') < first('standing'));
        assert.ok(first('standing') < first('income'));
        assert.ok(first('income') < first('battles'));
        assert.ok(first('battles') < first('victory'));
        assert.ok(first('victory') < first('broadcast'));
    } finally {
        resetGameState();
    }
});

test('battle query failure resumes at battle phase without duplicating income', async () => {
    const db = createMockDatabase();
    resetGameState();

    try {
        const { hostId, host, gameId } = await createStartedSolo(db, 'retryBattle', 'Retry Battle');
        let failedOnce = false;
        server.setDatabase({
            isOffline: false,
            isMock: true,
            query(sql, params, callback) {
                const cb = typeof params === 'function' ? params : callback;
                const values = typeof params === 'function' ? [] : params;
                if (!failedOnce && /^SELECT sectorid, GROUP_CONCAT/i.test(sql.replace(/\s+/g, ' ').trim())) {
                    failedOnce = true;
                    process.nextTick(() => cb(new Error('simulated battle read outage')));
                    return;
                }
                db.query(sql, values, cb);
            }
        });

        assert.equal(await server.processTurn(gameId), false);
        const afterFailed = (await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ?`, [hostId]))[0];
        assert.equal(afterFailed.last_automation_turn, 2);
        assert.equal(afterFailed.last_income_turn, 2);
        assert.equal(host.messages.some(message => message === 'newturn::2'), false);
        assert.equal(server.gameState.activeGames[gameId].turnResolution.failedPhase, 'battles');

        server.setDatabase(db);
        assert.equal(await server.processTurn(gameId), true);
        const afterRetry = (await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ?`, [hostId]))[0];
        assert.equal(afterRetry.metal, afterFailed.metal);
        assert.equal(afterRetry.crystal, afterFailed.crystal);
        assert.equal(afterRetry.research, afterFailed.research);
        assert.equal(afterRetry.last_automation_turn, 2);
        assert.equal(host.messages.filter(message => message === 'newturn::2').length, 1);
    } finally {
        resetGameState();
    }
});

test('victory read failure resumes at victory phase without replaying earlier phases', async () => {
    const db = createMockDatabase();
    resetGameState();

    try {
        const { hostId, host, gameId } = await createStartedSolo(db, 'retryVictory', 'Retry Victory');
        let failedOnce = false;
        server.setDatabase({
            isOffline: false,
            isMock: true,
            query(sql, params, callback) {
                const cb = typeof params === 'function' ? params : callback;
                const values = typeof params === 'function' ? [] : params;
                if (!failedOnce && /^SELECT userid FROM players\d+ ORDER BY userid ASC/i.test(sql.replace(/\s+/g, ' ').trim())) {
                    failedOnce = true;
                    process.nextTick(() => cb(new Error('simulated victory read outage')));
                    return;
                }
                db.query(sql, values, cb);
            }
        });

        assert.equal(await server.processTurn(gameId), false);
        const afterFailed = (await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ?`, [hostId]))[0];
        assert.equal(server.gameState.activeGames[gameId].turnResolution.failedPhase, 'victory');
        assert.equal(host.messages.some(message => message === 'newturn::2'), false);

        server.setDatabase(db);
        assert.equal(await server.processTurn(gameId), true);
        const afterRetry = (await dbQuery(db, `SELECT * FROM players${gameId} WHERE userid = ?`, [hostId]))[0];
        assert.equal(afterRetry.metal, afterFailed.metal);
        assert.equal(afterRetry.crystal, afterFailed.crystal);
        assert.equal(afterRetry.research, afterFailed.research);
        assert.equal(host.messages.filter(message => message === 'newturn::2').length, 1);
    } finally {
        resetGameState();
    }
});
