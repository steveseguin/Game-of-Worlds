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

test('the siteless-Wonder exception survives the construction announcement', () => {
    // Q10f announces construction with its sector; the Shadow Realm's Wonder has no sector, and
    // 13-wonders/README.md calls that absence the whole point of the race. Q10g resolved it: a count,
    // not a coordinate.
    //
    // This is the assertion most likely to rot, because the obvious implementation of "announce the
    // sector" simply has nothing to say for one race, and the cheapest way to make the code tidy is to
    // quietly give the Frame a site. Four files have to keep the exception on the page.
    const files = loreFiles();
    const mustCarryIt = [
        '08-open-questions.md',
        '13-wonders/README.md',
        '13-wonders/12-shadow-realm.md',
        '27-the-unattributed.md'
    ];

    const silent = [];
    const undecided = [];
    for (const want of mustCarryIt) {
        const f = files.find(x => x.file === `lore/${want}`);
        assert.ok(f, `${want} is missing`);
        if (!/has no site|no construction site|siteless/i.test(f.flat)) silent.push(f.file);
        // And each must carry the resolution, not just the problem.
        if (!/count instead of a coordinate|a count, not a coordinate|how many of the eleven/i.test(f.flat)) {
            undecided.push(f.file);
        }
    }
    assert.deepEqual(silent, [],
        `these files no longer record that the Assembled Frame has no site:\n  ${silent.join('\n  ')}`);
    assert.deepEqual(undecided, [],
        'these files record the siteless problem without Q10g\'s answer, so a reader is left to '
        + `invent one:\n  ${undecided.join('\n  ')}`);
});

test('a finished Wonder wins, and no file still calls that an open choice', () => {
    // Q10h settled it. The specific phrasings that described it as unsettled were written by me one
    // pass earlier and are exactly the kind of hedge that survives a decision.
    const offenders = loreFiles()
        .filter(f => !NOT_CANON.has(f.name))
        .filter(f => /live choice, not a settled one|whether a finished Wonder wins outright/i.test(f.flat))
        .map(f => f.file);
    assert.deepEqual(offenders, [],
        `these files still present the finished-Wonder question as undecided:\n  ${offenders.join('\n  ')}`);

    // And the decision has to be findable in the record.
    const record = loreFiles().find(f => f.name === '08-open-questions.md');
    assert.match(record.flat, /Q10h[\s\S]{0,200}?Completion is the victory/i,
        'Q10h no longer records that completion is the victory');
});

test('relic is the mechanical term, and grades stay rejected', () => {
    // Q10i: one word for the rule, freedom in the prose. A reader asked "artifact?? you mean relic or
    // something else?" because three words were in play for one object - artifact, fragment, relic.
    //
    // This checks the two things that are cheap to check and were actually wrong: the decision record
    // must not describe the mechanic in the withdrawn vocabulary, and no file may present grades as
    // live. It deliberately does NOT police story prose, where any word is correct.
    const files = loreFiles().filter(f => !NOT_CANON.has(f.name));

    // Grades were explicitly rejected. Any file still offering them as an option is stale - but a file
    // recording the rejection has to QUOTE the option to reject it, which is the same trap this suite
    // has now hit three times. Look around the match for a marker before calling it an offence.
    const REJECTED = /decided|rejected|no grades|~~|withdrawn|superseded|not locked.{0,40}(?:rejected|decided)/i;
    const gradesLive = [];
    for (const f of files) {
        for (const m of f.flat.matchAll(/five \*?kinds\*? (?:of part )?or five \*?grades\*?|means five kinds or five grades/gi)) {
            const context = f.flat.slice(Math.max(0, m.index - 200), m.index + m[0].length + 200);
            if (REJECTED.test(context)) continue;
            gradesLive.push(f.file);
        }
    }
    assert.deepEqual([...new Set(gradesLive)], [],
        `these files still present grades as an open option:\n  ${[...new Set(gradesLive)].join('\n  ')}`);

    // The mechanical rules in the decision record and the design doc should read "relic", not
    // "fragment". Story files are exempt, and so are the passages that record the withdrawal itself.
    const mechanicsFiles = ['lore/08-open-questions.md', 'lore/27-the-unattributed.md', 'lore/STATUS.md'];
    const RECORDING = /withdrawn|conflation|working word|superseded|imagery|frames of|a frame here|per-empire relic|rejected/i;
    const stale = [];
    for (const want of mechanicsFiles) {
        const f = files.find(x => x.file === want);
        assert.ok(f, `${want} is missing`);
        for (const m of f.flat.matchAll(/\bfragments?\b/gi)) {
            const context = f.flat.slice(Math.max(0, m.index - 300), m.index + 300);
            if (RECORDING.test(context)) continue;
            stale.push(`${f.file}: ...${f.flat.slice(Math.max(0, m.index - 60), m.index + 40)}...`);
        }
    }
    assert.deepEqual(stale, [],
        `these describe the mechanic as "fragment" rather than "relic" (Q10i):\n  ${stale.join('\n  ')}`);

    // And the count is five, recorded.
    const record = files.find(f => f.name === '08-open-questions.md');
    assert.match(record.flat, /A Wonder needs five relics/i,
        'Q10b no longer states that a Wonder needs five relics');
});

