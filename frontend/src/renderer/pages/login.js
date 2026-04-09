const LoginPage = {
    // DOM element references
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

    // State
    isLoading: false,
    isPasswordVisible: false,
    isEventsBound: false,

    /**
     * Initialize login page
     */
    init() {
        // Cache elements first (needed for bindEvents)
        this.cacheElements();
        
        // Only bind events once to prevent duplicate listeners
        if (!this.isEventsBound) {
            this.bindEvents();
            this.isEventsBound = true;
        }
        console.log('LoginPage initialized');
    },

    /**
     * Cache DOM element references
     */
    cacheElements() {
        this.elements = {
            form: document.getElementById('login-form'),
            usernameInput: document.getElementById('username-input'),
            passwordInput: document.getElementById('password-input'),
            loginBtn: document.getElementById('login-btn'),
            guestBtn: document.getElementById('guest-btn'),
            eyeToggle: document.getElementById('eye-toggle'),
            eyeIcon: document.getElementById('eye-icon'),
            errorMessage: document.getElementById('login-error')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const { form, guestBtn, eyeToggle, usernameInput, passwordInput } = this.elements;

        // Form submission
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        // Guest mode
        if (guestBtn) {
            guestBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleGuestLogin();
            });
        }

        // Password visibility toggle
        if (eyeToggle) {
            eyeToggle.addEventListener('click', () => this.togglePassword());
        }

        // Clear error on input
        [usernameInput, passwordInput].forEach(input => {
            if (input) {
                input.addEventListener('input', () => this.clearError());
            }
        });
    },

    /**
     * Handle login form submission
     */
    async handleLogin() {
        if (this.isLoading) return;

        const username = this.elements.usernameInput?.value.trim();
        const password = this.elements.passwordInput?.value;

        // Validate
        if (!username) {
            this.showError('Please enter your username');
            this.elements.usernameInput?.focus();
            return;
        }

        if (!password) {
            this.showError('Please enter your password');
            this.elements.passwordInput?.focus();
            return;
        }

        this.setLoading(true);
        this.clearError();

        try {
            // Call auth API
            if (window.api?.auth?.login) {
                const result = await window.api.auth.login(username, password);
                
                if (result.success) {
                    this.onLoginSuccess(result.user);
                } else {
                    this.showError(result.error || 'Invalid credentials');
                }
            } else {
                // Fallback for development without Electron
                console.warn('Auth API not available, using mock login');
                this.mockLogin(username, password);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Connection error. Please try again.');
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Mock login for development
     */
    mockLogin(username, password) {
        // Simple mock for testing without backend
        const mockUsers = {
            'admin': { password: 'admin123', displayName: 'Administrator', role: 'Admin' },
            'doctor': { password: 'doctor123', displayName: 'Dr. Field Worker', role: 'Researcher' }
        };

        const user = mockUsers[username.toLowerCase()];
        if (user && user.password === password) {
            this.onLoginSuccess({
                username: username,
                displayName: user.displayName,
                role: user.role
            });
        } else {
            this.showError('Invalid username or password');
        }
    },

    /**
     * Handle guest mode login
     */
    async handleGuestLogin() {
        if (this.isLoading) return;

        this.setLoading(true);

        try {
            if (window.api?.auth?.loginAsGuest) {
                const result = await window.api.auth.loginAsGuest();
                if (result.success) {
                    this.onLoginSuccess(result.user, true);
                } else {
                    this.showError(result.error || 'Guest mode unavailable');
                }
            } else {
                // Fallback
                this.onLoginSuccess({
                    username: 'guest',
                    displayName: 'Guest User',
                    role: 'Guest'
                }, true);
            }
        } catch (error) {
            console.error('Guest login error:', error);
            this.showError('Could not enter guest mode');
        } finally {
            this.setLoading(false);
        }
    },

    /**
     * Handle successful login
     */
    onLoginSuccess(user, isGuest = false) {
        console.log('Login successful:', user.displayName, isGuest ? '(Guest Mode)' : '');
        
        // Set user in app with guest flag
        if (window.App) {
            App.setUser(user, isGuest);
            App.navigateTo('dashboard');
        }

        // Clear form
        if (this.elements.usernameInput) this.elements.usernameInput.value = '';
        if (this.elements.passwordInput) this.elements.passwordInput.value = '';
    },

    /**
     * Toggle password visibility
     */
    togglePassword() {
        this.isPasswordVisible = !this.isPasswordVisible;
        
        if (this.elements.passwordInput) {
            this.elements.passwordInput.type = this.isPasswordVisible ? 'text' : 'password';
        }

        if (this.elements.eyeIcon) {
            this.elements.eyeIcon.style.opacity = this.isPasswordVisible ? '0.5' : '1';
        }
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
        
        if (this.elements.loginBtn) {
            this.elements.loginBtn.disabled = loading;
            this.elements.loginBtn.textContent = loading ? 'Signing in...' : 'Login';
        }

        if (this.elements.guestBtn) {
            this.elements.guestBtn.disabled = loading;
        }
    }
};

// Export for global access - initialization is handled by App.js after templates load
window.LoginPage = LoginPage;
