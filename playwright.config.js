const { defineConfig } = require('@playwright/test');

const PORT = process.env.E2E_PORT || '4173';
const HOST = process.env.E2E_HOST || '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 120000,
    expect: {
        timeout: 10000
    },
    use: {
        baseURL: BASE_URL,
        headless: true,
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        video: 'off'
    },
    webServer: {
        command: 'node server/index.js',
        url: `${BASE_URL}/login.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: {
            ...process.env,
            PORT,
            HOST,
            USE_MOCK_DB: '1',
            NODE_ENV: 'test',
            STRIPE_SECRET_KEY: '',
            STRIPE_PUBLISHABLE_KEY: '',
            STRIPE_WEBHOOK_SECRET: ''
        }
    },
    reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list'
});
