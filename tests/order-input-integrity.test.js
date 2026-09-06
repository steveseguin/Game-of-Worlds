const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server/server');

function connection() {
    return { name: 7, gameid: 1, sent: [], sendUTF(message) { this.sent.push(message); } };
}

for (const [name, invoke, validId] of [
    ['ship', (s, c) => server.buyShip(s, c), '//buyship:1'],
    ['building', (s, c) => server.buyBuilding(s, c), '//buybuilding:0'],
    ['colony', (s, c) => server.colonizePlanet(c, s), '//colonize']
]) {
    test(`${name} rejects malformed explicit sectors without falling back to the cursor`, () => {
        server.setDatabase({ isMock: true, query() { assert.fail('invalid order accessed database'); } });
        for (const token of ['', '0', 'xyz', '1zz', '-1', 'ffffffffffffffff', '1:2']) {
            const c = connection();
            invoke(`${validId}:${token}`, c);
            assert.match(c.sent[0], /^Error: Invalid/);
        }
    });
}
for (const [name, invoke, prefix] of [
    ['ship', server.buyShip, '//buyship:'],
    ['building', server.buyBuilding, '//buybuilding:'],
    ['research', server.buyTech, '//buytech:']
]) {
    test(`${name} rejects partial decimal IDs before spending`, () => {
        server.setDatabase({ isMock: true, query() { assert.fail('invalid order accessed database'); } });
        for (const id of ['1junk', '1.5', '1e2', '0x1', '+1', ' 1']) {
            const c = connection();
            invoke(prefix + id, c);
            assert.match(c.sent[0], /^Error: Invalid/);
        }
    });
}

test('standing order patches preserve omitted settings, including a zero scout target', () => {
    server.gameState.activeGames[91] = { mode: 'quick', standingOrders: {} };
    server.setStandingOrders(91, 7, { autoRebuild: true, autoScout: true, targetScouts: 0 });
    const result = server.setStandingOrders(91, 7, { autoRebuild: false });
    assert.equal(result.autoScout, true);
    assert.equal(result.targetScouts, 0);
});

test('invalid standing orders do not enable automation or overwrite saved choices', () => {
    server.gameState.activeGames[92] = { mode: 'quick', standingOrders: {} };
    const saved = server.setStandingOrders(92, 7, { autoRebuild: false, autoScout: false, targetScouts: 2 });
    for (const input of [null, [], true, 'false', { autoScout: 'false' }, { autoRebuild: 1 },
        { targetScouts: 1.5 }, { targetScouts: -1 }, { targetScouts: 7 }]) {
        assert.throws(() => server.setStandingOrders(92, 7, input));
        assert.deepEqual(server.getStandingOrders(92, 7), saved);
    }
});
