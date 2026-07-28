#!/usr/bin/env node
/**
 * Visual capture harness — boots the game against the mock DB and photographs
 * every surface a player actually looks at.
 *
 * This exists because "does it look AAA?" cannot be answered by reading code.
 * Every polish pass has to be judged against a picture, and the picture has to
 * come from the real renderer with the real assets, not a mock.
 *
 *   node tools/visual-capture.js                     # every surface
 *   node tools/visual-capture.js --only=game-map     # one surface, fast loop
 *   node tools/visual-capture.js --list              # surface names
 *   node tools/visual-capture.js --out=path/to/dir   # where the PNGs land
 *   node tools/visual-capture.js --viewport=2560x1440
 *
 * WebGL: headless Chromium has no GPU, so the Three.js views are rendered
 * through SwiftShader (see BROWSER_ARGS). It is slow but pixel-faithful for
 * everything except real-GPU-only extensions, which this project does not use.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..');
const HOST = process.env.CAPTURE_HOST || '127.0.0.1';
// Port is chosen at runtime, not fixed: several polish agents run this harness
// concurrently, and a hardcoded port makes every run after the first fail to
// bind and then silently photograph the *other* agent's server.
let PORT = process.env.CAPTURE_PORT || null;
let BASE = '';

function findFreePort() {
    return new Promise((resolve, reject) => {
        const srv = require('net').createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, HOST, () => {
            const { port } = srv.address();
            srv.close(() => resolve(String(port)));
        });
    });
}

// SwiftShader gives headless Chromium a working WebGL2 context. Without
// --enable-unsafe-swiftshader recent Chromium refuses software WebGL outright
// and every canvas comes back a transparent void.
const BROWSER_ARGS = [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--disable-gpu-sandbox',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--mute-audio'
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function probe(url) {
    return new Promise(resolve => {
        let settled = false;
        const finish = ok => { if (!settled) { settled = true; resolve(ok); } };
        const request = http.get(url, response => {
            response.resume();
            finish(response.statusCode >= 200 && response.statusCode < 500);
        });
        request.setTimeout(2000, () => { request.destroy(); finish(false); });
        request.on('error', () => finish(false));
    });
}

async function waitForServer(child, url, timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (child && child.exitCode !== null) {
            throw new Error(`Capture server exited early with code ${child.exitCode}`);
        }
        if (await probe(url)) return;
        await sleep(400);
    }
    throw new Error(`Timed out waiting for capture server at ${url}`);
}

function startServer() {
    const child = spawn(process.execPath, ['server/index.js'], {
        cwd: REPO,
        env: {
            ...process.env,
            PORT,
            HOST,
            USE_MOCK_DB: '1',
            NODE_ENV: 'test',
            ENABLE_TEST_GAME_MODE: '1',
            TEST_MAP_WIDTH: '8',
            TEST_MAP_HEIGHT: '5',
            TEST_MAP_SEED: process.env.TEST_MAP_SEED || 'visual-capture-v1',
            TEST_RESOURCE_MULTIPLIER: '40',
            TURN_INTERVAL_TEST_MS: '600000',
            VICTORY_DOMINATION_PERCENT: '95',
            STRIPE_SECRET_KEY: '',
            STRIPE_PUBLISHABLE_KEY: '',
            STRIPE_WEBHOOK_SECRET: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const logs = [];
    const append = data => {
        for (const line of data.toString().split(/\r?\n/)) {
            if (line.trim()) { logs.push(line); if (logs.length > 200) logs.shift(); }
        }
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.__logs = logs;
    return child;
}

function stopServer(child) {
    if (!child || child.exitCode !== null || child.killed) return Promise.resolve();
    return new Promise(resolve => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        child.once('exit', done);
        child.kill('SIGTERM');
        setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); done(); }, 2500).unref();
    });
}

function uniqueId(prefix) {
    return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`
        .replace(/[^a-z0-9_-]/gi, '').toLowerCase().slice(0, 20);
}

/* ------------------------------------------------------------------ */
/* Flow helpers — the shortest path from a cold browser to each surface */
/* ------------------------------------------------------------------ */

