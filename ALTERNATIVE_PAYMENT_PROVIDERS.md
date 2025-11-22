# 💳 Alternative Payment Providers Guide

Your current payment system uses **ioTec for mobile money in Uganda**. This guide shows how to integrate other payment providers if needed.

---

## Overview

| Provider | Best For | Setup Time | Cost |
|----------|----------|-----------|------|
| **ioTec** ✅ | Uganda Mobile Money | 5 min | 3.5% + fee |
| **Stripe** | Global (100+ countries) | 30 min | 2.9% + $0.30 |
| **Flutterwave** | Africa + Global | 20 min | 1.4% - 3.5% |
| **PayPal** | Global (200+ countries) | 20 min | 3.49% + $0.49 |
| **Pesapal** | East Africa | 15 min | Varies |

---

## 1. Stripe Integration (Recommended for Global)

### Why Choose Stripe?
- Supports 50+ payment methods
- Works in 200+ countries
- Lower fees (2.9%)
- Best developer experience
- Easy refunds & disputes

### Setup Steps

#### 1.1 Create Stripe Account
```bash
# Go to https://dashboard.stripe.com
# Sign up and verify email
```

#### 1.2 Get API Keys
```bash
# In Stripe Dashboard → API keys
# Copy:
# - Publishable Key: pk_test_xxxxx
# - Secret Key: sk_test_xxxxx
```

#### 1.3 Install Stripe SDK
```bash
npm install stripe @stripe/stripe-js
```

#### 1.4 Add to server-production.js

```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create Payment Intent endpoint
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, email, competitionId } = req.body;

        // Validate input
        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid amount' 
            });
        }

        // Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'usd', // or 'ugx' if supported
            metadata: {
                email: email,
                competitionId: competitionId || 'firstRound'
            },
            receipt_email: email
        });

        // Store in Firestore
        if (adminInitAvailable && db) {
            await db.collection('payments').doc(paymentIntent.id).set({
                transactionId: paymentIntent.id,
                amount: amount,
                currency: 'USD',
                method: 'stripe',
                email: email,
                status: paymentIntent.status,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            transactionId: paymentIntent.id
        });

    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment intent creation failed'
        });
    }
});

// Handle webhook from Stripe
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    try {
        const event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );

        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            
            // Update payment status in Firestore
            if (adminInitAvailable && db) {
                await db.collection('payments').doc(paymentIntent.id).update({
                    status: 'SUCCESS',
                    stripePaid: true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});
```

#### 1.5 Update Frontend (join.html)

```html
<!-- Add Stripe script -->
<script src="https://js.stripe.com/v3/"></script>

<script>
const stripe = Stripe('pk_test_xxxxx'); // Your publishable key

async function handleStripePayment() {
    const { clientSecret } = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            amount: 10,
            email: document.getElementById('email').value,
            competitionId: 'firstRound'
        })
    }).then(r => r.json());

    // Redirect to Stripe checkout
    const result = await stripe.redirectToCheckout({
        clientSecret: clientSecret,
        mode: 'payment',
        successUrl: window.location.origin + '/success.html',
        cancelUrl: window.location.origin + '/join.html'
    });
}
</script>
```

#### 1.6 Set Environment Variables
```bash
heroku config:set STRIPE_SECRET_KEY=sk_test_xxxxx
heroku config:set STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
heroku config:set STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

---

## 2. Flutterwave Integration

### Why Choose Flutterwave?
- Perfect for Africa
- Supports 100+ payment methods
- Lower fees (1.4% - 3.5%)
- Mobile money + cards + bank transfer

### Setup Steps

```bash
npm install flutterwave-node-v3
```

#### 2.1 Create Flutterwave Account
- Go to https://dashboard.flutterwave.com
- Sign up
- Get API keys

#### 2.2 Add to server-production.js

```javascript
const Flutterwave = require('flutterwave-node-v3');

const flutterwave = new Flutterwave(
    process.env.FLUTTERWAVE_PUBLIC_KEY,
    process.env.FLUTTERWAVE_SECRET_KEY
);

