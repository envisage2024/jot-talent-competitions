// Lightweight logout helpers for pages that don't load the full script.js
// These functions avoid depending on globals from script.js so logout links always work
(function() {
    function logout() {
        // Try to sign out from Firebase if present to clear server-side session
        try {
            if (window.firebase && typeof firebase.auth === 'function') {
                firebase.auth().signOut().catch(() => {});
            }
        } catch (e) {
            // ignore
        }
    try { 
        // clear local session and flag
        if (typeof setCurrentUser === 'function') setCurrentUser(null);
        else if (typeof setStorageData === 'function') setStorageData('jot_talent_current_user', null);
    } catch(e) {}
    try { if (typeof setStorageData === 'function') setStorageData('jot_talent_user_logged_out', '1'); } catch(e) { try { localStorage.setItem('jot_talent_user_logged_out','1'); } catch(e2){} }
    try { if (typeof setStorageData === 'function') setStorageData('jot_talent_user_logged_out_at', Date.now().toString()); } catch(e) { try { localStorage.setItem('jot_talent_user_logged_out_at', Date.now().toString()); } catch(e2){} }
        // Slight delay to allow any async sign-out tasks to start
        setTimeout(() => { window.location.href = 'index.html'; }, 300);
    }

    function adminLogout() {
        try {
            if (window.firebase && typeof firebase.auth === 'function') {
                firebase.auth().signOut().catch(() => {});
            }
        } catch (e) {}
    try { 
        if (typeof setCurrentAdmin === 'function') setCurrentAdmin(null);
        else if (typeof setStorageData === 'function') setStorageData('jot_talent_current_admin', null);
    } catch(e) {}
    try { if (typeof setStorageData === 'function') setStorageData('jot_talent_user_logged_out', '1'); } catch(e) { try { localStorage.setItem('jot_talent_user_logged_out','1'); } catch(e2){} }
    try { if (typeof setStorageData === 'function') setStorageData('jot_talent_user_logged_out_at', Date.now().toString()); } catch(e) { try { localStorage.setItem('jot_talent_user_logged_out_at', Date.now().toString()); } catch(e2){} }
        setTimeout(() => { window.location.href = 'index.html'; }, 300);
    }

    function judgeLogout() {
        try {
            if (window.firebase && typeof firebase.auth === 'function') {
                firebase.auth().signOut().catch(() => {});
            }
        } catch (e) {}
    try { if (typeof setJudgeSession === 'function') setJudgeSession(null); else if (typeof setStorageData === 'function') setStorageData('jot_talent_judge', null); } catch(e) {}
    try { if (typeof setStorageData === 'function') setStorageData('jot_talent_user_logged_out', '1'); } catch(e) { try { localStorage.setItem('jot_talent_user_logged_out','1'); } catch(e2){} }
    try { if (typeof setStorageData === 'function') setStorageData('jot_talent_user_logged_out_at', Date.now().toString()); } catch(e) { try { localStorage.setItem('jot_talent_user_logged_out_at', Date.now().toString()); } catch(e2){} }
        setTimeout(() => { window.location.href = 'judges-login.html'; }, 300);
    }

    // Expose to global scope so existing onclick handlers work
    window.logout = logout;
    window.adminLogout = adminLogout;
    window.judgeLogout = judgeLogout;
})();
