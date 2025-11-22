# 🔧 Fix "Failed to Fetch" Error - Complete Solution

## 🎯 The Problem

Your payment system shows **"failed to fetch"** because:

1. **Server not running** - The backend server (`http://localhost:5000`) doesn't exist or isn't running
2. **CORS errors** - Frontend and backend have mismatched origins
3. **ioTec API unreachable** - Direct calls from browser to ioTec fail due to CORS
4. **Local-only development** - System only works when running `node server.js` locally

---

## ✅ The Solution: Deploy to Heroku Using GitHub

When you deploy using GitHub + Heroku:

1. ✅ Backend runs on a **live public URL** (not localhost)
2. ✅ CORS properly configured between frontend and backend
3. ✅ ioTec API calls go through **secure backend** (no CORS issues)
4. ✅ System is **live 24/7** for real payments

---

## 🚀 Step-by-Step Fix

### Part 1: Prepare Your Code

**Status: ✅ DONE**

Your code already has:
- ✅ Production server (`server-production.js`)
- ✅ Dynamic server detection in `join.html`
- ✅ GitHub Actions workflow setup (`.github/workflows/deploy-heroku.yml`)
- ✅ All environment variables configured

### Part 2: Install Git (5 minutes)

**Windows:**
1. Download Git: https://git-scm.com/download/win
2. Run installer, accept all defaults
3. Restart computer
4. Open PowerShell and verify:
   ```powershell
   git --version
   ```

**Expected output:**
```
git version 2.42.0 (or newer)
```

**Error? Try:**
- Restart PowerShell/command line
- If still fails, restart computer

---

### Part 3: Create GitHub Account & Repository

1. Go to https://github.com/signup
2. Create account with your email
3. After signing up, click **+** → **New repository**
4. Name: `jot-talent-competitions`
5. Description: `Live payment system for JOT Talent Competitions`
6. Click **Create repository**
7. **Copy the URL** - looks like `https://github.com/YOUR_USERNAME/jot-talent-competitions.git`

---

### Part 4: Upload Code to GitHub

Open PowerShell in your project folder:

```powershell
cd c:\Users\Administrator\Desktop\jot-comps-main
```

Then run:

```powershell
git init
git add .
git commit -m "Initial commit: Live payment system with ioTec integration"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/jot-talent-competitions.git
git push -u origin main
```

**When prompted for credentials:**
- Username: Your GitHub username
- Password: Go to https://github.com/settings/tokens and create a "Personal Access Token"
- Paste that token as password

---

### Part 5: Create Heroku App

1. Sign up at https://www.heroku.com/signup
2. Create new app: Click **Create new app**
3. App name: `jot-talent-payment-api`
4. Region: **Europe** (or closest to you)
5. Click **Create app**
6. Note the URL: `https://jot-talent-payment-api.herokuapp.com`

---

### Part 6: Add Environment Variables to Heroku

In Heroku dashboard for your app:

1. Go to **Settings** tab
2. Click **Reveal Config Vars**
3. Add these variables:

| Key | Value |
|-----|-------|
| `IOTEC_CLIENT_ID` | `pay-caed774a-d7d0-4a74-b751-5b77be5b3911` |
| `IOTEC_CLIENT_SECRET` | `IO-BdUCLRbm7xxYyz35WqpSu2QcPqrP3Eigg` |
| `IOTEC_WALLET_ID` | `a563af4c-3137-4085-a888-93bdf3fb29b4` |
| `FIREBASE_PROJECT_ID` | `jot-talent-competitions-72b9f` |
| `DATABASE_URL` | `https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com` |
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL` | `admin@jottalent.com` |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5000,https://jot-talent-payment-api.herokuapp.com` |

---

### Part 7: Connect GitHub to Heroku for Auto-Deploy

In Heroku dashboard:

1. Go to **Deploy** tab
2. Under "Deployment method", click **GitHub**
3. Click **Connect to GitHub**
4. Select your repository: `jot-talent-competitions`
5. Under "Automatic deploys", select **main** branch
6. Click **Enable Automatic Deploys**

**Result:** Every time you push to GitHub, it automatically deploys to Heroku! 🚀

---

### Part 8: Add GitHub Secrets for CI/CD

Go to your GitHub repository:

1. Settings → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add these secrets:

