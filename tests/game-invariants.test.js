const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateGameState } = require('../server/lib/game-invariants');

function validSnapshot() {
    return {
        game: { id: 1, started: 1, status: 'in-progress', turn: 4 },
        players: [
            { userid: 7, metal: 100, crystal: 80, research: 40, homeworld: 1, currentsector: 2 },
            { userid: 8, metal: 50, crystal: 40, research: 20, homeworld: 3, currentsector: 3 }
        ],
        sectors: [
            { sectorid: 1, type: 10, owner: 7 },
            { sectorid: 2, type: 1, owner: 7 },
            { sectorid: 3, type: 10, owner: 8 }
        ],
        ships: [
            { id: 1, owner: 7, type: 3, sectorid: 2 },
            { id: 2, owner: 8, type: 6, sectorid: 3 }
        ],
        buildings: [
            { id: 1, owner: 7, type: 0, sectorid: 1 },
            { id: 2, owner: 7, type: 4, sectorid: 1 },
            { id: 3, owner: 8, type: 0, sectorid: 3 }
        ]
    };
}

test('valid persisted game state satisfies all hard invariants', () => {
    const result = evaluateGameState(validSnapshot(), { turn: 4 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.counts, { players: 2, sectors: 3, ships: 2, buildings: 3 });
});

test('audit reports resource, reference, ownership, type, and capacity corruption together', () => {
    const snapshot = validSnapshot();
    snapshot.players[0].metal = -1;
    snapshot.players[0].currentsector = 999;
    snapshot.sectors[1].owner = 99;
    snapshot.ships.push({ id: 3, owner: 99, type: 12, sectorid: 999 });
    snapshot.buildings.push({ id: 4, owner: 8, type: 9, sectorid: 1 });
    snapshot.buildings.push({ id: 5, owner: 7, type: 1, sectorid: 2 });
    snapshot.buildings.push({ id: 6, owner: 7, type: 2, sectorid: 2 });

    const result = evaluateGameState(snapshot, { turn: 5 });
    const codes = new Set(result.errors.map(issue => issue.code));

    assert.equal(result.ok, false);
    [
        'INVALID_RESOURCE',
        'INVALID_PLAYER_SECTOR',
        'ORPHAN_SECTOR_OWNER',
        'ORPHAN_SHIP_OWNER',
        'ORPHAN_SHIP_SECTOR',
        'INVALID_SHIP_TYPE',
        'BUILDING_OWNER_MISMATCH',
        'INVALID_BUILDING_TYPE',
        'BUILDING_CAPACITY_EXCEEDED'
    ].forEach(code => assert.equal(codes.has(code), true, `missing ${code}`));
    assert.equal(result.warnings[0].code, 'RUNTIME_TURN_MISMATCH');
});

test('started games require players and a valid turn', () => {
    const result = evaluateGameState({
        game: { started: 1, status: 'in-progress', turn: 0 },
        players: [], sectors: [], ships: [], buildings: []
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.map(issue => issue.code), [
        'STARTED_WITHOUT_PLAYERS',
        'STARTED_WITHOUT_MAP',
        'INVALID_GAME_TURN'
    ]);
});

test('terminal games cannot retain timers, battle pauses, or active runtime state', () => {
    const snapshot = validSnapshot();
    snapshot.game.started = 1;
    snapshot.game.status = 'completed';
    const result = evaluateGameState(snapshot, {
        turn: 4,
        active: true,
        hasTimer: true,
        battlePaused: true
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.map(issue => issue.code), [
        'TERMINAL_RUNTIME_ACTIVE',
        'TERMINAL_TIMER_ACTIVE',
        'TERMINAL_BATTLE_PAUSE'
    ]);
});