test('the Shadow Realm imagery is not confused with relics', () => {
    // The eleven "fragments" of the Assembled Frame are frames of a recording, not objects in the
    // ground. Q10 conflated them once and it took a measurement pass to notice. Any file that
    // mentions both has to keep them apart.
    const files = loreFiles().filter(f => !NOT_CANON.has(f.name));
    const wrong = files
        .filter(f => /eleven fragments[^.]{0,80}relic|relics[^.]{0,40}eleven fragments/i.test(f.flat))
        .filter(f => !/different object|not relics|conflation/i.test(f.flat))
        .map(f => f.file);
    assert.deepEqual(wrong, [],
        `these files treat the Assembled Frame's eleven imagery fragments as relics:\n  ${wrong.join('\n  ')}`);
});

test('every through-line still has all of its plants and its payoff', () => {
    // lore/28-through-lines.md maps six lines that run across the whole folder. Each is assembled from
    // pieces in separate files, and the whole point of the map is that a piece can be edited by someone
    // who does not know it is somebody's plant.
    //
    // The line that needs this most is T1 (the Consideration): five witnesses across five species and
    // ninety-five years, none of whom states the claim, and which for several passes was not connected
    // at all - Sarn's "set down carefully, with consideration" and Keth's "something brought it home"
    // sat twenty-two entries apart with no cross-reference. Delete any one of the five and the
    // escalation silently stops being one.
    const files = loreFiles();
    const need = (file, phrases) => {
        const f = files.find(x => x.file === `lore/${file}`);
        assert.ok(f, `${file} is missing`);
        for (const p of phrases) {
            assert.match(f.flat, p, `${file} no longer contains ${p} - see lore/28-through-lines.md`);
        }
    };

    // T1 - the Consideration, in chronological order of what each witness saw.
    need('10-the-long-file/07-bioform.md', [/refused/i, /BU 40/]);                 // refusal
    need('10-the-long-file/04-crystalline.md', [/set down/i, /consideration/i]);   // handling
    need('10-the-long-file/11-titan-lords.md', [/one Lamp came back on/i]);        // a door checked
    need('10-the-long-file/08-star-nomads.md', [/AU 31/, /brought it home/i]);     // a thing returned
    need('10-the-long-file/10-quantum.md', [/not on the schedule/i]);              // a thing still coming

    // T1's two ends must stay cross-referenced, which is the repair this line actually needed.
    need('10-the-long-file/04-crystalline.md', [/Testimony 8|testimony 8/]);
    need('10-the-long-file/08-star-nomads.md', [/Testimony 4|testimony 4/]);

    // T2 - the clock. The keystone is that 9-D is adjacent to an empty origin coordinate.
    need('20-master-timeline.md', [/9-D/, /review interval/i]);
    need('10-the-long-file/06-mechanicus.md', [/9-D/, /origin coordinate/i]);

    // T3/T4 - three irregular Terrans, and the fifth code that is now their spine.
    need('15-series-twelve/01-terran.md', [/twenty-two words/i, /back to AU 11/i, /\bother\b/i]);
    need('15-series-twelve/06-mechanicus.md', [/variance to the variance/i]);
    need('16-rell.md', [/fifth code/i, /unreconciled/i]);

    // T5/T6 - the count, and the thirty-one refusals.
    need('16-rell.md', [/thirty-one thousand/i]);
    need('10-the-long-file/README.md', [/thirty-one times/i]);

    // T7 - the bet. The setting's exchange rate on knowledge, and its one exception.
    need('10-the-long-file/05-void-walkers.md', [/decelerat/i, /one second/i]);   // the bet that paid
    need('11-laws-of-the-world.md', [/safe forever/i, /positive-sum/i]);          // Law 6, the exception
    need('11-laws-of-the-world.md', [/a trace is property and it degrades/i]);    // Law 10, the reason

    // T8 - two doctrines, one decay. Both halves must keep their numbers, because the pairing is only
    // sharp while the durations are specific: forty-one transits against fifteen years.
    need('15-series-twelve/01-terran.md', [/forty-one transits/i, /Account 5/]);
    need('15-series-twelve/05-void-walkers.md', [/AU 59/, /Account 1/, /Law 6/]);

    // Forward plants. These are loaded and deliberately unfired; the risk is somebody "finishing" one
    // in a document, or trimming it as loose colour.
    need('28-through-lines.md', [/P1 · The second arrival/, /P2 · Sten passes on a lane that kills/,
        /P3 · Yard Nine's variance was accepted/, /P4 · Halloway's cost is what arms Rell/]);
    need('15-series-twelve/06-mechanicus.md', [/variance to the variance/i, /accepted/i]);

    // 24-15 is the payoff for the turret argument, and its two load-bearing beats are the two most
    // likely to be trimmed: Law 11 letting the fleet listen and not return, and the first face-to-face
    // meeting between species in living memory.
    need('24-anthology/15-they-could-not-be-moved.md', [
        /no demonstrated engagement value/i,   // the mistake, in her own words, on the record
        /blocked the moons/i,                  // the image
        /could not be moved/i,                 // the thesis
        /you are very small/i                  // the first contact
    ]);
    need('24-anthology/05-buildings.md', [/15-they-could-not-be-moved/]);   // the forward pointer

    // T7's three decelerations. Wren, then the player's own navigator in Act One, then P2. A fourth
    // would make it a gimmick, which is why the map says so and why this counts them.
    need('22-act-one.md', [/decelerated inside the crossing/i]);

    // And the map itself must still name every line it claims to.
    need('28-through-lines.md', [/T1 · The Consideration/, /T2 · The clock/, /T3 ·/, /T4 · The fifth code/,
        /T5 · The count/, /T6 · Thirty-one refusals/, /T7 · The bet/, /T8 · Two doctrines, one decay/]);
});

