// join.js - render competitions and handle join/payment UI
(function() {
	async function renderCompetitions() {
		try { if (window.dataReady) await window.dataReady; } catch(e) {}
	// Do not require auth for viewing the competitions page — allow anonymous users to see and join (payment saved locally)
	// try { checkAuth(); } catch (e) {}
	// Prefer Firestore-backed profile when available
	let currentUser = null;
	try { if (window.waitForCurrentUser) currentUser = await window.waitForCurrentUser(1200); } catch(e) {}
	if (!currentUser && typeof getCurrentUser === 'function') currentUser = getCurrentUser();
		const container = document.getElementById('competitionsContainer');
		if (!container) return;

			// Load rounds config from settings (prefer Firestore-backed helper if present)
			let rounds = [];
			try {
				if (typeof window.getRounds === 'function') {
					rounds = await window.getRounds();
				} else if (typeof getStorageData === 'function') {
					rounds = getStorageData('jot_talent_rounds') || [];
				}
				// If still no rounds, seed a default set (and persist via setRounds if available)
				if (!rounds || rounds.length === 0) {
					rounds = [
						{ round: 'test', title: 'Test Round', description: 'Temporary test round open to everyone for end-to-end testing (no payment required).', status: 'active', enabled: true },
						{ round: 1, title: 'First Round', description: 'Initial competition for all paid participants. A one-time payment is required to submit your work.', status: 'active', enabled: true },
						{ round: 2, title: 'Second Round', description: 'Only those who qualified from the first round can participate.', status: 'upcoming', enabled: false },
						{ round: 3, title: 'Final Round', description: 'The final stage for the top-ranked participants.', status: 'upcoming', enabled: false }
					];
					try { if (typeof setRounds === 'function') await setRounds(rounds); else if (typeof setStorageData === 'function') await setStorageData('jot_talent_rounds', rounds); } catch(e) {}
				}

				// Ensure Test Round persisted if missing: append it to the end (after round 3)
				try {
					const hasTest = rounds.some(r => String(r.round) === 'test');
					if (!hasTest) {
						// append test round at the end
						rounds.push({ round: 'test', title: 'Test Round', description: 'Temporary test round open to everyone for end-to-end testing (no payment required).', status: 'active', enabled: true });
						if (typeof setRounds === 'function') await setRounds(rounds);
						else if (typeof setStorageData === 'function') await setStorageData('jot_talent_rounds', rounds);
					}
				} catch (e) { console.warn('Could not persist test round', e); }
			} catch (e) {
				console.error('Error loading rounds config', e);
				rounds = [];
			}

			// Default to first enabled round selected
			const selectedRound = rounds.find(r => r.enabled) || rounds[0];

		function renderRoundCard(r) {
			if (!r.enabled) {
				return `
					<div class="round-card locked">
						<h3>${r.title}</h3>
						<p>Coming soon — this round will be enabled by the admin.</p>
						<div class="round-meta">
							<span>Round ${r.round}</span>
							<span class="round-status">Locked</span>
						</div>
					</div>
				`;
			}
			let extra = '';
			if (String(r.round) === 'test') {
				extra = `<div style="margin-top:12px;"><button class="primary-button join-test-btn" data-round="test">Join Test Round</button></div>`;
			}
			return `
				<div class="round-card ${r.round === selectedRound.round ? 'selected' : ''}">
					<h3>${r.title}</h3>
					<p>${r.description}</p>
					<div class="round-meta">
						<span>Round ${r.round}</span>
						<span class="round-status">${r.status}</span>
					</div>
					${extra}
				</div>
			`;
		}

		container.innerHTML = `
			<div class="rounds-list">
				${rounds.map(r => renderRoundCard(r)).join('')}
			</div>
			<div class="round-actions" id="roundActions">
			</div>
		`;

		const actions = document.getElementById('roundActions');
		if (!actions) return;

			// Attach join-test button handler (delegated after rendering)
			// Helper to persist join (server-side if possible) then redirect
			async function persistJoinTestAndRedirect() {
				try {
					// Prefer a helper that waits for current user if available
					let user = null;
					try {
						if (typeof window.waitForCurrentUser === 'function') user = await window.waitForCurrentUser(1200);
					} catch (e) {}
					if (!user && window.firebase && firebase.auth) user = firebase.auth().currentUser;
					// If auth exists but user not yet available, wait for onAuthStateChanged once
					if (!user && window.firebase && firebase.auth) {
						user = await new Promise(resolve => {
							const off = firebase.auth().onAuthStateChanged(u => { off(); resolve(u); });
							// timeout fallback after 1500ms
							setTimeout(() => resolve(null), 1500);
						});
					}
					// Attempt server-side persistence
					if (user && window.firebase && firebase.firestore) {
						try {
							await firebase.firestore().collection('users').doc(String(user.uid)).set({ joinedRounds: firebase.firestore.FieldValue.arrayUnion('test') }, { merge: true });
						} catch (e) { console.warn('Could not persist test join to Firestore', e); }
					}
				} catch (e) { console.warn('persistJoinTestAndRedirect failed', e); }
				// Always set local fallback so anonymous testers work
				try { localStorage.setItem('hasJoined_test', '1'); } catch (e) {}
				// Update any visible join buttons to show joined state
				try {
					const btn = document.querySelectorAll('.join-test-btn');
					if (btn && btn.length) btn.forEach(b => { b.textContent = 'Joined'; b.disabled = true; });
					const mainBtn = document.getElementById('joinTestRoundBtn');
					if (mainBtn) { mainBtn.textContent = 'Joined'; mainBtn.disabled = true; }
				} catch (e) {}
				alert('You have joined the Test Round. Redirecting to submission page...');
				window.location.href = 'submit.html?round=test';
			}

			setTimeout(() => {
				const btns = document.querySelectorAll('.join-test-btn');
				if (btns && btns.length) {
					btns.forEach(b => b.addEventListener('click', persistJoinTestAndRedirect));
				}
			}, 100);

		// Determine paid state. Use localStorage fallback for anonymous users so payment can be simulated.
		const localPaidFlag = (localStorage.getItem('jot_first_round_paid') === '1');
		const sessionPaid = (currentUser && currentUser.hasPaid) ? true : false;
		const hasPaid = sessionPaid || localPaidFlag;

			// Check if a Test Round exists and whether user has joined it locally
			const hasJoinedTest = (localStorage.getItem('hasJoined_test') === '1');
			const testRoundExists = rounds.some(r => String(r.round) === 'test');

			if (!hasPaid) {
				// Show payment CTA and, if available, a small test round join button
				actions.innerHTML = `
					<div class="payment-card">
						<h4>Join the competition</h4>
						<p>One-time fee: UGX 10,000 — this gives you access to submit and be judged.</p>
						<button id="joinButton" class="primary-button"><i class="fas fa-credit-card"></i> Join Competition (UGX 10,000)</button>
						${testRoundExists ? '<button id="joinTestButton" class="secondary-button" style="margin-left:12px;">Join Test Round (Free)</button>' : ''}
					</div>
				`;

				const btn = document.getElementById('joinButton');
				if (btn) {
					btn.addEventListener('click', function() {
						// Prefer an existing simulated payment flow (simulatePayment or processPayment) if available
						if (typeof simulatePayment === 'function') {
							simulatePayment();
							setTimeout(() => { renderCompetitions(); if (typeof updateNavForPayment === 'function') updateNavForPayment(); }, 1200);
							return;
						}
						if (typeof processPayment === 'function') {
							processPayment();
							setTimeout(() => { renderCompetitions(); if (typeof updateNavForPayment === 'function') updateNavForPayment(); }, 1200);
							return;
						}
						// Fallback: set local paid flag and refresh UI
						localStorage.setItem('jot_first_round_paid', '1');
						alert('Payment simulated locally. You are now joined.');
						setTimeout(() => { renderCompetitions(); if (typeof updateNavForPayment === 'function') updateNavForPayment(); }, 400);
					});
				}

				// Attach test join button handler if present
				const testBtn = document.getElementById('joinTestButton');
				if (testBtn) {
					testBtn.addEventListener('click', async function() {
						// If firebase auth is available and user is signed in, persist join server-side
						try {
							if (window.firebase && firebase.auth && firebase.firestore && firebase.auth().currentUser) {
								const uid = firebase.auth().currentUser.uid;
								const db = firebase.firestore();
								await db.collection('users').doc(String(uid)).set({ joinedRounds: firebase.firestore.FieldValue.arrayUnion('test') }, { merge: true });
								alert('You have joined the Test Round. Redirecting to submission page...');
								window.location.href = 'submit.html?round=test';
								return;
							}
						} catch (e) { console.warn('Could not persist test join to Firestore', e); }
						// Fallback: persist locally
						localStorage.setItem('hasJoined_test', '1');
						alert('You have joined the Test Round. Redirecting to submission page...');
						window.location.href = 'submit.html?round=test';
					});
				}
			} else {
				// User has paid for main competition; show primary join state and still allow test round quick link
				actions.innerHTML = `
					<div class="joined-card">
						<h4>You've joined!</h4>
						<p>Thank you for joining the competition. You can now submit your article.</p>
						<a href="submit.html" class="primary-button"><i class="fas fa-upload"></i> Go to Submit</a>
						${testRoundExists ? '<a href="submit.html?round=test" id="goToTestLink" class="secondary-button" style="margin-left:12px;">Submit to Test Round</a>' : ''}
					</div>
				`;
			}
	}

	window.renderCompetitions = renderCompetitions;
	// Allow admin to enable/disable rounds dynamically
	async function setRoundEnabled(roundNumber, enabled) {
		try {
				let rounds = [];
				if (typeof window.getRounds === 'function') rounds = await window.getRounds();
				else if (typeof getStorageData === 'function') rounds = getStorageData('jot_talent_rounds') || [];
			if (!Array.isArray(rounds) || rounds.length === 0) return false;
			const idx = rounds.findIndex(r => r.round === roundNumber);
			if (idx === -1) return false;
			rounds[idx].enabled = !!enabled;
			if (typeof window.setRounds === 'function') await window.setRounds(rounds);
			else if (typeof setStorageData === 'function') await setStorageData('jot_talent_rounds', rounds);
			try { renderCompetitions(); } catch (e) {}
			return true;
		} catch (e) {
			console.error('Error setting round enabled', e);
			return false;
		}
	}
	window.setRoundEnabled = setRoundEnabled;
})();
