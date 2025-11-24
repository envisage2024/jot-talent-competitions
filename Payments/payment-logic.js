// ===== PAYMENT LOGIC =====

// Get DOM elements
const paymentForm = document.getElementById('payment-form');
const amountTypeSelect = document.getElementById('amount-type');
const amountInput = document.getElementById('amount');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('customerEmail');
const nameInput = document.getElementById('customerName');
const currencySelect = document.getElementById('currency');
const paymentModal = document.getElementById('paymentModal');
const closeModal = document.getElementById('closeModal');
const payFirstRoundBtn = document.getElementById('payFirstRoundBtn');
const joinFirstRoundBtn = document.getElementById('joinFirstRoundBtn');
const resetAllPaymentsBtn = document.getElementById('resetAllPaymentsBtn');
const verificationSection = document.getElementById('verificationSection');
const verifyCodeBtn = document.getElementById('verifyCodeBtn');
const verificationCodeInput = document.getElementById('verificationCode');
const verificationStatus = document.getElementById('verificationStatus');
const paymentStatus = document.getElementById('payment-status');
const logoutLink = document.getElementById('logoutLink');

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', initializePaymentSystem);
paymentForm.addEventListener('submit', handlePaymentSubmit);
amountTypeSelect.addEventListener('change', updateAmount);
closeModal.addEventListener('click', closePaymentModal);
payFirstRoundBtn.addEventListener('click', openPaymentModal);
verifyCodeBtn.addEventListener('click', handleVerifyCode);
resetAllPaymentsBtn.addEventListener('click', resetSimulatedPayments);
logoutLink.addEventListener('click', handleLogout);

// ===== INITIALIZATION =====
function initializePaymentSystem() {
  console.log('Initializing Payment System...');
  
  // Load saved data from localStorage
  loadSavedPaymentData();
  
  // Check authentication status
  checkAuthStatus();
  
  // Load currency preferences
  loadCurrencyPreference();
  
  console.log('Payment System Ready');
}

// ===== MODAL MANAGEMENT =====
function openPaymentModal() {
  paymentModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePaymentModal() {
  paymentModal.style.display = 'none';
  document.body.style.overflow = 'auto';
  resetPaymentForm();
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
  if (event.target === paymentModal) {
    closePaymentModal();
  }
});

// ===== FORM MANAGEMENT =====
function updateAmount() {
  const amount = amountTypeSelect.value;
  amountInput.value = amount;
}

function resetPaymentForm() {
  paymentForm.reset();
  amountInput.value = amountTypeSelect.value;
  paymentStatus.innerHTML = '';
  verificationSection.style.display = 'none';
}

