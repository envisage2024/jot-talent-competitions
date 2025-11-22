// Dashboard page JS
// Implements auth check and UI population for the dashboard.
(function() {
	// Wait for Firebase to be available
	function waitForFirebase(timeout = 5000) {
		return new Promise((resolve, reject) => {
			const start = Date.now();
			(function check() {
				if (window.firebase && firebase.auth && firebase.firestore) return resolve();
				if (Date.now() - start > timeout) return reject(new Error('Firebase not available'));
				setTimeout(check, 150);
			})();
		});
	}

	// Called from dashboard.html on load
	window.checkAuth = async function checkAuth() {
		try {
			await waitForFirebase();
		} catch (err) {
			console.error('checkAuth: Firebase not ready', err);
			window.location.href = 'login.html';
			return;
		}
		const auth = firebase.auth();
		const db = firebase.firestore();

		// wait for a definitive auth state
		const user = await new Promise((resolve) => {
			const unsub = auth.onAuthStateChanged(u => { try { unsub(); } catch(e){}; resolve(u); });
			// fallback timeout
			setTimeout(() => { try { unsub(); } catch(e){}; resolve(null); }, 4000);
		});

		if (!user) {
			// Not signed in. Respect explicit logout flag and cached session to avoid redirect loops.
			try {
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
				const LOGOUT_EXPIRY_MS = 1000 * 60 * 60 * 24;
				let loggedOutActive = false;
				try {
					if (loggedOutFlag) {
						const atNum = parseInt(loggedOutAt || '0', 10) || 0;
						if (Date.now() - atNum < LOGOUT_EXPIRY_MS) loggedOutActive = true;
						else { try { localStorage.removeItem('jot_talent_user_logged_out'); localStorage.removeItem('jot_talent_user_logged_out_at'); } catch (e) {} loggedOutActive = false; }
					}
				} catch (e) { loggedOutActive = false; }
				if (loggedOutActive) {
					window.location.href = 'index.html';
					return;
				}
				// If there's a cached session, give Firebase more time to rehydrate
				let cached = null;
				try {
					if (typeof getStorageData === 'function') cached = getStorageData('jot_talent_current_user');
					else {
						const raw = localStorage.getItem('jot_talent_current_user'); if (raw) cached = JSON.parse(raw);
					}
				} catch (e) { cached = null; }
				let extraWait = 0;
				try {
					const stamp = parseInt(localStorage.getItem('jt_recent_signin') || '0', 10) || 0;
					if (stamp && (Date.now() - stamp) < 8000) extraWait = 2500;
				} catch (e) { extraWait = 0; }
				if (cached) {
					await new Promise(r => setTimeout(r, 1500 + extraWait));
					const recheck = await new Promise((resolve) => {
						const unsub2 = auth.onAuthStateChanged(u => { try { unsub2(); } catch(e){}; resolve(u); });
						setTimeout(() => { try { unsub2(); } catch(e){}; resolve(null); }, 3000 + extraWait);
					});
					if (recheck) {
						try { localStorage.removeItem('jt_recent_signin'); } catch (e) {}
						return;
					}
				}
			} catch (e) { /* ignore */ }
			window.location.href = 'login.html';
			return;
		}

			// Read app-level user doc and ensure emailConfirmed. Attach a real-time listener so the UI updates
			try {
				const userRef = db.collection('users').doc(user.uid);

				// If Firebase marks emailVerified, promote app-level flag
				try {
					const docCheck = await userRef.get();
					const dataCheck = docCheck.exists ? (docCheck.data() || {}) : {};
					if (!dataCheck.emailConfirmed && user.emailVerified) {
						try { await userRef.set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch (e) { console.warn('checkAuth: could not set emailConfirmed', e); }
					}
				} catch (e) { console.warn('checkAuth: could not read initial user doc', e); }

				// Attach listener to update header/dashboard as soon as profile appears or changes
				userRef.onSnapshot(async (snap) => {
					const data = snap.exists ? (snap.data() || {}) : {};
					// Debug: surface when the user doc appears/changes so we can trace race conditions
					try { console.debug('dashboard:onSnapshot', { uid: user.uid, exists: snap.exists, data }); } catch(e) {}
					// If the doc exists but emailConfirmed is still false and Firebase says verified, set it
					if (snap.exists && data && !data.emailConfirmed && user.emailVerified) {
						try { await userRef.set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch (e) { console.warn('checkAuth:onSnapshot set emailConfirmed failed', e); }
					}

					// Verification removed: do not sign out users. Best-effort mark confirmed if missing.
					if (!data.emailConfirmed) {
						try { await userRef.set({ emailConfirmed: true, emailVerifiedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } catch (e) { console.warn('checkAuth:onSnapshot set emailConfirmed failed', e); }
					}

					// Populate username when available
					const username = (data && data.username) ? data.username : (user.displayName || (user.email ? user.email.split('@')[0] : ''));
					const el = document.getElementById('userUsername');
					if (el) {
						el.textContent = username;
						try { console.debug('dashboard:username set', { uid: user.uid, username }); } catch(e) {}
					} else {
						try { console.warn('dashboard: #userUsername element not found in DOM'); } catch(e) {}
					}

					// Persist a lightweight profile for other scripts
					try {
						const userProfile = {
							id: user.uid,
							uid: user.uid,
							email: user.email,
							fullName: data.fullName || user.displayName || '',
							username: username,
							hasPaid: !!data.hasPaid,
							registeredAt: data.createdAt ? data.createdAt : new Date().toISOString()
						};
						if (typeof setCurrentUser === 'function') setCurrentUser(userProfile);
						else localStorage.setItem('jot_talent_current_user', JSON.stringify(userProfile));
					} catch (e) { console.warn('checkAuth: could not persist session', e); }
					// Also refresh other dashboard fields
					try { window.updateDashboard(); } catch(e) {}
				});
			} catch (err) {
				console.error('checkAuth: error attaching user doc listener', err);
				// Instead of immediately signing out and redirecting, retry a few times to handle
				// transient network or Firestore availability issues.
				const MAX_RETRIES = 3;
				let attempt = 0;
				let attached = false;
				while (attempt < MAX_RETRIES && !attached) {
					attempt++;
					try {
						await new Promise(r => setTimeout(r, 1000 * attempt));
						const docRefRetry = db.collection('users').doc(user.uid);
						docRefRetry.onSnapshot((snap) => {
							attached = true;
							// reuse existing snapshot handler logic by invoking updateDashboard and persisting profile
							const data = snap.exists ? (snap.data() || {}) : {};
							const username = (data && data.username) ? data.username : (user.displayName || (user.email ? user.email.split('@')[0] : ''));
							const el = document.getElementById('userUsername'); if (el) el.textContent = username;
							try { const userProfile = { id: user.uid, uid: user.uid, email: user.email, fullName: data.fullName || user.displayName || '', username: username, hasPaid: !!data.hasPaid, registeredAt: data.createdAt ? data.createdAt : new Date().toISOString() }; if (typeof setCurrentUser === 'function') setCurrentUser(userProfile); else localStorage.setItem('jot_talent_current_user', JSON.stringify(userProfile)); } catch (e) { console.warn('checkAuth: retry persist session failed', e); }
							try { window.updateDashboard(); } catch(e) {}
						});
						break;
					} catch (retryErr) {
						console.warn('checkAuth: retry attach failed (attempt ' + attempt + ')', retryErr);
					}
				}
				if (!attached) {
					// Give up after retries: do not attempt to sign out programmatically because it may
					// cause unwanted redirect loops. Instead, redirect to login so user can re-auth.
					try { window.location.href = 'login.html'; } catch (e) { console.warn('redirect to login failed', e); }
					return;
				}
			}
	};

	// Populate the dashboard UI with a few simple values from the user doc
	window.updateDashboard = async function updateDashboard() {
		try {
			await waitForFirebase();
		} catch (e) { return; }
		const auth = firebase.auth();
		const db = firebase.firestore();
		const user = auth.currentUser;
		if (!user) return;
		try {
			const doc = await db.collection('users').doc(user.uid).get();
			const data = doc.exists ? (doc.data() || {}) : {};
			const competitionStatus = document.getElementById('competitionStatus');
			const submissionStatus = document.getElementById('submissionStatus');
			const currentRanking = document.getElementById('currentRanking');
			const notificationCount = document.getElementById('notificationCount');
			if (competitionStatus) competitionStatus.textContent = data.joinedCompetition ? 'Joined' : 'Not Joined';
			if (submissionStatus) submissionStatus.textContent = data.lastSubmission ? 'Submitted' : 'No Submission';
			if (currentRanking) currentRanking.textContent = data.ranking ? String(data.ranking) : 'Not Ranked';
			if (notificationCount) notificationCount.textContent = (data.unreadNotifications ? Number(data.unreadNotifications) : 0) + ' new messages';
		} catch (err) {
			console.warn('updateDashboard error', err);
		}
	};
})();
