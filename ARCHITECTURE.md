# 🏗️ Deployment Architecture & Data Flow

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USERS' BROWSERS                                 │
│  (join.html - Payment UI - React/Vue/Plain JS)                         │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ User fills:                                                      │  │
│  │ - Amount (10,000 UGX)                                            │  │
│  │ - Phone Number (256700000000)                                    │  │
│  │ - Email (user@example.com)                                       │  │
│  │ - Name                                                           │  │
│  │                                                                  │  │
│  │ Click: "Pay Now" → Send to backend                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────┬─────────────────────────────────────────────────────────────┘
             │
             │ HTTPS POST /process-payment
             │ (JSON: amount, phone, email, etc.)
             ↓
┌────────────────────────────────────────────────────────────────────────┐
│                    HEROKU SERVER                                       │
│  (Node.js + Express - server-production.js)                           │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ PAYMENT PROCESSING FLOW:                                        │ │
│  │                                                                  │ │
│  │ 1. Validate input                                              │ │
│  │    - Check phone format                                        │ │
│  │    - Verify email                                              │ │
│  │    - Validate amount                                           │ │
│  │                                                                  │ │
│  │ 2. Generate Transaction ID                                     │ │
│  │    - Format: TXN_1234567890_abc123                            │ │
│  │                                                                  │ │
│  │ 3. Get ioTec Access Token                                      │ │
│  │    - POST https://id.iotec.io/connect/token                   │ │
│  │    - Returns: Bearer token                                     │ │
│  │                                                                  │ │
│  │ 4. Process Payment with ioTec                                  │ │
│  │    - POST to https://pay.iotec.io/api/collections/collect     │ │
│  │    - Include: wallet ID, amount, phone, email                 │ │
│  │                                                                  │ │
│  │ 5. Store Transaction in Firestore                             │ │
│  │    - Collection: "payments"                                    │ │
│  │    - Document ID: transactionId                               │ │
│  │                                                                  │ │
│  │ 6. Generate Verification Code                                  │ │
│  │    - Random 6-digit code                                       │ │
│  │    - Store in Firestore with TTL                              │ │
│  │                                                                  │ │
│  │ 7. Send Response to Frontend                                   │ │
│  │    - success: true                                             │ │
│  │    - transactionId: TXN_xxx                                    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────┬────────────────────────────────────────────────────────────┘
             │
             ├─────────────────────┬──────────────────────┬─────────────────┐
             │                     │                      │                 │
             ↓                     ↓                      ↓                 ↓
    ┌───────────────────┐  ┌─────────────────┐  ┌──────────────────┐   ┌──────────────┐
    │   IOTEC API       │  │ FIREBASE        │  │  USER'S PHONE    │   │ USER'S EMAIL │
    │ pay.iotec.io      │  │ FIRESTORE       │  │                  │   │              │
    │                   │  │                 │  │ Receives USSD    │   │ Receives     │
    │ - Validates phone │  │ Collections:    │  │ code from ioTec: │   │ Verification │
    │ - Deducts balance │  │ - payments      │  │ "Enter 123456"   │   │ Code: 123456 │
    │ - Sends USSD code │  │ - users         │  │                  │   │              │
    │ - Returns status  │  │ - verification  │  │ User enters PIN  │   │ Sends email: │
    │                   │  │   Codes         │  │ Payment done!    │   │ "Click link" │
    └───────────────────┘  │ - judges        │  └──────────────────┘   └──────────────┘
                           │                 │
                           │ Stores:         │
                           │ - Transaction   │
                           │ - User data     │
                           │ - Verification  │
                           │ - Email status  │
                           └─────────────────┘
                           
```

---

## API Flow Sequence

```
Timeline: 1 second | 2 seconds | 3 seconds | 4 seconds | 5 seconds
          |________|___________|___________|___________|__________|

Browser   |----JSON POST----->|
          |  /process-payment  |
          |                    |
Server    |                    |--Validate-|
          |                    |           |--Get ioTec Token--|
          |                    |                              |
ioTec     |                    |<---------200 OK - Token------|
          |                    |
          |                    |--POST Payment Request------->|
          |                    |                              |
          |                    |<---200 OK - Payment Status---|
          |                    |