test('the two things T8 forbids saying on screen are not said on screen', () => {
    // T8's payoff is a player noticing that sweeping is the answer to institutional decay. It stops
    // being a discovery the moment any document explains it, and the tempting place to explain it is
    // exactly where it would do most damage: player-facing copy.
    //
    // Scope is deliberately the shipped surfaces plus the codex source, not the lore folder - the lore
    // folder is where the connection is SUPPOSED to be written down, which is what 28-through-lines.md
    // is for.
    const surfaces = [
        path.join(root, 'public', 'js', 'codex.js'),
        path.join(root, 'public', 'js', 'advisor.js'),
        path.join(root, 'public', 'js', 'ui.js')
    ];
    const TELLS = [
        /sweeping is the answer/i,
        /solves? (?:the )?(?:problem of )?institutional decay/i,
        /the only knowledge that does not (?:go stale|decay) is/i
    ];
    const offenders = [];
    for (const file of surfaces) {
        if (!fs.existsSync(file)) continue;
        const text = fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ');
        for (const tell of TELLS) {
            if (tell.test(text)) offenders.push(`${path.basename(file)}: ${tell}`);
        }
    }
    assert.deepEqual(offenders, [],
        'player-facing copy now explains T8 outright, which converts something a player noticed into '
        + `something the game told them:\n  ${offenders.join('\n  ')}`);
});

