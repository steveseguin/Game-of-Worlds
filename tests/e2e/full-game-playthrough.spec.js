const { test, expect } = require('@playwright/test');

function uniqueId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 8);
    const timePart = Date.now().toString(36);
    const slug = `${prefix}${randomPart}${timePart}`.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
    return slug.slice(0, 20);
}

async function waitForLobbyReady(page, timeout = 25000) {
    await page.waitForFunction(() => {
        const statusPill = document.getElementById('lobbyConnectionState');
        if (statusPill && statusPill.dataset && statusPill.dataset.state === 'ready') {
            return true;
        }

        const createBtn = document.getElementById('createGameBtn');
        return !!(
            window.websocket &&
            window.websocket.readyState === WebSocket.OPEN &&
            createBtn &&
            !createBtn.disabled
        );
    }, null, { timeout });
}

async function registerUser(page, { username, email, password }) {
    await page.goto('/login.html');
    await page.click('#registerTab');

    await page.fill('#registerUsername', username);
    await page.fill('#registerEmail', email);
    await page.fill('#registerPassword', password);
    await page.fill('#confirmPassword', password);

    const responsePromise = page.waitForResponse(res => res.url().endsWith('/register') && res.request().method() === 'POST');
    await page.click('#registerForm button[type="submit"]');
    const response = await responsePromise;
    const body = await response.json();
    if (!body.success) {
        throw new Error(`Registration failed for ${username}: ${body.error || 'Unknown error'}`);
    }

    await page.waitForURL('**/lobby.html', { timeout: 15000 });
    await waitForLobbyReady(page);
}

async function chooseFirstAvailableRace(page) {
    await page.waitForFunction(() => typeof window.RaceSelection !== 'undefined', {}, { timeout: 20000 }).catch(() => null);
    const deadline = Date.now() + 35000;

    while (Date.now() < deadline) {
        const modal = page.locator('#raceSelectionModal').first();
        const modalVisible = await modal.isVisible().catch(() => false);
        if (modalVisible) {
            const raceCard = page.locator('.race-card:not(.locked)').first();
            await raceCard.waitFor({ state: 'visible', timeout: 10000 });
            await raceCard.click();

            const confirmBtn = page.locator('#confirmRaceBtn');
            if (await confirmBtn.count() > 0) {
                await confirmBtn.click({ timeout: 10000 });
            }
            await modal.waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);
            return;
        }

        const waitingVisible = await page.locator('text=Waiting in Game').first().isVisible().catch(() => false);
        const playersVisible = await page.locator('text=/Players:/').first().isVisible().catch(() => false);
        const startVisible = await page.getByRole('button', { name: 'Start Game' }).first().isVisible().catch(() => false);
        if (waitingVisible || playersVisible || startVisible) {
            return;
        }

        await page.evaluate(() => {
            if (window.websocket && window.websocket.readyState === WebSocket.OPEN) {
                window.websocket.send('//getunlockedraces');
            }
        }).catch(() => null);
        await page.waitForTimeout(250);
    }

    throw new Error('Timed out selecting race or reaching lobby wait state');
}

async function getCookieValue(page, cookieName) {
    return page.evaluate(name => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    }, cookieName);
}

test.describe('Full multiplayer game playthrough', () => {
    test('host and joiner play through lobby -> game -> surrender -> winner', async ({ browser }) => {
        const hostContext = await browser.newContext();
        const hostPage = await hostContext.newPage();
        hostPage.on('dialog', dialog => dialog.accept());

        const joinerContext = await browser.newContext();
        const joinerPage = await joinerContext.newPage();
        joinerPage.on('dialog', dialog => dialog.accept());

        const hostName = uniqueId('host_');
        const joinerName = uniqueId('joiner_');
        const password = 'Secure123!';
        const gameName = uniqueId('play_');

        await registerUser(hostPage, {
            username: hostName,
            email: `${hostName}@example.com`,
            password
        });

        await hostPage.fill('#gameName', gameName);
        await hostPage.selectOption('#maxPlayers', '2');
        await hostPage.click('#createGameBtn');
        await chooseFirstAvailableRace(hostPage);
        await expect(hostPage.locator('text=Waiting in Game')).toBeVisible({ timeout: 10000 });

        await registerUser(joinerPage, {
            username: joinerName,
            email: `${joinerName}@example.com`,
            password
        });

        const joinerRow = joinerPage.locator('#gameList tr', { hasText: gameName });
        await expect(joinerRow).toBeVisible({ timeout: 10000 });
        await joinerRow.locator('button', { hasText: 'Join' }).click();
        await chooseFirstAvailableRace(joinerPage);

        await expect(joinerPage.locator('text=Waiting in Game')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage.locator('text=Players: 2/2')).toBeVisible({ timeout: 10000 });
        await expect(hostPage.locator('text=Players: 2/2')).toBeVisible({ timeout: 10000 });

        await hostPage.getByRole('button', { name: 'Start Game' }).click();

        await hostPage.waitForURL('**/game.html', { timeout: 15000 });
        await joinerPage.waitForURL('**/game.html', { timeout: 15000 });
        await expect(hostPage.locator('#resourceBar')).toBeVisible();
        await expect(joinerPage.locator('#resourceBar')).toBeVisible();

        // Gameplay interactions through real UI controls.
        await hostPage.click('#buildtab');
        await hostPage.click('#nextTurnBtn');
        await expect(hostPage.locator('#nextTurnText')).toContainText(/Turn|Game Start/, { timeout: 10000 });

        const hostUserId = await getCookieValue(hostPage, 'userId');
        await joinerPage.click('#surrenderBtn');

        // End-game winner modal should appear for both players.
        await expect(hostPage.locator('#gameOverModal')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage.locator('#gameOverModal')).toBeVisible({ timeout: 10000 });
        await expect(hostPage.locator('#gameOverTitle')).toHaveText('Victory');
        await expect(joinerPage.locator('#gameOverTitle')).toHaveText('Defeat');
        await expect(joinerPage.locator('#gameOverBody')).toContainText(`Player ${hostUserId} won`);
        await expect(hostPage.locator('#gameOverBody')).toContainText('Surrender');

        await hostContext.close();
        await joinerContext.close();
    });
});
