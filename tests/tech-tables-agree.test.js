// Exercise the shared rules as a browser script as well as a CommonJS import.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const serverTech = require('../server/lib/tech');

function loadClientTech() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tech.js'), 'utf8');
    const context = { window: {} };
    vm.runInNewContext(src, context, { filename: 'tech.js' });
    return context.window.TechSystem;
}

test('the client prices research exactly the way the server charges for it', () => {
    const client = loadClientTech().TECHNOLOGIES;
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
    const client = loadClientTech();
    // Walk the actual cost curve rather than trusting the inputs: a change to the
    // rounding or the exponent would leave baseCost and costMultiplier equal while the
    // prices diverge.
    Object.keys(serverTech.TECHNOLOGIES).forEach(key => {
        const def = serverTech.TECHNOLOGIES[key];
        const mirror = client.TECHNOLOGIES[key];
        if (!mirror) return; // reported by the test above
        for (let level = 0; level < def.maxLevel; level++) {
            const serverCost = serverTech.nextLevelCost(def.id, level);
            const clientCost = client.nextLevelCost(def.id, level);
            assert.equal(clientCost, serverCost,
                `${key} Lv${level + 1}: card would show ${clientCost}, server charges ${serverCost}`);
        }
    });
});
