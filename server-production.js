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
    'http://localhost:10000',
    'http://127.0.0.1:8000',
    'https://jot-talent-competitions.onrender.com',
    'https://jotcomps.com',
    'https://www.jotcomps.com',
    'https://envisage2024.github.io'
];

// For production, make sure frontend URLs are in ALLOWED_ORIGINS
// Always include default origins, plus any from environment
const DEFAULT_ALLOWED = [
  'https://envisage2024.github.io',
  'https://jotcomps.com',
  'https://www.jotcomps.com',
  'http://localhost:10000',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const ENV_ORIGINS = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : 
    [];

// Merge both lists and remove duplicates
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED, ...ENV_ORIGINS])];

console.log(`🚀 Starting Payment Server`);
console.log(`   Environment: ${NODE_ENV}`);
console.log(`   Port: ${PORT}`);
console.log(`   CORS Origins:`, ALLOWED_ORIGINS);
console.log(`   Public URL: https://jot-talent-competitions.onrender.com`);

const app = express();

// Enhanced CORS configuration with explicit origin checking
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests, or Postman)
    if (!origin) {
      console.log(`[CORS] Request with no origin allowed`);
      return callback(null, true);
    }
    
    // Check if origin is in whitelist
    if (ALLOWED_ORIGINS.includes(origin)) {
      console.log(`[CORS] ✓ Allowing ${origin}`);
      return callback(null, true);
    }
    
    // In development, allow more origins for testing
    if (NODE_ENV === 'development') {
      console.log(`[CORS DEV] Allowing ${origin} in development mode`);
      return callback(null, true);
    }
    
    console.error(`[CORS REJECTED] Origin ${origin} not in whitelist: ${ALLOWED_ORIGINS.join(', ')}`);
    return callback(new Error(`CORS policy: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  maxAge: 86400
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
    
    // Allow requests from whitelisted origins or in development mode
    if (!origin || ALLOWED_ORIGINS.includes(origin) || NODE_ENV === 'development') {
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
        res.header('Access-Control-Max-Age', '86400');
        res.header('Access-Control-Expose-Headers', 'Content-Length, X-JSON-Response-Size');
    }
    
    // Handle OPTIONS requests (preflight)
    if (req.method === 'OPTIONS') {
        console.log(`[CORS PREFLIGHT] ${req.method} ${req.path} from ${origin || 'no-origin'}`);
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

// ==================== NEW: VERIFY SUFFICIENT BALANCE BEFORE PAYMENT ====================
// This endpoint checks if user has enough money BEFORE attempting payment
app.post('/verify-balance-before-payment', async (req, res) => {
    try {
        const { amount, phone, currency = 'UGX' } = req.body;
        
        console.log(`\n🔵 [PRE-PAYMENT] NEW REQUEST RECEIVED`);
        console.log(`   From origin: ${req.headers.origin || 'no-origin'}`);
        console.log(`   Remote IP: ${req.ip}`);
        console.log(`   User-Agent: ${req.headers['user-agent']?.substring(0, 50)}...`);

        if (!amount || !phone) {
            console.warn(`⚠️ [PRE-PAYMENT] Missing required fields: amount=${amount}, phone=${phone}`);
            return res.status(400).json({ 
                success: false, 
                hasSufficientBalance: false,
                message: 'Amount and phone number are required' 
            });
        }

        console.log(`💰 [PRE-PAYMENT] Verifying balance for ${phone}: Need ${amount} ${currency}`);

        // Check if IOTEC credentials are configured
        if (!clientId || !clientSecret || !walletId) {
            console.warn(`⚠️ [PRE-PAYMENT] IOTEC credentials not configured`);
            console.warn(`   clientId: ${clientId ? '✅' : '❌ MISSING'}`);
            console.warn(`   clientSecret: ${clientSecret ? '✅' : '❌ MISSING'}`);
            console.warn(`   walletId: ${walletId ? '✅' : '❌ MISSING'}`);
            
            // Return success with null balance (will be checked during payment)
            return res.json({
                success: true,
                hasSufficientBalance: null,
                availableBalance: null,
                requiredAmount: Number(amount),
                currency: currency,
                message: 'Balance verification temporarily unavailable. Payment validation will occur during processing.',
                canProceedToPayment: true,
                warning: 'Real-time balance verification is currently disabled',
                note: 'Configure IOTEC credentials to enable balance checking'
            });
        }

        // Get access token
        let accessToken;
        try {
            console.log(`🔑 [PRE-PAYMENT] Requesting access token from IOTEC...`);
            accessToken = await getAccessToken();
            console.log(`✅ [PRE-PAYMENT] Got access token successfully`);
        } catch (tokenError) {
            console.error(`❌ [PRE-PAYMENT] Failed to get access token:`, tokenError.message);
            console.log(`⚠️ [PRE-PAYMENT] Falling back to allowing payment to proceed`);
            
            // Don't block payment if token fails
            return res.json({
                success: true,
                hasSufficientBalance: null,
                availableBalance: null,
                requiredAmount: Number(amount),
                currency: currency,
                message: 'Balance verification temporarily unavailable. Payment validation will occur during processing.',
                canProceedToPayment: true,
                warning: 'Could not verify balance with IOTEC'
            });
        }

        // Check balance on IOTEC
        try {
            console.log(`📡 [PRE-PAYMENT] Querying balance for ${phone}...`);
            
            const balancePayload = {
                phone: phone,
                walletId: walletId,
                clientId: clientId
            };
            
            console.log(`   Payload: phone=${phone}, walletId=${walletId ? '***' : 'MISSING'}, clientId=${clientId ? '***' : 'MISSING'}`);

            const response = await fetch('https://pay.iotec.io/api/inquiries/balance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(balancePayload),
                timeout: 15000
            });

            console.log(`📥 [PRE-PAYMENT] Balance check response: ${response.status} ${response.statusText}`);

            if (response.ok) {
                const balanceData = await response.json();
                const availableBalance = balanceData.balance || balanceData.availableBalance || 0;
                const numAmount = Number(amount);

                console.log(`✅ [PRE-PAYMENT] Balance check successful:`);
                console.log(`   Available: ${availableBalance} ${currency}`);
                console.log(`   Required: ${numAmount} ${currency}`);

                const hasSufficientBalance = availableBalance >= numAmount;

                if (hasSufficientBalance) {
                    console.log(`✅ [PRE-PAYMENT] SUFFICIENT BALANCE - Payment can proceed`);
                    return res.json({
                        success: true,
                        hasSufficientBalance: true,
                        availableBalance: availableBalance,
                        requiredAmount: numAmount,
                        currency: currency,
                        message: `✓ Balance verified: ${availableBalance} ${currency} available`,
                        canProceedToPayment: true
                    });
                } else {
                    const shortfall = numAmount - availableBalance;
                    console.warn(`❌ [PRE-PAYMENT] INSUFFICIENT BALANCE`);
                    console.warn(`   Shortfall: ${shortfall} ${currency}`);
                    
                    return res.status(402).json({
                        success: false,
                        hasSufficientBalance: false,
                        availableBalance: availableBalance,
                        requiredAmount: numAmount,
                        currency: currency,
                        shortfall: shortfall,
                        message: `Insufficient balance. You have ${availableBalance} ${currency} but need ${numAmount} ${currency}`,
                        canProceedToPayment: false,
                        recommendation: `Please add ${shortfall} ${currency} to your account and try again`
                    });
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.warn(`⚠ [PRE-PAYMENT] Balance check returned ${response.status}:`, errorData);
                console.warn(`   IOTEC Error Response:`, JSON.stringify(errorData).substring(0, 200));
                
                // If balance check fails, allow user to proceed (will fail during actual payment if insufficient)
                return res.json({
                    success: true,
                    hasSufficientBalance: null,
                    availableBalance: null,
                    requiredAmount: Number(amount),
                    currency: currency,
                    message: 'Real-time balance check unavailable. Payment validation will occur during processing.',
                    canProceedToPayment: true,
                    warning: 'Balance verification in progress'
                });
            }

        } catch (err) {
            console.error(`❌ [PRE-PAYMENT] Balance verification error:`, err.message);
            console.error(`   Error stack:`, err.stack?.substring(0, 300));
            
            // Allow proceeding if check fails (payment will fail if truly insufficient)
            return res.json({
                success: true,
                hasSufficientBalance: null,
                availableBalance: null,
                requiredAmount: Number(amount),
                currency: currency,
                message: 'Balance verification temporarily unavailable. Proceeding with payment...',
                canProceedToPayment: true,
                warning: 'Real-time balance could not be verified',
                debugError: NODE_ENV === 'development' ? err.message : undefined
            });
        }

    } catch (error) {
        console.error('❌ [PRE-PAYMENT] Outer error:', error);
        console.error('   Error type:', error.name);
        res.status(500).json({
            success: false,
            hasSufficientBalance: false,
            message: 'Internal server error',
            error: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

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

// Check user balance via ioTec - Using account verification method
app.post('/check-balance', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        console.log(`💰 Verifying account for phone: ${phone}`);

        // Get access token
        let accessToken;
        try {
            accessToken = await getAccessToken();
        } catch (tokenError) {
            return res.status(503).json({
                success: false,
                message: 'Payment gateway temporarily unavailable',
                error: NODE_ENV === 'development' ? tokenError.message : undefined
            });
        }

        // ioTec Balance Inquiry - Official API
        // This endpoint queries the customer's balance on the mobile money provider
        try {
            console.log('📡 Calling ioTec balance inquiry API...');
            
            const balancePayload = {
                phone: phone,
                walletId: walletId,
                clientId: clientId
            };

            console.log('📤 Sending balance inquiry for:', phone);

            const response = await fetch('https://pay.iotec.io/api/inquiries/balance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(balancePayload),
                timeout: 15000
            });

            console.log(`📥 ioTec balance inquiry response: ${response.status}`);

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Balance inquiry successful:', data);

                return res.json({
                    success: true,
                    phone: phone,
                    availableBalance: data.balance || data.availableBalance || 0,
                    currency: data.currency || 'UGX',
                    accountStatus: 'ACTIVE',
                    message: `Current balance: ${data.balance || data.availableBalance || 0} ${data.currency || 'UGX'}`,
                    provider: data.provider || 'Mobile Money'
                });
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.warn(`⚠ Balance inquiry returned ${response.status}:`, errorData);
                
                // If not found or error, return fallback
                return res.json({
                    success: true,
                    phone: phone,
                    availableBalance: null,
                    currency: 'UGX',
                    message: 'Account verification in progress. You can proceed with payment.',
                    canProceed: true,
                    note: 'Balance will be verified during payment processing.'
                });
            }

        } catch (err) {
            console.error('❌ Balance inquiry error:', err.message);
            console.warn('⚠️ Falling back due to error:', err.message);
        }

        // If all endpoint attempts fail, return a verification-pending response
        // User can still proceed with payment
        console.warn('⚠️ Could not verify balance via ioTec endpoints. Returning fallback response.');
        
        return res.json({
            success: true,
            phone: phone,
            availableBalance: null,
            currency: 'UGX',
            message: 'Account verification pending. You can proceed with payment.',
            warning: 'Real-time balance verification is temporarily unavailable, but your transaction will be validated during payment processing.',
            canProceed: true
        });

    } catch (error) {
        console.error('❌ Balance check error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get payment status
app.get('/payment-status/:transactionId?', async (req, res) => {
    try {
        // Support both path parameter and query parameter formats
        let transactionId = req.params.transactionId;
        const email = req.query.email;
        
        // If email query param provided, search by email
        if (email && !transactionId) {
            console.log(`🔍 Searching payments by email: ${email}`);
            
            if (!adminInitAvailable || !db) {
                return res.status(503).json({ 
                    message: 'Payment database unavailable',
                    success: false 
                });
            }
            
            try {
                // Query Firestore for payments by email
                const paymentsSnapshot = await db.collection('payments')
                    .where('email', '==', email)
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .get();
                
                if (paymentsSnapshot.empty) {
                    return res.status(404).json({ 
                        message: `No payments found for email: ${email}`,
                        success: false 
                    });
                }
                
                const paymentData = paymentsSnapshot.docs[0].data();
                return res.json(paymentData);
            } catch (firestoreError) {
                console.error('❌ Firestore query error:', firestoreError.message);
                return res.status(500).json({ 
                    message: 'Error searching payments',
                    error: NODE_ENV === 'development' ? firestoreError.message : undefined
                });
            }
        }

        if (!transactionId) {
            return res.status(400).json({ message: 'Transaction ID or email required' });
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

// ==================== LIVE PAYMENT VERIFICATION ENDPOINT ====================
// Verifies actual payment status from IOTEC API with retry logic
app.get('/verify-payment-live/:ioTecTransactionId', async (req, res) => {
    const { ioTecTransactionId } = req.params;
    const forceRefresh = req.query.force === 'true';
    
    try {
        if (!ioTecTransactionId) {
            return res.status(400).json({
                success: false,
                message: 'ioTec transaction ID is required',
                paymentStatus: null
            });
        }

        console.log(`\n🔍 [LIVE VERIFY] Starting live payment verification for: ${ioTecTransactionId}`);

        // Get access token
        let accessToken;
        try {
            accessToken = await getAccessToken();
        } catch (tokenError) {
            console.error('❌ [LIVE VERIFY] Failed to get access token:', tokenError.message);
            return res.status(503).json({
                success: false,
                message: 'Cannot verify payment - unable to connect to payment gateway',
                paymentStatus: 'UNKNOWN',
                error: NODE_ENV === 'development' ? tokenError.message : undefined
            });
        }

        // Retry logic with exponential backoff
        let retries = 0;
        const maxRetries = 3;
        let backoffMs = 1000; // Start with 1 second
        let lastError = null;
        let verificationResult = null;

        while (retries < maxRetries) {
            try {
                console.log(`📡 [LIVE VERIFY] Attempt ${retries + 1}/${maxRetries} - Querying IOTEC API...`);

                // Call IOTEC API to get payment status
                const response = await fetch(
                    `https://pay.iotec.io/api/collections/${ioTecTransactionId}`,
                    {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`,
                            'Accept': 'application/json'
                        },
                        timeout: 15000
                    }
                );

                console.log(`   Response Status: ${response.status}`);

                if (response.ok) {
                    const ioTecData = await response.json();
                    
                    console.log(`✅ [LIVE VERIFY] Payment found - Status: ${ioTecData.status}`);

                    verificationResult = {
                        success: true,
                        message: 'Payment verification successful',
                        paymentStatus: ioTecData.status,
                        ioTecData: {
                            id: ioTecData.id,
                            status: ioTecData.status,
                            statusMessage: ioTecData.statusMessage || '',
                            amount: ioTecData.amount,
                            currency: ioTecData.currency,
                            payer: ioTecData.payer,
                            timestamp: ioTecData.timestamp
                        },
                        verified: true,
                        verifiedAt: new Date().toISOString(),
                        attempts: retries + 1,
                        statusCode: response.status
                    };

                    // Update Firestore if available
                    if (adminInitAvailable && db && ioTecData.externalId) {
                        try {
                            await db.collection('payments').doc(ioTecData.externalId).update({
                                status: ioTecData.status,
                                statusMessage: ioTecData.statusMessage,
                                ioTecData: ioTecData,
                                lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            console.log(`✓ [LIVE VERIFY] Firestore updated`);
                        } catch (firestoreErr) {
                            console.warn(`⚠ [LIVE VERIFY] Firestore update failed: ${firestoreErr.message}`);
                        }
                    }

                    return res.json(verificationResult);
                } else if (response.status === 404) {
                    // Payment not found - might retry if not final attempt
                    lastError = `Payment not found (404)`;
                    console.warn(`⚠️ [LIVE VERIFY] Payment not found in IOTEC - Retrying...`);

                    if (retries < maxRetries - 1) {
                        console.log(`   Waiting ${backoffMs}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, backoffMs));
                        backoffMs *= 2; // Exponential backoff
                        retries++;
                        continue;
                    }
                } else {
                    // Server error - retry with backoff
                    lastError = `IOTEC API error ${response.status}`;
                    console.error(`❌ [LIVE VERIFY] IOTEC error ${response.status}`);

                    if (retries < maxRetries - 1 && response.status >= 500) {
                        console.log(`   Waiting ${backoffMs}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, backoffMs));
                        backoffMs *= 2;
                        retries++;
                        continue;
                    }
                }

                break;
            } catch (error) {
                lastError = error.message;
                console.error(`❌ [LIVE VERIFY] Request failed (attempt ${retries + 1}):`, error.message);

                if (retries < maxRetries - 1) {
                    console.log(`   Waiting ${backoffMs}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                    backoffMs *= 2;
                    retries++;
                    continue;
                }

                break;
            }
        }

        // If we get here, verification failed after retries
        console.error(`❌ [LIVE VERIFY] Verification failed after ${retries + 1} attempts: ${lastError}`);

        // Try Firestore fallback as last resort
        if (adminInitAvailable && db) {
            try {
                const paymentsSnapshot = await db.collection('payments')
                    .where('ioTecTransactionId', '==', ioTecTransactionId)
                    .limit(1)
                    .get();

                if (!paymentsSnapshot.empty) {
                    const paymentData = paymentsSnapshot.docs[0].data();
                    console.log(`ℹ️ [LIVE VERIFY] Using Firestore fallback - Last known status: ${paymentData.status}`);
                    
                    return res.status(200).json({
                        success: true,
                        message: 'Payment verification - using cached data',
                        paymentStatus: paymentData.status,
                        cachedData: {
                            status: paymentData.status,
                            amount: paymentData.amount,
                            email: paymentData.email,
                            phone: paymentData.phone,
                            createdAt: paymentData.createdAt,
                            lastVerifiedAt: paymentData.lastVerifiedAt
                        },
                        verified: false,
                        verificationMethod: 'firestore_cache',
                        verifiedAt: new Date().toISOString(),
                        attempts: retries + 1
                    });
                }
            } catch (firestoreErr) {
                console.warn(`⚠ [LIVE VERIFY] Firestore fallback failed: ${firestoreErr.message}`);
            }
        }

        return res.status(503).json({
            success: false,
            message: `Payment verification failed after ${retries + 1} attempts: ${lastError}`,
            paymentStatus: 'VERIFICATION_FAILED',
            error: NODE_ENV === 'development' ? lastError : undefined,
            attempts: retries + 1,
            recommendation: 'Please try again in a few moments or contact support'
        });

    } catch (error) {
        console.error('❌ [LIVE VERIFY] Unexpected error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error during payment verification',
            paymentStatus: 'ERROR',
            error: NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Alternative: Direct verification by email and amount
app.post('/verify-payment-by-details', async (req, res) => {
    const { email, phone, amount } = req.body;

    try {
        console.log(`\n🔍 [VERIFY DETAILS] Looking up payment by: email=${email}, amount=${amount}`);

        if (!email || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Email and amount are required',
                paymentStatus: null
            });
        }

        // Check Firestore
        if (!adminInitAvailable || !db) {
            return res.status(503).json({
                success: false,
                message: 'Payment verification service unavailable',
                paymentStatus: null
            });
        }

        try {
            const paymentsSnapshot = await db.collection('payments')
                .where('email', '==', email)
                .where('amount', '==', Number(amount))
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();

            if (paymentsSnapshot.empty) {
                return res.status(404).json({
                    success: false,
                    message: `No payment found for email: ${email} with amount: ${amount}`,
                    paymentStatus: null
                });
            }

            const paymentData = paymentsSnapshot.docs[0].data();

            // If payment is still PENDING, try to verify with IOTEC
            if (paymentData.status === 'PENDING' && paymentData.ioTecTransactionId) {
                console.log(`📡 [VERIFY DETAILS] Payment is PENDING - attempting live verification with IOTEC...`);

                try {
                    const accessToken = await getAccessToken();
                    const ioTecResponse = await fetch(
                        `https://pay.iotec.io/api/collections/${paymentData.ioTecTransactionId}`,
                        {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            },
                            timeout: 15000
                        }
                    );

                    if (ioTecResponse.ok) {
                        const ioTecData = await ioTecResponse.json();
                        console.log(`✅ [VERIFY DETAILS] Got IOTEC status: ${ioTecData.status}`);

                        // Update Firestore with new status
                        if (ioTecData.status !== paymentData.status) {
                            await db.collection('payments').doc(paymentData.transactionId).update({
                                status: ioTecData.status,
                                statusMessage: ioTecData.statusMessage,
                                lastVerifiedAt: admin.firestore.FieldValue.serverTimestamp()
                            });

                            paymentData.status = ioTecData.status;
                            paymentData.statusMessage = ioTecData.statusMessage;
                        }
                    }
                } catch (ioTecErr) {
                    console.warn(`⚠ [VERIFY DETAILS] IOTEC verification failed: ${ioTecErr.message}`);
                }
            }

            console.log(`✓ [VERIFY DETAILS] Payment found - Status: ${paymentData.status}`);

            return res.json({
                success: true,
                message: 'Payment found and verified',
                paymentStatus: paymentData.status,
                paymentDetails: {
                    transactionId: paymentData.transactionId,
                    ioTecTransactionId: paymentData.ioTecTransactionId,
                    email: paymentData.email,
                    amount: paymentData.amount,
                    currency: paymentData.currency,
                    method: paymentData.method,
                    status: paymentData.status,
                    statusMessage: paymentData.statusMessage,
                    createdAt: paymentData.createdAt,
                    lastVerifiedAt: paymentData.lastVerifiedAt,
                    competitionId: paymentData.competitionId
                },
                verified: true,
                verifiedAt: new Date().toISOString()
            });
        } catch (firestoreError) {
            console.error('❌ [VERIFY DETAILS] Firestore error:', firestoreError.message);
            return res.status(500).json({
                success: false,
                message: 'Error looking up payment',
                error: NODE_ENV === 'development' ? firestoreError.message : undefined
            });
        }

    } catch (error) {
        console.error('❌ [VERIFY DETAILS] Unexpected error:', error);
        return res.status(500).json({
            success: false,
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