Firestore |                    |--Store Transaction---------->|
          |                    |                              |
          |<-----200 OK--------|--Send Code to Email-------->|
          |  transactionId
          |

User gets response in ~2-3 seconds
Payment processes in ~3-5 seconds
```

---

## GitHub ↔ Heroku Deployment Flow

```
┌──────────────────┐
│  LOCAL COMPUTER  │
│                  │
│  $ git push      │
│  ↓               │
└──────────────────┘
        │
        │ Push to GitHub
        ↓
┌──────────────────┐
│  GITHUB REPO     │
│                  │
│  - Code          │ Webhook trigger
│  - Actions ──────┼─────→ .github/workflows/deploy-heroku.yml
│  - Secrets       │
└──────────────────┘
        │
        │ CI/CD Pipeline runs:
        │ 1. Checkout code
        │ 2. Install dependencies
        │ 3. Run tests (if any)
        │ 4. Build application
        │ 5. Deploy to Heroku
        │ 6. Run health check
        │ 7. Report status
        ↓
┌──────────────────────────────────────┐
│  HEROKU APP                          │
│  jot-talent-payment-api              │
│                                      │
│  ├─ Node.js Process                  │
│  │  ├─ server-production.js running  │
│  │  ├─ Port: 5000                    │
│  │  └─ Environment vars loaded       │
│  │                                   │
│  ├─ Live URL:                        │
│  │  https://jot-talent-payment-api   │
│  │  .herokuapp.com                   │
│  │                                   │
│  └─ Database: Firebase Firestore     │
│     (payments, users, codes)         │
└──────────────────────────────────────┘
```

---

## Environment Configuration

```
LOCAL DEVELOPMENT
├─ .env file (local, not committed)
├─ NODE_ENV=development
├─ Port: 5000
└─ SQL/Debug output enabled

          ↓
    
GitHub Repository
├─ .env.example (template)
├─ .gitignore (protects .env)
└─ Source code

          ↓
    
Heroku Deployment
├─ Environment variables (Config Vars)
├─ NODE_ENV=production
├─ CORS restricted
└─ SSL/HTTPS enabled
```

---

## Payment Status Lifecycle

```
User Initiates Payment
    │
    ↓
┌──────────────────┐
│ PAYMENT PENDING  │  ← Stored in Firestore
│                  │
│ Status: PENDING  │
└──────────────────┘
    │
    ├─→ User enters USSD code on phone
    │
    ↓
┌──────────────────┐
│ PAYMENT SUCCESS  │  ← ioTec confirms
│                  │
│ Status: SUCCESS  │
└──────────────────┘
    │
    ├─→ Verification code sent to email
    │
    ↓
┌──────────────────┐
│ EMAIL VERIFIED   │  ← User confirms email
│                  │
│ Status: VERIFIED │
└──────────────────┘
    │
    └─→ User can now submit competition entry
```

---

## Directory Structure on Heroku

```
/app/
├── node_modules/          (installed from package.json)
├── .env                   (loaded from Config Vars)
├── server-production.js   (main application)
├── package.json
├── Procfile              (tells Heroku how to start)
├── join.html
├── css/
├── js/
├── images/
└── ... (other files)

Heroku runs:
$ node server-production.js
```

---

## Heroku Dyno Resources

```
FREE TIER LIMITS:
├─ CPU: 1x (512 MB)
├─ Memory: 512 MB shared
├─ Concurrent connections: 50
├─ Requests/min: Unlimited
├─ Database: External (Firebase)
└─ Uptime: 30 hrs/week

PAID TIER LIMITS:
├─ CPU: 2x (512 MB)
├─ Memory: 512 MB
├─ Concurrent connections: 100+
├─ Requests/min: Unlimited
└─ Uptime: 24/7
```

---

## Data Flow: Request to Response

```
1. FRONTEND REQUEST
   ├─ URL: https://jot-talent-payment-api.herokuapp.com/process-payment
   ├─ Method: POST
   ├─ Headers: Content-Type: application/json
   └─ Body: {amount, phone, email, name, competitionId}

2. SERVER RECEIVES
   ├─ Parses JSON
   ├─ Validates input
   ├─ Checks required fields
   └─ Returns 400 if invalid

