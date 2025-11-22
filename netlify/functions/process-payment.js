const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Initialize Firebase Admin using env-based service account if present
let db = null;
let adminInitialized = false;
try {
  let serviceAccount;
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || '',
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID || ''
    };
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.DATABASE_URL
    });
    db = admin.firestore();
    adminInitialized = true;
    console.log('Firebase Admin initialized in Netlify function');
  } else {
    // Try to initialize with default credentials (if set up in environment)
    try {
      admin.initializeApp();
      db = admin.firestore();
      adminInitialized = true;
      console.log('Firebase Admin initialized using default credentials');
    } catch (e) {
      console.warn('Firebase Admin initialization skipped in Netlify function:', e && e.message);
    }
  }
} catch (err) {
  console.warn('Error initializing Firebase Admin in Netlify function:', err && err.message);
}

// ioTec credentials (from Netlify env)
const IOTEC_CLIENT_ID = process.env.IOTEC_CLIENT_ID;
const IOTEC_CLIENT_SECRET = process.env.IOTEC_CLIENT_SECRET;
const IOTEC_WALLET_ID = process.env.IOTEC_WALLET_ID;

// Helper to obtain ioTec token
async function getAccessToken() {
  if (!IOTEC_CLIENT_ID || !IOTEC_CLIENT_SECRET) throw new Error('Missing ioTec credentials');
  const tokenUrl = 'https://id.iotec.io/connect/token';
  const params = new URLSearchParams();
  params.append('client_id', IOTEC_CLIENT_ID);
  params.append('client_secret', IOTEC_CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ioTec token error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  return data.access_token;
}

// The Netlify function handler
exports.handler = async function(event, context) {
  // Support CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
      },
      body: ''
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { amount, phone, email, name, currency = 'UGX' } = body;

    // Basic validation
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Invalid amount' }) };
    }
    if (!phone) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Phone is required' }) };
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Invalid email' }) };
    }

    // Get ioTec token
    const accessToken = await getAccessToken();

    // Create transaction id
    const transactionId = 'TXN_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);

    const collectPayload = {
      walletId: IOTEC_WALLET_ID,
      amount: Number(amount),
      currency: currency || 'UGX',
      externalId: transactionId,
      payer: phone,
      payerNote: 'Jot Talent Competition Entry Fee',
      payeeNote: `Entry for: ${name || 'Customer'} - ${email}`
    };

    const resp = await fetch('https://pay.iotec.io/api/collections/collect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(collectPayload)
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('ioTec collection failed', resp.status, data);
      // store failed attempt if db is available
      if (adminInitialized && db) {
        try {
          await db.collection('payments').doc(transactionId).set({
            transactionId,
            amount: Number(amount),
            currency,
            phone,
            email,
            name,
            status: 'FAILED',
            ioTecResponse: data,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (e) {
          console.warn('Could not store failed payment in Firestore:', e && e.message);
        }
      }

      return {
        statusCode: 502,
        body: JSON.stringify({ success: false, message: 'Payment failed', ioTecResponse: data })
      };
    }

    // Store success/pending data
    if (adminInitialized && db) {
      try {
        await db.collection('payments').doc(transactionId).set({
          transactionId,
          ioTecTransactionId: data.id || data.transactionId,
          amount: Number(amount),
          currency,
          phone,
          email,
          name,
          status: data.status || 'PENDING',
          ioTecResponse: data,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.warn('Could not store payment in Firestore:', e && e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, transactionId, ioTecResponse: data })
    };
  } catch (error) {
    console.error('process-payment function error:', error && error.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, message: 'Internal server error', error: String(error && error.message) })
    };
  }
};
