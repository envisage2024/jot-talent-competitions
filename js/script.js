// Moved from project root script.js
// Jot Talent Competitions - Main JavaScript File
// Handles all client-side functionality including authentication, submissions, admin features

// ===== CONSTANTS AND CONFIGURATION =====
const STORAGE_KEYS = {
    USERS: 'jot_talent_users',
    CURRENT_USER: 'jot_talent_current_user',
    CURRENT_ADMIN: 'jot_talent_current_admin',
    SUBMISSIONS: 'jot_talent_submissions',
    NOTIFICATIONS: 'jot_talent_notifications',
    SUPPORT_TICKETS: 'jot_talent_support_tickets',
    ANNOUNCEMENTS: 'jot_talent_announcements',
    RANKINGS: 'jot_talent_rankings'
};

// In-memory cache used as the single source of truth in the client.
// It's populated from Firestore on load (window.dataReady) and updated by setStorageData.
const CACHE = {};

// A promise that resolves when the current user profile has been populated
// by the auth/profile loader (fetchAndPersistUserProfile -> setCurrentUser).
// Pages can await `window.currentUserReady` to prefer Firestore-backed profile
// before falling back to local storage values.
let __currentUserReadyResolve = null;
window.currentUserReady = new Promise((res) => { __currentUserReadyResolve = res; });

// Helper: wait for the Firestore-backed current user profile to be set.
// Returns the profile object or null after the timeout (ms).
window.waitForCurrentUser = async function(timeoutMs = 1500) {
    try {
        if (window.currentUserReady) {
            const timeout = new Promise(res => setTimeout(() => res(null), timeoutMs));
            const res = await Promise.race([window.currentUserReady, timeout]);
            if (res) return res;
        }
    } catch (e) {}
    try { return getCurrentUser(); } catch (e) { return null; }
};

const ADMIN_CREDENTIALS = {
    email: 'admin@jottalent.com',
    password: 'admin123'
};
// Expose as a global fallback for pages that don't load the full app bundle
try { window.ADMIN_CREDENTIALS = ADMIN_CREDENTIALS; } catch (e) {}

// ===== UTILITY FUNCTIONS =====

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification-toast');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

function convertToCSV(objArray) {
    if (!objArray.length) return '';
    
    const headers = Object.keys(objArray[0]);
    const csvContent = [
        headers.join(','),
        ...objArray.map(obj => 
            headers.map(header => 
                JSON.stringify(obj[header] || '')
            ).join(',')
        )
    ].join('\n');
    
    return csvContent;
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
}

function getStorageData(key) {
    try {
        const v = CACHE[key];
        if (typeof v !== 'undefined') {
            return Array.isArray(v) ? v : (v ? v : []);
        }
        // fallback to localStorage if in-memory cache is empty (preserve session across pages)
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const parsed = JSON.parse(raw);
                CACHE[key] = parsed;
                return Array.isArray(parsed) ? parsed : (parsed ? parsed : []);
            }
        } catch (e) {
            // ignore parse/localStorage errors
        }
        return [];
    } catch (error) {
        console.error(`Error reading ${key} from cache:`, error);
        return [];
    }
}

function setStorageData(key, data) {
    try {
        // update in-memory cache immediately
        CACHE[key] = data;

        // persist to localStorage so separate pages can read session state
        try {
            if (data === null || typeof data === 'undefined') {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(data));
            }
        } catch (e) {
            // ignore localStorage quota/errors
        }

        // Mirror certain keys to Firestore asynchronously if available
        try {
            if (window.firebase && firebase.firestore) {
                const FIRESTORE_KEY_MAP = {
                    'jot_talent_users': { collection: 'users', idField: 'id' },
                    'jot_talent_submissions': { collection: 'submissions', idField: 'id' },
                    'jot_talent_announcements': { collection: 'announcements', idField: 'id' },
                    'jot_talent_notifications': { collection: 'notifications', idField: 'id' },
                    'jot_talent_support_tickets': { collection: 'support_tickets', idField: 'id' },
                    'jot_talent_rankings': { collection: 'rankings', idField: 'id' }
                };

                const mapping = FIRESTORE_KEY_MAP[key];
                if (mapping) {
                    const db = firebase.firestore();
                    (async function() {
                        try {
                            const items = Array.isArray(data) ? data : [];
                            for (const item of items) {
                                const docId = item && item[mapping.idField] ? String(item[mapping.idField]) : db.collection(mapping.collection).doc().id;
                                await db.collection(mapping.collection).doc(docId).set(item, { merge: true });
                            }
                        } catch (e) {
                            console.warn('Firestore mirror write failed for', key, e);
                        }
                    })();
                }
            }
        } catch (e) {
            // ignore firestore errors to avoid breaking in-memory flow
        }
        return true;
    } catch (error) {
        console.error(`Error setting ${key} in cache:`, error);
        showNotification('Storage error. Please try again.', 'error');
        return false;
    }
}

