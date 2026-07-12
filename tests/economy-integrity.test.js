const test = require('node:test');
const assert = require('node:assert/strict');

const server = require('../server/server');
const combat = require('../server/lib/combat');
const tech = require('../server/lib/tech');

function makeConnection() {
    const sent = [];
    return {
        name: 7,
        gameid: 1,
        sent,
        sendUTF(message) {
            sent.push(String(message));
        }
    };
}

function setScriptedDb(handler) {
    const queries = [];
    server.setDatabase({
        isMock: true,
        query(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            queries.push({ sql: String(sql), params });
            handler(String(sql), params, callback);
        }
    });
    return queries;
}

test('probing a nonexistent sector does not charge crystal', () => {
    const queries = setScriptedDb((sql, params, callback) => {
        assert.match(sql, /^SELECT \* FROM map1 WHERE sectorid = \?/);
        callback(null, []);
    });
    const connection = makeConnection();

    server.probeSector('//probe:ff', connection);

    assert.deepEqual(connection.sent, ['Error: Invalid sector']);
    assert.equal(queries.some(query => /^UPDATE players1/.test(query.sql)), false);
});

test('duplicate in-flight probe requests cannot charge the same scan twice', () => {
    let releaseSectorLookup;
    const queries = setScriptedDb((sql, params, callback) => {
        assert.match(sql, /^SELECT \* FROM map1 WHERE sectorid = \?/);
        releaseSectorLookup = callback;
    });
    const first = makeConnection();
    const second = makeConnection();

    server.probeSector('//probe:a', first);
    server.probeSector('//probe:a', second);

    assert.equal(queries.length, 1);
    assert.deepEqual(second.sent, ['Error: A probe is already en route to this sector']);
    releaseSectorLookup(new Error('test cleanup'), []);
    assert.deepEqual(first.sent, ['Error: Invalid sector']);
});

test('ship purchase does not insert after a concurrent balance change', async () => {
    const scout = Object.values(combat.SHIP_TYPES).find(ship => ship.id === 1);
    assert.ok(scout, 'expected scout ship definition');
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech, race_id FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '', race_id: 1 }]);
            return;
        }
        if (/^SELECT b\.id, b\.level/.test(sql)) {
            callback(null, [{ id: 2, level: 1, production_turn: 0, production_used: 0 }]);
            return;
        }
        if (/^UPDATE players1\s+SET metal = metal -/s.test(sql)) {
            callback(null, { affectedRows: 0 });
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyShip(`//buyship:${scout.id}`, connection);
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(connection.sent, ['Error: Resources changed; refresh and try again']);
    assert.equal(queries.some(query => /^INSERT INTO ships1/.test(query.sql)), false);
});

test('ship purchase reports transaction connection failures without an unhandled rejection', async () => {
    const connection = makeConnection();
    server.setDatabase({
        isMock: true,
        getConnection(callback) { callback(new Error('pool unavailable')); },
        query(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            if (/^CREATE TABLE IF NOT EXISTS/.test(sql.trim())) return callback(null, { affectedRows: 0 });
            if (/^SELECT metal, crystal, currentsector, tech, race_id FROM players1/.test(sql)) {
                return callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '', race_id: 1 }]);
            }
            if (/^SELECT b\.id, b\.level/.test(sql)) {
                return callback(null, [{ id: 2, level: 1, production_turn: 0, production_used: 0 }]);
            }
            assert.fail(`unexpected query: ${sql}`);
        }
    });

    server.buyShip('//buyship:1', connection);
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(connection.sent, ['Error: Failed to create ship; no resources or capacity were consumed']);
});

test('building purchase does not insert after a concurrent balance change', () => {
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '' }]);
            return;
        }
        if (/^SELECT owner, type FROM map1/.test(sql)) {
            callback(null, [{ owner: 7, type: 10 }]);
            return;
        }
        if (/^SELECT COUNT\(\*\) as count FROM buildings1/.test(sql)) {
            callback(null, [{ count: 0 }]);
            return;
        }
        if (/^UPDATE players1\s+SET metal = metal -/s.test(sql)) {
            callback(null, { affectedRows: 0 });
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyBuilding('//buybuilding:0', connection);

    assert.deepEqual(connection.sent, ['Error: Resources changed; refresh and try again']);
    assert.equal(queries.some(query => /^INSERT INTO buildings1/.test(query.sql)), false);
});

test('ship purchase validates the explicit selected sector instead of the legacy cursor', async () => {
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech, race_id FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '', race_id: 1 }]);
            return;
        }
        if (/^SELECT b\.id, b\.level/.test(sql)) {
            assert.deepEqual(params, [7, 15]);
            callback(null, [{ id: 2, level: 1, production_turn: 0, production_used: 0 }]);
            return;
        }
        if (/^UPDATE players1\s+SET metal = metal -/s.test(sql)) {
            callback(null, { affectedRows: 0 });
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyShip('//buyship:1:f', connection);
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(connection.sent, ['Error: Resources changed; refresh and try again']);
    assert.equal(queries.some(query => query.params?.includes(15)), true);
});

