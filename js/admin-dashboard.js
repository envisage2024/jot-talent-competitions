document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth();
    loadAdminDashboard();
});

function loadAdminDashboard() {
    updateAdminStats();
    loadAdminActivity();
    loadAdminAlerts();
}

function updateAdminStats() {
    const users = getAllUsers();
    const submissions = getAllSubmissions();
    const tickets = getAllSupportTickets();

    const paidUsers = users.filter(user => user.hasPaid);
    const pendingSubmissions = submissions.filter(sub => sub.status === 'pending');
    const completedSubmissions = submissions.filter(sub => sub.status === 'reviewed');
    const openTickets = tickets.filter(ticket => ticket.status === 'open');

    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('paidUsers').textContent = paidUsers.length;
    document.getElementById('totalSubmissions').textContent = submissions.length;
    document.getElementById('pendingReviews').textContent = pendingSubmissions.length;
    document.getElementById('completedReviews').textContent = completedSubmissions.length;
    document.getElementById('openTickets').textContent = openTickets.length;
    document.getElementById('pendingCount').textContent = pendingSubmissions.length;
}

function loadAdminActivity() {
    const activityFeed = document.getElementById('adminActivityFeed');
    const submissions = getAllSubmissions();
    const users = getAllUsers();

    // Get recent activity
    const recentSubmissions = submissions
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
        .slice(0, 5);

    const recentUsers = users
        .sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt))
        .slice(0, 3);

    let activityHtml = '';

    // Add recent submissions
    recentSubmissions.forEach(submission => {
        const user = users.find(u => u.email === submission.userEmail);
        activityHtml += `
            <div class="activity-item">
                <i class="fas fa-file-alt"></i>
                <div class="activity-content">
                    <p><strong>${user?.fullName || 'Unknown'}</strong> submitted "${submission.title}"</p>
                    <small>${formatDate(submission.submittedAt)}</small>
                </div>
                <span class="activity-status ${submission.status}">${capitalizeFirst(submission.status)}</span>
            </div>
        `;
    });

    // Add recent registrations
    recentUsers.forEach(user => {
        activityHtml += `
            <div class="activity-item">
                <i class="fas fa-user-plus"></i>
                <div class="activity-content">
                    <p><strong>${user.fullName}</strong> registered</p>
                    <small>${formatDate(user.registeredAt)}</small>
                </div>
                <span class="activity-status new">New</span>
            </div>
        `;
    });

    activityFeed.innerHTML = activityHtml || '<p>No recent activity</p>';
}

function loadAdminAlerts() {
    const alertsContainer = document.getElementById('adminAlerts');
    const submissions = getAllSubmissions();
    const users = getAllUsers();
    const tickets = getAllSupportTickets();

    let alerts = [];

    // Check for overdue reviews (submissions older than 7 days)
    const overdueSubmissions = submissions.filter(sub => {
        const daysSinceSubmission = (new Date() - new Date(sub.submittedAt)) / (1000 * 60 * 60 * 24);
        return sub.status === 'pending' && daysSinceSubmission > 7;
    });

    if (overdueSubmissions.length > 0) {
        alerts.push({
            type: 'warning',
            icon: 'fa-clock',
            title: 'Overdue Reviews',
            message: `${overdueSubmissions.length} submissions have been pending review for over 7 days.`
        });
    }

    // Check for high priority support tickets
    const urgentTickets = tickets.filter(ticket => 
        ticket.status === 'open' && ticket.priority === 'high'
    );

    if (urgentTickets.length > 0) {
        alerts.push({
            type: 'danger',
            icon: 'fa-exclamation-triangle',
            title: 'Urgent Support Tickets',
            message: `${urgentTickets.length} high priority support tickets need immediate attention.`
        });
    }

    // Competition deadline reminder
    const deadline = new Date('2025-12-31');
    const daysUntilDeadline = Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));

    if (daysUntilDeadline <= 30) {
        alerts.push({
            type: 'info',
            icon: 'fa-calendar-alt',
            title: 'Competition Deadline',
            message: `Competition deadline is in ${daysUntilDeadline} days.`
        });
    }

    if (alerts.length === 0) {
        alertsContainer.innerHTML = '<p class="no-alerts">No alerts at this time.</p>';
    } else {
        alertsContainer.innerHTML = alerts.map(alert => `
            <div class="alert alert-${alert.type}">
                <i class="fas ${alert.icon}"></i>
                <div class="alert-content">
                    <h4>${alert.title}</h4>
                    <p>${alert.message}</p>
                </div>
            </div>
        `).join('');
    }
}

function declareWinners() {
    if (confirm('Are you sure you want to declare winners? This will rank all reviewed submissions and notify participants.')) {
        const submissions = getAllSubmissions();
        const reviewedSubmissions = submissions.filter(sub => sub.status === 'reviewed' && sub.feedback);

        // Sort by rating (descending)
        reviewedSubmissions.sort((a, b) => (b.feedback.overallRating || 0) - (a.feedback.overallRating || 0));

        // Assign rankings
        reviewedSubmissions.forEach((submission, index) => {
            submission.ranking = index + 1;
            submission.rankedAt = new Date().toISOString();
        });

        // Save updated submissions
        reviewedSubmissions.forEach(submission => {
            saveUserSubmission(submission.userEmail, submission);
        });

        // Create announcement
        const announcement = {
            id: generateId(),
            title: 'Competition Results Announced!',
            message: `We're excited to announce that the competition results are now available! Check your progress page to see your ranking.`,
            type: 'announcement',
            createdAt: new Date().toISOString()
        };

        // Send to all participants
        const users = getAllUsers();
        users.forEach(user => {
            if (user.hasPaid) {
                addNotification(user.email, announcement);
            }
        });

        showNotification('Winners declared successfully! All participants have been notified.', 'success');
        loadAdminDashboard();
    }
}

function exportData() {
    const data = {
        users: getAllUsers(),
        submissions: getAllSubmissions(),
        tickets: getAllSupportTickets(),
        exportedAt: new Date().toISOString()
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `jot-talent-export-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    showNotification('Data exported successfully!', 'success');
}
