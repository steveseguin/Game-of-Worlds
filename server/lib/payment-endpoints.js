/**
 * payment-endpoints.js - Server API endpoints for payments
 *
 * Implements all payment-related API endpoints with proper
 * validation, error handling, and security measures.
 */

const PaymentValidator = require('./payment-validator');
const security = require('./security');

const JSON_BODY_LIMIT_BYTES = 16 * 1024;
const WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;

function sendJson(response, statusCode, payload, headers = {}) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json',
        ...headers
    });
    response.end(JSON.stringify(payload));
}

function parseCookies(cookieHeader) {
    if (!cookieHeader || typeof cookieHeader !== 'string') {
        return {};
    }

    return cookieHeader.split(';').reduce((acc, cookie) => {
        const separator = cookie.indexOf('=');
        if (separator === -1) {
            return acc;
        }
        const key = cookie.slice(0, separator).trim();
        const value = cookie.slice(separator + 1).trim();
        if (key) {
            acc[key] = value;
        }
        return acc;
    }, {});
}

function readJsonBody(request, limitBytes = JSON_BODY_LIMIT_BYTES) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        let done = false;

        const finish = (err, payload) => {
            if (done) return;
            done = true;
            if (err) {
                reject(err);
                return;
            }
            resolve(payload);
        };

        request.on('data', chunk => {
            if (done) return;
            const text = chunk.toString();
            size += Buffer.byteLength(text, 'utf8');
            if (size > limitBytes) {
                const err = new Error(`JSON body exceeds ${limitBytes} bytes`);
                err.code = 'PAYLOAD_TOO_LARGE';
                finish(err);
                return;
            }
            body += text;
        });

        request.on('end', () => {
            if (done) return;
            try {
                finish(null, body ? JSON.parse(body) : {});
            } catch (err) {
                err.code = 'INVALID_JSON';
                finish(err);
            }
        });

        request.on('error', finish);
    });
}

function readRawBody(request, limitBytes = WEBHOOK_BODY_LIMIT_BYTES) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        let done = false;

        const finish = (err, payload) => {
            if (done) return;
            done = true;
            if (err) {
                reject(err);
                return;
            }
            resolve(payload);
        };

        request.on('data', chunk => {
            if (done) return;
            size += Buffer.byteLength(chunk);
            if (size > limitBytes) {
                const err = new Error(`Raw body exceeds ${limitBytes} bytes`);
                err.code = 'PAYLOAD_TOO_LARGE';
                finish(err);
                return;
            }
            body += chunk.toString('utf8');
        });

        request.on('end', () => finish(null, body));
        request.on('error', finish);
    });
}

