#!/usr/bin/env node
/**
 * tools/net-smoke.js — Network-level smoke test against a running server.
 *
 * Exercises the real HTTP endpoints and WebSocket routing in server/index.js:
 * register → authenticate → create/join game → add AI → start → act → end turn.
 *
 * Run: node tools/net-smoke.js [base-url]   (default http://localhost:3000)
 */

const BASE = process.argv[2] || process.env.E2E_BASE || 'http://localhost:3000';
const WS_URL = BASE.replace(/^http/, 'ws') + '/';
const VERBOSE = process.argv.includes('--verbose');

const issues = [];
let checks = 0;

function ok(label) { checks++; console.log(`  PASS  ${label}`); }
function fail(label, detail) { checks++; issues.push({ label, detail }); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
function check(cond, label, detail) { cond ? ok(label) : fail(label, detail); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function hex(n) { return Number(n).toString(16).toUpperCase(); }

async function api(path, body) {
    const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}

class Client {
    constructor(label) {
        this.label = label;
        this.messages = [];
    }
    async connect(userId, tempKey) {
        this.ws = new WebSocket(WS_URL);
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = () => reject(new Error('websocket failed to open'));
        });
        this.ws.onmessage = event => {
            const data = String(event.data);
            this.messages.push(data);
            if (VERBOSE) console.log(`    [${this.label}] << ${data.slice(0, 130)}`);
        };
        this.send(`//auth:${userId}:${tempKey}`);
    }
    send(message) {
        if (VERBOSE) console.log(`    [${this.label}] >> ${message}`);
        this.ws.send(message);
    }
    async waitFor(pred, desc = 'message', timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const match = this.messages.find(pred);
            if (match) return match;
            await sleep(30);
        }
        throw new Error(`[${this.label}] timed out waiting for ${desc}`);
    }
    drain() { this.messages.length = 0; }
    close() { try { this.ws.close(); } catch { /* ignore */ } }
}

async function main() {
    console.log(`=== Network smoke vs ${BASE} ===\n`);
    const suffix = String(Date.now()).slice(-6);

    const reg = await api('/register', { username: `smoke${suffix}`, password: 'Secure123', email: `smoke${suffix}@test.dev` });
    check(reg.status === 200 && reg.body && reg.body.success, 'HTTP register', JSON.stringify(reg.body).slice(0, 90));

    const login = await api('/login', { username: `smoke${suffix}`, password: 'Secure123' });
    check(login.status === 200 && login.body && login.body.tempKey, 'HTTP login returns tempKey');

    const player = new Client('p1');
    await player.connect(login.body.userId, login.body.tempKey);
    await player.waitFor(m => m.startsWith('lobby::') || m.startsWith('gamelist::'), 'lobby greeting');
    ok('WebSocket auth → lobby');

    player.send(`//creategame:Smoke%20${suffix}:2`);
    const created = await player.waitFor(m => m.startsWith('creategame::success::'), 'creategame');
    const gameId = Number(created.split('::')[2]);
    player.send(`//joingame:${gameId}:1`);
    await player.waitFor(m => m.startsWith('joingame::success::'), 'join');
    ok('create + join game');

    player.send('//addai:balanced:balanced');
    await player.waitFor(m => m.startsWith('addai::success::'), 'addai');
    ok('AI added');

    player.drain();
    player.send('//start');
    await player.waitFor(m => m === 'startgame::', 'startgame');
    const mapConfig = await player.waitFor(m => m.startsWith('mapconfig::'), 'mapconfig', 8000).catch(() => null);
    player.send('//update');
    const mapState = await player.waitFor(m => m.startsWith('mapstate::'), 'mapstate');
    const resources = await player.waitFor(m => m.startsWith('resources::'), 'resources');
    ok('game started with map + resources');

    const homeEntry = mapState.replace('mapstate::', '').split(',').find(entry => entry.includes(':homeworld:'));
    check(Boolean(homeEntry), 'homeworld visible in mapstate', mapState.slice(0, 80));
    const homeworldId = Number(homeEntry.split(':')[0]);

    // Probe an adjacent sector (starting crystal covers one probe).
    player.drain();
    player.send(`//probe:${hex(homeworldId + 1)}`);
    const probeResult = await player.waitFor(
        m => m.startsWith(`sector::`) || m.includes('probe was destroyed') || m.startsWith('Error:'),
        'probe outcome'
    );
    check(!probeResult.startsWith('Error: Probes cost'), 'opening probe affordable', probeResult.slice(0, 80));

    // Standing orders round-trip through real routing.
    player.drain();
    player.send('//standingorders:get');
    await player.waitFor(m => m.startsWith('standingorders::state::'), 'standing orders state');
    ok('standing orders routed');

    // End-turn-early protocol.
    player.drain();
    player.send('//start');
    const ready = await player.waitFor(m => m.startsWith('turnready::') || m.startsWith('newturn::'), 'turn ready/advance');
    check(Boolean(ready), 'end-turn-early acknowledged', ready.slice(0, 40));
    // Sole human marked done → the turn should advance.
    const newTurn = await player.waitFor(m => m.startsWith('newturn::'), 'turn advance', 6000);
    check(Boolean(newTurn), 'turn advances when all humans done', newTurn);

    player.close();

    console.log('\n=== Summary ===');
    console.log(`${checks - issues.length}/${checks} checks passed`);
    process.exit(issues.length ? 1 : 0);
}

main().catch(err => {
    console.error('\nSmoke test crashed:', err.message);
    process.exit(2);
});
