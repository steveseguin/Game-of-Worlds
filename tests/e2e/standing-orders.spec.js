// Standing orders: the server has applied these every turn for a long time, over EVERY
// player, with mode defaults that turn auto-rebuild and auto-scout ON in Epic. The panel
// that controlled them had been deleted ("UI removed for humans"), but the automation was
// never restricted to AI — so an Epic player had metal and crystal spent for them by
// settings they could not see, could not change, and were only told about through a
// message that arrived with its wire prefix still attached.
//
// The panel is back and the server now leaves humans alone until they opt in. This checks
// the whole loop through a real browser: the controls exist, they reflect server state,
// a change reaches the server, and asking the server again returns what was stored.
//
// Wiring is the part that broke in development, and unit tests could not have caught it:
// the first version hooked the startgame:: handler, which never fires when you land on
// game.html for a match already in progress, leaving the panel inert on screen.

const { test, expect } = require('@playwright/test');
const harness = require('./support/ui-game-harness');

async function openGameOnAnalytics(page, tag) {
    await harness.signInGuest(page, `${tag}${Date.now().toString(36)}`);
    await harness.waitForLobbyReady(page);
    await harness.createGame(page, `${tag} ${Date.now()}`, { maxPlayers: '2' });
    await page.getByRole('button', { name: /Fill with AI/i }).click();
    await page.waitForURL(/game\.html/, { timeout: 30000 });
    await page.waitForSelector('#controlPadGUI', { timeout: 30000 });
    await harness.dismissFirstRunGuidance(page).catch(() => {});
    await page.click('#analyticstab');
    await page.waitForTimeout(400);
}

/** Ask the server what it holds, and report what the controls then show. */
function refetchFromServer(page) {
    return page.evaluate(() => {
        window.websocket.send('//standingorders:get');
        return new Promise(resolve => setTimeout(() => resolve({
            rebuild: document.getElementById('soAutoRebuild').checked,
            scout: document.getElementById('soAutoScout').checked,
            target: document.getElementById('soTargetScouts').value,
            status: document.getElementById('standingOrdersStatus').textContent.trim()
        }), 700));
    });
}

test.describe('Standing orders', () => {
    test('a new player starts un-automated, and the panel says so', async ({ page }) => {
        test.setTimeout(180000);
        await openGameOnAnalytics(page, 'sofresh');

        const initial = await page.evaluate(() => ({
            rebuild: document.getElementById('soAutoRebuild').checked,
            scout: document.getElementById('soAutoScout').checked,
            targetDisabled: document.getElementById('soTargetScouts').disabled,
            status: document.getElementById('standingOrdersStatus').textContent.trim()
        }));

        expect(initial.rebuild, 'nothing should be automated before the player asks').toBe(false);
        expect(initial.scout).toBe(false);
        // Proves syncStandingOrdersUI actually ran: nothing in the markup disables this.
        expect(initial.targetDisabled,
            'the scout count should be disabled while auto-scout is off - if this is false '
            + 'the sync never ran and the panel is inert').toBe(true);
        expect(initial.status).toMatch(/off/i);
    });

    test('choosing orders reaches the server and survives a refetch', async ({ page }) => {
        test.setTimeout(180000);
        await openGameOnAnalytics(page, 'soset');

        await page.check('#soAutoRebuild');
        await page.check('#soAutoScout');
        await page.fill('#soTargetScouts', '4');
        await page.dispatchEvent('#soTargetScouts', 'change');
        await page.waitForTimeout(500);

        // The round trip is the point: this reads back what the SERVER stored, not what
        // the checkbox happens to be showing.
        const echoed = await refetchFromServer(page);
        expect(echoed.rebuild).toBe(true);
        expect(echoed.scout).toBe(true);
        expect(echoed.target).toBe('4');
        expect(echoed.status).toMatch(/rebuilding home economy/i);
        expect(echoed.status).toMatch(/4 scouts/i);
    });

    test('turning them off again reaches the server too', async ({ page }) => {
        test.setTimeout(180000);
        await openGameOnAnalytics(page, 'sooff');

        await page.check('#soAutoRebuild');
        await page.waitForTimeout(400);
        await page.uncheck('#soAutoRebuild');
        await page.waitForTimeout(400);

        const echoed = await refetchFromServer(page);
        expect(echoed.rebuild, 'unchecking must persist, or the off switch is decorative').toBe(false);
        expect(echoed.status).toMatch(/off/i);
    });
});
