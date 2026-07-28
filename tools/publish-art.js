#!/usr/bin/env node
/**
 * Move production art from the reference library into the web root.
 *
 * lore/visual-reference/ holds 206 MB of purpose-built art. Its README sets the
 * rule this tool enforces: "Runtime assets move to public/images/ only when an
 * implemented screen consumes them." The deploy walks public/ recursively, so
 * anything published here ships to players forever — copying the library
 * wholesale would put 200 MB of unused art on the wire.
 *
 *   node tools/publish-art.js --list                 groups available to publish
 *   node tools/publish-art.js --list=crests          files in one group
 *   node tools/publish-art.js production/crests/128/05-void-walkers.png [...]
 *   node tools/publish-art.js --audit                published files nothing references
 *
 * Published files land in public/images/ui/<flattened-name> and keep their bytes
 * unchanged, so the library stays the single source of truth and
 * tools/build-lore-production-assets.py can still regenerate the originals.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const LIBRARY = path.join(REPO, 'lore', 'visual-reference');
const DEST = path.join(REPO, 'public', 'images', 'ui');

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, out);
        else out.push(abs);
    }
    return out;
}

function flatName(relPath) {
    // production/crests/128/05-void-walkers.png -> crest-128-05-void-walkers.png
    const parts = relPath.split(/[\\/]/).filter(p => p !== 'production' && p !== 'icon-system');
    return parts.join('-').replace(/[^A-Za-z0-9._-]/g, '-').toLowerCase();
}

function listGroups() {
    const groups = new Set();
    for (const abs of walk(LIBRARY)) {
        const rel = path.relative(LIBRARY, abs).replace(/\\/g, '/');
        const parts = rel.split('/');
        if (parts.length > 2) groups.add(parts.slice(0, 2).join('/'));
    }
    return [...groups].sort();
}

function publish(relPaths, { size = 0, trim = false } = {}) {
    fs.mkdirSync(DEST, { recursive: true });
    let bytes = 0;
    const published = [];
    for (const rel of relPaths) {
        const src = path.join(LIBRARY, rel);
        if (!fs.existsSync(src)) {
            console.error(`missing: ${rel}`);
            process.exitCode = 1;
            continue;
        }
        const name = flatName(rel);
        const dst = path.join(DEST, name);
        if (size > 0 && /\.png$/i.test(src)) {
            // The sources are 256-512px. A 24px HUD button does not need 160 KB,
            // and the deploy ships whatever is here.
            const args = [path.join(REPO, 'tools', '_resize-art.py'), src, dst, String(size)];
            if (trim) args.push('--trim');
            const res = require('child_process').spawnSync('python', args, { encoding: 'utf8' });
            if (res.status !== 0) {
                console.error(`resize failed for ${rel}: ${(res.stderr || '').trim() || res.error}`);
                process.exitCode = 1;
                continue;
            }
        } else {
            fs.copyFileSync(src, dst);
        }
        const written = fs.statSync(dst).size;
        bytes += written;
        published.push({ name, from: rel, bytes: written });
        console.log(`published images/ui/${name}  (${(written / 1024).toFixed(1)} KB)  <- ${rel}`);
    }
    console.log(`\n${published.length} file(s), ${(bytes / 1024).toFixed(1)} KB added to the web root.`);
    console.log('Reference them from a screen, or tools/publish-art.js --audit will flag them.');
    return published;
}

/** Every published byte must earn its place by being referenced from a real screen. */
function audit() {
    if (!fs.existsSync(DEST)) {
        console.log('Nothing published yet.');
        return [];
    }
    const sources = walk(path.join(REPO, 'public'))
        .filter(f => /\.(html|css|js)$/i.test(f) && !f.includes(`${path.sep}images${path.sep}`))
        .map(f => fs.readFileSync(f, 'utf8'))
        .join('\n');

    const orphans = [];
    for (const abs of walk(DEST)) {
        const name = path.basename(abs);
        if (!sources.includes(name)) orphans.push(name);
    }
    if (orphans.length === 0) {
        console.log('Every published asset is referenced by a screen.');
    } else {
        console.log(`${orphans.length} published asset(s) referenced by nothing:`);
        for (const o of orphans) console.log(`  images/ui/${o}`);
    }
    return orphans;
}

function main() {
    const args = process.argv.slice(2);

    if (args.includes('--audit')) {
        const orphans = audit();
        if (orphans.length) process.exitCode = 1;
        return;
    }

    const listArg = args.find(a => a === '--list' || a.startsWith('--list='));
    if (listArg) {
        const group = listArg.includes('=') ? listArg.split('=')[1] : null;
        if (!group) {
            console.log('Groups (pass one to --list= to see its files):\n');
            for (const g of listGroups()) console.log(`  ${g}`);
            return;
        }
        const matches = walk(LIBRARY)
            .map(a => path.relative(LIBRARY, a).replace(/\\/g, '/'))
            .filter(r => r.includes(group));
        for (const m of matches) console.log(`  ${m}`);
        console.log(`\n${matches.length} file(s) matching "${group}".`);
        return;
    }

    const paths = args.filter(a => !a.startsWith('--'));
    if (paths.length === 0) {
        console.log('Nothing to do. Try --list, or pass library-relative paths to publish.');
        return;
    }
    const sizeArg = args.find(a => a.startsWith('--size='));
    publish(paths, {
        size: sizeArg ? Number(sizeArg.split('=')[1]) : 0,
        trim: args.includes('--trim')
    });
}

main();

module.exports = { flatName, audit };
