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

        // No longer start periodic updates - manual refresh only
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
            this.checkRunningAnalyses(),
            this.loadRecentAnalyses()
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
                    ['starting', 'running', 'preprocessing', 'classifying', 'processing',
                     'finalizing', 'splitting', 'connecting', 'uploading', 'downloading', 'merging'].includes(a.status)
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
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            this.hideRunningAnalysisBanner();
            // Update running count badge
            this.updateRunningCountBadge();
            // Refresh the recent analyses table to show the new status
            this.loadRecentAnalyses();
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
            window.api?.system?.onGpuReady?.((gpu) => {
                if (this.systemStats) this.systemStats.gpu = gpu;
                const gpuEl = document.getElementById('gpu-usage');
                if (gpuEl) gpuEl.textContent = gpu.available ? gpu.name : 'No GPU detected';
            });
        } catch (error) {
            console.error('Failed to load system stats:', error);
        }
    },

    /**
     * Update system stats display
     */
    updateSystemDisplay() {
        if (!this.systemStats) return;

        const { memory, cpu, gpu, disk } = this.systemStats;

        // RAM
        if (memory) {
            const usedGB = (memory.used / (1000 ** 3)).toFixed(1);
            const totalGB = (memory.total / (1000 ** 3)).toFixed(0);
            const ramUsage = document.getElementById('ram-usage');
            const ramBar = document.getElementById('ram-bar');
            if (ramUsage) ramUsage.textContent = `${usedGB} GB / ${totalGB} GB`;
            if (ramBar) ramBar.style.width = `${memory.percentUsed}%`;
        }

        // CPU
        if (cpu?.usage !== undefined) {
            const cpuUsage = document.getElementById('cpu-usage');
            const cpuBar = document.getElementById('cpu-bar');
            if (cpuUsage) cpuUsage.textContent = `${cpu.usage}%`;
            if (cpuBar) cpuBar.style.width = `${cpu.usage}%`;
        }

        // GPU — text only, no progress bar
        if (gpu) {
            const gpuUsage = document.getElementById('gpu-usage');
            if (gpuUsage) gpuUsage.textContent = gpu.available ? gpu.name : 'No GPU detected';
        }

        // Storage
        if (disk) {
            const freeGB = (disk.free / (1024 ** 3)).toFixed(1);
            const freeVal = document.getElementById('free-space-value');
            if (freeVal) freeVal.textContent = `${freeGB} GB`;
            if (disk.total) {
                const usedPercent = ((disk.total - disk.free) / disk.total) * 100;
                const freeBar = document.getElementById('free-space-bar');
                if (freeBar) freeBar.style.width = `${usedPercent}%`;
            }
        }
    },

    /**
     * Load and render recent analyses from the analysis service
     */
    async loadRecentAnalyses() {
        const tbody = document.getElementById('analyses-table-body');
        if (!tbody) return;

        try {
            if (!window.api?.analysis?.getAll) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:24px;">Analysis API unavailable</td></tr>';
                return;
            }

            const analyses = await window.api.analysis.getAll();
            const recent = [...analyses]
                .sort((a, b) => {
                    const ta = new Date(a.completed_at || a.endTime || a.startTime || 0).getTime();
                    const tb = new Date(b.completed_at || b.endTime || b.startTime || 0).getTime();
                    return tb - ta;
                })
                .slice(0, 10);

            // Update summary stats
            const total = analyses.length;
            const completed = analyses.filter(a => a.status === 'completed').length;
            const failed = analyses.filter(a => a.status === 'failed').length;
            const running = analyses.filter(a =>
                ['starting', 'running', 'preprocessing', 'classifying', 'processing',
                 'finalizing', 'splitting', 'connecting', 'uploading', 'downloading', 'merging'].includes(a.status)
            ).length;

            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('stat-total', total);
            set('stat-completed', completed);
            set('stat-failed', failed);
            set('stat-running', running);

            // Show cloud count for logged-in users
            const isGuest = window.App?.isGuestMode?.() || window.App?.state?.isGuestMode;
            const cloudRow = document.getElementById('stat-cloud-row');
            if (!isGuest && window.api?.cloud?.getResults) {
                try {
                    const cloudResp = await window.api.cloud.getResults();
                    if (cloudResp.success && cloudResp.results?.length > 0) {
                        set('stat-cloud', cloudResp.results.length);
                        if (cloudRow) cloudRow.classList.remove('hidden');
                    }
                } catch {}
            } else {
                if (cloudRow) cloudRow.classList.add('hidden');
            }

            if (recent.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:24px;">No analyses yet. Start a new analysis to see results here.</td></tr>';
                return;
            }

            const statusBadge = (status) => {
                const map = {
                    completed: `<span class="status-badge status-completed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Completed</span>`,
                    failed:    `<span class="status-badge status-failed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Failed</span>`,
                    running:   `<span class="status-badge status-running">Running</span>`,
                    cancelled: `<span class="status-badge status-failed">Cancelled</span>`
                };
                return map[status] || `<span class="status-badge">${status}</span>`;
            };

            const fmt = (dt) => {
                if (!dt) return '—';
                const d = new Date(dt);
                return isNaN(d) ? '—' : d.toLocaleDateString();
            };

            tbody.innerHTML = recent.map(a => {
                const name = a.analysis_name || a.config?.analysis_name || a.id;
                const date = fmt(a.completed_at || a.endTime || a.startTime);
                const sampleType = a.sample_type || a.config?.sample_type || '—';
                const topPathogen = (a.results?.pathogens?.[0]?.name) || '—';
                return `
                <tr>
                    <td><div class="cell-with-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        ${esc(name)}
                    </div></td>
                    <td>${date}</td>
                    <td class="text-muted">${esc(sampleType)}</td>
                    <td>${statusBadge(a.status)}</td>
                    <td>${esc(topPathogen)}</td>
                    <td>${a.status === 'completed' ? `<button class="btn-link" onclick="App.navigateTo('results')">View Report</button>` : '<span class="text-muted">—</span>'}</td>
                </tr>`;
            }).join('');

        } catch (error) {
            console.error('Failed to load recent analyses:', error);
            tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:24px;">Failed to load analyses</td></tr>';
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
