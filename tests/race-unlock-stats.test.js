// Four of the twelve races could not be unlocked by anybody, ever.
//
// The pieces were all there and none of them touched: user_stats has had the columns since
// the schema was written, races.js reads them to decide what a player has earned, and the
// landing page advertises the exact thresholds — "COLONISE 20 WORLDS", "BUILD 500 SHIPS",
// "WIN 50 BATTLES", "EXPLORE 100 SECTORS". Nothing ever incremented them. Only `wins` and
// `games_played` were written, by victory.js at the end of a match, so the four races
// gated on the other counters sat behind a number frozen at zero.
//
// Nothing failed, which is why it survived: the columns existed, the query succeeded, the
// unlock check ran and honestly answered "no".
//
// (total_crystal_earned WAS already incremented in processTurnIncome, so the Crystalline
// Entity was always earnable. Four races, not five.)

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
const racesSrc = fs.readFileSync(path.join(root, 'server', 'lib', 'races.js'), 'utf8');
const { RACE_TYPES } = require('../server/lib/races');

/** Stat columns the unlock checker reads, harvested from races.js rather than restated. */
function statsTheUnlockCheckerReads() {
    const block = racesSrc.match(/function checkAchievementUnlock[\s\S]*?\n\}/);
    assert.ok(block, 'could not find checkAchievementUnlock');
    return [...new Set([...block[0].matchAll(/userStats\.([a-z_]+)/g)].map(m => m[1]))];
}

/** Columns something in the server actually increments. */
function statsTheServerWrites() {
    const written = new Set();
    for (const m of serverSrc.matchAll(/UPDATE user_stats SET\s+([a-z_]+)\s*=\s*\1\s*\+/gi)) {
        written.add(m[1]);
    }
    for (const m of serverSrc.matchAll(/bumpUserStat\([^,]+,\s*'([a-z_]+)'/g)) {
        written.add(m[1]);
    }
    // victory.js maintains the match-level ones.
    const victory = fs.readFileSync(path.join(root, 'server', 'lib', 'victory.js'), 'utf8');
    for (const m of victory.matchAll(/([a-z_]+)\s*=\s*\1\s*\+/gi)) written.add(m[1]);
    return written;
}

test('every stat an unlock depends on is actually incremented somewhere', () => {
    const read = statsTheUnlockCheckerReads();
    const written = statsTheServerWrites();
    assert.ok(read.length >= 6, `expected the unlock stats, found ${read.length}`);

    const never = read.filter(col => !written.has(col));
    assert.deepEqual(never, [],
        'these counters gate a race unlock and nothing ever increments them, so the race '
        + 'can never be earned:\n  ' + never.join('\n  '));
});

test('every achievement race is gated on a stat that exists', () => {
    // The other direction: a requirement naming a stat the checker does not handle would
    // fall through its switch and answer "locked" forever.
    const handled = new Set([...racesSrc.matchAll(/case '([a-z_]+)':/g)].map(m => m[1]));
    const unhandled = Object.values(RACE_TYPES)
        .filter(r => r.unlockType === 'achievement')
        .filter(r => !handled.has(r.unlockRequirement && r.unlockRequirement.type))
        .map(r => `${r.name} wants ${r.unlockRequirement && r.unlockRequirement.type}`);

    assert.deepEqual(unhandled, [],
        'these races are gated on a requirement checkAchievementUnlock does not handle:\n  '
        + unhandled.join('\n  '));
});

test('the counters are credited for the thing they are named after', () => {
    // Pins WHERE each bump lives, so a refactor that moves one somewhere it fires on
    // failure - or drops it - is visible. Named sites, not just "a bump exists".
    const expectations = [
        ['total_ships_built', /await session\.commit\(\);[\s\S]{0,200}?bumpUserStat\([^,]+, 'total_ships_built'\)/,
            'ships must be counted AFTER the transaction commits, never for a rolled-back build'],
        ['total_planets_colonized', /finishColonization = \(\) => \{[\s\S]{0,120}?bumpUserStat\([^,]+, 'total_planets_colonized'\)/,
            'colonies must be counted on the success path'],
        ['total_sectors_explored', /affectedRows\) > 0[\s\S]{0,120}?bumpUserStat\([^,]+, 'total_sectors_explored'\)/,
            'sectors must be counted only when newly inserted, not on every re-visit'],
        ['total_battles_won', /attackerVictory'\)\s*\{[\s\S]{0,120}?bumpUserStat\(attackerId, 'total_battles_won'\)/,
            'the attacker is credited only on an attacker victory']
    ];

    const wrong = expectations
        .filter(([, pattern]) => !pattern.test(serverSrc))
        .map(([col, , why]) => `${col}: ${why}`);

    assert.deepEqual(wrong, [], `stat bumps are not where they should be:\n  ${wrong.join('\n  ')}`);
});

test('bumpUserStat refuses a column that is not on the list', () => {
    // It interpolates the column name into SQL, so the whitelist is load-bearing.
    const fn = serverSrc.match(/function bumpUserStat[\s\S]*?\n\}/);
    assert.ok(fn, 'could not find bumpUserStat');
    assert.match(fn[0], /TRACKED_USER_STATS\.includes\(column\)/,
        'the column must be checked against the whitelist before it reaches the query');
    assert.match(serverSrc, /const TRACKED_USER_STATS = Object\.freeze\(\[/,
        'the whitelist should be frozen');
});