function sendJsonParseError(response, error) {
    if (error && error.code === 'PAYLOAD_TOO_LARGE') {
        sendJson(response, 413, { error: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' });
        return true;
    }

    if (error && error.code === 'INVALID_JSON') {
        sendJson(response, 400, { error: 'Invalid request', code: 'INVALID_JSON' });
        return true;
    }

    return false;
}

function authorizeRequestUser(db, request, expectedUserId) {
    return new Promise(resolve => {
        const expected = String(expectedUserId || '').trim();
        if (!/^\d+$/.test(expected)) {
            resolve({ ok: false, status: 400, error: 'Invalid user ID', code: 'INVALID_USER' });
            return;
        }

        const cookies = parseCookies(request.headers && request.headers.cookie);
        const cookieUserId = String(cookies.userId || '').trim();
        const tempKey = String(cookies.tempKey || '').trim();
        if (!/^\d+$/.test(cookieUserId) || !tempKey) {
            resolve({ ok: false, status: 401, error: 'Authentication required', code: 'AUTH_REQUIRED' });
            return;
        }

        if (cookieUserId !== expected) {
            resolve({ ok: false, status: 403, error: 'Forbidden', code: 'FORBIDDEN' });
            return;
        }

        db.query('SELECT tempkey FROM users WHERE id = ? LIMIT 1', [cookieUserId], (err, rows) => {
            if (err) {
                resolve({
                    ok: false,
                    status: err.code === 'DB_OFFLINE' ? 503 : 500,
                    error: 'Authentication unavailable',
                    code: 'AUTH_UNAVAILABLE'
                });
                return;
            }

            const user = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
            if (!user ||
                !user.tempkey ||
                !security.timingSafeEqualStrings(String(user.tempkey), tempKey)) {
                resolve({ ok: false, status: 401, error: 'Authentication required', code: 'AUTH_REQUIRED' });
                return;
            }

            resolve({ ok: true, userId: Number(cookieUserId) });
        });
    });
}

class PaymentEndpoints {
    constructor(paymentManager, db) {
        this.paymentManager = paymentManager;
        this.validator = new PaymentValidator(db);
        this.db = db;
    }

    // Create payment intent endpoint
    async handleCreateIntent(request, response) {
        try {
            const data = await readJsonBody(request);
            const { userId, productId, metadata } = data;

            const auth = await authorizeRequestUser(this.db, request, userId);
            if (!auth.ok) {
                sendJson(response, auth.status, { error: auth.error, code: auth.code });
                return;
            }

            // Get IP and user agent for security
            const ipAddress = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
            const userAgent = request.headers['user-agent'];

            // Validate request
            const validation = await this.validator.validatePaymentRequest(userId, productId, metadata);
            if (!validation.valid) {
                sendJson(response, 400, {
                    error: validation.errors.join('. '),
                    code: 'VALIDATION_ERROR'
                });
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

            sendJson(response, 200, result, {
                'X-Idempotency-Key': idempotencyKey
            });
        } catch (error) {
            if (sendJsonParseError(response, error)) {
                return;
            }
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

            sendJson(response, statusCode, errorResponse);
        }
    }

    // Handle subscription creation
    async handleCreateSubscription(request, response) {
        try {
            const data = await readJsonBody(request);
            const { userId, productId, paymentMethodId } = data;

            const auth = await authorizeRequestUser(this.db, request, userId);
            if (!auth.ok) {
                sendJson(response, auth.status, { error: auth.error, code: auth.code });
                return;
            }

            // Additional validation for subscriptions
            const existingSubscription = await this.checkExistingSubscription(userId, productId);
            if (existingSubscription) {
                sendJson(response, 400, {
                    error: 'You already have an active subscription of this type',
                    code: 'DUPLICATE_SUBSCRIPTION'
                });
                return;
            }

            // Create subscription
            const result = await this.paymentManager.createSubscription(
                userId,
                productId,
                paymentMethodId
            );

            sendJson(response, 200, result);
        } catch (error) {
            if (sendJsonParseError(response, error)) {
                return;
            }
            console.error('Subscription error:', error);
            sendJson(response, 500, {
                error: error.message,
                code: 'SUBSCRIPTION_ERROR'
            });
        }
    }

    // Handle Stripe webhooks with enhanced security
    async handleWebhook(request, response) {
        try {
            const rawBody = await readRawBody(request);
            const signature = request.headers['stripe-signature'];

            if (!signature) {
                sendJson(response, 400, { error: 'Missing stripe signature' });
                return;
            }

            // Process webhook
            await this.paymentManager.handleWebhook(rawBody, signature);

            // Always return 200 to acknowledge receipt
            sendJson(response, 200, { received: true });

        } catch (error) {
            if (sendJsonParseError(response, error)) {
                return;
            }
            console.error('Webhook error:', error);

            // Still return 200 to prevent retries for signature failures
            sendJson(response, 200, {
                received: false,
                error: error.message
            });
        }
    }

    async handleConfirmTestPayment(request, response) {
        try {
            const data = await readJsonBody(request);
            const { userId, paymentIntentId } = data;

            if (!userId || !paymentIntentId) {
                sendJson(response, 400, {
                    error: 'Missing userId or paymentIntentId',
                    code: 'INVALID_REQUEST'
                });
                return;
            }

            const auth = await authorizeRequestUser(this.db, request, userId);
            if (!auth.ok) {
                sendJson(response, auth.status, { error: auth.error, code: auth.code });
                return;
            }

            const result = await this.paymentManager.confirmTestPayment(userId, paymentIntentId);
            sendJson(response, 200, result);
        } catch (error) {
            if (sendJsonParseError(response, error)) {
                return;
            }
            console.error('Test payment confirmation error:', error);
            sendJson(response, 400, {
                error: error.message || 'Payment confirmation failed',
                code: 'CONFIRMATION_ERROR'
            });
        }
    }

    // Handle crystal spending with transaction safety
    async handleSpendCrystals(request, response) {
        try {
            const data = await readJsonBody(request);
            const { userId, itemId } = data;

            const auth = await authorizeRequestUser(this.db, request, userId);
            if (!auth.ok) {
                sendJson(response, auth.status, { error: auth.error, code: auth.code });
                return;
            }

            const connection = await this.getDbConnection();

            try {
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

                sendJson(response, 200, result);

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

                sendJson(response, statusCode, errorResponse);

            } finally {
                connection.release();
            }
        } catch (error) {
            if (sendJsonParseError(response, error)) {
                return;
            }
            console.error('Crystal spending request error:', error);
            sendJson(response, 400, {
                error: error.message || 'Spending request failed',
                code: 'SPENDING_ERROR'
            });
        }
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
                    if (!err) {
                        resolve(results || []);
                        return;
                    }

                    if (err.code !== 'ER_NO_SUCH_TABLE') {
                        reject(err);
                        return;
                    }

                    this.db.query(
                        `SELECT
                            product_id,
                            amount,
                            currency,
                            status,
                            created_at as date,
                            product_id as productName
                         FROM payment_transactions
                         WHERE user_id = ?
                         ORDER BY created_at DESC
                         LIMIT ?`,
                        [userId, limit],
                        (fallbackErr, fallbackResults) => {
                            if (fallbackErr) reject(fallbackErr);
                            else resolve(fallbackResults || []);
                        }
                    );
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
