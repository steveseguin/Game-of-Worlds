const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validateEnvironment,
    REQUIRED_ENV_VARS
} = require('../server/config/env-validator');

function snapshotEnv() {
    return { ...process.env };
}

function restoreEnv(snapshot) {
    for (const key of Object.keys(process.env)) {
        if (!(key in snapshot)) {
            delete process.env[key];
        }
    }
    for (const [key, value] of Object.entries(snapshot)) {
        process.env[key] = value;
    }
}

test('validateEnvironment applies defaults for optional variables', () => {
    const snapshot = snapshotEnv();

    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    process.env.NODE_ENV = 'development';
    process.env.SESSION_SECRET = 'a'.repeat(32);
    process.env.CSRF_SECRET = 'b'.repeat(32);

    const result = validateEnvironment();

    assert.equal(result.valid, true);
    assert.equal(
        process.env.DB_HOST,
        REQUIRED_ENV_VARS.DB_HOST.default,
        'DB_HOST should fall back to default'
    );
    assert.equal(
        process.env.DB_PORT,
        REQUIRED_ENV_VARS.DB_PORT.default,
        'DB_PORT should fall back to default'
    );

    restoreEnv(snapshot);
});

test('validateEnvironment generates development secrets when missing', () => {
    const snapshot = snapshotEnv();

    process.env.NODE_ENV = 'development';
    delete process.env.SESSION_SECRET;
    delete process.env.CSRF_SECRET;

    const result = validateEnvironment();

    assert.equal(result.valid, true);
    assert.ok(
        process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32,
        'SESSION_SECRET should be generated automatically'
    );
    assert.ok(
        process.env.CSRF_SECRET && process.env.CSRF_SECRET.length >= 32,
        'CSRF_SECRET should be generated automatically'
    );
    assert.ok(
        result.warnings.some(warning => warning.includes('SESSION_SECRET')),
        'Warning should mention generated SESSION_SECRET'
    );

    restoreEnv(snapshot);
});

test('validateEnvironment fails production builds with missing secrets', () => {
    const snapshot = snapshotEnv();

    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    delete process.env.CSRF_SECRET;
    delete process.env.DB_PASSWORD;

    const result = validateEnvironment();

    assert.equal(result.valid, false);
    assert.ok(
        result.errors.some(error => error.includes('SESSION_SECRET')),
        'Errors should include missing SESSION_SECRET'
    );
    assert.ok(
        result.errors.some(error => error.includes('CSRF_SECRET')),
        'Errors should include missing CSRF_SECRET'
    );
    assert.ok(
        result.errors.some(error => error.includes('DB_PASSWORD')),
        'Errors should include missing DB_PASSWORD'
    );

    restoreEnv(snapshot);
});
