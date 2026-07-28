#!/usr/bin/env node
/**
 * Verify that every changed front-end asset got its ?v= bumped.
 *
 * Caddy serves css/* and js/* with `Cache-Control: public, max-age=31536000,
 * immutable` while HTML is no-cache. So a returning player gets the NEW html and
 * the YEAR-OLD stylesheet unless the ?v= on the reference changes. Fresh HTML
 * against stale CSS is not a subtle degradation — it is a broken page, and it
 * only affects people who have visited before, which is exactly the group least
 * likely to be in a test run.
 *
 *   node tools/check-cache-busting.js            compare working tree against HEAD
 *   node tools/check-cache-busting.js <ref>      compare against another ref
 *
 * Exits non-zero if a changed asset is referenced without a ?v=, or with the
 * same ?v= it had before.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const BASE = process.argv[2] || 'HEAD';

function git(cmd) {
    return execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function changedAssets() {
    const out = git(`git diff --name-only ${BASE} -- public`).trim();
    if (!out) return [];
    return out.split(/\r?\n/)
        .map(p => p.trim())
        .filter(p => /\.(css|js)$/i.test(p))
        // Vendored third-party bundles are referenced by our own modules with
        // their own versioning story; they are not player-facing entry points.
        .filter(p => !p.includes('vendor/'));
}

function referencingFiles() {
    const out = [];
    const stack = [path.join(REPO, 'public')];
    while (stack.length) {
        const dir = stack.pop();
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (e.name !== 'images' && e.name !== 'sounds' && e.name !== 'music') stack.push(abs);
            } else if (/\.(html|js|css)$/i.test(e.name)) {
                out.push(abs);
            }
        }
    }
    return out;
}

/**
 * Every ?v= token on a real LOAD of `basename`, plus bare (unversioned) loads.
 *
 * Only actual load specifiers count: src=/href= attributes and ES-module
 * import/import() specifiers. Matching the bare filename anywhere in the text
 * flags every prose mention of a file in a comment — including each module's own
 * header naming itself — which buries the handful of genuine stale references.
 */
function versionsFor(text, basename) {
    const esc = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
        // src="js/foo.js?v=1"  /  href='css/foo.css'
        new RegExp(`(?:src|href)\\s*=\\s*["'][^"']*?${esc}(\\?v=([A-Za-z0-9._-]+))?["']`, 'g'),
        // from './foo.js?v=1'  /  import('./foo.js')
        new RegExp(`(?:from|import\\s*\\()\\s*["'][^"']*?${esc}(\\?v=([A-Za-z0-9._-]+))?["']`, 'g'),
        // url(images/…) style loads in CSS, for completeness
        new RegExp(`url\\(\\s*["']?[^)"']*?${esc}(\\?v=([A-Za-z0-9._-]+))?["']?\\s*\\)`, 'g')
    ];
    const found = [];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(text))) found.push(m[2] || null);
    }
    return found;
}

function main() {
    const assets = changedAssets();
    if (assets.length === 0) {
        console.log(`No changed css/js under public/ versus ${BASE}.`);
        return;
    }

    const refFiles = referencingFiles();
    const problems = [];
    let checked = 0;

    for (const asset of assets) {
        const base = path.basename(asset);
        let oldText = '';
        for (const rf of refFiles) {
            const rel = path.relative(REPO, rf).replace(/\\/g, '/');
            const text = fs.readFileSync(rf, 'utf8');
            const now = versionsFor(text, base);
            if (now.length === 0) continue;
            checked++;

            try {
                oldText = git(`git show ${BASE}:${rel}`);
            } catch {
                oldText = ''; // new file: nothing cached under it yet
            }
            const before = oldText ? versionsFor(oldText, base) : [];

            const unversioned = now.filter(v => v === null).length;
            if (unversioned > 0 && oldText) {
                problems.push(`${rel} references ${base} with NO ?v= (${unversioned}x) — returning players keep the cached copy.`);
                continue;
            }
            const stale = now.filter(v => v !== null && before.includes(v));
            if (stale.length > 0) {
                problems.push(`${rel} references ${base} with an UNCHANGED ?v=${stale[0]} — the file changed but the URL did not.`);
            }
        }
    }

    console.log(`Changed assets: ${assets.length}; references checked: ${checked}\n`);
    for (const a of assets) console.log(`  ${a}`);

    if (problems.length) {
        console.error(`\n${problems.length} cache-busting problem(s):`);
        for (const p of problems) console.error(`  - ${p}`);
        console.error('\nBump the ?v= on each of those references before deploying.');
        process.exitCode = 1;
    } else {
        console.log('\nEvery changed asset is referenced with a fresh ?v=.');
    }
}

main();
