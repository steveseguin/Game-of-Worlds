/**
 * payment-endpoints.js - Server API endpoints for payments
 * 
 * Implements all payment-related API endpoints with proper
 * validation, error handling, and security measures.
 */

const PaymentValidator = require('./payment-validator');

class PaymentEndpoints {
    constructor(paymentManager, db) {
        this.paymentManager = paymentManager;
        this.validator = new PaymentValidator(db);
        this.db = db;
    }
    
    // Create payment intent endpoint
    async handleCreateIntent(request, response) {
        let body = '';
        request.on('data', chunk => {
            body += chunk.toString();
        });
        
        request.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { userId, productId, metadata } = data;
                
                // Get IP and user agent for security
                const ipAddress = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
                const userAgent = request.headers['user-agent'];
                
                // Validate request
                const validation = await this.validator.validatePaymentRequest(userId, productId, metadata);
                if (!validation.valid) {
                    response.writeHead(400, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({
                        error: validation.errors.join('. '),
                        code: 'VALIDATION_ERROR'
                    }));
                    return;
                }
                
                // Log payment attempt
                await this.validator.logPaymentAttempt(userId, productId, 'initiated', {
                    ipAddress,
                    userAgent,
                    metadata
                });
                
                // Create idempotency key
                const idempotencyKey = this.validator.generateIdempotencyKey(
                    userId, 
                    productId, 
                    Date.now()
                );
                
                // Create payment intent with idempotency
                const result = await this.paymentManager.createPaymentIntent(
                    userId, 
                    productId, 
                    {
                        ...metadata,
                        ipAddress,
                        userAgent,
                        idempotencyKey
                    }
                );
                
                response.writeHead(200, {
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': idempotencyKey
                });
                response.end(JSON.stringify(result));
                
            } catch (error) {
                console.error('Payment intent error:', error);
                
                // Determine error type and response
                let statusCode = 500;
                let errorResponse = {
                    error: 'Payment processing failed',
                    code: 'INTERNAL_ERROR'
                };
                
                if (error.message.includes('rate limit')) {
                    statusCode = 429;
                    errorResponse = {
                        error: 'Too many requests. Please try again later.',
                        code: 'RATE_LIMIT',
                        retryAfter: 300
                    };
                } else if (error.message.includes('Invalid')) {
                    statusCode = 400;
                    errorResponse = {
                        error: error.message,
                        code: 'INVALID_REQUEST'
                    };
                }
                
                response.writeHead(statusCode, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(errorResponse));
            }
        });
    }
    
    // Handle subscription creation
    async handleCreateSubscription(request, response) {
        let body = '';
        request.on('data', chunk => {
            body += chunk.toString();
        });
        
        request.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { userId, productId, paymentMethodId } = data;
                
                // Additional validation for subscriptions
                const existingSubscription = await this.checkExistingSubscription(userId, productId);
                if (existingSubscription) {
                    response.writeHead(400, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({
                        error: 'You already have an active subscription of this type',
                        code: 'DUPLICATE_SUBSCRIPTION'
                    }));
                    return;
                }
                
                // Create subscription
                const result = await this.paymentManager.createSubscription(
                    userId,
                    productId,
                    paymentMethodId
                );
                
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(result));
                
            } catch (error) {
                console.error('Subscription error:', error);
                response.writeHead(500, {'Content-Type': 'application/json'});
                response.end(JSON.stringify({
                    error: error.message,
                    code: 'SUBSCRIPTION_ERROR'
                }));
            }
        });
    }
    
    // Handle Stripe webhooks with enhanced security
    async handleWebhook(request, response) {
        let rawBody = '';
        
        // Collect raw body for signature verification
        request.on('data', chunk => {
            rawBody += chunk.toString('utf8');
        });
        
        request.on('end', async () => {
            try {
                const signature = request.headers['stripe-signature'];
                
                if (!signature) {
                    response.writeHead(400, {'Content-Type': 'application/json'});
                    response.end(JSON.stringify({error: 'Missing stripe signature'}));
                    return;
                }
                
                // Process webhook
                await this.paymentManager.handleWebhook(rawBody, signature);
                
                // Always return 200 to acknowledge receipt
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify({received: true}));
                
            } catch (error) {
                console.error('Webhook error:', error);
                
                // Still return 200 to prevent retries for signature failures
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify({
                    received: false,
                    error: error.message
                }));
            }
        });
    }
    
    // Handle crystal spending with transaction safety
    async handleSpendCrystals(request, response) {
        let body = '';
        request.on('data', chunk => {
            body += chunk.toString();
        });
        
        request.on('end', async () => {
            const connection = await this.getDbConnection();
            
            try {
                const data = JSON.parse(body);
                const { userId, itemId } = data;
                
                // Start transaction
                await this.beginTransaction(connection);
                
                // Use connection for all operations
                const result = await this.paymentManager.spendCrystalsWithConnection(
                    userId,
                    itemId,
                    connection
                );
                
                // Commit transaction
                await this.commitTransaction(connection);
                
                response.writeHead(200, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(result));
                
            } catch (error) {
                // Rollback on error
                await this.rollbackTransaction(connection);
                
                console.error('Crystal spending error:', error);
                
                let statusCode = 400;
                let errorResponse = {
                    error: error.message,
                    code: 'SPENDING_ERROR'
                };
                
                if (error.message.includes('Insufficient')) {
                    errorResponse.code = 'INSUFFICIENT_BALANCE';
                }
                
                response.writeHead(statusCode, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(errorResponse));
                
            } finally {
                connection.release();
            }
        });
    }
    
    // Get user balance
    async handleGetBalance(request, response, userId) {
        try {
            const balance = await this.paymentManager.getCrystalBalance(userId);
            
            // Also get VIP status and active boosters
            const [vipStatus, activeBoosters] = await Promise.all([
                this.getVIPStatus(userId),
                this.getActiveBoosters(userId)
            ]);
            
            response.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            });
            response.end(JSON.stringify({
                crystals: balance,
                vip: vipStatus,
                boosters: activeBoosters
            }));
            
        } catch (error) {
            console.error('Balance query error:', error);
            response.writeHead(500, {'Content-Type': 'application/json'});
            response.end(JSON.stringify({
                error: 'Failed to get balance',
                code: 'BALANCE_ERROR'
            }));
        }
    }
    
    // Get owned items
    async handleGetOwnedItems(request, response, userId) {
        try {
            const items = await this.getOwnedItems(userId);
            
            response.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'max-age=300' // Cache for 5 minutes
            });
            response.end(JSON.stringify({ items }));
            
        } catch (error) {
            console.error('Owned items error:', error);
            response.writeHead(500, {'Content-Type': 'application/json'});
            response.end(JSON.stringify({
                error: 'Failed to get owned items',
                code: 'OWNED_ITEMS_ERROR'
            }));
        }
    }
    
    // Get purchase history
    async handleGetPurchaseHistory(request, response, userId) {
        try {
            const history = await this.getPurchaseHistory(userId);
            
            response.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'private, max-age=60'
            });
            response.end(JSON.stringify({ history }));
            
        } catch (error) {
            console.error('Purchase history error:', error);
            response.writeHead(500, {'Content-Type': 'application/json'});
            response.end(JSON.stringify({
                error: 'Failed to get purchase history',
                code: 'HISTORY_ERROR'
            }));
        }
    }
    
    // Helper methods
    async checkExistingSubscription(userId, productId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT id FROM payment_transactions 
                 WHERE user_id = ? AND product_id = ? 
                 AND status = 'active' AND type = 'subscription'`,
                [userId, productId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results && results.length > 0);
                }
            );
        });
    }
    
    async getVIPStatus(userId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT tier, end_date FROM vip_memberships 
                 WHERE user_id = ? AND end_date > NOW() 
                 ORDER BY end_date DESC LIMIT 1`,
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0] || null);
                }
            );
        });
    }
    
    async getActiveBoosters(userId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT effect, expires_at FROM user_boosters 
                 WHERE user_id = ? AND expires_at > NOW()`,
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    async getOwnedItems(userId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT DISTINCT product_id FROM premium_purchases 
                 WHERE user_id = ? AND status = 'completed'
                 UNION
                 SELECT CONCAT('race_', race_id) as product_id 
                 FROM premium_purchases 
                 WHERE user_id = ? AND status = 'completed'`,
                [userId, userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results ? results.map(r => r.product_id) : []);
                }
            );
        });
    }
    
    async getPurchaseHistory(userId, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT 
                    pt.product_id,
                    pt.amount,
                    pt.currency,
                    pt.status,
                    pt.created_at as date,
                    COALESCE(pp.name, pt.product_id) as productName
                 FROM payment_transactions pt
                 LEFT JOIN product_catalog pp ON pt.product_id = pp.id
                 WHERE pt.user_id = ?
                 ORDER BY pt.created_at DESC
                 LIMIT ?`,
                [userId, limit],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    // Database transaction helpers
    async getDbConnection() {
        return new Promise((resolve, reject) => {
            this.db.getConnection((err, connection) => {
                if (err) reject(err);
                else resolve(connection);
            });
        });
    }
    
    async beginTransaction(connection) {
        return new Promise((resolve, reject) => {
            connection.beginTransaction(err => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    
    async commitTransaction(connection) {
        return new Promise((resolve, reject) => {
            connection.commit(err => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
    
    async rollbackTransaction(connection) {
        return new Promise((resolve, reject) => {
            connection.rollback(() => {
                resolve(); // Always resolve, even on error
            });
        });
    }
}

module.exports = PaymentEndpoints;