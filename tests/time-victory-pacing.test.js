// The only guaranteed way a match ends is the time victory. A flat turn limit ignores
// how long a turn actually lasts, so the same number meant fifteen hours in Quick
// (a mode the lobby sells as "one sitting") and over two years in Epic.

const test = require('node:test');
const assert = require('node:assert/strict');

const victory = require('../server/lib/victory');

const TURN_MINUTES = { quick: 3, epic: 24 * 60, test: 0.5 };

function stateFor(mode) {
    return { turns: { 1: 1 }, activeGames: { 1: { mode } } };
}

test('the time-victory limit scales with how long a turn takes', () => {
    const quick = victory.timeVictoryTurnLimit(1, stateFor('quick'));
    const epic = victory.timeVictoryTurnLimit(1, stateFor('epic'));

    // Quick must still be long enough for conquest to be a live option. Modelling
    // colony-ship cost against income puts ~45 worlds — the domination threshold —
    // near turn 90, so a shorter limit silently deletes a whole victory path and
    // every match ends on score instead.
    assert.ok(quick >= 80, `quick must leave conquest reachable, got ${quick} turns`);
    const quickHours = (quick * TURN_MINUTES.quick) / 60;
    assert.ok(quickHours <= 6, `quick should still end the same day, got ${quickHours}h`);

    // Epic is play-by-day, so it may run for weeks — but not for years.
    const epicDays = (epic * TURN_MINUTES.epic) / (60 * 24);
    assert.ok(epicDays <= 120, `epic should cap within a season, got ${epicDays} days`);
    assert.ok(epicDays >= 30, `epic should still be a campaign, got ${epicDays} days`);
});

test('an unrecognised mode falls back to the historical limit', () => {
    assert.equal(victory.timeVictoryTurnLimit(1, stateFor('something-else')), 300);
    assert.equal(victory.timeVictoryTurnLimit(1, { turns: {}, activeGames: {} }), 300);
    assert.equal(victory.timeVictoryTurnLimit(1, null), 300);
});

test('every mode still has a reachable end state', () => {
    Object.entries(victory.TIME_VICTORY_TURNS_BY_MODE).forEach(([mode, turns]) => {
        assert.ok(Number.isInteger(turns) && turns > 0, `${mode} needs a positive turn limit`);
        assert.ok(turns < 300, `${mode} should end sooner than the old flat limit`);
    });
});

// NOT TESTED HERE: whether the conquest threshold is reachable inside a mode's turn
// limit. An arithmetic expansion model was tried and abandoned — it swings from 43
// worlds to 8 by turn 90 on two equally defensible guesses about how much income a
// player converts into colony ships and how far targets sit. More fundamentally it
// only counts COLONISATION, while domination in a real match comes substantially from
// capturing rivals' developed worlds. Settling this needs a full-length simulation
// with AI opponents and real combat, not a spreadsheet. Until then the domination
// threshold is left at its long-standing value rather than tuned on bad evidence.

// The turn limit became mode-aware, but the sentence shown to the player was built once
// at module load from the flat 300-turn fallback. A Quick commander was told their match
// ran 300 turns when it actually ends at 90 — the single most important pacing fact in
// the game, off by more than 3x. Caught in a Playwright page snapshot, not by any test.
test('the victory panel quotes the turn limit the game will actually enforce', () => {
    const timeCondition = Object.values(victory.VICTORY_CONDITIONS)
        .find(condition => condition.name === 'Time Victory');
    assert.ok(timeCondition, 'expected a Time Victory condition');
    assert.equal(typeof timeCondition.describe, 'function',
        'Time Victory needs describe() — its wording depends on the game mode');

    Object.entries(victory.TIME_VICTORY_TURNS_BY_MODE).forEach(([mode, turns]) => {
        const text = timeCondition.describe(1, stateFor(mode));
        assert.ok(text.includes(String(turns)),
            `${mode} should be described as ${turns} turns, got "${text}"`);
        assert.equal(text, victory.VICTORY_CONDITIONS.TIME.describe(1, stateFor(mode)));
    });

    // An unknown mode still has to say something true — the historical limit.
    assert.ok(timeCondition.describe(1, stateFor('something-else')).includes('300'));
});
