// admin-settings.js
// Firestore-backed rounds storage with localStorage fallback

const _hasFirestore = (typeof firebase !== 'undefined' && firebase.firestore);
const _settingsDoc = _hasFirestore ? firebase.firestore().collection('settings').doc('rounds') : null;

async function getRounds() {
    if (_settingsDoc) {
        try {
            const snap = await _settingsDoc.get();
            if (snap.exists) {
                const data = snap.data();
                return data.rounds || [];
            }
            return [];
        } catch (e) {
            console.error('Error reading rounds from Firestore', e);
            // fallback to localStorage
        }
    }
    try {
        if (typeof getStorageData === 'function') return getStorageData('jot_talent_rounds') || [];
        return [];
    } catch (e) {
        return [];
    }
}

async function setRounds(rounds) {
    if (_settingsDoc) {
        try {
            await _settingsDoc.set({ rounds: rounds, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return true;
        } catch (e) {
            console.error('Error writing rounds to Firestore', e);
            // fall through to localStorage
        }
    }
    try {
        if (typeof setStorageData === 'function') return await setStorageData('jot_talent_rounds', rounds);
        return false;
    } catch (e) {
        console.error('Error saving rounds to storage', e);
        return false;
    }
}

// expose for other scripts
window.getRounds = getRounds;
window.setRounds = setRounds;

async function activateRound(roundNumber) {
    const rounds = await getRounds();
    if (rounds.length > 0) {
        rounds[rounds.length - 1].status = 'completed';
    }
    const roundDetails = {
        round: roundNumber,
        title: `${ordinal(roundNumber)} Round`,
        description: `Screening for qualified participants. Only those who passed previous rounds can join.`,
        status: 'active',
        createdAt: new Date().toISOString()
    };
    rounds.push(roundDetails);
    await setRounds(rounds);
    showNotification(`${roundDetails.title} activated!`, 'success');
    await renderRounds();
}

async function activateFinalRound() {
    const rounds = await getRounds();
    if (rounds.length > 0) rounds[rounds.length - 1].status = 'completed';
    const roundDetails = {
        round: 'final',
        title: 'Final Round',
        description: 'Public voting for winners. Only finalists can be voted for.',
        status: 'active',
        createdAt: new Date().toISOString()
    };
    rounds.push(roundDetails);
    await setRounds(rounds);
    showNotification('Final Round (Public Voting) activated!', 'success');
    await renderRounds();
}

function ordinal(n) {
    if (n === 1) return 'First';
    if (n === 2) return 'Second';
    if (n === 3) return 'Third';
    return n + 'th';
}

async function renderRounds() {
    const rounds = await getRounds();
    const list = document.getElementById('roundsList');
    if (!list) return;
    list.innerHTML = rounds.map(r => `
        <li class="${r.status}">
            <strong>${r.title}</strong> - ${r.description || ''}<br>
            <span>Status: <span class="status-badge ${r.status}">${capitalizeFirst(r.status || '')}</span></span>
            <span class="round-date">${formatDate(r.createdAt)}</span>
        </li>
    `).join('');
}

// initialize on load
document.addEventListener('DOMContentLoaded', function() {
    // Require admin to be authenticated to access this page
    try { checkAdminAuth(); } catch(e) { /* fail silently if helper missing */ }
    renderRounds();
});
