// Lightweight Firebase initialization helper used by login/redirection flows
// This file intentionally only initializes Firebase app once and exposes auth/db
if (typeof firebase !== 'undefined') {
  try {
    if (!firebase.apps || !firebase.apps.length) {
      // Keep config minimal; this project already includes full config in other scripts.
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
      try { firebase.initializeApp(firebaseConfig); } catch (e) { /* may already be initialized elsewhere */ }
    }
  } catch (e) { console.warn('auth-init: firebase unavailable', e); }
}

// Expose helpers
window.jtAuth = (function() {
  const ready = new Promise((resolve) => {
    const start = Date.now();
    (function check() {
      if (window.firebase && firebase.auth) return resolve(firebase.auth());
      if (Date.now() - start > 3000) return resolve(null);
      setTimeout(check, 150);
    })();
  });

  return {
    authReady: ready
  };
})();
