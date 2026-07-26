// The cluster reading has to reach the player, and it has to reach them wearing the right mark.
//
// Two things this proves that no unit test can:
//
//   1. The advisory actually arrives. It is composed on the server at game start and deferred until
//      the game page's first authenticated update; if the prefix were unregistered, the handler
//      missing, or compose() threw, the player would simply never see it and nothing would fail
//      anywhere.
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
        const advisoryFrames = [];
        page.on('websocket', socket => {
            socket.on('framereceived', event => {
                const payload = typeof event.payload === 'string'
                    ? event.payload
                    : event.payload.toString('utf8');
                if (payload.startsWith('advisory::')) {
                    advisoryFrames.push(payload.slice('advisory::'.length));
                }
            });
        });
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
        await expect.poll(() => advisoryFrames.length, {
            message: 'the server did not deliver exactly four advisory frames'
        }).toBe(4);

        // The reading is four lines. Assert the two that make factual claims are present, without
        // pinning the numbers - those depend on the generated map, and standing-advisory.test.js
        // already checks they are true of it.
        const text = await feed.innerText();
        expect(text).toMatch(/collapsars are charted|mouths? (?:is|are) charted/i);
        expect(text).toMatch(/shoals? recorded|No shoals are recorded/i);

        // The mark. '⌖' is the charting kind; '→' is movement. Before the advisory had its own wire
        // prefix, the mouth and shoal lines wore the arrow, because their prose mentions fleets.
        const rendered = await page.evaluate(expectedLines => {
            const rows = [...document.querySelectorAll('#event-feed-list > div')]
                .map(element => element.textContent || '');
            return expectedLines.map(expected => {
                const row = rows.find(text => text.includes(expected)) || '';
                return {
                    found: Boolean(row),
                    chart: row.includes('⌖'),
                    movement: row.includes('→'),
                    snippet: row.trim().slice(0, 80)
                };
            });
        }, advisoryFrames);

        expect(rendered.every(row => row.found), `missing rendered advisory rows:\n${
            rendered.filter(row => !row.found).map(row => `  ${row.snippet}`).join('\n')}`).toBe(true);
        expect(rendered.every(row => row.chart), `advisory rows missing the chart mark:\n${
            rendered.filter(row => !row.chart).map(row => `  ${row.snippet}`).join('\n')}`).toBe(true);
        expect(rendered.some(row => row.movement), `advisory rows wearing the movement arrow:\n${
            rendered.filter(row => row.movement).map(row => `  ${row.snippet}`).join('\n')}`).toBe(false);

        expect(pageErrors, 'the page threw while the advisory arrived').toEqual([]);
    });
});
