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
        database: 'ncbi-refseq',
        confidenceThreshold: 0.7,
        inputFiles: []
    },
    
    isAnalyzing: false,
    isEventsBound: false, // Prevent duplicate event binding

    /**
     * Initialize analysis page
     */
    init() {
        console.log('AnalysisPage initializing...');
        
        // Only bind events once to prevent duplicate dialogs
        if (!this.isEventsBound) {
            this.bindEvents();
            this.isEventsBound = true;
        }
        
        this.reset();
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
                // Handle dropped files in Electron context
                this.handleDroppedFiles(e.dataTransfer.files);
            });
        }
    },

    /**
     * Navigate to next step
     */
    nextStep() {
        if (this.currentStep < this.totalSteps) {
            // Validate current step
            if (!this.validateStep(this.currentStep)) return;
            
            this.currentStep++;
            this.updateWizardUI();
            
            // Update review on last step
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
        // Update step indicators
        document.querySelectorAll('.step').forEach((step, index) => {
            const stepNum = index + 1;
            step.classList.remove('active', 'completed');
            if (stepNum === this.currentStep) {
                step.classList.add('active');
            } else if (stepNum < this.currentStep) {
                step.classList.add('completed');
            }
        });

        // Show/hide step content
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
        this.config.database = document.getElementById('database-select')?.value || 'ncbi-refseq';
        this.config.confidenceThreshold = parseFloat(document.getElementById('confidence-threshold')?.value || '0.7');
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
    },

    /**
     * Get sample type display label
     */
    getSampleTypeLabel(value) {
        const labels = {
            'clinical': 'Clinical Sample',
            'environmental': 'Environmental',
            'food': 'Food Safety',
            'other': 'Other'
        };
        return labels[value] || value;
    },

    /**
     * Get database display label
     */
    getDatabaseLabel(value) {
        const labels = {
            'ncbi-refseq': 'NCBI RefSeq 2025',
            'bacteria': 'Bacteria Only',
            'viral': 'Viral Only',
            'custom': 'Custom Database'
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
                console.warn('File API not available - running outside Electron');
                // Mock for development
                files = ['mock_sample_001.fastq', 'mock_sample_002.fastq'];
            }

            if (files && files.length > 0) {
                this.config.inputFiles = files;
                this.displayFiles();
            }
        } catch (error) {
            console.error('File selection error:', error);
        }
    },

    /**
     * Handle dropped files
     */
    handleDroppedFiles(fileList) {
        // In Electron, dropped files have path property
        const paths = Array.from(fileList).map(f => f.path || f.name);
        if (paths.length > 0) {
            this.config.inputFiles = paths;
            this.displayFiles();
        }
    },

    /**
     * Display selected files
     */
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

    /**
     * Get filename from path
     */
    getFileName(path) {
        return path.split(/[\\/]/).pop();
    },

    /**
     * Clear selected files
     */
    clearFiles() {
        this.config.inputFiles = [];
        this.displayFiles();
        document.getElementById('upload-zone')?.classList.remove('hidden');
    },

    /**
     * Start analysis - sends config to Snakemake via main process
     */
    async startAnalysis() {
        if (this.isAnalyzing) return;

        this.collectConfig();

        // Final validation
        if (this.config.inputFiles.length === 0) {
            alert('No files selected');
            return;
        }

        console.log('Starting Snakemake analysis with config:', this.config);
        this.isAnalyzing = true;

        // Prepare Snakemake config object
        const snakemakeConfig = {
            analysis_name: this.config.analysisName,
            sample_type: this.config.sampleType,
            input_files: this.config.inputFiles,
            database: this.config.database,
            confidence_threshold: this.config.confidenceThreshold,
            timestamp: new Date().toISOString(),
            // Snakemake-specific settings
            threads: 4,  // Will be determined by system
            output_dir: `results/${this.config.analysisName}_${Date.now()}`
        };

        try {
            // Call backend via IPC
            if (window.api?.analysis?.start) {
                const result = await window.api.analysis.start(snakemakeConfig);
                
                if (result.success) {
                    console.log('Analysis started:', result.analysisId);
                    // Navigate to results or show progress
                    App.navigateTo('results');
                } else {
                    alert(result.error || 'Failed to start analysis');
                }
            } else {
                // Mock for development
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
     * Reset wizard to initial state
     */
    reset() {
        this.currentStep = 1;
        this.config = {
            analysisName: '',
            sampleType: 'clinical',
            database: 'ncbi-refseq',
            confidenceThreshold: 0.7,
            inputFiles: []
        };
        this.isAnalyzing = false;
        
        // Reset form fields
        const nameInput = document.getElementById('analysis-name');
        if (nameInput) nameInput.value = '';
        
        this.displayFiles();
        this.updateWizardUI();
    }
};

window.AnalysisPage = AnalysisPage;
