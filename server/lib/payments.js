/**
 * lib/payments.js - Stripe payment integration
 *
 * Handles all payment processing, premium purchases, and monetization features.
 * Integrates with Stripe for secure payment processing.
 */

// Initialize Stripe with secret key from environment
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const crypto = require('crypto');

// Warn if Stripe is not configured
if (!stripe) {
    console.warn('WARNING: Stripe not configured. Set STRIPE_SECRET_KEY in environment.');
}

// Product definitions
const PRODUCTS = {
    // Premium Races
    RACE_QUANTUM: {
        id: 'race_quantum',
        name: 'Quantum Entities Race',
        price: 499, // $4.99 in cents
        currency: 'usd',
        type: 'one_time',
        category: 'race',
        raceId: 10
    },
    RACE_TITAN: {
        id: 'race_titan',
        name: 'Titan Lords Race',
        price: 499,
        currency: 'usd',
        type: 'one_time',
        category: 'race',
        raceId: 11
    },
    RACE_SHADOW: {
        id: 'race_shadow',
        name: 'Shadow Realm Race',
        price: 499,
        currency: 'usd',
        type: 'one_time',
        category: 'race',
        raceId: 12
    },

    // Premium Currency Packs
    CRYSTALS_500: {
        id: 'crystals_500',
        name: '500 Premium Crystals',
        price: 499,
        currency: 'usd',
        type: 'currency',
        amount: 500
    },
    CRYSTALS_1200: {
        id: 'crystals_1200',
        name: '1200 Premium Crystals',
        price: 999,
        currency: 'usd',
        type: 'currency',
        amount: 1200,
        bonus: 200
    },
    CRYSTALS_2500: {
        id: 'crystals_2500',
        name: '2500 Premium Crystals',
        price: 1999,
        currency: 'usd',
        type: 'currency',
        amount: 2500,
        bonus: 500
    },
    CRYSTALS_6500: {
        id: 'crystals_6500',
        name: '6500 Premium Crystals',
        price: 4999,
        currency: 'usd',
        type: 'currency',
        amount: 6500,
        bonus: 1500
    },

    // VIP Memberships
    VIP_BRONZE: {
        id: 'vip_bronze',
        name: 'Bronze VIP (30 days)',
        price: 499,
        currency: 'usd',
        type: 'subscription',
        interval: 'month',
        benefits: {
            resourceBonus: 0.1,
            crystalsDaily: 10,
            queueSlots: 1,
            customAvatar: true
        }
    },
    VIP_SILVER: {
        id: 'vip_silver',
        name: 'Silver VIP (30 days)',
        price: 999,
        currency: 'usd',
        type: 'subscription',
        interval: 'month',
        benefits: {
            resourceBonus: 0.2,
            crystalsDaily: 25,
            queueSlots: 2,
            customAvatar: true,
            exclusiveSkins: true,
            priorityQueue: true
        }
    },
    VIP_GOLD: {
        id: 'vip_gold',
        name: 'Gold VIP (30 days)',
        price: 1999,
        currency: 'usd',
        type: 'subscription',
        interval: 'month',
        benefits: {
            resourceBonus: 0.3,
            crystalsDaily: 50,
            queueSlots: 3,
            customAvatar: true,
            exclusiveSkins: true,
            priorityQueue: true,
            betaAccess: true,
            vipChat: true
        }
    },

    // Booster Packs
    BOOSTER_RESOURCE: {
        id: 'booster_resource',
        name: 'Resource Booster (7 days)',
        price: 299,
        currency: 'usd',
        type: 'booster',
        duration: 7,
        effect: 'resource_2x'
    },
    BOOSTER_RESEARCH: {
        id: 'booster_research',
        name: 'Research Booster (7 days)',
        price: 299,
        currency: 'usd',
        type: 'booster',
        duration: 7,
        effect: 'research_2x'
    },
    BOOSTER_BUILD: {
        id: 'booster_build',
        name: 'Speed Build (3 days)',
        price: 199,
        currency: 'usd',
        type: 'booster',
        duration: 3,
        effect: 'build_speed_2x'
    },

    // Battle Pass
    BATTLE_PASS: {
        id: 'battle_pass',
        name: 'Galactic Battle Pass',
        price: 999,
        currency: 'usd',
        type: 'battle_pass',
        season: 1,
        rewards: 50
    },

    // Cosmetics
    SKIN_PACK_NEON: {
        id: 'skin_pack_neon',
        name: 'Neon Ship Skins Pack',
        price: 699,
        currency: 'usd',
        type: 'cosmetic',
        items: ['neon_blue', 'neon_pink', 'neon_green']
    },
    AVATAR_PACK_LEGENDARY: {
        id: 'avatar_pack_legendary',
        name: 'Legendary Avatars Pack',
        price: 499,
        currency: 'usd',
        type: 'cosmetic',
        items: ['avatar_dragon', 'avatar_phoenix', 'avatar_titan']
    },
    COSMETIC_EMPIRE_THEME: {
        id: 'cosmetic_empire_theme',
        name: 'Empire Theme Pack',
        price: 399,
        currency: 'usd',
        type: 'cosmetic',
        items: ['empire_theme_pack', 'empire_banner', 'empire_chat_flair']
    },
    COSMETIC_FLEET_TRAILS: {
        id: 'cosmetic_fleet_trails',
        name: 'Fleet Engine Trails',
        price: 249,
        currency: 'usd',
        type: 'cosmetic',
        items: ['fleet_trails_prismatic', 'warp_animation_prismatic']
    },
    COSMETIC_VOICE_PACK: {
        id: 'cosmetic_voice_pack',
        name: 'AI Advisor Voice Pack',
        price: 199,
        currency: 'usd',
        type: 'cosmetic',
        items: ['advisor_voice_pack']
    }
};

