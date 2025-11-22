// Show a brief splash animation and check for an existing session before navigating
(function() {
  function createOverlay() {
    const existing = document.getElementById('jtLoginSplashOverlay');
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = 'jtLoginSplashOverlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,250,240,0.95))';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.flexDirection = 'column';
    overlay.innerHTML = `
      <div style="text-align:center;">
        <img src="images/logo.png" alt="Jot Talent" style="width:120px;height:120px;animation:jt-pulse 1.6s infinite;">
        <div style="margin-top:14px;font-family:Poppins,sans-serif;color:#333;font-weight:600">Checking your session...</div>
      </div>
    `;
    const style = document.createElement('style');
    style.textContent = `@keyframes jt-pulse { 0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)} }`;
    overlay.appendChild(style);
    document.body.appendChild(overlay);
    return overlay;
  }

  async function checkSessionAndNavigate() {
    const overlay = createOverlay();
    // Prefer Firebase auth if available
    try {
      const auth = await (window.jtAuth && jtAuth.authReady ? jtAuth.authReady : Promise.resolve(window.firebase && firebase.auth ? firebase.auth() : null));
      // Wait briefly for onAuthStateChanged to settle
      if (auth && typeof auth.onAuthStateChanged === 'function') {
        const user = await new Promise((resolve) => {
          const unsub = auth.onAuthStateChanged(u => { try{unsub();}catch(e){}; resolve(u); });
          setTimeout(() => { try{unsub();}catch(e){}; resolve(null); }, 2200);
        });
        if (user) {
          // Found an active session, go to dashboard
          try { window.location.href = 'dashboard.html'; return; } catch (e) {}
        }
      }
    } catch (e) {
      // ignore and fall back to local session check
      console.warn('login-redirect: auth check failed', e);
    }

    // Fallback local session: check our app's current user key
    try {
      const raw = localStorage.getItem('jot_talent_current_user');
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && (obj.email || obj.uid || obj.id)) {
          // assume still valid
          try { window.location.href = 'dashboard.html'; return; } catch (e) {}
        }
      }
    } catch (e) { /* ignore */ }

    // No session found -> redirect to login page after short delay allowing animation to finish
    setTimeout(() => { try { window.location.href = 'login.html'; } catch (e) {} }, 700);
  }

  // Expose a helper to attach to links/buttons
  window.attachLoginSplash = function(el) {
    if (!el) return;
    el.addEventListener('click', function(ev) {
      ev.preventDefault();
      checkSessionAndNavigate();
    });
  };

  // Auto-install on elements that have data-login-splash attribute
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('[data-login-splash]').forEach(el => window.attachLoginSplash(el));
    // Also attach to normal login links site-wide, except when on login.html itself
    try {
      const current = window.location.pathname.split('/').pop();
      if (!/login(\.html)?$/i.test(current)) {
        document.querySelectorAll('a[href$="login.html"]').forEach(a => {
          // avoid double-wiring if element already opted in
          if (!a.hasAttribute('data-login-splash')) {
            a.setAttribute('data-login-splash','1');
            window.attachLoginSplash(a);
          }
        });
      }
    } catch (e) { /* ignore */ }
  });
})();
