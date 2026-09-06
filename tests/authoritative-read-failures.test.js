const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server/server');
const combat = require('../server/lib/combat');

for (const failure of ['tech', 'sectors', 'buildings']) {
    test(`income ${failure} read failures leave the turn unpaid for retry`, async () => {
        let writes = 0;
        server.setDatabase({ isMock: true, query(sql, params, callback) {
            if (typeof params === 'function') callback = params;
            if (sql.startsWith('SELECT * FROM players')) return callback(null, [{ userid: 7, race_id: 1 }]);
            if (sql.startsWith('SELECT tech')) return callback(failure === 'tech' ? new Error('outage') : null, [{ tech: '' }]);
            if (sql.includes('FROM map')) return callback(failure === 'sectors' ? new Error('outage') : null, [{ sectorid: 1, type: 10 }]);
            if (sql.includes('FROM buildings')) return callback(failure === 'buildings' ? new Error('outage') : null, []);
            writes++;
            callback(null, { affectedRows: 1 });
        } });
        await assert.rejects(server.processTurnIncome(1, 1, 2), /Income phase incomplete/);
        assert.equal(writes, 0, 'no reduced payment or completed-income marker may be stored');
    });
}

for (const failure of ['sector', 'turrets', 'profile', 'missing profile']) {
    test(`battle ${failure} lookup failure cannot produce a weakened battle or persist losses`, async () => {
        let simulations = 0;
        let writes = 0;
        const original = combat.conductBattle;
        combat.conductBattle = () => { simulations++; throw new Error('must not simulate'); };
        server.setDatabase({ isMock: true, query(sql, params, callback) {
            if (typeof params === 'function') { callback = params; params = []; }
            if (sql.startsWith('SELECT owner, type')) return callback(failure === 'sector' ? new Error('outage') : null, [{ owner: 2, type: 10 }]);
            if (sql.startsWith('SELECT type, COUNT')) return callback(null, [{ type: 1, count: 1 }]);
            if (sql.startsWith('SELECT race_id')) return callback(failure === 'profile' ? new Error('outage') : null,
                failure === 'missing profile' ? [] : [{ race_id: 1, tech: '' }]);
            if (sql.startsWith('SELECT id FROM buildings')) return callback(failure === 'turrets' ? new Error('outage') : null, []);
            writes++;
            callback(null, { affectedRows: 1 });
        } });
        try {
            await assert.rejects(server.resolveBattle(1, 7, 1, 2), /outage|Missing battle profile/);
            assert.equal(simulations, 0);
            assert.equal(writes, 0);
        } finally { combat.conductBattle = original; }
    });
}
