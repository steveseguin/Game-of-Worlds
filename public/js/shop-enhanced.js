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
    
    // Get Stripe key from environment or config
    const STRIPE_KEY = window.STRIPE_PUBLISHABLE_KEY || 'pk_test_YOUR_KEY_HERE';
    
    // Initialize shop with user ID
    async function initialize(uid) {
        userId = uid;
        
        // Initialize Stripe
        if (typeof Stripe !== 'undefined' && STRIPE_KEY !== 'pk_test_YOUR_KEY_HERE') {
            try {
                stripe = Stripe(STRIPE_KEY);
                elements = stripe.elements({
                    fonts: [{ cssSrc: 'https://fonts.googleapis.com/css?family=Roboto' }]
                });
            } catch (error) {
                console.error('Failed to initialize Stripe:', error);
                NotificationSystem.show('Payment system unavailable', 'error');
            }
        } else {
            console.warn('Stripe not configured. Payment functionality disabled.');
        }
        
        createShopUI();
        await Promise.all([
            loadUserBalance(),
            loadOwnedItems(),
            loadPurchaseHistory()
        ]);
    }
    
    // Create enhanced shop UI
    function createShopUI() {
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
                    <button class="shop-tab active" onclick="Shop.showTab('races')">Premium Races</button>
                    <button class="shop-tab" onclick="Shop.showTab('crystals')">Crystals</button>
                    <button class="shop-tab" onclick="Shop.showTab('vip')">VIP Membership</button>
                    <button class="shop-tab" onclick="Shop.showTab('boosters')">Boosters</button>
                    <button class="shop-tab" onclick="Shop.showTab('cosmetics')">Cosmetics</button>
                    <button class="shop-tab" onclick="Shop.showTab('crystal-shop')">Crystal Shop</button>
                </div>
                
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
                image: './images/planet1.png',
                features: ['Phase Shift', 'Instant Warp', 'Energy Shields']
            },
            {
                id: 'race_titan',
                name: 'Titan Lords',
                description: 'Massive ships, extreme durability, area damage',
                price: '$4.99',
                image: './images/planet2.png',
                features: ['Massive Ships', '2x Hull Strength', 'Area Damage']
            },
            {
                id: 'race_shadow',
                name: 'Shadow Realm',
                description: 'Cloaking technology, sabotage abilities, stealth attacks',
                price: '$4.99',
                image: './images/planet3.png',
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
    
    // Load user balance with error handling
    async function loadUserBalance() {
        try {
            const response = await fetch(`/api/user/${userId}/balance`);
            if (!response.ok) throw new Error('Failed to load balance');
            
            const data = await response.json();
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
            const response = await fetch(`/api/user/${userId}/owned-items`);
            if (!response.ok) throw new Error('Failed to load owned items');
            
            const data = await response.json();
            ownedItems = new Set(data.items || []);
            updateOwnedItemsDisplay();
        } catch (error) {
            console.error('Failed to load owned items:', error);
        }
    }
    
    // Load purchase history
    async function loadPurchaseHistory() {
        try {
            const response = await fetch(`/api/user/${userId}/purchase-history`);
            if (!response.ok) throw new Error('Failed to load history');
            
            const data = await response.json();
            purchaseHistory = data.history || [];
        } catch (error) {
            console.error('Failed to load purchase history:', error);
        }
    }
    
    // Purchase race with enhanced flow
    async function purchaseRace(productId) {
        if (ownedItems.has(productId)) {
            NotificationSystem.show('You already own this race!', 'warning');
            return;
        }
        
        await processPurchase(productId, 'race', {
            onSuccess: () => {
                ownedItems.add(productId);
                updateOwnedItemsDisplay();
                NotificationSystem.game.raceUnlocked(productId);
            }
        });
    }
    
    // Enhanced purchase process
    async function processPurchase(productId, type, options = {}) {
        if (!stripe) {
            NotificationSystem.show(
                'Payment system not available. Please contact support.',
                'error',
                8000
            );
            return;
        }
        
        if (processingPayment) {
            NotificationSystem.show('Please wait for current payment to complete', 'warning');
            return;
        }
        
        currentProduct = { productId, type, ...options };
        
        // Show confirmation for high-value purchases
        if (shouldConfirmPurchase(productId)) {
            NotificationSystem.confirm(
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
            NotificationSystem.showLoading('Preparing checkout...', 'Please wait');
            
            // Create payment intent
            const response = await fetch('/api/payment/create-intent', {
                method: 'POST',
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
            
            NotificationSystem.hideLoading();
            showPaymentModal(productId, paymentData, options);
            
        } catch (error) {
            processingPayment = false;
            NotificationSystem.hideLoading();
            NotificationSystem.payment.error(error.message);
            
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
                    NotificationSystem.payment.declined();
                } else if (error.type === 'validation_error') {
                    NotificationSystem.show('Please check your card details', 'error');
                } else {
                    NotificationSystem.payment.error(error.message);
                }
                
                // Re-enable button
                submitButton.disabled = false;
                buttonText.classList.remove('hidden');
                buttonLoading.classList.add('hidden');
            } else {
                // Payment successful
                closePayment();
                NotificationSystem.payment.success(currentProduct.productId);
                
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
            NotificationSystem.payment.error('An unexpected error occurred');
            
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
        
        NotificationSystem.confirm(
            'Confirm Purchase',
            `Spend ${item.cost} crystals on ${item.name}?`,
            async () => {
                try {
                    NotificationSystem.showLoading('Processing purchase...');
                    
                    const response = await fetch('/api/payment/spend-crystals', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: userId,
                            itemId: itemId
                        })
                    });
                    
                    const data = await response.json();
                    NotificationSystem.hideLoading();
                    
                    if (data.error) {
                        NotificationSystem.show(data.error, 'error');
                    } else {
                        NotificationSystem.show(`Purchased ${item.name}!`, 'success');
                        updateBalanceDisplay(data.newBalance);
                        
                        // Execute item effect
                        if (item.onPurchase) {
                            item.onPurchase();
                        }
                    }
                    
                } catch (error) {
                    NotificationSystem.hideLoading();
                    NotificationSystem.show('Purchase failed', 'error');
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
            /* Previous styles enhanced with: */
            
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
                    // Trigger instant build
                    if (window.GameActions) {
                        window.GameActions.completeCurrentBuilding();
                    }
                }
            }
            // Add more items...
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
            document.getElementById('shop-container').classList.remove('shop-hidden');
            loadUserBalance(); // Refresh on open
        },
        close: () => {
            document.getElementById('shop-container').classList.add('shop-hidden');
        },
        closePayment: () => {
            const modal = document.getElementById('payment-modal');
            modal.classList.add('hidden');
            if (cardElement) {
                cardElement.unmount();
            }
            processingPayment = false;
        },
        showTab: (tabName) => {
            // Update tab buttons
            document.querySelectorAll('.shop-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            event.target.classList.add('active');
            
            // Update content sections
            document.querySelectorAll('.shop-section').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(`shop-${tabName}`).classList.add('active');
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
        }
    };
})();

// Export for use
window.Shop = Shop;