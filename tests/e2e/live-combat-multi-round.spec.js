const { test, expect } = require('@playwright/test');

function uniqueId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 8);
    const timePart = Date.now().toString(36);
    return `${prefix}${randomPart}${timePart}`.replace(/[^a-z0-9_-]/gi, '').slice(0, 20);
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

    await page.waitForURL('**/lobby.html', { timeout: 20000 });
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

async function waitForMatchLobby(page, timeout = 25000) {
    const waitingLabel = page.locator('text=Waiting in Game');
    const playersLabel = page.locator('text=/Players:/');
    const startButton = page.getByRole('button', { name: 'Start Game' });
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        await waitForLobbyReady(page, 2000).catch(() => null);
        if (await waitingLabel.count() > 0 && await waitingLabel.first().isVisible()) return;
        if (await playersLabel.count() > 0 && await playersLabel.first().isVisible()) return;
        if (await startButton.count() > 0 && await startButton.first().isVisible()) return;
        await page.evaluate(() => {
            if (window.websocket && window.websocket.readyState === WebSocket.OPEN) {
                window.websocket.send('//gamelist');
                window.websocket.send('//getunlockedraces');
            }
        }).catch(() => null);
        await page.waitForTimeout(250);
    }

    throw new Error('Timed out waiting for lobby match state');
}

async function extractLobbyGameId(page) {
    const heading = page.locator('h3', { hasText: 'Waiting in Game' }).first();
    if (await heading.count() === 0) {
        return null;
    }

    const text = await heading.textContent();
    const match = (text || '').match(/Waiting in Game\s+(\d+)/i);
    if (!match) {
        return null;
    }

    const gameId = Number.parseInt(match[1], 10);
    return Number.isFinite(gameId) ? gameId : null;
}

async function installBattleCounter(page) {
    await page.evaluate(() => {
        if (window.__battleCounterInstalled) {
            return;
        }
        window.__battleCount = 0;
        if (window.BattleSystem && typeof window.BattleSystem.createBattleVisualization === 'function') {
            const original = window.BattleSystem.createBattleVisualization.bind(window.BattleSystem);
            window.BattleSystem.createBattleVisualization = function wrappedBattleVisualization(...args) {
                window.__battleCount += 1;
                return original(...args);
            };
        }
        window.__battleCounterInstalled = true;
    });
}

async function getBattleCount(page) {
    return page.evaluate(() => Number(window.__battleCount) || 0);
}

async function clearBattleOverlay(page) {
    const battleGround = page.locator('#battleGround');
    if (await battleGround.count() > 0 && await battleGround.first().isVisible()) {
        await page.locator('#stopBattle').click();
        await expect(page.locator('#battleGround')).toHaveCount(0, { timeout: 6000 });
    }
}

async function moveSelectedShipTypeToSector(page, targetTileId, shipTypeText) {
    const tile = page.locator(`#tile${targetTileId}`);
    await tile.waitFor({ state: 'visible', timeout: 10000 });

    let opened = false;
    for (let attempt = 0; attempt < 4; attempt++) {
        await tile.click();
        try {
            await expect(page.locator('#multiMove')).toBeVisible({ timeout: 2500 });
            opened = true;
            break;
        } catch {
            await page.waitForTimeout(250);
        }
    }

    if (!opened) {
        throw new Error(`Multi-move dialog failed to open for tile ${targetTileId}`);
    }

    const option = page.locator('#shipsFromNearBy option', { hasText: new RegExp(shipTypeText, 'i') }).first();
    await expect(option).toBeVisible({ timeout: 6000 });
    const optionValue = await option.getAttribute('value');
    if (!optionValue) {
        throw new Error(`No selectable ${shipTypeText} option value found for tile ${targetTileId}`);
    }
    await page.selectOption('#shipsFromNearBy', optionValue);

    await page.click('#moveSelectedShips');
    await expect(page.locator('#multiMove')).toBeHidden({ timeout: 6000 });
    await page.waitForTimeout(120);
}

async function marchShip(page, path, shipTypeText) {
    for (const tileId of path) {
        await moveSelectedShipTypeToSector(page, tileId, shipTypeText);
    }
}

