const LoginPage = {
    elements: {
        form: null,
        usernameInput: null,
        passwordInput: null,
        loginBtn: null,
        guestBtn: null,
        eyeToggle: null,
        eyeIcon: null,
        errorMessage: null
    },

    isLoading: false,
    isPasswordVisible: false,
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
        this.clearError();
        if (this.elements.loginBtn) {
            this.elements.loginBtn.disabled = false;
            this.elements.loginBtn.textContent = 'Login';
        }
        if (this.elements.guestBtn) this.elements.guestBtn.disabled = false;
        requestAnimationFrame(() => {
            this.elements.usernameInput?.focus();
        });
    },

    cacheElements() {
        this.elements = {
            form:          document.getElementById('login-form'),
            usernameInput: document.getElementById('username-input'),
            passwordInput: document.getElementById('password-input'),
            loginBtn:      document.getElementById('login-btn'),
            guestBtn:      document.getElementById('guest-btn'),
            eyeToggle:     document.getElementById('eye-toggle'),
            eyeIcon:       document.getElementById('eye-icon'),
            errorMessage:  document.getElementById('login-error')
        };
    },

    bindEvents() {
        const { form, guestBtn, eyeToggle, usernameInput, passwordInput } = this.elements;

        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.handleLogin(); });
        if (guestBtn) guestBtn.addEventListener('click', (e) => { e.preventDefault(); this.handleGuestLogin(); });
        if (eyeToggle) eyeToggle.addEventListener('click', () => this.togglePassword());

        [usernameInput, passwordInput].forEach(input => {
            if (input) input.addEventListener('input', () => this.clearError());
        });
    },

    async handleLogin() {
        if (this.isLoading) return;

        const username = this.elements.usernameInput?.value.trim();
        const password = this.elements.passwordInput?.value;

        if (!username) { this.showError('Please enter your username'); this.elements.usernameInput?.focus(); return; }
        if (!password) { this.showError('Please enter your password'); this.elements.passwordInput?.focus(); return; }

        this.setLoading(true);
        this.clearError();

        try {
            const result = await window.api.auth.login(username, password);

            if (result.success) {
                this.onLoginSuccess(result.user);
            } else if (result.error === 'email-not-verified') {
                this.showError('Please verify your email before logging in.');
                this._pendingVerificationEmail    = result.email;
                this._pendingVerificationPassword = result.password;
                this._showResendLink();
            } else if (result.error === 'account-suspended') {
                this.showError('Your account has been suspended. Please contact an administrator.');
            } else {
                this.showError(result.error || 'Invalid username or password');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Connection error. Please try again.');
        } finally {
            this.setLoading(false);
        }
    },

    _showResendLink() {
        const err = this.elements.errorMessage;
        if (!err) return;
        // Append a resend link below the error message
        const existing = err.parentElement.querySelector('.resend-link');
        if (existing) existing.remove();
        const link = document.createElement('button');
        link.className = 'btn-link resend-link';
        link.style.cssText = 'margin-top:8px;display:block;font-size:0.85rem;';
        link.textContent = 'Resend verification email';
        link.addEventListener('click', () => this._resendVerification());
        err.parentElement.insertBefore(link, err.nextSibling);
    },

    async _resendVerification() {
        if (!this._pendingVerificationEmail) return;
        try {
            await window.api.auth.resendVerification(
                this._pendingVerificationEmail,
                this._pendingVerificationPassword
            );
            this.showError('Verification email sent! Check your inbox.');
        } catch {
            this.showError('Failed to resend. Please try again.');
        }
    },

    async handleGuestLogin() {
        if (this.isLoading) return;
        this.setLoading(true);
        try {
            const result = await window.api.auth.loginAsGuest();
            if (result.success) {
                this.onLoginSuccess(result.user, true);
            } else {
                this.showError(result.error || 'Guest mode unavailable');
            }
        } catch (error) {
            console.error('Guest login error:', error);
            this.showError('Could not enter guest mode');
        } finally {
            this.setLoading(false);
        }
    },

    onLoginSuccess(user, isGuest = false) {
        // Clean up any resend link
        document.querySelector('.resend-link')?.remove();
        this._pendingVerificationEmail    = null;
        this._pendingVerificationPassword = null;

        if (window.App) {
            App.setUser(user, isGuest);
            App.navigateTo('dashboard');
        }

        if (this.elements.usernameInput) this.elements.usernameInput.value = '';
        if (this.elements.passwordInput) this.elements.passwordInput.value = '';
    },

    togglePassword() {
        this.isPasswordVisible = !this.isPasswordVisible;
        if (this.elements.passwordInput) {
            this.elements.passwordInput.type = this.isPasswordVisible ? 'text' : 'password';
        }
        if (this.elements.eyeIcon) {
            this.elements.eyeIcon.style.opacity = this.isPasswordVisible ? '0.5' : '1';
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
        document.querySelector('.resend-link')?.remove();
    },

    setLoading(loading) {
        this.isLoading = loading;
        if (this.elements.loginBtn) {
            this.elements.loginBtn.disabled = loading;
            this.elements.loginBtn.textContent = loading ? 'Signing in...' : 'Login';
        }
        if (this.elements.guestBtn) this.elements.guestBtn.disabled = loading;
    }
};

window.LoginPage = LoginPage;
