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
        if (window.Battle3D && typeof window.Battle3D.createBattleVisualization === 'function') {
            const original3d = window.Battle3D.createBattleVisualization.bind(window.Battle3D);
            window.Battle3D.createBattleVisualization = function wrapped3dBattleVisualization(...args) {
                window.__battleCount += 1;
                return original3d(...args);
            };
        }
        window.__battleCounterInstalled = true;
    });
}

async function getBattleCount(page) {
    return page.evaluate(() => Number(window.__battleCount) || 0);
}

async function readFocusedSectorId(page) {
    await expect(page.locator('#sectorid')).toContainText(/Sector\s+\d+/i, { timeout: 15000 });
    const text = await page.locator('#sectorid').textContent();
    const match = (text || '').match(/Sector\s+(\d+)/i);
    if (!match) {
        throw new Error(`Could not read focused sector from UI: ${text || '(empty)'}`);
    }
    return Number.parseInt(match[1], 10);
}

function sectorToPoint(sectorId, width) {
    const zero = sectorId - 1;
    return { x: zero % width, y: Math.floor(zero / width) };
}

function pointToSector(point, width) {
    return point.y * width + point.x + 1;
}

function buildGridPath(fromSector, toSector, width = 14) {
    const path = [fromSector];
    const current = sectorToPoint(fromSector, width);
    const target = sectorToPoint(toSector, width);

    while (current.x !== target.x || current.y !== target.y) {
        if (current.x < target.x) current.x += 1;
        else if (current.x > target.x) current.x -= 1;

        if (current.y < target.y) current.y += 1;
        else if (current.y > target.y) current.y -= 1;

        path.push(pointToSector(current, width));
    }

    return path;
}

function adjacentSectors(sectorId, width = 14, height = 8) {
    const point = sectorToPoint(sectorId, width);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const next = { x: point.x + dx, y: point.y + dy };
            if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) continue;
            out.push(pointToSector(next, width));
        }
    }
    return out;
}

function buildSafeGridPath(fromSector, toSector, blocked = new Set(), width = 14, height = 8) {
    const queue = [fromSector];
    const previous = new Map([[fromSector, null]]);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === toSector) {
            const path = [];
            let cursor = current;
            while (cursor !== null) {
                path.push(cursor);
                cursor = previous.get(cursor);
            }
            return path.reverse();
        }

        for (const next of adjacentSectors(current, width, height)) {
            if (previous.has(next)) continue;
            if (next !== toSector && next !== fromSector && blocked.has(next)) continue;
            previous.set(next, current);
            queue.push(next);
        }
    }

    return buildGridPath(fromSector, toSector, width);
}

async function readTestTerrain(page, gameId) {
    const response = await page.request.get(`/api/game/${gameId}/test-map-terrain`);
    expect(response.status()).toBe(200);
    const payload = await response.json();
    const sectors = Array.isArray(payload.sectors) ? payload.sectors : [];
    const width = Math.max(...sectors.map(sector => Number(sector.x) || 0)) + 1;
    const height = Math.max(...sectors.map(sector => Number(sector.y) || 0)) + 1;
    const blocked = new Set(
        sectors
            .filter(sector => [1, 2, 3].includes(Number(sector.type)))
            .map(sector => Number(sector.sectorid))
            .filter(Number.isFinite)
    );
    return { blocked, width: width || 14, height: height || 8 };
}

function splitRendezvousPaths(hostHome, joinerHome, blocked = new Set(), width = 14, height = 8) {
    const fullPath = buildSafeGridPath(hostHome, joinerHome, blocked, width, height);
    if (fullPath.length < 3) {
        throw new Error(`Homeworlds are too close for a two-sided march: ${hostHome}, ${joinerHome}`);
    }
    const midIndex = Math.max(1, Math.min(fullPath.length - 2, Math.floor(fullPath.length / 2)));
    return {
        rendezvous: fullPath[midIndex],
        hostPath: fullPath.slice(1, midIndex + 1),
        joinerPath: fullPath.slice(midIndex, fullPath.length - 1).reverse()
    };
}

