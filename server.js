const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const admin = require('firebase-admin');

// Initialize Firebase Admin
let db = null;
let adminInitAvailable = true;
try {
    const serviceAccount = require('./serviceAccountKey.json'); // Optional locally
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com"
    });
    db = admin.firestore();
    console.log('Firebase Admin initialized from serviceAccountKey.json');
} catch (err) {
    // Fail gracefully for local dev if serviceAccountKey.json is missing
    adminInitAvailable = false;
    console.warn('Firebase Admin initialization skipped: serviceAccountKey.json not found or failed to load.');
    console.warn('Admin-only endpoints (/admin/*) will return 503 until proper credentials are provided.');
}

// Your ioTec credentials
const clientId = 'pay-caed774a-d7d0-4a74-b751-5b77be5b3911';
const clientSecret = 'IO-BdUCLRbm7xxYyz35WqpSu2QcPqrP3Eigg';
const walletId = 'a563af4c-3137-4085-a888-93bdf3fb29b4';

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced CORS configuration to allow requests from anywhere
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({extended: true, limit: '10mb'}));

// Ensure CORS preflight is handled for all routes (defensive)
app.options('*', cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'Payment server is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Get access token from ioTec
async function getAccessToken() {
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
            throw new Error(`Token error: ${response.status} ${errorText}`);
        }
        
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error);
        throw error;
    }
}

// Check Balance endpoint - Query ioTec API for actual mobile money provider balance
app.post('/check-balance', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ 
                success: false,
                message: 'Phone number is required.' 
            });
        }

        console.log('🔍 Checking balance for phone:', phone);
        
        // Get access token from ioTec
        let accessToken;
        try {
            accessToken = await getAccessToken();
            console.log('✅ Got access token from ioTec');
        } catch (tokenError) {
            console.error('❌ Failed to get access token from ioTec:', tokenError);
            return res.status(500).json({
                success: false,
                availableBalance: null,
                accountStatus: 'AUTH_ERROR',
                currency: 'UGX',
                phone: phone,
                message: 'Failed to authenticate with ioTec payment provider',
                error: tokenError.message
            });
        }

        // ==================== QUERY ioTEC FOR BALANCE ====================
        // This queries the actual mobile money provider (MTN, Airtel, etc) via ioTec
        console.log('📱 Querying ioTec for mobile money balance...');
        console.log(`   Phone: ${phone}`);
        console.log(`   Wallet ID: ${walletId}`);
        
        try {
            // ioTec Balance Query Endpoint
            const balanceQueryUrl = 'https://pay.iotec.io/api/v2/customers/balance';
            
            console.log(`📤 Sending balance query to: ${balanceQueryUrl}`);
            
            const balanceResponse = await fetch(balanceQueryUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    phone: phone,
                    walletId: walletId,
                    currency: 'UGX'
                })
            });

            console.log(`📨 ioTec Response Status: ${balanceResponse.status} ${balanceResponse.statusText}`);
            
            const balanceData = await balanceResponse.json();
            console.log('📋 ioTec Response Data:', balanceData);

            // Check if response is successful
            if (!balanceResponse.ok) {
                console.error('❌ ioTec returned error:', balanceResponse.status, balanceData);
                return res.status(balanceResponse.status).json({
                    success: false,
                    availableBalance: null,
                    accountStatus: 'ERROR',
                    currency: 'UGX',
                    phone: phone,
                    message: balanceData.message || 'Failed to query balance from mobile money provider',
                    iotecError: balanceData.error || balanceData.message
                });
            }

            // Check if we got a valid balance from the provider
            if (balanceData.balance !== null && balanceData.balance !== undefined) {
                console.log(`✅ Got balance from provider: ${balanceData.balance} ${balanceData.currency || 'UGX'}`);
                
                return res.json({
                    success: true,
                    availableBalance: balanceData.balance,
                    accountStatus: 'VERIFIED',
                    currency: balanceData.currency || 'UGX',
                    phone: phone,
                    message: 'Balance retrieved successfully from mobile money provider',
                    provider: balanceData.provider || 'Mobile Money',
                    timestamp: new Date().toISOString()
                });
            } else if (balanceData.availableBalance !== null && balanceData.availableBalance !== undefined) {
                // Alternative field name
                console.log(`✅ Got balance from provider (alt field): ${balanceData.availableBalance} ${balanceData.currency || 'UGX'}`);
                
                return res.json({
                    success: true,
                    availableBalance: balanceData.availableBalance,
                    accountStatus: 'VERIFIED',
                    currency: balanceData.currency || 'UGX',
                    phone: phone,
                    message: 'Balance retrieved successfully from mobile money provider',
                    provider: balanceData.provider || 'Mobile Money',
                    timestamp: new Date().toISOString()
                });
            } else {
                // No balance in response
                console.warn('⚠️ ioTec response has no balance field:', balanceData);
                return res.status(200).json({
                    success: true,
                    availableBalance: null,
                    accountStatus: 'NO_BALANCE_DATA',
                    currency: 'UGX',
                    phone: phone,
                    message: 'Could not retrieve balance from mobile money provider',
                    iotecResponse: balanceData
                });
            }

        } catch (iotecError) {
            console.error('❌ Error querying ioTec balance:', iotecError.message);
            console.error('   Error type:', iotecError.name);
            console.error('   Full error:', iotecError);
            
            return res.status(500).json({
                success: false,
                availableBalance: null,
                accountStatus: 'CONNECTION_ERROR',
                currency: 'UGX',
                phone: phone,
                message: 'Unable to connect to mobile money provider',
                error: iotecError.message
            });
        }

    } catch (error) {
        console.error('❌ Unexpected error in check-balance:', error);
        
        return res.status(500).json({
            success: false,
            availableBalance: null,
            accountStatus: 'ERROR',
            currency: 'UGX',
            phone: req.body.phone || 'unknown',
            message: 'Unexpected error checking balance',
            error: error.message
        });
    }
});

