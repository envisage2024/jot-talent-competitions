// Jot Talent Competitions - Main JavaScript File
// Handles all client-side functionality including authentication, submissions, admin features

// ===== CONSTANTS AND CONFIGURATION =====
const STORAGE_KEYS = {
    USERS: 'jot_talent_users',
    CURRENT_USER: 'jot_talent_current_user',
    CURRENT_ADMIN: 'jot_talent_current_admin',
    SUBMISSIONS: 'jot_talent_submissions',
    NOTIFICATIONS: 'jot_talent_notifications',
    SUPPORT_TICKETS: 'jot_talent_support_tickets',
    ANNOUNCEMENTS: 'jot_talent_announcements',
    RANKINGS: 'jot_talent_rankings'
};

const ADMIN_CREDENTIALS = {
    email: 'admin@jottalent.com',
    password: 'admin123'
};

// ===== UTILITY FUNCTIONS =====

/**
 * Generate a unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format datetime for input fields
 */
function formatDateTime(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Show notification toast
 */
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification-toast');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

/**
 * Convert object array to CSV
 */
function convertToCSV(objArray) {
    if (!objArray.length) return '';
    
    const headers = Object.keys(objArray[0]);
    const csvContent = [
        headers.join(','),
        ...objArray.map(obj => 
            headers.map(header => 
                JSON.stringify(obj[header] || '')
            ).join(',')
        )
    ].join('\n');
    
    return csvContent;
}

/**
 * Download CSV file
 */
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
}

// ===== LOCAL STORAGE MANAGEMENT =====

/**
 * Get data from localStorage with error handling
 */
function getStorageData(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error(`Error reading ${key} from localStorage:`, error);
        return [];
    }
}

/**
 * Save data to localStorage with error handling
 */
function setStorageData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error(`Error saving ${key} to localStorage:`, error);
        showNotification('Storage error. Please try again.', 'error');
        return false;
    }
}

// ===== USER MANAGEMENT =====

/**
 * Get all users
 */
function getAllUsers() {
    return getStorageData(STORAGE_KEYS.USERS);
}

/**
 * Save user data
 */
function saveUser(userData) {
    const users = getAllUsers();
    const existingIndex = users.findIndex(user => user.email === userData.email);
    
    if (existingIndex >= 0) {
        users[existingIndex] = { ...users[existingIndex], ...userData };
    } else {
        users.push(userData);
    }
    
    return setStorageData(STORAGE_KEYS.USERS, users);
}

/**
 * Get user by email
 */
function getUserByEmail(email) {
    const users = getAllUsers();
    return users.find(user => user.email === email);
}

/**
 * Get current logged-in user
 */
