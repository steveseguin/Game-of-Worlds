#!/usr/bin/env node
/**
 * Integration smoke for the HTTP/WebSocket entry point.
 *
 * Default mode starts server/index.js with USE_MOCK_DB=1 so this command is
 * useful on developer machines and in CI without a local MySQL daemon.
 *
 * Set TEST_REAL_DB=1 to verify the configured MySQL database connection only.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql2 = require('mysql2');

const REPO_ROOT = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.INTEGRATION_PORT) || (4300 + Math.floor(Math.random() * 1000));
const BASE_URL = `http://${HOST}:${PORT}`;

function isTruthy(value) {
    return /^(true|1|yes)$/i.test(String(value || '').trim());
}

function request(pathname) {
    return new Promise((resolve, reject) => {
        const req = http.get(`${BASE_URL}${pathname}`, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk;
            });
            response.on('end', () => {
                resolve({
                    statusCode: response.statusCode,
                    headers: response.headers,
                    body
                });
            });
        });
        req.on('error', reject);
        req.setTimeout(2500, () => {
            req.destroy(new Error(`Timed out requesting ${pathname}`));
        });
    });
}

async function waitForServer(child) {
    const deadline = Date.now() + 30000;
    let lastError = null;

    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Server exited early with code ${child.exitCode}`);
        }

        try {
            const response = await request('/login.html');
            if (response.statusCode === 200) {
                return response;
            }
            lastError = new Error(`Expected /login.html 200, got ${response.statusCode}`);
        } catch (error) {
            lastError = error;
        }

        await new Promise(resolve => setTimeout(resolve, 300));
    }

    throw lastError || new Error('Server did not become ready');
}

function runRealDbCheck() {
    const connection = mysql2.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'game'
    });

    connection.connect(err => {
        if (err) {
            console.error('Database connection failed:', err.message);
            process.exit(1);
        }

        connection.query('SHOW TABLES', (queryErr, rows) => {
            connection.end();
            if (queryErr) {
                console.error('Unable to list database tables:', queryErr.message);
                process.exit(1);
            }
            console.log(`Database connection OK. Tables found: ${rows.length}`);
        });
    });
}

async function runMockServerSmoke() {
    const child = spawn(process.execPath, ['server/index.js'], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            PORT: String(PORT),
            HOST,
            USE_MOCK_DB: '1',
            NODE_ENV: 'test',
            ENABLE_TEST_GAME_MODE: '1',
            STRIPE_SECRET_KEY: '',
            STRIPE_PUBLISHABLE_KEY: '',
            STRIPE_WEBHOOK_SECRET: ''
        }
    });

    let logs = '';
    child.stdout.on('data', chunk => {
        logs += chunk.toString();
    });
    child.stderr.on('data', chunk => {
        logs += chunk.toString();
    });

    try {
        const login = await waitForServer(child);
        assert.equal(login.statusCode, 200);
        assert.match(login.body, /Continue as Guest|Login/i);

        const root = await request('/');
        assert.equal(root.statusCode, 200);
        assert.match(root.body, /Game of Worlds|Game of Words/i);

        const health = await request('/health');
        assert.equal(health.statusCode, 200);
        const healthBody = JSON.parse(health.body);
        assert.equal(healthBody.service, 'game-of-worlds');
        assert.equal(healthBody.status, 'ok');
        assert.equal(healthBody.database.status, 'mock');
        assert.ok(Number.isInteger(healthBody.uptimeSeconds));

        const status = await request('/status');
        assert.equal(status.statusCode, 200);
        const statusBody = JSON.parse(status.body);
        assert.equal(statusBody.service, 'game-of-worlds');

        const index = await request('/index.html');
        assert.equal(index.statusCode, 302);
        assert.equal(index.headers.location, '/landing.html');

        const protectedLobby = await request('/lobby.html');
        assert.equal(protectedLobby.statusCode, 302);
        assert.equal(protectedLobby.headers.location, '/login.html');

        console.log(`Mock integration smoke passed at ${BASE_URL}`);
    } catch (error) {
        console.error(logs.trim());
        throw error;
    } finally {
        child.kill();
    }
}

if (isTruthy(process.env.TEST_REAL_DB)) {
    runRealDbCheck();
} else {
    runMockServerSmoke().catch(error => {
        console.error('Integration smoke failed:', error.message);
        process.exit(1);
    });
}