const PURCHASABLE_PRODUCT_IDS = new Set([
    'race_quantum',
    'race_titan',
    'race_shadow',
    'skin_pack_neon',
    'avatar_pack_legendary',
    'cosmetic_empire_theme',
    'cosmetic_fleet_trails',
    'cosmetic_voice_pack'
]);

// Premium currency exchange rates
const CRYSTAL_SHOP = {
    RACE_UNLOCK: {
        id: 'crystal_race_unlock',
        name: 'Unlock Any Race',
        cost: 1000,
        type: 'race_unlock'
    },
    INSTANT_BUILD: {
        id: 'crystal_instant_build',
        name: 'Instant Building Complete',
        cost: 50,
        type: 'instant'
    },
    INSTANT_RESEARCH: {
        id: 'crystal_instant_research',
        name: 'Instant Research Complete',
        cost: 100,
        type: 'instant'
    },
    RESOURCE_PACK_SMALL: {
        id: 'crystal_resources_small',
        name: 'Small Resource Pack',
        cost: 200,
        type: 'resources',
        metal: 5000,
        crystal: 5000,
        research: 2500
    },
    RESOURCE_PACK_LARGE: {
        id: 'crystal_resources_large',
        name: 'Large Resource Pack',
        cost: 800,
        type: 'resources',
        metal: 25000,
        crystal: 25000,
        research: 12500
    },
    EXTRA_FLEET_SLOT: {
        id: 'crystal_fleet_slot',
        name: 'Extra Fleet Slot',
        cost: 500,
        type: 'permanent'
    },
    NAME_CHANGE: {
        id: 'crystal_name_change',
        name: 'Change Username',
        cost: 300,
        type: 'service'
    }
};

class PaymentManager {
    constructor(db) {
        this.db = db;
        this.ensureSchema();
    }

