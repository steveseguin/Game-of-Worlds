/**
 * The landing page ships a built pair, so the build must never be stale.
 *
 * public/landing.html loads css/landing.min.css and js/landing.min.js. Those are
 * generated from the commented sources by tools/build-landing.js. The failure mode
 * this guards is nasty and silent: an author edits public/js/landing.js, bumps the
 * ?v= exactly as the cache-busting rule requires, reloads, and sees no change —
 * because the file they edited is not the file the page loads. This test turns that
 * into a red suite with the command to fix it.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const { build } = require(path.join(REPO, 'tools', 'build-landing.js'));

test('landing.min.css / landing.min.js are up to date with their sources', () => {
    const { stale, report } = build(true);
    assert.strictEqual(stale, false,
        `The built landing assets are stale. Run:\n    node tools/build-landing.js\n\n${report.join('\n')}`);
});

test('landing.html loads the built pair, not the commented sources', () => {
    const html = fs.readFileSync(path.join(REPO, 'public', 'landing.html'), 'utf8');
    assert.match(html, /href="css\/landing\.min\.css\?v=/, 'landing.html should link css/landing.min.css');
    assert.match(html, /src="js\/landing\.min\.js\?v=/, 'landing.html should load js/landing.min.js');
    // The un-minified pair must not ALSO be loaded — that would double the payload.
    assert.ok(!/href="css\/landing\.css\?/.test(html), 'landing.html must not also load the unminified css');
    assert.ok(!/src="js\/landing\.js\?/.test(html), 'landing.html must not also load the unminified js');
});

test('the built JavaScript keeps every string literal byte-identical', () => {
    // A comment stripper that mis-reads a regex as division, or loses the end of a
    // template literal, produces a file that still parses and is subtly wrong. The
    // cheap proof that it did not is that the literals came through untouched.
    const src = fs.readFileSync(path.join(REPO, 'public', 'js', 'landing.js'), 'utf8');
    const min = fs.readFileSync(path.join(REPO, 'public', 'js', 'landing.min.js'), 'utf8');
    const a = literals(src), b = literals(min);
    assert.ok(a.length > 100, 'expected the source to contain plenty of literals to compare');
    assert.strictEqual(b.length, a.length, 'the built file has a different number of literals');
    for (let i = 0; i < a.length; i++) {
        assert.strictEqual(b[i], a[i], `literal #${i} changed: ${JSON.stringify(a[i].slice(0, 80))}`);
    }
});

/* A second, independent scan — deliberately not the one in tools/build-landing.js,
   so a bug in that tokenizer cannot vouch for itself. */
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new',
    'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

function literals(src) {
    const out = [];
    let i = 0;
    const n = src.length;
    let lastChar = '', lastWord = '';
    while (i < n) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e === -1 ? n : e + 2; continue; }
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) { j++; break; } j++; }
            out.push(src.slice(i, j)); lastChar = c; lastWord = ''; i = j; continue;
        }
        if (c === '`') {
            let j = i + 1, depth = 0;
            while (j < n) {
                const d = src[j];
                if (d === '\\') { j += 2; continue; }
                if (d === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
                if (d === '}' && depth > 0) { depth--; j++; continue; }
                if (d === '`' && depth === 0) { j++; break; }
                j++;
            }
            out.push(src.slice(i, j)); lastChar = '`'; lastWord = ''; i = j; continue;
        }
        if (c === '/') {
            const ok = lastChar === '' || '([{,;:=!&|?+-*%~^<>'.includes(lastChar) || lastChar === '}'
                || (/[A-Za-z_$]/.test(lastChar) && REGEX_KEYWORDS.has(lastWord));
            if (ok) {
                let j = i + 1, cls = false;
                while (j < n) {
                    const d = src[j];
                    if (d === '\\') { j += 2; continue; }
                    if (d === '[') cls = true;
                    else if (d === ']') cls = false;
                    else if (d === '/' && !cls) { j++; break; }
                    else if (d === '\n') break;
                    j++;
                }
                while (j < n && /[a-z]/.test(src[j])) j++;
                out.push(src.slice(i, j)); lastChar = '/'; lastWord = ''; i = j; continue;
            }
        }
        if (/[A-Za-z0-9_$]/.test(c)) {
            let j = i;
            while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
            lastWord = src.slice(i, j); lastChar = lastWord[lastWord.length - 1]; i = j; continue;
        }
        if (!/\s/.test(c)) { lastChar = c; lastWord = ''; }
        i++;
    }
    return out;
}
