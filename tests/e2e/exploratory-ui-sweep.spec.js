const { test, expect } = require('@playwright/test');

function uniqueId(prefix) {
    const randomPart = Math.random().toString(36).slice(2, 8);
    const timePart = Date.now().toString(36);
    return `${prefix}${randomPart}${timePart}`.replace(/[^a-z0-9_-]/gi, '').slice(0, 20);
}

async function waitForLobbyReady(page, issues, actor, timeout = 12000) {
    const ready = await page.waitForFunction(() => {
        const statusPill = document.getElementById('lobbyConnectionState');
        if (statusPill && statusPill.dataset && statusPill.dataset.state === 'ready') {
            return true;
        }

        const createBtn = document.getElementById('createGameBtn');
        return !!(
            window.websocket &&
            window.websocket.readyState === WebSocket.OPEN &&
            createBtn &&
            !createBtn.disabled
        );
    }, null, { timeout }).then(() => true).catch(() => false);

    if (!ready) {
        issues.push(`${actor}: lobby connection did not reach ready state within ${timeout}ms`);
    }

    return ready;
}

async function registerUser(page, { username, email, password }) {
    await page.goto('/login.html');
    await page.click('#registerTab', { timeout: 5000 });
    await page.fill('#registerUsername', username);
    await page.fill('#registerEmail', email);
    await page.fill('#registerPassword', password);
    await page.fill('#confirmPassword', password);

    const responsePromise = page.waitForResponse(res => res.url().endsWith('/register') && res.request().method() === 'POST');
    await page.click('#registerForm button[type="submit"]', { timeout: 5000 });
    const response = await responsePromise;
    const body = await response.json();
    if (!body.success) {
        throw new Error(`Registration failed for ${username}: ${body.error || 'Unknown error'}`);
    }

    await page.waitForURL('**/lobby.html', { timeout: 15000 });
    await waitForLobbyReady(page, [], `register-${username}`, 12000).catch(() => null);
}

async function chooseFirstAvailableRace(page, issues, actor) {
    try {
        await page.waitForFunction(() => typeof window.RaceSelection !== 'undefined', {}, { timeout: 20000 }).catch(() => null);
        const deadline = Date.now() + 15000;

        while (Date.now() < deadline) {
            const modal = page.locator('#raceSelectionModal').first();
            const modalVisible = await modal.isVisible().catch(() => false);
            if (modalVisible) {
                const raceCard = page.locator('.race-card:not(.locked)').first();
                await raceCard.waitFor({ state: 'visible', timeout: 10000 });
                await raceCard.click();

                const confirmBtn = page.locator('#confirmRaceBtn');
                if (await confirmBtn.count() > 0) {
                    await confirmBtn.click({ timeout: 10000 });
                }
                await modal.waitFor({ state: 'detached', timeout: 10000 }).catch(() => null);
                return;
            }

            const waitingVisible = await page.locator('text=Waiting in Game').first().isVisible().catch(() => false);
            const playersVisible = await page.locator('text=/Players:/').first().isVisible().catch(() => false);
            const startVisible = await page.getByRole('button', { name: 'Start Game' }).first().isVisible().catch(() => false);
            if (waitingVisible || playersVisible || startVisible) {
                return;
            }

            await page.evaluate(() => {
                if (window.websocket && window.websocket.readyState === WebSocket.OPEN) {
                    window.websocket.send('//getunlockedraces');
                }
            }).catch(() => null);
            await page.waitForTimeout(250);
        }

        issues.push(`${actor}: race selector never appeared and lobby waiting state never showed`);
    } catch (error) {
        issues.push(`${actor}: race selector failed - ${String(error).split('\n')[0]}`);
    }
}

