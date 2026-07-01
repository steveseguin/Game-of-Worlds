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
