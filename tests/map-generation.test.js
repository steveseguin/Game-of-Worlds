const test = require('node:test');
const assert = require('node:assert/strict');

const mapSystem = require('../server/lib/map');

test('seeded map generation is reproducible without changing production randomness', () => {
    const build = seed => mapSystem.generateMap(
        8,
        5,
        2,
        mapSystem.createSeededRandom(`${seed}:8:5:2`)
    );
    const first = build('game-of-worlds-e2e-v1');
    const repeat = build('game-of-worlds-e2e-v1');
    const different = build('another-seed');

    assert.deepEqual(repeat, first);
    assert.notDeepEqual(different.sectors, first.sectors);
    assert.equal(first.homeworlds.length, 2);
    assert.ok(first.sectors.some(sector => sector.sectortype === mapSystem.SECTOR_TYPES.ASTEROID_BELT.id));
    assert.ok(first.sectors.some(sector => sector.sectortype === mapSystem.SECTOR_TYPES.BLACK_HOLE.id));
});
