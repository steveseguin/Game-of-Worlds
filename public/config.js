/**
 * Client-side configuration
 *
 * Stripe keys are loaded dynamically from /api/config endpoint.
 * This file serves as a placeholder and can be used to set
 * client-side overrides if needed.
 *
 * In production, keys are served securely from the server.
 */

// Runtime configuration will be fetched from /api/config
// These values serve as initial state before the API response arrives
window.STRIPE_PUBLISHABLE_KEY = '';
window.PAYMENTS_ENABLED = false;
