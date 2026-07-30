/**
 * shop-enhanced.js — the requisitions console.
 *
 * WHAT THIS SURFACE IS
 * The only screen in the product that asks for money, and the last one still wearing the
 * flat blue / cyan-gradient language every other surface was converted away from. It is
 * now built from the same three materials as the race-selection console, because it is
 * bolted into the same ship:
 *
 *   PLATE  raised metal — a bright two-step chamfer on the top/left, a black two-step on
 *          the bottom/right, over brushed steel, with a hard offset drop underneath.
 *          Windows, cards, tabs, buttons.
 *   SLOT   machined recess — shadow in from the top-left, a 1px catch-light on the bottom
 *          lip, black mat. Crest apertures, the price well, the card element.
 *   BAR    embossed strip — 1px light line on top, 1px black under, engraved text.
 *          Titles and the section rules.
 *
 * The key light is top-left and never moves. Borders are neutral steel: the only coloured
 * edges on this surface are the amber focus ring and the amber CONFIRM plate, both of
 * which are functional.
 *
 * WHY THE ART CHANGED
 * The three premium factions were sold with generic glowing SVG circles while the real
 * painted crests for exactly those factions already shipped for the race screen. A store
 * that does not show you the thing it is selling is not a store. The cards now mount the
 * SAME FILES THE ROSTER MOUNTS — crests-256-<n>.webp — with the roster's own per-faction
 * gain and scale, so the picture on the card and the picture on the race screen are the
 * same picture, mounted the same way.
 *
 * They are also the same BYTES. This screen used to serve a 128px PNG at 1x and a 512px
 * PNG at 2x: 47.8 KB and 193.0 KB for three 122px-tall stamps, on the one screen whose job
 * is to show a player the art they are buying. 256px WebP covers both — 18.7 KB for the
 * set, 2x the render height, generated for the race screen and already in the folder.
 *
 * NOTHING IS RASTERISED ON THE CLICK
 * The brushed-steel texture used to be a 128px seeded-noise tile built with canvas and
 * encoded with toDataURL() the first time Shop was pressed, synchronously, before the
 * window was shown. Measured on the game page it cost 2.4-3.2 s of frozen main thread —
 * no panel, no cursor change, the map and the turn clock both stopped — and the profile
 * put 2986 ms of it inside the PNG encode, which contends with the page's own WebGL
 * raster. It is a repeating-linear-gradient now: three incommensurate periods (5px, 7px,
 * 67px) that read as the same horizontal brushing, cost nothing to generate, nothing to
 * download and nothing to decode. openShop() paints on the frame of the click.
 *
 * WHAT A MODAL OWES THE PLAYER, which none of this had
 * Dialog semantics, a focus trap, Escape, and focus handed back to the control that opened
 * it. Every purchase control states what it is buying, what it costs, and what happens
 * afterwards; every control that cannot act says so on its face rather than only when
 * clicked; and every click on one of those still answers. Payments are off in most
 * environments, and "off here" has to read differently from "broken".
 *
 * WHAT IT MAY CLAIM
 * Only what the engine implements. The doctrine line on each card is the server's own
 * `specialAbility` string verbatim, and the restriction chips are RACE_ACCESS in
 * server/lib/races.js transcribed — locked hulls and capped branches — worded the way the
 * race screen's own chips word them. If those diverge the race screen is right, because it
 * reads the values off the wire and this file cannot.
 */