// ===== PAYMENT PROCESSING =====
async function handlePaymentSubmit(event) {
  event.preventDefault();
  
  try {
    // Validate form inputs
    if (!validatePaymentForm()) {
      showPaymentStatus('Please fill in all required fields', 'error');
      return;
    }
    
    // Show processing status
    showPaymentStatus('Processing payment...', 'processing');
    
    // Collect payment data
    const paymentMethod = document.getElementById('payment-method')?.value || 'MobileMoney';
    const paymentData = {
      amount: parseFloat(amountInput.value),
      phone: phoneInput.value,
      email: emailInput.value,
      name: nameInput.value,
      currency: currencySelect.value,
      method: paymentMethod,
      timestamp: new Date().toISOString(),
      roundId: 'first-round',
      status: PAYMENT_STATUS.PROCESSING
    };
    
    // Process payment
    const result = await processPaymentWithRetry(paymentData);
    
    if (result.success) {
      // Save payment to Firebase
      await savePaymentToFirebase(paymentData, result.transactionId);
      
      // Generate and send verification code
      const verificationCode = generateVerificationCode();
      await sendVerificationCode(emailInput.value, verificationCode);
      
      // Save verification code
      saveVerificationCode(emailInput.value, verificationCode);
      
      // Show verification section
      showPaymentStatus('Payment successful! Check your email for verification code.', 'success');
      verificationSection.style.display = 'block';
    } else {
      showPaymentStatus(`Payment failed: ${result.message || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    showPaymentStatus(`Error: ${error.message}`, 'error');
  }
}

// ===== PAYMENT PROCESSING WITH RETRY =====
async function processPaymentWithRetry(paymentData, retryCount = 0) {
  try {
    // Validate payment data
    if (!validatePaymentData(paymentData)) {
      return {
        success: false,
        message: 'Invalid payment data'
      };
    }
    
    // Log the request details for debugging
    console.log('📤 Sending payment request to:', `${SERVER_URL}/process-payment`);
    console.log('📋 Payment data:', paymentData);
    
    // Send payment to server
    const response = await fetch(`${SERVER_URL}/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData),
        timeout: PAYMENT_CONFIG.timeout
      });

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Try to read as text and detect HTML error
      const text = await response.text();
      console.error('❌ Backend Response (Status ' + response.status + '):', text.substring(0, 500));
      if (text.trim().startsWith('<')) {
        throw new Error('Payment API returned HTML instead of JSON. Server Status: ' + response.status + '. Please check the server URL and status.');
      } else {
        throw new Error('Payment API did not return valid JSON. Response: ' + text.substring(0, 200));
      }
    }      if (!response.ok) {
        throw new Error(data && data.message ? data.message : 'Payment processing failed');
      }

      return {
        success: true,
        transactionId: data.transactionId,
        message: 'Payment successful'
      };
  } catch (error) {
    console.error(`Payment processing attempt ${retryCount + 1} failed:`, error);
    
    if (retryCount < PAYMENT_CONFIG.maxRetries) {
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, PAYMENT_CONFIG.retryDelay));
      return processPaymentWithRetry(paymentData, retryCount + 1);
    }
    
    return {
      success: false,
      message: error.message
    };
  }
}

// ===== FORM VALIDATION =====
function validatePaymentForm() {
  const amount = amountInput.value;
  const phone = phoneInput.value;
  const email = emailInput.value;
  const name = nameInput.value;
  
  if (!amount || !phone || !email || !name) {
    return false;
  }
  
  if (!isValidEmail(email)) {
    showPaymentStatus('Please enter a valid email address', 'error');
    return false;
  }
  
  if (!isValidPhone(phone)) {
    showPaymentStatus('Please enter a valid phone number', 'error');
    return false;
  }
  
  return true;
}