test.describe('Live two-client combat with multiple rounds', () => {
    test.setTimeout(420000);

    test('players fight two real battle rounds (scouts then battleships) through UI only', async ({ browser }) => {
        const hostContext = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
        const joinerContext = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
        const hostPage = await hostContext.newPage();
        const joinerPage = await joinerContext.newPage();

        hostPage.on('dialog', dialog => dialog.accept());
        joinerPage.on('dialog', dialog => dialog.accept());

        const hostName = uniqueId('combat_host_');
        const joinerName = uniqueId('combat_join_');
        const gameName = uniqueId('combat_match_');
        const password = 'Secure123!';

        await registerUser(hostPage, {
            username: hostName,
            email: `${hostName}@example.com`,
            password
        });

        await hostPage.fill('#gameName', gameName);
        await hostPage.selectOption('#maxPlayers', '2');
        await hostPage.selectOption('#gameMode', 'quick');
        await hostPage.click('#createGameBtn');
        await chooseFirstAvailableRace(hostPage);
        await waitForMatchLobby(hostPage);
        const lobbyGameId = await extractLobbyGameId(hostPage);

        await registerUser(joinerPage, {
            username: joinerName,
            email: `${joinerName}@example.com`,
            password
        });
        const row = joinerPage.locator('#gameList tr', { hasText: gameName });
        await expect(row).toBeVisible({ timeout: 15000 });
        await row.locator('button', { hasText: 'Join' }).click();
        await chooseFirstAvailableRace(joinerPage);
        await waitForMatchLobby(joinerPage);

        await hostPage.getByRole('button', { name: 'Start Game' }).click();
        await hostPage.waitForURL('**/game.html', { timeout: 20000 });
        await joinerPage.waitForURL('**/game.html', { timeout: 20000 });
        await expect(hostPage.locator('#resourceBar')).toBeVisible({ timeout: 20000 });
        await expect(joinerPage.locator('#resourceBar')).toBeVisible({ timeout: 20000 });

        await installBattleCounter(hostPage);
        await installBattleCounter(joinerPage);

        const hostPathToMid = [1, 2, 3, 4, 5, 6];
        const joinerPathToMid = [12, 11, 10, 9, 8, 7, 6];

        // Round 1: scout-vs-scout engagement
        await marchShip(hostPage, hostPathToMid, 'Scout');
        await marchShip(joinerPage, joinerPathToMid, 'Scout');
        await hostPage.click('#nextTurnBtn');

        await expect(hostPage.locator('#battleGround')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage.locator('#battleGround')).toBeVisible({ timeout: 10000 });
        await clearBattleOverlay(hostPage);
        await clearBattleOverlay(joinerPage);

        // Round 2: battleship-vs-battleship engagement
        await marchShip(hostPage, hostPathToMid, 'Battleship');
        await marchShip(joinerPage, joinerPathToMid, 'Battleship');
        await hostPage.click('#nextTurnBtn');

        await expect(hostPage.locator('#battleGround')).toBeVisible({ timeout: 10000 });
        await expect(joinerPage.locator('#battleGround')).toBeVisible({ timeout: 10000 });
        await clearBattleOverlay(hostPage);
        await clearBattleOverlay(joinerPage);

        const hostBattleCount = await getBattleCount(hostPage);
        const joinerBattleCount = await getBattleCount(joinerPage);

        expect(hostBattleCount).toBeGreaterThanOrEqual(2);
        expect(joinerBattleCount).toBeGreaterThanOrEqual(2);

        expect(lobbyGameId).toBeTruthy();
        const telemetryResponse = await hostPage.request.get(`/api/game/${lobbyGameId}/combat-telemetry`);
        expect(telemetryResponse.status()).toBe(200);
        const telemetry = await telemetryResponse.json();
        expect(Number(telemetry.gameId)).toBe(Number(lobbyGameId));
        expect(Number(telemetry.battles)).toBeGreaterThanOrEqual(2);

        const hostUserId = Number(await getCookieValue(hostPage, 'userId'));
        const hostTelemetry = (telemetry.players || []).find(player => Number(player.playerId) === hostUserId);
        expect(hostTelemetry).toBeTruthy();
        const activeHostShipStats = (hostTelemetry.shipStats || []).filter(stat =>
            (Number(stat.shots) || 0) > 0 ||
            (Number(stat.kills) || 0) > 0 ||
            (Number(stat.losses) || 0) > 0
        );
        expect(activeHostShipStats.length).toBeGreaterThan(0);

        await hostPage.click('#analyticstab');
        await expect(hostPage.locator('#analytics')).toBeVisible({ timeout: 10000 });
        await hostPage.click('#combatAnalyticsRefresh');
        await expect.poll(async () => {
            const text = await hostPage.locator('#combatAnalyticsBattleCount').textContent();
            return Number.parseInt((text || '0').trim(), 10) || 0;
        }, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
        await expect(hostPage.locator('#combatAnalyticsRecent')).toContainText('Sector', { timeout: 10000 });

        await hostContext.close();
        await joinerContext.close();
    });
});
