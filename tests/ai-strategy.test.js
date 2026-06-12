const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const EventEmitter = require('node:events');

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

function createConn(userId) {
  const messages = [];
  return { name: String(userId), gameid: null, raceid: null, messages, sendUTF(msg) { messages.push(msg); } };
}

function attach(conn) {
  serverLogic.gameState.clients.push(conn);
  serverLogic.gameState.clientMap[conn.name] = conn;
}

async function waitFor(conn, predicate, timeout = 1500) {
  const start = Date.now();
  while (Date.now() - start <= timeout) {
    const match = conn.messages.find(predicate);
    if (match) return match;
    await delay(15);
  }
  throw new Error('timeout');
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
    if (payload !== undefined) req.emit('data', Buffer.from(JSON.stringify(payload)));
    req.emit('end');
  });
}

async function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

test.describe('AI strategy basics', () => {
  test.beforeEach(t => {
    const mockDb = createMockDatabase();
    serverLogic.setDatabase(mockDb);
    resetGameState();
    t.context = { mockDb };
  });

  test.afterEach(() => resetGameState());

  test('AI colonizes and spends research over a few turns', async t => {
    const { mockDb } = t.context;

    const reg = await execJson(serverLogic.handleRegister, {
      username: 'aiHost',
      password: 'Secure123',
      email: 'ai@example.com'
    });
    const hostId = reg.body.userId;

    const host = createConn(hostId);
    attach(host);
    serverLogic.handleCreateGame('//creategame:AI-strategy:2', host);
    const created = await waitFor(host, m => m.startsWith('creategame::success::'));
    const createdGameId = Number(created.split('::')[2]);
    serverLogic.handleJoinGame(`//joingame:${createdGameId}:1`, host);
    await waitFor(host, m => m.startsWith('joingame::success::'));

    serverLogic.handleAddAi('//addai:aggressive:balanced', host);
    await waitFor(host, m => m.startsWith('addai::success::'));

    serverLogic.handleGameStart(host);
    await waitFor(host, m => m === 'startgame::');

    const players = await query(mockDb, `SELECT userid, homeworld, research, tech FROM players${host.gameid}`);
    const ai = players.find(p => p.userid !== hostId);
    assert.ok(ai, 'AI player exists');

    // Give AI ample resources and a spaceport so it can act during processTurn
    await query(mockDb, `UPDATE players${host.gameid} SET metal = ?, crystal = ?, research = ? WHERE userid = ?`, [1500, 600, 300, ai.userid]);
    await query(mockDb, `INSERT INTO buildings${host.gameid} (sectorid, type, owner) VALUES (?, ?, ?)`, [ai.homeworld, 3, ai.userid]);

    // Run a few turns to trigger AI spending/building
    for (let i = 0; i < 3; i++) {
      serverLogic.processTurn(host.gameid);
      await delay(50);
    }

    const refreshedPlayers = await query(mockDb, `SELECT userid, research, tech FROM players${host.gameid}`);
    const refreshedAi = refreshedPlayers.find(p => p.userid === ai.userid);
    const techString = refreshedAi.tech || '';
    const researchSpent = refreshedAi.research < 300 || techString.length > 0;
    assert.ok(researchSpent, 'AI should spend research or unlock tech');

    const aiShips = await query(mockDb, `SELECT * FROM ships${host.gameid} WHERE owner = ?`, [ai.userid]);
    assert.ok(aiShips.length > 0, 'AI should build ships when resourced');
  });
});
