// game-screen.js decides the HUD layout in JavaScript; game.html tightens the resource bar's
// contents in CSS. Both are expressing ONE decision - "this window is too narrow for three
// full-size resource blocks" - and for a while they disagreed about where that line is.
//
// The script used 560. The stylesheet used 430. Between the two, the bar was given a squeezed
// WIDTH with full-size CONTENTS, so it wrapped to two rows and grew downwards into the control
// pad, which is pinned to the bottom of the screen and cannot move out of the way. It surfaced as
// responsive-layout.spec.js failing at a randomly generated 510x407 with
// "resourceBar over controlPadGUI (282x9px)" - and 282px is exactly the squeezed width.
//
// A browser test can only catch that at viewport sizes it happens to try. This catches it in the
// source, in milliseconds, at every size at once.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const layoutSrc = fs.readFileSync(path.join(root, 'public', 'js', 'game-screen.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'public', 'game.html'), 'utf8');

test('the resource-bar tightening threshold matches the layout script', () => {
    const js = layoutSrc.match(/const veryNarrow = viewportWidth < (\d+);/);
    assert.ok(js, 'could not find `veryNarrow` in game-screen.js; it decides the squeezed bar width');
    const jsThreshold = Number(js[1]);

    // The media query that tightens the bar's contents. Identified by what it does, not by its
    // position, so reordering the stylesheet does not break this.
    const blocks = [...htmlSrc.matchAll(/@media \(max-width: (\d+)px\) \{([\s\S]*?)\n {8}\}/g)];
    const tightening = blocks.find(b => /#resourceBar \.res-icon \{ width: 18px/.test(b[2]));
    assert.ok(tightening, 'could not find the resource-bar tightening media query in game.html');
    const cssThreshold = Number(tightening[1]);

    assert.equal(cssThreshold, jsThreshold,
        `game-screen.js squeezes the resource bar below ${jsThreshold}px but the stylesheet only `
        + `tightens its contents below ${cssThreshold}px. Between those two numbers the bar gets a `
        + 'narrow box with full-size contents, wraps to two rows, and grows into the control pad. '
        + 'These are one decision and must be one number.');
});
