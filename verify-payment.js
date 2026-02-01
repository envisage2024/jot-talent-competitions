// js/verify-payment.js
// Adds a transaction-id watcher to verify payments using Firestore when no email token is present.
// js/verify-payment.js (server-backed phone verification)
(function() {
  function show(msg, detail) {
    const s = document.getElementById('status');
    const d = document.getElementById('details');
    if (s) s.textContent = msg;
    if (d) d.textContent = detail || '';
  }

  const card = document.querySelector('.card');
  if (!card) return show('Page layout unexpected', 'No .card found');

  // Insert phone input UI
  if (!document.getElementById('phoneInput')) {
    const ui = `
      <div style="margin:1rem 0;">
        <input id="phoneInput" placeholder="Enter phone number (e.g. 0700123456)" style="width:60%; padding:8px;" />
        <button id="checkBtn" style="padding:8px 12px; margin-left:8px;">Verify</button>
      </div>
    `;
    card.insertAdjacentHTML('beforeend', ui);
  }

  document.getElementById('checkBtn').addEventListener('click', async () => {
    const phone = document.getElementById('phoneInput').value.trim();
    if (!phone) return show('Please enter your phone number');
    show('Looking up latest payment for ' + phone + '...');

    try {
      const SERVER_URL = (function() {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:10000';
        return 'https://jot-talent-competitions.onrender.com';
      })();

      let payment = null;
      let serverOk = false;
      try {
        const res = await fetch(`${SERVER_URL}/payment-status?phone=${encodeURIComponent(phone)}`);
        if (res.ok) {
          payment = await res.json();
          serverOk = true;
        } else if (res.status === 404) {
          show('No payment found for that phone number yet.', 'If you recently paid, wait a moment and try again.');
          return;
        } else if (res.status === 503) {
          // Server reports DB unavailable -> fallback to client Firestore lookup
          console.warn('Server returned 503, attempting client Firestore lookup fallback');
        } else {
          const body = await res.text();
          show('Server error', `Status ${res.status}: ${body}`);
          return;
        }
      } catch (err) {
        console.warn('Network/server error when contacting verification server:', err.message);
      }

      // If server failed or returned 503, attempt client-side Firestore lookup as a fallback
      if (!serverOk) {
        const fallback = await clientFirestoreLookup(phone);
        if (fallback) {
          payment = fallback;
          show(`Found transaction ${payment.transactionId || payment.id}. (from client Firestore)`);
        } else {
          show('Verification service unavailable and no client cached payment found.', 'Please try again later or contact support.');
          return;
        }
      }
      if (!payment || !payment.transactionId) {
        show('No valid payment found for that phone');
        return;
      }

      show(`Found transaction ${payment.transactionId}. Current status: ${payment.status || 'UNKNOWN'}`);
      document.getElementById('details').innerText = JSON.stringify(payment, null, 2);

      // If already final, show result
      if (payment.status === 'SUCCESS' || payment.status === 'VERIFIED') {
        show('✅ Payment verified — entry confirmed');
        return;
      }
      if (payment.status === 'FAILED') {
        show('❌ Payment failed: ' + (payment.statusMessage || 'Unknown'));
        return;
      }

      // Otherwise poll server for final status every 5 seconds (max 2 minutes)
      const tx = payment.transactionId;
      const pollInterval = 5000;
      const maxAttempts = 24; // 2 minutes
      let attempts = 0;

      show('⏳ Payment pending — polling for confirmation...');
      const intervalId = setInterval(async () => {
        attempts++;
        try {
          const r = await fetch(`${SERVER_URL}/payment-status/${encodeURIComponent(tx)}`);
          if (!r.ok) {
            // If server DB is flakey, attempt client-side lookup as fallback
            if (r.status === 503) {
              const fb = await clientFirestoreLookup(phone);
              if (fb && (fb.status === 'SUCCESS' || fb.status === 'FAILED')) {
                show(fb.status === 'SUCCESS' ? '✅ Payment verified — entry confirmed' : '❌ Payment failed: ' + (fb.statusMessage || 'Unknown'));
                document.getElementById('details').innerText = JSON.stringify(fb, null, 2);
                clearInterval(intervalId);
                return;
              }
              console.warn('Polling server returned 503 and no client fallback found');
              return;
            }
            console.warn('Polling error', r.status);
            return;
          }
          const p = await r.json();
          document.getElementById('details').innerText = JSON.stringify(p, null, 2);
          if (p.status === 'SUCCESS' || p.status === 'VERIFIED') {
            show('✅ Payment verified — entry confirmed');
            clearInterval(intervalId);
            return;
          }
          if (p.status === 'FAILED') {
            show('❌ Payment failed: ' + (p.statusMessage || 'Unknown'));
            clearInterval(intervalId);
            return;
          }
        } catch (err) {
          console.error('Poll error', err);
        }
        if (attempts >= maxAttempts) {
          clearInterval(intervalId);
          show('Timed out waiting for verification. Please try again later or contact support.');
        }
      }, pollInterval);

    } catch (err) {
      console.error('Verify error', err);
      show('Error verifying payment: ' + (err.message || err));
    }
  });


  // Client-side Firestore fallback lookup
  async function clientFirestoreLookup(phone) {
    try {
      if (!window.firebase || !window.__FIREBASE_CONFIG__) {
        console.warn('Firebase SDK or config not present for client fallback');
        return null;
      }

      if (!window._clientDb) {
        try {
          firebase.initializeApp(window.__FIREBASE_CONFIG__);
        } catch (e) {
          // ignore if already initialized
        }
        window._clientDb = firebase.firestore();
      }

      const paymentsSnapshot = await window._clientDb.collection('payments')
        .where('phone', '==', phone)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (paymentsSnapshot.empty) return null;
      return paymentsSnapshot.docs[0].data();
    } catch (e) {
      console.error('Client Firestore lookup failed:', e.message || e);
      return null;
    }
  }

})();
