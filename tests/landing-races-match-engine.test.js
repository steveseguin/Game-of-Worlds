// The landing page is where a player learns what a race does, and it had drifted badly
// from what the engine actually implements. Six of the twelve advertised an ability the
// game does not have, three of those under a name that exists nowhere in the code:
//
//   Mechanicus  "Auto-Repair - hulls mend 5% each turn"   -> really Forge Doctrine
//   Bioform     "Evolution - +2% stats every turn alive"  -> really Living Hulls
//   Quantum     "Entanglement - blink fleets across space"-> really Quantum Entanglement
//   Terran      "buildings raise 10% faster"              -> Terran has no bonuses at all
//   Silicon     "research costs 20% less"                 -> research OUTPUT is +30%
//   Nomads      "no shipyards required"                   -> no such exemption exists
//
// races.js had already been corrected; the landing page was its untested twin. Pin the two
// together by ability name, which is where the invented abilities showed up.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { RACE_TYPES } = require('../server/lib/races');
const landing = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'landing.html'), 'utf8');

/** Each landing race card, as { name, ability } in document order. */
function landingRaces() {
    const cards = [];
    const re = /class="race__name">([^<]+)<\/h3>[\s\S]*?class="race__ability"><span>ABILITY<\/span>([^<]+)</g;
    for (const m of landing.matchAll(re)) {
        cards.push({ name: m[1].trim(), ability: m[2].trim() });
    }
    return cards;
}

/** "Forge Doctrine - the galaxy's..." -> "Forge Doctrine" */
const abilityName = text => text.split(/\s+[-—]\s+/)[0].trim();

test('the landing page lists every race the engine has, under the engine\'s names', () => {
    const shown = landingRaces();
    const engine = Object.values(RACE_TYPES);

    assert.equal(shown.length, engine.length,
        `landing shows ${shown.length} races, the engine defines ${engine.length}`);

    const engineNames = engine.map(r => r.name).sort();
    assert.deepEqual(shown.map(r => r.name).sort(), engineNames,
        'the races named on the landing page must be the races that exist');
});

test('every advertised ability is the ability the engine actually grants', () => {
    const byName = new Map(Object.values(RACE_TYPES).map(r => [r.name, r]));
    const mismatches = [];

    landingRaces().forEach(card => {
        const race = byName.get(card.name);
        if (!race) return;                        // covered by the test above
        const advertised = abilityName(card.ability);
        const real = abilityName(race.specialAbility);
        if (advertised !== real) {
            mismatches.push(`${card.name}: landing calls it "${advertised}", the engine calls it "${real}"`);
        }
    });

    assert.deepEqual(mismatches, [],
        `the landing page advertises an ability the engine does not have:\n  ${mismatches.join('\n  ')}`);
});

test('no landing race claims a mechanic the engine never implemented', () => {
    // These exact phrases were live on the front page and describe systems that do not
    // exist anywhere in the codebase. Named individually so a regression says which.
    const fictions = [
        'buildings raise 10% faster',
        'research costs 20% less',
        'hulls mend 5% each turn',
        'stats every turn alive',
        'no shipyards required',
        'blink fleets across space'
    ];
    const found = fictions.filter(phrase => landing.includes(phrase));
    assert.deepEqual(found, [],
        `these claims describe mechanics that do not exist: ${found.join(', ')}`);
});

test('a race with no bonuses is not advertised as having one', () => {
    // Terran is deliberately all-1.0. Its selling point is the absence of a weakness, and
    // any percentage attached to it is therefore invented.
    const terran = Object.values(RACE_TYPES).find(r => r.name === 'Terran Empire');
    assert.ok(terran, 'Terran Empire should exist');

    const tweaked = Object.entries(terran.bonuses || {}).filter(([, v]) => v !== 1);
    assert.deepEqual(tweaked, [], 'Terran is the baseline race and should have no modifiers');

    const card = landingRaces().find(r => r.name === 'Terran Empire');
    assert.ok(card, 'Terran should appear on the landing page');
    assert.doesNotMatch(card.ability, /\d+\s*%/,
        `Terran has no numeric bonus, so its card must not quote one: "${card.ability}"`);
});
