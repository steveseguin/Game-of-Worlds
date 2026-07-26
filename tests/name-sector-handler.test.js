// nameSector is the only command in the game that lets a player write something every other
// player will read, on a shared object, permanently. tests/map-naming-schema.test.js checks the
// SQL's shape. This runs the handler.
//
// The db is a local stub rather than the shared mock, deliberately: what matters here is the
// exact statement and parameters the handler produces, and a stub is the only way to see them.
// It also keeps a 1900-line hand-written SQL matcher from needing another entry.

const test = require('node:test');
const assert = require('node:assert/strict');

const serverLogic = require('../server/server');
const sectorNames = require('../server/lib/sector-names');

const GAME_ID = 42;
const SECTOR = 19;
const PLAYER = '7';

/**
 * Records the writes this handler makes and answers everything else plausibly.
 *
 * Two details matter. SELECTs get an array, because a success also triggers updateSector2,
 * whose guard is `sector.length === 0` - hand it a non-array and it walks off the end of
 * `sector[0]` instead of returning. And only the sectorname UPDATE is collected in `calls`,
 * because updateSector2's own queries would otherwise be counted as writes by this handler,
 * and its chain can still be draining when the next test starts.
 */
function stubDb(result = { affectedRows: 1 }, err = null) {
    const calls = [];
    return {
        calls,
        query(sql, params, callback) {
            const flat = String(sql).replace(/\s+/g, ' ').trim();
            if (/^UPDATE map\d+ SET sectorname/i.test(flat)) calls.push({ sql: flat, params });
            const answer = /^\s*SELECT/i.test(flat) ? [] : result;
            if (typeof callback === 'function') setImmediate(() => callback(err, answer));
        }
    };
}

function fakeConnection() {
    const sent = [];
    return {
        sent,
        gameid: GAME_ID,
        name: PLAYER,
        sendUTF(message) { sent.push(String(message)); }
    };
}

/**
 * Run the handler and resolve once it has answered.
 *
 * Waiting on the reply rather than on a fixed delay is not fussiness: every path through
 * nameSector sends the player exactly one message, so the reply IS the completion signal. A
 * `setTimeout(5)` here passed in isolation and failed inside the full suite, where the machine is
 * running a dozen test processes and 5ms buys nothing.
 */
function run(command, db, connection = fakeConnection()) {
    serverLogic.setDatabase(db);
    serverLogic.gameState.turns[GAME_ID] = 1;
    serverLogic.nameSector(command, connection);
    const deadline = Date.now() + 2000;
    return new Promise((resolve, reject) => {
        const poll = () => {
            if (connection.sent.length > 0) return resolve(connection);
            if (Date.now() > deadline) {
                return reject(new Error(`nameSector never answered: ${command}`));
            }
            setTimeout(poll, 2);
        };
        poll();
    });
}

const hex = n => Number(n).toString(16).toUpperCase();

test('a valid index becomes the name the offer showed, and only that', async () => {
    const db = stubDb();
    // Index 2 of the same deterministic list the sweep offered. If the handler resolved the
    // index against a different-length list, this would silently be a different name.
    const expected = sectorNames.candidates(GAME_ID, SECTOR, 6)[2];
    const connection = await run(`//namesector:${hex(SECTOR)}:2`, db);

    assert.equal(db.calls.length, 1, 'expected exactly one write');
    const { sql, params } = db.calls[0];
    assert.match(sql, /^UPDATE map42 SET sectorname = \?, namechosen = 1 WHERE sectorid = \? AND namedby = \? AND namedturn >= \? AND namechosen = 0$/);
    assert.deepEqual(params, [expected, SECTOR, PLAYER, 0]);
    assert.ok(connection.sent.some(m => m.includes(expected)),
        `the confirmation should name the choice; got ${JSON.stringify(connection.sent)}`);
    assert.ok(connection.sent.every(m => !m.startsWith('Error:')), 'should not report an error');
});

test('the naming window follows the authoritative game turn, not active-game metadata', async () => {
    const db = stubDb();
    serverLogic.setDatabase(db);
    serverLogic.gameState.turns[GAME_ID] = 12;
    // This tempting field is not authoritative and was the source of the original bug.
    serverLogic.gameState.activeGames[GAME_ID] = { turn: 3 };
    serverLogic.nameSector(`//namesector:${hex(SECTOR)}:1`, fakeConnection());

    const deadline = Date.now() + 2000;
    while (db.calls.length === 0 && Date.now() <= deadline) {
        await new Promise(resolve => setTimeout(resolve, 2));
    }

    assert.equal(db.calls.length, 1, 'expected the naming write');
    assert.equal(db.calls[0].params[3], 11,
        'a one-turn window at turn 12 should accept names from turn 11 onward');
    delete serverLogic.gameState.activeGames[GAME_ID];
});

