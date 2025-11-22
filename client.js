const paymentForm = document.getElementById('payment-form');
const paymentStatus = document.getElementById('payment-status');
const amountType = document.getElementById('amount-type');
const amountInput = document.getElementById('amount');

// Configuration - Set this to your server's public IP or domain
const SERVER_BASE_URL = window.SERVER_BASE_URL || 'http://localhost:3000';

// Set your early bird deadline here (YYYY-MM-DDTHH:MM:SS format)
const earlyBirdDeadline = new Date('2025-09-09T19:20:00');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBgnkqrg_2clJ77WTonEQFC3gwVrG7HrO4",
    authDomain: "jot-talent-competitions-72b9f.firebaseapp.com",
    databaseURL: "https://jot-talent-competitions-72b9f-default-rtdb.firebaseio.com",
    projectId: "jot-talent-competitions-72b9f",
    storageBucket: "jot-talent-competitions-72b9f.firebasestorage.app",
    messagingSenderId: "25581487736",
    appId: "1:25581487736:web:a3730b66cd4fb7d9ebcf8d",
    measurementId: "G-8NRD37H5YD"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

amountType.addEventListener('change', () => {
    amountInput.value = amountType.value;
});

paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = amountInput.value;
    const phone = document.getElementById('phone').value;
    const email = document.getElementById('email').value;
    const method = 'MobileMoney';
    const competitionId = 'firstRound';

    // Validate input
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        showPaymentStatus('Please select a valid amount.', 'error');
        return;
    }
    if (!phone) {
        showPaymentStatus('Please enter a phone number.', 'error');
        return;
    }
    if (!email || !isValidEmail(email)) {
        showPaymentStatus('Please enter a valid email address.', 'error');
        return;
    }

    showPaymentStatus('Processing payment...', 'processing');

    try {
        const response = await fetch(`${SERVER_BASE_URL}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                amount: Number(amount), 
                method, 
                phone, 
                email,
                competitionId 
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            showPaymentStatus(`Payment failed: ${errorData.message || 'Unknown error.'}`, 'error');
            return;
        }

        const data = await response.json();
        handlePaymentStatus(data, email);
    } catch (error) {
        console.error('Payment error:', error);
        showPaymentStatus(`Connection error: ${error.message}. Please check your internet connection and try again.`, 'error');
    }
});

function handlePaymentStatus(data, email) {
    const status = (data.status || '').toUpperCase();
    if (status === 'SUCCESS' || status === 'SUCCESSFUL') {
        showPaymentStatus(`Payment confirmed. Transaction ID: ${data.transactionId || ''}`, 'success');
        
        // Generate and send verification code
        sendVerificationCode(email, data.transactionId);
        
        // Show verification section
        document.getElementById('verificationSection').style.display = 'block';
        
        // Store payment success in localStorage
        localStorage.setItem('paymentSuccess_firstRound', 'true');
        localStorage.setItem('paymentEmail', email);
        localStorage.setItem('paymentTimestamp', new Date().getTime().toString());
        localStorage.setItem('transactionId', data.transactionId);
        
    } else if (status === 'PENDING') {
        showPaymentStatus('Payment initiated. Please check your phone to approve. Waiting for confirmation...', 'processing');
        if (data.transactionId) pollStatus(data.transactionId, email);
    } else if (status === 'FAILED') {
        showPaymentStatus(`Payment failed: ${data.statusMessage || 'Transaction could not be completed.'}`, 'error');
    } else if (status === 'UNKNOWN') {
        showPaymentStatus(`Payment status unknown. <button id="retry-status">Check Status Again</button>`, 'unknown');
        if (data.transactionId) {
            document.getElementById('retry-status').onclick = () => manualStatusCheck(data.transactionId, email);
        }
    } else {
        showPaymentStatus(`Payment status: ${data.status || 'Unknown'}. Transaction ID: ${data.transactionId || ''}`, 'unknown');
    }
}

function pollStatus(transactionId, email) {
    let pollCount = 0;
    const maxPolls = 24; // Stop after 2 minutes (24 * 5 seconds)
    
    const interval = setInterval(async () => {
        pollCount++;
        if (pollCount > maxPolls) {
            clearInterval(interval);
            showPaymentStatus('Payment confirmation timed out. <button id="retry-status">Check Status Again</button>', 'error');
            document.getElementById('retry-status').onclick = () => manualStatusCheck(transactionId, email);
            return;
        }
        
        try {
            const response = await fetch(`${SERVER_BASE_URL}/payment-status/${transactionId}`);
            if (!response.ok) {
                clearInterval(interval);
                showPaymentStatus('Failed to check payment status.', 'error');
                return;
            }
            
            const data = await response.json();
            const status = (data.status || '').toUpperCase();
            if (status === 'SUCCESS' || status === 'SUCCESSFUL' || status === 'FAILED' || status === 'UNKNOWN') {
                clearInterval(interval);
                handlePaymentStatus(data, email);
            }
        } catch (error) {
            clearInterval(interval);
            showPaymentStatus(`Error checking payment status: ${error.message}`, 'error');
        }
    }, 5000); // Poll every 5 seconds
}

function manualStatusCheck(transactionId, email) {
    showPaymentStatus('Checking payment status...', 'processing');
    
    fetch(`${SERVER_BASE_URL}/payment-status/${transactionId}`)
        .then(response => response.json())
        .then(data => handlePaymentStatus(data, email))
        .catch(error => {
            showPaymentStatus(`Error checking payment status: ${error.message}`, 'error');
        });
}

// Send verification code to email
async function sendVerificationCode(email, transactionId) {
    try {
        const response = await fetch(`${SERVER_BASE_URL}/resend-verification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to send verification code:', errorData);
            // For demo purposes, we'll generate a code locally if the server fails
            generateLocalVerificationCode(email, transactionId);
            return;
        }

        const data = await response.json();
        console.log('Verification code sent:', data);
        alert(`SIMULATION: Verification code sent to ${email}: ${data.code}\nIn production, this would be sent via email.`);
        
    } catch (error) {
        console.error('Error sending verification code:', error);
        // For demo purposes, we'll generate a code locally if the server fails
        generateLocalVerificationCode(email, transactionId);
    }
}

