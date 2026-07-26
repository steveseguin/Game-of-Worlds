// public/ is served to the internet. Anything that lands in it is published, whether or
// not a page ever loads it.
//
// public/js/init.js was server-side Node - `require('./lib/database')`, `require('./lib/map')`
// - sitting in the web root. No HTML referenced it, so nothing exercised it and nothing
// complained; it was simply fetchable at /js/init.js, HTTP 200, and it published the real
// schema: `INSERT INTO map${gameId} (sectorid, sectortype, ownerid, colonized, artifact,
// metalbonus, crystalbonus, terraformlvl)` plus the map<gameId> table-naming convention.
// It was also broken - it called `db.query` and never defined `db` - so it could not have
// run server-side either. Dead, misplaced, and publishing table layout at the same time.
//
// The tell was that nothing called it. Same shape as the shop balance and the standing
// orders panel: present, plausible, and connected to nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

/** Every file under public/, recursively, that could contain code. */
function codeFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'images' || entry.name === 'audio' || entry.name === 'fonts') continue;
            codeFiles(full, out);
        } else if (entry.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

test('nothing served to the browser imports a server module', () => {
    // A UMD tail (`if (typeof module !== 'undefined' && module.exports)`) is fine and
    // several client files use one so their helpers can be unit tested. What must not
    // appear is an unconditional require at load time, which only Node can satisfy - and
    // which means the file is server code that happens to live in the web root.
    const offenders = [];

    for (const file of codeFiles(publicDir)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            if (!/(?:^|[^.\w])require\s*\(/.test(line)) return;
            if (/^\s*(\/\/|\*)/.test(line)) return;
            const context = lines.slice(Math.max(0, i - 5), i + 1).join(' ');
            if (/typeof\s+(module|require|exports)/.test(context)) return;   // UMD guard
            offenders.push(`${path.relative(publicDir, file).replace(/\\/g, '/')}:${i + 1}  ${line.trim().slice(0, 72)}`);
        });
    }

    assert.deepEqual(offenders, [],
        'these files are under public/ and so are published, but they are Node modules - '
        + 'they cannot run in a browser and their contents are readable by anyone:\n  '
        + offenders.join('\n  '));
});

test('the deleted server-side initialiser has not come back', () => {
    assert.equal(fs.existsSync(path.join(publicDir, 'js', 'init.js')), false,
        'public/js/init.js is server-side game setup and leaks the map table schema; it '
        + 'belongs outside the web root if it is wanted at all');
});