test('building purchase validates the explicit selected sector instead of the legacy cursor', () => {
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '' }]);
            return;
        }
        if (/^SELECT owner, type FROM map1/.test(sql)) {
            assert.deepEqual(params, [15]);
            callback(null, [{ owner: 7, type: 10 }]);
            return;
        }
        if (/^SELECT COUNT\(\*\) as count FROM buildings1/.test(sql)) {
            assert.deepEqual(params, [15]);
            callback(null, [{ count: 0 }]);
            return;
        }
        if (/^UPDATE players1\s+SET metal = metal -/s.test(sql)) {
            callback(null, { affectedRows: 0 });
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyBuilding('//buybuilding:0:f', connection);

    assert.deepEqual(connection.sent, ['Error: Resources changed; refresh and try again']);
    assert.equal(queries.some(query => query.params?.includes(15)), true);
});

test('a maximum-tier Spaceport is rejected before consuming resources or a building slot', () => {
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '' }]);
            return;
        }
        if (/^SELECT owner, type FROM map1/.test(sql)) {
            callback(null, [{ owner: 7, type: 10 }]);
            return;
        }
        if (/^SELECT id, level FROM buildings1 WHERE sectorid = \? AND type = \? LIMIT 1/.test(sql)) {
            assert.deepEqual(params, [4, 3]);
            callback(null, [{ id: 91, level: 4 }]);
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyBuilding('//buybuilding:3:4', connection);

    assert.deepEqual(connection.sent, ['Error: This Spaceport is already at maximum level']);
    assert.equal(queries.some(query => /^UPDATE players1/.test(query.sql)), false);
    assert.equal(queries.some(query => /^SELECT COUNT/.test(query.sql)), false);
});

test('Spaceport upgrades require research and persist the next local tier', () => {
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech FROM players1/.test(sql)) return callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '19:1' }]);
        if (/^SELECT owner, type FROM map1/.test(sql)) return callback(null, [{ owner: 7, type: 10 }]);
        if (/^SELECT id, level FROM buildings1/.test(sql)) return callback(null, [{ id: 91, level: 1 }]);
        if (/^UPDATE players1 SET metal = metal -/.test(sql)) return callback(null, { affectedRows: 1 });
        if (/^UPDATE buildings1 SET level =/.test(sql)) return callback(null, { affectedRows: 1 });
        if (/^SELECT metal, crystal, research FROM players1/.test(sql)) return callback(null, [{ metal: 9649, crystal: 9899, research: 0 }]);
        if (/^SELECT \* FROM map1/.test(sql)) return callback(null, []);
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyBuilding('//buybuilding:3:4', connection);

    assert.ok(connection.sent.includes('Success: Upgraded Spaceport to level 2 in sector 4'));
    assert.ok(queries.some(query => /^UPDATE buildings1 SET level =/.test(query.sql) && Number(query.params[0]) === 2));
});

test('exhausted local production refunds the ship spend and creates no hull', async () => {
    let refunded = false;
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech, race_id FROM players1/.test(sql)) return callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '', race_id: 1 }]);
        if (/^SELECT b\.id, b\.level/.test(sql)) return callback(null, [{ id: 2, level: 1, production_turn: 1, production_used: 12 }]);
        if (/^UPDATE players1\s+SET metal = metal -/s.test(sql)) return callback(null, { affectedRows: 1 });
        if (/^UPDATE buildings1 SET production_turn/.test(sql)) return callback(null, { affectedRows: 0 });
        if (/^UPDATE buildings1 SET production_used = production_used \+/.test(sql)) return callback(null, { affectedRows: 0 });
        if (/^UPDATE players1 SET metal = metal \+/.test(sql)) {
            refunded = true;
            return callback(null, { affectedRows: 1 });
        }
        if (/^SELECT metal, crystal, research FROM players1/.test(sql)) return callback(null, [{ metal: 9999, crystal: 9999, research: 0 }]);
        assert.fail(`unexpected query: ${sql}`);
    });
    server.gameState.turns[1] = 1;
    const connection = makeConnection();

    server.buyShip('//buyship:1:4', connection);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(refunded, true);
    assert.equal(queries.some(query => /^INSERT INTO ships1/.test(query.sql)), false);
    assert.ok(connection.sent.some(message => /lacks 3 production capacity/.test(message)));
});