    ensureSchema() {
        if (!this.db || this.db.isOffline || this.db.isMock || typeof this.db.query !== 'function') {
            return;
        }

        const statements = [
            `CREATE TABLE IF NOT EXISTS premium_purchases (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                race_id INT DEFAULT NULL,
                product_id VARCHAR(64) DEFAULT NULL,
                amount INT DEFAULT 0,
                stripe_payment_id VARCHAR(255) DEFAULT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_race (user_id, race_id),
                INDEX idx_premium_user (user_id)
            )`,
            `CREATE TABLE IF NOT EXISTS payment_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id VARCHAR(64) NOT NULL,
                stripe_id VARCHAR(255) NOT NULL,
                amount INT NOT NULL DEFAULT 0,
                currency VARCHAR(8) NOT NULL DEFAULT 'usd',
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_stripe_id (stripe_id),
                INDEX idx_payment_user (user_id)
            )`,
            `CREATE TABLE IF NOT EXISTS user_currencies (
                user_id INT PRIMARY KEY,
                premium_crystals INT NOT NULL DEFAULT 0
            )`,
            `CREATE TABLE IF NOT EXISTS user_cosmetics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                item_id VARCHAR(64) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_cosmetic (user_id, item_id)
            )`,
            `CREATE TABLE IF NOT EXISTS payment_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id VARCHAR(64) NOT NULL,
                status VARCHAR(32) NOT NULL,
                details TEXT,
                ip_address VARCHAR(64),
                user_agent VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        statements.forEach(statement => {
            this.db.query(statement, err => {
                if (err) {
                    console.warn('Unable to ensure payment table:', err.message || err);
                }
            });
        });

        this.ensureColumns('premium_purchases', [
            { name: 'product_id', sql: 'ALTER TABLE premium_purchases ADD COLUMN product_id VARCHAR(64) DEFAULT NULL' },
            { name: 'amount', sql: 'ALTER TABLE premium_purchases ADD COLUMN amount INT DEFAULT 0' },
            { name: 'stripe_payment_id', sql: 'ALTER TABLE premium_purchases ADD COLUMN stripe_payment_id VARCHAR(255) DEFAULT NULL' },
            { name: 'created_at', sql: 'ALTER TABLE premium_purchases ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
        ]);

        [
            'ALTER TABLE premium_purchases MODIFY race_id INT DEFAULT NULL',
            'ALTER TABLE premium_purchases MODIFY amount INT DEFAULT 0'
        ].forEach(statement => {
            this.db.query(statement, err => {
                if (err) {
                    console.warn('Unable to modernize premium_purchases column:', err.message || err);
                }
            });
        });
    }

    ensureColumns(table, columns) {
        const ensureNext = index => {
            if (index >= columns.length) {
                return;
            }

            const column = columns[index];
            this.db.query(`SHOW COLUMNS FROM ${table} LIKE '${column.name}'`, (showErr, rows) => {
                if (showErr) {
                    console.warn(`Unable to verify ${table}.${column.name} column:`, showErr.message || showErr);
                    ensureNext(index + 1);
                    return;
                }

                if (Array.isArray(rows) && rows.length > 0) {
                    ensureNext(index + 1);
                    return;
                }

                this.db.query(column.sql, alterErr => {
                    if (alterErr && alterErr.code !== 'ER_DUP_FIELDNAME') {
                        console.warn(`Unable to ensure ${table}.${column.name} column:`, alterErr.message || alterErr);
                    }
                    ensureNext(index + 1);
                });
            });
        };

        ensureNext(0);
    }

    // Create Stripe payment intent
    async createPaymentIntent(userId, productId, metadata = {}) {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }

        const product = this.getProduct(productId);
        if (!product) {
            throw new Error('Invalid product');
        }

        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: product.price,
                currency: product.currency,
                metadata: {
                    userId,
                    productId,
                    productName: product.name,
                    ...metadata
                }
            });

            // Record pending transaction
            await this.recordTransaction(userId, productId, paymentIntent.id, 'pending');

            return {
                clientSecret: paymentIntent.client_secret,
                amount: product.price,
                currency: product.currency
            };
        } catch (error) {
            console.error('Stripe error:', error);
            throw new Error('Payment processing failed');
        }
    }

    // Create subscription
    async createSubscription(userId, productId, paymentMethodId) {
        throw new Error('Subscriptions are disabled. Premium purchases are limited to races and cosmetics.');
        /*
        const product = this.getProduct(productId);
        if (!product || product.type !== 'subscription') {
            throw new Error('Invalid subscription product');
        }

        try {
            // Get or create Stripe customer
            const customerId = await this.getOrCreateCustomer(userId);

            // Attach payment method
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: customerId
            });

            // Set as default payment method
            await stripe.customers.update(customerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId
                }
            });

            // Create subscription
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: await this.getOrCreatePrice(product) }],
                metadata: {
                    userId,
                    productId
                }
            });

            // Record subscription
            await this.recordSubscription(userId, productId, subscription.id);

            return {
                subscriptionId: subscription.id,
                status: subscription.status
            };
        } catch (error) {
            console.error('Subscription error:', error);
            throw new Error('Subscription creation failed');
        }
        */
    }

    // Handle webhook from Stripe
    async handleWebhook(rawBody, signature) {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }

        let event;

        try {
            event = stripe.webhooks.constructEvent(
                rawBody,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            console.error('Webhook signature verification failed:', err);
            throw new Error('Invalid webhook signature');
        }

        // Handle the event
        switch (event.type) {
            case 'payment_intent.succeeded':
                await this.handlePaymentSuccess(event.data.object);
                break;

            case 'payment_intent.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdate(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await this.handleSubscriptionCanceled(event.data.object);
                break;

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    }

    // Handle successful payment
    async handlePaymentSuccess(paymentIntent) {
        const { userId, productId } = paymentIntent.metadata;
        const existing = await this.getTransactionByStripeId(paymentIntent.id);
        if (existing && existing.status === 'completed') {
            return {
                success: true,
                alreadyCompleted: true,
                productId
            };
        }

        // Grant the purchase
        await this.grantPurchase(userId, productId, {
            stripeId: paymentIntent.id,
            amount: paymentIntent.amount_received || paymentIntent.amount,
            productName: paymentIntent.metadata.productName
        });

        // Mark complete only after ownership has been granted.
        await this.updateTransactionStatus(paymentIntent.id, 'completed');

        // Send confirmation
        this.notifyUser(userId, `Purchase successful: ${paymentIntent.metadata.productName}`);

        return {
            success: true,
            alreadyCompleted: false,
            productId
        };
    }

    // Handle failed payment
    async handlePaymentFailed(paymentIntent) {
        const { userId } = paymentIntent.metadata;

        // Update transaction status
        await this.updateTransactionStatus(paymentIntent.id, 'failed');

        // Notify user
        this.notifyUser(userId, 'Payment failed. Please try again.');
    }

    async confirmTestPayment(userId, paymentIntentId) {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }
        if (!this.isTestConfirmationAllowed()) {
            throw new Error('Client payment confirmation is only available for Stripe test mode');
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (!paymentIntent || paymentIntent.status !== 'succeeded') {
            throw new Error('Payment has not succeeded');
        }

        const metadataUserId = paymentIntent.metadata && paymentIntent.metadata.userId;
        if (String(metadataUserId) !== String(userId)) {
            throw new Error('Payment does not belong to this user');
        }

        return this.handlePaymentSuccess(paymentIntent);
    }

    isTestConfirmationAllowed() {
        const secretKey = String(process.env.STRIPE_SECRET_KEY || '');
        return secretKey.startsWith('sk_test_') ||
            /^(true|1|yes)$/i.test((process.env.ALLOW_STRIPE_TEST_CONFIRM || '').trim()) ||
            process.env.NODE_ENV !== 'production';
    }

    // Grant purchase to user
    async grantPurchase(userId, productId, context = {}) {
        const product = this.getProduct(productId);
        if (!product) return;

        switch (product.type) {
            case 'one_time':
                if (product.category === 'race') {
                    await this.unlockRace(userId, product.raceId, {
                        ...context,
                        productId
                    });
                }
                break;

            case 'cosmetic':
                await this.unlockCosmetics(userId, product.items);
                await this.recordPremiumPurchase(userId, {
                    productId,
                    amount: context.amount || product.price,
                    stripeId: context.stripeId || null
                });
                break;

            default:
                throw new Error('Only race unlocks and cosmetics are purchasable');
        }
    }

    // Database operations
    async recordTransaction(userId, productId, stripeId, status) {
        return new Promise((resolve, reject) => {
            const product = this.getProduct(productId);
            this.db.query(
                `INSERT INTO payment_transactions
                 (user_id, product_id, stripe_id, amount, currency, status)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    userId,
                    productId,
                    stripeId,
                    product.price,
                    product.currency,
                    status
                ],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result.insertId || result.affectedRows || 0);
                }
            );
        });
    }

    async getTransactionByStripeId(stripeId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                'SELECT * FROM payment_transactions WHERE stripe_id = ? LIMIT 1',
                [stripeId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results && results[0] ? results[0] : null);
                }
            );
        });
    }

    async updateTransactionStatus(stripeId, status) {
        return new Promise((resolve, reject) => {
            this.db.query(
                'UPDATE payment_transactions SET status = ? WHERE stripe_id = ?',
                [status, stripeId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async unlockRace(userId, raceId, context = {}) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `INSERT INTO premium_purchases
                 (user_id, race_id, product_id, amount, stripe_payment_id, status)
                 VALUES (?, ?, ?, ?, ?, 'completed')
                 ON DUPLICATE KEY UPDATE
                    product_id = VALUES(product_id),
                    amount = VALUES(amount),
                    stripe_payment_id = VALUES(stripe_payment_id),
                    status = 'completed'`,
                [userId, raceId, context.productId || null, context.amount || 0, context.stripeId || null],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async recordPremiumPurchase(userId, context = {}) {
        return new Promise((resolve, reject) => {
            const insertPurchase = () => {
                this.db.query(
                    `INSERT INTO premium_purchases
                     (user_id, race_id, product_id, amount, stripe_payment_id, status)
                     VALUES (?, NULL, ?, ?, ?, 'completed')`,
                    [userId, context.productId || null, context.amount || 0, context.stripeId || null],
                    (err, result) => {
                        if (err) reject(err);
                        else resolve(result.insertId);
                    }
                );
            };

            if (!context.stripeId) {
                insertPurchase();
                return;
            }

            this.db.query(
                'SELECT id FROM premium_purchases WHERE stripe_payment_id = ? LIMIT 1',
                [context.stripeId],
                (err, results) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    if (Array.isArray(results) && results.length > 0) {
                        resolve(results[0].id);
                        return;
                    }
                    insertPurchase();
                }
            );
        });
    }

    async addPremiumCurrency(userId, amount) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `INSERT INTO user_currencies (user_id, premium_crystals)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE premium_crystals = premium_crystals + ?`,
                [userId, amount, amount],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async activateBooster(userId, effect, duration) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + duration);

        return new Promise((resolve, reject) => {
            this.db.query(
                `INSERT INTO user_boosters (user_id, effect, expires_at) VALUES (?, ?, ?)`,
                [userId, effect, expiresAt],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async activateBattlePass(userId, season) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `INSERT INTO battle_pass_ownership (user_id, season, level, xp)
                 VALUES (?, ?, 1, 0)`,
                [userId, season],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async unlockCosmetics(userId, items) {
        const promises = items.map(item => {
            return new Promise((resolve, reject) => {
                this.db.query(
                    `INSERT IGNORE INTO user_cosmetics (user_id, item_id) VALUES (?, ?)`,
                    [userId, item],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        });

        return Promise.all(promises);
    }

    // Get or create Stripe customer
    async getOrCreateCustomer(userId) {
        // Check if customer exists
        const existing = await this.getStripeCustomerId(userId);
        if (existing) return existing;

        // Get user details
        const user = await this.getUserDetails(userId);

        // Create customer
        const customer = await stripe.customers.create({
            email: user.email,
            metadata: { userId }
        });

        // Save customer ID
        await this.saveStripeCustomerId(userId, customer.id);

        return customer.id;
    }

    // Helper methods
    getProduct(productId) {
        if (!PURCHASABLE_PRODUCT_IDS.has(productId)) {
            return null;
        }
        return Object.values(PRODUCTS).find(p => p.id === productId) || null;
    }

    async getOrCreatePrice(product) {
        // In production, you'd create these in Stripe dashboard
        // This is a simplified version
        const price = await stripe.prices.create({
            unit_amount: product.price,
            currency: product.currency,
            recurring: product.interval ? { interval: product.interval } : undefined,
            product_data: {
                name: product.name
            }
        });

        return price.id;
    }

    notifyUser(userId, message) {
        // Send notification through websocket
        const connection = global.gameState?.clientMap?.[userId];
        if (connection) {
            connection.sendUTF(`notification::${message}`);
        }
    }

    // Premium currency spending
    async spendCrystals(userId, itemId) {
        throw new Error('Crystal spending is disabled. Premium purchases are limited to races and cosmetics.');
        /*
        const item = CRYSTAL_SHOP[itemId];
        if (!item) throw new Error('Invalid item');

        // Check balance
        const balance = await this.getCrystalBalance(userId);
        if (balance < item.cost) {
            throw new Error('Insufficient crystals');
        }

        // Deduct crystals
        await this.deductCrystals(userId, item.cost);

        // Grant item
        switch (item.type) {
            case 'race_unlock':
                // Allow unlocking any locked race
                break;
            case 'instant':
                // Grant instant completion
                break;
            case 'resources':
                await this.grantResources(userId, item);
                break;
            case 'permanent':
                await this.grantPermanentUpgrade(userId, item.id);
                break;
            case 'service':
                // Handle service requests
                break;
        }

        return { success: true, newBalance: balance - item.cost };
        */
    }

    async getCrystalBalance(userId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                'SELECT premium_crystals FROM user_currencies WHERE user_id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]?.premium_crystals || 0);
                }
            );
        });
    }

    async deductCrystals(userId, amount) {
        return new Promise((resolve, reject) => {
            this.db.query(
                'UPDATE user_currencies SET premium_crystals = premium_crystals - ? WHERE user_id = ? AND premium_crystals >= ?',
                [amount, userId, amount],
                (err, result) => {
                    if (err || result.affectedRows === 0) {
                        reject(new Error('Insufficient crystals'));
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async recordSubscription(userId, productId, stripeId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `INSERT INTO payment_transactions
                 (user_id, product_id, stripe_id, amount, currency, status)
                 VALUES (?, ?, ?, ?, ?, 'active')`,
                [
                    userId,
                    productId,
                    stripeId,
                    this.getProduct(productId).price,
                    this.getProduct(productId).currency
                ],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result.insertId);
                }
            );
        });
    }

    async getStripeCustomerId(userId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                'SELECT stripe_customer_id FROM users WHERE id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]?.stripe_customer_id || null);
                }
            );
        });
    }

    async getUserDetails(userId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                'SELECT * FROM users WHERE id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else if (results.length === 0) reject(new Error('User not found'));
                    else resolve(results[0]);
                }
            );
        });
    }

    async saveStripeCustomerId(userId, customerId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                'UPDATE users SET stripe_customer_id = ? WHERE id = ?',
                [customerId, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async grantResources(userId, item) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `UPDATE players SET
                 metal = metal + ?,
                 crystal = crystal + ?,
                 research = research + ?
                 WHERE userid = ?`,
                [item.metal || 0, item.crystal || 0, item.research || 0, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async grantPermanentUpgrade(userId, upgradeId) {
        // This would track permanent upgrades like extra fleet slots
        // For now, placeholder implementation
        return Promise.resolve();
    }

    // Spend crystals with connection (for transaction safety)
    async spendCrystalsWithConnection(userId, itemId, connection) {
        throw new Error('Crystal spending is disabled. Premium purchases are limited to races and cosmetics.');
        /*
        const item = CRYSTAL_SHOP[itemId];
        if (!item) throw new Error('Invalid item');

        // Check balance
        const balance = await this.getCrystalBalanceWithConnection(userId, connection);
        if (balance < item.cost) {
            throw new Error('Insufficient crystals');
        }

        // Deduct crystals
        await this.deductCrystalsWithConnection(userId, item.cost, connection);

        // Grant item
        switch (item.type) {
            case 'race_unlock':
                // Allow unlocking any locked race
                break;
            case 'instant':
                // Grant instant completion
                break;
            case 'resources':
                await this.grantResourcesWithConnection(userId, item, connection);
                break;
            case 'permanent':
                await this.grantPermanentUpgrade(userId, item.id);
                break;
            case 'service':
                // Handle service requests
                break;
        }

        // Log transaction
        await this.logCrystalTransaction(userId, -item.cost, balance - item.cost, 'purchase', itemId, connection);

        return { success: true, newBalance: balance - item.cost };
        */
    }

    async getCrystalBalanceWithConnection(userId, connection) {
        return new Promise((resolve, reject) => {
            connection.query(
                'SELECT premium_crystals FROM user_currencies WHERE user_id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0]?.premium_crystals || 0);
                }
            );
        });
    }

    async deductCrystalsWithConnection(userId, amount, connection) {
        return new Promise((resolve, reject) => {
            connection.query(
                'UPDATE user_currencies SET premium_crystals = premium_crystals - ? WHERE user_id = ? AND premium_crystals >= ?',
                [amount, userId, amount],
                (err, result) => {
                    if (err || result.affectedRows === 0) {
                        reject(new Error('Insufficient crystals'));
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    async grantResourcesWithConnection(userId, item, connection) {
        return new Promise((resolve, reject) => {
            connection.query(
                `UPDATE players SET
                 metal = metal + ?,
                 crystal = crystal + ?,
                 research = research + ?
                 WHERE userid = ?`,
                [item.metal || 0, item.crystal || 0, item.research || 0, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async logCrystalTransaction(userId, amount, balanceAfter, type, reference, connection) {
        return new Promise((resolve, reject) => {
            connection.query(
                `INSERT INTO crystal_transactions
                 (user_id, amount, balance_after, transaction_type, reference_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, amount, balanceAfter, type, reference],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
}

module.exports = {
    PaymentManager,
    PRODUCTS,
    CRYSTAL_SHOP
};
