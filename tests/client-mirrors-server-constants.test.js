// Guard player-facing probe prices and shared construction slot limits.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const serverSrc = read('server/server.js');

test('the probe price the client quotes is the one the server charges', () => {
    // The server names it once; the client writes the number into prose in three places -
    // the confirm prompt, an advisor warning threshold, and an onboarding hint. A player
    // talked into a probe they cannot afford is a small betrayal, and a silent one.
    const cost = Number(serverSrc.match(/const PROBE_COST_CRYSTAL\s*=\s*(\d+)/)[1]);
    assert.ok(Number.isFinite(cost) && cost > 0, 'could not read PROBE_COST_CRYSTAL');

    const quotes = [];
    for (const file of ['public/js/connect.js', 'public/js/onboarding.js']) {
        read(file).split('\n').forEach((line, i) => {
            if (!/probe/i.test(line)) return;
            for (const m of line.matchAll(/(\d{2,5})\s*(?:Crystal|crystal)/g)) {
                quotes.push({ where: `${path.basename(file)}:${i + 1}`, value: Number(m[1]) });
            }
            // the advisor compares the treasury against the price without naming the unit
            // `(Number(resources.crystal) || 0) < 300` - the gap between the word and the
            // comparison contains a digit, so a \D run cannot cross it.
            for (const m of line.matchAll(/crystal[^;]{0,40}?<\s*(\d{2,5})/g)) {
                quotes.push({ where: `${path.basename(file)}:${i + 1}`, value: Number(m[1]) });
            }
        });
    }

    assert.ok(quotes.length >= 2,
        `expected the client to quote the probe price, found ${quotes.length} places`);
    const wrong = quotes.filter(q => q.value !== cost)
        .map(q => `${q.where} says ${q.value}, server charges ${cost}`);
    assert.deepEqual(wrong, [], 'the client quotes a probe price the server does not charge:\n  '
        + wrong.join('\n  '));
});

test('build-slot fallbacks use the same rules as server integrity checks', () => {
    const rules = require('../public/js/construction-rules');
    const invariants = require('../server/lib/game-invariants');
    assert.strictEqual(invariants.BUILDING_SLOTS_BY_TYPE, rules.BUILDING_SLOTS_BY_TYPE);
    assert.match(read('public/js/GUI.js'), /slotsByType = window\.ConstructionRules\.BUILDING_SLOTS_BY_TYPE/);
    assert.match(read('public/js/build.js'), /BUILDING_SLOTS_BY_TYPE: BUILDING_SLOTS/);
});
