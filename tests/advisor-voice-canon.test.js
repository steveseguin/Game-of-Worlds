// The advisor's lines are the only piece of the setting a player reliably hears, and they are
// plain data in a single object - which means they rot silently. A missing key is not an error,
// it is *silence*: say() returns early, nothing throws, and the race simply stops speaking about
// black holes. advisor-observers-fire.test.js guards the patterns that trigger lines; nothing
// guarded the lines themselves.
//
// This file does. It exists because of a real regression: advisor.js shipped for a long time with
// three voices - "dry", "cold", "feral" - spread across twelve races, so the Bioform Collective
// (patient, agricultural) and the Titan Lords (formal, no contractions) both shouted "BLOOD IN
// THE BLACK!" and a total fleet loss drew a joke about spaghetti. lore/03-themes.md and
// lore/17-the-feed/06-refusals.md forbid both: twelve races have twelve registers, and humour
// never touches a loss.
//
// So: assert completeness, assert the registers are actually distinct, and assert nobody is
// being funny about a death.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const advisorSrc = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'advisor.js'), 'utf8');

/** Lift the real objects out of the source rather than reimplementing them. */
function lift(name, pattern) {
    const block = advisorSrc.match(pattern);
    assert.ok(block, `could not find ${name} in advisor.js`);
    return new Function(`${block[0]}; return ${name};`)();
}

const VOICES = lift('VOICES', /const VOICES = \{[\s\S]*?\n {4}\};/);
const RACE_VOICE = lift('RACE_VOICE', /const RACE_VOICE = \{[\s\S]*?\n {4}\};/);
const OBSERVERS = lift('OBSERVERS', /const OBSERVERS = \[[\s\S]*?\n {4}\];/);

/** Every event key any voice defines. The union, so a typo in one voice still shows up. */
function allEventKeys() {
    return [...new Set(Object.values(VOICES).flatMap(v => Object.keys(v)))];
}

function everyLine() {
    return Object.entries(VOICES).flatMap(([voice, events]) =>
        Object.entries(events).flatMap(([event, lines]) =>
            lines.map(line => ({ voice, event, line }))));
}

test('all twelve races map to a voice that exists', () => {
    const missing = [];
    for (let id = 1; id <= 12; id += 1) {
        const name = RACE_VOICE[id];
        if (!name) missing.push(`race ${id} is unmapped`);
        else if (!VOICES[name]) missing.push(`race ${id} -> "${name}", which is not a voice`);
    }
    assert.deepEqual(missing, [], missing.join('\n  '));
});

test('the twelve races have twelve distinct registers, not three shared ones', () => {
    // The regression this file was written for. Collapsing registers is what put a war cry in
    // the mouth of a people whose defining trait is patience.
    const used = new Set(Object.keys(RACE_VOICE).map(id => RACE_VOICE[id]));
    assert.equal(used.size, 12,
        `twelve races share only ${used.size} voices: ${[...used].join(', ')}`);
});

test('no line is shared between two races', () => {
    // A softer version of the same guard: even with twelve named voices, copy-paste between
    // them would quietly undo the point.
    const byLine = new Map();
    for (const { voice, line } of everyLine()) {
        if (!byLine.has(line)) byLine.set(line, new Set());
        byLine.get(line).add(voice);
    }
    const shared = [...byLine.entries()]
        .filter(([, voices]) => voices.size > 1)
        .map(([line, voices]) => `${[...voices].join(' + ')}: "${line.slice(0, 60)}..."`);

    assert.deepEqual(shared, [], `these lines appear in more than one register:\n  ${shared.join('\n  ')}`);
});

test('every voice covers every event, with at least one line', () => {
    const keys = allEventKeys();
    const gaps = [];
    for (const [voice, events] of Object.entries(VOICES)) {
        for (const key of keys) {
            if (!Array.isArray(events[key])) gaps.push(`${voice}.${key} is missing`);
            else if (events[key].length === 0) gaps.push(`${voice}.${key} is empty`);
            else if (events[key].some(l => typeof l !== 'string' || !l.trim())) {
                gaps.push(`${voice}.${key} has a blank line`);
            }
        }
    }
    assert.deepEqual(gaps, [],
        `a missing key is silence, not an error:\n  ${gaps.join('\n  ')}`);
});

