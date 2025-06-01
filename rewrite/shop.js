/**
 * shop.js - Client-side shop and payment interface
 * 
 * Handles the shop UI, premium purchases, and Stripe payment integration.
 * This module runs in the browser and interacts with the payment API.
 */

const Shop = (function() {
    let userId = null;
    let stripe = null;
    let elements = null;
    
    // Initialize shop with user ID
    function initialize(uid) {
        userId = uid;
        
        // Initialize Stripe (you'll need to add your publishable key)
        if (typeof Stripe !== 'undefined') {
            stripe = Stripe('YOUR_STRIPE_PUBLISHABLE_KEY'); // Replace with actual key
        }
        
        createShopUI();
        loadUserBalance();
    }
    
    // Create shop UI
    function createShopUI() {
        const shopContainer = document.createElement('div');
        shopContainer.id = 'shop-container';
        shopContainer.className = 'shop-hidden';
        shopContainer.innerHTML = `
            <div class="shop-overlay" onclick="Shop.close()"></div>
            <div class="shop-window">
                <div class="shop-header">
                    <h2>Galactic Shop</h2>
                    <button class="shop-close" onclick="Shop.close()">×</button>
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
                    <img src="crystal.png" alt="Crystals" class="crystal-icon">
                    <span id="crystal-balance">0</span> Crystals
                </div>
                
                <div class="shop-content">
                    <div id="shop-races" class="shop-section active">
                        <h3>Premium Races</h3>
                        <div class="shop-items">
                            <div class="shop-item" onclick="Shop.purchaseRace('race_quantum')">
                                <img src="race10.png" alt="Quantum Entities">
                                <h4>Quantum Entities</h4>
                                <p>Phase through enemy attacks, instant warp capabilities</p>
                                <div class="price">$4.99</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseRace('race_titan')">
                                <img src="race11.png" alt="Titan Lords">
                                <h4>Titan Lords</h4>
                                <p>Massive ships, extreme durability, area damage</p>
                                <div class="price">$4.99</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseRace('race_shadow')">
                                <img src="race12.png" alt="Shadow Realm">
                                <h4>Shadow Realm</h4>
                                <p>Cloaking technology, sabotage abilities, stealth attacks</p>
                                <div class="price">$4.99</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="shop-crystals" class="shop-section">
                        <h3>Premium Crystals</h3>
                        <div class="shop-items">
                            <div class="shop-item" onclick="Shop.purchaseCrystals('crystals_500')">
                                <img src="crystal.png" alt="500 Crystals">
                                <h4>500 Crystals</h4>
                                <div class="price">$4.99</div>
                            </div>
                            <div class="shop-item popular" onclick="Shop.purchaseCrystals('crystals_1200')">
                                <div class="popular-badge">BEST VALUE</div>
                                <img src="crystal.png" alt="1200 Crystals">
                                <h4>1200 Crystals</h4>
                                <p class="bonus">+200 Bonus!</p>
                                <div class="price">$9.99</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseCrystals('crystals_2500')">
                                <img src="crystal.png" alt="2500 Crystals">
                                <h4>2500 Crystals</h4>
                                <p class="bonus">+500 Bonus!</p>
                                <div class="price">$19.99</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseCrystals('crystals_6500')">
                                <img src="crystal.png" alt="6500 Crystals">
                                <h4>6500 Crystals</h4>
                                <p class="bonus">+1500 Bonus!</p>
                                <div class="price">$49.99</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="shop-vip" class="shop-section">
                        <h3>VIP Membership</h3>
                        <div class="shop-items">
                            <div class="shop-item" onclick="Shop.purchaseVIP('vip_bronze')">
                                <img src="vip_bronze.png" alt="Bronze VIP">
                                <h4>Bronze VIP</h4>
                                <ul>
                                    <li>10% Resource Bonus</li>
                                    <li>10 Daily Crystals</li>
                                    <li>+1 Build Queue</li>
                                    <li>Custom Avatar</li>
                                </ul>
                                <div class="price">$4.99/month</div>
                            </div>
                            <div class="shop-item popular" onclick="Shop.purchaseVIP('vip_silver')">
                                <div class="popular-badge">RECOMMENDED</div>
                                <img src="vip_silver.png" alt="Silver VIP">
                                <h4>Silver VIP</h4>
                                <ul>
                                    <li>20% Resource Bonus</li>
                                    <li>25 Daily Crystals</li>
                                    <li>+2 Build Queues</li>
                                    <li>Exclusive Skins</li>
                                    <li>Priority Queue</li>
                                </ul>
                                <div class="price">$9.99/month</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseVIP('vip_gold')">
                                <img src="vip_gold.png" alt="Gold VIP">
                                <h4>Gold VIP</h4>
                                <ul>
                                    <li>30% Resource Bonus</li>
                                    <li>50 Daily Crystals</li>
                                    <li>+3 Build Queues</li>
                                    <li>All Skins</li>
                                    <li>Beta Access</li>
                                    <li>VIP Chat</li>
                                </ul>
                                <div class="price">$19.99/month</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="shop-boosters" class="shop-section">
                        <h3>Boosters</h3>
                        <div class="shop-items">
                            <div class="shop-item" onclick="Shop.purchaseBooster('booster_resource')">
                                <img src="booster_resource.png" alt="Resource Booster">
                                <h4>Resource Booster</h4>
                                <p>2x Resource Generation for 7 days</p>
                                <div class="price">$2.99</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseBooster('booster_research')">
                                <img src="booster_research.png" alt="Research Booster">
                                <h4>Research Booster</h4>
                                <p>2x Research Speed for 7 days</p>
                                <div class="price">$2.99</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseBooster('booster_build')">
                                <img src="booster_build.png" alt="Speed Build">
                                <h4>Speed Build</h4>
                                <p>2x Build Speed for 3 days</p>
                                <div class="price">$1.99</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="shop-cosmetics" class="shop-section">
                        <h3>Cosmetics</h3>
                        <div class="shop-items">
                            <div class="shop-item" onclick="Shop.purchaseCosmetic('skin_pack_neon')">
                                <img src="skin_neon.png" alt="Neon Skins">
                                <h4>Neon Ship Skins</h4>
                                <p>3 Vibrant neon ship skins</p>
                                <div class="price">$6.99</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseCosmetic('avatar_pack_legendary')">
                                <img src="avatar_legendary.png" alt="Legendary Avatars">
                                <h4>Legendary Avatars</h4>
                                <p>3 Epic avatar designs</p>
                                <div class="price">$4.99</div>
                            </div>
                            <div class="shop-item" onclick="Shop.purchaseBattlePass()">
                                <img src="battle_pass.png" alt="Battle Pass">
                                <h4>Galactic Battle Pass</h4>
                                <p>50 tiers of exclusive rewards!</p>
                                <div class="price">$9.99</div>
                            </div>
                        </div>
                    </div>
                    
                    <div id="shop-crystal-shop" class="shop-section">
                        <h3>Crystal Shop</h3>
                        <div class="shop-items">
                            <div class="shop-item" onclick="Shop.spendCrystals('crystal_race_unlock')">
                                <img src="race_unlock.png" alt="Race Unlock">
                                <h4>Unlock Any Race</h4>
                                <p>Unlock any non-premium race instantly</p>
                                <div class="crystal-price">1000 Crystals</div>
                            </div>
                            <div class="shop-item" onclick="Shop.spendCrystals('crystal_instant_build')">
                                <img src="instant_build.png" alt="Instant Build">
                                <h4>Instant Build</h4>
                                <p>Complete current building instantly</p>
                                <div class="crystal-price">50 Crystals</div>
                            </div>
                            <div class="shop-item" onclick="Shop.spendCrystals('crystal_instant_research')">
                                <img src="instant_research.png" alt="Instant Research">
                                <h4>Instant Research</h4>
                                <p>Complete current research instantly</p>
                                <div class="crystal-price">100 Crystals</div>
                            </div>
                            <div class="shop-item" onclick="Shop.spendCrystals('crystal_resources_small')">
                                <img src="resources.png" alt="Resources">
                                <h4>Resource Pack (Small)</h4>
                                <p>5k Metal, 5k Crystal, 2.5k Research</p>
                                <div class="crystal-price">200 Crystals</div>
                            </div>
                            <div class="shop-item" onclick="Shop.spendCrystals('crystal_resources_large')">
                                <img src="resources.png" alt="Resources">
                                <h4>Resource Pack (Large)</h4>
                                <p>25k Metal, 25k Crystal, 12.5k Research</p>
                                <div class="crystal-price">800 Crystals</div>
                            </div>
                            <div class="shop-item" onclick="Shop.spendCrystals('crystal_fleet_slot')">
                                <img src="fleet_slot.png" alt="Fleet Slot">
                                <h4>Extra Fleet Slot</h4>
                                <p>Permanently increase fleet capacity</p>
                                <div class="crystal-price">500 Crystals</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div id="payment-modal" class="payment-modal hidden">
                    <div class="payment-content">
                        <h3>Complete Purchase</h3>
                        <div id="payment-details"></div>
                        <div id="card-element"></div>
                        <div id="payment-errors"></div>
                        <button id="submit-payment" class="btn-primary">Pay Now</button>
                        <button onclick="Shop.closePayment()" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(shopContainer);
        
        // Add CSS styles
        addShopStyles();
    }
    
    // Add shop CSS styles
    function addShopStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #shop-container {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .shop-hidden {
                display: none !important;
            }
            
            .shop-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
            }
            
            .shop-window {
                position: relative;
                width: 90%;
                max-width: 1200px;
                height: 80%;
                background: #1a1a2e;
                border: 2px solid #16213e;
                border-radius: 10px;
                display: flex;
                flex-direction: column;
                color: white;
            }
            
            .shop-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px;
                border-bottom: 1px solid #16213e;
            }
            
            .shop-close {
                background: none;
                border: none;
                color: white;
                font-size: 30px;
                cursor: pointer;
            }
            
            .shop-tabs {
                display: flex;
                gap: 10px;
                padding: 10px 20px;
                background: #0f0f1e;
                overflow-x: auto;
            }
            
            .shop-tab {
                padding: 10px 20px;
                background: #16213e;
                border: none;
                color: white;
                cursor: pointer;
                border-radius: 5px;
                transition: all 0.3s;
            }
            
            .shop-tab:hover {
                background: #1e3a5f;
            }
            
            .shop-tab.active {
                background: #0f4c75;
            }
            
            .shop-balance {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 20px;
                background: #16213e;
                font-size: 18px;
            }
            
            .crystal-icon {
                width: 24px;
                height: 24px;
            }
            
            .shop-content {
                flex: 1;
                overflow-y: auto;
                padding: 20px;
            }
            
            .shop-section {
                display: none;
            }
            
            .shop-section.active {
                display: block;
            }
            
            .shop-items {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 20px;
                margin-top: 20px;
            }
            
            .shop-item {
                background: #16213e;
                border: 2px solid #0f4c75;
                border-radius: 10px;
                padding: 20px;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s;
                position: relative;
            }
            
            .shop-item:hover {
                border-color: #3282b8;
                transform: translateY(-5px);
            }
            
            .shop-item.popular {
                border-color: #f39c12;
            }
            
            .popular-badge {
                position: absolute;
                top: -10px;
                right: 10px;
                background: #f39c12;
                color: black;
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 12px;
                font-weight: bold;
            }
            
            .shop-item img {
                width: 80px;
                height: 80px;
                object-fit: contain;
            }
            
            .shop-item h4 {
                margin: 10px 0;
            }
            
            .shop-item ul {
                list-style: none;
                padding: 0;
                margin: 10px 0;
                text-align: left;
                font-size: 14px;
            }
            
            .shop-item ul li {
                padding: 2px 0;
            }
            
            .price {
                font-size: 24px;
                color: #3282b8;
                font-weight: bold;
                margin-top: 10px;
            }
            
            .crystal-price {
                font-size: 20px;
                color: #e74c3c;
                font-weight: bold;
                margin-top: 10px;
            }
            
            .bonus {
                color: #2ecc71;
                font-weight: bold;
            }
            
            .payment-modal {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .payment-modal.hidden {
                display: none;
            }
            
            .payment-content {
                background: #1a1a2e;
                padding: 30px;
                border-radius: 10px;
                min-width: 400px;
            }
            
            #card-element {
                background: white;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
            }
            
            #payment-errors {
                color: #e74c3c;
                margin: 10px 0;
            }
            
            .btn-primary, .btn-secondary {
                padding: 10px 20px;
                margin: 5px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            }
            
            .btn-primary {
                background: #3282b8;
                color: white;
            }
            
            .btn-secondary {
                background: #7f8c8d;
                color: white;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Show shop
    function open() {
        document.getElementById('shop-container').classList.remove('shop-hidden');
    }
    
    // Hide shop
    function close() {
        document.getElementById('shop-container').classList.add('shop-hidden');
    }
    
    // Show specific tab
    function showTab(tabName) {
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
    }
    
    // Load user's crystal balance
    async function loadUserBalance() {
        try {
            const response = await fetch(`/api/user/${userId}/balance`);
            const data = await response.json();
            document.getElementById('crystal-balance').textContent = data.crystals || 0;
        } catch (error) {
            console.error('Failed to load balance:', error);
        }
    }
    
    // Purchase premium race
    async function purchaseRace(productId) {
        await processPurchase(productId, 'race');
    }
    
    // Purchase crystals
    async function purchaseCrystals(productId) {
        await processPurchase(productId, 'crystals');
    }
    
    // Purchase VIP membership
    async function purchaseVIP(productId) {
        await processPurchase(productId, 'subscription');
    }
    
    // Purchase booster
    async function purchaseBooster(productId) {
        await processPurchase(productId, 'booster');
    }
    
    // Purchase cosmetic
    async function purchaseCosmetic(productId) {
        await processPurchase(productId, 'cosmetic');
    }
    
    // Purchase battle pass
    async function purchaseBattlePass() {
        await processPurchase('battle_pass', 'battle_pass');
    }
    
    // Process purchase with Stripe
    async function processPurchase(productId, type) {
        if (!stripe) {
            alert('Payment system not available. Please try again later.');
            return;
        }
        
        try {
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
            
            const data = await response.json();
            
            if (data.error) {
                alert('Error: ' + data.error);
                return;
            }
            
            // Show payment modal
            showPaymentModal(productId, data);
            
        } catch (error) {
            console.error('Purchase error:', error);
            alert('Failed to process purchase. Please try again.');
        }
    }
    
    // Show payment modal
    function showPaymentModal(productId, paymentData) {
        const modal = document.getElementById('payment-modal');
        const details = document.getElementById('payment-details');
        
        details.innerHTML = `
            <p>Product: ${productId}</p>
            <p>Amount: $${(paymentData.amount / 100).toFixed(2)} ${paymentData.currency.toUpperCase()}</p>
        `;
        
        modal.classList.remove('hidden');
        
        // Create card element
        if (!elements) {
            elements = stripe.elements();
            const cardElement = elements.create('card');
            cardElement.mount('#card-element');
            
            // Handle form submission
            document.getElementById('submit-payment').onclick = async () => {
                const {error} = await stripe.confirmCardPayment(paymentData.clientSecret, {
                    payment_method: {
                        card: cardElement
                    }
                });
                
                if (error) {
                    document.getElementById('payment-errors').textContent = error.message;
                } else {
                    // Payment successful
                    alert('Payment successful!');
                    closePayment();
                    loadUserBalance();
                }
            };
        }
    }
    
    // Close payment modal
    function closePayment() {
        document.getElementById('payment-modal').classList.add('hidden');
    }
    
    // Spend crystals
    async function spendCrystals(itemId) {
        try {
            const response = await fetch('/api/payment/spend-crystals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    itemId: itemId
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                alert('Error: ' + data.error);
            } else {
                alert('Purchase successful!');
                document.getElementById('crystal-balance').textContent = data.newBalance;
            }
            
        } catch (error) {
            console.error('Crystal spending error:', error);
            alert('Failed to complete purchase.');
        }
    }
    
    return {
        initialize,
        open,
        close,
        showTab,
        purchaseRace,
        purchaseCrystals,
        purchaseVIP,
        purchaseBooster,
        purchaseCosmetic,
        purchaseBattlePass,
        spendCrystals,
        closePayment
    };
})();

// Export for use
window.Shop = Shop;