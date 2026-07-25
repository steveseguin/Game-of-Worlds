// The reverse of websocket-protocol-contract.test.js.
//
// That test walks the registry and asserts the CLIENT parses every message the server
// can send. Nothing checked the other direction: that every prefix the client dispatches
// on corresponds to a message something actually sends. A handler for a message that is
// never sent is dead code, and dead code in a message handler is not harmless — it means
// whatever UI that handler was supposed to fill is being filled by something else, or by
// nothing.
//
// That is not hypothetical. `fleet:` was the only writer of the selected-sector panel's
// nine ship-count cells. The server has never sent `fleet:`. So those cells showed
// "Unknown" on every sector of every game — including the player's own homeworld, under a
// caption reading "Live intel - Details are live" — until it was found by playing the
// deployed game. This test is the guard that would have caught it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/**
 * Prefixes the client still listens for that nothing sends any more. Each one is
 * superseded — the replacement is named so the next person does not have to work it out,
 * and so that adding a NEW dead handler fails this test rather than joining the list
 * silently.
 */
const KNOWN_LEGACY = new Map([
    ['ownsector:', 'superseded by mapstate:: / sector::'],
    ['fleet:', 'superseded by sector:: — the panel now fills from sectorData.ships'],
    ['ub:', 'superseded by sector:: / techstate::'],
    ['newround:', 'superseded by turnclock:: (already commented "legacy" at the call site)'],
    ['countdown::', 'superseded by turnclock::'],
    ['battlereport::', 'superseded by battle_summary::'],
    ['maxbuild::', 'build limits are enforced server-side and shown by build.js slot counts'],
    ['start10:', 'superseded by the lobby countdown/turnclock:: path']
]);

function clientPrefixes() {
    const client = fs.readFileSync(path.join(root, 'public', 'js', 'connect.js'), 'utf8');
    const found = new Set();
    for (const m of client.matchAll(/message\.indexOf\(\s*["'`]([^"'`]+)["'`]\s*\)\s*===\s*0/g)) found.add(m[1]);
    for (const m of client.matchAll(/message\.startsWith\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) found.add(m[1]);
    for (const m of client.matchAll(/message\s*===\s*["'`]([^"'`]+)["'`]/g)) found.add(m[1]);
    return found;
}

function serverSource() {
    let source = '';
    ['server/server.js', 'server/index.js'].forEach(file => {
        const full = path.join(root, file);
        if (fs.existsSync(full)) source += fs.readFileSync(full, 'utf8');
    });
    const libDir = path.join(root, 'server', 'lib');
    fs.readdirSync(libDir).forEach(file => {
        if (file.endsWith('.js')) source += fs.readFileSync(path.join(libDir, file), 'utf8');
    });
    return source;
}

test('every message the client handles is one the server can actually send', () => {
    const server = serverSource();
    const unexpected = [];

    clientPrefixes().forEach(prefix => {
        const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // The prefix has to appear inside some string the server builds.
        const sent = new RegExp('["\'`][^"\'`\\n]*' + escaped).test(server);
        if (!sent && !KNOWN_LEGACY.has(prefix)) {
            unexpected.push(prefix);
        }
    });

    assert.deepEqual(unexpected, [],
        'the client handles messages nothing sends. Either wire them up, delete them, or ' +
        'add them to KNOWN_LEGACY with the replacement named:\n  ' + unexpected.join('\n  '));
});

test('the legacy list does not rot — everything on it is still genuinely unsent', () => {
    const server = serverSource();
    const revived = [];

    KNOWN_LEGACY.forEach((reason, prefix) => {
        const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp('["\'`][^"\'`\\n]*' + escaped).test(server)) {
            revived.push(`${prefix} (listed as: ${reason})`);
        }
    });

    assert.deepEqual(revived, [],
        'these are on the legacy list but the server now sends them — take them off it, ' +
        'and check the handler still does the right thing:\n  ' + revived.join('\n  '));
});
