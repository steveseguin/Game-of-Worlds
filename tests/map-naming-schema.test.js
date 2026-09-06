// Per-game tables are created two different ways and they must agree.
//
// A brand-new game gets its map table from `CREATE TABLE IF NOT EXISTS` in server.js. A game
// that already exists gets new columns from the ensure* migration chain. If a column is added
// to one and not the other, the bug is invisible in development - you create a fresh game, it
// works - and every pre-existing game breaks on the first query that names the column.
//
// This repo already has the scar: server/setup.js declares a map table with `sectortype` and
// `ownerid`, while the live schema in server.js uses `type` and `owner`. Those diverged and
// nobody noticed because setup.js's copy is dead.
//
// So: assert the two definitions agree, assert the migration is actually reachable from the
// chain, and assert the sweep query only names columns that exist.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSrc = fs.readFileSync(
    path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
const connectSrc = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'connect.js'), 'utf8');

const NAMING_COLUMNS = ['sectorname', 'namedby', 'namedturn', 'namechosen'];

/** The body of the live `CREATE TABLE ... ${tables.map}` statement. */
function createTableBody() {
    const m = serverSrc.match(/CREATE TABLE IF NOT EXISTS \$\{tables\.map\} \(([\s\S]*?)\)`/);
    assert.ok(m, 'could not find the live map CREATE TABLE in server.js');
    return m[1];
}

/**
 * Every map UPDATE that writes a sector name, with its full statement text.
 *
 * There are three writers, each checked against its own rule:
 *
 *   - the SWEEP writes the default name and must use COALESCE, because a name is permanent and
 *     survives conquest;
 *   - the PICKER replaces it with the player's choice and must therefore NOT use COALESCE - it
 *     is the one statement allowed to overwrite - which is why it has to be fenced by namedby
 *     instead, so only the empire the chart credits can do it, and by namechosen so the
 *     one permitted choice cannot be edited later.
 *
 *   - PLANET RENAME changes an owned planet, guarded by owner and planet type. Its
 *     handler tests exercise authorization, validation and hidden-observer privacy.
 * An unexpected writer must be reviewed against these separate rules.
 */
function nameWrites() {
    const all = [...serverSrc.matchAll(
        /UPDATE map\$\{gameId\}\s*\n?\s*SET([\s\S]*?)WHERE sectorid = \?([^,;`]*)/g)];
    const writes = all.filter(m => /sectorname/i.test(m[1]));
    assert.equal(writes.length, 3,
        `expected three map UPDATEs that write sectorname - sweep, picker and planet rename - `
        + `found ${writes.length} (of ${all.length} map updates)`);

    const sweep = writes.find(m => /COALESCE/i.test(m[1]));
    const picker = writes.find(m => /namechosen/i.test(m[1]));
    const planet = writes.find(m => /AND owner = \? AND type = \?/.test(m[2]));
    assert.ok(planet, 'planet renaming must be fenced by current owner and planet type');
    assert.ok(sweep, 'neither sectorname write uses COALESCE, so the sweep can rename on recapture');
    assert.ok(picker, 'both sectorname writes use COALESCE, so the player picker can never apply');
    return { sweep, picker };
}

function sweepUpdate() {
    return nameWrites().sweep;
}

/** The body of ensureMapTableColumns. */
function migrationBody() {
    const m = serverSrc.match(/function ensureMapTableColumns\(gameId, callback\) \{([\s\S]*?)\n\}/);
    assert.ok(m, 'could not find ensureMapTableColumns in server.js');
    return m[1];
}

test('every naming column is declared for new games', () => {
    const body = createTableBody();
    const missing = NAMING_COLUMNS.filter(c => !new RegExp(`\\b${c}\\b`).test(body));
    assert.deepEqual(missing, [],
        `new games would not have these columns: ${missing.join(', ')}`);
});

test('every naming column is also migrated for existing games', () => {
    const body = migrationBody();
    const missing = NAMING_COLUMNS.filter(c => !new RegExp(`\\b${c}\\b`).test(body));
    assert.deepEqual(missing, [],
        `games that already exist would never get these columns: ${missing.join(', ')}`);
});

