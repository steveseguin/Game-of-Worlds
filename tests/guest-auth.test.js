const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

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
                try {
                    resolve({
                        statusCode: res.statusCode,
                        body: body ? JSON.parse(body) : undefined
                    });
                } catch (err) {
                    reject(err);
                }
            }
        };

        handler(req, res);
        req.emit('data', Buffer.from(JSON.stringify(payload || {})));
        req.emit('end');
    });
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

test.describe('guest authentication and lobby access', () => {
    test.beforeEach(t => {
        const mockDb = createMockDatabase();
        t.context = { mockDb };
        serverLogic.setDatabase(mockDb);
        resetGameState();
    });

    test.afterEach(() => {
        resetGameState();
    });

    test('guest login creates and resumes the same guest account', async () => {
        const first = await executeJsonHandler(serverLogic.handleGuestLogin, {
            username: ''
        });

        assert.equal(first.statusCode, 200);
        assert.equal(first.body.success, true);
        assert.equal(first.body.isGuest, true);
        assert.match(first.body.guestToken, /^[a-f0-9]{64}$/);

        const second = await executeJsonHandler(serverLogic.handleGuestLogin, {
            guestToken: first.body.guestToken
        });

        assert.equal(second.statusCode, 200);
        assert.equal(second.body.userId, first.body.userId);
        assert.equal(second.body.username, first.body.username);
        assert.equal(second.body.isGuest, true);
    });

    test('registration upgrades a guest account instead of creating a second user', async t => {
        const guest = await executeJsonHandler(serverLogic.handleGuestLogin, {
            username: 'GuestPilot'
        });

        const registered = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'RegisteredPilot',
            password: 'Secure123',
            email: 'pilot@example.com',
            guestToken: guest.body.guestToken
        });

        assert.equal(registered.statusCode, 200);
        assert.equal(registered.body.success, true);
        assert.equal(registered.body.upgraded, true);
        assert.equal(registered.body.userId, guest.body.userId);
        assert.equal(registered.body.isGuest, false);

        const upgradedUser = t.context.mockDb.users.find(user => user.id === guest.body.userId);
        assert.equal(upgradedUser.username, 'RegisteredPilot');
        assert.equal(upgradedUser.is_guest, 0);
        assert.equal(upgradedUser.guest_token_hash, null);
    });

    test('registered-only rooms reject guest joiners', async () => {
        const hostReg = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'RegisteredHost',
            password: 'Secure123',
            email: 'host@example.com'
        });
        const guest = await executeJsonHandler(serverLogic.handleGuestLogin, {});

        const host = createMockConnection(hostReg.body.userId);
        attachConnection(host);
        serverLogic.handleCreateGame('//creategame:Registered%20Only:4:quick:1:0', host);
        const created = await waitForMessage(host, message => message.startsWith('creategame::success::'));
        const gameId = Number(created.split('::')[2]);
        serverLogic.handleJoinGame(`//joingame:${gameId}:1`, host);
        await waitForMessage(host, message => message.startsWith('joingame::success::'));

        const guestConnection = createMockConnection(guest.body.userId);
        attachConnection(guestConnection);
        serverLogic.handleJoinGame(`//joingame:${gameId}:1`, guestConnection);
        const error = await waitForMessage(guestConnection, message => message.startsWith('joingame::error::'));
        assert.match(error, /registered account/i);
    });

    test('guest creators cannot create registered-only rooms', async () => {
        const guest = await executeJsonHandler(serverLogic.handleGuestLogin, {});
        const guestConnection = createMockConnection(guest.body.userId);
        attachConnection(guestConnection);

        serverLogic.handleCreateGame('//creategame:Guest%20Gate:4:quick:1:0', guestConnection);
        const error = await waitForMessage(guestConnection, message => message.startsWith('creategame::error::'));
        assert.match(error, /register your guest account/i);
    });

    test('minimum-level rooms reject under-level non-creators', async t => {
        const hostReg = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'LevelHost',
            password: 'Secure123',
            email: 'level-host@example.com'
        });
        const joinerReg = await executeJsonHandler(serverLogic.handleRegister, {
            username: 'LevelJoiner',
            password: 'Secure123',
            email: 'level-joiner@example.com'
        });

        t.context.mockDb._userStats.set(hostReg.body.userId, {
            user_id: hostReg.body.userId,
            games_played: 20,
            wins: 5,
            losses: 0,
            total_planets_colonized: 0,
            total_crystal_earned: 0,
            total_ships_built: 0,
            total_battles_won: 0,
            total_sectors_explored: 0
        });

        const host = createMockConnection(hostReg.body.userId);
        attachConnection(host);
        serverLogic.handleCreateGame('//creategame:Level%20Gate:4:quick:0:5', host);
        const created = await waitForMessage(host, message => message.startsWith('creategame::success::'));
        const gameId = Number(created.split('::')[2]);
        serverLogic.handleJoinGame(`//joingame:${gameId}:1`, host);
        await waitForMessage(host, message => message.startsWith('joingame::success::'));

        const joiner = createMockConnection(joinerReg.body.userId);
        attachConnection(joiner);
        serverLogic.handleJoinGame(`//joingame:${gameId}:1`, joiner);
        const error = await waitForMessage(joiner, message => message.startsWith('joingame::error::'));
        assert.match(error, /requires level 5/i);
    });
});