async function registerUser(page, username) {
    await page.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.click('#registerTab');
    await page.fill('#registerUsername', username);
    await page.fill('#registerEmail', `${username}@example.com`);
    await page.fill('#registerPassword', 'Secure123!');
    await page.fill('#confirmPassword', 'Secure123!');
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/register') && r.request().method() === 'POST');
    await page.click('#registerForm button[type="submit"]');
    const body = await (await responsePromise).json();
    if (!body.success) throw new Error(`Registration failed: ${body.error}`);
    await page.waitForURL('**/lobby.html', { timeout: 25000 });
    await waitForLobbyReady(page);
}

async function waitForLobbyReady(page, timeout = 30000) {
    await page.waitForFunction(() => {
        const pill = document.getElementById('lobbyConnectionState');
        if (pill && pill.dataset && pill.dataset.state === 'ready') return true;
        const btn = document.getElementById('createGameBtn');
        return !!(window.websocket && window.websocket.readyState === WebSocket.OPEN && btn && !btn.disabled);
    }, null, { timeout });
}

async function openCreateGame(page, mode = 'test') {
    await waitForLobbyReady(page);
    await page.fill('#gameName', uniqueId('shot_'));
    await page.selectOption('#maxPlayers', '2');
    await page.selectOption('#gameMode', mode);
    await page.click('#createGameBtn');
}

async function createAndStartGame(page, mode = 'test') {
    await openCreateGame(page, mode);
    await chooseFirstAvailableRace(page);
    await page.waitForSelector('.waiting-view', { state: 'visible', timeout: 30000 });
    const startBtn = page.getByRole('button', { name: /Start Game/i }).first();
    await startBtn.waitFor({ state: 'visible', timeout: 20000 });
    for (let i = 0; i < 40 && await startBtn.isDisabled().catch(() => false); i++) await sleep(500);
    await startBtn.click();
    await page.waitForURL('**/game.html**', { timeout: 30000 });
    await page.waitForSelector('#resourceBar', { timeout: 30000 }).catch(() => {});
}

async function chooseFirstAvailableRace(page) {
    await page.waitForSelector('#raceSelectionModal', { state: 'visible', timeout: 30000 });
    const active = page.locator('.race-card.unlocked.active').first();
    if (!(await active.count()) || !(await active.isVisible().catch(() => false))) {
        await page.locator('.race-card.unlocked').first().click();
    }
    await page.click('#confirmRaceBtn');
    await page.waitForSelector('#raceSelectionModal', { state: 'hidden', timeout: 20000 }).catch(() => {});
}

