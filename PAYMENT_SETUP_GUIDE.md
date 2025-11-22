# Live Payment System Integration Guide

## Overview
Your current payment system uses ioTec for mobile money in Uganda. This guide explains how to make it production-ready and live, including GitHub deployment options.

## Current Architecture
- **Frontend**: HTML/CSS/JS with Firebase authentication
- **Backend**: Node.js/Express server at port 5000
- **Payment Provider**: ioTec (mobile money)
- **Database**: Firebase Firestore
- **File Storage**: GitHub repository

---

## Step 1: Set Up GitHub Repository for Version Control

### 1.1 Initialize Git (if not already done)
```bash
cd c:\Users\Administrator\Desktop\jot-comps-main
git init
git add .
git commit -m "Initial commit: JOT Talent payment system"
```

### 1.2 Create GitHub Repository
1. Go to https://github.com/new
2. Create a new repository named `jot-talent-competitions`
3. Push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/jot-talent-competitions.git
git branch -M main
git push -u origin main
```

### 1.3 Add .gitignore
Create `.gitignore` file to protect sensitive credentials:
```
node_modules/
.env
serviceAccountKey.json
*.log
.DS_Store
dist/
build/
```

### 1.4 Store Secrets Safely
**NEVER commit sensitive credentials!** Use environment variables:

Create `.env` file (locally, not committed):
```
# ioTec Credentials
IOTEC_CLIENT_ID=your_client_id
IOTEC_CLIENT_SECRET=your_client_secret
IOTEC_WALLET_ID=your_wallet_id

# Firebase
FIREBASE_PROJECT_ID=jot-talent-competitions-72b9f
FIREBASE_API_KEY=your_api_key
ADMIN_EMAIL=admin@example.com

# Server
PORT=5000
NODE_ENV=production
```

---

## Step 2: Deployment Options

### Option A: Deploy Backend to Heroku (Recommended for Free Tier)

#### A.1 Install Heroku CLI
```bash
# Download from https://devcenter.heroku.com/articles/heroku-cli
heroku login
```

#### A.2 Create Heroku App
```bash
heroku create jot-talent-payment-api
```

#### A.3 Set Environment Variables
```bash
heroku config:set IOTEC_CLIENT_ID=your_client_id
heroku config:set IOTEC_CLIENT_SECRET=your_client_secret
heroku config:set IOTEC_WALLET_ID=your_wallet_id
heroku config:set ADMIN_EMAIL=admin@example.com
```

#### A.4 Deploy via Git
```bash
git push heroku main
```

Your server will be live at: `https://jot-talent-payment-api.herokuapp.com`

---

### Option B: Deploy Backend to Railway.app (Modern Alternative)

#### B.1 Connect GitHub
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select your `jot-talent-competitions` repository

#### B.2 Configure Environment Variables
In Railway dashboard:
- Set all environment variables from your `.env` file
- Railway auto-detects Node.js projects

#### B.3 Get Your URL
Railway provides: `https://your-project-name.railway.app`

---

### Option C: Deploy Backend to Google Cloud Run (Production Grade)

#### C.1 Install Google Cloud CLI
```bash
# Download from https://cloud.google.com/sdk/docs/install
gcloud init
gcloud auth login
```

#### C.2 Create Cloud Run Service
```bash
gcloud run deploy jot-talent-payment \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

#### C.3 Set Secrets
```bash
gcloud run services update jot-talent-payment \
  --update-env-vars IOTEC_CLIENT_ID=your_id,IOTEC_CLIENT_SECRET=your_secret
```

---

### Option D: Deploy Frontend to GitHub Pages (Free Hosting)

#### D.1 Create GitHub Actions Workflow
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to GitHub Pages
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          branch: gh-pages
          folder: .
```

#### D.2 Enable GitHub Pages
1. Go to repository Settings → Pages
2. Select "Deploy from a branch"
3. Select "gh-pages" branch

Your frontend will be at: `https://YOUR_USERNAME.github.io/jot-talent-competitions/`

---

## Step 3: Update Frontend to Use Live URLs

