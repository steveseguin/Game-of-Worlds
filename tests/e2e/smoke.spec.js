// Playwright smoke test - uses Playwright's baseURL config by default.
// To run against production, set SMOKE_BASE_URL=https://gameofworlds.com
// Requires network access and browsers installed (npx playwright install).

const { test, expect } = require('@playwright/test');

function randomUser() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return {
    username: `smoke_${suffix}`,
    email: `smoke_${suffix}@example.com`,
    password: 'Smoke123'
  };
}

test('signup → lobby → create game → add AI → start game', async ({ page }) => {
  const user = randomUser();

  // Go to login and switch to register
  await page.goto('/login.html', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: /register/i }).click();
  await page.locator('#registerUsername').fill(user.username);
  await page.locator('#registerEmail').fill(user.email);
  await page.locator('#registerPassword').fill(user.password);
  await page.locator('#confirmPassword').fill(user.password);
  await page.getByRole('button', { name: /Create account/i }).click();

  await page.waitForURL(/lobby\.html/, { timeout: 15000 });

  // Create a game
  await page.getByPlaceholder('Game Name').fill(`Smoke ${Date.now()}`);
  await page.getByRole('button', { name: /Create Game/i }).click();

  await expect(page.getByText(/Waiting in Game/)).toBeVisible({ timeout: 10000 });

  // Add AI (defaults)
  await page.getByRole('button', { name: /Add AI Opponent/i }).click();
  await expect(page.getByText('🤖', { exact: false })).toBeVisible({ timeout: 8000 });

  // Start game
  await page.getByRole('button', { name: /Start Game/i }).click();
  await page.waitForURL(/game\.html/, { timeout: 15000 });
  await expect(page.locator('#resourceBar')).toBeVisible({ timeout: 10000 });
});
