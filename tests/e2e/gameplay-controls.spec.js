const { test, expect } = require('@playwright/test');
const {
    uniqueId,
    registerUser,
    createGame,
    startGame,
    dismissFirstRunGuidance,
    readTestTerrain
} = require('./support/ui-game-harness');

test.describe('Authoritative gameplay controls', () => {
    test.setTimeout(180000);

    test('test games expose the real clock and construction prerequisites', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept().catch(() => {}));
        const username = uniqueId('controls_');
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password: 'Secure123!'
        });
        await createGame(page, uniqueId('controls_game_'), { maxPlayers: '2', mode: 'test' });
        await startGame(page, [page]);
        await dismissFirstRunGuidance(page);

        await expect(page.locator('#gameModeLabel')).toContainText('Test Match', { timeout: 15000 });
        await expect.poll(async () => {
            const text = await page.locator('#turnRedFlashWhenLow').textContent();
            return Number.parseInt(text, 10);
        }, { timeout: 15000 }).toBeLessThanOrEqual(30);

        // The urgency window is 45 seconds. The original brief was "slowly increase the
        // urgency before 10 seconds, perhaps even at 30 — I just don't want urgency if
        // there is no perceived need for it", and the first attempt honoured the second
        // half of that so literally that the build was inaudible until the turn was
        // already lost. The window now opens at 45s and has moved perceptibly by 30s,
        // which is the earliest point a player can still do much about it, while staying
        // completely level before that. Unit coverage of the curve's shape lives in
        // tests/music-timing.test.js; this checks the browser-side wiring agrees.
        const tempoBehavior = await page.evaluate(() => ({
            early: window.SoundSystem.setTurnMusicUrgency(46, 180),
            threshold: window.SoundSystem.setTurnMusicUrgency(45, 180),
            actionable: window.SoundSystem.setTurnMusicUrgency(30, 180),
            urgent: window.SoundSystem.setTurnMusicUrgency(11, 180),
            final: window.SoundSystem.setTurnMusicUrgency(0, 30)
        }));
        expect(tempoBehavior.early).toBe(1);
        expect(tempoBehavior.threshold).toBe(1);
        // Audible while there is still a turn left to play — the point of the change.
        expect(tempoBehavior.actionable).toBeGreaterThan(1.01);
        expect(tempoBehavior.actionable).toBeLessThan(1.05);
        expect(tempoBehavior.urgent).toBeGreaterThan(tempoBehavior.actionable);
        expect(tempoBehavior.final).toBeCloseTo(1.12, 5);

        // Ship production moved to the Fleet tab, beside the fleet it feeds; the Build tab
        // is buildings only now. The #bb4 (Spaceport) assertions below still read fine
        // against the hidden Build panel, since they do not require visibility.
        await page.click('#fleettab');
        const scoutButton = page.locator('.ship-button[data-ship-id="3"]');
        await expect(scoutButton).toBeEnabled({ timeout: 15000 });
        await expect(page.locator('#bb4')).toBeDisabled();
        // The label was reworded for readability — "Upgrade Spaceport to Lv 2", with the
        // requirement and the payoff spelled out rather than a bare number. Assert the
        // intent (it names the upgrade and the tier) instead of the old exact string.
        await expect(page.locator('#bb4')).toContainText(/Upgrade Spaceport/i);
        await expect(page.locator('#bb4')).toContainText(/Lv\s*2/i);
        await expect(page.locator('#bb4')).toHaveAttribute('title', /Military Shipyards Lv1/);
        await expect(page.locator('#spaceportProductionStatus')).toContainText('12/12 production', { timeout: 15000 });
        // Costs are spelled out now — "200 · 1 prod" — rather than the "1P"/"430M"
        // shorthand, which named no unit the player had ever been taught.
        await expect(scoutButton.locator('small')).toContainText(/1\s*prod/i);
        await scoutButton.click();
        await expect(page.locator('#spaceportProductionStatus')).toContainText('11/12 production', { timeout: 15000 });
        await expect(page.locator('.ship-button[data-ship-id="9"]')).toBeDisabled();
        await expect(page.locator('.ship-button[data-ship-id="9"]')).toHaveAttribute('title', /Military Shipyards/i);
        const openingLayout = await page.evaluate(() => {
            const galaxy = document.querySelector('#galaxy3d canvas')?.getBoundingClientRect();
            const onboarding = document.querySelector('#onboardingCard')?.getBoundingClientRect();
            const advisor = document.querySelector('#avatar-notification-system')?.getBoundingClientRect();
            const overlaps = (a, b) => Boolean(a && b
                && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
            return {
                tacticalViewportClearsCommandPanel: Boolean(galaxy && galaxy.left >= 240),
                onboardingAdvisorOverlap: overlaps(onboarding, advisor)
            };
        });
        expect(openingLayout).toEqual({
            tacticalViewportClearsCommandPanel: true,
            onboardingAdvisorOverlap: false
        });
        await page.screenshot({ path: 'test-results/opening-game-desktop.png', fullPage: false });

        await page.reload();
        await dismissFirstRunGuidance(page);
        await expect(page.locator('#gameModeLabel')).toContainText('Test Match', { timeout: 15000 });
        await expect.poll(async () => {
            const text = await page.locator('#turnRedFlashWhenLow').textContent();
            return Number.parseInt(text, 10);
        }, { timeout: 15000 }).toBeLessThanOrEqual(30);
    });

    test('Fill with AI waits for every requested seat before starting', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept().catch(() => {}));
        const username = uniqueId('sandbox_');
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password: 'Secure123!'
        });
        await createGame(page, uniqueId('sandbox_game_'), { maxPlayers: '4', mode: 'test' });

        await page.getByRole('button', { name: 'Fill with AI & Start' }).click();
        await page.waitForURL('**/game.html', { timeout: 30000 });
        await dismissFirstRunGuidance(page);
        await expect(page.locator('#gameModeLabel')).toContainText('Test Match', { timeout: 15000 });
    });

    test('sector inspection keeps intel and explicit fleet choices in the left command context', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept().catch(() => {}));
        const username = uniqueId('sector_ui_');
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password: 'Secure123!'
        });
        const gameId = await createGame(page, uniqueId('sector_ui_game_'), { maxPlayers: '2', mode: 'test' });
        await startGame(page, [page]);
        await dismissFirstRunGuidance(page);

        const sensorSector = await page.evaluate(() => Number(Object.values(window.GAME_STATE.mapSectors)
            .find(sector => sector.live && sector.status === 'neutral')?.id || 0));
        expect(sensorSector).toBeGreaterThan(0);
        await page.locator(`#tile${sensorSector}`).click();
        await expect(page.locator('#sectorIntelState')).toHaveText('Sensor contact', { timeout: 10000 });
        await expect(page.locator('#metalbonus')).toHaveText('Unknown');
        await expect(page.locator('#sectorBuildings')).toContainText('Outside sensor resolution');
        await expect(page.locator('#sectorPanelTitle')).toContainText(/Sector\s+\d+/);
        await expect(page.locator('#buildSectorContext')).toContainText(/Construction destination: Sector \d+/);

        const terrain = await readTestTerrain(page, gameId);
        const fogIds = await page.locator('[id^="tile"][data-intel="fog"]').evaluateAll(nodes => nodes.map(node => Number(node.id.replace('tile', ''))));
        const probeTarget = terrain.sectors.find(sector => fogIds.includes(Number(sector.sectorid)) && Number(sector.type) >= 6)?.sectorid;
        expect(Number(probeTarget)).toBeGreaterThan(0);
        const fogTile = page.locator(`#tile${probeTarget}`);
        await expect(fogTile).toBeVisible({ timeout: 15000 });
        await fogTile.click();
        await expect(page.locator('#sectorIntelState')).toHaveText('Unknown', { timeout: 10000 });
        await expect(page.locator('#planetowner')).toHaveText('Unknown');
        await expect(page.locator('#probeSuggestionCard')).toBeVisible();
        await expect(page.locator('#sectorActionPanel #probeSuggestionCard')).toHaveCount(1);

        // A delayed push for a previously selected sector must update map memory
        // without replacing the command context the player is looking at now.
        await page.evaluate(({ previousSector }) => {
            window.handleWebSocketMessage(`sectorcontact::${previousSector}::${JSON.stringify({
                sector: { sectorid: previousSector, type: 6, owner: null },
                fleetSize: 0,
                fleetPresent: false
            })}`);
        }, { previousSector: sensorSector });
        await expect(page.locator('#sectorid')).toHaveText(`Sector ${probeTarget}`);
        await expect(page.locator('#sectorIntelState')).toHaveText('Unknown');

        await page.locator('#probeSuggestionMove').click();
        await expect(page.locator('#multiMove')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#sectorofattack')).not.toHaveText('-');
        await expect(page.locator('#shipsFromNearBy option')).not.toHaveCount(0);
        const firstMoveOption = await page.locator('#shipsFromNearBy option').first().getAttribute('value');
        await page.locator('#shipsFromNearBy').selectOption(firstMoveOption);
        await expect(page.locator('#movePreflightSummary')).toContainText(/route|hazard|unmapped/i);
        await expect(page.locator('#movePreflightDetail')).toContainText(/ship.*origin.*sector/i);
        await page.locator('#closeMultiMove').click();

        await fogTile.click();
        await expect(page.locator('#probeSuggestionCard')).toBeVisible({ timeout: 10000 });
        await page.locator('#probeSuggestionSend').click();
        await expect(page.locator('#sectorIntelState')).toHaveText('Probe scan', { timeout: 15000 });
        await expect(page.locator('#metalbonus')).not.toHaveText('Unknown');

        await page.reload();
        await dismissFirstRunGuidance(page);
        await page.locator(`#tile${probeTarget}`).click();
        await expect(page.locator('#sectorIntelState')).toHaveText('Probe memory', { timeout: 15000 });
        await expect(page.locator('#sectorIntelSummary')).toContainText(/stored scan results/i);
        await expect(page.locator('#metalbonus')).not.toHaveText('Unknown');
    });
});
