# 🚀 Copy & Paste Commands to Go LIVE

## ⚠️ Prerequisites
- Git installed: https://git-scm.com/download/win
- GitHub account: https://github.com/signup
- Heroku account: https://www.heroku.com/signup

---

## Command 1: Initialize Git

```powershell
cd c:\Users\Administrator\Desktop\jot-comps-main
git init
```

---

## Command 2: Add All Files

```powershell
git add .
```

---

## Command 3: First Commit

```powershell
git commit -m "Initial commit: Live payment system"
```

---

## Command 4: Rename Branch to Main

```powershell
git branch -M main
```

---

## Command 5: Add GitHub Remote

⚠️ **Replace `YOUR_USERNAME` with your actual GitHub username**

```powershell
git remote add origin https://github.com/YOUR_USERNAME/jot-talent-competitions.git
```

**Example:**
```powershell
git remote add origin https://github.com/john-smith/jot-talent-competitions.git
```

---

## Command 6: Push to GitHub

```powershell
git push -u origin main
```

**When prompted:**
- Username: `YOUR_GITHUB_USERNAME`
- Password: `YOUR_GITHUB_TOKEN` (from https://github.com/settings/tokens)

---

## Command 7: Check Deployment Status

```powershell
heroku logs --tail --app jot-talent-payment-api
```

---

## Command 8: Test Health Endpoint

```powershell
curl https://jot-talent-payment-api.herokuapp.com/health
```

Or visit in browser:
```
https://jot-talent-payment-api.herokuapp.com/health
```

---

## After Each Change (Auto-Deploy)

Whenever you make changes:

```powershell
git add .
git commit -m "Your change description"
git push origin main
```

It automatically deploys to Heroku! ✅

---

## Check Everything is Working

Visit in your browser:
```
https://jot-talent-payment-api.herokuapp.com/health
```

You should see:
```json
{
  "status": "OK",
  "message": "Payment server is running",
  "environment": "production"
}
```

---

## 🎉 Done!

Your payment system is now **LIVE** and accepting payments! 🚀
