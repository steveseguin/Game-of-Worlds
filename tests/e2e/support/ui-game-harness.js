const { expect } = require('@playwright/test');

function uniqueId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 8);
    const timePart = Date.now().toString(36);
    return `${prefix}${randomPart}${timePart}`.replace(/[^a-z0-9_-]/gi, '').toLowerCase().slice(0, 20);
}

function parseNumber(text) {
    const match = String(text || '').match(/-?\d+/);
    return match ? Number.parseInt(match[0], 10) : 0;
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

async function signInGuest(page, guestName = '') {
    await page.goto('/login.html');
    if (guestName) {
        await page.fill('#guestUsername', guestName);
    }
    const responsePromise = page.waitForResponse(res => res.url().endsWith('/guest-login') && res.request().method() === 'POST');
    await page.click('#guestLoginBtn');
    const response = await responsePromise;
    if (response.status() >= 400) {
        throw new Error(`Guest sign-in failed with HTTP ${response.status()}`);
    }
    await page.waitForURL('**/lobby.html', { timeout: 20000 }).catch(async error => {
        const visibleError = await page.locator('#guestError').textContent().catch(() => '');
        throw new Error(`Guest sign-in did not reach lobby: ${visibleError || error.message}`);
    });
    await waitForLobbyReady(page);
}

async function upgradeGuestToRegistered(page, { username, email, password }) {
    const guestUserId = await page.evaluate(() => localStorage.getItem('userId'));
    await page.goto('/login.html?upgrade=1');
    await expect(page.locator('#upgradeNotice')).toBeVisible({ timeout: 10000 });
    await page.fill('#registerUsername', username);
    await page.fill('#registerEmail', email);
    await page.fill('#registerPassword', password);
    await page.fill('#confirmPassword', password);

    const responsePromise = page.waitForResponse(res => res.url().endsWith('/register') && res.request().method() === 'POST');
    await page.click('#registerForm button[type="submit"]');
    const response = await responsePromise;
    const body = await response.json();
    if (!body.success || !body.upgraded) {
        throw new Error(`Guest upgrade failed for ${username}: ${body.error || 'not upgraded'}`);
    }

    await page.waitForURL('**/lobby.html', { timeout: 20000 });
    await waitForLobbyReady(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('gowIsGuest')), {
        timeout: 5000
    }).toBe('0');
    if (guestUserId) {
        await expect.poll(() => page.evaluate(() => localStorage.getItem('userId')), {
            timeout: 5000
        }).toBe(guestUserId);
    }
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

async function chooseFirstAvailableRace(page) {
    const modal = page.locator('#raceSelectionModal').first();
    await expect(modal).toBeVisible({ timeout: 30000 });

    const selected = page.locator('.race-card.unlocked.active').first();
    if (await selected.count() === 0 || !(await selected.isVisible().catch(() => false))) {
        await page.locator('.race-card.unlocked').first().click();
    }

    await page.click('#confirmRaceBtn');
    await expect(modal).toBeHidden({ timeout: 15000 });
}

async function waitForMatchLobby(page, timeout = 25000) {
    const waitingView = page.locator('.waiting-view').first();
    await expect(waitingView).toBeVisible({ timeout });
}

async function extractLobbyGameId(page) {
    await waitForMatchLobby(page);
    const text = await page.locator('.waiting-eyebrow').first().textContent();
    const match = String(text || '').match(/Game\s+(\d+)/i);
    if (!match) {
        throw new Error(`Could not read waiting room game ID from: ${text || '(empty)'}`);
    }
    return Number.parseInt(match[1], 10);
}

async function createGame(page, gameName, { maxPlayers = '2', mode = 'quick', registeredOnly = false, minLevel = '0' } = {}) {
    await waitForLobbyReady(page);
    await page.fill('#gameName', gameName);
    await page.selectOption('#maxPlayers', String(maxPlayers));
    await page.selectOption('#gameMode', mode);
    await page.locator('#registeredOnly').setChecked(Boolean(registeredOnly));
    await page.selectOption('#minLevel', String(minLevel));
    await page.click('#createGameBtn');
    await chooseFirstAvailableRace(page);
    await waitForMatchLobby(page);
    return extractLobbyGameId(page);
}

async function joinGameByName(page, gameName) {
    await waitForLobbyReady(page);
    const row = page.locator('#gameList tr', { hasText: gameName }).first();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (await row.isVisible().catch(() => false)) {
            break;
        }
        await page.click('#refreshGamesBtn');
        await page.waitForTimeout(500);
    }
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button', { hasText: 'Join' }).click();
    await chooseFirstAvailableRace(page);
    await waitForMatchLobby(page);
}

