/**
 * Payment Security Module for ioTec Integration
 * Implements secure payment verification, polling, webhooks, and validation
 * 
 * Usage:
 * const paymentModule = require('./payment-security-module');
 * await paymentModule.verifyPaymentStatus(transactionId, accessToken);
 */

const crypto = require('crypto');

// =====================================================
// 1. PAYMENT STATUS VERIFICATION WITH RETRY LOGIC
// =====================================================

/**
 * Verify payment status from ioTec with exponential backoff retry
 * Implements timeout and graceful degradation
 * 
 * @param {string} ioTecTransactionId - Transaction ID from ioTec
 * @param {string} accessToken - Bearer token from ioTec
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<Object>} Verification result with status
 */
async function verifyPaymentStatus(ioTecTransactionId, accessToken, maxRetries = 3) {
    const INITIAL_BACKOFF = 1000; // 1 second
    const MAX_BACKOFF = 30000; // 30 seconds
    let retries = 0;
    let backoffMs = INITIAL_BACKOFF;

    while (retries < maxRetries) {
        try {
            console.log(
                `🔍 [VERIFY] Querying ioTec for transaction: ${ioTecTransactionId} ` +
                `(attempt ${retries + 1}/${maxRetries})`
            );

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(
                `https://pay.iotec.io/api/collections/${ioTecTransactionId}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json',
                        'X-Client-Version': '1.0.0'
                    },
                    signal: controller.signal
                }
            );

            clearTimeout(timeoutId);

            // Handle response status
            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                
                // Transaction not found - retry if not last attempt
                if (response.status === 404 && retries < maxRetries - 1) {
                    console.warn(
                        `⏳ [VERIFY] Transaction not yet available (404), ` +
                        `retrying in ${backoffMs}ms...`
                    );
                    await delay(backoffMs);
                    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
                    retries++;
                    continue;
                }

                // Server error - retry if not last attempt
                if (response.status >= 500 && retries < maxRetries - 1) {
                    console.warn(
                        `⚠️ [VERIFY] Server error ${response.status}, ` +
                        `retrying in ${backoffMs}ms...`
                    );
                    await delay(backoffMs);
                    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
                    retries++;
                    continue;
                }

                throw new Error(
                    `ioTec API error ${response.status}: ${errorText.substring(0, 100)}`
                );
            }

            const paymentData = await response.json();
            console.log(`✅ [VERIFY] Payment verified:`, {
                transactionId: ioTecTransactionId,
                status: paymentData.status,
                statusMessage: paymentData.statusMessage
            });

            return {
                success: true,
                data: paymentData,
                verified: true,
                verifiedAt: new Date().toISOString(),
                retries: retries
            };

        } catch (error) {
            const isAborted = error.name === 'AbortError';
            console.error(
                `❌ [VERIFY] Attempt ${retries + 1} failed:`,
                {
                    error: error.message,
                    isTimeout: isAborted,
                    transactionId: ioTecTransactionId
                }
            );

            // Last attempt failed
            if (retries === maxRetries - 1) {
                return {
                    success: false,
                    error: error.message,
                    verified: false,
                    failedAt: new Date().toISOString(),
                    retries: retries + 1
                };
            }

            // Retry with backoff
            console.log(`⏳ [VERIFY] Retrying in ${backoffMs}ms...`);
            await delay(backoffMs);
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
            retries++;
        }
    }

    return {
        success: false,
        error: 'Max retries exceeded',
        verified: false,
        retries: maxRetries
    };
}

// =====================================================
// 2. TRANSACTION ID GENERATION & SECURITY
// =====================================================

/**
 * Generate cryptographically secure transaction ID
 * Format: TXN_TIMESTAMP_RANDOMHEX_CHECKSUM
 * 
 * @returns {string} Unique transaction ID
 */
function generateSecureTransactionId() {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const checksum = crypto
        .createHash('sha256')
        .update(`${timestamp}${random}`)
        .digest('hex')
        .substring(0, 8);
    
    return `TXN_${timestamp}_${random}_${checksum}`;
}

/**
 * Validate transaction ID format and checksum
 * 
 * @param {string} transactionId - Transaction ID to validate
 * @returns {boolean} True if valid
 */
function validateTransactionId(transactionId) {
    const pattern = /^TXN_\d+_[a-f0-9]{16}_[a-f0-9]{8}$/;
    if (!pattern.test(transactionId)) return false;

    try {
        const parts = transactionId.split('_');
        const timestamp = parts[1];
        const random = parts[2];
        const storedChecksum = parts[3];

        const expectedChecksum = crypto
            .createHash('sha256')
            .update(`${timestamp}${random}`)
            .digest('hex')
            .substring(0, 8);

        return expectedChecksum === storedChecksum;
    } catch (error) {
        return false;
    }
}

/**
 * Generate unique request ID for API tracking
 * 
 * @returns {string} Unique request ID
 */
function generateRequestId() {
    return `REQ_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// =====================================================
// 3. INPUT VALIDATION & SANITIZATION
// =====================================================

/**
 * Comprehensive payment input validation
 * 
 * @param {Object} paymentInput - Payment data to validate
 * @returns {Object} Validation result with errors array
 */
function validatePaymentInput(paymentInput) {
    const {
        amount,
        method,
        phone,
        email,
        currency = 'UGX',
        competitionId,
        name
    } = paymentInput;

    const errors = [];
    const warnings = [];

    // Amount validation
    if (!amount) {
        errors.push('Amount is required');
    } else {
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            errors.push('Amount must be a positive number');
        } else if (numAmount > 10000000) {
            errors.push('Amount exceeds maximum limit (10,000,000)');
        } else if (numAmount < 1000) {
            warnings.push('Amount is unusually low, verify with user');
        }
    }

    // Payment method validation
    if (!method) {
        errors.push('Payment method is required');
    } else if (!['MobileMoney', 'Card', 'Bank'].includes(method)) {
        errors.push(`Invalid payment method: ${method}`);
    }

    // Phone validation (required for MobileMoney)
    if (method === 'MobileMoney') {
        if (!phone) {
            errors.push('Phone number required for Mobile Money');
        } else {
            const cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.length < 10 || cleanPhone.length > 15) {
                errors.push('Invalid phone number format');
            }
        }
    }

    // Email validation
    if (!email) {
        errors.push('Email is required');
    } else {
        if (!isValidEmail(email)) {
            errors.push('Invalid email format');
        }
    }

    // Currency validation
    if (!['UGX', 'USD', 'KES', 'TZS'].includes(currency)) {
        errors.push(`Unsupported currency: ${currency}`);
    }

    // Optional fields
    if (name && name.length > 100) {
        errors.push('Name too long (max 100 characters)');
    }

    if (competitionId && competitionId.length > 50) {
        errors.push('Competition ID too long');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        sanitized: {
            amount: Number(amount),
            method,
            phone: phone ? phone.replace(/\D/g, '') : null,
            email: email ? email.toLowerCase().trim() : null,
            currency,
            competitionId,
            name: name ? name.trim() : null
        }
    };
}

/**
 * Validate ioTec API response structure
 * 
 * @param {Object} response - Response from ioTec API
 * @returns {Object} Validation result
 */
function validateIoTecResponse(response) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!response.id && !response.transactionId) {
        errors.push('Missing transaction ID in response');
    }

    if (!response.status) {
        errors.push('Missing status field');
    } else if (!['PENDING', 'SUCCESS', 'FAILED', 'COMPLETED'].includes(response.status)) {
        errors.push(`Invalid status: ${response.status}`);
    }

    if (!response.statusMessage) {
        warnings.push('Missing status message');
    }

    // Optional but recommended
    if (!response.timestamp) {
        warnings.push('Missing timestamp');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate webhook payload
 * 
 * @param {Object} payload - Webhook payload
 * @returns {Object} Validation result
 */
function validateWebhookPayload(payload) {
    const errors = [];

    if (!payload.id) errors.push('Missing transaction ID');
    if (!payload.externalId) errors.push('Missing external ID (transaction ID)');
    if (!payload.status) errors.push('Missing status');
    if (!payload.timestamp) errors.push('Missing timestamp');

    return {
        valid: errors.length === 0,
        errors
    };
}

// =====================================================
// 4. WEBHOOK SECURITY & SIGNATURE VERIFICATION
// =====================================================

/**
 * Generate webhook signature (HMAC-SHA256)
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} secret - Webhook secret
 * @returns {string} Signature hex string
 */
function generateWebhookSignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    return crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');
}

/**
 * Verify webhook signature
 * Supports multiple signature formats (header or computed)
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} signature - Signature from webhook header
 * @param {string} secret - Webhook secret
 * @returns {boolean} True if signature is valid
 */
function verifyWebhookSignature(payload, signature, secret) {
    if (!signature || !secret) {
        console.warn('⚠️ [WEBHOOK] Signature or secret missing');
        return false;
    }

    try {
        const payloadString = JSON.stringify(payload);
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payloadString)
            .digest('hex');

        // Use timing-safe comparison to prevent timing attacks
        const match = crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );

        return match;
    } catch (error) {
        console.error('❌ [WEBHOOK] Signature verification error:', error.message);
        return false;
    }
}

