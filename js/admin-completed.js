let completedSubmissions = [];
let currentViewSubmission = null;
let currentEditSubmission = null;

document.addEventListener('DOMContentLoaded', function() {
    checkAdminAuth();
    loadCompletedSubmissions();
    document.getElementById('editReviewForm').addEventListener('submit', handleEditReview);
});

function loadCompletedSubmissions() {
    const submissions = getAllSubmissions();
    completedSubmissions = submissions.filter(sub => sub.status === 'reviewed');
    document.getElementById('completedCount').textContent = completedSubmissions.length;
    if (completedSubmissions.length === 0) {
        document.getElementById('completedSubmissionsList').innerHTML = '';
        document.getElementById('noCompletedSubmissions').style.display = 'block';
    } else {
        document.getElementById('noCompletedSubmissions').style.display = 'none';
        // ...existing code for rendering submissions...
    }
}
// ...existing code for other functions (handleEditReview, filterSubmissions, etc.)...
