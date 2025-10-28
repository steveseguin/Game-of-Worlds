/**
 * lib/security.js - Security utilities and validation
 * 
 * Provides input validation, sanitization, and security helpers
 * to prevent SQL injection, XSS, and other vulnerabilities.
 */

const crypto = require('crypto');

// Input validation patterns
const PATTERNS = {
    username: /^[a-zA-Z0-9_-]{3,20}$/,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    gameName: /^[a-zA-Z0-9\s_-]{3,30}$/,
    integer: /^\d+$/,
    coordinate: /^\d{1,3}$/,
    shipList: /^[\d,]+$/,
    techList: /^[\d,]*$/
};

// Validate username
function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }
    
    if (!PATTERNS.username.test(username)) {
        return { valid: false, error: 'Username must be 3-20 characters, letters, numbers, underscore, hyphen only' };
    }
    
    return { valid: true };
}

// Validate email
function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return { valid: false, error: 'Email is required' };
    }
    
    if (!PATTERNS.email.test(email)) {
        return { valid: false, error: 'Invalid email format' };
    }
    
    return { valid: true };
}

// Validate password strength
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }
    
    if (password.length < 6) {
        return { valid: false, error: 'Password must be at least 6 characters' };
    }
    
    return { valid: true };
}

// Validate game name
function validateGameName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Game name is required' };
    }
    
    if (!PATTERNS.gameName.test(name)) {
        return { valid: false, error: 'Game name must be 3-30 characters, letters, numbers, spaces, underscore, hyphen only' };
    }
    
    return { valid: true };
}

// Validate integer input
function validateInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const num = parseInt(value);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Invalid number' };
    }
    
    if (num < min || num > max) {
        return { valid: false, error: `Number must be between ${min} and ${max}` };
    }
    
    return { valid: true, value: num };
}

// Validate coordinate
function validateCoordinate(value, mapSize) {
    const result = validateInteger(value, 0, mapSize - 1);
    if (!result.valid) {
        result.error = 'Invalid coordinate';
    }
    return result;
}

// Validate sector ID
function validateSectorId(sectorId, mapWidth, mapHeight) {
    const result = validateInteger(sectorId, 0, mapWidth * mapHeight - 1);
    if (!result.valid) {
        result.error = 'Invalid sector ID';
    }
    return result;
}

// Sanitize string for SQL (escape quotes)
function sanitizeSQL(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/['"\\\0\n\r\x1a]/g, (match) => {
        switch (match) {
            case "'": return "\\'";
            case '"': return '\\"';
            case '\\': return '\\\\';
            case '\0': return '\\0';
            case '\n': return '\\n';
            case '\r': return '\\r';
            case '\x1a': return '\\Z';
            default: return match;
        }
    });
}

// Sanitize string for HTML output
function sanitizeHTML(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

// Generate secure random token
function generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

// Generate session token with expiry
function generateSessionToken(userId) {
    if (!process.env.SESSION_SECRET) {
        throw new Error('SESSION_SECRET environment variable is not set');
    }
    
    const token = generateToken(32);
    const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    const signature = crypto
        .createHmac('sha256', process.env.SESSION_SECRET)
        .update(`${token}:${userId}:${expiry}`)
        .digest('hex');
    
    return {
        token,
        expiry,
        signature,
        full: `${token}:${expiry}:${signature}`
    };
}

// Verify session token
function verifySessionToken(fullToken, userId) {
    if (!process.env.SESSION_SECRET) {
        throw new Error('SESSION_SECRET environment variable is not set');
    }
    
    const parts = fullToken.split(':');
    if (parts.length !== 3) return false;
    
    const [token, expiry, signature] = parts;
    
    // Check expiry
    if (Date.now() > parseInt(expiry)) return false;
    
    // Verify signature
    const expectedSignature = crypto
        .createHmac('sha256', process.env.SESSION_SECRET)
        .update(`${token}:${userId}:${expiry}`)
        .digest('hex');
    
    return signature === expectedSignature;
}

// Rate limiting helper
const rateLimits = new Map();

function checkRateLimit(identifier, action, maxAttempts = 5, windowMs = 60000) {
    const key = `${identifier}:${action}`;
    const now = Date.now();
    
    if (!rateLimits.has(key)) {
        rateLimits.set(key, { attempts: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxAttempts - 1 };
    }
    
    const limit = rateLimits.get(key);
    
    // Reset if window expired
    if (now > limit.resetAt) {
        limit.attempts = 1;
        limit.resetAt = now + windowMs;
        return { allowed: true, remaining: maxAttempts - 1 };
    }
    
    // Check if exceeded
    if (limit.attempts >= maxAttempts) {
        return { 
            allowed: false, 
            remaining: 0,
            resetIn: Math.ceil((limit.resetAt - now) / 1000)
        };
    }
    
    // Increment attempts
    limit.attempts++;
    return { allowed: true, remaining: maxAttempts - limit.attempts };
}

// Clean old rate limit entries periodically
const rateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of rateLimits.entries()) {
        if (now > limit.resetAt) {
            rateLimits.delete(key);
        }
    }
}, 60000); // Clean every minute
rateLimitCleanup.unref();

// Validate command data
function validateCommand(command, data) {
    switch (command) {
        case 'buyship':
        case 'buybuilding':
        case 'buytech':
            const id = parseInt(data.split(':')[1]);
            return validateInteger(id, 0, 20);
            
        case 'move':
            const parts = data.split(':');
            if (parts.length < 5) return { valid: false, error: 'Invalid move command' };
            return { valid: true };
            
        case 'colonize':
            return { valid: true };
            
        case 'probe':
            const sectorId = parseInt(data.split(':')[1]);
            return validateInteger(sectorId, 0, 200);
            
        default:
            return { valid: true };
    }
}

// IP address validation
function isValidIP(ip) {
    // IPv4
    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4.test(ip)) {
        const parts = ip.split('.');
        return parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
    }
    
    // IPv6 (simplified)
    const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    return ipv6.test(ip);
}

// Generate CSRF token
function generateCSRFToken(sessionId) {
    if (!process.env.CSRF_SECRET) {
        throw new Error('CSRF_SECRET environment variable is not set');
    }
    
    return crypto
        .createHmac('sha256', process.env.CSRF_SECRET)
        .update(sessionId)
        .digest('hex');
}

// Verify CSRF token
function verifyCSRFToken(token, sessionId) {
    const expected = generateCSRFToken(sessionId);
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

module.exports = {
    validateUsername,
    validateEmail,
    validatePassword,
    validateGameName,
    validateInteger,
    validateCoordinate,
    validateSectorId,
    sanitizeSQL,
    sanitizeHTML,
    generateToken,
    generateSessionToken,
    verifySessionToken,
    checkRateLimit,
    validateCommand,
    isValidIP,
    generateCSRFToken,
    verifyCSRFToken,
    PATTERNS
};
