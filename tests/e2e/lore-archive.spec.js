const { test, expect } = require('@playwright/test');

const VIEWPORTS = [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 }
];

test.describe('public lore archive', () => {
    test('is reachable from the main page and exposes the complete source archive', async ({ page }) => {
        await page.goto('/landing.html');
        const loreLink = page.getByRole('link', { name: /Lore archive/i }).first();
        await expect(loreLink).toHaveAttribute('href', '/lore/');

        await page.goto('/lore/');
        await expect(page).toHaveTitle(/Archive Room/);
        await expect(page.getByRole('heading', { name: /Archive Room/i, level: 1 })).toBeVisible();
        await expect(page.getByRole('link', { name: /Open the complete LORE folder/i }))
            .toHaveAttribute('href', 'https://github.com/steveseguin/Game-of-Worlds/tree/master/lore');

        const images = page.locator('img');
        for (let index = 0; index < await images.count(); index += 1) {
            await images.nth(index).scrollIntoViewIfNeeded();
        }
        await page.waitForFunction(() =>
            [...document.images].every(image => image.complete && image.naturalWidth > 0)
        );
        const failedImages = await page.locator('img').evaluateAll(images =>
            images.filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src)
        );
        expect(failedImages).toEqual([]);
    });

    test('story reel filters remain keyboard-accessible and reversible', async ({ page }) => {
        await page.goto('/lore/');
        const reels = page.locator('[data-category]');
        await expect(reels).toHaveCount(6);

        await page.getByRole('button', { name: "Rell’s file" }).click();
        await expect(page.locator('[data-category]:visible')).toHaveCount(2);
        await expect(page.getByRole('button', { name: "Rell’s file" })).toHaveClass(/is-active/);

        await page.getByRole('button', { name: 'All reels' }).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('[data-category]:visible')).toHaveCount(6);
    });

    for (const viewport of VIEWPORTS) {
        test(`has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
            await page.setViewportSize(viewport);
            await page.goto('/lore/');
            const dimensions = await page.evaluate(() => ({
                viewport: document.documentElement.clientWidth,
                page: document.documentElement.scrollWidth
            }));
            expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
        });
    }
});
