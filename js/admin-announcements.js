let currentAnnouncements = [];
let previewData = null;

document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth();
    loadAnnouncements();
    document.getElementById('announcementForm').addEventListener('submit', handleAnnouncementSubmission);
    document.getElementById('scheduleAnnouncement').addEventListener('change', toggleScheduleFields);
});

function toggleScheduleFields() {
    const scheduleGroup = document.getElementById('scheduleGroup');
    const isChecked = document.getElementById('scheduleAnnouncement').checked;
    if (isChecked) {
        scheduleGroup.classList.remove('hidden');
    } else {
        scheduleGroup.classList.add('hidden');
    }
}
// Handle form submission for creating an announcement
async function handleAnnouncementSubmission(e) {
    e.preventDefault();
    const form = e.target;
    const title = (document.getElementById('announcementTitle').value || '').trim();
    const message = (document.getElementById('announcementMessage').value || '').trim();
    const priority = document.getElementById('announcementPriority').value || 'normal';
    const audience = document.getElementById('announcementAudience').value || 'all';
    const scheduled = document.getElementById('scheduleAnnouncement').checked;
    const scheduleDateTime = document.getElementById('scheduleDateTime').value || null;

    if (!title || !message) {
        showNotification('Please provide title and message for the announcement', 'error');
        return;
    }

    const announcement = {
        id: generateId(),
        title: title,
        message: message,
        priority: priority,
        audience: audience,
        status: scheduled ? 'scheduled' : 'sent',
        createdAt: new Date().toISOString(),
        sentAt: scheduled ? scheduleDateTime : new Date().toISOString(),
        createdBy: (getCurrentAdmin && getCurrentAdmin().email) ? getCurrentAdmin().email : 'admin'
    };

    // Save to Firestore announcements collection if available
    try {
        if (window.firebase && firebase.firestore) {
            const db = firebase.firestore();
            await db.collection('announcements').doc(announcement.id).set(announcement);
        }
    } catch (err) {
        console.warn('Could not save announcement to Firestore', err);
    }

    // Broadcast locally (writes per-user notifications and saves history)
    try {
        broadcastAnnouncement(announcement);
    } catch (err) {
        console.warn('Local broadcast failed', err);
    }

    // Save to announcements history (local)
    try { saveAnnouncementToHistory(announcement); } catch (e) { /* ignore */ }

    showNotification('Announcement sent successfully', 'success');
    // reset form
    try { form.reset(); toggleScheduleFields(); } catch (e) {}
    // reload announcements list
    try { loadAnnouncements(); } catch (e) {}
}

// Load announcements from local history (or Firestore if you prefer)
function loadAnnouncements() {
    const list = document.getElementById('announcementsList');
    if (!list) return;
    const announcements = getAnnouncementsHistory() || [];
    if (!announcements || announcements.length === 0) {
        document.getElementById('noAnnouncements').classList.remove('hidden');
        list.innerHTML = '';
        return;
    }
    document.getElementById('noAnnouncements').classList.add('hidden');
    list.innerHTML = announcements.map(a => `
        <div class="announcement-row">
            <div class="announcement-header">
                <strong>${a.title}</strong>
                <span class="announcement-meta">${formatDateTime(a.createdAt)} • ${a.status}</span>
            </div>
            <p>${a.message}</p>
        </div>
    `).join('');
}

function previewAnnouncement() {
    const title = (document.getElementById('announcementTitle').value || '').trim();
    const message = (document.getElementById('announcementMessage').value || '').trim();
    const preview = document.getElementById('announcementPreview');
    if (!preview) return;
    preview.innerHTML = `
        <h4>${title}</h4>
        <p>${message}</p>
    `;
    openPreviewModal();
}

function openPreviewModal() { document.getElementById('previewModal').style.display = 'block'; }
function closePreviewModal() { document.getElementById('previewModal').style.display = 'none'; }

