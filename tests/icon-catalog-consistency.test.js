const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tech = require('../server/lib/tech');
const combat = require('../server/lib/combat');
const catalog = require('../lore/visual-reference/icon-system/catalog.json');

const ROOT = path.join(__dirname, '..');
const ICON_ROOT = path.join(ROOT, 'lore', 'visual-reference', 'icon-system', 'icons');

function slug(value) {
    return String(value).toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
}

function pngDimensions(filename) {
    const header = fs.readFileSync(filename).subarray(0, 24);
    assert.deepEqual(
        Array.from(header.subarray(0, 8)),
        [137, 80, 78, 71, 13, 10, 26, 10],
        `${filename} is not a PNG`
    );
    return {
        width: header.readUInt32BE(16),
        height: header.readUInt32BE(20)
    };
}

test('every live research level has one named 256px icon', () => {
    const byKey = new Map(catalog.technologies.map(entry => [entry.key, entry]));
    assert.equal(byKey.size, Object.keys(tech.TECHNOLOGIES).length);

    let iconCount = 0;
    Object.values(tech.TECHNOLOGIES).forEach(definition => {
        const entry = byKey.get(definition.key);
        assert.ok(entry, `missing icon catalog entry for ${definition.key}`);
        assert.equal(entry.id, definition.id, `${definition.key} id drifted`);
        assert.equal(entry.branch, definition.branch, `${definition.key} branch drifted`);
        assert.equal(entry.canonicalName, definition.name, `${definition.key} name drifted`);
        assert.equal(entry.aliases.length, definition.maxLevel, `${definition.key} needs one alias per level`);
        assert.equal(new Set(entry.aliases).size, entry.aliases.length, `${definition.key} repeats an alias`);

        entry.aliases.forEach((alias, index) => {
            assert.ok(alias.trim(), `${definition.key} level ${index + 1} has an empty alias`);
            const filename = path.join(
                ICON_ROOT,
                'tech',
                slug(definition.key),
                `level-${String(index + 1).padStart(2, '0')}.png`
            );
            assert.ok(fs.existsSync(filename), `missing ${filename}`);
            assert.deepEqual(pngDimensions(filename), { width: 256, height: 256 });
            iconCount += 1;
        });
    });

    assert.equal(iconCount, 108);
    assert.equal(iconCount, catalog.counts.researchLevels);
});

test('building states reflect the actual one-tier and four-tier structures', () => {
    const expected = [
        [0, 'Metal Extractor', null],
        [1, 'Crystal Refinery', null],
        [2, 'Research Academy', null],
        [3, 'Spaceport', 1],
        [3, 'Spaceport', 2],
        [3, 'Spaceport', 3],
        [3, 'Spaceport', 4],
        [4, 'Orbital Turret', null],
        [5, 'Warp Gate', null]
    ];

    assert.deepEqual(
        catalog.buildings.map(entry => [entry.type, entry.canonical, entry.level || null]),
        expected
    );

    catalog.buildings.forEach(entry => {
        const filename = path.join(ICON_ROOT, ...entry.icon.split('/'));
        assert.ok(fs.existsSync(filename), `missing ${filename}`);
        assert.deepEqual(pngDimensions(filename), { width: 256, height: 256 });
    });
});

test('every live ship type has one named 256px icon', () => {
    const liveShips = Object.values(combat.SHIP_TYPES).sort((a, b) => a.id - b.id);
    const iconShips = [...catalog.ships].sort((a, b) => a.id - b.id);
    assert.equal(iconShips.length, liveShips.length);

    liveShips.forEach((ship, index) => {
        const entry = iconShips[index];
        assert.equal(entry.id, ship.id);
        assert.equal(entry.canonical, ship.name);
        assert.ok(entry.alias.trim());
        const filename = path.join(ICON_ROOT, ...entry.icon.split('/'));
        assert.ok(fs.existsSync(filename), `missing ${filename}`);
        assert.deepEqual(pngDimensions(filename), { width: 256, height: 256 });
    });
});

test('the action catalog is unique and all declared assets exist', () => {
    assert.equal(catalog.actions.length, 16);
    assert.equal(new Set(catalog.actions.map(entry => entry.key)).size, catalog.actions.length);
    assert.equal(new Set(catalog.actions.map(entry => entry.alias)).size, catalog.actions.length);

    catalog.actions.forEach(entry => {
        const filename = path.join(ICON_ROOT, ...entry.icon.split('/'));
        assert.ok(fs.existsSync(filename), `missing ${filename}`);
        assert.deepEqual(pngDimensions(filename), { width: 256, height: 256 });
    });

    const actualTotal = catalog.counts.researchLevels
        + catalog.buildings.length
        + catalog.ships.length
        + catalog.actions.length;
    assert.equal(actualTotal, 142);
    assert.equal(actualTotal, catalog.counts.totalIcons);
});
