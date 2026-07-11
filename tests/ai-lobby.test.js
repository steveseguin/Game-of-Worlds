const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const EventEmitter = require('node:events');

const serverLogic = require('../server/server');
const { createMockDatabase } = require('./helpers/mock-db');

function resetGameState() {
    const { clients, clientMap, gameTimer, turns, activeGames } = serverLogic.gameState;
    clients.length = 0;
    Object.keys(clientMap).forEach(key => delete clientMap[key]);
    Object.keys(gameTimer).forEach(key => {
        clearInterval(gameTimer[key]);
        delete gameTimer[key];
    });
    Object.keys(turns).forEach(key => delete turns[key]);
    Object.keys(activeGames).forEach(key => delete activeGames[key]);
}

function createMockConnection(userId) {
    const messages = [];
    return {
        name: String(userId),
        gameid: null,
        raceid: null,
        connected: true,
        messages,
        sendUTF(message) {
            messages.push(message);
        }
    };
}

function attachConnection(connection) {
    serverLogic.gameState.clients.push(connection);
    serverLogic.gameState.clientMap[connection.name] = connection;
}

async function waitForMessage(connection, predicate, timeoutMs = 1000) {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
        const match = connection.messages.find(predicate);
        if (match) return match;
        await delay(10);
    }
    throw new Error('Timed out waiting for message');
}

function executeJsonHandler(handler, payload) {
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
                    resolve({
                        statusCode: res.statusCode,
                        body: JSON.parse(body)
                    });
                } catch (err) {
                    reject(err);
                }
            }
        };

        handler(req, res);
        if (payload !== undefined) {
            req.emit('data', Buffer.from(JSON.stringify(payload)));
        }
        req.emit('end');
    });
}

function query(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

test.describe('AI lobby controls', () => {
    test.beforeEach(t => {
        const mockDb = createMockDatabase();
        t.context = { mockDb };
        serverLogic.setDatabase(mockDb);
        resetGameState();
    });

    test.afterEach(() => {
        resetGameState();
    });

    test('creator can add an AI seat until the lobby is full', async t => {
        const { mockDb } = t.context;
        const registration = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'creator',
            password: 'Secure123',
            email: 'creator@example.com'
        });
        const hostId = registration.body.userId;

        const hostConn = createMockConnection(hostId);
        attachConnection(hostConn);

        serverLogic.handleCreateGame('//creategame:AI%20Room:2', hostConn);
        const createdMessage = await waitForMessage(hostConn, m => m.startsWith('creategame::success::'));
        const createdGameId = Number(createdMessage.split('::')[2]);
        serverLogic.handleJoinGame(`//joingame:${createdGameId}:1`, hostConn);
        await waitForMessage(hostConn, m => m.startsWith('joingame::success::'));
        const gameId = hostConn.gameid;
        assert.ok(gameId, 'host should have a game id');

        serverLogic.handleAddAi('//addai:medium:balanced', hostConn);
        await waitForMessage(hostConn, m => m.startsWith('addai::success::'));

        const players = await query(mockDb, `SELECT * FROM players${gameId}`);
        assert.equal(players.length, 2, 'host + AI should be seated');
        const aiRow = players.find(p => p.is_ai === 1);
        assert.ok(aiRow, 'AI row should be present');
    });

    test('non-creator cannot add AI opponents', async t => {
        const { mockDb } = t.context;
        const creator = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'creator2',
            password: 'Secure123',
            email: 'creator2@example.com'
        });
        const joiner = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'joiner2',
            password: 'Secure123',
            email: 'joiner2@example.com'
        });

        const hostConn = createMockConnection(creator.body.userId);
        attachConnection(hostConn);
        serverLogic.handleCreateGame('//creategame:Protected:4', hostConn);
        const createdMessage = await waitForMessage(hostConn, m => m.startsWith('creategame::success::'));
        const createdGameId = Number(createdMessage.split('::')[2]);
        serverLogic.handleJoinGame(`//joingame:${createdGameId}:1`, hostConn);
        await waitForMessage(hostConn, m => m.startsWith('joingame::success::'));
        const gameId = hostConn.gameid;

        const joinerConn = createMockConnection(joiner.body.userId);
        attachConnection(joinerConn);
        serverLogic.handleJoinGame(`//joingame:${gameId}:1`, joinerConn);
        await waitForMessage(joinerConn, m => m.startsWith('joingame::success::'));

        serverLogic.handleAddAi('//addai:medium:balanced', joinerConn);
        const errMsg = await waitForMessage(joinerConn, m => m.startsWith('addai::error::'));
        assert.match(errMsg, /Only the game creator/, 'non-creator should be rejected');
    });

    test('cannot exceed lobby capacity with AI seats', async t => {
        const { mockDb } = t.context;
        const reg = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'tightroom',
            password: 'Secure123',
            email: 'tight@example.com'
        });
        const hostConn = createMockConnection(reg.body.userId);
        attachConnection(hostConn);

        serverLogic.handleCreateGame('//creategame:Tight%20Room:2', hostConn);
        const createdMessage = await waitForMessage(hostConn, m => m.startsWith('creategame::success::'));
        const createdGameId = Number(createdMessage.split('::')[2]);
        serverLogic.handleJoinGame(`//joingame:${createdGameId}:1`, hostConn);
        await waitForMessage(hostConn, m => m.startsWith('joingame::success::'));

        serverLogic.handleAddAi('//addai:medium:balanced', hostConn);
        await waitForMessage(hostConn, m => m.startsWith('addai::success::'));

        serverLogic.handleAddAi('//addai:medium:balanced', hostConn);
        const fullMsg = await waitForMessage(hostConn, m => m.startsWith('addai::error::'));
        assert.match(fullMsg, /Game is already full/, 'should block AI when lobby is full');

        const players = await query(mockDb, `SELECT * FROM players${hostConn.gameid}`);
        assert.equal(players.length, 2, 'only host + one AI should be present');
    });

    test('concurrent AI requests cannot claim the same final seat', async t => {
        const { mockDb } = t.context;
        const reg = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'seatRace',
            password: 'Secure123',
            email: 'seatrace@example.com'
        });
        const hostConn = createMockConnection(reg.body.userId);
        attachConnection(hostConn);

        serverLogic.handleCreateGame('//creategame:Seat%20Race:2', hostConn);
        const createdMessage = await waitForMessage(hostConn, m => m.startsWith('creategame::success::'));
        const gameId = Number(createdMessage.split('::')[2]);
        serverLogic.handleJoinGame(`//joingame:${gameId}:1`, hostConn);
        await waitForMessage(hostConn, m => m.startsWith('joingame::success::'));

        // Fire both requests without waiting for the first insert to complete.
        serverLogic.handleAddAi('//addai:medium:balanced', hostConn);
        serverLogic.handleAddAi('//addai:hard:aggressive', hostConn);

        await waitForMessage(hostConn, m => m.startsWith('addai::success::'));
        const fullMessage = await waitForMessage(hostConn, m => m.startsWith('addai::error::'));
        assert.match(fullMessage, /Game is already full/);

        const players = await query(mockDb, `SELECT * FROM players${gameId}`);
        assert.equal(players.length, 2, 'host + exactly one AI should be seated');
    });
});
