/**
 * Game Health E2E Tests
 *
 * These tests validate that the game runs without console errors,
 * failed network requests, or broken functionality.
 */
const { test, expect } = require('@playwright/test');

function uniqueId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 8);
    const timePart = Date.now().toString(36);
    return `${prefix}${randomPart}${timePart}`.slice(0, 20);
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

async function registerAndLogin(page, username, password, email) {
    await page.goto('/login.html');
    await page.click('#registerTab');
    await page.fill('#registerUsername', username);
    await page.fill('#registerEmail', email);
    await page.fill('#registerPassword', password);
    await page.fill('#confirmPassword', password);

    const responsePromise = page.waitForResponse(res =>
        res.url().endsWith('/register') && res.request().method() === 'POST'
    );
    await page.click('#registerForm button[type="submit"]');
    const response = await responsePromise;
    const body = await response.json();
    if (!body.success) {
        throw new Error(`Registration failed: ${body.error || 'Unknown error'}`);
    }

    // Do explicit login after registration (more reliable than relying on auto-redirect)
    await page.click('#loginTab');
    await page.fill('#loginUsername', username);
    await page.fill('#loginPassword', password);
    await page.click('#loginForm button[type="submit"]');
    await page.waitForTimeout(500);

    // Navigate to lobby if not already there
    if (!page.url().includes('lobby.html')) {
        await page.goto('/lobby.html');
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

function isOptionalExternalResource(url) {
    try {
        const host = new URL(url).hostname;
        return host === 'fonts.googleapis.com' ||
            host === 'fonts.gstatic.com' ||
            host === 'js.stripe.com';
    } catch {
        return false;
    }
}

function isBlockedByHarness(text) {
    return String(text || '').includes('ERR_NETWORK_ACCESS_DENIED') ||
        String(text || '').includes('ERR_BLOCKED_BY_CLIENT');
}

test.describe('Game Health Checks', () => {
    test.beforeEach(async ({ page }) => {
        page.on('dialog', dialog => dialog.accept());
    });

    test('game loads without critical console errors', async ({ page }) => {
        const consoleErrors = [];
        const networkErrors = [];

        // Capture console errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (!(text.includes('Failed to load resource') && isBlockedByHarness(text))) {
                    consoleErrors.push(text);
                }
            }
        });

        // Capture failed network requests
        page.on('response', response => {
            const status = response.status();
            const url = response.url();
            if (status >= 400 && !isOptionalExternalResource(url) && !url.includes('/ws')) {
                networkErrors.push(`${status} ${url}`);
            }
        });

        page.on('requestfailed', request => {
            const url = request.url();
            const errorText = request.failure()?.errorText || 'request failed';
            if (isOptionalExternalResource(url) && isBlockedByHarness(errorText)) {
                return;
            }
            networkErrors.push(`${errorText} ${url}`);
        });

        const username = uniqueId('health_');
        const password = 'Health123!';
        const email = `${username}@example.com`;

        // Register and get to lobby
        await registerAndLogin(page, username, password, email);

        // Create a game
        await page.fill('#gameName', uniqueId('Test_'));
        await page.selectOption('#maxPlayers', '2');
        await page.click('#createGameBtn');

        // Handle race selection
        await chooseFirstAvailableRace(page);

        // Wait for game to be created
        await expect(page.locator('text=Waiting in Game')).toBeVisible({ timeout: 10000 });

        // Start the game
        const startButton = page.locator('button', { hasText: 'Start Game' });
        await expect(startButton).toBeEnabled({ timeout: 10000 });
        await startButton.click();

        // Wait for game page to load
        await page.waitForURL('**/game.html', { timeout: 15000 });

        // Wait for game to initialize (resource bar should be visible)
        await expect(page.locator('#resourceBar')).toBeVisible({ timeout: 15000 });

        // Wait a bit for all async operations to complete
        await page.waitForTimeout(3000);

        // Check for critical errors
        const criticalConsoleErrors = consoleErrors.filter(e =>
            !e.includes('Warning:') &&
            !e.includes('DevTools') &&
            !e.includes('favicon')
        );

        // Report any errors found
        if (criticalConsoleErrors.length > 0) {
            console.log('Console errors found:', criticalConsoleErrors);
        }
        if (networkErrors.length > 0) {
            console.log('Network errors found:', networkErrors);
        }

        // Fail if there are critical errors
        expect(criticalConsoleErrors, 'No critical console errors').toHaveLength(0);
        expect(networkErrors, 'No failed local network requests').toHaveLength(0);
    });

    test('API endpoints return valid responses', async ({ page }) => {
        const username = uniqueId('api_');
        const password = 'Api12345!';
        const email = `${username}@example.com`;

        // Register to get a user ID
        await page.goto('/login.html');
        await page.click('#registerTab');
        await page.fill('#registerUsername', username);
        await page.fill('#registerEmail', email);
        await page.fill('#registerPassword', password);
        await page.fill('#confirmPassword', password);

        const responsePromise = page.waitForResponse(res =>
            res.url().endsWith('/register') && res.request().method() === 'POST'
        );
        await page.click('#registerForm button[type="submit"]');
        const response = await responsePromise;
        const body = await response.json();
        expect(body.success).toBe(true);

        const userId = body.userId;

        // Test balance endpoint
        const balanceResponse = await page.request.get(`/api/user/${userId}/balance`);
        expect(balanceResponse.status()).toBe(200);
        const balanceData = await balanceResponse.json();
        expect(balanceData).toHaveProperty('crystals');

        // Test owned items endpoint
        const ownedResponse = await page.request.get(`/api/user/${userId}/owned-items`);
        expect(ownedResponse.status()).toBe(200);
        const ownedData = await ownedResponse.json();
        expect(ownedData).toHaveProperty('items');
        expect(Array.isArray(ownedData.items)).toBe(true);

        // Test purchase history endpoint
        const historyResponse = await page.request.get(`/api/user/${userId}/purchase-history`);
        expect(historyResponse.status()).toBe(200);
        const historyData = await historyResponse.json();
        expect(historyData).toHaveProperty('history');
        expect(Array.isArray(historyData.history)).toBe(true);
    });
});
