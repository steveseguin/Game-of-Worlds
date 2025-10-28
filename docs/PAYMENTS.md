# Game of Words - Payment Integration Guide

## Overview
The game includes a comprehensive monetization system that allows players to purchase premium content while keeping the core game free-to-play.

## Payment Features

### Premium Races
- 3 premium races available for $4.99 each
  - **Quantum Entities**: Phase abilities and instant warp
  - **Titan Lords**: Massive ships with extreme durability
  - **Shadow Realm**: Cloaking and stealth abilities
- Premium races offer unique gameplay mechanics not available in free races

### Premium Currency (Crystals)
- Purchase packs ranging from $4.99 to $49.99
- Bonus crystals included in larger packs
- Used for in-game purchases without real money

### VIP Memberships
Three tiers of monthly subscriptions:
- **Bronze VIP ($4.99/month)**: 10% resource bonus, daily crystals
- **Silver VIP ($9.99/month)**: 20% resource bonus, exclusive skins, priority queue
- **Gold VIP ($19.99/month)**: 30% resource bonus, beta access, VIP chat

### Boosters
Temporary enhancements:
- Resource Booster: 2x resources for 7 days ($2.99)
- Research Booster: 2x research speed for 7 days ($2.99)
- Speed Build: 2x build speed for 3 days ($1.99)

### Battle Pass
- Seasonal content with 50 tiers of rewards ($9.99)
- Exclusive ships, skins, and resources

### Crystal Shop
Spend premium currency on:
- Instant race unlocks (1000 crystals)
- Instant building/research completion
- Resource packs
- Permanent upgrades

## Technical Implementation

### Server Setup

1. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Stripe keys:
   ```
   STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY
   STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
   ```

2. **Database Setup**
   Run `npm run setup` to create all necessary payment tables:
   - `payment_transactions`: Transaction history
   - `user_currencies`: Crystal balances
   - `user_boosters`: Active boosters
   - `battle_pass_ownership`: Battle pass progress
   - `user_cosmetics`: Unlocked cosmetics
   - `vip_memberships`: VIP status tracking

3. **Webhook Configuration**
   Configure Stripe webhook endpoint: `https://yourdomain.com/api/payment/webhook`

### API Endpoints

- `POST /api/payment/create-intent`: Create payment intent for one-time purchases
- `POST /api/payment/create-subscription`: Create subscription for VIP memberships
- `POST /api/payment/webhook`: Handle Stripe webhooks
- `POST /api/payment/spend-crystals`: Spend premium currency

### Client Integration

1. **Initialize Shop**
   ```javascript
   Shop.initialize(userId);
   ```

2. **Open Shop**
   ```javascript
   Shop.open();
   ```

3. **Purchase Flow**
   - User clicks on product
   - Payment intent created server-side
   - Stripe Elements collects card details
   - Payment processed
   - Server grants purchase via webhook

### Security Considerations

- All payment processing handled server-side
- Stripe webhook signature verification
- Database transactions for atomic operations
- Input validation and sanitization
- Rate limiting on payment endpoints

## Testing

### Test Cards (Stripe Test Mode)
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Authentication Required: `4000 0025 0000 3155`

### Test Flow
1. Create test account
2. Join game and select starter race
3. Open shop and select premium content
4. Use test card for payment
5. Verify purchase granted

## Monetization Best Practices

1. **Fair Play**
   - Premium content provides variety, not pay-to-win advantages
   - All races balanced for competitive play
   - Cosmetics don't affect gameplay

2. **Value Proposition**
   - Clear benefits for each purchase
   - Bundle deals and bonus crystals
   - VIP perks enhance experience without breaking balance

3. **Retention**
   - Daily login rewards for VIP members
   - Battle pass encourages regular play
   - Seasonal content keeps game fresh

## Revenue Tracking

Monitor key metrics:
- Conversion rate (free to paying)
- Average revenue per user (ARPU)
- Lifetime value (LTV)
- Popular products and price points
- VIP retention rates

## Support

For payment issues:
- Check Stripe dashboard for transaction details
- Verify webhook delivery
- Review server logs for errors
- Contact support with transaction ID