function getCurrentUser() {
    try {
        const userData = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        return userData ? JSON.parse(userData) : null;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Set current user session
 */
function setCurrentUser(userData) {
    return setStorageData(STORAGE_KEYS.CURRENT_USER, userData);
}

/**
 * Get current admin
 */
function getCurrentAdmin() {
    try {
        const adminData = localStorage.getItem(STORAGE_KEYS.CURRENT_ADMIN);
        return adminData ? JSON.parse(adminData) : null;
    } catch (error) {
        console.error('Error getting current admin:', error);
        return null;
    }
}

/**
 * Set current admin session
 */
function setCurrentAdmin(adminData) {
    return setStorageData(STORAGE_KEYS.CURRENT_ADMIN, adminData);
}

/**
 * Get user data including payment status
 */
function getUserData(email) {
    const user = getUserByEmail(email);
    if (!user) return null;
    
    return {
        ...user,
        hasPaid: user.hasPaid || false,
        registeredAt: user.registeredAt || new Date().toISOString(),
        paidAt: user.paidAt || null
    };
}

// ===== AUTHENTICATION =====

/**
 * Handle user signup
 */
function handleSignup(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const username = formData.get('username').trim();

    // Validate username
        if (!username.match(/^[A-Za-z.]{3,20}$/)) {
            showNotification('Username must be 3-20 characters; letters and full stops (.) only.', 'error');
        return;
    }

    // Check if username already exists
    const allUsers = getAllUsers();
    if (allUsers.some(user => user.username && user.username.toLowerCase() === username.toLowerCase())) {
        showNotification('Username is already taken. Please choose another.', 'error');
        return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
        showNotification('Passwords do not match!', 'error');
        return;
    }

    // Check if user already exists
    const email = formData.get('email');
    if (getUserByEmail(email)) {
        showNotification('User with this email already exists!', 'error');
        return;
    }

    // Create user data
    const userData = {
        id: generateId(),
        username: username,
        fullName: formData.get('fullName'),
        email: email,
        password: password, // In real app, this would be hashed
        bio: formData.get('bio') || '',
        registeredAt: new Date().toISOString(),
        hasPaid: false,
        paidAt: null
    };

    // Save user
    if (saveUser(userData)) {
        showNotification('Account created successfully! Please login.', 'success');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    }
}

/**
 * Handle user login
 */
function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    
    // Find user
    const user = getUserByEmail(email);
    
    if (!user || user.password !== password) {
        showNotification('Invalid email or password!', 'error');
        return;
    }
    
    // Set current user session
    if (setCurrentUser(user)) {
        showNotification('Login successful!', 'success');
        
        // Add welcome notification
        addNotification(user.email, {
            id: generateId(),
            title: 'Welcome back!',
            message: 'You have successfully logged in to your account.',
            type: 'personal',
            timestamp: new Date().toISOString(),
            read: false
        });
        
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1000);
    }
}

/**
 * Handle admin login
 */
function handleAdminLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    
    // Validate admin credentials
    if (email !== ADMIN_CREDENTIALS.email || password !== ADMIN_CREDENTIALS.password) {
        showNotification('Invalid admin credentials!', 'error');
        return;
    }
    
    // Set admin session
    const adminData = {
        email: email,
        role: 'admin',
        loginAt: new Date().toISOString()
    };
    
    if (setCurrentAdmin(adminData)) {
        showNotification('Admin login successful!', 'success');
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 1000);
    }
}

/**
 * Logout user
 */
function logout() {
    // Try to sign out from Firebase if available
    try {
        if (window.firebase && typeof firebase.auth === 'function') {
            firebase.auth().signOut().catch(() => {});
        }
    } catch (e) {}
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    try { localStorage.setItem('jot_talent_user_logged_out', '1'); } catch(e) {}
    showNotification('Logged out successfully!', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 800);
}

/**
 * Logout admin
 */
function adminLogout() {
    try {
        if (window.firebase && typeof firebase.auth === 'function') {
            firebase.auth().signOut().catch(() => {});
        }
    } catch (e) {}
    localStorage.removeItem(STORAGE_KEYS.CURRENT_ADMIN);
    try { localStorage.setItem('jot_talent_user_logged_out', '1'); } catch(e) {}
    showNotification('Admin logged out successfully!', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 800);
}

/**
 * Check if user is authenticated and redirect if not
 */
function checkAuth() {
    const currentUser = getCurrentUser();
    
    if (!currentUser) {
        showNotification('Please login to access this page.', 'warning');
        // If a recent signin just happened, give a short grace window before redirecting
        let delay = 1500;
        try {
            const stamp = parseInt(localStorage.getItem('jt_recent_signin') || '0', 10) || 0;
            if (stamp && (Date.now() - stamp) < 8000) delay = 3500;
        } catch (e) { /* ignore */ }
        setTimeout(() => {
            window.location.href = 'login.html';
        }, delay);
        return false;
    }
    
    // Update user name and username in dashboard
    const userNameElement = document.getElementById('userName');
    const userUsernameElement = document.getElementById('userUsername');
    if (userUsernameElement) {
        // Prefer display username, fall back to full name if username not available
        const candidate = currentUser.username || currentUser.fullName || '';
        const cur = (userUsernameElement.textContent || '').trim();
        if (!cur || cur === 'Writer' || cur === 'Username') {
            userUsernameElement.textContent = candidate;
        }
    }
    if (userNameElement) {
        userNameElement.textContent = currentUser.fullName;
    }
    
    return true;
}

