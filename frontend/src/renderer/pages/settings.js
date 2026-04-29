/**
 * SETTINGS.JS - Settings Page Controller
 * Purpose: System configuration, user preferences, AI settings, thresholds
 */

const SettingsPage = {
    isEventsBound: false,

    defaults: {
        localAiEnabled: true,
        confidenceThreshold: 0.7,
        showLowConfidenceResults: false,
        theme: 'light',
        notificationsEnabled: true,
        autoSaveInterval: 5
    },

    settings: {},
    cachedUsers: [], // Holds the last-loaded user list for filtering

    init() {
        if (!this.isEventsBound) {
            this.bindEvents();
            this.isEventsBound = true;
        }

        this.loadSettings();
        this.updateUI();
        this.applyTheme();
        this.initAccountSecuritySection();
        this.initAdminSection();
    },

    bindEvents() {
        const toggleMap = {
            'toggle-local-ai':       'localAiEnabled',
            'toggle-low-confidence': 'showLowConfidenceResults',
            'toggle-notifications':  'notificationsEnabled'
        };

        Object.entries(toggleMap).forEach(([id, key]) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', (e) => {
                this.settings[key] = e.target.checked;
                this.saveSettings();
                this.showSavedNotification();
            });
        });

        const confidenceSelect = document.getElementById('settings-confidence-threshold');
        if (confidenceSelect) {
            confidenceSelect.addEventListener('change', (e) => {
                this.settings.confidenceThreshold = parseFloat(e.target.value);
                this.saveSettings();
                this.showSavedNotification();
            });
        }

        const darkModeToggle = document.getElementById('toggle-dark-mode');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => {
                this.settings.theme = e.target.checked ? 'dark' : 'light';
                this.saveSettings();
                this.applyTheme();
                this.showSavedNotification();
            });
        }

        const resetBtn = document.getElementById('reset-settings-btn');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetToDefaults());

        const exportBtn = document.getElementById('export-settings-btn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportSettings());

        const importBtn = document.getElementById('import-settings-btn');
        if (importBtn) importBtn.addEventListener('click', () => this.importSettings());

        const changePasswordForm = document.getElementById('change-password-form');
        if (changePasswordForm) {
            changePasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleChangePassword();
            });
        }
    },

    /* ─── Settings load / save ─────────────────────────────── */

    loadSettings() {
        try {
            const saved = localStorage.getItem('pathogenius_settings');
            this.settings = saved ? { ...this.defaults, ...JSON.parse(saved) } : { ...this.defaults };
        } catch {
            this.settings = { ...this.defaults };
        }
        // Async: pull from Firebase and override with latest (non-blocking)
        this._loadFirebaseSettings();
    },

    async _loadFirebaseSettings() {
        const isGuest = window.App?.state?.isGuestMode;
        if (isGuest || !window.api?.settings?.load) return;
        try {
            const result = await window.api.settings.load();
            if (result.success && result.settings) {
                this.settings = { ...this.defaults, ...result.settings };
                localStorage.setItem('pathogenius_settings', JSON.stringify(this.settings));
                this.updateUI();
                this.applyTheme();
            }
        } catch (err) {
            console.warn('Firebase settings load failed:', err);
        }
    },

    saveSettings() {
        try {
            localStorage.setItem('pathogenius_settings', JSON.stringify(this.settings));
            window.dispatchEvent(new CustomEvent('settingsChanged', { detail: this.settings }));
            // Sync to Firebase in background — guests skip this
            const isGuest = window.App?.state?.isGuestMode;
            if (!isGuest && window.api?.settings?.save) {
                window.api.settings.save(this.settings)
                    .catch(err => console.warn('Settings sync failed:', err));
            }
        } catch (err) {
            console.error('Failed to save settings:', err);
        }
    },

    /* ─── UI helpers ────────────────────────────────────────── */

    updateUI() {
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = val;
        };
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        set('toggle-local-ai', this.settings.localAiEnabled);
        set('toggle-low-confidence', this.settings.showLowConfidenceResults);
        set('toggle-notifications', this.settings.notificationsEnabled);
        set('toggle-dark-mode', this.settings.theme === 'dark');
        setVal('settings-confidence-threshold', this.settings.confidenceThreshold);
    },

    applyTheme() {
        document.body.classList.toggle('dark-mode', this.settings.theme === 'dark');
    },

    resetToDefaults() {
        if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
        this.settings = { ...this.defaults };
        this.saveSettings();
        this.updateUI();
        this.applyTheme();
        this.showSavedNotification('Settings reset to defaults');
    },

    exportSettings() {
        const blob = new Blob([JSON.stringify(this.settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'pathogenius_settings.json';
        link.click();
        URL.revokeObjectURL(url);
    },

    async importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const imported = JSON.parse(await file.text());
                this.settings = { ...this.defaults, ...imported };
                this.saveSettings();
                this.updateUI();
                this.applyTheme();
                this.showSavedNotification('Settings imported successfully');
            } catch {
                alert('Failed to import settings: Invalid file format');
            }
        };
        input.click();
    },

    showSavedNotification(message = 'Settings saved') {
        const el = document.getElementById('settings-saved-notification');
        if (!el) return;
        el.textContent = message;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 2000);
    },

    get(key) {
        this.loadSettings();
        return this.settings[key] ?? this.defaults[key];
    },

    isLocalAiEnabled() {
        return this.get('localAiEnabled');
    },

    /* ─── Account security ──────────────────────────────────── */

    initAccountSecuritySection() {
        const isGuest = window.App?.isGuestMode?.() || window.App?.state?.isGuestMode;
        const section = document.getElementById('account-security-section');
        if (section) section.classList.toggle('hidden', isGuest);
    },

    async handleChangePassword() {
        const currentPassword = document.getElementById('current-password')?.value;
        const newPassword     = document.getElementById('new-password')?.value;
        const confirmPassword = document.getElementById('confirm-new-password')?.value;
        const submitBtn       = document.getElementById('change-password-btn');

        this.hideChangePasswordMessages();

        if (!currentPassword) { this.showChangePasswordError('Please enter your current password.'); return; }
        if (!newPassword || newPassword.length < 12) { this.showChangePasswordError('New password must be at least 12 characters.'); return; }
        if (newPassword !== confirmPassword) { this.showChangePasswordError('New passwords do not match.'); return; }
        if (currentPassword === newPassword) { this.showChangePasswordError('New password must be different from current password.'); return; }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating...';
        }

        try {
            const result = await window.api.auth.changePassword(currentPassword, newPassword);
            if (!result.success) throw new Error(result.error || 'Password change failed');

            this.showChangePasswordSuccess('Password updated successfully!');
            document.getElementById('current-password').value     = '';
            document.getElementById('new-password').value         = '';
            document.getElementById('confirm-new-password').value = '';
        } catch (error) {
            console.error('Failed to change password:', error);
            this.showChangePasswordError(error.message || 'Failed to change password. Please check your current password.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update Password';
            }
        }
    },

    showChangePasswordError(message) {
        const err = document.getElementById('change-password-error');
        const ok  = document.getElementById('change-password-success');
        if (err) { err.textContent = message; err.classList.remove('hidden'); }
        if (ok)  ok.classList.add('hidden');
    },

    showChangePasswordSuccess(message) {
        const err = document.getElementById('change-password-error');
        const ok  = document.getElementById('change-password-success');
        if (ok) { ok.textContent = message; ok.classList.remove('hidden'); }
        if (err) err.classList.add('hidden');
        setTimeout(() => { if (ok) ok.classList.add('hidden'); }, 5000);
    },

    hideChangePasswordMessages() {
        const err = document.getElementById('change-password-error');
        const ok  = document.getElementById('change-password-success');
        if (err) err.classList.add('hidden');
        if (ok)  ok.classList.add('hidden');
    },

    /* ─── Admin user management ─────────────────────────────── */

    initAdminSection() {
        const currentUser = window.App?.state?.currentUser;
        const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'Admin';
        const section = document.getElementById('admin-user-management');
        if (section) section.classList.toggle('hidden', !isAdmin);
        if (isAdmin) {
            this.loadUserList();
            this.bindAdminEvents();
        }
    },

    bindAdminEvents() {
        const searchInput = document.getElementById('user-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterUsers(e.target.value));
        }
    },

    async loadUserList() {
        const tbody = document.getElementById('user-list-body');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">Loading...</td></tr>`;

        try {
            const result = await window.api.admin.getUsers();
            if (!result.success) throw new Error(result.error);
            this.cachedUsers = result.users || [];
            this.renderUserList(this.cachedUsers);
        } catch (error) {
            console.error('Failed to load users:', error);
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">Failed to load users: ${error.message}</td></tr>`;
        }
    },

    renderUserList(users) {
        const tbody = document.getElementById('user-list-body');
        if (!tbody) return;

        const currentUid = window.App?.state?.currentUser?.uid;

        if (!users || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;">No users found</td></tr>`;
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>
                    <div class="cell-with-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        ${user.username || user.email}
                        ${user.uid === currentUid ? '<span class="you-badge">(You)</span>' : ''}
                    </div>
                </td>
                <td class="text-muted">${user.email || '—'}</td>
                <td>
                    <span class="user-role-badge ${(user.role || 'user').toLowerCase()}">${user.role || 'user'}</span>
                    ${user.status === 'suspended' ? '<span class="user-role-badge" style="background:#FEE2E2;color:#EF4444;margin-left:4px;">Suspended</span>' : ''}
                </td>
                <td class="text-muted">${user.createdAt ? this.formatDate(user.createdAt) : '—'}</td>
                <td>
                    ${user.uid !== currentUid ? `
                        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                            ${user.status === 'suspended'
                                ? `<button class="btn btn-outline btn-sm" onclick="SettingsPage.activateUser('${user.uid}')">Activate</button>`
                                : `<button class="btn btn-outline btn-sm" onclick="SettingsPage.suspendUser('${user.uid}')">Suspend</button>`
                            }
                            <button class="btn btn-outline btn-sm" onclick="SettingsPage.sendPasswordReset('${user.uid}', '${user.email}')">
                                Reset Password
                            </button>
                            ${user.role !== 'admin'
                                ? `<button class="btn btn-outline btn-sm" onclick="SettingsPage.makeAdmin('${user.uid}')">Make Admin</button>`
                                : `<button class="btn btn-outline btn-sm" onclick="SettingsPage.removeAdmin('${user.uid}')">Remove Admin</button>`
                            }
                        </div>
                    ` : '<span class="text-muted">—</span>'}
                </td>
            </tr>
        `).join('');
    },

    filterUsers(term) {
        const lower = term.toLowerCase();
        const filtered = (this.cachedUsers || []).filter(u =>
            (u.username || '').toLowerCase().includes(lower) ||
            (u.email || '').toLowerCase().includes(lower)
        );
        this.renderUserList(filtered);
    },

    refreshUserList() {
        this.loadUserList();
    },

    async suspendUser(uid) {
        if (!confirm('Suspend this user? They will not be able to log in.')) return;
        const result = await window.api.admin.suspendUser(uid);
        if (result.success) {
            this.loadUserList();
        } else {
            alert('Failed to suspend user: ' + result.error);
        }
    },

    async activateUser(uid) {
        const result = await window.api.admin.activateUser(uid);
        if (result.success) {
            this.loadUserList();
        } else {
            alert('Failed to activate user: ' + result.error);
        }
    },

    async sendPasswordReset(uid, email) {
        if (!confirm(`Send a password reset email to "${email}"?\n\nThey will receive a link to set a new password.`)) return;
        const result = await window.api.admin.sendPasswordReset(email);
        if (result.success) {
            alert(`Password reset email sent to ${email}.`);
        } else {
            alert('Failed to send reset email: ' + result.error);
        }
    },

    async makeAdmin(uid) {
        if (!confirm('Grant admin role to this user? They will have access to user management.')) return;
        const result = await window.api.admin.updateUserRole(uid, 'admin');
        if (result.success) {
            this.loadUserList();
        } else {
            alert('Failed to update role: ' + result.error);
        }
    },

    async removeAdmin(uid) {
        if (!confirm('Remove admin role from this user?')) return;
        const result = await window.api.admin.updateUserRole(uid, 'user');
        if (result.success) {
            this.loadUserList();
        } else {
            alert('Failed to update role: ' + result.error);
        }
    },

    // Legacy modal methods kept so existing HTML onclick attributes still resolve
    openResetPasswordModal(userId, username) {
        const user = this.cachedUsers?.find(u => u.uid === userId);
        const email = user?.email || '';
        this.sendPasswordReset(userId, email);
    },

    closeResetPasswordModal() {
        const modal = document.getElementById('reset-password-modal');
        if (modal) modal.classList.add('hidden');
    },

    async submitPasswordReset() {
        this.closeResetPasswordModal();
    },

    showResetError(message) {
        const el = document.getElementById('reset-password-error');
        if (el) { el.textContent = message; el.classList.remove('hidden'); }
    },

    formatDate(dateStr) {
        return Utils.formatDate(dateStr);
    }
};

window.SettingsPage = SettingsPage;