async function attemptJoinGameByNameExpectingError(page, gameName, expectedText) {
    await waitForLobbyReady(page);
    const row = page.locator('#gameList tr', { hasText: gameName }).first();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (await row.isVisible().catch(() => false)) {
            break;
        }
        await page.click('#refreshGamesBtn');
        await page.waitForTimeout(500);
    }
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button', { hasText: 'Join' }).click();
    await chooseFirstAvailableRace(page);
    await expect(page.locator('.toast-error')).toContainText(expectedText, { timeout: 10000 });
    await expect(page.locator('.waiting-view')).toHaveCount(0, { timeout: 2000 });
}

async function startGame(hostPage, playerPages) {
    await hostPage.getByRole('button', { name: /Start Game/i }).click();
    await Promise.all(playerPages.map(page => page.waitForURL('**/game.html', { timeout: 25000 })));
    await Promise.all(playerPages.map(page => expect(page.locator('#resourceBar')).toBeVisible({ timeout: 25000 })));
    await Promise.all(playerPages.map(page => expect(page.locator('#nextTurnBtn')).toBeVisible({ timeout: 25000 })));
}

async function dismissFirstRunGuidance(page) {
    const tourDismiss = page.locator('#tour-skip');
    if (await tourDismiss.isVisible().catch(() => false)) {
        await expect(tourDismiss).toHaveText(/Dismiss/i);
        await tourDismiss.click();
        await expect(tourDismiss).toBeHidden({ timeout: 5000 });
        await expectTourDismissalSaved(page);
    }
}

async function completeFirstRunGuidance(page) {
    const nextButton = page.locator('#tour-next');
    if (!(await nextButton.isVisible().catch(() => false))) {
        return;
    }

    for (let i = 0; i < 8; i++) {
        const label = await nextButton.textContent();
        if (/done/i.test(label || '')) {
            await nextButton.click();
            await expect(nextButton).toBeHidden({ timeout: 5000 });
            await expectTourDismissalSaved(page);
            return;
        }
        await nextButton.click();
    }

    throw new Error('Tutorial never reached the Done action');
}

async function expectTourDismissalSaved(page) {
    await expect.poll(async () => page.evaluate(() => {
        const key = 'gow-tour-dismissed-v1';
        return localStorage.getItem(key) || sessionStorage.getItem(key);
    }), {
        timeout: 5000,
        intervals: [100, 250, 500]
    }).toBe('1');
}

async function verifyFirstRunGuidanceStaysDismissed(page) {
    await page.evaluate(() => {
        if (window.Tour && typeof window.Tour.start === 'function') {
            window.Tour.start(false);
        }
    });
    await expect(page.locator('#tour-bubble')).toHaveCount(0, { timeout: 1000 });
}

async function readFocusedSectorId(page) {
    await expect(page.locator('#sectorid')).toContainText(/Sector\s+\d+/i, { timeout: 15000 });
    const text = await page.locator('#sectorid').textContent();
    const match = String(text || '').match(/Sector\s+(\d+)/i);
    if (!match) {
        throw new Error(`Could not read focused sector from UI: ${text || '(empty)'}`);
    }
    return Number.parseInt(match[1], 10);
}