/**
 * Verify webhook origin (IP-based or header-based)
 * 
 * @param {string} clientIp - Client IP from request
 * @param {string} signature - Signature header
 * @param {Array<string>} allowedIps - List of allowed IPs (optional)
 * @returns {boolean} True if origin is allowed
 */
function verifyWebhookOrigin(clientIp, signature, allowedIps = null) {
    // If allowedIps provided, check IP
    if (allowedIps && Array.isArray(allowedIps)) {
        const isAllowed = allowedIps.includes(clientIp);
        if (!isAllowed) {
            console.warn(`⚠️ [WEBHOOK] Unauthorized IP: ${clientIp}`);
        }
        return isAllowed;
    }

    // Otherwise verify signature
    return !!signature;
}

// =====================================================
// 5. IDEMPOTENCY & DUPLICATE DETECTION
// =====================================================

/**
 * Generate idempotency key from payment data
 * 
 * @param {Object} paymentData - Payment information
 * @returns {string} Idempotency key
 */
function generateIdempotencyKey(paymentData) {
    const { phone, email, amount, method, timestamp } = paymentData;
    const key = `${phone}|${email}|${amount}|${method}|${timestamp}`;
    
    return crypto
        .createHash('sha256')
        .update(key)
        .digest('hex');
}

/**
 * Check if payment is duplicate based on idempotency key
 * This should be called against Firestore for actual duplicate detection
 * 
 * @param {string} idempotencyKey - Key to check
 * @param {Object} firestore - Firebase Firestore instance
 * @returns {Promise<Object|null>} Existing payment or null
 */
