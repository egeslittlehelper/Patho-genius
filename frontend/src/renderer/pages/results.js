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
        currentSource: 'local' // 'local' or 'cloud'
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

        // Detail tabs
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (!btn) return;

            const tab = btn.dataset.tab;
            if (!tab) return;

            document.querySelectorAll('#results-detail-view .tab-btn')
                .forEach(b => b.classList.remove('active'));

            document.querySelectorAll('#results-detail-view .tab-content')
                .forEach(c => c.classList.remove('active'));

            btn.classList.add('active');

            const target = document.getElementById(`tab-${tab}`);
            if (target) target.classList.add('active');
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
        const { analysisId, progress, status, message, results, analysis_name, sample_type, completed_at } = data;
        
        const analysis = this.state.runningAnalyses.find(a => a.id === analysisId);
        if (analysis) {
            analysis.progress = progress;
            analysis.status = status;
            analysis.message = message;
            if (results) analysis.results = results;
            if (analysis_name) analysis.analysis_name = analysis_name;
            if (sample_type) analysis.sample_type = sample_type;
            if (completed_at) analysis.completed_at = completed_at;
            
            // If completed, move to completed list
            if (status === 'completed' || status === 'failed') {
                this.state.runningAnalyses = this.state.runningAnalyses.filter(a => a.id !== analysisId);
                this.state.completedAnalyses.unshift(analysis);
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
        this.state.currentResult = null;

        try {
            if (window.api?.analysis?.getResults) {
                const result = await window.api.analysis.getResults(analysisId);
                if (result) {
                    this.state.currentResult = result.result || result.results || result.data || result;
                    console.log("RAW BACKEND RESPONSE:", result);
                }
            }

            if (!this.state.currentResult) {
                const analysis = this.state.completedAnalyses.find(a => a.id === analysisId);
                this.state.currentResult = analysis?.results || analysis || this.getMockResult();
            }
        } catch (error) {
            console.error('Failed to load result:', error);
            this.state.currentResult = this.getMockResult();
        }

        console.log("FINAL RESULT USED:", this.state.currentResult)
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
        document.querySelectorAll('#results-detail-view .tab-btn')
            .forEach(b => b.classList.remove('active'));

        document.querySelectorAll('#results-detail-view .tab-content')
            .forEach(c => c.classList.remove('active'));

        const firstBtn = document.querySelector('#results-detail-view .tab-btn[data-tab="overview"]');
        const firstTab = document.getElementById('tab-overview');

        if (firstBtn) firstBtn.classList.add('active');
        if (firstTab) firstTab.classList.add('active');

        this.updateDetailView();
    },

    /**
     * Update detail view with current result
     */
    updateDetailView() {
        const result = this.state.currentResult;
        if (!result) return;

        const nameEl = document.getElementById('detail-analysis-name');
        const subtitleEl = document.getElementById('results-subtitle');

        if (nameEl) nameEl.textContent = result.analysis_name || result.sample_id || 'Analysis Result';

        const when = result.completed_at || result.processed_date;
        if (subtitleEl) {
            subtitleEl.textContent = when
                ? `Completed on ${this.formatDate(when)}`
                : 'Analysis result';
        }

        this.updateOverviewCards(result);
        this.updateClinicalSummary(result);
        this.updateQualityTab(result);
        this.renderPathogenCards();
        this.renderPathogenDetails(result);
        this.renderCharts(result);
    },

    /**
     * Update overview cards with summary data
     */
    updateOverviewCards(result) {
        const summary = result?.summary || {};
        const quality = result?.quality || {};
        const pathogens = result?.pathogens || [];

        const totalReadsValue = document.getElementById('summary-total-reads-value');
        const totalReadsSub = document.getElementById('summary-total-reads-sub');

        const speciesValue = document.getElementById('summary-species-value');
        const speciesSub = document.getElementById('summary-species-sub');

        const pathogensValue = document.getElementById('summary-pathogens-value');
        const pathogensSub = document.getElementById('summary-pathogens-sub');

        const amrValue = document.getElementById('summary-amr-value');
        const amrSub = document.getElementById('summary-amr-sub');

        if (totalReadsValue) totalReadsValue.textContent = this.formatReads(summary.total_reads || 0);
        if (totalReadsSub) {
            totalReadsSub.textContent = quality.high_quality_rate != null
                ? `↑ ${quality.high_quality_rate}% high quality`
                : 'Quality data unavailable';
        }

        if (speciesValue) speciesValue.textContent = summary.species_detected ?? '—';
        if (speciesSub) {
            speciesSub.textContent = summary.classification_rate != null
                ? `${summary.classification_rate}% classified`
                : 'Classification data unavailable';
        }

        if (pathogensValue) {
            const total = summary.pathogens_detected ?? pathogens.length ?? 0;
            pathogensValue.textContent = `${total} Detected`;
        }

        if (pathogensSub) {
            const criticalCount = pathogens.filter(p => (p.risk_level || '').toLowerCase() === 'high').length;
            pathogensSub.textContent = criticalCount > 0
                ? `${criticalCount} high-risk pathogen${criticalCount > 1 ? 's' : ''}`
                : 'No high-risk pathogens';
        }

        if (amrValue) amrValue.textContent = `${summary.amr_genes ?? 0} Total`;
        if (amrSub) {
            const hasAmr = Number(summary.amr_genes || 0) > 0;
            amrSub.textContent = hasAmr ? 'Multi-drug resistant markers present' : 'No AMR markers detected';
        }
    },

    /**
     * Update clinical summary with pathogen data
     */
    updateClinicalSummary(result) {
        const pathogens = result?.pathogens || [];
        const summaryBox = document.getElementById('clinical-summary-text');
        const secondaryBox = document.getElementById('clinical-summary-secondary');
        const criticalAlert = document.getElementById('clinical-critical-alert');
        const recommendation = document.getElementById('clinical-recommendation');

        if (!summaryBox || !secondaryBox || !criticalAlert || !recommendation) return;

        if (pathogens.length === 0) {
            summaryBox.innerHTML = 'No pathogens were detected in this analysis.';
            secondaryBox.innerHTML = 'No co-infection pattern could be inferred from the available results.';
            criticalAlert.innerHTML = '<strong>No critical alert:</strong> No high-risk pathogens detected.';
            recommendation.innerHTML = '<strong>Recommendation:</strong> Review sample quality and confirm with laboratory workflow.';
            return;
        }

        const sorted = [...pathogens].sort((a, b) => Number(b.abundance || 0) - Number(a.abundance || 0));
        const top = sorted[0];
        const second = sorted[1];

        summaryBox.innerHTML = `
            Metagenomic analysis indicates a <strong>${sorted.length > 1 ? 'polymicrobial pattern' : 'dominant pathogen signal'}</strong>
            led by <strong>${top.name}${top.strain ? ` ${top.strain}` : ''}</strong>
            (${top.confidence ?? 'N/A'}% confidence, ${top.abundance ?? 0}% relative abundance, ${this.formatReads(top.reads || 0)} reads).
        `;

        secondaryBox.innerHTML = second
            ? `A secondary signal from <strong>${second.name}${second.strain ? ` ${second.strain}` : ''}</strong> was also detected (${second.confidence ?? 'N/A'}% confidence, ${second.abundance ?? 0}% abundance).`
            : 'No strong secondary pathogen signal was detected.';

        const criticalCount = sorted.filter(p => (p.risk_level || '').toLowerCase() === 'high').length;
        criticalAlert.innerHTML = criticalCount > 0
            ? `<strong>CRITICAL ALERT:</strong> ${criticalCount} high-risk pathogen${criticalCount > 1 ? 's were' : ' was'} detected. Review immediately with confirmatory testing.`
            : '<strong>No critical alert:</strong> No high-risk pathogens detected.';

        const totalAmr = sorted.reduce((sum, p) => sum + Number(p.amr_genes || 0), 0);
        recommendation.innerHTML = totalAmr > 0
            ? '<strong>Clinical Recommendation:</strong> Review antimicrobial resistance markers and confirm with susceptibility testing.'
            : '<strong>Clinical Recommendation:</strong> Use this report as decision support only and confirm findings with laboratory tests.';
    },

    /**
     * Update quality metrics tab with quality data
    */
    updateQualityTab(result) {
        const quality = result?.quality || {};
        const summary = result?.summary || {};

        const avgQuality = document.getElementById('qc-average-quality-value');
        const avgQualitySub = document.getElementById('qc-average-quality-sub');
        const avgQualityBar = document.getElementById('qc-average-quality-bar');

        const classRate = document.getElementById('qc-classification-rate-value');
        const classRateSub = document.getElementById('qc-classification-rate-sub');
        const classRateBar = document.getElementById('qc-classification-rate-bar');

        const coverage = document.getElementById('qc-coverage-value');
        const coverageSub = document.getElementById('qc-coverage-sub');
        const coverageBar = document.getElementById('qc-coverage-bar');

        // Average Read Quality
        if (avgQuality) {
            avgQuality.textContent = quality.average_quality != null ? `Q${quality.average_quality}` : 'N/A';
        }

        if (avgQualitySub) {
            if (quality.high_quality_rate != null) {
                avgQualitySub.textContent = `${quality.high_quality_rate}% reads passed high-quality threshold`;
            } else if (quality.average_quality != null) {
                avgQualitySub.textContent = 'Average quality score from analysis output';
            } else {
                avgQualitySub.textContent = 'Quality data unavailable';
            }
        }

        if (avgQualityBar) {
            avgQualityBar.style.width = `${Math.min(100, Number(quality.average_quality || 0) * 2.5)}%`;
        }

        // Classification Rate
        if (classRate) {
            classRate.textContent = summary.classification_rate != null ? `${summary.classification_rate}%` : 'N/A';
        }

        if (classRateSub) {
            if (summary.classified_reads != null && summary.total_reads != null) {
                classRateSub.textContent = `${this.formatReads(summary.classified_reads)} of ${this.formatReads(summary.total_reads)} reads classified`;
            } else if (summary.classified_reads != null) {
                classRateSub.textContent = `${this.formatReads(summary.classified_reads)} classified reads`;
            } else {
                classRateSub.textContent = 'Classification data unavailable';
            }
        }

        if (classRateBar) {
            classRateBar.style.width = `${Math.min(100, Number(summary.classification_rate || 0))}%`;
        }

        // Mean Coverage Depth
        if (coverage) {
            coverage.textContent = quality.mean_coverage != null ? `${quality.mean_coverage}x` : 'N/A';
        }

        if (coverageSub) {
            if (quality.mean_coverage != null) {
                coverageSub.textContent = 'Mean sequencing depth across detected targets';
            } else {
                coverageSub.textContent = 'Coverage data unavailable';
            }
        }

        if (coverageBar) {
            coverageBar.style.width = `${Math.min(100, Number(quality.mean_coverage || 0) / 2)}%`;
        }
    },

    /**
     * Render pathogen details in the UI
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
                            <h3>${p.name}</h3>
                            <p class="pathogen-strain">Strain: ${p.strain || 'Unknown'}</p>
                        </div>
                        <span class="risk-badge risk-${risk}">${this.capitalize(risk)} Risk</span>
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
                        <p>Tax ID: ${p.tax_id || 'Unknown'}</p>
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
        // console.log('RADAR DATA BEFORE RENDER:', radarData);
        // console.log('RADAR PATHOGEN COUNT:', radarData?.pathogens?.length);
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
                    this.loadAnalyses();
                }
            } else {
                // Mock for development
                this.state.completedAnalyses = this.state.completedAnalyses.filter(a => a.id !== analysisId);
                this.renderAnalysisHistory();
                console.log('Analysis deleted:', analysisId);
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

        container.innerHTML = pathogens.map(p => {
            const conf = p.confidence ?? 75;
            const risk = p.risk_level || 'low';

            return `
                <div class="pathogen-card ${risk === 'high' ? 'pathogen-card-critical' : ''}">
                    <div class="pathogen-header">
                        <div>
                            <h4>${p.name}</h4>
                            <span class="pathogen-strain">${p.strain || 'Unknown strain'}</span>
                        </div>
                        <div class="confidence-badge confidence-${this.getConfidenceLevel(conf)}">
                            <span class="confidence-value">${conf}%</span>
                            <span class="confidence-label">Confidence</span>
                        </div>
                    </div>

                    <div class="pathogen-metrics-row">
                        <div class="pathogen-metric-item">
                            <span class="metric-value-lg">${p.abundance ?? 0}%</span>
                            <span class="metric-label">Abundance</span>
                        </div>
                        <div class="pathogen-metric-item">
                            <span class="metric-value-lg">${this.formatReads(p.reads || 0)}</span>
                            <span class="metric-label">Reads</span>
                        </div>
                        <div class="pathogen-metric-item">
                            <span class="metric-value-lg ${(p.amr_genes || 0) > 0 ? 'text-danger' : ''}">${p.amr_genes || 0}</span>
                            <span class="metric-label">AMR Genes</span>
                        </div>
                    </div>

                    <div class="pathogen-confidence-bar">
                        <div class="confidence-bar-track">
                            <div class="confidence-bar-fill confidence-fill-${this.getConfidenceLevel(conf)}" style="width: ${conf}%"></div>
                        </div>
                        <span class="confidence-bar-label">${this.getConfidenceLabel(conf)}</span>
                    </div>

                    <div class="pathogen-footer">
                        <span class="risk-badge risk-${risk}">${this.capitalize(risk)} Risk</span>
                        ${p.virulence_genes ? `<span class="virulence-count">${p.virulence_genes} virulence genes</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Get confidence label based on score
     */
    getConfidenceLabel(confidence) {
        const c = confidence ?? 0;
        if (c >= 90) return 'Very High Confidence';
        if (c >= 80) return 'High Confidence';
        if (c >= 70) return 'Moderate Confidence';
        if (c >= 60) return 'Low Confidence';
        return 'Very Low Confidence';
    },

    /**
     * Get confidence level category
     */
    getConfidenceLevel(confidence) {
        const c = confidence ?? 0;
        if (c >= 90) return 'high';
        if (c >= 70) return 'medium';
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
                     analysis.results?.pathogens_detected?.length ||
                     analysis.pathogens?.length ||
                     analysis.summary?.pathogens_detected || 0;
        
        if (count === 0) return '—';
        return `${count} detected`;
    },

    /**
     * Export results
     */
    async exportResult(format = 'pdf') {
        console.log(`📤 Exporting as ${format}...`);
        alert(`Export as ${format.toUpperCase()} - Feature coming with backend integration`);
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

            // Try to fetch cloud results
            if (window.api?.cloud?.getResults) {
                const results = await window.api.cloud.getResults();
                this.state.cloudResults = results;
                
                if (statusText) statusText.textContent = 'Connected to cloud storage';
                if (statusBanner) statusBanner.classList.add('connected');
            } else {
                // Mock cloud data for development
                this.state.cloudResults = this.getMockCloudResults();
                if (statusText) statusText.textContent = 'Connected to cloud storage';
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

            // Download from cloud
            if (window.api?.cloud?.downloadResult) {
                await window.api.cloud.downloadResult(resultId);
            } else {
                // Simulate download delay
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Mark as having local copy
            const resultIndex = this.state.cloudResults.findIndex(r => r.id === resultId);
            if (resultIndex !== -1) {
                this.state.cloudResults[resultIndex].localCopy = true;
            }

            // Refresh the view
            this.renderCloudResults();
            
            // Reload local analyses
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
                await window.api.cloud.uploadResult(analysisId);
            } else {
                // Simulate upload
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Mark as synced
            analysis.synced = true;

            // Refresh views
            this.renderAnalysisHistory();
            
            alert(`"${analysis.analysis_name || analysis.id}" has been uploaded to cloud successfully!`);

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

    /**
     * Get mock cloud results for development
     * @returns {array} Mock cloud results
     */
    getMockCloudResults() {
        return [
            {
                id: 'cloud-001',
                name: 'Patient_Sample_2025_001',
                uploadedAt: '2025-12-15T10:30:00Z',
                sampleType: 'Clinical',
                size: 45000000,
                localCopy: false
            },
            {
                id: 'cloud-002',
                name: 'Environmental_Water_Q4',
                uploadedAt: '2025-12-12T14:15:00Z',
                sampleType: 'Environmental',
                size: 32000000,
                localCopy: true
            },
            {
                id: 'cloud-003',
                name: 'Food_Safety_Batch_12',
                uploadedAt: '2025-12-10T09:45:00Z',
                sampleType: 'Food Safety',
                size: 28500000,
                localCopy: false
            },
            {
                id: 'cloud-004',
                name: 'Research_Sample_Nov',
                uploadedAt: '2025-11-28T16:20:00Z',
                sampleType: 'Other',
                size: 67000000,
                localCopy: true
            }
        ];
    }
};

window.ResultsPage = ResultsPage;
