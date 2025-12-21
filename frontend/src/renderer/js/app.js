/**
 * APP.JS - Main Application Controller
 * Purpose: Handles global navigation, page transitions, and app state
 */

const App = {
    // Current application state
    state: {
        currentPage: 'login',
        isAuthenticated: false,
        currentUser: null,
        isGuestMode: false
    },

    /**
     * Initialize the application
     * Called when DOM is ready
     */
    async init() {
        console.log('Pathogenius App initializing...');
        
        // Setup event listeners
        this.setupNavigation();
        this.setupTabs();
        this.setupLogout();
        this.setupRegistration();
        
        // Apply theme from saved settings
        this.applyTheme();
        
        // Update login status
        this.updateLoginStatus();
        
        // Start periodic updates
        this.startPeriodicUpdates();
        
        // Check for existing session
        await this.checkExistingSession();
        
        console.log('App initialized');
    },

    /**
     * Apply theme from saved settings
     */
    applyTheme() {
        try {
            const saved = localStorage.getItem('pathogenius_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                const body = document.body;
                if (settings.theme === 'dark') {
                    body.classList.add('dark-mode');
                } else {
                    body.classList.remove('dark-mode');
                }
            }
        } catch (error) {
            console.error('Error applying theme:', error);
        }
    },

    /**
     * Check for existing session on startup
     */
    async checkExistingSession() {
        try {
            if (window.api?.auth?.getSession) {
                const session = await window.api.auth.getSession();
                
                if (session.isAuthenticated && session.user) {
                    console.log('Existing session found:', session.user.displayName);
                    this.setUser(session.user, session.isGuest);
                    this.navigateTo('dashboard');
                    return;
                }
                
                if (session.expired) {
                    console.log('Session expired, requiring re-login');
                }
            }
        } catch (error) {
            console.error('Session check error:', error);
        }
        
        // No valid session, show login
        this.navigateTo('login');
    },

    /**
     * Setup sidebar navigation click handlers
     */
    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                if (target) {
                    this.navigateTo(target);
                }
            });
        });

        // Settings icon button handler
        const settingsIconBtn = document.querySelector('.settings-icon-btn');
        if (settingsIconBtn) {
            settingsIconBtn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                if (target) {
                    this.navigateTo(target);
                }
            });
        }
    },

    /**
     * Setup tab switching for results page
     */
    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.currentTarget.dataset.tab;
                this.switchTab(tabId);
            });
        });
    },

    /**
     * Setup logout button handler
     */
    setupLogout() {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    },

    /**
     * Setup registration link handlers
     */
    setupRegistration() {
        // Show register button from login
        const showRegisterBtn = document.getElementById('show-register-btn');
        if (showRegisterBtn) {
            showRegisterBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showRegister();
            });
        }

        // Back to login from register (bottom link)
        const backToLoginBtn = document.getElementById('back-to-login-btn');
        if (backToLoginBtn) {
            backToLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLogin();
            });
        }

        // Back to login from register (top button)
        const backToLoginTopBtn = document.getElementById('back-to-login-top-btn');
        if (backToLoginTopBtn) {
            backToLoginTopBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLogin();
            });
        }

        // Forgot password link
        const forgotPasswordBtn = document.getElementById('forgot-password-btn');
        if (forgotPasswordBtn) {
            forgotPasswordBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showForgotPasswordModal();
            });
        }

        // Forgot password form
        const forgotPasswordForm = document.getElementById('forgot-password-form');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleForgotPassword();
            });
        }
    },

    /**
     * Show forgot password modal
     */
    showForgotPasswordModal() {
        const modal = document.getElementById('forgot-password-modal');
        const messageEl = document.getElementById('forgot-password-message');
        const emailInput = document.getElementById('forgot-email');
        
        if (modal) modal.classList.remove('hidden');
        if (messageEl) {
            messageEl.classList.add('hidden');
            messageEl.textContent = '';
        }
        if (emailInput) {
            emailInput.value = '';
            emailInput.focus();
        }
    },

    /**
     * Close forgot password modal
     */
    closeForgotPasswordModal() {
        const modal = document.getElementById('forgot-password-modal');
        if (modal) modal.classList.add('hidden');
    },

    /**
     * Handle forgot password form submission
     */
    async handleForgotPassword() {
        const emailInput = document.getElementById('forgot-email');
        const messageEl = document.getElementById('forgot-password-message');
        const submitBtn = document.getElementById('send-recovery-btn');
        
        const emailOrUsername = emailInput?.value.trim();
        
        if (!emailOrUsername) {
            this.showForgotPasswordMessage('Please enter your email or username.', 'error');
            return;
        }
        
        // Disable button during request
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
        }
        
        try {
            // Call API if available
            if (window.api?.auth?.requestPasswordReset) {
                await window.api.auth.requestPasswordReset(emailOrUsername);
            }
            
            // Always show success message (security best practice - don't reveal if email exists)
            this.showForgotPasswordMessage(
                'If an account with that email/username exists, you will receive a password reset link shortly.',
                'success'
            );
            
            // Clear input
            if (emailInput) emailInput.value = '';
            
            // Close modal after a delay
            setTimeout(() => {
                this.closeForgotPasswordModal();
            }, 4000);
            
        } catch (error) {
            console.error('Password reset error:', error);
            this.showForgotPasswordMessage(
                'Unable to process request. Please check your internet connection.',
                'error'
            );
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Recovery Link';
            }
        }
    },

    /**
     * Show message in forgot password modal
     */
    showForgotPasswordMessage(message, type) {
        const messageEl = document.getElementById('forgot-password-message');
        if (messageEl) {
            messageEl.textContent = message;
            messageEl.className = type; // 'success' or 'error'
            messageEl.classList.remove('hidden');
        }
    },

    /**
     * Show registration page
     */
    showRegister() {
        const authContainer = document.getElementById('auth-container');
        const loginView = document.getElementById('page-login');
        const registerView = document.getElementById('page-register');
        
        // Ensure auth container is visible
        if (authContainer) authContainer.classList.remove('hidden');
        if (loginView) loginView.classList.add('hidden');
        if (registerView) registerView.classList.remove('hidden');
        
        if (window.RegisterPage) RegisterPage.init();
    },

    /**
     * Show login page
     */
    showLogin() {
        const authContainer = document.getElementById('auth-container');
        const loginView = document.getElementById('page-login');
        const registerView = document.getElementById('page-register');
        
        // Ensure auth container is visible
        if (authContainer) authContainer.classList.remove('hidden');
        if (loginView) loginView.classList.remove('hidden');
        if (registerView) registerView.classList.add('hidden');
    },

    /**
     * Navigate to a specific page
     * @param {string} pageId - Target page identifier
     */
    navigateTo(pageId) {
        console.log(`Navigating to: ${pageId}`);

        const authContainer = document.getElementById('auth-container');
        const loginPage = document.getElementById('page-login');
        const registerPage = document.getElementById('page-register');
        const appLayout = document.querySelector('.app-layout');

        // Handle login vs main app layout
        if (pageId === 'login') {
            // Show auth container with login, hide main app
            if (authContainer) authContainer.classList.remove('hidden');
            if (loginPage) loginPage.classList.remove('hidden');
            if (registerPage) registerPage.classList.add('hidden');
            if (appLayout) appLayout.classList.add('hidden');
            this.state.isAuthenticated = false;
            
            // Initialize LoginPage controller
            this.initPageController('login');
        } else {
            // Hide auth container, show main app
            if (authContainer) authContainer.classList.add('hidden');
            if (appLayout) appLayout.classList.remove('hidden');
            this.state.isAuthenticated = true;
        }

        // Hide all page views in the main content area
        document.querySelectorAll('#pages-container .page-view').forEach(el => {
            el.classList.add('hidden');
        });

        // Show target page
        const targetPage = document.getElementById(`page-${pageId}`);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            
            // Initialize page controllers if they exist
            this.initPageController(pageId);
        }

        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
        });
        
        const activeNav = document.querySelector(`.nav-item[data-target="${pageId}"]`);
        if (activeNav) {
            activeNav.classList.add('active');
        }

        // Update state
        this.state.currentPage = pageId;
    },

    /**
     * Initialize page-specific controller
     * @param {string} pageId - Page identifier
     */
    initPageController(pageId) {
        switch (pageId) {
            case 'login':
                if (window.LoginPage) LoginPage.init();
                break;
            case 'dashboard':
                if (window.DashboardPage) DashboardPage.init();
                break;
            case 'analysis':
                if (window.AnalysisPage) AnalysisPage.init();
                break;
            case 'results':
                if (window.ResultsPage) ResultsPage.init();
                break;
            case 'database':
                if (window.DatabasePage) DatabasePage.init();
                break;
            case 'settings':
                if (window.SettingsPage) SettingsPage.init();
                this.loadSystemInfo();
                break;
        }
    },

    /**
     * Load system information for settings page
     */
    async loadSystemInfo() {
        try {
            const platformEl = document.getElementById('system-platform');
            const nodeEl = document.getElementById('system-node');
            
            if (window.api?.system) {
                if (platformEl) {
                    const platform = await window.api.system.getPlatform?.() || 'Unknown';
                    platformEl.textContent = platform.charAt(0).toUpperCase() + platform.slice(1);
                }
                if (nodeEl) {
                    const nodeVersion = await window.api.system.getNodeVersion?.() || 'Unknown';
                    nodeEl.textContent = 'v' + nodeVersion;
                }
            }
        } catch (error) {
            console.error('Failed to load system info:', error);
        }
    },

    /**
     * Switch tab on results page
     * @param {string} tabId - Tab identifier
     */
    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = document.getElementById(`tab-${tabId}`);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    },

    /**
     * Handle user logout or guest exit
     */
    async logout() {
        const isGuest = this.state.isGuestMode;
        
        if (isGuest) {
            console.log('Exiting guest mode...');
            // Guest mode: clear session data
            this.clearGuestSessionData();
        } else {
            console.log('Logging out...');
        }
        
        try {
            // Call auth service if available
            if (window.api?.auth?.logout) {
                await window.api.auth.logout();
            }
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Reset state
        this.state.isAuthenticated = false;
        this.state.currentUser = null;
        this.state.isGuestMode = false;
        window.currentUser = null;

        // Hide guest mode warning
        const guestWarning = document.getElementById('guest-mode-warning');
        if (guestWarning) guestWarning.classList.add('hidden');

        // Reset logout button
        this.updateLogoutButton(false);

        // Navigate to login
        this.navigateTo('login');
    },

    /**
     * Clear guest session data (no persistent storage in guest mode)
     */
    clearGuestSessionData() {
        // Remove any session-specific temporary data
        // Guest mode doesn't save history, so we clear any temp data
        const guestKeys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('guest_')) {
                guestKeys.push(key);
            }
        }
        guestKeys.forEach(key => sessionStorage.removeItem(key));
        console.log('Guest session data cleared');
    },

    /**
     * Update logout button for guest vs authenticated user
     */
    updateLogoutButton(isGuest) {
        const logoutBtnText = document.getElementById('logout-btn-text');
        const logoutIcon = document.getElementById('logout-icon');
        const logoutBtn = document.getElementById('logout-btn');
        
        if (logoutBtnText) {
            logoutBtnText.textContent = isGuest ? 'Exit Guest Mode' : 'Logout';
        }
        
        if (logoutBtn) {
            logoutBtn.classList.toggle('guest-exit-btn', isGuest);
        }
        
        if (logoutIcon) {
            if (isGuest) {
                // Exit door icon for guest mode
                logoutIcon.innerHTML = `
                    <path d="M18 6L6 18"></path>
                    <path d="M6 6l12 12"></path>
                `;
            } else {
                // Logout icon
                logoutIcon.innerHTML = `
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                `;
            }
        }
    },

    /**
     * Set current user info (called after successful login)
     * @param {object} user - User object from auth
     * @param {boolean} isGuest - Whether this is a guest session
     */
    setUser(user, isGuest = false) {
        this.state.currentUser = user;
        this.state.isGuestMode = isGuest;
        window.currentUser = user;
        
        // Update UI with user info
        const userName = user.displayName || user.username || 'User';
        const userRole = isGuest ? 'Guest' : (user.role || 'Researcher');
        
        // Update sidebar
        const sidebarName = document.getElementById('sidebar-user-name');
        const sidebarRole = document.getElementById('sidebar-user-role');
        if (sidebarName) sidebarName.textContent = userName;
        if (sidebarRole) sidebarRole.textContent = userRole;
        
        // Update dashboard greeting
        const dashboardName = document.getElementById('dashboard-user-name');
        if (dashboardName) dashboardName.textContent = userName;

        // Handle guest mode UI
        const guestWarning = document.getElementById('guest-mode-warning');
        if (guestWarning) {
            guestWarning.classList.toggle('hidden', !isGuest);
        }

        // Update logout button for guest mode
        this.updateLogoutButton(isGuest);

        // Update connection status
        this.updateConnectionStatus(isGuest);

        // Update sidebar storage
        this.updateSidebarStorage();

        // If guest, show warning about no persistent storage
        if (isGuest) {
            console.log('Guest mode active - session will not be saved');
        }
    },

    /**
     * Update connection status in sidebar
     * @param {boolean} isGuest - Whether user is in guest mode
     */
    async updateConnectionStatus(isGuest) {
        const statusValue = document.querySelector('.status-row .status-value');
        const wifiIcon = statusValue?.querySelector('svg');
        
        if (!statusValue) return;

        if (isGuest) {
            // Guest mode
            statusValue.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Guest Mode
            `;
            return;
        }

        // Check internet connectivity
        try {
            // Try to fetch a small resource with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch('https://www.google.com/favicon.ico', {
                method: 'HEAD',
                cache: 'no-cache',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // If we get here without error, assume connected
            statusValue.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                    <line x1="12" y1="20" x2="12.01" y2="20"></line>
                </svg>
                Online
            `;
        } catch (error) {
            // Not connected
            statusValue.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                    <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
                    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                    <line x1="12" y1="20" x2="12.01" y2="20"></line>
                </svg>
                Offline
            `;
        }
    },

    /**
     * Update login page system status
     */
    async updateLoginStatus() {
        const loginFooter = document.querySelector('.login-footer');
        if (!loginFooter) return;

        try {
            // Check internet connectivity
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            await fetch('https://www.google.com/favicon.ico', {
                method: 'HEAD',
                cache: 'no-cache',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Connected - green dot
            loginFooter.innerHTML = '<span class="status-dot" style="background-color: #10b981;"></span> System Status: Online';
        } catch (error) {
            // Not connected - gray dot
            loginFooter.innerHTML = '<span class="status-dot" style="background-color: #6b7280;"></span> System Status: Offline';
        }
    },

    /**
     * Update sidebar storage display
     */
    async updateSidebarStorage() {
        try {
            const systemStats = await window.api.system.getStats();
            if (systemStats.disk) {
                const freeGB = (systemStats.disk.free / (1024 ** 3)).toFixed(1);
                const storageElement = document.getElementById('sidebar-storage');
                if (storageElement) {
                    storageElement.textContent = `${freeGB} GB Free`;
                }
            }
        } catch (error) {
            console.error('Failed to update sidebar storage:', error);
        }
    },

    /**
     * Start periodic updates for system status
     */
    startPeriodicUpdates() {
        // Update every 3 seconds
        setInterval(() => {
            this.updateLoginStatus();
            this.updateSidebarStorage();
            this.updateConnectionStatus(this.state.isGuestMode);
        }, 10000);
    },

    /**
     * Check if current user is in guest mode
     * @returns {boolean}
     */
    isGuestMode() {
        return this.state.isGuestMode;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // First, load all HTML templates
    if (window.TemplateLoader) {
        await TemplateLoader.init();
    }
    
    // Then initialize the app
    await App.init();
    
    // Hide loading screen with fade effect
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            loadingScreen.remove();
        }, 300);
    }
});

// Export for global access
window.App = App;
