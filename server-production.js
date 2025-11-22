require('dotenv').config();

// Validate required environment variables BEFORE loading modules
const requiredEnvVars = ['IOTEC_CLIENT_ID', 'IOTEC_CLIENT_SECRET', 'IOTEC_WALLET_ID'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
    console.warn(`⚠ Missing environment variables: ${missingVars.join(', ')}`);
}

const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const admin = require('firebase-admin');

// Initialize Firebase Admin
let db = null;
let adminInitAvailable = true;
try {
    // Try to load from serviceAccountKey.json first
    let serviceAccount;
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        // Fall back to environment variables for CI/CD deployments
        // Validate Firebase env vars exist before using
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
            throw new Error('Firebase credentials not configured via environment variables');
        }
        
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
        
        // Validate private_key exists for Firebase init
        if (!serviceAccount.private_key) {
            throw new Error('FIREBASE_PRIVATE_KEY environment variable not set');
        }
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || "https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com"
    });
    db = admin.firestore();
    console.log('✓ Firebase Admin initialized');
} catch (err) {
    adminInitAvailable = false;
    console.warn('⚠ Firebase Admin initialization skipped:', err.message);
    console.warn('⚠ Admin-only endpoints will not be available');
}

// Your ioTec credentials from environment variables
const clientId = process.env.IOTEC_CLIENT_ID;
const clientSecret = process.env.IOTEC_CLIENT_SECRET;
const walletId = process.env.IOTEC_WALLET_ID;

// Configuration
const PORT = process.env.PORT || 10000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Build allowed origins from environment or defaults
const DEFAULT_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:8000',
    'https://jot-talent-competitions.onrender.com',
    'https://jotcomps.com',
    'https://www.jotcomps.com',
    'https://envisage2024.github.io'
];

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(o => o)
    : DEFAULT_ORIGINS;

console.log(`🚀 Starting Payment Server`);
console.log(`   Environment: ${NODE_ENV}`);
console.log(`   Port: ${PORT}`);
console.log(`   CORS Origins:`, ALLOWED_ORIGINS);

const app = express();

// Enhanced CORS configuration with explicit origin checking
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            return callback(null, true);
        }

        // Exact match check
        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }

        // Development mode: allow all
        if (NODE_ENV === 'development') {
            console.log(`[CORS DEV] Allowing ${origin}`);
            return callback(null, true);
        }

        // Production: reject
        console.error(`[CORS REJECTED] Origin ${origin} not in whitelist: ${ALLOWED_ORIGINS.join(', ')}`);
        return callback(new Error(`CORS policy: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['Content-Length', 'X-JSON-Response-Length'],
    maxAge: 86400,
    optionsSuccessStatus: 200  // For legacy browsers
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Handle preflight requests explicitly for all routes
app.options('*', cors(corsOptions));

// Additional CORS headers middleware (belt and suspenders)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    
    if (!origin || ALLOWED_ORIGINS.includes(origin) || NODE_ENV === 'development') {
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
        res.header('Access-Control-Max-Age', '86400');
    }
    
    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ==================== PUBLIC ENDPOINTS ====================

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Payment server is running',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        environment: NODE_ENV,
        firebaseAvailable: adminInitAvailable
    });
});

// Get access token from ioTec
async function getAccessToken() {
    if (!clientId || !clientSecret) {
        throw new Error('ioTec credentials not configured. Please set IOTEC_CLIENT_ID and IOTEC_CLIENT_SECRET');
    }

    const tokenUrl = 'https://id.iotec.io/connect/token';
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'client_credentials');

    try {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`ioTec Token Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('❌ Error getting ioTec access token:', error.message);
        throw error;
    }
}