async function checkIdempotency(idempotencyKey, firestore) {
    if (!firestore) {
        console.warn('⚠️ Firestore not available for idempotency check');
        return null;
    }

    try {
        const doc = await firestore
            .collection('idempotency')
            .doc(idempotencyKey)
            .get();

        if (!doc.exists) {
            return null;
        }

        const data = doc.data();
        
        // Check if key has expired (24 hours)
        const createdTime = new Date(data.createdAt);
        const now = new Date();
        const ageMs = now - createdTime;
        
        if (ageMs > 24 * 60 * 60 * 1000) {
            console.log('🔄 Idempotency key expired');
            return null;
        }

        console.log(`ℹ️ Duplicate detected: ${data.transactionId}`);
        return {
            transactionId: data.transactionId,
            status: data.status,
            isDuplicate: true
        };

    } catch (error) {
        console.error('❌ Idempotency check failed:', error.message);
        return null;
    }
}

/**
 * Store idempotency key in Firestore
 * 
 * @param {string} idempotencyKey - Key to store
 * @param {string} transactionId - Associated transaction ID
 * @param {Object} firestore - Firebase Firestore instance
 * @returns {Promise<void>}
 */
async function storeIdempotencyKey(idempotencyKey, transactionId, firestore) {
    if (!firestore) return;

    try {
        await firestore.collection('idempotency').doc(idempotencyKey).set({
            transactionId,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
        console.log('✅ Idempotency key stored');
    } catch (error) {
        console.error('⚠️ Failed to store idempotency key:', error.message);
    }
}

// =====================================================
// 6. UTILITY FUNCTIONS
// =====================================================

/**
 * Sleep for specified milliseconds
 * 
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate email format
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
function isValidEmail(email) {
    // RFC 5322 simplified regex
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

/**
 * Validate phone number format
 * 
 * @param {string} phone - Phone to validate
 * @returns {boolean} True if appears to be valid phone
 */
function isValidPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Sanitize payment object for logging
 * Removes sensitive information
 * 
 * @param {Object} payment - Payment object
 * @returns {Object} Sanitized payment
 */
function sanitizePaymentForLogging(payment) {
    const sanitized = { ...payment };
    
    // Remove sensitive fields
    delete sanitized.ioTecAccessToken;
    delete sanitized.clientSecret;
    
    // Mask sensitive values
    if (sanitized.phone) {
        sanitized.phone = sanitized.phone.slice(-4).padStart(sanitized.phone.length, '*');
    }
    if (sanitized.email) {
        const [name, domain] = sanitized.email.split('@');
        sanitized.email = name.charAt(0) + '*'.repeat(name.length - 1) + '@' + domain;
    }
    
    return sanitized;
}

/**
 * Convert payment status to user-friendly message
 * 
 * @param {string} status - Payment status
 * @returns {string} User-friendly message
 */
function getStatusMessage(status) {
    const messages = {
        'PENDING': '⏳ Payment is being processed. Please wait...',
        'SUCCESS': '✅ Payment successful! You have been registered.',
        'SUCCESSFUL': '✅ Payment successful! You have been registered.',
        'FAILED': '❌ Payment failed. Please try again.',
        'COMPLETED': '✅ Payment completed! You have been registered.'
    };
    
    return messages[status] || 'Unknown payment status';
}

// =====================================================
// 7. ERROR HANDLING & RECOVERY
// =====================================================

/**
 * Classify payment error for recovery strategy
 * 
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code if available
 * @returns {Object} Error classification and recovery strategy
 */
function classifyPaymentError(error, statusCode) {
    const message = error.message || '';
    const isTimeout = message.includes('timeout') || message.includes('TimeoutError');
    const isNetworkError = message.includes('fetch') || message.includes('network');

    let classification = 'UNKNOWN';
    let recoverable = false;
    let strategy = 'FAIL';

    if (statusCode) {
        if (statusCode >= 500) {
            classification = 'SERVER_ERROR';
            recoverable = true;
            strategy = 'RETRY_EXPONENTIAL';
        } else if (statusCode === 429) {
            classification = 'RATE_LIMITED';
            recoverable = true;
            strategy = 'RETRY_EXPONENTIAL';
        } else if (statusCode === 402) {
            classification = 'INSUFFICIENT_BALANCE';
            recoverable = false;
            strategy = 'FAIL_USER';
        } else if (statusCode === 404) {
            classification = 'NOT_FOUND';
            recoverable = true;
            strategy = 'RETRY_SIMPLE';
        }
    } else if (isTimeout) {
        classification = 'TIMEOUT';
        recoverable = true;
        strategy = 'RETRY_EXPONENTIAL';
    } else if (isNetworkError) {
        classification = 'NETWORK_ERROR';
        recoverable = true;
        strategy = 'RETRY_EXPONENTIAL';
    }

    return {
        classification,
        recoverable,
        strategy,
        shouldNotify: !recoverable
    };
}

// =====================================================
// MODULE EXPORTS
// =====================================================

module.exports = {
    // Verification & Polling
    verifyPaymentStatus,

    // Transaction ID & Request ID
    generateSecureTransactionId,
    validateTransactionId,
    generateRequestId,

    // Input Validation
    validatePaymentInput,
    validateIoTecResponse,
    validateWebhookPayload,
    isValidEmail,
    isValidPhone,

    // Webhook Security
    generateWebhookSignature,
    verifyWebhookSignature,
    verifyWebhookOrigin,

    // Idempotency
    generateIdempotencyKey,
    checkIdempotency,
    storeIdempotencyKey,

    // Utilities
    delay,
    sanitizePaymentForLogging,
    getStatusMessage,
    classifyPaymentError
};
