const { test, expect } = require('@playwright/test');
const {
    uniqueId,
    registerUser,
    signInGuest,
    createGame,
    joinGameByName,
    startGame,
    dismissFirstRunGuidance,
    completeFirstRunGuidance,
    verifyFirstRunGuidanceStaysDismissed,
    focusHomeworld,
    expectSectorIntelState,
    sendProbeForSector,
    buildBuilding,
    researchTech,
    verifyShopPolicy,
    endTurnAll,
    requestEndTurnAll,
    endTurnsUntilResources,
    buildShip,
    marchShip,
    focusSector,
    colonizeSelectedSector,
    readEmpireSummary,
    readTestTerrain,
    pickColonizationTargets,
    splitRendezvousPaths,
    waitForBattleOverlay,
    closeBattleOverlay,
    returnToLobbyFromGameOver
} = require('./support/ui-game-harness');

function distance(a, b, width) {
    const ax = (Number(a) - 1) % width;
    const ay = Math.floor((Number(a) - 1) / width);
    const bx = (Number(b) - 1) % width;
    const by = Math.floor((Number(b) - 1) / width);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function pickProbeTarget(homeSector, joinerHomeSector, terrain, reserved = new Set()) {
    const home = Number(homeSector);
    const joinerHome = Number(joinerHomeSector);
    const candidates = terrain.sectors
        .filter(sector => {
            const id = Number(sector.sectorid);
            const type = Number(sector.type);
            return id !== home &&
                id !== joinerHome &&
                !reserved.has(id) &&
                !sector.owner &&
                type >= 6 &&
                type <= 9 &&
                distance(id, home, terrain.width) > 2;
        })
        .sort((a, b) => distance(b.sectorid, home, terrain.width) - distance(a.sectorid, home, terrain.width));

    if (candidates.length === 0) {
        throw new Error('No probe target candidates found');
    }
    return Number(candidates[0].sectorid);
}

test.describe('Complete multiplayer UI harness', () => {
    test.setTimeout(600000);

    test('plays account, lobby, expansion, tech, probes, ships, battle, victory, and lobby return through visible UI', async ({ browser }, testInfo) => {
        const hostContext = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
        const guestContext = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
        const hostPage = await hostContext.newPage();
        const guestPage = await guestContext.newPage();
        const pageErrors = [];

        for (const [label, page] of [['host', hostPage], ['guest', guestPage]]) {
            page.on('dialog', dialog => dialog.accept());
            page.on('pageerror', error => pageErrors.push(`${label}: ${error.message}`));
        }

        const hostName = uniqueId('uihost_');
        const gameName = uniqueId('uifull_');
        const password = 'Secure123!';

        try {
            await registerUser(hostPage, {
                username: hostName,
                email: `${hostName}@example.com`,
                password
            });

            const gameId = await createGame(hostPage, gameName, { maxPlayers: '2', mode: 'test' });
            await expect(hostPage.locator('.waiting-view')).toContainText('Guests OK', { timeout: 10000 });

            await signInGuest(guestPage);
            await joinGameByName(guestPage, gameName);

            await expect(hostPage.locator('.waiting-view')).toContainText('Players: 2/2', { timeout: 15000 });
            await expect(hostPage.locator('.slot-tag.guest').first()).toBeVisible({ timeout: 15000 });
            await hostPage.screenshot({ path: testInfo.outputPath('01-waiting-room.png'), fullPage: true });

            await startGame(hostPage, [hostPage, guestPage]);
            await hostPage.waitForTimeout(1500);
            await guestPage.waitForTimeout(1500);
            await dismissFirstRunGuidance(hostPage);
            await completeFirstRunGuidance(guestPage);
            await verifyFirstRunGuidanceStaysDismissed(hostPage);
            await verifyFirstRunGuidanceStaysDismissed(guestPage);
            await verifyShopPolicy(hostPage);

            const hostHome = await focusHomeworld(hostPage);
            const guestHome = await focusHomeworld(guestPage);
            const terrain = await readTestTerrain(hostPage, gameId);
            const colonizableCount = terrain.sectors.filter(sector => {
                const type = Number(sector.type);
                return type >= 6 && type <= 10;
            }).length;
            const requiredWorlds = Math.max(4, Math.ceil(colonizableCount * 0.20));
            const colonizationTargets = pickColonizationTargets(hostHome, guestHome, terrain, requiredWorlds - 1);
            const reserved = new Set(colonizationTargets.map(target => target.id));
            const probeTarget = pickProbeTarget(hostHome, guestHome, terrain, reserved);
            const battlePaths = splitRendezvousPaths(hostHome, guestHome, terrain, reserved);
            console.log(`Harness game ${gameId}: host home ${hostHome}, guest home ${guestHome}, probe ${probeTarget}, colonies ${colonizationTargets.map(target => `${target.id} via ${target.path.join('>')}`).join(', ')}, battle ${battlePaths.rendezvous}`);

            await testInfo.attach('planned-route.json', {
                body: JSON.stringify({
                    gameId,
                    hostHome,
                    guestHome,
                    colonizableCount,
                    requiredWorlds,
                    probeTarget,
                    colonizationTargets: colonizationTargets.map(target => ({
                        sector: target.id,
                        path: target.path,
                        terraform: Number(target.sector.terraformlvl) || 0,
                        type: Number(target.sector.type)
                    })),
                    battle: battlePaths
                }, null, 2),
                contentType: 'application/json'
            });

            await expectSectorIntelState(hostPage, probeTarget, 'fog');
            await sendProbeForSector(hostPage, probeTarget);
            await expectSectorIntelState(hostPage, probeTarget, /^(live|memory)$/);
            await buildBuilding(hostPage, '#bb4'); // Spaceport
            await buildBuilding(hostPage, '#bb2'); // Crystal Refinery
            await researchTech(hostPage, /Metal Extraction/i);

            await buildBuilding(guestPage, '#bb4'); // Spaceport
            await researchTech(guestPage, /Metal Extraction/i);
            await hostPage.screenshot({ path: testInfo.outputPath('02-probe-build-research.png'), fullPage: true });

            await marchShip(hostPage, colonizationTargets[0].path.slice(1), 'Colony Ship');
            await focusSector(hostPage, colonizationTargets[0].id);
            await colonizeSelectedSector(hostPage, 2);
            await expect.poll(async () => (await readEmpireSummary(hostPage)).worlds, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
            await hostPage.screenshot({ path: testInfo.outputPath('03-first-colony.png'), fullPage: true });

            await endTurnsUntilResources([hostPage, guestPage], hostPage, { metal: 1000 }, 30);
            await buildShip(hostPage, 6); // Second colony ship
            await marchShip(hostPage, colonizationTargets[1].path.slice(1), 'Colony Ship');
            await focusSector(hostPage, colonizationTargets[1].id);
            await colonizeSelectedSector(hostPage, 3);
            await expect.poll(async () => (await readEmpireSummary(hostPage)).worlds, { timeout: 15000 }).toBeGreaterThanOrEqual(3);
            await hostPage.screenshot({ path: testInfo.outputPath('04-second-colony.png'), fullPage: true });

            await endTurnsUntilResources([hostPage, guestPage], hostPage, { metal: 430 }, 20);
            await buildShip(hostPage, 1); // Frigate
            await endTurnsUntilResources([hostPage, guestPage], guestPage, { metal: 430 }, 20);
            await buildShip(guestPage, 1); // Frigate

            await marchShip(hostPage, battlePaths.hostPath, 'Frigate');
            await marchShip(guestPage, battlePaths.joinerPath, 'Frigate');
            const battleOverlay = Promise.all([
                waitForBattleOverlay(hostPage, 15000),
                waitForBattleOverlay(guestPage, 15000)
            ]);
            await requestEndTurnAll([hostPage, guestPage]);
            await battleOverlay;
            await hostPage.screenshot({ path: testInfo.outputPath('05-battle.png'), fullPage: true });
            await closeBattleOverlay(hostPage);
            await closeBattleOverlay(guestPage);

            if (!(await hostPage.locator('#gameOverModal').isVisible().catch(() => false))) {
                for (let index = 2; index < colonizationTargets.length; index++) {
                    if (await hostPage.locator('#gameOverModal').isVisible().catch(() => false)) {
                        break;
                    }
                    await endTurnsUntilResources([hostPage, guestPage], hostPage, { metal: 1000 }, 20);
                    await buildShip(hostPage, 6);
                    await marchShip(hostPage, colonizationTargets[index].path.slice(1), 'Colony Ship');
                    await focusSector(hostPage, colonizationTargets[index].id);
                    await colonizeSelectedSector(hostPage, index + 2);
                    await hostPage.screenshot({ path: testInfo.outputPath(`06-colony-${index + 1}.png`), fullPage: true });
                }
                if (!(await hostPage.locator('#gameOverModal').isVisible().catch(() => false))) {
                    await endTurnAll([hostPage, guestPage], 1);
                }
            }

            await expect(hostPage.locator('#gameOverModal')).toBeVisible({ timeout: 15000 });
            await expect(guestPage.locator('#gameOverModal')).toBeVisible({ timeout: 15000 });
            await expect(hostPage.locator('#gameOverTitle')).toHaveText('Victory');
            await expect(guestPage.locator('#gameOverTitle')).toHaveText('Defeat');
            await expect(hostPage.locator('#gameOverBody')).toContainText('Domination');
            await expect(guestPage.locator('#gameOverRegisterBtn')).toBeVisible();
            await hostPage.screenshot({ path: testInfo.outputPath('07-game-over.png'), fullPage: true });

            await Promise.all([
                returnToLobbyFromGameOver(hostPage),
                returnToLobbyFromGameOver(guestPage)
            ]);
            await expect(hostPage.locator('#createGameBtn')).toBeVisible({ timeout: 10000 });
            await hostPage.screenshot({ path: testInfo.outputPath('08-returned-lobby.png'), fullPage: true });

            expect(pageErrors).toEqual([]);
        } finally {
            await hostContext.close();
            await guestContext.close();
        }
    });
});
