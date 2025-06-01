/**
 * payment-validator.js - Payment validation and security
 * 
 * Handles payment validation, fraud detection, and security checks
 */

const crypto = require('crypto');

class PaymentValidator {
    constructor(db) {
        this.db = db;
        this.rateLimits = new Map();
    }
    
    // Validate payment request
    async validatePaymentRequest(userId, productId, metadata = {}) {
        const errors = [];
        
        // Check rate limiting
        if (!this.checkRateLimit(userId)) {
            errors.push('Too many payment attempts. Please try again later.');
        }
        
        // Validate user exists and is active
        const user = await this.validateUser(userId);
        if (!user) {
            errors.push('Invalid user account.');
        }
        
        // Check for suspicious activity
        const suspicious = await this.checkSuspiciousActivity(userId);
        if (suspicious) {
            errors.push('Payment blocked for security reasons. Please contact support.');
        }
        
        // Validate product exists and is purchasable
        const product = this.validateProduct(productId);
        if (!product) {
            errors.push('Invalid product selected.');
        }
        
        // Check if already purchased (for non-repeatable items)
        if (product && !product.repeatable) {
            const owned = await this.checkOwnership(userId, productId);
            if (owned) {
                errors.push('You already own this item.');
            }
        }
        
        // Validate metadata
        if (!this.validateMetadata(metadata)) {
            errors.push('Invalid purchase data.');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            user: user,
            product: product
        };
    }
    
    // Rate limiting
    checkRateLimit(userId, maxAttempts = 5, windowMs = 300000) {
        const key = `payment_${userId}`;
        const now = Date.now();
        
        if (!this.rateLimits.has(key)) {
            this.rateLimits.set(key, { attempts: 1, resetTime: now + windowMs });
            return true;
        }
        
        const limit = this.rateLimits.get(key);
        
        if (now > limit.resetTime) {
            limit.attempts = 1;
            limit.resetTime = now + windowMs;
            return true;
        }
        
        if (limit.attempts >= maxAttempts) {
            return false;
        }
        
        limit.attempts++;
        return true;
    }
    
    // Validate user
    async validateUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                'SELECT id, username, email, created FROM users WHERE id = ? AND active = 1',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0] || null);
                }
            );
        });
    }
    
    // Check suspicious activity
    async checkSuspiciousActivity(userId) {
        // Check for rapid payment attempts
        const recentPayments = await this.getRecentPayments(userId, 3600000); // Last hour
        if (recentPayments.length > 10) {
            return true;
        }
        
        // Check for chargebacks or disputes
        const disputes = await this.getDisputes(userId);
        if (disputes.length > 0) {
            return true;
        }
        
        // Check for unusual purchase patterns
        const pattern = await this.analyzePaymentPattern(userId);
        if (pattern.suspicious) {
            return true;
        }
        
        return false;
    }
    
    // Get recent payments
    async getRecentPayments(userId, windowMs) {
        return new Promise((resolve, reject) => {
            const since = new Date(Date.now() - windowMs);
            this.db.query(
                `SELECT * FROM payment_transactions 
                 WHERE user_id = ? AND created_at > ? 
                 ORDER BY created_at DESC`,
                [userId, since],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    // Get payment disputes
    async getDisputes(userId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT * FROM payment_disputes WHERE user_id = ?`,
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results || []);
                }
            );
        });
    }
    
    // Analyze payment patterns
    async analyzePaymentPattern(userId) {
        const transactions = await this.getRecentPayments(userId, 86400000 * 30); // 30 days
        
        // Calculate average transaction amount
        const amounts = transactions.map(t => t.amount);
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length || 0;
        
        // Check for sudden spending spike
        const recentTotal = transactions
            .filter(t => Date.now() - t.created_at < 86400000) // Last 24h
            .reduce((sum, t) => sum + t.amount, 0);
            
        const suspicious = recentTotal > avgAmount * 10;
        
        return {
            suspicious,
            avgAmount,
            recentTotal,
            transactionCount: transactions.length
        };
    }
    
    // Validate product
    validateProduct(productId) {
        // This would check against the PRODUCTS object
        // For now, simplified validation
        const validProducts = [
            'race_quantum', 'race_titan', 'race_shadow',
            'crystals_500', 'crystals_1200', 'crystals_2500', 'crystals_6500',
            'vip_bronze', 'vip_silver', 'vip_gold',
            'booster_resource', 'booster_research', 'booster_build',
            'battle_pass', 'skin_pack_neon', 'avatar_pack_legendary'
        ];
        
        if (!validProducts.includes(productId)) {
            return null;
        }
        
        return {
            id: productId,
            repeatable: productId.startsWith('crystals_') || productId.startsWith('booster_')
        };
    }
    
    // Check ownership
    async checkOwnership(userId, productId) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `SELECT id FROM premium_purchases 
                 WHERE user_id = ? AND product_id = ? AND status = 'completed'`,
                [userId, productId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results && results.length > 0);
                }
            );
        });
    }
    
    // Validate metadata
    validateMetadata(metadata) {
        if (typeof metadata !== 'object') {
            return false;
        }
        
        // Check for required fields based on type
        if (metadata.type === 'subscription' && !metadata.interval) {
            return false;
        }
        
        // Validate field lengths
        for (const key in metadata) {
            if (typeof metadata[key] === 'string' && metadata[key].length > 255) {
                return false;
            }
        }
        
        return true;
    }
    
    // Generate idempotency key
    generateIdempotencyKey(userId, productId, timestamp) {
        const data = `${userId}-${productId}-${timestamp}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    
    // Log payment attempt
    async logPaymentAttempt(userId, productId, status, details = {}) {
        return new Promise((resolve, reject) => {
            this.db.query(
                `INSERT INTO payment_logs 
                 (user_id, product_id, status, details, ip_address, user_agent, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [
                    userId,
                    productId,
                    status,
                    JSON.stringify(details),
                    details.ipAddress || null,
                    details.userAgent || null
                ],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result.insertId);
                }
            );
        });
    }
    
    // Clean up old rate limit entries
    cleanupRateLimits() {
        const now = Date.now();
        for (const [key, limit] of this.rateLimits) {
            if (now > limit.resetTime) {
                this.rateLimits.delete(key);
            }
        }
    }
}

module.exports = PaymentValidator;