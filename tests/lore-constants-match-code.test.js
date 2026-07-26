// The lore folder quotes real numbers at players - "three hundred of reckoning", "fifty metal and
// twenty crystal", "twelve hulls at tier one", "forty-eight at tier four". Those are load-bearing:
// a codex entry that misquotes a cost is worse than one that omits it, because a player will trust
// it and plan against it.
//
// This exists because a self-review found two genuine errors in freshly written canon:
//   - a dreadnought described as taking "four turns to build", in a game with NO build time at all
//     (hulls complete when you pay; the gate is production capacity - see the comment in races.js);
//   - a tier-four spaceport costed at the price of its LAST upgrade step rather than the cumulative
//     total of all three.
//
// Neither was caught by reading. Both are caught here.
//
// Scope: this test pins the constants the prose depends on, and greps the prose for the specific
// false claims that have actually occurred. It does not attempt to parse every number in 150,000
// words - that would be a spellchecker for arithmetic and would fail constantly on legitimate
// in-world figures like crew counts and casualty tallies.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
const racesSrc = fs.readFileSync(path.join(root, 'server', 'lib', 'races.js'), 'utf8');
const tech = require('../server/lib/tech');
const combat = require('../server/lib/combat');

// The audit log is not part of the audited set. REPORT-CARD.md exists to record what went wrong,
// which means it has to QUOTE the false claims - and a grep cannot tell a description of an error
// from an assertion of it. Scanning it makes the guard fail the moment the failure is documented,
// which is exactly backwards.
//
// This is not a convenience exemption; it bit immediately. The first run after the report card
// described a dreadnought "four turns to build" failed on the report card's own sentence.
const NOT_CANON = new Set(['REPORT-CARD.md']);

/** Every lore markdown file, newlines flattened so a claim that wraps a line still matches. */
function loreFiles() {
    const out = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.md') && !NOT_CANON.has(entry.name)) {
                out.push({
                    file: path.relative(root, full).replace(/\\/g, '/'),
                    flat: fs.readFileSync(full, 'utf8').replace(/\s+/g, ' ')
                });
            }
        }
    };
    walk(path.join(root, 'lore'));
    return out;
}

function constant(name) {
    const m = serverSrc.match(new RegExp(`const ${name} = ([0-9.]+)`));
    assert.ok(m, `could not find ${name} in server.js`);
    return Number(m[1]);
}

test('the hazard odds the whole setting is built on are unchanged', () => {
    // Law 1-4 and the shoal/mouth vocabulary rest entirely on these two numbers, and dozens of
    // pieces quote them as 50% and 25%.
    assert.equal(constant('BELT_LOSS_CHANCE_TRANSIT'), 0.5);
    assert.equal(constant('BELT_LOSS_CHANCE_ARRIVAL'), 0.25);
    assert.equal(tech.MOVE_DISCOUNT_CAP, 0.6, 'lore/24-anthology/09-travel.md quotes a 60% cap');
});

test('the probe price quoted throughout the folder is the real one', () => {
    // "Three hundred of reckoning for one fact" is the single most repeated line in the project.
    assert.equal(constant('PROBE_COST_CRYSTAL'), 300);
});

test('the colony ship price quoted in two files is the real one', () => {
    const colony = Object.values(combat.SHIP_TYPES).find(s => s.id === 6);
    assert.ok(colony, 'no ship type with id 6');
    assert.equal(colony.cost.metal, 500,
        'lore/24-anthology/02-hulls.md and 06-probes-and-colony-ships.md both quote 500 metal');
});

test('building costs quoted as piece titles are the real ones', () => {
    // These are literally the headings: "Fifty Metal and Twenty Crystal", "Sixty Metal, Forty
    // Crystal", "Eighty Metal, Sixty Crystal", "Two Hundred Metal, a Hundred and Fifty Crystal".
    const expected = {
        'Metal Extractor': [50, 20],
        'Crystal Refinery': [40, 30],
        'Research Academy': [60, 40],
        'Spaceport': [100, 50],
        'Orbital Turret': [80, 60],
        'Warp Gate': [200, 150]
    };
    const block = serverSrc.match(/const BUILDING_COSTS = \{[\s\S]*?\n\};/);
    assert.ok(block, 'could not find BUILDING_COSTS');
    for (const [name, [metal, crystal]] of Object.entries(expected)) {
        const row = new RegExp(`name: "${name}", metal: (\\d+), crystal: (\\d+)`);
        const m = block[0].match(row);
        assert.ok(m, `${name} is no longer in BUILDING_COSTS under that name`);
        assert.equal(Number(m[1]), metal, `${name} metal cost changed`);
        assert.equal(Number(m[2]), crystal, `${name} crystal cost changed`);
    }
});

