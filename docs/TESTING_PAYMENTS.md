# Payment System Testing Guide

## Test Environment Setup

### 1. Configure Environment Variables
Create `.env` file:
```bash
cp .env.example .env
```

Add test Stripe keys:
```env
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
```

### 2. Database Setup
```bash
# Run main setup
npm run setup

# Apply payment schema
mysql -u root game < setup-payments.sql
```

### 3. Configure Stripe CLI for Webhooks
```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:1337/api/payment/webhook
```

## Test Scenarios

### 1. Shop UI/UX Tests

#### Test 1.1: Shop Opening and Navigation
1. Click "Shop" button in game
2. Verify shop modal opens smoothly
3. Test all tab navigation
4. Verify responsive design on mobile

**Expected**: 
- Smooth animations
- All tabs load content
- Mobile-friendly interface

#### Test 1.2: Crystal Balance Display
1. Check initial balance shows "Loading..."
2. Verify balance updates to actual amount
3. Test refresh button functionality

**Expected**:
- Balance loads within 2 seconds
- Refresh updates immediately
- Error state shows if API fails

### 2. Payment Flow Tests

#### Test 2.1: Successful Race Purchase
1. Select Quantum Entities race
2. Click to purchase
3. Enter test card: `4242 4242 4242 4242`
4. Complete payment

**Expected**:
- Loading indicator during processing
- Success notification
- Race immediately unlocked
- Balance unchanged (real money purchase)

#### Test 2.2: Declined Card
1. Attempt any purchase
2. Use declined card: `4000 0000 0000 0002`

**Expected**:
- Clear error message
- Form remains open for retry
- No charge attempted

#### Test 2.3: 3D Secure Authentication
1. Attempt purchase
2. Use 3DS card: `4000 0025 0000 3155`
3. Complete authentication

**Expected**:
- Authentication modal appears
- Success after authentication
- Proper handling of cancel

### 3. Crystal Shop Tests

#### Test 3.1: Sufficient Balance Purchase
1. Grant test crystals via admin panel
2. Purchase instant build (50 crystals)

**Expected**:
- Confirmation modal
- Balance updates immediately
- Item effect applies

#### Test 3.2: Insufficient Balance
1. Attempt purchase with low balance

**Expected**:
- Clear "Insufficient crystals" error
- Suggestion to buy crystals
- No deduction attempted

### 4. Security Tests

#### Test 4.1: Rate Limiting
1. Attempt 6 purchases rapidly

**Expected**:
- 6th attempt blocked
- "Too many requests" error
- 5-minute cooldown enforced

#### Test 4.2: Invalid Product IDs
1. Modify client to send fake product ID
2. Attempt purchase

**Expected**:
- Server rejects with "Invalid product"
- No payment intent created

#### Test 4.3: Price Manipulation
1. Modify client-side price display
2. Attempt purchase

**Expected**:
- Server uses correct price
- Payment reflects actual amount

### 5. Subscription Tests

#### Test 5.1: VIP Subscription Start
1. Purchase Bronze VIP
2. Use test card

**Expected**:
- Subscription active immediately
- Daily crystals credited
- VIP benefits applied

#### Test 5.2: Subscription Cancellation
1. Cancel active subscription
2. Verify end date

**Expected**:
- Benefits continue until end date
- No renewal attempt
- Clear status in UI

### 6. Error Handling Tests

#### Test 6.1: Network Interruption
1. Start purchase
2. Disconnect network
3. Reconnect

**Expected**:
- Timeout error shown
- Can retry when connected
- No duplicate charges

#### Test 6.2: Server Error
1. Simulate 500 error from server

**Expected**:
- User-friendly error message
- Suggestion to try later
- Error logged for debugging

### 7. Webhook Tests

#### Test 7.1: Successful Payment Webhook
```bash
# Trigger test webhook
stripe trigger payment_intent.succeeded
```

**Expected**:
- Purchase granted
- User notified in-game
- Transaction logged

#### Test 7.2: Failed Webhook Signature
1. Send webhook with invalid signature

**Expected**:
- Request rejected
- No purchase granted
- Security log entry

### 8. Purchase History Tests

#### Test 8.1: View History
1. Make several test purchases
2. Open purchase history

**Expected**:
- All purchases listed
- Correct dates and amounts
- Status indicators work

#### Test 8.2: Empty History
1. New account with no purchases
2. Open history

**Expected**:
- "No purchases yet" message
- Clean UI state

## Test Data

### Test Credit Cards (Stripe Test Mode)
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Insufficient Funds**: `4000 0000 0000 9995`
- **3D Secure**: `4000 0025 0000 3155`
- **Expired**: `4000 0000 0000 0069`

### Test User Accounts
Create test users with different states:
1. Free user (no purchases)
2. User with crystals
3. VIP member
4. User with all races

### Admin Commands
```sql
-- Grant test crystals
CALL grant_crystals(USER_ID, 1000, 'Test grant');

-- Make user VIP
INSERT INTO vip_memberships (user_id, tier, end_date) 
VALUES (USER_ID, 'gold', DATE_ADD(NOW(), INTERVAL 30 DAY));

-- View user payment summary
SELECT * FROM user_payment_summary WHERE user_id = USER_ID;
```

## Performance Tests

### Load Test Payment API
```bash
# Using Apache Bench
ab -n 100 -c 10 -T application/json -p payment_data.json \
   http://localhost:1337/api/payment/create-intent
```

**Expected**:
- < 200ms average response time
- No failed requests
- Rate limiting activates appropriately

## Monitoring

### Key Metrics to Track
1. **Payment Success Rate**: Should be > 95%
2. **Average Processing Time**: < 3 seconds
3. **Cart Abandonment**: < 30%
4. **Webhook Delivery**: 100%

### Error Patterns to Watch
- Repeated failures from same user
- Unusual purchase patterns
- High decline rates
- Webhook timeouts

## Troubleshooting

### Common Issues

1. **"Payment system not available"**
   - Check Stripe keys in .env
   - Verify PaymentManager initialized
   - Check server logs

2. **Webhooks not received**
   - Verify webhook secret
   - Check Stripe CLI running
   - Confirm endpoint URL

3. **Purchases not granted**
   - Check webhook logs
   - Verify database transactions
   - Confirm user session valid

4. **Performance issues**
   - Check database indexes
   - Monitor query performance
   - Review connection pooling

### Debug Mode
Enable detailed logging:
```javascript
// In server.js
process.env.DEBUG_PAYMENTS = 'true';
```

View payment logs:
```sql
SELECT * FROM payment_logs 
WHERE user_id = ? 
ORDER BY created_at DESC 
LIMIT 50;
```

## Security Checklist

- [ ] Stripe keys not in client code
- [ ] HTTPS enforced in production
- [ ] Rate limiting active
- [ ] Input validation working
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF tokens implemented
- [ ] Webhook signatures verified
- [ ] PCI compliance maintained
- [ ] Audit logs enabled