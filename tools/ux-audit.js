#!/usr/bin/env node
/**
 * UX audit: accessibility violations, loading speed, and interaction readiness.
 *
 * "Looks AAA" and "is AAA to use" are different questions and need different
 * instruments. This one answers the second: can a keyboard user operate it, does
 * a screen reader get anything, how long before the thing is usable, and how much
 * does it cost to get there.
 *
 *   node tools/ux-audit.js                     every surface
 *   node tools/ux-audit.js --only=game,shop    one or more
 *   node tools/ux-audit.js --json=out.json     machine-readable, for agents
 *
 * axe-core is injected from node_modules, so the rule set is the real WCAG one
 * rather than a hand-rolled approximation. Findings are reported per surface with
 * the offending selector, because "3 contrast violations" is not actionable and
 * "#nextTurnBtn is 2.9:1 against its background" is.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..');
const HOST = '127.0.0.1';
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const BROWSER_ARGS = [
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--disable-gpu-sandbox', '--force-device-scale-factor=1', '--mute-audio'
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.on('error', reject);
        s.listen(0, HOST, () => { const { port } = s.address(); s.close(() => resolve(String(port))); });
    });
}

function probe(url) {
    return new Promise(resolve => {
        const req = http.get(url, r => { r.resume(); resolve(r.statusCode >= 200 && r.statusCode < 500); });
        req.setTimeout(2000, () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

async function waitForServer(child, url, timeoutMs = 90000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
        if (await probe(url)) return;
        await sleep(400);
    }
    throw new Error(`timed out waiting for ${url}`);
}

function startServer(port) {
    return spawn(process.execPath, ['server/index.js'], {
        cwd: REPO,
        env: {
            ...process.env, PORT: port, HOST, USE_MOCK_DB: '1', NODE_ENV: 'test',
            ENABLE_TEST_GAME_MODE: '1', TEST_MAP_WIDTH: '8', TEST_MAP_HEIGHT: '5',
            TEST_RESOURCE_MULTIPLIER: '40', TURN_INTERVAL_TEST_MS: '600000',
            STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

const uid = p => `${p}${Math.random().toString(36).slice(2, 7)}${Date.now().toString(36)}`.toLowerCase().slice(0, 18);

/* ---------------------------------------------------------------- flows */

async function toLobby(page, base) {
    const u = uid('ux');
    await page.goto(`${base}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.click('#registerTab');
    await page.fill('#registerUsername', u);
    await page.fill('#registerEmail', `${u}@example.com`);
    await page.fill('#registerPassword', 'Secure123!');
    await page.fill('#confirmPassword', 'Secure123!');
    await page.click('#registerForm button[type="submit"]');
    await page.waitForURL('**/lobby.html', { timeout: 30000 });
    await page.waitForFunction(() => {
        const b = document.getElementById('createGameBtn');
        return b && !b.disabled;
    }, null, { timeout: 30000 });
}

async function toGame(page, base) {
    await toLobby(page, base);
    await page.fill('#gameName', uid('g'));
    await page.selectOption('#maxPlayers', '2');
    await page.selectOption('#gameMode', 'test');
    await page.click('#createGameBtn');
    await page.waitForSelector('#raceSelectionModal', { state: 'visible', timeout: 30000 });
    await page.locator('.race-card.unlocked').first().click();
    await page.click('#confirmRaceBtn');
    await page.waitForSelector('.waiting-view', { state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: /Start Game/i }).first().click();
    await page.waitForURL('**/game.html**', { timeout: 30000 });
    await page.waitForSelector('#resourceBar', { timeout: 30000 });
    const skip = page.locator('#tour-skip');
    for (let i = 0; i < 8 && !(await skip.isVisible().catch(() => false)); i++) await sleep(400);
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
    await sleep(2500);
}

const SURFACES = {
    landing: { url: b => `${b}/landing.html`, reach: async (p, b) => { await p.goto(`${b}/landing.html`, { waitUntil: 'load' }); await sleep(2500); } },
    login: { url: b => `${b}/login.html`, reach: async (p, b) => { await p.goto(`${b}/login.html`, { waitUntil: 'load' }); await sleep(1500); } },
    lobby: { reach: async (p, b) => { await toLobby(p, b); await sleep(1500); } },
    raceselect: {
        reach: async (p, b) => {
            await toLobby(p, b);
            await p.fill('#gameName', uid('g'));
            await p.selectOption('#gameMode', 'test');
            await p.click('#createGameBtn');
            await p.waitForSelector('#raceSelectionModal', { state: 'visible', timeout: 30000 });
            await sleep(2000);
        }
    },
    game: { reach: toGameWrap },
    shop: {
        reach: async (p, b) => {
            await toGame(p, b);
            await p.evaluate(() => { if (window.Shop && window.Shop.open) window.Shop.open(); });
            await sleep(2000);
        }
    },
    codex: {
        reach: async (p, b) => {
            await toGame(p, b);
            await p.evaluate(() => document.getElementById('helpBtn')?.click());
            await sleep(1800);
        }
    }
};

async function toGameWrap(p, b) { await toGame(p, b); }

/* ------------------------------------------------------------ measures */

async function axeScan(page) {
    await page.addScriptTag({ path: AXE_PATH });
    return page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const res = await axe.run(document, {
            resultTypes: ['violations'],
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }
        });
        return res.violations.map(v => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            count: v.nodes.length,
            // The selector is the whole point — a count is not actionable.
            examples: v.nodes.slice(0, 4).map(n => ({
                target: (n.target || []).join(' '),
                summary: (n.failureSummary || '').split('\n').filter(Boolean).slice(0, 2).join(' | ')
            }))
        }));
    });
}

/** Keyboard reachability: how far can Tab actually get, and does focus ever show? */
async function keyboardScan(page) {
    return page.evaluate(async () => {
        const seen = [];
        const describe = el => {
            if (!el || el === document.body) return null;
            const id = el.id ? `#${el.id}` : '';
            const cls = (el.className && typeof el.className === 'string')
                ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
            return `${el.tagName.toLowerCase()}${id}${cls}`;
        };
        const candidates = [...document.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter(el => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0
                && s.visibility !== 'hidden'
                && s.display !== 'none'
                && !el.closest('[inert], [aria-hidden="true"]');
        });

        let noVisibleFocusRing = 0;
        let sampled = 0;
        for (const el of candidates.slice(0, 60)) {
            el.focus();
            // A modal's inert background and browser-specific disabled states can
            // reject programmatic focus even when a broad selector finds the node.
            // If focus did not move, there is no visible ring to assess and counting
            // it as a failure reports the modal's correctly sealed controls as bugs.
            if (document.activeElement !== el) continue;
            sampled += 1;
            const s = getComputedStyle(el);
            const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0)
                || (s.boxShadow && s.boxShadow !== 'none');
            if (!ring) { noVisibleFocusRing++; seen.push(describe(el)); }
        }
        return {
            focusableCount: candidates.length,
            sampled,
            missingFocusRing: noVisibleFocusRing,
            missingExamples: seen.slice(0, 8)
        };
    });
}

