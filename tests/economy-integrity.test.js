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

test('ship purchase does not insert after a concurrent balance change', () => {
    const scout = Object.values(combat.SHIP_TYPES).find(ship => ship.id === 1);
    assert.ok(scout, 'expected scout ship definition');
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech, race_id FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '', race_id: 1 }]);
            return;
        }
        if (/^SELECT id FROM buildings1 b/.test(sql)) {
            callback(null, [{ id: 2 }]);
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

    assert.deepEqual(connection.sent, ['Error: Resources changed; refresh and try again']);
    assert.equal(queries.some(query => /^INSERT INTO ships1/.test(query.sql)), false);
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

test('ship purchase validates the explicit selected sector instead of the legacy cursor', () => {
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech, race_id FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '', race_id: 1 }]);
            return;
        }
        if (/^SELECT id FROM buildings1 b/.test(sql)) {
            assert.deepEqual(params, [7, 15]);
            callback(null, [{ id: 2 }]);
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

test('a second Spaceport is rejected before consuming resources or a building slot', () => {
    const queries = setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '' }]);
            return;
        }
        if (/^SELECT owner, type FROM map1/.test(sql)) {
            callback(null, [{ owner: 7, type: 10 }]);
            return;
        }
        if (/^SELECT id FROM buildings1 WHERE sectorid = \? AND type = \? LIMIT 1/.test(sql)) {
            assert.deepEqual(params, [4, 3]);
            callback(null, [{ id: 91 }]);
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.buyBuilding('//buybuilding:3:4', connection);

    assert.deepEqual(connection.sent, ['Error: This sector already has a Spaceport']);
    assert.equal(queries.some(query => /^UPDATE players1/.test(query.sql)), false);
    assert.equal(queries.some(query => /^SELECT COUNT/.test(query.sql)), false);
});

test('move option requests return an explicit empty result when no adjacent ships exist', () => {
    setScriptedDb((sql, params, callback) => {
        if (/^SELECT owner FROM map1/.test(sql)) {
            callback(null, [{ owner: null }]);
            return;
        }
        if (/^SELECT sectorid, type, COUNT\(\*\) as count FROM ships1/.test(sql)) {
            callback(null, []);
            return;
        }
        assert.fail(`unexpected query: ${sql}`);
    });
    const connection = makeConnection();

    server.requestMoveOptions('//moveoptions:f', connection);

    assert.deepEqual(connection.sent, ['mmoptions:F']);
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

test('failed ship insertion refunds the guarded resource spend', () => {
    let spendCompleted = false;
    let refundCompleted = false;
    setScriptedDb((sql, params, callback) => {
        if (/^SELECT metal, crystal, currentsector, tech, race_id FROM players1/.test(sql)) {
            callback(null, [{ metal: 9999, crystal: 9999, currentsector: 4, tech: '', race_id: 1 }]);
            return;
        }
        if (/^SELECT id FROM buildings1 b/.test(sql)) {
            callback(null, [{ id: 2 }]);
            return;
        }
        if (/^UPDATE players1\s+SET metal = metal -/s.test(sql)) {
            spendCompleted = true;
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

    assert.equal(spendCompleted, true);
    assert.equal(refundCompleted, true);
    assert.ok(connection.sent.includes('Error: Failed to create ship; resources refunded'));
});