// Fallback function for local verification code generation
function generateLocalVerificationCode(email, transactionId) {
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`Local verification code for ${email}: ${verificationCode}`);
    
    // Store in localStorage for verification
    localStorage.setItem('verificationCode', verificationCode);
    localStorage.setItem('verificationEmail', email);
    localStorage.setItem('verificationTransactionId', transactionId);
    
    alert(`SIMULATION: Verification code for ${email}: ${verificationCode}\nIn production, this would be sent via email.`);
}

// Verify code entered by user
async function verifyCode() {
    const code = document.getElementById('verificationCode').value.trim();
    const email = localStorage.getItem('verificationEmail') || localStorage.getItem('paymentEmail');
    const transactionId = localStorage.getItem('verificationTransactionId') || localStorage.getItem('transactionId');
    
    if (!code || code.length !== 6) {
        showVerificationStatus('Please enter a valid 6-digit code.', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${SERVER_BASE_URL}/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email, 
                verificationCode: code,
                transactionId 
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            showVerificationStatus(errorData.message || 'Verification failed.', 'error');
            return;
        }

        const data = await response.json();
        showVerificationStatus('Email verified successfully! You can now join the competition.', 'success');
        
        // Show join button
        document.getElementById('payFirstRoundBtn').style.display = 'none';
        const joinBtn = document.getElementById('joinFirstRoundBtn');
        joinBtn.style.display = 'block';
        joinBtn.disabled = false;
        
        // Store verification success
        localStorage.setItem('emailVerified_firstRound', 'true');
        
    } catch (error) {
        console.error('Error verifying code:', error);
        // Fallback to local verification if server is unavailable
        verifyCodeLocally(code, email, transactionId);
    }
}

// Fallback function for local verification
function verifyCodeLocally(code, email, transactionId) {
    const storedCode = localStorage.getItem('verificationCode');
    
    if (storedCode === code) {
        showVerificationStatus('Email verified successfully! You can now join the competition.', 'success');
        
        // Show join button
        document.getElementById('payFirstRoundBtn').style.display = 'none';
        const joinBtn = document.getElementById('joinFirstRoundBtn');
        joinBtn.style.display = 'block';
        joinBtn.disabled = false;
        
        // Store verification success
        localStorage.setItem('emailVerified_firstRound', 'true');
        
        // Store verification in Firestore for persistence
        try {
            db.collection('verifications').doc(email).set({
                verified: true,
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                transactionId: transactionId
            });
        } catch (firestoreError) {
            console.error('Error storing verification in Firestore:', firestoreError);
        }
    } else {
        showVerificationStatus('Invalid verification code. Please try again.', 'error');
    }
}

