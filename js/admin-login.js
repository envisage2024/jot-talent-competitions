// Admin login enhancements: hashed password storage in Firestore and improved UX
// Keeps legacy demo admin credentials but prefers stored password hashes in Firestore.

// Admin login uses Firestore-stored password hashes only

function showNotification(message, type = 'info') {
	try {
		if (window && typeof window.showNotification === 'function') return window.showNotification(message, type);
	} catch (e) {}
	// Fallback lightweight toast
	const id = 'admin_login_toast';
	const old = document.getElementById(id);
	if (old) old.remove();
	const n = document.createElement('div');
	n.id = id;
	n.textContent = message;
	n.style.position = 'fixed';
	n.style.top = '18px';
	n.style.left = '50%';
	n.style.transform = 'translateX(-50%)';
	n.style.background = type === 'error' ? '#d32f2f' : (type === 'success' ? '#2e7d32' : '#1976d2');
	n.style.color = '#fff';
	n.style.padding = '10px 16px';
	n.style.borderRadius = '6px';








	
	n.style.zIndex = 999999;
	document.body.appendChild(n);
	setTimeout(() => { try { n.remove(); } catch(e) {} }, 3500);
}

// SubtleCrypto SHA-256 -> hex
async function sha256Hex(str) {
	if (!str) return '';
	if (!(window.crypto && window.crypto.subtle)) throw new Error('SubtleCrypto is unavailable');
	const enc = new TextEncoder();
	const data = enc.encode(str);
	const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function saveAdminPasswordToFirestore(email, passwordHash) {
	try {
		if (window.firebase && firebase.firestore) {
			const db = firebase.firestore();
			await db.collection('saved_admin_passwords').doc(email).set({
				email: email,
				passwordHash: passwordHash,
				createdAt: firebase.firestore.FieldValue.serverTimestamp()
			}, { merge: true });
			return true;
		}
	} catch (e) {
		console.warn('Could not save admin password to Firestore', e);
	}
	return false;
}

async function getSavedAdminPasswordHash(email) {
	try {
		if (window.firebase && firebase.firestore) {
			const db = firebase.firestore();
			const doc = await db.collection('saved_admin_passwords').doc(email).get();
			if (doc.exists) return doc.data().passwordHash || null;
		}
	} catch (e) {
		console.warn('Could not read saved admin password from Firestore', e);
	}
	return null;
}

async function handleSuccessfulAdminLogin(email) {
	const adminData = { email, role: 'admin', loginAt: new Date().toISOString() };
	try {
		if (typeof setCurrentAdmin === 'function') setCurrentAdmin(adminData);
	// Fallback: ensure session is directly present in localStorage
	try { localStorage.setItem('jot_talent_current_admin', JSON.stringify(adminData)); } catch(e) { /* ignore */ }
	// Mark that admin logged in via admin-login page (session-only marker)
	try { sessionStorage.setItem('jot_talent_admin_login_origin', 'admin-login.html'); } catch(e) { /* ignore */ }
		if (window.firebase && firebase.firestore) {
			const db = firebase.firestore();
			db.collection('admins').doc(email).set({
				email: email,
				role: 'admin',
				lastLogin: firebase.firestore.FieldValue.serverTimestamp()
			}, { merge: true }).catch(e => console.warn('Could not persist admin to Firestore', e));
		}
	} catch (err) {
		console.error('Could not save admin session', err);
	}
	try { showNotification('Admin login successful!', 'success'); } catch (e) {}
	setTimeout(() => { window.location.href = 'admin-dashboard.html'; }, 700);
}

function validateEmail(email) {
	if (!email) return false;
	return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

// Add role validation to ensure only admins can log in
async function validateAdminRole(email) {
    try {
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            const doc = await db.collection('admins').doc(email).get();
            if (doc.exists && doc.data().role === 'admin') {
                return true;
            }
        }
    } catch (e) {
        console.warn('Could not validate admin role from Firestore', e);
    }
    return false;
}

// Main wiring
(function () {
	const form = document.getElementById('adminLoginForm');
	const emailEl = document.getElementById('adminEmail');
	const passEl = document.getElementById('adminPassword');

	if (!form) return;

	async function doLogin(e) {
		if (e && e.preventDefault) e.preventDefault();
		const email = (emailEl && emailEl.value || '').trim();
		const password = (passEl && passEl.value || '');

		if (!email || !password) {
			showNotification('Please enter email and password', 'error');
			return;
		}
		if (!validateEmail(email)) {
			showNotification('Please enter a valid email address', 'error');
			return;
		}

		// check stored hash in Firestore only
		try {
			if (!(window.firebase && firebase.firestore)) {
				showNotification('No Firestore available for saved credentials; admin login cannot proceed.', 'error');
				return;
			}
			const savedHash = await getSavedAdminPasswordHash(email);
			if (!savedHash) {
				showNotification('No saved password found for this email', 'error');
				return;
			}
			const inputHash = await sha256Hex(password);
			if (inputHash === savedHash) {
				const isAdmin = await validateAdminRole(email);
				if (isAdmin) {
					await handleSuccessfulAdminLogin(email);
					return;
				} else {
					showNotification('Access denied. You are not an admin.', 'error');
					return;
				}
			} else {
				showNotification('Invalid credentials (saved password mismatch)', 'error');
				return;
			}
		} catch (err) {
			console.error('Login error', err);
			showNotification('Login failed. Check console for details.', 'error');
		}
	}

	form.addEventListener('submit', doLogin);

	// No save button or save flow - admin passwords must be provisioned in Firestore
})();
