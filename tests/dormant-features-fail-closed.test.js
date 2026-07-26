const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
    DIPLOMATIC_STATES,
    TREATY_TYPES,
    SUPPORTED_TREATY_TYPE_IDS,
    DiplomacyManager
} = require('../server/lib/diplomacy');
const { CRYSTAL_SHOP } = require('../server/lib/payments');

const root = path.join(__dirname, '..');

test('only the enforceable treaty can be proposed', async () => {
    const queries = [];
    const db = {
        query(sql, params, callback) {
            queries.push({ sql, params });
            callback(null, { insertId: 17 });
        }
    };
    const manager = new DiplomacyManager(4, db);

    await assert.rejects(
        manager.proposeTreaty(1, 2, 'TRADE'),
        /not implemented/
    );
    assert.equal(queries.length, 0, 'unsupported treaties must fail before persistence');

    assert.equal(
        await manager.proposeTreaty(1, 2, 'NON_AGGRESSION'),
        17
    );
    assert.equal(queries.length, 1);
    assert.deepEqual([...SUPPORTED_TREATY_TYPE_IDS], [TREATY_TYPES.NON_AGGRESSION.id]);
});

test('active non-aggression uses the requested turn and prevents attack', async () => {
    const manager = new DiplomacyManager(4, {});
    let queriedTurn = null;
    manager.getDiplomaticState = async () => ({
        state: DIPLOMATIC_STATES.NEUTRAL,
        reputation: 0
    });
    manager.getActiveTreaties = async (_player, currentTurn) => {
        queriedTurn = currentTurn;
        return [{
            player1: 1,
            player2: 2,
            type: TREATY_TYPES.NON_AGGRESSION.id
        }];
    };

    assert.equal(await manager.canAttack(1, 2, 23), false);
    assert.equal(queriedTurn, 23, 'treaty expiry checks must use the live turn');
});

test('an unsupported stored treaty cannot be activated successfully', async () => {
    const queries = [];
    const db = {
        query(sql, params, callback) {
            queries.push(sql);
            callback(null, [{
                id: 9,
                type: String(TREATY_TYPES.RESEARCH.id),
                player1: 1,
                player2: 2
            }]);
        }
    };
    const manager = new DiplomacyManager(4, db);

    await assert.rejects(manager.acceptTreaty(9, 12), /not implemented/);
    assert.equal(queries.length, 1, 'unsupported treaty must not be marked active');
});

test('a supported stored treaty activates even when MySQL returns its type as text', async () => {
    const queries = [];
    const db = {
        query(sql, params, callback) {
            queries.push({ sql, params });
            if (/SELECT \*/.test(sql)) {
                callback(null, [{
                    id: 10,
                    type: String(TREATY_TYPES.NON_AGGRESSION.id),
                    player1: 1,
                    player2: 2
                }]);
                return;
            }
            callback(null, { affectedRows: 1 });
        }
    };
    const manager = new DiplomacyManager(4, db);

    await manager.acceptTreaty(10, 12);
    assert.equal(queries.length, 2);
    assert.deepEqual(queries[1].params, [12, 22, 10]);
});

test('disabled crystal purchases do not advertise fake permanent upgrades', () => {
    assert.equal(
        Object.values(CRYSTAL_SHOP).some(item => item.type === 'permanent'),
        false
    );

    const payments = fs.readFileSync(path.join(root, 'server', 'lib', 'payments.js'), 'utf8');
    assert.doesNotMatch(payments, /grantPermanentUpgrade|crystal_fleet_slot/);
});

test('crystal shop concepts render as unavailable instead of clickable purchases', () => {
    const shop = fs.readFileSync(path.join(root, 'public', 'js', 'shop-enhanced.js'), 'utf8');
    const start = shop.indexOf('function generateCrystalShopItems()');
    const end = shop.indexOf('// Setup card element', start);
    const body = shop.slice(start, end);

    assert.ok(start >= 0 && end > start, 'crystal shop renderer must exist');
    assert.match(body, /aria-disabled="true"/);
    assert.match(body, /Coming soon/);
    assert.doesNotMatch(body, /onclick=/);
});
