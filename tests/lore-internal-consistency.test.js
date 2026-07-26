// Every other canon guard in this repo checks prose against CODE. Nothing checked prose against
// PROSE, and that is the gap that has now produced the same failure twice:
//
//   - R7: six files and one anthology piece asserted sector types 3-5 were unassigned. They never
//     were. Caught by finally reading lib/map.js.
//   - R11: Q10 was written and contradicted three of the seven Wonder rules in
//     13-wonders/README.md - the prerequisite, the announcement, and whether a finished Wonder wins.
//     Caught by a human asking for a review.
//
// A general "does this folder contradict itself" test is not achievable and this does not attempt
// one. It does two achievable things instead:
//
//   1. Cross-references resolve. A pointer to a file that does not exist, or to a decision that was
//      never recorded, is a defect a reader hits and an author never does.
//   2. Rules that have already been reconciled stay reconciled. Crude, and it is precisely the
//      crude version that would have caught all three of R11's conflicts - because in every case the
//      contradiction was a specific superseded sentence left standing in another file.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const loreRoot = path.join(root, 'lore');

/** Every lore markdown file, with newlines flattened so a claim that wraps a line still matches. */
function loreFiles() {
    const out = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.md')) {
                const raw = fs.readFileSync(full, 'utf8');
                out.push({
                    file: path.relative(root, full).replace(/\\/g, '/'),
                    name: entry.name,
                    dir: path.dirname(full),
                    raw,
                    flat: raw.replace(/\s+/g, ' ')
                });
            }
        }
    };
    walk(loreRoot);
    assert.ok(out.length > 50, `expected the lore folder, found ${out.length} files`);
    return out;
}

// REPORT-CARD.md quotes the errors it records, so a grep cannot tell a description of a false claim
// from an assertion of one. The audit log must sit outside the audited set - this bit immediately the
// first time a superseded-phrase guard was written.
const NOT_CANON = new Set(['REPORT-CARD.md']);

test('every lore file referenced by another lore file exists', () => {
    // A dangling pointer is invisible to the person who wrote it and a dead end for everyone else.
    // Found one on its first run: 10-the-long-file/08-star-nomads.md pointed at
    // `01-terran-empire.md`, which lives under 04-factions/.
    const files = loreFiles();
    const dangling = [];

    for (const f of files) {
        for (const m of f.raw.matchAll(/`([0-9]{2}-[A-Za-z0-9._/-]+\.md)`/g)) {
            const ref = m[1];
            const candidates = [
                path.join(loreRoot, ref),
                path.join(f.dir, ref),
                path.join(f.dir, '..', ref)
            ];
            if (!candidates.some(c => fs.existsSync(c))) dangling.push(`${f.file} -> ${ref}`);
        }
    }

    assert.deepEqual(dangling, [],
        `these references point at files that do not exist:\n  ${dangling.join('\n  ')}`);
});