test('spaceport capacities and the cumulative tier-four cost are what the lore says', () => {
    const block = serverSrc.match(/const SPACEPORT_TIERS = Object\.freeze\(\{[\s\S]*?\n\}\);/);
    assert.ok(block, 'could not find SPACEPORT_TIERS');
    const caps = [...block[0].matchAll(/capacity: (\d+)/g)].map(m => Number(m[1]));
    assert.deepEqual(caps, [12, 20, 32, 48],
        'lore/24-anthology/05-buildings.md quotes 12 at tier one and 48 at tier four');

    // The error this test was written for: the upgrade steps are cumulative, and the lore now
    // quotes the total rather than the last step.
    const metal = [...block[0].matchAll(/metal: (\d+)/g)].map(m => Number(m[1]));
    const crystal = [...block[0].matchAll(/crystal: (\d+)/g)].map(m => Number(m[1]));
    const base = 100; // Spaceport in BUILDING_COSTS
    const baseCrystal = 50;
    const totalMetal = base + metal.reduce((a, b) => a + b, 0);
    const totalCrystal = baseCrystal + crystal.reduce((a, b) => a + b, 0);
    assert.equal(totalMetal, 2850, 'the cumulative metal to reach tier four changed');
    assert.equal(totalCrystal, 900, 'the cumulative crystal to reach tier four changed');

    // And check the PROSE, not just my expectation of the code. Asserting the constant against a
    // hard-coded number only proves the code has not moved; it says nothing about whether the lore
    // agrees. Both errors this test was written for were in the lore, so the lore is what to read.
    //
    // (The first attempt at fixing that piece said 2,750 and 850 - the three upgrade steps without
    //  the base Spaceport's own 100 and 50. This assertion is what caught it.)
    const buildings = loreFiles().find(f => f.file.endsWith('24-anthology/05-buildings.md'));
    assert.ok(buildings, 'the buildings anthology file has moved');
    const spelled = { 2850: 'two thousand eight hundred and fifty', 900: 'nine hundred' };
    assert.ok(buildings.flat.includes(spelled[totalMetal]),
        `05-buildings.md should quote the cumulative metal as "${spelled[totalMetal]}"`);
    assert.ok(buildings.flat.includes(spelled[totalCrystal]),
        `05-buildings.md should quote the cumulative crystal as "${spelled[totalCrystal]}"`);
});

test('shipyard levels quoted per hull are the real ones', () => {
    // 02-hulls.md states a level for each hull: frigate 0, battleship 2, dreadnought 3, carrier 3.
    const expected = { 1: 0, 2: 1, 3: 0, 4: 1, 5: 2, 6: 0, 7: 3, 8: 2, 9: 3 };
    for (const [id, level] of Object.entries(expected)) {
        assert.equal(tech.shipyardLevelRequired(Number(id)), level,
            `shipyard requirement for ship ${id} changed`);
    }
});

test('every tech max level the lore cites is the real one', () => {
    const expected = {
        LASER_WEAPONS: 5, PLASMA_CANNONS: 5, ANTIMATTER_WARHEADS: 3,
        ROCKETRY: 3, HYPERV_MISSILES: 3,
        REINFORCED_HULLS: 5, REACTIVE_ARMOR: 5, ADAPTIVE_PLATING: 3,
        DEFLECTOR_SHIELDS: 5, PHASE_SHIELDS: 4,
        ION_DRIVES: 5, WARP_DRIVES: 3,
        MILITARY_SHIPYARDS: 3, ORBITAL_ENGINEERING: 5, TERRAFORMING: 5,
        ESPIONAGE: 8, COUNTER_INTEL: 8
    };
    const wrong = [];
    for (const [key, max] of Object.entries(expected)) {
        const t = tech.TECHNOLOGIES[key];
        if (!t) { wrong.push(`${key} no longer exists`); continue; }
        if (t.maxLevel !== max) wrong.push(`${key}: code ${t.maxLevel}, lore cites ${max}`);
    }
    assert.deepEqual(wrong, [], wrong.join('\n  '));
});

test('this game still has no build time, and no lore file claims otherwise', () => {
    // The canon fact, asserted where it is documented: hulls and buildings complete when paid for.
    assert.match(racesSrc, /complete the moment you pay for/,
        'the no-build-time comment in races.js is gone; if the mechanic changed, a lot of prose '
        + 'about production capacity needs revisiting');

    // And the false claim, matched case-insensitively across line breaks - which is how the one
    // real instance escaped a hand-written grep.
    const offenders = loreFiles()
        .filter(f => /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) turns? to (?:build|complete)\b/i.test(f.flat))
        .map(f => f.file);
    assert.deepEqual(offenders, [],
        'these files describe a build duration, which this game does not have:\n  '
        + offenders.join('\n  '));
});