| Name | Value |
|------|-------|
| `HEROKU_API_KEY` | Get from Heroku account settings |
| `HEROKU_APP_NAME` | `jot-talent-payment-api` |
| `HEROKU_EMAIL` | Your Heroku email |
| `IOTEC_CLIENT_ID` | `pay-caed774a-d7d0-4a74-b751-5b77be5b3911` |
| `IOTEC_CLIENT_SECRET` | `IO-BdUCLRbm7xxYyz35WqpSu2QcPqrP3Eigg` |
| `IOTEC_WALLET_ID` | `a563af4c-3137-4085-a888-93bdf3fb29b4` |
| `FIREBASE_PROJECT_ID` | `jot-talent-competitions-72b9f` |
| `DATABASE_URL` | `https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com` |
| `ADMIN_EMAIL` | `admin@jottalent.com` |
| `ALLOWED_ORIGINS` | `https://jot-talent-payment-api.herokuapp.com` |

---

### Part 9: First Deployment

Make a small change and push to GitHub:

```powershell
git add .
git commit -m "Deploy to Heroku"
git push origin main
```

GitHub Actions will automatically:
1. ✅ Run tests
2. ✅ Deploy to Heroku
3. ✅ Run health check
4. ✅ Notify you on success/failure

---

### Part 10: Test the Live System

**Check if deployment worked:**

```powershell
curl https://jot-talent-payment-api.herokuapp.com/health
```

**Expected response:**
```json
{
  "status": "OK",
  "message": "Payment server is running",
  "environment": "production",
  "firebaseAvailable": true
}
```

---

### Part 11: Update Your Website

Update your website to point to the live server:

**In your HTML files, replace:**
```html
<script>
  const SERVER_URL = "http://localhost:5000";
</script>
```

**With:**
```html
<script>
  const SERVER_URL = "https://jot-talent-payment-api.herokuapp.com";
</script>
```

Or use the automatic detection (already in join.html):
```javascript
const SERVER_URL = (function() {
    const hostname = window.location.hostname;
    if (hostname.includes('herokuapp.com')) {
        return 'https://' + hostname;
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    return window.location.origin;
})();
```

---

### Part 12: Test Payment

1. Visit your website
2. Click **"Pay Now"** button
3. Enter test details:
   - Amount: UGX 10,000
   - Phone: +256700000000
   - Email: test@example.com
   - Name: Test User

**What happens:**
- ✅ Request goes to Heroku
- ✅ Heroku calls ioTec API securely
- ✅ Payment processed
- ✅ No more "failed to fetch"! 🎉

---

## 🐛 If It Still Fails

### Check Heroku Logs

```powershell
heroku logs --tail --app jot-talent-payment-api
```

### Common Issues & Fixes

#### Issue: "Remote rejected" when pushing to GitHub
**Fix:** Make sure you created the Personal Access Token at https://github.com/settings/tokens

#### Issue: Heroku deployment says "Build failed"
**Fix:**
1. Check Heroku logs: `heroku logs --app jot-talent-payment-api`
2. Make sure `.gitignore` includes `node_modules`
3. Check `package.json` is in root folder

#### Issue: Health check returns "firebaseAvailable": false
**Fix:**
1. Make sure `serviceAccountKey.json` exists
2. Or set `FIREBASE_PROJECT_ID` environment variable
3. Contact Firebase support if still failing

#### Issue: Payment still says "failed to fetch"
**Fix:**
1. Check browser console for actual error (F12 → Console)
2. Check Heroku logs
3. Make sure ioTec credentials are correct
4. Try from a different browser

---

## 🎯 Success Checklist

- [ ] Git installed and working (`git --version`)
- [ ] GitHub account created
- [ ] Repository created and code pushed
- [ ] Heroku app created
- [ ] Environment variables added to Heroku
- [ ] GitHub connected to Heroku for auto-deploy
- [ ] GitHub Actions secrets configured
- [ ] Health check returns 200 OK
- [ ] Payment test goes through
- [ ] Money received in ioTec account ✅

---

## 📚 Reference URLs

| Task | URL |
|------|-----|
| Download Git | https://git-scm.com/download/win |
| Create GitHub Account | https://github.com/signup |
| Create GitHub Token | https://github.com/settings/tokens |
| Heroku Signup | https://www.heroku.com/signup |
| Heroku API Key | https://dashboard.heroku.com/account/applications/authorizations/new |
| Check Heroku Logs | `heroku logs --tail --app jot-talent-payment-api` |

---

## 🎉 You're Done!

Your payment system is now **LIVE** and accepting real payments online! 🚀

**People can now:**
- ✅ Visit your website
- ✅ Pay to join competition
- ✅ Receive money in your ioTec wallet
- ✅ Everything is automated

**Total time:** ~30 minutes
**Cost:** FREE (Heroku free tier + GitHub free)
**Live:** 99.9% uptime guarantee
