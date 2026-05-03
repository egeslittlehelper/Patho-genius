/**
 * REGISTER.JS - Registration Page Controller
 * Firebase email verification is LINK-BASED (not a code).
 * After register: show "check your email" screen.
 * User clicks link in email, then comes back and clicks "I've Verified".
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
    pendingEmail: null,
    pendingPassword: null,
    isEventsBound: false,

    init() {
        this.cacheElements();
        if (!this.isEventsBound) {
            this.bindEvents();
            this.isEventsBound = true;
        }
        this.reset();
    },

    reset() {
        this.isLoading = false;
        this.pendingEmail    = null;
        this.pendingPassword = null;
        this.clearError();
        if (this.elements.form) {
            this.elements.form.reset();
            this.elements.form.classList.remove('hidden');
        }
        if (this.elements.registerBtn) {
            this.elements.registerBtn.disabled = false;
            this.elements.registerBtn.textContent = 'Create Account';
        }
        const verif = document.getElementById('email-verification-section');
        if (verif) verif.classList.add('hidden');
        const verifyUI = document.getElementById('verify-link-ui');
        if (verifyUI) verifyUI.remove();
        const strengthEl = document.getElementById('password-strength');
        if (strengthEl) strengthEl.innerHTML = '';
    },

    cacheElements() {
        this.elements = {
            form:                  document.getElementById('register-form'),
            usernameInput:         document.getElementById('register-username'),
            emailInput:            document.getElementById('register-email'),
            passwordInput:         document.getElementById('register-password'),
            confirmPasswordInput:  document.getElementById('register-confirm-password'),
            displayNameInput:      document.getElementById('register-display-name'),
            institutionInput:      document.getElementById('register-institution'),
            registerBtn:           document.getElementById('register-btn'),
            backToLoginBtn:        document.getElementById('back-to-login-btn'),
            errorMessage:          document.getElementById('register-error'),
            verificationSection:   document.getElementById('email-verification-section')
        };
    },

    bindEvents() {
        const { form, backToLoginBtn } = this.elements;

        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleRegister(); });
        if (backToLoginBtn) backToLoginBtn.addEventListener('click', (e) => { e.preventDefault(); this.showLogin(); });

        if (this.elements.passwordInput) {
            this.elements.passwordInput.addEventListener('input', (e) => this.updatePasswordStrength(e.target.value));
        }

        [this.elements.usernameInput, this.elements.emailInput,
         this.elements.passwordInput, this.elements.confirmPasswordInput].forEach(input => {
            if (input) input.addEventListener('input', () => this.clearError());
        });
    },

    validatePassword(password) {
        const errors = [];
        if (password.length < 12)                                                    errors.push('at least 12 characters');
        if (!/[A-Z]/.test(password))                                                 errors.push('one uppercase letter');
        if (!/[0-9]/.test(password))                                                 errors.push('one number');
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))               errors.push('one special character');
        return { isValid: errors.length === 0, errors };
    },

    async handleRegister() {
        if (this.isLoading) return;

        const username      = this.elements.usernameInput?.value.trim();
        const email         = this.elements.emailInput?.value.trim();
        const password      = this.elements.passwordInput?.value;
        const confirmPwd    = this.elements.confirmPasswordInput?.value;
        const displayName   = this.elements.displayNameInput?.value.trim();
        const institution   = this.elements.institutionInput?.value.trim();

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

        const pwdCheck = this.validatePassword(password);
        if (!pwdCheck.isValid) {
            this.showError(`Password must contain ${pwdCheck.errors.join(', ')}`);
            this.elements.passwordInput?.focus();
            return;
        }

        if (password !== confirmPwd) {
            this.showError('Passwords do not match');
            this.elements.confirmPasswordInput?.focus();
            return;
        }

        this.setLoading(true);
        this.clearError();

        try {
            const result = await window.api.auth.register({
                username, email, password,
                displayName: displayName || username,
                institution
            });

            if (result.success) {
                this.pendingEmail    = email;
                this.pendingPassword = password;
                this.showEmailVerificationScreen(email);
            } else {
                this.showError(result.error || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError('Registration failed. Please try again.');
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Show the "check your email" screen.
     * Firebase sends a link — user clicks it, then comes back and clicks "I've Verified".
     */
    showEmailVerificationScreen(email) {
        if (this.elements.form) this.elements.form.classList.add('hidden');

        const section = document.getElementById('email-verification-section');
        if (!section) return;

        section.classList.remove('hidden');

        // Display email address
        const emailDisplay = document.getElementById('verification-email');
        if (emailDisplay) emailDisplay.textContent = email;

        // Replace old 6-digit input UI with a simple message + button
        const codeArea = section.querySelector('.verification-code-area, .verification-inputs');
        if (codeArea) codeArea.classList.add('hidden');

        // Inject the simplified verification UI if not already present
        if (!section.querySelector('#verify-link-ui')) {
            const ui = document.createElement('div');
            ui.id = 'verify-link-ui';
            ui.innerHTML = `
                <p style="margin:16px 0 8px;color:var(--text-muted);font-size:0.9rem;">
                    A verification link has been sent to <strong>${esc(email)}</strong>.<br>
                    Click the link in the email, then come back here and click the button below.
                </p>
                <button id="check-verification-btn" class="btn btn-primary" style="margin-top:12px;width:100%;">
                    I've Verified My Email
                </button>
                <button id="resend-verification-btn" class="btn btn-outline" style="margin-top:8px;width:100%;font-size:0.85rem;">
                    Resend Verification Email
                </button>
                <p id="verify-feedback" class="hidden" style="margin-top:8px;font-size:0.85rem;"></p>
            `;
            section.appendChild(ui);

            document.getElementById('check-verification-btn')?.addEventListener('click', () => this.checkVerification());
            document.getElementById('resend-verification-btn')?.addEventListener('click', () => this.resendVerificationEmail());
        }
    },

    async checkVerification() {
        const feedback = document.getElementById('verify-feedback');
        const btn = document.getElementById('check-verification-btn');

        if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }

        try {
            const result = await window.api.auth.checkVerification(this.pendingEmail, this.pendingPassword);

            if (result.verified) {
                if (feedback) {
                    feedback.textContent = 'Email verified! Redirecting to login...';
                    feedback.style.color = 'var(--success)';
                    feedback.classList.remove('hidden');
                }
                setTimeout(() => this.onRegisterSuccess(), 1200);
            } else {
                if (feedback) {
                    feedback.textContent = 'Email not verified yet. Please click the link in your inbox first.';
                    feedback.style.color = 'var(--warning)';
                    feedback.classList.remove('hidden');
                }
                if (btn) { btn.disabled = false; btn.textContent = "I've Verified My Email"; }
            }
        } catch (error) {
            if (feedback) {
                feedback.textContent = 'Could not check verification status. Please try again.';
                feedback.style.color = 'var(--danger)';
                feedback.classList.remove('hidden');
            }
            if (btn) { btn.disabled = false; btn.textContent = "I've Verified My Email"; }
        }
    },

    async resendVerificationEmail() {
        const feedback = document.getElementById('verify-feedback');
        if (!this.pendingEmail) return;

        try {
            await window.api.auth.resendVerification(this.pendingEmail, this.pendingPassword);
            if (feedback) {
                feedback.textContent = 'Verification email resent! Check your inbox.';
                feedback.style.color = 'var(--success)';
                feedback.classList.remove('hidden');
            }
        } catch {
            if (feedback) {
                feedback.textContent = 'Failed to resend. Please try again.';
                feedback.style.color = 'var(--danger)';
                feedback.classList.remove('hidden');
            }
        }
    },

    onRegisterSuccess() {
        if (this.elements.form) this.elements.form.reset();
        this.pendingEmail    = null;
        this.pendingPassword = null;

        const feedback = document.getElementById('verify-feedback');
        if (feedback) {
            feedback.textContent = 'Registration complete! Redirecting to login...';
            feedback.style.color = 'var(--success, #10B981)';
            feedback.classList.remove('hidden');
        }
        setTimeout(() => this.showLogin(), 1200);
    },

    updatePasswordStrength(password) {
        const strengthEl = document.getElementById('password-strength');
        if (!strengthEl) return;

        if (!password) { strengthEl.innerHTML = ''; return; }

        const checks = {
            length:    password.length >= 12,
            uppercase: /[A-Z]/.test(password),
            number:    /[0-9]/.test(password),
            special:   /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
        };

        const passed = Object.values(checks).filter(Boolean).length;
        const allPassed = passed === 4;

        const label = allPassed ? 'Strong' : passed >= 2 ? 'Medium' : 'Weak';
        const color = allPassed ? '#10B981' : passed >= 2 ? '#F59E0B' : '#EF4444';

        const icon = (ok) => ok
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>'
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';

        strengthEl.innerHTML = `
            <div style="margin-top:8px;">
                <span style="color:${color};font-weight:500;font-size:0.8125rem;">Password strength: ${label}</span>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;font-size:0.75rem;color:var(--text-muted);">
                    <span style="display:flex;align-items:center;gap:4px;">${icon(checks.length)} 12+ characters</span>
                    <span style="display:flex;align-items:center;gap:4px;">${icon(checks.uppercase)} Uppercase letter</span>
                    <span style="display:flex;align-items:center;gap:4px;">${icon(checks.number)} Number</span>
                    <span style="display:flex;align-items:center;gap:4px;">${icon(checks.special)} Special character</span>
                </div>
            </div>`;
    },

    isValidEmail(email) {
        return Utils.isValidEmail(email);
    },

    showLogin() {
        if (window.App) {
            App.navigateTo('login');
        } else {
            const loginView    = document.getElementById('page-login');
            const registerView = document.getElementById('page-register');
            if (loginView)    loginView.classList.remove('hidden');
            if (registerView) registerView.classList.add('hidden');
            if (window.LoginPage) LoginPage.init();
        }
    },

    showError(message) {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
            this.elements.errorMessage.classList.remove('hidden');
        }
    },

    clearError() {
        if (this.elements.errorMessage) {
            this.elements.errorMessage.classList.add('hidden');
        }
    },

    setLoading(loading) {
        this.isLoading = loading;
        if (this.elements.registerBtn) {
            this.elements.registerBtn.disabled = loading;
            this.elements.registerBtn.textContent = loading ? 'Creating account...' : 'Create Account';
        }
    }
};

window.RegisterPage = RegisterPage;
