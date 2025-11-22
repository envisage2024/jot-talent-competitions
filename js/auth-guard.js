// // Auth guard - include on pages that require a logged-in, verified user.
// (async function() {
//   function redirectToLogin() {
//     try {
//       // Don't redirect when already on the login page to avoid loops
//       try {
//         const path = window.location.pathname || '';
//         const href = window.location.href || '';
//         if (path.match(/login(\.html)?$/i) || href.includes('login.html')) return;
//       } catch (e) {}

//       // Prevent tight redirect loops by enforcing a short cooldown using sessionStorage.
//       try {
//         const KEY = 'jt_last_redirect_to_login';
//         const last = parseInt(sessionStorage.getItem(KEY) || '0', 10) || 0;
//         const now = Date.now();
//         const COOLDOWN = 2000; // 2s
//         if (now - last < COOLDOWN) return; // skip redirect to avoid loop
//         sessionStorage.setItem(KEY, String(now));
//       } catch (e) { /* sessionStorage may be unavailable */ }

//       // Use replace so the previous page isn't pushed into history (avoids back-button loops)
//       try { window.location.replace('login.html'); } catch(e) { try { window.location.href = 'login.html'; } catch(e){} }
//     } catch(e){}
//   }
//   // Wait for Firebase to be available
//   function waitForFirebase(timeout = 5000) {
//     return new Promise((resolve, reject) => {
//       const start = Date.now();
//       (function check() {
//         // Require the Firebase SDK and the auth module; Firestore is optional for the guard
//         if (window.firebase && firebase.auth) return resolve();
//         if (Date.now() - start > timeout) return reject(new Error('Firebase not available'));
//         setTimeout(check, 150);
//       })();
//     });
//   }
//   try {
//     await waitForFirebase();
//   } catch (err) {
//     // If Firebase not present, deny access
//     redirectToLogin();
//     return;
//   }

//   const auth = (window.firebase && firebase.auth) ? firebase.auth() : null;
//   let db = null;
//   try { db = (window.firebase && firebase.firestore) ? firebase.firestore() : null; } catch (e) { db = null; }

//   // Fast path: check currentUser first (may be populated synchronously)
//   let user = auth && auth.currentUser ? auth.currentUser : null;

//   // Otherwise wait for onAuthStateChanged with a longer timeout to allow session restore
//   if (!user && auth && typeof auth.onAuthStateChanged === 'function') {
//     user = await new Promise((resolve) => {
//       let settled = false;
//       const unsub = auth.onAuthStateChanged(u => { if (settled) return; settled = true; try { unsub(); } catch(e){}; resolve(u); });
//       // fallback timeout in case onAuthStateChanged doesn't fire quickly
//       setTimeout(() => { if (settled) return; settled = true; try { unsub(); } catch(e){}; resolve(null); }, 5000);
//     });
//   }
//   if (!user) {
//     // Try a fast local-session fallback: some pages persist a lightweight profile locally.
//     try {
//       let raw = null;
//       if (typeof getStorageData === 'function') raw = getStorageData('jot_talent_current_user');
//       else raw = localStorage.getItem('jot_talent_current_user');
//       if (raw) {
//         let obj = raw;
//         if (typeof raw === 'string') {
//           try { obj = JSON.parse(raw); } catch (e) { obj = null; }
//         }
//         if (obj && (obj.uid || obj.id || obj.email)) {
//           // Treat this as an authenticated session (best-effort) to avoid redirect loops.
//           user = { uid: obj.uid || obj.id, email: obj.email };
//         }
//       }
//     } catch (e) { /* ignore parsing errors */ }

