/**
 * RESULTS.JS - Results Page Controller
 * Purpose: Display analysis history, running analyses, and detailed results
 * 
 * UI STRUCTURE:
 * 1. Running Analyses - Shows in-progress analyses with progress bars
 * 2. Analysis History - Table of all completed/failed analyses
 * 3. Detail View - Detailed results when an analysis is selected
 */

const ResultsPage = {
    // Current state
    state: {
        view: 'history', // 'history' or 'detail'
        selectedAnalysisId: null,
        currentResult: null,
        runningAnalyses: [],
        completedAnalyses: [],
        cloudResults: [],
        currentSource: 'local', // 'local' or 'cloud'
        localCopyIds: new Set(), // analysisIds that have been downloaded to local this session
        sortColumn: 'date',
        sortDir: 'desc'
    },
    
    isEventsBound: false, // Prevent duplicate event binding

    /**
     * Initialize results page
     */
    init() {
        console.log('ResultsPage initializing...');
        
        // Only bind DOM events once to prevent duplicate listeners
        if (!this.isEventsBound) {
            this.setupEventListeners();
            this.isEventsBound = true;
        }
        // Always re-register the IPC progress listener on each page visit
        this.setupProgressListener();
        
        // Reset to local view and load data
        this.state.currentSource = 'local';
        this.loadAnalyses();
        
        // Show history view by default
        this.showHistoryView();
        
        // Update cloud tab lock icon based on guest mode
        this.updateCloudTabState();
        
        // Ensure local tab is selected
        document.querySelectorAll('.source-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.source === 'local');
        });
        
        // Hide cloud section, show local
        const localSection = document.getElementById('local-results-section');
        const cloudSection = document.getElementById('cloud-results-section');
        if (localSection) localSection.classList.remove('hidden');
        if (cloudSection) cloudSection.classList.add('hidden');
        
        console.log('ResultsPage initialized');
    },

    /**
     * Update cloud tab state based on guest mode
     */
    updateCloudTabState() {
        const isGuest = window.App?.isGuestMode?.() || window.App?.state?.isGuestMode;
        const lockIcon = document.getElementById('cloud-lock-icon');
        
        if (lockIcon) {
            lockIcon.classList.toggle('hidden', !isGuest);
        }
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Back button
        const backBtn = document.getElementById('back-to-history-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.showHistoryView());
        }

        // Search
        const searchInput = document.getElementById('results-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterAnalyses(e.target.value));
        }

        // Re-render pathogen cards and update AI card visibility when settings change
        window.addEventListener('settingsChanged', () => {
            if (this.state.view === 'detail' && this.state.currentResult) {
                this.renderPathogenCards();
                const aiCard = document.getElementById('ai-summary-card');
                if (aiCard) aiCard.classList.toggle('hidden', !this._getSetting('localAiEnabled', true));
            }
        });
    },

    /**
     * Setup progress listener for running analyses
     */
    setupProgressListener() {
        if (window.api?.analysis?.removeProgressListener) {
            window.api.analysis.removeProgressListener();
        }
        if (window.api?.analysis?.onProgress) {
            window.api.analysis.onProgress((data) => {
                this.updateRunningAnalysis(data);
            });
        }
    },

    /**
     * Load all analyses (running + completed)
     */
    async loadAnalyses() {
        try {
            if (window.api?.analysis?.getAll) {
                const analyses = await window.api.analysis.getAll();
                
                // Separate running and completed
                this.state.runningAnalyses = analyses.filter(a => 
                    ['starting', 'running', 'preprocessing', 'classifying', 'processing',
                     'finalizing', 'splitting', 'connecting', 'uploading', 'downloading', 'merging'].includes(a.status)
                );
                this.state.completedAnalyses = analyses.filter(a => 
                    ['completed', 'failed', 'cancelled'].includes(a.status)
                );
            } else {
                this.state.runningAnalyses = [];
                this.state.completedAnalyses = [];
            }
        } catch (error) {
            console.error('Failed to load analyses:', error);
            this.state.runningAnalyses = [];
            this.state.completedAnalyses = [];
        }

        this.renderRunningAnalyses();
        this.renderAnalysisHistory();
        this.updateRunningCount();
    },

    /**
     * Render running analyses section
     */
    renderRunningAnalyses() {
        const container = document.getElementById('running-analyses-list');
        const countBadge = document.getElementById('running-analyses-count');
        const section = document.getElementById('running-analyses-section');
        
        if (!container) return;

        const running = this.state.runningAnalyses;
        
        if (running.length === 0) {
            container.innerHTML = '<p class="text-muted empty-state">No analyses currently running</p>';
            if (countBadge) countBadge.textContent = '0 active';
            if (section) section.style.display = 'block';
            return;
        }

        if (countBadge) countBadge.textContent = `${running.length} active`;
        
        container.innerHTML = running.map(analysis => `
            <div class="running-analysis-item" data-id="${analysis.id}">
                <div class="analysis-info">
                    <div class="analysis-name">${esc(analysis.config?.analysis_name || analysis.id)}</div>
                    <div class="analysis-status">${this.getStatusLabel(analysis.status)}${analysis.message ? ` · ${esc(analysis.message)}` : ''}</div>
                </div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${analysis.progress || 0}%"></div>
                    </div>
                </div>
                <span class="progress-pct">${analysis.progress || 0}%</span>
                <div class="analysis-controls">
                    <button class="btn-cancel" onclick="ResultsPage.cancelAnalysis('${analysis.id}')">Cancel</button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Sort history by column — toggles direction when same column is clicked
     */
    sortBy(column) {
        if (this.state.sortColumn === column) {
            this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.state.sortColumn = column;
            this.state.sortDir = column === 'date' ? 'desc' : 'asc';
        }
        this.renderAnalysisHistory();
    },

    _updateSortIndicators() {
        document.querySelectorAll('#results-history-table .sort-icon').forEach(el => {
            const col = el.dataset.col;
            if (col === this.state.sortColumn) {
                el.textContent = this.state.sortDir === 'asc' ? '↑' : '↓';
                el.classList.add('sort-active');
            } else {
                el.textContent = '↕';
                el.classList.remove('sort-active');
            }
        });
    },

    /**
     * Render analysis history table
     */
    renderAnalysisHistory() {
        const tbody = document.getElementById('results-history-body');
        if (!tbody) return;

        const analyses = [...this.state.completedAnalyses];
        const isGuest = window.App?.isGuestMode?.() || window.App?.state?.isGuestMode;

        // Sort
        const { sortColumn, sortDir } = this.state;
        analyses.sort((a, b) => {
            let va, vb;
            if (sortColumn === 'date') {
                va = new Date(a.completed_at || a.endTime || a.startTime || 0).getTime();
                vb = new Date(b.completed_at || b.endTime || b.startTime || 0).getTime();
            } else if (sortColumn === 'name') {
                va = (a.analysis_name || a.config?.analysis_name || a.id || '').toLowerCase();
                vb = (b.analysis_name || b.config?.analysis_name || b.id || '').toLowerCase();
            } else if (sortColumn === 'status') {
                va = a.status || '';
                vb = b.status || '';
            } else {
                return 0;
            }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        if (analyses.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-muted" style="text-align: center; padding: 40px;">
                        No analyses found. Start a new analysis to see results here.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = analyses.map(analysis => `
            <tr>
                <td>
                    <div class="cell-with-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        ${esc(analysis.analysis_name || analysis.config?.analysis_name || analysis.id)}
                        ${analysis.synced ? '<span class="synced-indicator" title="Synced to cloud">&#x2601;</span>' : ''}
                    </div>
                </td>
                <td>${this.formatDate(analysis.completed_at || analysis.endTime || analysis.startTime)}</td>
                <td class="text-muted">${analysis.sample_type || analysis.config?.sample_type || '—'}</td>
                <td>${this.getStatusBadge(analysis.status)}</td>
                <td>${this.getPathogenCount(analysis)}</td>
                <td>
                    ${analysis.status === 'completed'
                        ? `<button class="btn-link" onclick="ResultsPage.viewAnalysis('${analysis.id}')">View Report</button>`
                        : `<span class="text-muted">—</span>`
                    }
                </td>
                <td>
                    <div class="result-actions-inline">
                        ${!isGuest && analysis.status === 'completed' && !analysis.synced
                            ? `<button class="result-action-btn btn-upload" onclick="ResultsPage.uploadToCloud('${analysis.id}')" title="Upload to Cloud">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                                    <polyline points="8 14 12 10 16 14"></polyline>
                                    <line x1="12" y1="10" x2="12" y2="18"></line>
                                </svg>
                               </button>`
                            : ''
                        }
                        <button class="result-action-btn btn-delete" onclick="ResultsPage.deleteAnalysis('${analysis.id}')" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        this._updateSortIndicators();
    },

    /**
     * Update running count badge in sidebar
     */
    updateRunningCount() {
        const badge = document.getElementById('running-count');
        if (badge) {
            const count = this.state.runningAnalyses.length;
            badge.textContent = count;
            badge.classList.toggle('hidden', count === 0);
        }
    },

    /**
     * Update a running analysis with progress data
     */
    updateRunningAnalysis(data) {
        const { analysisId, progress, status, message } = data;
        
        let analysis = this.state.runningAnalyses.find(a => a.id === analysisId);

        // If this analysis isn't tracked yet, add it to the running list
        if (!analysis) {
            analysis = {
                id: analysisId,
                config: data.config || {},
                progress: progress || 0,
                status: status || 'running',
                message: message || '',
                startTime: Date.now(),
            };
            this.state.runningAnalyses.push(analysis);
        }

        analysis.progress = progress;
        analysis.status = status;
        analysis.message = message;
        
        // If completed/failed/cancelled, move to completed list
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            this.state.runningAnalyses = this.state.runningAnalyses.filter(a => a.id !== analysisId);
            this.state.completedAnalyses.unshift(analysis);

            // Desktop notification if enabled
            const notificationsEnabled = window.SettingsPage?.settings?.notificationsEnabled ?? true;
            if (notificationsEnabled && 'Notification' in window) {
                if (Notification.permission === 'granted') {
                    new Notification('Pathogenius', {
                        body: status === 'completed'
                            ? `Analysis "${analysis.config?.analysis_name || analysisId}" completed.`
                            : `Analysis "${analysis.config?.analysis_name || analysisId}" failed.`
                    });
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(perm => {
                        if (perm === 'granted') {
                            new Notification('Pathogenius', {
                                body: `Analysis "${analysis.config?.analysis_name || analysisId}" ${status}.`
                            });
                        }
                    });
                }
            }
        }
        
        this.renderRunningAnalyses();
        this.renderAnalysisHistory();
        this.updateRunningCount();
    },

    /**
     * Show history view
     */
    showHistoryView() {
        this.state.view = 'history';
        
        const historySection = document.getElementById('analysis-history-section');
        const runningSection = document.getElementById('running-analyses-section');
        const detailView = document.getElementById('results-detail-view');
        
        if (historySection) historySection.classList.remove('hidden');
        if (runningSection) runningSection.classList.remove('hidden');
        if (detailView) detailView.classList.add('hidden');
    },

    /**
     * View a specific analysis
     */
    async viewAnalysis(analysisId) {
        this.state.selectedAnalysisId = analysisId;
        this.state.currentResult = null;

        try {
            if (window.api?.analysis?.getResults) {
                const result = await window.api.analysis.getResults(analysisId);
                if (result) {
                    this.state.currentResult = result.result || result.results || result.data || result;
                }
            }

            if (!this.state.currentResult) {
                const analysis = this.state.completedAnalyses.find(a => a.id === analysisId);
                this.state.currentResult = analysis?.results || null;
            }
        } catch (error) {
            console.error('Failed to load result:', error);
            this.state.currentResult = null;
        }
        this.showDetailView();
    },

    /**
     * Show detail view for selected analysis
     */
    showDetailView() {
        this.state.view = 'detail';
        
        const historySection = document.getElementById('analysis-history-section');
        const runningSection = document.getElementById('running-analyses-section');
        const detailView = document.getElementById('results-detail-view');
        
        if (historySection) historySection.classList.add('hidden');
        if (runningSection) runningSection.classList.add('hidden');
        if (detailView) detailView.classList.remove('hidden');
        
        // Update detail view content
        this.updateDetailView();
    },

    /**
     * Update detail view with current result
     */
    updateDetailView() {
        const result = this.state.currentResult;
        if (!result) return;

        // Update title
        const nameEl = document.getElementById('detail-analysis-name');
        const subtitleEl = document.getElementById('results-subtitle');

        if (nameEl) nameEl.textContent = result.analysis_name || 'Analysis Result';
        const classifierLabel = result.classifier ? ` · ${result.classifier}` : '';
        if (subtitleEl) subtitleEl.textContent = `Completed on ${this.formatDate(result.completed_at)}${classifierLabel}`;

        // Render pathogen cards
        this.renderPathogenCards();
        
        // Render pathogen details tab
        this.renderPathogenDetails(result);
        
        // Render charts
        this.renderCharts(result);

        // Show/hide AI summary card based on setting (read localStorage as fallback)
        const aiCard = document.getElementById('ai-summary-card');
        const localAiEnabled = this._getSetting('localAiEnabled', true);
        if (aiCard) aiCard.classList.toggle('hidden', !localAiEnabled);

        // Reset AI summary section
        this.resetAISummary();

        // Check LLM status
        if (localAiEnabled) this.updateLLMStatus();
    },

    /**
     * Reset AI summary content when switching analyses
     */
    resetAISummary() {
        const content = document.getElementById('ai-summary-content');
        const btn = document.getElementById('generate-summary-btn');
        if (content) {
            content.innerHTML = '<p class="text-muted" style="font-style: italic;">Click "Generate Summary" to analyze results with the local MedGemma AI model.</p>';
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg> Generate Summary`;
        }
    },

    /**
     * Check and display LLM model status
     */
    async updateLLMStatus() {
        const indicator = document.getElementById('llm-status-indicator');
        if (!indicator) return;

        try {
            if (!window.api?.llm?.getStatus) {
                indicator.textContent = 'LLM API unavailable';
                indicator.style.color = 'var(--danger)';
                return;
            }
            const status = await window.api.llm.getStatus();
            if (status.isLoaded) {
                indicator.textContent = 'Model ready';
                indicator.style.color = 'var(--success)';
            } else if (status.isLoading) {
                indicator.textContent = 'Model loading...';
                indicator.style.color = 'var(--warning)';
            } else if (status.loadError) {
                indicator.textContent = 'Model error';
                indicator.style.color = 'var(--danger)';
            } else {
                indicator.textContent = 'Model not loaded';
                indicator.style.color = 'var(--text-muted)';
            }
        } catch {
            indicator.textContent = '';
        }
    },

    /**
     * Generate AI clinical summary using the local LLM
     */
    /**
     * Read a setting from SettingsPage or localStorage fallback
     */
    _getSetting(key, defaultVal) {
        if (window.SettingsPage?.settings && key in window.SettingsPage.settings) {
            return window.SettingsPage.settings[key];
        }
        try {
            const saved = JSON.parse(localStorage.getItem('pathogenius_settings') || '{}');
            return key in saved ? saved[key] : defaultVal;
        } catch { return defaultVal; }
    },

    async generateAISummary() {
        const result = this.state.currentResult;
        if (!result) return;
        if (!this._getSetting('localAiEnabled', true)) return;

        const content = document.getElementById('ai-summary-content');
        const btn = document.getElementById('generate-summary-btn');
        if (!content || !btn) return;

        // Disable button and show loading state
        btn.disabled = true;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" class="icon-spin"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> Generating...`;

        content.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; padding: 16px 0;">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="24" height="24" class="icon-spin"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                <span class="text-muted">Generating clinical summary — this may take a moment...</span>
            </div>
            <div id="ai-summary-stream" class="summary-text" style="white-space: pre-wrap; min-height: 60px;"></div>
        `;

        const streamEl = document.getElementById('ai-summary-stream');

        try {
            // Check LLM status first
            if (!window.api?.llm) {
                throw new Error('LLM service is not available.');
            }

            const status = await window.api.llm.getStatus();

            // If model isn't loaded, try loading it
            if (!status.isLoaded && !status.isLoading) {
                content.querySelector('.text-muted').textContent = 'Loading AI model into memory — first run may take a minute...';
                await window.api.llm.loadModel();
            } else if (status.isLoading) {
                content.querySelector('.text-muted').textContent = 'AI model is loading, please wait...';
                // Poll until loaded
                await new Promise((resolve, reject) => {
                    const poll = setInterval(async () => {
                        const s = await window.api.llm.getStatus();
                        if (s.isLoaded) { clearInterval(poll); resolve(); }
                        if (s.loadError) { clearInterval(poll); reject(new Error(s.loadError)); }
                    }, 1000);
                });
            } else if (status.loadError) {
                throw new Error(`Model failed to load: ${status.loadError}`);
            }

            // Set up streaming token listener
            let fullText = '';
            window.api.llm.removeTokenListener();
            window.api.llm.onToken((chunk) => {
                fullText += chunk;
                if (streamEl) {
                    streamEl.textContent = fullText;
                    // Auto-scroll parent if needed
                    streamEl.scrollTop = streamEl.scrollHeight;
                }
            });

            // Hide the loading spinner once streaming starts
            const loadingMsg = content.querySelector('.text-muted');

            // Call generate summary
            const response = await window.api.llm.generateSummary(result);

            // Clean up token listener
            window.api.llm.removeTokenListener();

            if (!response.success) {
                throw new Error(response.error || 'Summary generation failed.');
            }

            // Render final formatted summary
            const finalText = response.response || fullText;
            content.innerHTML = `
                <div class="summary-text" style="white-space: pre-wrap; line-height: 1.7;">${this.escapeHtml(finalText)}</div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center;">
                    <span class="text-muted" style="font-size: 0.8rem;">Generated by MedGemma (local model) — not a clinical diagnosis</span>
                    <button class="btn btn-outline btn-sm" onclick="ResultsPage.generateAISummary()">Regenerate</button>
                </div>
            `;

            // Update button
            btn.disabled = false;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg> Regenerate`;

            this.updateLLMStatus();

        } catch (error) {
            console.error('AI Summary generation failed:', error);
            window.api?.llm?.removeTokenListener?.();

            content.innerHTML = `
                <div class="alert alert-danger" style="margin: 0;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                    <div>
                        <strong>Failed to generate summary</strong>
                        <p style="margin: 4px 0 0;">${this.escapeHtml(error.message)}</p>
                    </div>
                </div>
            `;

            btn.disabled = false;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg> Retry`;
        }
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Render pathogen details in the Pathogen Details tab
     */
    renderPathogenDetails(result) {
        const container = document.getElementById('tab-pathogens');
        if (!container) return;

        const pathogens = result?.pathogens || [];

        if (!pathogens.length) {
            container.innerHTML = `
                <div class="card">
                    <p class="text-muted">No pathogen detail data available.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = pathogens.map(p => {
            const risk = (p.risk_level || 'low').toLowerCase();
            return `
                <div class="pathogen-detail-card">
                    <div class="pathogen-detail-header">
                        <div>
                            <h3>${esc(p.name)}</h3>
                            <p class="pathogen-strain">Strain: ${esc(p.strain || 'Unknown')}</p>
                        </div>
                        <span class="risk-badge risk-${risk}">${esc(this.capitalize(risk))} Risk</span>
                    </div>

                    <div class="pathogen-detail-stats">
                        <div class="detail-stat">
                            <span class="detail-label">Relative Abundance</span>
                            <span class="detail-value">${p.abundance ?? 0}%</span>
                        </div>
                        <div class="detail-stat">
                            <span class="detail-label">Read Count</span>
                            <span class="detail-value">${this.formatReads(p.reads || 0)}</span>
                        </div>
                        <div class="detail-stat">
                            <span class="detail-label">Confidence Score</span>
                            <span class="detail-value text-primary">${p.confidence ?? 'N/A'}%</span>
                        </div>
                        <div class="detail-stat">
                            <span class="detail-label">AMR Genes Detected</span>
                            <span class="detail-value">${p.amr_genes || 0}</span>
                        </div>
                    </div>

                    <div class="alert alert-danger-light">
                        <strong>Virulence Factors</strong>
                        <p>${p.virulence_genes || 0} virulence gene(s) reported for this pathogen.</p>
                    </div>

                    <div class="alert alert-info">
                        <strong>Taxonomy</strong>
                        <p>Tax ID: ${esc(p.tax_id || 'Unknown')}</p>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Render interactive charts with result data
     */
    renderCharts(result) {
        // Wait for Charts module to be available
        if (!window.Charts) {
            console.warn('Charts module not loaded');
            return;
        }

        const treemapData = Charts.transformApiData(result, 'treemap');
        const sunburstData = Charts.transformApiData(result, 'sunburst');
        const sankeyData = Charts.transformApiData(result, 'sankey');
        const radarData = Charts.transformApiData(result, 'radar');

        // Render treemap
        setTimeout(() => {
            Charts.renderTreemap('abundance-treemap-chart', treemapData);
        }, 100);

        // Render sunburst with taxonomy data
        setTimeout(() => {
            Charts.renderSunburst('sunburst-chart', sunburstData);
        }, 150);

        // Render sankey diagram
        setTimeout(() => {
            Charts.renderSankey('sankey-chart', sankeyData);
        }, 200);

        // Render radar chart for comparative analysis
        setTimeout(() => {
            Charts.renderRadar('radar-chart', radarData);
        }, 250);
    },

    /**
     * Deterministic hash -> 0..1 for stable shading per label
     */
    hashToUnit(str = '') {
        let h = 2166136261; // FNV-1a base
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        // unsigned -> 0..1
        return (h >>> 0) / 4294967295;
    },

    /**
     * Mix two hex colors (t in [0..1]): returns hex
     */
    mixHex(hexA, hexB, t) {
        const toRgb = (hex) => {
            const h = hex.replace('#', '').trim();
            const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        };
        const toHex = ({ r, g, b }) => {
            const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
            return '#' + [clamp(r), clamp(g), clamp(b)]
                .map(v => v.toString(16).padStart(2, '0'))
                .join('');
        };

        const a = toRgb(hexA);
        const b = toRgb(hexB);
        return toHex({
            r: a.r + (b.r - a.r) * t,
            g: a.g + (b.g - a.g) * t,
            b: a.b + (b.b - a.b) * t
        });
    },

    /**
     * Base risk color + deterministic shade per key (species name/strain/etc.)
     * Keeps risk semantics but improves adjacent readability.
     */
    getRiskColorShaded(riskLevel, shadeKey) {
        const base = {
            high:   '#EF4444',
            medium: '#F59E0B',
            low:    '#10B981'
        }[(riskLevel || '').toLowerCase()] || '#9CA3AF';

        // deterministically choose a mix amount for this species
        // range keeps it subtle: 0.12..0.35
        const u = this.hashToUnit(shadeKey || '');
        const t = 0.12 + (0.35 - 0.12) * u;

        // alternate between lightening and darkening in a stable way
        // even/odd bucket from hash:
        const lighten = u < 0.5;

        // mix with white to lighten or with black to darken
        return lighten
            ? this.mixHex(base, '#FFFFFF', t)
            : this.mixHex(base, '#000000', t * 0.55); // darkening needs less mix to stay readable
    },



    /**
     * Cancel a running analysis
     */
    async cancelAnalysis(analysisId) {
        if (!confirm('Are you sure you want to cancel this analysis?')) return;

        try {
            if (window.api?.analysis?.cancel) {
                await window.api.analysis.cancel(analysisId);
                this.loadAnalyses();
            } else {
                // Mock for development
                const analysis = this.state.runningAnalyses.find(a => a.id === analysisId);
                if (analysis) {
                    analysis.status = 'cancelled';
                    this.state.runningAnalyses = this.state.runningAnalyses.filter(a => a.id !== analysisId);
                    this.state.completedAnalyses.unshift(analysis);
                    this.renderRunningAnalyses();
                    this.renderAnalysisHistory();
                    this.updateRunningCount();
                }
            }
        } catch (error) {
            console.error('Failed to cancel analysis:', error);
        }
    },

    /**
     * Delete an analysis result
     */
    async deleteAnalysis(analysisId) {
        if (!confirm('Are you sure you want to delete this analysis? This action cannot be undone.')) return;

        try {
            if (window.api?.analysis?.delete) {
                const result = await window.api.analysis.delete(analysisId);
                if (result.success) {
                    // Remove from localCopyIds so the cloud tab reverts to "Cloud only"
                    this.state.localCopyIds.delete(analysisId);
                    // Update cloud results state too (no re-fetch needed)
                    const idx = this.state.cloudResults.findIndex(r => r.id === analysisId);
                    if (idx !== -1) this.state.cloudResults[idx].localCopy = false;
                    this.loadAnalyses();
                }
            } else {
                this.state.completedAnalyses = this.state.completedAnalyses.filter(a => a.id !== analysisId);
                this.state.localCopyIds.delete(analysisId);
                this.renderAnalysisHistory();
            }
        } catch (error) {
            console.error('Failed to delete analysis:', error);
            alert('Failed to delete analysis');
        }
    },

    /**
     * Filter analyses by search term
     */
    filterAnalyses(searchTerm) {
        const term = searchTerm.toLowerCase();
        const rows = document.querySelectorAll('#results-history-body tr');
        
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    },

    /**
     * Render pathogen cards in overview tab
     */
    renderPathogenCards() {
        const container = document.getElementById('pathogen-cards-overview');
        if (!container) return;

        const pathogens = this.state.currentResult?.pathogens || [];

        if (pathogens.length === 0) {
            container.innerHTML = '<p class="text-muted">No pathogens detected in this sample.</p>';
            return;
        }

        // Apply confidence threshold filter from settings
        const threshold = this._getSetting('confidenceThreshold', 0.7) * 100;
        const showLow = this._getSetting('showLowConfidenceResults', false);
        const minReads = this._getSetting('minReadCount', 100);

        const filtered = pathogens.filter(p =>
            (showLow || p.confidence == null || p.confidence >= threshold) &&
            (p.reads == null || p.reads >= minReads)
        );

        if (filtered.length === 0) {
            container.innerHTML = '<p class="text-muted">No pathogens meet the current confidence threshold.</p>';
            return;
        }

        container.innerHTML = filtered.slice(0, 4).map(p => `
            <div class="pathogen-card ${p.risk_level === 'high' ? 'pathogen-card-critical' : ''}">
                <div class="pathogen-header">
                    <div>
                        <h4>${esc(p.name)}</h4>
                        <span class="pathogen-strain">${esc(p.strain || 'Unknown strain')}</span>
                    </div>
                    <div class="confidence-badge confidence-${this.getConfidenceLevel(p.confidence)}">
                        <span class="confidence-value">${p.confidence != null ? p.confidence + '%' : '—'}</span>
                        <span class="confidence-label">Confidence</span>
                    </div>
                </div>
                <div class="pathogen-metrics-row">
                    <div class="pathogen-metric-item">
                        <span class="metric-value-lg">${p.abundance != null ? p.abundance + '%' : '—'}</span>
                        <span class="metric-label">Abundance</span>
                    </div>
                    <div class="pathogen-metric-item">
                        <span class="metric-value-lg">${p.reads != null ? this.formatReads(p.reads) : '—'}</span>
                        <span class="metric-label">Reads</span>
                    </div>
                    ${p.amr_genes != null ? `
                    <div class="pathogen-metric-item">
                        <span class="metric-value-lg ${p.amr_genes > 0 ? 'text-danger' : ''}">${p.amr_genes}</span>
                        <span class="metric-label">AMR Genes</span>
                    </div>` : ''}
                </div>
                <div class="pathogen-confidence-bar">
                    <div class="confidence-bar-track">
                        <div class="confidence-bar-fill confidence-fill-${this.getConfidenceLevel(p.confidence)}" style="width: ${p.confidence || 0}%"></div>
                    </div>
                    <span class="confidence-bar-label">${this.getConfidenceLabel(p.confidence)}</span>
                </div>
                <div class="pathogen-footer">
                    <span class="risk-badge risk-${p.risk_level || 'low'}">${this.capitalize(p.risk_level || 'unknown')} Risk</span>
                    ${p.virulence_genes != null ? `<span class="virulence-count">${p.virulence_genes} virulence genes</span>` : ''}
                </div>
            </div>
        `).join('');
    },

    /**
     * Get confidence label based on score
     */
    getConfidenceLabel(confidence) {
        if (confidence >= 90) return 'Very High Confidence';
        if (confidence >= 80) return 'High Confidence';
        if (confidence >= 70) return 'Moderate Confidence';
        if (confidence >= 60) return 'Low Confidence';
        return 'Very Low Confidence';
    },

    /**
     * Get confidence level category
     */
    getConfidenceLevel(confidence) {
        if (confidence >= 90) return 'high';
        if (confidence >= 70) return 'medium';
        return 'low';
    },

    /**
     * Get status badge HTML
     */
    getStatusBadge(status) {
        const badges = {
            'completed': `<span class="status-badge status-completed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Completed</span>`,
            'failed': `<span class="status-badge status-failed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Failed</span>`,
            'cancelled': `<span class="status-badge status-failed">Cancelled</span>`,
            'running': `<span class="status-badge status-running"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> Running</span>`,
            'paused': `<span class="status-badge status-paused"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> Paused</span>`
        };
        return badges[status] || badges['failed'];
    },

    /**
     * Get status label text
     */
    getStatusLabel(status) {
        const labels = {
            'starting': 'Starting...',
            'running': 'Running',
            'paused': 'Paused',
            'preprocessing': 'Preprocessing',
            'classifying': 'Classifying reads',
            'processing': 'Processing results',
            'finalizing': 'Finalizing'
        };
        return labels[status] || status;
    },

    /**
     * Get pathogen count for display
     */
    getPathogenCount(analysis) {
        const count = analysis.results?.pathogens?.length ||
                     analysis.pathogens?.length ||
                     analysis.summary?.pathogens_detected ||
                     analysis.summary?.species_detected || 0;

        if (count === 0) return '—';
        return `${count} detected`;
    },

    /**
     * Export results
     */
    async exportResult(format = 'pdf') {
        const result = this.state.currentResult;
        if (!result) { alert('No result loaded to export.'); return; }

        if (format === 'json') {
            const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${result.analysis_name || 'analysis'}_results.json`;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }

        if (format === 'pdf') {
            const esc2 = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const name       = result.analysis_name || 'Analysis';
            const dateObj    = result.completed_at ? new Date(result.completed_at) : null;
            const dateStr    = dateObj ? dateObj.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';
            const timeStr    = dateObj ? dateObj.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' }) : '';
            const reportId   = (result.id || Date.now().toString(36)).toUpperCase();
            const pathogens  = (result.pathogens || []).slice().sort((a, b) => {
                const order = { high: 0, medium: 1, low: 2 };
                return (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3);
            });
            const quality    = result.quality || {};
            const engine     = result.engine || result.config?.engine || '—';
            const classifier = result.classifier || result.config?.classifier || '—';
            const confThresh = result.confidence_threshold ?? result.config?.confidence_threshold ?? '—';
            const inputFiles = (result.input_files || result.config?.input_files || []);
            const aiSummary  = document.getElementById('ai-summary-content')?.innerText?.trim() || '';

            const highRisk   = pathogens.filter(p => p.risk_level === 'high').length;
            const medRisk    = pathogens.filter(p => p.risk_level === 'medium').length;
            const lowRisk    = pathogens.filter(p => p.risk_level === 'low').length;

            const riskLabel = (r) => {
                const map = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };
                return map[r] || (r ? r.toUpperCase() : 'UNKNOWN');
            };
            const riskClass = (r) => ({ high: 'risk-high', medium: 'risk-medium', low: 'risk-low' }[r] || '');

            const dl = (label, value) => value && value !== '—'
                ? `<tr><td class="dl-label">${esc2(label)}</td><td class="dl-value">${esc2(value)}</td></tr>`
                : '';

            const summaryRows = pathogens.map((p, i) => {
                const amr = Array.isArray(p.amr_genes) ? p.amr_genes.join(', ') : (p.amr_genes != null ? String(p.amr_genes) : '');
                return `<tr class="${i % 2 === 1 ? 'row-alt' : ''}">
  <td style="font-style:italic;">${esc2(p.name || '—')}</td>
  <td>${esc2(p.strain || '—')}</td>
  <td class="num">${p.abundance != null ? esc2(p.abundance) + '%' : '—'}</td>
  <td class="num">${p.reads != null ? Number(p.reads).toLocaleString() : '—'}</td>
  <td class="num">${p.confidence != null ? esc2(p.confidence) + '%' : '—'}</td>
  <td class="num"><span class="${riskClass(p.risk_level)}">${riskLabel(p.risk_level)}</span></td>
  <td>${esc2(amr || '—')}</td>
</tr>`;
            }).join('');

            const detailBlocks = pathogens.map((p, i) => {
                const amr = Array.isArray(p.amr_genes) ? p.amr_genes.join('; ') : (p.amr_genes != null ? String(p.amr_genes) : '—');
                const vir = Array.isArray(p.virulence_genes) ? p.virulence_genes.join('; ') : (p.virulence_genes != null ? String(p.virulence_genes) : '—');
                return `<div class="organism-block">
  <div class="organism-header">
    <span class="organism-index">${i + 1}.</span>
    <span class="organism-name">${esc2(p.name || 'Unknown Organism')}</span>
    <span class="risk-tag ${riskClass(p.risk_level)}">${riskLabel(p.risk_level)} RISK</span>
  </div>
  ${p.strain ? `<div class="organism-strain">${esc2(p.strain)}</div>` : ''}
  <table class="detail-table">
    ${dl('Taxonomic ID', p.tax_id)}
    ${dl('Relative Abundance', p.abundance != null ? p.abundance + '%' : null)}
    ${dl('Assigned Reads', p.reads != null ? Number(p.reads).toLocaleString() : null)}
    ${dl('Classification Confidence', p.confidence != null ? p.confidence + '%' : null)}
    ${dl('AMR Genes Detected', amr !== '—' ? amr : null)}
    ${dl('Virulence Genes', vir !== '—' ? vir : null)}
  </table>
</div>`;
            }).join('');

            const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Pathogenius Report — ${esc2(name)}</title>
<style>
  @page {
    size: A4;
    margin: 14mm 15mm 14mm 15mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 9pt; color: #111; background: #fff; line-height: 1.45; }
  a { color: inherit; text-decoration: none; }

  /* ── Letterhead ── */
  .letterhead { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 7px; border-bottom: 2.5px solid #111; margin-bottom: 5px; }
  .lh-brand { font-family: Arial, sans-serif; }
  .lh-brand .brand-name { font-size: 18pt; font-weight: 700; letter-spacing: -0.5px; color: #111; }
  .lh-brand .brand-sub  { font-size: 7.5pt; color: #555; letter-spacing: 1px; text-transform: uppercase; }
  .lh-meta { text-align: right; font-family: Arial, sans-serif; font-size: 7.5pt; color: #444; line-height: 1.6; }
  .report-title-bar { background: #111; color: #fff; padding: 4px 8px; margin-bottom: 12px; font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }

  /* ── Sections ── */
  .section { margin-bottom: 14px; page-break-inside: avoid; }
  .section-heading {
    font-family: Arial, sans-serif; font-size: 7.5pt; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1.2px; color: #111;
    border-bottom: 1.5px solid #111; padding-bottom: 2px; margin-bottom: 7px;
  }

  /* ── Key-value definition list ── */
  table.kv { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  table.kv td { padding: 2px 6px 2px 0; vertical-align: top; }
  table.kv td:first-child { width: 36%; color: #444; font-family: Arial, sans-serif; font-size: 8pt; padding-right: 10px; }

  /* ── Summary statistics row ── */
  .stat-row { display: flex; gap: 0; border: 1px solid #bbb; margin-bottom: 10px; }
  .stat-cell { flex: 1; padding: 7px 10px; border-right: 1px solid #bbb; text-align: center; }
  .stat-cell:last-child { border-right: none; }
  .stat-num  { font-family: Arial, sans-serif; font-size: 16pt; font-weight: 700; line-height: 1; }
  .stat-num.high   { color: #b91c1c; }
  .stat-num.medium { color: #92400e; }
  .stat-num.low    { color: #166534; }
  .stat-lbl  { font-family: Arial, sans-serif; font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.5px; color: #555; margin-top: 2px; }

  /* ── Main summary table ── */
  table.main-table { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
  table.main-table thead tr { background: #111; color: #fff; }
  table.main-table th { font-family: Arial, sans-serif; font-size: 7pt; font-weight: 600; padding: 4px 7px; text-align: left; text-transform: uppercase; letter-spacing: 0.3px; }
  table.main-table td { padding: 3.5px 7px; border-bottom: 1px solid #e4e4e4; vertical-align: top; }
  table.main-table .row-alt { background: #f5f5f5; }
  table.main-table .num { text-align: right; font-family: Arial, sans-serif; }

  /* ── Risk labels ── */
  .risk-high   { color: #b91c1c; font-family: Arial, sans-serif; font-size: 7.5pt; font-weight: 700; }
  .risk-medium { color: #92400e; font-family: Arial, sans-serif; font-size: 7.5pt; font-weight: 700; }
  .risk-low    { color: #166534; font-family: Arial, sans-serif; font-size: 7.5pt; font-weight: 700; }

  /* ── Organism detail blocks ── */
  .organism-block { border: 1px solid #ccc; padding: 7px 10px; margin-bottom: 7px; page-break-inside: avoid; }
  .organism-header { display: flex; align-items: baseline; gap: 7px; margin-bottom: 3px; }
  .organism-index  { font-family: Arial, sans-serif; font-size: 8pt; font-weight: 700; color: #555; }
  .organism-name   { font-size: 9.5pt; font-weight: 700; font-style: italic; flex: 1; }
  .organism-strain { font-size: 8pt; font-style: italic; color: #555; margin-bottom: 4px; }
  .risk-tag  { font-family: Arial, sans-serif; font-size: 7pt; font-weight: 700; font-style: normal; letter-spacing: 0.3px; padding: 1px 4px; border: 1px solid; }
  .risk-tag.risk-high   { border-color: #b91c1c; color: #b91c1c; }
  .risk-tag.risk-medium { border-color: #92400e; color: #92400e; }
  .risk-tag.risk-low    { border-color: #166534; color: #166534; }
  table.detail-table { border-collapse: collapse; width: 100%; font-size: 8.5pt; margin-top: 4px; }
  .dl-label { width: 32%; color: #444; font-family: Arial, sans-serif; font-size: 8pt; padding: 1.5px 8px 1.5px 0; vertical-align: top; }
  .dl-value { padding: 1.5px 0; vertical-align: top; }

  /* ── AI summary ── */
  .ai-section { border-left: 2.5px solid #555; padding: 6px 10px; font-size: 8.5pt; line-height: 1.6; white-space: pre-wrap; color: #222; page-break-inside: avoid; }
  .ai-label { font-family: Arial, sans-serif; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.7px; color: #555; margin-bottom: 4px; }

  /* ── Disclaimer & footer ── */
  .disclaimer { border-top: 1px solid #ccc; margin-top: 16px; padding-top: 7px; font-family: Arial, sans-serif; font-size: 7pt; color: #555; line-height: 1.55; }
  .doc-footer { margin-top: 8px; font-family: Arial, sans-serif; font-size: 7pt; color: #888; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 6px; }

  @media print {
    .organism-block { page-break-inside: avoid; }
    .section { page-break-inside: avoid; }
  }
</style>
</head><body>

<!-- Letterhead -->
<div class="letterhead">
  <div class="lh-brand">
    <div class="brand-name">Pathogenius</div>
    <div class="brand-sub">Metagenomic Pathogen Detection System</div>
  </div>
  <div class="lh-meta">
    Report ID: ${esc2(reportId)}<br>
    Date: ${esc2(dateStr)}${timeStr ? ' &bull; ' + esc2(timeStr) : ''}<br>
    Generated: ${esc2(new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }))}
  </div>
</div>
<div class="report-title-bar">Metagenomic Analysis Report</div>

<!-- Section 1: Analysis Information -->
<div class="section">
  <div class="section-heading">1. Analysis Information</div>
  <table class="kv">
    <tr><td>Analysis Name</td><td>${esc2(name)}</td></tr>
    <tr><td>Sample Type</td><td>${esc2(result.sample_type || '—')}</td></tr>
    <tr><td>Date Completed</td><td>${esc2(dateStr)}${timeStr ? ', ' + esc2(timeStr) : ''}</td></tr>
    <tr><td>Classification Engine</td><td>${esc2(classifier)}${engine !== '—' ? ' (' + esc2(engine) + ')' : ''}</td></tr>
    <tr><td>Confidence Threshold</td><td>${confThresh !== '—' ? esc2(confThresh) + '%' : '—'}</td></tr>
    ${inputFiles.length > 0 ? `<tr><td>Input File(s)</td><td style="font-size:9pt;">${inputFiles.map(f => esc2(f)).join('<br>')}</td></tr>` : ''}
  </table>
</div>

<!-- Section 2: Executive Summary -->
<div class="section">
  <div class="section-heading">2. Executive Summary</div>
  <div class="stat-row">
    <div class="stat-cell"><div class="stat-num">${pathogens.length}</div><div class="stat-lbl">Total Detected</div></div>
    <div class="stat-cell"><div class="stat-num high">${highRisk}</div><div class="stat-lbl">High Risk</div></div>
    <div class="stat-cell"><div class="stat-num medium">${medRisk}</div><div class="stat-lbl">Medium Risk</div></div>
    <div class="stat-cell"><div class="stat-num low">${lowRisk}</div><div class="stat-lbl">Low Risk</div></div>
    ${quality.high_quality_rate != null ? `<div class="stat-cell"><div class="stat-num">${esc2(quality.high_quality_rate)}%</div><div class="stat-lbl">High-Quality Reads</div></div>` : ''}
  </div>
  <p style="font-size:9.5pt;color:#333;">
    ${pathogens.length === 0
      ? 'No pathogenic organisms were detected in this sample at the configured confidence threshold.'
      : `This analysis identified <strong>${pathogens.length}</strong> organism${pathogens.length !== 1 ? 's' : ''}` +
        (highRisk > 0 ? `, including <strong>${highRisk}</strong> high-risk pathogen${highRisk !== 1 ? 's' : ''}` : '') +
        '. Refer to Sections 3 and 4 for detailed findings.'}
  </p>
</div>

${(quality.average_quality != null || quality.mean_coverage != null || quality.high_quality_rate != null) ? `
<!-- Section 3: Sequencing Quality -->
<div class="section">
  <div class="section-heading">3. Sequencing Quality Metrics</div>
  <table class="kv">
    ${quality.average_quality != null ? `<tr><td>Average Quality Score</td><td>${esc2(quality.average_quality)}</td></tr>` : ''}
    ${quality.high_quality_rate != null ? `<tr><td>High-Quality Read Rate</td><td>${esc2(quality.high_quality_rate)}%</td></tr>` : ''}
    ${quality.mean_coverage != null ? `<tr><td>Mean Coverage Depth</td><td>${esc2(quality.mean_coverage)}&times;</td></tr>` : ''}
    ${quality.note ? `<tr><td>Quality Note</td><td style="font-style:italic;">${esc2(quality.note)}</td></tr>` : ''}
  </table>
</div>` : ''}

<!-- Section 4: Detected Organisms — Summary Table -->
<div class="section">
  <div class="section-heading">${quality.average_quality != null || quality.mean_coverage != null || quality.high_quality_rate != null ? '4' : '3'}. Detected Organisms</div>
  ${pathogens.length === 0 ? `<p style="font-style:italic;color:#555;">No organisms detected above the confidence threshold.</p>` : `
  <table class="main-table">
    <thead>
      <tr>
        <th>Organism</th>
        <th>Strain / Variant</th>
        <th style="text-align:right">Abundance</th>
        <th style="text-align:right">Reads</th>
        <th style="text-align:right">Confidence</th>
        <th style="text-align:right">Risk Level</th>
        <th>AMR Genes</th>
      </tr>
    </thead>
    <tbody>${summaryRows}</tbody>
  </table>`}
</div>

${pathogens.length > 0 ? `
<!-- Section 5: Detailed Profiles -->
<div class="section">
  <div class="section-heading">${quality.average_quality != null || quality.mean_coverage != null || quality.high_quality_rate != null ? '5' : '4'}. Detailed Organism Profiles</div>
  ${detailBlocks}
</div>` : ''}

${aiSummary ? `
<!-- Section: AI Clinical Interpretation -->
<div class="section">
  <div class="section-heading">Clinical Interpretation (AI-Generated)</div>
  <div class="ai-label">The following summary was generated by an AI model and has not been reviewed by a clinician.</div>
  <div class="ai-section">${esc2(aiSummary)}</div>
</div>` : ''}

<!-- Disclaimer -->
<div class="disclaimer">
  <strong>Medical Disclaimer.</strong> This report is produced by the Pathogenius software system for informational and research purposes only. Results have not been validated by a licensed clinical laboratory and do not constitute a medical diagnosis. All findings should be interpreted by a qualified healthcare professional in the context of clinical presentation and other diagnostic data. Pathogenius and its developers assume no liability for clinical decisions made on the basis of this report.
</div>

<div class="doc-footer">
  Pathogenius Metagenomic Analysis System &bull; Report ID: ${esc2(reportId)} &bull; Generated ${esc2(new Date().toLocaleString())}
</div>

</body></html>`;

            if (window.api?.system?.printReport) {
                const res = await window.api.system.printReport(html);
                if (!res?.success) alert('Failed to open report: ' + (res?.error || 'unknown error'));
            } else {
                // Fallback: data URI download
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${name.replace(/[^a-z0-9]/gi, '_')}_report.html`;
                a.click(); URL.revokeObjectURL(url);
            }
            return;
        }

        alert(`Unknown export format: ${format}`);
    },

    // HELPER FUNCTIONS (delegating to Utils)

    formatReads(reads) {
        return Utils.formatReads(reads);
    },

    formatDate(dateStr) {
        return Utils.formatDateTime(dateStr);
    },

    capitalize(str) {
        return Utils.capitalize(str);
    },

    // CLOUD RESULTS SECTION

    /**
     * Switch between local and cloud results
     * @param {string} source - 'local' or 'cloud'
     */
    switchSource(source) {
        this.state.currentSource = source;
        
        // Update tab buttons
        document.querySelectorAll('.source-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.source === source);
        });

        // Toggle sections
        const localSection = document.getElementById('local-results-section');
        const cloudSection = document.getElementById('cloud-results-section');
        const runningSection = document.getElementById('running-analyses-section');

        if (source === 'local') {
            if (localSection) localSection.classList.remove('hidden');
            if (cloudSection) cloudSection.classList.add('hidden');
            if (runningSection) runningSection.classList.remove('hidden');
        } else {
            if (localSection) localSection.classList.add('hidden');
            if (cloudSection) cloudSection.classList.remove('hidden');
            if (runningSection) runningSection.classList.add('hidden');
            
            // Check if guest mode and load cloud results
            this.loadCloudResults();
        }
    },

    /**
     * Load cloud results
     */
    async loadCloudResults() {
        const guestWarning = document.getElementById('cloud-guest-warning');
        const cloudContent = document.getElementById('cloud-results-content');
        const statusBanner = document.getElementById('cloud-connection-status');
        const statusText = document.getElementById('cloud-status-text');

        // Check if in guest mode
        const isGuest = window.App?.isGuestMode?.() || window.App?.state?.isGuestMode;
        
        if (isGuest) {
            if (guestWarning) guestWarning.classList.remove('hidden');
            if (cloudContent) cloudContent.classList.add('hidden');
            if (statusBanner) statusBanner.classList.add('hidden');
            return;
        }

        if (guestWarning) guestWarning.classList.add('hidden');
        if (cloudContent) cloudContent.classList.remove('hidden');
        if (statusBanner) statusBanner.classList.remove('hidden');

        // Check connection status
        try {
            if (statusText) statusText.textContent = 'Connecting to cloud...';
            if (statusBanner) {
                statusBanner.classList.remove('connected', 'offline');
            }

            // Fetch cloud results from Firebase Storage metadata
            if (window.api?.cloud?.getResults) {
                const response = await window.api.cloud.getResults();
                if (response.success) {
                    // Map Firestore metadata fields to display fields
                    this.state.cloudResults = (response.results || []).map(r => ({
                        id: r.analysisId,
                        name: (r.sampleName && r.sampleName !== 'undefined') ? r.sampleName : (r.analysisId || 'Unknown'),
                        uploadedAt: r.completedAt || r.updatedAt,
                        sampleType: r.sampleType || '—',
                        size: null,
                        localCopy: this.state.localCopyIds.has(r.analysisId) ||
                                   this.state.completedAnalyses.some(a => a.id === r.analysisId),
                        cloudPath: r.cloudPath
                    }));
                } else {
                    throw new Error(response.error || 'Failed to load cloud results');
                }
                if (statusText) statusText.textContent = 'Connected to cloud storage';
                if (statusBanner) statusBanner.classList.add('connected');
            } else {
                this.state.cloudResults = [];
                if (statusText) statusText.textContent = 'Cloud storage unavailable';
                if (statusBanner) statusBanner.classList.add('connected');
            }

            // Reconcile: clear synced flag on any local analysis not present in cloud
            const cloudIds = new Set(this.state.cloudResults.map(r => r.id));
            const stale = this.state.completedAnalyses.filter(a => a.synced && !cloudIds.has(a.id));
            if (stale.length > 0) {
                stale.forEach(a => { a.synced = false; });
                this.renderAnalysisHistory();
                stale.forEach(a => window.api?.cloud?.unmarkSync?.(a.id));
            }

            this.renderCloudResults();
            
        } catch (error) {
            console.error('Failed to load cloud results:', error);
            if (statusText) statusText.textContent = 'Unable to connect - Check your internet connection';
            if (statusBanner) statusBanner.classList.add('offline');
            this.state.cloudResults = [];
            this.renderCloudResults();
        }
    },

    /**
     * Refresh cloud results
     */
    async refreshCloudResults() {
        const refreshBtn = document.querySelector('#cloud-results-section .btn-outline');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;" class="icon-spin">
                    <path d="M21 2v6h-6"></path>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                </svg>
                Refreshing...
            `;
        }

        await this.loadCloudResults();

        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                    <path d="M21 2v6h-6"></path>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                    <path d="M3 22v-6h6"></path>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                </svg>
                Refresh
            `;
        }
    },

    /**
     * Render cloud results table
     */
    renderCloudResults() {
        const tbody = document.getElementById('cloud-results-body');
        if (!tbody) return;

        const results = this.state.cloudResults;

        if (results.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-muted" style="text-align: center; padding: 40px;">
                        No cloud results found. Upload your local results to access them from anywhere.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = results.map(result => `
            <tr>
                <td>
                    <div class="cell-with-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                        </svg>
                        ${esc(result.name)}
                    </div>
                </td>
                <td>${this.formatDate(result.uploadedAt)}</td>
                <td class="text-muted">${esc(result.sampleType || '—')}</td>
                <td>${this.formatFileSize(result.size)}</td>
                <td>
                    <span class="synced-badge ${result.localCopy ? 'synced' : 'not-synced'}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${result.localCopy 
                                ? '<polyline points="20 6 9 17 4 12"></polyline>' 
                                : '<circle cx="12" cy="12" r="10"></circle>'}
                        </svg>
                        ${result.localCopy ? 'Local copy' : 'Cloud only'}
                    </span>
                </td>
                <td>
                    <div class="result-actions-inline">
                        <button class="btn btn-outline btn-sm" onclick="ResultsPage.downloadCloudResult('${result.id}')" title="Download to local">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Download
                        </button>
                        <button class="btn btn-outline btn-sm btn-danger-outline" onclick="ResultsPage.deleteCloudResult('${result.id}')" title="Delete from cloud">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    /**
     * Download a cloud result to local storage
     * @param {string} resultId - Cloud result ID
     */
    async downloadCloudResult(resultId) {
        try {
            const result = this.state.cloudResults.find(r => r.id === resultId);
            if (!result) {
                alert('Result not found.');
                return;
            }

            // Show confirmation
            if (!confirm(`Download "${result.name}" to your local storage?`)) {
                return;
            }

            // Show progress indicator
            const row = document.querySelector(`tr button[onclick*="${resultId}"]`)?.closest('tr');
            if (row) {
                const actionsCell = row.querySelector('.result-actions-inline');
                if (actionsCell) {
                    actionsCell.innerHTML = `
                        <span class="text-muted">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;" class="icon-spin">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M12 6v6l4 2"></path>
                            </svg>
                            Downloading...
                        </span>
                    `;
                }
            }

            // Download from cloud (decrypts automatically in main process)
            if (window.api?.cloud?.downloadResult) {
                const dlResult = await window.api.cloud.downloadResult(result.id);
                if (!dlResult.success) throw new Error(dlResult.error || 'Download failed');
            }

            // Mark as having local copy (persists across tab switches via localCopyIds)
            this.state.localCopyIds.add(resultId);
            const resultIndex = this.state.cloudResults.findIndex(r => r.id === resultId);
            if (resultIndex !== -1) {
                this.state.cloudResults[resultIndex].localCopy = true;
            }

            // Refresh the view
            this.renderCloudResults();

            // Reload local analyses so the downloaded result appears in the local tab
            await this.loadAnalyses();

            alert(`"${result.name}" has been downloaded successfully!`);

        } catch (error) {
            console.error('Failed to download result:', error);
            alert(`Failed to download result: ${error.message}`);
            this.renderCloudResults();
        }
    },

    /**
     * Delete a cloud result permanently
     */
    async deleteCloudResult(resultId) {
        const cloudResult = this.state.cloudResults.find(r => r.id === resultId);
        const displayName = cloudResult?.name || resultId;
        if (!confirm(`Delete "${displayName}" from the cloud permanently?\n\nThis cannot be undone. Your local copy (if any) will not be affected.`)) return;

        try {
            if (window.api?.cloud?.deleteResult) {
                const result = await window.api.cloud.deleteResult(resultId);
                if (!result.success) throw new Error(result.error || 'Delete failed');
            }

            this.state.cloudResults = this.state.cloudResults.filter(r => r.id !== resultId);
            this.renderCloudResults();

            // Clear synced flag on matching local analysis so cloud icon disappears
            // and the upload button reappears in the history tab
            const local = this.state.completedAnalyses.find(a => a.id === resultId);
            if (local) {
                local.synced = false;
                this.renderAnalysisHistory();
            }
        } catch (error) {
            console.error('Failed to delete cloud result:', error);
            alert(`Failed to delete: ${error.message}`);
        }
    },

    /**
     * Upload a local result to cloud
     * @param {string} analysisId - Local analysis ID
     */
    async uploadToCloud(analysisId) {
        // Check if in guest mode
        if (window.App?.isGuestMode?.() || window.App?.state?.isGuestMode) {
            alert('Cloud sync is only available for registered users. Please login or create an account.');
            return;
        }

        const analysis = this.state.completedAnalyses.find(a => a.id === analysisId);
        if (!analysis) {
            alert('Analysis not found.');
            return;
        }

        // Show privacy notice
        const confirmUpload = confirm(
            `Upload "${analysis.analysis_name || analysis.id}" to cloud?\n\n` +
            `Privacy Notice: Your data will be securely transmitted and stored on our servers. ` +
            `Data is encrypted during transfer and at rest.`
        );

        if (!confirmUpload) return;

        try {
            // Show progress
            const statusText = document.createElement('span');
            statusText.className = 'upload-status';
            statusText.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;" class="icon-spin"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> Uploading...`;

            if (window.api?.cloud?.uploadResult) {
                const upResult = await window.api.cloud.uploadResult(analysisId);
                if (!upResult.success) throw new Error(upResult.error || 'Upload failed');
            }

            // Mark as synced
            analysis.synced = true;
            this.renderAnalysisHistory();
            alert(`"${analysis.analysis_name || analysis.id}" uploaded to cloud successfully!`);

        } catch (error) {
            console.error('Failed to upload result:', error);
            alert('Failed to upload result. Please check your connection and try again.');
        }
    },

    /**
     * Format file size for display (delegating to Utils)
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize(bytes) {
        return Utils.formatBytes(bytes, 1);
    },

};

window.ResultsPage = ResultsPage;
