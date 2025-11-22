// Small helper for judge session management used by judges pages
// Use sessionStorage for short-lived judge sessions (cleared when tab/window closes)
window.getJudgeSession = function() {
  try {
    const s = sessionStorage.getItem('judgeUid') ? {
      uid: sessionStorage.getItem('judgeUid'),
      email: sessionStorage.getItem('judgeEmail'),
      name: sessionStorage.getItem('judgeName')
    } : null;
    return s;
  } catch (e) { return null; }
};
window.setJudgeSession = function(sess) {
  try {
    if (!sess) {
      sessionStorage.removeItem('judgeUid');
      sessionStorage.removeItem('judgeEmail');
      sessionStorage.removeItem('judgeName');
      return;
    }
    sessionStorage.setItem('judgeUid', sess.uid || sess);
    sessionStorage.setItem('judgeEmail', sess.email || '');
    sessionStorage.setItem('judgeName', sess.name || '');
  } catch (e) { console.warn('setJudgeSession failed', e); }
};