function validatePaymentData(data) {
  return (
    data.amount > 0 &&
    data.phone &&
    data.email &&
    data.name &&
    data.currency
  );
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidPhone(phone) {
  // Uganda phone number format: +256 or 0 followed by 9 digits
  const phoneRegex = /^(\+256|0)[0-9]{9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

// ===== VERIFICATION CODE HANDLING =====
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function saveVerificationCode(email, code) {
  const codes = JSON.parse(localStorage.getItem(STORAGE_KEYS.verificationCodes) || '{}');
  codes[email] = {
    code: code,
    timestamp: new Date().getTime()
  };
  localStorage.setItem(STORAGE_KEYS.verificationCodes, JSON.stringify(codes));
}

async function sendVerificationCode(email, code) {
  try {
    // In production, this would call an email service
    // For now, we'll simulate it with console logging
    console.log(`[SIMULATION] Sending verification code ${code} to ${email}`);
    
    // Optional: Send to Firebase function or backend
    // await fetch(`${SERVER_URL}/send-verification`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, code })
    // });
  } catch (error) {
    console.error('Error sending verification code:', error);
  }
}

async function handleVerifyCode() {
  const email = emailInput.value;
  const submittedCode = verificationCodeInput.value;
  
  if (!submittedCode) {
    verificationStatus.innerHTML = '<span style="color: var(--error);">Please enter the verification code</span>';
    return;
  }
  
  try {
    const codes = JSON.parse(localStorage.getItem(STORAGE_KEYS.verificationCodes) || '{}');
    const storedCode = codes[email];
    
    if (!storedCode || storedCode.code !== submittedCode) {
      verificationStatus.innerHTML = '<span style="color: var(--error);">Invalid verification code</span>';
      return;
    }
    
    // Mark user as verified in Firebase
    const userRef = db.collection('users').doc(email);
    await userRef.set({
      email: email,
      name: nameInput.value,
      phone: phoneInput.value,
      verified: true,
      verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
      roundsJoined: ['first-round'],
      paymentStatus: PAYMENT_STATUS.SUCCESS
    }, { merge: true });
    
    // Show success and enable join button
    verificationStatus.innerHTML = '<span style="color: var(--success); font-weight: 600;"><i class="fas fa-check-circle"></i> Email verified successfully!</span>';
    
    // Update UI
    payFirstRoundBtn.style.display = 'none';
    joinFirstRoundBtn.style.display = 'flex';
    joinFirstRoundBtn.disabled = false;
    
    // Close modal after 2 seconds
    setTimeout(() => {
      closePaymentModal();
    }, 2000);
  } catch (error) {
    console.error('Verification error:', error);
    verificationStatus.innerHTML = '<span style="color: var(--error);">Verification failed. Please try again.</span>';
  }
}

// ===== FIREBASE INTEGRATION =====
async function savePaymentToFirebase(paymentData, transactionId) {
  try {
    const paymentRef = db.collection('payments').doc(transactionId);
    await paymentRef.set({
      ...paymentData,
      transactionId: transactionId,
      status: PAYMENT_STATUS.SUCCESS,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Payment saved to Firebase:', transactionId);
  } catch (error) {
    console.error('Error saving payment to Firebase:', error);
    throw error;
  }
}

// ===== UI STATUS FUNCTIONS =====
function showPaymentStatus(message, type = 'info') {
  paymentStatus.innerHTML = message;
  paymentStatus.className = `payment-status payment-${type}`;
}

// ===== AUTHENTICATION =====
function checkAuthStatus() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      console.log('User authenticated:', user.email);
      logoutLink.style.display = 'inline-flex';
    } else {
      console.log('No user authenticated');
      logoutLink.style.display = 'none';
    }
  });
}

async function handleLogout() {
  try {
    await auth.signOut();
    window.location.href = '../login.html';
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// ===== DATA MANAGEMENT =====
function loadSavedPaymentData() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEYS.sessionData);
    if (savedData) {
      const data = JSON.parse(savedData);
      if (data.email) emailInput.value = data.email;
      if (data.name) nameInput.value = data.name;
      if (data.phone) phoneInput.value = data.phone;
    }
  } catch (error) {
    console.error('Error loading saved data:', error);
  }
}

function saveCurrencyPreference() {
  localStorage.setItem('preferred_currency', currencySelect.value);
}

function loadCurrencyPreference() {
  const saved = localStorage.getItem('preferred_currency');
  if (saved) currencySelect.value = saved;
}

function resetSimulatedPayments() {
  if (confirm('Are you sure you want to reset all simulated payments? This cannot be undone.')) {
    localStorage.removeItem(STORAGE_KEYS.userPayments);
    localStorage.removeItem(STORAGE_KEYS.verificationCodes);
    alert('All simulated payments have been reset.');
  }
}

// ===== HELPER UTILITIES =====
function generateTransactionId() {
  return `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

function formatCurrency(amount, currency = 'UGX') {
  const config = PAYMENT_CONFIG.currencies[currency];
  if (!config) return amount;
  
  const converted = amount * config.rate;
  return `${config.symbol}${converted.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

// ===== EXPORT FOR EXTERNAL USE =====
window.PaymentSystem = {
  openModal: openPaymentModal,
  closeModal: closePaymentModal,
  processPayment: handlePaymentSubmit,
  resetForm: resetPaymentForm,
  formatCurrency: formatCurrency,
  config: PAYMENT_CONFIG,
  serverUrl: SERVER_URL
};

console.log('Payment Logic Module Loaded');
