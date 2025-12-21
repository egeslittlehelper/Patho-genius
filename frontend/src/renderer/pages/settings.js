/**
 * SETTINGS.JS - Settings Page Controller
 * Purpose: System configuration, user preferences, AI settings, thresholds
 */

const SettingsPage = {
    isEventsBound: false,
    
    // Default settings
    defaults: {
        localAiEnabled: true,
        confidenceThreshold: 0.7,
        minReadCount: 100,
        showLowConfidenceResults: false,
        encryptLocalData: false,
        theme: 'light',
        notificationsEnabled: true,
        autoSaveInterval: 5
    },
    
    // Current settings
    settings: {},

    /**
     * Initialize settings page
     */
    init() {
        console.log('⚙️ SettingsPage initializing...');
        
        if (!this.isEventsBound) {
            this.bindEvents();
            this.isEventsBound = true;
        }
        
        this.loadSettings();
        this.updateUI();
        this.applyTheme();
        
        // Initialize account security section (hide for guests)
        this.initAccountSecuritySection();
        
        // Initialize admin section if user is admin
        this.initAdminSection();
        
        console.log('SettingsPage initialized');
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // AI Toggle
        const aiToggle = document.getElementById('toggle-local-ai');
        if (aiToggle) {
            aiToggle.addEventListener('change', (e) => {
                this.settings.localAiEnabled = e.target.checked;
                this.saveSettings();
                this.showSavedNotification();
            });
        }

        // Confidence Threshold
        const confidenceSelect = document.getElementById('settings-confidence-threshold');
        if (confidenceSelect) {
            confidenceSelect.addEventListener('change', (e) => {
                this.settings.confidenceThreshold = parseFloat(e.target.value);
                this.saveSettings();
                this.showSavedNotification();
            });
        }

        // Min Read Count
        const minReadInput = document.getElementById('settings-min-read-count');
        if (minReadInput) {
            minReadInput.addEventListener('change', (e) => {
                this.settings.minReadCount = parseInt(e.target.value) || 100;
                this.saveSettings();
                this.showSavedNotification();
            });
        }

        // Show Low Confidence
        const lowConfidenceToggle = document.getElementById('toggle-low-confidence');
        if (lowConfidenceToggle) {
            lowConfidenceToggle.addEventListener('change', (e) => {
                this.settings.showLowConfidenceResults = e.target.checked;
                this.saveSettings();
                this.showSavedNotification();
            });
        }

        // Encryption Toggle
        const encryptToggle = document.getElementById('toggle-encryption');
        if (encryptToggle) {
            encryptToggle.addEventListener('change', (e) => {
                this.settings.encryptLocalData = e.target.checked;
                this.saveSettings();
                this.showSavedNotification();
            });
        }

        // Notifications Toggle
        const notifyToggle = document.getElementById('toggle-notifications');
        if (notifyToggle) {
            notifyToggle.addEventListener('change', (e) => {
                this.settings.notificationsEnabled = e.target.checked;
                this.saveSettings();
                this.showSavedNotification();
            });
        }

        // Dark Mode Toggle
        const darkModeToggle = document.getElementById('toggle-dark-mode');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => {
                this.settings.theme = e.target.checked ? 'dark' : 'light';
                this.saveSettings();
                this.applyTheme();
                this.showSavedNotification();
            });
        }

        // Reset to Defaults button
        const resetBtn = document.getElementById('reset-settings-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetToDefaults());
        }

        // Export Settings button
        const exportBtn = document.getElementById('export-settings-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportSettings());
        }

        // Import Settings button
        const importBtn = document.getElementById('import-settings-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importSettings());
        }

        // Change Password form
        const changePasswordForm = document.getElementById('change-password-form');
        if (changePasswordForm) {
            changePasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleChangePassword();
            });
        }
    },

    /**
     * Load settings from storage
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem('pathogenius_settings');
            if (saved) {
                this.settings = { ...this.defaults, ...JSON.parse(saved) };
            } else {
                this.settings = { ...this.defaults };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.settings = { ...this.defaults };
        }
    },

    /**
     * Save settings to storage
     */
    saveSettings() {
        try {
            localStorage.setItem('pathogenius_settings', JSON.stringify(this.settings));
            
            // Notify other components of settings change
            window.dispatchEvent(new CustomEvent('settingsChanged', { 
                detail: this.settings 
            }));
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    },

    /**
     * Update UI with current settings
     */
    updateUI() {
        // AI Toggle
        const aiToggle = document.getElementById('toggle-local-ai');
        if (aiToggle) aiToggle.checked = this.settings.localAiEnabled;

        // Confidence Threshold
        const confidenceSelect = document.getElementById('settings-confidence-threshold');
        if (confidenceSelect) confidenceSelect.value = this.settings.confidenceThreshold;

        // Min Read Count
        const minReadInput = document.getElementById('settings-min-read-count');
        if (minReadInput) minReadInput.value = this.settings.minReadCount;

        // Show Low Confidence
        const lowConfidenceToggle = document.getElementById('toggle-low-confidence');
        if (lowConfidenceToggle) lowConfidenceToggle.checked = this.settings.showLowConfidenceResults;

        // Encryption Toggle
        const encryptToggle = document.getElementById('toggle-encryption');
        if (encryptToggle) encryptToggle.checked = this.settings.encryptLocalData;

        // Notifications Toggle
        const notifyToggle = document.getElementById('toggle-notifications');
        if (notifyToggle) notifyToggle.checked = this.settings.notificationsEnabled;

        // Dark Mode Toggle
        const darkModeToggle = document.getElementById('toggle-dark-mode');
        if (darkModeToggle) darkModeToggle.checked = this.settings.theme === 'dark';
    },

    /**
     * Apply the current theme
     */
    applyTheme() {
        const body = document.body;
        if (this.settings.theme === 'dark') {
            body.classList.add('dark-mode');
        } else {
            body.classList.remove('dark-mode');
        }
    },

    /**
     * Reset to default settings
     */
    resetToDefaults() {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
            this.settings = { ...this.defaults };
            this.saveSettings();
            this.updateUI();
            this.showSavedNotification('Settings reset to defaults');
        }
    },

    /**
     * Export settings to file
     */
    exportSettings() {
        const dataStr = JSON.stringify(this.settings, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'pathogenius_settings.json';
        link.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Import settings from file
     */
    async importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                this.settings = { ...this.defaults, ...imported };
                this.saveSettings();
                this.updateUI();
                this.showSavedNotification('Settings imported successfully');
            } catch (error) {
                alert('Failed to import settings: Invalid file format');
            }
        };
        
        input.click();
    },

    /**
     * Show saved notification
     */
    showSavedNotification(message = 'Settings saved') {
        const notification = document.getElementById('settings-saved-notification');
        if (notification) {
            notification.textContent = message;
            notification.classList.remove('hidden');
            setTimeout(() => {
                notification.classList.add('hidden');
            }, 2000);
        }
    },

    /**
     * Get a specific setting value
     * @param {string} key - Setting key
     * @returns {any} Setting value
     */
    get(key) {
        this.loadSettings();
        return this.settings[key] ?? this.defaults[key];
    },

    /**
     * Check if local AI is enabled
     * @returns {boolean}
     */
    isLocalAiEnabled() {
        return this.get('localAiEnabled');
    },

    
    // CHANGE PASSWORD

    /**
     * Initialize account security section visibility
     */
    initAccountSecuritySection() {
        const isGuest = window.App?.isGuestMode?.() || window.App?.state?.isGuestMode;
        const accountSection = document.getElementById('account-security-section');
        
        if (accountSection) {
            accountSection.classList.toggle('hidden', isGuest);
        }
    },

    /**
     * Handle change password form submission
     */
    async handleChangePassword() {
        const currentPassword = document.getElementById('current-password')?.value;
        const newPassword = document.getElementById('new-password')?.value;
        const confirmPassword = document.getElementById('confirm-new-password')?.value;
        const submitBtn = document.getElementById('change-password-btn');

        // Clear previous messages
        this.hideChangePasswordMessages();

        // Validate inputs
        if (!currentPassword) {
            this.showChangePasswordError('Please enter your current password.');
            return;
        }

        if (!newPassword || newPassword.length < 6) {
            this.showChangePasswordError('New password must be at least 6 characters.');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showChangePasswordError('New passwords do not match.');
            return;
        }

        if (currentPassword === newPassword) {
            this.showChangePasswordError('New password must be different from current password.');
            return;
        }

        // Disable button during request
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;" class="icon-spin">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M12 6v6l4 2"></path>
                </svg>
                Updating...
            `;
        }

        try {
            // Call API to change password
            if (window.api?.auth?.changePassword) {
                const result = await window.api.auth.changePassword(currentPassword, newPassword);
                if (!result.success) {
                    throw new Error(result.message || 'Password change failed');
                }
            } else {
                // Mock successful change for development
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Show success message
            this.showChangePasswordSuccess('Password updated successfully!');

            // Clear form
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-new-password').value = '';

        } catch (error) {
            console.error('Failed to change password:', error);
            this.showChangePasswordError(error.message || 'Failed to change password. Please check your current password and try again.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    Update Password
                `;
            }
        }
    },

    /**
     * Show error message in change password form
     */
    showChangePasswordError(message) {
        const errorEl = document.getElementById('change-password-error');
        const successEl = document.getElementById('change-password-success');
        
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
        if (successEl) {
            successEl.classList.add('hidden');
        }
    },

    /**
     * Show success message in change password form
     */
    showChangePasswordSuccess(message) {
        const errorEl = document.getElementById('change-password-error');
        const successEl = document.getElementById('change-password-success');
        
        if (successEl) {
            successEl.textContent = message;
            successEl.classList.remove('hidden');
        }
        if (errorEl) {
            errorEl.classList.add('hidden');
        }

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (successEl) successEl.classList.add('hidden');
        }, 5000);
    },

    /**
     * Hide all change password messages
     */
    hideChangePasswordMessages() {
        const errorEl = document.getElementById('change-password-error');
        const successEl = document.getElementById('change-password-success');
        
        if (errorEl) errorEl.classList.add('hidden');
        if (successEl) successEl.classList.add('hidden');
    },

    // ============================================
    // ADMIN USER MANAGEMENT
    // ============================================

    /**
     * Initialize admin user management section
     */
    initAdminSection() {
        const currentUser = window.App?.state?.currentUser || window.currentUser;
        const adminSection = document.getElementById('admin-user-management');
        
        // Only show for admins
        const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'Admin';
        
        if (adminSection) {
            adminSection.classList.toggle('hidden', !isAdmin);
        }
        
        if (isAdmin) {
            this.loadUserList();
            this.bindAdminEvents();
        }
    },

    /**
     * Bind admin-specific events
     */
    bindAdminEvents() {
        // User search
        const searchInput = document.getElementById('user-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterUsers(e.target.value));
        }

        // Reset password form
        const resetForm = document.getElementById('admin-reset-password-form');
        if (resetForm) {
            resetForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitPasswordReset();
            });
        }
    },

    /**
     * Load user list from API or mock data
     */
    async loadUserList() {
        const tbody = document.getElementById('user-list-body');
        if (!tbody) return;

        try {
            let users;
            if (window.api?.admin?.getUsers) {
                users = await window.api.admin.getUsers();
            } else {
                // Mock user data
                users = this.getMockUsers();
            }
            
            this.renderUserList(users);
        } catch (error) {
            console.error('Failed to load users:', error);
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">Failed to load users</td></tr>`;
        }
    },

    /**
     * Render user list
     * @param {array} users - Array of user objects
     */
    renderUserList(users) {
        const tbody = document.getElementById('user-list-body');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">No users found</td></tr>`;
            return;
        }

        const currentUserId = window.App?.state?.currentUser?.id || window.currentUser?.id;

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>
                    <div class="cell-with-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        ${user.username}
                        ${user.id === currentUserId ? '<span class="you-badge">(You)</span>' : ''}
                    </div>
                </td>
                <td class="text-muted">${user.email || '—'}</td>
                <td>
                    <span class="user-role-badge ${user.role.toLowerCase()}">${user.role}</span>
                </td>
                <td class="text-muted">${user.lastLogin ? this.formatDate(user.lastLogin) : 'Never'}</td>
                <td>
                    ${user.id !== currentUserId && user.role !== 'Admin' ? `
                        <button class="btn btn-outline btn-sm" onclick="SettingsPage.openResetPasswordModal('${user.id}', '${user.username}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            Reset Password
                        </button>
                    ` : '<span class="text-muted">—</span>'}
                </td>
            </tr>
        `).join('');
    },

    /**
     * Filter users by search term
     * @param {string} term - Search term
     */
    filterUsers(term) {
        const users = this.getMockUsers();
        const filtered = users.filter(user => 
            user.username.toLowerCase().includes(term.toLowerCase()) ||
            (user.email && user.email.toLowerCase().includes(term.toLowerCase()))
        );
        this.renderUserList(filtered);
    },

    /**
     * Refresh user list
     */
    refreshUserList() {
        this.loadUserList();
    },

    /**
     * Open reset password modal
     * @param {string} userId - User ID
     * @param {string} username - Username for display
     */
    openResetPasswordModal(userId, username) {
        const modal = document.getElementById('reset-password-modal');
        const userIdInput = document.getElementById('reset-user-id');
        const userDisplay = document.getElementById('reset-user-display');
        const errorEl = document.getElementById('reset-password-error');
        
        if (modal) modal.classList.remove('hidden');
        if (userIdInput) userIdInput.value = userId;
        if (userDisplay) userDisplay.textContent = username;
        if (errorEl) errorEl.classList.add('hidden');
        
        // Clear password fields
        const newPassword = document.getElementById('new-temp-password');
        const confirmPassword = document.getElementById('confirm-temp-password');
        if (newPassword) newPassword.value = '';
        if (confirmPassword) confirmPassword.value = '';
        if (newPassword) newPassword.focus();
    },

    /**
     * Close reset password modal
     */
    closeResetPasswordModal() {
        const modal = document.getElementById('reset-password-modal');
        if (modal) modal.classList.add('hidden');
    },

    /**
     * Submit password reset
     */
    async submitPasswordReset() {
        const userId = document.getElementById('reset-user-id')?.value;
        const newPassword = document.getElementById('new-temp-password')?.value;
        const confirmPassword = document.getElementById('confirm-temp-password')?.value;
        const errorEl = document.getElementById('reset-password-error');

        // Validate
        if (!newPassword || newPassword.length < 6) {
            this.showResetError('Password must be at least 6 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showResetError('Passwords do not match');
            return;
        }

        try {
            if (window.api?.admin?.resetUserPassword) {
                await window.api.admin.resetUserPassword(userId, newPassword);
            }
            
            this.closeResetPasswordModal();
            alert('Password has been reset successfully. The user will need to use this new password on their next login.');
            
        } catch (error) {
            console.error('Failed to reset password:', error);
            this.showResetError('Failed to reset password. Please try again.');
        }
    },

    /**
     * Show error in reset password modal
     * @param {string} message - Error message
     */
    showResetError(message) {
        const errorEl = document.getElementById('reset-password-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    },

    /**
     * Format date for display (delegating to Utils)
     * @param {string} dateStr - Date string
     * @returns {string} Formatted date
     */
    formatDate(dateStr) {
        return Utils.formatDate(dateStr);
    },

    /**
     * Get mock users for development
     * @returns {array} Mock user list
     */
    getMockUsers() {
        return [
            {
                id: 'user-001',
                username: 'admin',
                email: 'admin@pathogenius.local',
                role: 'Admin',
                lastLogin: '2025-12-18T09:30:00Z'
            },
            {
                id: 'user-002',
                username: 'dr.smith',
                email: 'smith@hospital.org',
                role: 'Researcher',
                lastLogin: '2025-12-17T14:45:00Z'
            },
            {
                id: 'user-003',
                username: 'lab_tech_1',
                email: 'labtech@pathogenius.local',
                role: 'Researcher',
                lastLogin: '2025-12-16T11:20:00Z'
            },
            {
                id: 'user-004',
                username: 'viewer_account',
                email: 'viewer@example.com',
                role: 'Viewer',
                lastLogin: null
            }
        ];
    }
};

window.SettingsPage = SettingsPage;

