// The Standing Advisory is the one piece of narrative text in this game that makes factual claims
// about the board, so it has exactly two ways to be wrong and both are silent.
//
//   1. It could LIE - say two mouths when the generator rolled five. Nobody would notice, and a player
//      who learned to trust it would be worse off than one who ignored it.
//   2. It could be DEAD - a threshold set outside the generator's actual range, so a branch never
//      fires and every match reads identically. This already happened: the first version used
//      `crystalAvg < 95` while real maps run 130-167, so two of three branches were unreachable and
//      every advisory ended on the same line. Measured, not guessed, is the rule here.
//
// It also has to be deterministic, for the same reason chart names are: a reading that changes when
// you reconnect is not a reading.

const test = require('node:test');
const assert = require('node:assert/strict');

const advisory = require('../server/lib/standing-advisory');
const { generateGameMap } = require('../server/lib/map');

/** A handful of real generated maps, enough to exercise the branches without being slow. */
function maps(n) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
        const m = generateGameMap(14, 8);
        out.push(Array.isArray(m) ? m : (m.sectors || Object.values(m)));
    }
    return out;
}

test('every figure in the advisory is true of the map it was composed from', () => {
    for (const [i, map] of maps(40).entries()) {
        const t = advisory.survey(map);
        const text = advisory.compose(1000 + i, map).join(' ');

        // The mouth count is the figure worth a fleet, so it is checked exactly.
        if (t.mouths === 0) {
            assert.match(text, /No collapsars are charted/,
                'a cluster with no black holes must not claim any');
        } else {
            const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
                'nine', 'ten', 'eleven', 'twelve'];
            const spoken = t.mouths < words.length ? words[t.mouths] : String(t.mouths);
            const re = new RegExp(`${spoken} mouths? (?:is|are) charted`, 'i');
            assert.match(text, re,
                `map has ${t.mouths} black holes; advisory does not say so: ${text}`);
        }

        // And a cluster with shoals must not claim it has none, which would be the worst single
        // error available - it would tell a player there is nothing here to make permanently safe.
        if (t.shoals > 0) {
            assert.doesNotMatch(text, /No shoals are recorded/,
                `map has ${t.shoals} shoals; advisory says none`);
        }
    }
});

test('it never reveals a position, and never mentions relics', () => {
    // The map is fully fogged at turn one. The advisory is character and counts; the moment it says
    // WHERE anything is, it stops being a reading and becomes free reconnaissance. Relics are worse
    // still - a relic's location is a discovery, and even the total would be a head start.
    for (const [i, map] of maps(20).entries()) {
        const text = advisory.compose(500 + i, map).join(' ');
        assert.doesNotMatch(text, /sector \d|\bat \d+\b|coordinate/i,
            `the advisory names a position: ${text}`);
        assert.doesNotMatch(text, /relic|artifact|unattributed/i,
            `the advisory mentions relics: ${text}`);
    }
});

test('the same game id always reads the same advisory back', () => {
    // A reconnect, a restart, or a second player joining must not get a different reading. This is
    // the same property sector-names.js has, for the same reason.
    const map = maps(1)[0];
    const first = advisory.compose(4242, map);
    for (let i = 0; i < 5; i += 1) {
        assert.deepEqual(advisory.compose(4242, map), first, 'the advisory is not deterministic');
    }
    // And different games should generally differ, or the "reading" is a constant.
    const others = new Set();
    for (let g = 1; g <= 40; g += 1) others.add(advisory.compose(g, map)[0]);
    assert.ok(others.size >= 3,
        `only ${others.size} distinct opening lines across 40 games; the draw is not varying`);
});

test('the poor-yield thresholds are inside the generator range, not dead code', () => {
    // The defect this file exists for. A threshold outside the real distribution is unreachable, and
    // an unreachable branch is indistinguishable from a branch that works until somebody counts.
    const samples = maps(120).map(m => advisory.survey(m));
    const crystal = samples.map(t => t.crystalAvg).sort((a, b) => a - b);
    const metal = samples.map(t => t.metalAvg).sort((a, b) => a - b);

    const pct = (arr, v) => arr.filter(x => x < v).length / arr.length;
    const crystalHitRate = pct(crystal, advisory.POOR_CRYSTAL);
    const metalHitRate = pct(metal, advisory.POOR_METAL);

    assert.ok(crystalHitRate > 0.01 && crystalHitRate < 0.5,
        `POOR_CRYSTAL=${advisory.POOR_CRYSTAL} fires on ${(crystalHitRate * 100).toFixed(0)}% of maps. `
        + `Observed range ${crystal[0].toFixed(0)}-${crystal[crystal.length - 1].toFixed(0)}. `
        + 'It should be uncommon, not never and not usual.');
    assert.ok(metalHitRate > 0.01 && metalHitRate < 0.5,
        `POOR_METAL=${advisory.POOR_METAL} fires on ${(metalHitRate * 100).toFixed(0)}% of maps. `
        + `Observed range ${metal[0].toFixed(0)}-${metal[metal.length - 1].toFixed(0)}.`);

    // And prove the branch is genuinely reachable by composing against a hand-made poor cluster.
    const poor = [{ type: 7, metalbonus: 100, crystalbonus: 100 }, { type: 1 }, { type: 2 }];
    const text = advisory.compose(1, poor).join(' ');
    assert.match(text, /Reckoning is thin|Crystal yields here are below standard/,
        'a genuinely crystal-poor cluster does not produce the crystal warning');
});

test('no line starts with a lowercase count', () => {
    // "five mouths are charted" as the first words of a feed entry reads like a fragment. Sentence
    // capitalisation is the sort of thing that survives review and then looks cheap in the product.
    for (const [i, map] of maps(20).entries()) {
        for (const line of advisory.compose(700 + i, map)) {
            assert.match(line, /^[A-Z0-9]/, `advisory line starts lowercase: "${line}"`);
        }
    }
});
