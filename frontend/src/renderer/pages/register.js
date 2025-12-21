/**
 * REGISTER.JS - Registration Page Controller
 * Purpose: Handle new user registration with email verification
 */

const RegisterPage = {
    elements: {
        form: null,
        usernameInput: null,
        emailInput: null,
        passwordInput: null,
        confirmPasswordInput: null,
        displayNameInput: null,
        institutionInput: null,
        registerBtn: null,
        backToLoginBtn: null,
        errorMessage: null,
        verificationSection: null
    },

    isLoading: false,
    pendingVerification: null,
    isEventsBound: false,

    /**
     * Initialize registration page
     */
    init() {
        // Cache elements first (needed for bindEvents)
        this.cacheElements();
        
        // Only bind events once to prevent duplicate listeners
        if (!this.isEventsBound) {
            this.bindEvents();
            this.isEventsBound = true;
        }
        console.log('RegisterPage initialized');
    },

    /**
     * Cache DOM element references
     */
    cacheElements() {
        this.elements = {
            form: document.getElementById('register-form'),
            usernameInput: document.getElementById('register-username'),
            emailInput: document.getElementById('register-email'),
            passwordInput: document.getElementById('register-password'),
            confirmPasswordInput: document.getElementById('register-confirm-password'),
            displayNameInput: document.getElementById('register-display-name'),
            institutionInput: document.getElementById('register-institution'),
            registerBtn: document.getElementById('register-btn'),
            backToLoginBtn: document.getElementById('back-to-login-btn'),
            errorMessage: document.getElementById('register-error'),
            verificationSection: document.getElementById('email-verification-section')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const { form, backToLoginBtn } = this.elements;

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        if (backToLoginBtn) {
            backToLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLogin();
            });
        }

        // Password strength indicator
        if (this.elements.passwordInput) {
            this.elements.passwordInput.addEventListener('input', (e) => {
                this.updatePasswordStrength(e.target.value);
            });
        }

        // Clear error on input
        const inputs = [
            this.elements.usernameInput,
            this.elements.emailInput,
            this.elements.passwordInput,
            this.elements.confirmPasswordInput
        ];
        
        inputs.forEach(input => {
            if (input) {
                input.addEventListener('input', () => this.clearError());
            }
        });

        // Setup verification code inputs for better UX
        this.setupVerificationCodeInputs();
    },

    /**
     * Setup verification code inputs for auto-advance and paste handling
     */
    setupVerificationCodeInputs() {
        const codeInputs = document.querySelectorAll('.verification-code-input');
        
        codeInputs.forEach((input, index) => {
            // Auto-advance on input
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                if (value.length === 1 && index < codeInputs.length - 1) {
                    codeInputs[index + 1].focus();
                }
            });

            // Handle backspace
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    codeInputs[index - 1].focus();
                }
            });

            // Handle paste
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text').trim();
                if (/^\d{6}$/.test(pastedData)) {
                    pastedData.split('').forEach((char, i) => {
                        if (codeInputs[i]) {
                            codeInputs[i].value = char;
                        }
                    });
                    codeInputs[5].focus();
                }
            });

            // Only allow numbers
            input.addEventListener('keypress', (e) => {
                if (!/\d/.test(e.key)) {
                    e.preventDefault();
                }
            });
        });
    },

    /**
     * Validate password meets requirements
     * Min 12 characters, at least 1 uppercase, 1 number, 1 special character
     */
    validatePassword(password) {
        const errors = [];
        
        if (password.length < 12) {
            errors.push('at least 12 characters');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('one uppercase letter');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('one number');
        }
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push('one special character');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },

    /**
     * Handle registration form submission
     */
    async handleRegister() {
        if (this.isLoading) return;

        const username = this.elements.usernameInput?.value.trim();
        const email = this.elements.emailInput?.value.trim();
        const password = this.elements.passwordInput?.value;
        const confirmPassword = this.elements.confirmPasswordInput?.value;
        const displayName = this.elements.displayNameInput?.value.trim();
        const institution = this.elements.institutionInput?.value.trim();

        // Validation
        if (!username || username.length < 3) {
            this.showError('Username must be at least 3 characters');
            this.elements.usernameInput?.focus();
            return;
        }

        if (!email || !this.isValidEmail(email)) {
            this.showError('Please enter a valid email address');
            this.elements.emailInput?.focus();
            return;
        }

        // Validate password requirements
        const passwordValidation = this.validatePassword(password);
        if (!passwordValidation.isValid) {
            this.showError(`Password must contain ${passwordValidation.errors.join(', ')}`);
            this.elements.passwordInput?.focus();
            return;
        }

        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            this.elements.confirmPasswordInput?.focus();
            return;
        }

        this.setLoading(true);
        this.clearError();

        try {
            // Call registration API
            if (window.api?.auth?.register) {
                const result = await window.api.auth.register({
                    username,
                    email,
                    password,
                    displayName: displayName || username,
                    institution
                });

                if (result.success) {
                    // Show email verification step
                    this.showEmailVerification(email);
                } else {
                    this.showError(result.error || 'Registration failed');
                }
            } else {
                // Mock registration for development
                console.warn('Auth API not available, using mock registration');
                await this.mockRegister(username, email, password, displayName, institution);
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError('Registration failed. Please try again.');
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Show email verification section
     */
    showEmailVerification(email) {
        this.pendingVerification = email;
        
        // Hide form, show verification section
        if (this.elements.form) {
            this.elements.form.classList.add('hidden');
        }
        
        const verificationSection = document.getElementById('email-verification-section');
        if (verificationSection) {
            verificationSection.classList.remove('hidden');
            const emailDisplay = document.getElementById('verification-email');
            if (emailDisplay) emailDisplay.textContent = email;
        }
    },

    /**
     * Verify email code
     */
    async verifyEmailCode() {
        const codeInputs = document.querySelectorAll('.verification-code-input');
        const code = Array.from(codeInputs).map(input => input.value).join('');
        
        if (code.length !== 6) {
            this.showError('Please enter the complete 6-digit code');
            return;
        }

        this.setLoading(true);
        
        try {
            // TODO: Replace with actual API call
            // For now, mock verification (accept any 6 digits)
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Mock success
            this.onRegisterSuccess({
                username: this.elements.usernameInput?.value,
                email: this.pendingVerification
            });
        } catch (error) {
            this.showError('Invalid verification code. Please try again.');
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Resend verification email
     */
    async resendVerificationEmail() {
        if (!this.pendingVerification) return;
        
        try {
            // TODO: Replace with actual API call
            await new Promise(resolve => setTimeout(resolve, 500));
            
            alert(`Verification email resent to ${this.pendingVerification}`);
        } catch (error) {
            this.showError('Failed to resend verification email');
        }
    },

    /**
     * Mock registration for development
     */
    async mockRegister(username, email, password, displayName, institution) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Check if user already exists (mock)
        const existingUsers = JSON.parse(localStorage.getItem('pathogenius_users') || '[]');
        
        if (existingUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            this.showError('Username already exists');
            return;
        }

        if (existingUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) {
            this.showError('Email already registered');
            return;
        }

        // Create new user
        const newUser = {
            id: Date.now().toString(),
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            displayName: displayName || username,
            institution: institution || '',
            role: 'researcher', // Default role
            password: password, // In production, this would be hashed server-side
            emailVerified: false,
            createdAt: new Date().toISOString()
        };

        // Save to mock storage
        existingUsers.push(newUser);
        localStorage.setItem('pathogenius_users', JSON.stringify(existingUsers));

        // Show email verification
        this.showEmailVerification(email);
    },

    /**
     * Handle successful registration
     */
    onRegisterSuccess(user) {
        console.log('Registration successful:', user.username);
        
        // Clear form
        if (this.elements.form) {
            this.elements.form.reset();
        }

        // Show success message and redirect to login
        alert('Registration successful! Please log in with your credentials.');
        this.showLogin();
    },

    /**
     * Update password strength indicator with requirements checklist
     */
    updatePasswordStrength(password) {
        const strengthEl = document.getElementById('password-strength');
        if (!strengthEl) return;

        if (password.length === 0) {
            strengthEl.innerHTML = '';
            return;
        }

        const checks = {
            length: password.length >= 12,
            uppercase: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
        };

        const allPassed = Object.values(checks).every(v => v);
        const passedCount = Object.values(checks).filter(v => v).length;

        let label, color;
        if (allPassed) {
            label = 'Strong';
            color = '#10B981';
        } else if (passedCount >= 2) {
            label = 'Medium';
            color = '#F59E0B';
        } else {
            label = 'Weak';
            color = '#EF4444';
        }

        const checkIcon = (passed) => passed 
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' 
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';

        strengthEl.innerHTML = `
            <div style="margin-top: 8px;">
                <span style="color: ${color}; font-weight: 500; font-size: 0.8125rem;">Password strength: ${label}</span>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 6px; font-size: 0.75rem; color: var(--text-muted);">
                    <span style="display: flex; align-items: center; gap: 4px;">${checkIcon(checks.length)} 12+ characters</span>
                    <span style="display: flex; align-items: center; gap: 4px;">${checkIcon(checks.uppercase)} Uppercase letter</span>
                    <span style="display: flex; align-items: center; gap: 4px;">${checkIcon(checks.number)} Number</span>
                    <span style="display: flex; align-items: center; gap: 4px;">${checkIcon(checks.special)} Special character</span>
                </div>
            </div>
        `;
    },

    /**
     * Validate email format (delegating to Utils)
     */
    isValidEmail(email) {
        return Utils.isValidEmail(email);
    },

    /**
     * Show login view
     */
    showLogin() {
        const loginView = document.getElementById('page-login');
        const registerView = document.getElementById('page-register');
        
        if (loginView) loginView.classList.remove('hidden');
        if (registerView) registerView.classList.add('hidden');
    },

    /**
     * Show registration view
     */
    showRegister() {
        const loginView = document.getElementById('page-login');
        const registerView = document.getElementById('page-register');
        
        if (loginView) loginView.classList.add('hidden');
        if (registerView) registerView.classList.remove('hidden');
    },

    /**
     * Show error message
     */
    showError(message) {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
            this.elements.errorMessage.classList.remove('hidden');
        }
    },

    /**
     * Clear error message
     */
    clearError() {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.classList.add('hidden');
        }
    },

    /**
     * Set loading state
     */
    setLoading(loading) {
        this.isLoading = loading;
        
        if (this.elements.registerBtn) {
            this.elements.registerBtn.disabled = loading;
            this.elements.registerBtn.textContent = loading ? 'Creating account...' : 'Create Account';
        }
    }
};

// Export for global access - initialization is handled by App.js after templates load
window.RegisterPage = RegisterPage;

