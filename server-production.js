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
    
        // Allow Render-hosted subdomains (e.g. your-app.onrender.com)
        try {
                const originHost = new URL(origin).hostname;
                if (originHost && originHost.endsWith('.onrender.com')) {
                        console.log(`[CORS] ✓ Allowing Render origin ${origin}`);
                        return callback(null, true);
                }
        } catch (e) {
                // ignore URL parse errors and continue to rejection
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
// Capture raw body for webhook signature verification (some providers sign the raw payload)
const rawBodySaver = (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
};
app.use(express.json({ limit: '10mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: '10mb', verify: rawBodySaver }));

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

// ==================== DIAGNOSTIC ENDPOINT ====================
// Test ioTec connectivity from Render server
app.get('/diagnose-iotec', async (req, res) => {
    const diagnostics = {
        timestamp: new Date().toISOString(),
        server: {
            environment: NODE_ENV,
            platform: process.platform,
            uptime: process.uptime()
        },
        iotec: {
            configured: !!(clientId && clientSecret && walletId),
            tests: []
        }
    };

    try {
        // Test 1: Check if credentials are configured
        console.log('🔍 [DIAGNOSE] Starting ioTec connectivity diagnosis...');
        
        diagnostics.iotec.tests.push({
            name: 'Credentials Configured',
            status: diagnostics.iotec.configured ? 'OK' : 'FAIL',
            details: diagnostics.iotec.configured 
                ? 'All credentials are configured'
                : 'Missing: ' + [!clientId && 'CLIENT_ID', !clientSecret && 'CLIENT_SECRET', !walletId && 'WALLET_ID'].filter(Boolean).join(', ')
        });

        if (!diagnostics.iotec.configured) {
            return res.status(400).json(diagnostics);
        }

        // Test 2: Attempt token fetch
        console.log('🔍 [DIAGNOSE] Test 2: Attempting to get access token...');
        const tokenStartTime = Date.now();
        let accessToken;
        try {
            accessToken = await getAccessToken();
            diagnostics.iotec.tests.push({
                name: 'Get Access Token',
                status: 'OK',
                duration_ms: Date.now() - tokenStartTime,
                token_preview: accessToken ? accessToken.substring(0, 20) + '...' : 'null'
            });
            console.log(`✅ [DIAGNOSE] Got token in ${Date.now() - tokenStartTime}ms`);
        } catch (tokenErr) {
            diagnostics.iotec.tests.push({
                name: 'Get Access Token',
                status: 'FAIL',
                duration_ms: Date.now() - tokenStartTime,
                error: tokenErr.message
            });
            console.error(`❌ [DIAGNOSE] Token fetch failed:`, tokenErr.message);
            return res.status(500).json(diagnostics);
        }

        // Test 3: Try balance query endpoint
        console.log('🔍 [DIAGNOSE] Test 3: Testing balance query endpoint...');
        const balanceStartTime = Date.now();
        try {
            const testPhone = '0700000000';
            const balanceResponse = await fetch('https://pay.iotec.io/api/v2/customers/balance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    phone: testPhone,
                    walletId: walletId,
                    currency: 'UGX'
                }),
                timeout: 10000
            });

            const balanceDuration = Date.now() - balanceStartTime;
            let balanceBodyPreview = '';
            
            try {
                const balanceData = await balanceResponse.json();
                balanceBodyPreview = JSON.stringify(balanceData).substring(0, 200);
            } catch (e) {
                balanceBodyPreview = '(non-JSON response)';
            }

            diagnostics.iotec.tests.push({
                name: 'Balance Query Endpoint',
                status: balanceResponse.ok ? 'OK' : `HTTP ${balanceResponse.status}`,
                duration_ms: balanceDuration,
                response_status: balanceResponse.status,
                response_preview: balanceBodyPreview
            });

            console.log(`✅ [DIAGNOSE] Balance query completed in ${balanceDuration}ms with status ${balanceResponse.status}`);
        } catch (balanceErr) {
            diagnostics.iotec.tests.push({
                name: 'Balance Query Endpoint',
                status: 'FAIL',
                duration_ms: Date.now() - balanceStartTime,
                error: balanceErr.message,
                error_code: balanceErr.code,
                error_type: balanceErr.name
            });
            console.error(`❌ [DIAGNOSE] Balance query failed:`, balanceErr.message);
        }

        // Test 4: DNS resolution
        console.log('🔍 [DIAGNOSE] Test 4: Testing DNS resolution...');
        const dnsStartTime = Date.now();
        try {
            const dns = require('dns').promises;
            const address = await dns.resolve4('pay.iotec.io');
            diagnostics.iotec.tests.push({
                name: 'DNS Resolution (pay.iotec.io)',
                status: 'OK',
                duration_ms: Date.now() - dnsStartTime,
                ip_addresses: address
            });
            console.log(`✅ [DIAGNOSE] DNS resolved to: ${address.join(', ')}`);
        } catch (dnsErr) {
            diagnostics.iotec.tests.push({
                name: 'DNS Resolution',
                status: 'FAIL',
                error: dnsErr.message
            });
            console.error(`❌ [DIAGNOSE] DNS resolution failed:`, dnsErr.message);
        }

        // Test 5: Payment endpoint connectivity
        console.log('🔍 [DIAGNOSE] Test 5: Testing payment collection endpoint...');
        const paymentStartTime = Date.now();
        try {
            const paymentResponse = await fetch('https://pay.iotec.io/api/collections/collect', {
                method: 'OPTIONS', // Just test connectivity
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                timeout: 10000
            });

            diagnostics.iotec.tests.push({
                name: 'Payment Collection Endpoint',
                status: 'REACHABLE',
                duration_ms: Date.now() - paymentStartTime,
                status_code: paymentResponse.status
            });
            console.log(`✅ [DIAGNOSE] Payment endpoint is reachable (status ${paymentResponse.status})`);
        } catch (payErr) {
            diagnostics.iotec.tests.push({
                name: 'Payment Collection Endpoint',
                status: 'UNREACHABLE',
                error: payErr.message
            });
            console.error(`❌ [DIAGNOSE] Payment endpoint unreachable:`, payErr.message);
        }

        diagnostics.summary = 'All connectivity tests completed. Check individual test results for details.';
        diagnostics.recommended_action = diagnostics.iotec.tests.some(t => t.status === 'FAIL') 
            ? 'Some tests failed. Contact ioTec support or check Render firewall settings.'
            : 'All tests passed. Connection to ioTec is working.';

        res.json(diagnostics);

    } catch (error) {
        console.error('❌ [DIAGNOSE] Unexpected error:', error);
        diagnostics.error = error.message;
        res.status(500).json(diagnostics);
    }
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

// Handle preflight requests for balance check endpoint
app.options('/verify-balance-before-payment', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Max-Age', '3600');
    res.sendStatus(200);
});

app.post('/verify-balance-before-payment', async (req, res) => {
    try {
        // Ensure CORS headers are set
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
        
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
            console.log(`ℹ️ [PRE-PAYMENT] IOTEC credentials not configured - balance will be checked during payment`);
            
            // Return success with null balance (will be checked during payment)
            return res.json({
                success: true,
                hasSufficientBalance: null,
                availableBalance: null,
                requiredAmount: Number(amount),
                currency: currency,
                message: 'Proceeding with payment - balance will be verified during processing.',
                canProceedToPayment: true,
                warning: null
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

// ==================== HELPER FUNCTION: Check wallet balance ====================
/**
 * Check user's mobile money wallet balance before payment
 * @param {string} phone - User's phone number
 * @param {number} requiredAmount - Amount required for payment
 * @param {string} currency - Currency (UGX, USD, etc.)
 * @param {string} accessToken - OAuth access token from ioTec
 * @returns {Object} - { success: boolean, balance: number, hasSufficientFunds: boolean, message: string }
 */
async function checkWalletBalance(phone, requiredAmount, currency = 'UGX', accessToken) {
    const balanceCheckUrl = 'https://pay.iotec.io/api/v2/inquiries/balance';
    
    try {
        console.log(`💰 [BALANCE CHECK] Verifying balance for ${phone}`);
        console.log(`   Required amount: ${requiredAmount} ${currency}`);
        
        const balanceResponse = await fetch(balanceCheckUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                phone: phone,
                walletId: walletId,
                currency: currency
            }),
            timeout: 10000
        });

        if (!balanceResponse.ok) {
            console.warn(`⚠️  [BALANCE CHECK] ioTec returned ${balanceResponse.status}`);
            return {
                success: false,
                balance: null,
                hasSufficientFunds: null,
                message: `Balance check failed (${balanceResponse.status})`,
                canProceed: false // Do not proceed if we can't verify balance
            };
        }

        const balanceData = await balanceResponse.json();
        const availableBalance = balanceData.balance || 
                                 balanceData.availableBalance || 
                                 balanceData.account_balance ||
                                 balanceData.accountBalance;

        if (availableBalance === null || availableBalance === undefined) {
            console.warn('⚠️  [BALANCE CHECK] No balance field found in response');
            return {
                success: false,
                balance: null,
                hasSufficientFunds: null,
                message: 'Could not retrieve balance data',
                canProceed: false
            };
        }

        const numBalance = Number(availableBalance);
        const numRequired = Number(requiredAmount);
        const hasSufficientFunds = numBalance >= numRequired;

        console.log(`✅ [BALANCE CHECK] Retrieved balance: ${numBalance} ${currency}`);
        console.log(`   Sufficient funds: ${hasSufficientFunds ? 'YES ✓' : 'NO ✗'}`);

        return {
            success: true,
            balance: numBalance,
            hasSufficientFunds: hasSufficientFunds,
            shortfall: !hasSufficientFunds ? (numRequired - numBalance) : 0,
            message: hasSufficientFunds 
                ? 'Sufficient balance available'
                : `Insufficient balance. Need ${numRequired} but have ${numBalance} ${currency}`,
            canProceed: hasSufficientFunds
        };

    } catch (error) {
        console.error(`❌ [BALANCE CHECK] Error:`, error.message);
        return {
            success: false,
            balance: null,
            hasSufficientFunds: null,
            message: `Balance check error: ${error.message}`,
            canProceed: false
        };
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

        // ==================== STEP 1: CHECK BALANCE FOR MOBILE MONEY ====================
        if (method === 'MobileMoney') {
            console.log(`\n🔷 STEP 1: Checking wallet balance before payment...`);
            
            const balanceCheck = await checkWalletBalance(phone, amount, currency, accessToken);
            
            if (!balanceCheck.success) {
                // Balance check failed (network/token/etc). Log and proceed with payment attempt.
                console.warn(`⚠️ Balance verification unavailable: ${balanceCheck.message} - proceeding with payment attempt`);
                // Continue without blocking; the payment provider will ultimately confirm or fail the transaction.
            }

            if (!balanceCheck.hasSufficientFunds) {
                // User has insufficient balance - reject payment
                console.warn(`❌ Insufficient balance: ${balanceCheck.message}`);
                return res.status(402).json({
                    success: false,
                    message: balanceCheck.message,
                    code: 'INSUFFICIENT_FUNDS',
                    phone: phone,
                    requiredAmount: amount,
                    availableBalance: balanceCheck.balance,
                    shortfall: balanceCheck.shortfall,
                    currency: currency
                });
            }

            // Balance is sufficient - proceed to payment
            console.log(`✅ Balance check passed: Proceeding with payment`);
        }

        // ==================== STEP 2: PROCESS PAYMENT ====================
        console.log(`\n🔷 STEP 2: Processing payment...`);

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

// ==================== HELPER: Try balance endpoint with retry ====================
async function tryBalanceEndpoint(endpoint, accessToken, maxRetries = 2) {
    const possibleBalanceFields = [
        'balance', 'availableBalance', 'account_balance', 'accountBalance',
        'walletBalance', 'currentBalance', 'amount', 'balance_info', 'data',
        'available_balance', 'accountBalance', 'customer_balance'
    ];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            console.log(`    📤 Attempt ${attempt + 1}/${maxRetries + 1}: ${endpoint.name}`);
            console.log(`       URL: ${endpoint.url}`);
            console.log(`       Body: ${JSON.stringify(endpoint.body).substring(0, 100)}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const balanceResponse = await fetch(endpoint.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(endpoint.body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            console.log(`      → Response status: ${balanceResponse.status}`);
            console.log(`      → Content-Type: ${balanceResponse.headers.get('content-type')}`);

            if (!balanceResponse.ok) {
                const errorText = await balanceResponse.text();
                console.log(`      → Error response: ${errorText.substring(0, 150)}`);
                if (attempt < maxRetries) {
                    const delay = 1000 * Math.pow(2, attempt); // Exponential backoff
                    console.log(`      → Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                continue;
            }

            let balanceData = await balanceResponse.json();
            console.log(`      → Response data keys: ${Object.keys(balanceData).join(', ')}`);
            console.log(`      → Full response: ${JSON.stringify(balanceData).substring(0, 200)}`);

            // Try to find balance in response
            let foundBalance = null;

            // Method 1: Direct field search
            for (const field of possibleBalanceFields) {
                if (balanceData[field] !== null && balanceData[field] !== undefined) {
                    const val = balanceData[field];
                    
                    if (typeof val === 'number' && val >= 0) {
                        foundBalance = val;
                        console.log(`      ✅ Found balance as number in field "${field}": ${foundBalance}`);
                        break;
                    } else if (typeof val === 'string') {
                        const numVal = parseFloat(val);
                        if (!isNaN(numVal) && numVal >= 0) {
                            foundBalance = numVal;
                            console.log(`      ✅ Found balance as string in field "${field}": ${foundBalance}`);
                            break;
                        }
                    } else if (typeof val === 'object' && val !== null) {
                        // Check if object has balance property
                        if (typeof val.balance === 'number' && val.balance >= 0) {
                            foundBalance = val.balance;
                            console.log(`      ✅ Found balance in nested field "${field}.balance": ${foundBalance}`);
                            break;
                        }
                        if (typeof val.amount === 'number' && val.amount >= 0) {
                            foundBalance = val.amount;
                            console.log(`      ✅ Found balance in nested field "${field}.amount": ${foundBalance}`);
                            break;
                        }
                    }
                }
            }

            if (foundBalance !== null) {
                return {
                    success: true,
                    balance: foundBalance,
                    currency: balanceData.currency || balanceData.Currency || 'UGX'
                };
            }

            console.log(`      ⚠️  No valid balance field found in response`);
            if (attempt < maxRetries) {
                const delay = 1000 * Math.pow(2, attempt);
                console.log(`      → Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

        } catch (err) {
            console.log(`      ❌ Error: ${err.message}`);
            if (err.name === 'AbortError') {
                console.log(`      → Timeout! Retrying...`);
            }
            if (attempt < maxRetries) {
                const delay = 1000 * Math.pow(2, attempt);
                console.log(`      → Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    console.log(`    ❌ All retries exhausted for ${endpoint.name}`);
    return { success: false, balance: null };
}

// CORS preflight for balance check
app.options('/check-balance', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.header('Access-Control-Max-Age', '3600');
    res.sendStatus(200);
});

// Check user balance via ioTec - with retry logic
app.post('/check-balance', async (req, res) => {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');

    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                availableBalance: null,
                message: 'Phone number is required.'
            });
        }

        console.log(`\n🔍 [BALANCE CHECK] Checking balance for: ${phone}`);

        // Get access token
        let accessToken;
        try {
            accessToken = await getAccessToken();
            console.log(`✅ [BALANCE CHECK] Got access token`);
        } catch (tokenError) {
            console.error(`❌ [BALANCE CHECK] Token error: ${tokenError.message}`);
            return res.json({
                success: false,
                availableBalance: null,
                message: 'Unable to verify balance. Please try again.',
                code: 'BALANCE_UNAVAILABLE'
            });
        }

        // Define endpoints to try - ordered by likelihood of success
        const endpointsToTry = [
            {
                name: 'v2 Inquiries Balance',
                url: 'https://pay.iotec.io/api/v2/inquiries/balance',
                body: { phone, walletId, currency: 'UGX' }
            },
            {
                name: 'v2 Customers Balance',
                url: 'https://pay.iotec.io/api/v2/customers/balance',
                body: { phoneNumber: phone, currency: 'UGX' }
            },
            {
                name: 'v2 Accounts Balance',
                url: 'https://pay.iotec.io/api/v2/accounts/balance',
                body: { phoneNumber: phone, walletId }
            },
            {
                name: 'v1 Inquiries Balance',
                url: 'https://pay.iotec.io/api/inquiries/balance',
                body: { phone, walletId, currency: 'UGX' }
            },
            {
                name: 'Balance Check Endpoint',
                url: 'https://pay.iotec.io/api/balance-check',
                body: { phone, currency: 'UGX' }
            }
        ];

        // Try each endpoint (try harder with more retries)
        for (const endpoint of endpointsToTry) {
            console.log(`\n📤 Trying endpoint: ${endpoint.name}`);
            const result = await tryBalanceEndpoint(endpoint, accessToken, 3); // Increased to 3 retries
            if (result.success) {
                console.log(`✅ [BALANCE CHECK] Balance verified: ${result.balance} ${result.currency}`);
                return res.json({
                    success: true,
                    availableBalance: result.balance,
                    currency: result.currency,
                    phone: phone
                });
            }
        }

        // All endpoints exhausted - return with success: false
        console.error(`\n❌ [BALANCE CHECK] Unable to retrieve balance after trying all ${endpointsToTry.length} endpoints`);
        return res.json({
            success: false,
            availableBalance: null,
            message: 'Unable to verify balance. Please try again.',
            code: 'BALANCE_UNAVAILABLE'
        });

    } catch (error) {
        console.error(`❌ [BALANCE CHECK] Unexpected error: ${error.message}`);
        return res.json({
            success: false,
            availableBalance: null,
            message: 'Unable to verify balance. Please try again.',
            code: 'INTERNAL_ERROR'
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

// ==================== PAYMENT RECONCILER (AUTO) ====================
// Periodically scans for PENDING payments and reconciles with ioTec API.
// This runs inside the main server process (suitable for Render). Configure with env vars.
const ENABLE_PAYMENT_RECONCILER = (process.env.ENABLE_PAYMENT_RECONCILER || 'true').toLowerCase() === 'true';
const PAYMENT_RECONCILER_INTERVAL_MS = Number(process.env.PAYMENT_RECONCILER_INTERVAL_MS || 5 * 60 * 1000); // default 5 minutes
const PAYMENT_RECONCILER_PENDING_AGE_MS = Number(process.env.PAYMENT_RECONCILER_PENDING_AGE_MS || 60 * 1000); // default 1 minute
const PAYMENT_RECONCILER_QUERY_LIMIT = Number(process.env.PAYMENT_RECONCILER_QUERY_LIMIT || 50);

async function reconcilePendingPaymentsOnce() {
    if (!adminInitAvailable || !db) {
        console.warn('⏯️ Reconciler: Firebase admin not available, skipping reconciliation');
        return;
    }

    console.log(`
🔁 [RECONCILER] Starting reconciliation run - looking for PENDING payments older than ${PAYMENT_RECONCILER_PENDING_AGE_MS}ms`);

    try {
        const cutoff = new Date(Date.now() - PAYMENT_RECONCILER_PENDING_AGE_MS);
        const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

        const q = db.collection('payments')
            .where('status', '==', 'PENDING')
            .where('createdAt', '<=', cutoffTs)
            .orderBy('createdAt', 'asc')
            .limit(PAYMENT_RECONCILER_QUERY_LIMIT);

        const snapshot = await q.get();
        if (snapshot.empty) {
            console.log('🔁 [RECONCILER] No pending payments to reconcile');
            return;
        }

        console.log(`🔁 [RECONCILER] Found ${snapshot.size} pending payments to check`);

        // Get access token once per run
        let accessToken = null;
        try {
            accessToken = await getAccessToken();
        } catch (tokenErr) {
            console.error('🔁 [RECONCILER] Failed to obtain access token:', tokenErr.message);
            return;
        }

        // Process sequentially to avoid hitting provider rate limits; could be parallelized with care
        for (const doc of snapshot.docs) {
            const paymentId = doc.id;
            const data = doc.data();
            const ioTecId = data.ioTecTransactionId || data.ioTecId || data.externalId || data.transactionId;

            // If no provider id to check, skip but log
            if (!ioTecId) {
                console.warn(`🔁 [RECONCILER] Payment ${paymentId} missing ioTecTransactionId; skipping`);
                continue;
            }

            console.log(`🔁 [RECONCILER] Checking payment ${paymentId} -> ioTec ${ioTecId}`);

            try {
                const resp = await fetch(`https://pay.iotec.io/api/collections/${ioTecId}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    timeout: 15000
                });

                if (!resp.ok) {
                    // If 404, provider says not found - we mark as FAILED and add note
                    if (resp.status === 404) {
                        console.warn(`🔁 [RECONCILER] ioTec returned 404 for ${ioTecId} - marking payment ${paymentId} as FAILED`);
                        try {
                            await db.collection('payments').doc(paymentId).update({
                                status: 'FAILED',
                                statusMessage: 'ioTec: transaction not found (reconciler)',
                                lastReconciledAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                        } catch (e) {
                            console.error(`🔁 [RECONCILER] Failed to update Firestore for ${paymentId}:`, e.message);
                        }
                        continue;
                    }

                    console.warn(`🔁 [RECONCILER] ioTec check for ${ioTecId} returned HTTP ${resp.status}; skipping update`);
                    continue;
                }

                const payload = await resp.json();
                const providerStatus = (payload.status || '').toString().toUpperCase();

                // Decide mapped status
                const successValues = ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'PAID'];
                const failedValues = ['FAILED', 'DECLINED', 'CANCELLED', 'EXPIRED'];
                let mappedStatus = 'PENDING';
                if (successValues.includes(providerStatus)) mappedStatus = 'SUCCESS';
                else if (failedValues.includes(providerStatus)) mappedStatus = 'FAILED';

                // Update Firestore document
                const updatePayload = {
                    status: mappedStatus,
                    providerStatus: providerStatus,
                    statusMessage: payload.statusMessage || `Reconciled: ${providerStatus}`,
                    ioTecData: payload,
                    lastReconciledAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };

                if (mappedStatus === 'SUCCESS') {
                    updatePayload.verifiedAt = admin.firestore.FieldValue.serverTimestamp();
                }

                await db.collection('payments').doc(paymentId).update(updatePayload);
                console.log(`🔁 [RECONCILER] Updated payment ${paymentId} => ${mappedStatus}`);

                // Small delay between requests to be polite to ioTec
                await new Promise(r => setTimeout(r, 250));

            } catch (err) {
                console.error(`🔁 [RECONCILER] Error checking payment ${paymentId}:`, err.message);
            }
        }

    } catch (error) {
        console.error('🔁 [RECONCILER] Unexpected error during reconciliation run:', error.message);
    }
}

// Start periodic reconciler if enabled
if (ENABLE_PAYMENT_RECONCILER) {
    // Kick off an immediate run after server starts
    setTimeout(() => {
        reconcilePendingPaymentsOnce().catch(e => console.error('Initial reconciler run failed:', e.message));
    }, 5000);

    // Schedule recurring runs
    setInterval(() => {
        reconcilePendingPaymentsOnce().catch(e => console.error('Scheduled reconciler run failed:', e.message));
    }, PAYMENT_RECONCILER_INTERVAL_MS);

    console.log(`🔁 Payment reconciler enabled: interval=${PAYMENT_RECONCILER_INTERVAL_MS}ms pendingAge=${PAYMENT_RECONCILER_PENDING_AGE_MS}ms`);
} else {
    console.log('🔁 Payment reconciler disabled (ENABLE_PAYMENT_RECONCILER=false)');
}

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

// TEST ENDPOINT: Test a single ioTec endpoint
app.post('/test-iotec-endpoint', async (req, res) => {
    try {
        const { endpoint, phone = '0700000000', walletIdOverride } = req.body;
        
        if (!endpoint) {
            return res.status(400).json({ 
                success: false,
                message: 'Endpoint URL is required' 
            });
        }

        console.log(`🔬 Testing ioTec endpoint: ${endpoint}`);
        console.log(`   Phone: ${phone}`);

        let accessToken;
        try {
            accessToken = await getAccessToken();
            console.log('✅ Got access token');
        } catch (tokenError) {
            return res.status(500).json({
                success: false,
                message: 'Failed to get access token',
                error: tokenError.message
            });
        }

        const testBody = {
            phone: phone,
            walletId: walletIdOverride || walletId,
            currency: 'UGX'
        };

        console.log(`📤 Sending request to ${endpoint}`);
        console.log(`   Body:`, JSON.stringify(testBody, null, 2));

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(testBody),
            timeout: 15000
        });

        console.log(`📨 Response Status: ${response.status} ${response.statusText}`);

        let responseData;
        try {
            responseData = await response.json();
        } catch (parseErr) {
            const textResp = await response.text();
            return res.json({
                success: false,
                status: response.status,
                responseType: 'text',
                response: textResp,
                message: 'Response was not JSON'
            });
        }

        console.log(`📋 Response:`, JSON.stringify(responseData, null, 2));

        return res.json({
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
            responseType: 'json',
            keys: Object.keys(responseData),
            response: responseData,
            headers: Object.fromEntries(response.headers)
        });

    } catch (error) {
        console.error('❌ Test endpoint error:', error);
        return res.status(500).json({
            success: false,
            message: 'Test failed',
            error: error.message,
            stack: NODE_ENV === 'development' ? error.stack : undefined
        });
    }
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
