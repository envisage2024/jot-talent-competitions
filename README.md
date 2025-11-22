# JOT TALENT COMPETITIONS - Payment System

[![Heroku](https://img.shields.io/badge/Deployed%20on-Heroku-430098?logo=heroku)](https://jot-talent-payment-api.herokuapp.com)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)](https://nodejs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFA500?logo=firebase)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-ISC-blue)](#license)

A production-ready online payment system for the Jot Talent Competitions platform. Handles payments, email verification, and competition registration using ioTec's mobile money API.

## ✨ Features

- 💳 **Mobile Money Payments** via ioTec
- ✉️ **Email Verification** for secure registration
- 🔐 **Secure Backend** with rate limiting and input validation
- 🚀 **One-click Deployment** to Heroku via GitHub Actions
- 📊 **Payment Tracking** in Firebase Firestore
- 🔒 **Production-grade Security** with CORS, HTTPS, and environment variables
- 📱 **Responsive UI** for all devices
- 🛡️ **Admin API** for managing judges and payments

## 🚀 Quick Start (15 minutes)

### Prerequisites
- Node.js 16+
- GitHub account
- Heroku account
- ioTec credentials
- Firebase project

### Local Development

```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/jot-talent-competitions.git
cd jot-talent-competitions

# 2. Install dependencies
npm install

# 3. Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env with your credentials

# 4. Start backend
npm start

# 5. Serve frontend (in another terminal)
python -m http.server 8000
# Visit http://localhost:8000/join.html
```

### Deploy to Production

```bash
# 1. Create Heroku app
heroku login
heroku create jot-talent-payment-api

# 2. Set environment variables
heroku config:set IOTEC_CLIENT_ID=your_id \
  IOTEC_CLIENT_SECRET=your_secret \
  IOTEC_WALLET_ID=your_wallet \
  NODE_ENV=production

# 3. Deploy via Git (or GitHub Actions)
git push heroku main
```

See [QUICK_START_LIVE.md](./QUICK_START_LIVE.md) for detailed instructions.

---

## 📋 Architecture

```
Frontend (HTML/CSS/JS)
    ↓
join.html ← Payment UI & forms
    ↓
[Browser] → [HTTPS] → [Heroku Server]
    ↓
server-production.js
    ├── POST /process-payment ← ioTec API
    ├── GET /payment-status
    ├── POST /verify-email
    └── /admin/* endpoints
    ↓
Firebase Firestore (Payments, Users, Codes)
```

## 📁 Project Structure

```
jot-comps-main/
├── join.html                      # Competition join & payment UI
├── server-production.js           # Production Node.js backend ⭐
├── package.json                   # Dependencies
├── Procfile                       # Heroku configuration
├── .env.example                   # Environment template
├── .gitignore                     # Git ignore rules
├── .github/workflows/
│   └── deploy-heroku.yml         # Auto-deploy on Git push
├── PAYMENT_SETUP_GUIDE.md        # Full integration guide
├── QUICK_START_LIVE.md           # 15-min deploy guide
├── SECURITY_BEST_PRACTICES.md    # Security hardening
├── README.md                      # This file
├── css/                          # Stylesheets
├── js/                           # JavaScript files
└── images/                       # Assets
```

## 🔧 API Endpoints

### Public Endpoints

#### Process Payment
```http
POST /process-payment
Content-Type: application/json

{
  "amount": "10000",
  "method": "MobileMoney",
  "phone": "256700000000",
  "email": "user@example.com",
  "name": "John Doe",
  "currency": "UGX",
  "competitionId": "firstRound"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "TXN_1234567890_abc123",
  "status": "PENDING"
}
```

#### Check Payment Status
```http
GET /payment-status/{transactionId}
```

#### Send Verification Code
```http
POST /send-verification-code
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Verify Email
```http
POST /verify-email
Content-Type: application/json

{
  "email": "user@example.com",
  "verificationCode": "123456",
  "transactionId": "TXN_xxx"
}
```

#### Health Check
```http
GET /health
```

### Admin Endpoints (Requires Firebase ID Token)

#### Get All Payments
```http
GET /admin/payments
Authorization: Bearer {idToken}
```

#### Create Judge
```http
POST /admin/create-judge
Authorization: Bearer {idToken}

{
  "email": "judge@example.com",
  "password": "secure_password",
  "name": "Judge Name",
  "bio": "Bio text"
}
```

See `server-production.js` for all endpoints.

## 🔐 Security

- [x] **CORS Protection** - Restricted to allowed origins
- [x] **Rate Limiting** - Prevents abuse
- [x] **Environment Variables** - No secrets in code
- [x] **HTTPS Enforced** - All traffic encrypted
- [x] **Input Validation** - All fields validated
- [x] **Error Handling** - No sensitive info leaked
- [x] **Firebase Rules** - Access control enforced

See [SECURITY_BEST_PRACTICES.md](./SECURITY_BEST_PRACTICES.md) for complete security guide.

## 📊 Monitoring

### Logs
```bash
# Real-time logs
heroku logs --tail --app jot-talent-payment-api

# Recent logs
heroku logs -n 100 --app jot-talent-payment-api

# Error logs only
heroku logs --app jot-talent-payment-api | grep ERROR
```

### Uptime Monitoring
- Set up UptimeRobot to monitor `/health` endpoint
- Get alerts if server goes down

### Performance
```bash
# Check dyno stats
heroku ps --app jot-talent-payment-api

# View resource usage
heroku metrics:web --app jot-talent-payment-api
```

## 🔄 Payment Flow

1. **User fills form** with amount, phone, email
2. **Frontend calls** `/process-payment`
3. **Backend validates** input and contacts ioTec
4. **ioTec processes** payment via mobile money
5. **Backend stores** transaction in Firestore
6. **Verification code sent** to email
7. **User enters code** to verify email
8. **Backend confirms** registration
9. **User can now submit** competition entry

## 💾 Database Schema

### Collections

#### `payments`
```javascript
{
  transactionId: "TXN_xxx",
  ioTecTransactionId: "io_xxx",
  amount: 10000,
  currency: "UGX",
  method: "MobileMoney",
  phone: "256700000000",
  email: "user@example.com",
  name: "John Doe",
  competitionId: "firstRound",
  status: "PENDING|SUCCESS|FAILED",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `verificationCodes`
```javascript
{
  code: "123456",
  timestamp: Timestamp,
  used: false,
  attempts: 0
}
```

#### `users`
```javascript
{
  email: "user@example.com",
  verified: true,
  competitions: ["firstRound"],
  verifiedAt: Timestamp
}
```

#### `judges`
```javascript
{
  name: "Judge Name",
  email: "judge@example.com",
  bio: "Bio",
  role: "judge",
  reviewedCount: 0,
  createdAt: Timestamp
}
```

## 🔧 Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Server
NODE_ENV=production
PORT=5000

# ioTec Payment Provider
IOTEC_CLIENT_ID=your_id
IOTEC_CLIENT_SECRET=your_secret
IOTEC_WALLET_ID=your_wallet

# Firebase
FIREBASE_PROJECT_ID=your_project
FIREBASE_DATABASE_URL=your_url

# Admin
ADMIN_EMAIL=admin@example.com
```

## 📱 Frontend Integration

Update `join.html` to use live server:

```javascript
const isProduction = window.location.hostname !== 'localhost';
const SERVER_URL = isProduction 
  ? 'https://jot-talent-payment-api.herokuapp.com'
  : 'http://localhost:5000';
```

## 🚀 Deployment Options

- **Heroku** (Recommended) - One-click deployment
- **Railway.app** - Modern alternative
- **Google Cloud Run** - Production grade
- **GitHub Pages** - Frontend hosting

See [PAYMENT_SETUP_GUIDE.md](./PAYMENT_SETUP_GUIDE.md) for all options.

## 🐛 Troubleshooting

### Payment endpoint returns 503
```bash
# Check if server is running
heroku logs --tail --app jot-talent-payment-api

# Restart server
heroku restart --app jot-talent-payment-api
```

### CORS errors in browser
```bash
# Update allowed origins
heroku config:set ALLOWED_ORIGINS=https://your-frontend.com
```

### Firebase connection fails
- Check internet connection
- Verify Firebase credentials
- Check `.env` file has correct values

### Payment times out
- Check ioTec API status
- Verify phone number format
- Check wallet balance

## 📈 Scaling

As traffic grows:

1. **Upgrade Heroku Dyno** (Basic → Standard)
2. **Add Caching** with Redis
3. **Database Optimization** - Add Firestore indexes
4. **Load Balancing** - Multiple Heroku dynos
5. **CDN** - Cloudflare or CloudFront

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📝 License

ISC License - See LICENSE file for details

## 👥 Support

- **Issues**: Open GitHub issue
- **Email**: support@jottalent.com
- **Documentation**: See docs/ folder

## 🎯 Roadmap

- [ ] SMS notifications
- [ ] Multiple payment providers (Stripe, PayPal)
- [ ] Admin dashboard
- [ ] Automated receipts
- [ ] Payment analytics
- [ ] Refund processing
- [ ] Subscription payments

## ✅ Checklist for Going Live

- [x] Backend deployed to Heroku
- [x] Environment variables configured
- [x] Firebase Firestore setup
- [x] Email verification working
- [ ] Payment testing completed
- [ ] SSL certificate verified
- [ ] Admin accounts created
- [ ] Backup strategy implemented
- [ ] Monitoring enabled
- [ ] Security audit passed

## 📞 Contact

**Jot Talent Team**
- Website: https://jottalent.com
- Email: admin@jottalent.com
- Support: https://jottalent.com/support

---

**Last Updated**: November 14, 2025
**Version**: 2.0.0
**Status**: 🟢 Production Ready

![Payment System Diagram](docs/architecture.png)
