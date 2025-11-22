// Firebase config and initialization
// Defer all firebase access until the SDK is available to avoid "firebase is not defined" when
// this script is loaded before the CDN SDKs. We wrap initialization in an async IIFE.
const firebaseConfig = {
  apiKey: "AIzaSyBgnkqrg_2clJ77WTonEQFC3gwVrG7HrO4",
  authDomain: "jot-talent-competitions-72b9f.firebaseapp.com",
  databaseURL: "https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com",
  projectId: "jot-talent-competitions-72b9f",
  storageBucket: "jot-talent-competitions-72b9f.firebasestorage.app",
  messagingSenderId: "25581487736",
  appId: "1:25581487736:web:a3730b66cd4fb7d9ebcf8d",
  measurementId: "G-8NRD37H5YD"
};
// We'll initialize firebase, auth, and db once the SDK is present.
let auth = null;
let db = null;
(async function waitAndInitFirebase(){
  function waitForFirebase(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function check(){
        if (window.firebase && typeof firebase === 'object' && firebase.auth) return resolve();
        if (Date.now() - start > timeout) return reject(new Error('Firebase SDK not available'));
        setTimeout(check, 150);
      })();
    });
  }
  try {
    await waitForFirebase(5000);
    if (!firebase.apps.length) {
      try { firebase.initializeApp(firebaseConfig); } catch(e) { /* already init elsewhere */ }
    }
    try {
      auth = firebase.auth();
      db = firebase.firestore();
      // Use persistent auth so users remain signed in across browser sessions.
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => console.warn('Could not set auth persistence', err));
    } catch (e) {
      console.warn('Auth/db init failed', e);
    }
  } catch (e) {
    console.warn('login.js: Firebase SDK not detected, continuing without firebase for now', e);
  }
})();

// Helpers to obtain auth/db when they become available
function getAuth(timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check(){
      if (auth) return resolve(auth);
      if (Date.now() - start > timeout) return resolve(null);
      setTimeout(check, 150);
    })();
  });
}

function getDb(timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function check(){
      if (db) return resolve(db);
      if (Date.now() - start > timeout) return resolve(null);
      setTimeout(check, 150);
    })();
  });
}

// Fetch the Firestore user profile and persist a lightweight local session object
async function fetchAndPersistUserProfile(uid, firebaseUser) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    // Normalize createdAt if it's a Firestore Timestamp
    let registeredAt = new Date().toISOString();
    try {
      if (data.createdAt && data.createdAt.toDate) registeredAt = data.createdAt.toDate().toISOString();
      else if (data.createdAt) registeredAt = data.createdAt;
    } catch (e) {}
    const profile = {
      id: uid,
      uid: uid,
      email: firebaseUser && firebaseUser.email ? firebaseUser.email : (data.email || ''),
      fullName: data.fullName || (firebaseUser && firebaseUser.displayName) || '',
      username: data.username || ((firebaseUser && firebaseUser.displayName) ? firebaseUser.displayName.replace(/\s+/g,'').toLowerCase() : ''),
      hasPaid: !!data.hasPaid,
      dateOfBirth: data.dateOfBirth || null,
      registeredAt: registeredAt
    };
    try {
      if (typeof setCurrentUser === 'function') setCurrentUser(profile);
      else localStorage.setItem('jot_talent_current_user', JSON.stringify(profile));
    } catch (e) {
      // best-effort persistence
      try { localStorage.setItem('jot_talent_current_user', JSON.stringify(profile)); } catch (e2) { console.warn('Could not persist profile locally', e2); }
    }
    return profile;
  } catch (err) {
    console.warn('fetchAndPersistUserProfile failed', err);
    return null;
  }
}

// Wait until the users/<uid> doc exists (or timeout). Returns the doc data or null.
async function waitForUserDoc(uid, timeoutMs = 8000) {
  if (!uid) return null;
  try {
    const ref = db.collection('users').doc(uid);
    const start = Date.now();
    // quick initial check
    let snap = await ref.get();
    while (!snap.exists && (Date.now() - start) < timeoutMs) {
      await new Promise(r => setTimeout(r, 400));
      try { snap = await ref.get(); } catch (e) { /* ignore transient errors */ }
    }
    return snap.exists ? (snap.data() || {}) : null;
  } catch (e) {
    console.warn('waitForUserDoc error', e);
    return null;
  }
}

