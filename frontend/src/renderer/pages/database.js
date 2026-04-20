/**
 * DATABASE.JS - Database Management Controller
 * Purpose: Manage CLARK reference databases (default + custom genome folders)
 */

const DatabasePage = {
    // Current database info from backend
    databaseInfo: null,
    customSpecies: [],
    isEventsBound: false,

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
        this.loadCustomSpecies();
        console.log('DatabasePage initialized');
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Import / select genome folder
        const importBtn = document.getElementById('import-db-btn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importDatabase());
        }

        // Change custom DB folder
        const changeBtn = document.getElementById('change-db-btn');
        if (changeBtn) {
            changeBtn.addEventListener('click', () => this.importDatabase());
        }

        // Clear custom DB
        const clearBtn = document.getElementById('clear-db-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCustomDatabase());
        }

        // Add individual FASTA
        const addFastaBtn = document.getElementById('add-fasta-btn');
        if (addFastaBtn) {
            addFastaBtn.addEventListener('click', () => this.addFastaFile());
        }

        // Search in custom species
        const speciesSearch = document.getElementById('species-search');
        if (speciesSearch) {
            speciesSearch.addEventListener('input', (e) => this.filterSpecies(e.target.value));
        }
    },

    /**
     * Load database information from backend
     */
    async loadDatabaseInfo() {
        try {
            if (window.api?.database?.getInfo) {
                this.databaseInfo = await window.api.database.getInfo();
                this.updateDisplay();
            }
        } catch (error) {
            console.error('Failed to load database info:', error);
        }
    },

    /**
     * Update display with real database info
     */
    updateDisplay() {
        if (!this.databaseInfo) return;
        const info = this.databaseInfo;

        // --- Default DB section ---
        const statusEl = document.getElementById('default-db-status');
        const statusText = document.getElementById('default-db-status-text');
        const genomesEl = document.getElementById('default-db-genomes');
        const indexEl = document.getElementById('default-db-index');
        const subtitleEl = document.getElementById('default-db-subtitle');

        if (info.defaultDb) {
            if (genomesEl) genomesEl.textContent = info.defaultDb.genomeCount || '0';
            
            if (info.defaultDb.isBuilt) {
                if (statusEl) statusEl.className = 'status-badge status-active';
                if (statusText) statusText.textContent = 'Built';
                if (indexEl) indexEl.textContent = 'Ready';
                if (subtitleEl) subtitleEl.textContent = `${info.defaultDb.genomeCount} pathogen genomes indexed`;
            } else {
                if (statusEl) statusEl.className = 'status-badge status-pending';
                if (statusText) statusText.textContent = 'Not Built';
                if (indexEl) indexEl.textContent = 'Not built';
                if (subtitleEl) subtitleEl.textContent = 'Run build_clark_db.py to build the index';
            }
        }

        // --- Custom DB section ---
        const emptyEl = document.getElementById('custom-db-empty');
        const infoEl = document.getElementById('custom-db-info');

        if (info.customDb && info.customDb.path) {
            // Show custom DB info
            if (emptyEl) emptyEl.classList.add('hidden');
            if (infoEl) infoEl.classList.remove('hidden');

            const pathEl = document.getElementById('custom-db-path-display');
            const countEl = document.getElementById('custom-db-file-count');
            const sizeEl = document.getElementById('custom-db-total-size');
            const listEl = document.getElementById('custom-db-file-list');

            if (pathEl) {
                pathEl.textContent = info.customDb.path;
                pathEl.title = info.customDb.path;
            }

            const files = info.customDb.files || [];
            if (countEl) countEl.textContent = `${files.length} genome file${files.length !== 1 ? 's' : ''}`;
            if (sizeEl) sizeEl.textContent = this.formatSize(info.customDb.totalSize || 0);

            if (listEl) {
                if (files.length === 0) {
                    listEl.innerHTML = '<p class="text-muted">No FASTA files found in this folder.</p>';
                } else {
                    listEl.innerHTML = files.slice(0, 50).map(f => `
                        <div class="custom-db-file-entry">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;flex-shrink:0;">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            <span class="custom-db-file-name">${f.name}</span>
                            <span class="custom-db-file-size">${this.formatSize(f.size)}</span>
                        </div>
                    `).join('');
                    if (files.length > 50) {
                        listEl.innerHTML += `<p class="text-muted" style="margin-top:8px;">...and ${files.length - 50} more files</p>`;
                    }
                }
            }
            // Update custom DB status badge
            const customStatusEl = document.getElementById('custom-db-status');
            const customStatusText = document.getElementById('custom-db-status-text');
            if (customStatusEl && customStatusText) {
                customStatusEl.classList.remove('hidden');
                if (info.customDb.isBuilt) {
                    customStatusEl.className = 'status-badge status-active';
                    customStatusText.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:4px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Built';
                } else {
                    customStatusEl.className = 'status-badge status-pending';
                    customStatusText.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Not Built';
                }
            }
        } else {
            // Show empty state
            if (emptyEl) emptyEl.classList.remove('hidden');
            if (infoEl) infoEl.classList.add('hidden');
            const customStatusEl = document.getElementById('custom-db-status');
            if (customStatusEl) customStatusEl.classList.add('hidden');
        }
    },

    /**
     * Import / select custom database folder
     */
    async importDatabase() {
        try {
            let folder = null;
            
            if (window.api?.files?.selectFolder) {
                folder = await window.api.files.selectFolder();
            }

            if (!folder) {
                console.log('Import cancelled');
                return;
            }

            console.log('Importing from:', folder);
            
            let mappingFile = null;
            if (confirm('Do these genomes contain contigs (e.g. from SPAdes) that require a reads mapping file to resolve Taxonomic IDs?\n\nClick OK to select a reads_mapping.tsv file, or Cancel to skip.')) {
                if (window.api?.files?.selectMappingFile) {
                    mappingFile = await window.api.files.selectMappingFile();
                }
            }
            
            const btn1 = document.getElementById('import-db-btn');
            const btn2 = document.getElementById('change-db-btn');
            const originalText1 = btn1 ? btn1.textContent : '';
            const originalText2 = btn2 ? btn2.textContent : '';
            if (btn1) { btn1.disabled = true; btn1.textContent = 'Building database... (this may take a few minutes)'; }
            if (btn2) { btn2.disabled = true; btn2.textContent = 'Building...'; }
            
            if (window.api?.database?.import) {
                const result = await window.api.database.import(folder, mappingFile);
                if (result.success) {
                    // Reload info to show the new files
                    await this.loadDatabaseInfo();
                } else {
                    alert('Import/Build failed: ' + (result.error || 'Unknown error'));
                }
            } else {
                alert('Import feature requires Electron backend');
            }
            
            if (btn1) { btn1.disabled = false; btn1.textContent = originalText1; }
            if (btn2) { btn2.disabled = false; btn2.textContent = originalText2; }
        } catch (error) {
            console.error('Import error:', error);
            alert('Failed to import database: ' + error.message);
        }
    },

    /**
     * Clear custom database path
     */
    async clearCustomDatabase() {
        if (!confirm('Clear the custom database folder? This will not delete any files.')) return;

        try {
            if (window.api?.database?.clearCustomDb) {
                await window.api.database.clearCustomDb();
                await this.loadDatabaseInfo();
            }
        } catch (error) {
            console.error('Failed to clear custom DB:', error);
        }
    },

    /**
     * Format file size for display
     */
    formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
    },

    /**
     * Check for database updates
     */
    async checkUpdates() {
        try {
            if (window.api?.database?.checkUpdates) {
                const result = await window.api.database.checkUpdates();
                alert(result.message);
            } else {
                alert('Update check requires network connection');
            }
        } catch (error) {
            console.error('Update check error:', error);
            alert('Failed to check for updates');
        }
    },

    /**
     * Load custom species from storage
     */
    loadCustomSpecies() {
        try {
            const saved = localStorage.getItem('pathogenius_custom_species');
            if (saved) {
                this.customSpecies = JSON.parse(saved);
            } else {
                this.customSpecies = [];
            }
            this.renderCustomSpecies();
        } catch (error) {
            console.error('Failed to load custom species:', error);
            this.customSpecies = [];
        }
    },

    /**
     * Save custom species to storage
     */
    saveCustomSpecies() {
        try {
            localStorage.setItem('pathogenius_custom_species', JSON.stringify(this.customSpecies));
        } catch (error) {
            console.error('Failed to save custom species:', error);
        }
    },

    /**
     * Add FASTA file to database (add species)
     */
    async addFastaFile() {
        try {
            let files = [];
            
            if (window.api?.files?.selectFiles) {
                files = await window.api.files.selectFiles();
            } else {
                const fileName = prompt('Enter FASTA file name (mock):', 'new_species.fasta');
                if (fileName) {
                    files = [fileName];
                }
            }

            if (files && files.length > 0) {
                this.showAddSpeciesDialog(files[0]);
            }
        } catch (error) {
            console.error('Failed to select FASTA file:', error);
            alert('Failed to select file');
        }
    },

    /**
     * Show dialog to add species metadata
     */
    showAddSpeciesDialog(filePath) {
        const fileName = filePath.split(/[\\/]/).pop();
        const speciesName = prompt('Enter species/organism name:', fileName.replace(/\.(fasta|fna|fa|fsa)(\.gz)?$/i, ''));
        
        if (!speciesName) return;

        const taxId = prompt('Enter taxonomic ID (optional):', 'CUSTOM' + Date.now().toString().slice(-6));
        const type = prompt('Enter type (bacteria/viral/fungal/other):', 'bacteria');

        const newSpecies = {
            id: 'sp_' + Date.now().toString(36),
            name: speciesName,
            taxId: taxId || 'CUSTOM' + Date.now(),
            type: type || 'bacteria',
            source: fileName,
            addedAt: new Date().toISOString(),
            sequences: 1
        };

        this.customSpecies.unshift(newSpecies);
        this.saveCustomSpecies();
        this.renderCustomSpecies();

        if (window.api?.database?.addFasta) {
            window.api.database.addFasta(filePath, newSpecies);
        }
    },

    /**
     * Remove species from database
     */
    async removeSpecies(speciesId) {
        if (!confirm('Remove this species from the database? The original file will not be deleted.')) return;

        try {
            if (window.api?.database?.removeSpecies) {
                await window.api.database.removeSpecies(speciesId);
            }

            this.customSpecies = this.customSpecies.filter(s => s.id !== speciesId);
            this.saveCustomSpecies();
            this.renderCustomSpecies();
        } catch (error) {
            console.error('Failed to remove species:', error);
            alert('Failed to remove species');
        }
    },

    /**
     * Edit species metadata
     */
    editSpecies(speciesId) {
        const species = this.customSpecies.find(s => s.id === speciesId);
        if (!species) return;

        const newName = prompt('Edit species name:', species.name);
        if (newName === null) return;

        const newTaxId = prompt('Edit taxonomic ID:', species.taxId);
        if (newTaxId === null) return;

        const newType = prompt('Edit type (bacteria/viral/fungal/other):', species.type);
        if (newType === null) return;

        species.name = newName || species.name;
        species.taxId = newTaxId || species.taxId;
        species.type = newType || species.type;
        species.updatedAt = new Date().toISOString();

        this.saveCustomSpecies();
        this.renderCustomSpecies();

        if (window.api?.database?.updateSpecies) {
            window.api.database.updateSpecies(speciesId, species);
        }
    },

    /**
     * Render custom species list
     */
    renderCustomSpecies() {
        const container = document.getElementById('custom-species-list');
        if (!container) return;

        if (this.customSpecies.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p class="text-muted">No custom species added yet.</p>
                    <p class="text-muted" style="font-size: 0.8125rem;">Upload FASTA files to add species to your local database.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.customSpecies.map(species => `
            <div class="species-entry" data-id="${species.id}">
                <div class="species-info">
                    <span class="species-name">${species.name}</span>
                    <span class="species-meta">
                        ${species.type} • Tax ID: ${species.taxId} • ${species.sequences || 0} sequences • Added ${this.formatDate(species.addedAt)}
                    </span>
                </div>
                <div class="species-actions">
                    <button class="species-action-btn" onclick="DatabasePage.editSpecies('${species.id}')" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                        </svg>
                        Edit
                    </button>
                    <button class="species-action-btn btn-remove" onclick="DatabasePage.removeSpecies('${species.id}')" title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Remove
                    </button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Filter species by search term
     */
    filterSpecies(searchTerm) {
        const term = searchTerm.toLowerCase();
        const entries = document.querySelectorAll('.species-entry');
        
        entries.forEach(entry => {
            const text = entry.textContent.toLowerCase();
            entry.style.display = text.includes(term) ? '' : 'none';
        });
    },

    /**
     * Format date for display
     */
    formatDate(dateStr) {
        return Utils.formatDate(dateStr);
    }
};

window.DatabasePage = DatabasePage;