### 3.1 Modify join.html
Change the SERVER_URL based on environment:
```html
<script>
    // Detect environment
    const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.');
    
    const SERVER_URL = isProduction 
        ? 'https://jot-talent-payment-api.herokuapp.com' // Your live backend
        : 'http://localhost:5000'; // Local development
    
    console.log('Using server:', SERVER_URL);
</script>
```

### 3.2 Update server.js for Production
Modify `server.js` to read environment variables:
```javascript
require('dotenv').config(); // Add at top

const clientId = process.env.IOTEC_CLIENT_ID;
const clientSecret = process.env.IOTEC_CLIENT_SECRET;
const walletId = process.env.IOTEC_WALLET_ID;
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Better CORS for production
const allowedOrigins = NODE_ENV === 'production' 
    ? [
        'https://YOUR_USERNAME.github.io',
        'https://yourdomain.com'
      ]
    : ['http://localhost:3000', 'http://localhost:5500'];

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
}));
```

### 3.3 Install dotenv
```bash
npm install dotenv
```

---

## Step 4: Alternative Payment Providers (Optional)

### Switch to Stripe (Popular Worldwide)

#### Option 1: Stripe for Uganda (if available)
```bash
npm install stripe
```

Create new endpoint in server.js:
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, email } = req.body;
        
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'ugx', // or appropriate currency
            receipt_email: email
        });
        
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

---

## Step 5: Testing Before Going Live

### 5.1 Test Locally
```bash
# Terminal 1: Start backend
npm start

# Terminal 2: Serve frontend
python -m http.server 8000
# Then visit http://localhost:8000/join.html
```

### 5.2 Test Payment Flow
1. Load join.html
2. Click "Pay Now"
3. Enter test credentials
4. Monitor server logs for responses

### 5.3 Test Deployed Version
1. Update frontend SERVER_URL to production
2. Verify payment processing
3. Check Firestore for recorded transactions
4. Confirm verification emails sent

---

## Step 6: Security Checklist

- [ ] All secrets in `.env` (not committed)
- [ ] Firebase security rules configured
- [ ] CORS restricted to trusted domains
- [ ] HTTPS enabled on all URLs
- [ ] Input validation on all endpoints
- [ ] Rate limiting implemented
- [ ] Error messages don't leak sensitive info
- [ ] Backup Firebase data regularly
- [ ] Monitor for suspicious transactions
- [ ] Two-factor authentication for admin panel

---

## Step 7: Monitor & Maintain

### 7.1 Set Up Error Monitoring
```bash
npm install sentry
```

Add to server.js:
```javascript
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });
app.use(Sentry.Handlers.errorHandler());
```

### 7.2 Logs & Analytics
- Heroku/Railway/Google Cloud provide built-in logs
- Monitor payment success/failure rates
- Alert on errors

### 7.3 Regular Updates
```bash
npm update
npm audit fix
```

---

## Quick Start: Go Live in 15 Minutes

### For Heroku:
```bash
# 1. Install Heroku CLI and login
heroku login

# 2. Create app
heroku create jot-talent-payment-api

# 3. Set environment variables
heroku config:set IOTEC_CLIENT_ID=your_id
heroku config:set IOTEC_CLIENT_SECRET=your_secret
heroku config:set IOTEC_WALLET_ID=your_wallet

# 4. Deploy
git push heroku main

# 5. Get live URL
heroku apps:info jot-talent-payment-api

# 6. Update frontend join.html with your Heroku URL
```

---

## Troubleshooting

### Payment endpoint returns 503
- Check if `serviceAccountKey.json` exists
- Add Firebase service account credentials

### CORS errors in browser
- Update allowedOrigins in server.js
- Ensure frontend URL is whitelisted

### Payment times out
- Check if backend server is running
- Verify ioTec credentials are correct
- Check network connectivity

### Firebase connection fails
- Verify Firebase config in join.html
- Check Internet connection
- Ensure Firebase project has required permissions

---

## Support
For issues:
1. Check server logs: `heroku logs --tail`
2. Monitor browser console (F12)
3. Review Firestore dashboard
4. Enable debug mode in code

