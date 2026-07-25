/**
 * env-validator.js - Environment variable validation
 * 
 * Validates required environment variables at server startup
 * to ensure proper configuration and prevent security issues.
 */

const crypto = require('crypto');

// Define required environment variables and their validation rules
const REQUIRED_ENV_VARS = {
    // Security-critical variables (no defaults allowed)
    SESSION_SECRET: {
        required: false,
        requiredInProduction: true,
        minLength: 32,
        description: 'Session secret for signing cookies',
        example: 'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
        generateIfMissing: () => crypto.randomBytes(32).toString('hex'),
        sensitive: true
    },
    CSRF_SECRET: {
        required: false,
        requiredInProduction: true,
        minLength: 32,
        description: 'CSRF token secret',
        example: 'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
        generateIfMissing: () => crypto.randomBytes(32).toString('hex'),
        sensitive: true
    },
    
    // Database configuration
    DB_HOST: {
        required: false,
        default: 'localhost',
        description: 'Database host'
    },
    DB_USER: {
        required: false,
        default: 'root',
        description: 'Database user'
    },
    DB_PASSWORD: {
        required: false,
        requiredInProduction: true,
        default: '',
        description: 'Database password',
        sensitive: true
    },
    DB_PORT: {
        required: false,
        default: '3306',
        pattern: /^\d{1,5}$/,
        description: 'Database port'
    },
    DB_POOL_SIZE: {
        required: false,
        default: '10',
        pattern: /^\d{1,3}$/,
        description: 'Database connection pool size'
    },
    DB_NAME: {
        required: false,
        default: 'game',
        description: 'Database name'
    },
    
    // Optional services
    STRIPE_SECRET_KEY: {
        required: false,
        description: 'Stripe API secret key (optional - disables payments if not set)',
        pattern: /^sk_(test|live)_/
    },
    STRIPE_WEBHOOK_SECRET: {
        required: false,
        description: 'Stripe webhook secret (required if STRIPE_SECRET_KEY is set)'
    },
    
    // Server configuration
    PORT: {
        required: false,
        default: '3000',
        pattern: /^\d+$/,
        description: 'Server port'
    },
    NODE_ENV: {
        required: false,
        default: 'development',
        values: ['development', 'production', 'test'],
        description: 'Node environment'
    }
};

/**
 * Validates all required environment variables
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateEnvironment() {
    const errors = [];
    const warnings = [];
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Check each required variable
    for (const [varName, config] of Object.entries(REQUIRED_ENV_VARS)) {
        let value = process.env[varName];
        const isRequired = config.required || (isProduction && config.requiredInProduction);
        
        // Check if required variable is missing
        if (isRequired && !value) {
            errors.push(`Missing required environment variable: ${varName}`);
            errors.push(`  Description: ${config.description}`);
            if (config.example) {
                errors.push(`  Example: ${config.example}`);
            }
            errors.push('');
            continue;
        }
        
        // Apply default if not required and missing
        if (!isRequired && !value && Object.prototype.hasOwnProperty.call(config, 'default')) {
            process.env[varName] = config.default;
            value = process.env[varName];
            continue;
        }
        
        // Generate development secrets when available
        if (!isProduction && !value && typeof config.generateIfMissing === 'function') {
            const generated = config.generateIfMissing();
            process.env[varName] = generated;
            value = generated;
            warnings.push(`${varName} was not set. Generated a temporary development value.`);
        }
        
        // Skip validation if optional and still not provided
        if (!value) {
            continue;
        }
        
        // Validate minimum length
        if (config.minLength && value.length < config.minLength) {
            errors.push(`${varName} must be at least ${config.minLength} characters long`);
            if (config.example) {
                errors.push(`  Example: ${config.example}`);
            }
            errors.push('');
        }
        
        // Validate pattern
        if (config.pattern && !config.pattern.test(value)) {
            errors.push(`${varName} has invalid format`);
            errors.push(`  Expected pattern: ${config.pattern}`);
            errors.push('');
        }
        
        // Validate allowed values
        if (config.values && !config.values.includes(value)) {
            errors.push(`${varName} must be one of: ${config.values.join(', ')}`);
            errors.push('');
        }
    }
    
    // Additional validation rules
    
    // Check Stripe configuration consistency. The webhook is what delivers a purchase,
    // so a missing secret is not merely a verification gap - it is the difference between
    // a charge that arrives and a charge that vanishes.
    if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
        if (String(process.env.STRIPE_SECRET_KEY).startsWith('sk_live_')) {
            warnings.push('STRIPE_WEBHOOK_SECRET is missing while a LIVE Stripe key is set');
            warnings.push('  Purchases would be charged and never delivered, so the shop is DISABLED');
            warnings.push('  Set STRIPE_WEBHOOK_SECRET to re-enable payments');
        } else {
            warnings.push('STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing');
            warnings.push('  Test-mode purchases still settle via client confirmation, but going');
            warnings.push('  live without the webhook secret will disable the shop');
        }
        warnings.push('');
    }
    
    // Warn about development defaults in production
    if (process.env.NODE_ENV === 'production') {
        if (process.env.DB_USER === 'root') {
            warnings.push('Using "root" as DB_USER in production is not recommended');
        }
        if (!process.env.STRIPE_SECRET_KEY) {
            warnings.push('Payment processing is disabled (STRIPE_SECRET_KEY not set)');
        }
    }
    
    return { 
        valid: errors.length === 0, 
        errors, 
        warnings 
    };
}

/**
 * Generates secure random secrets for development
 */
function generateDevelopmentSecrets() {
    console.log('\n=== Development Secret Generation ===');
    console.log('Add these to your .env file:\n');
    console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`);
    console.log(`CSRF_SECRET=${crypto.randomBytes(32).toString('hex')}`);
    console.log(`DB_PASSWORD=your_secure_password_here`);
    console.log('\nNever commit these secrets to version control!');
}

/**
 * Main validation function to be called at server startup
 */
function validateAndInitialize() {
    console.log('Validating environment configuration...\n');
    
    const { valid, errors, warnings } = validateEnvironment();
    
    // Show warnings
    if (warnings.length > 0) {
        console.log('⚠️  Configuration Warnings:');
        warnings.forEach(warning => console.log(`   ${warning}`));
        console.log('');
    }
    
    // Handle errors
    if (!valid) {
        console.error('❌ Environment Configuration Errors:\n');
        errors.forEach(error => console.error(error));
        
        if (process.env.NODE_ENV === 'development') {
            console.log('\n💡 Tip: Create a .env file in your project root with required variables.');
            console.log('   You can use .env.example as a template.\n');
            generateDevelopmentSecrets();
        }
        
        console.error('\nServer cannot start with invalid configuration.');
        process.exit(1);
    }
    
    console.log('✅ Environment configuration valid\n');
}

module.exports = {
    validateEnvironment,
    validateAndInitialize,
    REQUIRED_ENV_VARS
};
