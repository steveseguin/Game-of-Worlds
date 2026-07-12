const test = require('node:test');
const assert = require('node:assert/strict');

const server = require('../server/server');
const combat = require('../server/lib/combat');

test('an attacking victory transfers the sector and surviving infrastructure', async () => {
    const queries = [];
    server.setDatabase({
        isMock: true,
        query(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            const normalized = String(sql).replace(/\s+/g, ' ').trim();
            queries.push({ sql: normalized, params: params || [] });

            if (/^SELECT owner, type FROM map1/.test(normalized)) return callback(null, [{ owner: 2, type: 10 }]);
            if (/^SELECT type, COUNT\(\*\) as count FROM ships1/.test(normalized)) {
                return callback(null, [{ type: 1, count: 1 }]);
            }
            if (/^SELECT race_id, tech FROM players1/.test(normalized)) return callback(null, [{ race_id: 1, tech: '' }]);
            if (/^SELECT id FROM buildings1/.test(normalized)) return callback(null, []);
            if (/^DELETE FROM ships1/.test(normalized)) return callback(null, { affectedRows: 1 });
            if (/^INSERT INTO ships1/.test(normalized)) return callback(null, { affectedRows: 1, insertId: 1 });
            if (/^UPDATE map1 SET owner/.test(normalized)) return callback(null, { affectedRows: 1 });
            if (/^UPDATE buildings1 SET owner/.test(normalized)) return callback(null, { affectedRows: 1 });
            if (/^SELECT \* FROM map1/.test(normalized)) return callback(null, []); // best-effort UI refresh
            callback(null, []);
        }
    });

    const originalConductBattle = combat.conductBattle;
    const originalFormatBattleMessage = combat.formatBattleMessage;
    combat.conductBattle = () => ({
        result: 'attackerVictory',
        initial: { attackers: { 1: 1 }, defenders: { 1: 1 } },
        final: { attackers: { 1: 1 }, defenders: {}, orbitalTurrets: 0 },
        rounds: []
    });
    combat.formatBattleMessage = () => 'battle:fixture';

    try {
        await server.resolveBattle(1, 7, 1, 2);
    } finally {
        combat.conductBattle = originalConductBattle;
        combat.formatBattleMessage = originalFormatBattleMessage;
        const pause = server.gameState.battlePause[1];
        if (pause && pause.timer) clearTimeout(pause.timer);
        delete server.gameState.battlePause[1];
    }

    assert.ok(queries.some(query => /^UPDATE map1 SET owner/.test(query.sql) && Number(query.params[0]) === 1));
    const capture = queries.find(query => /^UPDATE buildings1 SET owner/.test(query.sql));
    assert.ok(capture && Number(capture.params[0]) === 1);
    assert.match(capture.sql, /GREATEST\(1, level - 1\)/, 'captured Spaceports lose one tier');
});