// Expose a global readiness promise that seeds the local cache from Firestore immediately.
// Other scripts can await `window.dataReady` before rendering to ensure Firestore is authoritative.
window.dataReady = (async function seedFromFirestore() {
    if (!(window.firebase && firebase.firestore)) return Promise.resolve();
    try {
        const db = firebase.firestore();
        const FIRESTORE_KEY_MAP = {
            'jot_talent_users': { collection: 'users' },
            'jot_talent_submissions': { collection: 'submissions' },
            'jot_talent_announcements': { collection: 'announcements' },
            'jot_talent_notifications': { collection: 'notifications' },
            'jot_talent_support_tickets': { collection: 'support_tickets' },
            'jot_talent_rankings': { collection: 'rankings' }
        };

        for (const [lsKey, info] of Object.entries(FIRESTORE_KEY_MAP)) {
            try {
                const snap = await db.collection(info.collection).get();
                const arr = snap.empty ? [] : snap.docs.map(d => d.data());
                try { CACHE[lsKey] = arr; } catch(e) {}
            } catch (e) {
                console.warn('Failed to seed', lsKey, e);
            }
        }
    } catch (e) {
        console.warn('Error seeding cache from Firestore', e);
    }
})();

function getAllUsers() {
    return getStorageData(STORAGE_KEYS.USERS);
}

function saveUser(userData) {
    const users = getAllUsers();
    const existingIndex = users.findIndex(user => user.email === userData.email);
    
    if (existingIndex >= 0) {
        users[existingIndex] = { ...users[existingIndex], ...userData };
    } else {
        users.push(userData);
    }
    
    return setStorageData(STORAGE_KEYS.USERS, users);
}

function getUserByEmail(email) {
    const users = getAllUsers();
    return users.find(user => user.email === email);
}

function getCurrentUser() {
    try {
        // prefer in-memory cache (seeded from Firestore)
        try {
            const v = CACHE[STORAGE_KEYS.CURRENT_USER];
            return v ? v : null;
        } catch (e) {
            return null;
        }
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

function setCurrentUser(userData) {
    const ok = setStorageData(STORAGE_KEYS.CURRENT_USER, userData);
    // mirror minimal session to Firestore users doc if possible
    try {
        if (userData && userData.id && window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            const docRef = db.collection('users').doc(String(userData.id));
            docRef.set({
                id: userData.id,
                uid: userData.uid || userData.id,
                email: userData.email,
                fullName: userData.fullName || '',
                username: userData.username || '',
                hasPaid: !!userData.hasPaid,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).catch(e => console.warn('Could not mirror session to Firestore', e));
        }
    } catch (e) {}
    // If there is a pending resolver for currentUserReady, resolve it now.
    try {
        if (typeof __currentUserReadyResolve === 'function') {
            __currentUserReadyResolve(userData);
            __currentUserReadyResolve = null;
        }
    } catch (e) {}
    return ok;
}

// ------- Firestore helpers for rounds and qualification -------
// Prefer Firestore as the authoritative store for round activation and user qualification.
window.getRoundsMetaFromFirestore = async function() {
    try {
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            const doc = await db.collection('meta').doc('rounds').get();
            if (doc && doc.exists) return doc.data() || {};
        }
    } catch (e) { console.warn('getRoundsMetaFromFirestore failed', e); }
    return {};
};

window.setRoundsMetaToFirestore = async function(obj) {
    try {
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            await db.collection('meta').doc('rounds').set(obj, { merge: true });
            return true;
        }
    } catch (e) { console.warn('setRoundsMetaToFirestore failed', e); }
    return false;
};

window.markUserQualified = async function(userIdOrEmail, round) {
    try {
        if (!userIdOrEmail || !round) return false;
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            // if it looks like an id (no @) try by id first
            if (String(userIdOrEmail).indexOf('@') === -1) {
                await db.collection('users').doc(String(userIdOrEmail)).set({ qualifiedRounds: firebase.firestore.FieldValue.arrayUnion(round) }, { merge: true });
                return true;
            }
            // otherwise try to find by email
            const q = await db.collection('users').where('email', '==', String(userIdOrEmail)).limit(1).get();
            if (!q.empty && q.docs[0]) {
                await q.docs[0].ref.set({ qualifiedRounds: firebase.firestore.FieldValue.arrayUnion(round) }, { merge: true });
                return true;
            }
        }
    } catch (e) { console.warn('markUserQualified failed', e); }
    return false;
};

