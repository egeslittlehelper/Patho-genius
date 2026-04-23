/**
 * DATABASE.JS - Database Management Controller
 * Purpose: Create named CLARK reference databases with optional Jetson Nano sync
 */

const DatabasePage = {
    // State
    databaseInfo: null,
    databases: [],
    isEventsBound: false,

    // Create wizard state
    selectedGenomesPath: null,
    selectedMappingFile: null,

    /**
     * Initialize database page
     */
    init() {
        console.log('DatabasePage initializing...');

        if (!this.isEventsBound) {
            this.bindEvents();
            this.isEventsBound = true;
        }

        this.loadDatabaseInfo();
        this.loadDatabases();
        this.resetCreateWizard();
        console.log('DatabasePage initialized');
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Select genomes folder
        document.addEventListener('click', (e) => {
            if (e.target.closest('#select-genomes-btn')) this.selectGenomesFolder();
            if (e.target.closest('#select-mapping-btn')) this.selectMappingFile();
            if (e.target.closest('#create-db-next-btn')) this.showStep2();
            if (e.target.closest('#create-db-back-btn')) this.showStep1();
            if (e.target.closest('#build-db-btn')) this.buildDatabase();
        });
    },

    /**
     * Load default DB info
     */
    async loadDatabaseInfo() {
        try {
            if (window.api?.database?.getInfo) {
                this.databaseInfo = await window.api.database.getInfo();
                this.updateDefaultDbDisplay();
            }
        } catch (error) {
            console.error('Failed to load database info:', error);
        }
    },

    /**
     * Update default DB stats display
     */
    updateDefaultDbDisplay() {
        if (!this.databaseInfo?.defaultDb) return;
        const db = this.databaseInfo.defaultDb;
        const genomesEl = document.getElementById('default-db-genomes');
        const indexEl = document.getElementById('default-db-index');
        if (genomesEl) genomesEl.textContent = db.genomeCount > 0 ? db.genomeCount.toLocaleString() : '—';
        if (indexEl) indexEl.textContent = db.isBuilt ? 'Indexed ✅' : 'Not built';
    },

    /**
     * Load all named databases
     */
    async loadDatabases() {
        try {
            if (window.api?.database?.list) {
                this.databases = await window.api.database.list();
            }
        } catch (error) {
            console.error('Failed to load databases:', error);
            this.databases = [];
        }
        this.renderDatabases();
    },

    /**
     * Render the list of named databases
     */
    renderDatabases() {
        const container = document.getElementById('databases-list');
        if (!container) return;

        if (this.databases.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p class="text-muted">No custom reference databases created yet.</p>
                    <p class="text-muted" style="font-size: 0.8125rem;">Use the form above to create your first database.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.databases.map(db => `
            <div class="db-list-entry" data-id="${db.id}">
                <div class="db-list-info">
                    <div class="db-list-name-row">
                        <span class="db-list-name">${db.name}</span>
                        ${db.isActive ? '<span class="status-badge status-active" style="font-size: 0.7rem; padding: 2px 8px;">Active</span>' : ''}
                        ${db.isBuilt ? '<span class="status-badge status-completed" style="font-size: 0.7rem; padding: 2px 8px;">Built</span>' : '<span class="status-badge status-failed" style="font-size: 0.7rem; padding: 2px 8px;">Not Built</span>'}
                        ${db.syncedToJetson ? '<span class="status-badge status-running" style="font-size: 0.7rem; padding: 2px 8px;">⚡ Jetson</span>' : ''}
                    </div>
                    <span class="db-list-meta">
                        ${db.genomeCount || 0} genomes • Created ${this.formatDate(db.createdAt)}
                        ${db.syncToJetson && !db.syncedToJetson ? ' • ⚠️ Jetson sync pending' : ''}
                    </span>
                </div>
                <div class="db-list-actions">
                    <button class="species-action-btn btn-remove" onclick="DatabasePage.deleteDatabase('${db.id}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Delete a named database
     */
    async deleteDatabase(id) {
        const db = this.databases.find(d => d.id === id);
        if (!db) return;
        if (!confirm(`Delete database "${db.name}"? This cannot be undone.`)) return;

        try {
            if (window.api?.database?.remove) {
                await window.api.database.remove(id);
            }
            await this.loadDatabases();
        } catch (error) {
            console.error('Failed to delete database:', error);
            alert('Failed to delete database');
        }
    },

    // ─── Create Wizard ──────────────────────────────────────────────

    /**
     * Select genomes folder
     */
    async selectGenomesFolder() {
        try {
            if (window.api?.files?.selectFolder) {
                const folder = await window.api.files.selectFolder();
                if (folder) {
                    this.selectedGenomesPath = folder;
                    const el = document.getElementById('genomes-folder-path');
                    if (el) el.textContent = folder;
                    this.updateNextButton();
                }
            }
        } catch (error) {
            console.error('Failed to select genomes folder:', error);
        }
    },

    /**
     * Select mapping file
     */
    async selectMappingFile() {
        try {
            if (window.api?.files?.selectMappingFile) {
                const file = await window.api.files.selectMappingFile();
                if (file) {
                    this.selectedMappingFile = file;
                    const el = document.getElementById('mapping-file-path');
                    if (el) el.textContent = file;
                    this.updateNextButton();
                }
            }
        } catch (error) {
            console.error('Failed to select mapping file:', error);
        }
    },

    /**
     * Enable/disable the Next button based on selections
     */
    updateNextButton() {
        const btn = document.getElementById('create-db-next-btn');
        if (btn) {
            btn.disabled = !(this.selectedGenomesPath && this.selectedMappingFile);
        }
    },

    /**
     * Show step 2 (name + Jetson toggle)
     */
    showStep2() {
        const step1 = document.getElementById('create-db-step1');
        const step2 = document.getElementById('create-db-step2');
        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.remove('hidden');

        // Auto-generate a default name from the folder
        const nameInput = document.getElementById('db-name-input');
        if (nameInput && !nameInput.value) {
            const folderName = this.selectedGenomesPath.split(/[\\/]/).pop();
            nameInput.value = folderName || 'Custom_Database';
        }
    },

    /**
     * Show step 1 (file selection)
     */
    showStep1() {
        const step1 = document.getElementById('create-db-step1');
        const step2 = document.getElementById('create-db-step2');
        if (step1) step1.classList.remove('hidden');
        if (step2) step2.classList.add('hidden');
    },

    /**
     * Build the database
     */
    async buildDatabase() {
        const nameInput = document.getElementById('db-name-input');
        const name = nameInput?.value?.trim();
        if (!name) {
            alert('Please enter a database name');
            return;
        }

        const syncToggle = document.getElementById('jetson-sync-toggle');
        const syncToJetson = syncToggle?.checked || false;

        // Show building indicator
        const step2 = document.getElementById('create-db-step2');
        const building = document.getElementById('create-db-building');
        if (step2) step2.classList.add('hidden');
        if (building) building.classList.remove('hidden');

        try {
            const config = {
                name,
                genomesPath: this.selectedGenomesPath,
                mappingFile: this.selectedMappingFile,
                syncToJetson,
            };

            console.log('Creating database:', config);
            const result = await window.api.database.create(config);

            if (result.success) {
                alert(`Database "${name}" created successfully!${syncToJetson ? ' Synced to Jetson Nano.' : ''}`);
                this.resetCreateWizard();
                await this.loadDatabases();
                await this.loadDatabaseInfo();
            } else {
                alert('Build failed: ' + (result.error || 'Unknown error'));
                if (step2) step2.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Build error:', error);
            alert('Failed to build database: ' + error.message);
            if (step2) step2.classList.remove('hidden');
        } finally {
            if (building) building.classList.add('hidden');
        }
    },

    /**
     * Reset the create wizard to step 1
     */
    resetCreateWizard() {
        this.selectedGenomesPath = null;
        this.selectedMappingFile = null;

        const genomesEl = document.getElementById('genomes-folder-path');
        const mappingEl = document.getElementById('mapping-file-path');
        const nameInput = document.getElementById('db-name-input');
        const syncToggle = document.getElementById('jetson-sync-toggle');

        if (genomesEl) genomesEl.textContent = 'No folder selected';
        if (mappingEl) mappingEl.textContent = 'No file selected';
        if (nameInput) nameInput.value = '';
        if (syncToggle) syncToggle.checked = false;

        this.showStep1();
        this.updateNextButton();
    },

    /**
     * Format date
     */
    formatDate(dateStr) {
        if (!dateStr) return '—';
        try {
            return Utils.formatDate(dateStr);
        } catch {
            return new Date(dateStr).toLocaleDateString();
        }
    }
};

window.DatabasePage = DatabasePage;
