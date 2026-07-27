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
    //
    // 27-the-unattributed.md is exempt, and the exemption is narrow on purpose. Q10 decided that a
    // Galactic Wonder takes several turns to build, which makes it the FIRST object in the game with
    // a duration. That file is the design document for an unbuilt feature and is allowed to propose
    // the mechanic; every other file describes things that exist. Without the exemption the next
    // person to write "the Wonder takes ten turns to build" sees a failure, assumes they made a
    // mistake, and either deletes a correct line or weakens this guard - and this guard has already
    // caught two real errors, so weakening it is the worse outcome.
    const BUILD_TIME_MAY_PROPOSE = new Set(['lore/27-the-unattributed.md']);
    const offenders = loreFiles()
        .filter(f => !BUILD_TIME_MAY_PROPOSE.has(f.file))
        .filter(f => /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) turns? to (?:build|complete)\b/i.test(f.flat))
        .map(f => f.file);
    assert.deepEqual(offenders, [],
        'these files describe a build duration, which this game does not have:\n  '
        + offenders.join('\n  '));

    // The exemption is only safe while that file keeps saying the mechanic is new. If a build time
    // ever ships, this sentence has to go - and its going is the signal to revisit the prose the
    // assertion above protects.
    const unattributed = loreFiles().find(f => f.file === 'lore/27-the-unattributed.md');
    if (unattributed) {
        assert.match(unattributed.flat, /nothing in this game currently has a build time/i,
            '27-the-unattributed.md no longer flags a Wonder build time as a first for this engine; '
            + 'either the mechanic shipped (update the prose everywhere) or the caveat was lost');
    }
});

test('lore does not present retired prototype race modifiers as live mechanics', () => {
    // These identifiers and phrases previously came directly from inert fields in races.js.
    // Fiction may still describe extraordinary instruments, discontinuous motion, or mobile
    // cultures; the guarded forms are the code-shaped/stat-line claims that falsely told a
    // reader those ideas already had gameplay consumers.
    const retiredClaims = [
        /\bvision\s*1\.5\b/i,
        /\+50%\s+vision\b/i,
        /\bwarpRange\b/i,
        /\bwarp range\s*\+2\b/i,
        /\bmobile_base\b/i,
        /\bmobile-base capable\b/i,
        /\bteleport:\s*true\b/i,
        /\bphase:\s*0\.2\b/i
    ];
    const offenders = [];
    for (const file of loreFiles()) {
        for (const pattern of retiredClaims) {
            if (pattern.test(file.flat)) offenders.push(`${file.file}: ${pattern}`);
        }
    }
    assert.deepEqual(offenders, [],
        'these lore files present retired, nonfunctional race modifiers as live mechanics:\n  '
        + offenders.join('\n  '));
});

// --- Q10: relics, the Unattributed, and the Wonder victory ------------------------------------
// These are DESIGN, not shipped, and the design leans on four facts about the current code. Each is
// quoted in lore/27-the-unattributed.md and lore/STATUS.md as a reason for a decision, which makes
// them exactly the kind of claim that rots without anybody noticing.

test('the artifact distribution the relic design is built on is unchanged', () => {
    // One value per world, 1-5, on a quarter of colonizable worlds. Q10's "one relic per world at
    // most, and most worlds have none" is a description of this roll, not a new requirement.
    const mapSrc = fs.readFileSync(path.join(root, 'server', 'lib', 'map.js'), 'utf8');
    assert.match(mapSrc, /artifact\s*=\s*Math\.floor\(\s*random\(\)\s*\*\s*5\s*\)\s*\+\s*1/,
        'the artifact roll is no longer 1-5; lore/25-crystal.md Part 6 and Q10 both describe 1-5');
    assert.match(mapSrc, /random\(\)\s*<\s*0\.25/,
        'the 25% artifact chance changed; two lore files quote "twenty-five per cent"');

    const { SECTOR_TYPES } = require('../server/lib/map');
    const gated = mapSrc.match(/sectorType >= SECTOR_TYPES\.(\w+)\.id && random\(\) < 0\.25/);
    assert.ok(gated, 'the artifact roll is no longer gated on a sector type floor');
    assert.equal(SECTOR_TYPES[gated[1]].id, 6,
        'artifacts no longer start at the first colonizable type; Q10d locked "colonizable worlds '
        + 'only" against this exact gate');
});

