const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the exact cleanup implementation without loading app/payment modules
// or opening services. A bounded pool must release every explicit lease before
// an operation awaits another pooled query when no free connections remain.
const source = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
function section(start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `Missing source boundary: ${start}`);
    return source.slice(from, to);
}
const cleanup = section('function dropGameTables(', 'function abandonGame(')
    + section('function queryDb(', 'const openInitializationSession =');
const tableBases = ['map', 'players', 'ships', 'buildings', 'diplomacy', 'wonders', 'explored_sectors', 'game_snapshots'];
const turn = () => new Promise(resolve => setImmediate(resolve));

function fixture(size, failure) {
    let used = 0;
    const queued = [];
    const sessions = [];
    const events = [];
    const enqueue = cb => {
        if (used === size) return queued.push(cb);
        used++;
        queueMicrotask(cb);
    };
    const returnSlot = () => {
        used--;
        if (queued.length) enqueue(queued.shift());
    };
    const db = {
        getConnection(cb) {
            enqueue(() => {
                const session = { releases: 0, rollbacks: 0, committed: false };
                sessions.push(session);
                cb(null, {
                    beginTransaction(cb) { queueMicrotask(() => cb(failure === 'begin' ? new Error('begin failed') : null)); },
                    query(sql, params, cb) {
                        if (typeof params === 'function') { cb = params; params = []; }
                        queueMicrotask(() => {
                            events.push(sql);
                            if (sql.startsWith('SELECT * FROM games')) return cb(null, [{id: params[0], started: 0, status: 'waiting', created: 0}]);
                            if (sql.startsWith('SELECT COUNT')) return cb(null, [{count: 0}]);
                            if (sql.startsWith('DELETE FROM games')) return cb(null, {affectedRows: 1});
                            if (sql.startsWith('UPDATE users')) return cb(['membership', 'rollback'].includes(failure) ? new Error('membership failed') : null, {affectedRows: 1});
                            assert.fail(`Unexpected session query: ${sql}`);
                        });
                    },
                    commit(cb) {
                        session.committed = failure !== 'commit';
                        queueMicrotask(() => cb(failure === 'commit' ? new Error('commit failed') : null));
                    },
                    rollback(cb) { session.rollbacks++; queueMicrotask(() => cb(failure === 'rollback' ? new Error('rollback failed') : null)); },
                    release() {
                        assert.equal(++session.releases, 1, 'explicit leases must be released once');
                        returnSlot();
                    }
                });
            });
        },
        query(sql, params, cb) {
            if (typeof params === 'function') { cb = params; params = []; }
            enqueue(() => {
                events.push(sql);
                returnSlot();
                if (sql.startsWith('DROP TABLE')) return cb(failure === 'drop' ? new Error('drop failed') : null, {});
                if (sql === 'SELECT 1') return cb(null, [{one: 1}]);
                assert.fail(`Unexpected pooled query: ${sql}`);
            });
        }
    };
    const context = {
        db, gameTables: id => Object.fromEntries(tableBases.map(base => [base, `${base}${id}`])),
        GAME_TABLE_SUFFIXES: tableBases, WAITING_ROOM_LIFETIME_MS: 86400000,
        EMPTY_ROOM_GRACE_MS: 300000, waitingRoomSweepRunning: false,
        deletingWaitingGames: new Set(), initializingGames: new Set(),
        lobbyMutationCounts: new Map(), lobbySeatReservations: new Map(),
        gameState: { clients: [] }, stopGameRuntime() {}, console: {warn() {}}
    };
    vm.createContext(context);
    vm.runInContext(cleanup, context);
    return {context, db, sessions, events, queued, used: () => used};
}

for (const size of [1, 2, 10]) {
    test(`${size} room deletions finish using a ${size}-connection pool`, async () => {
        const f = fixture(size);
        let completed = 0;
        const work = Array.from({length: size}, (_, i) => f.context.deleteWaitingGame(91 + i).then(result => {
            assert.equal(result, true); completed++;
        }));
        await turn();
        // A single event-loop boundary drains all fixture I/O. If no progress is
        // possible, report the retained leases/queue instead of timing out.
        assert.equal(completed, size, `${f.used()} retained connections; ${f.queued.length} pooled queries queued`);
        await Promise.all(work);
        assert.equal(f.used(), 0);
        assert.equal(f.queued.length, 0);
        assert.equal(f.context.deletingWaitingGames.size, 0);
        assert.ok(f.sessions.every(s => s.committed && s.releases === 1 && s.rollbacks === 0));
        assert.equal(f.events.filter(sql => sql.startsWith('DROP TABLE')).length, size * tableBases.length);
        await new Promise((resolve, reject) => f.db.query('SELECT 1', err => err ? reject(err) : resolve()));
    });
}

for (const failure of ['begin', 'membership', 'commit', 'rollback']) {
    test(`failed ${failure} releases its connection once without dropping tables`, async () => {
        const f = fixture(1, failure);
        await assert.rejects(f.context.deleteWaitingGame(91), new RegExp(failure));
        assert.equal(f.used(), 0);
        assert.equal(f.sessions[0].releases, 1);
        assert.equal(f.sessions[0].rollbacks, failure === 'begin' ? 0 : 1);
        assert.equal(f.context.deletingWaitingGames.size, 0);
        assert.ok(!f.events.some(sql => sql.startsWith('DROP TABLE')));
    });
}

test('failed notification and table drops still release the committed lease and deletion guard', async () => {
    const f = fixture(1, 'drop');
    const client = {gameid: 91, raceid: 1, sendUTF() { throw new Error('closed socket'); }};
    f.context.gameState.clients.push(client);
    let completed = false;
    const deletion = f.context.deleteWaitingGame(91).then(result => { completed = true; return result; });
    await turn();
    assert.equal(completed, true, 'notification and drop errors must not stall cleanup');
    assert.equal(await deletion, true);
    assert.equal(client.gameid, null);
    assert.equal(client.raceid, null);
    assert.equal(f.sessions[0].releases, 1);
    assert.equal(f.sessions[0].rollbacks, 0);
    assert.equal(f.used(), 0);
    assert.equal(f.context.deletingWaitingGames.size, 0);
});

test('the deletion guard remains held until all pooled table drops finish', async () => {
    const f = fixture(1);
    const query = f.db.query.bind(f.db);
    let releaseFirstDrop;
    f.db.query = (sql, params, cb) => {
        if (sql === 'DROP TABLE IF EXISTS map91') { releaseFirstDrop = () => query(sql, params, cb); return; }
        query(sql, params, cb);
    };
    const deletion = f.context.deleteWaitingGame(91);
    await turn();
    assert.equal(f.used(), 0, 'commit lease returned before first DROP');
    assert.equal(f.context.deletingWaitingGames.has(91), true);
    assert.equal(await f.context.deleteWaitingGame(91), false);
    releaseFirstDrop();
    assert.equal(await deletion, true);
    assert.equal(f.context.deletingWaitingGames.size, 0);
});
