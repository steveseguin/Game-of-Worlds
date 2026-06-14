/**
 * Phase 1 of the battle-theater feature: the server now serializes a faithful
 * per-round timeline and freezes the whole game while a battle plays out.
 *
 * These tests lock in:
 *  - formatBattleMessage emits one 20-field block per round, last block == final
 *  - back-compat fallback to a single final block when round snapshots are absent
 *  - the battle-pause duration math, accumulation, and cap
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const combat = require('../server/lib/combat');
const server = require('../server/server');

// Decode the `battle:` wire message into 20-field blocks.
function parseBlocks(message) {
    const parts = message.split(':');
    assert.equal(parts[0], 'battle', 'message is prefixed with "battle:"');
    const fields = parts.slice(1).map(Number);
    assert.equal(fields.length % 20, 0, 'payload is whole 20-field blocks');
    const blocks = [];
    for (let i = 0; i < fields.length; i += 20) {
        const block = fields.slice(i, i + 20);
        blocks.push({
            attackers: block.slice(0, 9),
            defenders: block.slice(9, 18),
            ground: block[18],
            orbital: block[19]
        });
    }
    return blocks;
}

test('formatBattleMessage emits initial + one block per round; final block == survivors', () => {
    const att = { ship1: 6, ship5: 2, ship7: 1 };
    const def = { ship1: 3, ship4: 2, ship9: 1, orbitalTurret: 2 };
    const tech = { weapons: 2, hull: 1, shields: 1, missiles: 0, orbital: 1 };

    const log = combat.conductBattle(att, def, tech, tech);
    const blocks = parseBlocks(combat.formatBattleMessage(log));

    assert.equal(blocks.length, 1 + log.rounds.length, 'block 0 is initial, then one per round');

    // Block 0 is the deployed fleet.
    assert.equal(blocks[0].attackers[0], 6, 'initial frigates');
    assert.equal(blocks[0].attackers[4], 2, 'initial battleships');
    assert.equal(blocks[0].attackers[6], 1, 'initial dreadnought');
    assert.equal(blocks[0].defenders[0], 3, 'initial defender frigates');
    assert.equal(blocks[0].orbital, 2, 'initial orbital turrets');

    // The last block must equal battleLog.final exactly (both sides).
    const last = blocks[blocks.length - 1];
    for (let t = 1; t <= 9; t++) {
        assert.equal(last.attackers[t - 1], log.final.attackers[t] || 0, `final attacker type ${t}`);
        assert.equal(last.defenders[t - 1], log.final.defenders[t] || 0, `final defender type ${t}`);
    }
});

test('formatBattleMessage falls back to a single final block without round snapshots', () => {
    const log = {
        initial: { attackers: [{ type: 1 }, { type: 1 }], defenders: [{ type: 1 }], groundTurrets: 0, orbitalTurrets: 0 },
        rounds: [],
        final: { attackers: { 1: 1 }, defenders: {}, groundTurrets: 0, orbitalTurrets: 0 }
    };
    const blocks = parseBlocks(combat.formatBattleMessage(log));
    assert.equal(blocks.length, 2, 'initial + final only');
    assert.equal(blocks[0].attackers[0], 2, 'initial');
    assert.equal(blocks[1].attackers[0], 1, 'final survivor');
    assert.equal(blocks[1].defenders[0], 0, 'defender wiped out');
});

test('formatBattleMessage ignores rounds lacking snapshots (legacy logs)', () => {
    const log = {
        initial: { attackers: [{ type: 1 }], defenders: [{ type: 1 }], groundTurrets: 0, orbitalTurrets: 0 },
        rounds: [{ round: 1, attackersDestroyed: 0, defendersDestroyed: 1 }], // no attackerCounts
        final: { attackers: { 1: 1 }, defenders: {}, groundTurrets: 0, orbitalTurrets: 0 }
    };
    const blocks = parseBlocks(combat.formatBattleMessage(log));
    assert.equal(blocks.length, 2, 'snapshot-less rounds are not serialized; use the final block');
    assert.equal(blocks[1].defenders[0], 0);
});

test('computeBattlePlaybackMs clamps to [5000, 22000] and grows with rounds', () => {
    const small = server.computeBattlePlaybackMs({
        rounds: [{}],
        initial: { attackers: [{}], defenders: [{}] }
    });
    const big = server.computeBattlePlaybackMs({
        rounds: new Array(12).fill({}),
        initial: { attackers: new Array(40).fill({}), defenders: new Array(40).fill({}) }
    });
    assert.ok(small >= 5000 && small <= 22000, `small in range (${small})`);
    assert.ok(big >= 5000 && big <= 22000, `big in range (${big})`);
    assert.ok(big > small, 'more rounds/ships -> longer playback');
    assert.equal(server.computeBattlePlaybackMs({}), 5000, 'empty battle clamps to floor');
});

test('battle pause activates, accumulates, caps at 25s, and clears the turn interval', () => {
    const gameId = 990001;
    const gs = server.gameState;

    // Seed a fake running tick so we can prove it gets cleared.
    gs.gameTimer[gameId] = setInterval(() => {}, 1_000_000);
    assert.equal(server.isBattlePauseActive(gameId), false);

    server.pauseTurnTimerForBattle(gameId, 6000);
    assert.equal(server.isBattlePauseActive(gameId), true, 'pause active after a battle');
    assert.equal(gs.gameTimer[gameId], undefined, 'recurring tick cleared during the pause');
    const firstUntil = gs.battlePause[gameId].until;
    assert.ok(firstUntil > Date.now(), 'freeze ends in the future');

    server.pauseTurnTimerForBattle(gameId, 6000);
    assert.ok(gs.battlePause[gameId].until > firstUntil, 'a second battle extends the freeze');

    server.pauseTurnTimerForBattle(gameId, 999_999);
    assert.ok(gs.battlePause[gameId].until <= Date.now() + 25_000 + 50, 'freeze is capped');

    // cleanup
    clearTimeout(gs.battlePause[gameId].timer);
    delete gs.battlePause[gameId];
});

test('broadcastBattlePause emits battlepause::<freeze>::<playback> to everyone', () => {
    const gameId = 990002;
    const gs = server.gameState;
    const messages = [];
    const client = { gameid: gameId, sendUTF: m => messages.push(m) };
    gs.clients.push(client);

    const freezeMs = server.broadcastBattlePause(gameId, {
        rounds: [{}],
        initial: { attackers: [{}], defenders: [{}] }
    });
    const frame = messages.find(m => m.indexOf('battlepause::') === 0);
    assert.ok(frame, 'a battlepause frame was broadcast');
    const [, freezeStr, playbackStr] = frame.split('::');
    assert.equal(Number(freezeStr), freezeMs, 'freeze duration matches return value');
    assert.ok(Number(playbackStr) > 0, 'playback duration present');
    assert.ok(freezeMs > Number(playbackStr), 'freeze covers playback plus an end buffer');

    // cleanup
    const idx = gs.clients.indexOf(client);
    if (idx >= 0) gs.clients.splice(idx, 1);
    if (gs.battlePause[gameId]) {
        clearTimeout(gs.battlePause[gameId].timer);
        delete gs.battlePause[gameId];
    }
    if (gs.gameTimer[gameId]) {
        clearInterval(gs.gameTimer[gameId]);
        delete gs.gameTimer[gameId];
    }
});