window.isUserQualifiedRemote = async function(userIdOrEmail, round) {
    try {
        if (!userIdOrEmail || !round) return false;
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            if (String(userIdOrEmail).indexOf('@') === -1) {
                const doc = await db.collection('users').doc(String(userIdOrEmail)).get();
                if (doc && doc.exists) {
                    const data = doc.data();
                    return Array.isArray(data.qualifiedRounds) && data.qualifiedRounds.includes(round);
                }
            } else {
                const q = await db.collection('users').where('email', '==', String(userIdOrEmail)).limit(1).get();
                if (!q.empty && q.docs[0]) {
                    const data = q.docs[0].data();
                    return Array.isArray(data.qualifiedRounds) && data.qualifiedRounds.includes(round);
                }
            }
        }
    } catch (e) { console.warn('isUserQualifiedRemote failed', e); }
    return false;
};


function getCurrentAdmin() {
    try {
    const v = CACHE[STORAGE_KEYS.CURRENT_ADMIN];
    return v ? v : null;
    } catch (error) {
        console.error('Error getting current admin:', error);
        return null;
    }
}

function setCurrentAdmin(adminData) {
    const ok = setStorageData(STORAGE_KEYS.CURRENT_ADMIN, adminData);
    try {
        if (adminData && adminData.email && window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            db.collection('admins').doc(adminData.email).set({
                email: adminData.email,
                role: adminData.role || 'admin',
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).catch(e => console.warn('Could not persist admin to Firestore', e));
        }
    } catch (e) {}
    return ok;
}

function getUserData(email) {
    const user = getUserByEmail(email);
    if (!user) return null;
    
    return {
        ...user,
        hasPaid: user.hasPaid || false,
        registeredAt: user.registeredAt || new Date().toISOString(),
        paidAt: user.paidAt || null
    };
}

function handleSignup(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const username = formData.get('username').trim();

    if (!username.match(/^[A-Za-z.]{3,20}$/)) {
        showNotification('Username must be 3-20 characters; letters and full stops (.) only.', 'error');
        return;
    }

    const allUsers = getAllUsers();
    if (allUsers.some(user => user.username && user.username.toLowerCase() === username.toLowerCase())) {
        showNotification('Username is already taken. Please choose another.', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showNotification('Passwords do not match!', 'error');
        return;
    }

    const email = formData.get('email');
    if (getUserByEmail(email)) {
        showNotification('User with this email already exists!', 'error');
        return;
    }

    const userData = {
        id: generateId(),
        username: username,
        fullName: formData.get('fullName'),
        email: email,
        password: password,
        bio: formData.get('bio') || '',
        registeredAt: new Date().toISOString(),
        hasPaid: false,
        paidAt: null
    };

    // persist locally
    if (saveUser(userData)) {
        // also persist to Firestore users collection when available
        try {
            if (window.firebase && firebase.firestore) {
                const db = firebase.firestore();
                db.collection('users').doc(String(userData.id)).set({
                    uid: userData.id,
                    id: userData.id,
                    username: userData.username,
                    fullName: userData.fullName,
                    email: userData.email,
                    bio: userData.bio || '',
                    hasPaid: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    role: 'participant'
                }).catch(err => console.warn('Could not persist user to Firestore', err));
            }
        } catch (e) {}

        showNotification('Account created successfully! Please login.', 'success');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    }
}

// --- Submissions helpers ---
function getAllSubmissions() {
    return getStorageData(STORAGE_KEYS.SUBMISSIONS);
}

function saveUserSubmission(userEmail, submission) {
    try {
        const submissions = getAllSubmissions();
        const idx = submissions.findIndex(s => s.id === submission.id);
        if (idx >= 0) submissions[idx] = { ...submissions[idx], ...submission };
        else submissions.push(submission);
        setStorageData(STORAGE_KEYS.SUBMISSIONS, submissions);
        return true;
    } catch (e) {
        console.error('Error saving submission', e);
        return false;
    }
}

// --- Announcements helpers ---
function getAllAnnouncements() {
    return getStorageData(STORAGE_KEYS.ANNOUNCEMENTS);
}

function saveAnnouncement(ann) {
    try {
        const arr = getAllAnnouncements();
        const idx = arr.findIndex(a => a.id === ann.id);
        if (idx >= 0) arr[idx] = { ...arr[idx], ...ann };
        else arr.push(ann);
        setStorageData(STORAGE_KEYS.ANNOUNCEMENTS, arr);
        return true;
    } catch (e) { console.error('Error saving announcement', e); return false; }
}

// --- Support tickets helpers ---
function getAllSupportTickets() {
    return getStorageData(STORAGE_KEYS.SUPPORT_TICKETS);
}

function saveSupportTicket(ticket) {
    try {
        const arr = getAllSupportTickets();
        const idx = arr.findIndex(t => t.id === ticket.id);
        if (idx >= 0) arr[idx] = { ...arr[idx], ...ticket };
        else arr.push(ticket);
        setStorageData(STORAGE_KEYS.SUPPORT_TICKETS, arr);
        return true;
    } catch (e) { console.error('Error saving ticket', e); return false; }
}

// --- Notifications helpers ---
function getAllNotifications() {
    return getStorageData(STORAGE_KEYS.NOTIFICATIONS);
}

function saveNotification(userEmail, notification) {
    try {
        const arr = getAllNotifications();
        arr.push(notification);
        setStorageData(STORAGE_KEYS.NOTIFICATIONS, arr);
        return true;
    } catch (e) { console.error('Error saving notification', e); return false; }
}

// --- Rankings helpers ---
function getAllRankings() { return getStorageData(STORAGE_KEYS.RANKINGS); }
function saveRanking(r) { const arr = getAllRankings(); arr.push(r); setStorageData(STORAGE_KEYS.RANKINGS, arr); }

// Judge session (kept local for privacy)
function setJudgeSession(obj) {
    try { setStorageData('jot_talent_judge', obj); return true; } catch(e) { return false; }
}
function getJudgeSession() { try { return CACHE['jot_talent_judge'] || null; } catch(e) { return null; } }
window.setJudgeSession = setJudgeSession; window.getJudgeSession = getJudgeSession;

function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    
    const user = getUserByEmail(email);
    
    if (!user || user.password !== password) {
        showNotification('Invalid email or password!', 'error');
        return;
    }
    
    if (setCurrentUser(user)) {
        showNotification('Login successful!', 'success');
        
        addNotification(user.email, {
            id: generateId(),
            title: 'Welcome back!',
            message: 'You have successfully logged in to your account.',
            type: 'personal',
            timestamp: new Date().toISOString(),
            read: false
        });
        
        setTimeout(() => {
            try {
                // Prevent redirect loop: set a sessionStorage cooldown for dashboard
                const KEY = 'jt_last_redirect_to_dashboard';
                sessionStorage.setItem(KEY, String(Date.now()));
                window.location.replace('dashboard.html');
            } catch (e) {
                window.location.href = 'dashboard.html';
            }
        }, 1000);
    }
}

function handleAdminLogin(e) {
    // defensive: allow being called with a synthetic event or direct invocation
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const formEl = e && e.target ? e.target : document.getElementById('adminLoginForm');
    const formData = new FormData(formEl || new FormData());
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');

    if (!email || !password) {
        showNotification('Please enter both email and password', 'error');
        return;
    }

    // strict comparison against configured credentials
    if (email !== ADMIN_CREDENTIALS.email || password !== ADMIN_CREDENTIALS.password) {
        showNotification('Invalid admin credentials!', 'error');
        return;
    }
    
    const adminData = {
        email: email,
        role: 'admin',
        loginAt: new Date().toISOString()
    };
    
    if (setCurrentAdmin(adminData)) {
        showNotification('Admin login successful!', 'success');
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 1000);
    }
}
// Make the handler available globally so pages can delegate to it
try { window.handleAdminLogin = handleAdminLogin; } catch (e) {}

function logout() {
    try {
        if (window.firebase && typeof firebase.auth === 'function') {
            firebase.auth().signOut().catch(() => {});
        }
    } catch (e) {}
    try { if (typeof setCurrentUser === 'function') setCurrentUser(null); else localStorage.removeItem(STORAGE_KEYS.CURRENT_USER); } catch(e) {}
    try { if (typeof setStorageData === 'function') setStorageData('jot_talent_user_logged_out', '1'); } catch(e) {}
    showNotification('Logged out successfully!', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 800);
}

function adminLogout() {
    try {
        if (window.firebase && typeof firebase.auth === 'function') {
            firebase.auth().signOut().catch(() => {});
        }
    } catch (e) {}
    try { if (typeof setCurrentAdmin === 'function') setCurrentAdmin(null); else localStorage.removeItem(STORAGE_KEYS.CURRENT_ADMIN); } catch(e) {}
    try { if (typeof setStorageData === 'function') setStorageData('jot_talent_user_logged_out', '1'); } catch(e) {}
    showNotification('Admin logged out successfully!', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 800);
}