test('the player id is passed through without being coerced to a number', async () => {
    // Player ids arrive off the wire as strings and are stored as strings in some tables and
    // numbers in others. Number('07') === 7 would not match a stored '07', and the failure mode
    // is silent: the UPDATE matches nothing and the player is told the sector is already named.
    const db = stubDb();
    await run(`//namesector:${hex(SECTOR)}:0`, db);
    assert.equal(db.calls[0].params[2], PLAYER);
    assert.equal(typeof db.calls[0].params[2], 'string');
});

test('an out-of-range or malformed index writes nothing at all', async () => {
    // Number(null), Number(''), Number(false) and Number([]) are all 0, so a missing index must
    // not resolve to candidate zero and stamp a name nobody picked onto a shared map.
    for (const index of ['6', '-1', '99', '', 'abc', '1.5', 'null', 'true', '0x1', ' ']) {
        const db = stubDb();
        const connection = await run(`//namesector:${hex(SECTOR)}:${index}`, db);
        assert.equal(db.calls.length, 0, `index ${JSON.stringify(index)} reached the database`);
        assert.ok(connection.sent.some(m => m.startsWith('Error:')),
            `index ${JSON.stringify(index)} was not refused`);
    }
});

test('a name cannot be supplied directly instead of an index', async () => {
    // The whole point of the index protocol: even a name the server would consider legitimate
    // must be rejected when it arrives as text, or the moderation surface reopens.
    const db = stubDb();
    const real = sectorNames.candidates(GAME_ID, SECTOR, 6)[0];
    const connection = await run(`//namesector:${hex(SECTOR)}:${real}`, db);
    assert.equal(db.calls.length, 0, 'a name off the wire reached the database');
    assert.ok(connection.sent.some(m => m.startsWith('Error:')));
});

test('a rejected write is reported as a refusal, not as success', async () => {
    // The conditional UPDATE matches nothing when the player did not sweep the sector or the
    // window has closed. Treating that as success would tell a player their name was recorded
    // when the chart still says something else.
    const db = stubDb({ affectedRows: 0 });
    const connection = await run(`//namesector:${hex(SECTOR)}:1`, db);
    assert.equal(db.calls.length, 1);
    assert.ok(connection.sent.some(m => m.startsWith('Error:')),
        `a no-match must be refused; got ${JSON.stringify(connection.sent)}`);
    assert.ok(connection.sent.every(m => !m.startsWith('Success:')));
});

test('the refusal does not reveal why, so it leaks nothing about a hidden sector', async () => {
    // "You never swept this" and "your window closed" are different facts, and one of them is
    // information about a sector the player may not be able to see. Both get the same reply.
    const db = stubDb({ affectedRows: 0 });
    const connection = await run(`//namesector:${hex(SECTOR)}:1`, db);
    const refusal = connection.sent.find(m => m.startsWith('Error:'));
    assert.ok(refusal);
    assert.doesNotMatch(refusal, /window|turn|expired|not yours|did not sweep|owner/i,
        `the refusal explains too much: ${refusal}`);
});

test('a database error is reported and never read as a success', async () => {
    const db = stubDb(null, new Error('connection lost'));
    const connection = await run(`//namesector:${hex(SECTOR)}:1`, db);
    assert.ok(connection.sent.some(m => m.startsWith('Error:')));
    assert.ok(connection.sent.every(m => !m.startsWith('Success:')));
});

test('an invalid sector token is refused before any lookup', async () => {
    for (const token of ['', 'ZZ', '0', '-4', 'undefined']) {
        const db = stubDb();
        const connection = await run(`//namesector:${token}:1`, db);
        assert.equal(db.calls.length, 0, `sector token ${JSON.stringify(token)} reached the database`);
        assert.ok(connection.sent.some(m => m.startsWith('Error:')));
    }
});

test('a player who is not in a game cannot name anything', async () => {
    const db = stubDb();
    const noGame = fakeConnection();
    noGame.gameid = null;
    const connection = await run(`//namesector:${hex(SECTOR)}:1`, db, noGame);
    assert.equal(db.calls.length, 0);
    assert.ok(connection.sent.some(m => m.startsWith('Error:')));
});

test('the candidate list the handler indexes is the one the offer is built from', async () => {
    // The offer and the resolution both pass NAME_CHOICE_COUNT. If they ever diverged, every
    // index past the shorter list would resolve to a different name than the player clicked -
    // a bug with no error and no crash, just the wrong word on the map forever.
    const serverSrc = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'server', 'server.js'), 'utf8');
    const offers = serverSrc.match(/candidates\(gameId, sectorId, NAME_CHOICE_COUNT\)/g) || [];
    const resolves = serverSrc.match(/nameByIndex\(gameId, sectorId, parts\[2\], NAME_CHOICE_COUNT\)/g) || [];
    assert.equal(offers.length, 1, 'the offer should be built with NAME_CHOICE_COUNT, once');
    assert.equal(resolves.length, 1, 'the resolution should use NAME_CHOICE_COUNT, once');
});
