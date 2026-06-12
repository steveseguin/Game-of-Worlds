/**
 * shop-enhanced.js - Enhanced client-side shop with better UX
 * 
 * Improved payment interface with proper error handling, loading states,
 * and user feedback throughout the purchase flow.
 */

const Shop = (function() {
    let userId = null;
    let stripe = null;
    let elements = null;
    let cardElement = null;
    let currentProduct = null;
    let purchaseHistory = [];
    let ownedItems = new Set();
    let processingPayment = false;

    const PLACEHOLDER_STRIPE_KEY = 'pk_test_YOUR_KEY_HERE';
    const configState = {
        stripeKey: null,
        paymentsEnabled: false,
        ready: false,
        loadingPromise: null
    };

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
    
    function notifyConfirm(title, message, onConfirm, onCancel) {
        const notifier = window.NotificationSystem;
        if (notifier && typeof notifier.confirm === 'function') {
            notifier.confirm(title, message, onConfirm, onCancel);
        } else {
            if (window.confirm(`${title}\n\n${message}`)) {
                onConfirm && onConfirm();
            } else if (onCancel) {
                onCancel();
            }
        }
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
    
    function notifyRaceUnlocked(raceId) {
        const notifier = window.NotificationSystem;
        if (notifier && notifier.game && typeof notifier.game.raceUnlocked === 'function') {
            notifier.game.raceUnlocked(raceId);
        } else {
            console.log(`[Shop] Race unlocked: ${raceId}`);
        }
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
        
        if (paymentsEnabled && typeof Stripe !== 'undefined') {
            try {
                stripe = Stripe(resolvedStripeKey);
                elements = stripe.elements({
                    fonts: [{ cssSrc: 'https://fonts.googleapis.com/css?family=Roboto' }]
                });
            } catch (error) {
                console.error('Failed to initialize Stripe:', error);
                notify('Payment system unavailable', 'error');
            }
        } else if (paymentsEnabled && typeof Stripe === 'undefined') {
            console.error('Stripe library failed to load while payments are enabled.');
            notify('Payment processing is temporarily unavailable. Please refresh and try again.', 'error', 6000);
        } else {
            console.info('Payments disabled. Showing cosmetics and crystal shop only.');
        }
        
        createShopUI(runtimeConfig);
        
        if (!userId) {
            notify('Shop features require a logged-in user.', 'warning', 6000);
            return;
        }
        
        const tasks = [loadUserBalance()];
        if (paymentsEnabled) {
            tasks.push(loadOwnedItems(), loadPurchaseHistory());
        }
        await Promise.all(tasks);
    }
    
    // Create enhanced shop UI
    function createShopUI(runtimeConfig) {
        const paymentsEnabled = Boolean(runtimeConfig && runtimeConfig.paymentsEnabled);

        const shopContainer = document.createElement('div');
        shopContainer.id = 'shop-container';
        shopContainer.className = 'shop-hidden';
        
        shopContainer.innerHTML = `
            <div class="shop-overlay" onclick="Shop.close()"></div>
            <div class="shop-window">
                <div class="shop-header">
                    <h2>Galactic Shop</h2>
                    <div class="shop-header-actions">
                        <button class="shop-history-btn" onclick="Shop.showHistory()" title="Purchase History">
                            <span class="history-icon">📜</span>
                        </button>
                        <button class="shop-close" onclick="Shop.close()">×</button>
                    </div>
                </div>
                
                <div class="shop-tabs">
                    <button class="shop-tab active" data-tab="races" onclick="Shop.showTab('races', event)">Premium Races</button>
                    <button class="shop-tab" data-tab="crystals" onclick="Shop.showTab('crystals', event)">Crystals</button>
                    <button class="shop-tab" data-tab="vip" onclick="Shop.showTab('vip', event)">VIP Membership</button>
                    <button class="shop-tab" data-tab="boosters" onclick="Shop.showTab('boosters', event)">Boosters</button>
                    <button class="shop-tab" data-tab="cosmetics" onclick="Shop.showTab('cosmetics', event)">Cosmetics</button>
                    <button class="shop-tab" data-tab="crystal-shop" onclick="Shop.showTab('crystal-shop', event)">Crystal Shop</button>
                </div>
                
                ${!paymentsEnabled ? `
                <div class="shop-payments-disabled">
                    <strong>Payments Offline</strong>
                    <p>Stripe payments are not configured for this environment. You can still browse cosmetic and crystal options, but purchases are disabled.</p>
                </div>` : ''}
                
                <div class="shop-balance">
                    <img src="./images/crystal.png" alt="Crystals" class="crystal-icon">
                    <span id="crystal-balance">
                        <span class="balance-loading">Loading...</span>
                    </span> Crystals
                    <button class="refresh-balance" onclick="Shop.refreshBalance()" title="Refresh Balance">🔄</button>
                </div>
                
                <div class="shop-content">
                    ${generateShopSections()}
                </div>
                
                <div id="payment-modal" class="payment-modal hidden">
                    <div class="payment-content">
                        <div class="payment-header">
                            <h3>Complete Purchase</h3>
                            <button class="payment-close" onclick="Shop.closePayment()">×</button>
                        </div>
                        
                        <div id="payment-details" class="payment-details"></div>
                        
                        <div class="payment-form">
                            <div id="card-element" class="card-element"></div>
                            <div id="card-errors" class="card-errors"></div>
                        </div>
                        
                        <div class="payment-security">
                            <span class="security-icon">🔒</span>
                            <span>Secure payment powered by Stripe</span>
                        </div>
                        
                        <div class="payment-actions">
                            <button id="submit-payment" class="btn-primary" disabled>
                                <span class="button-text">Pay Now</span>
                                <span class="button-loading hidden">Processing...</span>
                            </button>
                            <button onclick="Shop.closePayment()" class="btn-secondary">Cancel</button>
                        </div>
                        
                        <div class="payment-terms">
                            By completing this purchase, you agree to our 
                            <a href="/terms" target="_blank">Terms of Service</a> and 
                            <a href="/privacy" target="_blank">Privacy Policy</a>.
                        </div>
                    </div>
                </div>
                
                <div id="purchase-history-modal" class="history-modal hidden">
                    <div class="history-content">
                        <div class="history-header">
                            <h3>Purchase History</h3>
                            <button class="history-close" onclick="Shop.hideHistory()">×</button>
                        </div>
                        <div id="history-list" class="history-list">
                            <div class="history-loading">Loading purchase history...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(shopContainer);
        addEnhancedStyles();
        setupCardElement();
    }
    
    // Generate shop sections with owned item indicators
    function generateShopSections() {
        return `
            <div id="shop-races" class="shop-section active">
                <h3>Premium Races</h3>
                <div class="shop-info">Unlock powerful races with unique abilities!</div>
                <div class="shop-items">
                    ${generateRaceItems()}
                </div>
            </div>
            
            <div id="shop-crystals" class="shop-section">
                <h3>Premium Crystals</h3>
                <div class="shop-info">Purchase crystals to unlock content instantly!</div>
                <div class="shop-items">
                    ${generateCrystalItems()}
                </div>
            </div>
            
            <div id="shop-vip" class="shop-section">
                <h3>VIP Membership</h3>
                <div class="shop-info">Enjoy exclusive benefits and bonuses!</div>
                <div class="shop-items">
                    ${generateVIPItems()}
                </div>
            </div>
            
            <div id="shop-boosters" class="shop-section">
                <h3>Boosters</h3>
                <div class="shop-info">Temporary power-ups to accelerate your progress!</div>
                <div class="shop-items">
                    ${generateBoosterItems()}
                </div>
            </div>
            
            <div id="shop-cosmetics" class="shop-section">
                <h3>Cosmetics</h3>
                <div class="shop-info">Customize your empire with unique visuals!</div>
                <div class="shop-items">
                    ${generateCosmeticItems()}
                </div>
            </div>
            
            <div id="shop-crystal-shop" class="shop-section">
                <h3>Crystal Shop</h3>
                <div class="shop-info">Spend your crystals on instant rewards!</div>
                <div class="shop-items">
                    ${generateCrystalShopItems()}
                </div>
            </div>
        `;
    }
    
    // Generate race items
    function generateRaceItems() {
        const races = [
            {
                id: 'race_quantum',
                name: 'Quantum Entities',
                description: 'Phase through enemy attacks, instant warp capabilities',
                price: '$4.99',
                image: './images/quantum-icon.svg',
                features: ['Phase Shift', 'Instant Warp', 'Energy Shields']
            },
            {
                id: 'race_titan',
                name: 'Titan Lords',
                description: 'Massive ships, extreme durability, area damage',
                price: '$4.99',
                image: './images/titan-icon.svg',
                features: ['Massive Ships', '2x Hull Strength', 'Area Damage']
            },
            {
                id: 'race_shadow',
                name: 'Shadow Realm',
                description: 'Cloaking technology, sabotage abilities, stealth attacks',
                price: '$4.99',
                image: './images/shadow-icon.svg',
                features: ['Cloaking', 'Sabotage', 'Surprise Attacks']
            }
        ];
        
        return races.map(race => `
            <div class="shop-item ${ownedItems.has(race.id) ? 'owned' : ''}" 
                 data-product-id="${race.id}"
                 onclick="Shop.purchaseRace('${race.id}')">
                ${ownedItems.has(race.id) ? '<div class="owned-badge">OWNED</div>' : ''}
                <img src="${race.image}" alt="${race.name}" loading="lazy">
                <h4>${race.name}</h4>
                <p class="item-description">${race.description}</p>
                <ul class="item-features">
                    ${race.features.map(f => `<li>• ${f}</li>`).join('')}
                </ul>
                <div class="price">${race.price}</div>
            </div>
        `).join('');
    }

    function sanitizeUserId(value) {
        if (value === null || value === undefined) {
            return null;
        }
        const trimmed = String(value).trim();
        return /^\d+$/.test(trimmed) ? trimmed : null;
    }
    
    function generateCrystalItems() {
        const packs = [
            {
                id: 'crystals_500',
                name: '500 Crystals',
                price: '$4.99',
                description: 'Jump-start your empire with a handy stash.',
                bonus: 'Perfect for rushing early tech.',
                badge: ''
            },
            {
                id: 'crystals_1200',
                name: '1,200 Crystals',
                price: '$9.99',
                description: 'More than double the starter pack.',
                bonus: '+200 bonus crystals',
                badge: 'BEST VALUE'
            },
            {
                id: 'crystals_2500',
                name: '2,500 Crystals',
                price: '$19.99',
                description: 'Stockpile enough to outfit an entire fleet.',
                bonus: '+500 bonus crystals',
                badge: ''
            },
            {
                id: 'crystals_6500',
                name: '6,500 Crystals',
                price: '$49.99',
                description: 'For emperors who never want to wait.',
                bonus: '+1,500 bonus crystals',
                badge: 'TOP DEAL'
            }
        ];
        
        return packs.map(pack => `
            <div class="shop-item ${pack.badge ? 'popular' : ''}" data-product-id="${pack.id}"
                 onclick="Shop.purchaseCrystals('${pack.id}')">
                ${pack.badge ? `<div class="popular-badge">${pack.badge}</div>` : ''}
                <img src="./images/crystal.png" alt="${pack.name}" loading="lazy">
                <h4>${pack.name}</h4>
                <p class="item-description">${pack.description}</p>
                ${pack.bonus ? `<p class="item-subtext">${pack.bonus}</p>` : ''}
                <div class="price">${pack.price}</div>
            </div>
        `).join('');
    }
    
    function generateVIPItems() {
        const tiers = [
            {
                id: 'vip_bronze',
                name: 'Bronze VIP',
                price: '$4.99 / month',
                description: 'Founders bundle of boosts and flair.',
                perks: ['+10% resource income', '+10 daily crystals', '+1 build queue', 'Bronze nameplate'],
                image: './images/buygold.jpg'
            },
            {
                id: 'vip_silver',
                name: 'Silver VIP',
                price: '$9.99 / month',
                description: 'Step into the commander’s lounge.',
                perks: ['+20% resource income', '+25 daily crystals', '+2 build queues', 'Priority matchmaking', 'Silver holo-banner'],
                badge: 'RECOMMENDED',
                image: './images/buygold.jpg'
            },
            {
                id: 'vip_gold',
                name: 'Gold VIP',
                price: '$19.99 / month',
                description: 'Ultimate prestige for galactic rulers.',
                perks: ['+30% resource income', '+50 daily crystals', '+3 build queues', 'Exclusive skins', 'VIP chat channel'],
                badge: 'ELITE',
                image: './images/buygold.jpg'
            }
        ];
        
        return tiers.map(tier => `
            <div class="shop-item ${tier.badge ? 'popular' : ''}" data-product-id="${tier.id}"
                 onclick="Shop.purchaseVIP('${tier.id}')">
                ${tier.badge ? `<div class="popular-badge">${tier.badge}</div>` : ''}
                <img src="${tier.image}" alt="${tier.name}" loading="lazy">
                <h4>${tier.name}</h4>
                <p class="item-description">${tier.description}</p>
                <ul class="item-features">
                    ${tier.perks.map(perk => `<li>• ${perk}</li>`).join('')}
                </ul>
                <div class="price">${tier.price}</div>
            </div>
        `).join('');
    }
    
    function generateBoosterItems() {
        const boosters = [
            {
                id: 'booster_resource',
                name: 'Resource Surge (7 days)',
                price: '$2.99',
                description: 'Doubles metal & crystal production on all colonized worlds.',
                perks: ['+100% metal income', '+100% crystal income'],
                image: './images/probe.png'
            },
            {
                id: 'booster_research',
                name: 'Research Focus (7 days)',
                price: '$3.49',
                description: 'Accelerate your scientists to unlock tech faster.',
                perks: ['+150% research output', 'Free tech queue slot'],
                image: './images/probe.png'
            },
            {
                id: 'booster_fleet',
                name: 'Fleet Rally (3 days)',
                price: '$1.99',
                description: 'Your shipyards work overtime for rapid deployment.',
                perks: ['+50% ship build speed', '-25% movement cost'],
                image: './images/probe.png'
            },
            {
                id: 'booster_warp',
                name: 'Warp Gate Express (72 hrs)',
                price: '$1.49',
                description: 'Temporary warp network for lightning-fast redeployments.',
                perks: ['Free warp jumping between owned gates', 'Instant gate cooldown reset once per day'],
                image: './images/probe.png'
            }
        ];
        
        return boosters.map(booster => `
            <div class="shop-item" data-product-id="${booster.id}"
                 onclick="Shop.purchaseBooster('${booster.id}')">
                <img src="${booster.image}" alt="${booster.name}" loading="lazy">
                <h4>${booster.name}</h4>
                <p class="item-description">${booster.description}</p>
                <ul class="item-features">
                    ${booster.perks.map(perk => `<li>• ${perk}</li>`).join('')}
                </ul>
                <div class="price">${booster.price}</div>
            </div>
        `).join('');
    }
    
    function generateCosmeticItems() {
        const cosmetics = [
            {
                id: 'cosmetic_empire_theme',
                name: 'Empire Theme Pack',
                price: '$3.99',
                description: 'Custom UI skin, avatar frame, and lobby banner.',
                features: ['Dynamic UI colors', 'Animated banner', 'Unique chat flair'],
                image: './images/terran-icon.svg'
            },
            {
                id: 'cosmetic_fleet_trails',
                name: 'Fleet Engine Trails',
                price: '$2.49',
                description: 'Leave prismatic trails across the galaxy map.',
                features: ['Animated fleet trails', 'Custom warp animation'],
                image: './images/zephyr-icon.svg'
            },
            {
                id: 'cosmetic_voice_pack',
                name: 'AI Advisor Voice Pack',
                price: '$1.99',
                description: 'New voice lines for alerts and turn reminders.',
                features: ['20+ voiced notifications', 'Toggle per category'],
                image: './images/quantum-icon.svg'
            }
        ];
        
        return cosmetics.map(item => `
            <div class="shop-item" data-product-id="${item.id}"
                 onclick="Shop.purchaseCosmetic('${item.id}')">
                <img src="${item.image}" alt="${item.name}" loading="lazy">
                <h4>${item.name}</h4>
                <p class="item-description">${item.description}</p>
                <ul class="item-features">
                    ${item.features.map(feature => `<li>• ${feature}</li>`).join('')}
                </ul>
                <div class="price">${item.price}</div>
            </div>
        `).join('');
    }
    
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
            <div class="shop-item" data-product-id="${item.id}"
                 onclick="Shop.spendCrystals('${item.id}')">
                <img src="./images/crystal.png" alt="${item.name}" loading="lazy">
                <h4>${item.name}</h4>
                <p class="item-description">${item.description}</p>
                <div class="crystal-cost">
                    <img src="./images/crystal.png" alt="" class="crystal-icon-inline">
                    ${item.cost}
                </div>
            </div>
        `).join('');
    }
    
    // Setup card element with real-time validation
    function setupCardElement() {
        if (!stripe || !elements) return;
        
        const style = {
            base: {
                color: '#32325d',
                fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
                fontSmoothing: 'antialiased',
                fontSize: '16px',
                '::placeholder': {
                    color: '#aab7c4'
                }
            },
            invalid: {
                color: '#fa755a',
                iconColor: '#fa755a'
            }
        };
        
        cardElement = elements.create('card', { style });
        
        // Add real-time validation
        cardElement.on('change', (event) => {
            const errorElement = document.getElementById('card-errors');
            const submitButton = document.getElementById('submit-payment');
            
            if (event.error) {
                errorElement.textContent = event.error.message;
                errorElement.classList.add('visible');
                submitButton.disabled = true;
            } else {
                errorElement.textContent = '';
                errorElement.classList.remove('visible');
                submitButton.disabled = event.empty || processingPayment;
            }
        });
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
        if (error) {
            balanceElement.innerHTML = '<span class="balance-error">Error</span>';
        } else {
            balanceElement.innerHTML = `<span class="balance-amount">${amount.toLocaleString()}</span>`;
        }
    }
    
    // Load owned items
    async function loadOwnedItems() {
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
        try {
            const response = await fetch(`/api/user/${userId}/purchase-history`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to load history');
            
            const data = await parseJsonResponse(response, 'Failed to load purchase history');
            purchaseHistory = data.history || [];
        } catch (error) {
            console.error('Failed to load purchase history:', error);
        }
    }
    
    // Purchase race with enhanced flow
    async function purchaseRace(productId) {
        if (ownedItems.has(productId)) {
            notify('You already own this race!', 'warning');
            return;
        }
        
        await processPurchase(productId, 'race', {
            onSuccess: () => {
                ownedItems.add(productId);
                updateOwnedItemsDisplay();
                notifyRaceUnlocked(productId);
            }
        });
    }
    
    // Enhanced purchase process
    async function processPurchase(productId, type, options = {}) {
        if (!stripe) {
            notify('Payment system not available. Please contact support.', 'error', 8000);
            return;
        }
        
        if (processingPayment) {
            notify('Please wait for current payment to complete', 'warning');
            return;
        }
        
        currentProduct = { productId, type, ...options };
        
        // Show confirmation for high-value purchases
        if (shouldConfirmPurchase(productId)) {
            notifyConfirm(
                'Confirm Purchase',
                `Are you sure you want to purchase ${getProductName(productId)}?`,
                () => startPurchaseFlow(productId, type, options),
                null
            );
        } else {
            await startPurchaseFlow(productId, type, options);
        }
    }
    
    // Start purchase flow
    async function startPurchaseFlow(productId, type, options) {
        try {
            processingPayment = true;
            notifyLoading('Preparing checkout...', 'Please wait');
            
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
                const error = await response.json();
                throw new Error(error.message || 'Failed to create payment');
            }
            
            const paymentData = await response.json();
            
            notifyLoadingEnd();
            showPaymentModal(productId, paymentData, options);
            
        } catch (error) {
            processingPayment = false;
            notifyLoadingEnd();
            notifyPayment('error', error.message);
            
            // Log error for debugging
            console.error('Purchase error:', error);
            
            // Send error to analytics
            if (window.analytics) {
                window.analytics.track('Payment Error', {
                    productId: productId,
                    error: error.message
                });
            }
        }
    }
    
    // Show enhanced payment modal
    function showPaymentModal(productId, paymentData, options) {
        const modal = document.getElementById('payment-modal');
        const details = document.getElementById('payment-details');
        
        const product = getProductDetails(productId);
        
        details.innerHTML = `
            <div class="payment-product">
                <img src="${product.image}" alt="${product.name}" class="payment-product-image">
                <div class="payment-product-info">
                    <h4>${product.name}</h4>
                    <p>${product.description}</p>
                </div>
                <div class="payment-amount">
                    $${(paymentData.amount / 100).toFixed(2)}
                </div>
            </div>
            
            <div class="payment-summary">
                <div class="summary-row">
                    <span>Subtotal:</span>
                    <span>$${(paymentData.amount / 100).toFixed(2)}</span>
                </div>
                <div class="summary-row">
                    <span>Tax:</span>
                    <span>$0.00</span>
                </div>
                <div class="summary-row total">
                    <span>Total:</span>
                    <span>$${(paymentData.amount / 100).toFixed(2)} ${paymentData.currency.toUpperCase()}</span>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
        
        // Mount card element
        if (cardElement) {
            cardElement.mount('#card-element');
            
            // Setup payment submission
            const submitButton = document.getElementById('submit-payment');
            submitButton.onclick = () => handlePaymentSubmission(paymentData, options);
        }
    }
    
    // Handle payment submission with better error handling
    async function handlePaymentSubmission(paymentData, options) {
        const submitButton = document.getElementById('submit-payment');
        const buttonText = submitButton.querySelector('.button-text');
        const buttonLoading = submitButton.querySelector('.button-loading');
        
        try {
            // Disable button and show loading
            submitButton.disabled = true;
            buttonText.classList.add('hidden');
            buttonLoading.classList.remove('hidden');
            
            // Clear any existing errors
            document.getElementById('card-errors').textContent = '';
            
            // Confirm payment with Stripe
            const { error, paymentIntent } = await stripe.confirmCardPayment(
                paymentData.clientSecret,
                {
                    payment_method: {
                        card: cardElement,
                        billing_details: {
                            // Add billing details if available
                        }
                    }
                }
            );
            
            if (error) {
                // Handle specific error types
                if (error.type === 'card_error') {
                    notifyPayment('declined');
                } else if (error.type === 'validation_error') {
                    notify('Please check your card details', 'error');
                } else {
                    notifyPayment('error', error.message);
                }
                
                // Re-enable button
                submitButton.disabled = false;
                buttonText.classList.remove('hidden');
                buttonLoading.classList.add('hidden');
            } else {
                // Payment successful
                closePayment();
                notifyPayment('success', currentProduct.productId);
                
                // Execute success callback
                if (options.onSuccess) {
                    options.onSuccess();
                }
                
                // Refresh balance after purchase
                setTimeout(() => loadUserBalance(), 1000);
                
                // Track successful purchase
                if (window.analytics) {
                    window.analytics.track('Purchase Complete', {
                        productId: currentProduct.productId,
                        amount: paymentData.amount / 100,
                        currency: paymentData.currency
                    });
                }
            }
            
        } catch (error) {
            console.error('Payment error:', error);
            notifyPayment('error', 'An unexpected error occurred');
            
            submitButton.disabled = false;
            buttonText.classList.remove('hidden');
            buttonLoading.classList.add('hidden');
        } finally {
            processingPayment = false;
        }
    }
    
    // Spend crystals with confirmation
    async function spendCrystals(itemId) {
        const item = getCrystalShopItem(itemId);
        if (!item) return;
        
        notifyConfirm(
            'Confirm Purchase',
            `Spend ${item.cost} crystals on ${item.name}?`,
            async () => {
                try {
                    notifyLoading('Processing purchase...');
                    
                    const response = await fetch('/api/payment/spend-crystals', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: userId,
                            itemId: itemId
                        })
                    });
                    
                    const data = await response.json();
                    notifyLoadingEnd();
                    
                    if (data.error) {
                        notify(data.error, 'error');
                    } else {
                        notify(`Purchased ${item.name}!`, 'success');
                        updateBalanceDisplay(data.newBalance);
                        
                        // Execute item effect
                        if (item.onPurchase) {
                            item.onPurchase();
                        }
                    }
                    
                } catch (error) {
                    notifyLoadingEnd();
                    notify('Purchase failed', 'error');
                }
            }
        );
    }
    
    // Show purchase history
    function showHistory() {
        const modal = document.getElementById('purchase-history-modal');
        const list = document.getElementById('history-list');
        
        if (purchaseHistory.length === 0) {
            list.innerHTML = '<div class="history-empty">No purchases yet</div>';
        } else {
            list.innerHTML = purchaseHistory.map(purchase => `
                <div class="history-item">
                    <div class="history-date">${formatDate(purchase.date)}</div>
                    <div class="history-product">${purchase.productName}</div>
                    <div class="history-amount">$${(purchase.amount / 100).toFixed(2)}</div>
                    <div class="history-status status-${purchase.status}">${purchase.status}</div>
                </div>
            `).join('');
        }
        
        modal.classList.remove('hidden');
    }
    
    // Enhanced styles
    function addEnhancedStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Shop container base styles */
            #shop-container {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            #shop-container.shop-hidden {
                display: none !important;
            }

            .shop-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
            }

            .shop-window {
                position: relative;
                background:
                    radial-gradient(circle at 16% 0%, rgba(66,216,200,0.12), transparent 28%),
                    linear-gradient(145deg, rgba(19, 25, 48, 0.98), rgba(10, 13, 28, 0.98));
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                max-width: 980px;
                max-height: 88vh;
                width: min(94vw, 980px);
                overflow: hidden;
                box-shadow: 0 24px 70px rgba(0, 0, 0, 0.62);
                color: #e8ecff;
            }

            .shop-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 18px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.035);
            }

            .shop-header h2 {
                margin: 0;
                font-size: 22px;
                letter-spacing: 0;
            }

            .shop-header-actions {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .shop-history-btn,
            .shop-close,
            .payment-close,
            .history-close {
                width: 34px;
                height: 34px;
                display: inline-grid;
                place-items: center;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.06);
                color: #e8ecff;
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
            }

            .shop-tabs {
                display: flex;
                gap: 6px;
                padding: 10px 12px 0;
                overflow-x: auto;
                background: rgba(7, 10, 22, 0.72);
            }

            .shop-tab {
                flex: 0 0 auto;
                min-height: 38px;
                padding: 9px 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-bottom: none;
                border-radius: 8px 8px 0 0;
                background: rgba(255, 255, 255, 0.04);
                color: #cfd7ff;
                font-weight: 700;
                font-size: 13px;
                cursor: pointer;
            }

            .shop-tab:hover,
            .shop-tab.active {
                background: linear-gradient(120deg, rgba(66,216,200,0.18), rgba(76,124,255,0.18));
                color: #fff;
                border-color: rgba(66,216,200,0.32);
            }

            .shop-payments-disabled {
                margin: 12px 18px 0;
                padding: 12px 14px;
                border-radius: 8px;
                background: rgba(255, 213, 108, 0.1);
                border: 1px solid rgba(255, 213, 108, 0.24);
                color: #ffe3a2;
            }

            .shop-payments-disabled p {
                margin: 4px 0 0;
                color: rgba(255, 227, 162, 0.84);
            }

            .shop-balance {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 8px;
                margin: 14px 18px 0;
                padding: 10px 12px;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.045);
                color: #dfe7ff;
                font-weight: 700;
            }

            .crystal-icon {
                width: 22px;
                height: 22px;
                object-fit: contain;
            }

            .shop-content {
                max-height: calc(88vh - 162px);
                overflow-y: auto;
                padding: 18px;
            }

            .shop-section {
                display: none;
            }

            .shop-section.active {
                display: block;
            }

            .shop-section h3 {
                margin: 0 0 8px;
                font-size: 18px;
                color: #fff;
            }

            .shop-items {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                gap: 14px;
            }

            .shop-item {
                position: relative;
                display: flex;
                flex-direction: column;
                min-height: 310px;
                padding: 14px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.045);
                cursor: pointer;
                transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
                overflow: hidden;
            }

            .shop-item:hover {
                transform: translateY(-2px);
                border-color: rgba(66, 216, 200, 0.38);
                background: rgba(255, 255, 255, 0.07);
            }

            .shop-item img {
                display: block;
                width: 100%;
                height: 112px;
                object-fit: contain;
                margin-bottom: 12px;
                border-radius: 6px;
                background: rgba(7, 10, 22, 0.38);
            }

            .shop-item h4 {
                margin: 0 0 8px;
                font-size: 16px;
                color: #fff;
            }

            .item-description {
                margin: 0 0 8px;
                color: rgba(232, 236, 255, 0.78);
                font-size: 13px;
                line-height: 1.42;
            }

            .price {
                margin-top: auto;
                display: inline-flex;
                align-items: center;
                min-height: 30px;
                padding: 5px 10px;
                border-radius: 999px;
                background: linear-gradient(120deg, #42d8c8, #4c7cff);
                color: #071021;
                font-weight: 800;
            }
            
            .shop-item.popular {
                border: 2px solid rgba(241, 196, 15, 0.6);
                box-shadow: 0 0 12px rgba(241, 196, 15, 0.3);
            }
            
            .popular-badge {
                position: absolute;
                top: 10px;
                left: 10px;
                background: #f1c40f;
                color: #1a1a2e;
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .item-subtext {
                font-size: 13px;
                color: #f1c40f;
                margin-top: -6px;
                margin-bottom: 10px;
            }
            
            .shop-item.owned {
                opacity: 0.7;
                cursor: not-allowed;
            }
            
            .owned-badge {
                position: absolute;
                top: 10px;
                right: 10px;
                background: #2ecc71;
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 12px;
                font-weight: bold;
            }
            
            .item-features {
                list-style: none;
                padding: 0;
                margin: 10px 0;
                font-size: 14px;
                text-align: left;
            }

            .crystal-cost {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: 18px;
                font-weight: bold;
                color: #00d8ff;
                margin-top: 12px;
            }
            
            .crystal-icon-inline {
                width: 20px;
                height: 20px;
                object-fit: contain;
            }

            .payment-modal {
                position: absolute;
                inset: 0;
                z-index: 120;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                background: rgba(0, 0, 0, 0.78);
            }

            .payment-modal.hidden,
            .button-loading.hidden {
                display: none;
            }

            .payment-content {
                width: min(560px, 96vw);
                max-height: 86vh;
                overflow-y: auto;
                padding: 22px;
                border-radius: 10px;
                background: linear-gradient(145deg, #151c35, #0c1021);
                border: 1px solid rgba(255,255,255,0.12);
                box-shadow: 0 18px 60px rgba(0,0,0,0.55);
            }

            .payment-header,
            .history-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 16px;
            }

            .payment-header h3,
            .history-header h3 {
                margin: 0;
            }

            .card-element {
                padding: 12px;
                border-radius: 8px;
                background: #fff;
            }

            .payment-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 16px;
            }

            .btn-primary,
            .btn-secondary {
                min-height: 38px;
                padding: 8px 14px;
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.12);
                font-weight: 800;
                cursor: pointer;
            }

            .btn-primary {
                background: linear-gradient(120deg, #42d8c8, #4c7cff);
                color: #071021;
            }

            .btn-primary:disabled {
                opacity: 0.55;
                cursor: not-allowed;
            }

            .btn-secondary {
                background: rgba(255,255,255,0.08);
                color: #e8ecff;
            }

            .payment-terms {
                margin-top: 14px;
                font-size: 12px;
                color: rgba(232,236,255,0.62);
            }

            .payment-terms a {
                color: #7bdcff;
            }
            
            .payment-product {
                display: flex;
                gap: 15px;
                margin-bottom: 20px;
                padding-bottom: 20px;
                border-bottom: 1px solid #2a2a3e;
            }
            
            .payment-product-image {
                width: 60px;
                height: 60px;
                object-fit: contain;
            }
            
            .payment-summary {
                margin: 20px 0;
            }
            
            .summary-row {
                display: flex;
                justify-content: space-between;
                padding: 5px 0;
            }
            
            .summary-row.total {
                font-weight: bold;
                font-size: 18px;
                border-top: 1px solid #2a2a3e;
                margin-top: 10px;
                padding-top: 10px;
            }
            
            .card-errors {
                color: #fa755a;
                margin-top: 10px;
                font-size: 14px;
                display: none;
            }
            
            .card-errors.visible {
                display: block;
            }
            
            .payment-security {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 20px 0;
                font-size: 14px;
                color: #95a5a6;
            }
            
            .security-icon {
                font-size: 20px;
            }
            
            .button-loading {
                display: inline-flex;
                align-items: center;
                gap: 10px;
            }
            
            .button-loading::after {
                content: '';
                width: 16px;
                height: 16px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            .balance-loading {
                color: #95a5a6;
                font-style: italic;
            }
            
            .balance-error {
                color: #e74c3c;
            }
            
            .refresh-balance {
                background: none;
                border: none;
                color: #3498db;
                cursor: pointer;
                font-size: 16px;
                margin-left: 10px;
                transition: transform 0.3s;
            }
            
            .refresh-balance:hover {
                transform: rotate(180deg);
            }
            
            .shop-info {
                text-align: center;
                color: #95a5a6;
                margin-bottom: 20px;
                font-style: italic;
            }
            
            .history-modal {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100;
            }

            .history-modal.hidden {
                display: none;
            }

            .history-content {
                background: #1a1a2e;
                padding: 30px;
                border-radius: 10px;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
            }
            
            .history-item {
                display: grid;
                grid-template-columns: 120px 1fr 100px 100px;
                gap: 15px;
                padding: 15px;
                border-bottom: 1px solid #2a2a3e;
                align-items: center;
            }
            
            .history-date {
                font-size: 14px;
                color: #95a5a6;
            }
            
            .status-completed {
                color: #2ecc71;
            }
            
            .status-pending {
                color: #f39c12;
            }
            
            .status-failed {
                color: #e74c3c;
            }
            
            @media (max-width: 768px) {
                .shop-window {
                    width: 100%;
                    height: 100%;
                    border-radius: 0;
                }
                
                .shop-tabs {
                    flex-wrap: nowrap;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                
                .shop-items {
                    grid-template-columns: 1fr;
                }
                
                .payment-content {
                    padding: 20px;
                }
                
                .history-item {
                    grid-template-columns: 1fr;
                    gap: 5px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Helper functions
    function shouldConfirmPurchase(productId) {
        // Confirm for high-value items
        return productId.includes('6500') || productId.includes('gold');
    }
    
    function getProductName(productId) {
        const products = {
            'race_quantum': 'Quantum Entities Race',
            'race_titan': 'Titan Lords Race',
            'race_shadow': 'Shadow Realm Race',
            'crystals_500': '500 Crystals',
            'crystals_1200': '1200 Crystals',
            'crystals_2500': '2500 Crystals',
            'crystals_6500': '6500 Crystals',
            'vip_bronze': 'Bronze VIP',
            'vip_silver': 'Silver VIP',
            'vip_gold': 'Gold VIP'
        };
        return products[productId] || productId;
    }
    
    function getProductDetails(productId) {
        // Return detailed product information
        return {
            name: getProductName(productId),
            description: 'Premium game content',
            image: './images/resources.png'
        };
    }
    
    function getCrystalShopItem(itemId) {
        const items = {
            'crystal_instant_build': {
                name: 'Instant Build',
                cost: 50,
                onPurchase: () => {
                    if (window.GameActions?.completeCurrentBuilding) {
                        window.GameActions.completeCurrentBuilding();
                    }
                }
            },
            'crystal_sector_scan': {
                name: 'Deep Sector Scan',
                cost: 35,
                onPurchase: () => {
                    if (window.GameActions?.requestSectorScan) {
                        window.GameActions.requestSectorScan();
                    }
                }
            },
            'crystal_warp_refresh': {
                name: 'Warp Gate Refresh',
                cost: 40,
                onPurchase: () => {
                    if (window.GameActions?.refreshWarpGates) {
                        window.GameActions.refreshWarpGates();
                    }
                }
            },
            'crystal_emergency_fleet': {
                name: 'Emergency Fleet Draft',
                cost: 120,
                onPurchase: () => {
                    if (window.GameActions?.spawnEmergencyFleet) {
                        window.GameActions.spawnEmergencyFleet();
                    }
                }
            }
        };
        return items[itemId];
    }
    
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }
    
    function updateOwnedItemsDisplay() {
        // Update UI to show owned items
        document.querySelectorAll('.shop-item').forEach(item => {
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
            const container = document.getElementById('shop-container');
            if (!container) return;
            container.classList.remove('shop-hidden');
            loadUserBalance(); // Refresh on open
        },
        close: () => {
            const container = document.getElementById('shop-container');
            if (container) {
                container.classList.add('shop-hidden');
            }
        },
        closePayment: () => {
            const modal = document.getElementById('payment-modal');
            modal.classList.add('hidden');
            if (cardElement) {
                cardElement.unmount();
            }
            processingPayment = false;
        },
        showTab: (tabName, evt) => {
            // Update tab buttons
            document.querySelectorAll('.shop-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            const target = evt?.currentTarget;
            if (target) {
                target.classList.add('active');
            } else {
                document.querySelector(`.shop-tab[data-tab="${tabName}"]`)?.classList.add('active');
            }
            
            // Update content sections
            document.querySelectorAll('.shop-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(`shop-${tabName}`)?.classList.add('active');
        },
        purchaseRace,
        purchaseCrystals: (productId) => processPurchase(productId, 'crystals'),
        purchaseVIP: (productId) => processPurchase(productId, 'subscription'),
        purchaseBooster: (productId) => processPurchase(productId, 'booster'),
        purchaseCosmetic: (productId) => processPurchase(productId, 'cosmetic'),
        purchaseBattlePass: () => processPurchase('battle_pass', 'battle_pass'),
        spendCrystals,
        refreshBalance: loadUserBalance,
        showHistory,
        hideHistory: () => {
            document.getElementById('purchase-history-modal').classList.add('hidden');
        },
        getConfig: () => ({ ...configState }),
        ensureConfig: ensureConfigReady
    };
})();

// Export for use
window.Shop = Shop;
