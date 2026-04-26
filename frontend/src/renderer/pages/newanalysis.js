/**
 * NEWANALYSIS.JS - New Analysis Page Controller
 * Purpose: Multi-step wizard for configuring and launching Snakemake analysis
 */

const AnalysisPage = {
    // Wizard state
    currentStep: 1,
    totalSteps: 3,
    
    // Analysis configuration (sent to Snakemake)
    config: {
        analysisName: '',
        sampleType: 'clinical',
        database: 'default',
        confidenceThreshold: 0.7,
        engine: 'cpu',
        inputFiles: [],
        batchProcessing: false
    },

    // SeqKit stats cache — avoids re-running when switching steps
    _seqkitStats: null,
    _seqkitLargeFile: false,

    // Threshold: 4.5 billion bases
    LARGE_FILE_THRESHOLD: 4_500_000_000,

    // Cached database list from backend
    availableDatabases: [],
    
    isAnalyzing: false,
    isEventsBound: false,

    /**
     * Initialize analysis page
     */
    init() {
        console.log('AnalysisPage initializing...');
        
        if (!this.isEventsBound) {
            this.bindEvents();
            this.isEventsBound = true;
        }
        
        this.reset();
        this.loadDatabases();
        console.log('AnalysisPage initialized');
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // File selection
        const selectBtn = document.getElementById('select-files-btn');
        if (selectBtn) {
            selectBtn.addEventListener('click', () => this.selectFiles());
        }

        // Start analysis
        const startBtn = document.getElementById('start-analysis-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startAnalysis());
        }

        // Database selector — validate selection
        const dbSelect = document.getElementById('database-select');
        if (dbSelect) {
            dbSelect.addEventListener('change', () => this.onDatabaseChange());
        }

        // Engine selector cards
        document.addEventListener('click', (e) => {
            const card = e.target.closest('.engine-card');
            if (!card) return;
            const engine = card.dataset.engine;
            if (!engine) return;
            // Update radio
            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            // Update visual state
            document.querySelectorAll('.engine-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            this.config.engine = engine;
            // Re-populate dropdown for new engine
            this.populateDatabaseDropdown();
        });

        // Upload zone drag-drop
        const uploadZone = document.getElementById('upload-zone');
        if (uploadZone) {
            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadZone.style.borderColor = 'var(--primary)';
                uploadZone.style.backgroundColor = 'var(--primary-bg)';
            });
            uploadZone.addEventListener('dragleave', () => {
                uploadZone.style.borderColor = '';
                uploadZone.style.backgroundColor = '';
            });
            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadZone.style.borderColor = '';
                uploadZone.style.backgroundColor = '';
                this.handleDroppedFiles(e.dataTransfer.files);
            });
        }
    },

    /**
     * Load named databases from backend
     */
    async loadDatabases() {
        try {
            if (window.api?.database?.list) {
                this.availableDatabases = await window.api.database.list();
            }
        } catch (error) {
            console.error('Failed to load databases:', error);
            this.availableDatabases = [];
        }
        this.populateDatabaseDropdown();
    },

    /**
     * Populate the database dropdown based on current engine selection.
     * GPU engine: only show databases with syncedToJetson=true
     * CPU engine: show all databases
     */
    populateDatabaseDropdown() {
        const select = document.getElementById('database-select');
        if (!select) return;

        // Remember current selection
        const currentVal = select.value;

        // Clear custom options (keep "default")
        while (select.options.length > 1) {
            select.remove(1);
        }

        const isGpu = this.config.engine === 'gpu';

        // Filter databases by engine compatibility
        const compatible = this.availableDatabases.filter(db => {
            if (!db.isBuilt) return false;
            if (isGpu && !db.syncedToJetson) return false;
            return true;
        });

        // Add compatible databases as options
        for (const db of compatible) {
            const opt = document.createElement('option');
            opt.value = db.id;
            let label = db.name;
            if (db.isActive) label += ' (Active)';
            if (db.syncedToJetson) label += ' ⚡';
            opt.textContent = label;
            select.appendChild(opt);
        }

        // Restore selection if still valid
        const allValues = Array.from(select.options).map(o => o.value);
        if (allValues.includes(currentVal)) {
            select.value = currentVal;
        } else {
            select.value = 'default';
        }

        this.config.database = select.value;
    },

    /**
     * Navigate to next step
     */
    nextStep() {
        if (this.currentStep < this.totalSteps) {
            if (!this.validateStep(this.currentStep)) return;
            
            this.currentStep++;
            this.updateWizardUI();
            
            if (this.currentStep === 3) {
                this.updateReview();
            }
        }
    },

    /**
     * Navigate to previous step
     */
    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateWizardUI();
        }
    },

    /**
     * Go to specific step
     */
    goToStep(step) {
        if (step >= 1 && step <= this.totalSteps) {
            this.currentStep = step;
            this.updateWizardUI();
        }
    },

    /**
     * Validate current step before proceeding
     */
    validateStep(step) {
        switch (step) {
            case 1:
                if (this.config.inputFiles.length === 0) {
                    alert('Please select at least one FASTQ file');
                    return false;
                }
                return true;
            case 2:
                this.collectConfig();
                if (!this.config.analysisName.trim()) {
                    alert('Please enter an analysis name');
                    return false;
                }
                return true;
            default:
                return true;
        }
    },

    /**
     * Update wizard UI to reflect current step
     */
    updateWizardUI() {
        document.querySelectorAll('.step').forEach((step, index) => {
            const stepNum = index + 1;
            step.classList.remove('active', 'completed');
            if (stepNum === this.currentStep) {
                step.classList.add('active');
            } else if (stepNum < this.currentStep) {
                step.classList.add('completed');
            }
        });

        document.querySelectorAll('.wizard-step').forEach((content, index) => {
            content.classList.toggle('active', index + 1 === this.currentStep);
        });
    },

    /**
     * Collect configuration from form
     */
    collectConfig() {
        this.config.analysisName = document.getElementById('analysis-name')?.value || '';
        this.config.sampleType = document.getElementById('sample-type')?.value || 'clinical';
        this.config.database = document.getElementById('database-select')?.value || 'default';
        this.config.confidenceThreshold = parseFloat(document.getElementById('confidence-threshold')?.value || '0.7');
        const engineRadio = document.querySelector('input[name="engine"]:checked');
        if (engineRadio) this.config.engine = engineRadio.value;
    },

    /**
     * Update review summary
     */
    updateReview() {
        this.collectConfig();
        
        document.getElementById('review-name').textContent = this.config.analysisName || '—';
        document.getElementById('review-files').textContent = `${this.config.inputFiles.length} file(s) selected`;
        document.getElementById('review-sample').textContent = this.getSampleTypeLabel(this.config.sampleType);
        document.getElementById('review-database').textContent = this.getDatabaseLabel(this.config.database);
        document.getElementById('review-engine').textContent = this.getEngineLabel(this.config.engine);
        const reviewBatch = document.getElementById('review-batch');
        if (reviewBatch) {
            reviewBatch.textContent = this.config.batchProcessing ? '✅ Enabled (split into 2 batches)' : '—';
        }
    },

    getSampleTypeLabel(value) {
        const labels = {
            'clinical': 'Clinical Sample',
            'environmental': 'Environmental',
            'food': 'Food Safety',
            'other': 'Other'
        };
        return labels[value] || value;
    },

    getDatabaseLabel(value) {
        if (value === 'default') return 'Default Database (Built-in)';
        // Look up named database
        const db = this.availableDatabases.find(d => d.id === value);
        if (db) {
            let label = db.name;
            if (db.syncedToJetson) label += ' ⚡';
            return label;
        }
        return value;
    },

    /**
     * Handle database dropdown change
     */
    async onDatabaseChange() {
        const select = document.getElementById('database-select');
        const warning = document.getElementById('custom-db-warning');
        const notActiveWarning = document.getElementById('db-not-active-warning');
        if (!select) return;

        if (warning) warning.classList.add('hidden');
        if (notActiveWarning) notActiveWarning.classList.add('hidden');

        if (select.value !== 'default') {
            const db = this.availableDatabases.find(d => d.id === select.value);
            if (db && !db.isActive && notActiveWarning) {
                notActiveWarning.classList.remove('hidden');
            }
        }
    },

    getEngineLabel(value) {
        const labels = {
            'cpu': '🖥️ CPU — CLARK-l (Docker, local)',
            'gpu': '⚡ GPU — CU-CLARK-L (Jetson Nano, edge)'
        };
        return labels[value] || value;
    },

    /**
     * Open file selection dialog
     */
    async selectFiles() {
        try {
            let files = [];
            
            if (window.api?.files?.selectFiles) {
                files = await window.api.files.selectFiles();
            } else {
                console.warn('File API not available');
                files = ['mock_sample_001.fastq', 'mock_sample_002.fastq'];
            }

            if (files && files.length > 0) {
                this.config.inputFiles = files;
                this.displayFiles();
                this.runSeqkitStats();
            }
        } catch (error) {
            console.error('File selection error:', error);
        }
    },

    handleDroppedFiles(fileList) {
        const paths = Array.from(fileList).map(f => f.path || f.name);
        if (paths.length > 0) {
            this.config.inputFiles = paths;
            this.displayFiles();
            this.runSeqkitStats();
        }
    },

    displayFiles() {
        const fileListEl = document.getElementById('file-list');
        const uploadZone = document.getElementById('upload-zone');
        
        if (!fileListEl) return;

        if (this.config.inputFiles.length > 0) {
            fileListEl.classList.remove('hidden');
            uploadZone?.classList.add('hidden');

            fileListEl.innerHTML = `
                <div class="file-list-header">
                    <span>${this.config.inputFiles.length} file(s) selected</span>
                    <button class="btn-link" onclick="AnalysisPage.clearFiles()">Clear</button>
                </div>
                ${this.config.inputFiles.map(file => `
                    <div class="file-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span>${this.getFileName(file)}</span>
                    </div>
                `).join('')}
            `;
        } else {
            fileListEl.classList.add('hidden');
            uploadZone?.classList.remove('hidden');
        }
    },

    getFileName(path) {
        return path.split(/[\\/]/).pop();
    },

    clearFiles() {
        this.config.inputFiles = [];
        this._seqkitStats = null;
        this._seqkitLargeFile = false;
        this.config.batchProcessing = false;
        this.displayFiles();
        this.hideSeqkitUI();
        document.getElementById('upload-zone')?.classList.remove('hidden');
    },

    /**
     * Hide all SeqKit-related UI elements
     */
    hideSeqkitUI() {
        document.getElementById('fastq-stats-banner')?.classList.add('hidden');
        document.getElementById('fastq-large-warning')?.classList.add('hidden');
    },

    /**
     * Run SeqKit stats on the first selected FASTQ file.
     * Updates the stats banner and shows a large-file warning if needed.
     */
    async runSeqkitStats() {
        if (!this.config.inputFiles.length) return;
        if (!window.api?.files?.seqkitStats) {
            console.warn('SeqKit API not available');
            return;
        }

        const filePath = this.config.inputFiles[0];
        const banner = document.getElementById('fastq-stats-banner');
        const content = document.getElementById('fastq-stats-content');
        const loading = document.getElementById('fastq-stats-loading');
        const warning = document.getElementById('fastq-large-warning');

        // Show loading state
        if (banner) banner.classList.remove('hidden');
        if (content) content.innerHTML = '';
        if (loading) loading.classList.remove('hidden');
        if (warning) warning.classList.add('hidden');

        try {
            console.log('[SeqKit] Analysing:', filePath);
            const result = await window.api.files.seqkitStats(filePath);

            if (loading) loading.classList.add('hidden');

            if (!result.success) {
                console.warn('[SeqKit] Failed:', result.error);
                if (banner) banner.classList.add('hidden');
                return;
            }

            this._seqkitStats = result.stats;
            const s = result.stats;
            console.log('[SeqKit] Stats:', s);

            // Populate stats grid
            if (content) {
                content.innerHTML = `
                    <div class="fastq-stat-item">
                        <span class="stat-label">Reads</span>
                        <span class="stat-value">${this.formatNumber(s.num_seqs)}</span>
                    </div>
                    <div class="fastq-stat-item">
                        <span class="stat-label">Total Length</span>
                        <span class="stat-value ${s.sum_len > this.LARGE_FILE_THRESHOLD ? 'warning' : ''}">${this.formatBases(s.sum_len)}</span>
                    </div>
                    <div class="fastq-stat-item">
                        <span class="stat-label">Avg Length</span>
                        <span class="stat-value">${this.formatNumber(Math.round(s.avg_len))}</span>
                    </div>
                    <div class="fastq-stat-item">
                        <span class="stat-label">Max Length</span>
                        <span class="stat-value">${this.formatNumber(s.max_len)}</span>
                    </div>
                    <div class="fastq-stat-item">
                        <span class="stat-label">Format</span>
                        <span class="stat-value">${s.format}</span>
                    </div>
                `;
            }

            // Check if file exceeds threshold
            this._seqkitLargeFile = s.sum_len > this.LARGE_FILE_THRESHOLD;
            if (this._seqkitLargeFile && warning) {
                const detail = document.getElementById('fastq-large-warning-detail');
                if (detail) {
                    detail.textContent = `Total sequence length is ${this.formatBases(s.sum_len)} ` +
                        `(${this.formatNumber(s.num_seqs)} reads). ` +
                        `This exceeds the 4.5 Gbp threshold. Batch processing is recommended.`;
                }
                warning.classList.remove('hidden');

                // Wire up batch toggle
                const toggle = document.getElementById('batch-processing-toggle');
                if (toggle) {
                    toggle.checked = this.config.batchProcessing;
                    toggle.onchange = () => {
                        this.config.batchProcessing = toggle.checked;
                        console.log('[BatchProcessing] Toggled:', toggle.checked);
                    };
                }
            }
        } catch (err) {
            console.error('[SeqKit] Error:', err);
            if (loading) loading.classList.add('hidden');
            if (banner) banner.classList.add('hidden');
        }
    },

    /**
     * Format a number with commas (e.g. 1644811 → "1,644,811")
     */
    formatNumber(n) {
        return Number(n).toLocaleString();
    },

    /**
     * Format base count to human-readable (e.g. 4874039793 → "4.87 Gbp")
     */
    formatBases(n) {
        if (n >= 1e9) return (n / 1e9).toFixed(2) + ' Gbp';
        if (n >= 1e6) return (n / 1e6).toFixed(2) + ' Mbp';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + ' Kbp';
        return n + ' bp';
    },

    /**
     * Start analysis
     */
    async startAnalysis() {
        if (this.isAnalyzing) return;

        this.collectConfig();

        if (this.config.inputFiles.length === 0) {
            alert('No files selected');
            return;
        }

        // Validate named database if selected
        if (this.config.database !== 'default') {
            const db = this.availableDatabases.find(d => d.id === this.config.database);
            if (!db || !db.isBuilt) {
                alert('The selected database has not been built. Please build it first in Database Management.');
                return;
            }
        }

        console.log('Starting Snakemake analysis with config:', this.config);
        this.isAnalyzing = true;

        const snakemakeConfig = {
            analysis_name: this.config.analysisName,
            sample_type: this.config.sampleType,
            input_files: this.config.inputFiles,
            database: this.config.database,
            confidence_threshold: this.config.confidenceThreshold,
            engine: this.config.engine,
            batch_processing: this.config.batchProcessing,
            timestamp: new Date().toISOString(),
            threads: 4,
            output_dir: `results/${this.config.analysisName}_${Date.now()}`
        };

        try {
            if (window.api?.analysis?.start) {
                const result = await window.api.analysis.start(snakemakeConfig);
                
                if (result.success) {
                    console.log('Analysis started:', result.analysisId);
                    App.navigateTo('results');
                } else {
                    alert(result.error || 'Failed to start analysis');
                }
            } else {
                console.log('Snakemake config prepared:', snakemakeConfig);
                setTimeout(() => {
                    this.isAnalyzing = false;
                    App.navigateTo('results');
                }, 1500);
            }
        } catch (error) {
            console.error('Analysis error:', error);
            alert('Failed to start analysis');
        } finally {
            this.isAnalyzing = false;
        }
    },

    /**
     * Reset wizard
     */
    reset() {
        this.currentStep = 1;
        this.config = {
            analysisName: '',
            sampleType: 'clinical',
            database: 'default',
            confidenceThreshold: 0.7,
            engine: 'cpu',
            inputFiles: [],
            batchProcessing: false
        };
        this._seqkitStats = null;
        this._seqkitLargeFile = false;
        this.isAnalyzing = false;
        
        const nameInput = document.getElementById('analysis-name');
        if (nameInput) nameInput.value = '';
        
        this.displayFiles();
        this.updateWizardUI();
    }
};

window.AnalysisPage = AnalysisPage;
