/**
 * Race identity is now real: each of the 12 races has a tech-tree access
 * profile (per-branch level caps + locked branches), a ship-type allow-list,
 * and combat multipliers that actually reach the battle math.
 *
 * These tests lock in:
 *  - getTechLevelCap: full access by default, branch caps, locked (0) branches
 *  - getRaceShipAccess / canRaceBuildShip: allow-lists, Colony always buildable
 *  - raceCombatModifiers: the {attack,hull,shields,speed} shape + real values
 *  - getRaceAccessSummary: locked vs limited branch buckets
 *  - buyTech / buyShip server enforcement (rejection paths + gate-passes-through)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const races = require('../server/lib/races');
const tech = require('../server/lib/tech');

const T = tech.TECHNOLOGIES;

// Race ids, for readability.
const TERRAN = 1, SILICON = 2, ZEPHYR = 3, CRYSTAL = 4, VOID = 5, MECH = 6,
      BIOFORM = 7, NOMAD = 8, ANCIENT = 9, QUANTUM = 10, TITAN = 11, SHADOW = 12;

// Ship type ids.
const FRIGATE = 1, DESTROYER = 2, SCOUT = 3, CRUISER = 4, BATTLESHIP = 5,
      COLONY = 6, DREADNOUGHT = 7, INTRUDER = 8, CARRIER = 9;

// --- getTechLevelCap ------------------------------------------------------

test('getTechLevelCap: races with no profile get full access', () => {
    // Terran (profile {}) and an unknown race both fall back to maxLevel.
    assert.equal(races.getTechLevelCap(TERRAN, T.LASER_WEAPONS), T.LASER_WEAPONS.maxLevel);
    assert.equal(races.getTechLevelCap(TERRAN, T.ANTIMATTER_WARHEADS), T.ANTIMATTER_WARHEADS.maxLevel);
    assert.equal(races.getTechLevelCap(9999, T.LASER_WEAPONS), T.LASER_WEAPONS.maxLevel,
        'unknown race id => full access (back-compat)');
});

test('getTechLevelCap: branch caps clamp below the tech maxLevel', () => {
    // Zephyr Swarm caps WEAPONS at 3; LASER_WEAPONS.maxLevel is 5.
    assert.equal(races.getTechLevelCap(ZEPHYR, T.LASER_WEAPONS), 3);
    // ...and the same cap applies to every tech in that branch.
    assert.equal(races.getTechLevelCap(ZEPHYR, T.PLASMA_CANNONS), 3);
    // A branch the race does NOT cap stays at full maxLevel.
    assert.equal(races.getTechLevelCap(ZEPHYR, T.METAL_EXTRACTION), T.METAL_EXTRACTION.maxLevel);
});

test('getTechLevelCap: a cap never raises a tech above its own maxLevel', () => {
    // Star Nomads cap TERRAFORM at 2 (== maxLevel is 5, so 2), ORBITAL at 1.
    assert.equal(races.getTechLevelCap(NOMAD, T.TERRAFORMING), 2);
    assert.equal(races.getTechLevelCap(NOMAD, T.ORBITAL_ENGINEERING), 1);
    // Mechanicus caps MISSILES at 2; ROCKETRY.maxLevel is 3 -> clamps to 2.
    assert.equal(races.getTechLevelCap(MECH, T.ROCKETRY), 2);
});

test('getTechLevelCap: a 0 cap means the branch is fully locked', () => {
    // Silicon + Crystalline both lock MISSILES entirely.
    assert.equal(races.getTechLevelCap(SILICON, T.ROCKETRY), 0);
    assert.equal(races.getTechLevelCap(CRYSTAL, T.ROCKETRY), 0);
    assert.equal(races.getTechLevelCap(CRYSTAL, T.HYPERV_MISSILES), 0);
    // Bioform lock ORBITAL entirely.
    assert.equal(races.getTechLevelCap(BIOFORM, T.ORBITAL_ENGINEERING), 0);
});

test('getTechLevelCap: every race/tech pair stays within [0, tech.maxLevel]', () => {
    for (const raceId of Object.values(races.RACE_TYPES).map(r => r.id)) {
        for (const def of Object.values(T)) {
            const cap = races.getTechLevelCap(raceId, def);
            assert.ok(cap >= 0 && cap <= def.maxLevel,
                `race ${raceId} / ${def.key} cap ${cap} out of [0,${def.maxLevel}]`);
        }
    }
});

// --- getRaceShipAccess / canRaceBuildShip ---------------------------------

test('getRaceShipAccess: default is all nine hulls, sorted', () => {
    assert.deepEqual(races.getRaceShipAccess(TERRAN), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(races.getRaceShipAccess(ANCIENT), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(races.getRaceShipAccess(9999), [1, 2, 3, 4, 5, 6, 7, 8, 9],
        'unknown race id => all ships');
});

test('canRaceBuildShip: allow-lists gate the right hulls', () => {
    // Zephyr Swarm: cheap light swarm, no capitals (no Battleship/Dreadnought/Carrier/Intruder).
    assert.equal(races.canRaceBuildShip(ZEPHYR, FRIGATE), true);
    assert.equal(races.canRaceBuildShip(ZEPHYR, CRUISER), true);
    assert.equal(races.canRaceBuildShip(ZEPHYR, DREADNOUGHT), false);
    assert.equal(races.canRaceBuildShip(ZEPHYR, BATTLESHIP), false);

    // Titan Lords: capitals only, no light hulls.
    assert.equal(races.canRaceBuildShip(TITAN, FRIGATE), false);
    assert.equal(races.canRaceBuildShip(TITAN, SCOUT), false);
    assert.equal(races.canRaceBuildShip(TITAN, DREADNOUGHT), true);
    assert.equal(races.canRaceBuildShip(TITAN, CARRIER), true);
});

test('canRaceBuildShip: Colony is always buildable (even off-list)', () => {
    for (const raceId of Object.values(races.RACE_TYPES).map(r => r.id)) {
        assert.equal(races.canRaceBuildShip(raceId, COLONY), true,
            `race ${raceId} must be able to build a Colony ship`);
        assert.ok(races.getRaceShipAccess(raceId).includes(COLONY),
            `race ${raceId} ship access must include Colony`);
    }
});

test('canRaceBuildShip accepts string ids (wire values arrive as strings)', () => {
    assert.equal(races.canRaceBuildShip(String(ZEPHYR), String(DREADNOUGHT)), false);
    assert.equal(races.canRaceBuildShip(String(ZEPHYR), String(FRIGATE)), true);
});

// --- raceCombatModifiers --------------------------------------------------

test('raceCombatModifiers: shape is {attack,hull,shields,speed} of finite numbers', () => {
    for (const raceId of Object.values(races.RACE_TYPES).map(r => r.id)) {
        const m = races.raceCombatModifiers(raceId);
        for (const key of ['attack', 'hull', 'shields', 'speed']) {
            assert.equal(typeof m[key], 'number', `race ${raceId} ${key} is a number`);
            assert.ok(Number.isFinite(m[key]) && m[key] > 0, `race ${raceId} ${key} positive finite`);
        }
    }
});

test('raceCombatModifiers: pulls real values from bonuses + unitModifiers', () => {
    const terran = races.raceCombatModifiers(TERRAN);
    assert.deepEqual(terran, { attack: 1, hull: 1, shields: 1, speed: 1 }, 'Terran is the neutral baseline');

    // Crystalline: +30% shields (unitModifiers.all.shields), strong hull/attack.
    const crystal = races.raceCombatModifiers(CRYSTAL);
    assert.equal(crystal.shields, 1.3);
    assert.equal(crystal.attack, 1.2);
    assert.equal(crystal.hull, 1.3);

    // Titan Lords: 2x attack & hull, half speed.
    const titan = races.raceCombatModifiers(TITAN);
    assert.equal(titan.attack, 2.0);
    assert.equal(titan.hull, 2.0);
    assert.equal(titan.speed, 0.6);

    // Void Walkers: phase-shift speed.
    assert.equal(races.raceCombatModifiers(VOID).speed, 1.5);

    // Unknown race id falls back to Terran's neutral profile.
    assert.deepEqual(races.raceCombatModifiers(9999), { attack: 1, hull: 1, shields: 1, speed: 1 });
});

// --- getRaceAccessSummary -------------------------------------------------

test('getRaceAccessSummary: splits locked (0) from limited (>0) branches', () => {
    const crystal = races.getRaceAccessSummary(CRYSTAL);
    assert.ok(crystal.lockedBranches.includes('MISSILES'), 'Crystalline MISSILES is locked');
    assert.ok(crystal.limitedBranches.includes('WEAPONS'), 'Crystalline WEAPONS is limited');
    assert.ok(crystal.limitedBranches.includes('ARMOR'), 'Crystalline ARMOR is limited');
    assert.ok(!crystal.lockedBranches.includes('WEAPONS'), 'a limited branch is not also locked');

    const terran = races.getRaceAccessSummary(TERRAN);
    assert.deepEqual(terran.lockedBranches, []);
    assert.deepEqual(terran.limitedBranches, []);
    assert.deepEqual(terran.ships, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// --- server enforcement: buyTech / buyShip --------------------------------
//
// We inject a tiny DB stub via setDatabase and drive the exported handlers
// with a fake connection that records every sendUTF reply. Handlers are matched
// by regex against the SQL so we can assert which writes did (or did not) run.

const server = require('../server/server');

function makeDb(handlers) {
    const calls = [];
    const db = {
        isOffline: true, // skip payment-manager wiring in setDatabase
        calls,
        query(sql, params, cb) {
            if (typeof params === 'function') { cb = params; params = []; }
            calls.push(String(sql));
            for (const [re, fn] of handlers) {
                if (re.test(sql)) {
                    const out = fn(params, sql) || {};
                    return cb(out.err || null, out.results || []);
                }
            }
            return cb(null, []); // default: empty result, no error
        }
    };
    return db;
}

function makeConn(playerId, gameId) {
    const sent = [];
    return {
        name: playerId,
        gameid: gameId,
        sent,
        sendUTF(msg) { sent.push(String(msg)); },
        lastError() { return sent.filter(m => m.startsWith('Error:')).pop(); }
    };
}

function ranWrite(db) {
    return db.calls.some(sql => /^\s*(UPDATE|INSERT)/i.test(sql));
}

test('buyTech: rejects researching past a race branch cap', () => {
    // Zephyr (WEAPONS cap 3) already at Laser Weapons Lv3 -> next level 4 is blocked.
    const db = makeDb([
        [/SELECT research, tech, race_id FROM players/i,
            () => ({ results: [{ research: 100000, tech: `${T.LASER_WEAPONS.id}:3`, race_id: ZEPHYR }] })]
    ]);
    server.setDatabase(db);
    const conn = makeConn(101, 7001);

    server.buyTech(`buytech:${T.LASER_WEAPONS.id}`, conn);

    assert.match(conn.lastError(), /can only research .* to Lv3/);
    assert.equal(ranWrite(db), false, 'no tech write when over the cap');
});

test('buyTech: rejects entering a branch the race has locked', () => {
    // Crystalline locks MISSILES entirely -> even level 1 of Rocketry is blocked.
    const db = makeDb([
        [/SELECT research, tech, race_id FROM players/i,
            () => ({ results: [{ research: 100000, tech: '', race_id: CRYSTAL }] })]
    ]);
    server.setDatabase(db);
    const conn = makeConn(102, 7002);

    server.buyTech(`buytech:${T.ROCKETRY.id}`, conn);

    assert.match(conn.lastError(), /that path is closed to them/);
    assert.equal(ranWrite(db), false, 'no tech write into a locked branch');
});

test('buyTech: a permitted research passes the race gate and proceeds to the write', () => {
    // Zephyr researching Laser Weapons Lv1 is within the WEAPONS cap of 3.
    // We fail the UPDATE on purpose: reaching it proves the race gate let it through.
    const db = makeDb([
        [/SELECT research, tech, race_id FROM players/i,
            () => ({ results: [{ research: 100000, tech: '', race_id: ZEPHYR }] })],
        [/^\s*UPDATE players/i, () => ({ err: new Error('boom') })]
    ]);
    server.setDatabase(db);
    const conn = makeConn(103, 7003);

    server.buyTech(`buytech:${T.LASER_WEAPONS.id}`, conn);

    assert.equal(conn.lastError(), 'Error: Failed to buy technology',
        'got the post-gate write error, not a race rejection');
    assert.ok(db.calls.some(sql => /^\s*UPDATE players/i.test(sql)), 'the write was attempted');
});

test('buyShip: rejects a hull outside the race doctrine (no resources spent)', () => {
    // Zephyr cannot build a Dreadnought; rejection happens before any spend.
    const db = makeDb([
        [/SELECT metal, crystal, currentsector, tech, race_id FROM players/i,
            () => ({ results: [{ metal: 999999, crystal: 999999, currentsector: 1, tech: '', race_id: ZEPHYR }] })]
    ]);
    server.setDatabase(db);
    const conn = makeConn(104, 7004);

    server.buyShip(`buyship:${DREADNOUGHT}`, conn);

    assert.match(conn.lastError(), /cannot build Dreadnought/);
    assert.equal(ranWrite(db), false, 'a disallowed ship never reaches the build/spend queries');
});

test('buyShip: an allowed hull passes the doctrine gate (reaches the spaceport check)', () => {
    // Terran may build a Dreadnought. With no spaceport present the next gate fires,
    // which proves the doctrine check passed (a different error than "cannot build").
    const db = makeDb([
        [/SELECT metal, crystal, currentsector, tech, race_id FROM players/i,
            () => ({ results: [{ metal: 999999, crystal: 999999, currentsector: 1, tech: '', race_id: TERRAN }] })],
        [/FROM buildings/i, () => ({ results: [] })]
    ]);
    server.setDatabase(db);
    const conn = makeConn(105, 7005);

    server.buyShip(`buyship:${DREADNOUGHT}`, conn);

    assert.equal(conn.lastError(), 'Error: Need a spaceport in this sector',
        'passed the doctrine gate, stopped at the spaceport requirement');
    assert.ok(conn.sent.every(m => !/cannot build/.test(m)), 'no doctrine rejection for an allowed hull');
});
