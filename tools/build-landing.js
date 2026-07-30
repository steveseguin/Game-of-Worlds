#!/usr/bin/env node
/**
 * Ship the code, keep the essays.
 *
 *   node tools/build-landing.js            write public/{js/landing.min.js,css/landing.min.css}
 *   node tools/build-landing.js --check    exit 1 if either output is stale (used by tests)
 *
 * WHY THIS EXISTS
 *
 * public/js/landing.js and public/css/landing.css are 219 KB and 133 KB of source,
 * and 55% of each is comment. Those comments are the reason this surface is
 * maintainable — they record what was measured, what was tried, and what broke —
 * and they belong in the repository. They do not belong in a visitor's download.
 * Measured on the audit harness the two files were 354 KB of a 583 KB page: on a
 * 3G connection, several seconds of transfer buying zero pixels. The server sends
 * these bytes uncompressed, so this is not a hypothetical saved by gzip.
 *
 * So landing.html loads the .min pair, and the commented files stay the editable
 * originals. Nothing is deleted and nothing moves.
 *
 * WHAT IT DOES AND DELIBERATELY DOES NOT DO
 *
 * It removes comments and collapses whitespace. It does NOT rename identifiers,
 * reorder statements, fold constants or drop dead code. That is not timidity, it is
 * the risk calculation: this file has no dependencies and no test suite of its own,
 * and a mangler that gets one scope wrong produces a page that is subtly, silently
 * broken. Comment removal alone recovers ~190 KB — essentially the whole prize —
 * for a transformation whose correctness can be reasoned about in one sitting.
 *
 * NEWLINES SURVIVE IN JS. A whitespace run containing a newline collapses to a
 * newline, never to a space, so automatic semicolon insertion behaves exactly as it
 * does in the source. That single rule is what makes a comment stripper safe without
 * a full parser.
 *
 * STRINGS ARE NEVER TOUCHED. Template literals in particular are copied out
 * byte-for-byte including their `${}` interpolations, because landing.js ships GLSL
 * inside them and also stringifies its own functions into a Worker — both are source
 * text that means something.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const TARGETS = [
    { src: 'public/js/landing.js',    out: 'public/js/landing.min.js',    kind: 'js' },
    { src: 'public/css/landing.css',  out: 'public/css/landing.min.css',  kind: 'css' }
];

/* Characters after which a `/` starts a REGEX rather than a division. The list is
   the standard one: anything that cannot end an expression. `}` is genuinely
   ambiguous in JavaScript (end of a block, or end of an object literal) and is
   treated as "regex may follow", which is the safe direction — misreading a regex
   as division corrupts the file, misreading division as a regex only happens after
   `}` immediately followed by `/`, which does not occur in real code. */
const REGEX_KEYWORDS = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
    'case', 'do', 'else', 'yield', 'await'
]);

function stripJs(src) {
    const out = [];
    let pendingWs = 0;                 // 0 none, 1 space, 2 newline
    const flush = () => {
        if (pendingWs === 2) out.push('\n');
        else if (pendingWs === 1) out.push(' ');
        pendingWs = 0;
    };
    const note = (text) => {
        // a removed comment or a run of whitespace is still a token separator
        if (/[\n\r]/.test(text)) pendingWs = 2;
        else if (pendingWs === 0) pendingWs = 1;
    };
    const emit = (text) => { flush(); out.push(text); };

    // last emitted non-whitespace character, and the word before it, for regex detection
    let lastChar = '';
    let lastWord = '';

    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];

        // ---- whitespace
        if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') {
            let j = i;
            while (j < n && /\s/.test(src[j])) j++;
            note(src.slice(i, j));
            i = j;
            continue;
        }

        // ---- comments
        if (c === '/' && src[i + 1] === '/') {
            let j = i + 2;
            while (j < n && src[j] !== '\n') j++;
            note(src.slice(i, j));
            i = j;
            continue;
        }
        if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            const j = end === -1 ? n : end + 2;
            note(src.slice(i, j));
            i = j;
            continue;
        }

        // ---- strings
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === c) { j++; break; }
                j++;
            }
            emit(src.slice(i, j));
            lastChar = c; lastWord = '';
            i = j;
            continue;
        }

        // ---- template literals, copied verbatim including nested ${ ... `...` }
        if (c === '`') {
            let j = i + 1;
            let depth = 0;                     // ${ } nesting
            let tickDepth = 0;                 // nested templates inside ${ }
            while (j < n) {
                const d = src[j];
                if (d === '\\') { j += 2; continue; }
                if (d === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
                if (d === '}' && depth > 0) { depth--; j++; continue; }
                if (d === '`') {
                    if (depth > 0) {           // a template opened inside an interpolation
                        if (tickDepth === 0) { tickDepth = 1; } else { tickDepth = 0; }
                        j++;
                        continue;
                    }
                    j++;
                    break;
                }
                j++;
            }
            emit(src.slice(i, j));
            lastChar = '`'; lastWord = '';
            i = j;
            continue;
        }

        // ---- regex literal
        if (c === '/') {
            const prev = lastChar;
            const regexOk =
                prev === '' ||
                '([{,;:=!&|?+-*%~^<>'.includes(prev) ||
                (/[A-Za-z_$]/.test(prev) && REGEX_KEYWORDS.has(lastWord)) ||
                prev === '}';
            if (regexOk) {
                let j = i + 1;
                let inClass = false;
                while (j < n) {
                    const d = src[j];
                    if (d === '\\') { j += 2; continue; }
                    if (d === '[') inClass = true;
                    else if (d === ']') inClass = false;
                    else if (d === '/' && !inClass) { j++; break; }
                    else if (d === '\n') break;      // not a regex after all; bail safely
                    j++;
                }
                while (j < n && /[a-z]/.test(src[j])) j++;   // flags
                emit(src.slice(i, j));
                lastChar = '/'; lastWord = '';
                i = j;
                continue;
            }
        }

        // ---- identifier / number run (tracked whole, so keywords are recognisable)
        if (/[A-Za-z0-9_$]/.test(c)) {
            let j = i;
            while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
            const word = src.slice(i, j);
            emit(word);
            lastChar = word[word.length - 1];
            lastWord = word;
            i = j;
            continue;
        }

        // ---- anything else, one character at a time
        emit(c);
        lastChar = c;
        lastWord = '';
        i++;
    }
    return out.join('').replace(/^\n+/, '').replace(/\n+$/, '\n');
}

