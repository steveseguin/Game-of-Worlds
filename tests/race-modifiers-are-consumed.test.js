// Per-hull race modifiers never applied to a real ship.
//
// unitModifiers is keyed by hull NAME ('battleship', 'scout'), and both production callers
// pass a NUMBER - buyShip does parseInt on the wire token, the access summary passes
// ship.id. So `unitModifiers[5]` was undefined, every per-hull entry fell through to the
// `all` bucket, and five races quietly lost their specialisations: Mechanicus battleships
// came out at 1.4 defence instead of 2.1, Silicon scouts at speed 1.0 instead of 1.2, and
// the Star Nomads' colony ships were never faster at all.
//
// It survived because the unit tests call applyShipModifiers with the STRING. The function
// was correct; nothing ever handed it what production hands it. A test that exercises a
// different input type from the caller is worse than no test - it reports the feature
// works, and it is right, about a code path nobody runs.
//
// Hence the first test below: the two forms must agree. Fixing the lookup rather than the
// callers means the next caller cannot get it wrong either.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { RACE_TYPES, applyShipModifiers } = require('../server/lib/races');
const serverSrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');

const SHIP_IDS = {
    frigate: 1, destroyer: 2, scout: 3, cruiser: 4, battleship: 5,
    colony: 6, dreadnought: 7, intruder: 8, carrier: 9
};

const baseStats = () => ({ cost: { metal: 100, crystal: 80 }, speed: 1, attack: 1, defense: 1 });

test('a hull id and a hull name select the same modifiers', () => {
    // The whole bug in one assertion. Every declared per-hull modifier, both ways.
    const divergent = [];
    Object.values(RACE_TYPES).forEach(race => {
        Object.keys(race.unitModifiers || {}).forEach(group => {
            const id = SHIP_IDS[group];
            if (!id) return;   // the 'all' bucket has no id
            const byName = applyShipModifiers(race.id, group, baseStats());
            const byId = applyShipModifiers(race.id, id, baseStats());
            ['speed', 'attack', 'defense'].forEach(stat => {
                if (Math.abs((byName[stat] || 0) - (byId[stat] || 0)) > 1e-9) {
                    divergent.push(`${race.name} ${group}.${stat}: name=${byName[stat]} id=${id} gives ${byId[stat]}`);
                }
            });
            if (byName.cost.metal !== byId.cost.metal) {
                divergent.push(`${race.name} ${group}.cost: name=${byName.cost.metal} id=${id} gives ${byId.cost.metal}`);
            }
        });
    });

    assert.deepEqual(divergent, [],
        'per-hull modifiers differ depending on whether the caller passes a name or an id, '
        + 'so whichever form production uses is getting the wrong ship:\n  ' + divergent.join('\n  '));
});

test('production passes ids, which is the form that used to fail', () => {
    // If the callers ever switch to names this test is stale, not wrong - but the comment
    // above would need rewriting, so make the assumption visible.
    assert.match(serverSrc, /applyShipModifiers\(raceId, ship\.id, ship\)/,
        'the access summary should still pass a numeric ship id');
    assert.match(serverSrc, /const shipType = parseInt\(parts\[1\]\)/,
        'buyShip should still parse the hull as a number');
});

test('the races with a hull specialisation actually get it', () => {
    // Spot checks in the production form (numeric id), with the intent spelled out so a
    // regression says which race lost what.
    const checks = [
        ['Mechanicus', RACE_TYPES.MECH.id, SHIP_IDS.battleship, 'defense', 1.4,
            'battleships should beat the race-wide defence bonus alone'],
        ['Silicon Collective', RACE_TYPES.SILICON.id, SHIP_IDS.scout, 'speed', 1.0,
            'scouts should be faster than the race baseline'],
        ['Star Nomads', RACE_TYPES.NOMAD.id, SHIP_IDS.colony, 'speed', 1.3,
            'colony ships should be faster than the race-wide speed bonus']
    ];

    const failures = [];
    checks.forEach(([name, raceId, shipId, stat, mustExceed, why]) => {
        const got = applyShipModifiers(raceId, shipId, baseStats())[stat];
        if (!(got > mustExceed)) failures.push(`${name}: ${stat} ${got} should exceed ${mustExceed} - ${why}`);
    });

    assert.deepEqual(failures, [], failures.join('\n  '));
});

// ---------------------------------------------------------------------------
// Inventory of what the data claims versus what the engine reads. Measured, not
// grepped: a key "does something" if it moves a stat the game uses.

/** Keys that reach a consumer: stats via applyShipModifiers, plus shields and stealth. */
const CONSUMED_KEYS = new Set(['cost', 'speed', 'attack', 'defense', 'shields', 'stealth']);

/**
 * Declared and read by nothing. applyShipModifiers copies unknown keys onto the result, so
 * they exist on the object - but no consumer looks at them. Listed so a NEW inert key
 * fails this test at the moment someone writes it, rather than being discovered later from
 * a balance report that does not add up.
 */
const KNOWN_INERT = new Set([
    'vision', 'count', 'cost_crystal', 'warpRange', 'repair',
    'growth', 'organic', 'mobile_base', 'teleport', 'phase', 'size',
    'attack_bonus_stealth'
]);

test('every declared modifier key is consumed or knowingly inert', () => {
    const surprises = [];
    Object.values(RACE_TYPES).forEach(race => {
        Object.entries(race.unitModifiers || {}).forEach(([group, mods]) => {
            Object.keys(mods || {}).forEach(key => {
                if (CONSUMED_KEYS.has(key) || KNOWN_INERT.has(key)) return;
                surprises.push(`${race.name} ${group}.${key}`);
            });
        });
    });

    assert.deepEqual(surprises, [],
        'these modifier keys are declared and nothing reads them - wire them up, delete '
        + 'them, or add them to KNOWN_INERT deliberately:\n  ' + surprises.join('\n  '));
});

test('techTreeModifiers is still read by nobody, and still names techs that do not exist', () => {
    // Recorded rather than fixed: deleting it would throw away design intent, and wiring
    // it up is a balance change. If either happens, this fails and the note gets rewritten.
    assert.equal(/techTreeModifiers/.test(serverSrc), false,
        'server.js now reads techTreeModifiers - these discounts have started applying');

    const realTechs = new Set(Object.keys(require('../server/lib/tech').TECHNOLOGIES));
    const declared = new Set();
    Object.values(RACE_TYPES).forEach(r => Object.keys(r.techTreeModifiers || {}).forEach(k => declared.add(k)));
    const matching = [...declared].filter(k => k !== 'all' && realTechs.has(k.toUpperCase()));

    assert.deepEqual(matching, [],
        'a techTreeModifiers key now names a real technology, so a discount may have '
        + 'started applying: ' + matching.join(', '));
});