async function settleGame(page) {
    // Wait for the map to exist and for the renderer to have drawn real frames.
    await page.waitForSelector('#galaxy3d canvas', { timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => {
        return !!(window.Galaxy3D && typeof window.Galaxy3D.isReady === 'function'
            ? window.Galaxy3D.isReady()
            : document.querySelector('#galaxy3d canvas'));
    }, null, { timeout: 45000 }).catch(() => {});
    await dismissOverlays(page);
    await sleep(3500); // let textures decode + camera framing settle
}

async function dismissOverlays(page) {
    // The first-run tour parks a bubble over the sector panel, which is exactly the
    // chrome a reviewer needs to see. It is injected on a timer, so a single early
    // click misses it — poll, then force-remove whatever is left.
    for (let i = 0; i < 8; i++) {
        const skip = page.locator('#tour-skip');
        if (await skip.isVisible().catch(() => false)) {
            await skip.click().catch(() => {});
            await sleep(300);
            break;
        }
        await sleep(400);
    }
    await page.evaluate(() => {
        document.querySelectorAll('#tour-bubble, #tour-overlay, #onboardingCard, .tour-overlay, .onboarding-overlay')
            .forEach(n => n.remove());
    }).catch(() => {});
    await sleep(300);
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

const SURFACES = {
    'landing': {
        description: 'Marketing / front door with the Three.js planet hero',
        async capture(ctx) {
            const page = await ctx.newPage();
            await page.goto(`${BASE}/landing.html`, { waitUntil: 'networkidle' });
            await sleep(4000);
            await ctx.shot(page, 'landing-hero');
            await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.0));
            await sleep(1200);
            await ctx.shot(page, 'landing-scroll-1');
            await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.2));
            await sleep(1200);
            await ctx.shot(page, 'landing-scroll-2');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await sleep(1200);
            await ctx.shot(page, 'landing-footer');
            await page.close();
        }
    },

    'login': {
        description: 'Sign-in / registration console',
        async capture(ctx) {
            const page = await ctx.newPage();
            await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle' });
            await sleep(2500);
            await ctx.shot(page, 'login');
            await page.click('#registerTab').catch(() => {});
            await sleep(900);
            await ctx.shot(page, 'login-register');
            await page.close();
        }
    },

    'lobby': {
        description: 'Game browser, creation dialog and match lobby',
        async capture(ctx) {
            const page = await ctx.newPage();
            await registerUser(page, uniqueId('shot_'));
            await sleep(1800);
            await ctx.shot(page, 'lobby');
            await openCreateGame(page, 'test');
            await page.waitForSelector('#raceSelectionModal', { state: 'visible', timeout: 30000 });
            await sleep(1200);
            await ctx.shot(page, 'lobby-race-modal');
            await chooseFirstAvailableRace(page);
            await page.waitForSelector('.waiting-view', { state: 'visible', timeout: 25000 });
            await sleep(1500);
            await ctx.shot(page, 'lobby-match');
            await page.close();
        }
    },

    'race-select': {
        description: 'The twelve races — the biggest single art surface',
        async capture(ctx) {
            const page = await ctx.newPage();
            await registerUser(page, uniqueId('shot_'));
            await openCreateGame(page, 'test');
            await page.waitForSelector('#raceSelectionModal', { state: 'visible', timeout: 30000 });
            await sleep(2200);
            await ctx.shot(page, 'race-select');
            const card = page.locator('.race-card.unlocked').first();
            if (await card.count()) { await card.click().catch(() => {}); await sleep(1400); }
            await ctx.shot(page, 'race-select-detail');
            // The locked/aspirational treatment is its own art problem — show it.
            // Scrolling to the card is NOT enough: the dossier keeps rendering the
            // previously selected faction, so the shot came out byte-identical to
            // race-select-detail and three fixes were reviewed against the wrong frame.
            const locked = page.locator('.race-card.locked').first();
            if (await locked.count()) {
                await locked.scrollIntoViewIfNeeded().catch(() => {});
                await locked.click({ force: true }).catch(() => {});
                await sleep(1400);
                await ctx.shot(page, 'race-select-locked');
            } else {
                await ctx.note('race-select', 'no locked race card found');
            }
            await page.close();
        }
    },

    'game-map': {
        description: 'THE main view: 3D galaxy map + HUD',
        async capture(ctx) {
            const page = await ctx.newPage();
            await registerUser(page, uniqueId('shot_'));
            await createAndStartGame(page);
            await settleGame(page);
            await ctx.shot(page, 'game-map');
            // Push the camera onto a single world. frameSectors() zooms to fit the
            // sectors it is given, so a one-element list is the tightest framing the
            // renderer offers — this is the shot that judges planet surface quality.
            const framed = await page.evaluate(() => {
                const g = window.Galaxy3D;
                if (!g || typeof g.frameSectors !== 'function') return null;
                const home = window.homeSectorId || window.selectedSector || null;
                const id = Number(home) || 10;
                g.frameSectors([id]);
                if (typeof g.focusSector === 'function') g.focusSector(id);
                return id;
            }).catch(() => null);
            await sleep(3000);
            await ctx.shot(page, 'game-map-closeup');
            if (!framed) await ctx.note('game-map', 'frameSectors unavailable; closeup is not zoomed');
            await page.close();
        }
    },

    'game-fleet': {
        description: 'Fleet-movement animation across the map, caught mid-flight',
        async capture(ctx) {
            const page = await ctx.newPage();
            await registerUser(page, uniqueId('shot_'));
            await createAndStartGame(page);
            await settleGame(page);
            const ok = await page.evaluate(() => {
                const g = window.Galaxy3D;
                if (!g || typeof g.animateFleetMove !== 'function') return false;
                g.animateFleetMove(10, 24, { mine: true, count: 6 });
                g.animateFleetMove(11, 10, { mine: false, count: 3 });
                return true;
            }).catch(() => false);
            if (!ok) { await ctx.note('game-fleet', 'animateFleetMove unavailable'); await page.close(); return; }
            // animateFleetMove runs for 1.4s (0.7s warp), so every frame has to land
            // inside that window — earlier timings shot the empty map after it ended.
            for (const [ms, name] of [[320, 'fleet-move-early'], [400, 'fleet-move-mid'], [400, 'fleet-move-late']]) {
                await sleep(ms);
                await ctx.shot(page, name);
            }
            await page.close();
        }
    },

    'game-panels': {
        description: 'Build / Fleet / Research / Colonize / Analytics HUD panels',
        async capture(ctx) {
            const page = await ctx.newPage();
            await registerUser(page, uniqueId('shot_'));
            await createAndStartGame(page);
            await settleGame(page);
            for (const [tab, name] of [
                ['#buildtab', 'panel-build'],
                ['#fleettab', 'panel-fleet'],
                ['#techtab', 'panel-research'],
                ['#colonizetab', 'panel-colonize'],
                ['#analyticstab', 'panel-analytics']
            ]) {
                await page.click(tab).catch(() => {});
                await sleep(1400);
                await ctx.shot(page, name);
            }
            await page.close();
        }
    },

    'battle': {
        description: 'The 3D battle theater',
        async capture(ctx) {
            const page = await ctx.newPage();
            await registerUser(page, uniqueId('shot_'));
            await createAndStartGame(page);
            await settleGame(page);
            // Drive the theater directly with a synthetic timeline — playing to a
            // real war costs many turns and produces a less controlled picture.
            const started = await page.evaluate(() => {
                if (!window.Battle3D || !window.Battle3D.createBattleVisualization) return false;
                const block = (a, d, g, o) => [...a, ...d, g, o];
                const A = [0, 6, 4, 3, 2, 2, 1, 1, 0];
                const D = [0, 5, 3, 3, 2, 1, 1, 1, 0];
                const timeline = [
                    block(A, D, 2, 3),
                    block([0, 5, 4, 3, 2, 2, 1, 1, 0], [0, 3, 2, 2, 1, 1, 1, 0, 0], 2, 2),
                    block([0, 4, 3, 2, 2, 1, 1, 1, 0], [0, 1, 1, 1, 0, 0, 0, 0, 0], 1, 1),
                    block([0, 4, 3, 2, 1, 1, 1, 1, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0)
                ];
                const payload = 'battle:' + timeline.flat().join(':');
                window.Battle3D.createBattleVisualization(payload, {
                    // sectorLabel is the bare number: battle3d prepends "Battle for Sector".
                    sectorId: 19, sectorLabel: '19', durationMs: 26000,
                    battleResult: 'att', viewerRole: 'attacker', viewerWon: true, planetType: 7
                });
                return true;
            });
            if (!started) { await ctx.note('battle', 'Battle3D unavailable in this build'); await page.close(); return; }
            for (const [ms, name] of [[3500, 'battle-open'], [7000, 'battle-mid'], [8000, 'battle-late'], [6000, 'battle-result']]) {
                await sleep(ms);
                await ctx.shot(page, name);
            }
            await page.close();
        }
    },

    'shop': {
        description: 'Premium shop / storefront',
        async capture(ctx) {
            const page = await ctx.newPage();
            await registerUser(page, uniqueId('shot_'));
            await createAndStartGame(page);
            await settleGame(page);
            const opened = await page.evaluate(() => {
                if (window.Shop && typeof window.Shop.open === 'function') { window.Shop.open(); return 'Shop.open'; }
                const btn = [...document.querySelectorAll('button')].find(b => /^\s*Shop\s*$/i.test(b.textContent));
                if (btn) { btn.click(); return 'button'; }
                return null;
            });
            await sleep(2200);
            await ctx.shot(page, 'shop');
            if (!opened) await ctx.note('shop', 'no shop entry point found');
            await page.close();
        }
    },

    'codex': {
        description: 'In-game codex / lore reader',
        async capture(ctx) {
            const page = await ctx.newPage();
            await registerUser(page, uniqueId('shot_'));
            await createAndStartGame(page);
            await settleGame(page);
            await page.evaluate(() => {
                if (window.Codex && window.Codex.open) window.Codex.open();
                else document.querySelector('#codexBtn, [data-open-codex]')?.click();
            }).catch(() => {});
            await sleep(1800);
            await ctx.shot(page, 'codex');
            await page.close();
        }
    }
};

