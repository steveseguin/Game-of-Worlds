const test = require('node:test');
const assert = require('node:assert/strict');

const { RACE_TYPES, applyShipModifiers } = require('../server/lib/races');

test('race definitions include unique ids and expected bonuses', () => {
    const races = Object.values(RACE_TYPES);
    assert.equal(races.length, 12, 'Expected 12 defined races');

    const ids = new Set();
    const bonusKeys = [
        'metalProduction',
        'crystalProduction',
        'researchSpeed',
        'shipCost',
        'shipSpeed',
        'shipAttack',
        'shipDefense'
    ];

    for (const race of races) {
        assert.equal(typeof race.id, 'number', `Race ${race.name} is missing an id`);
        assert.equal(typeof race.name, 'string', 'Race name must be a string');
        assert.ok(race.name.length > 0, 'Race name should not be empty');

        assert.equal(ids.has(race.id), false, `Duplicate race id detected: ${race.id}`);
        ids.add(race.id);

        assert.ok(race.bonuses, `${race.name} is missing bonuses`);
        for (const key of bonusKeys) {
            assert.equal(
                typeof race.bonuses[key],
                'number',
                `Race ${race.name} is missing bonus "${key}"`
            );
        }

        if (race.unlockType === 'achievement') {
            assert.ok(race.unlockRequirement, `${race.name} requires an unlock condition`);
            assert.equal(typeof race.unlockRequirement.type, 'string');
        }
    }
});

test('applyShipModifiers applies race and unit modifiers without mutating the base stats', () => {
    const baseStats = {
        cost: { metal: 100, crystal: 80 },
        speed: 1,
        attack: 1,
        defense: 1
    };

    const mechResult = applyShipModifiers(RACE_TYPES.MECH.id, 'battleship', baseStats);

    assert.equal(baseStats.cost.metal, 100, 'Base metal cost should remain unchanged');
    assert.equal(baseStats.cost.crystal, 80, 'Base crystal cost should remain unchanged');

    assert.ok(mechResult.cost.metal > baseStats.cost.metal, 'Race shipCost bonus should apply');
    assert.ok(mechResult.defense > baseStats.defense, 'Unit defense modifier should apply');
    assert.ok(mechResult.speed < baseStats.speed, 'Race shipSpeed penalty should apply');
    assert.equal(typeof mechResult.repair, 'number', 'Unit modifier added properties should persist');
});

test('applyShipModifiers respects all-unit modifiers', () => {
    const baseStats = {
        cost: { metal: 90, crystal: 90 },
        speed: 1,
        attack: 1,
        defense: 1
    };

    const bioResult = applyShipModifiers(RACE_TYPES.ORGANIC.id, 'frigate', baseStats);

    assert.equal(typeof bioResult.growth, 'number', 'All-unit modifier should add growth property');
    assert.equal(bioResult.growth, 0.02);
    assert.ok(
        bioResult.cost.metal < baseStats.cost.metal,
        'Race shipCost modifier should affect metal cost'
    );
});