/**
 * Check if admin is authenticated
 */
function checkAdminAuth() {
    const currentAdmin = getCurrentAdmin();
    
    if (!currentAdmin) {
        showNotification('Admin access required.', 'warning');
        setTimeout(() => {
            window.location.href = 'admin-login.html';
        }, 1500);
        return false;
    }
    
    return true;
}

// ===== SUBMISSION MANAGEMENT =====

/**
 * Get all submissions
 */
function getAllSubmissions() {
    return getStorageData(STORAGE_KEYS.SUBMISSIONS);
}

/**
 * Get user's submission
 */
function getUserSubmission(email) {
    const submissions = getAllSubmissions();
    return submissions.find(sub => sub.userEmail === email);
}

/**
 * Save user submission
 */
function saveUserSubmission(email, submissionData) {
    const submissions = getAllSubmissions();
    const existingIndex = submissions.findIndex(sub => sub.userEmail === email);
    
    if (existingIndex >= 0) {
        submissions[existingIndex] = submissionData;
    } else {
        submissions.push(submissionData);
    }
    
    return setStorageData(STORAGE_KEYS.SUBMISSIONS, submissions);
}

/**
 * Handle article submission
 */
function handleSubmission(e) {
    e.preventDefault();
    
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    // Check if user has paid
    const userData = getUserData(currentUser.email);
    if (!userData.hasPaid) {
        showNotification('Please join the competition first by making payment.', 'error');
        return;
    }
    
    // Check if user has already submitted
    const existingSubmission = getUserSubmission(currentUser.email);
    if (existingSubmission) {
        showNotification('You have already submitted an article. Only one submission per user is allowed.', 'error');
        return;
    }
    
    const formData = new FormData(e.target);
    const content = formData.get('content');
    const words = content.trim().split(/\s+/).filter(word => word.length > 0);
    
    // Validate word count
    if (words.length < 1000 || words.length > 2500) {
        showNotification('Article must be between 1000-2500 words.', 'error');
        return;
    }
    
    // Confirm submission
    if (!confirm('Are you sure you want to submit this article? This action cannot be undone and you can only submit once.')) {
        return;
    }
    
    // Create submission data
    const submissionData = {
        id: generateId(),
        userEmail: currentUser.email,
        authorName: currentUser.fullName,
        title: formData.get('title'),
        category: formData.get('category'),
        content: content,
        wordCount: words.length,
        notes: formData.get('notes') || '',
        submittedAt: new Date().toISOString(),
        status: 'pending',
        feedback: null,
        reviewedAt: null,
        ranking: null,
        rankedAt: null
    };
    
    // Save submission
    if (saveUserSubmission(currentUser.email, submissionData)) {
        showNotification('Article submitted successfully!', 'success');
        
        // Add notification
        addNotification(currentUser.email, {
            id: generateId(),
            title: 'Article Submitted!',
            message: `Your article "${submissionData.title}" has been submitted for review.`,
            type: 'personal',
            timestamp: new Date().toISOString(),
            read: false
        });
        
        // Show success section
        document.getElementById('submissionFormContainer').classList.add('hidden');
        document.getElementById('submissionSuccess').classList.remove('hidden');
    }
}

/**
 * Save draft (placeholder functionality)
 */
function saveDraft() {
    showNotification('Draft saved locally in your browser.', 'info');
}

/**
 * Update submission page based on user status
 */
