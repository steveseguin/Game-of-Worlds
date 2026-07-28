const test = require('node:test');
const assert = require('node:assert/strict');

const { MockDatabase } = require('../server/lib/mock-db');

/**
 * The mock DB parses SQL with regexes, so anything it fails to recognise in a
 * SET clause is dropped in SILENCE — no error, no warning, just a write that
 * never happened.
 *
 * That is exactly what a plain `.split(',')` did to `COALESCE(?, owner)`: it cut
 * the expression in half at the comma inside the parentheses, producing two
 * fragments that matched no assignment pattern. The statement that secures a
 * swept shoal and names it writes FOUR columns that way, so
 * tools/full-game-sim.js reported "survivors secure the asteroid belt -
 * owner=null" against a server that does it correctly on real MariaDB, and the
 * whole sector-naming feature was untestable.
 *
 * These tests pin the SET-clause parser directly, because the failure mode is
 * silence and the sim can only catch the cases it happens to exercise.
 */

function makeDb() {
    return new MockDatabase();
}

function query(db, sql, params) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
}

async function seedMap(db, gameId) {
    // Creating the game builds the map tables the handlers below expect.
    await query(db, `CREATE TABLE IF NOT EXISTS map${gameId}`, []);
    return gameId;
}

async function readSector(db, gameId, sectorId) {
    const rows = await query(db, `SELECT * FROM map${gameId} WHERE sectorid = ?`, [sectorId]);
    return rows[0];
}

test('COALESCE(?, col) writes the parameter when it is not null', async () => {
    const db = makeDb();
    const gameId = await seedMap(db, 7001);

    await query(db, `UPDATE map${gameId} SET owner = COALESCE(?, owner) WHERE sectorid = ?`, [42, 5]);

    const row = await readSector(db, gameId, 5);
    assert.equal(Number(row.owner), 42, 'a non-null parameter must win over the existing column');
});

test('COALESCE(?, col) keeps the existing value when the parameter is null', async () => {
    const db = makeDb();
    const gameId = await seedMap(db, 7002);

    await query(db, `UPDATE map${gameId} SET owner = ? WHERE sectorid = ?`, [9, 5]);
    await query(db, `UPDATE map${gameId} SET owner = COALESCE(?, owner) WHERE sectorid = ?`, [null, 5]);

    const row = await readSector(db, gameId, 5);
    assert.equal(Number(row.owner), 9, 'a null parameter must leave the column untouched');
});

test('COALESCE(col, ?) only fills a column that is still empty', async () => {
    const db = makeDb();
    const gameId = await seedMap(db, 7003);

    await query(db, `UPDATE map${gameId} SET sectorname = COALESCE(sectorname, ?) WHERE sectorid = ?`, ['First Name', 5]);
    await query(db, `UPDATE map${gameId} SET sectorname = COALESCE(sectorname, ?) WHERE sectorid = ?`, ['Second Name', 5]);

    const row = await readSector(db, gameId, 5);
    assert.equal(row.sectorname, 'First Name', 'a name is permanent; the second write must not overwrite it');
});

test('the belt-securing statement writes every one of its four columns', async () => {
    // This is the real statement from applyArrivalEffects in server/server.js.
    // It is the one that turns a hazard into a road and puts it on the chart.
    const db = makeDb();
    const gameId = await seedMap(db, 7004);

    await query(
        db,
        `UPDATE map${gameId}
            SET owner = COALESCE(?, owner),
                sectorname = COALESCE(sectorname, ?),
                namedby = COALESCE(namedby, ?),
                namedturn = COALESCE(namedturn, ?)
          WHERE sectorid = ?`,
        [77, 'Ash Corridor', 77, 3, 12]
    );

    const row = await readSector(db, gameId, 12);
    assert.equal(Number(row.owner), 77, 'survivors must take ownership of the shoal they swept');
    assert.equal(row.sectorname, 'Ash Corridor');
    assert.equal(Number(row.namedby), 77);
    assert.equal(Number(row.namedturn), 3);
});

test('a failed sweep names the sector without granting ownership', async () => {
    // Same statement, null owner: nothing came back, so the crossing bought a
    // name and nothing else. Both halves must land from one statement.
    const db = makeDb();
    const gameId = await seedMap(db, 7005);

    await query(
        db,
        `UPDATE map${gameId}
            SET owner = COALESCE(?, owner),
                sectorname = COALESCE(sectorname, ?),
                namedby = COALESCE(namedby, ?),
                namedturn = COALESCE(namedturn, ?)
          WHERE sectorid = ?`,
        [null, 'Memorial Shoal', 55, 4, 13]
    );

    const row = await readSector(db, gameId, 13);
    assert.ok(row.owner === null || row.owner === undefined, 'a fleet that died must not claim the sector');
    assert.equal(row.sectorname, 'Memorial Shoal', 'the name is what the crossing bought');
    assert.equal(Number(row.namedby), 55);
});

test('plain assignments still work beside a COALESCE in the same statement', async () => {
    const db = makeDb();
    const gameId = await seedMap(db, 7006);

    await query(
        db,
        `UPDATE map${gameId} SET owner = COALESCE(?, owner), type = ?, sectorname = COALESCE(sectorname, ?) WHERE sectorid = ?`,
        [4, 6, 'Mixed Clause', 8]
    );

    const row = await readSector(db, gameId, 8);
    assert.equal(Number(row.owner), 4, 'parameter cursor must stay in step across mixed assignments');
    assert.equal(Number(row.type), 6);
    assert.equal(row.sectorname, 'Mixed Clause');
});
