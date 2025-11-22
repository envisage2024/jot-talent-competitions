# ✅ Complete Pre-Launch Checklist

## Phase 1: Preparation (Today - 30 minutes)

### Accounts & Credentials
- [ ] GitHub account created (https://github.com/signup)
- [ ] Heroku account created (https://www.heroku.com/signup)
- [ ] ioTec credentials obtained:
  - [ ] Client ID: `pay-caed774a-d7d0-4a74-b751-5b77be5b3911`
  - [ ] Client Secret: `IO-BdUCLRbm7xxYyz35WqpSu2QcPqrP3Eigg`
  - [ ] Wallet ID: `a563af4c-3137-4085-a888-93bdf3fb29b4`
- [ ] Firebase project verified
- [ ] Test payment number obtained from ioTec

### Documentation Review
- [ ] Read [QUICK_START_LIVE.md](./QUICK_START_LIVE.md) completely
- [ ] Read [README.md](./README.md) for overview
- [ ] Understand architecture from [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ ] Review security from [SECURITY_BEST_PRACTICES.md](./SECURITY_BEST_PRACTICES.md)

### Local Setup
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm 8+ installed (`npm --version`)
- [ ] All dependencies installed (`npm install`)
- [ ] `.env` file created from `.env.example`
- [ ] `.env` filled with your credentials
- [ ] `.env` added to `.gitignore` ✓

---

## Phase 2: Local Testing (1 hour)

### Backend Testing
- [ ] Start backend: `npm start`
- [ ] Server running on port 5000
- [ ] Health check passes: `curl http://localhost:5000/health`
- [ ] Response includes: `status: "OK"`, `version: "2.0.0"`
- [ ] No errors in console

### Frontend Testing
- [ ] Frontend served: `python -m http.server 8000`
- [ ] Open: `http://localhost:8000/join.html`
- [ ] Page loads without errors
- [ ] "Pay Now" button visible
- [ ] Payment form displays correctly

### Payment Flow Testing
- [ ] Click "Pay Now" button
- [ ] Payment modal opens
- [ ] Form fields load:
  - [ ] Payment type dropdown
  - [ ] Amount field (shows correctly)
  - [ ] Name field
  - [ ] Email field
  - [ ] Phone field
  - [ ] Currency dropdown
- [ ] Fill test form:
  - [ ] Amount: 10000
  - [ ] Phone: Test number from ioTec
  - [ ] Email: your-test@example.com
  - [ ] Name: Test User
- [ ] Click "Pay Now"
- [ ] See payment processing message
- [ ] Success or error returned
- [ ] Check Heroku logs for transaction details

### Validation Testing
- [ ] Try submit with empty phone → Shows error
- [ ] Try submit with invalid email → Shows error
- [ ] Try submit with negative amount → Shows error
- [ ] Try submit with valid data → Processes

---

## Phase 3: GitHub Setup (15 minutes)

### Create Repository
- [ ] Create new GitHub repo: `jot-talent-competitions`
- [ ] Copy Git commands from GitHub
- [ ] Initialize local repo:
  ```bash
  git init
  git add .
  git commit -m "Initial commit: Production payment system"
  git branch -M main
  git remote add origin https://github.com/YOUR_USERNAME/jot-talent-competitions.git
  git push -u origin main
  ```
- [ ] Verify files on GitHub

### Add .gitignore
- [ ] `.gitignore` file exists
- [ ] Contains `.env` ✓
- [ ] Contains `serviceAccountKey.json` ✓
- [ ] Contains `node_modules/` ✓
- [ ] Test: `.env` NOT visible on GitHub

### Setup GitHub Secrets
- [ ] Go to GitHub → Settings → Secrets and variables → Actions
- [ ] Add secret: `HEROKU_API_KEY`
  - Get from: https://dashboard.heroku.com/account/applications/authorizations
  - [ ] Click "Create authorization"
  - [ ] Copy token
  - [ ] Paste in GitHub secret
- [ ] Add secret: `HEROKU_APP_NAME`
  - Value: `jot-talent-payment-api` (or your chosen name)

---

## Phase 4: Heroku Deployment (30 minutes)

### Create Heroku App
- [ ] Install Heroku CLI: https://cli-assets.heroku.com/branches/main/heroku-windows-x64.exe
- [ ] Verify: `heroku --version`
- [ ] Login: `heroku login`
- [ ] Create app: `heroku create jot-talent-payment-api`
- [ ] Verify: App appears in Heroku dashboard

### Set Environment Variables
```bash
heroku config:set IOTEC_CLIENT_ID=your_id --app jot-talent-payment-api
heroku config:set IOTEC_CLIENT_SECRET=your_secret --app jot-talent-payment-api
heroku config:set IOTEC_WALLET_ID=your_wallet --app jot-talent-payment-api
heroku config:set FIREBASE_PROJECT_ID=jot-talent-competitions-72b9f --app jot-talent-payment-api
heroku config:set FIREBASE_DATABASE_URL=https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com --app jot-talent-payment-api
heroku config:set ADMIN_EMAIL=your-email@example.com --app jot-talent-payment-api
heroku config:set NODE_ENV=production --app jot-talent-payment-api
heroku config:set ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5500 --app jot-talent-payment-api
```

- [ ] Verify variables set: `heroku config --app jot-talent-payment-api`
- [ ] All 8 variables displayed

### Deploy to Heroku
- [ ] First manual deploy: `git push heroku main`
- [ ] Watch logs: `heroku logs --tail --app jot-talent-payment-api`
- [ ] Wait for: "Procfile process running"
- [ ] Get app URL: `heroku apps:info jot-talent-payment-api`
- [ ] Note: `https://jot-talent-payment-api.herokuapp.com`

### Test Live Health Check
- [ ] Health endpoint: `curl https://jot-talent-payment-api.herokuapp.com/health`
- [ ] See response with:
  - [ ] `status: "OK"`
  - [ ] `environment: "production"`
  - [ ] `firebaseAvailable: true` (or false - if Firebase creds issues)

---

## Phase 5: Update Frontend (10 minutes)

### Update join.html
- [ ] Find SERVER_URL in join.html
- [ ] Replace with live URL detection:
  ```javascript
  const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.');
  const SERVER_URL = isProduction 
      ? 'https://jot-talent-payment-api.herokuapp.com'
      : 'http://localhost:5000';
  console.log('Using payment server:', SERVER_URL);
  ```
- [ ] Save file

### Git Commit & Push
- [ ] Commit changes: `git add . && git commit -m "Update: Frontend points to live server"`
- [ ] Push: `git push origin main`
- [ ] GitHub Actions should auto-deploy to Heroku

### Monitor Deployment
- [ ] Go to GitHub → Actions
- [ ] See deploy workflow running
- [ ] Wait for "Deployment successful"
- [ ] Check Heroku logs confirm deployment

---

## Phase 6: Live Testing (20 minutes)

### Test Payment on Live Server
- [ ] Update .env for local testing:
  ```
  SERVER_URL = "https://jot-talent-payment-api.herokuapp.com"
  ```
- [ ] Start frontend: `python -m http.server 8000`
- [ ] Open join.html
- [ ] Should say "Using payment server: https://jot-talent-payment-api.herokuapp.com"
- [ ] Click "Pay Now"
- [ ] Fill test payment form
- [ ] Submit payment
- [ ] Check:
  - [ ] Processing message appears
  - [ ] Server responds (check Heroku logs)
  - [ ] Either success or error returned
  - [ ] No CORS errors in browser console

### Check Firestore
- [ ] Go to Firebase Console
- [ ] Go to Firestore Database
- [ ] Check `payments` collection
- [ ] Verify transaction recorded:
  - [ ] transactionId created
  - [ ] amount recorded
  - [ ] email stored
  - [ ] status shows (PENDING or SUCCESS)

### Monitor Logs
```bash
heroku logs --app jot-talent-payment-api
```
- [ ] See payment request logged
- [ ] See ioTec response
- [ ] See Firestore store confirmation
- [ ] No error messages

---

## Phase 7: Setup Monitoring (15 minutes)

### Enable Heroku Monitoring
- [ ] Go to Heroku Dashboard
- [ ] Select app → Resources
- [ ] Ensure dyno is running
- [ ] Monitor metrics (may be empty at first)

### Setup UptimeRobot (Free Tier)
- [ ] Go to https://uptimerobot.com
- [ ] Sign up free
- [ ] Create monitor:
  - [ ] Type: HTTPS
  - [ ] URL: `https://jot-talent-payment-api.herokuapp.com/health`
  - [ ] Interval: 5 minutes
  - [ ] Alert: Email
- [ ] Enable alerts:
  - [ ] Email if down
  - [ ] Email on recovery

### Setup Logs Monitoring
- [ ] Save command: `heroku logs --tail --app jot-talent-payment-api`
- [ ] Run daily to check for errors
- [ ] Look for 500 errors or failed payments

---

## Phase 8: Security Hardening (20 minutes)

### Firebase Rules
- [ ] Go to Firebase Console → Firestore → Rules
- [ ] Review security rules (from SECURITY_BEST_PRACTICES.md)
- [ ] Verify:
  - [ ] Users can only read own data
  - [ ] Admins can read judges
  - [ ] Verification codes protected
  - [ ] Default deny all for unknown

### Backup Strategy
- [ ] Enable Firestore backups:
  - [ ] Firebase Console → Backups
  - [ ] Create scheduled backup
  - [ ] Daily at 2 AM UTC
  - [ ] Retain 30 days

### Rate Limiting
- [ ] Verify rate limiting in server-production.js
- [ ] Test: Submit many requests quickly → Should see 429 response

### HTTPS Check
- [ ] Visit: `https://jot-talent-payment-api.herokuapp.com/health`
- [ ] Check SSL certificate:
  - [ ] No warnings
  - [ ] Valid certificate
  - [ ] Expires in future

---

## Phase 9: Admin Setup (15 minutes)

### Create Admin Accounts
- [ ] In Firebase Console:
  - [ ] Go to Authentication
  - [ ] Add new users (judges)
  - [ ] Set custom claims: `{ "admin": true }` (optional)

### Test Admin Endpoints
- [ ] Get Firebase ID token for admin account
- [ ] Test `/admin/payments` endpoint:
  ```bash
  curl -H "Authorization: Bearer <token>" \
    https://jot-talent-payment-api.herokuapp.com/admin/payments
  ```
- [ ] Should return list of payments

### Create Judges
- [ ] Test `/admin/create-judge` endpoint
- [ ] Should create new judge in Firestore

---

## Phase 10: Final Verification (30 minutes)

### Complete Payment Journey
- [ ] User clicks "Pay Now"
- [ ] Fills form completely
- [ ] Submits payment
- [ ] Gets success/error response
- [ ] Transaction appears in Firestore
- [ ] Receives verification code (or email)
- [ ] Enters verification code
- [ ] Sees "Verified!" message
- [ ] Can see "Join Competition" button

### Performance Check
```bash
# Measure response times
time curl -X POST https://jot-talent-payment-api.herokuapp.com/process-payment \
  -H "Content-Type: application/json" \
  -d '{"amount":"10000","phone":"256700000000","email":"test@example.com"}'
```
- [ ] Response time < 5 seconds

### Error Handling
- [ ] Try invalid phone → Shows error
- [ ] Try invalid email → Shows error
- [ ] Try missing fields → Shows error
- [ ] Errors don't crash server
- [ ] Can retry after error

### Deployment Automation
- [ ] Make code change to server-production.js
- [ ] Commit: `git add . && git commit -m "test: automation"`
- [ ] Push: `git push origin main`
- [ ] Verify GitHub Actions runs
- [ ] Verify Heroku deploys automatically
- [ ] Verify new version live (check logs)

---

## Phase 11: Documentation & Handoff (15 minutes)

### Documentation Complete
- [ ] README.md up to date
- [ ] QUICK_START_LIVE.md reflects your setup
- [ ] API_DOCS.md created (if needed)
- [ ] DEPLOYMENT.md has your Heroku app details
- [ ] SECRET_SETUP.md describes credentials location

### Team Onboarding
- [ ] Share GitHub repo link
- [ ] Share admin credentials (via secure channel)
- [ ] Share Heroku dashboard access
- [ ] Share Firebase console access
- [ ] Document escalation procedures

### Create Runbook
- [ ] "What to do if payment system goes down"
- [ ] "How to check payment status"
- [ ] "How to view real-time logs"
- [ ] "How to contact support"

---

## Phase 12: Go-Live (5 minutes)

### Pre-Launch Check
- [ ] All 11 phases completed
- [ ] Live payment system tested
- [ ] Monitoring active
- [ ] Backups enabled
- [ ] Team trained
- [ ] Rollback plan ready

### Launch
- [ ] Announce to users: "Payments are now live!"
- [ ] Update website: Remove "Coming Soon"
- [ ] Monitor first hour closely
- [ ] Be ready to rollback if issues

### Post-Launch (First 24 hours)
- [ ] Monitor logs hourly
- [ ] Check payment success rate
- [ ] Verify emails sending
- [ ] Watch Firestore for errors
- [ ] Celebrate! 🎉

---

## Post-Launch Maintenance

### Daily (First Week)
- [ ] Check logs: `heroku logs --tail`
- [ ] Verify no errors
- [ ] Count successful payments
- [ ] Monitor error rates

### Weekly
- [ ] Review payment transactions
- [ ] Check Firestore storage usage
- [ ] Verify backups completed
- [ ] Monitor uptime metrics

### Monthly
- [ ] Run security audit
- [ ] Update dependencies: `npm update`
- [ ] Review API usage
- [ ] Check performance metrics
- [ ] Rotate credentials (quarterly)

---

## Rollback Plan (If Things Go Wrong)

### If Deployment Breaks
```bash
# See deployment history
heroku releases --app jot-talent-payment-api

# Rollback to previous version
heroku rollback v123 --app jot-talent-payment-api

# Verify it's back
curl https://jot-talent-payment-api.herokuapp.com/health
```

### If Database Issues
```bash
# Check Firebase status
# If down, requests queue and retry
# When back, all pending payments process

# Can restore from backup
# Timeline: < 1 hour recovery
```

### If ioTec API Down
```bash
# Payment attempts fail with 503
# Show user: "Payment service temporarily unavailable"
# User can retry when service back
# No money deducted (transaction in PENDING state)
```

---

## Success Criteria

You're done when:

- ✅ Backend deployed and running on Heroku
- ✅ Frontend points to live backend
- ✅ Payment processing works end-to-end
- ✅ Firestore records transactions
- ✅ Email verification working
- ✅ Monitoring and alerts active
- ✅ Backups enabled
- ✅ Security hardened
- ✅ Team trained
- ✅ Documentation complete

---

## Emergency Contacts

| Issue | Contact | Response Time |
|-------|---------|----------------|
| Server down | Check `heroku status` | Immediate |
| Payment fails | Check ioTec API status | 5 minutes |
| Database down | Check Firebase status | Automatic recovery |
| Payment stuck | Check transaction in Firestore | 30 minutes manual |
| User issue | Email support + check logs | 1 hour |

---

## Final Sign-Off

- **Prepared by**: AI Assistant
- **Date**: November 14, 2025
- **System**: JOT Talent Competitions Payment Platform
- **Status**: Ready for Production
- **Version**: 2.0.0

---

**Estimated Total Time**: 3-4 hours for first deployment

**Recommended**: Do Phase 1-6 today, Phase 7-12 tomorrow after testing

👉 **Next Step**: Start Phase 1 with [QUICK_START_LIVE.md](./QUICK_START_LIVE.md)
