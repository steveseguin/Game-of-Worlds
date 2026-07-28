const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS_DIR = path.join(__dirname, '..', 'public', 'css');

/**
 * A CSS comment that is closed early and then "continued" leaves prose sitting
 * in the stylesheet as if it were code. The parser does not throw — it discards
 * the malformed block AND the rule that follows it, silently.
 *
 * That happened here: a long explanatory comment in race-selection.css closed
 * with a stray `*​/` mid-paragraph, so six lines of prose became the prelude to
 * `.race-detail-panel.is-scrollable .race-detail-content`, and the dossier's
 * overflow fade was dropped from the stylesheet entirely. The visible effect was
 * a panel cutting straight through live type at 1600x900 and below, with no cue
 * that any content continued past the edge. CSSOM confirmed it: 247 rules parsed
 * and none of them matched `is-scrollable`.
 *
 * This project's recurring bug class is "the failure mode is silence". These
 * files are long and heavily commented on purpose, which makes them exactly the
 * place that mistake hides, so it is worth a cheap structural check.
 */

function commentScan(source) {
    let depth = 0;
    let i = 0;
    const problems = [];
    while (i < source.length - 1) {
        const two = source.slice(i, i + 2);
        if (two === '/*') {
            if (depth > 0) problems.push(`nested "/*" at offset ${i} (CSS comments do not nest)`);
            depth++;
            i += 2;
            continue;
        }
        if (two === '*/') {
            depth--;
            if (depth < 0) {
                problems.push(`stray "*/" at offset ${i} — a comment was closed that was never opened`);
                depth = 0;
            }
            i += 2;
            continue;
        }
        i++;
    }
    if (depth !== 0) problems.push('file ends inside an unterminated comment');
    return problems;
}

function lineOf(source, offset) {
    return source.slice(0, offset).split('\n').length;
}

test('every stylesheet has balanced, non-nested comments', () => {
    const files = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'));
    assert.ok(files.length > 0, 'expected stylesheets in public/css');

    const failures = [];
    for (const file of files) {
        const source = fs.readFileSync(path.join(CSS_DIR, file), 'utf8');
        for (const problem of commentScan(source)) {
            const m = problem.match(/offset (\d+)/);
            const where = m ? ` (line ${lineOf(source, Number(m[1]))})` : '';
            failures.push(`${file}: ${problem}${where}`);
        }
    }

    assert.deepEqual(
        failures,
        [],
        'Malformed CSS comments silently delete the rule that follows them:\n  ' + failures.join('\n  ')
    );
});

test('the dossier overflow fade rule survives parsing', () => {
    // A targeted guard for the specific rule that was lost, because the generic
    // comment check above would not catch other ways of dropping it.
    const source = fs.readFileSync(path.join(CSS_DIR, 'race-selection.css'), 'utf8');

    // Strip comments the way a parser would, then look for the rule in live CSS.
    const live = source.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(
        live,
        /\.race-detail-panel\.is-scrollable\s+\.race-detail-content\s*\{/,
        'The scroll-port fade rule is not present in the non-comment body of race-selection.css. '
        + 'Without it a long dossier is cut off mid-glyph with no indication more content exists.'
    );
});
