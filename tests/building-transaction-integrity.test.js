const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server/server');

function fixture({ failure, transactional = true, refundFails = false, holdInsert = false } = {}) {
    let persisted = { metal: 100, crystal: 100, buildings: [] };
    let pending;
    let releaseInsert;
    const events = [];
    const sent = [];
    const query = (target, sql, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }
        sql = sql.replace(/\s+/g, ' ').trim();
        if (sql.startsWith('SELECT metal, crystal, currentsector, tech')) {
            return callback(null, [{ ...persisted, currentsector: 4, tech: '' }]);
        }
        if (sql.startsWith('SELECT owner, type FROM map')) return callback(null, [{ owner: 7, type: 10 }]);
        if (sql.startsWith('SELECT COUNT(*) as count FROM buildings')) return callback(null, [{ count: 0 }]);
        if (sql.startsWith('UPDATE players97 SET metal = metal -')) {
            events.push(`${target}:spend`);
            if (failure === 'spend') return callback(new Error('synthetic spend failure'));
            if (failure === 'balance') return callback(null, { affectedRows: 0 });
            const row = target === 'transaction' ? pending : persisted;
            row.metal -= params[0]; row.crystal -= params[1];
            return callback(null, { affectedRows: 1 });
        }
        if (sql.startsWith('INSERT INTO buildings97')) {
            events.push(`${target}:insert`);
            const finish = () => {
                if (failure === 'insert') return callback(new Error('synthetic insert failure'));
                const row = target === 'transaction' ? pending : persisted;
                row.buildings.push({ sector: params[0], type: params[1], owner: params[2] });
                callback(null, { affectedRows: 1 });
            };
            if (holdInsert) { releaseInsert = finish; return; }
            return finish();
        }
        if (sql.startsWith('UPDATE players97 SET metal = metal +')) {
            events.push('refund');
            if (refundFails) return callback(new Error('synthetic refund outage'));
            persisted.metal += params[0]; persisted.crystal += params[1];
            return callback(null, { affectedRows: 1 });
        }
        // Post-purchase resource, sector and summary refreshes are read-only.
        assert.match(sql, /^SELECT /, sql);
        callback(null, []);
    };
    const db = { isMock: true, query: (...args) => query('pool', ...args) };
    if (transactional) db.getConnection = callback => {
        events.push('acquire');
        if (failure === 'acquire') return callback(new Error('synthetic pool outage'));
        callback(null, {
            beginTransaction(done) {
                events.push('begin');
                if (failure === 'begin') return done(new Error('synthetic transaction startup failure'));
                pending = structuredClone(persisted); done();
            },
            query: (...args) => query('transaction', ...args),
            commit(done) {
                events.push('commit');
                if (failure === 'commit') return done(new Error('synthetic commit failure'));
                persisted = pending; done();
            },
            rollback(done) { events.push('rollback'); pending = null; done(); },
            release() { events.push('release'); }
        });
    };
    server.setDatabase(db);
    const connection = { name: 7, gameid: 97, sendUTF(message) {
        sent.push(String(message));
        if (String(message).startsWith('Success: Built')) events.push('acknowledge');
    } };
    return { events, sent, state: () => persisted, releaseInsert: () => releaseInsert(), async buy() {
        server.buyBuilding('//buybuilding:0:4', connection);
        await new Promise(resolve => setImmediate(resolve));
    } };
}

for (const failure of ['insert', 'commit', 'spend', 'balance', 'acquire', 'begin']) {
    test(`building ${failure} failure preserves resources and releases the construction guard`, async () => {
        const f = fixture({ failure, refundFails: true });
        await f.buy();
        assert.deepEqual(f.state(), { metal: 100, crystal: 100, buildings: [] });
        assert.ok(f.sent.some(message => message.startsWith('Error:')));
        assert.equal(f.events.includes('refund'), false, 'transaction failures must not rely on a separate refund');
        if (failure === 'begin') assert.deepEqual(f.events.slice(-2), ['begin', 'release']);
        else if (failure !== 'acquire') assert.deepEqual(f.events.slice(-2), ['rollback', 'release']);
        await f.buy();
        assert.equal(f.sent.some(message => message.includes('Another construction order')), false);
    });
}

test('building success commits its charge and insert together before acknowledging it', async () => {
    const f = fixture();
    await f.buy();
    assert.deepEqual(f.state(), { metal: 50, crystal: 80, buildings: [{ sector: 4, type: 0, owner: 7 }] });
    assert.deepEqual(f.events, ['acquire', 'begin', 'transaction:spend', 'transaction:insert', 'commit', 'release', 'acknowledge']);
    assert.ok(f.sent.some(message => message.startsWith('Success: Built Metal Extractor')));
});

test('lightweight database adapters retain compensating refunds', async () => {
    const f = fixture({ transactional: false, failure: 'insert' });
    await f.buy();
    assert.deepEqual(f.state(), { metal: 100, crystal: 100, buildings: [] });
    assert.equal(f.events.includes('refund'), true);
});

test('lightweight adapters do not report successful refunds during an outage', async () => {
    const f = fixture({ transactional: false, failure: 'insert', refundFails: true });
    await f.buy();
    assert.ok(f.sent.includes('Error: Construction failed; resource recovery could not be confirmed'));
    assert.equal(f.sent.some(message => /refunded|no resources were consumed/.test(message)), false);
});

for (const failure of [undefined, 'insert']) {
    test(`an overlapping construction cannot debit or insert while ${failure ? 'failed' : 'successful'} persistence is pending`, async () => {
        const f = fixture({ failure, holdInsert: true, refundFails: true });
        await f.buy();
        assert.deepEqual(f.state(), { metal: 100, crystal: 100, buildings: [] }, 'pending writes are uncommitted');
        await f.buy();
        assert.equal(f.sent.filter(message => message.includes('Another construction order')).length, 1);
        assert.equal(f.events.filter(event => event === 'transaction:spend').length, 1);
        assert.equal(f.events.filter(event => event === 'transaction:insert').length, 1);
        f.releaseInsert();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.events.includes('refund'), false, 'rollback must not double-credit the balance');
        assert.deepEqual(f.state(), failure
            ? { metal: 100, crystal: 100, buildings: [] }
            : { metal: 50, crystal: 80, buildings: [{ sector: 4, type: 0, owner: 7 }] });
    });
}
