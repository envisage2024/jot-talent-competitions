# 🚀 Quick Fix Reference - "Failed to Fetch" Error

## The Issue
Every payment shows: **"Error: Failed to fetch"**

## The Cause
Server is local-only (`http://localhost:5000`)

## The Fix
Deploy to Heroku in **3 commands**:

```powershell
# 1. Push code to GitHub
git push origin main

# 2. Heroku auto-deploys (via GitHub Actions)
# Wait 2-3 minutes for automatic deployment

# 3. Verify it works
curl https://jot-talent-payment-api.herokuapp.com/health
```

---

## ⚡ Fast Setup (15 minutes)

### 1️⃣ Install Git (5 min)
- Download: https://git-scm.com/download/win
- Install with defaults
- Restart computer
- Verify: `git --version`

### 2️⃣ Upload to GitHub (5 min)
```powershell
cd c:\Users\Administrator\Desktop\jot-comps-main
git init
git add .
git commit -m "Add production payment system"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/jot-talent-competitions.git
git push -u origin main
```

### 3️⃣ Deploy on Heroku (5 min)
1. Sign up: https://www.heroku.com/signup
2. Create app: `jot-talent-payment-api`
3. Connect GitHub in Deploy tab
4. Select `main` branch
5. Click "Enable Automatic Deploys"

---

## ✅ Done!

Your system is now **LIVE**:
- ✅ Frontend: Works on your website
- ✅ Backend: Runs on Heroku
- ✅ Payments: Go through ioTec
- ✅ Auto-deploy: Every time you push code

---

## 🧪 Quick Test

```powershell
# Health check
curl https://jot-talent-payment-api.herokuapp.com/health

# Expected: { "status": "OK", "environment": "production" }
```

---

## 📝 Complete Guide
See: `FIX_FAILED_TO_FETCH_ERROR.md`

---

## 🆘 Still Getting "Failed to Fetch"?

**Check:**
1. Is Heroku app created? → https://dashboard.heroku.com
2. Is code pushed? → `git push origin main`
3. Did deploy complete? → Check deploy status in Heroku
4. Is server responding? → `curl https://jot-talent-payment-api.herokuapp.com/health`

**If yes to all above, but still failing:**
1. Check browser console (F12)
2. Check Heroku logs: `heroku logs --tail --app jot-talent-payment-api`
3. Check network requests (F12 → Network tab)

---

## 🎯 One-Line Summary

**From:** Local payment system that doesn't work  
**To:** Live 24/7 payment system accepting real money  
**How:** GitHub + Heroku (free, automated)  
**Time:** 15 minutes  
**Cost:** FREE  
