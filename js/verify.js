// Minimal verification page script - uses Firebase client SDK to confirm verification tokens
(async function() {
  function show(msg, detail) {
    const s = document.getElementById('status');
    const d = document.getElementById('details');
    if (s) s.textContent = msg;
    if (d) d.textContent = detail || '';
  }

  // Wait for firebase to be available
  function waitForFirebase(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function check() {
        if (window.firebase && firebase.firestore) return resolve();
        if (Date.now() - start > timeout) return reject(new Error('Firebase not available'));
        setTimeout(check, 150);
      })();
    });
  }

  try {
    await waitForFirebase();
  } catch (err) {
    show('Error', 'Firebase SDK not loaded.');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    show('Invalid link', 'No verification token provided.');
    return;
  }

  try {
    const db = firebase.firestore();
    const tokenRef = db.collection('email_verifications').doc(token);
    const snap = await tokenRef.get();
    if (!snap.exists) {
      show('Expired or invalid link', 'This verification link is invalid or has already been used.');
      return;
    }
    const data = snap.data() || {};
    if (!data.uid) {
      show('Invalid token', 'No user attached to this token.');
      await tokenRef.delete().catch(()=>{});
      return;
    }
    const userRef = db.collection('users').doc(data.uid);
    // Idempotently set emailConfirmed and timestamp if not already confirmed
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    if (!userData.emailConfirmed) {
      await userRef.set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    // Ensure default status
    if (!userData.status) {
      await userRef.set({ status: 'member' }, { merge: true });
    }
    // Delete the used token and any other tokens for this uid to prevent reuse
    try { await tokenRef.delete(); } catch (e) { console.warn('Could not delete token', e); }
    try {
      const otherTokens = await db.collection('email_verifications').where('uid', '==', data.uid).get();
      const batch = db.batch();
      otherTokens.forEach(doc => { if (doc.id !== token) batch.delete(doc.ref); });
      if (!otherTokens.empty) await batch.commit();
    } catch (e) { console.warn('Could not cleanup other tokens for uid', e); }
    show('Email verified', 'Your email has been verified — you can now sign in.');
  } catch (err) {
    console.error('verify error', err);
    show('Verification failed', err.message || 'An unexpected error occurred.');
  }
})();
