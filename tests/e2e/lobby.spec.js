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

    await page.click('#loginTab');
    await page.fill('#loginUsername', username);
    await page.fill('#loginPassword', password);

    await page.click('#loginForm button[type="submit"]');
    await page.waitForTimeout(1000);
    const loginError = await page.evaluate(() => {
        const el = document.getElementById('loginError');
        return el ? el.textContent : '';
    });
    if (loginError && loginError.trim()) {
        throw new Error(`Login failed for ${username}: ${loginError.trim()}`);
    }
    const postLoginState = await page.evaluate(() => ({
        href: window.location.href,
        cookies: document.cookie
    }));
    if (!postLoginState.href.includes('/lobby.html')) {
        await page.goto('/lobby.html');
    }
    const currentUrl = page.url();
    if (!currentUrl.includes('lobby.html')) {
        throw new Error(`Failed to load lobby page after login, current URL: ${currentUrl}`);
    }
    await waitForLobbyReady(page);
}

async function chooseFirstAvailableRace(page) {
    try {
        await page.waitForFunction(() => typeof window.RaceSelection !== 'undefined', {}, { timeout: 20000 });
    } catch {
        return;
    }

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

test.describe('Lobby end-to-end flows', () => {
    test.beforeEach(async ({ page }) => {
        page.on('dialog', dialog => dialog.accept());
    });

    test('creator can register, create a game, and start solo', async ({ page }) => {
        const username = uniqueId('host_');
        const password = 'Secure123!';
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password
        });

        await expect.poll(() => page.evaluate(() => window.SoundSystem?.getMusicState?.().context), {
            timeout: 10000
        }).toBe('lobby');
        const contextPlaylists = await page.evaluate(() => {
            window.SoundSystem.playContextualMusic('launch');
            const launch = window.SoundSystem.getMusicState();
            window.SoundSystem.playContextualMusic('lobby');
            return { launch, lobby: window.SoundSystem.getMusicState() };
        });
        expect(contextPlaylists.launch.playlist).toBe('launch');
        expect(contextPlaylists.lobby.playlist).toBe('lobby');

        const gameName = uniqueId('Solo_');

        await page.fill('#gameName', gameName);
        await page.selectOption('#maxPlayers', '2');

        await page.click('#createGameBtn');
        await chooseFirstAvailableRace(page);

        await expect(page.locator('text=Waiting in Game')).toBeVisible();

        const startButton = page.locator('button', { hasText: 'Start Game' });
        await expect(startButton).toBeEnabled({ timeout: 10000 });

        await startButton.click();
        await page.waitForURL('**/game.html', { timeout: 15000 });
        await expect(page.locator('#resourceBar')).toBeVisible();
    });

    test('race selector keeps dossiers readable without overlap at desktop and mobile sizes', async ({ page }) => {
        const username = uniqueId('race_ui_');
        const password = 'Secure123!';
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password
        });

        await page.fill('#gameName', uniqueId('Race_UI_'));
        await page.selectOption('#maxPlayers', '2');
        await page.click('#createGameBtn');

        const modal = page.locator('#raceSelectionModal');
        await expect(modal).toBeVisible({ timeout: 20000 });
        await expect(page.locator('.race-card')).toHaveCount(12);
        await expect(page.locator('.race-card.active')).toHaveCount(1);

        const desktopLayout = await page.evaluate(() => {
            const cards = [...document.querySelectorAll('.race-card')];
            const rects = cards.map(card => card.getBoundingClientRect());
            const overlaps = [];
            for (let i = 0; i < rects.length; i++) {
                for (let j = i + 1; j < rects.length; j++) {
                    const a = rects[i];
                    const b = rects[j];
                    if (Math.min(a.right, b.right) > Math.max(a.left, b.left)
                        && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) {
                        overlaps.push([i, j]);
                    }
                }
            }
            const container = document.querySelector('.race-selection-container').getBoundingClientRect();
            const grid = document.querySelector('.race-grid-shell').getBoundingClientRect();
            const detail = document.querySelector('.race-detail-panel').getBoundingClientRect();
            return {
                overlaps,
                clippedCards: cards.filter(card => card.scrollHeight > card.clientHeight + 1).length,
                contained: container.left >= 0 && container.top >= 0
                    && container.right <= innerWidth && container.bottom <= innerHeight,
                columnsSeparated: grid.right <= detail.left
            };
        });
        expect(desktopLayout).toEqual({
            overlaps: [],
            clippedCards: 0,
            contained: true,
            columnsSeparated: true
        });

        const lockedCard = page.locator('.race-card.locked').filter({ hasText: 'Silicon Collective' });
        await lockedCard.click();
        await expect(page.locator('.race-detail-header')).toContainText('Silicon Collective');
        await expect(page.locator('#confirmRaceBtn')).toBeDisabled();

        await page.setViewportSize({ width: 390, height: 844 });
        const mobileLayout = await page.evaluate(() => {
            const grid = document.querySelector('.race-grid');
            const shell = document.querySelector('.race-grid-shell').getBoundingClientRect();
            const detail = document.querySelector('.race-detail-panel').getBoundingClientRect();
            const styles = getComputedStyle(grid);
            return {
                horizontalRoster: styles.overflowX === 'auto',
                noNestedVerticalRoster: styles.overflowY === 'hidden',
                detailBelowRoster: shell.bottom <= detail.top,
                detailNotSticky: getComputedStyle(document.querySelector('.race-detail-panel')).position !== 'sticky',
                detailStatsTwoColumns: getComputedStyle(document.querySelector('.race-detail-grid')).gridTemplateColumns.split(' ').length === 2
            };
        });
        expect(mobileLayout).toEqual({
            horizontalRoster: true,
            noNestedVerticalRoster: true,
            detailBelowRoster: true,
            detailNotSticky: true,
            detailStatsTwoColumns: true
        });

        const terranCard = page.locator('.race-card.unlocked').filter({ hasText: 'Terran Empire' });
        await terranCard.click();
        await expect(page.locator('#confirmRaceBtn')).toBeEnabled();
        await page.locator('#confirmRaceBtn').click();
        await expect(page.locator('.waiting-view')).toBeVisible({ timeout: 15000 });
        await page.getByRole('button', { name: 'Leave Game' }).click();
        await expect(page.locator('#createGameBtn')).toBeVisible({ timeout: 15000 });
    });

    test('host and joiner can start a full game', async ({ browser }) => {
        const hostContext = await browser.newContext();
        const hostPage = await hostContext.newPage();
        hostPage.on('dialog', dialog => dialog.accept());

        const joinerContext = await browser.newContext();
        const joinerPage = await joinerContext.newPage();
        joinerPage.on('dialog', dialog => dialog.accept());

        const hostName = uniqueId('host_');
        const joinerName = uniqueId('joiner_');
        const password = 'Secure123!';
        const gameName = uniqueId('Versus_');

        await registerUser(hostPage, {
            username: hostName,
            email: `${hostName}@example.com`,
            password
        });

        await hostPage.fill('#gameName', gameName);
        await hostPage.selectOption('#maxPlayers', '2');
        await hostPage.click('#createGameBtn');
        await chooseFirstAvailableRace(hostPage);
        await expect(hostPage.locator('text=Waiting in Game')).toBeVisible();

        await registerUser(joinerPage, {
            username: joinerName,
            email: `${joinerName}@example.com`,
            password
        });

        const joinerRow = joinerPage.locator('#gameList tr', { hasText: gameName });
        await expect(joinerRow).toBeVisible({ timeout: 10000 });
        await joinerRow.locator('button', { hasText: 'Join' }).click();

        await chooseFirstAvailableRace(joinerPage);

        await expect(joinerPage.locator('text=Waiting in Game')).toBeVisible();
        await expect(joinerPage.locator('text=Players: 2/2')).toBeVisible({ timeout: 10000 });
        await expect(hostPage.locator('text=Players: 2/2')).toBeVisible({ timeout: 10000 });

        const startButton = hostPage.locator('button', { hasText: 'Start Game' });
        await expect(startButton).toBeEnabled({ timeout: 10000 });
        await startButton.click();

        await hostPage.waitForURL('**/game.html', { timeout: 15000 });
        await joinerPage.waitForURL('**/game.html', { timeout: 15000 });

        await expect(hostPage.locator('#resourceBar')).toBeVisible();
        await expect(joinerPage.locator('#resourceBar')).toBeVisible();

        await hostContext.close();
        await joinerContext.close();
    });
});