function showPaymentStatus(message, type) {
    paymentStatus.innerHTML = message;
    paymentStatus.className = 'payment-status';
    
    switch (type) {
        case 'success':
            paymentStatus.classList.add('payment-success');
            break;
        case 'error':
            paymentStatus.classList.add('payment-error');
            break;
        case 'processing':
            paymentStatus.classList.add('payment-processing');
            break;
        case 'unknown':
            paymentStatus.classList.add('payment-unknown');
            break;
    }
}

function showVerificationStatus(message, type) {
    const statusElement = document.getElementById('verificationStatus');
    statusElement.textContent = message;
    
    switch (type) {
        case 'success':
            statusElement.style.color = 'var(--success)';
            break;
        case 'error':
            statusElement.style.color = 'var(--error)';
            break;
    }
}

function isValidEmail(email) {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

window.addEventListener('DOMContentLoaded', () => {
    const now = new Date();
    const earlyBirdOption = amountType.querySelector('option[value="9000"]');
    if (now > earlyBirdDeadline) {
        // Disable Early Bird after deadline
        earlyBirdOption.disabled = true;
        amountType.value = "10000";
        amountInput.value = "10000";
    }
    
    // Display server connection status
    checkServerStatus();
    
    // Check if user has already paid and verified
    checkPaymentStatus();
});

// Check if server is reachable
async function checkServerStatus() {
    try {
        const response = await fetch(`${SERVER_BASE_URL}/health`);
        if (response.ok) {
            console.log('Server is online and reachable');
        } else {
            console.warn('Server health check failed');
        }
    } catch (error) {
        console.error('Cannot reach server:', error.message);
    }
}

// Check if user has already paid and verified
async function checkPaymentStatus() {
    const paymentSuccess = localStorage.getItem('paymentSuccess_firstRound') === 'true';
    const emailVerified = localStorage.getItem('emailVerified_firstRound') === 'true';
    const hasJoined = localStorage.getItem('hasJoined_firstRound') === 'true';
    
    if (paymentSuccess) {
        document.getElementById('payFirstRoundBtn').style.display = 'none';
        
        if (emailVerified) {
            document.getElementById('verificationSection').style.display = 'none';
            const joinBtn = document.getElementById('joinFirstRoundBtn');
            joinBtn.style.display = 'block';
            joinBtn.disabled = false;
            
            if (hasJoined) {
                joinBtn.disabled = true;
                joinBtn.textContent = 'Joined';
            }
        } else {
            document.getElementById('verificationSection').style.display = 'block';
        }
    }
}

// Join competition function
function joinCompetition() {
    const joinBtn = document.getElementById('joinFirstRoundBtn');
    joinBtn.disabled = true;
    joinBtn.textContent = 'Joined';
    
    // Store that user has joined this competition
    localStorage.setItem('hasJoined_firstRound', 'true');
    
    // Store join status in Firestore
    const email = localStorage.getItem('paymentEmail');
    if (email) {
        try {
            db.collection('users').doc(email).set({
                competitions: {
                    firstRound: {
                        joined: true,
                        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }
                }
            }, { merge: true });
        } catch (error) {
            console.error('Error storing join status in Firestore:', error);
        }
    }
    
    // Redirect to submit page
    window.location.href = 'submit.html';
}

// Reset payments function
function resetPayments() {
    localStorage.removeItem('paymentSuccess_firstRound');
    localStorage.removeItem('hasJoined_firstRound');
    localStorage.removeItem('paymentTimestamp');
    localStorage.removeItem('verificationEmail');
    localStorage.removeItem('emailVerified_firstRound');
    localStorage.removeItem('transactionId');
    localStorage.removeItem('verificationCode');
    localStorage.removeItem('verificationTransactionId');
    
    document.getElementById('payFirstRoundBtn').style.display = 'block';
    document.getElementById('joinFirstRoundBtn').style.display = 'none';
    document.getElementById('verificationSection').style.display = 'none';
    
    alert('Payment status has been reset. You can simulate a new payment.');
}

// Add event listeners for verification and join buttons
document.addEventListener('DOMContentLoaded', function() {
    // These elements might not exist in all pages, so we check first
    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    const joinFirstRoundBtn = document.getElementById('joinFirstRoundBtn');
    const resetAllPaymentsBtn = document.getElementById('resetAllPaymentsBtn');
    
    if (verifyCodeBtn) {
        verifyCodeBtn.addEventListener('click', verifyCode);
    }
    
    if (joinFirstRoundBtn) {
        joinFirstRoundBtn.addEventListener('click', joinCompetition);
    }
    
    if (resetAllPaymentsBtn) {
        resetAllPaymentsBtn.addEventListener('click', resetPayments);
    }
});