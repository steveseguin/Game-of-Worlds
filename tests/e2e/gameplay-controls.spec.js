const { test, expect } = require('@playwright/test');
const {
    uniqueId,
    registerUser,
    createGame,
    startGame,
    dismissFirstRunGuidance
} = require('./support/ui-game-harness');

test.describe('Authoritative gameplay controls', () => {
    test.setTimeout(180000);

    test('test games expose the real clock and construction prerequisites', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept());
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

        const tempoBehavior = await page.evaluate(() => ({
            early: window.SoundSystem.setTurnMusicUrgency(7, 30),
            threshold: window.SoundSystem.setTurnMusicUrgency(6, 30),
            urgent: window.SoundSystem.setTurnMusicUrgency(3, 30),
            final: window.SoundSystem.setTurnMusicUrgency(0, 30)
        }));
        expect(tempoBehavior.early).toBe(1);
        expect(tempoBehavior.threshold).toBe(1);
        expect(tempoBehavior.urgent).toBeGreaterThan(1);
        expect(tempoBehavior.final).toBeCloseTo(1.12, 5);

        const scoutButton = page.locator('.ship-button[data-ship-id="3"]');
        await expect(scoutButton).toBeDisabled({ timeout: 15000 });
        await expect(scoutButton).toHaveAttribute('title', /Spaceport/i);
        await expect(page.locator('#bb4')).toBeEnabled();
        await page.locator('#bb4').click();
        await expect(scoutButton).toBeEnabled({ timeout: 15000 });
        await expect(page.locator('.ship-button[data-ship-id="9"]')).toBeDisabled();
        await expect(page.locator('.ship-button[data-ship-id="9"]')).toHaveAttribute('title', /Military Shipyards/i);

        await page.reload();
        await dismissFirstRunGuidance(page);
        await expect(page.locator('#gameModeLabel')).toContainText('Test Match', { timeout: 15000 });
        await expect.poll(async () => {
            const text = await page.locator('#turnRedFlashWhenLow').textContent();
            return Number.parseInt(text, 10);
        }, { timeout: 15000 }).toBeLessThanOrEqual(30);
    });

    test('Fill with AI waits for every requested seat before starting', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept());
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
});
