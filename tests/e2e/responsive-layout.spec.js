// Responsive HUD audit.
//
// The in-game HUD is a set of position:fixed panels laid out by JavaScript in
// game-screen.js. Every panel's size depends on a scale factor, on measured
// neighbours, and — on narrow screens — on media queries that override the
// JavaScript with their own !important rules. That is exactly the kind of layout
// that silently starts printing one panel over another at some resolution nobody
// happens to test on.
//
// This spec drives a real browser at a spread of window sizes plus a set of random
// ones, and asserts that no two visible HUD panels overlap and that nothing is
// pushed off the edge of the viewport.
//
//   SMOKE_BASE_URL=https://gameofworlds.com npx playwright test responsive-layout

const { test, expect } = require('@playwright/test');
const harness = require('./support/ui-game-harness');

// Panels that are laid out by applyResponsiveLayout(). Anything positioned by the
// layout code belongs here; anything transient (modals, toasts) does not.
const HUD_PANELS = [
    'resourceBar', 'empireSummary', 'victoryProgress', 'sectordisplay', 'viewTitle',
    'turnTimeBar', 'utilityButtons', 'connectionInfo', 'controlPadGUI', 'chatContainer',
    'minimapid', 'mapLegend', 'event-panel', 'avatarbox'
];

// Real-world shapes: desktop, laptop, 4:3, ultrawide, tablet portrait, phones, and
// the short-landscape case a phone produces when rotated.
const FIXED_SIZES = [
    [1920, 1080], [2560, 1080], [3440, 1440], [1600, 900], [1440, 900],
    [1366, 768], [1280, 800], [1280, 1024], [1024, 768], [1024, 600],
    [900, 600], [800, 600], [768, 1024], [640, 480],
    [430, 932], [390, 844], [360, 640], [932, 430]
];

const RANDOM_SIZE_COUNT = Number(process.env.LAYOUT_FUZZ_COUNT || 8);

// LAYOUT_FUZZ_SEED makes the random viewports reproducible. Without it you cannot tell a
// layout change from a different roll of the dice: a 150-viewport sweep before and after a
// change reported entirely different collisions purely because it drew different sizes.
// Unseeded is right for routine runs — fresh sizes each time is how new collisions get
// found — but any before/after comparison must pin the seed so both sides see the same
// viewports. Same reasoning as tools/balance-probe.js --seed.
const FUZZ_SEED = process.env.LAYOUT_FUZZ_SEED ? Number(process.env.LAYOUT_FUZZ_SEED) : null;

function makeRandom() {
    if (FUZZ_SEED === null) return Math.random;
    // mulberry32: small and reproducible. The generator does not matter, repeatability does.
    let state = FUZZ_SEED >>> 0;
    return function seeded() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomSizes(count) {
    const rand = makeRandom();
    const sizes = [];
    for (let i = 0; i < count; i++) {
        sizes.push([
            Math.floor(340 + rand() * 2260),
            Math.floor(400 + rand() * 1200)
        ]);
    }
    return sizes;
}

/** Measure the visible HUD panels and report overlaps / out-of-bounds boxes. */
async function auditLayout(page, width, height) {
    return page.evaluate(({ ids, w, h }) => {
        window.GameScreen?.applyResponsiveLayout?.();
        const boxes = [];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
            const r = el.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return;
            boxes.push({ id, x: r.x, y: r.y, w: r.width, h: r.height });
        });

        const overlaps = [];
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i];
                const b = boxes[j];
                const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
                const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
                // A few pixels of shared edge is a rounding artefact, not a collision.
                if (ox > 4 && oy > 4) {
                    overlaps.push(`${a.id} over ${b.id} (${Math.round(ox)}x${Math.round(oy)}px)`);
                }
            }
        }

        const offscreen = boxes
            .filter(b => b.x < -2 || b.y < -2 || b.x + b.w > w + 2 || b.y + b.h > h + 2)
            .map(b => `${b.id} at ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`);

        return { overlaps, offscreen, panels: boxes.length };
    }, { ids: HUD_PANELS, w: width, h: height });
}

