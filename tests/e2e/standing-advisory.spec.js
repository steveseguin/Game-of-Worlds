// The cluster reading has to reach the player, and it has to reach them wearing the right mark.
//
// Two things this proves that no unit test can:
//
//   1. The advisory actually arrives. It is composed on the server at game start and broadcast; if the
//      prefix were unregistered, or the client handler missing, or compose() threw, the player would
//      simply never see it and nothing would fail anywhere - it is wrapped in a try/catch precisely so
//      flavour cannot stop a game starting, which also means it can fail silently.
//   2. It is NOT iconed as fleet movement. Three of its four lines mention mouths, shoals or a fleet,
//      and classifyEventMessage correctly reads those as movement - so before this had its own wire
//      prefix, the opening reading appeared as four fleet moves that happened before the game began.
//      The fix is that the sender chooses the icon; this is the assertion that the fix works.

const { test, expect } = require('@playwright/test');
const {
    uniqueId,
    registerUser,
    createGame,
    startGame,
    dismissFirstRunGuidance
} = require('./support/ui-game-harness');

test.describe('The Standing Advisory', () => {
    test.setTimeout(180000);

    test('reaches the feed at game start, carrying the charting mark', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept().catch(() => {}));
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        const username = uniqueId('advisory_');
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password: 'Secure123!'
        });
        await createGame(page, uniqueId('advisory_game_'), { maxPlayers: '2', mode: 'test' });
        await startGame(page, [page]);
        await dismissFirstRunGuidance(page);

        // The opening line is fixed vocabulary regardless of which variant was drawn.
        const feed = page.locator('#event-feed-list');
        await expect(feed).toContainText(/Standing advisory, this cluster/i, { timeout: 20000 });

        // The reading is four lines. Assert the two that make factual claims are present, without
        // pinning the numbers - those depend on the generated map, and standing-advisory.test.js
        // already checks they are true of it.
        const text = await feed.innerText();
        expect(text).toMatch(/collapsars are charted|mouths? (?:is|are) charted/i);
        expect(text).toMatch(/shoals? recorded|No shoals are recorded/i);

        // The mark. '⌖' is the charting kind; '→' is movement. Before the advisory had its own wire
        // prefix, the mouth and shoal lines wore the arrow, because their prose mentions fleets.
        const marks = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('#event-feed-list *')]
                .map(el => el.textContent || '')
                .filter(t => /Standing advisory|mouths? (?:is|are) charted|shoals? recorded|collapsars/i.test(t));
            // The icon is rendered as a sibling glyph inside the same row, so take the whole row text.
            return rows.map(t => ({
                chart: t.includes('⌖'),
                movement: t.includes('→'),
                snippet: t.trim().slice(0, 60)
            }));
        });

        expect(marks.length, 'no advisory rows found in the feed').toBeGreaterThan(0);
        const misfiled = marks.filter(m => m.movement && !m.chart);
        expect(misfiled, `advisory lines wearing the movement arrow:\n${
            misfiled.map(m => `  ${m.snippet}`).join('\n')}`).toEqual([]);

        expect(pageErrors, 'the page threw while the advisory arrived').toEqual([]);
    });
});
