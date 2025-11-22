// Lightweight auth instrumentation for debugging unexpected sign-outs / redirects
(function(){
    if (window.jtAuthInstrumentationAttached) return;
    window.jtAuthInstrumentationAttached = true;

    function safeLog() {
        if (typeof console !== 'undefined' && console.log) {
            console.log.apply(console, arguments);
        }
    }

    // Wrap firebase.auth().signOut to log calls
    try {
        Object.defineProperty(window, '__original_signOut__', { configurable: true, writable: true, value: null });
    } catch (e) {}

    function wrapSignOut() {
        try {
            if (window.firebase && firebase.auth && typeof firebase.auth === 'function') {
                var auth = firebase.auth();
                if (!auth.__signOutWrapped) {
                    auth.__signOutWrapped = true;
                    var original = auth.signOut.bind(auth);
                    auth.signOut = function(){
                        safeLog('[auth-instrument] signOut called', new Date().toISOString());
                        try { debugger; } catch(e) {}
                        return original.apply(this, arguments);
                    };
                }
            }
        } catch (e) { safeLog('[auth-instrument] wrapSignOut error', e); }
    }

    // Observe localStorage writes for jot_talent_user_logged_out
    (function(){
        var origSetItem = localStorage.setItem;
        localStorage.setItem = function(k, v) {
            if (String(k).indexOf('jot_talent_user_logged_out') !== -1) {
                safeLog('[auth-instrument] localStorage.setItem ->', k, v, new Date().toISOString());
                try { debugger; } catch(e) {}
            }
            return origSetItem.apply(this, arguments);
        };
    })();

    // Watch auth state changes
    try {
        if (window.firebase && firebase.auth && typeof firebase.auth === 'function') {
            firebase.auth().onAuthStateChanged(function(user){
                safeLog('[auth-instrument] onAuthStateChanged -> user:', !!user, user && user.uid, new Date().toISOString());
            });
        }
    } catch(e){ safeLog('[auth-instrument] onAuthStateChanged attach failed', e); }

    // Periodically attempt to wrap signOut in case firebase loads later
    setInterval(wrapSignOut, 800);

    // Expose a helper to print a stack trace of any currently set logout flag
    window.jtAuthInstrumentation = {
        logCurrentState: function(){
            safeLog('[auth-instrument] current localStorage jot_talent_user_logged_out=', localStorage.getItem('jot_talent_user_logged_out'));
            safeLog('[auth-instrument] current jt_recent_signin=', localStorage.getItem('jt_recent_signin'));
        }
    };
})();