// Initiate payment
app.post('/flutterwave-payment', async (req, res) => {
    try {
        const { amount, email, phone, competitionId } = req.body;

        const payload = {
            tx_ref: 'TXN_' + Date.now(),
            amount: amount,
            currency: 'UGX',
            payment_options: 'card, mobilemoneyuganda, ussd',
            redirect_url: process.env.FRONTEND_URL + '/payment-success',
            meta: {
                consumer_id: 123,
                consumer_mac: 'UBSNDX928S2728'
            },
            customer: {
                email: email,
                phonenumber: phone,
                name: 'Jot Talent Participant'
            },
            customizations: {
                title: 'Jot Talent Competition',
                logo: process.env.FRONTEND_URL + '/logo.png'
            }
        };

        const response = await flutterwave.Payment.initiate(payload);

        res.json({
            success: true,
            link: response.data.link,
            transactionId: payload.tx_ref
        });

    } catch (error) {
        console.error('Flutterwave error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Verify payment
app.get('/flutterwave-verify/:transactionId', async (req, res) => {
    try {
        const response = await flutterwave.Transaction.verify({
            id: req.params.transactionId
        });

        res.json({
            success: true,
            status: response.data.status,
            data: response.data
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
```

#### 2.3 Set Environment Variables
```bash
heroku config:set FLUTTERWAVE_PUBLIC_KEY=pk_test_xxxxx
heroku config:set FLUTTERWAVE_SECRET_KEY=sk_test_xxxxx
heroku config:set FRONTEND_URL=https://your-app.herokuapp.com
```

---

## 3. Pesapal Integration (East Africa)

### Why Choose Pesapal?
- Designed for East Africa
- Supports M-Pesa, bank transfer, card
- Lower latency in region
- Simple integration

### Setup

```bash
npm install pesapal
```

```javascript
const pesapal = require('pesapal');

app.post('/pesapal-payment', async (req, res) => {
    try {
        const { amount, email, phone } = req.body;
        
        const payment = {
            reference_id: 'TXN_' + Date.now(),
            amount: amount,
            currency: 'KES', // or UGX
            description: 'Jot Talent Competition Entry',
            callback_url: process.env.FRONTEND_URL + '/pesapal-callback',
            notification_id: email,
            buyer_email: email,
            buyer_name: 'Participant',
            buyer_phone: phone,
            buyers_country: 'UG'
        };

        const response = await pesapal.initiatePayment(payment);

        res.json({
            success: true,
            redirect_url: response.redirect_url
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
```

---

## 4. PayPal Integration

### Best For
- Global audience
- Buyers with PayPal accounts
- Direct bank transfers

### Setup

```bash
npm install paypal-rest-sdk
```

```javascript
const paypal = require('paypal-rest-sdk');

paypal.configure({
    'mode': NODE_ENV === 'production' ? 'live' : 'sandbox',
    'client_id': process.env.PAYPAL_CLIENT_ID,
    'client_secret': process.env.PAYPAL_CLIENT_SECRET
});

app.post('/paypal-payment', (req, res) => {
    const create_payment_json = {
        "intent": "sale",
        "payer": {
            "payment_method": "paypal"
        },
        "redirect_urls": {
            "return_url": process.env.FRONTEND_URL + "/paypal-success",
            "cancel_url": process.env.FRONTEND_URL + "/join.html"
        },
        "transactions": [{
            "item_list": {
                "items": [{
                    "name": "Competition Entry Fee",
                    "sku": "firstRound",
                    "price": req.body.amount,
                    "currency": req.body.currency || "USD",
                    "quantity": 1
                }]
            },
            "amount": {
                "currency": req.body.currency || "USD",
                "total": req.body.amount
            },
            "description": "Entry fee for Jot Talent Competition"
        }]
    };

    paypal.payment.create(create_payment_json, (error, payment) => {
        if (error) {
            res.status(500).json({ success: false, error });
        } else {
            const redirect_url = payment.links[1].href;
            res.json({ success: true, redirect_url });
        }
    });
});
```

---

## Comparison Table

| Feature | ioTec | Stripe | Flutterwave | Pesapal | PayPal |
|---------|-------|--------|-------------|---------|--------|
| **Uganda** | ✅ Mobile Money | ✅ All methods | ✅ All methods | ✅ All methods | ✅ All methods |
| **Fees** | 3.5% + fee | 2.9% | 1.4%-3.5% | Varies | 3.49% |
| **Setup Time** | 5 min | 30 min | 20 min | 15 min | 20 min |
| **API Ease** | Easy | Very Easy | Easy | Medium | Medium |
| **Support** | Uganda | Global | Africa | East Africa | Global |
| **Refunds** | Manual | Automatic | Automatic | Manual | Automatic |
| **Mobile UX** | USSD | Great | Excellent | Good | Good |

---

## Migration Strategy

If switching providers:

1. **Keep both active** during transition (2 weeks)
2. **Route new users** to new provider
3. **New endpoint** for new provider
4. **Admin dashboard** to track both
5. **Migrate old records** after testing
6. **Remove old provider** code

### Example:
```javascript
// In join.html
const useStripe = localStorage.getItem('useStripe') === 'true';
const paymentServer = useStripe 
    ? '/stripe-payment'
    : '/iotec-payment';
```

---

## Testing Credentials

### Stripe Sandbox
```
Card: 4242 4242 4242 4242
Exp: 12/25
CVC: 123
```

### Flutterwave Sandbox
```
Phone: 0550908047
Network: MTN
Amount: Any
```

### PayPal Sandbox
- Create test accounts in PayPal dashboard
- Use test email addresses

---

## Monitoring Multi-Provider

```javascript
// Log which provider handled payment
console.log({
    provider: 'stripe',
    transactionId: paymentIntent.id,
    amount: amount,
    timestamp: new Date()
});

// Track in Firestore with provider field
{
    provider: 'stripe',
    amount: 10,
    currency: 'USD',
    status: 'SUCCESS'
}
```

---

## Recommendations

### For Uganda Only
👉 **Use ioTec** - Best for local mobile money

### For Africa Wide
👉 **Use Flutterwave** - Covers more countries

### For Global Audience
👉 **Use Stripe** - Supports most countries

### For Mixed Audience
👉 **Use Both** - Stripe + Flutterwave

---

## Need Help?

- **Stripe Docs**: https://stripe.com/docs
- **Flutterwave Docs**: https://developer.flutterwave.com/
- **Pesapal Docs**: https://pesapal.com/developers
- **PayPal Docs**: https://developer.paypal.com/

---

**Last Updated**: November 14, 2025
**Version**: 2.0.0
