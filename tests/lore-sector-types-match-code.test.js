// The lore folder asserted for six passes that sector types 3, 4 and 5 were "OPEN - unassigned",
// and an anthology file was then written inventing three new types to fill them.
//
// They were never free. server/lib/map.js has defined UNSTABLE_STAR, BROWN_DWARF and SMALL_MOON
// since the game shipped; generateGameMap rolls each at 5% of every sector on every map, so
// fifteen per cent of the galaxy is made of them; and public/js/connect.js and public/js/GUI.js
// have both been printing their names to players the whole time.
//
// The lore folder's own rule is "the code wins." The rule was published and not followed, because
// nobody checked lib/map.js against the prose. This test is the check.
//
// It is deliberately narrow: it does not police tone, wording, or which pieces exist. It asserts
// one thing - that the sector table in the lore names the same eleven types the generator makes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { SECTOR_TYPES } = require('../server/lib/map');

/** id -> name, straight from the code. This is the authority. */
function codeTypes() {
    const byId = {};
    for (const entry of Object.values(SECTOR_TYPES)) byId[entry.id] = entry.name;
    return byId;
}

function readLore(relative) {
    const file = path.join(root, 'lore', relative);
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
}

test('the generator still produces the eleven types the lore is written against', () => {
    const byId = codeTypes();
    const ids = Object.keys(byId).map(Number).sort((a, b) => a - b);
    assert.deepEqual(ids, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        'sector type ids changed; every lore file with a sector table needs revisiting');
    assert.equal(byId[3], 'Unstable Star');
    assert.equal(byId[4], 'Brown Dwarf');
    assert.equal(byId[5], 'Small Moon');
});

test('no lore file still claims types 3 to 5 are unassigned', () => {
    // The specific false claim, in the specific words it was written in. Guarding the phrasing is
    // crude, and it is the phrasing that propagated into six files and one anthology.
    const files = ['01-cosmology.md', '08-open-questions.md', '24-anthology/01-sectors.md'];
    const offenders = [];
    for (const relative of files) {
        const text = readLore(relative);
        if (!text) continue;
        // Look only at lines that talk about the 3-5 range, so an unrelated "unassigned" is safe.
        for (const line of text.split('\n')) {
            if (!/3\s*[-–]\s*5|types 3, 4 and 5|3, 4 and 5/i.test(line)) continue;
            if (/unassigned|\bfree slots?\b|nothing uses them|reserved as/i.test(line)
                && !/never (were |been )?free|was wrong|had been wrong|were never free/i.test(line)) {
                offenders.push(`${relative}: ${line.trim().slice(0, 110)}`);
            }
        }
    }
    assert.deepEqual(offenders, [],
        'these lines still describe occupied sector types as free:\n  ' + offenders.join('\n  '));
});

test('the anthology names the real types, not the invented ones', () => {
    const text = readLore('24-anthology/01-sectors.md');
    assert.ok(text, 'the anthology sector file should exist');

    // The three real names must each head a piece or be quoted as the type.
    for (const name of ['Unstable Star', 'Brown Dwarf', 'Small Moon']) {
        assert.ok(text.includes(name), `the anthology does not mention ${name}`);
    }

    // The two invented types must not appear as sector types 4 and 5. They may appear in a note
    // recording that they were cut, which is why this checks the piece headings rather than the
    // whole file.
    const headings = text.split('\n').filter(l => l.startsWith('## '));
    const invented = headings.filter(h => /Wreck Field|Dead Lamp/i.test(h));
    assert.deepEqual(invented, [],
        `these invented types still head a piece: ${invented.join(', ')}`);
});

test('the hazard flags the fiction depends on are still the ones in the code', () => {
    // Law 4 and the whole hazard model rest on exactly two types being hazardous, with these two
    // danger levels. If a third becomes hazardous, a lot of prose becomes wrong at once.
    const hazardous = Object.values(SECTOR_TYPES)
        .filter(t => t.hazardous)
        .map(t => `${t.name} (${t.dangerLevel})`)
        .sort();
    assert.deepEqual(hazardous, ['Asteroid Belt (0.5)', 'Black Hole (1)'],
        'the set of hazardous sector types changed; lore/11-laws-of-the-world.md and the whole '
        + 'shoal/mouth vocabulary are written against exactly these two');
});