test('every event an observer can fire is one every voice can answer', () => {
    // The live coupling: observe() matches server text, picks an event key, and say() looks it
    // up in the current race's voice. A key no voice defines means the advisor watches the
    // event and says nothing.
    const keys = new Set(allEventKeys());
    const orphans = [...new Set(OBSERVERS.map(o => o.event))].filter(e => !keys.has(e));
    assert.deepEqual(orphans, [],
        `observers fire these events but no voice has lines for them: ${orphans.join(', ')}`);
});

test('nobody is funny about a loss', () => {
    // lore/17-the-feed/06-refusals.md: humour is rationed to refusals, where nobody has died.
    // Hazards, battles and probes are humour-free forever. An exclamation mark is a crude proxy
    // for levity, and it is the one that would have caught the old copy - "The dark mouth ate
    // our fleet!" and "Probe dead. It screamed in radio. Lovely."
    const LOSSES = ['probeLost', 'blackHole', 'asteroidLoss', 'battleLost', 'gameLost'];
    const levity = everyLine()
        .filter(({ event }) => LOSSES.includes(event))
        .filter(({ line }) => /[!]/.test(line))
        .map(({ voice, event, line }) => `${voice}.${event}: "${line.slice(0, 60)}..."`);

    assert.deepEqual(levity, [],
        `loss events must carry no exclamation:\n  ${levity.join('\n  ')}`);
});

test('the advisor memory speaks in twelve registers too, not one', () => {
    // RECALL is a second table of lines, added after this test was written, and it very nearly shipped
    // as ONE shared set - which would have had a Bioform tender saying "I have stopped writing the
    // preamble", a Terran Registry sentence. That is the same collapse this whole file exists to
    // prevent, and it would have passed every assertion above, because they all inspect VOICES.
    //
    // The lesson generalises: a guard only covers the structure it was told about. A new table needs a
    // new assertion, and the honest place to notice that is when adding the table.
    const recall = lift('RECALL', /const RECALL = \{[\s\S]*?\n {4}\};/);

    const missing = Object.keys(VOICES).filter(v => !recall[v]);
    assert.deepEqual(missing, [],
        `these registers have no recall lines, so their players get none: ${missing.join(', ')}`);

    // Every entry needs both situations, or a player hits a branch with nothing in it.
    const incomplete = Object.entries(recall)
        .filter(([, set]) => !set.thirdSweep || !set.longQuiet)
        .map(([name]) => name);
    assert.deepEqual(incomplete, [], `incomplete recall sets: ${incomplete.join(', ')}`);

    // And no line may be shared between two races - the same rule the VOICES table obeys.
    const seen = new Map();
    const shared = [];
    for (const [name, set] of Object.entries(recall)) {
        for (const line of Object.values(set)) {
            const key = line.trim().toLowerCase();
            if (seen.has(key)) shared.push(`"${line}" in both ${seen.get(key)} and ${name}`);
            else seen.set(key, name);
        }
    }
    assert.deepEqual(shared, [], `recall lines shared between registers:\n  ${shared.join('\n  ')}`);
});

test('the Terran register is the narrator, and it keeps the tic', () => {
    // Rell's verbal habit, per lore/05-characters.md: ships are destroyed, crews DID NOT ARRIVE.
    // It is the single most characterising choice in the project and it lives in ordinary copy,
    // so it is exactly the kind of thing a later edit smooths away without noticing.
    assert.equal(RACE_VOICE[1], 'terran', 'race 1 should speak in the Terran register');
    const terran = Object.values(VOICES.terran).flat().join(' ');
    assert.match(terran, /did not arrive/i,
        'the Terran register has lost "did not arrive" - see lore/05-characters.md');
});
