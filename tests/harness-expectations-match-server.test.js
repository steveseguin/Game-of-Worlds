// tools/full-game-sim.js drives a real game and waits on the server's own words -
// `m.includes('probe was destroyed')`, `m.startsWith('Success: Colonized')`. When the
// server is reworded those waits never resolve, and the whole simulation dies on a
// timeout whose message names the step but not the cause.
//
// That happened: a pass over the server's voice renamed asteroid belts to "shoals",
// "Our probe was destroyed" to "Probe did not arrive", and "Success: Colonized" to
// "Success: Colony confirmed". Four expectations went stale at once and the sim failed
// three times in a row, ten minutes apart, before the cause was obvious.
//
// This is the same coupling as the advisor and the event feed, which already have guards
// (advisor-observers-fire, event-icons-match-server). The harness was simply not covered.
// It runs in a second and names the exact string, rather than costing a timeout.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');

/**
 * Every literal the server can put on the wire, with template holes filled.
 *
 * Rendering matters more than it looks. An earlier version of this check compared raw
 * source text and reported `Success: Researched Metal Extraction Lv2` as stale, because
 * the server holds `Success: Researched ${tech.name} Lv${n}` — the expectation was fine
 * and the checker was wrong. A template-blind audit invents work.
 */
function serverPhrases() {
    const literals = [];
    for (const m of serverSrc.matchAll(/sendUTF\(\s*[`'"]([^`'"]{6,240})/g)) literals.push(m[1]);
    for (const m of serverSrc.matchAll(/notifyPlayer\([^,]+,\s*[`'"]([^`'"]{6,240})/g)) literals.push(m[1]);
    for (const m of serverSrc.matchAll(/msg = [`'"]([^`'"]{6,240})/g)) literals.push(m[1]);
    return literals.map(t => t
        .replace(/\$\{tech\.name\}/g, 'Metal Extraction')
        .replace(/\$\{check\.nextLevel\}/g, '2')
        .replace(/\$\{shipData\.name\}/g, 'Frigate')
        .replace(/\$\{building\.name\}/g, 'Metal Extractor')
        .replace(/\$\{[^}]*\}/g, '7')
    ).join('\n');
}

/**
 * Literals the harness waits on. Two exclusions, both learned from this check's own first
 * run flagging things that were fine:
 *   - `process.argv.includes('--verbose')` is a CLI flag, not server speech.
 *   - harnesses often lowercase the message before matching, so compare case-insensitively
 *     rather than reporting "nothing arrived" as missing when the server says "Nothing
 *     arrived".
 */
function harnessExpectations(file) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const found = new Map();

    const keep = (needle, lineNo) => {
        // Wire structure, not prose: `mapstate::`, `:homeworld:`. Those tokens are computed
        // (sectorStatusForPlayer returns them), so they never appear as a literal in the
        // server's speech and the protocol tests already cover them.
        if (needle.includes(':') && !needle.includes(' ')) return;
        if (needle.startsWith('--')) return;    // CLI flag
        if (needle.trim().length < 8) return;
        if (!found.has(needle)) found.set(needle, lineNo);
    };

    src.split('\n').forEach((line, i) => {
        if (/argv|process\.env/.test(line)) return;
        for (const m of line.matchAll(/(?:includes|startsWith)\(\s*'([^']{8,70})'\s*\)/g)) {
            keep(m[1], i + 1);
        }
        // Regex matchers too, or a harness can escape this check just by switching form -
        // which is exactly what fixing net-smoke's affordability assertion did. Compare only
        // the literal head, up to the first metacharacter: /^Error: A probe is \d+ crystal/
        // is checkable as far as "Error: A probe is ".
        //
        // Anchored regexes only. Without requiring the ^, this harvests every `//` comment
        // and file path in the file - the first attempt reported the sim's own header
        // comment as a stale server phrase. Unanchored matchers go uncovered; that is the
        // price of not drowning the signal.
        for (const m of line.matchAll(/\/\^((?:[^/\\[\](){}|*+?^$\n]){8,70})/g)) {
            keep(m[1].replace(/\s+$/, ''), i + 1);
        }
    });
    return found;
}

/**
 * Digits are wildcarded on both sides. The sim waits for "Upgraded Spaceport to level 2"
 * while the template is "...to level ${nextLevel} in sector ${buildSector}" - the wording is
 * intact and only the substituted number differs, which is not staleness. Wording changes
 * ("level" to "tier") are still caught; the exact constants are the balance tests' job.
 */
const flatten = s => s.toLowerCase().replace(/\d+/g, '#');
const says = (corpus, needle) => flatten(corpus).includes(flatten(needle));

test('the phrase harvest renders templates, so it does not invent stale strings', () => {
    // Guards the guard. If rendering breaks, everything below fails at once and the fault
    // is here rather than in the harness.
    const corpus = serverPhrases();
    assert.ok(says(corpus, 'Success: Researched Metal Extraction Lv2'),
        'template rendering is broken - a real expectation would be reported as stale');
    assert.ok(corpus.length > 2000, `harvested only ${corpus.length} characters of server speech`);
});

test('every phrase full-game-sim waits on is still something the server says', () => {
    const corpus = serverPhrases();
    const expectations = harnessExpectations('tools/full-game-sim.js');
    assert.ok(expectations.size >= 8,
        `expected the sim's server-text expectations, found ${expectations.size}`);

    const stale = [...expectations.entries()]
        .filter(([needle]) => !says(corpus, needle))
        .map(([needle, line]) => `full-game-sim.js:${line} waits for ${JSON.stringify(needle)}`);

    assert.deepEqual(stale, [],
        'the sim waits for words the server no longer uses, so it will hang until it times '
        + 'out:\n  ' + stale.join('\n  '));
});

test('every phrase net-smoke waits on is still something the server says', () => {
    const corpus = serverPhrases();
    const expectations = harnessExpectations('tools/net-smoke.js');
    const stale = [...expectations.entries()]
        .filter(([needle]) => !says(corpus, needle))
        .map(([needle, line]) => `net-smoke.js:${line} waits for ${JSON.stringify(needle)}`);

    assert.deepEqual(stale, [], 'net-smoke waits for words the server no longer uses:\n  '
        + stale.join('\n  '));
});