test('the Wonder victory is still dormant, and cannot be enabled with the clock bug intact', () => {
    // victory.js has carried a WONDER condition with enabled:false since launch. Q10f revives it,
    // and flagged a real defect: turnsHeld = currentTurn - turnBuilt, selected on WHERE owner = ?,
    // hands a captor the full elapsed clock the instant they take a ten-turn-old Wonder.
    const victorySrc = fs.readFileSync(path.join(root, 'server', 'lib', 'victory.js'), 'utf8');
    const block = victorySrc.match(/WONDER:\s*\{[\s\S]*?\n {4}\}/);
    assert.ok(block, 'the WONDER victory condition has gone from victory.js');

    const dormant = /enabled:\s*false/.test(block[0]);
    const clockFromBuild = /currentTurn\s*-\s*turnBuilt/.test(block[0]);

    if (!dormant) {
        // Someone turned it on. That is fine and expected eventually - but not with this arithmetic.
        assert.ok(!clockFromBuild,
            'the WONDER victory has been enabled while it still measures currentTurn - turnBuilt. '
            + 'Under the decided design a Wonder stands on ground that can be taken, so whoever '
            + 'captures a ten-turn-old Wonder wins instantly. See lore/STATUS.md decision 3b.');
    } else {
        assert.ok(clockFromBuild || true, 'dormant; nothing to enforce yet');
        assert.match(block[0], /wonders\$\{gameId\}/,
            'the dormant check no longer reads the wonders table; Q10f is written against it');
    }
});

test('two races still cannot field a Carrier or a Dreadnought', () => {
    // This is the entire justification for the relic lifter being exempt from race doctrine. If
    // either race gains a heavy hull, the exemption stops being necessary and Q10c should be
    // revisited rather than silently kept.
    const { RACE_TYPES, RACE_ACCESS } = require('../server/lib/races');
    const HEAVY = [7, 9];   // Dreadnought, Carrier
    const nameOf = {};
    Object.values(RACE_TYPES).forEach(r => { nameOf[r.id] = r.name; });

    const excluded = [];
    for (let id = 1; id <= 12; id += 1) {
        const allowed = (RACE_ACCESS[id] || {}).ships;   // absent = all ships
        if (allowed && !HEAVY.some(s => allowed.includes(s))) excluded.push(nameOf[id]);
    }
    assert.deepEqual(excluded.sort(), ['Shadow Realm', 'Zephyr Swarm'],
        'the set of races that can field no heavy hull changed. lore/27-the-unattributed.md and '
        + 'Q10c cite exactly these two as the reason the relic lifter ignores race doctrine');
});

test('the Colony Ship doctrine exemption the lifter copies still exists', () => {
    // Q10c's precedent: "Colony (6) is always allowed". If that stops being true, the lifter has no
    // pattern to follow and needs its own justification.
    assert.match(racesSrc, /Colony \(6\) is always allowed/,
        'races.js no longer documents the Colony Ship as exempt from race ship restrictions; the '
        + 'relic lifter in Q10c is designed on that precedent');

    const { RACE_ACCESS } = require('../server/lib/races');
    const barred = Object.entries(RACE_ACCESS)
        .filter(([, acc]) => acc.ships && !acc.ships.includes(6))
        .map(([id]) => id);
    assert.deepEqual(barred, [],
        `these races list ships without the Colony Ship, contradicting the exemption: ${barred.join(', ')}`);
});
