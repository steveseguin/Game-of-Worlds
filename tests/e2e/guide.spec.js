const { test, expect } = require('@playwright/test');

test.describe('player field manual', () => {
    test('is public, complete, and connected to the player-facing site', async ({ page }) => {
        await page.goto('/docs/');

        await expect(page).toHaveTitle(/Player Field Manual/);
        await expect(page.getByRole('heading', { name: /Player Field Manual/, level: 1 })).toBeVisible();
        await expect(page.locator('main section')).toHaveCount(10);
        await expect(page.locator('.toc nav a')).toHaveCount(10);
        await expect(page.getByRole('link', { name: /Lore & art/i }).first()).toHaveAttribute('href', '/lore/');
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://gameofworlds.com/docs/');
        await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', '/docs/images/field-manual-social.png');

        const ids = await page.locator('[id]').evaluateAll(elements => elements.map(element => element.id));
        expect(new Set(ids).size).toBe(ids.length);

        const images = page.locator('main img');
        for (let index = 0; index < await images.count(); index += 1) {
            await images.nth(index).scrollIntoViewIfNeeded();
        }
        await page.waitForFunction(() =>
            [...document.images].every(image => image.complete && image.naturalWidth > 40)
        );

        await page.goto('/');
        const guideLink = page.locator('footer').getByRole('link', { name: 'Player Guide' });
        await expect(guideLink).toBeVisible();
        await expect(guideLink).toHaveAttribute('href', '/docs/');
    });

    test('mobile index is accessible and the page has no horizontal overflow', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/docs/');

        const toggle = page.getByRole('button', { name: /Manual index/ });
        await expect(toggle).toBeVisible();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#manual-navigation')).toBeVisible();
        await page.locator('#manual-navigation a[href="#intel"]').click();
        await expect(page.locator('#intel')).toBeInViewport();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');

        const geometry = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            page: document.documentElement.scrollWidth,
            farthestImage: Math.max(...[...document.images].map(image => image.getBoundingClientRect().right))
        }));
        expect(geometry.page).toBeLessThanOrEqual(geometry.viewport + 1);
        expect(geometry.farthestImage).toBeLessThanOrEqual(geometry.viewport + 1);
    });
});