test('every decision cited by number is actually recorded', () => {
    // Files cite decisions as "Q10", "Q10c", "08-open-questions.md Q5d". If a citation names a
    // question the record does not contain, a reader is sent to look for a ruling nobody made.
    const files = loreFiles();
    const record = files.find(f => f.name === '08-open-questions.md');
    assert.ok(record, 'the decision record is missing');

    const recorded = new Set(
        [...record.raw.matchAll(/^#{2,3} (Q[0-9]+[a-z]?)/gm)].map(m => m[1])
    );
    assert.ok(recorded.size >= 10, `only found ${recorded.size} recorded questions; the heading format changed`);

    const missing = [];
    for (const f of files) {
        if (NOT_CANON.has(f.name)) continue;
        for (const m of f.flat.matchAll(/\bQ([0-9]+[a-z]?)\b/g)) {
            const cited = `Q${m[1]}`;
            if (!recorded.has(cited)) missing.push(`${f.file} cites ${cited}`);
        }
    }

    assert.deepEqual([...new Set(missing)], [],
        `these citations name decisions the record does not contain:\n  ${[...new Set(missing)].join('\n  ')}`);
});

test('the Wonder rules reconciled in R11 stay reconciled', () => {
    // Three superseded sentences, in the words they were written in. Each was true before Q10 and
    // false after it, and each sat in 13-wonders/README.md contradicting a locked decision.
    //
    // Matching phrasing is crude. It is also exactly what was needed: in all three cases the
    // contradiction WAS a specific sentence left standing, and a grep for it would have found what
    // six passes of reading did not.
    const files = loreFiles().filter(f => !NOT_CANON.has(f.name));

    const superseded = [
        {
            // Rule 2 - the research capstone is no longer the only prerequisite.
            pattern: /and nothing else\. No shortcuts, no purchase, no trade/gi,
            why: 'Q10 added a relic prerequisite, and relics can be given by conquest or by lifter'
        },
        {
            // Rule 6 - a finished Wonder is now the victory.
            pattern: /accelerant, not an autowin/gi,
            why: 'Q10f made a finished Wonder the victory; the requirement moved into the build'
        }
    ];

    // A superseded sentence has to be QUOTED to be recorded as superseded, so the guard cannot work
    // on presence alone - it fired on its first run against the two files that document the
    // amendment, which is the same trap that put REPORT-CARD.md in NOT_CANON. Distinguish by
    // looking back for a supersession marker, the way the sector-types guard does.
    const RECORDING = /used to read|Rule \d+ said|superseded|amended|withdrawn|no longer|was written when|has been amended|conflict|the letter of/i;

    const offenders = [];
    for (const f of files) {
        for (const rule of superseded) {
            for (const m of f.flat.matchAll(rule.pattern)) {
                // Look BOTH ways. A record of a supersession puts its marker before the quote in
                // 13-wonders ("This rule used to read ...") and after it in the decision record
                // ("Rule 6 said ... Q10f makes ... the letter of it is wrong"). A one-directional
                // window passed one file and failed the other.
                const context = f.flat.slice(Math.max(0, m.index - 400), m.index + m[0].length + 400);
                if (RECORDING.test(context)) continue;   // documenting the change, not making the claim
                offenders.push(`${f.file}: ${rule.why}`);
            }
        }
    }
    assert.deepEqual([...new Set(offenders)], [],
        `these files assert a rule Q10 superseded:\n  ${[...new Set(offenders)].join('\n  ')}`);
});

test('the siteless-Wonder problem is still recorded as open', () => {
    // Q10f announces construction with its sector; the Shadow Realm's Wonder has no sector. That
    // conflict is the kind of thing that gets quietly dropped rather than solved, and dropping it
    // means the obvious implementation deletes the exception 13-wonders/README.md calls the whole
    // point of that race. Three files must keep saying so until somebody decides.
    const files = loreFiles();
    const mustFlagIt = ['08-open-questions.md', '13-wonders/README.md', '27-the-unattributed.md'];

    const silent = [];
    for (const want of mustFlagIt) {
        const f = files.find(x => x.file === `lore/${want}` || x.file.endsWith(`/${want}`));
        assert.ok(f, `${want} is missing`);
        if (!/has no site|siteless/i.test(f.flat)) silent.push(f.file);
    }
    assert.deepEqual(silent, [],
        'these files no longer record that the Shadow Realm Wonder has no site, which the '
        + `construction announcement depends on:\n  ${silent.join('\n  ')}`);
});

test('no file claims the artifact field is still undecided', () => {
    // Q5d asked whether the field should do anything and Q10 answered it. The encyclopedia - the
    // "start here for facts" file - still said "not canon until a mechanics decision is made" a full
    // pass after the decision was made, which is the worst possible place for a stale status.
    //
    // "Nothing reads it" is NOT matched here, deliberately: that remains true of the code, and a
    // guard that punished an accurate statement would teach the next author to delete a true line.
    const offenders = loreFiles()
        .filter(f => !NOT_CANON.has(f.name))
        .filter(f => /artifact[^.]{0,120}not canon until|not canon until a mechanics decision/i.test(f.flat))
        .map(f => f.file);

    assert.deepEqual(offenders, [],
        `these files still call the artifact mechanic undecided:\n  ${offenders.join('\n  ')}`);
});