test('the two definitions name the same set of columns', () => {
    // The divergence guard. Anything added to one side must appear on the other.
    const created = new Set(
        [...createTableBody().matchAll(/^\s*([a-z_]+)\s+(?:INT|VARCHAR|TINYINT|LONGTEXT|TIMESTAMP)/gim)]
            .map(m => m[1].toLowerCase())
    );
    const migrated = new Set(
        [...migrationBody().matchAll(/ADD COLUMN ([a-z_]+)/gi)].map(m => m[1].toLowerCase())
    );

    // The migration only needs to cover columns added after the table shipped, so it is a
    // subset - but nothing may be in the migration and absent from CREATE TABLE, or a fresh
    // game and a migrated game end up with different tables.
    const onlyMigrated = [...migrated].filter(c => !created.has(c));
    assert.deepEqual(onlyMigrated, [],
        'these columns are migrated onto old games but missing from CREATE TABLE, so new '
        + `games will not have them: ${onlyMigrated.join(', ')}`);
});

test('ensureMapTableColumns is actually reachable from the migration chain', () => {
    // Easy failure: define the function, never call it, and every existing game silently keeps
    // a table with no naming columns. Require a call site outside the definition itself.
    const calls = (serverSrc.match(/ensureMapTableColumns\(/g) || []).length;
    assert.ok(calls >= 2,
        `ensureMapTableColumns appears ${calls} time(s) - it is defined but never invoked, `
        + 'so pre-existing games never get the columns');

    // And specifically: the previous link must hand off to it on both its paths, the mock
    // short-circuit and the end of its column loop.
    const previous = serverSrc.match(
        /function ensureExploredSectorColumns\(gameId, callback\) \{([\s\S]*?)\n\}/);
    assert.ok(previous, 'could not find ensureExploredSectorColumns');
    const handoffs = (previous[1].match(/ensureMapTableColumns\(/g) || []).length;
    assert.equal(handoffs, 2,
        'ensureExploredSectorColumns should hand off to ensureMapTableColumns on both its '
        + `mock path and its completion path; found ${handoffs}`);
});

test('the sweep query only writes columns that exist', () => {
    // The sweep is the one place that writes a name, and no test exercises that code path -
    // moveFleet's hazard resolution is too deep to reach from a unit test. This is the
    // substitute: the statement is checked against the declared schema rather than executed.
    const m = sweepUpdate();
    assert.ok(m, 'could not find the sweep UPDATE against the map table');

    const assigned = [...m[1].matchAll(/(\w+)\s*=/g)]
        .map(x => x[1].toLowerCase())
        .filter(c => c !== 'coalesce');
    assert.ok(assigned.includes('sectorname'), 'the sweep should record a name');

    const declared = new Set(
        [...createTableBody().matchAll(/^\s*([a-z_]+)\s+(?:INT|VARCHAR|TINYINT|LONGTEXT|TIMESTAMP)/gim)]
            .map(x => x[1].toLowerCase())
    );
    const unknown = assigned.filter(c => !declared.has(c));
    assert.deepEqual(unknown, [],
        `the sweep writes columns that are not declared: ${unknown.join(', ')}`);
});

test('a name is preserved rather than overwritten', () => {
    // Canon: a name is permanent and survives conquest - whoever takes the sector inherits the
    // name the people who bought it gave it. A bare `SET sectorname = ?` would silently rename
    // on recapture and quietly delete the feature's whole point.
    const m = sweepUpdate();
    assert.ok(m, 'could not find the sweep UPDATE');
    assert.match(m[1], /sectorname\s*=\s*COALESCE\(\s*sectorname\s*,/i,
        'sectorname must be written with COALESCE so an existing name is never overwritten');
});

test('a total loss names the shoal without claiming it', () => {
    // The memorial path shares one UPDATE with the sweep, and the only thing separating "I hold this
    // road" from "I died here and it is on the chart" is that ownership is passed as null.
    //
    // If `owner = COALESCE(?, owner)` is ever simplified back to `owner = ?`, losing an entire fleet
    // at a shoal would HAND the player the sector - a total wipe would become a free claim, which is
    // both an exploit and the exact opposite of the intended feeling. Nothing else in the statement
    // distinguishes the two cases, so this assertion is the whole safety margin.
    const { sweep } = nameWrites();
    assert.match(sweep[1], /owner\s*=\s*COALESCE\(\s*\?\s*,\s*owner\s*\)/i,
        'the sweep UPDATE no longer writes ownership conditionally. A memorial (total loss) passes '
        + 'null for the owner; with a bare `owner = ?` it would claim the sector instead. See '
        + 'lore/29-borrowed-machinery.md B4.');

    // And the caller must actually pass null rather than the player id on the loss path.
    const guard = serverSrc.match(/const claimed = survivors > 0;/);
    assert.ok(guard, 'the sweep no longer distinguishes a claim from a total loss');
    assert.match(serverSrc, /\[claimed \? playerId : null,/,
        'the sweep passes an unconditional owner; a total loss would claim the ground');

    // The gate has to admit total losses at all - it used to be `survivors > 0`.
    assert.match(serverSrc, /if \(!sectorOwner && totalShips > 0\)/,
        'the naming write is gated on survival again, so a fleet that dies records nothing');
});

test('the player picker can only rename what the chart credits to that player', () => {
    // The picker is the one statement in the game allowed to overwrite a name, which makes its
    // WHERE clause the whole of its safety. Without `namedby = ?` any player who could reach the
    // command could rename any sector on the map, including one they had just taken from the
    // person who paid for it - which is precisely the thing the feature exists to prevent.
    const { picker } = nameWrites();
    const whereClause = picker[2];
    assert.match(whereClause, /AND\s+namedby\s*=\s*\?/i,
        'the picker UPDATE must be fenced by namedby, or it can rename any sector on the map');
    assert.match(whereClause, /AND\s+namedturn\s*>=\s*\?/i,
        'the picker UPDATE must be fenced by namedturn, or the naming window never closes');
    assert.match(whereClause, /AND\s+namechosen\s*=\s*0/i,
        'the picker UPDATE must be fenced by namechosen, or one player can rename repeatedly');
    assert.match(picker[1], /namechosen\s*=\s*1/i,
        'the picker must close the one-time choice when it writes the selected name');
});

test('the sweep records the authoritative turn counter', () => {
    const sweepContext = serverSrc.match(
        /const chartedName = sectorNames\.defaultName\(gameId, sectorId\);([\s\S]*?)db\.query\(/);
    assert.ok(sweepContext, 'could not find the sweep naming write');
    assert.match(sweepContext[1], /parseTurnNumber\(gameState\.turns\[gameId\],\s*1\)/,
        'the sweep must record gameState.turns; activeGames has no authoritative turn field');
    assert.doesNotMatch(sweepContext[1], /activeGames[\s\S]*?\.turn/,
        'the sweep reads activeGames.turn, which stays undefined and records every name on turn 1');
});

test('visible map snapshots carry and decode permanent chart identity', () => {
    const sender = serverSrc.match(
        /function sendVisibleMapState\(gameId, connection\) \{([\s\S]*?)\n\}/);
    assert.ok(sender, 'could not find sendVisibleMapState in server.js');
    assert.match(sender[1], /encodeURIComponent\(visibleName \|\| ''\)/,
        'mapstate must encode chart names so separators cannot corrupt the wire payload');
    assert.match(sender[1], /sector\.namedby/,
        'mapstate must carry who named a charted sector');
    assert.match(sender[1], /sector\.namedturn/,
        'mapstate must carry when a charted sector was named');

    const receiver = connectSrc.match(/function updateMapState\(message\) \{([\s\S]*?)\n\}/);
    assert.ok(receiver, 'could not find updateMapState in connect.js');
    assert.match(receiver[1], /decodeURIComponent\(chartNameRaw\)/,
        'the client must decode chart names received in mapstate');
    assert.match(receiver[1], /namedById/,
        'the client must retain the namer id even if the player roster has not arrived yet');
    assert.match(receiver[1], /namedTurn/,
        'the client must retain the charting turn from mapstate');
});

test('the picker resolves an index and never trusts a name off the wire', () => {
    // sector-names.js exists so that nothing a player types can land on a shared map. That
    // property is only real if the handler uses nameByIndex; a well-meaning change to
    // isAllowedName(proposed) would reintroduce player text into the pipeline, and it would
    // look correct because isAllowedName does validate.
    const handler = serverSrc.match(/function nameSector\(data, connection\) \{([\s\S]*?)\n\}/);
    assert.ok(handler, 'could not find nameSector in server.js');
    assert.match(handler[1], /sectorNames\.nameByIndex\(/,
        'nameSector must resolve the choice with nameByIndex');
    assert.doesNotMatch(handler[1], /isAllowedName/,
        'nameSector should take an index, not validate a name supplied by the client');
});