// Payment endpoint - Process payment
app.post('/process-payment', async (req, res) => {
    try {
        const { amount, method, phone, email, name, currency = 'UGX', competitionId } = req.body;

        // Validation
        if (!amount || !method) {
            return res.status(400).json({ success: false, message: 'Amount and payment method are required.' });
        }

        if (method === 'MobileMoney' && !phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required for Mobile Money payments.' });
        }

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required.' });
        }

        console.log(`💳 Processing ${method} payment: ${amount} ${currency}`);

        // Get access token
        let accessToken;
        try {
            accessToken = await getAccessToken();
        } catch (tokenError) {
            return res.status(503).json({
                success: false,
                message: 'Payment gateway temporarily unavailable. Please try again later.',
                error: NODE_ENV === 'development' ? tokenError.message : undefined
            });
        }

        // Generate transaction ID
        const transactionId = 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Prepare payment payload
        const collectPayload = {
            walletId: walletId,
            amount: Number(amount),
            currency: currency,
            externalId: transactionId,
            payer: phone,
            payerNote: 'Jot Talent Competition Entry Fee',
            payeeNote: `Payment for ${competitionId || 'competition'} entry. Email: ${email}`
        };

        console.log('📤 Sending to ioTec:', JSON.stringify(collectPayload, null, 2));

        // Make payment request
        const response = await fetch('https://pay.iotec.io/api/collections/collect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(collectPayload),
            timeout: 30000
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`❌ ioTec Error ${response.status}:`, errorData);

            // Check for specific error messages
            if (errorData.message?.includes('Insufficient balance')) {
                return res.status(402).json({
                    success: false,
                    message: 'Payment failed: Insufficient balance on account'
                });
            }

            return res.status(response.status).json({
                success: false,
                message: errorData.message || 'Mobile Money collection failed',
                transactionId: transactionId
            });
        }

        const data = await response.json();
        console.log('✅ ioTec Response:', data);

        // Store payment data in Firestore if available
        if (adminInitAvailable && db) {
            try {
                const paymentData = {
                    transactionId: transactionId,
                    ioTecTransactionId: data.id || data.transactionId,
                    amount: Number(amount),
                    currency: currency,
                    method: method,
                    phone: phone,
                    email: email,
                    name: name || 'Customer',
                    competitionId: competitionId || 'firstRound',
                    status: data.status || 'PENDING',
                    statusMessage: data.statusMessage || 'Payment initiated',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                await db.collection('payments').doc(transactionId).set(paymentData);
                console.log('✓ Payment stored in Firestore:', transactionId);
            } catch (firestoreError) {
                console.error('⚠ Error storing in Firestore:', firestoreError.message);
                // Continue anyway - payment was processed
            }
        }

        // Return success
        res.json({
            success: true,
            message: 'Payment processed successfully',
            transactionId: transactionId,
            ioTecTransactionId: data.id || data.transactionId,
            status: data.status || 'PENDING'
        });

    } catch (error) {
        console.error('❌ Payment processing error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get payment status
app.get('/payment-status/:transactionId', async (req, res) => {
    try {
        const { transactionId } = req.params;

        if (!transactionId) {
            return res.status(400).json({ message: 'Transaction ID required' });
        }

        console.log(`🔍 Checking payment status: ${transactionId}`);

        // Check Firestore first if available
        if (adminInitAvailable && db) {
            try {
                const paymentDoc = await db.collection('payments').doc(transactionId).get();
                if (paymentDoc.exists) {
                    const paymentData = paymentDoc.data();
                    if (paymentData.status === 'SUCCESS' || paymentData.status === 'SUCCESSFUL' || paymentData.status === 'FAILED') {
                        return res.json(paymentData);
                    }
                }
            } catch (firestoreError) {
                console.error('⚠ Firestore check failed:', firestoreError.message);
            }
        }

        // Query ioTec
        let accessToken;
        try {
            accessToken = await getAccessToken();
        } catch (tokenError) {
            return res.status(503).json({
                message: 'Payment gateway temporarily unavailable',
                error: NODE_ENV === 'development' ? tokenError.message : undefined
            });
        }

        const response = await fetch(`https://pay.iotec.io/api/collections/${transactionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`❌ ioTec Status Query Error:`, errorData);

            // Try Firestore fallback
            if (adminInitAvailable && db) {
                try {
                    const paymentDoc = await db.collection('payments').doc(transactionId).get();
                    if (paymentDoc.exists) {
                        return res.json(paymentDoc.data());
                    }
                } catch (e) { }
            }

            return res.status(404).json({ message: 'Payment not found' });
        }

        const data = await response.json();
        console.log('✓ Payment status retrieved:', data.status);

        // Update Firestore
        if (adminInitAvailable && db) {
            try {
                await db.collection('payments').doc(transactionId).update({
                    status: data.status || 'UNKNOWN',
                    statusMessage: data.statusMessage || '',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (firestoreError) {
                console.error('⚠ Could not update Firestore status:', firestoreError.message);
            }
        }

        res.json({
            transactionId: transactionId,
            status: data.status,
            statusMessage: data.statusMessage,
            ...data
        });

    } catch (error) {
        console.error('❌ Error checking payment status:', error);
        res.status(500).json({
            message: 'Internal server error',
            error: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Send verification code
app.post('/send-verification-code', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        if (!adminInitAvailable || !db) {
            return res.status(503).json({ success: false, message: 'Verification service unavailable' });
        }

        // Generate 6-digit code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Store in Firestore
        await db.collection('verificationCodes').doc(email).set({
            code: verificationCode,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            used: false,
            attempts: 0
        });

        // TODO: In production, send via email service (SendGrid, AWS SES, etc.)
        console.log(`📧 Verification code for ${email}: ${verificationCode}`);

        res.json({
            success: true,
            message: 'Verification code sent',
            // Only return code in development for testing
            code: NODE_ENV === 'development' ? verificationCode : undefined
        });

    } catch (error) {
        console.error('❌ Error sending verification code:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send verification code',
            error: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Verify email code
app.post('/verify-email', async (req, res) => {
    try {
        const { email, verificationCode, transactionId } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ success: false, message: 'Email and code required' });
        }

        if (!adminInitAvailable || !db) {
            return res.status(503).json({ success: false, message: 'Verification service unavailable' });
        }

        // Retrieve and verify code
        const verificationDoc = await db.collection('verificationCodes').doc(email).get();

        if (!verificationDoc.exists) {
            return res.status(400).json({ success: false, message: 'No verification code found for this email' });
        }

        const verificationData = verificationDoc.data();

        // Check if code matches
        if (verificationData.code !== verificationCode.trim()) {
            // Increment attempts
            await db.collection('verificationCodes').doc(email).update({
                attempts: (verificationData.attempts || 0) + 1
            });

            // Lock after 5 attempts
            if ((verificationData.attempts || 0) >= 5) {
                await db.collection('verificationCodes').doc(email).update({ locked: true });
                return res.status(429).json({ success: false, message: 'Too many attempts. Please request a new code.' });
            }

            return res.status(400).json({ success: false, message: 'Invalid verification code' });
        }

        // Check if already used
        if (verificationData.used) {
            return res.status(400).json({ success: false, message: 'This code has already been used' });
        }

        // Check if expired (10 minutes)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const codeTimestamp = verificationData.timestamp.toDate();

        if (codeTimestamp < tenMinutesAgo) {
            return res.status(400).json({ success: false, message: 'This code has expired' });
        }

        // Mark as used
        await db.collection('verificationCodes').doc(email).update({
            used: true,
            usedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update payment if transactionId provided
        if (transactionId) {
            try {
                await db.collection('payments').doc(transactionId).update({
                    emailVerified: true,
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (e) {
                console.warn('Could not update payment record:', e.message);
            }
        }

        // Record user registration
        await db.collection('users').doc(email).set({
            email: email,
            verified: true,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            competitions: admin.firestore.FieldValue.arrayUnion('firstRound')
        }, { merge: true });

        res.json({
            success: true,
            message: 'Email verified successfully'
        });

    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed',
            error: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// Helper: Verify Firebase ID Token
async function verifyIdToken(req, res, next) {
    if (!adminInitAvailable) {
        return res.status(503).json({ message: 'Admin functionality unavailable' });
    }

    try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Missing or invalid Authorization header' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);

        const adminEmail = process.env.ADMIN_EMAIL || '';
        if (decoded.admin === true || (adminEmail && decoded.email === adminEmail)) {
            req.auth = decoded;
            return next();
        }

        return res.status(403).json({ message: 'Insufficient permissions' });
    } catch (err) {
        console.error('Token verification failed:', err.message);
        return res.status(401).json({ message: 'Unauthorized', error: err.message });
    }
}

// Get all payments (admin)
app.get('/admin/payments', verifyIdToken, async (req, res) => {
    try {
        console.log(`📊 Admin viewing payments (requested by: ${req.auth.email})`);

        const paymentsSnapshot = await db.collection('payments')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();

        const payments = paymentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({ success: true, count: payments.length, payments });
    } catch (error) {
        console.error('❌ Error fetching payments:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch payments' });
    }
});

// Create judge (admin)
app.post('/admin/create-judge', verifyIdToken, async (req, res) => {
    try {
        console.log(`👤 Creating judge (requested by: ${req.auth.email})`);
        const { email, password, name, bio } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ message: 'Email, password, and name required' });
        }

        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name
        });

        await admin.auth().setCustomUserClaims(userRecord.uid, { judge: true });

        const crypto = require('crypto');
        const passwordHash = crypto.createHash('sha256').update(String(password)).digest('hex');

        await db.collection('judges').doc(userRecord.uid).set({
            name: name,
            email: email,
            bio: bio || '',
            role: 'judge',
            passwordHash: passwordHash,
            reviewedCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ success: true, uid: userRecord.uid });
    } catch (error) {
        console.error('❌ Create judge error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to create judge', error: error.message });
    }
});

// Update judge (admin)
app.post('/admin/update-judge', verifyIdToken, async (req, res) => {
    try {
        const { uid, email, name, bio, reviewedCount, password } = req.body;

        if (!uid) return res.status(400).json({ message: 'UID required' });

        const updateAuth = {};
        if (email) updateAuth.email = email;
        if (name) updateAuth.displayName = name;
        if (password) updateAuth.password = password;

        if (Object.keys(updateAuth).length) {
            await admin.auth().updateUser(uid, updateAuth);
        }

        const updateDoc = {};
        if (name) updateDoc.name = name;
        if (email) updateDoc.email = email;
        if (typeof bio !== 'undefined') updateDoc.bio = bio;
        if (typeof reviewedCount !== 'undefined') updateDoc.reviewedCount = Number(reviewedCount) || 0;

        if (password) {
            const crypto = require('crypto');
            updateDoc.passwordHash = crypto.createHash('sha256').update(String(password)).digest('hex');
        }

        if (Object.keys(updateDoc).length) {
            await db.collection('judges').doc(uid).set(updateDoc, { merge: true });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Update judge error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to update judge' });
    }
});

// Delete judge (admin)
app.post('/admin/delete-judge', verifyIdToken, async (req, res) => {
    try {
        const { uid } = req.body;
        if (!uid) return res.status(400).json({ message: 'UID required' });

        await admin.auth().deleteUser(uid);
        await db.collection('judges').doc(uid).delete();

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Delete judge error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to delete judge' });
    }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        error: NODE_ENV === 'development' ? err : undefined
    });
});

// ==================== START SERVER ====================

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║         JOT TALENT PAYMENT SERVER STARTED              ║
╠════════════════════════════════════════════════════════╣
║ 🌐 URL: http://0.0.0.0:${PORT}
║ 📊 Health Check: http://localhost:${PORT}/health
║ 🔗 API Base: http://localhost:${PORT}
║ 📝 Environment: ${NODE_ENV}
║ 🔐 Firebase: ${adminInitAvailable ? '✅ Ready' : '⚠️  Unavailable'}
╚════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    server.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down gracefully...');
    server.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
});

module.exports = app;
