function judgeLogout() {
    try { if (typeof setJudgeSession === 'function') setJudgeSession(null); } catch(e) {}
    window.location.href = 'judges-login.html';
}
function checkJudgeAuth() {
    const judge = (typeof getJudgeSession === 'function') ? getJudgeSession() : null;
    if (!judge || !judge.uid) {
        window.location.href = 'judges-login.html';
        return;
    }
    // verify remote session if possible
    (async function verifyRemoteSession() {
        try {
            if (!judge) return;
            if (window.firebase && firebase.firestore) {
                const db = firebase.firestore();
                const since = new Date(Date.now() - (1000 * 60 * 60 * 24));
                const q = await db.collection('judge_sessions').where('email', '==', judge.email).where('loginAt', '>=', firebase.firestore.Timestamp.fromDate(since)).limit(1).get();
                if (q.empty) {
                    try { if (typeof setJudgeSession === 'function') setJudgeSession(null); } catch(e){}
                    window.location.href = 'judges-login.html';
                    return;
                }
                // record access
                try { db.collection('judge_sessions').add({ email: judge.email, accessAt: firebase.firestore.FieldValue.serverTimestamp(), page: 'judges-pending.html' }); } catch(e){}
            }
        } catch (e) { console.warn('verifyRemoteSession failed', e); }
    })();
}
function renderPendingSubmissions() {
    // Read current filters
    const categoryFilter = (document.getElementById('filterCategory') && document.getElementById('filterCategory').value) || '';
    const roundFilter = (document.getElementById('filterRound') && document.getElementById('filterRound').value) || '';
    const searchTerm = (document.getElementById('filterSearch') && document.getElementById('filterSearch').value || '').toLowerCase().trim();

    // Load submissions from Firestore-loaded cache if present, otherwise from local cache
    const allSubmissions = (window._pendingSubmissions && window._pendingSubmissions.length) ? window._pendingSubmissions : (typeof getAllSubmissions === 'function' ? getAllSubmissions() : (typeof getStorageData === 'function' ? getStorageData('jot_talent_submissions') : []));
    const submissions = allSubmissions.filter(sub => String(sub.status || '').toLowerCase() === 'pending');
    const list = document.getElementById('pendingSubmissionsList');
    if (!list) return;
    // Apply filters
    const filtered = submissions.filter(sub => {
        if (categoryFilter && String(sub.category || '').toLowerCase() !== String(categoryFilter).toLowerCase()) return false;
        if (roundFilter && String(sub.competitionRound || sub.round || '').toLowerCase() !== String(roundFilter).toLowerCase()) return false;
        if (searchTerm) {
            const hay = ((sub.title || '') + ' ' + (sub.content || '')).toLowerCase();
            if (!hay.includes(searchTerm)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-message"><i class="fas fa-inbox"></i> No pending submissions to review.</div>';
        return;
    }
    // Render compact clickable boxes (open modal for feedback)
    list.innerHTML = filtered.map(sub => `
        <div class="submission-tile" style="display:inline-block; width:320px; vertical-align:top; margin:8px;">
            <div class="tile-card" style="background:#fff; border-radius:12px; padding:14px; box-shadow:0 6px 18px rgba(0,0,0,0.06); height:220px; overflow:hidden; display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                    <div style="font-size:12px; color:#666; margin-bottom:6px;">#${sub.id} • ${sub.category || 'General'} • ${sub.competitionRound || sub.round || ''}</div>
                    <h4 style="margin:0 0 6px; font-size:16px;">${escapeHtml(sub.title || 'Untitled')}</h4>
                    <div style="font-size:13px; color:#333; max-height:88px; overflow:hidden;">${escapeHtml(shorten(sub.content || '', 280))}</div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                    <div style="font-size:12px; color:#888;">${formatDate(sub.submittedAt)}</div>
                    <div>
                        <button class="secondary-button" style="padding:8px 10px;" onclick="openFeedbackModal('${sub.__docId || sub.id}')">Open</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// sanitize small helper
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function shorten(s, n){ if(!s) return ''; return s.length > n ? s.slice(0,n).replace(/\s+\S*$/,'') + '…' : s; }

// Modal helpers
window.openFeedbackModal = function(id) {
    try {
    const submissions = window._pendingSubmissions || (typeof getAllSubmissions === 'function' ? getAllSubmissions() : []);
    const sub = submissions.find(s => String(s.id) === String(id) || String(s.__docId) === String(id));
        if (!sub) {
            console.warn('openFeedbackModal: submission not found for id', id, 'available submissions:', submissions.map(s=>({id:s.id,__docId:s.__docId})).slice(0,20));
            showNotification('Submission not found.', 'error');
            return;
        }
        const modal = document.getElementById('feedbackModal');
        const title = document.getElementById('modalTitle');
        const meta = document.getElementById('modalMeta');
        const content = document.getElementById('modalContent');
        const feedback = document.getElementById('modalFeedback');
        const rating = document.getElementById('modalRating');
        const modalForm = document.getElementById('modalFeedbackForm');
        // populate
        title.innerText = sub.title || 'Provide feedback';
        meta.innerText = `${sub.category || ''} ${sub.competitionRound ? '• ' + sub.competitionRound : ''}`;
        content.innerHTML = `<h4 style="margin-top:0;">${escapeHtml(sub.title||'Untitled')}</h4><div style="color:#444;">${escapeHtml(sub.content||'')}</div>`;
        feedback.value = '';
        rating.value = '5';
        const rateDisplay = document.getElementById('modalRatingDisplay'); if (rateDisplay) rateDisplay.innerText = String(rating.value);
        // wire slider change to display
        rating.oninput = function(){ try { if (rateDisplay) rateDisplay.innerText = String(this.value); } catch(e){} };
        modal.style.display = 'flex';

        // attach submit handler (one-time)
        modalForm.onsubmit = async function(e){ e.preventDefault();
            // reuse existing submitJudgeFeedback
            try {
                await submitJudgeFeedback(String(id), modalForm);
            } catch(e) { console.warn('modal submit failed', e); }
            closeFeedbackModal();
            // refresh list
            renderPendingSubmissions();
        };
    } catch(e) { console.warn('openFeedbackModal failed', e); }
};

window.closeFeedbackModal = function(){ try { const m=document.getElementById('feedbackModal'); if(m) m.style.display='none'; } catch(e){} };

document.addEventListener('click', function(e){
    if (e.target && e.target.id === 'modalClose') closeFeedbackModal();
    if (e.target && e.target.id === 'modalCancel') closeFeedbackModal();
});
// ensure modal slider display is wired on DOM ready (in case modal exists later)
document.addEventListener('DOMContentLoaded', function(){
    try { const r = document.getElementById('modalRating'); const d = document.getElementById('modalRatingDisplay'); if (r && d) { r.oninput = function(){ d.innerText = String(this.value); }; d.innerText = String(r.value || '5'); } } catch(e){}
});

// Fetch pending submissions from Firestore (one-time) and store in window._pendingSubmissions
async function fetchPendingFromFirestore() {
    if (!(window.firebase && firebase.firestore)) return;
    try {
        const db = firebase.firestore();
        const q = await db.collection('submissions').where('status', '==', 'pending').get();
        const arr = [];
        q.forEach(doc => {
            const data = doc.data() || {};
            // preserve the Firestore document id separately and prefer doc.id only when data.id is missing
            data.__docId = doc.id;
            data.id = data.id || doc.id;
            arr.push(data);
        });
        // store globally for rendering and filters
        window._pendingSubmissions = arr;
        // populate filters and render
        await populateFilters();
        renderPendingSubmissions();
    } catch (e) {
        console.warn('Failed to fetch submissions from Firestore', e);
    }
}

// Toggle author details panel
function toggleDetails(id) {
    const el = document.getElementById('details-' + id);
    if (!el) return;
    el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}

// Populate filters based on available submissions
async function populateFilters() {
    try {
        const allSubmissions = (typeof getAllSubmissions === 'function' ? getAllSubmissions() : (typeof getStorageData === 'function' ? getStorageData('jot_talent_submissions') : []));
        const categories = Array.from(new Set(allSubmissions.map(s => s.category).filter(Boolean)));
        const rounds = Array.from(new Set(allSubmissions.map(s => s.competitionRound || s.round).filter(Boolean)));

        const catEl = document.getElementById('filterCategory');
        const roundEl = document.getElementById('filterRound');
        if (catEl) {
            // clear existing (keep All)
            const cur = catEl.value || '';
            catEl.innerHTML = '<option value="">All</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
            catEl.value = cur;
        }
        if (roundEl) {
            const cur = roundEl.value || '';
            roundEl.innerHTML = '<option value="">All</option>' + rounds.map(r => `<option value="${r}">${r}</option>`).join('');
            roundEl.value = cur;
        }
    } catch (e) { console.warn('populateFilters failed', e); }
}

// Hook up filter change handlers
document.addEventListener('DOMContentLoaded', function() {
    try {
        const cat = document.getElementById('filterCategory');
        const rnd = document.getElementById('filterRound');
        const s = document.getElementById('filterSearch');
        const clr = document.getElementById('filterClear');
        if (cat) cat.addEventListener('change', renderPendingSubmissions);
        if (rnd) rnd.addEventListener('change', renderPendingSubmissions);
        if (s) s.addEventListener('input', debounce(renderPendingSubmissions, 250));
        if (clr) clr.addEventListener('click', function() { if (cat) cat.value=''; if (rnd) rnd.value=''; if (s) s.value=''; renderPendingSubmissions(); });
        // Try to fetch submissions from Firestore; populateFilters will be called after fetch, or fallback to local cache
        try { fetchPendingFromFirestore(); } catch(e) { populateFilters(); }
    } catch (e) { console.warn('filters init failed', e); }
});

// Simple debounce helper
function debounce(fn, ms) { let t; return function() { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); }; }
async function submitJudgeFeedback(id, form) {
    const feedback = form.feedback.value.trim();
    const rating = parseInt(form.rating.value, 10);
    if (!feedback || isNaN(rating) || rating < 1 || rating > 10) {
        showNotification('Please provide valid feedback and a rating between 1 and 10.', 'error');
        return;
    }
    try {
        // Load submissions from the in-memory pending cache first (populated by fetchPendingFromFirestore)
        const submissions = (window._pendingSubmissions && window._pendingSubmissions.length) ? window._pendingSubmissions : (typeof getAllSubmissions === 'function' ? getAllSubmissions() : (typeof getStorageData === 'function' ? getStorageData('jot_talent_submissions') : []));
        const idx = submissions.findIndex(s => String(s.id) === String(id) || String(s.__docId) === String(id));
        if (idx === -1) {
            showNotification('Submission not found.', 'error');
            return;
        }

        // Append feedback to submission
        const judge = (typeof getJudgeSession === 'function') ? getJudgeSession() : null;
        const feedbackEntry = {
            id: generateId(),
            judgeId: judge && judge.uid ? judge.uid : (judge && judge.id ? judge.id : null),
            judgeEmail: judge && judge.email ? judge.email : null,
            feedback: feedback,
            rating: rating,
            createdAt: new Date().toISOString()
        };

        submissions[idx].feedback = submissions[idx].feedback || [];
        submissions[idx].feedback.push(feedbackEntry);

        // Mark submission as reviewed
        submissions[idx].status = 'reviewed';
        submissions[idx].reviewedAt = new Date().toISOString();
        submissions[idx].reviewedBy = feedbackEntry.judgeId || feedbackEntry.judgeEmail || 'unknown';

        // Persist locally (and mirror to Firestore if available)
        try { if (typeof setStorageData === 'function') setStorageData('jot_talent_submissions', submissions); } catch(e) { console.warn('Could not persist submissions locally', e); }

        // If Firestore is available, mirror update and increment judge reviewedCount
        try {
            if (window.firebase && firebase.firestore) {
                const db = firebase.firestore();
                // prefer the original Firestore document id (saved as __docId). Fallback to stored id.
                const submissionDocId = submissions[idx].__docId || String(submissions[idx].id);
                // update submission doc and wait for completion so that subsequent fetch reflects the new status
                try {
                    await db.collection('submissions').doc(submissionDocId).set(submissions[idx], { merge: true });
                } catch (e) { console.warn('Could not sync submission to Firestore', e); }

                // increment judge reviewedCount if we have judgeId
                const judgeId = feedbackEntry.judgeId;
                if (judgeId) {
                    const judgeRef = db.collection('judges').doc(judgeId);
                    // increment atomically
                    judgeRef.set({ reviewedCount: firebase.firestore.FieldValue.increment(1) }, { merge: true }).catch(e => console.warn('Failed to increment judge reviewedCount', e));
                }
                    // Qualification logic: treat rating === 10 as 5-star qualification to next round
                    try {
                        const ownerId = submissions[idx].userId || null;
                        const ownerEmail = submissions[idx].userEmail || null;
                        if (!ownerId && !ownerEmail) {
                            console.warn('submitJudgeFeedback: submission has no ownerId or ownerEmail', submissions[idx]);
                        }
                        // Determine next round based on current submission round
                        const currentRound = submissions[idx].competitionRound || 'firstRound';
                        let nextRound = null;
                        if (currentRound === 'firstRound') nextRound = 'round2';
                        else if (currentRound === 'round2') nextRound = 'round3';

                        if (rating === 10 && nextRound) {
                            // mark user doc with qualification for nextRound
                            if (ownerId) {
                                db.collection('users').doc(String(ownerId)).set({ qualifiedRounds: firebase.firestore.FieldValue.arrayUnion(nextRound) }, { merge: true }).catch(e => console.warn('Failed to mark qualification by id', e));
                            } else if (ownerEmail) {
                                db.collection('users').where('email', '==', ownerEmail).limit(1).get().then(q => {
                                    if (!q.empty && q.docs[0]) {
                                        try { q.docs[0].ref.set({ qualifiedRounds: firebase.firestore.FieldValue.arrayUnion(nextRound) }, { merge: true }); } catch(e){ console.warn('Failed to set qualification by email lookup', e); }
                                    }
                                }).catch(e => console.warn('Failed to lookup user by email for qualification', e));
                            }

                            // create a notification for the user
                            const note = {
                                id: generateId(),
                                userId: ownerId || null,
                                userEmail: ownerEmail || null,
                                title: `You qualified for ${nextRound === 'round2' ? 'Round Two' : 'the Final Round'}`,
                                message: `Your submission \"${submissions[idx].title || ''}\" received a top rating and qualified for ${nextRound === 'round2' ? 'Round Two' : 'the Final Round'}.`,
                                type: 'qualification',
                                round: nextRound,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                read: false
                            };
                            db.collection('notifications').add(note).catch(e => console.warn('Failed to add notification', e));
                            // Mirror to Realtime DB per-user notifications for immediate delivery on notifications page
                            try {
                                if (window.firebase && firebase.database) {
                                    const rdb = firebase.database();
                                    const docId = ownerId ? String(ownerId) : (ownerEmail ? String(ownerEmail).replace(/[^a-zA-Z0-9-_\.]/g, '_') : 'unknown');
                                    rdb.ref('user_notifications/' + docId).push({
                                        ...note,
                                        createdAt: new Date().toISOString()
                                    }).catch(e => console.warn('Failed to push realtime qualification notification', e));
                                }
                            } catch (e) { console.warn('Realtime DB qualification notification failed', e); }

                            // Prefer marking qualification in Firestore via helper. No localStorage quick-flag used.
                            try {
                                if (typeof window.markUserQualified === 'function') {
                                    await window.markUserQualified(ownerId || ownerEmail, nextRound);
                                }
                            } catch(e) { console.warn('Could not mark user qualified via helper', e); }
                        } else if (rating < 10 && nextRound) {
                            // add a disqualification notification for the next round
                            const note = {
                                id: generateId(),
                                userId: ownerId || null,
                                userEmail: ownerEmail || null,
                                title: 'Submission review result',
                                message: `Your submission \"${submissions[idx].title || ''}\" did not qualify for the next round. See judge feedback for details.`,
                                type: 'disqualified',
                                round: nextRound,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                read: false
                            };
                            db.collection('notifications').add(note).catch(e => console.warn('Failed to add disqualify notification', e));
                        }
                    } catch (e) { console.warn('Qualification flow failed', e); }
                    // Also mirror this feedback to the submission owner's user doc (best-effort)
                    try {
                        const ownerId = submissions[idx].userId || null;
                        const ownerEmail = submissions[idx].userEmail || null;
                        const feedbackForUser = {
                            id: feedbackEntry.id,
                            submissionId: submissionDocId,
                            submissionTitle: submissions[idx].title || submissions[idx].name || '',
                            judgeId: feedbackEntry.judgeId || null,
                            judgeEmail: feedbackEntry.judgeEmail || null,
                            rating: feedbackEntry.rating || null,
                            feedback: feedbackEntry.feedback || '',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        };

                        if (ownerId) {
                            db.collection('users').doc(String(ownerId)).set({ feedback: firebase.firestore.FieldValue.arrayUnion(feedbackForUser) }, { merge: true }).catch(e => console.warn('Failed to append feedback to user doc by id', e));
                            // also add a notification for feedback available
                            const note = {
                                id: generateId(),
                                userId: ownerId,
                                userEmail: ownerEmail || null,
                                title: 'Your submission has been reviewed',
                                message: `Your submission "${submissions[idx].title || ''}" received feedback from a judge. View feedback on your dashboard.`,
                                type: 'feedback',
                                submissionId: submissionDocId,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                read: false
                            };
                            db.collection('notifications').add(note).catch(e => console.warn('Failed to add feedback notification', e));
                            try {
                                if (window.firebase && firebase.database) {
                                    const rdb = firebase.database();
                                    const docId = ownerId ? String(ownerId) : (ownerEmail ? String(ownerEmail).replace(/[^a-zA-Z0-9-_\.]/g, '_') : 'unknown');
                                    rdb.ref('user_notifications/' + docId).push({
                                        ...note,
                                        createdAt: new Date().toISOString()
                                    }).catch(e => console.warn('Failed to push realtime feedback notification', e));
                                }
                            } catch(e){ console.warn('Realtime DB feedback notification failed', e); }
                        } else if (ownerEmail) {
                            // try to find user doc by email
                            db.collection('users').where('email', '==', ownerEmail).limit(1).get().then(q => {
                                if (!q.empty && q.docs[0]) {
                                    try { q.docs[0].ref.set({ feedback: firebase.firestore.FieldValue.arrayUnion(feedbackForUser) }, { merge: true }); } catch(e){ console.warn('Failed to set feedback by email lookup', e); }
                                    // add notification to the top-level notifications collection so it is visible to notifications.js
                                    const note = {
                                        id: generateId(),
                                        userId: q.docs[0].id,
                                        userEmail: ownerEmail || null,
                                        title: 'Your submission has been reviewed',
                                        message: `Your submission "${submissions[idx].title || ''}" received feedback from a judge. View feedback on your dashboard.`,
                                        type: 'feedback',
                                        submissionId: submissionDocId,
                                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                        read: false
                                    };
                                    try { db.collection('notifications').add(note).catch(()=>{}); } catch(e){}
                                    try {
                                        if (window.firebase && firebase.database) {
                                            const rdb = firebase.database();
                                            const docId = q.docs[0].id || (ownerEmail ? String(ownerEmail).replace(/[^a-zA-Z0-9-_\.]/g, '_') : 'unknown');
                                            rdb.ref('user_notifications/' + docId).push({
                                                ...note,
                                                createdAt: new Date().toISOString()
                                            }).catch(e => console.warn('Failed to push realtime feedback notification (email lookup)', e));
                                        }
                                    } catch(e) { console.warn('Realtime DB feedback notification failed (email lookup)', e); }
                                }
                            }).catch(e => console.warn('Failed to lookup user by email for feedback mirror', e));
                        }
                    } catch (e) { console.warn('Could not mirror feedback into user doc', e); }
            }
        } catch (e) { console.warn('Firestore mirror failed', e); }

        // Also update in-memory CACHE if available so dashboards update immediately
        try {
            if (typeof CACHE !== 'undefined' && CACHE['jot_talent_submissions']) {
                const cidx = CACHE['jot_talent_submissions'].findIndex(s => String(s.id) === String(id));
                if (cidx >= 0) CACHE['jot_talent_submissions'][cidx] = submissions[idx];
            }
        } catch(e){}

        // Increment local judge count so dashboard reflects immediately (best-effort)
        try {
            const j = (typeof getJudgeSession === 'function') ? getJudgeSession() : null;
            if (j && j.uid) {
                // update CACHE if present
                try { if (typeof CACHE !== 'undefined' && CACHE['jot_talent_users']) {
                    const judgesArr = CACHE['jot_talent_users'];
                } } catch(e){}
            }
        } catch(e){}

        showNotification('Feedback submitted and submission marked reviewed.', 'success');
    // remove from in-memory pending list so it disappears immediately from the UI
        try {
            if (window._pendingSubmissions && Array.isArray(window._pendingSubmissions)) {
                const removeIdx = window._pendingSubmissions.findIndex(s => String(s.id) === String(id) || String(s.__docId) === String(id));
                if (removeIdx >= 0) window._pendingSubmissions.splice(removeIdx, 1);
            }
        } catch(e) { console.warn('Could not remove from in-memory pending list', e); }
    // re-render list
    renderPendingSubmissions();
    // also refresh from Firestore to ensure server-side status change is respected
    try { await fetchPendingFromFirestore(); } catch(e){ /* ignore */ }
        // Local quick-flag: mark qualification in localStorage for UI gating
        // No localStorage qualification flags are set anymore; we rely on Firestore as the source of truth.
    } catch (e) {
+        console.error('submitJudgeFeedback failed', e);
        showNotification('Failed to submit feedback. Try again.', 'error');
    }
}
document.addEventListener('DOMContentLoaded', function() {
    (async function(){ try { if (window.dataReady) await window.dataReady; } catch(e) {} checkJudgeAuth(); renderPendingSubmissions(); })();
});
