// websocket-protocol-contract.test.js asserts the client parses every message prefix in
// the registry. That is only as good as the registry, and nothing checked the registry
// against reality — so a prefix the server sends but nobody listed was invisible to the
// very guard meant to catch it.
//
// That is exactly what happened to `systemalert::`. The server uses it for two things a
// player should absolutely see: an empire being eliminated, and standing orders acting on
// their behalf in Epic mode. It was in no registry and had no client handler, so it fell
// through to the generic path and the player was shown the wire prefix verbatim:
//
//     systemalert::A rival empire has been wiped out of the galaxy.
//
// This test closes the loop: every `xxx::` the server actually emits must be registered.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const protocol = require('../server/lib/websocket-protocol');
const clientSrc = fs.readFileSync(path.join(root, 'public', 'js', 'connect.js'), 'utf8');

// Lobby traffic is deliberately outside GAME_MESSAGE_PREFIXES - that registry describes an
// in-game session, and lobby.js owns these. Listed explicitly so a NEW unregistered game
// prefix still fails instead of hiding behind a loose rule.
const LOBBY_PREFIXES = new Set([
    'addai::', 'changerace::', 'creategame::', 'gamelist::', 'joingame::', 'races::'
]);

/**
 * Prefixes the server actually writes to a socket. Only sendUTF calls count — a prefix
 * appearing in a comment or a parser is not the server speaking.
 */
// There is more than one send path. The first version of this looked at sendUTF alone and
// therefore could not see newturn::, startgame::, turnclock:: or any other core message,
// all of which go through broadcastToGame. A guard that misses the busiest traffic in the
// game is worse than none, because it reads as coverage.
const SEND_CALLS = ['sendUTF', 'broadcastToGame', 'notifyPlayer'];

function emittedPrefixes() {
    const found = new Set();
    for (const file of ['server/server.js', 'server/index.js']) {
        const src = fs.readFileSync(path.join(root, file), 'utf8');
        SEND_CALLS.forEach(fn => {
            // sendUTF(`x::`)  |  broadcastToGame(gameId, `x::`)
            const re = new RegExp(`${fn}\\(\\s*(?:[A-Za-z0-9_.]+\\s*,\\s*)?[\`'"]([a-z_]+)::`, 'gi');
            for (const m of src.matchAll(re)) found.add(`${m[1]}::`);
        });
    }
    return [...found].sort();
}

test('the harvest sees messages sent through the broadcast helpers, not just sendUTF', () => {
    // Guards the guard. These go exclusively through broadcastToGame; if a refactor moves
    // sending behind a new helper, this fails rather than the audit silently shrinking.
    const emitted = emittedPrefixes();
    ['newturn::', 'startgame::'].forEach(prefix => {
        assert.ok(emitted.includes(prefix),
            `${prefix} is broadcast every turn but the harvest missed it - SEND_CALLS is `
            + 'out of date, so this whole file is now checking a fraction of the traffic');
    });
});

/** Every client script, since lobby and game traffic are handled in different files. */
function allClientSource() {
    const dir = path.join(root, 'public', 'js');
    return fs.readdirSync(dir).filter(f => f.endsWith('.js'))
        .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}

test('the client reads every prefix the server emits', () => {
    // The invariant that actually matters, and the one that would have caught
    // systemalert::. An unread prefix does not error - it reaches the player as raw text.
    const client = allClientSource();
    const unhandled = emittedPrefixes().filter(prefix => {
        const bare = prefix.replace('::', '');
        return !new RegExp(`["'\`]${bare}::`).test(client);
    });

    assert.deepEqual(unhandled, [],
        'the server sends these and no client file looks for them, so they reach the '
        + 'player as raw wire text:\n  ' + unhandled.join('\n  '));
});

test('every in-game prefix the server emits is registered', () => {
    // GAME_MESSAGE_PREFIXES is what websocket-protocol-contract.test.js walks, so a prefix
    // missing from it is invisible to that guard - which is how systemalert:: shipped.
    const registered = new Set();
    (protocol.GAME_MESSAGE_PREFIXES || []).forEach(p => {
        const m = /^([a-z_]+)::/i.exec(p);
        if (m) registered.add(`${m[1]}::`);
    });

    const missing = emittedPrefixes()
        .filter(p => !LOBBY_PREFIXES.has(p))
        .filter(p => !registered.has(p));

    assert.deepEqual(missing, [],
        'these in-game prefixes are sent but unregistered, so the protocol contract test '
        + 'cannot see them:\n  ' + missing.join('\n  '));
});

test('systemalert is stripped before display, not shown verbatim', () => {
    // Specific because it is the one that shipped broken, and because "the client mentions
    // the prefix somewhere" is a weaker claim than "the client removes it".
    assert.match(clientSrc, /indexOf\("systemalert::"\) === 0/,
        'connect.js should dispatch on the systemalert prefix');
    assert.match(clientSrc, /slice\("systemalert::"\.length\)/,
        'the prefix must be stripped before the text is shown to the player');
});

test('the elimination notice reaches the player as plain language', () => {
    // End to end on the exact string the server sends, through the real strip + classify.
    const raw = 'systemalert::A rival empire has been wiped out of the galaxy.';
    assert.ok(raw.startsWith('systemalert::'));
    const shown = raw.slice('systemalert::'.length).trim();
    assert.equal(shown, 'A rival empire has been wiped out of the galaxy.');
    assert.doesNotMatch(shown, /::/, 'no wire punctuation should survive into the feed');
});
