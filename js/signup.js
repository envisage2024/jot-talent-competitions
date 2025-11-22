// Password requirements check
function checkPasswordRequirements(password) {
  const requirements = [
    { test: /[A-Z]/, message: 'The password requires an uppercase character' },
    { test: /[a-z]/, message: 'The password requires a lowercase character' },
    { test: /[0-9]/, message: 'The password requires a numeric character' },
    { test: /[^A-Za-z0-9]/, message: 'The password requires a special character' }
  ];
  const missing = requirements.filter(r => !r.test.test(password)).map(r => r.message);
  return missing;
}
// Global error logging to help debug issues in the browser console
window.addEventListener('error', function(ev) {
  try {
    console.error('Global error captured:', ev.message, ev.filename + ':' + ev.lineno + ':' + ev.colno, ev.error && ev.error.stack);
  } catch (e) {}
});
window.addEventListener('unhandledrejection', function(ev) {
  try {
    console.error('Unhandled promise rejection:', ev.reason && (ev.reason.stack || ev.reason));
  } catch (e) {}
});
// Username availability check
document.addEventListener('DOMContentLoaded', function() {
  // Global safeguard to prevent double-clicks and duplicate submissions on this page too.
  (function preventDoubleClicks() {
    document.addEventListener('click', function(e) {
      try {
        const btn = e.target.closest('button');
        if (!btn) return;
        // Do NOT pre-disable submit buttons here: disabling the button on click (capture phase)
        // prevents the browser from performing the native form submit. The 'submit' event
        // handler below will disable submit buttons after the submit event is dispatched.
        if (btn.type === 'submit') return;
        if (btn.dataset && btn.dataset.allowMultiple === 'true') return;
        if (btn.classList.contains('auth-button') || btn.classList.contains('submit-button') || btn.classList.contains('primary-button') || btn.classList.contains('cta-button')) {
          if (!btn.disabled) {
            btn.disabled = true;
            btn.classList.add('disabled');
            btn.dataset.prevented = '1';
          }
        }
      } catch (err) {}
    }, true);
    document.addEventListener('submit', function(e) {
      try {
        const form = e.target;
        const submits = form.querySelectorAll('button[type="submit"]');
        submits.forEach(s => { if (!s.disabled) { s.disabled = true; s.dataset.prevented = '1'; s.classList.add('disabled'); } });
      } catch (err) {}
    }, true);
  })();
  // Referral dropdown logic
  const referralSource = document.getElementById('referralSource');
  const otherReferralContainer = document.getElementById('otherReferralContainer');
  const otherReferralInput = document.getElementById('otherReferral');
  if (referralSource && otherReferralContainer && otherReferralInput) {
    referralSource.addEventListener('change', function() {
      if (referralSource.value === 'Other') {
        otherReferralContainer.style.display = 'block';
        otherReferralInput.required = true;
      } else {
        otherReferralContainer.style.display = 'none';
        otherReferralInput.required = false;
        otherReferralInput.value = '';
      }
    });
    // Initial state in case of browser autofill
    if (referralSource.value === 'Other') {
      otherReferralContainer.style.display = 'block';
      otherReferralInput.required = true;
    } else {
      otherReferralContainer.style.display = 'none';
      otherReferralInput.required = false;
    }
  }
    // Password field error highlight logic
    const passwordInput = document.getElementById('password');
    let passwordLabel = null;
    if (passwordInput) {
      // Find the label for the password field
      let parent = passwordInput.parentNode;
      passwordLabel = parent.querySelector('label');
    }
    function highlightPasswordLabelError(isError) {
      if (passwordLabel) {
        passwordLabel.style.color = isError ? '#f44336' : '';
        passwordLabel.style.fontWeight = isError ? 'bold' : '';
        passwordLabel.style.background = isError ? '#ffeaea' : '';
        passwordLabel.style.padding = isError ? '2px 6px' : '';
        passwordLabel.style.borderRadius = isError ? '4px' : '';
      }
      if (passwordInput) {
        if (isError) {
          passwordInput.style.setProperty('border', '2px solid #f44336', 'important');
          passwordInput.style.setProperty('background', '#fff6f6', 'important');
        } else {
          passwordInput.style.setProperty('border', '', 'important');
          passwordInput.style.setProperty('background', '', 'important');
        }
      }
    }
  const usernameInput = document.getElementById('username');
  if (!usernameInput) return;
  // Create spinner and feedback elements
  const spinner = document.createElement('span');
  spinner.id = 'usernameSpinner';
  spinner.style.display = 'none';
  spinner.style.marginLeft = '8px';
  spinner.innerHTML = '<svg width="18" height="18" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#2196f3" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(0 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/></circle></svg>';
  usernameInput.parentNode.appendChild(spinner);
  const feedback = document.createElement('div');
  feedback.id = 'usernameFeedback';
  feedback.style.fontSize = '0.95em';
  feedback.style.marginTop = '4px';
  feedback.style.color = '#f44336';
  usernameInput.parentNode.appendChild(feedback);

  let lastValue = '';
  let checkTimeout = null;
  usernameInput.addEventListener('input', function() {
    const value = usernameInput.value.trim();
    feedback.textContent = '';
    feedback.style.color = '#f44336';
    if (checkTimeout) clearTimeout(checkTimeout);
    if (!value.match(/^[A-Za-z.]{3,20}$/)) {
      feedback.textContent = 'Username must be 3-20 characters; letters and full stops (.) only.';
      spinner.style.display = 'none';
      return;
    }
    spinner.style.display = 'inline-block';
    checkTimeout = setTimeout(async function() {
      // Query Firestore for username. Check network and DB availability first.
      try {
        if (!navigator.onLine) {
          spinner.style.display = 'none';
          feedback.textContent = 'Offline: cannot check username.';
          feedback.style.color = '#f44336';
          return;
        }
        if (!db) {
          spinner.style.display = 'none';
          feedback.textContent = 'Service unavailable: database not initialized.';
          feedback.style.color = '#f44336';
          return;
        }
        const query = db.collection('users').where('username', '==', value).limit(1);
        const snapshot = await query.get();
        spinner.style.display = 'none';
        if (!snapshot.empty) {
          feedback.textContent = 'Username is taken.';
          feedback.style.color = '#f44336';
        } else {
          feedback.textContent = 'Username is available.';
          feedback.style.color = '#4caf50';
        }
      } catch (err) {
        spinner.style.display = 'none';
        feedback.textContent = 'Error checking username.';
        feedback.style.color = '#f44336';
        console.error('Username availability check failed:', err);
      }
    }, 600);
  });
  // Safety: ensure submit buttons are enabled after DOM is ready (recover from any previous disabled state)
  try {
    const submits = document.querySelectorAll('button[type="submit"]');
    submits.forEach(b => {
      if (b.disabled) {
        b.disabled = false;
        b.classList.remove('disabled');
        console.debug('signup.js: re-enabled submit button on DOMContentLoaded');
      }
    });
  } catch (e) { /* ignore */ }
});
// Notification system
function showNotification(message, type = 'info') {
  // Remove any existing notification
  const oldNote = document.getElementById('signupNotification');
  if (oldNote) oldNote.remove();
  // Create notification
  const note = document.createElement('div');
  note.id = 'signupNotification';
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
// Email verification UI removed — verification is disabled by policy. Any legacy calls are no-ops.
// Firebase config and initialization
const firebaseConfig = {
  apiKey: "AIzaSyBgnkqrg_2clJ77WTonEQFC3gwVrG7HrO4",
  authDomain: "jot-talent-competitions-72b9f.firebaseapp.com",
  databaseURL: "https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com",
  projectId: "jot-talent-competitions-72b9f",
  // storageBucket should use the appspot.com domain for Firebase Storage
  storageBucket: "jot-talent-competitions-72b9f.appspot.com",
  messagingSenderId: "25581487736",
  appId: "1:25581487736:web:a3730b66cd4fb7d9ebcf8d",
  measurementId: "G-8NRD37H5YD"
};
try {
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not found. Make sure you include Firebase script only once.');
  } else {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
  }
} catch (e) {
  console.error('Error initializing Firebase:', e);
}
const auth = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;
const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;