3. PAYMENT PROCESSING
   ├─ Generate transaction ID
   ├─ Get ioTec token
   ├─ Send payment request to ioTec
   └─ Wait for response

4. STORAGE
   ├─ Save to Firestore
   ├─ Record all details
   └─ Set status

5. RESPONSE
   ├─ Status: 200 OK
   ├─ Body: {success: true, transactionId: "TXN_xxx"}
   └─ User gets confirmation

6. BACKEND ACTIONS
   ├─ Generate verification code
   ├─ Store verification code
   └─ Prepare email
```

---

## Failover & Recovery

```
If Heroku Server Goes Down:
    ↓
1. Health check fails
    ↓
2. UptimeRobot alerts you
    ↓
3. Check Heroku status
    ↓
4. Restart dyno: heroku restart
    ↓
5. Server comes back online
    ↓
6. All data safe in Firestore
    ↓
7. Resume payment processing

If Firestore Goes Down:
    ↓
1. Payment succeeds at ioTec
    ↓
2. Server can't store record
    ↓
3. Response: 503 Service Unavailable
    ↓
4. Firestore comes back
    ↓
5. Query ioTec for transaction status
    ↓
6. Recreate missing records
```

---

## Load Distribution

```
Multiple Users Paying Simultaneously:

Users: 100+ concurrent payments
    │
    ├─→ User 1 → Server → ioTec (parallel)
    ├─→ User 2 → Server → ioTec (parallel)
    ├─→ User 3 → Server → ioTec (parallel)
    └─→ User N → Server → ioTec (parallel)

Heroku Auto-scales:
    ├─ If CPU > 80% → Add dyno
    ├─ If CPU < 20% → Remove dyno (paid tier)
    └─ Keeps performance optimal
```

---

## Monitoring & Logging

```
User Action → Heroku Logs → Your Dashboard

All requests logged:
├─ [timestamp] POST /process-payment
├─ Amount: 10000
├─ Email: user@example.com
├─ Status: SUCCESS
├─ TransactionId: TXN_xxx
└─ Response time: 2.3 seconds

View with:
$ heroku logs --tail --app jot-talent-payment-api

Alert rules:
├─ If 5XX errors > 5 in 1 min → Alert
├─ If response time > 5 sec → Alert
├─ If payment success rate < 90% → Alert
└─ If server down > 1 min → Alert
```

---

## Backup & Recovery

```
Daily Backup Process:

Firestore Data
    ↓
Google Cloud Storage (automatic)
    ↓
Encrypted backup
    ↓
Retention: 30 days
    ↓
Can restore from any point in time

If data loss occurs:
    ├─ Firestore detects corruption
    ├─ Automatic snapshot restores
    ├─ Recovery in < 1 hour
    └─ No permanent data loss
```

---

## Performance Metrics

```
RESPONSE TIMES:
├─ Frontend → Backend: 100-300ms (network)
├─ Validation: 10-50ms
├─ Token fetch: 500-1000ms
├─ Payment processing: 1-3 seconds
├─ Firestore write: 500-1000ms
└─ Total: 2-5 seconds (good!)

DATABASE QUERIES:
├─ Insert payment: 1000ms
├─ Read user: 500ms
├─ Update status: 800ms
└─ All indexed for speed

SCALABILITY:
├─ 0-100 requests/sec: No issues
├─ 100-1000 requests/sec: Heroku scales
├─ 1000+ requests/sec: Consider multi-dyno
```

---

## Security Layers

```
Incoming Request
    ↓
1. HTTPS/SSL Encryption
    ↓
2. CORS Validation
    ├─ Check origin header
    ├─ Verify against allowed list
    └─ Block if not allowed
    ↓
3. Rate Limiting
    ├─ Max 5 payments per IP per 15 min
    └─ Returns 429 if exceeded
    ↓
4. Input Validation
    ├─ Sanitize all inputs
    ├─ Check types & lengths
    └─ Validate format
    ↓
5. Firebase Authentication (admin endpoints)
    ├─ Verify ID token
    ├─ Check admin claims
    └─ Block if unauthorized
    ↓
6. Firestore Rules
    ├─ User can only read own payments
    ├─ Admin only for judges
    └─ All else blocked
    ↓
Server Processing (safe)
```

---

**Last Updated**: November 14, 2025  
**Version**: 2.0.0
