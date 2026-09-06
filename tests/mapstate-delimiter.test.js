// The map snapshot is a colon-and-comma packed CSV behind a '::' prefix, and the two delimiters
// collided the moment chart names were added to it.
//
// An unnamed sector encodes an empty chartName, which puts a literal '::' inside its own record:
//
//     mapstate::19:1:0:10:1:1::0:0,20:1:0:9:1:0::0:0,13:2:0:6:0:0::0:0
//                            ^^                 ^^                 ^^
//
// The parser derived its payload with `message.split('::')` and took element 1, so the snapshot was
// truncated at the FIRST unnamed sector. Almost every sector is unnamed, so a whole-galaxy update
// collapsed to a single tile. Nothing threw. Ownership stopped updating, probed sectors stayed
// fogged, and the only visible symptom was a map that would not change.
//
// It was caught by an end-to-end probe assertion, which is an expensive way to find a string bug.
// This is the cheap way, and it guards the hazard rather than the fix: the encoder is asserted to
// still produce '::' inside a record, so that anyone who "tidies" the parser back into a split on
// '::' fails here with the reason.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(root, 'public', 'js', 'connect.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');

/** The body of the client's mapstate parser. */
function parserBody() {
    const m = clientSrc.match(/function updateMapState\(message\) \{([\s\S]*?)\n\}/);
    assert.ok(m, 'could not find updateMapState in connect.js');
    return m[1];
}

/** Every mapstate record template the server pushes. */
function encoderTemplates() {
    const templates = [...serverSrc.matchAll(/entries\.push\(`([^`]+)`\)/g)].map(m => m[1]);
    assert.ok(templates.length >= 2,
        `expected the visible and remembered mapstate records, found ${templates.length}`);
    return templates;
}

test('the hazard is real: an unnamed sector still encodes a literal "::"', () => {
    // If this ever stops being true - because the encoder starts emitting a placeholder instead of
    // an empty chartName - then the parser no longer has to be careful, and the guard below can be
    // relaxed deliberately rather than by accident.
    const templates = encoderTemplates();

    // Render each template with an unnamed sector: every ${...} hole zero, and the chartName hole
    // empty, which is what the encoder produces for a sector nobody has named.
    const render = t => t.replace(/\$\{chartName\}/g, '').replace(/\$\{[^}]*\}/g, '0');

    const withChartFields = templates.filter(t => t.includes('${chartName}'));
    assert.equal(withChartFields.length, 2,
        `expected two records to carry chart fields (visible and remembered), found ${withChartFields.length}`);

    withChartFields.forEach(t => {
        assert.ok(render(t).includes('::'),
            `unnamed sectors no longer produce "::" in this record: ${t}. If that was deliberate, `
            + 'update this test and the comment in updateMapState together.');
    });
});

test('the short probe-loss record still parses, because the destructure defaults cover it', () => {
    // A third record shape exists and is easy to miss: the probe-loss marker is only SIX fields
    // - `${sectorId}:hazard:0:0:0:${MAP_FLAG_PROBE_LOSS}` - with no chart fields at all. The
    // parser survives it purely because its destructure supplies defaults for the last three.
    // Remove those defaults and every lost-probe marker becomes an undefined-shaped sector.
    const templates = encoderTemplates();
    const short = templates.filter(t => !t.includes('${chartName}'));
    assert.equal(short.length, 1, 'expected exactly one record without chart fields');
    assert.equal(short[0].split(':').length, 6,
        `the probe-loss record is no longer six fields: ${short[0]}`);

    const body = parserBody();
    assert.match(body, /chartNameRaw\s*=\s*''/, 'chartNameRaw lost its default');
    assert.match(body, /namedByRaw\s*=\s*'0'/, 'namedByRaw lost its default');
    assert.match(body, /namedTurnRaw\s*=\s*'0'/, 'namedTurnRaw lost its default');
});

test('the parser does not split the whole snapshot on "::"', () => {
    const body = parserBody();
    assert.doesNotMatch(body, /message\.split\(\s*['"]::['"]\s*\)/,
        'updateMapState splits the message on "::", which truncates the snapshot at the first '
        + 'unnamed sector and silently collapses the map to one tile');
    assert.match(body, /slice\(\s*PREFIX\.length\s*\)|slice\(\s*['"]mapstate::['"]\.length\s*\)/,
        'updateMapState should strip the known prefix rather than splitting on a delimiter that '
        + 'occurs inside its own payload');
});

test('the payload strategy recovers every sector, including unnamed ones', () => {
    // Behavioural, not textual: build a snapshot the way the server does and apply the parser's
    // real splitting strategy to it.
    const entries = [
        '19:1:0:10:1:1::0:0',                     // unnamed homeworld
        '20:1:0:9:1:0::0:0',                      // unnamed planet
        '13:2:0:6:0:0::0:0',                      // remembered, unnamed - the probed tile that broke
        `7:3:0:1:1:0:${encodeURIComponent("the Vail Shoal")}:4:12`,   // named
        '8:0:0:0:1:0::0:0',                       // unnamed empty space
        '31:hazard:0:0:0:32'                      // probe-loss marker: only six fields
    ];
    const message = `mapstate::${entries.join(',')}`;

    const PREFIX = 'mapstate::';
    assert.equal(message.indexOf(PREFIX), 0);
    const payload = message.slice(PREFIX.length);
    const records = payload.split(',');

    assert.equal(records.length, entries.length,
        `the snapshot lost sectors: ${records.length} of ${entries.length} survived`);

    // And each record still yields a usable sector id, at six fields or nine.
    records.forEach((record, i) => {
        const fields = record.split(':');
        assert.ok(fields.length === 9 || fields.length === 6,
            `record ${i} has ${fields.length} fields, expected 9 (full) or 6 (probe-loss)`);
        assert.ok(Number.isFinite(parseInt(fields[0], 10)), `record ${i} has no sector id`);
    });

    // The named one decodes back to a name with a space in it.
    const named = records.find(r => r.startsWith('7:'));
    assert.equal(decodeURIComponent(named.split(':')[6]), 'the Vail Shoal');

    // The old strategy, kept here to show what it did rather than described.
    assert.equal(message.split('::')[1], '19:1:0:10:1:1',
        'this is what the bug looked like: one truncated record instead of five');
});

test('a chart name can never introduce a delimiter of its own', () => {
    // The whole scheme rests on the name being URI-encoded server-side. A raw name would be able to
    // carry a ':' or a ',' and corrupt field alignment for every sector after it.
    assert.match(serverSrc, /encodeURIComponent\(visibleName \|\| ''\)/,
        'mapstate no longer URI-encodes the chart name; a name containing a comma or colon would '
        + 'shift every field after it');

    const { candidates } = require('../server/lib/sector-names');
    // Belt and braces: the generator should not be producing delimiters even before encoding.
    for (let sector = 1; sector <= 40; sector += 1) {
        for (const name of candidates(1, sector, 6)) {
            assert.doesNotMatch(name, /[:,]/, `candidate name contains a delimiter: ${name}`);
        }
    }
});
