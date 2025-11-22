let currentTab = 'all';
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadNotifications();
});
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.tab-button').classList.add('active');
    loadNotifications();
}
// Load notifications for current user or system notifications
async function loadNotifications() {
    const listEl = document.querySelector('.notifications-list') || document.getElementById('notificationsList');
    if (!listEl) return;
    listEl.innerHTML = '';
    try {
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            const user = firebase.auth().currentUser;
            let q;
            if (user) {
                q = await db.collection('notifications').where('userId', 'in', [user.uid, null]).orderBy('createdAt', 'desc').limit(50).get();
            } else {
                q = await db.collection('notifications').where('userId', '==', null).orderBy('createdAt', 'desc').limit(50).get();
            }
            if (q.empty) {
                listEl.innerHTML = '<div class="no-notifications"><div class="empty-icon"><i class="fas fa-bell-slash"></i></div><h3>No notifications</h3></div>';
                return;
            }
            q.docs.forEach(doc => {
                const n = doc.data();
                const unreadClass = n.read ? '' : 'unread';
                const iconClass = n.type === 'system' ? 'admin' : (n.type === 'qualification' ? 'system' : 'personal');
                const html = `
                    <div class="notification-item ${unreadClass}">
                        <div class="notification-icon ${iconClass}"><i class="fas fa-bell"></i></div>
                        <div class="notification-content">
                            <div class="notification-header">
                                <h4>${n.title}</h4>
                                <div class="notification-time">${n.createdAt && n.createdAt.toDate ? n.createdAt.toDate().toLocaleString() : ''}</div>
                            </div>
                            <div><p>${n.message}</p></div>
                        </div>
                    </div>
                `;
                listEl.insertAdjacentHTML('beforeend', html);
            });
            return;
        }
    } catch (e) { console.warn('Could not load notifications from Firestore', e); }

    // Fallback: load notifications from localStorage
    try {
        const local = JSON.parse(localStorage.getItem('jot_talent_notifications') || '[]');
        if (!local.length) {
            listEl.innerHTML = '<div class="no-notifications"><div class="empty-icon"><i class="fas fa-bell-slash"></i></div><h3>No notifications</h3></div>';
            return;
        }
        local.forEach(n => {
            const html = `
                <div class="notification-item ${n.read ? '' : 'unread'}">
                    <div class="notification-icon admin"><i class="fas fa-bell"></i></div>
                    <div class="notification-content">
                        <div class="notification-header">
                            <h4>${n.title}</h4>
                            <div class="notification-time">${n.createdAt || ''}</div>
                        </div>
                        <div><p>${n.message}</p></div>
                    </div>
                </div>
            `;
            listEl.insertAdjacentHTML('beforeend', html);
        });
    } catch (e) { console.warn('Could not render local notifications', e); }
}

function markAllAsRead() {
    try {
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            const user = firebase.auth().currentUser;
            if (user) {
                db.collection('notifications').where('userId', 'in', [user.uid, null]).get().then(q => {
                    q.forEach(doc => doc.ref.update({ read: true }).catch(() => {}));
                }).catch(()=>{});
            }
        }
    } catch(e){}
    // clear local unread flags
    try { const local = JSON.parse(localStorage.getItem('jot_talent_notifications') || '[]'); local.forEach(n=>n.read=true); localStorage.setItem('jot_talent_notifications', JSON.stringify(local)); } catch(e){}
    loadNotifications();
}
