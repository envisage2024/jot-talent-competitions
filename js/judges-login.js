<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Judges Login - Jot Talent Competitions</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- Firebase SDK (modular version) -->
    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
        import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
        import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
        import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
        
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
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const realtimeDb = getDatabase(app);
        
        // Make these available globally for the form handlers
        window.firebaseAuth = auth;
        window.firebaseFirestore = db;
        window.firebaseDatabase = realtimeDb;
        window.firebaseSignIn = signInWithEmailAndPassword;
        window.firebaseOnAuthStateChanged = onAuthStateChanged;
        window.firebaseSignOut = signOut;
        window.firebaseSendPasswordReset = sendPasswordResetEmail;
        window.firebaseGetDoc = getDoc;
        window.firebaseDoc = doc;
        window.firebaseSet = set;
    </script>
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Poppins', sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #e4e7ec 100%);
            color: #333;
            line-height: 1.6;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .auth-main {
            width: 100%;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .auth-container {
            width: 100%;
            max-width: 450px;
        }
        
        .auth-card {
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            padding: 35px;
            text-align: center;
        }
        
        .auth-header {
            margin-bottom: 30px;
        }
        
        .auth-header i {
            font-size: 50px;
            color: #1a2a6c;
            margin-bottom: 15px;
        }
        
        .auth-header h2 {
            font-family: 'Montserrat', sans-serif;
            font-weight: 700;
            color: #1a2a6c;
            margin-bottom: 10px;
        }
        
        .auth-header p {
            color: #666;
            font-size: 14px;
        }
        
        .auth-form {
            text-align: left;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-group label {
            display: block;
            font-weight: 500;
            margin-bottom: 8px;
            color: #444;
        }
        
        .form-group label i {
            margin-right: 8px;
            color: #1a2a6c;
        }
        
        .form-group input {
            width: 100%;
            padding: 14px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        .form-group input:focus {
            border-color: #1a2a6c;
            outline: none;
        }
        
        .auth-button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(to right, #1a2a6c, #b21f1f);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 10px;
        }
        
        .auth-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }
        
        .auth-button i {
            margin-right: 8px;
        }
        
        .auth-footer {
            margin-top: 20px;
            font-size: 14px;
            color: #666;
        }
        
        .auth-footer a {
            color: #1a2a6c;
            text-decoration: none;
            font-weight: 600;
        }
        
        .auth-footer a:hover {
            text-decoration: underline;
        }
        
        #loginError {
            color: #b21f1f;
            background-color: #ffe6e6;
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            text-align: left;
        }
        
        #resetSuccess {
            color: #2a6c1a;
            background-color: #e6ffe6;
            padding: 12px;
            border-radius: 8px;
            margin-top: 20px;
            display: none;
            text-align: left;
        }
        
        .demo-credentials {
            margin-top: 25px;
            padding: 15px;
            background-color: #f5f5f5;
            border-radius: 8px;
            font-size: 14px;
            text-align: left;
        }
        
        .demo-credentials h3 {
            margin-bottom: 10px;
            color: #1a2a6c;
            font-size: 16px;
        }
        
        .demo-credentials p {
            margin-bottom: 5px;
        }
        
        .loading {
            display: none;
            text-align: center;
            margin-top: 20px;
        }
        
        .loading i {
            font-size: 24px;
            color: #1a2a6c;
            animation: spin 1s linear infinite;
        }
        
        .password-toggle {
            position: relative;
        }
        
        .password-toggle i {
            position: absolute;
            right: 15px;
            top: 45px;
            cursor: pointer;
            color: #777;
        }
        
        .reset-password {
            text-align: right;
            margin-top: -10px;
            margin-bottom: 20px;
        }
        
        .reset-password a {
            color: #1a2a6c;
            text-decoration: none;
            font-size: 14px;
        }
        
        .reset-password a:hover {
            text-decoration: underline;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Modal styles */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            align-items: center;
            justify-content: center;
        }
        
        .modal-content {
            background-color: white;
            padding: 25px;
            border-radius: 12px;
            width: 90%;
            max-width: 400px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }
        
        .modal-header {
            margin-bottom: 20px;
        }
        
        .modal-header h3 {
            color: #1a2a6c;
            font-family: 'Montserrat', sans-serif;
        }
        
        .modal-footer {
            margin-top: 20px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        
        .modal-button {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
        }
        
        .modal-button.primary {
            background: linear-gradient(to right, #1a2a6c, #b21f1f);
            color: white;
        }
        
        .modal-button.secondary {
            background-color: #ddd;
            color: #333;
        }
    </style>
</head>
<body>
    <main class="auth-main">
        <div class="auth-container">
            <div class="auth-card">
                <div class="auth-header">
                    <i class="fas fa-user-tie"></i>
                    <h2>Judges Login</h2>
                    <p>Access your judging panel to evaluate performances</p>
                </div>
                
                <form id="judgesLoginForm" class="auth-form">
                    <div class="form-group">
                        <label for="judgeEmail"><i class="fas fa-envelope"></i> Email</label>
                        <input type="email" id="judgeEmail" required placeholder="Enter your email">
                    </div>
                    <div class="form-group password-toggle">
                        <label for="judgePassword"><i class="fas fa-lock"></i> Password</label>
                        <input type="password" id="judgePassword" required placeholder="Enter your password">
                        <i class="fas fa-eye" id="togglePassword"></i>
                    </div>
                    
                    <div class="reset-password">
                        <a href="#" id="forgotPasswordLink">Forgot your password?</a>
                    </div>
                    
                    <button type="submit" class="auth-button">
                        <i class="fas fa-sign-in-alt"></i> Login
                    </button>
                </form>
                
                <div id="loginError">
                    <i class="fas fa-exclamation-circle"></i> 
                    <span id="errorMessage"></span>
                </div>
                
                <div id="resetSuccess">
                    <i class="fas fa-check-circle"></i> 
                    <span id="successMessage"></span>
                </div>
                
                <div class="loading" id="loadingIndicator">
                    <i class="fas fa-spinner"></i>
                    <p>Logging in...</p>
                </div>
                
                <div class="demo-credentials">
                    <h3><i class="fas fa-info-circle"></i> Demo Credentials</h3>
                    <p><strong>Email:</strong> judge@jottalent.com</p>
                    <p><strong>Password:</strong> judge123</p>
                </div>
                
                <div class="auth-footer">
                    <p>Regular user? <a href="login.html">Login here</a></p>
                </div>
            </div>
        </div>
    </main>

    <!-- Password Reset Modal -->
    <div class="modal" id="resetPasswordModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3><i class="fas fa-key"></i> Reset Password</h3>
            </div>
            <div class="form-group">
                <label for="resetEmail">Enter your email address</label>
                <input type="email" id="resetEmail" placeholder="Your registered email">
            </div>
            <div id="resetError" style="color: #b21f1f; display: none; margin-bottom: 15px;">
                <i class="fas fa-exclamation-circle"></i> 
                <span id="resetErrorMessage"></span>
            </div>
            <div class="modal-footer">
                <button class="modal-button secondary" id="cancelReset">Cancel</button>
                <button class="modal-button primary" id="submitReset">Reset Password</button>
            </div>
        </div>
    </div>

    <script>
        // Wait for Firebase to be loaded
        document.addEventListener('DOMContentLoaded', function() {
            // DOM Elements
            const loginForm = document.getElementById('judgesLoginForm');
            const judgeEmail = document.getElementById('judgeEmail');
            const judgePassword = document.getElementById('judgePassword');
            const togglePassword = document.getElementById('togglePassword');
            const loginError = document.getElementById('loginError');
            const errorMessage = document.getElementById('errorMessage');
            const resetSuccess = document.getElementById('resetSuccess');
            const successMessage = document.getElementById('successMessage');
            const loadingIndicator = document.getElementById('loadingIndicator');
            const forgotPasswordLink = document.getElementById('forgotPasswordLink');
            const resetPasswordModal = document.getElementById('resetPasswordModal');
            const resetEmail = document.getElementById('resetEmail');
            const resetError = document.getElementById('resetError');
            const resetErrorMessage = document.getElementById('resetErrorMessage');
            const cancelReset = document.getElementById('cancelReset');
            const submitReset = document.getElementById('submitReset');

            // Check if Firebase is available
            if (typeof window.firebaseAuth === 'undefined') {
                errorMessage.textContent = 'Firebase failed to load. Please check your internet connection.';
                loginError.style.display = 'block';
                return;
            }

            // Toggle password visibility
            togglePassword.addEventListener('click', function() {
                const type = judgePassword.getAttribute('type') === 'password' ? 'text' : 'password';
                judgePassword.setAttribute('type', type);
                this.classList.toggle('fa-eye');
                this.classList.toggle('fa-eye-slash');
            });

            // Judges Login Form Submission
            loginForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const email = judgeEmail.value;
                const password = judgePassword.value;
                
                // Show loading indicator
                loadingIndicator.style.display = 'block';
                loginError.style.display = 'none';
                resetSuccess.style.display = 'none';
                
                try {
                    // Sign in with email and password
                    const userCredential = await window.firebaseSignIn(window.firebaseAuth, email, password);
                    const user = userCredential.user;
                    
                    // Check if user is a judge
                    const judgeDoc = await window.firebaseGetDoc(window.firebaseDoc(window.firebaseFirestore, 'judges', user.uid));
                    
                    if (judgeDoc.exists()) {
                        // User is a judge, log login activity to Firestore
                        const loginData = {
                            judgeId: user.uid,
                            email: user.email,
                            loginTime: new Date(),
                            userAgent: navigator.userAgent
                        };
                        
                        // Update last login in Realtime Database for real-time presence
                        await window.firebaseSet(window.firebaseRef(window.firebaseDatabase, 'judges/' + user.uid + '/lastLogin'), Date.now());
                        
                        // Redirect to pending submissions page
                        window.location.href = 'judges-pending.html';
                    } else {
                        // User is not a judge, sign out and show error
                        await window.firebaseSignOut(window.firebaseAuth);
                        throw new Error('Access restricted to judges only.');
                    }
                } catch (error) {
                    // Hide loading indicator
                    loadingIndicator.style.display = 'none';
                    
                    // Show error message
                    let errorMsg = error.message || 'Failed to login. Please try again.';
                    
                    // User-friendly error messages
                    if (error.code === 'auth/user-not-found') {
                        errorMsg = 'No account found with this email address.';
                    } else if (error.code === 'auth/wrong-password') {
                        errorMsg = 'Incorrect password. Please try again.';
                    } else if (error.code === 'auth/invalid-email') {
                        errorMsg = 'Invalid email address format.';
                    }
                    
                    errorMessage.textContent = errorMsg;
                    loginError.style.display = 'block';
                    
                    // Clear password field for security
                    judgePassword.value = '';
                }
            });

            // Check if user is already logged in
            window.firebaseOnAuthStateChanged(window.firebaseAuth, async (user) => {
                if (user) {
                    try {
                        // Check if the logged-in user is a judge
                        const judgeDoc = await window.firebaseGetDoc(window.firebaseDoc(window.firebaseFirestore, 'judges', user.uid));
                        
                        if (judgeDoc.exists()) {
                            // Redirect to pending submissions page if already logged in
                            window.location.href = 'judges-pending.html';
                        } else {
                            // If user is not a judge, sign them out
                            await window.firebaseSignOut(window.firebaseAuth);
                        }
                    } catch (error) {
                        console.error("Error checking judge status:", error);
                        await window.firebaseSignOut(window.firebaseAuth);
                    }
                }
            });

            // Forgot Password functionality
            forgotPasswordLink.addEventListener('click', function(e) {
                e.preventDefault();
                resetEmail.value = judgeEmail.value; // Pre-fill with entered email
                resetPasswordModal.style.display = 'flex';
                resetError.style.display = 'none';
            });

            // Cancel password reset
            cancelReset.addEventListener('click', function() {
                resetPasswordModal.style.display = 'none';
            });

            // Submit password reset
            submitReset.addEventListener('click', async function() {
                const email = resetEmail.value;
                
                if (!email) {
                    resetErrorMessage.textContent = 'Please enter your email address.';
                    resetError.style.display = 'block';
                    return;
                }
                
                try {
                    await window.firebaseSendPasswordReset(window.firebaseAuth, email);
                    resetPasswordModal.style.display = 'none';
                    successMessage.textContent = 'Password reset email sent! Check your inbox.';
                    resetSuccess.style.display = 'block';
                } catch (error) {
                    let errorMsg = 'Failed to send reset email. Please try again.';
                    
                    if (error.code === 'auth/user-not-found') {
                        errorMsg = 'No account found with this email address.';
                    } else if (error.code === 'auth/invalid-email') {
                        errorMsg = 'Invalid email address format.';
                    }
                    
                    resetErrorMessage.textContent = errorMsg;
                    resetError.style.display = 'block';
                }
            });

            // Close modal when clicking outside
            window.addEventListener('click', function(event) {
                if (event.target === resetPasswordModal) {
                    resetPasswordModal.style.display = 'none';
                }
            });

            // Pre-fill demo credentials for testing (remove in production)
            window.addEventListener('load', function() {
                judgeEmail.value = 'compsjot6@gmail.com';
                judgePassword.value = 'Jotcomps@2025!';
            });
        });
    </script>
<script>
(function(){if(!window.chatbase||window.chatbase("getState")!=="initialized"){window.chatbase=(...arguments)=>{if(!window.chatbase.q){window.chatbase.q=[]}window.chatbase.q.push(arguments)};window.chatbase=new Proxy(window.chatbase,{get(target,prop){if(prop==="q"){return target.q}return(...args)=>target(prop,...args)}})}const onLoad=function(){const script=document.createElement("script");script.src="https://www.chatbase.co/embed.min.js";script.id="c6VJtpfWM1-jfpJmOkkFU";script.domain="www.chatbase.co";document.body.appendChild(script)};if(document.readyState==="complete"){onLoad()}else{window.addEventListener("load",onLoad)}})();
</script> </body>
</html>