function updateSubmissionPage() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const userData = getUserData(currentUser.email);
    const submission = getUserSubmission(currentUser.email);
    const statusContainer = document.getElementById('submissionStatus');
    const formContainer = document.getElementById('submissionFormContainer');
    const successContainer = document.getElementById('submissionSuccess');
    
    if (!userData.hasPaid) {
        statusContainer.innerHTML = `
            <div class="status-card warning">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <h4>Payment Required</h4>
                    <p>You need to join the competition first before you can submit your article.</p>
                    <a href="join.html" class="primary-button">
                        <i class="fas fa-credit-card"></i>
                        Join Competition
                    </a>
                </div>
            </div>
        `;
        formContainer.classList.add('hidden');
        return;
    }
    
    if (submission) {
        statusContainer.innerHTML = `
            <div class="status-card success">
                <i class="fas fa-check-circle"></i>
                <div>
                    <h4>Article Already Submitted</h4>
                    <p>You have already submitted "${submission.title}". Only one submission per participant is allowed.</p>
                    <a href="progress.html" class="primary-button">
                        <i class="fas fa-chart-line"></i>
                        Track Progress
                    </a>
                </div>
            </div>
        `;
        formContainer.classList.add('hidden');
        successContainer.classList.add('hidden');
        return;
    }
    
    // User can submit
    statusContainer.innerHTML = `
        <div class="status-card info">
            <i class="fas fa-info-circle"></i>
            <div>
                <h4>Ready to Submit</h4>
                <p>You can now submit your article for the competition. Remember, you can only submit once!</p>
            </div>
        </div>
    `;
}

// ===== PAYMENT SIMULATION =====

/**
 * Process payment simulation
 */
function processPayment() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    // Check if already paid
    const userData = getUserData(currentUser.email);
    if (userData.hasPaid) {
        showNotification('You have already joined the competition!', 'info');
        return;
    }
    
    // Simulate payment processing
    const paymentButton = document.getElementById('paymentButton');
    const originalText = paymentButton.innerHTML;
    
    paymentButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    paymentButton.disabled = true;
    
    setTimeout(() => {
        // Update user payment status
        const updatedUser = {
            ...currentUser,
            hasPaid: true,
            paidAt: new Date().toISOString()
        };
        
        saveUser(updatedUser);
        setCurrentUser(updatedUser);
        
        // Add notification
        addNotification(currentUser.email, {
            id: generateId(),
            title: 'Payment Successful!',
            message: 'You have successfully joined the competition. You can now submit your article.',
            type: 'personal',
            timestamp: new Date().toISOString(),
            read: false
        });
        
        // Show success section
        document.getElementById('paymentSection').classList.add('hidden');
        document.getElementById('successSection').classList.remove('hidden');
        
        showNotification('Payment successful! You can now submit your article.', 'success');
    }, 2000);
}

/**
 * Update join page based on user status
 */
function updateJoinPage() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const userData = getUserData(currentUser.email);
    const participantCountElement = document.getElementById('participantCount');
    
    // Update participant count
    const allUsers = getAllUsers();
    const paidUsers = allUsers.filter(user => user.hasPaid);
    if (participantCountElement) {
        participantCountElement.textContent = `${paidUsers.length} participants joined`;
    }
    
    // Check if user has already paid
    if (userData.hasPaid) {
        document.getElementById('paymentSection').classList.add('hidden');
        document.getElementById('successSection').classList.remove('hidden');
    }
}

// ===== DASHBOARD MANAGEMENT =====

/**
 * Update dashboard with current user data
 */
