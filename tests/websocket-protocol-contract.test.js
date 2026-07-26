const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    CLIENT_COMMANDS,
    FROZEN_GAMEPLAY_COMMANDS,
    GAME_MESSAGE_PREFIXES,
    formatTurnPhase
} = require('../server/lib/websocket-protocol');

const root = path.join(__dirname, '..');

test('registered commands exactly match the server dispatch switch and protocol docs', () => {
    const serverIndex = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
    const docs = fs.readFileSync(path.join(root, 'docs', 'agents', 'server', 'websocket-protocol.md'), 'utf8');
    const dispatchBody = serverIndex.slice(serverIndex.indexOf('function handleCommand'), serverIndex.indexOf('// Helper Functions'));
    const switchCommands = [...dispatchBody.matchAll(/case\s+["']([^"']+)["']\s*:/g)].map(match => match[1]);

    assert.deepEqual([...CLIENT_COMMANDS].sort(), switchCommands.sort());
    CLIENT_COMMANDS.forEach(command => assert.ok(docs.includes(`//${command}`), `missing //${command} documentation`));
    FROZEN_GAMEPLAY_COMMANDS.forEach(command => assert.ok(CLIENT_COMMANDS.includes(command), `${command} must be registered`));
});

test('registered game message prefixes are parsed by the browser and documented', () => {
    const client = fs.readFileSync(path.join(root, 'public', 'js', 'connect.js'), 'utf8');
    const docs = fs.readFileSync(path.join(root, 'docs', 'agents', 'server', 'websocket-protocol.md'), 'utf8');

    GAME_MESSAGE_PREFIXES.forEach(prefix => {
        assert.ok(client.includes(`"${prefix}"`) || client.includes(`'${prefix}'`), `client does not parse ${prefix}`);
        assert.ok(docs.includes(prefix), `protocol docs omit ${prefix}`);
    });
    assert.equal(formatTurnPhase('resolving', 12, 'income'), 'turnphase::resolving::12::income');
    assert.equal(formatTurnPhase('bad', 0, 'bad::phase'), 'turnphase::idle::1::badphase');
});

test('the documented namechoice payload is the payload the server sends', () => {
    // The tests above check that a prefix is registered, parsed and mentioned in the docs. None of
    // them look inside the payload, and that gap produced a real error: the docs listed a `deadline`
    // field that never existed and omitted `cost`, which is the one the prompt actually renders.
    //
    // namechoice is guarded specifically because it is the only prefix whose documentation spells
    // out a key list, which is what makes the drift checkable at all.
    const serverSrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
    const docs = fs.readFileSync(path.join(root, 'docs', 'agents', 'server', 'websocket-protocol.md'), 'utf8');
    const client = fs.readFileSync(path.join(root, 'public', 'js', 'name-picker.js'), 'utf8');

    // Keys the server puts in the object it stringifies into the message.
    const emitted = serverSrc.match(/namechoice::\$\{JSON\.stringify\(\{([\s\S]*?)\}\)\}/);
    assert.ok(emitted, 'could not find the namechoice payload construction in server.js');
    // Comment lines cannot match: `//` fails [a-zA-Z], so only real keys are captured.
    const sent = [...emitted[1].matchAll(/^\s*([a-zA-Z]+):/gm)].map(m => m[1]);
    assert.ok(sent.length >= 4, `extracted only ${sent.length} payload keys; the regex has drifted`);

    // Keys the docs claim.
    const documented = docs.match(/`namechoice::<json>`[^|]*\|[^|]*\|[^|]*?\{([^}]*)\}/);
    assert.ok(documented, 'the namechoice row no longer documents its payload shape');
    const claimed = documented[1].split(',').map(s => s.trim().replace(/`/g, '')).filter(Boolean);

    assert.deepEqual([...claimed].sort(), [...new Set(sent)].sort(),
        `the docs and the server disagree about the namechoice payload.\n  server: ${sent.join(', ')}`
        + `\n  docs:   ${claimed.join(', ')}`);

    // And every key the client reads must actually be sent, or the prompt silently renders nothing.
    const read = [...client.matchAll(/payload\.([a-zA-Z]+)/g)].map(m => m[1]);
    const unsent = [...new Set(read)].filter(k => !sent.includes(k));
    assert.deepEqual(unsent, [],
        `name-picker.js reads payload keys the server never sends: ${unsent.join(', ')}`);
});
