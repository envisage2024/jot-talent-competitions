# ⚡ QUICK CHECKLIST: Make Payment System Live

## Before You Start
- [ ] You have internet connection
- [ ] You have a valid email address
- [ ] You have this folder: `c:\Users\Administrator\Desktop\jot-comps-main`

---

## Part 1: Install Requirements (15 min)

### Git Installation
```
1. Go to: https://git-scm.com/download/win
2. Download Git for Windows 64-bit
3. Run installer
4. Click "Next" through all screens
5. Finish and RESTART your computer
```

### Verify Git Works
```powershell
# Open PowerShell and run:
git --version
# Should show: git version X.X.X
```

---

## Part 2: GitHub Setup (10 min)

### Create GitHub Account
```
1. Go to: https://github.com/signup
2. Enter email and password
3. Verify email
4. ✅ Account created
```

### Create Repository
```
1. Go to: https://github.com/new
2. Name: jot-talent-competitions
3. Choose: Public
4. Create repository
```

### Create Personal Access Token
```
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: "Payment System Deploy"
4. Check: repo, workflow
5. Generate & COPY token (save it!)
```

---

## Part 3: Push Code to GitHub (10 min)

### Open PowerShell
Press Windows + R, type `powershell`, press Enter

### Run Commands One By One
```powershell
cd c:\Users\Administrator\Desktop\jot-comps-main

git init

git add .

git commit -m "Initial commit: Live payment system"

git branch -M main

git remote add origin https://github.com/YOUR_USERNAME/jot-talent-competitions.git

git push -u origin main
```

**When asked for password: Paste your GitHub token (not your password!)**

---

## Part 4: Heroku Setup (15 min)

### Create Heroku Account
```
1. Go to: https://www.heroku.com/signup
2. Enter email and password
3. Verify email
4. ✅ Account created
```

### Create Heroku App
```
1. Go to: https://dashboard.heroku.com/apps
2. Click "New" → "Create new app"
3. Name: jot-talent-payment-api
4. Create app
5. ✅ App created
```

### Add Environment Variables
1. Click "Settings" tab
2. Click "Reveal Config Vars"
3. Add all these (click "Add" for each):

```
IOTEC_CLIENT_ID = pay-caed774a-d7d0-4a74-b751-5b77be5b3911
IOTEC_CLIENT_SECRET = IO-BdUCLRbm7xxYyz35WqpSu2QcPqrP3Eigg
IOTEC_WALLET_ID = a563af4c-3137-4085-a888-93bdf3fb29b4
FIREBASE_PROJECT_ID = jot-talent-competitions-72b9f
FIREBASE_DATABASE_URL = https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com
NODE_ENV = production
ADMIN_EMAIL = your-email@gmail.com
```

---

## Part 5: Deploy (5 min)

### Connect GitHub to Heroku
```
1. In Heroku app, go to "Deploy" tab
2. Click "Connect to GitHub"
3. Search: jot-talent-competitions
4. Click "Connect"
5. Click "Deploy Branch"
6. Wait for green checkmark ✅
```

### Test It Works
```
Visit: https://jot-talent-payment-api.herokuapp.com/health

Should see:
{
  "status": "OK",
  "message": "Payment server is running"
}
```

---

## Part 6: Update Website (5 min)

### Edit join.html
Find:
```javascript
const SERVER_URL = "http://localhost:5000";
```

Replace with:
```javascript
const isProduction = window.location.hostname !== 'localhost';
const SERVER_URL = isProduction 
    ? 'https://jot-talent-payment-api.herokuapp.com'
    : 'http://localhost:5000';
```

### Push Update to GitHub
```powershell
git add .
git commit -m "Update: Use live payment server"
git push origin main
```

---

## Part 7: Test Payment (10 min)

1. Open your `join.html` website
2. Click "Pay Now"
3. Fill in form:
   - Phone: 256700000000
   - Email: test@example.com
   - Amount: 10000
   - Name: Test User
4. Click "Pay Now"
5. Should see success message ✅

---

## 🎉 YOU'RE LIVE!

**Your payment system is now accepting REAL PAYMENTS!**

---

## ✅ Final Checklist

- [ ] Git installed & working (`git --version` works)
- [ ] GitHub account created
- [ ] GitHub repository created
- [ ] Code pushed to GitHub (`git push` successful)
- [ ] Heroku account created
- [ ] Heroku app created (jot-talent-payment-api)
- [ ] Environment variables added (8 of them)
- [ ] GitHub connected to Heroku
- [ ] Deployed to Heroku (green checkmark)
- [ ] Health check working (URL returns OK)
- [ ] join.html updated with live URL
- [ ] Test payment successful
- [ ] **LIVE! Anyone can now make payments!** 🎊

---

## 💡 From Now On

**To update your system:**
```powershell
# Make changes to files
# Then run:
git add .
git commit -m "Your message"
git push origin main
# Automatically deploys to Heroku!
```

---

## 📞 If Something Goes Wrong

### Can't connect to GitHub
- Check you created Personal Access Token
- Use token as password (not your GitHub password)

### Heroku deployment fails
- Check all 8 environment variables are set
- Check health endpoint: `/health`

### Payment doesn't work
- Make sure Heroku app is running
- Check logs: `heroku logs --tail --app jot-talent-payment-api`

---

## 🎯 Total Time: ~1 Hour

- Install Git: 5 min
- GitHub setup: 10 min
- Push code: 10 min
- Heroku setup: 15 min
- Deploy: 5 min
- Update website: 5 min
- Test: 10 min
- **TOTAL: ~60 minutes to LIVE!** ⚡

---

**You now have a LIVE PAYMENT SYSTEM! 🚀**

Anyone who accesses your website can make payments online!