/* ------------------------------------------------------------------ */

async function main() {
    const args = process.argv.slice(2);
    const argVal = name => {
        const hit = args.find(a => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : null;
    };

    if (args.includes('--list')) {
        for (const [name, s] of Object.entries(SURFACES)) console.log(`${name.padEnd(14)} ${s.description}`);
        return;
    }

    const only = argVal('only');
    const outDir = path.resolve(argVal('out') || path.join(REPO, '.codex-tmp', 'shots'));
    const vp = (argVal('viewport') || '1920x1080').split('x').map(Number);
    const viewport = { width: vp[0] || 1920, height: vp[1] || 1080 };

    const names = only ? only.split(',').map(s => s.trim()) : Object.keys(SURFACES);
    for (const n of names) if (!SURFACES[n]) throw new Error(`Unknown surface "${n}". Try --list.`);

    fs.mkdirSync(outDir, { recursive: true });

    PORT = PORT || await findFreePort();
    BASE = `http://${HOST}:${PORT}`;
    console.log(`capture server on ${BASE}`);

    const server = startServer();
    let browser;
    const manifest = [];
    try {
        await waitForServer(server, `${BASE}/login.html`);
        browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });

        const ctx = {
            newPage: async () => {
                const page = await context.newPage();
                page.on('dialog', d => d.accept().catch(() => {}));
                page.on('pageerror', e => manifest.push({ type: 'pageerror', message: String(e).slice(0, 400) }));
                return page;
            },
            shot: async (page, name) => {
                const file = path.join(outDir, `${name}.png`);
                await page.screenshot({ path: file });
                manifest.push({ type: 'shot', name, file });
                console.log(`  captured ${name}.png`);
            },
            note: async (name, message) => {
                manifest.push({ type: 'note', name, message });
                console.log(`  note (${name}): ${message}`);
            }
        };

        for (const name of names) {
            console.log(`[${name}] ${SURFACES[name].description}`);
            try {
                await SURFACES[name].capture(ctx);
            } catch (error) {
                console.error(`  FAILED: ${error.message}`);
                manifest.push({ type: 'error', name, message: error.message });
            }
        }

        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        console.log(`\nShots in ${outDir}`);
        const errors = manifest.filter(m => m.type === 'error');
        const pageErrors = manifest.filter(m => m.type === 'pageerror');
        if (pageErrors.length) console.log(`${pageErrors.length} page error(s) recorded in manifest.json`);
        if (errors.length) { console.error(`${errors.length} surface(s) failed`); process.exitCode = 1; }
    } catch (error) {
        console.error(error.message || error);
        if (server.__logs && server.__logs.length) {
            console.error('\nLast server log lines:\n' + server.__logs.slice(-40).join('\n'));
        }
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close().catch(() => {});
        await stopServer(server);
    }
}

main();