async function waitForMatchLobby(page, issues, actor, timeout = 15000) {
    const waitingLabel = page.locator('text=Waiting in Game');
    const playersLabel = page.locator('text=/Players:/');
    const startButton = page.getByRole('button', { name: 'Start Game' });
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        await waitForLobbyReady(page, issues, actor, 1500);
        if (await waitingLabel.count() > 0 && await waitingLabel.first().isVisible()) return true;
        if (await playersLabel.count() > 0 && await playersLabel.first().isVisible()) return true;
        if (await startButton.count() > 0 && await startButton.first().isVisible()) return true;
        await page.evaluate(() => {
            if (window.websocket && window.websocket.readyState === WebSocket.OPEN) {
                window.websocket.send('//gamelist');
                window.websocket.send('//getunlockedraces');
            }
        }).catch(() => null);
        await page.waitForTimeout(250);
    }

    issues.push(`${actor}: lobby waiting state did not appear within ${timeout}ms`);
    return false;
}

function attachDiagnostics(page, label, issues) {
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const text = msg.text();
            if (!text.includes('stripe.com') && !text.includes('ERR_BLOCKED_BY_CLIENT')) {
                issues.push(`${label}: console error: ${text}`);
            }
        }
    });

    page.on('response', response => {
        const status = response.status();
        const url = response.url();
        if (status >= 400 && !url.includes('/ws') && !url.includes('stripe.com')) {
            issues.push(`${label}: network ${status} ${url}`);
        }
    });

    page.on('pageerror', error => {
        const stack = error && error.stack
            ? String(error.stack).split('\n').slice(0, 3).join(' | ')
            : '';
        issues.push(`${label}: page error: ${error.message}${stack ? ` [${stack}]` : ''}`);
    });
}

async function safeClick(page, selector, issues, label, timeout = 1200) {
    if (page.isClosed()) {
        issues.push(`${label}: cannot click ${selector} because page is closed`);
        return false;
    }

    const locator = page.locator(selector).first();
    const controlCount = await locator.count().catch(error => {
        issues.push(`${label}: cannot inspect control ${selector} - ${String(error).split('\n')[0]}`);
        return 0;
    });

    if (controlCount === 0) {
        issues.push(`${label}: missing control ${selector}`);
        return false;
    }

    try {
        await locator.scrollIntoViewIfNeeded({ timeout });
        await locator.click({ timeout });
        return true;
    } catch (error) {
        const debug = await locator.evaluate(el => {
            const rect = el.getBoundingClientRect();
            const cx = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
            const cy = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
            const top = document.elementFromPoint(cx, cy);
            const lobbyWindow = document.getElementById('lobbyWindow');
            const gameOverModal = document.getElementById('gameOverModal');
            return {
                visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
                disabled: !!el.disabled,
                rect: `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)}`,
                topAtCenter: top ? `${top.tagName.toLowerCase()}#${top.id}.${top.className}` : 'none',
                lobbyDisplay: lobbyWindow ? getComputedStyle(lobbyWindow).display : '(missing)',
                gameOverHidden: gameOverModal ? gameOverModal.classList.contains('hidden') : '(missing)'
            };
        }).catch(() => null);

        if (debug) {
            issues.push(
                `${label}: click failed on ${selector} - ${String(error).split('\n')[0]} [visible=${debug.visible}, disabled=${debug.disabled}, rect=${debug.rect}, top=${debug.topAtCenter}, lobby=${debug.lobbyDisplay}, gameOverHidden=${debug.gameOverHidden}]`
            );
        } else {
            issues.push(`${label}: click failed on ${selector} - ${String(error).split('\n')[0]}`);
        }
        return false;
    }
}

async function validateTabReveal(page, buttonSelector, expectedPanelSelector, label, issues) {
    const clicked = await safeClick(page, buttonSelector, issues, label);
    if (!clicked) {
        return;
    }

    const panel = page.locator(expectedPanelSelector).first();
    if (await panel.count() === 0) {
        issues.push(`${label}: expected panel missing ${expectedPanelSelector}`);
        return;
    }

    const isHidden = await panel.evaluate(el => el.classList.contains('hidden'));
    if (isHidden) {
        issues.push(`${label}: tab ${buttonSelector} did not reveal ${expectedPanelSelector}`);
    }
}

