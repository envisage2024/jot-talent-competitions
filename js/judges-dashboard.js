// judge-dashboard.js
function judgeLogout() {
    try { if (typeof setJudgeSession === 'function') setJudgeSession(null); } catch(e) {}
    window.location.href = 'judges-login.html';
}

// Ensure we have a getJudgeSession fallback (reads from sessionStorage)
if (typeof getJudgeSession !== 'function') {
    window.getJudgeSession = function() {
        try {
            const uid = sessionStorage.getItem('judgeUid');
            if (!uid) return null;
            return {
                uid: uid,
                email: sessionStorage.getItem('judgeEmail') || '',
                name: sessionStorage.getItem('judgeName') || ''
            };
        } catch (e) { return null; }
    };
}

function checkJudgeAuth() {
    const judge = (typeof getJudgeSession === 'function') ? getJudgeSession() : null;
    if (!judge || !judge.uid) {
        window.location.href = 'judges-login.html';
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', function() {
    (async function(){
        try { if (window.dataReady) await window.dataReady; } catch(e) {}
        if (!checkJudgeAuth()) return;

        const submissions = (typeof getAllSubmissions === 'function' ? getAllSubmissions() : (typeof getStorageData === 'function' ? getStorageData('jot_talent_submissions') : []));
        const totalEl = document.getElementById('totalSubmissions');
        const pendingEl = document.getElementById('pendingReviews');
        const completedEl = document.getElementById('completedReviews');

        if (totalEl) totalEl.textContent = submissions.length;
        if (pendingEl) pendingEl.textContent = submissions.filter(sub => sub.status === 'pending').length;

        // Try to read judge document from Firestore to get authoritative reviewedCount
        let completedCount = submissions.filter(sub => sub.status === 'reviewed').length;
        try {
            if (window.firebase && firebase.firestore) {
                const judge = (typeof getJudgeSession === 'function') ? getJudgeSession() : null;
                if (judge && (judge.uid || judge.id)) {
                    const db = firebase.firestore();
                    const judgeId = judge.uid || judge.id;
                    const doc = await db.collection('judges').doc(String(judgeId)).get();
                    if (doc.exists) {
                        const data = doc.data();
                        if (typeof data.reviewedCount === 'number') completedCount = data.reviewedCount;
                    }
                }
            }
        } catch (e) { console.warn('Could not read judge reviewedCount from Firestore', e); }

        if (completedEl) completedEl.textContent = completedCount;

    })();
});
