// The technology table exists TWICE: server/lib/tech.js decides what a research order
// actually costs, and public/js/tech.js computes the number printed on the tech card.
// Nothing links them. If either drifts, the client advertises one price and the server
// charges another, and the only symptom is a player being told "Needs N research" for a
// tech whose card says it costs something else.
//
// This project has already paid for a duplicated table once: media.js and sound.js each
// carry their own sound registry, and "correcting" one from memory of the other broke a
// working call. This test is the guard that was missing there.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const serverTech = require('../server/lib/tech');

function loadClientTechnologies() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tech.js'), 'utf8');
    const match = src.match(/const TECHNOLOGIES\s*=\s*(\{[\s\S]*?\n\});/);
    assert.ok(match, 'could not find TECHNOLOGIES in public/js/tech.js — has it been restructured?');
    // The table is a plain object literal; evaluating it in isolation avoids having to
    // load a browser module under node.
    // eslint-disable-next-line no-eval
    return eval('(' + match[1] + ')');
}

test('the client prices research exactly the way the server charges for it', () => {
    const client = loadClientTechnologies();
    const server = serverTech.TECHNOLOGIES;

    const names = new Set([...Object.keys(server), ...Object.keys(client)]);
    assert.ok(names.size >= 20, `expected the full tech tree, saw ${names.size} entries`);

    const mismatches = [];
    names.forEach(key => {
        const a = server[key];
        const b = client[key];
        if (!a || !b) {
            mismatches.push(`${key}: present on ${a ? 'server' : 'client'} only`);
            return;
        }
        // These four are the ones that decide the price and the ceiling. Text fields are
        // free to differ — the client may word a summary differently.
        ['id', 'baseCost', 'costMultiplier', 'maxLevel'].forEach(field => {
            if (String(a[field]) !== String(b[field])) {
                mismatches.push(`${key}.${field}: server=${a[field]} client=${b[field]}`);
            }
        });
    });

    assert.deepEqual(mismatches, [], `client and server disagree about research cost:\n  ${mismatches.join('\n  ')}`);
});

test('every level of every tech is priced identically on both sides', () => {
    const client = loadClientTechnologies();
    // Walk the actual cost curve rather than trusting the inputs: a change to the
    // rounding or the exponent would leave baseCost and costMultiplier equal while the
    // prices diverge.
    Object.keys(serverTech.TECHNOLOGIES).forEach(key => {
        const def = serverTech.TECHNOLOGIES[key];
        const mirror = client[key];
        if (!mirror) return; // reported by the test above
        for (let level = 0; level < def.maxLevel; level++) {
            const serverCost = serverTech.nextLevelCost(def.id, level);
            const clientCost = Math.round(mirror.baseCost * Math.pow(mirror.costMultiplier, level));
            assert.equal(clientCost, serverCost,
                `${key} Lv${level + 1}: card would show ${clientCost}, server charges ${serverCost}`);
        }
    });
});
