const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');

const serverLogic = require('../server/server');
const { createMockDatabase } = require('./helpers/mock-db');

function resetGameState() {
  const { clients, clientMap, gameTimer, turns, activeGames } = serverLogic.gameState;
  clients.length = 0;
  Object.keys(clientMap).forEach(k => delete clientMap[k]);
  Object.keys(gameTimer).forEach(k => {
    clearInterval(gameTimer[k]);
    delete gameTimer[k];
  });
  Object.keys(turns).forEach(k => delete turns[k]);
  Object.keys(activeGames).forEach(k => delete activeGames[k]);
}

function createConnection(userId) {
  const messages = [];
  return {
    name: String(userId),
    gameid: null,
    raceid: null,
    messages,
    sendUTF(msg) { messages.push(msg); }
  };
}

function attach(conn) {
  serverLogic.gameState.clients.push(conn);
  serverLogic.gameState.clientMap[conn.name] = conn;
}

async function waitFor(conn, predicate, timeoutMs = 1500) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const match = conn.messages.find(predicate);
    if (match) return match;
    await delay(15);
  }
  throw new Error('Timed out waiting for message');
}

function execJson(handler, payload) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, headers = {}) { res.statusCode = code; res.headers = headers; },
      end(body) {
        if (!body) return resolve({ statusCode: res.statusCode, body: undefined });
        try { resolve({ statusCode: res.statusCode, body: JSON.parse(body) }); }
        catch (err) { reject(err); }
      }
    };
    handler(req, res);
    if (payload !== undefined) {
      req.emit('data', Buffer.from(JSON.stringify(payload)));
    }
    req.emit('end');
  });
}

async function countPlayers(db, gameId) {
  return new Promise((resolve, reject) => {
    db.query(`SELECT COUNT(*) AS c FROM players${gameId}`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows[0].c);
    });
  });
}

async function gameRow(db, gameId) {
  return new Promise((resolve, reject) => {
    db.query('SELECT * FROM games WHERE id = ?', [gameId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows[0]);
    });
  });
}

async function sectorOwners(db, gameId) {
  return new Promise((resolve, reject) => {
    db.query(`SELECT sectorid, owner FROM map${gameId}`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

test.describe('Happy path: signup → create → add AI → select race → start', () => {
  test.beforeEach(t => {
    const mockDb = createMockDatabase();
    serverLogic.setDatabase(mockDb);
    t.context = { mockDb };
    resetGameState();
  });

  test.afterEach(() => resetGameState());

  test('creator plays solo with AI and starts game', async t => {
    const { mockDb } = t.context;

    // Register host
    const reg = await execJson(serverLogic.handleRegister, {
      username: 'soloHost',
      password: 'Secure123',
      email: 'solo@example.com'
    });
    const hostId = reg.body.userId;

    const hostConn = createConnection(hostId);
    attach(hostConn);

    // Create game
    serverLogic.handleCreateGame('//creategame:Integration%20Test:2', hostConn);
    const createdMessage = await waitFor(hostConn, m => m.startsWith('creategame::success::'));
    const createdGameId = Number(createdMessage.split('::')[2]);
    serverLogic.handleJoinGame(`//joingame:${createdGameId}:1`, hostConn);
    await waitFor(hostConn, m => m.startsWith('joingame::success::'));
    const gameId = hostConn.gameid;
    assert.ok(gameId, 'game id assigned');

    // Add AI
    serverLogic.handleAddAi('//addai:chill:balanced', hostConn);
    await waitFor(hostConn, m => m.startsWith('addai::success::'));
    const seats = await countPlayers(mockDb, gameId);
    assert.equal(seats, 2, 'host + AI present');

    // Start game
    serverLogic.handleGameStart(hostConn);
    await waitFor(hostConn, m => m === 'startgame::');

    const game = await gameRow(mockDb, gameId);
    assert.equal(game.started, 1, 'game marked started');

    // Verify map/homeworld ownership assigned
    const owners = await sectorOwners(mockDb, gameId);
    const ownedSectors = owners.filter(r => r.owner !== null && r.owner !== undefined);
    assert.ok(ownedSectors.length >= 2, 'each player should have at least a homeworld');

    const starterBuildings = await new Promise((resolve, reject) => {
      mockDb.query(`SELECT * FROM buildings${gameId}`, (err, rows) => err ? reject(err) : resolve(rows));
    });
    ownedSectors.forEach(sector => {
      const types = starterBuildings
        .filter(building => Number(building.sectorid) === Number(sector.sectorid))
        .map(building => Number(building.type));
      assert.ok(types.includes(0), 'homeworld starts with metal income');
      assert.ok(types.includes(1), 'homeworld starts with crystal income');
      assert.ok(types.includes(3), 'homeworld starts with local ship production');
    });
  });
});