async function focusHomeworld(page) {
    await page.click('#homeworldBtn');
    await expect(page.locator('#sectorid')).toContainText(/Sector\s+\d+/i, { timeout: 15000 });
    return readFocusedSectorId(page);
}

async function readResources(page) {
    const [metalText, crystalText, researchText] = await Promise.all([
        page.locator('#metalresource').textContent(),
        page.locator('#crystalresource').textContent(),
        page.locator('#researchresource').textContent()
    ]);
    return {
        metal: parseNumber(metalText),
        crystal: parseNumber(crystalText),
        research: parseNumber(researchText)
    };
}

async function waitForResources(page, minimums, timeout = 90000) {
    await expect.poll(() => readResources(page), { timeout, intervals: [500, 1000, 2000] }).toEqual(expect.objectContaining({
        metal: expect.any(Number),
        crystal: expect.any(Number),
        research: expect.any(Number)
    }));

    await expect.poll(async () => {
        const resources = await readResources(page);
        return Object.entries(minimums).every(([key, value]) => resources[key] >= value);
    }, { timeout, intervals: [750, 1500, 2500] }).toBe(true);
}

async function readTurnNumber(page) {
    const text = await page.locator('#gameModeLabel').textContent().catch(() => '');
    const match = String(text || '').match(/Turn\s+(\d+)/i);
    return match ? Number.parseInt(match[1], 10) : 0;
}

async function isGameOverVisible(page) {
    return page.locator('#gameOverModal').isVisible().catch(() => false);
}

async function isBattleOverlayVisible(page) {
    return page.locator('#battleGround, #battleTheater.on').isVisible().catch(() => false);
}

async function anyGameOverVisible(pages) {
    const states = await Promise.all(pages.map(page => isGameOverVisible(page)));
    return states.some(Boolean);
}

async function clickEndTurnIfAvailable(page) {
    if (await isGameOverVisible(page)) {
        return;
    }
    if (await isBattleOverlayVisible(page)) {
        return;
    }
    const button = page.locator('#nextTurnBtn');
    await expect(button).toBeEnabled({ timeout: 10000 });
    if (await isGameOverVisible(page) || await isBattleOverlayVisible(page)) {
        return;
    }
    try {
        await button.click({ timeout: 5000 });
    } catch (error) {
        if (await isGameOverVisible(page) || await isBattleOverlayVisible(page)) {
            return;
        }
        throw error;
    }
}

async function endTurnAll(pages, count = 1) {
    for (let i = 0; i < count; i++) {
        if (await anyGameOverVisible(pages)) {
            return;
        }
        const before = await readTurnNumber(pages[0]);
        await Promise.all(pages.map(page => clickEndTurnIfAvailable(page)));
        if (await anyGameOverVisible(pages)) {
            return;
        }
        await expect.poll(async () => {
            if (await anyGameOverVisible(pages)) {
                return before + 1;
            }
            return readTurnNumber(pages[0]);
        }, {
            timeout: 20000,
            intervals: [300, 700, 1200]
        }).toBeGreaterThan(before);
        await Promise.all(pages.map(page => page.waitForTimeout(200)));
    }
}

async function requestEndTurnAll(pages) {
    if (await anyGameOverVisible(pages)) {
        return;
    }
    const battleVisible = await Promise.all(pages.map(page => isBattleOverlayVisible(page)));
    if (battleVisible.some(Boolean)) {
        return;
    }
    await Promise.all(pages.map(page => clickEndTurnIfAvailable(page)));
    await Promise.all(pages.map(page => page.waitForTimeout(200)));
}

async function endTurnsUntilResources(pages, page, minimums, maxTurns = 25) {
    for (let i = 0; i <= maxTurns; i++) {
        if (await anyGameOverVisible(pages)) {
            return readResources(page);
        }
        const resources = await readResources(page);
        if (Object.entries(minimums).every(([key, value]) => resources[key] >= value)) {
            return resources;
        }
        await endTurnAll(pages, 1);
    }
    const resources = await readResources(page);
    throw new Error(`Resources did not reach ${JSON.stringify(minimums)}; final resources ${JSON.stringify(resources)}`);
}

