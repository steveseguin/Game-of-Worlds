// The event feed picks an icon and a colour by pattern-matching the server's message TEXT.
// That is a brittle coupling by construction: reword a message on the server and the
// client silently falls back to the generic dot, with nothing failing anywhere. Icons that
// quietly stop distinguishing research from combat are worse than no icons, because the
// player has already learned to trust them.
//
// So: harvest the Success/Error strings server.js actually emits, run them through the
// real classifier, and assert every one lands somewhere meaningful.
//
// This caught one on its first run - "Success: We navigated the asteroid belt ... and
// avoided being hit" fell through to the generic icon, despite surviving a hazard being
// among the more interesting things that can happen on a turn.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(root, 'public', 'js', 'connect.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');

/** The real classifier, lifted from the client rather than reimplemented. */
function loadClassifier() {
    const fn = clientSrc.match(/function classifyEventMessage\(text\) \{[\s\S]*?\n\}/);
    assert.ok(fn, 'could not find classifyEventMessage in connect.js');
    return new Function(`${fn[0]}; return classifyEventMessage;`)();
}

/** The real palette, so a kind with no icon defined cannot slip through. */
function loadKinds() {
    const block = clientSrc.match(/const EVENT_KINDS = \{[\s\S]*?\n\};/);
    assert.ok(block, 'could not find EVENT_KINDS in connect.js');
    return new Function(`${block[0]}; return EVENT_KINDS;`)();
}

/**
 * Template literals in the source carry `${...}` holes. Layout and classification both
 * depend on the rendered text, so fill them with the kind of value they carry at runtime -
 * otherwise "Built ${shipData.name}" never looks like a ship and the check is meaningless.
 */
function renderTemplate(text) {
    return text
        .replace(/\$\{shipData\.name\}/g, 'Colony Ship')
        .replace(/\$\{building\.name\}/g, 'Metal Extractor')
        .replace(/\$\{tech\.name\}/g, 'Terraforming')
        .replace(/\$\{[^}]*sector[^}]*\}/gi, '19')
        .replace(/\$\{[^}]*\}/g, '7');
}

function serverOutcomeMessages() {
    const seen = new Set();
    for (const m of serverSrc.matchAll(/["`](Success|Error): ([^"`]{5,120})/g)) {
        seen.add(renderTemplate(`${m[1]}: ${m[2]}`));
    }
    return [...seen];
}

test('the server actually emits outcome messages for the feed to classify', () => {
    const messages = serverOutcomeMessages();
    assert.ok(messages.length > 40,
        `expected the server's outcome vocabulary, harvested only ${messages.length}`);
    assert.ok(messages.some(m => m.startsWith('Success:')), 'expected some successes');
    assert.ok(messages.some(m => m.startsWith('Error:')), 'expected some errors');
});

test('every kind the classifier can return has an icon and a colour', () => {
    const classify = loadClassifier();
    const kinds = loadKinds();
    const used = new Set(serverOutcomeMessages().map(m => classify(m).kind));
    used.add('income');   // set explicitly by the income call site, not by text
    const missing = [...used].filter(kind => !kinds[kind]);
    assert.deepEqual(missing, [],
        `these kinds are returned but have no entry in EVENT_KINDS: ${missing.join(', ')}`);
});

test('no success message falls through to the generic icon', () => {
    // Errors legitimately share one icon - a failed order is a failed order. Successes are
    // where the distinction earns its keep, so every one must be recognised as something.
    const classify = loadClassifier();
    const generic = serverOutcomeMessages()
        .filter(m => m.startsWith('Success:'))
        .filter(m => classify(m).kind === 'info');

    assert.deepEqual(generic, [],
        'these successes would draw the generic dot instead of a meaningful icon:\n  '
        + generic.join('\n  '));
});

test('the messages that matter most are classified as the right thing', () => {
    // Spot-checks with the intent spelled out, so a future pattern change that keeps
    // everything "not info" but scrambles the meanings still fails.
    const classify = loadClassifier();
    const expectations = [
        ['Success: Researched Terraforming Lv2', 'research'],
        ['Success: Built Colony Ship in sector 19 (7 production)', 'ship'],
        ['Success: Built Metal Extractor in sector 19', 'building'],
        ['Success: Upgraded Spaceport to level 2 in sector 19', 'building'],
        ['Success: Colonized sector 19', 'movement'],
        ['Success: Fleet moved into sector 19', 'movement'],
        ['Asteroids in sector 11 destroyed 2 ships during transit.', 'battle'],
        ['Success: We navigated the asteroid belt in sector 19 and avoided being hit', 'movement'],
        ['Error: Not enough crystal for movement (need 240)', 'problem'],
        ['Turn 14 income: +182 metal', 'income']
    ];

    const wrong = expectations
        .map(([text, want]) => ({ text, want, got: classify(text).kind }))
        .filter(r => r.got !== r.want)
        .map(r => `"${r.text}" -> ${r.got}, expected ${r.want}`);

    assert.deepEqual(wrong, [], `misclassified:\n  ${wrong.join('\n  ')}`);
});
