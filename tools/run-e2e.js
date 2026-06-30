#!/usr/bin/env node
/**
 * Run Playwright against a local mock server and always clean it up.
 *
 * Playwright's built-in webServer management can leave node server processes
 * hanging on Windows. This wrapper keeps local contributor runs predictable.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HOST = process.env.E2E_HOST || '127.0.0.1';
const PORT = process.env.E2E_PORT || '4173';
const READY_URL = `http://${HOST}:${PORT}/login.html`;
const SERVER_LOG_LINES = 160;
const TEMP_DIR = path.join(REPO, '.codex-tmp', 'playwright');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function probe(url) {
    return new Promise(resolve => {
        let settled = false;
        const finish = ok => {
            if (!settled) {
                settled = true;
                resolve(ok);
            }
        };

        const request = http.get(url, response => {
            response.resume();
            finish(response.statusCode >= 200 && response.statusCode < 500);
        });

        request.setTimeout(2000, () => {
            request.destroy();
            finish(false);
        });
        request.on('error', () => finish(false));
    });
}

async function waitForServer(child, url, timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`E2E server exited early with code ${child.exitCode}`);
        }
        if (await probe(url)) {
            return;
        }
        await sleep(500);
    }
    throw new Error(`Timed out waiting for E2E server at ${url}`);
}

function captureServerLogs(child) {
    const lines = [];
    const append = data => {
        const text = data.toString();
        for (const line of text.split(/\r?\n/)) {
            if (line.trim()) {
                lines.push(line);
                if (lines.length > SERVER_LOG_LINES) {
                    lines.shift();
                }
            }
        }
        if (process.env.E2E_SERVER_LOGS) {
            process.stderr.write(text);
        }
    };

    child.stdout.on('data', append);
    child.stderr.on('data', append);
    return lines;
}

function stopServer(child) {
    if (!child || child.exitCode !== null || child.killed) {
        return Promise.resolve();
    }

    return new Promise(resolve => {
        let settled = false;
        const done = () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };

        child.once('exit', done);
        child.kill('SIGTERM');
        setTimeout(() => {
            if (child.exitCode === null) {
                child.kill('SIGKILL');
            }
            done();
        }, 2500).unref();
    });
}

function hasReporterArg(args) {
    return args.some(arg => arg === '--reporter' || arg.startsWith('--reporter='));
}

async function main() {
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    const serverEnv = {
        ...process.env,
        TEMP: TEMP_DIR,
        TMP: TEMP_DIR,
        PORT,
        HOST,
        USE_MOCK_DB: '1',
        NODE_ENV: 'test',
        ENABLE_TEST_GAME_MODE: '1',
        TEST_MAP_WIDTH: '8',
        TEST_MAP_HEIGHT: '5',
        TEST_RESOURCE_MULTIPLIER: '20',
        TURN_INTERVAL_TEST_MS: '30000',
        VICTORY_DOMINATION_PERCENT: '20',
        STRIPE_SECRET_KEY: '',
        STRIPE_PUBLISHABLE_KEY: '',
        STRIPE_WEBHOOK_SECRET: ''
    };

    const server = spawn(process.execPath, ['server/index.js'], {
        cwd: REPO,
        env: serverEnv,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const serverLogs = captureServerLogs(server);

    try {
        await waitForServer(server, READY_URL);

        const playwrightCli = path.join(REPO, 'node_modules', 'playwright', 'cli.js');
        const playwrightArgs = [playwrightCli, 'test', ...process.argv.slice(2)];
        if (!hasReporterArg(playwrightArgs)) {
            playwrightArgs.push('--reporter=list');
        }

        const test = spawn(process.execPath, playwrightArgs, {
            cwd: REPO,
            env: {
                ...process.env,
                TEMP: TEMP_DIR,
                TMP: TEMP_DIR,
                E2E_SKIP_WEBSERVER: '1',
                E2E_HOST: HOST,
                E2E_PORT: PORT
            },
            stdio: 'inherit'
        });

        const code = await new Promise(resolve => {
            test.on('exit', exitCode => resolve(exitCode === null ? 1 : exitCode));
            test.on('error', error => {
                console.error(error.message || error);
                resolve(1);
            });
        });

        await stopServer(server);
        process.exit(code);
    } catch (error) {
        console.error(error.message || error);
        if (serverLogs.length > 0) {
            console.error('\nLast E2E server log lines:');
            console.error(serverLogs.join('\n'));
        }
        await stopServer(server);
        process.exit(1);
    }
}

main();