async function buildBuilding(page, selector) {
    await focusHomeworld(page);
    await page.click('#buildtab');
    await page.click(selector);
    await page.waitForTimeout(500);
}

async function buildShip(page, shipId) {
    await focusHomeworld(page);
    await page.click('#buildtab');
    const button = page.locator(`.ship-button[data-ship-id="${shipId}"]`);
    await expect(button).toBeVisible({ timeout: 10000 });
    await expect(button).toBeEnabled({ timeout: 10000 });
    await button.click();
    await page.waitForTimeout(500);
}

async function researchTech(page, nameOrRegex) {
    await page.click('#techtab');
    const card = page.locator('.tech-card').filter({ hasText: nameOrRegex }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toBeEnabled({ timeout: 10000 });
    const before = await page.locator('#researchresource').textContent();
    await card.click();
    await expect.poll(async () => page.locator('#researchresource').textContent(), {
        timeout: 10000,
        intervals: [300, 700, 1200]
    }).not.toBe(before);
}

async function readEmpireSummary(page) {
    const text = await page.locator('#empireSummary').textContent();
    const worlds = String(text || '').match(/Worlds\s+(\d+)/i);
    const sectors = String(text || '').match(/Sectors\s+(\d+)/i);
    const fleet = String(text || '').match(/Fleet\s+(\d+)/i);
    return {
        text: text || '',
        worlds: worlds ? Number.parseInt(worlds[1], 10) : 0,
        sectors: sectors ? Number.parseInt(sectors[1], 10) : 0,
        fleet: fleet ? Number.parseInt(fleet[1], 10) : 0
    };
}

async function selectSector(page, sectorId) {
    const tile = page.locator(`#tile${sectorId}`);
    await tile.waitFor({ state: 'visible', timeout: 15000 });
    await tile.click();
}

async function focusSector(page, sectorId) {
    await selectSector(page, sectorId);
    await dismissProbeSuggestion(page);
    await expect(page.locator('#sectorid')).toContainText(new RegExp(`Sector\\s+${sectorId}\\b`), {
        timeout: 15000
    });
}

async function expectSectorIntelState(page, sectorId, expectedState) {
    const tile = page.locator(`#tile${sectorId}`);
    await tile.waitFor({ state: 'visible', timeout: 15000 });
    await expect(tile).toHaveAttribute('data-intel', expectedState, { timeout: 10000 });
}

async function dismissProbeSuggestion(page) {
    const dismiss = page.locator('#probeSuggestionDismiss');
    if (await dismiss.isVisible().catch(() => false)) {
        await dismiss.click();
    }
}

async function sendProbeForSector(page, sectorId) {
    const before = await readResources(page);
    await selectSector(page, sectorId);
    await expect(page.locator('#probeSuggestionCard')).toBeVisible({ timeout: 10000 });
    await page.click('#probeSuggestionSend');
    await expect(page.locator('#probeSuggestionCard')).toBeHidden({ timeout: 10000 });
    await expect.poll(async () => (await readResources(page)).crystal, {
        timeout: 10000,
        intervals: [300, 700, 1200]
    }).toBeLessThan(before.crystal);
}

async function openMoveDialog(page, targetSector) {
    const tile = page.locator(`#tile${targetSector}`);
    await tile.waitFor({ state: 'visible', timeout: 15000 });
    for (let attempt = 0; attempt < 6; attempt++) {
        await tile.click();
        await dismissProbeSuggestion(page);
        if (await page.locator('#multiMove').isVisible().catch(() => false)) {
            return;
        }
        await page.waitForTimeout(500);
    }
    await expect(page.locator('#multiMove')).toBeVisible({ timeout: 5000 });
}

async function moveSelectedShipTypeToSector(page, targetSector, shipTypeText) {
    await openMoveDialog(page, targetSector);

    const option = page.locator('#shipsFromNearBy option', { hasText: new RegExp(shipTypeText, 'i') }).first();
    await expect(option).toBeVisible({ timeout: 8000 });
    const value = await option.getAttribute('value');
    if (!value) {
        throw new Error(`No selectable ${shipTypeText} option value found for sector ${targetSector}`);
    }

    await page.selectOption('#shipsFromNearBy', value);
    await page.click('#moveSelectedShips');
    await expect(page.locator('#multiMove')).toBeHidden({ timeout: 8000 });
    await expectFleetAtSector(page, targetSector, shipTypeText, 1);
}

async function marchShip(page, path, shipTypeText) {
    for (const sectorId of path) {
        await moveSelectedShipTypeToSector(page, sectorId, shipTypeText);
    }
}

async function expectFleetAtSector(page, sectorId, shipTypeText, minimum = 1) {
    const fieldByName = {
        'Scout': '#fleet-scouts',
        'Frigate': '#fleet-frigates',
        'Destroyer': '#fleet-destroyers',
        'Cruiser': '#fleet-cruisers',
        'Battleship': '#fleet-battleships',
        'Colony Ship': '#fleet-colony'
    };
    const selector = fieldByName[shipTypeText];
    if (!selector) {
        throw new Error(`No fleet panel selector for ${shipTypeText}`);
    }

    await focusSector(page, sectorId);
    await page.click('#fleettab');
    await expect.poll(async () => {
        const text = await page.locator(selector).textContent().catch(() => '0');
        return parseNumber(text);
    }, {
        message: `Expected ${shipTypeText} fleet at sector ${sectorId}`,
        timeout: 12000,
        intervals: [300, 700, 1200]
    }).toBeGreaterThanOrEqual(minimum);
}

async function colonizeSelectedSector(page, expectedWorlds = null) {
    const before = await readEmpireSummary(page);
    await page.click('#colonizetab');
    if (await page.locator('#multiMove').isVisible().catch(() => false)) {
        await page.click('#closeMultiMove');
        await expect(page.locator('#multiMove')).toBeHidden({ timeout: 5000 });
    }
    await page.click('#colonizeBtn');
    const targetWorlds = expectedWorlds || before.worlds + 1;
    await expect.poll(async () => (await readEmpireSummary(page)).worlds, {
        timeout: 15000,
        intervals: [500, 1000, 1500]
    }).toBeGreaterThanOrEqual(targetWorlds);
}

async function verifyShopPolicy(page) {
    await expect(page.locator('#shop-container')).toHaveCount(1, { timeout: 15000 });
    await page.getByRole('button', { name: /^Shop$/ }).click();
    await expect(page.locator('#shop-container:not(.shop-hidden)')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.shop-tab', { hasText: 'Premium Races' })).toBeVisible();
    await expect(page.locator('.shop-tab', { hasText: 'Cosmetics' })).toBeVisible();
    await expect(page.locator('.shop-tab')).toHaveCount(2);
    await expect(page.locator('#shop-races.active')).toContainText('Paid races do not receive paid stat advantages');
    await expect(page.locator('#shop-races.active')).toContainText('Quantum Entities');
    await page.locator('.shop-tab', { hasText: 'Cosmetics' }).click();
    await expect(page.locator('#shop-cosmetics.active')).toContainText('Cosmetics');
    await expect(page.locator('#shop-container')).not.toContainText(/VIP|Booster|Resource Surge|Research Focus|Emergency Fleet/i);
    await page.locator('.shop-close').click();
    await expect(page.locator('#shop-container')).toHaveClass(/shop-hidden/);
}

async function readTestTerrain(page, gameId) {
    const response = await page.request.get(`/api/game/${gameId}/test-map-terrain`);
    expect(response.status()).toBe(200);
    const payload = await response.json();
    const sectors = Array.isArray(payload.sectors) ? payload.sectors : [];
    if (sectors.length === 0) {
        throw new Error(`No terrain returned for game ${gameId}`);
    }
    const width = Math.max(...sectors.map(sector => Number(sector.x) || 0)) + 1;
    const height = Math.max(...sectors.map(sector => Number(sector.y) || 0)) + 1;
    return {
        width: width || 14,
        height: height || 8,
        sectors,
        byId: new Map(sectors.map(sector => [Number(sector.sectorid), sector]))
    };
}

function sectorToPoint(sectorId, width) {
    const zero = Number(sectorId) - 1;
    return { x: zero % width, y: Math.floor(zero / width) };
}

function adjacentSectors(sectorId, width = 14, height = 8) {
    const point = sectorToPoint(sectorId, width);
    const adjacent = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = point.x + dx;
            const ny = point.y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            adjacent.push((ny * width) + nx + 1);
        }
    }
    return adjacent;
}

