const { test, expect } = require('@playwright/test');
const {
    uniqueId,
    registerUser,
    signInGuest,
    upgradeGuestToRegistered,
    createGame,
    joinGameByName,
    attemptJoinGameByNameExpectingError,
    startGame,
    dismissFirstRunGuidance,
    readTurnNumber,
    endTurnAll
} = require('./support/ui-game-harness');

test.describe('Hostile and recovery UI workflows', () => {
    test.setTimeout(240000);

    test('legacy index and protected pages route to the modern entry points', async ({ page }) => {
        await page.goto('/index.html');
        await expect(page).toHaveURL(/\/landing\.html$/);

        await page.context().clearCookies();
        await page.goto('/lobby.html');
        await expect(page).toHaveURL(/\/login\.html$/);
    });

    test('registered-only rooms reject guests, then accept the same user after upgrade', async ({ browser }) => {
        const hostContext = await browser.newContext();
        const guestContext = await browser.newContext();
        const hostPage = await hostContext.newPage();
        const guestPage = await guestContext.newPage();
        hostPage.on('dialog', dialog => dialog.accept());
        guestPage.on('dialog', dialog => dialog.accept());

        const hostName = uniqueId('reg_host_');
        const guestName = uniqueId('reg_guest_');
        const gameName = uniqueId('regonly_');
        const password = 'Secure123!';

        try {
            await registerUser(hostPage, {
                username: hostName,
                email: `${hostName}@example.com`,
                password
            });

            await createGame(hostPage, gameName, {
                maxPlayers: '2',
                mode: 'test',
                registeredOnly: true
            });
            await expect(hostPage.locator('.waiting-view')).toContainText('Registered', { timeout: 10000 });

            await signInGuest(guestPage);
            await attemptJoinGameByNameExpectingError(guestPage, gameName, /registered account/i);

            await upgradeGuestToRegistered(guestPage, {
                username: guestName,
                email: `${guestName}@example.com`,
                password
            });
            await joinGameByName(guestPage, gameName);

            await expect(hostPage.locator('.waiting-view')).toContainText('Players: 2/2', { timeout: 15000 });
            await expect(guestPage.locator('.slot-tag.registered').first()).toBeVisible({ timeout: 15000 });
        } finally {
            await hostContext.close();
            await guestContext.close();
        }
    });

    test('Lobby navigation preserves an active empire and explicit resignation remains destructive', async ({ browser }) => {
        const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const guestContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const hostPage = await hostContext.newPage();
        const guestPage = await guestContext.newPage();
        hostPage.on('dialog', dialog => dialog.accept());
        guestPage.on('dialog', dialog => dialog.accept());

        const hostName = uniqueId('leave_host_');
        const gameName = uniqueId('leaveflow_');
        const password = 'Secure123!';

        try {
            await registerUser(hostPage, {
                username: hostName,
                email: `${hostName}@example.com`,
                password
            });
            await createGame(hostPage, gameName, { maxPlayers: '2', mode: 'test' });

            await signInGuest(guestPage);
            await joinGameByName(guestPage, gameName);
            await startGame(hostPage, [hostPage, guestPage]);
            await dismissFirstRunGuidance(hostPage);
            await dismissFirstRunGuidance(guestPage);

            await hostPage.click('#leaveGameBtn');
            await hostPage.waitForURL('**/lobby.html', { timeout: 20000 });
            await expect(hostPage.locator('.waiting-view')).toContainText('In progress', { timeout: 15000 });
            await expect(hostPage.locator('.waiting-view')).toContainText('2 players');

            await hostPage.click('.open-game-banner');
            await hostPage.waitForURL('**/game.html', { timeout: 20000 });
            await dismissFirstRunGuidance(hostPage);

            await expect(guestPage).toHaveURL(/\/game\.html$/);
            const before = await readTurnNumber(guestPage);
            await endTurnAll([hostPage, guestPage], 1);
            await expect.poll(() => readTurnNumber(guestPage), {
                timeout: 15000,
                intervals: [300, 700, 1200]
            }).toBeGreaterThan(before);

            await guestPage.click('#leaveGameBtn');
            await guestPage.waitForURL('**/lobby.html', { timeout: 20000 });
            await expect(guestPage.locator('.waiting-view')).toContainText('2 players', { timeout: 15000 });
            await guestPage.click('button:has-text("Resign")');
            await expect(guestPage.locator('#createGameBtn')).toBeVisible({ timeout: 15000 });
        } finally {
            await hostContext.close();
            await guestContext.close();
        }
    });
});
