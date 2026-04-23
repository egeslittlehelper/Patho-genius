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
        localCopyIds: new Set() // analysisIds that have been downloaded to local this session
    },
    
    isEventsBound: false, // Prevent duplicate event binding

    /**
     * Initialize results page
     */
    init() {
        console.log('ResultsPage initializing...');
        
        // Only bind events once to prevent duplicate listeners
        if (!this.isEventsBound) {
            this.setupEventListeners();
            this.setupProgressListener();
            this.isEventsBound = true;
        }
        
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
                    ['starting', 'running', 'preprocessing', 'classifying', 'processing', 'finalizing'].includes(a.status)
                );
                this.state.completedAnalyses = analyses.filter(a => 
                    ['completed', 'failed', 'cancelled'].includes(a.status)
                );
            } else {
                // Use mock data for development
                this.state.runningAnalyses = [];
                this.state.completedAnalyses = this.getMockAnalyses();
            }
        } catch (error) {
            console.error('Failed to load analyses:', error);
            this.state.completedAnalyses = this.getMockAnalyses();
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
                    <h4>${analysis.config?.analysis_name || analysis.id}</h4>
                    <div class="analysis-status">
                        <span class="status-indicator">${this.getStatusLabel(analysis.status)}</span>
                        ${analysis.message ? `<span>• ${analysis.message}</span>` : ''}
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${analysis.progress || 0}%"></div>
                    </div>
                    <div class="progress-text">${analysis.progress || 0}% complete</div>
                </div>
                <div class="analysis-controls">
                    ${analysis.status === 'paused' 
                        ? `<button class="btn-resume" onclick="ResultsPage.resumeAnalysis('${analysis.id}')" title="Resume">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                            Resume
                           </button>`
                        : `<button class="btn-pause" onclick="ResultsPage.pauseAnalysis('${analysis.id}')" title="Pause">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                            Pause
                           </button>`
                    }
                    <button class="btn-cancel" onclick="ResultsPage.cancelAnalysis('${analysis.id}')" title="Cancel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Cancel
                    </button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Render analysis history table
     */
    renderAnalysisHistory() {
        const tbody = document.getElementById('results-history-body');
        if (!tbody) return;

        const analyses = [...this.state.completedAnalyses];
        const isGuest = window.App?.isGuestMode?.() || window.App?.state?.isGuestMode;

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
                        ${analysis.analysis_name || analysis.config?.analysis_name || analysis.id}
                        ${analysis.synced ? '<span class="synced-indicator" title="Synced to cloud">☁</span>' : ''}
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
        
        const analysis = this.state.runningAnalyses.find(a => a.id === analysisId);
        if (analysis) {
            analysis.progress = progress;
            analysis.status = status;
            analysis.message = message;
            
            // If completed, move to completed list
            if (status === 'completed' || status === 'failed') {
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
        }
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
        
        try {
            // Try to load from API
            if (window.api?.analysis?.getResults) {
                const result = await window.api.analysis.getResults(analysisId);
                if (result) {
                    this.state.currentResult = result;
                }
            }
            
            // Fallback to finding in completed analyses or use mock
            if (!this.state.currentResult) {
                const analysis = this.state.completedAnalyses.find(a => a.id === analysisId);
                this.state.currentResult = analysis?.results || this.getMockResult();
            }
        } catch (error) {
            console.error('Failed to load result:', error);
            this.state.currentResult = this.getMockResult();
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
     * Render interactive charts with result data
     */
    renderCharts(result) {
        // Wait for Charts module to be available
        if (!window.Charts) {
            console.warn('Charts module not loaded');
            return;
        }

        // Prepare treemap data from pathogens
        const treemapData = result.pathogens?.map(p => ({
            name: p.name,
            value: p.abundance,
            reads: p.reads,
            confidence: p.confidence,
            risk: this.capitalize(p.risk_level),
            color: this.getRiskColorShaded(p.risk_level, `${p.name}|${p.strain || ''}|${p.tax_id || ''}`)
        })) || [];

        // Add unclassified if available
        if (result.summary?.classification_rate) {
            const unclassifiedPercent = 100 - result.summary.classification_rate;
            if (unclassifiedPercent > 0) {
                const otherPercent = unclassifiedPercent - treemapData.reduce((sum, p) => sum + p.value, 0);
                if (otherPercent > 0) {
                    treemapData.push({
                        name: 'Other/Unclassified',
                        value: Math.max(0, 100 - treemapData.reduce((sum, p) => sum + p.value, 0)),
                        color: '#9CA3AF'
                    });
                }
            }
        }

        // Render treemap
        setTimeout(() => {
            Charts.renderTreemap('abundance-treemap-chart', treemapData.length > 0 ? treemapData : null);
        }, 100);

        // Render sunburst with taxonomy data
        setTimeout(() => {
            Charts.renderSunburst('sunburst-chart');
        }, 150);

        // Render sankey diagram
        setTimeout(() => {
            Charts.renderSankey('sankey-chart');
        }, 200);

        // Render radar chart for comparative analysis
        setTimeout(() => {
            Charts.renderRadar('radar-chart');
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
                const result = await window.api.analysis.cancel(analysisId);
                if (result.success) {
                    this.loadAnalyses(); // Refresh
                }
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
     * Pause a running analysis
     */
    async pauseAnalysis(analysisId) {
        try {
            if (window.api?.analysis?.pause) {
                const result = await window.api.analysis.pause(analysisId);
                if (result.success) {
                    const analysis = this.state.runningAnalyses.find(a => a.id === analysisId);
                    if (analysis) {
                        analysis.status = 'paused';
                        this.renderRunningAnalyses();
                    }
                }
            } else {
                // Mock for development
                const analysis = this.state.runningAnalyses.find(a => a.id === analysisId);
                if (analysis) {
                    analysis.status = 'paused';
                    this.renderRunningAnalyses();
                    console.log('⏸Analysis paused:', analysisId);
                }
            }
        } catch (error) {
            console.error('Failed to pause analysis:', error);
        }
    },

    /**
     * Resume a paused analysis
     */
    async resumeAnalysis(analysisId) {
        try {
            if (window.api?.analysis?.resume) {
                const result = await window.api.analysis.resume(analysisId);
                if (result.success) {
                    const analysis = this.state.runningAnalyses.find(a => a.id === analysisId);
                    if (analysis) {
                        analysis.status = 'running';
                        this.renderRunningAnalyses();
                    }
                }
            } else {
                // Mock for development
                const analysis = this.state.runningAnalyses.find(a => a.id === analysisId);
                if (analysis) {
                    analysis.status = 'running';
                    this.renderRunningAnalyses();
                    console.log('▶Analysis resumed:', analysisId);
                }
            }
        } catch (error) {
            console.error('Failed to resume analysis:', error);
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
                        <h4>${p.name}</h4>
                        <span class="pathogen-strain">${p.strain || 'Unknown strain'}</span>
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
            const name     = result.analysis_name || 'Analysis';
            const date     = result.completed_at ? new Date(result.completed_at).toLocaleString() : '—';
            const pathogens = result.pathogens || [];

            const pathogenRows = pathogens.map(p => `
                <tr>
                    <td>${p.name || '—'}</td>
                    <td>${p.strain || '—'}</td>
                    <td>${p.abundance != null ? p.abundance + '%' : '—'}</td>
                    <td>${p.reads != null ? p.reads.toLocaleString() : '—'}</td>
                    <td>${p.confidence != null ? p.confidence + '%' : '—'}</td>
                    <td>${(p.risk_level || '—').charAt(0).toUpperCase() + (p.risk_level || '').slice(1)}</td>
                    <td>${p.amr_genes != null ? p.amr_genes : '—'}</td>
                </tr>`).join('');

            const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Pathogenius Report — ${name}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
  h1 { color: #008080; }
  h2 { margin-top: 32px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; font-size: 13px; }
  th { background: #f0f0f0; padding: 8px; text-align: left; border: 1px solid #ddd; }
  td { padding: 6px 8px; border: 1px solid #ddd; }
  .meta { color: #555; font-size: 13px; margin-top: 8px; }
  @media print { body { margin: 20px; } }
</style>
</head><body>
<h1>Pathogenius Analysis Report</h1>
<p class="meta"><strong>Analysis:</strong> ${name}<br>
<strong>Completed:</strong> ${date}<br>
<strong>Sample Type:</strong> ${result.sample_type || '—'}</p>

<h2>Detected Pathogens (${pathogens.length})</h2>
${pathogens.length === 0 ? '<p>No pathogens detected.</p>' : `
<table>
  <thead><tr><th>Name</th><th>Strain</th><th>Abundance</th><th>Reads</th><th>Confidence</th><th>Risk</th><th>AMR Genes</th></tr></thead>
  <tbody>${pathogenRows}</tbody>
</table>`}
</body></html>`;

            const win = window.open('', '_blank', 'width=900,height=700');
            if (!win) { alert('Pop-up blocked. Please allow pop-ups for PDF export.'); return; }
            win.document.write(html);
            win.document.close();
            win.onload = () => { win.focus(); win.print(); };
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


    // MOCK DATA (for development)
    getMockAnalyses() {
        return [
            {
                id: 'analysis_001',
                analysis_name: 'Patient_001_Sample',
                sample_type: 'Clinical Sample',
                status: 'completed',
                completed_at: '2025-12-10T14:30:00Z',
                summary: { pathogens_detected: 4 },
                results: this.getMockResult()
            },
            {
                id: 'analysis_002',
                analysis_name: 'Water_Source_A',
                sample_type: 'Environmental',
                status: 'completed',
                completed_at: '2025-12-09T10:15:00Z',
                summary: { pathogens_detected: 2 }
            },
            {
                id: 'analysis_003',
                analysis_name: 'Soil_Sample_042',
                sample_type: 'Environmental',
                status: 'failed',
                completed_at: '2025-12-08T16:45:00Z',
                error: 'Insufficient reads'
            },
            {
                id: 'analysis_004',
                analysis_name: 'Blood_Culture_Test',
                sample_type: 'Clinical Sample',
                status: 'completed',
                completed_at: '2025-12-07T09:00:00Z',
                summary: { pathogens_detected: 1 }
            }
        ];
    },

    getMockResult() {
        return {
            analysis_name: 'Patient_001_Blood_Sample',
            sample_type: 'clinical',
            completed_at: '2025-12-12T14:45:00Z',
            
            summary: {
                total_reads: 11890000,
                classified_reads: 7560000,
                classification_rate: 63.6,
                species_detected: 342,
                pathogens_detected: 4,
                amr_genes: 19
            },
            
            quality: {
                average_quality: 38,
                high_quality_rate: 94.2,
                mean_coverage: 145
            },
            
            pathogens: [
                {
                    name: 'Escherichia coli',
                    strain: 'O157:H7',
                    tax_id: 83334,
                    abundance: 45.2,
                    reads: 3420000,
                    confidence: 95,
                    amr_genes: 5,
                    virulence_genes: 12,
                    risk_level: 'high'
                },
                {
                    name: 'Staphylococcus aureus',
                    strain: 'MRSA USA300',
                    tax_id: 46170,
                    abundance: 18.6,
                    reads: 1410000,
                    confidence: 87,
                    amr_genes: 7,
                    virulence_genes: 8,
                    risk_level: 'high'
                },
                {
                    name: 'Pseudomonas aeruginosa',
                    strain: 'PAO1',
                    tax_id: 208964,
                    abundance: 8.3,
                    reads: 630000,
                    confidence: 82,
                    amr_genes: 4,
                    virulence_genes: 6,
                    risk_level: 'medium'
                },
                {
                    name: 'Klebsiella pneumoniae',
                    strain: 'KPC+',
                    tax_id: 573,
                    abundance: 5.1,
                    reads: 390000,
                    confidence: 78,
                    amr_genes: 3,
                    virulence_genes: 4,
                    risk_level: 'high'
                }
            ],
            
            taxonomy: {
                bacteria: 71,
                viruses: 4.8,
                proteobacteria: 48,
                firmicutes: 18
            }
        };
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
                        localCopy: this.state.localCopyIds.has(r.analysisId), // restored from session set
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
                        ${result.name}
                    </div>
                </td>
                <td>${this.formatDate(result.uploadedAt)}</td>
                <td class="text-muted">${result.sampleType || '—'}</td>
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
            alert('Failed to download result. Please check your connection and try again.');
            this.renderCloudResults();
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
            statusText.innerHTML = `<span class="icon-spin">⏳</span> Uploading...`;

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
