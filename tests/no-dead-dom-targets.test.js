// getElementById() against an id that does not exist returns null, and almost every call
// site here is written as `const el = getElementById(x); if (el) ...`. That is good
// defensive style and it is also perfectly silent: mistype an id, or rename one in the
// HTML without updating the JS, and the update simply stops happening. Nothing throws,
// nothing logs, and the panel just shows whatever it showed before.
//
// This is the same shape as the dead `fleet:` handler that left the selected-sector ship
// table reading "Unknown" on every sector of every game. That one was found by playing
// the deployed build; this test exists so the next one is found in CI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const jsDir = path.join(publicDir, 'js');

/**
 * Targets that legitimately do not exist. Each is guarded by `if (el)` and has a live
 * replacement, so nothing is broken — but they must be named here rather than tolerated
 * in bulk, so that a NEW missing id fails instead of blending in.
 */
const KNOWN_ABSENT = new Map([
    ['tech1', 'vestigial: tech levels render through renderTechTree()'],
    ['tech2', 'vestigial: tech levels render through renderTechTree()'],
    ['tech3', 'vestigial: tech levels render through renderTechTree()'],
    ['tech4', 'vestigial: tech levels render through renderTechTree()'],
    ['gameWindow', 'vestigial: the game screen is not wrapped in a toggled container'],
    ['crystal-balance', 'the shop panel has no balance element; the treasury bar carries crystal']
]);

function collectIds() {
    const ids = new Set();
    fs.readdirSync(publicDir).filter(f => f.endsWith('.html')).forEach(file => {
        const src = fs.readFileSync(path.join(publicDir, file), 'utf8');
        for (const m of src.matchAll(/\bid=["']([^"']+)["']/g)) ids.add(m[1]);
    });
    // Ids the client builds at runtime count too — battle3d, the shop and the event feed
    // all create their own nodes.
    fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).forEach(file => {
        const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
        for (const m of src.matchAll(/\.id\s*=\s*["'`]([^"'`$]+)["'`]/g)) ids.add(m[1]);
        for (const m of src.matchAll(/setAttribute\(\s*["']id["']\s*,\s*["'`]([^"'`$]+)["'`]/g)) ids.add(m[1]);
        for (const m of src.matchAll(/\bid=["']([^"'$]+)["']/g)) ids.add(m[1]);
        for (const m of src.matchAll(/\bid=\\?["']([A-Za-z][\w-]*)\\?["']/g)) ids.add(m[1]);
    });
    return ids;
}

function collectLookups() {
    const lookups = new Map();
    fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).forEach(file => {
        const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
        src.split('\n').forEach((line, index) => {
            for (const m of line.matchAll(/getElementById\(\s*["']([^"'`]+)["']\s*\)/g)) {
                if (!lookups.has(m[1])) lookups.set(m[1], []);
                lookups.get(m[1]).push(`${file}:${index + 1}`);
            }
        });
    });
    return lookups;
}

test('every element the client reaches for actually exists somewhere', () => {
    const ids = collectIds();
    const missing = [];

    collectLookups().forEach((sites, id) => {
        if (!ids.has(id) && !KNOWN_ABSENT.has(id)) {
            missing.push(`${id} (${sites.slice(0, 3).join(', ')})`);
        }
    });

    assert.deepEqual(missing, [],
        'these ids are looked up but defined nowhere — a rename or a typo, and the update ' +
        'silently stops happening:\n  ' + missing.join('\n  '));
});

test('the absent list does not rot — everything on it is still genuinely absent', () => {
    const ids = collectIds();
    const revived = [];

    KNOWN_ABSENT.forEach((reason, id) => {
        if (ids.has(id)) revived.push(`${id} (listed as: ${reason})`);
    });

    assert.deepEqual(revived, [],
        'these are listed as absent but now exist — take them off the list and check the ' +
        'writer still does the right thing:\n  ' + revived.join('\n  '));
});