async function clearBattleOverlay(page) {
    const battleGround = page.locator('#battleGround');
    if (await battleGround.count() > 0 && await battleGround.first().isVisible()) {
        await page.locator('#stopBattle').click();
        await expect(page.locator('#battleGround')).toHaveCount(0, { timeout: 6000 });
        return;
    }

    const battle3dSkip = page.locator('#battleTheater.on #b3dSkip');
    if (await battle3dSkip.count() > 0 && await battle3dSkip.first().isVisible()) {
        await battle3dSkip.click();
        await expect.poll(async () => page.evaluate(() => !document.querySelector('#battleTheater.on')), {
            timeout: 6000
        }).toBe(true);
    }
}

async function expectBattleTheaterVisible(page) {
    await expect.poll(async () => page.evaluate(() => {
        const fallback = document.getElementById('battleGround');
        const fallbackVisible = !!fallback &&
            fallback.offsetWidth > 0 &&
            fallback.offsetHeight > 0 &&
            getComputedStyle(fallback).display !== 'none' &&
            getComputedStyle(fallback).visibility !== 'hidden';
        const theaterVisible = !!document.querySelector('#battleTheater.on #b3dSkip');
        return fallbackVisible || theaterVisible;
    }), {
        timeout: 15000
    }).toBe(true);
}

async function waitForBattlePauseClear(page) {
    await expect.poll(async () => page.evaluate(() => {
        const frozen = Boolean(window.__battleFreezeUntil && window.__battleFreezeUntil > Date.now());
        const theaterActive = Boolean(document.querySelector('#battleTheater.on'));
        const fallbackActive = Boolean(document.getElementById('battleGround'));
        return !frozen && !theaterActive && !fallbackActive;
    }), {
        timeout: 30000
    }).toBe(true);
}

async function advanceTurnBoth(hostPage, joinerPage) {
    await expect(hostPage.locator('#nextTurnBtn')).toBeEnabled({ timeout: 30000 });
    await expect(joinerPage.locator('#nextTurnBtn')).toBeEnabled({ timeout: 30000 });
    await hostPage.click('#nextTurnBtn');
    await joinerPage.click('#nextTurnBtn');
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

    test('players fight two real battle rounds (scouts then colony ships) through UI only', async ({ browser }) => {
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

        const hostHome = await readFocusedSectorId(hostPage);
        const joinerHome = await readFocusedSectorId(joinerPage);
        const terrain = await readTestTerrain(hostPage, lobbyGameId);
        const { rendezvous, hostPath: hostPathToMid, joinerPath: joinerPathToMid } = splitRendezvousPaths(
            hostHome,
            joinerHome,
            terrain.blocked,
            terrain.width,
            terrain.height
        );
        console.log(`Combat rendezvous sector ${rendezvous}; host path ${hostPathToMid.join('>')}; joiner path ${joinerPathToMid.join('>')}`);

        // Round 1: scout-vs-scout engagement
        await marchShip(hostPage, hostPathToMid, 'Scout');
        await marchShip(joinerPage, joinerPathToMid, 'Scout');
        await advanceTurnBoth(hostPage, joinerPage);

        await expectBattleTheaterVisible(hostPage);
        await expectBattleTheaterVisible(joinerPage);
        await clearBattleOverlay(hostPage);
        await clearBattleOverlay(joinerPage);
        await Promise.all([
            waitForBattlePauseClear(hostPage),
            waitForBattlePauseClear(joinerPage)
        ]);

        // Round 2: the other starter ship is the colony ship.
        await marchShip(hostPage, hostPathToMid, 'Colony Ship');
        await marchShip(joinerPage, joinerPathToMid, 'Colony Ship');
        await advanceTurnBoth(hostPage, joinerPage);

        await expectBattleTheaterVisible(hostPage);
        await expectBattleTheaterVisible(joinerPage);
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

        expect((telemetry.recentBattles || []).length).toBeGreaterThanOrEqual(2);

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
