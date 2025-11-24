require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const admin = require('firebase-admin');

let db = null;
let adminInitAvailable = true;

try {
    let serviceAccount;
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        serviceAccount = {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "",
            private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID || "",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
        };
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || "https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com"
    });
    db = admin.firestore();
    console.log('✓ Firebase initialized');
} catch (err) {
    adminInitAvailable = false;
    console.warn('⚠ Firebase skipped:', err.message);
}

const clientId = process.env.IOTEC_CLIENT_ID;
const clientSecret = process.env.IOTEC_CLIENT_SECRET;
const walletId = process.env.IOTEC_WALLET_ID;

const PORT = process.env.PORT || 10000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();

// ===== SIMPLE CORS - NO CONDITIONS =====
app.use(cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.options('*', cors());

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV,
        firebase: adminInitAvailable
    });
});

// ===== GET ACCESS TOKEN =====
async function getAccessToken() {
    if (!clientId || !clientSecret) {
        throw new Error('ioTec credentials missing');
    }

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'client_credentials');

    const response = await fetch('https://id.iotec.io/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });

    if (!response.ok) {
        throw new Error(`Token error ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

// ===== PROCESS PAYMENT =====
app.post('/process-payment', async (req, res) => {
    try {
        const { amount, method, phone, email, name, currency = 'UGX', competitionId } = req.body;

        if (!amount || !method || !phone || !email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        console.log(`💳 Processing payment: ${amount} ${currency}`);

        const accessToken = await getAccessToken();
        const transactionId = 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        const collectPayload = {
            walletId: walletId,
            amount: Number(amount),
            currency: currency,
            externalId: transactionId,
            payer: phone,
            payerNote: 'Jot Competition Entry',
            payeeNote: `Payment for ${competitionId || 'competition'}`
        };

        const response = await fetch('https://pay.iotec.io/api/collections/collect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(collectPayload),
            timeout: 30000
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ ioTec error:', data);
            return res.status(400).json({
                success: false,
                message: data.message || 'Payment failed'
            });
        }

        // Store in Firestore
        if (adminInitAvailable && db) {
            try {
                await db.collection('payments').doc(transactionId).set({
                    transactionId: transactionId,
                    amount: Number(amount),
                    currency: currency,
                    method: method,
                    phone: phone,
                    email: email,
                    name: name,
                    competitionId: competitionId || 'firstRound',
                    status: data.status || 'PENDING',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (err) {
                console.warn('⚠ Firestore error:', err.message);
            }
        }

        res.json({
            success: true,
            transactionId: transactionId,
            status: data.status || 'PENDING'
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== CHECK BALANCE =====
app.post('/check-balance', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone required' 
            });
        }

        console.log(`💰 Checking balance for: ${phone}`);

        const accessToken = await getAccessToken();

        const response = await fetch('https://pay.iotec.io/api/inquiries/balance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ phone, walletId }),
            timeout: 15000
        });

        if (response.ok) {
            const data = await response.json();
            return res.json({
                success: true,
                phone: phone,
                availableBalance: data.balance || 0,
                currency: 'UGX'
            });
        }

        // Fallback if API fails
        res.json({
            success: true,
            phone: phone,
            availableBalance: null,
            message: 'Balance will be verified during payment'
        });

    } catch (error) {
        console.error('❌ Balance error:', error.message);
        res.json({
            success: true,
            message: 'Balance will be verified during payment'
        });
    }
});

// ===== PAYMENT STATUS =====
app.get('/payment-status', async (req, res) => {
    try {
        const { transactionId, email } = req.query;

        if (!transactionId && !email) {
            return res.status(400).json({ 
                success: false,
                message: 'Transaction ID or email required' 
            });
        }

        if (adminInitAvailable && db) {
            if (email) {
                const snapshot = await db.collection('payments')
                    .where('email', '==', email)
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .get();

                if (!snapshot.empty) {
                    return res.json({
                        success: true,
                        ...snapshot.docs[0].data()
                    });
                }
            } else {
                const doc = await db.collection('payments').doc(transactionId).get();
                if (doc.exists) {
                    return res.json({
                        success: true,
                        ...doc.data()
                    });
                }
            }
        }

        res.status(404).json({
            success: false,
            message: 'Payment not found'
        });

    } catch (error) {
        console.error('❌ Status error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== SEND VERIFICATION CODE =====
app.post('/send-verification-code', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email required' 
            });
        }

        if (!adminInitAvailable || !db) {
            return res.status(503).json({ 
                success: false, 
                message: 'Service unavailable' 
            });
        }

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        await db.collection('verificationCodes').doc(email).set({
            code: verificationCode,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            used: false
        });

        console.log(`📧 Code for ${email}: ${verificationCode}`);

        res.json({
            success: true,
            code: NODE_ENV === 'development' ? verificationCode : undefined
        });

    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== VERIFY EMAIL =====
app.post('/verify-email', async (req, res) => {
    try {
        const { email, verificationCode, transactionId } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and code required' 
            });
        }

        if (!adminInitAvailable || !db) {
            return res.status(503).json({ 
                success: false, 
                message: 'Service unavailable' 
            });
        }

        const verDoc = await db.collection('verificationCodes').doc(email).get();

        if (!verDoc.exists) {
            return res.status(400).json({ 
                success: false, 
                message: 'No code found' 
            });
        }

        const verData = verDoc.data();

        if (verData.code !== verificationCode.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid code' 
            });
        }

        if (verData.used) {
            return res.status(400).json({ 
                success: false, 
                message: 'Code already used' 
            });
        }

        await db.collection('verificationCodes').doc(email).update({
            used: true,
            usedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (transactionId) {
            await db.collection('payments').doc(transactionId).update({
                emailVerified: true,
                verifiedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        await db.collection('users').doc(email).set({
            email: email,
            verified: true,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            competitions: admin.firestore.FieldValue.arrayUnion('firstRound')
        }, { merge: true });

        res.json({
            success: true,
            message: 'Email verified'
        });

    } catch (error) {
        console.error('❌ Verify error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== ERROR HANDLERS =====
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message
    });
});

// ===== START SERVER =====
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Payment server running on port ${PORT}
✅ CORS enabled for all origins
✅ Firebase: ${adminInitAvailable ? 'Ready' : 'Unavailable'}
📊 Health: http://localhost:${PORT}/health
    `);
});

module.exports = app;