//     // Respect explicit logout flag (time-limited) to avoid bouncing users into the login flow repeatedly
//     try {
//       let loggedOutFlag = null;
//       let loggedOutAt = null;
//       try {
//         if (typeof getStorageData === 'function') {
//           loggedOutFlag = getStorageData('jot_talent_user_logged_out');
//           loggedOutAt = getStorageData('jot_talent_user_logged_out_at');
//         } else {
//           loggedOutFlag = localStorage.getItem('jot_talent_user_logged_out');
//           loggedOutAt = localStorage.getItem('jot_talent_user_logged_out_at');
//         }
//       } catch (e) { loggedOutFlag = null; loggedOutAt = null; }
//       const LOGOUT_EXPIRY_MS = 1000 * 60 * 60 * 24; // 24h
//       let loggedOutActive = false;
//       try {
//         if (loggedOutFlag) {
//           const atNum = parseInt(loggedOutAt || '0', 10) || 0;
//           if (Date.now() - atNum < LOGOUT_EXPIRY_MS) loggedOutActive = true;
//           else {
//             try { localStorage.removeItem('jot_talent_user_logged_out'); localStorage.removeItem('jot_talent_user_logged_out_at'); } catch (e) {}
//             loggedOutActive = false;
//           }
//         }
//       } catch (e) { loggedOutActive = false; }
//       if (loggedOutActive) {
//         // If user explicitly logged out, send them to the public index rather than forcing the login overlay.
//         try { window.location.href = 'index.html'; } catch (e) {}
//         return;
//       }
//       // Give Firebase a grace period to restore an existing session (if any).
//       // If the app just triggered a sign-in redirect, extend the grace period
//       // so the client has time to write the user profile.
//       let extraWait = 0;
//       try {
//         const stamp = parseInt(localStorage.getItem('jt_recent_signin') || '0', 10) || 0;
//         const now = Date.now();
//         if (stamp && (now - stamp) < 10000) {
//           extraWait = 4000; // additional 4s
//         }
//       } catch (e) { extraWait = 0; }
//       await new Promise(r => setTimeout(r, 2000 + extraWait));

//       // Re-check auth state one more time
//       let recheck = null;
//       try {
//         if (auth && typeof auth.onAuthStateChanged === 'function') {
//           recheck = await new Promise((resolve) => {
//             let done = false;
//             const unsub2 = auth.onAuthStateChanged(u => { if (done) return; done = true; try { unsub2(); } catch(e){}; resolve(u); });
//             setTimeout(() => { if (done) return; done = true; try { unsub2(); } catch(e){}; resolve(null); }, 4000);
//           });
//         }
//       } catch (e) { recheck = null; }
//       // If recheck succeeded and we had a recent signin flag, clear it
//       try { if (recheck) localStorage.removeItem('jt_recent_signin'); } catch (e) {}
//       if (recheck) return; // session restored, allow page to continue
//     } catch (e) { /* ignore and fall through to redirect */ }
//     redirectToLogin(); return;
//   }

//   // Check app-level confirmed flag
//   try {
//     // If Firestore isn't available, skip the app-level user doc checks and allow the page to continue.
//     if (!db) return;
//     // Try to read the user doc; if it doesn't exist yet, poll for a short grace period
//     const userRef = db.collection('users').doc(user.uid);
//     let doc = await userRef.get();
//     if (!doc.exists) {
//       const start = Date.now();
//       const timeout = 6000; // wait up to 6s for the client to write the profile (Google signup race)
//       while (Date.now() - start < timeout) {
//         await new Promise(r => setTimeout(r, 500));
//         try { doc = await userRef.get(); } catch (e) { console.warn('auth-guard: retry get user doc failed', e); }
//         if (doc.exists) break;
//       }
//     }
//     const data = doc && doc.exists ? (doc.data() || {}) : {};
//     // Verification removed: do not block access. Best-effort mark confirmed so legacy tools don't re-send verification.
//     try {
//       if (!data.emailConfirmed) {
//         await userRef.set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
//       }
//     } catch (e) { console.warn('auth-guard: could not set emailConfirmed', e); }
//   } catch (err) {
//     redirectToLogin();
//     return;
//   }
// })();
