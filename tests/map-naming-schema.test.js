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

const NAMING_COLUMNS = ['sectorname', 'namedby', 'namedturn'];

/** The body of the live `CREATE TABLE ... ${tables.map}` statement. */
function createTableBody() {
    const m = serverSrc.match(/CREATE TABLE IF NOT EXISTS \$\{tables\.map\} \(([\s\S]*?)\)`/);
    assert.ok(m, 'could not find the live map CREATE TABLE in server.js');
    return m[1];
}

/**
 * The SET clause of the sweep's UPDATE. server.js contains many `UPDATE map${gameId} SET ...`
 * statements, so match them all and pick the one that writes a name - taking the first would
 * silently test an unrelated statement and pass for the wrong reason.
 */
function sweepUpdate() {
    const all = [...serverSrc.matchAll(
        /UPDATE map\$\{gameId\}\s*\n?\s*SET([\s\S]*?)WHERE sectorid = \?/g)];
    const sweep = all.filter(m => /sectorname/i.test(m[1]));
    assert.equal(sweep.length, 1,
        `expected exactly one map UPDATE that writes sectorname, found ${sweep.length} `
        + `(of ${all.length} map updates)`);
    return sweep[0];
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