// Notification system
function showNotification(message, type = 'info') {
  const oldNote = document.getElementById('loginNotification');
  if (oldNote) oldNote.remove();
  const note = document.createElement('div');
  note.id = 'loginNotification';
  note.style.position = 'fixed';
  note.style.top = '20px';
  note.style.left = '50%';
  note.style.transform = 'translateX(-50%)';
  note.style.background = type === 'error' ? '#f44336' : (type === 'success' ? '#4caf50' : '#2196f3');
  note.style.color = '#fff';
  note.style.padding = '12px 24px';
  note.style.borderRadius = '6px';
  note.style.zIndex = '99999';
  note.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  note.textContent = message;
  document.body.appendChild(note);
  setTimeout(() => {
    note.remove();
  }, 3500);
}

// Verification removed: make sendVerificationEmail a harmless no-op.
async function sendVerificationEmail(email) {
  // Intentionally do nothing; verification flows have been disabled.
  return true;
}

// Create a verification token in Firestore and ask the email-sender to send the site link (/verify.html?token=)
async function createAndSendVerificationToken(uid, email) {
  // Verification/confirmation flow has been disabled. Mark user confirmed (best-effort) and return true.
  try {
    await db.collection('users').doc(uid).set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  } catch (err) {
    console.warn('createAndSendVerificationToken: could not mark user confirmed', err);
    return false;
  }
}
  document.addEventListener('DOMContentLoaded', async function() {
  const loginForm = document.getElementById('loginForm');
  // Use pre-rendered overlay if available (avoids dynamic insertion and flicker)
  const overlay = document.getElementById('authCheckOverlay');
  if (!loginForm) {
    // If login form not present, keep overlay while checking; we'll still check auth
  }
  // Wait for Firebase Auth to report current state (once)
  let currentUser = null;
  try {
  // If user recently clicked explicit logout we set a flag to prevent auto re-login
  // Prefer central storage helper if present, otherwise read localStorage fallback
  let loggedOutFlag = null;
  let loggedOutAt = null;
  try {
    if (typeof getStorageData === 'function') {
      loggedOutFlag = getStorageData('jot_talent_user_logged_out');
      loggedOutAt = getStorageData('jot_talent_user_logged_out_at');
    } else {
      loggedOutFlag = localStorage.getItem('jot_talent_user_logged_out');
      loggedOutAt = localStorage.getItem('jot_talent_user_logged_out_at');
    }
  } catch (e) { loggedOutFlag = null; loggedOutAt = null; }
  // Treat the logout flag as time-limited (24h). If expired, clear the keys.
  const LOGOUT_EXPIRY_MS = 1000 * 60 * 60 * 24; // 24 hours
  let loggedOutActive = false;
  try {
    if (loggedOutFlag) {
      const atNum = parseInt(loggedOutAt || '0', 10) || 0;
      if (Date.now() - atNum < LOGOUT_EXPIRY_MS) loggedOutActive = true;
      else {
        // expired -> cleanup
        try { localStorage.removeItem('jot_talent_user_logged_out'); localStorage.removeItem('jot_talent_user_logged_out_at'); } catch (e) {}
        loggedOutActive = false;
      }
    }
  } catch (e) { loggedOutActive = false; }
  // Wait for auth to be ready, then check state
  try {
    const _auth = await getAuth(3000);
    if (_auth) {
      currentUser = await new Promise((resolve) => {
        const unsub = _auth.onAuthStateChanged(user => { try{ unsub(); }catch(e){}; resolve(user); });
        // fallback timeout in case onAuthStateChanged doesn't fire quickly
        setTimeout(() => { try { unsub(); } catch(e){}; resolve(null); }, 2500);
      });
    } else {
      currentUser = null;
    }
  } catch (e) { currentUser = null; }
    if (loggedOutActive && currentUser) {
      // Previously we forcibly signed out when a logout flag existed. That can cause a
      // redirect/sign-out loop if the flag is stale. Instead, clear the logout flag and
      // allow a persistent session to continue.
      try {
        localStorage.removeItem('jot_talent_user_logged_out');
        localStorage.removeItem('jot_talent_user_logged_out_at');
      } catch (e) { /* ignore */ }
      loggedOutActive = false;
      // Do not sign out the user here; allow the session to persist and proceed.
    }
  } catch (err) {
    console.error('Auth state check failed', err);
    currentUser = null;
  }
    if (currentUser) {
    // Verification removed: ensure app-level flag is set (best-effort).
    try {
      const _db = await getDb(2000);
      if (_db && firebase && firebase.firestore) await _db.collection('users').doc(currentUser.uid).set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) { console.warn('Could not set emailConfirmed for currentUser', e); }

    // If this script is running on the actual login page (login form or overlay present)
    // then redirect signed-in users to the dashboard as previously implemented.
    // When this file is included on other pages (we include it for helpers), avoid
    // forcing a redirect loop — just persist the profile locally and continue.
    const isLoginPage = !!loginForm || !!overlay || /login(\.html)?$/i.test(window.location.pathname);
    try {
      await fetchAndPersistUserProfile(currentUser.uid, currentUser);
    } catch (e) { console.warn('Could not fetch/persist profile for currentUser', e); }
    if (isLoginPage) {
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 700);
      return;
    }
    // Not a login page: reveal any auth content (if present) and stop — do not redirect.
    if (overlay) {
      overlay.classList.add('hidden');
      setTimeout(() => { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 400);
    }
    const authContent = document.getElementById('authContent');
    if (authContent) authContent.style.visibility = 'visible';
    return;
  }
  // If we reach here and user had previously logged out but the flag expired, it was already cleaned up above.
  // Do not unconditionally remove the user's explicit logout flag here; we rely on expiry or explicit user actions.
  // No signed-in user: fade out overlay and remove after transition to avoid visual glitch
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 400);
  }
  if (!loginForm) return;
  // Reveal main auth content after overlay is gone
  const authContent = document.getElementById('authContent');
  if (authContent) authContent.style.visibility = 'visible';

  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const loginBtn = document.getElementById('loginBtn');

  // Processing guards to prevent duplicate submissions
  let loginProcessing = false;
  let googleProcessing = false;

  function disableElementBtn(btn) {
    if (!btn) return;
    try {
      btn.dataset.prevDisabled = btn.disabled ? '1' : '0';
      btn.dataset.prevBg = btn.style.background || '';
      btn.dataset.prevColor = btn.style.color || '';
      btn.dataset.prevCursor = btn.style.cursor || '';
    } catch (e) {}
    btn.disabled = true;
    btn.style.background = '#cccccc';
    btn.style.color = '#888888';
    btn.style.cursor = 'not-allowed';
  }

  function enableElementBtn(btn) {
    if (!btn) return;
    try {
      btn.disabled = (btn.dataset.prevDisabled === '1');
      btn.style.background = btn.dataset.prevBg || '';
      btn.style.color = btn.dataset.prevColor || '';
      btn.style.cursor = btn.dataset.prevCursor || '';
      delete btn.dataset.prevDisabled; delete btn.dataset.prevBg; delete btn.dataset.prevColor; delete btn.dataset.prevCursor;
    } catch (e) {
      // fallback
      btn.disabled = false;
      btn.style.background = '';
      btn.style.color = '';
      btn.style.cursor = '';
    }
  }

  async function handleLogin() {
    if (loginProcessing) return; // already processing
    loginProcessing = true;
    disableElementBtn(loginBtn);
    const email = emailInput.value;
    const password = passwordInput.value;
      try {
        const _auth = await getAuth(4000);
        const _db = await getDb(4000);
        if (!_auth) throw new Error('Authentication service unavailable. Please try again shortly.');
        const userCredential = await _auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
      // If Firebase reports emailVerified, ensure our app-level flag is set so we don't re-send tokens
      try {
        if (user && user.emailVerified) {
          try { await db.collection('users').doc(user.uid).set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch (e) { console.warn('Could not set emailConfirmed from firebase emailVerified', e); }
        }
      } catch (e) { console.warn('Error while checking firebase emailVerified on sign-in', e); }
      // Check application-level emailConfirmed flag in Firestore (set by verify flow)
        const userDoc = _db ? await _db.collection('users').doc(user.uid).get() : { exists: false };
        const userData = userDoc.exists ? (userDoc.data() || {}) : {};
      const confirmed = !!userData.emailConfirmed;
        // No email verification required: proceed
        // Proceed to fetch profile and redirect
      if (!userDoc.exists) {
        showNotification('User profile not found. Please contact support.', 'error');
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.style.background = '';
          loginBtn.style.color = '';
          loginBtn.style.cursor = '';
        }
        return;
      }
      // Fetch the Firestore profile and persist it locally before redirect
      try {
        const persisted = await fetchAndPersistUserProfile(user.uid, user);
        if (!persisted) {
          showNotification('User profile not found. Please contact support.', 'error');
          if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.style.background = '';
            loginBtn.style.color = '';
            loginBtn.style.cursor = '';
          }
          return;
        }
        // Clear any logged-out flag
        try { localStorage.removeItem('jot_talent_user_logged_out'); } catch (e) {}
  showNotification('Login successful!', 'success');
  try { localStorage.setItem('jt_recent_signin', String(Date.now())); } catch (e) {}
  setTimeout(function() { window.location.href = 'dashboard.html'; }, 800);
      } catch (e) {
        console.warn('Could not persist profile before redirect', e);
        showNotification('Login successful (partial). Redirecting...', 'info');
        setTimeout(function() { window.location.href = 'dashboard.html'; }, 800);
      }
    } catch (error) {
      // Map common credential errors to a friendlier message
      const code = error && error.code ? error.code : '';
      if (code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email' || code === 'auth/invalid-login-credentials') {
        showNotification('Invalid credentials. Please cross check!', 'error');
      } else {
        showNotification(error.message || 'Login failed. Please check your credentials.', 'error');
      }
      if (loginBtn) enableElementBtn(loginBtn);
    }
    finally {
      loginProcessing = false;
      // if we're still on this page, ensure button is enabled
      try { if (document.body && !window.location.href.includes('dashboard.html')) enableElementBtn(loginBtn); } catch (e) {}
    }
  }
  // Keep default form submit prevented to allow Enter key to trigger login safely
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    handleLogin();
  });
  // Button click invokes same handler without causing native form submission
  if (loginBtn) {
    loginBtn.addEventListener('click', function() {
      handleLogin();
    });
  }

  // Forgot password flow: show modal and call Firebase sendPasswordResetEmail
  const forgotLink = document.getElementById('forgotPasswordLink');
  function showForgotPasswordModal(initialEmail = '') {
    // Remove existing
    const old = document.getElementById('forgotPasswordModal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'forgotPasswordModal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.6)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '99999';
    modal.innerHTML = `
      <div style="background:#fff;padding:1.5rem;border-radius:8px;max-width:420px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,0.2);">
        <h3 style="margin-top:0">Reset your password</h3>
        <p>Enter the email address for your account and we'll send a link to reset your password.</p>
        <input id="resetEmailInput" type="email" placeholder="Email address" value="${initialEmail}" style="width:100%;padding:10px;margin-top:8px;border:1px solid #ddd;border-radius:4px;">
        <div style="margin-top:12px;text-align:right;">
          <button id="cancelReset" style="margin-right:8px;padding:8px 12px;background:#eee;border:0;border-radius:4px;">Cancel</button>
          <button id="sendResetBtn" style="padding:8px 12px;background:#1976d2;color:#fff;border:0;border-radius:4px;">Send reset email</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const cancelBtnEl = document.getElementById('cancelReset');
    const sendBtnEl = document.getElementById('sendResetBtn');
    cancelBtnEl.onclick = function() { modal.remove(); };
    sendBtnEl.onclick = async function() {
      const email = document.getElementById('resetEmailInput').value.trim();
      if (!email) {
        showNotification('Please enter the email address for your account.', 'error');
        return;
      }
      // Show spinner and disable buttons while sending
      const spinnerSvg = '<svg width="16" height="16" viewBox="0 0 50 50" style="vertical-align:middle;margin-right:8px;"><circle cx="25" cy="25" r="20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(0 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/></circle></svg>';
      const originalText = sendBtnEl.textContent;
      try {
        sendBtnEl.disabled = true;
        cancelBtnEl.disabled = true;
        sendBtnEl.innerHTML = spinnerSvg + 'Sending...';
        const _auth = await getAuth(3000);
        if (!_auth) throw new Error('Authentication service unavailable. Please try again later.');
        await _auth.sendPasswordResetEmail(email);
        showNotification('Password reset email sent. Check your inbox.', 'success');
        modal.remove();
      } catch (err) {
        console.error('Reset email error', err);
        showNotification(err.message || 'Could not send reset email.', 'error');
        // Restore buttons
        sendBtnEl.disabled = false;
        cancelBtnEl.disabled = false;
        sendBtnEl.textContent = originalText;
      }
    };
  }
  if (forgotLink) {
    forgotLink.addEventListener('click', function(e) {
      e.preventDefault();
      const prefill = (emailInput && emailInput.value) ? emailInput.value : '';
      showForgotPasswordModal(prefill);
    });
  }

  // --- Google Sign-In flow ---
  const googleBtn = document.getElementById('googleSignInBtn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async function() {
      if (googleProcessing) return;
      googleProcessing = true;
      disableElementBtn(googleBtn);
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
  if (!user) throw new Error('Google sign-in failed.');
        // First check if there is an existing account with the same email (but different uid)
        const emailQuery = await db.collection('users').where('email', '==', user.email).limit(1).get();
  if (!emailQuery.empty) {
          const existingDoc = emailQuery.docs[0];
          const existingData = existingDoc.data() || {};
          if (existingDoc.id === user.uid) {
            // Account already exists for this uid (normal case)
            const data = existingData;
            // Ensure emailConfirmed is set in Firestore before allowing access
            try {
              const udoc = await db.collection('users').doc(user.uid).get();
              const udata = udoc.exists ? (udoc.data() || {}) : {};
              if (!udata.emailConfirmed) {
              // No email verification required; proceed
              // Proceed to fetch profile and redirect
              }
            } catch (e) { console.warn('Could not check emailConfirmed flag', e); }
            // Persist session only after confirmation
            const userProfile = {
              id: user.uid,
              uid: user.uid,
              email: user.email,
              fullName: data.fullName || user.displayName || '',
              username: data.username || (user.displayName ? user.displayName.replace(/\s+/g,'').toLowerCase() : ''),
              hasPaid: !!data.hasPaid,
              registeredAt: data.createdAt ? data.createdAt : new Date().toISOString()
            };
            try {
              // Ensure canonical Firestore profile exists and persist it locally; wait for doc creation if needed
              const data = await waitForUserDoc(user.uid, 8000);
              if (data) {
                try { await fetchAndPersistUserProfile(user.uid, user); } catch (e) { console.warn('fetchAndPersistUserProfile after wait failed', e); }
              } else {
                // fallback: still attempt to fetch and persist (best-effort)
                try { await fetchAndPersistUserProfile(user.uid, user); } catch (e) { console.warn('Could not fetch/persist profile after Google sign-in', e); }
              }
            } catch (e) { console.warn('Could not ensure profile after Google sign-in', e); }
              showNotification('Signed in successfully!', 'success');
              try { localStorage.setItem('jt_recent_signin', String(Date.now())); } catch (e) {}
              setTimeout(() => { window.location.href = 'dashboard.html'; }, 700);
              return;
            showNotification('Signed in successfully!', 'success');
            try { localStorage.setItem('jt_recent_signin', String(Date.now())); } catch (e) {}
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 700);
            return;
          } else {
            // Found an account registered with this email under a different uid -> prompt user to merge
            const doMerge = await showMergePrompt(existingDoc.id, existingData, user);
            if (!doMerge) {
              // user cancelled merge -> sign out and abort
              try { const _auth = await getAuth(2000); if (_auth) await _auth.signOut(); } catch (e) {}
              showNotification('Sign-in cancelled.', 'info');
              return;
            }
            // If user accepted merge, the showMergePrompt will perform the merge and redirect. Stop processing.
            return;
          }
        }
        // No account with same email found. Check by uid (very rare) and continue as before.
        const userDocRef = db.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();
  if (userDoc.exists) {
          // Existing user -> persist session and go to dashboard
          // Ensure emailConfirmed is set in Firestore for existing Google-linked account
          try {
            const udoc = await db.collection('users').doc(user.uid).get();
            const udata = udoc.exists ? (udoc.data() || {}) : {};
            if (!udata.emailConfirmed) {
            // No email verification required; proceed
            // Proceed to fetch profile and redirect
            }
            // Persist session only after confirmation
              try {
                await fetchAndPersistUserProfile(user.uid, user);
              } catch (e) { console.warn('Could not fetch/persist profile after Google sign-in', e); }
          } catch (e) { console.warn('Could not check emailConfirmed flag', e); }
          showNotification('Signed in successfully!', 'success');
          try { localStorage.setItem('jt_recent_signin', String(Date.now())); } catch (e) {}
          setTimeout(() => { window.location.href = 'dashboard.html'; }, 700);
          return;
        }
        // New user: try to extract DOB from Google profile and show modal with prefilled values
        let preDob = '';
        try {
          // additionalUserInfo.profile may contain birthdate depending on Google scopes and account settings
          if (result && result.additionalUserInfo && result.additionalUserInfo.profile) {
            const p = result.additionalUserInfo.profile;
            if (p.birthdate) preDob = p.birthdate; // sometimes 'YYYY-MM-DD' or partial
            else if (p.birthday) preDob = p.birthday;
          }
          // Some SDKs surface profile fields directly on user.providerData
          if (!preDob && result && result.user && result.user.providerData) {
            for (const pd of result.user.providerData) {
              if (pd && pd.birthdate) { preDob = pd.birthdate; break; }
            }
          }
          // Normalise formats like 'MM/DD/YYYY' to 'YYYY-MM-DD' if needed
          if (preDob && preDob.indexOf('/') !== -1) {
            const parts = preDob.split('/');
            if (parts.length === 3) {
              // assume MM/DD/YYYY
              const mm = parts[0].padStart(2,'0'); const dd = parts[1].padStart(2,'0'); const yyyy = parts[2];
              preDob = `${yyyy}-${mm}-${dd}`;
            }
          }
        } catch (e) { console.warn('Could not extract DOB from Google profile', e); }
        showAdditionalDetailsModal(user, preDob);
      } catch (err) {
        console.error('Google sign-in error', err);
        showNotification(err.message || 'Google sign-in failed.', 'error');
        // Restore UI state and allow retry
        try { enableElementBtn(googleBtn); } catch (e) {}
        googleProcessing = false;
        return;
      }
    }); // end googleBtn click handler
  } // end if (googleBtn)

  // Show additional-details modal for new Google users
  async function showAdditionalDetailsModal(googleUser, preDob) {
    const preName = (googleUser && googleUser.displayName) ? googleUser.displayName : '';
    const preEmail = googleUser && googleUser.email ? googleUser.email : '';
    const preDobVal = preDob || '';
    // Build modal
    const old = document.getElementById('googleDetailsModal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'googleDetailsModal';
    modal.style.position = 'fixed';
    modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100vw'; modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.6)'; modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center'; modal.style.zIndex = '99999';
    modal.innerHTML = `
      <div style="background:#fff;padding:1.5rem;border-radius:8px;max-width:520px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,0.2);">
        <h3 style="margin-top:0">Almost there</h3>
        <p>Please provide the remaining details to complete your account.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="grid-column:span 2;">
            <label>Full Name</label>
            <input id="g_fullName" type="text" value="${escapeHtml(preName)}" required style="width:100%;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:4px;">
          </div>
          <div>
            <label>Username (public)</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <input id="g_username" type="text" placeholder="username" required style="flex:1;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:4px;">
              <span id="g_username_spinner" style="display:none;width:22px;height:22px;vertical-align:middle;"></span>
            </div>
            <div id="g_username_feedback" style="font-size:0.9em;margin-top:4px;color:#f44336;"></div>
          </div>
          <div>
            <label>Email Address (read-only)</label>
            <input id="g_email" type="email" value="${escapeHtml(preEmail)}" readonly style="width:100%;padding:8px;margin-top:6px;border:1px solid #eee;border-radius:4px;background:#fafafa;">
          </div>
          <div>
            <label>Date of birth</label>
            <input id="g_dob" type="date" value="${escapeHtml(preDobVal)}" placeholder="YYYY-MM-DD" required style="width:100%;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:4px;">
            <small style="display:block;margin-top:6px;color:var(--gray);">Required. We need your date of birth to confirm eligibility (minimum 13 years).</small>
          </div>
          <div style="grid-column:span 2;margin-top:6px;">
            <label>Writing Bio (Optional)</label>
            <textarea id="g_bio" rows="3" style="width:100%;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:4px;" placeholder="Tell us about your writing experience..."></textarea>
          </div>
          <div style="grid-column:span 2;display:flex;align-items:center;gap:8px;margin-top:6px;">
            <input id="g_terms" type="checkbox" />
            <label for="g_terms">I agree to the Terms and Conditions</label>
          </div>
          <div style="grid-column:span 2;margin-top:8px;">
            <label>How did you hear about Jot Talent Competitions?</label>
            <select id="g_referral" style="width:100%;padding:8px;margin-top:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="">Select an option</option>
              <option value="YouTube">YouTube</option>
              <option value="Instagram">Instagram</option>
              <option value="Facebook">Facebook</option>
              <option value="TikTok">TikTok</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Agents">Agents</option>
              <option value="Other">Other</option>
            </select>
            <div id="g_otherReferralContainer" style="display:none;margin-top:8px;"><input id="g_otherReferral" type="text" placeholder="Please specify..." style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;"></div>
          </div>
        </div>
        <div style="margin-top:12px;text-align:right;">
          <button id="g_cancel" style="margin-right:8px;padding:8px 12px;background:#eee;border:0;border-radius:4px;">Cancel</button>
          <button id="g_submit" style="padding:8px 12px;background:#1976d2;color:#fff;border:0;border-radius:4px;">Finish and Sign in</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Wire up simple UI interactions
    const g_referral = document.getElementById('g_referral');
    const g_otherContainer = document.getElementById('g_otherReferralContainer');
    const g_other = document.getElementById('g_otherReferral');
    const g_username = document.getElementById('g_username');
    const g_usernameSpinner = document.getElementById('g_username_spinner');
    const g_usernameFeedback = document.getElementById('g_username_feedback');
    let g_usernameTimeout = null;
    if (g_username) {
      g_username.addEventListener('input', function() {
        const v = g_username.value.trim();
        g_usernameFeedback.textContent = '';
        if (g_usernameTimeout) clearTimeout(g_usernameTimeout);
        if (!v.match(/^[A-Za-z.]{3,20}$/)) {
          g_usernameFeedback.textContent = 'Username must be 3-20 characters; letters and full stops (.) only.';
          g_usernameSpinner.style.display = 'none';
          return;
        }
        g_usernameSpinner.style.display = 'inline-block';
        g_usernameSpinner.innerHTML = '<svg width="20" height="20" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#1976d2" stroke-width="4" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(0 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/></circle></svg>';
        g_usernameTimeout = setTimeout(async function() {
          try {
            const snap = await db.collection('users').where('username', '==', v).limit(1).get();
            g_usernameSpinner.style.display = 'none';
            if (!snap.empty) {
              g_usernameFeedback.style.color = '#f44336';
              g_usernameFeedback.textContent = 'Username is taken.';
            } else {
              g_usernameFeedback.style.color = '#4caf50';
              g_usernameFeedback.textContent = 'Username is available.';
            }
          } catch (err) {
            g_usernameSpinner.style.display = 'none';
            g_usernameFeedback.style.color = '#f44336';
            g_usernameFeedback.textContent = 'Error checking username.';
          }
        }, 600);
      });
    }
    if (g_referral) {
      g_referral.addEventListener('change', function() {
        if (g_referral.value === 'Other') {
          g_otherContainer.style.display = 'block';
          if (g_other) g_other.required = true;
        } else {
          g_otherContainer.style.display = 'none';
          if (g_other) { g_other.required = false; g_other.value = ''; }
        }
      });
    }
  document.getElementById('g_cancel').onclick = async function() { try { const _auth = await getAuth(2000); if (_auth) await _auth.signOut(); } catch (e) {} modal.remove(); };
    document.getElementById('g_submit').onclick = async function() {
      const username = document.getElementById('g_username').value.trim();
      const fullName = document.getElementById('g_fullName').value.trim();
      const email = document.getElementById('g_email').value.trim();
      const bio = document.getElementById('g_bio').value.trim();
      const dobRaw = (document.getElementById('g_dob') ? document.getElementById('g_dob').value : '') || '';
      const referral = (document.getElementById('g_referral').value === 'Other') ? (document.getElementById('g_otherReferral').value.trim() || 'Other') : document.getElementById('g_referral').value;
      const termsAccepted = !!document.getElementById('g_terms').checked;
      // Validate
      if (!dobRaw) { showNotification('Please enter your date of birth.', 'error'); return; }
      const dt = new Date(dobRaw); if (isNaN(dt.getTime())) { showNotification('Please enter a valid date of birth.', 'error'); return; }
      const now = new Date(); if (dt > now) { showNotification('Date of birth cannot be in the future.', 'error'); return; }
      let age = now.getFullYear() - dt.getFullYear(); const m = now.getMonth() - dt.getMonth(); if (m < 0 || (m === 0 && now.getDate() < dt.getDate())) age--; if (age < 13) { showNotification('You must be at least 13 years old to create an account.', 'error'); return; }
      if (!username.match(/^[a-zA-Z0-9_]{3,20}$/)) { showNotification('Username must be 3-20 characters, letters, numbers, underscores only.', 'error'); return; }
      if (fullName.split(/\s+/).length < 2) { showNotification('Please enter your full name (at least two words).', 'error'); return; }
      if (!termsAccepted) { showNotification('You must agree to the Terms and Conditions.', 'error'); return; }
      const submitBtn = document.getElementById('g_submit'); const originalBtnHTML = submitBtn.innerHTML; submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner" style="display:inline-block;vertical-align:middle;margin-right:8px;"><svg width="18" height="18" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(0 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/></circle></svg></span>Saving...';
      try {
        const snapshot = await db.collection('users').where('username', '==', username).limit(1).get();
        if (!snapshot.empty) { showNotification('Username is already taken. Please choose another.', 'error'); submitBtn.disabled = false; submitBtn.innerHTML = originalBtnHTML; return; }
        await db.collection('users').doc(googleUser.uid).set({ uid: googleUser.uid, username, fullName, email, bio: bio || '', dateOfBirth: dt.toISOString().slice(0,10), referralSource: referral || '', termsAccepted, authProvider: 'google', createdAt: firebase.firestore.FieldValue.serverTimestamp(), role: 'participant' });
        // Mark confirmed and persist
        try { await db.collection('users').doc(googleUser.uid).set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch(e) { console.warn('Could not set emailConfirmed for google user', e); }
        const userProfile = { id: googleUser.uid, uid: googleUser.uid, email, fullName, username, dateOfBirth: dt.toISOString().slice(0,10), hasPaid: false, registeredAt: new Date().toISOString() };
        try { if (typeof setCurrentUser === 'function') setCurrentUser(userProfile); else localStorage.setItem('jot_talent_current_user', JSON.stringify(userProfile)); } catch (e) { console.warn('Could not persist session', e); }
        try { await waitForUserDoc(googleUser.uid, 8000); } catch(e) {}
        showNotification('Account created and signed in!', 'success'); try { localStorage.setItem('jt_recent_signin', String(Date.now())); } catch(e) {}
        modal.remove(); setTimeout(() => { window.location.href = 'dashboard.html'; }, 650);
      } catch (err) {
        console.error('Error creating user profile after Google sign-in', err);
        showNotification(err.message || 'Could not complete signup.', 'error'); submitBtn.disabled = false; submitBtn.innerHTML = originalBtnHTML; try { document.getElementById('g_cancel').disabled = false; } catch(e){}
      }
    };
  }

  // Show merge prompt when email exists under a different uid. Returns true if merge completed/accepted.
  async function showMergePrompt(existingUid, existingData, googleUser) {
    const old = document.getElementById('mergePromptModal'); if (old) old.remove();
    const modal = document.createElement('div'); modal.id = 'mergePromptModal'; modal.style.position = 'fixed'; modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100vw'; modal.style.height = '100vh'; modal.style.background = 'rgba(0,0,0,0.6)'; modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center'; modal.style.zIndex = '99999';
    modal.innerHTML = `
      <div style="background:#fff;padding:1.5rem;border-radius:8px;max-width:520px;width:100%;box-shadow:0 2px 16px rgba(0,0,0,0.2);">
        <h3>Account already exists</h3>
        <p>An account using <b>${escapeHtml(googleUser.email)}</b> already exists. Do you want to merge that account into this Google account so you can sign in with Google going forward?</p>
        <div style="text-align:right;margin-top:12px;"><button id="mergeCancel" style="margin-right:8px;padding:8px 12px;background:#eee;border:0;border-radius:4px;">Cancel</button><button id="mergeConfirm" style="padding:8px 12px;background:#1976d2;color:#fff;border:0;border-radius:4px;">Merge accounts</button></div>
      </div>
    `;
    document.body.appendChild(modal);
    return await new Promise((resolve) => {
      document.getElementById('mergeCancel').onclick = function() { modal.remove(); resolve(false); };
      document.getElementById('mergeConfirm').onclick = async function() {
        const confirmBtn = document.getElementById('mergeConfirm'); const cancelBtn = document.getElementById('mergeCancel'); confirmBtn.disabled = true; cancelBtn.disabled = true; confirmBtn.textContent = 'Merging...';
        try {
          const newRef = db.collection('users').doc(googleUser.uid); const existingRef = db.collection('users').doc(existingUid); const existingSnapshot = await existingRef.get(); if (!existingSnapshot.exists) throw new Error('Existing account not found.'); const dataToCopy = existingSnapshot.data() || {};
          dataToCopy.authProvider = 'google'; dataToCopy.email = googleUser.email; dataToCopy.uid = googleUser.uid; dataToCopy.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
          await newRef.set(dataToCopy, { merge: true }); try { await existingRef.delete(); } catch (e) { console.warn('Could not delete old user doc', e); }
          try { await db.collection('users').doc(googleUser.uid).set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch (e) { console.warn('Could not set emailConfirmed after merge', e); }
          const userProfile = { id: googleUser.uid, uid: googleUser.uid, email: googleUser.email, fullName: dataToCopy.fullName || googleUser.displayName || '', username: dataToCopy.username || (googleUser.displayName ? googleUser.displayName.replace(/\s+/g,'').toLowerCase() : ''), hasPaid: !!dataToCopy.hasPaid, dateOfBirth: dataToCopy.dateOfBirth || null, registeredAt: dataToCopy.createdAt ? dataToCopy.createdAt : new Date().toISOString() };
          try { if (typeof setCurrentUser === 'function') setCurrentUser(userProfile); else localStorage.setItem('jot_talent_current_user', JSON.stringify(userProfile)); } catch (e) { console.warn('Could not persist local session after Google sign-in', e); }
          modal.remove(); showNotification('Accounts merged. Signed in with Google.', 'success'); try { localStorage.setItem('jt_recent_signin', String(Date.now())); } catch (e) {}
          setTimeout(() => { window.location.href = 'dashboard.html'; }, 700); resolve(true);
        } catch (err) { console.error('Merge error', err); showNotification(err.message || 'Could not merge accounts.', 'error'); confirmBtn.disabled = false; cancelBtn.disabled = false; confirmBtn.textContent = 'Merge accounts'; resolve(false); }
      };
    });
  }

  // Simple HTML escape for injecting into modal
  function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>\"']/g, function(s) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[s]; }); }

});
