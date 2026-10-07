const { test, expect } = require('@playwright/test');

const pageErrors = new WeakMap();
test.beforeEach(({ page }) => {
    const errors = [];
    pageErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => expect(pageErrors.get(page) || []).toEqual([]));

function uniqueId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 8);
    const timePart = Date.now().toString(36);
    return `${prefix}${randomPart}${timePart}`.replace(/[^a-z0-9_-]/gi, '').slice(0, 20);
}

test.describe('Battle visibility UX', () => {
    test('shows full battle overlay and summary card payloads', async ({ page }) => {
        const username = uniqueId('battle_ui_');
        const email = `${username}@example.com`;
        const password = 'Secure123!';

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
        expect(body.success).toBeTruthy();

        await page.waitForURL('**/lobby.html', { timeout: 20000 });

        await page.evaluate(() => localStorage.setItem('gow-tour-dismissed-v1', '1'));
        await page.goto('/game.html');
        await expect(page.locator('#resourceBar')).toBeVisible({ timeout: 15000 });
        await require('./support/ui-game-harness').dismissFirstRunGuidance(page);

        // Force the 2D fallback overlay so this assertion is deterministic in
        // headless CI. The 3D theater (window.Battle3D) renders to a WebGL canvas
        // and is verified manually; here we exercise the fallback render path.
        await page.evaluate(() => {
            if (window.Battle3D) window.Battle3D.isAvailable = () => false;
        });

        // Build a minimal battle payload with initial and final fleet counts.
        await page.evaluate(() => {
            const fields = new Array(40).fill(0);

            // Initial attacker (2 frigates) and defender (2 frigates).
            fields[0] = 2;   // attacker ship1
            fields[9] = 2;   // defender ship1
            fields[18] = 0;  // initial ground defenses
            fields[19] = 0;  // initial orbital defenses

            // Final counts after one round.
            fields[20] = 1;  // attacker ship1 remaining
            fields[29] = 0;  // defender ship1 remaining
            fields[38] = 0;  // final ground defenses
            fields[39] = 0;  // final orbital defenses

            window.handleWebSocketMessage(`battle:${fields.join(':')}`);
        });

        await expect(page.locator('#battleGround')).toBeVisible({ timeout: 5000 });
        await page.locator('#stopBattle').click();
        await expect(page.locator('#battleGround')).toHaveCount(0, { timeout: 5000 });

        // The extended timeline must include civilian haulers in the fallback theater.
        await page.evaluate(() => {
            const fields = new Array(44).fill(0);
            fields[0] = 2; fields[9] = 1; fields[19] = 1;
            fields[22] = 2; fields[31] = 1;
            window.handleWebSocketMessage(`battle:v2:${fields.join(':')}`);
        });
        await expect(page.locator('#battleGround')).toBeVisible();
        await expect(page.locator('#battleGround')).toContainText('Mining Hauler');
        await expect(page.locator('#battleGround img[src*="mining-hauler"]')).toHaveCount(2);
        await page.evaluate(() => window.NotificationSystem.notify('Cargo report', 'A hauler has returned to port.', 'info', 10000));
        await page.screenshot({ path: 'test-results/mining-battle-clear.png' });
        await page.locator('#stopBattle').click();
        await expect(page.locator('#battleGround')).toHaveCount(0);

        await page.evaluate(() => {
            window.handleWebSocketMessage(
                'battle_summary::1A::enemy%20stealth%20signature%20concealed%20battle%20telemetry::999::1::2::3.50::attackerVictory'
            );
        });

        await expect(page.locator('#battleSummaryCard')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#battleSummaryCard')).toContainText('Battle Summary');
    });
});