test('the Law 25 constraint travels with the Consideration line', () => {
    // T1 characterises the thing behind the quarantine entirely through manners, and Law 25 is what
    // makes that legal. The failure mode is a future draft "clarifying" it into a creature - which
    // would not read as a mistake, it would read as good description.
    //
    // A word blacklist was tried here first and abandoned, because it cannot tell description from
    // denial or from unrelated usage: it fired on Sarn calling MORTALS "a brief creature" and on this
    // project's own sentence "not a beast at a door". Policing prose semantics with a regex produces a
    // guard that cries wolf and then gets deleted, which is worse than no guard.
    //
    // So this asserts the thing that is actually checkable and actually useful: the constraint is
    // written down beside the material, in the file a future author will open. A rule nobody can find
    // is a rule that gets broken by someone acting in good faith.
    const files = loreFiles();
    const map = files.find(f => f.file === 'lore/28-through-lines.md');
    assert.ok(map, 'lore/28-through-lines.md is missing');

    assert.match(map.flat, /Law 25/,
        'the through-line map no longer cites Law 25, which is the only thing keeping T1 legal');
    assert.match(map.flat, /never designed,\s*named, or shown/i,
        'the map no longer states Law 25 in full; a summarised rule is a rule that drifts');
    assert.match(map.flat, /careful is not a shape|courtesy is what is frightening/i,
        'the map no longer explains WHY behaviour is permitted and shape is not - which is the '
        + 'instruction a future author needs, not the prohibition');

    // And the two testimonies most likely to be "improved" carry the warning locally, because nobody
    // edits a testimony with the map open.
    for (const want of ['lore/10-the-long-file/04-crystalline.md', 'lore/10-the-long-file/08-star-nomads.md']) {
        const f = files.find(x => x.file === want);
        assert.ok(f, `${want} is missing`);
        assert.match(f.flat, /not (?:let a future draft )?give (?:the thing|the agent) a shape|shape/i,
            `${want} no longer warns against giving the agent a shape`);
    }
});

test('no file claims Rell is the only voice without saying "in the campaign"', () => {
    // The contradiction this guards actually shipped and sat there. Five canon files said Rell was the
    // only voice; public/js/advisor.js gives all twelve races their own register, to players, now.
    // Precedence rule 1 is that shipped code wins, so the canon was the thing that was wrong.
    //
    // Q4 resolved it as two channels - Rell voiced in the campaign, faction registers in text for
    // multiplayer - and the failure mode from here is somebody trimming the qualifier back out,
    // because "Rell is the only voice" is the shorter and more quotable sentence.
    const files = loreFiles().filter(f => !NOT_CANON.has(f.name));
    const offenders = [];
    for (const f of files) {
        for (const m of f.flat.matchAll(/Rell is the only voice|only voice is Rell|one voice[,.]? Rell only/gi)) {
            const after = f.flat.slice(m.index, m.index + 160);
            if (/in the campaign|campaign only|campaign channel/i.test(after)) continue;
            offenders.push(`${f.file}: "${f.flat.slice(m.index, m.index + 70)}…"`);
        }
    }
    assert.deepEqual(offenders, [],
        'these state the campaign rule as a global one, which contradicts the twelve faction registers '
        + `that are shipped and live:\n  ${offenders.join('\n  ')}`);

    // And the decision itself must remain findable, with both channels named.
    const record = files.find(f => f.name === '08-open-questions.md');
    assert.match(record.flat, /Q4 · Voice-over scope → \*\*TWO CHANNELS/,
        'Q4 no longer records the two-channel resolution');
    assert.match(record.flat, /text only|Text only/,
        'Q4 no longer records that the multiplayer registers are text and carry no performer cost - '
        + 'which is the whole reason the voice budget did not grow');
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