test('move option requests return an explicit empty direct-route plan when no ships exist', async () => {
    setScriptedDb((sql, params, callback) => {
        if (/^SELECT owner FROM map1/.test(sql)) {
            callback(null, [{ owner: null }]);
            return;
        }
        if (/^SELECT sectorid, type, COUNT\(\*\) as count FROM ships1/.test(sql)) {
            callback(null, []);
            return;
        }
        if (/^SELECT sectorid FROM explored_sectors1/.test(sql)) {
            callback(null, []);
            return;
        }
        if (/^SELECT \* FROM map1/.test(sql)) {
            callback(null, []);
            return;
        }
        if (/^SELECT sectorid, type FROM buildings1/.test(sql)) {
            callback(null, []);
            return;
        }
        if (/^SELECT tech FROM players1/.test(sql)) {
            callback(null, [{ tech: '' }]);
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.requestMoveOptions('//moveoptions:f', connection);

    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(connection.sent, ['mmoptionsv2::{"target":15,"sources":[]}']);
});

test('simultaneous building orders are serialized before the slot count', () => {
    let firstPlayerQuery;
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech FROM players1/.test(sql)) {
            firstPlayerQuery = callback;
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const first = makeConnection();
    const second = makeConnection();

    server.buyBuilding('//buybuilding:0', first);
    server.buyBuilding('//buybuilding:1', second);

    assert.deepEqual(second.sent, ['Error: Another construction order is still processing']);
    assert.equal(queries.length, 1);

    firstPlayerQuery(new Error('test cleanup'), []);
    assert.deepEqual(first.sent, ['Error: Could not get player data']);
});

test('research uses optimistic state so the same level cannot be bought twice', () => {
    const technology = tech.TECHNOLOGIES.METAL_EXTRACTION;
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT research, tech, race_id FROM players1/.test(sql)) {
            callback(null, [{ research: 9999, tech: '', race_id: 1 }]);
            return;
        }
        if (/^UPDATE players1\s+SET research = research -/s.test(sql)) {
            assert.match(sql, /AND research >= \? AND tech = \?/);
            callback(null, { affectedRows: 0 });
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyTech(`//buytech:${technology.id}`, connection);

    assert.deepEqual(connection.sent, ['Error: Resources or technology changed; refresh and try again']);
    assert.equal(queries.filter(query => /^UPDATE players1/.test(query.sql)).length, 1);
});

test('losing a simultaneous colonization claim preserves the colony ship', () => {
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT currentsector, tech FROM players1/.test(sql)) {
            callback(null, [{ currentsector: 5, tech: '' }]);
            return;
        }
        if (/^SELECT id FROM ships1/.test(sql)) {
            callback(null, [{ id: 42 }]);
            return;
        }
        if (/^SELECT type, owner, terraformlvl FROM map1/.test(sql)) {
            callback(null, [{ type: 6, owner: null, terraformlvl: 0 }]);
            return;
        }
        if (/^UPDATE map1 SET owner = \? WHERE sectorid = \? AND owner IS NULL/.test(sql)) {
            callback(null, { affectedRows: 0 });
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.colonizePlanet(connection, '//colonize:5');

    assert.deepEqual(connection.sent, ['Error: Sector was colonized by another player']);
    assert.equal(queries.some(query => /^DELETE FROM ships1/.test(query.sql)), false);
});

test('failed ship insertion refunds the guarded resource spend', async () => {
    let spendCompleted = false;
    let refundCompleted = false;
    setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech, race_id FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '', race_id: 1 }]);
            return;
        }
        if (/^SELECT b\.id, b\.level/.test(sql)) {
            callback(null, [{ id: 2, level: 1, production_turn: 0, production_used: 0 }]);
            return;
        }
        if (/^UPDATE players1\s+SET metal = metal -/s.test(sql)) {
            spendCompleted = true;
            callback(null, { affectedRows: 1 });
            return;
        }
        if (/^UPDATE buildings1 SET production_turn/.test(sql)) {
            callback(null, { affectedRows: 1 });
            return;
        }
        if (/^UPDATE buildings1 SET production_used = production_used \+/.test(sql)) {
            callback(null, { affectedRows: 1 });
            return;
        }
        if (/^UPDATE buildings1 SET production_used = GREATEST/.test(sql)) {
            callback(null, { affectedRows: 1 });
            return;
        }
        if (/^INSERT INTO ships1/.test(sql)) {
            callback(new Error('insert failed'));
            return;
        }
        if (/^UPDATE players1 SET metal = metal \+/.test(sql)) {
            refundCompleted = true;
            callback(null, { affectedRows: 1 });
            return;
        }
        if (/^SELECT metal, crystal, research FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, research: 0 }]);
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyShip('//buyship:1', connection);
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(spendCompleted, true);
    assert.equal(refundCompleted, true);
    assert.ok(connection.sent.includes('Error: Failed to create ship; no resources or capacity were consumed'));
});
