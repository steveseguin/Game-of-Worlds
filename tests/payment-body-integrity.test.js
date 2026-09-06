const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const PaymentEndpoints = require('../server/lib/payment-endpoints');

async function execute(endpoints, method, chunks, headers = {}) {
    const request = new EventEmitter();
    request.headers = headers;
    let status;
    let payload;
    const done = endpoints[method](request, {
        writeHead(code) { status = code; },
        end(body) { payload = JSON.parse(body); }
    });
    chunks.forEach(chunk => request.emit('data', chunk));
    request.emit('end');
    await done;
    return { status, payload };
}

test('payment JSON endpoints reject non-object bodies as client errors', async () => {
    const endpoints = new PaymentEndpoints({}, { query() { assert.fail('invalid body queried database'); } });
    for (const method of ['handleCreateIntent', 'handleCreateSubscription', 'handleConfirmTestPayment', 'handleSpendCrystals']) {
        for (const body of ['null', '[]', 'true', '42', '"text"']) {
            const result = await execute(endpoints, method, [Buffer.from(body)]);
            assert.equal(result.status, 400);
            assert.equal(result.payload.code, 'INVALID_JSON');
        }
    }
});

test('webhook verification receives the exact original bytes across UTF-8 chunk boundaries', async () => {
    const body = Buffer.from('{"description":"caf\u00e9 \u{1f680}"}');
    const split = body.indexOf(Buffer.from('\u00e9')) + 1;
    let received;
    const endpoints = new PaymentEndpoints({ async handleWebhook(raw, signature) {
        assert.equal(signature, 'local-test-signature');
        received = raw;
    } }, {});
    const result = await execute(endpoints, 'handleWebhook', [body.subarray(0, split), body.subarray(split)], {
        'stripe-signature': 'local-test-signature'
    });
    assert.equal(result.status, 200);
    assert.deepEqual(Buffer.from(received), body);
});


for (const [message, expected] of [['database unavailable', 500], ['Invalid webhook signature', 400]]) {
    test(`webhooks do not acknowledge failed processing: ${message}`, async () => {
        const endpoints = new PaymentEndpoints({ async handleWebhook() { throw new Error(message); } }, {});
        const result = await execute(endpoints, 'handleWebhook', [Buffer.from('{}')], { 'stripe-signature': 'local-only' });
        assert.equal(result.status, expected);
        assert.equal(result.payload.received, false);
        if (expected === 500) assert.equal(result.payload.error, 'Webhook processing failed');
    });
}
