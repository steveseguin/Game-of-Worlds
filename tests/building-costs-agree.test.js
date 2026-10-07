// Shared construction rules must load in the browser and agree with displayed prices.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function serverCosts() {
    return require('../server/lib/config/constants').BUILDING_COSTS;
}

function clientCosts() {
    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'public/js/construction-rules.js'), 'utf8'), context);
    return context.window.ConstructionRules.BUILDING_COSTS;
}

/** The cost spans baked into the build buttons, keyed by data-building-id. */
function markupCosts() {
    const src = fs.readFileSync(path.join(root, 'public', 'game.html'), 'utf8');
    const costs = {};
    const buttonRe = /data-building-id="(\d+)"[\s\S]{0,600}?cost-metal">(\d+)<\/span>\s*<span class="cost-crystal">(\d+)</g;
    for (const m of src.matchAll(buttonRe)) {
        costs[Number(m[1])] = { metal: Number(m[2]), crystal: Number(m[3]) };
    }
    return costs;
}

test('construction rules load before the game UI and build panel', () => {
    const html = fs.readFileSync(path.join(root, 'public/game.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\s+defer\s+src="js\/([^"?]+)(?:\?[^" ]*)?"/g)].map(match => match[1]);
    const rulesIndex = scripts.indexOf('construction-rules.js');
    assert.ok(rulesIndex >= 0, 'construction rules must be loaded as a deferred script');
    for (const consumer of ['GUI.js', 'build.js']) {
        assert.ok(scripts.indexOf(consumer) > rulesIndex, `${consumer} must load after construction rules`);
    }
});

test('the client prices buildings exactly the way the server charges for them', () => {
    const server = serverCosts();
    const client = clientCosts();

    assert.ok(Object.keys(server).length >= 6, `expected the full building list, saw ${Object.keys(server).length}`);

    const mismatches = [];
    Object.keys(server).forEach(id => {
        const a = server[id];
        const b = client[id];
        if (!b) {
            mismatches.push(`building ${id}: missing from browser construction rules`);
            return;
        }
        if (a.metal !== b.metal || a.crystal !== b.crystal) {
            mismatches.push(`building ${id}: server ${a.metal}/${a.crystal} vs browser ${b.metal}/${b.crystal}`);
        }
    });

    assert.deepEqual(mismatches, [],
        `browser construction rules disagree with the server about what a building costs:\n  ${mismatches.join('\n  ')}`);
});

test('the build buttons advertise the price the server will actually charge', () => {
    const server = serverCosts();
    const markup = markupCosts();

    assert.ok(Object.keys(markup).length >= 6,
        `expected a cost on every build button, parsed ${Object.keys(markup).length}`);

    const mismatches = [];
    Object.keys(markup).forEach(id => {
        const shown = markup[id];
        const real = server[id];
        if (!real) {
            mismatches.push(`button for building ${id} has no server cost`);
            return;
        }
        if (shown.metal !== real.metal || shown.crystal !== real.crystal) {
            mismatches.push(`building ${id}: button shows ${shown.metal}/${shown.crystal}, server charges ${real.metal}/${real.crystal}`);
        }
    });

    assert.deepEqual(mismatches, [],
        `a build button advertises a price the server does not charge:\n  ${mismatches.join('\n  ')}`);
});

// Ships have the same problem in a milder form. build.js carries FALLBACK_SHIP_COSTS,
// used to price the ship buttons whenever the server's techstate has not arrived yet —
// which is exactly the moment a new player is first looking at them. The server figure
// wins once it lands, so a drifted fallback does not overcharge anyone; it just quotes a
// price that is not real, and then silently changes.
// The ship buttons carry the price a third time, hand-written into their <small> labels.
// This one has no runtime override at all: whatever the markup says is what a player reads
// until they click. Halving the Colony Ship needed three separate edits (combat.js,
// build.js, game.html) and only the first two were guarded — so guard the third.
test('the ship buttons advertise the price the server will actually charge', () => {
    const combat = require('../server/lib/combat');
    const src = fs.readFileSync(path.join(root, 'public', 'game.html'), 'utf8');

    const shown = {};
    const buttonRe = /data-ship-id="(\d+)"[^>]*>[\s\S]{0,240}?<small[^>]*>([^<]*)<\/small>/g;
    for (const m of src.matchAll(buttonRe)) {
        const label = m[2];
        const metal = label.match(/([\d,]+)\s*M\b/);
        const crystal = label.match(/([\d,]+)\s*C\b/);
        shown[Number(m[1])] = {
            metal: metal ? Number(metal[1].replace(/,/g, '')) : null,
            crystal: crystal ? Number(crystal[1].replace(/,/g, '')) : 0
        };
    }

    assert.ok(Object.keys(shown).length >= 8,
        `expected a price on every ship button, parsed ${Object.keys(shown).length}`);

    const mismatches = [];
    Object.values(combat.SHIP_TYPES).forEach(ship => {
        const label = shown[ship.id];
        if (!label) return;              // not every hull is offered in the build tab
        if (label.metal !== ship.cost.metal) {
            mismatches.push(`${ship.name}: button says ${label.metal}M, costs ${ship.cost.metal}M`);
        }
        if (label.crystal !== ship.cost.crystal) {
            mismatches.push(`${ship.name}: button says ${label.crystal}C, costs ${ship.cost.crystal}C`);
        }
    });

    assert.deepEqual(mismatches, [],
        `a ship button advertises a price the server does not charge:\n  ${mismatches.join('\n  ')}`);
});

test('the fallback ship prices match the ones the server will send', () => {
    const combat = require('../server/lib/combat');
    const src = fs.readFileSync(path.join(root, 'public', 'js', 'build.js'), 'utf8');
    const block = src.match(/const FALLBACK_SHIP_COSTS = \{([\s\S]*?)\n\s*\};/);
    assert.ok(block, 'could not find FALLBACK_SHIP_COSTS in build.js');

    const fallback = {};
    for (const m of block[1].matchAll(/(\d+):\s*\{\s*metal:\s*(\d+),\s*crystal:\s*(\d+)[^}]*production:\s*(\d+)/g)) {
        fallback[Number(m[1])] = {
            metal: Number(m[2]),
            crystal: Number(m[3]),
            production: Number(m[4])
        };
    }

    const hulls = Object.values(combat.SHIP_TYPES);
    assert.ok(hulls.length >= 9, `expected the full hull roster, saw ${hulls.length}`);

    const mismatches = [];
    hulls.forEach(ship => {
        const shown = fallback[ship.id];
        if (!shown) {
            mismatches.push(`${ship.name}: missing from FALLBACK_SHIP_COSTS`);
            return;
        }
        if (shown.metal !== ship.cost.metal || shown.crystal !== ship.cost.crystal) {
            mismatches.push(`${ship.name}: fallback ${shown.metal}/${shown.crystal}, real ${ship.cost.metal}/${ship.cost.crystal}`);
        }
        // buildSlots is what the spaceport actually charges against its per-turn budget.
        if (shown.production !== ship.buildSlots) {
            mismatches.push(`${ship.name}: fallback claims ${shown.production} production, costs ${ship.buildSlots}`);
        }
    });

    assert.deepEqual(mismatches, [],
        `the ship buttons would quote a price the server does not use:\n  ${mismatches.join('\n  ')}`);
});