test.describe('HUD layout holds together at every window size', () => {
    test('no panel collisions across common and random viewports', async ({ page }) => {
        test.setTimeout(180000);

        // The HUD only exists inside a live game, so stand one up: guest sign-in,
        // create a solo match, fill it with AI and start.
        await harness.signInGuest(page, `layout_${Date.now().toString(36)}`);
        await harness.waitForLobbyReady(page);
        const gameName = `Layout ${Date.now()}`;
        await harness.createGame(page, gameName, { maxPlayers: '2' });
        await page.getByRole('button', { name: /Fill with AI/i }).click();
        await page.waitForURL(/game\.html/, { timeout: 30000 });
        await page.waitForSelector('#controlPadGUI', { timeout: 30000 });
        await harness.dismissFirstRunGuidance(page).catch(() => {});

        const failures = [];
        const sizes = [...FIXED_SIZES, ...randomSizes(RANDOM_SIZE_COUNT)];

        for (const [width, height] of sizes) {
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(150); // debounced resize handler
            const result = await auditLayout(page, width, height);
            expect(result.panels, `no HUD panels rendered at ${width}x${height}`).toBeGreaterThan(2);
            if (result.overlaps.length || result.offscreen.length) {
                failures.push(
                    `${width}x${height}: ${[...result.overlaps, ...result.offscreen].join('; ')}`
                );
            }
        }

        expect(failures, `HUD layout problems:\n${failures.join('\n')}`).toEqual([]);
    });

    // The build pad and minimap can be collapsed to hand their space back to the map.
    // Two things have to hold and neither is obvious: the panel must actually disappear,
    // AND the 3D view's safe area must shrink to match. Hiding a panel while the camera
    // still frames around it would look like nothing happened, which is the failure mode
    // this guards. The collapsed layouts are also new geometry that the sweep above never
    // exercises, since it only ever measures the default state.
    test('collapsing the build pad and minimap frees their space, in every combination', async ({ page }) => {
        test.setTimeout(180000);

        await harness.signInGuest(page, `collapse_${Date.now().toString(36)}`);
        await harness.waitForLobbyReady(page);
        await harness.createGame(page, `Collapse ${Date.now()}`, { maxPlayers: '2' });
        await page.getByRole('button', { name: /Fill with AI/i }).click();
        await page.waitForURL(/game\.html/, { timeout: 30000 });
        await page.waitForSelector('#controlPadGUI', { timeout: 30000 });
        await harness.dismissFirstRunGuidance(page).catch(() => {});

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(200);

        const setCollapsed = async (pad, map) => {
            await page.evaluate(({ p, m }) => {
                document.body.classList.toggle('controlpad-collapsed', p);
                document.body.classList.toggle('minimap-collapsed', m);
                window.GameScreen?.applyResponsiveLayout?.();
            }, { p: pad, m: map });
            await page.waitForTimeout(150);
        };

        const measure = () => page.evaluate(() => {
            const vis = id => {
                const el = document.getElementById(id);
                if (!el) return false;
                const cs = getComputedStyle(el);
                return cs.display !== 'none' && el.getBoundingClientRect().height > 8;
            };
            return { pad: vis('controlPadGUI'), map: vis('minimapid') };
        });

        const failures = [];
        for (const [pad, map] of [[false, false], [true, false], [false, true], [true, true]]) {
            await setCollapsed(pad, map);
            const seen = await measure();
            if (seen.pad === pad) failures.push(`build pad visible=${seen.pad} when collapsed=${pad}`);
            if (seen.map === map) failures.push(`minimap visible=${seen.map} when collapsed=${map}`);

            const audit = await auditLayout(page, 1440, 900);
            if (audit.overlaps.length || audit.offscreen.length) {
                failures.push(`pad=${pad} map=${map}: ${[...audit.overlaps, ...audit.offscreen].join('; ')}`);
            }
        }

        // Collapsing both must genuinely give the camera more room, not just hide boxes.
        await setCollapsed(false, false);
        const expanded = await page.evaluate(() => window.Galaxy3D?.debugSafeInset?.() || null);
        await setCollapsed(true, true);
        const collapsed = await page.evaluate(() => window.Galaxy3D?.debugSafeInset?.() || null);
        // Assert the accessor exists rather than skipping when it does not. A silent skip
        // here would let the most important claim in this test - that collapsing actually
        // gives the camera its space back - pass without ever being checked.
        expect(expanded, 'Galaxy3D.debugSafeInset() must be available or this test proves nothing').toBeTruthy();
        expect(collapsed, 'Galaxy3D.debugSafeInset() must be available or this test proves nothing').toBeTruthy();
        const before = expanded.left + expanded.right + expanded.bottom;
        const after = collapsed.left + collapsed.right + collapsed.bottom;
        if (!(after < before)) {
            failures.push(`safe area did not shrink when both panels collapsed: ${before} -> ${after}`);
        }

        await setCollapsed(false, false);
        expect(failures, `collapse problems:\n${failures.join('\n')}`).toEqual([]);
    });
});

// The stylesheet promises a 44x44 minimum for HUD buttons under (pointer: coarse).
// That rule was written and never verified: if a selector does not match, or the media
// query never applies, nothing fails — the buttons just stay too small to hit on a
// phone, which is exactly the kind of silent miss this suite exists to catch.
test.describe('touch targets under a coarse pointer', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('HUD buttons meet the 44px minimum the stylesheet promises', async ({ page }) => {
        test.setTimeout(180000);

        await harness.signInGuest(page, `touch_${Date.now().toString(36)}`);
        await harness.waitForLobbyReady(page);
        await harness.createGame(page, `Touch ${Date.now()}`, { maxPlayers: '2' });
        await page.getByRole('button', { name: /Fill with AI/i }).click();
        await page.waitForURL(/game\.html/, { timeout: 30000 });
        await page.waitForSelector('#controlPadGUI', { timeout: 30000 });
        await harness.dismissFirstRunGuidance(page).catch(() => {});

        // Without this the whole test is vacuous: the rule is inside a media query, so if
        // emulation does not make it match, every button trivially "passes".
        const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
        expect(coarse, 'touch emulation must make (pointer: coarse) match or this test proves nothing').toBe(true);

        const undersized = await page.evaluate(() => {
            const scopes = ['#controlPadGUI', '#chatContainer', '#connectionInfo',
                '#utilityButtons', '#turnTimeBar', '#sectordisplay'];
            const bad = [];
            scopes.forEach(scope => {
                const root = document.querySelector(scope);
                if (!root) return;
                root.querySelectorAll('button').forEach(btn => {
                    if (btn.offsetParent === null) return;          // not on screen
                    if (btn.disabled) return;                       // cannot be tapped anyway
                    const r = btn.getBoundingClientRect();
                    if (r.width < 8 || r.height < 8) return;        // collapsed/decorative
                    if (r.width < 44 || r.height < 44) {
                        bad.push(`${scope} "${(btn.textContent || '').trim().slice(0, 18)}" ` +
                            `${Math.round(r.width)}x${Math.round(r.height)}`);
                    }
                });
            });
            return bad;
        });

        expect(undersized, `buttons below the 44px tap target:\n  ${undersized.join('\n  ')}`).toEqual([]);
    });
});
