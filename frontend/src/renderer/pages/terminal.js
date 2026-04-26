/**
 * TERMINAL.JS - Terminal Page Controller
 * Purpose: Display live process output from the main process (Snakemake, Batch, etc.)
 */

const TerminalPage = {
    isEventsBound: false,
    autoScroll: true,
    lines: [],
    activeFilter: 'all',
    maxLines: 5000,

    /**
     * Initialize terminal page
     */
    init() {
        if (!this.isEventsBound) {
            this.bindEvents();
            this.setupLogListener();
            this.isEventsBound = true;
        }
        this.renderLines();
        this.updateLineCount();
        if (this.autoScroll) this.scrollToBottom();
    },

    /**
     * Bind UI events
     */
    bindEvents() {
        // Clear button
        const clearBtn = document.getElementById('terminal-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clear());
        }

        // Copy button
        const copyBtn = document.getElementById('terminal-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyToClipboard());
        }

        // Auto-scroll toggle
        const scrollBtn = document.getElementById('terminal-auto-scroll-btn');
        if (scrollBtn) {
            scrollBtn.addEventListener('click', () => {
                this.autoScroll = !this.autoScroll;
                scrollBtn.classList.toggle('active', this.autoScroll);
                if (this.autoScroll) this.scrollToBottom();
            });
            scrollBtn.classList.add('active');
        }

        // Filter buttons
        document.querySelectorAll('.terminal-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.terminal-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeFilter = btn.dataset.filter;
                this.renderLines();
            });
        });

        // Search input
        const searchInput = document.getElementById('terminal-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderLines());
        }

        // Detect manual scroll to disable auto-scroll
        const container = document.getElementById('terminal-container');
        if (container) {
            container.addEventListener('scroll', () => {
                const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
                if (!isAtBottom && this.autoScroll) {
                    this.autoScroll = false;
                    const scrollBtn = document.getElementById('terminal-auto-scroll-btn');
                    if (scrollBtn) scrollBtn.classList.remove('active');
                }
            });
        }
    },

    /**
     * Setup listener for main process log events
     */
    setupLogListener() {
        if (window.api?.terminal?.onLog) {
            window.api.terminal.onLog((data) => {
                this.addLine(data.text, data.type || 'info');
            });
        }
    },

    /**
     * Classify a log line by content
     */
    classifyLine(text) {
        const lower = text.toLowerCase();
        if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) return 'error';
        if (lower.includes('[cancel]')) return 'cancel';
        if (lower.includes('[batch]')) return 'batch';
        if (lower.includes('[snakemake') || lower.includes('snakemake') || lower.includes('localrule') || lower.includes('job stats')) return 'snakemake';
        if (lower.includes('warning') || lower.includes('warn')) return 'warning';
        if (lower.includes('[edge]') || lower.includes('ssh') || lower.includes('jetson')) return 'snakemake';
        if (lower.includes('llm:') || lower.includes('model ready') || lower.includes('node-llama')) return 'system';
        if (lower.includes('pathogenius') || lower.includes('platform:') || lower.includes('electron:')) return 'system';
        return 'info';
    },

    /**
     * Add a line to the terminal
     */
    addLine(text, type) {
        // Handle multi-line output
        const rawLines = text.split('\n');
        for (const raw of rawLines) {
            const trimmed = raw.replace(/\r$/, '');
            if (trimmed === '') continue;

            const classified = type === 'info' ? this.classifyLine(trimmed) : type;
            this.lines.push({
                text: trimmed,
                type: classified,
                time: new Date(),
            });
        }

        // Cap lines
        if (this.lines.length > this.maxLines) {
            this.lines = this.lines.slice(-this.maxLines);
        }

        this.renderLines();
        this.updateLineCount();
        if (this.autoScroll) this.scrollToBottom();
    },

    /**
     * Check if a line matches the active filter
     */
    matchesFilter(line) {
        if (this.activeFilter === 'all') return true;
        return line.type === this.activeFilter;
    },

    /**
     * Check if a line matches the search query
     */
    matchesSearch(line) {
        const searchInput = document.getElementById('terminal-search-input');
        if (!searchInput || !searchInput.value) return true;
        return line.text.toLowerCase().includes(searchInput.value.toLowerCase());
    },

    /**
     * Render visible lines
     */
    renderLines() {
        const output = document.getElementById('terminal-output');
        if (!output) return;

        const visible = this.lines.filter(l => this.matchesFilter(l) && this.matchesSearch(l));

        if (visible.length === 0) {
            output.innerHTML = '<span class="terminal-line terminal-system">No log output matching filter.</span>\n';
            return;
        }

        const html = visible.map(line => {
            const time = line.time.toLocaleTimeString('en-GB', { hour12: false });
            const escaped = this.escapeHtml(line.text);
            return `<span class="terminal-line terminal-${line.type}"><span class="terminal-time">${time}</span> ${escaped}</span>`;
        }).join('\n');

        output.innerHTML = html;
    },

    /**
     * Escape HTML entities
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Update line count display
     */
    updateLineCount() {
        const el = document.getElementById('terminal-line-count');
        if (el) el.textContent = `${this.lines.length} lines`;
    },

    /**
     * Scroll terminal to bottom
     */
    scrollToBottom() {
        const container = document.getElementById('terminal-container');
        if (container) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    },

    /**
     * Clear terminal
     */
    clear() {
        this.lines = [];
        const output = document.getElementById('terminal-output');
        if (output) output.innerHTML = '<span class="terminal-line terminal-system">Terminal cleared.</span>\n';
        this.updateLineCount();
    },

    /**
     * Copy all visible lines to clipboard
     */
    async copyToClipboard() {
        const visible = this.lines.filter(l => this.matchesFilter(l) && this.matchesSearch(l));
        const text = visible.map(l => l.text).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            const btn = document.getElementById('terminal-copy-btn');
            if (btn) {
                const original = btn.innerHTML;
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
                setTimeout(() => { btn.innerHTML = original; }, 1500);
            }
        } catch (e) {
            console.error('Copy failed:', e);
        }
    }
};

window.TerminalPage = TerminalPage;
