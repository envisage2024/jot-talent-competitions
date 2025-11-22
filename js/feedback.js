document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadFeedback();
});
async function loadFeedback() {
    const container = document.querySelector('.feedback-content') || document.getElementById('feedbackContent');
    if (!container) return;
    container.innerHTML = '';
    try {
        const user = firebase.auth().currentUser;
        if (user && window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                const u = doc.data();
                const feedbackArr = u.feedback || [];
                if (!feedbackArr.length) {
                    // If user doc has no feedback array, try fetching feedback from submissions where userId === uid
                    try {
                        const subsQ = await db.collection('submissions').where('userId', '==', user.uid).where('status', '==', 'reviewed').get();
                        if (subsQ && subsQ.docs && subsQ.docs.length) {
                            const compiled = [];
                            subsQ.docs.forEach(d => {
                                const s = d.data() || {};
                                if (Array.isArray(s.feedback) && s.feedback.length) {
                                    // push a lightweight record per submission containing feedback array
                                    compiled.push({ submissionTitle: s.title || '', feedback: s.feedback, submittedAt: s.submittedAt, reviewedAt: s.reviewedAt });
                                }
                            });
                            if (compiled.length) {
                                // render compiled feedback
                                compiled.forEach(sfb => {
                                    sfb.feedback.forEach(f => {
                                        const time = f.createdAt && f.createdAt.toDate ? f.createdAt.toDate().toLocaleString() : (f.createdAt || '');
                                        const html = `
                                            <div class="feedback-section">
                                                <h4>${sfb.submissionTitle || 'Submission'}</h4>
                                                <div class="feedback-text">
                                                    <strong>Rating:</strong> ${f.rating || 'N/A'}<br>
                                                    <strong>Feedback:</strong> <p>${f.feedback || ''}</p>
                                                    <small>${time}</small>
                                                </div>
                                            </div>
                                        `;
                                        container.insertAdjacentHTML('beforeend', html);
                                    });
                                });
                                return;
                            }
                        }
                    } catch (e) { console.warn('Could not fetch reviewed submissions for feedback fallback', e); }

                    container.innerHTML = '<p>No feedback yet. Check back after judges review your submission.</p>';
                    return;
                }
                feedbackArr.forEach(f => {
                    const time = f.createdAt && f.createdAt.toDate ? f.createdAt.toDate().toLocaleString() : (f.createdAt || '');
                    const html = `
                        <div class="feedback-section">
                            <h4>${f.submissionTitle || 'Submission'}</h4>
                            <div class="feedback-text">
                                <strong>Rating:</strong> ${f.rating || 'N/A'}<br>
                                <strong>Feedback:</strong> <p>${f.feedback || ''}</p>
                                <small>${time}</small>
                            </div>
                        </div>
                    `;
                    container.insertAdjacentHTML('beforeend', html);
                });
                return;
            }
        }
    } catch (e) { console.warn('Could not load feedback from Firestore', e); }

    // Fallback localStorage
    try {
        const raw = localStorage.getItem('jot_talent_feedback') || '[]';
        const arr = JSON.parse(raw);
        if (!arr.length) {
            container.innerHTML = '<p>No feedback yet.</p>';
            return;
        }
        arr.forEach(f => {
            const html = `
                <div class="feedback-section">
                    <h4>${f.submissionTitle || 'Submission'}</h4>
                    <div class="feedback-text">
                        <strong>Rating:</strong> ${f.rating || 'N/A'}<br>
                        <strong>Feedback:</strong> <p>${f.feedback || ''}</p>
                        <small>${f.createdAt || ''}</small>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    } catch (e) { console.warn('Could not render local feedback', e); }
}