function updateDashboard() {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const userData = getUserData(currentUser.email);
    const submission = getUserSubmission(currentUser.email);
    const notifications = getNotifications(currentUser.email);
    
    // Update competition status
    const competitionStatus = document.getElementById('competitionStatus');
    if (competitionStatus) {
        if (userData.hasPaid) {
            competitionStatus.textContent = 'Joined';
            competitionStatus.className = 'status-joined';
        } else {
            competitionStatus.textContent = 'Not Joined';
            competitionStatus.className = 'status-not-joined';
        }
    }
    
    // Update submission status
    const submissionStatus = document.getElementById('submissionStatus');
    if (submissionStatus) {
        if (submission) {
            submissionStatus.textContent = capitalizeFirst(submission.status);
            submissionStatus.className = `status-${submission.status}`;
        } else {
            submissionStatus.textContent = 'No Submission';
            submissionStatus.className = 'status-no-submission';
        }
    }
    
    // Update ranking
    const currentRanking = document.getElementById('currentRanking');
    if (currentRanking) {
        if (submission && submission.ranking) {
            currentRanking.textContent = `Rank #${submission.ranking}`;
            currentRanking.className = 'ranking-available';
        } else {
            currentRanking.textContent = 'Not Ranked';
            currentRanking.className = 'ranking-pending';
        }
    }
    
    // Update notification count
    const notificationCount = document.getElementById('notificationCount');
    if (notificationCount) {
        const unreadCount = notifications.filter(n => !n.read).length;
        notificationCount.textContent = `${unreadCount} new messages`;
    }
    
    // Update activity list
    updateActivityList();
}

/**
 * Update activity list
 */
