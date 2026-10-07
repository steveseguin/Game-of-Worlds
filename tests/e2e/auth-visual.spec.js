const { test, expect } = require('@playwright/test');

test.describe('Authentication visual baseline', () => {
    test('fields are dark and visibly separated before and after auth CSS loads', async ({ page }) => {
        let releaseStyles;
        const stylesReady = new Promise(resolve => { releaseStyles = resolve; });
        await page.route('**/css/*.css*', async route => {
            await stylesReady;
            await route.continue();
        });

        await page.goto('/login.html', { waitUntil: 'commit' });
        await page.locator('#loginUsername').waitFor({ state: 'attached' });

        try {
            const firstPaint = await page.locator('#loginUsername').evaluate(input => {
                const style = getComputedStyle(input);
                return {
                    background: style.backgroundColor,
                    color: style.color,
                    border: style.borderTopColor
                };
            });
            expect(firstPaint.background).toBe('rgb(23, 34, 53)');
            expect(firstPaint.color).toBe('rgb(242, 247, 255)');
            expect(firstPaint.border).toBe('rgb(104, 123, 150)');
        } finally {
            releaseStyles();
        }

        await expect(page.locator('#loginUsername')).toHaveCSS('background-color', 'rgb(11, 19, 31)');
        await expect(page.locator('#loginUsername')).toHaveCSS('border-top-color', 'rgb(103, 121, 146)');
        await expect(page.locator('#loginUsername')).toHaveCSS('color', 'rgb(243, 246, 250)');
        await page.locator('.auth-panel').screenshot({ path: 'test-results/auth-panel-desktop.png' });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.auth-panel').screenshot({ path: 'test-results/auth-panel-mobile.png' });
    });
});
