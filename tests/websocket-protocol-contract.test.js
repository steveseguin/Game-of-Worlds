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