function updateActivityList() {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;
    
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    
    const userData = getUserData(currentUser.email);
    const submission = getUserSubmission(currentUser.email);
    const activities = [];
    
    // Add registration activity
    activities.push({
        icon: 'fa-user-plus',
        text: 'Account created successfully',
        time: userData.registeredAt
    });
    
    // Add payment activity
    if (userData.hasPaid) {
        activities.push({
            icon: 'fa-credit-card',
            text: 'Joined the competition',
            time: userData.paidAt
        });
    }
    
    // Add submission activity
    if (submission) {
        activities.push({
            icon: 'fa-file-alt',
            text: `Submitted "${submission.title}"`,
            time: submission.submittedAt
        });
        
        if (submission.status === 'reviewed') {
            activities.push({
                icon: 'fa-star',
                text: 'Article reviewed and feedback received',
                time: submission.reviewedAt
            });
        }
    }
    
    // Sort by time (newest first)
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));
    
    // Display activities
    activityList.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <i class="fas ${activity.icon}"></i>
            <span>${activity.text}</span>
            <small>${formatDate(activity.time)}</small>
        </div>
    `).join('');
}

// ===== NOTIFICATION SYSTEM =====

/**
 * Get notifications for a user
 */
function getNotifications(email) {
    const allNotifications = getStorageData(STORAGE_KEYS.NOTIFICATIONS);
    // If notifications are stored as an object per user
    if (allNotifications && typeof allNotifications === 'object' && !Array.isArray(allNotifications)) {
        if (Array.isArray(allNotifications[email])) {
            return allNotifications[email];
        }
        // If notifications for the user are not an array, try to convert
        if (typeof allNotifications[email] === 'object' && allNotifications[email] !== null) {
            return Object.values(allNotifications[email]).flat();
        }
        return [];
    }
    // If notifications are stored as a flat array (legacy or corrupted)
    if (Array.isArray(allNotifications)) {
        // Filter notifications for this user
        return allNotifications.filter(n => n.email === email || n.userEmail === email);
    }
    return [];
}

/**
 * Save notifications for a user
 */
function saveNotifications(email, notifications) {
    const allNotifications = getStorageData(STORAGE_KEYS.NOTIFICATIONS);
    allNotifications[email] = notifications;
    return setStorageData(STORAGE_KEYS.NOTIFICATIONS, allNotifications);
}

/**
 * Add notification for a user
 */
function addNotification(email, notification) {
    const notifications = getNotifications(email);
    notifications.unshift(notification); // Add to beginning
    return saveNotifications(email, notifications);
}

/**
 * Broadcast notification to multiple users
 */
function broadcastNotification(userEmails, notification) {
    userEmails.forEach(email => {
        addNotification(email, { ...notification, id: generateId() });
    });
}

// ===== SUPPORT TICKET SYSTEM =====

/**
 * Get support tickets for a user
 */
function getSupportTickets(email) {
    const allTickets = getStorageData(STORAGE_KEYS.SUPPORT_TICKETS);
    return allTickets[email] || [];
}

/**
 * Save support tickets for a user
 */
function saveSupportTickets(email, tickets) {
    const allTickets = getStorageData(STORAGE_KEYS.SUPPORT_TICKETS);
    allTickets[email] = tickets;
    return setStorageData(STORAGE_KEYS.SUPPORT_TICKETS, allTickets);
}

/**
 * Get all support tickets (admin function)
 */
function getAllSupportTickets() {
    const allTickets = getStorageData(STORAGE_KEYS.SUPPORT_TICKETS);
    const flatTickets = [];
    
    Object.values(allTickets).forEach(userTickets => {
        flatTickets.push(...userTickets);
    });
    
    return flatTickets;
}

// ===== RANKING SYSTEM =====

/**
 * Get current rankings
 */
function getRankings() {
    const submissions = getAllSubmissions();
    const rankedSubmissions = submissions
        .filter(sub => sub.status === 'reviewed' && sub.ranking)
        .sort((a, b) => a.ranking - b.ranking);
    
    const users = getAllUsers();
    
    return rankedSubmissions.map(submission => {
        const user = users.find(u => u.email === submission.userEmail);
        return {
            ranking: submission.ranking,
            email: submission.userEmail,
            username: user?.username || '',
            name: user?.fullName || 'Unknown',
            title: submission.title,
            score: submission.feedback?.overallRating || 0
        };
    });
}

// ===== ANNOUNCEMENT SYSTEM =====

/**
 * Get announcements history
 */
function getAnnouncementsHistory() {
    return getStorageData(STORAGE_KEYS.ANNOUNCEMENTS);
}

/**
 * Save announcement to history
 */
function saveAnnouncementToHistory(announcement) {
    const announcements = getAnnouncementsHistory();
    announcements.unshift(announcement);
    return setStorageData(STORAGE_KEYS.ANNOUNCEMENTS, announcements);
}

/**
 * Save scheduled announcement
 */
function saveScheduledAnnouncement(announcement) {
    return saveAnnouncementToHistory(announcement);
}

/**
 * Delete scheduled announcement
 */
function deleteScheduledAnnouncementById(id) {
    const announcements = getAnnouncementsHistory();
    const filtered = announcements.filter(ann => ann.id !== id);
    return setStorageData(STORAGE_KEYS.ANNOUNCEMENTS, filtered);
}

/**
 * Get target audience for announcements based on criteria
 */
function getTargetAudience(users, audience) {
    switch(audience) {
        case 'participants':
            return users.filter(user => user.hasPaid);
        case 'submitted':
            const submittedEmails = getAllSubmissions().map(sub => sub.userEmail);
            return users.filter(user => submittedEmails.includes(user.email));
        default:
            return users;
    }
}

/**
 * Broadcast announcement to target users
 */
function broadcastAnnouncement(announcement) {
    const users = getAllUsers();
    const targetUsers = getTargetAudience(users, announcement.audience);

    // For each target user, add notification under their email
    targetUsers.forEach(user => {
        addNotification(user.email, {
            id: generateId(),
            title: announcement.title,
            message: announcement.message,
            type: 'announcement',
            priority: announcement.priority,
            timestamp: new Date().toISOString(),
            read: false
        });
    });

    // Save to announcements history
    saveAnnouncementToHistory(announcement);
}

// ===== ADMIN FUNCTIONS =====

/**
 * Load admin dashboard data
 */
function loadAdminDashboard() {
    // This function is called from admin-dashboard.html
    // Implementation is included in that file's script section
}

// Stretch admin navbar across the screen
function stretchAdminNavbar() {
  const adminNav = document.querySelector('.admin-nav');
  const navbar = adminNav ? adminNav.querySelector('.navbar') : null;
  if (adminNav) {
    adminNav.style.width = '100%';
    adminNav.style.margin = '0';
    adminNav.style.maxWidth = 'none';
  }
  if (navbar) {
    navbar.style.width = '100%';
    navbar.style.maxWidth = 'none';
    navbar.style.margin = '0';
    navbar.style.paddingLeft = '0';
    navbar.style.paddingRight = '0';
  }
}

/**
 * Update navigation submit link based on payment status
 */
function updateNavForPayment() {
    const submitLink = document.querySelector('.nav-links.user-nav a[href="submit.html"]');
    if (!submitLink) return;
    const currentUser = getCurrentUser();
    const hasPaid = currentUser ? (currentUser.hasPaid || false) : false;
    if (!hasPaid) {
        submitLink.classList.add('disabled');
        submitLink.setAttribute('aria-disabled', 'true');
        submitLink.addEventListener('click', function onClick(e) {
            if (!getCurrentUser() || !getCurrentUser().hasPaid) {
                e.preventDefault();
                showNotification('Please join the competition first to access the submission page.', 'warning');
            }
        });
    } else {
        submitLink.classList.remove('disabled');
        submitLink.removeAttribute('aria-disabled');
    }
}

document.addEventListener('DOMContentLoaded', function() {
  stretchAdminNavbar();
  // Admin navbar auto-hide on scroll (like main header)
  let lastAdminScrollTop = 0;
  const adminNav = document.querySelector('.admin-nav');
  if (adminNav) {
    window.addEventListener('scroll', function() {
      let st = window.pageYOffset || document.documentElement.scrollTop;
      if (st > lastAdminScrollTop) {
        // Scrolling down
        adminNav.classList.add('hide-on-scroll');
      } else {
        // Scrolling up
        adminNav.classList.remove('hide-on-scroll');
      }
      lastAdminScrollTop = st <= 0 ? 0 : st;
    }, false);
  }
});

// Theme toggle functionality
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.className = theme; // Update body class
    localStorage.setItem('theme', theme);
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
}

document.addEventListener('DOMContentLoaded', function () {
    initializeTheme();

    const lightThemeButton = document.getElementById('lightThemeButton');
    const darkThemeButton = document.getElementById('darkThemeButton');

    if (lightThemeButton) {
        lightThemeButton.addEventListener('click', () => {
            applyTheme('light');
            showNotification('Light theme applied!', 'success');
        });
    }

    if (darkThemeButton) {
        darkThemeButton.addEventListener('click', () => {
            applyTheme('dark');
            showNotification('Dark theme applied!', 'success');
        });
    }
});

/**
 * Initialize page based on current location
 */
document.addEventListener('DOMContentLoaded', function() {
    const currentPage = window.location.pathname.split('/').pop();
    
    // Initialize based on current page
    switch(currentPage) {
        case 'signup.html':
            const signupForm = document.getElementById('signupForm');
            if (signupForm) {
                signupForm.addEventListener('submit', handleSignup);
            }
            break;
            
        case 'login.html':
            const loginForm = document.getElementById('loginForm');
            if (loginForm) {
                loginForm.addEventListener('submit', handleLogin);
            }
            break;
            
        case 'admin-login.html':
            const adminLoginForm = document.getElementById('adminLoginForm');
            if (adminLoginForm) {
                adminLoginForm.addEventListener('submit', handleAdminLogin);
            }
            break;
            
        case 'dashboard.html':
            checkAuth();
            updateDashboard();
            break;
            
        case 'join.html':
            checkAuth();
            updateJoinPage();
            break;
            
        case 'submit.html':
            checkAuth();
            updateSubmissionPage();
            break;
            
        default:
            // Default initialization for other pages
            break;
    }
    // Normal navigation to login.html — page itself shows the pre-rendered overlay immediately
    document.querySelectorAll('a[href$="login.html"]').forEach(a => {
        a.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = a.getAttribute('href');
        });
    });
});

// ===== GLOBAL EVENT HANDLERS =====

/**
 * Handle escape key to close modals
 */
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        // Close any open modals
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (modal.style.display === 'block') {
                modal.style.display = 'none';
            }
        });
    }
});

/**
 * Handle clicks outside modals to close them
 */
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// Hide/show navbar on scroll for all screens
let lastScrollTop = 0;
window.addEventListener('scroll', function() {
  const header = document.querySelector('.header');
  let st = window.pageYOffset || document.documentElement.scrollTop;
  if (st > lastScrollTop) {
    // Scrolling down
    header.classList.add('hide-on-scroll');
  } else {
    // Scrolling up
    header.classList.remove('hide-on-scroll');
  }
  lastScrollTop = st <= 0 ? 0 : st;
}, false);

// ===== DEMO DATA INITIALIZATION =====

/**
 * Initialize with some demo data for better user experience
 * This runs only once when the application is first loaded
 */
function initializeDemoData() {
    const users = getAllUsers();
    
    // Only initialize if no users exist
    if (users.length === 0) {
        // Add a sample announcement for new users
        const welcomeAnnouncement = {
            id: generateId(),
            title: 'Welcome to Jot Talent Competitions!',
            message: 'Thank you for joining our writing community. We\'re excited to see your creative submissions. The competition is now open for submissions until December 31, 2025.',
            priority: 'normal',
            audience: 'all',
            status: 'sent',
            createdAt: new Date().toISOString(),
            sentAt: new Date().toISOString(),
            createdBy: 'admin@jottalent.com'
        };
        
        saveAnnouncementToHistory(welcomeAnnouncement);
    }
}

// Initialize demo data on first load
initializeDemoData();

// ===== EXPORT FOR GLOBAL ACCESS =====

// Make functions available globally for HTML onclick handlers
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.handleAdminLogin = handleAdminLogin;
window.logout = logout;
window.adminLogout = adminLogout;
window.processPayment = processPayment;
window.handleSubmission = handleSubmission;
window.saveDraft = saveDraft;
window.checkAuth = checkAuth;
window.checkAdminAuth = checkAdminAuth;
window.updateDashboard = updateDashboard;
window.updateJoinPage = updateJoinPage;
window.updateSubmissionPage = updateSubmissionPage;
window.getCurrentUser = getCurrentUser;
window.getCurrentAdmin = getCurrentAdmin;
window.getAllUsers = getAllUsers;
window.getAllSubmissions = getAllSubmissions;
window.getAllSupportTickets = getAllSupportTickets;
window.getUserSubmission = getUserSubmission;
window.saveUserSubmission = saveUserSubmission;
window.getUserData = getUserData;
window.getNotifications = getNotifications;
window.saveNotifications = saveNotifications;
window.addNotification = addNotification;
window.broadcastAnnouncement = broadcastAnnouncement;
window.getTargetAudience = getTargetAudience;
window.getAnnouncementsHistory = getAnnouncementsHistory;
window.saveAnnouncementToHistory = saveAnnouncementToHistory;
window.saveScheduledAnnouncement = saveScheduledAnnouncement;
window.deleteScheduledAnnouncementById = deleteScheduledAnnouncementById;
window.getSupportTickets = getSupportTickets;
window.saveSupportTickets = saveSupportTickets;
window.getRankings = getRankings;
window.getAnnouncementsHistory = getAnnouncementsHistory;
window.saveAnnouncementToHistory = saveAnnouncementToHistory;
window.saveScheduledAnnouncement = saveScheduledAnnouncement;
window.deleteScheduledAnnouncementById = deleteScheduledAnnouncementById;
window.generateId = generateId;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.capitalizeFirst = capitalizeFirst;
window.showNotification = showNotification;
window.convertToCSV = convertToCSV;
window.downloadCSV = downloadCSV;
window.updateNavForPayment = updateNavForPayment;