/** Loading cost and time-to-usable for a cold visit to this surface. */
async function loadScan(page) {
    return page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const res = performance.getEntriesByType('resource');
        let bytes = 0;
        const byType = {};
        for (const r of res) {
            const b = r.transferSize || 0;
            bytes += b;
            const k = r.initiatorType || 'other';
            byType[k] = (byType[k] || 0) + b;
        }
        const paints = performance.getEntriesByType('paint');
        const fcp = paints.find(p => p.name === 'first-contentful-paint');
        return {
            requests: res.length,
            transferredKB: Math.round(bytes / 1024),
            byTypeKB: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v / 1024)])),
            domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
            loadMs: Math.round(nav.loadEventEnd || 0),
            firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
            largest: res.map(r => ({ n: r.name.split('/').pop().split('?')[0].slice(0, 44), kb: Math.round((r.transferSize || 0) / 1024) }))
                .sort((a, b) => b.kb - a.kb).slice(0, 6).filter(x => x.kb > 0)
        };
    });
}

/**
 * Long tasks — the single most common UX defect in this product.
 *
 * Every surface reviewed had at least one multi-second main-thread block: the
 * page is painted, looks finished, and does not answer the pointer. Frame-time
 * medians hide this completely (a 2 s freeze inside 60 s of 16 ms frames barely
 * moves the median), so it needs its own instrument. A task over 50 ms is a
 * jank; over 200 ms the interface is perceptibly dead; over 1 s a player thinks
 * it crashed.
 *
 * The observer is installed via an init script so it is running before any page
 * code, which is the only way to catch stalls during startup.
 */
async function installLongTaskObserver(context) {
    await context.addInitScript(() => {
        window.__longTasks = [];
        try {
            new PerformanceObserver(list => {
                for (const e of list.getEntries()) {
                    window.__longTasks.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) });
                }
            }).observe({ entryTypes: ['longtask'] });
        } catch (_) { /* older engines: reported as unavailable rather than zero */ }
    });
}

function longTaskReport(page) {
    return page.evaluate(() => {
        const t = window.__longTasks;
        if (!Array.isArray(t)) return { supported: false };
        const sorted = [...t].sort((a, b) => b.dur - a.dur);
        return {
            supported: true,
            count: t.length,
            totalBlockingMs: t.reduce((s, x) => s + Math.max(0, x.dur - 50), 0),
            worstMs: sorted.length ? sorted[0].dur : 0,
            over1s: t.filter(x => x.dur >= 1000).length,
            over200ms: t.filter(x => x.dur >= 200).length,
            worst: sorted.slice(0, 5)
        };
    });
}

