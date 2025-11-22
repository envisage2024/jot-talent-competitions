# 🚀 Quick Start: Deploy Payment System Live with GitHub & Heroku

## ⏱️ Time Required: 15-20 minutes

---

## Step 1: Prepare Your GitHub Repository (3 min)

### 1.1 Create `.gitignore`
```bash
# Already done - check that these are NOT committed:
# .env
# serviceAccountKey.json
# node_modules/
```

### 1.2 Push to GitHub
```bash
cd c:\Users\Administrator\Desktop\jot-comps-main
git init
git add .
git commit -m "Deploy: Live payment system with Heroku integration"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/jot-talent-competitions.git
git push -u origin main
```

---

## Step 2: Set Up Heroku (5 min)

### 2.1 Create Heroku Account
- Go to https://www.heroku.com
- Sign up for free account
- Verify email

### 2.2 Install Heroku CLI
**Windows:**
```bash
# Download from: https://cli-assets.heroku.com/branches/main/heroku-windows-x64.exe
# Or use Chocolatey:
choco install heroku-cli
```

**Verify installation:**
```bash
heroku --version
```

### 2.3 Create Heroku App
```bash
heroku login
heroku create jot-talent-payment-api
```

Your app will be at: `https://jot-talent-payment-api.herokuapp.com`

---

## Step 3: Configure Secrets on GitHub (3 min)

### 3.1 Create GitHub API Token
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scope: `repo`
4. Copy token

### 3.2 Create Heroku API Token
1. Go to https://dashboard.heroku.com/account/applications/tokens
2. Click "Create authorization"
3. Copy token

### 3.3 Add Secrets to GitHub
1. Go to GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add these secrets:

```
HEROKU_API_KEY: [your Heroku token from Step 3.2]
HEROKU_APP_NAME: jot-talent-payment-api
```

---

## Step 4: Set Environment Variables on Heroku (4 min)

```bash
# Login to Heroku
heroku login

# Set ioTec credentials
heroku config:set IOTEC_CLIENT_ID=pay-caed774a-d7d0-4a74-b751-5b77be5b3911 --app jot-talent-payment-api
heroku config:set IOTEC_CLIENT_SECRET=IO-BdUCLRbm7xxYyz35WqpSu2QcPqrP3Eigg --app jot-talent-payment-api
heroku config:set IOTEC_WALLET_ID=a563af4c-3137-4085-a888-93bdf3fb29b4 --app jot-talent-payment-api

# Set Firebase config
heroku config:set FIREBASE_PROJECT_ID=jot-talent-competitions-72b9f --app jot-talent-payment-api
heroku config:set FIREBASE_DATABASE_URL=https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com --app jot-talent-payment-api

# Set admin email
heroku config:set ADMIN_EMAIL=your-email@gmail.com --app jot-talent-payment-api

# Set environment
heroku config:set NODE_ENV=production --app jot-talent-payment-api

# Set CORS allowed origins (UPDATE with your frontend URL)
heroku config:set ALLOWED_ORIGINS=https://YOUR_USERNAME.github.io/jot-talent-competitions,http://localhost:3000 --app jot-talent-payment-api
```

### For Firebase Service Account (if deploying without local file):
```bash
# Generate from Firebase Console -> Project Settings -> Service Accounts
heroku config:set FIREBASE_PRIVATE_KEY_ID=your_key_id --app jot-talent-payment-api
heroku config:set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n....\n-----END PRIVATE KEY-----" --app jot-talent-payment-api
heroku config:set FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@jot-talent-competitions-72b9f.iam.gserviceaccount.com --app jot-talent-payment-api
heroku config:set FIREBASE_CLIENT_ID=1234567890 --app jot-talent-payment-api
```

---

## Step 5: Deploy Backend (2 min)

### Option A: Via Git Push (Automatic)
```bash
# This will trigger GitHub Actions which auto-deploys to Heroku
git add .
git commit -m "chore: production deployment setup"
git push origin main
```

### Option B: Manual Heroku Deployment
```bash
heroku login
git push heroku main
```

---

## Step 6: Verify Deployment (2 min)

### Check if server is running:
```bash
heroku logs --tail --app jot-talent-payment-api
```

### Test health endpoint:
```bash
curl https://jot-talent-payment-api.herokuapp.com/health
```

Expected response:
```json
{
  "status": "OK",
  "message": "Payment server is running",
  "environment": "production",
  "firebaseAvailable": true
}
```

---

## Step 7: Update Frontend to Use Live Server (1 min)

### In `join.html`, change SERVER_URL:

Find this section:
```html
<script>
    // Server URL
    const SERVER_URL = "http://localhost:5000";
```

Replace with:
```html
<script>
    // Detect environment and use appropriate server
    const isProduction = window.location.hostname !== 'localhost' && !window.location.hostname.startsWith('127.');
    
    const SERVER_URL = isProduction 
        ? 'https://jot-talent-payment-api.herokuapp.com' // Live production server
        : 'http://localhost:5000'; // Local development
    
    console.log('Using payment server:', SERVER_URL);
</script>
```

---

## 🎉 YOU'RE LIVE!

Your payment system is now live at:
- **Backend API**: `https://jot-talent-payment-api.herokuapp.com`
- **Health Check**: `https://jot-talent-payment-api.herokuapp.com/health`

---

## Testing Live Payment

1. Go to your website
2. Click "Join Competition"
3. Click "Pay Now"
4. Use test credentials from ioTec
5. Verify payment appears in Heroku logs

---

## Troubleshooting

### ❌ Heroku App Won't Start
```bash
heroku logs --tail --app jot-talent-payment-api
# Look for error messages
```

### ❌ CORS Errors in Browser Console
Update ALLOWED_ORIGINS:
```bash
heroku config:set ALLOWED_ORIGINS=https://your-frontend-url.com,http://localhost:3000 --app jot-talent-payment-api
```

### ❌ Firebase Not Connecting
Verify credentials are set:
```bash
heroku config --app jot-talent-payment-api
```

### ❌ Payment Fails
1. Check ioTec credentials
2. Verify wallet has balance
3. Check phone number format

---

## Optional: Set Up Custom Domain

### Add Domain to Heroku
```bash
heroku domains:add payment-api.yourdomain.com --app jot-talent-payment-api
```

Then update DNS:
```
Type: CNAME
Name: payment-api
Value: jot-talent-payment-api.herokuapp.com
```

---

## Optional: Set Up Automatic Backups

In `.github/workflows/backup.yml`:
```yaml
name: Daily Backup
on:
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Backup Firebase
        run: |
          firebase projects:list
          # Add backup script here
```

---

## Next Steps

1. ✅ Monitor Heroku logs daily
2. ✅ Set up payment success email notifications
3. ✅ Configure admin dashboard for payment tracking
4. ✅ Add SMS notifications for payments
5. ✅ Enable 2FA for GitHub & Heroku

---

## Need Help?

- **Heroku Docs**: https://devcenter.heroku.com/
- **GitHub Actions**: https://docs.github.com/en/actions
- **Firebase**: https://firebase.google.com/docs
- **ioTec**: https://iotec.io/docs

---

**Last Updated**: November 14, 2025
**Version**: 2.0.0
