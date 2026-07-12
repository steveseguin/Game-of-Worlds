'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { traceDirectRoute, summarizeKnownRoute } = require('../server/lib/movement/routes');

test('direct routes cross the sectors between A and B and omit the source', () => {
    assert.deepEqual(traceDirectRoute(1, 5, 5, 5), [2, 3, 4, 5]);
    assert.deepEqual(traceDirectRoute(1, 25, 5, 5), [7, 13, 19, 25]);
    assert.deepEqual(traceDirectRoute(11, 15, 5, 5), [12, 13, 14, 15]);
});

test('known route summary does not reveal unmapped hazards', () => {
    const known = new Map([
        [2, { type: 1, owner: null }],
        [4, { type: 2, owner: null }],
        [5, { type: 1, owner: 9 }]
    ]);
    assert.deepEqual(summarizeKnownRoute([2, 3, 4, 5], known, 9), {
        unknown: 1,
        asteroids: [2],
        blackHoles: [4]
    });
});

test('invalid or zero-length routes fail closed', () => {
    assert.deepEqual(traceDirectRoute(4, 4, 5, 5), []);
    assert.deepEqual(traceDirectRoute(0, 4, 5, 5), []);
    assert.deepEqual(traceDirectRoute(1, 99, 5, 5), []);
});