// Ensure we have the form element and attach submit handler safely
const signupForm = document.getElementById('signupForm');
if (!signupForm) {
  console.warn('signupForm not found on this page.');
} else {
  signupForm.addEventListener('submit', async function(e) {
    e.preventDefault();
  console.debug('signup: submit handler entered');
    const createBtn = signupForm.querySelector('button[type="submit"]');
    let originalBtnHtml = null;
    if (createBtn) {
      originalBtnHtml = createBtn.innerHTML;
      const spinnerSvg = '<svg width="16" height="16" viewBox="0 0 50 50" style="vertical-align:middle;margin-right:8px;"><circle cx="25" cy="25" r="20" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(0 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="0.8s" repeatCount="indefinite"/></circle></svg>';
      createBtn.disabled = true;
      createBtn.innerHTML = spinnerSvg + ' Creating account...';
      createBtn.style.background = '#cccccc';
      createBtn.style.color = '#888888';
      createBtn.style.cursor = 'not-allowed';
      createBtn.classList.add('disabled');
    }
    let errorOccurred = false;
    try {
      // Quick network and SDK availability checks
      if (!navigator.onLine) {
        showNotification('You appear to be offline. Please check your internet connection and try again.', 'error');
        if (createBtn) {
          createBtn.disabled = false;
          createBtn.classList.remove('disabled');
          if (originalBtnHtml !== null) createBtn.innerHTML = originalBtnHtml;
        }
        return;
      }
      if (!auth || !db) {
        showNotification('Firebase not available. Please check that the Firebase SDK is included once.', 'error');
        if (createBtn) {
          createBtn.disabled = false;
          createBtn.classList.remove('disabled');
          if (originalBtnHtml !== null) createBtn.innerHTML = originalBtnHtml;
        }
        return;
      }
      console.debug('signup: starting validation');
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const username = document.getElementById('username').value;
      const fullName = document.getElementById('fullName').value.trim();
  const dobRaw = (document.getElementById('dateOfBirth') ? document.getElementById('dateOfBirth').value : '') || '';
      // Full name must be at least two words
        if (fullName.split(/\s+/).length < 2) {
        showNotification('Please enter your full name (at least two words).', 'error');
        if (createBtn) {
          createBtn.disabled = false;
          createBtn.style.background = '';
          createBtn.style.color = '';
          createBtn.style.cursor = '';
          createBtn.classList.remove('disabled');
          if (originalBtnHtml !== null) createBtn.innerHTML = originalBtnHtml;
        }
        return;
      }
  const bio = document.getElementById('bio').value;
  // Referral and terms
  const referralEl = document.getElementById('referralSource');
  const otherReferralEl = document.getElementById('otherReferral');
  const referralValue = referralEl ? (referralEl.value === 'Other' ? (otherReferralEl ? otherReferralEl.value.trim() : 'Other') : referralEl.value) : '';
  const termsAccepted = !!document.getElementById('terms').checked;

      if (password !== confirmPassword) {
        showNotification('Passwords do not match.', 'error');
        errorOccurred = true;
      }
      // Password requirements enforcement
      const missingReqs = checkPasswordRequirements(password);
      if (!errorOccurred && missingReqs.length > 0) {
        showNotification(missingReqs.join(', '), 'error');
        errorOccurred = true;
      }
      if (!errorOccurred && !document.getElementById('terms').checked) {
        showNotification('You must agree to the Terms and Conditions.', 'error');
        errorOccurred = true;
      }
      if (!errorOccurred && (!auth || !db)) {
        showNotification('Firebase not initialized.', 'error');
        errorOccurred = true;
      }
      // DOB validation: required, not in future and user should be at least 13 years old
      let dob = null;
      if (!dobRaw) {
        showNotification('Please enter your date of birth.', 'error');
        errorOccurred = true;
      } else {
        const dt = new Date(dobRaw);
        if (isNaN(dt.getTime())) { showNotification('Please enter a valid date of birth.', 'error'); errorOccurred = true; }
        else {
          const now = new Date();
          if (dt > now) { showNotification('Date of birth cannot be in the future.', 'error'); errorOccurred = true; }
          // Calculate age taking month/day into account
          let age = now.getFullYear() - dt.getFullYear();
          const m = now.getMonth() - dt.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < dt.getDate())) age--;
          if (age < 13) { showNotification('You must be at least 13 years old to create an account.', 'error'); errorOccurred = true; }
          if (!errorOccurred) dob = dt.toISOString().slice(0,10);
        }
      }

      if (errorOccurred) {
  console.debug('signup: validation failed, aborting');
        if (createBtn) {
          createBtn.disabled = false;
          createBtn.style.background = '';
          createBtn.style.color = '';
          createBtn.style.cursor = '';
          createBtn.classList.remove('disabled');
          if (originalBtnHtml !== null) createBtn.innerHTML = originalBtnHtml;
        }
        return;
      }
      let userCredential;
      try {
  console.debug('signup: calling createUserWithEmailAndPassword for', email);
        userCredential = await auth.createUserWithEmailAndPassword(email, password);
  console.debug('signup: createUserWithEmailAndPassword succeeded, uid=', userCredential && userCredential.user && userCredential.user.uid);
      } catch (err) {
  console.error('signup: error creating user with email/password', err);
        if (err.code === 'auth/email-already-in-use') {
          showNotification('This email is already registered.', 'error');
        } else if (err.code === 'auth/invalid-email') {
          showNotification('Invalid email address.', 'error');
        } else if (err.code === 'auth/weak-password') {
          showNotification('Password is too weak.', 'error');
        } else {
          // For network errors provide clearer guidance
          if (err.code === 'auth/network-request-failed' || !navigator.onLine) {
            showNotification('Network error during signup. Check your connection and try again.', 'error');
          } else {
            showNotification(err.message || 'Signup failed.', 'error');
          }
        }
        if (createBtn) {
          createBtn.disabled = false;
          createBtn.style.background = '';
          createBtn.style.color = '';
          createBtn.style.cursor = '';
          createBtn.classList.remove('disabled');
          if (originalBtnHtml !== null) createBtn.innerHTML = originalBtnHtml;
        }
        return;
      }
      // Update auth displayName (best-effort), and attempt Firestore write in background.
      try { await userCredential.user.updateProfile({ displayName: username }); } catch (e) { console.warn('signup: could not update auth profile displayName', e); }
      (async function backgroundSaveProfile() {
        try {
          await db.collection('users').doc(userCredential.user.uid).set({
            uid: userCredential.user.uid,
            username: username,
            fullName: fullName,
            email: email,
            bio: bio,
            referralSource: referralValue || '',
            dateOfBirth: dob || null,
            termsAccepted: termsAccepted,
            authProvider: 'password',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'participant',
            status: 'member',
            emailConfirmed: true
          });
        } catch (writeErr) { console.warn('signup: Firestore write failed (background)', writeErr); }
      })();

      // Final: account created. Redirect user to login page to sign in with their new credentials.
      showNotification('Account created. Please sign in with your new credentials.', 'success');
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.classList.remove('disabled');
        if (originalBtnHtml !== null) createBtn.innerHTML = originalBtnHtml;
      }
      setTimeout(() => { window.location.href = 'login.html'; }, 800);
      return;
      
    } catch (error) {
  console.error('Signup error (outer):', error);
      // Distinguish network errors from other failures
      if (error && (error.code === 'auth/network-request-failed' || !navigator.onLine)) {
        showNotification('Network error. Please check your internet connection and try again.', 'error');
      } else {
        showNotification(error.message || 'Signup failed. Please try again.', 'error');
      }
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.classList.remove('disabled');
        if (originalBtnHtml !== null) createBtn.innerHTML = originalBtnHtml;
      }
    }
  });
}