test('the hover tooltip names every sector type, using the code names', () => {
    // The tooltip is the first place the setting reaches a player who never opens a codex, and it
    // is also where a wrong type name would be most visible. It carries its own copy of the eleven
    // names (public/js/ui.js is client-side and cannot require server/lib/map.js), so the two have
    // to be checked against each other or they will drift the way the lore did.
    const uiSrc = fs.readFileSync(path.join(root, 'public', 'js', 'ui.js'), 'utf8');
    const block = uiSrc.match(/const SECTOR_LORE = \{[\s\S]*?\n {4}\};/);
    assert.ok(block, 'SECTOR_LORE has gone from ui.js; the tooltip has stopped naming sector types');

    const lore = new Function(`${block[0]}; return SECTOR_LORE;`)();
    const byId = codeTypes();

    const wrong = [];
    for (const [id, name] of Object.entries(byId)) {
        const entry = lore[id];
        if (!entry) { wrong.push(`type ${id} (${name}) has no tooltip entry`); continue; }
        if (entry.name !== name) wrong.push(`type ${id}: tooltip "${entry.name}", code "${name}"`);
        if (!entry.line || !entry.line.trim()) wrong.push(`type ${id} has no explanatory line`);
    }
    assert.deepEqual(wrong, [], wrong.join('\n  '));

    // A hover is not a panel. Long lines here push the tooltip off the map.
    const tooLong = Object.entries(lore)
        .filter(([, v]) => v.line.split(/\s+/).length > 24)
        .map(([id, v]) => `type ${id}: ${v.line.split(/\s+/).length} words`);
    assert.deepEqual(tooLong, [], `tooltip lines are too long for a hover:\n  ${tooLong.join('\n  ')}`);
});

test('the in-game codex names every sector type, using the code names', () => {
    // Third copy of the same eleven names: server/lib/map.js (authority), public/js/ui.js (the
    // hover tooltip) and public/js/codex.js (the help panel). Client files cannot require the
    // server module, so duplication is unavoidable and drift is the risk. All three are checked
    // against the first.
    const codexSrc = fs.readFileSync(path.join(root, 'public', 'js', 'codex.js'), 'utf8');
    const section = codexSrc.match(/id: 'sectors'[\s\S]*?id: 'twelve'/);
    assert.ok(section, 'the codex has lost its Sectors section');

    const missing = Object.values(codeTypes()).filter(name => !section[0].includes(`'${name}'`));
    assert.deepEqual(missing, [],
        `the codex Sectors tab does not name these types: ${missing.join(', ')}`);
});

test('the codex lists all twelve races', () => {
    // The race table in the codex is player-facing and the roster is fixed at twelve. A missing
    // row reads as a missing race.
    const { RACE_TYPES } = require('../server/lib/races');
    const codexSrc = fs.readFileSync(path.join(root, 'public', 'js', 'codex.js'), 'utf8');
    const section = codexSrc.match(/id: 'twelve'[\s\S]*?id: 'words'/);
    assert.ok(section, 'the codex has lost its Twelve section');

    const names = Object.values(RACE_TYPES).map(r => r.name);
    assert.equal(names.length, 12, 'the roster is no longer twelve races');
    const absent = names.filter(n => !section[0].includes(`'${n}'`));
    assert.deepEqual(absent, [], `the codex omits these races: ${absent.join(', ')}`);
});

test('colonizable types are still 6 through 10', () => {
    // Victory conditions query `type BETWEEN 6 AND 10`, and the anthology's "ladder" piece is
    // written against four grades plus a homeworld.
    const colonizable = Object.values(SECTOR_TYPES)
        .filter(t => t.colonizable)
        .map(t => t.id)
        .sort((a, b) => a - b);
    assert.deepEqual(colonizable, [6, 7, 8, 9, 10],
        'the colonizable range changed; victory.js queries BETWEEN 6 AND 10 and the lore ladder '
        + 'assumes four grades and a homeworld');
});