function stripCss(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '*') {
            const end = src.indexOf('*/', i + 2);
            i = end === -1 ? n : end + 2;
            // a comment can separate two tokens; a space keeps them separated
            if (!/\s$/.test(out)) out += ' ';
            continue;
        }
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n) {
                if (src[j] === '\\') { j += 2; continue; }
                if (src[j] === c) { j++; break; }
                j++;
            }
            out += src.slice(i, j);
            i = j;
            continue;
        }
        if (/\s/.test(c)) {
            let j = i;
            while (j < n && /\s/.test(src[j])) j++;
            // ONE space, never zero: `calc(100% - 2px)` and descendant combinators
            // both depend on it, and the bytes saved by being clever there are not
            // worth a stylesheet that is subtly wrong in one rule.
            out += ' ';
            i = j;
            continue;
        }
        out += c;
        i++;
    }
    // Whitespace next to structural punctuation is never significant in CSS.
    return out
        .replace(/\s*([{};,])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();
}

/* ============================================================
   THE ?v= IS STAMPED FROM THE CONTENT, NOT TYPED BY HAND

   These two files are served `Cache-Control: public, max-age=31536000, immutable`,
   so the query string is the ONLY thing that can make a browser fetch a new copy.
   It used to be a hand-maintained counter — `?v=20260728r51` — and the failure it
   produces is silent and expensive: edit the CSS, rebuild, reload, and see the old
   page, because the bytes changed and the URL did not. That happened during this
   very pass, twice, on a machine with the file open in an editor. In production it
   means a visitor holding a stale stylesheet against fresh markup, which is a whole
   category of "the site looks broken" that nobody can reproduce.

   A hash of the built file cannot drift from it. Same bytes, same URL, still
   cached; one byte different, new URL, guaranteed fetch. Eight hex characters is
   ~4 billion states, which is ample for a cache key and short enough to read.

   --check reports a mismatched stamp as staleness, so tests/landing-build.test.js
   fails on a forgotten rebuild exactly as it already did for the file contents.
   ============================================================ */
const HTML_PATH = path.join(REPO, 'public', 'landing.html');

function stampFor(content) {
    return crypto.createHash('sha1').update(content, 'utf8').digest('hex').slice(0, 8);
}

function restamp(html, outRelPath, stamp) {
    // css/landing.min.css or js/landing.min.js — the path as landing.html writes it.
    const asRef = outRelPath.replace(/^public\//, '');
    const pattern = new RegExp(`(${asRef.replace(/[.]/g, '\\.')})\\?v=[^"']*`, 'g');
    return html.replace(pattern, `$1?v=${stamp}`);
}

function build(check) {
    let stale = false;
    const report = [];
    const stamps = [];
    for (const t of TARGETS) {
        const srcPath = path.join(REPO, t.src);
        const outPath = path.join(REPO, t.out);
        const raw = fs.readFileSync(srcPath, 'utf8');
        const banner = `/* Generated from ${path.basename(t.src)} by tools/build-landing.js — edit the source, not this. */\n`;
        const body = t.kind === 'js' ? stripJs(raw) : stripCss(raw);
        const next = banner + body + '\n';
        const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
        const same = prev !== null && prev.replace(/\r\n/g, '\n') === next.replace(/\r\n/g, '\n');
        if (check) {
            if (!same) { stale = true; report.push(`STALE: ${t.out}`); }
        } else if (!same) {
            fs.writeFileSync(outPath, next, 'utf8');
        }
        // Hashed on the normalised text so a CRLF checkout cannot change the URL.
        stamps.push({ out: t.out, stamp: stampFor(next.replace(/\r\n/g, '\n')) });
        const kb = b => Math.round(Buffer.byteLength(b, 'utf8') / 102.4) / 10;
        report.push(`${t.src}: ${kb(raw)} KB -> ${t.out}: ${kb(next)} KB`
            + ` (${Math.round((1 - Buffer.byteLength(next) / Buffer.byteLength(raw)) * 100)}% smaller)`);
    }

    const html = fs.readFileSync(HTML_PATH, 'utf8');
    let nextHtml = html;
    for (const s of stamps) nextHtml = restamp(nextHtml, s.out, s.stamp);
    if (nextHtml !== html) {
        if (check) {
            stale = true;
            report.push('STALE: public/landing.html carries a ?v= that does not match the built files');
        } else {
            fs.writeFileSync(HTML_PATH, nextHtml, 'utf8');
            report.push(`stamped landing.html: ${stamps.map(s => `${path.basename(s.out)}?v=${s.stamp}`).join(', ')}`);
        }
    }
    return { stale, report };
}

if (require.main === module) {
    const check = process.argv.includes('--check');
    const { stale, report } = build(check);
    for (const line of report) console.log(line);
    if (stale) {
        console.error('\nThe minified pair is out of date. Run: node tools/build-landing.js');
        process.exit(1);
    }
}

module.exports = { stripJs, stripCss, build };
