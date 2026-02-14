const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const serverLogic = require('../server/server');
const mapSystem = require('../server/lib/map');
const originalGenerateMap = mapSystem.generateMap;
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
        if (match) {
            return match;
        }
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

test.describe('Lobby lifecycle flows', () => {
    test.before(() => {
        mapSystem.generateMap = function patchedGenerateMap(width, height, playerCount) {
            const result = originalGenerateMap(width, height, playerCount);
            if (Array.isArray(result)) {
                return result;
            }
            if (result && Array.isArray(result.sectors)) {
                return result.sectors;
            }
            return [];
        };
    });

    test.after(() => {
        mapSystem.generateMap = originalGenerateMap;
    });

    test.beforeEach(t => {
        const mockDb = createMockDatabase();
        t.context = { mockDb };
        serverLogic.setDatabase(mockDb);
        resetGameState();
    });

    test.afterEach(() => {
        resetGameState();
    });

    test('host can register, create a game, and start it', async t => {
        const { mockDb } = t.context;

        const registration = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'hostCommander',
            password: 'Secure123',
            email: 'host@example.com'
        });
        assert.equal(registration.statusCode, 200, 'registration should succeed');
        assert.ok(registration.body.success);
        const hostId = registration.body.userId;

        const hostConnection = createMockConnection(hostId);
        attachConnection(hostConnection);

        serverLogic.handleCreateGame('//creategame:Test%20Room:4', hostConnection);
        await waitForMessage(hostConnection, message => message.startsWith('joingame::success::'));

        assert.ok(hostConnection.gameid, 'connection should have game id after creation');

        serverLogic.handleGameStart(hostConnection);
        await waitForMessage(hostConnection, message => message === 'startgame::');

        const createdGame = mockDb.games.find(game => game.id === hostConnection.gameid);
        assert.ok(createdGame, 'game should exist in mock database');
        assert.equal(createdGame.started, 1, 'game should be marked as started');
        assert.equal(createdGame.creator, hostId, 'creator should remain the host');
    });

    test('non-creator cannot start the game before the host', async t => {
        const { mockDb } = t.context;

        const hostRegistration = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'creatorOne',
            password: 'Secure123',
            email: 'creator@example.com'
        });
        const joinerRegistration = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'joinerTwo',
            password: 'Secure123',
            email: 'joiner@example.com'
        });

        const hostId = hostRegistration.body.userId;
        const joinerId = joinerRegistration.body.userId;

        const hostConnection = createMockConnection(hostId);
        attachConnection(hostConnection);

        serverLogic.handleCreateGame('//creategame:TwoPlayer%20Match:2', hostConnection);
        await waitForMessage(hostConnection, message => message.startsWith('joingame::success::'));
        const gameId = hostConnection.gameid;
        assert.ok(gameId, 'host should receive a game id');

        const joinerConnection = createMockConnection(joinerId);
        attachConnection(joinerConnection);
        serverLogic.handleJoinGame(`//joingame:${gameId}:1`, joinerConnection);
        await waitForMessage(joinerConnection, message => message.startsWith('joingame::success::'));

        serverLogic.handleGameStart(joinerConnection);
        await waitForMessage(joinerConnection, message => message.includes('Only the game creator'), 1000);

        serverLogic.handleGameStart(hostConnection);
        await waitForMessage(hostConnection, message => message === 'startgame::');
        await waitForMessage(joinerConnection, message => message === 'startgame::');
    });
});