async function exerciseInGameUi(page, label, issues) {
    if (page.isClosed()) {
        issues.push(`${label}: page closed before UI exercise`);
        return;
    }

    try {
        await expect(page.locator('#resourceBar')).toBeVisible({ timeout: 20000 });

        const buildTabClickable = await safeClick(page, '#buildtab', issues, label);
        if (!buildTabClickable) {
            issues.push(`${label}: core controls appear blocked; skipping remaining per-page interactions`);
            return;
        }

        const buildPanel = page.locator('#build').first();
        if (await buildPanel.count() > 0) {
            const buildHidden = await buildPanel.evaluate(el => el.classList.contains('hidden'));
            if (buildHidden) {
                issues.push(`${label}: #buildtab did not reveal #build`);
            }
        }
        
        await validateTabReveal(page, '#fleettab', '#fleet', label, issues);
        await validateTabReveal(page, '#techtab', '#techtree', label, issues);
        await validateTabReveal(page, '#colonizetab', '#colonize', label, issues);
        await validateTabReveal(page, '#analyticstab', '#analytics', label, issues);
        await safeClick(page, '#combatAnalyticsRefresh', issues, label);

        await safeClick(page, '#nextTurnBtn', issues, label);
        await safeClick(page, '#tile1', issues, label);
        const colonizeVisible = await page.locator('#colonizeBtn').first().isVisible().catch(() => false);
        if (colonizeVisible) {
            await safeClick(page, '#colonizeBtn', issues, label);
        }

        const chatCount = await page.locator('#chat').count().catch(() => 0);
        if (chatCount > 0) {
            await page.fill('#chat', `${label} chat ping`);
            await page.keyboard.press('Enter');
        } else {
            issues.push(`${label}: chat input missing`);
        }

        await safeClick(page, '#chatHistoryUp', issues, label);
        await safeClick(page, '#chatHistoryDown', issues, label);

        const shopContainer = page.locator('#shop-container');
        if (await shopContainer.count() === 0) {
            const runtime = await page.evaluate(() => ({
                hasShop: !!window.Shop,
                hasInit: !!(window.Shop && typeof window.Shop.initialize === 'function'),
                localStorageUserId: localStorage.getItem('userId'),
                cookieUserId: (document.cookie.match(/(?:^|;\s*)userId=([^;]+)/) || [null, null])[1]
            }));
            issues.push(
                `${label}: shop container never initialized (hasShop=${runtime.hasShop}, hasInit=${runtime.hasInit}, localStorageUserId=${runtime.localStorageUserId}, cookieUserId=${runtime.cookieUserId})`
            );
            return;
        }

        await safeClick(page, 'button:has-text("Shop")', issues, label);
        await page.waitForTimeout(600);
        const shopVisible = await page.locator('#shop-container:not(.shop-hidden)').count();
        if (shopVisible > 0) {
            await safeClick(page, '.shop-tab:has-text("Crystals")', issues, label);
            await safeClick(page, '.shop-tab:has-text("VIP Membership")', issues, label);
            await safeClick(page, '.shop-tab:has-text("Boosters")', issues, label);
            await safeClick(page, '.shop-tab:has-text("Cosmetics")', issues, label);
            await safeClick(page, '.shop-tab:has-text("Crystal Shop")', issues, label);
            await safeClick(page, '.shop-history-btn', issues, label);
            await safeClick(page, '.history-close', issues, label);
            await safeClick(page, '.shop-close', issues, label);
        } else {
            issues.push(`${label}: shop window did not open`);
        }
    } catch (error) {
        issues.push(`${label}: UI exercise aborted - ${String(error).split('\n')[0]}`);
    }
}

