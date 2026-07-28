const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { audit } = require('../tools/publish-art');

const REPO = path.resolve(__dirname, '..');
const UI_ART = path.join(REPO, 'public', 'images', 'ui');

/**
 * lore/visual-reference/ is 206 MB of purpose-built art, and the deploy walks
 * public/ recursively — so every file copied into the web root ships to every
 * player forever, whether a screen uses it or not. Worse, this project has
 * already been bitten by the deploy being ADDITIVE: a file retired from git kept
 * serving HTTP 200 in production until it was removed on the box by hand.
 *
 * The library's own README states the rule: runtime assets move into public/
 * "only when an implemented screen consumes them". This test is that rule with
 * teeth. If it fails you either wire the asset into a screen or delete it from
 * public/images/ui/ — do not silence it.
 */
test('every published art asset is referenced by a real screen', () => {
    const orphans = audit();
    assert.deepEqual(
        orphans,
        [],
        `These files sit in public/images/ui/ and ship to players, but no HTML/CSS/JS references them:\n`
        + orphans.map(o => `  images/ui/${o}`).join('\n')
        + `\nWire each into the screen that needs it, or delete it. See tools/publish-art.js.`
    );
});

test('published art stays small enough to ship', () => {
    if (!fs.existsSync(UI_ART)) return; // nothing published yet is fine

    const files = fs.readdirSync(UI_ART)
        .map(name => ({ name, bytes: fs.statSync(path.join(UI_ART, name)).size }));
    const total = files.reduce((sum, f) => sum + f.bytes, 0);

    // A generous ceiling that still catches someone copying a whole 36 MB group
    // (fleets/) or a folder of 512px sources into the web root by accident.
    const LIMIT_MB = 12;
    assert.ok(
        total <= LIMIT_MB * 1024 * 1024,
        `public/images/ui/ is ${(total / 1024 / 1024).toFixed(1)} MB, over the ${LIMIT_MB} MB budget.\n`
        + `Largest: ${files.sort((a, b) => b.bytes - a.bytes).slice(0, 5)
            .map(f => `${f.name} ${(f.bytes / 1024).toFixed(0)}KB`).join(', ')}\n`
        + `Publish smaller derivatives (the crests exist at 32/64/128/512) rather than raising this.`
    );
});
