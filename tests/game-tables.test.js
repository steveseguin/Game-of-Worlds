const test = require('node:test');
const assert = require('node:assert/strict');

const { TABLE_BASES, requireGameId, gameTable, gameTables } = require('../server/lib/game-tables');

test('per-game table names accept only positive safe integer game ids', () => {
    assert.equal(requireGameId('42'), 42);
    assert.equal(gameTable('players', '42'), 'players42');
    assert.deepEqual(Object.keys(gameTables(7)), TABLE_BASES);
    assert.equal(gameTables(7).explored_sectors, 'explored_sectors7');
});

test('per-game table names fail closed for injection-shaped ids and unknown bases', () => {
    for (const value of [0, -1, 1.5, '1 OR 1=1', '1; DROP TABLE users', '', null, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => requireGameId(value), /positive safe integer/);
    }
    assert.throws(() => gameTable('users', 1), /Unsupported per-game table/);
});
