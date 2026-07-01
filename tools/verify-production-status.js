#!/usr/bin/env node
/**
 * Verify a deployed Game of Words server from the public status endpoints.
 *
 * Usage:
 *   node tools/verify-production-status.js
 *   node tools/verify-production-status.js https://gameofworlds.com
 *
 * Optional environment:
 *   EXPECTED_COMMIT=<full sha>  Require /status deploy.commit to match.
 */

const fs = require('fs');

const DEFAULT_BASE_URL = 'https://gameofworlds.com';
const baseUrl = normalizeBaseUrl(process.argv[2] || process.env.PRODUCTION_BASE_URL || DEFAULT_BASE_URL);
const expectedCommit = process.env.EXPECTED_COMMIT || '';

function normalizeBaseUrl(value) {
    return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function actionEscape(value) {
    return String(value)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
}

function emitActionError(message) {
    if (process.env.GITHUB_ACTIONS === 'true') {
        console.error(`::error::${actionEscape(message)}`);
    }
}

function appendActionSummary(markdown) {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        return;
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown.trimEnd()}\n\n`);
}

async function fetchJson(pathname) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(`${baseUrl}${pathname}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });
        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch (error) {
            throw new Error(`${pathname} returned non-JSON body: ${text.slice(0, 200)}`);
        }
        if (!response.ok) {
            throw new Error(`${pathname} returned HTTP ${response.status}: ${text.slice(0, 200)}`);
        }
        return body;
    } finally {
        clearTimeout(timeout);
    }
}

function assertStatusPayload(name, payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error(`${name} did not return a JSON object`);
    }
    if (payload.service !== 'game-of-worlds') {
        throw new Error(`${name} service mismatch: ${payload.service}`);
    }
    if (payload.ok !== true || payload.status !== 'ok') {
        throw new Error(`${name} is not healthy: ok=${payload.ok} status=${payload.status}`);
    }
    if (!payload.database || payload.database.status === 'offline') {
        throw new Error(`${name} database is offline`);
    }
}

function assertDeployPayload(status) {
    if (!status.deploy || typeof status.deploy !== 'object') {
        throw new Error('/status did not include deploy metadata');
    }
    if (status.deploy.dirty !== false) {
        throw new Error(`/status deploy metadata reports dirty=${status.deploy.dirty}`);
    }
    if (expectedCommit && status.deploy.commit !== expectedCommit) {
        throw new Error(`deployed commit mismatch: expected ${expectedCommit}, got ${status.deploy.commit || '(missing)'}`);
    }
}

function formatSummary(status) {
    return [
        '## Production status',
        '',
        `- Service: ${status.service}`,
        `- Runtime status: ${status.status}`,
        `- Database: ${status.database && status.database.status}`,
        `- Commit: \`${status.deploy && status.deploy.shortCommit}\``,
        `- Source: ${status.deploy && status.deploy.source}`,
        `- Workflow run: ${status.deploy && status.deploy.runId ? status.deploy.runId : '(none)'}`,
        `- Dirty checkout: ${status.deploy && status.deploy.dirty}`
    ].join('\n');
}

async function main() {
    const [health, status] = await Promise.all([
        fetchJson('/health'),
        fetchJson('/status')
    ]);

    assertStatusPayload('/health', health);
    assertStatusPayload('/status', status);
    assertDeployPayload(status);

    const summary = formatSummary(status);
    console.log(summary);
    appendActionSummary(summary);
}

main().catch(error => {
    emitActionError(error.message);
    appendActionSummary(`## Production status failed\n\n\`\`\`text\n${error.message}\n\`\`\``);
    console.error(`Production verification failed: ${error.message}`);
    process.exit(1);
});
