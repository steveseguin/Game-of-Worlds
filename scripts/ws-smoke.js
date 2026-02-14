#!/usr/bin/env node
/**
 * ws-smoke.js
 *
 * Headless smoke that exercises the live server via HTTP + WebSocket:
 * - registers a random user
 * - opens WS, authenticates, creates a game, adds an AI, starts the game
 * - listens for start confirmation
 *
 * Usage:
 *   HOST=https://gameofworlds.com node scripts/ws-smoke.js
 *
 * Notes:
 * - This touches the live DB (creates a user + game). Use only on test/staging
 *   or be comfortable with temporary data in prod.
 */

const { client: WSClient } = require('websocket');
const { randomUUID } = require('crypto');
const url = require('url');

const HOST = process.env.HOST || 'https://gameofworlds.com';
const WS = HOST.replace(/^http/, 'ws');

async function main() {
    const user = `ws_smoke_${randomUUID().slice(0, 6)}`;
    const password = 'Smoke123';
    const email = `${user}@example.com`;

    console.log(`[ws-smoke] Registering user ${user} at ${HOST}`);
    const regRes = await fetch(`${HOST}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password, email })
    });
    const regBody = await regRes.json();
    if (!regBody.success) {
        throw new Error(`Registration failed: ${regBody.error || regRes.statusText}`);
    }
    const { userId, tempKey } = regBody;
    console.log(`[ws-smoke] Registered userId=${userId}`);

    await runWebSocketFlow(userId, tempKey);
}

async function runWebSocketFlow(userId, tempKey) {
    const ws = new WSClient();

    const parsed = url.parse(WS);
    const wsUrl = `${parsed.protocol}//${parsed.host}`;
    const cookies = `userId=${userId}; tempKey=${tempKey}`;

    console.log(`[ws-smoke] Connecting WS ${wsUrl} with cookies ${cookies}`);

    await new Promise((resolve, reject) => {
        let gameId = null;
        let gotStart = false;

        ws.on('connectFailed', err => reject(err));
        ws.on('connect', connection => {
            connection.on('error', err => reject(err));
            connection.on('close', () => {
                if (!gotStart) reject(new Error('WS closed before startgame::'));
            });
            connection.on('message', message => {
                if (message.type !== 'utf8') return;
                const data = message.utf8Data;
                console.log('[ws-smoke] recv:', data);
                if (data.startsWith('joingame::success::')) {
                    try {
                        const payload = JSON.parse(data.substring('joingame::success::'.length));
                        gameId = payload.gameId;
                    } catch (e) {}
                }
                if (data === 'startgame::') {
                    gotStart = true;
                    resolve();
                    connection.close();
                }
            });

            connection.sendUTF(`//auth:${userId}:${tempKey}`);
            connection.sendUTF(`//creategame:WS%20Smoke:${2}`);
            // Add AI with defaults
            connection.sendUTF('//addai:medium:balanced');
            // Creator already has a race; just start
            setTimeout(() => connection.sendUTF('//start'), 1000);
        });

        ws.connect(wsUrl, null, null, { Cookie: cookies });
    });

    console.log('[ws-smoke] startgame:: received; smoke passed');
}

main().catch(err => {
    console.error('[ws-smoke] FAILED', err);
    process.exit(1);
});