const Shop = (function() {
    let userId = null;
    let stripe = null;
    let elements = null;
    let cardElement = null;
    let currentProduct = null;
    let purchaseHistory = [];
    let ownedItems = new Set();
    // TWO DIFFERENT WAITS, and they used to be one flag, which broke checkout outright.
    // `processingPayment` means "a checkout is open" and guards against starting a second
    // one. `authorising` means "a charge is in flight with the bank" and guards against a
    // double submit. Sharing one flag meant startPurchaseFlow set it before the panel
    // appeared and nothing cleared it, so the card-change handler's
    // `disabled = event.empty || processingPayment` evaluated true forever: Pay now could
    // never arm, on any build with payments switched on.
    let processingPayment = false;
    let authorising = false;

    // 'idle' until something asks for it, then loading -> ready | error. The history panel
    // used to have exactly one state - a hard-coded "Loading purchase history..." that
    // nothing ever replaced when the fetch was never made, so a player who opened it in an
    // environment with payments off watched a spinner-less lie forever.
    let historyState = 'idle';

    const PLACEHOLDER_STRIPE_KEY = 'pk_test_YOUR_KEY_HERE';
    const STRIPE_SCRIPT_URL = 'https://js.stripe.com/v3/';
    const configState = {
        stripeKey: null,
        paymentsEnabled: false,
        ready: false,
        loadingPromise: null
    };
    let stripeScriptPromise = null;
    let stripeFailed = false;

    function hydrateConfigFromWindow() {
        if (typeof window === 'undefined') {
            return;
        }

        const key = typeof window.STRIPE_PUBLISHABLE_KEY === 'string'
            ? window.STRIPE_PUBLISHABLE_KEY.trim()
            : null;
        if (key !== null) {
            configState.stripeKey = key && key !== PLACEHOLDER_STRIPE_KEY ? key : null;
            configState.ready = true;
        }

        if (window.GAME_FEATURES && Object.prototype.hasOwnProperty.call(window.GAME_FEATURES, 'paymentsEnabled')) {
            const enabled = Boolean(window.GAME_FEATURES.paymentsEnabled);
            configState.paymentsEnabled = enabled && Boolean(configState.stripeKey);
            configState.ready = true;
        } else if (configState.stripeKey && !configState.ready) {
            configState.paymentsEnabled = true;
        }
    }

    function updateWindowConfig() {
        if (typeof window === 'undefined') {
            return;
        }
        window.STRIPE_PUBLISHABLE_KEY = configState.stripeKey || '';
        window.GAME_FEATURES = Object.assign({}, window.GAME_FEATURES, {
            paymentsEnabled: configState.paymentsEnabled
        });
    }

    function applyRuntimeConfig(data) {
        const rawKey = data && typeof data.stripePublishableKey === 'string'
            ? data.stripePublishableKey.trim()
            : '';
        const usableKey = rawKey && rawKey !== PLACEHOLDER_STRIPE_KEY ? rawKey : null;
        configState.stripeKey = usableKey;
        configState.paymentsEnabled = Boolean(data && data.paymentsEnabled) && Boolean(usableKey);
        configState.ready = true;
        updateWindowConfig();
        return configState;
    }

    function markConfigUnavailable(error) {
        configState.paymentsEnabled = false;
        configState.ready = true;
        if (error) {
            console.error('Failed to load runtime config:', error);
        }
        updateWindowConfig();
        return configState;
    }

    async function ensureConfigReady() {
        hydrateConfigFromWindow();
        if (configState.ready && configState.loadingPromise === null) {
            return configState;
        }
        if (configState.loadingPromise) {
            return configState.loadingPromise;
        }

        configState.loadingPromise = fetch('/api/config', {
            credentials: 'include',
            cache: 'no-store'
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(applyRuntimeConfig)
            .catch(markConfigUnavailable)
            .finally(() => {
                configState.loadingPromise = null;
            });

        return configState.loadingPromise;
    }

    hydrateConfigFromWindow();

    function loadStripeLibrary() {
        if (typeof window !== 'undefined' && typeof window.Stripe === 'function') {
            return Promise.resolve(window.Stripe);
        }
        if (stripeScriptPromise) {
            return stripeScriptPromise;
        }
        if (typeof document === 'undefined') {
            return Promise.reject(new Error('Stripe.js can only load in a browser'));
        }

        stripeScriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = STRIPE_SCRIPT_URL;
            script.async = true;
            script.dataset.stripeJs = 'true';

            script.addEventListener('load', () => {
                if (typeof window.Stripe === 'function') {
                    resolve(window.Stripe);
                    return;
                }
                stripeScriptPromise = null;
                reject(new Error('Stripe.js loaded without exposing Stripe'));
            }, { once: true });

            script.addEventListener('error', () => {
                stripeScriptPromise = null;
                reject(new Error('Stripe.js failed to load'));
            }, { once: true });

            document.head.appendChild(script);
        });

        return stripeScriptPromise;
    }

    // Notification helpers to keep the module resilient if the enhanced notification
    // system has not been loaded yet.
    function notify(message, type = 'info', duration = 5000) {
        const notifier = window.NotificationSystem;
        if (notifier && typeof notifier.show === 'function') {
            notifier.show(message, type, duration);
            return;
        }
        const method = type === 'error' ? 'error' : type === 'warning' ? 'warn' : 'log';
        console[method](`[Shop] ${message}`);
    }

    function notifyLoading(title = 'Loading...', message = '') {
        const notifier = window.NotificationSystem;
        if (notifier && typeof notifier.showLoading === 'function') {
            notifier.showLoading(title, message);
        } else {
            console.log(`[Shop] ${title}${message ? ` - ${message}` : ''}`);
        }
    }

    function notifyLoadingEnd() {
        const notifier = window.NotificationSystem;
        if (notifier && typeof notifier.hideLoading === 'function') {
            notifier.hideLoading();
        }
    }

    function notifyPayment(eventName, payload) {
        const notifier = window.NotificationSystem;
        if (notifier && notifier.payment && typeof notifier.payment[eventName] === 'function') {
            notifier.payment[eventName](payload);
        } else {
            const tag = eventName.toUpperCase();
            if (eventName === 'success') {
                console.log(`[Shop][${tag}] Purchase complete${payload ? `: ${payload}` : ''}`);
            } else {
                console.warn(`[Shop][${tag}] ${payload || 'Payment update'}`);
            }
        }
    }

    // Telemetry never speaks for the transaction. `window.analytics` on the game page is an
    // object without a .track method, so every unguarded call threw - which mattered because
    // one of them sat inside the purchase try block and converted a completed charge into
    // "an unexpected error occurred". Duck-typed, wrapped, and silent on failure: a metric
    // that did not send is not something to tell a player about.
    function track(eventName, payload) {
        try {
            const analytics = window.analytics;
            if (analytics && typeof analytics.track === 'function') {
                analytics.track(eventName, payload);
            }
        } catch (error) {
            console.warn('Analytics call failed:', error);
        }
    }

    /** Same plate as notify(), with the console's stencilled heading filled in. */
    function notifyTitled(title, message, type = 'info', duration = 5000) {
        const notifier = window.NotificationSystem;
        if (notifier && typeof notifier.notify === 'function') {
            return notifier.notify(title, message, type, duration);
        }
        notify(message, type, duration);
        return null;
    }

    /**
     * ONE PLATE FOR ONE CHARGE.
     *
     * A settled purchase used to raise two: "Payment Complete — Successfully purchased
     * Quantum Entities Race!" and, immediately under it, "Where to find it: pick Quantum
     * Entities at race selection...". Stacked with the pay-now hint that was still on
     * screen, that was three panels 400px wide covering the shop's header, its status strip
     * and the product it had just sold. The receipt and the next step are one sentence, and
     * this is the sentence.
     */
    function notifyPurchaseSettled(raceId) {
        notifyLoadingEnd();
        const race = PREMIUM_RACES.find(r => r.id === raceId);
        const name = race ? race.name : getProductName(raceId);
        notifyTitled('Payment Complete',
            `${name} unlocked — pick it at race selection, in this match and every future one.`,
            'success', 9000);
    }

    // Initialize shop with user ID
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    }

    async function initialize(uid) {
        const runtimeConfig = await ensureConfigReady();
        const resolvedStripeKey = runtimeConfig.stripeKey && runtimeConfig.stripeKey !== PLACEHOLDER_STRIPE_KEY
            ? runtimeConfig.stripeKey
            : null;
        const paymentsEnabled = Boolean(runtimeConfig.paymentsEnabled && resolvedStripeKey);

        userId = sanitizeUserId(uid || window.gameUserId || getCookie('userId'));
        if (userId) {
            window.gameUserId = userId;
        } else {
            window.gameUserId = null;
        }

        if (paymentsEnabled) {
            try {
                const stripeFactory = await loadStripeLibrary();
                stripe = stripeFactory(resolvedStripeKey);
                elements = stripe.elements({
                    fonts: [{ cssSrc: 'https://fonts.googleapis.com/css?family=Rajdhani' }]
                });
            } catch (error) {
                // A configured shop whose card library did not load is a DIFFERENT state
                // from a shop that was never switched on, and the two used to collapse into
                // the same "contact support" toast. This one is a fault and is recoverable.
                stripeFailed = true;
                console.error('Failed to initialize Stripe:', error);
            }
        } else {
            console.info('Payments disabled. The catalogue is browsable; nothing can be charged.');
        }

        createShopUI(runtimeConfig);

        if (!userId) {
            return;
        }

        // Ownership is read whether or not payments are switched on: that endpoint is a
        // plain user-scoped read independent of Stripe, and a player who bought a faction on
        // a build that HAD payments must still see it marked OWNED on one that does not -
        // otherwise the shop offers to sell it to them again. History is NOT fetched here;
        // it is a panel most players never open, so it costs a request on first open
        // instead of on every game load, and it has a real loading state to cover that.
        await loadOwnedItems();
    }

    // ---------------------------------------------------------------- catalogue
    //
    // Everything a card claims has a source in server code, named beside it. The
    // description and doctrine lines are RACE_TYPES in server/lib/races.js verbatim; the
    // restriction chips are RACE_ACCESS in the same file transcribed into the race screen's
    // own chip language (NO = a hull this faction may never build, CAP = a tech branch it
    // may not research past a level). Prices are PRODUCTS in server/lib/payments.js.

    // The crest paths are written out in full rather than assembled, because
    // tools/publish-art.js --audit proves every shipped byte is referenced by scanning
    // sources for the LITERAL filename — a built path reads as an orphan and gets deleted
    // out of the web root.
    const PREMIUM_RACES = [
        {
            id: 'race_quantum',
            name: 'Quantum Entities',
            code: 'QNT',
            price: '$4.99',
            crest: './images/ui/crests-256-10-quantum.webp',
            // MOUNTING[10] in race-selection.js, copied rather than approximated. The
            // roster measures every crest and normalises it onto one peak and one optical
            // height; carrying the same two numbers here is what stops Quantum and Shadow
            // Realm reading as smudges beside the lit gold of Titan Lords, and what stops
            // the shop's Quantum from being a different size to the roster's.
            crestGain: 1.25,
            crestScale: 1.03,
            description: 'Beings of pure energy with reality-bending abilities.',
            doctrine: 'Quantum Entanglement — superior research, crystal and firepower, paid for with 30% dearer hulls.',
            lockedHulls: ['Dreadnought'],
            cappedBranches: ['Armor ≤ Lv2']
        },
        {
            id: 'race_titan',
            name: 'Titan Lords',
            code: 'TTN',
            price: '$4.99',
            crest: './images/ui/crests-256-11-titan-lords.webp',
            crestGain: 1.06,
            crestScale: 0.97,
            description: 'Giants who build massive, powerful ships.',
            doctrine: 'Colossal — ships are twice as strong and twice as expensive, and they move slowly.',
            lockedHulls: ['Frigate', 'Destroyer', 'Scout', 'Intruder'],
            cappedBranches: ['Propulsion ≤ Lv1']
        },
        {
            id: 'race_shadow',
            name: 'Shadow Realm',
            code: 'SHD',
            price: '$4.99',
            crest: './images/ui/crests-256-12-shadow-realm.webp',
            crestGain: 1.38,
            crestScale: 1.02,
            description: 'Masters of stealth and subterfuge.',
            doctrine: 'Cloak — a stealth signature that hides your fleet’s composition from enemies whose scouts cannot see through it.',
            lockedHulls: ['Dreadnought', 'Carrier'],
            cappedBranches: ['Armor ≤ Lv2']
        }
    ];

    // Create enhanced shop UI
    function createShopUI(runtimeConfig) {
        const paymentsEnabled = Boolean(runtimeConfig && runtimeConfig.paymentsEnabled);

        const shopContainer = document.createElement('div');
        shopContainer.id = 'shop-container';
        shopContainer.className = 'shop-hidden';

        shopContainer.innerHTML = `
            <div class="shop-overlay" data-shop-action="close"></div>
            <div class="shop-window" role="dialog" aria-modal="true" aria-labelledby="shop-title" tabindex="-1">
                <div class="shop-header">
                    <h2 id="shop-title">Galactic Shop</h2>
                    <div class="shop-header-actions">
                        <span class="shop-panel-code" aria-hidden="true">PNL-SHP</span>
                        <button type="button" class="shop-history-btn" data-shop-action="history" aria-label="Purchase history">
                            <span class="history-icon" aria-hidden="true">&#9776;</span>
                            <span class="shop-btn-label">History</span>
                        </button>
                        <button type="button" class="shop-close" data-shop-action="close" aria-label="Close shop">
                            <span aria-hidden="true">&#10005;</span>
                        </button>
                    </div>
                </div>

                <div class="shop-tabs" role="tablist" aria-label="Shop categories">
                    <button type="button" class="shop-tab active" role="tab" id="shop-tabbtn-races"
                            aria-selected="true" aria-controls="shop-races"
                            data-tab="races" data-shop-action="tab">Premium Races</button>
                    <button type="button" class="shop-tab" role="tab" id="shop-tabbtn-cosmetics"
                            aria-selected="false" aria-controls="shop-cosmetics"
                            data-tab="cosmetics" data-shop-action="tab">Cosmetics</button>
                </div>

                ${renderStatusStrip(paymentsEnabled)}

                <!-- The catalogue bay scrolls, so it is focusable. On the Cosmetics tab every
                     card is deliberately inert - no buttons at all - which meant the bay held
                     no tab stop and a keyboard player could not reach the bottom of the list.
                     At 700x700 that hid a whole product. A scrollable region with no focusable
                     descendant is a WCAG 2.1.1 failure (axe scrollable-region-focusable), and
                     the fix is the region itself: Tab lands on it, arrows and PageDown scroll
                     it, and the amber ring shows where you are. -->
                <div class="shop-content" id="shop-content" tabindex="0"
                     role="region" aria-label="Shop catalogue">
                    ${generateShopSections()}
                </div>

                <!-- Lights only while there is catalogue under the fold; see
                     updateOverflowCue. aria-hidden and pointer-events:none - it duplicates
                     for the eye what a scrollable region already announces. -->
                <div class="shop-more" aria-hidden="true">
                    <span class="shop-more-slug">More below &#9660;</span>
                </div>

                <!-- role=dialog but NOT aria-modal: this panel is nested inside the shop's
                     own dialog, so a second aria-modal resolves to the OUTER window and
                     hands a screen reader the whole catalogue to browse mid-purchase. What
                     seals the catalogue is the inert attribute on the shop's own chrome,
                     applied for exactly as long as this panel is up - see pushLayer. -->
                <div id="payment-modal" class="payment-modal hidden">
                    <div class="payment-content" role="dialog" aria-labelledby="payment-title" tabindex="-1">
                        <div class="payment-header">
                            <h3 id="payment-title">Complete purchase</h3>
                            <button type="button" class="payment-close" data-shop-action="close-payment" aria-label="Cancel purchase">
                                <span aria-hidden="true">&#10005;</span>
                            </button>
                        </div>

                        <div id="payment-details" class="payment-details"></div>

                        <!-- The card field is a Stripe iframe, not a labelable element, so
                             the label's for= was inert: clicking "CARD DETAILS" did nothing,
                             on the one form in this product that takes a card number. A group
                             labelled by the caption carries the name instead. -->
                        <div class="payment-form">
                            <span class="payment-field-label" id="card-element-label">Card details</span>
                            <div role="group" aria-labelledby="card-element-label" aria-describedby="card-errors">
                                <div id="card-element" class="card-element"></div>
                            </div>
                            <div id="card-errors" class="card-errors" role="alert"></div>
                        </div>

                        <div class="payment-security">
                            <span class="security-icon" aria-hidden="true">&#128274;</span>
                            <span>Card details go straight to Stripe over its own encrypted frame. This
                            server never sees or stores them.</span>
                        </div>

                        <!-- aria-disabled, never the disabled attribute. A hard-disabled Pay
                             now dropped out of the tab order, so a keyboard player tabbing
                             this panel went card field -> Cancel -> wrap and never met the
                             button they came to press, with nothing saying why. Every locked
                             control in the catalogue already follows this rule; the one that
                             takes the money did not. It stays reachable, states why on its
                             face, and answers when pressed. -->
                        <div class="payment-actions">
                            <button type="button" data-shop-action="close-payment" class="btn-secondary">Cancel &mdash; nothing is charged</button>
                            <button type="button" id="submit-payment" class="btn-primary"
                                    aria-disabled="true" aria-describedby="submit-payment-note">
                                <span class="button-text">Pay now</span>
                                <span class="button-loading hidden">Authorising&hellip;</span>
                            </button>
                        </div>
                        <!-- role=status as well as aria-describedby: the button arming is a
                             change a keyboard player needs to hear WITHOUT having to tab to
                             it and check. The line is the button's description when read,
                             and announces itself when it changes. -->
                        <p class="payment-hint" id="submit-payment-note" role="status">Enter your card
                        details to arm this button. Nothing is charged until you press it.</p>

                        <p class="payment-terms">
                            One charge, taken once. The unlock is permanent, attached to your account rather
                            than to this match, and available at race selection in every game you join.
                        </p>
                    </div>
                </div>

                <div id="purchase-history-modal" class="history-modal hidden">
                    <div class="history-content" role="dialog" aria-labelledby="history-title" tabindex="-1">
                        <div class="history-header">
                            <h3 id="history-title">Purchase history</h3>
                            <button type="button" class="history-close" data-shop-action="close-history" aria-label="Close purchase history">
                                <span aria-hidden="true">&#10005;</span>
                            </button>
                        </div>
                        <div id="history-list" class="history-list" aria-live="polite"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(shopContainer);
        addEnhancedStyles();
        bindShopEvents(shopContainer);
        setupCardElement();
    }

    // ------------------------------------------------------ status instrument
    //
    // ONE INSTRUMENT, TWO STATES - not two different panels.
    //
    // The payments-on build used to open with a "Premium crystals" wallet: an icon, a
    // number, and a refresh button. Nothing in the product sells premium crystals and
    // nothing spends them. generateCrystalShopItems() - the only renderer that ever
    // offered a crystal sink - is not rendered anywhere, and both spendCrystals() and
    // purchaseCrystals() answer with "gameplay-affecting premium purchases are disabled".
    // So on production, the only server where this screen earns anything, the first thing
    // a paying player read was a balance attached to no store, over a refresh button that
    // re-fetched a number they could not change or use.
    //
    // Both builds now show the same strip in the same place, and the only difference is
    // the lamp and the sentence. A player who plays on two servers sees one instrument
    // reading differently, which is the thing an instrument is for.
    function renderStatusStrip(paymentsEnabled) {
        if (paymentsEnabled) {
            return `
                <div class="shop-status" role="status">
                    <span class="shop-lamp shop-lamp--on" aria-hidden="true"></span>
                    <span class="shop-status-tag">Status</span>
                    <span class="shop-status-body">
                        <strong>Purchases are live on this server.</strong>
                        <span>Card details are handled by Stripe in its own frame; this server never
                        sees them. Every unlock below is a single charge, taken once, attached to
                        your account rather than to this match.</span>
                    </span>
                </div>`;
        }
        return `
                <div class="shop-status" role="status">
                    <span class="shop-lamp shop-lamp--off" aria-hidden="true"></span>
                    <span class="shop-status-tag">Status</span>
                    <span class="shop-status-body">
                        <strong>Payments offline &mdash; nothing can be charged on this server.</strong>
                        <span>No payment processor is configured for this build, so the catalogue below is
                        browsable but no purchase can be completed. This is a setting, not a fault: nothing
                        here is broken and no card details are asked for.</span>
                    </span>
                </div>`;
    }

    // Withdrawn, not deleted, and deliberately not called - the same shape
    // generateCrystalShopItems() is kept in. The wallet row is only honest once something
    // actually sells for crystals; if that day comes, this is the markup and
    // loadUserBalance() already fills it. Until then createShopUI never emits it, so the
    // element does not exist, and loadUserBalance() sees that and does not fetch.
    // tests/shop-balance-visible.test.js pins this markup and the open() -> loadUserBalance
    // wiring, which is why both survive rather than being cut.
    function renderCrystalBalanceRow() {
        return `
                <div class="shop-balance">
                    <span class="shop-balance-label">Premium crystals</span>
                    <span class="shop-balance-value">
                        <img class="crystal-icon" src="images/crystal.png" alt="" width="22" height="22">
                        <span id="crystal-balance"><span class="balance-amount">&mdash;</span></span>
                        <button type="button" class="refresh-balance" data-shop-action="refresh-balance" aria-label="Refresh premium crystal balance">
                            <span aria-hidden="true">&#8635;</span>
                        </button>
                    </span>
                </div>`;
    }

    // Generate shop sections with owned item indicators
    function generateShopSections() {
        return `
            <section id="shop-races" class="shop-section active" role="tabpanel" aria-labelledby="shop-tabbtn-races">
                <h3>Premium Races</h3>
                <div class="shop-info">Unlock additional balanced race options. Paid races do not receive paid stat advantages, and each carries a hull restriction listed on its card.</div>
                <ul class="shop-items">
                    ${generateRaceItems()}
                </ul>
            </section>

            <section id="shop-cosmetics" class="shop-section" role="tabpanel" aria-labelledby="shop-tabbtn-cosmetics" hidden>
                <h3>Cosmetics</h3>
                <div class="shop-info">Planned appearance packs. None of these is finished, so none is on sale &mdash; the cards are here so you can see what is coming, not so you can buy it.</div>
                <ul class="shop-items">
                    ${generateCosmeticItems()}
                </ul>
            </section>
        `;
    }

    // ------------------------------------------------------------- action state
    //
    // ONE FUNCTION DECIDES WHAT A PURCHASE CONTROL IS, and the label, the plate, the
    // explanation and the click handler all read from it. They used to disagree: the price
    // rendered as a bright cyan pill on every card whatever the state of the payment
    // system, so on a build with payments off the shop showed three buttons that looked
    // live, and clicking one produced "Payment system not available. Please contact
    // support." - an error, about a fault that did not exist, naming a support desk that
    // could not help.

    function actionState(productId) {
        if (ownedItems.has(productId)) return 'owned';
        if (!configState.paymentsEnabled) return 'offline';
        if (stripeFailed || !stripe) return 'fault';
        if (!userId) return 'signedout';
        return 'ready';
    }

    const ACTION_COPY = {
        owned: {
            label: 'Owned',
            note: 'Already unlocked on this account. Pick it at race selection.'
        },
        offline: {
            label: 'Unavailable here',
            note: 'Payments are switched off on this server.'
        },
        fault: {
            label: 'Payment system unavailable',
            note: 'The card processor did not load. Retry to try again.'
        },
        signedout: {
            label: 'Sign in to buy',
            note: 'Sign in on this device to make a purchase.'
        },
        ready: {
            label: 'Buy',
            note: 'One-time charge. Permanent, account-wide.'
        }
    };

    /** The foot of a card: price well, action plate, and the state stated in words. */
    function itemActionMarkup(product) {
        const state = actionState(product.id);
        const copy = ACTION_COPY[state];
        const price = escapeHtml(product.price);

        // The price is an engraved figure, never a button. It was a filled cyan pill,
        // which on a card with no other control read as the buy button itself.
        const priceWell = `
            <span class="shop-price">
                <span class="shop-price-figure">${price}</span>
                <span class="shop-price-term">one-time &middot; account-wide</span>
            </span>`;

        if (state === 'owned') {
            // A CARD YOU HAVE PAID FOR DOES NOT QUOTE YOU A PRICE. It used to keep the well
            // exactly as it was — "$4.99 / ONE-TIME · ACCOUNT-WIDE", directly above the OWNED
            // plate and the line saying it is already unlocked — so for a beat the only
            // number on the card read as an offer to buy it a second time. A figure belongs
            // to a charge that has not happened yet; once it has, the well carries the
            // receipt instead, dated when the history panel has been loaded and knows.
            //
            // tabindex="-1" so it can RECEIVE focus without being a tab stop. The instant a
            // purchase succeeds the list is re-rendered and the Buy button the player just
            // pressed stops existing; without somewhere to put focus it landed on <body>,
            // and a player who had just paid $4.99 lost their place with nothing focused to
            // tell them the unlock had landed. The hidden prefix names the faction, so the
            // announcement is "Quantum Entities: Owned" rather than a bare "Owned".
            const on = purchaseDateFor(product.id);
            return `
            <div class="shop-item-foot">
                <span class="shop-price shop-price--paid">
                    <span class="shop-price-figure">Purchased</span>
                    ${on ? `<span class="shop-price-term">${escapeHtml(on)}</span>` : ''}
                </span>
                <span class="shop-action shop-action--owned" tabindex="-1"
                      ><span class="shop-sr">${escapeHtml(product.name)}: </span>${escapeHtml(copy.label)}</span>
                <p class="shop-item-state">${escapeHtml(copy.note)}</p>
            </div>`;
        }

        const buyable = state === 'ready';
        const label = buyable ? `${escapeHtml(copy.label)} &mdash; ${price}` : escapeHtml(copy.label);
        const aria = escapeHtml(buyable
            ? `Buy ${product.name} for ${product.price}`
            : `${copy.label}: ${product.name}`);

        // aria-disabled rather than disabled: a control the player cannot use is still a
        // control they should be able to reach, read and ask about. `disabled` would drop
        // it out of the tab order and out of the accessibility tree's reach, and then the
        // only way to find out why the shop will not sell you anything would be to see it.
        return `
            <div class="shop-item-foot">
                ${priceWell}
                <button type="button" class="shop-action${buyable ? '' : ' shop-action--locked'}"
                        data-shop-action="buy" data-product-id="${escapeHtml(product.id)}"
                        data-state="${state}"
                        ${buyable ? '' : 'aria-disabled="true"'}
                        aria-label="${aria}">${label}</button>
                <p class="shop-item-state">${escapeHtml(copy.note)}</p>
            </div>`;
    }

    // Generate race items
    function generateRaceItems() {
        return PREMIUM_RACES.map(race => {
            const owned = ownedItems.has(race.id);
            const hulls = race.lockedHulls.map(escapeHtml).join(' &middot; ');
            const caps = race.cappedBranches.map(escapeHtml).join(' &middot; ');

            return `
            <li class="shop-item${owned ? ' owned' : ''}" data-product-id="${escapeHtml(race.id)}">
                ${owned ? '<div class="owned-badge">OWNED</div>' : ''}
                <!-- No srcset. The crest plates are published at 256x193 and render at most
                     168px tall here, so 256 IS the 2x asset; the 512px PNG this used to hand
                     a HiDPI display was 64 KB apiece for no visible difference. width/height
                     carry the published raster's real shape, so the aperture reserves the
                     right box before the byte lands. Still lazy: the panel is display:none
                     until it is opened, so a player who never presses Shop pays nothing —
                     and one who does has these three files in cache already, because the
                     race screen mounted the same URLs on the way into the match. -->
                <div class="shop-port">
                    <img src="${escapeHtml(sanitizeImageSrc(race.crest))}"
                         alt="" width="256" height="193" loading="lazy" decoding="async"
                         style="--crest-gain:${Number(race.crestGain) || 1};--crest-scale:${Number(race.crestScale) || 1}">
                </div>
                <div class="shop-item-head">
                    <h4>${escapeHtml(race.name)}</h4>
                    <span class="shop-item-code">${escapeHtml(race.code)}</span>
                </div>
                <p class="item-description">${escapeHtml(race.description)}</p>

                <p class="shop-rule"><span>Doctrine</span></p>
                <p class="shop-doctrine">${escapeHtml(race.doctrine)}</p>

                <p class="shop-rule"><span>Permanent restrictions</span></p>
                <ul class="item-features">
                    <li><span class="shop-chip shop-chip--no">NO</span> <span>${hulls}</span></li>
                    <li><span class="shop-chip shop-chip--cap">CAP</span> <span>${caps}</span></li>
                </ul>

                <p class="shop-rule"><span>What unlocking gives you</span></p>
                <ul class="item-features">
                    <li><span class="shop-chip shop-chip--yes">ADD</span> <span>Playable at race selection in every match, with its crest, hulls and homeworld plate</span></li>
                </ul>

                ${itemActionMarkup(race)}
            </li>
        `;
        }).join('');
    }

    function sanitizeUserId(value) {
        if (value === null || value === undefined) {
            return null;
        }
        const trimmed = String(value).trim();
        return /^\d+$/.test(trimmed) ? trimmed : null;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function sanitizeCssToken(value, fallback = 'unknown') {
        const token = String(value || fallback)
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40);
        return token || fallback;
    }

    function formatCurrencyCents(value) {
        const cents = Number(value);
        if (!Number.isFinite(cents)) {
            return '$0.00';
        }
        return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
    }

    function formatCrystalAmount(value) {
        const amount = Number(value);
        if (!Number.isFinite(amount)) {
            return '0';
        }
        return Math.max(0, Math.floor(amount)).toLocaleString();
    }

    function sanitizeCurrency(value) {
        const currency = String(value || 'USD').toUpperCase();
        return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
    }

    function sanitizeImageSrc(value) {
        const src = String(value || '');
        if (!src.includes('..') && /^(?:\.\/|\/)?images\/[a-z0-9_./-]+\.(?:png|jpe?g|gif|svg|webp)$/i.test(src)) {
            return src;
        }
        return './images/resources.png';
    }

    function generateCosmeticItems() {
        const cosmetics = [
            {
                id: 'cosmetic_empire_theme',
                name: 'Empire Theme Pack',
                price: '$3.99',
                description: 'Custom UI skin, avatar frame, and lobby banner.',
                features: ['Dynamic UI colors', 'Animated banner', 'Unique chat flair'],
                image: './images/terran-emblem-v2.svg',
                available: false
            },
            {
                id: 'cosmetic_fleet_trails',
                name: 'Fleet Engine Trails',
                price: '$2.49',
                description: 'Leave prismatic trails across the galaxy map.',
                features: ['Animated fleet trails', 'Custom warp animation'],
                image: './images/zephyr-icon.svg',
                available: false
            },
            {
                id: 'cosmetic_voice_pack',
                name: 'AI Advisor Voice Pack',
                price: '$1.99',
                description: 'New voice lines for alerts and turn reminders.',
                features: ['20+ voiced notifications', 'Toggle per category'],
                image: './images/quantum-icon.svg',
                available: false
            }
        ];

        // Nothing is implemented behind these and the server refuses to sell them, so the
        // card describes the plan and carries no control at all. A pressed-in plate reading
        // COMING SOON cannot be clicked, cannot be tabbed to, and cannot fail - which is
        // the honest shape for a thing that does not exist yet.
        //
        // NO PICTURE EITHER, and that is deliberate: these three used to borrow whichever
        // glowing SVG roundel was lying around (a Terran emblem for a UI skin, a Zephyr
        // icon for engine trails), which showed the player art that has nothing to do with
        // the product AND put the exact holographic language this console was converted
        // away from back on a third of the shop. Unbuilt products have no art; a stencilled
        // slug says so.
        return cosmetics.map(item => {
            const soon = item.available === false;
            return `
            <li class="shop-item${soon ? ' unavailable' : ''}" data-product-id="${item.id}"
                ${soon ? 'aria-disabled="true"' : ''}>
                <div class="shop-item-head">
                    <h4>${item.name}</h4>
                    <span class="shop-item-code">${soon ? 'UNBUILT' : ''}</span>
                </div>
                <p class="item-description">${item.description}</p>
                <ul class="item-features">
                    ${item.features.map(feature => `<li><span class="shop-chip shop-chip--plan">PLAN</span> <span>${feature}</span></li>`).join('')}
                </ul>
                <div class="shop-item-foot">
                    <span class="shop-price shop-price--muted">
                        <span class="shop-price-figure">${soon ? '&mdash;' : item.price}</span>
                        <span class="shop-price-term">${soon ? 'not priced yet' : 'one-time'}</span>
                    </span>
                    <span class="shop-action shop-action--soon">${soon ? 'Coming soon' : 'Buy'}</span>
                    <p class="shop-item-state">${soon ? 'Not built yet, so not for sale. Nothing to click.' : ''}</p>
                </div>
            </li>
        `;
        }).join('');
    }

    // Not rendered anywhere, and deliberately kept: the crystal spend was withdrawn
    // because nothing was implemented behind it, and tests/dormant-features-fail-closed
    // pins this renderer so that if the feature is ever revived it comes back as inert
    // "coming soon" cards rather than as four clickable purchases the server would refuse.
    function generateCrystalShopItems() {
        const items = [
            {
                id: 'crystal_instant_build',
                name: 'Instant Build',
                cost: 50,
                description: 'Finish the current build queue immediately.'
            },
            {
                id: 'crystal_sector_scan',
                name: 'Deep Sector Scan',
                cost: 35,
                description: 'Reveal resources and fleets in any sector.'
            },
            {
                id: 'crystal_warp_refresh',
                name: 'Warp Gate Refresh',
                cost: 40,
                description: 'Reset warp gate cooldowns across your empire.'
            },
            {
                id: 'crystal_emergency_fleet',
                name: 'Emergency Fleet Draft',
                cost: 120,
                description: 'Instantly gain a defensive fleet at your homeworld.'
            }
        ];

        return items.map(item => `
            <li class="shop-item unavailable" data-product-id="${item.id}" aria-disabled="true">
                <div class="shop-item-head">
                    <h4>${item.name}</h4>
                    <span class="shop-item-code">UNBUILT</span>
                </div>
                <p class="item-description">${item.description}</p>
                <div class="shop-item-foot">
                    <span class="shop-price shop-price--muted">
                        <span class="shop-price-figure">&mdash;</span>
                        <span class="shop-price-term">not priced yet</span>
                    </span>
                    <span class="shop-action shop-action--soon">Coming soon</span>
                </div>
            </li>
        `).join('');
    }

    // Setup card element with real-time validation
    function setupCardElement() {
        if (!stripe || !elements) return;

        const style = {
            base: {
                color: '#E6ECF5',
                fontFamily: 'Rajdhani, "Segoe UI", sans-serif',
                fontSmoothing: 'antialiased',
                fontSize: '16px',
                '::placeholder': {
                    color: '#8A9AB0'
                }
            },
            invalid: {
                color: '#E58469',
                iconColor: '#E58469'
            }
        };

        cardElement = elements.create('card', { style });

        // Add real-time validation
        cardElement.on('change', (event) => {
            const errorElement = document.getElementById('card-errors');
            if (!errorElement) return;

            if (event.error) {
                errorElement.textContent = event.error.message;
                errorElement.classList.add('visible');
                setPayBlocked('invalid');
            } else {
                errorElement.textContent = '';
                errorElement.classList.remove('visible');
                if (authorising) setPayBlocked('authorising');
                else setPayBlocked(event.empty || !event.complete ? 'incomplete' : null);
            }
        });
    }

    // ------------------------------------------------------- the pay-now button
    //
    // It tracks WHY it cannot charge, not merely THAT it cannot, because each reason has a
    // different answer and a different thing for the player to do next. It is never
    // `disabled`: that dropped the single most important control in the product out of the
    // tab order, so a keyboard player could tab the checkout panel end to end and never
    // meet it. Locked, it is the same plate pressed IN - readable in greyscale - it names
    // its own condition in the line underneath, and pressing it says what to fix.

    const PAY_BLOCK_NOTE = {
        incomplete: 'Enter your card details to arm this button. Nothing is charged until you press it.',
        invalid: 'Correct the card details above to arm this button. Nothing has been charged.',
        authorising: 'Authorising with your bank. Do not close this panel.',
        ready: 'Pressing this charges the total above, once.'
    };

    let payBlockedBecause = 'incomplete';
    let payNoteFlash = null;

    function setPayBlocked(reason) {
        payBlockedBecause = reason || null;
        const button = document.getElementById('submit-payment');
        if (!button) return;
        button.setAttribute('aria-disabled', payBlockedBecause ? 'true' : 'false');
        const note = document.getElementById('submit-payment-note');
        if (!note) return;
        note.textContent = PAY_BLOCK_NOTE[payBlockedBecause] || PAY_BLOCK_NOTE.ready;
        // The lit hint describes a condition. The instant the condition changes - above all
        // the instant the button ARMS - the light goes out. Nothing on this panel may
        // survive the state it was raised for; that is how a stale "enter your card
        // details" ended up sitting on top of "Payment Complete".
        clearTimeout(payNoteFlash);
        note.classList.remove('payment-hint--flash');
    }

    // A HINT THAT IS ALREADY ON SCREEN IS NOT NEWS.
    //
    // Pressing the locked Pay now used to raise a 7000ms amber toast carrying the exact
    // sentence already printed 40px under the button in a role=status — so the panel said
    // one thing twice, in two registers, and the toast outlived its own condition: it lives
    // longer than it takes to type a card number, so at the moment the charge landed the
    // player got a stale "enter your card details to arm this button" stacked directly
    // above "Payment Complete", with the checkout's product art buried under both.
    //
    // The note pulses instead. It is the same words in the same place, it is already
    // announced by role=status when it changes, and it cannot survive the state it
    // describes because it IS the state it describes.
    function flashPayNote() {
        const note = document.getElementById('submit-payment-note');
        if (!note) return;
        clearTimeout(payNoteFlash);
        note.classList.remove('payment-hint--flash');
        // Reading offsetWidth restarts the animation; without it a second press on an
        // already-lit note does nothing at all, which reads as a dead button.
        void note.offsetWidth;
        note.classList.add('payment-hint--flash');
        payNoteFlash = setTimeout(() => note.classList.remove('payment-hint--flash'), 1500);
    }

    function handlePayClick(paymentData, options) {
        if (!payBlockedBecause) {
            handlePaymentSubmission(paymentData, options);
            return;
        }
        flashPayNote();
        if (payBlockedBecause === 'authorising') {
            // The one case with nothing on screen to point at: the button is showing a
            // spinner, so the answer to "did my press land?" has to come from somewhere.
            notify('Still authorising with your bank - this takes a moment, and pressing again '
                + 'will not charge you twice.', 'info', 6000);
            return;
        }
        // Put the player where the fix is, rather than leaving them to find it.
        if (cardElement && typeof cardElement.focus === 'function') {
            try { cardElement.focus(); } catch (error) { /* iframe not mounted */ }
        }
    }

    async function parseJsonResponse(response, contextMessage) {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error(`${contextMessage} (unexpected response type)`);
        }
        try {
            return await response.json();
        } catch (error) {
            throw new Error(`${contextMessage} (invalid JSON)`);
        }
    }

    // Load user balance with error handling
    async function loadUserBalance() {
        // A guest has no id, and /api/user/:id/balance only matches digits - fetching
        // anyway would 404 and paint a red "Error" at someone who simply is not signed
        // in. Leave the placeholder showing instead.
        if (!userId) return;
        // Nor is there any point asking the server for a number nobody is going to see.
        // The wallet row is withdrawn (see renderCrystalBalanceRow), so opening the shop
        // used to fire /api/user/N/balance on every open and throw the answer away. The
        // guard lives here rather than at the call site so that the day the row comes
        // back, opening the shop fills it again with no further wiring.
        if (!document.getElementById('crystal-balance')) return;
        try {
            const response = await fetch(`/api/user/${userId}/balance`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to load balance');

            const data = await parseJsonResponse(response, 'Failed to load balance');
            updateBalanceDisplay(data.crystals || 0);
        } catch (error) {
            console.error('Failed to load balance:', error);
            updateBalanceDisplay(0, true);
        }
    }

    // Update balance display
    function updateBalanceDisplay(amount, error = false) {
        const balanceElement = document.getElementById('crystal-balance');
        if (!balanceElement) {
            return;
        }
        if (error) {
            balanceElement.innerHTML = '<span class="balance-error">Could not load</span>';
        } else {
            balanceElement.innerHTML = `<span class="balance-amount">${formatCrystalAmount(amount)}</span>`;
        }
    }

    // Load owned items
    async function loadOwnedItems() {
        // Same guard as loadUserBalance: without an id this fetches /api/user/null/... ,
        // which matches no route. Worse here than for the balance - a failed load leaves
        // ownedItems empty, and purchaseRace only refuses a duplicate when that set says
        // you already own it.
        if (!userId) return;
        try {
            const response = await fetch(`/api/user/${userId}/owned-items`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to load owned items');

            const data = await parseJsonResponse(response, 'Failed to load owned items');
            ownedItems = new Set(data.items || []);
            updateOwnedItemsDisplay();
        } catch (error) {
            console.error('Failed to load owned items:', error);
        }
    }

    // Load purchase history
    async function loadPurchaseHistory() {
        if (!userId) {
            historyState = 'ready';
            purchaseHistory = [];
            renderHistory();
            return;
        }
        historyState = 'loading';
        renderHistory();
        try {
            const response = await fetch(`/api/user/${userId}/purchase-history`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to load history');

            const data = await parseJsonResponse(response, 'Failed to load purchase history');
            purchaseHistory = data.history || [];
            historyState = 'ready';
        } catch (error) {
            console.error('Failed to load purchase history:', error);
            historyState = 'error';
        }
        renderHistory();
        // The receipts are also what dates an owned card's "Purchased" well, so the
        // catalogue is repainted once the rows land rather than staying undated behind an
        // open panel that already knows.
        refreshItemStates();
    }

    // Purchase race with enhanced flow
    async function purchaseRace(productId) {
        if (ownedItems.has(productId)) {
            notify('You already own this race - pick it at race selection.', 'warning');
            return;
        }

        await processPurchase(productId, 'race', {
            onSuccess: () => {
                ownedItems.add(productId);
                updateOwnedItemsDisplay();
            }
        });
    }

    async function purchaseCosmetic(productId) {
        if (ownedItems.has(productId)) {
            notify('You already own this cosmetic!', 'warning');
            return;
        }

        await processPurchase(productId, 'cosmetic', {
            onSuccess: () => {
                ownedItems.add(productId);
                updateOwnedItemsDisplay();
            }
        });
    }

    function notifyGameplayPurchaseDisabled() {
        notify('Gameplay-affecting premium purchases are disabled. Only race unlocks and cosmetics are available.', 'warning', 7000);
    }

    /**
     * Every click on a purchase control answers, including the ones that cannot buy.
     * A control that is visibly locked and silently inert teaches a player that the panel
     * is broken; one that explains itself teaches them the shop is fine and the server is
     * configured a particular way.
     */
    function handleBuyClick(button) {
        const productId = button.getAttribute('data-product-id');
        const state = actionState(productId);
        const product = PREMIUM_RACES.find(r => r.id === productId);
        const name = product ? product.name : getProductName(productId);

        if (state === 'ready') {
            purchaseRace(productId);
            return;
        }
        if (state === 'owned') {
            notify(`${name} is already unlocked on this account - choose it at race selection.`, 'info', 6000);
            return;
        }
        if (state === 'offline') {
            notify('This server has no payment processor configured, so nothing can be bought here '
                + 'and nothing was charged. The catalogue is browsable so you can see what a live '
                + 'server offers.', 'info', 9000);
            return;
        }
        if (state === 'signedout') {
            notify('Sign in on this device before buying - a purchase is attached to an account.', 'warning', 7000);
            return;
        }
        // 'fault': configured, but the card library never arrived. This one is worth
        // retrying, so the click does that rather than shrugging.
        notify('The card processor did not load. Retrying now…', 'warning', 5000);
        retryStripe();
    }

    async function retryStripe() {
        if (!configState.paymentsEnabled || !configState.stripeKey) return;
        try {
            stripeScriptPromise = null;
            const stripeFactory = await loadStripeLibrary();
            stripe = stripeFactory(configState.stripeKey);
            elements = stripe.elements({
                fonts: [{ cssSrc: 'https://fonts.googleapis.com/css?family=Rajdhani' }]
            });
            stripeFailed = false;
            setupCardElement();
            notify('Payment system is available again.', 'success', 5000);
        } catch (error) {
            stripeFailed = true;
            console.error('Stripe retry failed:', error);
            notify('The card processor still will not load. Check your connection or any '
                + 'script blocker, then try again.', 'error', 9000);
        }
        refreshItemStates();
    }

    // Enhanced purchase process
    async function processPurchase(productId, type, options = {}) {
        if (!stripe) {
            if (!configState.paymentsEnabled) {
                notify('Payments are switched off on this server. Nothing was charged.', 'info', 7000);
            } else {
                notify('The card processor is not loaded yet. Try again in a moment.', 'error', 8000);
            }
            return;
        }

        if (processingPayment) {
            notify('Please wait for current payment to complete', 'warning');
            return;
        }

        currentProduct = { productId, type, ...options };
        await startPurchaseFlow(productId, type, options);
    }

    // Start purchase flow
    async function startPurchaseFlow(productId, type, options) {
        try {
            processingPayment = true;
            notifyLoading('Preparing checkout…', 'Please wait');

            // Create payment intent
            const response = await fetch('/api/payment/create-intent', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    productId: productId,
                    metadata: { type: type }
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.message || error.error || 'Failed to create payment');
            }

            const paymentData = await response.json();

            notifyLoadingEnd();
            showPaymentModal(productId, paymentData, options);

        } catch (error) {
            processingPayment = false;
            notifyLoadingEnd();
            notifyPayment('error', `${error.message}. Nothing was charged - you can try again.`);

            // Log error for debugging
            console.error('Purchase error:', error);

            track('Payment Error', { productId: productId, error: error.message });
        }
    }

    // Show enhanced payment modal
    function showPaymentModal(productId, paymentData, options) {
        const modal = document.getElementById('payment-modal');
        const details = document.getElementById('payment-details');
        if (!modal || !details) return;

        const product = getProductDetails(productId);
        const productImage = escapeHtml(sanitizeImageSrc(product.image));
        const productName = escapeHtml(product.name);
        const productDescription = escapeHtml(product.description);
        const amountLabel = formatCurrencyCents(paymentData.amount);
        const currency = escapeHtml(sanitizeCurrency(paymentData.currency));

        // Same crest, same aperture, same normalisation as the card the player pressed —
        // the thing being charged for has to look like the thing they picked.
        details.innerHTML = `
            <div class="payment-product">
                <span class="shop-port shop-port--small">
                    <img src="${productImage}" alt="" width="256" height="193" class="payment-product-image"
                         style="--crest-gain:${Number(product.crestGain) || 1};--crest-scale:${Number(product.crestScale) || 1}">
                </span>
                <div class="payment-product-info">
                    <h4>${productName}</h4>
                    <p>${productDescription}</p>
                </div>
            </div>

            <dl class="payment-summary">
                <div class="summary-row">
                    <dt>Subtotal</dt>
                    <dd>${amountLabel}</dd>
                </div>
                <div class="summary-row">
                    <dt>Tax</dt>
                    <dd>$0.00</dd>
                </div>
                <div class="summary-row total">
                    <dt>Total due now</dt>
                    <dd>${amountLabel} ${currency}</dd>
                </div>
            </dl>
        `;

        modal.classList.remove('hidden');

        // A fresh panel starts with an empty card field, so the button starts locked and
        // says so. Re-set explicitly: a second checkout in the same session would otherwise
        // inherit whatever state the last one ended in.
        authorising = false;
        setPayBlocked('incomplete');

        // Mount card element
        if (cardElement) {
            cardElement.mount('#card-element');

            // Setup payment submission
            const submitButton = document.getElementById('submit-payment');
            if (submitButton) {
                submitButton.onclick = () => handlePayClick(paymentData, options);
            }
        }

        pushLayer(modal.querySelector('.payment-content'), closePayment);
    }

    async function confirmPaymentOnServer(paymentIntentId) {
        const response = await fetch('/api/payment/confirm-test', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                paymentIntentId
            })
        });

        const payload = await parseJsonResponse(response, 'Failed to confirm purchase');
        if (!response.ok || payload.error) {
            throw new Error(payload.error || 'Failed to confirm purchase');
        }
        return payload;
    }

    // Handle payment submission with better error handling
    async function handlePaymentSubmission(paymentData, options) {
        const submitButton = document.getElementById('submit-payment');
        if (!submitButton) return;
        const buttonText = submitButton.querySelector('.button-text');
        const buttonLoading = submitButton.querySelector('.button-loading');
        const errorElement = document.getElementById('card-errors');

        const restoreButton = () => {
            authorising = false;
            // The card is still mounted and still filled in, so the button re-arms: the
            // player's next move after a decline is to press it again, and it should be
            // ready for that rather than waiting for another keystroke in the iframe.
            setPayBlocked(null);
            buttonText.classList.remove('hidden');
            buttonLoading.classList.add('hidden');
        };

        try {
            // Lock the button and show loading
            authorising = true;
            setPayBlocked('authorising');
            buttonText.classList.add('hidden');
            buttonLoading.classList.remove('hidden');

            // Clear any existing errors
            if (errorElement) {
                errorElement.textContent = '';
                errorElement.classList.remove('visible');
            }

            // Confirm payment with Stripe
            const { error, paymentIntent } = await stripe.confirmCardPayment(
                paymentData.clientSecret,
                {
                    payment_method: {
                        card: cardElement,
                        billing_details: {}
                    }
                }
            );

            if (error) {
                // Every failure path leaves the panel open, the card mounted, and a
                // sentence in the error slot saying what to change. A toast alone puts the
                // recovery instruction somewhere the player is not looking.
                if (errorElement) {
                    errorElement.textContent = `${error.message || 'The card was declined.'} Nothing was charged.`;
                    errorElement.classList.add('visible');
                }
                if (error.type === 'card_error') {
                    notifyPayment('declined');
                } else if (error.type === 'validation_error') {
                    notify('Check the card details and try again. Nothing was charged.', 'error');
                } else {
                    notifyPayment('error', error.message);
                }

                restoreButton();
            } else {
                await confirmPaymentOnServer(paymentIntent.id);

                // THE CHARGE HAS SETTLED. Nothing below this line may be allowed to tell the
                // player it failed.
                //
                // It used to. The bookkeeping ran inside the same try, and the game page
                // publishes a window.analytics object with no .track method - so every single
                // successful purchase threw a TypeError one line after "Purchase complete",
                // fell into the catch, and painted "PAYMENT ERROR - an unexpected error
                // occurred" plus "if your card was charged the unlock will appear in your
                // history" over the top of it. Two contradictory verdicts on one $4.99
                // charge, and the frightening one landed last.
                //
                // Delivery is what the player paid for and it comes first; telemetry is
                // ours and it comes last, in its own guard.
                closePayment();
                // The NAME, not the row key: the confirmation for a $4.99 charge used to
                // read "Successfully purchased race_quantum!" - a database row, not the
                // faction the player chose. One plate, carrying both the receipt and the
                // one thing they cannot guess, which is where the unlock now lives.
                notifyPurchaseSettled(currentProduct.productId);
                try {
                    if (options.onSuccess) {
                        options.onSuccess();
                    }
                } catch (deliveryError) {
                    // The unlock is on the account whatever the panel manages to redraw.
                    console.error('Post-purchase refresh failed:', deliveryError);
                    notify('Your purchase went through. The shop could not refresh itself - reopen '
                        + 'it, or check Purchase history, to see the unlock.', 'warning', 9000);
                }
                track('Purchase Complete', {
                    productId: currentProduct.productId,
                    amount: paymentData.amount / 100,
                    currency: paymentData.currency
                });
                return;
            }

        } catch (error) {
            console.error('Payment error:', error);
            if (errorElement) {
                errorElement.textContent = 'Something went wrong finishing the purchase. '
                    + 'If your card was charged the unlock will appear in your history; otherwise try again.';
                errorElement.classList.add('visible');
            }
            notifyPayment('error', 'An unexpected error occurred');

            restoreButton();
        } finally {
            processingPayment = false;
            authorising = false;
        }
    }

    // Spend crystals with confirmation
    async function spendCrystals() {
        notifyGameplayPurchaseDisabled();
    }

    // ------------------------------------------------------------------ history

    function renderHistory() {
        const list = document.getElementById('history-list');
        if (!list) return;

        if (historyState === 'loading') {
            list.innerHTML = '<p class="history-note">Loading purchase history…</p>';
            return;
        }

        if (historyState === 'error') {
            list.innerHTML = `
                <p class="history-note">Your purchase history could not be loaded. Nothing is lost &mdash;
                this is a failed read, not a missing record.</p>
                <button type="button" class="btn-secondary" data-shop-action="retry-history">Try again</button>`;
            return;
        }

        if (!userId) {
            list.innerHTML = '<p class="history-note">Sign in on this device to see purchases '
                + 'attached to your account.</p>';
            return;
        }

        if (purchaseHistory.length === 0) {
            // Three different empty states, because "No purchases yet" is the wrong
            // sentence in two of them.
            list.innerHTML = configState.paymentsEnabled
                ? '<p class="history-note">No purchases yet. Anything you buy will be listed here with its date and amount.</p>'
                : '<p class="history-note">No purchases recorded. This server has no payment processor '
                  + 'configured, so nothing can be bought or charged here.</p>';
            return;
        }

        list.innerHTML = `
            <div class="history-item history-head" aria-hidden="true">
                <span>Date</span><span>Item</span><span>Amount</span><span>Status</span>
            </div>
            ${purchaseHistory.map(purchase => {
                const productName = purchase.productName || purchase.product_id || 'Unknown product';
                const status = purchase.status || 'unknown';
                const statusClass = sanitizeCssToken(status);

                return `
                    <div class="history-item">
                        <span class="history-date">${escapeHtml(formatDate(purchase.date))}</span>
                        <span class="history-product">${escapeHtml(productName)}</span>
                        <span class="history-amount">${formatCurrencyCents(purchase.amount)}</span>
                        <span class="history-status status-${statusClass}">${escapeHtml(status)}</span>
                    </div>
                `;
            }).join('')}`;
    }

    // Show purchase history
    function showHistory() {
        const modal = document.getElementById('purchase-history-modal');
        if (!modal) return;
        if (historyState === 'idle' && userId) {
            loadPurchaseHistory();
        } else {
            renderHistory();
        }
        modal.classList.remove('hidden');
        pushLayer(modal.querySelector('.history-content'), hideHistory);
    }

    function hideHistory() {
        const modal = document.getElementById('purchase-history-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        modal.classList.add('hidden');
        popLayer();
    }

    // ------------------------------------------------- dialog layers & keyboard
    //
    // The shop was a modal in appearance only: no dialog role, nothing to stop Tab walking
    // out of it and into the tactical map behind, no Escape, and after closing it, focus
    // was on <body> - so a keyboard player's next Tab restarted from the top of the page
    // instead of returning to the Shop button they pressed. Three layers can stack (shop,
    // then payment or history), so this is a stack rather than a flag.

    const layers = [];
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),'
        + ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // THE TAB TRAP WAS NEVER THE WHOLE JOB, because a virtual cursor is not Tab.
    //
    // With the checkout open and a card number typed into it, a screen-reader user could
    // still arrow through the catalogue behind it and press "Titan Lords, Buy — $4.99".
    // Nothing was hidden from the accessibility tree when a nested panel opened; both
    // dialogs simply asserted aria-modal="true", and since the checkout is nested INSIDE
    // the shop dialog, "the modal" resolved to the outer window and everything in it.
    //
    // inert is the one mechanism that answers both: it takes the shop's own chrome out of
    // the accessibility tree, out of the tab order and out of pointer reach in a single
    // attribute, for exactly as long as a nested panel is up. With it applied, the nested
    // dialogs do not need aria-modal at all - and must not have it, because the honest
    // reading of two nested aria-modal dialogs is the outer one.
    //
    // .shop-header-actions rather than the whole .shop-header, and that is deliberate on
    // both counts. The History and Close keys are controls and get sealed with everything
    // else; the <h2> beside them is not, and sealing it broke the document's heading
    // outline - axe flagged heading-order on the nested panel's own <h3>, because with the
    // shop's <h2> gone from the tree that <h3> followed the game page's headings with a
    // level missing. A player mid-purchase should still be able to hear what window they
    // are inside.
    const SHOP_CHROME = '.shop-header-actions, .shop-tabs, .shop-status, #shop-content';

    function setChromeInert(on) {
        const container = document.getElementById('shop-container');
        if (!container) return;
        container.querySelectorAll(SHOP_CHROME).forEach(element => {
            if (on) element.setAttribute('inert', '');
            else element.removeAttribute('inert');
        });
    }

    function focusablesIn(root) {
        if (!root) return [];
        return [...root.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
    }

    function pushLayer(root, close) {
        if (!root) return;
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        layers.push({ root, close, previous });
        // A nested panel seals the catalogue behind it. The base layer is the shop itself,
        // which has nothing behind it to seal.
        if (layers.length > 1) setChromeInert(true);
        // Focus the panel itself, not its first control: a screen reader then reads the
        // dialog's name and role before the player starts tabbing through prices.
        root.focus({ preventScroll: true });
    }

    function popLayer() {
        const layer = layers.pop();
        if (!layer) return;
        // Unseal BEFORE restoring focus: `previous` is usually the Buy button inside
        // #shop-content, and focus() on an inert subtree is a no-op - which would strand a
        // keyboard player on <body> at the moment the checkout closed.
        if (layers.length <= 1) setChromeInert(false);
        const target = layer.previous;
        if (target && target.isConnected && target.getClientRects().length > 0) {
            target.focus({ preventScroll: true });
        }
    }

    function handleKeydown(event) {
        const layer = layers[layers.length - 1];
        if (!layer) return;
        // A trap left standing over a panel that is no longer on screen would eat Escape
        // and Tab for the whole game. If the top layer is not visible, the stack is stale:
        // drop it and let the key through.
        if (!layer.root.isConnected || layer.root.getClientRects().length === 0) {
            layers.length = 0;
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            // The map behind also listens for Escape. While a modal owns the screen it
            // owns the key, or closing the shop also deselects the player's sector.
            event.stopPropagation();
            layer.close();
            return;
        }

        if (event.key !== 'Tab') return;

        const items = focusablesIn(layer.root);
        if (!items.length) {
            event.preventDefault();
            layer.root.focus({ preventScroll: true });
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const inside = layer.root.contains(active);

        if (event.shiftKey && (!inside || active === first || active === layer.root)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (!inside || active === last)) {
            event.preventDefault();
            first.focus();
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('keydown', handleKeydown, true);
    }

    // ------------------------------------------------------------ event binding

    function bindShopEvents(container) {
        container.addEventListener('click', event => {
            const target = event.target instanceof Element
                ? event.target.closest('[data-shop-action]')
                : null;
            if (!target || !container.contains(target)) return;

            switch (target.getAttribute('data-shop-action')) {
                case 'close': closeShop(); break;
                case 'close-payment': closePayment(); break;
                case 'close-history': hideHistory(); break;
                case 'history': showHistory(); break;
                case 'refresh-balance': loadUserBalance(); break;
                case 'retry-history': loadPurchaseHistory(); break;
                case 'tab': selectTab(target.getAttribute('data-tab'), target); break;
                case 'buy': handleBuyClick(target); break;
                default: break;
            }
        });

        // Left/Right walk the tab strip, which is what a tablist is expected to do and what
        // makes two tabs reachable without hunting for them with Tab.
        container.addEventListener('keydown', event => {
            const tab = event.target instanceof Element ? event.target.closest('.shop-tab') : null;
            if (!tab) return;
            const tabs = [...container.querySelectorAll('.shop-tab')];
            const index = tabs.indexOf(tab);
            let next = -1;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            if (next < 0) return;
            event.preventDefault();
            selectTab(tabs[next].getAttribute('data-tab'), tabs[next]);
            tabs[next].focus();
        });

        const bay = container.querySelector('#shop-content');
        if (bay) {
            bay.addEventListener('scroll', updateOverflowCue, { passive: true });
            // The cue has to answer three different questions - has the window been
            // resized, has the tab changed, has a card grown - and a ResizeObserver on the
            // bay catches all three without polling. Guarded: jsdom-style environments and
            // very old browsers have no observer, and the panel is fully usable without the
            // lamp, so its absence must not throw on the open path.
            if (typeof ResizeObserver === 'function') {
                const watch = new ResizeObserver(() => updateOverflowCue());
                watch.observe(bay);
                bay.querySelectorAll('.shop-section').forEach(section => watch.observe(section));
            }
        }
        // Belt as well as braces: an observer is the precise instrument, but a window
        // resize is the event a player actually generates, and a lamp that lies about
        // whether there is more catalogue is worse than no lamp.
        window.addEventListener('resize', updateOverflowCue, { passive: true });
    }

    function selectTab(tabName, button) {
        if (!tabName) return;
        document.querySelectorAll('#shop-container .shop-tab').forEach(tab => {
            const selected = tab === button || tab.getAttribute('data-tab') === tabName;
            tab.classList.toggle('active', selected);
            tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        document.querySelectorAll('#shop-container .shop-section').forEach(section => {
            const selected = section.id === `shop-${tabName}`;
            section.classList.toggle('active', selected);
            // `hidden` as well as the class, so the panel is out of the accessibility tree
            // and out of the tab order rather than merely invisible.
            if (selected) section.removeAttribute('hidden');
            else section.setAttribute('hidden', '');
        });
        // A new section starts at its own top. Carrying the previous tab's scroll offset
        // over drops the player into the middle of a list they have not seen the top of.
        const bay = document.getElementById('shop-content');
        if (bay) bay.scrollTop = 0;
        updateOverflowCue();
    }

    // ------------------------------------------------------------- open / close

    // NOTHING MAY RUN HERE THAT THE PLAYER HAS TO WAIT FOR.
    //
    // This used to raster a 128px noise tile and PNG-encode it with toDataURL() before the
    // first line below - synchronously, on the click, once per session. On the game page,
    // where the encode contends with the map's own WebGL raster, that measured 2452-3204ms
    // of frozen main thread: no panel, no cursor change, the map stopped and so did the
    // turn clock, and the second open cost 3ms. The texture is CSS now (see --sh-brush) and
    // there is nothing left to build. Everything below is class flips, a focus call and a
    // three-card re-render.
    function openShop(trigger) {
        const container = document.getElementById('shop-container');
        if (!container) return;
        setChromeInert(false);
        container.classList.remove('shop-hidden');
        const win = container.querySelector('.shop-window');
        // Only a real control is worth returning focus to. Opened from script, the active
        // element is <body>, which cannot take focus back - fall back to the HUD key that
        // opens this panel so Tab resumes from somewhere a player recognises.
        const opener = trigger instanceof HTMLElement
            && !container.contains(trigger)
            && trigger.matches(FOCUSABLE)
            ? trigger
            : null;
        const returnTo = opener || document.querySelector('[onclick*="Shop.open"]');
        layers.length = 0;
        if (win) {
            layers.push({ root: win, close: closeShop, previous: returnTo });
            win.focus({ preventScroll: true });
        }
        refreshItemStates();
        updateOverflowCue();
    }

    function closeShop() {
        const container = document.getElementById('shop-container');
        if (!container) return;
        // Nested panels first, so their own focus restore lands inside the shop before the
        // shop hands focus back to the button that opened it.
        hideHistory();
        closePayment();
        container.classList.add('shop-hidden');
        while (layers.length > 1) layers.pop();
        setChromeInert(false);
        popLayer();
    }

    function closePayment() {
        const modal = document.getElementById('payment-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        modal.classList.add('hidden');
        if (cardElement) {
            try {
                cardElement.unmount();
            } catch (error) {
                /* already unmounted */
            }
        }
        processingPayment = false;
        authorising = false;
        setPayBlocked('incomplete');
        popLayer();
    }

    // -------------------------------------------------------- "there is more"
    //
    // THE ONLY CUE THAT A STOREFRONT CONTINUED BELOW THE FOLD WAS THE SCROLL BAR.
    //
    // On a 1366x768 laptop - the most common PC screen there is - the bay holds 673px of
    // catalogue in 381px, and the bar Chromium drew for it reserved two physical pixels at
    // 2.06:1 against its own trough, under the 3:1 WCAG 1.4.11 sets for the boundary of a
    // UI component. The bay had an inset catch-light on its top lip and nothing at all on
    // the bottom one, so the plate simply stopped: no fade, no shadow, nothing that reads
    // as "cut off" rather than "finished".
    //
    // So the bottom lip now lights when there is more under it, and carries a stencilled
    // slug saying which way. aria-hidden because it duplicates, for the eye, what the
    // scrollable region already gives a screen reader by being a scrollable region - it is
    // not a control and it says nothing new.

    let cueQueued = false;

    function updateOverflowCue() {
        // Coalesced onto a frame, for two reasons. Scroll, resize and the observer can all
        // ask within one frame and the answer is the same; and every caller that MATTERS -
        // opening, switching tab, a card re-rendering - asks before layout has run, so a
        // synchronous read would measure the previous shape of the bay and light the lamp
        // for a catalogue that is no longer there.
        if (typeof requestAnimationFrame !== 'function') {
            paintOverflowCue();
            return;
        }
        if (cueQueued) return;
        cueQueued = true;
        requestAnimationFrame(() => {
            cueQueued = false;
            paintOverflowCue();
        });
    }

    function paintOverflowCue() {
        const bay = document.getElementById('shop-content');
        const container = document.getElementById('shop-container');
        if (!bay || !container) return;
        const room = bay.scrollHeight - bay.clientHeight;
        const below = room - bay.scrollTop;
        container.style.setProperty('--sh-more', room > 6 && below > 6 ? '1' : '0');
    }

    // Enhanced styles
    function addEnhancedStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* style.css has no global box-sizing reset, so a full-width plate with
               padding and a 2px bevel overflowed its card by exactly padding+border.
               Scoped here rather than globally: this panel owns its own box model. */
            #shop-container,
            #shop-container *,
            #shop-container *::before,
            #shop-container *::after { box-sizing: border-box; }

            /* ============================================================ tokens
               Lifted from the race-selection console so the two screens are made of
               the same metal. The chamfer highlight is deliberately bright: a
               machined edge only reads as machined when the lit step and the cut
               shadow are far apart in value. */
            #shop-container {
                --sh-chamfer-hi: #9DABBE;
                --sh-chamfer-mid: #5A6779;
                --sh-chamfer-lo: #0B0E13;
                --sh-chamfer-lo2: #191F2A;
                --sh-edge: #04070B;
                --sh-text: #DFE6F0;
                --sh-muted: #A2AEBF;
                --sh-dim: #8A9AB0;
                --sh-amber: #E9A53C;
                --sh-bronze-hi: #F0BE62;
                --sh-oxide: #E58469;
                --sh-mono: 'Share Tech Mono', ui-monospace, monospace;
                --sh-num: 'Rajdhani', 'Segoe UI', sans-serif;
                --sh-head: 'Russo One', 'Segoe UI', sans-serif;
                --sh-plate: linear-gradient(180deg, #2C3746 0, #212B39 46%, #161E29 100%);

                /* BRUSHED STEEL, AND IT COSTS NOTHING.
                   This was a 128px seeded-noise tile rastered on a canvas and PNG-encoded
                   with toDataURL() on the first press of Shop - 2.4 to 3.2 SECONDS of dead
                   main thread on the game page, before the window was shown, every session.
                   The tile was horizontally blurred noise, which is to say horizontal
                   brushing, and three repeating gradients at incommensurate periods say the
                   same thing: 5px and 7px beat against each other over 35px of lit and cut
                   grain, and a 67px sweep across the grain stops the beat from reading as a
                   stripe. Same material, no canvas, no encode, no bytes, no decode - and
                   the panel now paints on the frame of the click. */
                --sh-brush:
                    repeating-linear-gradient(0deg,
                        rgba(226, 238, 255, 0.030) 0px, rgba(226, 238, 255, 0.030) 1px,
                        rgba(0, 0, 4, 0.050) 1px, rgba(0, 0, 4, 0.050) 2px,
                        rgba(226, 238, 255, 0.013) 2px, rgba(226, 238, 255, 0.013) 3px,
                        rgba(0, 0, 4, 0.022) 3px, rgba(0, 0, 4, 0.022) 5px),
                    repeating-linear-gradient(0deg,
                        rgba(0, 0, 4, 0.032) 0px, rgba(0, 0, 4, 0.032) 2px,
                        rgba(226, 238, 255, 0.024) 2px, rgba(226, 238, 255, 0.024) 3px,
                        rgba(226, 238, 255, 0) 3px, rgba(226, 238, 255, 0) 7px),
                    repeating-linear-gradient(90deg,
                        rgba(226, 238, 255, 0.028) 0px, rgba(0, 0, 4, 0.036) 31px,
                        rgba(226, 238, 255, 0.028) 67px);

                --sh-rivet: radial-gradient(circle at 4.6px 4.6px,
                    #EDF3FB 0 0.9px, #B6C5D8 1.7px, #6B7A90 2.4px, #2B3547 3.1px,
                    #05080C 3.9px, rgba(0, 0, 0, 0.85) 4.6px, rgba(0, 0, 0, 0) 5.2px);

                position: fixed;
                inset: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: clamp(8px, 2vw, 26px);
                color: var(--sh-text);
                font-family: var(--sh-num);
                font-variant-numeric: tabular-nums lining-nums;
            }

            #shop-container.shop-hidden { display: none !important; }

            #shop-container .shop-overlay {
                position: absolute;
                inset: 0;
                background:
                    radial-gradient(ellipse 70% 60% at 50% 50%, rgba(2, 4, 8, 0.62), rgba(2, 4, 8, 0.86) 100%);
            }

            /* ------------------------------------------------------ the housing */
            #shop-container .shop-window {
                position: relative;
                display: flex;
                flex-direction: column;
                width: min(96vw, 1040px);
                /* A HOUSING DOES NOT CHANGE SIZE. Sized rather than max-sized: with
                   max-height the window shrank to whatever the shorter tab needed, so
                   switching between Premium Races and Cosmetics made the whole panel
                   jump and re-centre under the pointer. The bay scrolls instead.
                   940 and not 880: on a 1080p screen the old cap left 200px of desk
                   unused while the first card's Buy plate hung 30px below the fold,
                   which is the same defect as the laptop one with a smaller number. */
                height: min(92vh, 940px);
                max-height: 92vh;
                overflow: hidden;
                background:
                    var(--sh-rivet) 5px 5px / 10px 10px no-repeat,
                    var(--sh-rivet) calc(100% - 5px) 5px / 10px 10px no-repeat,
                    var(--sh-rivet) 5px calc(100% - 5px) / 10px 10px no-repeat,
                    var(--sh-rivet) calc(100% - 5px) calc(100% - 5px) / 10px 10px no-repeat,
                    var(--sh-brush, none),
                    linear-gradient(180deg, #263140 0, #1A222E 44%, #0F151D 100%);
                border: 2px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow:
                    inset 2px 2px 0 var(--sh-chamfer-hi),
                    inset 4px 4px 0 var(--sh-chamfer-mid),
                    inset -2px -2px 0 var(--sh-chamfer-lo),
                    inset -4px -4px 0 var(--sh-chamfer-lo2),
                    0 5px 0 rgba(0, 0, 0, 0.7),
                    0 20px 46px rgba(0, 0, 0, 0.66);
            }
            #shop-container .shop-window:focus { outline: none; }
            #shop-container .shop-window:focus-visible { outline: 2px solid var(--sh-amber); outline-offset: -6px; }

            /* ------------------------------------------------- embossed title bar */
            #shop-container .shop-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                margin: 8px 8px 0;
                padding: 9px 12px;
                background: linear-gradient(180deg, #3A4757 0, #26313F 52%, #1A222D 100%);
                border: 1px solid var(--sh-edge);
                box-shadow:
                    inset 0 1px 0 rgba(214, 230, 250, 0.34),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.85),
                    0 2px 0 rgba(0, 0, 0, 0.55);
            }

            #shop-container .shop-header h2 {
                margin: 0;
                font-family: var(--sh-head);
                font-size: clamp(0.92rem, 1.6vw, 1.12rem);
                font-weight: 400;
                letter-spacing: 0.07em;
                text-transform: uppercase;
                color: #E8EFF8;
                text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.9), 0 1px 0 rgba(196, 216, 242, 0.16);
            }

            /* --sh-dim, not a one-off: #6E7F98 measured 3.23:1 on the header plate, under
               the 4.5:1 floor for 12px text, and was the only string on this surface that
               failed. The console's existing dim token measures 4.60:1 there. */
            #shop-container .shop-panel-code {
                font-family: var(--sh-mono);
                font-size: 12px;
                letter-spacing: 0.16em;
                color: var(--sh-dim);
                text-shadow: 0 1px 0 rgba(0, 0, 0, 0.9);
            }

            /* Named for a screen reader, absent from the screen. Used where a focus target's
               visible word ("Owned") is too short to say which card it belongs to. */
            #shop-container .shop-sr {
                position: absolute;
                width: 1px;
                height: 1px;
                margin: -1px;
                padding: 0;
                overflow: hidden;
                clip: rect(0 0 0 0);
                clip-path: inset(50%);
                white-space: nowrap;
                border: 0;
            }

            #shop-container .shop-header-actions {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            /* --------------------------------------------- pressable plate keys */
            #shop-container .shop-history-btn,
            #shop-container .shop-close,
            #shop-container .payment-close,
            #shop-container .history-close,
            #shop-container .refresh-balance {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 7px;
                min-height: 32px;
                padding: 0 10px;
                color: #D3DEEC;
                font-family: var(--sh-mono);
                font-size: 12px;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                background: var(--sh-brush, none), linear-gradient(180deg, #38434F 0, #232D3A 55%, #171E28 100%);
                border: 1px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow:
                    inset 1px 1px 0 rgba(196, 214, 238, 0.5),
                    inset -1px -1px 0 rgba(0, 0, 0, 0.8),
                    0 2px 0 rgba(0, 0, 0, 0.6);
                cursor: pointer;
                text-shadow: 0 1px 0 rgba(0, 0, 0, 0.85);
            }
            #shop-container .shop-close,
            #shop-container .payment-close,
            #shop-container .history-close,
            #shop-container .refresh-balance {
                width: 32px;
                padding: 0;
                font-size: 14px;
            }
            #shop-container .shop-history-btn:hover,
            #shop-container .shop-close:hover,
            #shop-container .payment-close:hover,
            #shop-container .history-close:hover,
            #shop-container .refresh-balance:hover {
                color: #FFF3DE;
                box-shadow:
                    inset 1px 1px 0 rgba(226, 240, 255, 0.66),
                    inset -1px -1px 0 rgba(0, 0, 0, 0.8),
                    0 3px 0 rgba(0, 0, 0, 0.62);
            }
            #shop-container .shop-history-btn:active,
            #shop-container .shop-close:active,
            #shop-container .payment-close:active,
            #shop-container .history-close:active,
            #shop-container .refresh-balance:active {
                transform: translateY(2px);
                box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.85), inset -1px -1px 0 rgba(198, 220, 246, 0.12);
            }
            #shop-container .history-icon { font-size: 13px; line-height: 1; }
            #shop-container .shop-btn-label { line-height: 1; }

            /* ------------------------------------------------------------- tabs
               flex: none, and this is not cosmetic. The window is a flex column and
               every row defaulted to flex-shrink: 1, so on a cramped window the
               browser took the space it needed out of whatever would give - and the
               tab strip, being the shortest row with overflow: auto, gave the most.
               Measured before the fix: 36px of tab crushed into an 11px slot at
               700x700 and 420x780, 16px at 1280x560, with the labels sliced in half
               and 25px of the control clipped away. Only 1920x1080 was intact, which
               is the one size the audit looks at. The catalogue bay is the only row
               that may absorb the shrink; it is built to scroll and now says so. */
            #shop-container .shop-header,
            #shop-container .shop-tabs,
            #shop-container .shop-status,
            #shop-container .shop-balance { flex: none; }

            #shop-container .shop-tabs {
                display: flex;
                gap: 6px;
                margin: 10px 8px 0;
                /* overflow-x: auto forces overflow-y to auto as well (CSS makes the
                   two agree), so the plates' 2px drop shadow needs room or it is
                   sheared off. */
                padding: 0 0 3px;
                overflow-x: auto;
                scrollbar-width: thin;
            }

            #shop-container .shop-tab {
                flex: 0 0 auto;
                min-height: 36px;
                padding: 8px 16px;
                color: #B9C6D6;
                font-family: var(--sh-head);
                font-size: 0.66rem;
                font-weight: 400;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                background: var(--sh-brush, none), linear-gradient(180deg, #313C4A 0, #212A36 56%, #161D26 100%);
                border: 1px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow:
                    inset 1px 1px 0 rgba(180, 200, 226, 0.42),
                    inset -1px -1px 0 rgba(0, 0, 0, 0.8),
                    0 2px 0 rgba(0, 0, 0, 0.6);
                cursor: pointer;
                text-shadow: 0 1px 0 rgba(0, 0, 0, 0.85);
                white-space: nowrap;
            }
            #shop-container .shop-tab:hover { color: #EFF5FD; }
            /* THE SELECTED TAB IS THE PLATE PRESSED IN, not a coloured plate. The
               state is carried by bevel geometry (dark step on top, lit step under)
               plus a brighter label, so it survives a monochrome screenshot and a
               colour-blind player - and aria-selected states it outright. */
            #shop-container .shop-tab.active {
                color: #FFEBC6;
                background: var(--sh-brush, none), linear-gradient(180deg, #171E27 0, #222B37 58%, #2E3846 100%);
                box-shadow:
                    inset 0 2px 0 rgba(0, 0, 0, 0.8),
                    inset 0 -2px 0 rgba(150, 170, 200, 0.32),
                    inset 0 0 0 1px #05080C,
                    inset 0 5px 10px rgba(0, 0, 0, 0.55);
            }

            /* ------------------------------------------------- status instrument */
            #shop-container .shop-status,
            #shop-container .shop-balance {
                display: flex;
                align-items: center;
                gap: 12px;
                margin: 10px 8px 0;
                padding: 10px 12px;
                background: linear-gradient(180deg, #141A23 0, #0E131A 100%);
                border: 1px solid var(--sh-edge);
                box-shadow:
                    inset 0 2px 6px rgba(0, 0, 0, 0.86),
                    inset 0 -1px 0 rgba(178, 202, 232, 0.2);
            }
            #shop-container .shop-status { align-items: flex-start; }

            /* An indicator lamp, never colour on its own: the word OFFLINE is in the
               sentence beside it and the lamp is unlit rather than a different hue. */
            #shop-container .shop-lamp {
                flex: none;
                width: 10px;
                height: 10px;
                margin-top: 5px;
                border-radius: 50%;
                background: radial-gradient(circle at 35% 32%, #5D6A7C 0 22%, #2C3644 60%, #0A0E14 100%);
                box-shadow: inset 0 0 0 1px #05080C, 0 1px 0 rgba(190, 214, 244, 0.14);
            }
            /* The same bulb, lit. The sentence beside it still says which state it is in,
               so a player who cannot see the difference has read it already. */
            #shop-container .shop-lamp--on {
                background: radial-gradient(circle at 35% 32%, #FFEBC4 0 22%, #E9A53C 58%, #7A4E10 100%);
                box-shadow: inset 0 0 0 1px #05080C, 0 0 7px rgba(233, 165, 60, 0.55);
            }

            #shop-container .shop-status-tag {
                flex: none;
                margin-top: 2px;
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: var(--sh-dim);
            }

            #shop-container .shop-status-body { display: block; }
            #shop-container .shop-status-body strong {
                display: block;
                color: var(--sh-bronze-hi);
                font-size: 14px;
                font-weight: 700;
                letter-spacing: 0.01em;
            }
            #shop-container .shop-status-body span {
                display: block;
                margin-top: 3px;
                max-width: 82ch;
                color: var(--sh-muted);
                font-size: 13px;
                line-height: 1.45;
            }

            #shop-container .shop-balance { justify-content: space-between; }
            #shop-container .shop-balance-label {
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                color: var(--sh-dim);
            }
            #shop-container .shop-balance-value {
                display: flex;
                align-items: center;
                gap: 9px;
                font-size: 18px;
                font-weight: 700;
                color: var(--sh-text);
            }
            #shop-container .crystal-icon { width: 22px; height: 22px; object-fit: contain; }
            #shop-container .balance-error { color: var(--sh-oxide); font-size: 14px; }

            /* ------------------------------------------------------------ bays */
            #shop-container .shop-content {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                margin: 10px 8px 8px;
                padding: 14px;
                background: linear-gradient(180deg, #0C1119 0, #080C12 100%);
                border: 1px solid var(--sh-edge);
                box-shadow: inset 0 3px 8px rgba(0, 0, 0, 0.9), inset 0 -1px 0 rgba(178, 202, 232, 0.14);
                scrollbar-width: thin;
                /* 3B4759 on 0A0E14 measured 2.06:1 — under the 3:1 WCAG 1.4.11 requires of
                   the boundary of a UI component, on the ONLY thing telling a player there
                   was a storefront below the fold. 6C7C93 on the same trough is 4.57:1. */
                scrollbar-color: #6C7C93 #0A0E14;
            }
            #shop-container .shop-content::-webkit-scrollbar { width: 12px; }
            #shop-container .shop-content::-webkit-scrollbar-track { background: #0A0E14; }
            #shop-container .shop-content::-webkit-scrollbar-thumb {
                background: linear-gradient(90deg, #8794A8 0 1px, #6C7C93 1px 100%);
                border: 1px solid var(--sh-edge);
            }

            /* --------------------------------------------------- "there is more"
               The bay's bottom lip, lit only while catalogue is hiding under it, with
               a stencilled slug saying which way. --sh-more is written by
               updateOverflowCue on open, scroll, tab change and resize. Neutral steel
               and a gradient wash, not a coloured edge: it is the plate continuing
               past the lip, which is what it is telling you. */
            #shop-container .shop-more {
                position: absolute;
                left: 10px;
                right: 10px;
                bottom: 10px;
                z-index: 4;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                height: 34px;
                padding-bottom: 3px;
                pointer-events: none;
                opacity: var(--sh-more, 0);
                transition: opacity 130ms linear;
                background: linear-gradient(0deg,
                    rgba(6, 9, 13, 0.97) 0, rgba(6, 9, 13, 0.86) 34%,
                    rgba(6, 9, 13, 0.42) 68%, rgba(6, 9, 13, 0) 100%);
                box-shadow: inset 0 -1px 0 rgba(196, 218, 246, 0.34);
            }
            #shop-container .shop-more-slug {
                padding: 1px 9px 2px;
                background: linear-gradient(180deg, #2B3543 0, #1A222D 100%);
                border: 1px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow:
                    inset 0 1px 0 rgba(196, 214, 238, 0.42),
                    inset 0 -1px 0 rgba(0, 0, 0, 0.8),
                    0 2px 0 rgba(0, 0, 0, 0.6);
                color: #C3D0E0;
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.13em;
                text-transform: uppercase;
                text-shadow: 0 1px 0 rgba(0, 0, 0, 0.85);
            }
            @media (prefers-reduced-motion: reduce) {
                #shop-container .shop-more { transition: none; }
            }

            #shop-container .shop-section { display: none; }
            #shop-container .shop-section.active { display: block; }
            #shop-container .shop-section[hidden] { display: none; }

            #shop-container .shop-section h3 {
                margin: 0 0 6px;
                font-family: var(--sh-head);
                font-size: 0.82rem;
                font-weight: 400;
                letter-spacing: 0.09em;
                text-transform: uppercase;
                color: #E4EBF5;
                text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.9);
            }

            #shop-container .shop-info {
                margin: 0 0 14px;
                max-width: 92ch;
                color: var(--sh-muted);
                font-size: 13px;
                line-height: 1.5;
            }

            #shop-container .shop-items {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(236px, 1fr));
                gap: 12px;
                margin: 0;
                padding: 0;
                list-style: none;
            }

            /* ------------------------------------------------------- item plates */
            #shop-container .shop-item {
                position: relative;
                display: flex;
                flex-direction: column;
                padding: 10px 10px 9px;
                background:
                    var(--sh-rivet) 4px calc(100% - 4px) / 10px 10px no-repeat,
                    var(--sh-rivet) calc(100% - 4px) calc(100% - 4px) / 10px 10px no-repeat,
                    var(--sh-brush, none),
                    var(--sh-plate);
                border: 1px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow:
                    inset 2px 2px 0 var(--sh-chamfer-hi),
                    inset 4px 4px 0 var(--sh-chamfer-mid),
                    inset -2px -2px 0 var(--sh-chamfer-lo),
                    inset -4px -4px 0 var(--sh-chamfer-lo2),
                    0 3px 0 rgba(0, 0, 0, 0.65),
                    0 6px 10px rgba(0, 0, 0, 0.4);
            }

            /* The described-but-unbuilt cards are the same plate seated in its recess,
               never a different material and never a grey wash. */
            #shop-container .shop-item.unavailable {
                background: var(--sh-brush, none), linear-gradient(180deg, #1B222C 0, #151B24 100%);
                box-shadow:
                    inset 0 2px 0 rgba(0, 0, 0, 0.75),
                    inset 0 -2px 0 rgba(150, 170, 200, 0.24),
                    inset 0 0 0 1px #05080C,
                    inset 0 6px 12px rgba(0, 0, 0, 0.6);
            }

            /* -------------------------------------------------- the crest aperture
               Same slot geometry as the roster's crest ports: shadow in from the
               top-left, a catch-light on the bottom lip, black mat. The published
               plates are 256x193 painted out to pure black at every edge, so an
               aperture cut to that ratio shows no letterbox at all. */
            #shop-container .shop-port {
                position: relative;
                display: grid;
                place-items: center;
                overflow: hidden;
                /* The aperture is capped, never the picture in it — see .shop-port img.
                   240 is what keeps the poster card's foot above the fold on the
                   shortest screen this layout is used on. */
                max-width: 240px;
                margin-left: auto;
                margin-right: auto;
                margin-bottom: 8px;
                padding: 5px;
                background: #000;
                border-radius: 2px;
                box-shadow:
                    inset 0 3px 7px rgba(0, 0, 0, 0.95),
                    inset 3px 0 6px rgba(0, 0, 0, 0.8),
                    inset 0 -1px 0 rgba(178, 202, 232, 0.26),
                    inset 0 0 0 1px rgba(0, 0, 0, 0.9);
            }
            /* THE KEY LIGHT GOES OVER THE ARTWORK, and that is the whole point of
               moving it to ::after.
               As ::before it was the port's FIRST child and the crest was
               position:relative, so the picture painted on top of the light and the
               rake stopped dead at the picture's edge. A scanline across the port
               read three different blacks with two hard vertical seams — lit mat at
               (20,19,17), an edge, the crest's own unlit field at (23,23,23),
               another edge, then pure (0,0,0) — so the art looked like a screenshot
               pasted onto a screenshot instead of a lit case cut into the plate. One
               continuous rake across mat AND crest is what makes it one object. */
            #shop-container .shop-port::after {
                content: '';
                position: absolute;
                inset: 0;
                z-index: 2;
                pointer-events: none;
                background:
                    radial-gradient(ellipse 78% 92% at 16% 4%, rgba(255, 236, 205, 0.16), transparent 68%),
                    linear-gradient(158deg, rgba(255, 236, 205, 0.07) 0, transparent 42%);
            }
            /* THE CREST FILLS THE APERTURE, AND THERE IS NO max-height ON IT.
               At 122px tall in a 300px port it was a small stamp with more empty mat
               than art — but the seam was not the size, it was the LETTERBOX. Any cap
               on the height of a 4:3 painting in a wider box leaves object-fit:contain
               with mat to fill at the sides, and a crest whose field is a soft vignette
               meets pure black there in a hard rectangle you can see from across the
               room. Capping the port's WIDTH instead (see the narrow branch) shrinks
               the aperture with the art still filling it, so the mat never exists. The
               card is taller for it; the short-screen layout is what pays for that. */
            #shop-container .shop-port img {
                position: relative;
                z-index: 1;
                display: block;
                width: 100%;
                height: auto;
                object-fit: contain;
                /* the roster's per-faction normalisation, carried across so three
                   paintings made at three exposures read as one set, at one size */
                filter: brightness(var(--crest-gain, 1));
                transform: scale(var(--crest-scale, 1));
            }
            /* The checkout's copy of the same aperture, at thumbnail size. It keeps the
               gain and the scale — the crest a player is about to be charged for has to
               look like the crest they pressed, and Shadow Realm unnormalised is a smudge. */
            #shop-container .shop-port--small { padding: 5px; }
            #shop-container .shop-port--small img {
                width: auto;
                height: 76px;
                max-height: none;
            }

            #shop-container .shop-item-head {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 8px;
            }
            #shop-container .shop-item h4 {
                margin: 0;
                font-family: var(--sh-head);
                font-size: 0.78rem;
                font-weight: 400;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: #EDF2F9;
                text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.9);
            }
            #shop-container .shop-item-code {
                flex: none;
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.14em;
                color: var(--sh-dim);
            }

            #shop-container .item-description {
                margin: 6px 0 0;
                color: var(--sh-muted);
                font-size: 13px;
                line-height: 1.45;
            }

            /* An embossed rule with its caption engraved into it — the console's
               section divider. Neutral steel: no coloured stripe anywhere. */
            #shop-container .shop-rule {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 9px 0 5px;
            }
            #shop-container .shop-rule span {
                flex: none;
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                color: var(--sh-dim);
            }
            #shop-container .shop-rule::after {
                content: '';
                flex: 1 1 auto;
                height: 2px;
                background: linear-gradient(180deg, rgba(0, 0, 0, 0.9) 0 1px, rgba(180, 206, 240, 0.18) 1px 2px);
            }

            #shop-container .shop-doctrine {
                margin: 0;
                color: var(--sh-text);
                font-size: 13px;
                line-height: 1.45;
            }

            #shop-container .item-features {
                list-style: none;
                margin: 0;
                padding: 0;
            }
            #shop-container .item-features li {
                display: flex;
                align-items: flex-start;
                gap: 7px;
                padding: 2px 0;
                color: var(--sh-muted);
                font-size: 13px;
                line-height: 1.38;
            }

            /* Chips carry a WORD, not a colour: NO / CAP / ADD / PLAN. Reading the
               board never depends on telling bronze from steel. */
            #shop-container .shop-chip {
                flex: none;
                min-width: 34px;
                padding: 1px 5px;
                background: linear-gradient(180deg, #171E27 0, #232C38 100%);
                border: 1px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.8), inset 0 -1px 0 rgba(160, 182, 212, 0.22);
                color: var(--sh-dim);
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.1em;
                text-align: center;
            }
            #shop-container .shop-chip--no { color: #E9A392; }
            #shop-container .shop-chip--cap { color: #E2C58C; }
            #shop-container .shop-chip--yes { color: #A8D3B4; }

            /* ------------------------------------------------------- the foot */
            #shop-container .shop-item-foot {
                display: grid;
                gap: 7px;
                margin-top: auto;
                padding-top: 9px;
            }
            #shop-container .shop-item-foot::before {
                content: '';
                height: 2px;
                margin-bottom: 2px;
                background: linear-gradient(180deg, rgba(0, 0, 0, 0.9) 0 1px, rgba(180, 206, 240, 0.18) 1px 2px);
            }

            /* THE PRICE IS ENGRAVED, NOT PRESSABLE. It used to be a filled cyan pill,
               the single brightest object on the card, on a card whose only other
               control was the card itself — so it read as the buy button, and looked
               exactly as live with payments off as with payments on. */
            #shop-container .shop-price {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 8px;
                padding: 6px 9px;
                background: linear-gradient(180deg, #0D1219 0, #0A0E14 100%);
                border: 1px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.9), inset 0 -1px 0 rgba(178, 202, 232, 0.2);
            }
            #shop-container .shop-price-figure {
                color: var(--sh-bronze-hi);
                font-size: 19px;
                font-weight: 700;
                letter-spacing: 0.01em;
                text-shadow: 0 1px 0 rgba(0, 0, 0, 0.9);
            }
            #shop-container .shop-price-term {
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--sh-dim);
            }
            #shop-container .shop-price--muted .shop-price-figure { color: var(--sh-dim); }
            /* A receipt, not an offer. Smaller and in the steel register rather than the
               bronze a price is engraved in, because it is no longer a number to weigh. */
            #shop-container .shop-price--paid .shop-price-figure {
                color: #B7D3BE;
                font-size: 15px;
                font-family: var(--sh-mono);
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }

            /* The live action: the console's reserved amber, the same plate as CONFIRM
               on the race screen, so buying here and committing there look like the
               same kind of transaction. */
            #shop-container .shop-action {
                display: block;
                width: 100%;
                min-height: 38px;
                padding: 10px 14px;
                color: #201403;
                font-family: var(--sh-head);
                font-size: 0.68rem;
                font-weight: 400;
                letter-spacing: 0.07em;
                text-transform: uppercase;
                text-align: center;
                background: linear-gradient(180deg, #FFD992 0, #E0A22C 52%, #8A5F1B 100%);
                border: 2px solid #05070A;
                border-radius: 2px;
                box-shadow:
                    inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.6),
                    inset -2px -2px 0 rgba(96, 52, 4, 0.62),
                    0 3px 0 #4D2E07,
                    0 5px 12px rgba(0, 0, 0, 0.5);
                cursor: pointer;
                text-shadow: 0 1px 0 rgba(255, 226, 170, 0.45);
            }
            #shop-container button.shop-action:hover { filter: brightness(1.09); }
            #shop-container button.shop-action:active {
                transform: translateY(3px);
                box-shadow: inset 2px 2px 6px rgba(80, 45, 5, 0.7), inset -1px -1px 0 rgba(255, 255, 255, 0.18);
            }

            /* A LOCKED CONTROL IS THE SAME PLATE PRESSED IN, never a different
               material and never a greyed-out HTML button. Dark step on the top edge,
               lit step under, label engraved rather than faded — so it is unmistakably
               inactive in a screenshot, in greyscale, and to a screen reader, which
               gets aria-disabled as well. */
            #shop-container .shop-action--locked,
            #shop-container .shop-action--owned,
            #shop-container .shop-action--soon {
                color: #A8B6C8;
                background: var(--sh-brush, none), linear-gradient(180deg, #171E27 0, #222B37 58%, #2E3846 100%);
                border-color: #05070A;
                box-shadow:
                    inset 0 2px 0 rgba(0, 0, 0, 0.75),
                    inset 0 -2px 0 rgba(150, 170, 200, 0.3),
                    inset 0 0 0 1px #05080C,
                    inset 0 5px 10px rgba(0, 0, 0, 0.6);
                text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.95), 0 1px 0 rgba(184, 202, 226, 0.2);
                cursor: not-allowed;
            }
            #shop-container .shop-action--owned { color: #B7D3BE; cursor: default; }
            #shop-container .shop-action--soon { cursor: default; }
            #shop-container .shop-action--locked:hover { filter: none; }
            #shop-container .shop-action--locked:active { transform: none; }

            /* Never make the player click to find out. The reason is on the card. */
            #shop-container .shop-item-state {
                margin: 0;
                min-height: 1em;
                color: var(--sh-dim);
                font-size: 12px;
                line-height: 1.4;
            }

            #shop-container .owned-badge {
                position: absolute;
                top: 7px;
                right: 7px;
                z-index: 2;
                padding: 3px 7px;
                background: linear-gradient(180deg, #2F3B33 0, #1B241E 100%);
                border: 1px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow: inset 0 1px 0 rgba(180, 214, 190, 0.4), 0 2px 0 rgba(0, 0, 0, 0.6);
                color: #BFE0C8;
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.12em;
            }

            /* ------------------------------------------------ payment & history */
            #shop-container .payment-modal,
            #shop-container .history-modal {
                position: absolute;
                inset: 0;
                z-index: 120;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 18px;
                background: rgba(2, 4, 8, 0.84);
            }
            #shop-container .payment-modal.hidden,
            #shop-container .history-modal.hidden,
            #shop-container .button-loading.hidden,
            #shop-container .button-text.hidden { display: none; }

            #shop-container .payment-content,
            #shop-container .history-content {
                width: min(620px, 96%);
                max-height: 90%;
                overflow-y: auto;
                padding: 16px;
                background:
                    var(--sh-rivet) 5px 5px / 10px 10px no-repeat,
                    var(--sh-rivet) calc(100% - 5px) 5px / 10px 10px no-repeat,
                    var(--sh-brush, none),
                    linear-gradient(180deg, #2A3543 0, #1A222E 46%, #10161E 100%);
                border: 2px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow:
                    inset 2px 2px 0 var(--sh-chamfer-hi),
                    inset 4px 4px 0 var(--sh-chamfer-mid),
                    inset -2px -2px 0 var(--sh-chamfer-lo),
                    inset -4px -4px 0 var(--sh-chamfer-lo2),
                    0 5px 0 rgba(0, 0, 0, 0.7),
                    0 16px 34px rgba(0, 0, 0, 0.6);
            }
            #shop-container .payment-content:focus,
            #shop-container .history-content:focus { outline: none; }
            #shop-container .payment-content:focus-visible,
            #shop-container .history-content:focus-visible {
                outline: 2px solid var(--sh-amber);
                outline-offset: -6px;
            }

            #shop-container .payment-header,
            #shop-container .history-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 14px;
                padding-bottom: 8px;
                border-bottom: 2px solid var(--sh-edge);
                box-shadow: inset 0 -3px 0 rgba(180, 206, 240, 0.14);
            }
            #shop-container .payment-header h3,
            #shop-container .history-header h3 {
                margin: 0;
                font-family: var(--sh-head);
                font-size: 0.76rem;
                font-weight: 400;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: #E8EFF8;
            }

            #shop-container .payment-product {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 14px;
            }
            /* Sized by .shop-port--small img above — auto width and not a 76px square,
               because boxing a 4:3 painting into a square letterboxes it against the
               aperture's own mat, which is the seam this console just removed. */
            #shop-container .payment-product-image { max-width: 100%; object-fit: contain; }
            #shop-container .payment-product-info h4 {
                margin: 0 0 4px;
                font-family: var(--sh-head);
                font-size: 0.76rem;
                font-weight: 400;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: #EDF2F9;
            }
            #shop-container .payment-product-info p { margin: 0; color: var(--sh-muted); font-size: 13px; line-height: 1.45; }

            #shop-container .payment-summary { margin: 0 0 14px; }
            #shop-container .summary-row {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                padding: 5px 0;
                color: var(--sh-muted);
                font-size: 14px;
            }
            #shop-container .summary-row dt, #shop-container .summary-row dd { margin: 0; }
            #shop-container .summary-row.total {
                margin-top: 8px;
                padding-top: 9px;
                border-top: 2px solid var(--sh-edge);
                box-shadow: inset 0 3px 0 rgba(180, 206, 240, 0.14);
                color: var(--sh-text);
                font-size: 17px;
                font-weight: 700;
            }
            #shop-container .summary-row.total dd { color: var(--sh-bronze-hi); }

            #shop-container .payment-field-label {
                display: block;
                margin-bottom: 5px;
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                color: var(--sh-dim);
            }
            #shop-container .card-element {
                padding: 11px;
                background: linear-gradient(180deg, #0D1219 0, #0A0E14 100%);
                border: 1px solid var(--sh-edge);
                border-radius: 2px;
                box-shadow: inset 0 3px 7px rgba(0, 0, 0, 0.9), inset 0 -1px 0 rgba(178, 202, 232, 0.2);
            }
            #shop-container .card-errors {
                display: none;
                margin-top: 9px;
                color: var(--sh-oxide);
                font-size: 13px;
                line-height: 1.42;
            }
            #shop-container .card-errors.visible { display: block; }

            #shop-container .payment-security {
                display: flex;
                align-items: flex-start;
                gap: 9px;
                margin: 14px 0;
                color: var(--sh-muted);
                font-size: 13px;
                line-height: 1.45;
            }
            #shop-container .security-icon { font-size: 15px; line-height: 1.4; }

            #shop-container .payment-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                justify-content: flex-end;
            }
            #shop-container .btn-primary,
            #shop-container .btn-secondary {
                min-height: 38px;
                padding: 10px 16px;
                font-family: var(--sh-head);
                font-size: 0.66rem;
                font-weight: 400;
                letter-spacing: 0.07em;
                text-transform: uppercase;
                border: 2px solid #05070A;
                border-radius: 2px;
                cursor: pointer;
            }
            #shop-container .btn-primary {
                color: #201403;
                background: linear-gradient(180deg, #FFD992 0, #E0A22C 52%, #8A5F1B 100%);
                box-shadow:
                    inset 1.5px 1.5px 0 rgba(255, 255, 255, 0.6),
                    inset -2px -2px 0 rgba(96, 52, 4, 0.62),
                    0 3px 0 #4D2E07,
                    0 5px 12px rgba(0, 0, 0, 0.5);
                text-shadow: 0 1px 0 rgba(255, 226, 170, 0.45);
            }
            /* Both selectors, same plate. The disabled attribute is no longer used on Pay
               now, but the rule keeps it so nothing regresses if a control adopts it. */
            #shop-container .btn-primary:disabled,
            #shop-container .btn-primary[aria-disabled="true"] {
                cursor: not-allowed;
                color: #A8B6C8;
                background: linear-gradient(180deg, #171E27 0, #222B37 58%, #2E3846 100%);
                box-shadow:
                    inset 0 2px 0 rgba(0, 0, 0, 0.75),
                    inset 0 -2px 0 rgba(150, 170, 200, 0.3),
                    inset 0 0 0 1px #05080C,
                    inset 0 5px 10px rgba(0, 0, 0, 0.6);
                text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.95), 0 1px 0 rgba(184, 202, 226, 0.2);
            }
            #shop-container .btn-secondary {
                color: #D3DEEC;
                background: var(--sh-brush, none), linear-gradient(180deg, #38434F 0, #232D3A 55%, #171E28 100%);
                box-shadow:
                    inset 1px 1px 0 rgba(196, 214, 238, 0.5),
                    inset -1px -1px 0 rgba(0, 0, 0, 0.8),
                    0 2px 0 rgba(0, 0, 0, 0.6);
                text-shadow: 0 1px 0 rgba(0, 0, 0, 0.85);
            }
            #shop-container .btn-primary:active,
            #shop-container .btn-secondary:active { transform: translateY(2px); }
            /* A locked plate does not travel when pressed - it is already in. */
            #shop-container .btn-primary[aria-disabled="true"]:active { transform: none; }

            /* The condition the pay button is waiting on, stated where the button is
               rather than only inside it. */
            #shop-container .payment-hint {
                margin: 9px 0 0;
                padding: 4px 7px;
                color: var(--sh-muted);
                font-size: 13px;
                line-height: 1.45;
                text-align: right;
            }
            /* PRESSING A LOCKED PAY NOW POINTS AT THE ANSWER; it does not repeat it in a
               second register. The click used to raise a 7000ms toast carrying this exact
               sentence, which then outlived the condition and sat on top of "Payment
               Complete". The words light up in place, where the player is already looking,
               and focus lands in the card field.
               The lit state is a STATIC class, not only a keyframe: style.css crushes every
               animation to one 0.01ms pass under reduced motion, and a click that answers
               with an invisible animation is a click that did nothing. The keyframe only
               adds the pulse on top. setPayBlocked clears the class, so the cue cannot
               outlive the condition it describes — which is the whole defect. */
            #shop-container .payment-hint--flash {
                color: #FFE9C6;
                background: rgba(233, 165, 60, 0.12);
                animation: shop-hint-flash 820ms ease-out 1;
            }
            @keyframes shop-hint-flash {
                0% { background: rgba(233, 165, 60, 0.30); }
                44% { background: rgba(233, 165, 60, 0.10); }
                66% { background: rgba(233, 165, 60, 0.26); }
                100% { background: rgba(233, 165, 60, 0.12); }
            }

            #shop-container .payment-terms {
                margin: 14px 0 0;
                color: var(--sh-dim);
                font-size: 12px;
                line-height: 1.45;
            }

            #shop-container .button-loading { display: inline-flex; align-items: center; gap: 9px; }
            #shop-container .button-loading::after {
                content: '';
                width: 14px;
                height: 14px;
                border: 2px solid rgba(32, 20, 3, 0.35);
                border-top-color: #201403;
                border-radius: 50%;
                animation: shop-spin 0.8s linear infinite;
            }
            @keyframes shop-spin { to { transform: rotate(360deg); } }

            #shop-container .history-list { display: grid; gap: 2px; }
            #shop-container .history-note {
                margin: 0 0 10px;
                color: var(--sh-muted);
                font-size: 13px;
                line-height: 1.5;
            }
            #shop-container .history-item {
                display: grid;
                grid-template-columns: 108px 1fr 92px 92px;
                gap: 12px;
                align-items: center;
                padding: 9px 10px;
                background: linear-gradient(180deg, #141A23 0, #0E131A 100%);
                border: 1px solid var(--sh-edge);
                font-size: 13px;
            }
            #shop-container .history-head {
                font-family: var(--sh-mono);
                font-size: 11px;
                letter-spacing: 0.13em;
                text-transform: uppercase;
                color: var(--sh-dim);
                background: linear-gradient(180deg, #303B49 0, #1E2733 100%);
            }
            #shop-container .history-date { font-family: var(--sh-mono); font-size: 12px; color: var(--sh-dim); }
            #shop-container .history-amount { color: var(--sh-bronze-hi); font-weight: 700; }
            #shop-container .history-status { font-family: var(--sh-mono); font-size: 12px; text-transform: uppercase; }
            #shop-container .status-completed { color: #A8D3B4; }
            #shop-container .status-pending { color: #E2C58C; }
            #shop-container .status-failed { color: var(--sh-oxide); }

            /* ------------------------------------------------------ focus rings
               The console's amber, held OFF the plate so it never paints over a
               machined edge. Functional, and the sanctioned coloured edge. */
            #shop-container button:focus-visible,
            #shop-container a:focus-visible,
            #shop-container [tabindex]:focus-visible {
                outline: 2px solid #FFE2AA;
                outline-offset: 3px;
                border-radius: 0;
            }
            /* The scroll bay is a recess, not a plate, so its ring sits INSIDE the machined
               lip - offset outwards it would paint over the window's own bevel and read as
               a border rather than as focus. */
            #shop-container .shop-content:focus { outline: none; }
            #shop-container .shop-content:focus-visible {
                outline: 2px solid #FFE2AA;
                outline-offset: -3px;
            }
            /* The owned plate takes focus after a purchase and must show the same ring as
               the Buy button it replaced - otherwise a player who has just paid is moved
               somewhere invisible. :focus, not :focus-visible: it is tabindex="-1", so the
               only way it ever receives focus is the script putting it there, and that is
               exactly the moment the ring has to appear whatever the last input device was. */
            #shop-container .shop-action--owned:focus {
                outline: 2px solid #FFE2AA;
                outline-offset: 3px;
            }

            /* ============================================ the short screen
               A 1366x768 laptop gives the browser about 657px, and it is the most
               common PC screen there is. At that height the storefront opened with
               673px of catalogue in a 381px bay: the first card was 570px tall and
               51% visible, it clipped mid-sentence at "PERMANENT RESTRICTIONS", and
               a player could not see ONE price or ONE Buy button without scrolling
               a bay whose only hint that it scrolled was a 2px scroll bar at 2.06:1.
               The panel that asks for money hid the money.

               Two moves. This block reclaims the ~150px the chrome spends above the
               first card — the section heading is the tab you just pressed said
               twice, so it goes to the screen-reader-only class rather than being
               deleted, and every strip tightens. The block under it turns the card
               on its side. */
            @media (max-height: 900px) {
                #shop-container .shop-header { margin-top: 6px; padding: 6px 11px; }
                #shop-container .shop-tabs { margin-top: 7px; }
                #shop-container .shop-tab { min-height: 32px; padding: 6px 14px; }
                #shop-container .shop-status { margin-top: 7px; padding: 7px 11px; }
                #shop-container .shop-status-body strong { font-size: 13px; }
                #shop-container .shop-status-body span {
                    margin-top: 1px;
                    font-size: 12px;
                    line-height: 1.4;
                }
                #shop-container .shop-content { margin-top: 7px; padding: 10px; }

                /* Not display:none. The tab strip already names this section and the
                   panel is labelled by its tab, so the heading is duplicate INK — but
                   it is not duplicate structure, and a screen reader still walks the
                   document by headings. */
                #shop-container .shop-section h3 {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    margin: -1px;
                    padding: 0;
                    overflow: hidden;
                    clip: rect(0 0 0 0);
                    clip-path: inset(50%);
                    white-space: nowrap;
                }
                #shop-container .shop-info {
                    margin-bottom: 9px;
                    font-size: 12px;
                    line-height: 1.42;
                }
                #shop-container .shop-items { gap: 10px; }
                #shop-container .shop-item { padding: 9px 9px 8px; }
                #shop-container .shop-rule { margin: 6px 0 3px; }
                #shop-container .shop-item-foot { padding-top: 7px; gap: 6px; }

                /* The checkout is a panel inside a panel and it has the same problem: at
                   657px it ran past the housing and clipped its own terms line mid-word,
                   on the one screen in the product that takes a card number. */
                #shop-container .payment-content,
                #shop-container .history-content { padding: 12px; }
                #shop-container .payment-header,
                #shop-container .history-header { margin-bottom: 10px; padding-bottom: 6px; }
                #shop-container .payment-product { margin-bottom: 10px; }
                #shop-container .shop-port--small img { height: 62px; }
                #shop-container .payment-summary { margin-bottom: 10px; }
                #shop-container .payment-security { margin: 10px 0; }
                #shop-container .payment-hint { margin-top: 7px; }
                #shop-container .payment-terms { margin-top: 10px; }
            }

            /* THE SHELF TICKET — a short screen is usually a WIDE one, and a card
               that is 570px tall on a 381px shelf is the wrong shape for the space,
               not merely too big for it. Laid on its side the same card is ~250px:
               crest in a fixed left column, copy in the middle, and the price well
               and the Buy plate parked at the top of a fixed right column, which is
               the one part that has to be above the fold. Nothing is hidden and
               nothing is abbreviated; it is turned ninety degrees.

               960px, not 768: the poster card is ~650px tall now that the crest fills
               its aperture, and the housing tops out at 940. Every viewport under
               about 960px of browser height — which includes a maximised 1080p window
               once the browser's own chrome is taken off it — cannot show that card's
               foot, and the foot is the price and the Buy plate. Above it there is
               room for the poster and the poster is what a storefront wants. */
            @media (max-height: 960px) and (min-width: 620px) {
                #shop-container #shop-races .shop-items { grid-template-columns: 1fr; }
                #shop-container #shop-races .shop-item {
                    display: grid;
                    grid-template-columns:
                        clamp(120px, 15vw, 190px) minmax(0, 1fr) clamp(178px, 22vw, 250px);
                    column-gap: clamp(10px, 1.4vw, 15px);
                    align-items: start;
                }
                /* The eight middle children are head, description, and the three
                   rule/body pairs — so the port and the foot span rows 1 to 9. The
                   count is a real coupling to generateRaceItems() and it is the only
                   one; if a section is added there, this number moves with it.
                   :not(.owned-badge) because the badge is position:absolute and a
                   grid-column on it would re-anchor its containing block to the
                   middle column, dragging OWNED off the corner of the card. */
                #shop-container #shop-races .shop-item
                    > *:not(.owned-badge):not(.shop-port):not(.shop-item-foot) { grid-column: 2; }
                #shop-container #shop-races .shop-port {
                    grid-column: 1;
                    grid-row: 1 / 9;
                    align-self: center;
                    margin-bottom: 0;
                }
                /* The corner flag moves to the crest. Left where it was it lands on the
                   price well, which in this layout is the top of the third column — so an
                   owned card covered its own purchase date with the word OWNED. */
                #shop-container #shop-races .owned-badge { top: 6px; right: auto; left: 6px; }
                #shop-container #shop-races .shop-item-foot {
                    grid-column: 3;
                    grid-row: 1 / 9;
                    margin-top: 0;
                    padding-top: 0;
                }
                /* The foot's engraved rule divides a stack. Beside one it is a scar. */
                #shop-container #shop-races .shop-item-foot::before { display: none; }
            }

            /* Too narrow for the shelf ticket, so the card stays upright and the FOOT
               lies down instead: the price well and the plate share a row rather than
               stacking, which is 40px of the fold back on a screen that has none to
               spare, and a full-width card has the horizontal room for it. */
            @media (max-width: 619px) {
                #shop-container .shop-item-foot {
                    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
                    align-items: center;
                    column-gap: 9px;
                }
                /* The engraved rule is a grid item too; without this it takes the first
                   cell and shunts the price under the Buy plate. */
                #shop-container .shop-item-foot::before { grid-column: 1 / -1; }
                #shop-container .shop-item-foot .shop-item-state { grid-column: 1 / -1; }
            }

            @media (max-width: 760px) {
                #shop-container { padding: 0; }
                #shop-container .shop-window {
                    width: 100%;
                    max-height: 100%;
                    height: 100%;
                    border-width: 0;
                }
                #shop-container .shop-items { grid-template-columns: 1fr; }
                /* One card per row means a card as wide as the window, and an aperture
                   as wide as THAT is a 500px-tall crest. Cap the port, never the crest
                   inside it: capping the picture is what puts mat back at its sides. */
                #shop-container .shop-port { max-width: min(100%, 240px); }
                #shop-container .shop-btn-label { display: none; }
                #shop-container .history-item { grid-template-columns: 1fr; gap: 2px; }
                #shop-container .history-head { display: none; }
                #shop-container .payment-actions .btn-primary,
                #shop-container .payment-actions .btn-secondary { flex: 1 1 100%; }
            }

            /* A finger is not a mouse pointer. The header keys are 32px square and the
               tabs 36px tall, which is comfortable under a cursor and under the 44px
               floor for touch - and the tab strip is the only way to reach half the
               catalogue. Widened only where the pointer is actually coarse, so the
               desktop console keeps its tight machined proportions. */
            @media (pointer: coarse) {
                #shop-container .shop-tab { min-height: 44px; }
                #shop-container .shop-history-btn,
                #shop-container .shop-close,
                #shop-container .payment-close,
                #shop-container .history-close,
                #shop-container .refresh-balance { min-height: 44px; }
                #shop-container .shop-close,
                #shop-container .payment-close,
                #shop-container .history-close,
                #shop-container .refresh-balance { width: 44px; }
                #shop-container .shop-action,
                #shop-container .btn-primary,
                #shop-container .btn-secondary { min-height: 44px; }
            }

            /* style.css already forces every animation to a single 0.01ms pass under
               reduced motion, which stills the spinner; what it does not cover is the
               travel on a pressed plate, so that is what this block turns off. */
            @media (prefers-reduced-motion: reduce) {
                #shop-container button.shop-action:active,
                #shop-container .btn-primary:active,
                #shop-container .btn-secondary:active { transform: none; }
            }
        `;
        document.head.appendChild(style);
    }

    // Helper functions
    function getProductName(productId) {
        const products = {
            'race_quantum': 'Quantum Entities Race',
            'race_titan': 'Titan Lords Race',
            'race_shadow': 'Shadow Realm Race',
            'cosmetic_empire_theme': 'Empire Theme Pack',
            'cosmetic_fleet_trails': 'Fleet Engine Trails',
            'cosmetic_voice_pack': 'AI Advisor Voice Pack'
        };
        return products[productId] || productId;
    }

    function getProductDetails(productId) {
        const race = PREMIUM_RACES.find(r => r.id === productId);
        if (race) {
            return {
                name: `${race.name} — permanent unlock`,
                description: `${race.description} ${race.doctrine}`,
                image: race.crest,
                crestGain: race.crestGain,
                crestScale: race.crestScale
            };
        }
        const details = {
            cosmetic_empire_theme: {
                description: 'Custom UI skin, avatar frame, and lobby banner.',
                image: './images/terran-emblem-v2.svg'
            },
            cosmetic_fleet_trails: {
                description: 'Prismatic fleet trails and warp animation.',
                image: './images/zephyr-icon.svg'
            },
            cosmetic_voice_pack: {
                description: 'Additional advisor alert voice lines.',
                image: './images/quantum-icon.svg'
            }
        };
        return {
            name: getProductName(productId),
            description: details[productId]?.description || 'Premium cosmetic content',
            image: details[productId]?.image || './images/resources.png'
        };
    }

    /**
     * When this product was bought, if we happen to know — history is fetched only when
     * the player opens that panel, so most of the time we do not, and the owned card says
     * "Purchased" with no date rather than inventing one or firing a request to decorate a
     * card the player has already paid for.
     */
    function purchaseDateFor(productId) {
        if (historyState !== 'ready' || !Array.isArray(purchaseHistory)) return null;
        const row = purchaseHistory.find(p => p && p.product_id === productId
            && String(p.status || '').toLowerCase() !== 'failed');
        if (!row || !row.date) return null;
        const on = formatDate(row.date);
        return on === 'Date unknown' ? null : on;
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        // An unparseable date used to render the literal string "Invalid Date" in a
        // receipts table, which reads as a corrupted record rather than a missing field.
        if (Number.isNaN(date.getTime())) return 'Date unknown';
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    /** Repaint the race cards after anything that can change what a control may do. */
    function refreshItemStates() {
        const container = document.getElementById('shop-container');
        if (!container) return;
        const list = container.querySelector('#shop-races .shop-items');
        if (!list) return;

        // Keep the player where they were: re-rendering the list under a focused button
        // would otherwise dump focus onto <body> mid-interaction.
        //
        // The restore used to look for the BUY BUTTON by product id - which is exactly the
        // element that no longer exists after the one repaint that matters. A successful
        // purchase replaces the button with an owned plate, the query returned null, and
        // focus fell to <body> at the moment the player most needed to be told the thing
        // they paid for had arrived. Anchor on the CARD instead, and take whichever action
        // element the card now carries.
        const focused = document.activeElement;
        const focusedCard = focused instanceof HTMLElement && container.contains(focused)
            ? focused.closest('[data-product-id]')
            : null;
        const focusedProduct = focusedCard ? focusedCard.getAttribute('data-product-id') : null;

        list.innerHTML = generateRaceItems();

        if (!focusedProduct) return;
        const key = typeof CSS !== 'undefined' && CSS.escape
            ? CSS.escape(focusedProduct)
            : focusedProduct.replace(/["\\]/g, '\\$&');
        const card = list.querySelector(`[data-product-id="${key}"]`);
        const restored = card && card.querySelector('.shop-action');
        if (restored) {
            restored.focus({ preventScroll: true });
            return;
        }
        // The card itself is gone (a catalogue change, not a purchase). Falling back to the
        // dialog keeps the player inside the panel and re-announces where they are, which
        // beats being silently returned to the top of the game page.
        const win = container.querySelector('.shop-window');
        if (win) win.focus({ preventScroll: true });
    }

    function updateOwnedItemsDisplay() {
        refreshItemStates();
        document.querySelectorAll('#shop-container .shop-item').forEach(item => {
            const productId = item.dataset.productId;
            if (productId && ownedItems.has(productId)) {
                item.classList.add('owned');
                if (!item.querySelector('.owned-badge')) {
                    item.insertAdjacentHTML('afterbegin', '<div class="owned-badge">OWNED</div>');
                }
            }
        });
    }

    // Public API
    return {
        initialize,
        open: () => {
            // document.activeElement is the control that opened us — the HUD's Shop key
            // when it was clicked or keyed. Captured here so close() can hand focus back
            // to it instead of stranding a keyboard player on <body>.
            openShop(document.activeElement);
            loadUserBalance();
        },
        close: closeShop,
        closePayment,
        showTab: (tabName, evt) => {
            selectTab(tabName, evt && evt.currentTarget);
        },
        purchaseRace,
        purchaseCrystals: notifyGameplayPurchaseDisabled,
        purchaseVIP: notifyGameplayPurchaseDisabled,
        purchaseBooster: notifyGameplayPurchaseDisabled,
        purchaseCosmetic,
        purchaseBattlePass: notifyGameplayPurchaseDisabled,
        spendCrystals,
        refreshBalance: loadUserBalance,
        showHistory,
        hideHistory,
        getConfig: () => ({ ...configState }),
        ensureConfig: ensureConfigReady
    };
})();

// Export for use
window.Shop = Shop;
