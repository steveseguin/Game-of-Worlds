// The advisor reacts by pattern-matching raw server text. Same brittle coupling as the
// event feed, with a nastier failure mode: when a pattern stops matching, the advisor just
// goes quiet. Nothing errors, no test fails, and the written lines sit there looking fine
// in the source. It is only noticeable if you happen to expect a remark and not get one.
//
// Two real bugs on the first run of this:
//   - researchDone matched "Success: Purchased", which the server never sends. It says
//     "Success: Researched ...". The advisor had NEVER acknowledged a technology, wasting
//     three written lines per race.
//   - shipBuilt matched /Success: Built (?!Colony)/, which also matches "Success: Built
//     Metal Extractor" - so finishing a refinery drew a remark about a new hull.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const advisorSrc = fs.readFileSync(path.join(root, 'public', 'js', 'advisor.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');

function loadObservers() {
    const block = advisorSrc.match(/const OBSERVERS = \[[\s\S]*?\n {4}\];/);
    assert.ok(block, 'could not find OBSERVERS in advisor.js');
    return new Function(`${block[0]}; return OBSERVERS;`)();
}

// A hole like ${shipData.name} is ONE template but many real messages, and which one you
// substitute changes the answer. Rendering it only as "Colony Ship" made the ship pattern
// look dead when it is not - so holes that vary expand into every value they can take.
const HULLS = ['Scout', 'Frigate', 'Destroyer', 'Cruiser', 'Battleship',
    'Intruder', 'Dreadnought', 'Carrier', 'Colony Ship'];
const STRUCTURES = ['Metal Extractor', 'Crystal Refinery', 'Research Academy',
    'Spaceport', 'Orbital Turret', 'Warp Gate'];

function renderVariants(text) {
    const fixed = text
        .replace(/\$\{tech\.name\}/g, 'Terraforming')
        .replace(/\$\{[^}]*sector[^}]*\}/gi, '19');

    let variants = [fixed];
    if (/\$\{shipData\.name\}/.test(fixed)) {
        variants = HULLS.map(name => fixed.replace(/\$\{shipData\.name\}/g, name));
    } else if (/\$\{building\.name\}/.test(fixed)) {
        variants = STRUCTURES.map(name => fixed.replace(/\$\{building\.name\}/g, name));
    }
    return variants.map(v => v.replace(/\$\{[^}]*\}/g, '7'));
}

function serverMessages() {
    const seen = new Set();
    const re = /["`]((?:Success|Error): |Fleet |Battle |Asteroids |An enemy )[^"`]{5,140}/g;
    for (const m of serverSrc.matchAll(re)) {
        renderVariants(m[0].slice(1)).forEach(v => seen.add(v));
    }
    return [...seen];
}

test('the harvest actually finds the server vocabulary', () => {
    const messages = serverMessages();
    assert.ok(messages.length > 40, `harvested only ${messages.length} server strings`);
    assert.ok(messages.some(m => /Success: Researched/.test(m)), 'expected a research success');
    assert.ok(messages.some(m => /Success: Built Colony Ship/.test(m)), 'expected a ship build');
    assert.ok(messages.some(m => /Success: Built Metal Extractor/.test(m)), 'expected a building build');
});

test('every advisor pattern matches something the server actually says', () => {
    const messages = serverMessages();
    const dead = loadObservers()
        .filter(observer => !messages.some(m => observer.re.test(m)))
        .map(observer => `${observer.event} (${observer.re})`);

    assert.deepEqual(dead, [],
        'these advisor patterns match nothing the server sends, so the advisor is '
        + 'silent for them:\n  ' + dead.join('\n  '));
});

test('finishing a building does not draw a remark about ships', () => {
    const observers = loadObservers();
    const fired = observers
        .filter(o => o.re.test('Success: Built Metal Extractor in sector 19'))
        .map(o => o.event);

    assert.ok(!fired.includes('shipBuilt'),
        'a building triggered the shipBuilt line: "New hull off the line..."');
    assert.ok(!fired.includes('colonyReady'),
        'a building triggered the colony line');
});

test('the ship and colony events fire for the right things', () => {
    const observers = loadObservers();
    const eventsFor = text => observers.filter(o => o.re.test(text)).map(o => o.event);

    assert.ok(eventsFor('Success: Built Colony Ship in sector 19 (7 production)').includes('colonyReady'),
        'a colony ship should announce itself as a colonisation opportunity');
    assert.ok(eventsFor('Success: Built Frigate in sector 19 (3 production)').includes('shipBuilt'),
        'a warship should draw the shipBuilt line');
    assert.ok(eventsFor('Success: Researched Terraforming Lv2').includes('researchDone'),
        'research should be acknowledged');
});
