// Sector names are permanent, shared, and inherited through conquest, so the two properties
// that matter are DETERMINISM and CONTAINMENT.
//
// Determinism: a picker sends back an index into candidates(). If the candidate list is not
// identical on every call - across reconnects, across process restarts - then index 3 means a
// different name than the one the player clicked, and the map records something nobody chose.
//
// Containment: nothing a player types may ever reach another player's map. The server offers a
// curated set and accepts only members of it. That is what makes this feature shippable without
// a moderation queue.

const test = require('node:test');
const assert = require('node:assert/strict');
const names = require('../server/lib/sector-names');

test('candidates are deterministic for a sector', () => {
    for (const [game, sector] of [[1, 19], [1, 20], [7, 3], [42, 255]]) {
        const a = names.candidates(game, sector);
        const b = names.candidates(game, sector);
        assert.deepEqual(a, b, `candidates for ${game}:${sector} changed between calls`);
    }
});

test('candidates differ between sectors and between games', () => {
    // Not a hard guarantee for every pair - a small vocabulary will collide - but the first
    // candidate should vary across a spread of sectors rather than being effectively constant.
    const firsts = new Set();
    for (let sector = 1; sector <= 40; sector += 1) firsts.add(names.defaultName(1, sector));
    assert.ok(firsts.size >= 12,
        `40 sectors produced only ${firsts.size} distinct names; the map would look repetitive`);

    const sameSectorDifferentGames = new Set([1, 2, 3, 4, 5].map(g => names.defaultName(g, 19)));
    assert.ok(sameSectorDifferentGames.size >= 2,
        'sector 19 gets the same name in every game; the seed is ignoring gameId');
});

test('a candidate list has no duplicates and is the length asked for', () => {
    const list = names.candidates(3, 11, 6);
    assert.equal(list.length, 6);
    assert.equal(new Set(list).size, 6, `duplicates in ${JSON.stringify(list)}`);
});

test('every name is built from the charting vocabulary and is short enough to render', () => {
    for (let sector = 1; sector <= 30; sector += 1) {
        for (const candidate of names.candidates(1, sector, 8)) {
            assert.ok(candidate.length <= names.MAX_LENGTH,
                `"${candidate}" is ${candidate.length} chars, over the ${names.MAX_LENGTH} cap`);
            assert.ok(names.FEATURES.some(f => candidate.endsWith(f)),
                `"${candidate}" does not end in a charting feature word`);
            assert.ok(names.NAMES.some(n => candidate.includes(n)),
                `"${candidate}" is not named after anybody`);
            // No apostrophes in the surname itself - lore/03-themes.md, for voice work. The
            // possessive apostrophe is fine and is the only one permitted.
            assert.ok((candidate.match(/'/g) || []).length <= 1,
                `"${candidate}" has more than the one possessive apostrophe`);
        }
    }
});

test('isAllowedName accepts only what this module could have produced', () => {
    const legit = names.candidates(1, 19, 6)[2];
    assert.equal(names.isAllowedName(1, 19, legit), true, `should accept its own output "${legit}"`);

    // Containment. Each of these is the kind of thing a crafted wire message would carry.
    const rejects = [
        '', ' ', null, undefined, 42, {},
        'Something Nobody Offered',
        '<script>alert(1)</script>',
        'x'.repeat(200),
        legit + ' ',            // trailing space: not an exact member
        legit.toLowerCase()      // case-shifted: not an exact member
    ];
    for (const bad of rejects) {
        assert.equal(names.isAllowedName(1, 19, bad), false,
            `accepted ${JSON.stringify(bad)}, which no player should be able to put on a map`);
    }

    // A name legitimate for one sector is not legitimate for another.
    const other = names.candidates(1, 20, 6);
    if (!other.includes(legit)) {
        assert.equal(names.isAllowedName(1, 20, legit), false,
            'a name from a different sector was accepted');
    }
});

test('nameByIndex is bounded and matches the candidate list', () => {
    const list = names.candidates(1, 19, 6);
    for (let i = 0; i < 6; i += 1) {
        assert.equal(names.nameByIndex(1, 19, i, 6), list[i]);
    }
    for (const bad of [-1, 6, 7, 1.5, NaN, null, undefined, '2x', Infinity]) {
        assert.equal(names.nameByIndex(1, 19, bad, 6), null,
            `index ${JSON.stringify(bad)} should not resolve`);
    }
    // A string index that is a clean integer is the normal wire case and must work.
    assert.equal(names.nameByIndex(1, 19, '3', 6), list[3]);
});

test('sectorLabel prefers the name and falls back to the hex token', () => {
    // The fallback must be byte-identical to what the client has always displayed, or every
    // unnamed sector silently relabels.
    assert.equal(names.sectorLabel(255, null), 'FF');
    assert.equal(names.sectorLabel(19, ''), '13');
    assert.equal(names.sectorLabel(19, '   '), '13');
    assert.equal(names.sectorLabel(19, undefined), '13');
    assert.equal(names.sectorLabel(19, "Ames's Reach"), "Ames's Reach");
    assert.equal(names.sectorLabel(19, '  the Vail Shoal  '), 'the Vail Shoal');
    // Never throws - it is called from message composition.
    assert.doesNotThrow(() => names.sectorLabel(undefined, undefined));
});
