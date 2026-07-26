// The shop knew your balance and never said it.
//
// Every part existed: a fetch of /api/user/:id/balance, a formatter, an error state, and
// five CSS rules down to a refresh button that spins on hover. What was missing was the
// markup and the call. updateBalanceDisplay looked up #crystal-balance, found nothing and
// returned; loadUserBalance was defined, exported as Shop.refreshBalance, and invoked from
// nowhere at all. So the panel that sells premium races never told you what you had to
// spend on them.
//
// no-dead-dom-targets.test.js catches the missing element. It cannot catch a function that
// is never called, which was the other half - so these three assertions cover the wiring
// either half would leave broken on its own.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const shop = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'shop-enhanced.js'), 'utf8');

test('the shop renders the element its balance writer targets', () => {
    assert.match(shop, /id="crystal-balance"/,
        'without this element updateBalanceDisplay returns early forever, and it does so '
        + 'quietly, because `if (!el) return` reads as defensive rather than dead');
});

test('opening the shop fetches the balance', () => {
    assert.match(shop, /open:\s*\(\)\s*=>\s*\{[\s\S]{0,800}?loadUserBalance\(\)/,
        'defining loadUserBalance is not enough - it was reachable only through '
        + 'Shop.refreshBalance, and nothing called that either');
});

test('a signed-out visitor is not shown an error where a number belongs', () => {
    // /api/user/:id/balance only matches digits, so a guest fetch 404s and the catch paints
    // a red "Error" at somebody whose only mistake was not being logged in. Verified in the
    // browser: guest renders the em-dash placeholder, an expired session still shows Error,
    // which is correct - that one really did fail to load.
    assert.match(shop, /if \(!userId\) return;/,
        'loadUserBalance must no-op when there is no user id');
});

test('the balance row says which currency it is counting', () => {
    // The game has a crystal resource in the HUD and a separate paid crystal balance. An
    // unlabelled number next to a crystal icon reads as the first one. Mislabelling this
    // in a panel that takes real money is worse than the original silence.
    assert.match(shop, /shop-balance-label[\s\S]{0,80}Premium crystals/,
        'the balance needs a label distinguishing it from the mined crystal resource');
});
