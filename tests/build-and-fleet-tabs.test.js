// The command pad's Build tab used to carry both buildings AND ship production, which put
// two unrelated decisions - "what do I construct on this world" and "what do I add to this
// fleet" - behind one label. Ships now live in the Fleet tab, next to the fleet they join.
//
// This is pinned because the split is invisible to every other test: the ship buttons are
// wired with a document-wide querySelectorAll, so they keep working wherever they sit, and
// nothing would fail if they drifted back. What DOES break is the player-facing
// instructions that name a tab, and those have already gone stale once in this codebase
// for exactly this reason.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'game.html'), 'utf8');

/** The markup between a tab panel's opening div and the start of the next panel. */
function tabPanel(id) {
    const starts = [...html.matchAll(/<div id="([a-zA-Z0-9_-]+)" class="tab-panel/g)]
        .map(m => ({ id: m[1], at: m.index }));
    assert.ok(starts.length >= 2, `expected several tab panels, found ${starts.length}`);
    const index = starts.findIndex(s => s.id === id);
    assert.ok(index !== -1, `could not find the ${id} tab panel`);
    const end = index + 1 < starts.length ? starts[index + 1].at : html.length;
    return html.slice(starts[index].at, end);
}

test('ship production lives in the Fleet tab, not the Build tab', () => {
    const build = tabPanel('build');
    const fleet = tabPanel('fleet');

    const buildShips = (build.match(/class="ship-button"/g) || []).length;
    const fleetShips = (fleet.match(/class="ship-button"/g) || []).length;

    assert.equal(buildShips, 0, 'the Build tab should carry no ship buttons');
    assert.ok(fleetShips >= 9,
        `the Fleet tab should carry the whole hull roster, found ${fleetShips}`);
    assert.match(fleet, /spaceportProductionStatus/,
        'the production budget readout belongs with the ship buttons');
});

test('the Build tab still carries the buildings', () => {
    const build = tabPanel('build');
    const buildings = (build.match(/class="(?:building|defense)-button"/g) || []).length;
    assert.ok(buildings >= 6,
        `the Build tab should still carry every structure, found ${buildings}`);

    const fleet = tabPanel('fleet');
    assert.equal((fleet.match(/class="(?:building|defense)-button"/g) || []).length, 0,
        'structures should not have followed the ships into the Fleet tab');
});

test('no player-facing instruction sends someone to the wrong tab for a ship', () => {
    // The exact failure this guards: Quick Help and the onboarding checklist both told the
    // player to build a colony ship "in the Build tab", which stopped being true the
    // moment the ships moved.
    const onboarding = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'onboarding.js'), 'utf8');

    const shipSentences = [];
    [['game.html', html], ['onboarding.js', onboarding]].forEach(([name, text]) => {
        // Any sentence that mentions a ship and names a tab.
        const re = /[^.<>]*\b(?:colony ship|scout|ship)\b[^.<>]*\btab\b[^.<>]*/gi;
        for (const m of text.matchAll(re)) shipSentences.push([name, m[0].trim()]);
    });

    assert.ok(shipSentences.length > 0, 'expected to find instructions mentioning ships and tabs');

    const wrong = shipSentences.filter(([, sentence]) => /\bBuild tab\b/i.test(sentence));
    assert.deepEqual(wrong.map(([file, s]) => `${file}: ${s}`), [],
        'these tell the player to build a ship in the Build tab, where ships no longer are');
});
