const { test, expect } = require('@playwright/test');

test.describe('Authentication visual baseline', () => {
    test('fields are dark and visibly separated before and after auth CSS loads', async ({ page }) => {
        await page.route('**/css/auth.css*', async route => {
            await new Promise(resolve => setTimeout(resolve, 350));
            await route.continue();
        });

        await page.goto('/login.html', { waitUntil: 'domcontentloaded' });

        const firstPaint = await page.locator('#loginUsername').evaluate(input => {
            const style = getComputedStyle(input);
            return {
                background: style.backgroundColor,
                color: style.color,
                border: style.borderTopColor
            };
        });
        expect(firstPaint.background).not.toBe('rgb(255, 255, 255)');
        expect(firstPaint.color).toBe('rgb(242, 247, 255)');
        expect(firstPaint.border).toBe('rgb(104, 123, 150)');

        await page.waitForLoadState('networkidle');
        await expect(page.locator('#loginUsername')).toHaveCSS('border-top-color', 'rgb(104, 123, 150)');
        await expect(page.locator('#loginUsername')).toHaveCSS('color', 'rgb(242, 247, 255)');
        await page.locator('.auth-panel').screenshot({ path: 'test-results/auth-panel-desktop.png' });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.auth-panel').screenshot({ path: 'test-results/auth-panel-mobile.png' });
    });
});