async function waitForGameOverModal(page, label, issues, timeout = 12000) {
    const deadline = Date.now() + timeout;
    let seen = false;

    while (Date.now() < deadline) {
        if (page.isClosed()) {
            issues.push(`${label}: page closed before game-over modal appeared`);
            return false;
        }

        seen = await page.evaluate(() => {
            const modal = document.getElementById('gameOverModal');
            return !!modal && !modal.classList.contains('hidden');
        }).catch(() => false);
        if (seen) {
            break;
        }

        await page.waitForTimeout(250);
    }

    if (!seen) {
        if (page.isClosed()) {
            issues.push(`${label}: page closed while checking game-over modal`);
            return false;
        }

        const debug = await page.evaluate(() => {
            const modal = document.getElementById('gameOverModal');
            const surrenderBtn = document.getElementById('surrenderBtn');
            return {
                modalClass: modal ? modal.className : '(missing)',
                surrenderText: surrenderBtn ? surrenderBtn.textContent : '(missing)',
                status: document.getElementById('status')?.textContent || '(missing)'
            };
        }).catch(() => ({
            modalClass: '(unavailable)',
            surrenderText: '(unavailable)',
            status: '(unavailable)'
        }));
        issues.push(
            `${label}: game-over modal not shown after surrender (modalClass=${debug.modalClass}, surrender=${debug.surrenderText}, status=${debug.status})`
        );
    }

    return seen;
}

test.describe('Exploratory multi-game UI strategy sweep', () => {
    test.setTimeout(240000);

    test('solo host + AI full UI sweep', async ({ browser }) => {
        const issues = [];
        const contextOptions = { viewport: { width: 1680, height: 1000 } };
        const soloContext = await browser.newContext(contextOptions);
        const soloPage = await soloContext.newPage();
        soloPage.on('dialog', dialog => dialog.accept());
        attachDiagnostics(soloPage, 'host-ai', issues);

        const hostName = uniqueId('sweep_host_');
        const gameName = uniqueId('sweep_match_');
        const password = 'Secure123!';

        await registerUser(soloPage, {
            username: hostName,
            email: `${hostName}@example.com`,
            password
        });

        await soloPage.fill('#gameName', gameName, { timeout: 5000 });
        await soloPage.selectOption('#maxPlayers', '4', { timeout: 5000 });
        await soloPage.selectOption('#gameMode', 'quick', { timeout: 5000 });
        await soloPage.click('#createGameBtn', { timeout: 5000 });
        await chooseFirstAvailableRace(soloPage, issues, 'host-ai');
        await waitForMatchLobby(soloPage, issues, 'host-ai');

        const aiCombos = [
            { difficulty: 'chill', strategy: 'balanced' },
            { difficulty: 'medium', strategy: 'economic' },
            { difficulty: 'aggressive', strategy: 'aggressive' }
        ];

        for (const combo of aiCombos) {
            if (await soloPage.locator('#aiDifficulty').count() === 0) {
                issues.push('host-ai: AI controls disappeared unexpectedly');
                break;
            }
            await soloPage.selectOption('#aiDifficulty', combo.difficulty, { timeout: 5000 });
            await soloPage.selectOption('#aiStrategy', combo.strategy, { timeout: 5000 });
            await soloPage.click('button:has-text("Add AI Opponent")', { timeout: 5000 });
            await soloPage.waitForTimeout(400);
        }

        await expect(soloPage.locator('text=Players: 4/4')).toBeVisible({ timeout: 15000 });
        await soloPage.getByRole('button', { name: 'Start Game' }).click({ timeout: 8000 });
        await soloPage.waitForURL('**/game.html', { timeout: 15000 });

        await exerciseInGameUi(soloPage, 'host-ai', issues);
        if (soloPage.isClosed()) {
            issues.push('host-ai: page closed after UI exercise');
        } else {
            await safeClick(soloPage, '#nextTurnBtn', issues, 'host-ai');
            await safeClick(soloPage, '#nextTurnBtn', issues, 'host-ai');
            await safeClick(soloPage, '#surrenderBtn', issues, 'host-ai');
            const soloOver = await waitForGameOverModal(soloPage, 'host-ai', issues, 10000);
            if (!soloOver) {
                issues.push('host-ai: surrender did not surface winner modal');
            }
        }

        await soloContext.close();

        console.log('--- Exploratory UI Sweep Issues ---');
        if (issues.length === 0) {
            console.log('No issues detected during exploratory sweep.');
        } else {
            issues.forEach((issue, idx) => console.log(`${idx + 1}. ${issue}`));
        }
    });
});
