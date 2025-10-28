const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.SESSION_SECRET =
    process.env.SESSION_SECRET || 'test-session-secret-1234567890abcdef1234567890abcd';

const security = require('../server/lib/security');

test('validateUsername accepts and rejects expected handles', () => {
    assert.deepEqual(security.validateUsername('Commander_42'), { valid: true });

    const invalid = security.validateUsername('Bad Name!');
    assert.equal(invalid.valid, false);
    assert.match(invalid.error, /letters/i);
});

test('validatePassword enforces strength requirements', () => {
    const weak = security.validatePassword('short1');
    assert.equal(weak.valid, false);
    assert.match(weak.error, /at least 8/i);

    const strong = security.validatePassword('FleetDeck42');
    assert.deepEqual(strong, { valid: true });
});

test('validateEmail reports missing or malformed addresses', () => {
    const missing = security.validateEmail('');
    assert.equal(missing.valid, false);
    assert.match(missing.error, /required/i);

    const malformed = security.validateEmail('captain@@fleet');
    assert.equal(malformed.valid, false);
    assert.match(malformed.error, /invalid/i);

    assert.deepEqual(security.validateEmail('commander@example.com'), { valid: true });
});

test('session tokens are signed and verified correctly', () => {
    const token = security.generateSessionToken(99);

    assert.equal(typeof token.full, 'string');
    assert.ok(token.full.includes(':'));
    assert.ok(security.verifySessionToken(token.full, 99));

    const parts = token.full.split(':');
    parts[2] = 'deadbeef';
    assert.equal(security.verifySessionToken(parts.join(':'), 99), false);
});

test('expired session tokens are rejected', () => {
    const manualToken = 'manual-token';
    const pastExpiry = Date.now() - 1000;
    const signature = crypto
        .createHmac('sha256', process.env.SESSION_SECRET)
        .update(`${manualToken}:123:${pastExpiry}`)
        .digest('hex');
    const full = `${manualToken}:${pastExpiry}:${signature}`;

    assert.equal(security.verifySessionToken(full, 123), false);
});