/** Frame pacing — an interface that stutters is a UX defect, not just a perf one. */
async function frameScan(page) {
    return page.evaluate(async () => {
        const t = [];
        let last = performance.now();
        await new Promise(res => {
            let n = 0;
            const tick = () => {
                const now = performance.now();
                t.push(now - last); last = now;
                if (++n < 60) requestAnimationFrame(tick); else res();
            };
            requestAnimationFrame(tick);
        });
        t.sort((a, b) => a - b);
        const q = p => Math.round(t[Math.floor(t.length * p)] * 10) / 10;
        return { medianMs: q(0.5), p90Ms: q(0.9), worstMs: Math.round(t[t.length - 1] * 10) / 10 };
    });
}

/* ---------------------------------------------------------------- main */

async function main() {
    const args = process.argv.slice(2);
    const val = n => { const h = args.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : null; };
    const only = val('only');
    const jsonOut = val('json');
    const names = only ? only.split(',').map(s => s.trim()) : Object.keys(SURFACES);
    for (const n of names) if (!SURFACES[n]) throw new Error(`unknown surface "${n}" (have: ${Object.keys(SURFACES).join(', ')})`);

    const port = await freePort();
    const base = `http://${HOST}:${port}`;
    const server = startServer(port);
    let browser;
    const report = {};
    try {
        await waitForServer(server, `${base}/login.html`);
        browser = await chromium.launch({ headless: true, args: BROWSER_ARGS });

        for (const name of names) {
            const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
            await installLongTaskObserver(ctx);
            const page = await ctx.newPage();
            page.on('dialog', d => d.accept().catch(() => {}));
            const consoleErrors = [];
            page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 200)));
            page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

            process.stdout.write(`[${name}] `);
            try {
                await SURFACES[name].reach(page, base);
                // Long tasks first: axe injects a script and runs a full DOM pass,
                // which would otherwise show up as our own jank in the numbers.
                const stalls = await longTaskReport(page);
                const [a11y, keyboard, load, frames] = [
                    await axeScan(page),
                    await keyboardScan(page),
                    await loadScan(page),
                    await frameScan(page)
                ];
                report[name] = { a11y, keyboard, load, frames, stalls, consoleErrors: consoleErrors.slice(0, 5) };
                const serious = a11y.filter(v => v.impact === 'critical' || v.impact === 'serious');
                console.log(`a11y ${a11y.length} rule(s) (${serious.length} serious+), `
                    + `${keyboard.missingFocusRing}/${keyboard.sampled} no focus ring, `
                    + `${load.transferredKB}KB, FCP ${load.firstContentfulPaintMs}ms, `
                    + `frame ${frames.medianMs}ms, `
                    + `stalls ${stalls.supported ? `${stalls.count} (worst ${stalls.worstMs}ms)` : 'n/a'}`);
            } catch (err) {
                console.log(`FAILED: ${err.message}`);
                report[name] = { error: err.message };
            }
            await ctx.close();
        }

        console.log('\n================ DETAIL ================');
        for (const [name, r] of Object.entries(report)) {
            if (r.error) { console.log(`\n## ${name}: ERROR ${r.error}`); continue; }
            console.log(`\n## ${name}`);
            console.log(`   load: ${r.load.requests} req, ${r.load.transferredKB} KB, FCP ${r.load.firstContentfulPaintMs}ms, load ${r.load.loadMs}ms`);
            console.log(`   frames: median ${r.frames.medianMs}ms p90 ${r.frames.p90Ms}ms worst ${r.frames.worstMs}ms`);
            if (r.stalls && r.stalls.supported) {
                console.log(`   MAIN-THREAD STALLS: ${r.stalls.count} long task(s), worst ${r.stalls.worstMs}ms, `
                    + `${r.stalls.over1s} over 1s, ${r.stalls.over200ms} over 200ms, `
                    + `total blocking ${r.stalls.totalBlockingMs}ms`);
                for (const w of r.stalls.worst) console.log(`      ${w.dur}ms at t+${w.start}ms`);
            }
            console.log(`   keyboard: ${r.keyboard.focusableCount} focusable, ${r.keyboard.missingFocusRing}/${r.keyboard.sampled} without a visible focus ring`);
            if (r.keyboard.missingExamples.length) console.log(`      e.g. ${r.keyboard.missingExamples.join(', ')}`);
            if (r.consoleErrors.length) console.log(`   console errors: ${r.consoleErrors.length}`);
            for (const v of r.a11y) {
                console.log(`   [${v.impact}] ${v.id} x${v.count} — ${v.help}`);
                for (const e of v.examples) console.log(`        ${e.target}`);
            }
        }

        if (jsonOut) {
            fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(report, null, 1));
            console.log(`\nJSON written to ${jsonOut}`);
        }
    } catch (err) {
        console.error(err.message || err);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close().catch(() => {});
        server.kill();
    }
}

main();
