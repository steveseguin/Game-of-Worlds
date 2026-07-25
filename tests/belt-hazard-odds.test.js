// Asteroid belts are the game's signature risk, and the odds differ by what the ship is
// doing when it meets one. The model is closing speed, not hull type:
//
//   TRANSIT   crossing between stars at light speed, blind        50% per hull
//   ARRIVAL   decelerating into the belt as the destination       25% per hull
//   DEPARTURE leaving a belt you already occupy                    0%, never rolled
//
// Three separate code paths roll these (transit in applyRouteHazards, arrival in
// applyArrivalEffects, and probes), and a fourth behaviour - departure - is produced by
// traceDirectRoute simply not including the origin. That last one is invisible: nothing
// in the movement code says "departure is free", it just falls out of the route trace, so
// an innocent-looking change to traceDirectRoute would start charging for it with no
// failing test anywhere. Hence this file.
//
// Probes take the ARRIVAL roll, not transit: a probe's destination IS the sector. Before
// this was fixed a probe died in a belt 100% of the time, which made scouting a belt
// strictly worse than flying a cheap ship into it - the ship got the same intel, better
// odds, and the sector.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { traceDirectRoute } = require('../server/lib/movement/routes');
const serverSrc = fs.readFileSync(
    path.join(__dirname, '..', 'server', 'server.js'), 'utf8');

function constantValue(name) {
    const m = serverSrc.match(new RegExp(`const ${name} = ([0-9.]+);`));
    assert.ok(m, `could not find ${name} in server.js`);
    return Number(m[1]);
}

test('the two belt odds are the ones the design calls for', () => {
    assert.equal(constantValue('BELT_LOSS_CHANCE_TRANSIT'), 0.5,
        'crossing a belt at light speed should be a coin toss per hull');
    assert.equal(constantValue('BELT_LOSS_CHANCE_ARRIVAL'), 0.25,
        'decelerating into a belt should be markedly safer than crossing one');
    assert.ok(constantValue('BELT_LOSS_CHANCE_ARRIVAL') < constantValue('BELT_LOSS_CHANCE_TRANSIT'),
        'arriving must stay safer than crossing, or securing a belt stops being worthwhile');
});

test('every belt roll goes through a named constant, never a bare number', () => {
    // The three sites used to carry their own 0.5. Bare probabilities are how the arrival
    // rate silently stayed at 50% while the design had moved on.
    const rolls = [...serverSrc.matchAll(/Math\.random\(\)\s*[<>]\s*([^\s;)&|]+)/g)]
        .map(m => m[1].trim());
    assert.ok(rolls.length >= 3, `expected the belt rolls, found ${rolls.length}`);

    const bare = rolls.filter(r => /^[0-9.]+$/.test(r));
    assert.deepEqual(bare, [],
        `these rolls use a bare probability instead of a named constant: ${bare.join(', ')}`);
});

test('the harsher roll is transit and the gentler one is arrival, not the reverse', () => {
    // Getting these the wrong way round would still pass the constants test above while
    // inverting the whole mechanic, so check which constant each call site actually uses.
    const routeHazards = serverSrc.match(/const losses = active\.filter\(\(\) => (.+?)\);/);
    assert.ok(routeHazards, 'could not find the transit roll');
    assert.match(routeHazards[1], /BELT_LOSS_CHANCE_TRANSIT/,
        'ships crossing a belt should take the transit roll');

    const arrival = serverSrc.match(/const destroyed = ships\.filter\(\(\) => (.+?)\);/);
    assert.ok(arrival, 'could not find the arrival roll');
    assert.match(arrival[1], /BELT_LOSS_CHANCE_ARRIVAL/,
        'a fleet whose destination is the belt should take the arrival roll');
});

test('a probe takes the arrival roll, because its destination is the sector', () => {
    const probe = serverSrc.match(/sectorType === 1 && Number\(sectorOwner\) !== Number\(playerId\)\s*\n?\s*&& Math\.random\(\) < ([A-Z_]+)/);
    assert.ok(probe, 'could not find the probe belt roll');
    assert.equal(probe[1], 'BELT_LOSS_CHANCE_ARRIVAL',
        'a probe decelerates into its target sector, so it takes the arrival odds');
});

test('a black hole is never a dice roll', () => {
    // "Black holes destroy things, no questions asked." If a random ever appears next to a
    // type === 2 branch, someone has made annihilation survivable.
    const blackHoleBranches = [...serverSrc.matchAll(/if \(type === 2\)\s*\{([\s\S]{0,300}?)\}/g)]
        .concat([...serverSrc.matchAll(/if \(sectorType === 2\)\s*\{([\s\S]{0,300}?)\}/g)]);
    assert.ok(blackHoleBranches.length >= 2,
        `expected the black hole branches, found ${blackHoleBranches.length}`);
    blackHoleBranches.forEach(m => {
        assert.doesNotMatch(m[1], /Math\.random/,
            'a black hole must destroy unconditionally, with no survival roll');
    });
});

test('leaving a belt is free, because the route never includes the sector you start in', () => {
    // 10x10 map. A straight run from 1 to 5 crosses 2,3,4 and ends at 5.
    const width = 10, height = 10;
    const route = traceDirectRoute(1, 5, width, height);

    assert.ok(!route.includes(1),
        'the origin must never appear in the route, or departing a belt would be charged');
    assert.equal(route[route.length - 1], 5,
        'the destination should be the last entry (callers slice it off for transit)');
    assert.deepEqual(route, [2, 3, 4, 5], 'the plotted line should be the sectors between, plus the target');

    // The transit set is what applyRouteHazards actually rolls against.
    const transit = route.slice(0, -1);
    assert.deepEqual(transit, [2, 3, 4],
        'transit should be strictly the sectors crossed: not the origin, not the destination');
});

test('a diagonal route also excludes its origin', () => {
    // The Bresenham walk steps before it pushes; a diagonal is where an off-by-one would
    // show up first if that ever changed.
    const route = traceDirectRoute(1, 34, 10, 10);   // (0,0) -> (3,3)
    assert.ok(route.length > 0, 'a diagonal route should have sectors');
    assert.ok(!route.includes(1), 'the origin must not be in a diagonal route either');
    assert.equal(route[route.length - 1], 34, 'the destination should terminate the route');
});
