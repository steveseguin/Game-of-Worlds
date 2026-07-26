// The chart-naming prompt, driven in a real browser.
//
// The server half is covered by tests/name-sector-handler.test.js and the SQL by
// tests/map-naming-schema.test.js. What neither can see is the client half, and the client half
// is where this feature is most likely to break silently: three ids that have to exist in
// game.html, a candidate index that has to survive the trip back, and a sector id that has to be
// converted to the hex token every other sector command uses. Send a decimal id and it does not
// fail - it names a different sector.
//
// Reaching the prompt the honest way needs a fleet to survive a shoal, which is a 3-in-4 dice
// roll on a randomly placed sector. So this delivers the payload the server would send and then
// checks what actually goes out on the socket.

const { test, expect } = require('@playwright/test');
const {
    uniqueId,
    registerUser,
    createGame,
    startGame,
    dismissFirstRunGuidance
} = require('./support/ui-game-harness');

test.describe('The chart-naming prompt', () => {
    test.setTimeout(180000);

    test('offers the survey names and sends back the index of the one clicked', async ({ page }) => {
        page.on('dialog', dialog => dialog.accept().catch(() => {}));
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        const username = uniqueId('naming_');
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password: 'Secure123!'
        });
        await createGame(page, uniqueId('naming_game_'), { maxPlayers: '2', mode: 'test' });
        await startGame(page, [page]);
        await dismissFirstRunGuidance(page);

        // Record at sendGameCommand rather than at the socket. That is the documented boundary
        // between name-picker.js and connect.js, and it is also the only one that works: the
        // app's connection is not a bare WebSocket, so patching WebSocket.prototype.send sees
        // nothing at all. Keeping the real function in the chain means its return value still
        // tells us whether the order was accepted or silently dropped.
        await page.evaluate(() => {
            window.__sent = [];
            const original = window.sendGameCommand;
            window.sendGameCommand = function (command) {
                const accepted = original(command);
                window.__sent.push({ command, accepted });
                return accepted;
            };
        });

        // Sector 200 (0xC8) is deliberately not the player's homeworld: the prompt must use the
        // sector it was told about, not whatever happens to be selected.
        const CANDIDATES = ["the Vail Shoal", "Ames's Reach", "the Marn Bar", "Kettering's Gate"];
        await page.evaluate(candidates => {
            window.NamePicker.offer({
                sector: 200,
                chosen: candidates[0],
                candidates,
                turn: 1,
                cost: 4
            });
        }, CANDIDATES);

        const prompt = page.locator('#namePrompt');
        await expect(prompt).toBeVisible();

        // The cost leads. This is the beat the whole feature is built around - the player is
        // asked to name the place at the moment they learn what crossing it took - and it is the
        // first thing that would be lost to a well-meaning copy edit.
        await expect(page.locator('#namePromptBlurb')).toContainText('4 hulls did not arrive');

        // Every candidate is offered, in order, as text.
        const options = page.locator('#namePromptOptions button');
        await expect(options).toHaveCount(CANDIDATES.length);
        for (let i = 0; i < CANDIDATES.length; i += 1) {
            await expect(options.nth(i)).toHaveText(CANDIDATES[i]);
        }

        // The blurb names the sector in the same hex token the rest of the UI uses.
        await expect(page.locator('#namePromptBlurb')).toContainText('C8');

        // Click the third one. The wire must carry index 2 and the hex token, not the name and
        // not 200 - the two mistakes that would silently name the wrong place or nothing at all.
        await options.nth(2).click();
        await expect(prompt).toBeHidden();

        const sent = await page.evaluate(
            () => window.__sent.filter(m => m.command.startsWith('//namesector')));
        expect(sent).toEqual([{ command: '//namesector:C8:2', accepted: true }]);

        // --- a clean sweep reads as a clean sweep, not as "0 hulls" ---------------------------
        await page.evaluate(candidates => {
            window.NamePicker.offer({ sector: 200, chosen: candidates[0], candidates, turn: 1, cost: 0 });
        }, CANDIDATES);
        await expect(page.locator('#namePromptBlurb')).toContainText('every hull came home');
        await expect(page.locator('#namePromptBlurb')).not.toContainText('0 hull');

        // --- one hull is singular ------------------------------------------------------------
        await page.evaluate(candidates => {
            window.NamePicker.offer({ sector: 200, chosen: candidates[0], candidates, turn: 1, cost: 1 });
        }, CANDIDATES);
        await expect(page.locator('#namePromptBlurb')).toContainText('1 hull did not arrive');

        // --- dismissing costs nothing and sends nothing ---------------------------------------
        await page.evaluate(candidates => {
            window.__sent = [];
            window.NamePicker.offer({ sector: 200, chosen: candidates[0], candidates, turn: 1 });
        }, CANDIDATES);
        await expect(prompt).toBeVisible();
        await page.locator('#namePromptClose').click();
        await expect(prompt).toBeHidden();
        expect(await page.evaluate(() => window.__sent.length)).toBe(0);

        // --- a malformed payload is ignored rather than thrown -------------------------------
        // This arrives from the socket handler, so an exception here would stop the message pump
        // and take the rest of the turn's events with it.
        for (const bad of [null, {}, { sector: 200 }, { sector: 'x', candidates: ['a'] }, { sector: 200, candidates: [] }]) {
            await page.evaluate(payload => window.NamePicker.offer(payload), bad);
            await expect(prompt).toBeHidden();
        }

        expect(pageErrors, 'the page threw while the prompt was on screen').toEqual([]);
    });

    test('a named sector shows its chart name, and keeps it through a map refresh', async ({ page }) => {
        // Choosing a name is only half the feature. Until this pass the client received
        // sectorname/namedby/namedturn on every sector detail and read none of them, so a player
        // picked a name and then never saw it again. This checks the other half.
        page.on('dialog', dialog => dialog.accept().catch(() => {}));
        const username = uniqueId('chart_');
        await registerUser(page, {
            username,
            email: `${username}@example.com`,
            password: 'Secure123!'
        });
        await createGame(page, uniqueId('chart_game_'), { maxPlayers: '2', mode: 'test' });
        await startGame(page, [page]);
        await dismissFirstRunGuidance(page);

        // Find a sector the player can actually see, so the tooltip does not take its fog branch.
        const sectorId = await page.evaluate(() => window.GAME_STATE?.player?.homeworld || null);
        expect(sectorId, 'expected a known homeworld to hover').toBeTruthy();

        // The hex is `#tile<id>`, inside `#tileholder<id>`, and its mousemove handler is what
        // builds the tooltip. Dispatching the event is more reliable than a real hover here: the
        // minimap can be collapsed or scrolled, and this test is about the tooltip's contents.
        const hover = async () => page.evaluate(id => {
            const tile = document.getElementById(`tile${id}`);
            if (!tile) throw new Error(`no #tile${id} in the map`);
            tile.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 200 }));
        }, sectorId);

        await page.evaluate(id => {
            window.GalaxyMap.updateSectorStatus(id, window.GalaxyMap.SECTOR_STATUS.OWNED, {
                type: 1,
                live: true,
                chartName: "the Vail Shoal",
                namedBy: 'you',
                namedTurn: 12
            });
        }, sectorId);

        await hover();
        const tooltip = page.locator('#sector-tooltip');
        await expect(tooltip).toContainText('the Vail Shoal');
        await expect(tooltip).toContainText('Asteroid Belt');   // the type still classifies it
        await expect(tooltip).toContainText('named by you, turn 12');

        // A later mapstate refresh carries no name - it is a compact packing with no room for a
        // string. The name must survive that, because it is permanent; dropping it on the next
        // tick would be worse than never having shown it.
        await page.evaluate(id => {
            window.GalaxyMap.updateSectorStatus(id, window.GalaxyMap.SECTOR_STATUS.OWNED, {
                type: 1, live: true, flags: 0
            });
        }, sectorId);
        await hover();
        await expect(tooltip).toContainText('the Vail Shoal');

        // And markup in a name is escaped rather than rendered, even though the server composes
        // names from a fixed word list and cannot currently produce any.
        await page.evaluate(id => {
            window.GalaxyMap.updateSectorStatus(id, window.GalaxyMap.SECTOR_STATUS.OWNED, {
                type: 1, live: true, chartName: '<img src=x onerror=window.__xss=1>'
            });
        }, sectorId);
        await hover();
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
        expect(await page.locator('#sector-tooltip img').count()).toBe(0);
    });
});
