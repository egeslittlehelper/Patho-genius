/**
 * DASHBOARD.JS - Dashboard Controller
 * Purpose: System overview, resources, recent analyses, running analysis status
 */

const DashboardPage = {
    isInitialized: false,
    isEventsBound: false, // Prevent duplicate event binding
    systemStats: null,
    runningAnalysis: null,

    /**
     * Initialize dashboard
     */
    async init() {
        // Only bind events once to prevent duplicate listeners
        if (!this.isEventsBound) {
            this.bindEvents();
            this.setupProgressListener();
            this.isEventsBound = true;
        }
        
        if (this.isInitialized) {
            await this.refresh();
            return;
        }

        console.log('DashboardPage initializing...');
        await this.loadData();
        this.isInitialized = true;
        console.log('DashboardPage initialized');
    },

    /**
     * Bind events
     */
    bindEvents() {
        const searchInput = document.getElementById('analysis-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterAnalyses(e.target.value);
            });
        }
    },

    /**
     * Setup progress listener for running analyses
     */
    setupProgressListener() {
        if (window.api?.analysis?.onProgress) {
            window.api.analysis.onProgress((data) => {
                this.updateRunningAnalysisBanner(data);
            });
        }
    },

    /**
     * Load dashboard data
     */
    async loadData() {
        await Promise.all([
            this.loadSystemStats(),
            this.checkRunningAnalyses()
        ]);
    },

    /**
     * Refresh data
     */
    async refresh() {
        await this.loadData();
    },

    /**
     * Check for running analyses
     */
    async checkRunningAnalyses() {
        try {
            if (window.api?.analysis?.getAll) {
                const analyses = await window.api.analysis.getAll();
                const running = analyses.find(a => 
                    ['starting', 'running', 'preprocessing', 'classifying', 'processing', 'finalizing'].includes(a.status)
                );
                
                if (running) {
                    this.runningAnalysis = running;
                    this.showRunningAnalysisBanner(running);
                } else {
                    this.hideRunningAnalysisBanner();
                }
            }
        } catch (error) {
            console.error('Failed to check running analyses:', error);
        }
    },

    /**
     * Show running analysis banner
     */
    showRunningAnalysisBanner(analysis) {
        const banner = document.getElementById('dashboard-running-analysis');
        if (!banner) return;

        banner.classList.remove('hidden');
        
        const nameEl = document.getElementById('running-analysis-name');
        const statusEl = document.getElementById('running-analysis-status');
        const progressEl = document.getElementById('running-analysis-progress');
        const percentEl = document.getElementById('running-analysis-percent');

        if (nameEl) nameEl.textContent = analysis.config?.analysis_name || 'Analysis in Progress';
        if (statusEl) statusEl.textContent = this.getStatusMessage(analysis.status, analysis.message);
        if (progressEl) progressEl.style.width = `${analysis.progress || 0}%`;
        if (percentEl) percentEl.textContent = `${analysis.progress || 0}%`;
    },

    /**
     * Hide running analysis banner
     */
    hideRunningAnalysisBanner() {
        const banner = document.getElementById('dashboard-running-analysis');
        if (banner) banner.classList.add('hidden');
        this.runningAnalysis = null;
    },

    /**
     * Update running analysis banner with progress
     */
    updateRunningAnalysisBanner(data) {
        const { analysisId, progress, status, message } = data;
        
        // If analysis completed, hide the banner
        if (status === 'completed' || status === 'failed') {
            this.hideRunningAnalysisBanner();
            // Update running count badge
            this.updateRunningCountBadge();
            return;
        }

        const banner = document.getElementById('dashboard-running-analysis');
        if (!banner) return;

        banner.classList.remove('hidden');
        
        const statusEl = document.getElementById('running-analysis-status');
        const progressEl = document.getElementById('running-analysis-progress');
        const percentEl = document.getElementById('running-analysis-percent');

        if (statusEl) statusEl.textContent = message || this.getStatusMessage(status);
        if (progressEl) progressEl.style.width = `${progress || 0}%`;
        if (percentEl) percentEl.textContent = `${progress || 0}%`;

        // Update running count badge
        this.updateRunningCountBadge();
    },

    /**
     * Update running count badge in sidebar
     */
    updateRunningCountBadge() {
        // This is also managed by ResultsPage, but we sync here
        const badge = document.getElementById('running-count');
        if (badge) {
            const hasRunning = this.runningAnalysis !== null;
            badge.textContent = hasRunning ? '1' : '0';
            badge.classList.toggle('hidden', !hasRunning);
        }
    },

    /**
     * Get status message for display
     */
    getStatusMessage(status, message) {
        if (message) return message;
        
        const messages = {
            'starting': 'Initializing analysis...',
            'running': 'Running analysis...',
            'preprocessing': 'Quality filtering reads...',
            'classifying': 'Running Kraken2 classification...',
            'processing': 'Processing classification results...',
            'finalizing': 'Generating reports...'
        };
        return messages[status] || 'Processing...';
    },

    /**
     * Load system statistics
     */
    async loadSystemStats() {
        try {
            if (window.api?.system?.getStats) {
                this.systemStats = await window.api.system.getStats();
                this.updateSystemDisplay();
            }
        } catch (error) {
            console.error('Failed to load system stats:', error);
        }
    },

    /**
     * Update system stats display
     */
    updateSystemDisplay() {
        if (!this.systemStats) return;

        const { memory, cpu } = this.systemStats;
        
        // RAM
        if (memory) {
            const usedGB = (memory.used / (1024 ** 3)).toFixed(1);
            const totalGB = (memory.total / (1024 ** 3)).toFixed(0);
            
            const ramUsage = document.getElementById('ram-usage');
            const ramBar = document.getElementById('ram-bar');
            if (ramUsage) ramUsage.textContent = `${usedGB} GB / ${totalGB} GB`;
            if (ramBar) ramBar.style.width = `${memory.percentUsed}%`;
        }

        // CPU
        if (cpu?.usage) {
            const cpuUsage = document.getElementById('cpu-usage');
            const cpuBar = document.getElementById('cpu-bar');
            if (cpuUsage) cpuUsage.textContent = `${cpu.usage}%`;
            if (cpuBar) cpuBar.style.width = `${cpu.usage}%`;
        }
    },

    /**
     * Filter analyses table
     */
    filterAnalyses(searchTerm) {
        const term = searchTerm.toLowerCase();
        const rows = document.querySelectorAll('#analyses-table-body tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    }
};

window.DashboardPage = DashboardPage;