function buildSafePath(fromSector, toSector, terrain, extraBlocked = new Set()) {
    const blockedTypes = new Set([1, 2]);
    const blocked = new Set(extraBlocked);
    terrain.sectors.forEach(sector => {
        if (blockedTypes.has(Number(sector.type))) {
            blocked.add(Number(sector.sectorid));
        }
    });

    const from = Number(fromSector);
    const to = Number(toSector);
    const queue = [from];
    const previous = new Map([[from, null]]);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === to) {
            const path = [];
            let cursor = current;
            while (cursor !== null) {
                path.push(cursor);
                cursor = previous.get(cursor);
            }
            return path.reverse();
        }

        for (const next of adjacentSectors(current, terrain.width, terrain.height)) {
            if (previous.has(next)) continue;
            if (next !== to && next !== from && blocked.has(next)) continue;
            previous.set(next, current);
            queue.push(next);
        }
    }

    return null;
}

function pickColonizationTargets(homeSector, otherHomeSector, terrain, count = 2) {
    const home = Number(homeSector);
    const otherHome = Number(otherHomeSector);
    const candidates = terrain.sectors
        .filter(sector => {
            const id = Number(sector.sectorid);
            const type = Number(sector.type);
            const terraform = Number(sector.terraformlvl) || 0;
            return id !== home &&
                id !== otherHome &&
                !sector.owner &&
                type >= 6 &&
                type <= 9 &&
                terraform <= 0;
        })
        .map(sector => {
            const id = Number(sector.sectorid);
            const path = buildSafePath(home, id, terrain);
            return path ? { id, path, sector, distance: path.length } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance);

    if (candidates.length < count) {
        throw new Error(`Could not find ${count} safe terraform-0 colonization targets near sector ${home}`);
    }

    return candidates.slice(0, count);
}

function splitRendezvousPaths(hostHome, joinerHome, terrain, extraBlocked = new Set()) {
    let fullPath = buildSafePath(hostHome, joinerHome, terrain, extraBlocked) ||
        buildSafePath(hostHome, joinerHome, terrain);
    if (fullPath && fullPath.length === 2) {
        return {
            rendezvous: Number(hostHome),
            hostPath: [],
            joinerPath: [Number(hostHome)],
            fullPath
        };
    }
    if (fullPath && fullPath.length > 2) {
        const midIndex = Math.max(1, Math.min(fullPath.length - 2, Math.floor(fullPath.length / 2)));
        return {
            rendezvous: fullPath[midIndex],
            hostPath: fullPath.slice(1, midIndex + 1),
            joinerPath: fullPath.slice(midIndex, fullPath.length - 1).reverse(),
            fullPath
        };
    }

    const host = Number(hostHome);
    const joiner = Number(joinerHome);
    const blockedTypes = new Set([1, 2]);
    const candidates = terrain.sectors
        .map(sector => ({
            id: Number(sector.sectorid),
            type: Number(sector.type)
        }))
        .filter(sector => sector.id !== host &&
            sector.id !== joiner &&
            !extraBlocked.has(sector.id) &&
            !blockedTypes.has(sector.type))
        .map(sector => {
            const hostPath = buildSafePath(host, sector.id, terrain, extraBlocked) ||
                buildSafePath(host, sector.id, terrain);
            const joinerPath = buildSafePath(joiner, sector.id, terrain, extraBlocked) ||
                buildSafePath(joiner, sector.id, terrain);
            if (!hostPath || !joinerPath) return null;
            return {
                rendezvous: sector.id,
                hostPath: hostPath.slice(1),
                joinerPath: joinerPath.slice(1),
                fullPath: hostPath.concat(joinerPath.slice(0, -1).reverse()),
                score: hostPath.length + joinerPath.length
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score);

    if (candidates.length === 0) {
        throw new Error(`No safe two-sided battle rendezvous found for homeworlds ${hostHome}, ${joinerHome}`);
    }

    return candidates[0];
}

async function waitForBattleOverlay(page, timeout = 15000) {
    await expect(page.locator('#battleGround, #battleTheater.on')).toBeVisible({ timeout });
}

async function waitForBattleResolution(page, timeout = 15000) {
    await expect.poll(async () => {
        const overlayVisible = await page.locator('#battleGround, #battleTheater.on').isVisible().catch(() => false);
        const battleReport = await page.locator('#chatMessages').getByText(/Battle report:\s+(?:Victory|Defeat)\s+in sector/i).count().catch(() => 0);
        return overlayVisible || battleReport > 0;
    }, {
        timeout,
        intervals: [100, 250, 500]
    }).toBe(true);
}

async function closeBattleOverlay(page) {
    if (await page.locator('#battleTheater.on').isVisible().catch(() => false)) {
        await page.locator('#battleTheater.on #b3dSkip').click({ timeout: 3000 });
        await expect.poll(async () => page.locator('#battleTheater').evaluate(el => el.classList.contains('on')).catch(() => false), {
            timeout: 8000,
            intervals: [100, 250, 500]
        }).toBe(false);
    } else if (await page.locator('#battleGround').isVisible().catch(() => false)) {
        await page.locator('#stopBattle').click();
        await expect(page.locator('#battleGround')).toHaveCount(0, { timeout: 8000 });
    }
}

async function surrender(page) {
    await page.click('#surrenderBtn');
}

async function returnToLobbyFromGameOver(page) {
    await expect(page.locator('#gameOverModal')).toBeVisible({ timeout: 15000 });
    await page.locator('#gameOverLobbyBtn').click({ timeout: 10000 });
    await page.waitForURL('**/lobby.html', { timeout: 20000 });
    await waitForLobbyReady(page);
    await expect(page.locator('#createGameBtn')).toBeVisible({ timeout: 10000 });
}

module.exports = {
    uniqueId,
    registerUser,
    signInGuest,
    upgradeGuestToRegistered,
    waitForLobbyReady,
    chooseFirstAvailableRace,
    waitForMatchLobby,
    extractLobbyGameId,
    createGame,
    joinGameByName,
    attemptJoinGameByNameExpectingError,
    startGame,
    dismissFirstRunGuidance,
    completeFirstRunGuidance,
    verifyFirstRunGuidanceStaysDismissed,
    readFocusedSectorId,
    focusHomeworld,
    readResources,
    waitForResources,
    readTurnNumber,
    endTurnAll,
    requestEndTurnAll,
    endTurnsUntilResources,
    isGameOverVisible,
    buildBuilding,
    buildShip,
    researchTech,
    verifyShopPolicy,
    readEmpireSummary,
    selectSector,
    focusSector,
    expectSectorIntelState,
    sendProbeForSector,
    moveSelectedShipTypeToSector,
    marchShip,
    colonizeSelectedSector,
    readTestTerrain,
    buildSafePath,
    pickColonizationTargets,
    splitRendezvousPaths,
    waitForBattleOverlay,
    waitForBattleResolution,
    closeBattleOverlay,
    surrender,
    returnToLobbyFromGameOver
};