// Payment endpoint
app.post('/pay', async (req, res) => {
    try {
        const { amount, method, phone, email, competitionId } = req.body;
        
        if (!amount || !method) {
            return res.status(400).json({ message: 'Amount and payment method are required.' });
        }

        if (method === 'MobileMoney' && !phone) {
            return res.status(400).json({ message: 'Phone number is required for Mobile Money payments.' });
        }

        // Get access token
        const accessToken = await getAccessToken();

        // Generate a unique transaction ID
        const transactionId = 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // Prepare payment payload
        const collectPayload = {
            walletId: walletId,
            amount: Number(amount),
            currency: 'UGX',
            externalId: transactionId,
            payer: phone,
            payerNote: 'Jot Talent Competition Entry Fee',
            payeeNote: `Payment for competition entry. Email: ${email}`
        };

        console.log('Outgoing collect payload:', JSON.stringify(collectPayload, null, 2));

        // Make payment request to ioTec
        const response = await fetch('https://pay.iotec.io/api/collections/collect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(collectPayload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Mobile Money collection failed:', response.status, response.statusText, errorData);
            return res.status(response.status).json({ 
                message: 'Mobile Money collection failed', 
                error: errorData 
            });
        }

        const data = await response.json();
        console.log('Mobile Money collection successful:', response.status, data);
        
        // Store payment data in Firestore
        try {
            const paymentData = {
                transactionId: transactionId,
                ioTecTransactionId: data.id || data.transactionId,
                amount: Number(amount),
                currency: 'UGX',
                method: method,
                phone: phone,
                email: email,
                competitionId: competitionId || 'firstRound',
                status: data.status || 'PENDING',
                statusMessage: data.statusMessage || 'Payment initiated',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('payments').doc(transactionId).set(paymentData);
            console.log('Payment data stored in Firestore:', transactionId);
        } catch (firestoreError) {
            console.error('Error storing payment data in Firestore:', firestoreError);
            // Continue with the response even if Firestore fails
        }
        
        // Return payment response to client
        return res.json({
            ...data,
            transactionId: transactionId
        });
    } catch (error) {
        console.error("An error occurred:", error);
        return res.status(500).json({ 
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// Payment status endpoint
app.get('/payment-status/:transactionId', async (req, res) => {
    try {
        const { transactionId } = req.params;
        const accessToken = await getAccessToken();
        
        // First check Firestore for the transaction
        try {
            const paymentDoc = await db.collection('payments').doc(transactionId).get();
            if (paymentDoc.exists) {
                const paymentData = paymentDoc.data();
                
                // If payment is already confirmed in Firestore, return that
                if (paymentData.status === 'SUCCESS' || paymentData.status === 'SUCCESSFUL') {
                    return res.json(paymentData);
                }
                
                // If payment failed in Firestore, return that
                if (paymentData.status === 'FAILED') {
                    return res.json(paymentData);
                }
            }
        } catch (firestoreError) {
            console.error('Error checking Firestore for payment status:', firestoreError);
            // Continue with ioTec check if Firestore fails
        }
        
        // If not found in Firestore or status is pending, check with ioTec
        const response = await fetch(`https://pay.iotec.io/api/collections/${transactionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to get payment status from ioTec:', response.status, response.statusText, errorData);
            
            // Return the Firestore data if available, otherwise return error
            try {
                const paymentDoc = await db.collection('payments').doc(transactionId).get();
                if (paymentDoc.exists) {
                    return res.json(paymentDoc.data());
                }
            } catch (firestoreError) {
                console.error('Error getting payment data from Firestore:', firestoreError);
            }
            
            return res.status(response.status).json({ 
                message: 'Failed to get payment status', 
                error: errorData 
            });
        }
        
        const data = await response.json();
        
        // Update Firestore with the latest status
        try {
            await db.collection('payments').doc(transactionId).update({
                status: data.status || 'UNKNOWN',
                statusMessage: data.statusMessage || 'Status checked',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (firestoreError) {
            console.error('Error updating payment status in Firestore:', firestoreError);
        }
        
        res.json({
            ...data,
            transactionId: transactionId
        });
    } catch (error) {
        console.error("An error occurred:", error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// Firebase-only payment verification endpoint (NEW)
app.post('/check-payment-status-firebase', async (req, res) => {
    try {
        const { transactionId } = req.body;
        
        if (!transactionId) {
            return res.status(400).json({ 
                success: false,
                message: 'Transaction ID is required.' 
            });
        }
        
        console.log('🔍 Checking payment status in Firebase:', transactionId);
        
        // Check Firestore for the transaction - source of truth
        const paymentDoc = await db.collection('payments').doc(transactionId).get();
        
        if (!paymentDoc.exists) {
            console.log('❌ Transaction not found in Firebase:', transactionId);
            return res.status(404).json({ 
                success: false,
                paymentStatus: 'NOT_FOUND',
                message: 'Transaction not found',
                transactionId: transactionId
            });
        }
        
        const paymentData = paymentDoc.data();
        console.log('✅ Transaction found in Firebase:', {
            transactionId: transactionId,
            status: paymentData.status,
            amount: paymentData.amount,
            email: paymentData.email
        });
        
        // Return the Firebase data directly (source of truth)
        return res.json({
            success: true,
            paymentStatus: paymentData.status,
            ...paymentData,
            source: 'firebase'
        });
        
    } catch (error) {
        console.error('Error checking payment status in Firebase:', error);
        res.status(500).json({ 
            success: false,
            paymentStatus: 'ERROR',
            message: 'Error checking payment status',
            error: error.message 
        });
    }
});

// Manual payment status override endpoint (NEW) - for admin/support use
app.post('/admin/update-payment-status', verifyIdToken, async (req, res) => {
    try {
        const { transactionId, status, statusMessage } = req.body;
        
        if (!transactionId || !status) {
            return res.status(400).json({ 
                success: false,
                message: 'Transaction ID and status are required.' 
            });
        }
        
        // Validate status
        const validStatuses = ['SUCCESS', 'FAILED', 'PENDING', 'CANCELLED'];
        if (!validStatuses.includes(status.toUpperCase())) {
            return res.status(400).json({ 
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }
        
        console.log(`🔄 Admin updating payment status:`, {
            transactionId: transactionId,
            newStatus: status,
            adminUser: req.auth.email
        });
        
        // Update the payment record in Firestore
        await db.collection('payments').doc(transactionId).update({
            status: status.toUpperCase(),
            statusMessage: statusMessage || `Status updated to ${status}`,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            manuallyUpdatedBy: req.auth.email,
            manuallyUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Payment status updated in Firebase:', transactionId);
        
        return res.json({
            success: true,
            message: 'Payment status updated successfully',
            transactionId: transactionId,
            newStatus: status.toUpperCase()
        });
        
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error updating payment status',
            error: error.message 
        });
    }
});

// Get all payments for a specific email (for user history)
app.post('/user-payments', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false,
                message: 'Email is required.' 
            });
        }
        
        console.log('🔍 Fetching payment history for:', email);
        
        // Query Firestore for payments by email
        const snapshot = await db.collection('payments')
            .where('email', '==', email)
            .orderBy('createdAt', 'desc')
            .get();
        
        const payments = [];
        snapshot.forEach(doc => {
            payments.push({
                transactionId: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`✅ Found ${payments.length} payments for ${email}`);
        
        return res.json({
            success: true,
            email: email,
            paymentCount: payments.length,
            payments: payments
        });
        
    } catch (error) {
        console.error('Error fetching user payments:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching payment history',
            error: error.message 
        });
    }
});

// Endpoint to verify email and complete registration
app.post('/verify-email', async (req, res) => {
    try {
        const { email, verificationCode, transactionId } = req.body;
        
        if (!email || !verificationCode) {
            return res.status(400).json({ message: 'Email and verification code are required.' });
        }
        
        // Check if verification code is valid
        const verificationDoc = await db.collection('verificationCodes').doc(email).get();
        if (!verificationDoc.exists) {
            return res.status(400).json({ message: 'No verification code found for this email.' });
        }
        
        const verificationData = verificationDoc.data();
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const codeTimestamp = verificationData.timestamp.toDate();
        
        if (verificationData.code !== verificationCode) {
            return res.status(400).json({ message: 'Invalid verification code.' });
        }
        
        if (verificationData.used) {
            return res.status(400).json({ message: 'This verification code has already been used.' });
        }
        
        if (codeTimestamp <= tenMinutesAgo) {
            return res.status(400).json({ message: 'This verification code has expired.' });
        }
        
        // Mark code as used
        await db.collection('verificationCodes').doc(email).update({
            used: true,
            usedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Update payment record with verification status
        if (transactionId) {
            await db.collection('payments').doc(transactionId).update({
                emailVerified: true,
                verifiedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Create or update user record
        const userData = {
            email: email,
            verified: true,
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            competitions: admin.firestore.FieldValue.arrayUnion('firstRound')
        };
        
        await db.collection('users').doc(email).set(userData, { merge: true });
        
        res.json({ 
            success: true, 
            message: 'Email verified successfully.' 
        });
        
    } catch (error) {
        console.error("An error occurred:", error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// Endpoint to resend verification code
app.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ message: 'Email is required.' });
        }
        
        // Generate a new verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store the code in Firestore
        await db.collection('verificationCodes').doc(email).set({
            code: verificationCode,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            used: false
        });
        
        // In a real application, you would send an email here
        console.log(`Verification code for ${email}: ${verificationCode}`);
        
        res.json({ 
            success: true, 
            message: 'Verification code resent successfully.',
            code: verificationCode // Remove this in production
        });
        
    } catch (error) {
        console.error("An error occurred:", error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// Start server on all network interfaces
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Payment server running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

// Function to get local IP address
function getIPAddress() {
    const interfaces = require('os').networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return 'localhost';
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
});

// Helper: verify Firebase ID token from Authorization header
async function verifyIdToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Missing or invalid Authorization header' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        // Simple admin check: allow if custom claim 'admin' is true or email matches env ADMIN_EMAIL
        const adminEmail = process.env.ADMIN_EMAIL || '';
        if (decoded.admin === true || (adminEmail && decoded.email === adminEmail)) {
            req.auth = decoded;
            return next();
        }
        return res.status(403).json({ message: 'Insufficient permissions' });
    } catch (err) {
        console.error('Token verification failed', err);
        return res.status(401).json({ message: 'Unauthorized', error: err.message });
    }
}

// Admin endpoints: create, update, delete judge
app.post('/admin/create-judge', verifyIdToken, async (req, res) => {
    if (!adminInitAvailable) return res.status(503).json({ message: 'Admin functionality unavailable: missing service account.' });
    try {
        console.log('/admin/create-judge called by', req.auth && (req.auth.email || req.auth.uid));
        console.log('  body:', JSON.stringify(req.body));
        const { email, password, name, bio } = req.body;
        if (!email || !password || !name) return res.status(400).json({ message: 'email, password and name required' });

        // Create user in Firebase Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name
        });

        // Optionally set custom claims for judge role
        await admin.auth().setCustomUserClaims(userRecord.uid, { judge: true });

        // Compute passwordHash (SHA-256) to store in Firestore for compatibility
        const crypto = require('crypto');
        const passwordHash = crypto.createHash('sha256').update(String(password)).digest('hex');

        // Save to Firestore (document id is uid so judges-login can check by uid)
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
        console.error('create-judge error', error);
        res.status(500).json({ message: 'Failed to create judge', error: error.message });
    }
});

app.post('/admin/update-judge', verifyIdToken, async (req, res) => {
    if (!adminInitAvailable) return res.status(503).json({ message: 'Admin functionality unavailable: missing service account.' });
    try {
        console.log('/admin/update-judge called by', req.auth && (req.auth.email || req.auth.uid));
        console.log('  body:', JSON.stringify(req.body));
        const { uid, email, name, bio, reviewedCount, password } = req.body;
        if (!uid) return res.status(400).json({ message: 'uid required' });

        // Update auth user if email or displayName provided
        const updateAuth = {};
        if (email) updateAuth.email = email;
        if (name) updateAuth.displayName = name;
        if (password) updateAuth.password = password; // update auth password if provided
        if (Object.keys(updateAuth).length) {
            await admin.auth().updateUser(uid, updateAuth);
        }

        // Update Firestore doc
        const updateDoc = {};
        if (name) updateDoc.name = name;
        if (email) updateDoc.email = email;
        if (typeof bio !== 'undefined') updateDoc.bio = bio;
        if (typeof reviewedCount !== 'undefined') updateDoc.reviewedCount = Number(reviewedCount) || 0;

        // If password provided, compute and store passwordHash for compatibility
        if (password) {
            const crypto = require('crypto');
            updateDoc.passwordHash = crypto.createHash('sha256').update(String(password)).digest('hex');
        }

        if (Object.keys(updateDoc).length) {
            await db.collection('judges').doc(uid).set(updateDoc, { merge: true });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('update-judge error', error);
        res.status(500).json({ message: 'Failed to update judge', error: error.message });
    }
});

app.post('/admin/delete-judge', verifyIdToken, async (req, res) => {
    if (!adminInitAvailable) return res.status(503).json({ message: 'Admin functionality unavailable: missing service account.' });
    try {
        console.log('/admin/delete-judge called by', req.auth && (req.auth.email || req.auth.uid));
        console.log('  body:', JSON.stringify(req.body));
        const { uid } = req.body;
        if (!uid) return res.status(400).json({ message: 'uid required' });

        // Delete from Auth
        await admin.auth().deleteUser(uid);
        // Delete Firestore doc
        await db.collection('judges').doc(uid).delete();

        res.json({ success: true });
    } catch (error) {
        console.error('delete-judge error', error);
        res.status(500).json({ message: 'Failed to delete judge', error: error.message });
    }
});

// ============================================================
// WEBHOOK: ioTech Payment Status Updates (NEW)
// ============================================================
// Configure this URL in your ioTech dashboard to receive payment updates
app.post('/webhook/iotec-payment-status', async (req, res) => {
    try {
        console.log('📨 ioTech Webhook Received:', req.body);
        
        const { transactionId, status, statusMessage } = req.body;
        
        if (!transactionId) {
            return res.status(400).json({ 
                success: false,
                message: 'Transaction ID is required in webhook' 
            });
        }
        
        // Normalize status from ioTech format to our format
        const normalizedStatus = status ? status.toUpperCase() : 'UNKNOWN';
        const validStatuses = ['SUCCESS', 'FAILED', 'PENDING', 'CANCELLED'];
        
        if (!validStatuses.includes(normalizedStatus)) {
            console.warn('⚠️ Unknown status received from ioTech:', status);
        }
        
        // Update Firestore with the status from ioTech
        await db.collection('payments').doc(transactionId).update({
            status: normalizedStatus,
            statusMessage: statusMessage || `Status updated by ioTech: ${status}`,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Firestore updated via webhook:', {
            transactionId: transactionId,
            status: normalizedStatus
        });
        
        // If payment successful, send email notification
        if (normalizedStatus === 'SUCCESS') {
            try {
                const paymentDoc = await db.collection('payments').doc(transactionId).get();
                if (paymentDoc.exists) {
                    const payment = paymentDoc.data();
                    // Call email function
                    await sendPaymentSuccessEmail(payment.email, payment);
                }
            } catch (emailError) {
                console.error('Error sending success email:', emailError);
            }
        }
        
        // Return success to ioTech
        return res.json({ 
            success: true, 
            message: 'Webhook processed successfully',
            transactionId: transactionId
        });
        
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error processing webhook',
            error: error.message 
        });
    }
});

// ============================================================
// EMAIL NOTIFICATIONS (NEW)
// ============================================================
async function sendPaymentSuccessEmail(recipientEmail, paymentData) {
    try {
        console.log('📧 Sending success email to:', recipientEmail);
        
        // Log the email that would be sent
        const emailContent = {
            to: recipientEmail,
            subject: '✅ Payment Successful - Competition Entry Confirmed',
            html: `
                <h2>Payment Successful!</h2>
                <p>Hello,</p>
                <p>Your payment for the competition entry has been successfully processed.</p>
                
                <h3>Payment Details:</h3>
                <ul>
                    <li><strong>Transaction ID:</strong> ${paymentData.transactionId}</li>
                    <li><strong>Amount:</strong> ${paymentData.amount.toLocaleString()} ${paymentData.currency}</li>
                    <li><strong>Phone:</strong> ${paymentData.phone}</li>
                    <li><strong>Status:</strong> ${paymentData.status}</li>
                </ul>
                
                <p>Your competition entry is now confirmed. Thank you for joining!</p>
            `
        };
        
        console.log('✅ Email prepared:', emailContent);
        
    } catch (error) {
        console.error('Error preparing email:', error);
        throw error;
    }
}

async function sendPaymentFailedEmail(recipientEmail, paymentData, reason) {
    try {
        console.log('📧 Sending failure email to:', recipientEmail);
        
        const emailContent = {
            to: recipientEmail,
            subject: '❌ Payment Failed - Please Retry',
            html: `
                <h2>Payment Failed</h2>
                <p>Hello,</p>
                <p>Unfortunately, your payment could not be processed.</p>
                
                <h3>Payment Details:</h3>
                <ul>
                    <li><strong>Transaction ID:</strong> ${paymentData.transactionId}</li>
                    <li><strong>Amount:</strong> ${paymentData.amount.toLocaleString()} ${paymentData.currency}</li>
                    <li><strong>Phone:</strong> ${paymentData.phone}</li>
                    <li><strong>Reason:</strong> ${reason}</li>
                </ul>
                
                <p><strong>What to do next:</strong></p>
                <ul>
                    <li>Check that your mobile money account has sufficient funds</li>
                    <li>Verify your phone number is correct</li>
                    <li>Try again in a few moments</li>
                </ul>
            `
        };
        
        console.log('✅ Failure email prepared:', emailContent);
        
    } catch (error) {
        console.error('Error preparing failure email:', error);
    }
}