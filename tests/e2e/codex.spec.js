// The setting is reachable from inside the game, or it is not part of the game.
//
// A large amount of written material exists in lore/ and until the codex was added none of it
// could be reached by a player: everything they could learn about the galaxy came from event
// copy scrolling past in the feed. The codex tabs in the help overlay are the fix, and the
// point of this spec is that "the tabs render" is not something unit tests can establish.
//
// tests/lore-sector-types-match-code.test.js checks the CONTENT against server/lib/map.js by
// reading codex.js as text. That catches drift in the words. It cannot catch the panel being
// unreachable - a script tag that never loaded, an id renamed in the HTML, a build() that
// throws, tabs that render but do not switch. Every one of those ships a codex that exists
// only in the repository. So this drives the real thing: open the overlay a player opens,
// click the tabs a player clicks, and read what a player would read.
//
// It also pins the two properties that are easy to lose by accident:
//   - Quick Help stays the default tab. The new-player path must not be buried under lore.
//   - Nothing about the sealed thing appears. Law 25 in lore/11-laws-of-the-world.md.

const { test, expect } = require('@playwright/test');
const {
    uniqueId,
    registerUser,
    createGame,
    startGame,
    dismissFirstRunGuidance
} = require('./support/ui-game-harness');

test.describe('The codex', () => {
    test.setTimeout(180000);

    test('a player can open the help panel and read the setting', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept().catch(() => {}));

        // Surface a codex.js parse error as a test failure rather than as empty tabs.
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        const username = uniqueId('codex_');
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password: 'Secure123!'
        });
        await createGame(page, uniqueId('codex_game_'), { maxPlayers: '2', mode: 'test' });
        await startGame(page, [page]);
        await dismissFirstRunGuidance(page);

        // --- the panel opens from the control a player can actually see -------------------
        await page.locator('#helpBtn').click();
        const overlay = page.locator('#helpOverlay');
        await expect(overlay).toBeVisible({ timeout: 10000 });

        // --- Quick Help is the default, and it is the help, not the lore ------------------
        await expect(page.locator('#codexHelp')).toBeVisible();
        await expect(page.locator('#codexBody')).toBeHidden();
        const tabs = page.locator('#codexTabs button');
        await expect(tabs).toHaveCount(5);
        await expect(tabs.nth(0)).toHaveText('Quick Help');

        // --- every lore tab switches, and puts real prose on screen -----------------------
        const expected = [
            ['The Galaxy', /Trellis/, /blind/i],
            ['Sectors', /Asteroid Belt/, /Black Hole/],
            ['The Twelve', /Terran Empire/, /Shadow Realm/],
            ['Words', /Shoal/, /Reckoning/]
        ];

        for (const [label, ...patterns] of expected) {
            await page.locator(`#codexTabs button:text-is("${label}")`).click();

            const body = page.locator('#codexBody');
            await expect(body).toBeVisible();
            // Opening a lore tab must hide Quick Help, or the two stack on top of each other.
            await expect(page.locator('#codexHelp')).toBeHidden();

            for (const pattern of patterns) {
                await expect(body).toContainText(pattern);
            }

            // A tab with nothing in it would satisfy every check above if the patterns were
            // loose, so require actual substance.
            const words = (await body.innerText()).trim().split(/\s+/).length;
            expect(words, `the ${label} tab is nearly empty`).toBeGreaterThan(40);

            // It has to fit the panel. The overlay is a fixed-height box with its own
            // scroller; content wider than the box scrolls the page sideways instead.
            const overflow = await body.evaluate(el => el.scrollWidth - el.clientWidth);
            expect(overflow, `the ${label} tab overflows the panel horizontally`).toBeLessThanOrEqual(1);
        }

        // --- going back to Quick Help works, so the panel is not a one-way door -----------
        await page.locator('#codexTabs button:text-is("Quick Help")').click();
        await expect(page.locator('#codexHelp')).toBeVisible();
        await expect(page.locator('#codexBody')).toBeHidden();

        // --- Law 25: the sealed thing is never named, described or shown ------------------
        // Reading the whole panel rather than one tab, because the leak could be anywhere.
        const everything = await page.locator('#helpOverlay').innerText();
        for (const forbidden of [/\bquarantine\b/i, /\bthe sealed\b/i, /\bcontainment\b/i]) {
            expect(everything, `the codex names ${forbidden} - see Law 25`).not.toMatch(forbidden);
        }

        // --- reopening does not duplicate the tab bar ------------------------------------
        // build() is called both on DOMContentLoaded and on every open, so it has to be
        // idempotent. If it is not, the tab row grows by five each time the player opens help.
        await page.locator('#helpClose').click();
        await expect(overlay).toBeHidden();
        await page.locator('#helpBtn').click();
        await expect(overlay).toBeVisible();
        await expect(tabs).toHaveCount(5);

        expect(pageErrors, 'the page threw while the codex was on screen').toEqual([]);
    });
});
