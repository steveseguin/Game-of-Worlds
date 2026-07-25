// Taking money you cannot deliver against is the one payment bug with no recovery path:
// Stripe has the charge, the player has nothing, and no retry ever fires because the
// server never learned the payment happened.
//
// The shape of it in this codebase: grantPurchase() is what actually hands a player what
// they bought, and it is called from exactly one place — handlePaymentSuccess. That in turn
// has exactly two callers: the Stripe webhook, and confirmTestPayment (test keys only).
// So with a LIVE key and no STRIPE_WEBHOOK_SECRET there is no delivery path at all:
// constructEvent() throws on every webhook, and confirmTestPayment refuses a live key.
// Startup only *warned* about this, and a warning does not stop a charge.
//
// These tests pin both halves: the reachability claim the fix rests on, and the guard.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { paymentsAreUndeliverable } = require('../server/lib/payments');
const paymentsSrc = fs.readFileSync(
    path.join(__dirname, '..', 'server', 'lib', 'payments.js'), 'utf8');

/** Body of a method on the PaymentManager class, by name. */
function methodBody(name) {
    const start = paymentsSrc.indexOf(`\n    async ${name}(`);
    assert.ok(start !== -1, `could not find method ${name} in payments.js`);
    // Methods are indented four spaces; the next line at that indent ends the body.
    const rest = paymentsSrc.slice(start + 1);
    const end = rest.search(/\n {4}\}/);
    return rest.slice(0, end);
}

test('a purchase is delivered from the webhook and the test-confirm path, and nowhere else', () => {
    // If someone adds a third caller, this fix stops covering the whole surface and the
    // reasoning above needs redoing — so fail loudly rather than quietly under-protect.
    const grantCallers = [...paymentsSrc.matchAll(/this\.grantPurchase\(/g)];
    assert.equal(grantCallers.length, 1,
        `grantPurchase should have exactly one call site; found ${grantCallers.length}`);
    assert.match(methodBody('handlePaymentSuccess'), /this\.grantPurchase\(/,
        'the one grantPurchase call should live in handlePaymentSuccess');

    const successCallers = [...paymentsSrc.matchAll(/this\.handlePaymentSuccess\(/g)];
    assert.equal(successCallers.length, 2,
        `handlePaymentSuccess should have exactly two call sites; found ${successCallers.length}`);
    assert.match(methodBody('handleWebhook'), /this\.handlePaymentSuccess\(/,
        'the webhook should be one of the two delivery paths');
    assert.match(methodBody('confirmTestPayment'), /this\.handlePaymentSuccess\(/,
        'confirmTestPayment should be the other delivery path');
});

test('the webhook cannot deliver anything without the signing secret', () => {
    // constructEvent is given the secret directly, and handleWebhook throws before the
    // switch when it rejects. Nothing downstream runs, so nothing is granted.
    const body = methodBody('handleWebhook');
    assert.match(body, /constructEvent\(/, 'handleWebhook should verify the signature');
    assert.match(body, /STRIPE_WEBHOOK_SECRET/, 'verification should use the signing secret');
    assert.match(body, /throw new Error\('Invalid webhook signature'\)/,
        'a failed verification should throw rather than fall through to delivery');
});

test('a live key with no webhook secret is treated as undeliverable', () => {
    assert.equal(paymentsAreUndeliverable({
        STRIPE_SECRET_KEY: 'sk_live_abc123'
    }), true, 'live key with no webhook secret has no delivery path');
});

test('configurations that CAN deliver are left alone', () => {
    const deliverable = [
        ['no Stripe at all', {}],
        ['test key, which settles via confirmTestPayment', { STRIPE_SECRET_KEY: 'sk_test_abc' }],
        ['test key without a webhook secret', { STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_WEBHOOK_SECRET: '' }],
        ['live key with a webhook secret', { STRIPE_SECRET_KEY: 'sk_live_abc', STRIPE_WEBHOOK_SECRET: 'whsec_x' }],
        // Deliberate operator escape hatch; if it is on, confirmTestPayment will run.
        ['live key with client confirmation explicitly allowed', {
            STRIPE_SECRET_KEY: 'sk_live_abc', ALLOW_STRIPE_TEST_CONFIRM: 'true'
        }]
    ];

    deliverable.forEach(([label, env]) => {
        assert.equal(paymentsAreUndeliverable(env), false,
            `payments should stay enabled: ${label}`);
    });
});

test('the escape hatch is read the same way the code that honours it reads it', () => {
    // isTestConfirmationAllowed accepts true/1/yes case-insensitively. If the guard were
    // stricter it would disable a shop that confirmTestPayment would have happily served.
    ['true', 'TRUE', '1', 'yes', 'Yes', ' true '].forEach(value => {
        assert.equal(paymentsAreUndeliverable({
            STRIPE_SECRET_KEY: 'sk_live_abc', ALLOW_STRIPE_TEST_CONFIRM: value
        }), false, `ALLOW_STRIPE_TEST_CONFIRM=${JSON.stringify(value)} should keep payments on`);
    });

    // ...and anything that is not an affirmative must not be read as one.
    ['', 'false', 'no', '0', 'maybe'].forEach(value => {
        assert.equal(paymentsAreUndeliverable({
            STRIPE_SECRET_KEY: 'sk_live_abc', ALLOW_STRIPE_TEST_CONFIRM: value
        }), true, `ALLOW_STRIPE_TEST_CONFIRM=${JSON.stringify(value)} should not enable delivery`);
    });
});

test('startup tells the operator the shop is off, not merely that verification is broken', () => {
    const validator = fs.readFileSync(
        path.join(__dirname, '..', 'server', 'config', 'env-validator.js'), 'utf8');
    assert.match(validator, /sk_live_/,
        'the warning should distinguish a live key from a test key');
    assert.match(validator, /never delivered/,
        'the live-key warning should name the actual consequence');
    assert.match(validator, /DISABLED/,
        'the live-key warning should say the shop is disabled, since that is what happens');
});
