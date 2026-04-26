/**
 * TEMPLATE-LOADER.JS - Dynamic HTML Template Loader
 * Purpose: Load HTML templates from separate files into the main page
 */

const TemplateLoader = {
    // Base path for templates (relative to index.html)
    basePath: 'templates/',
    
    // Template definitions - maps container IDs to template files
    templates: {
        // Auth pages (loaded into body directly)
        'auth-container': ['login.html', 'register.html'],
        
        // App layout - sidebar
        'sidebar-container': ['sidebar.html'],
        
        // Main content pages
        'pages-container': [
            'dashboard.html',
            'analysis.html',
            'results.html',
            'terminal.html',
            'database.html',
            'settings.html'
        ],
        
        // Modals (loaded at end of body)
        'modals-container': ['modals.html']
    },
    
    // Track loading state
    loadedTemplates: new Set(),
    isLoading: false,

    /**
     * Initialize and load all templates
     * @returns {Promise<void>}
     */
    async init() {
        console.log('TemplateLoader initializing...');
        this.isLoading = true;
        
        try {
            // Load templates in order
            await this.loadAuthTemplates();
            await this.loadAppLayout();
            await this.loadModals();
            
            console.log('All templates loaded successfully');
        } catch (error) {
            console.error('Template loading failed:', error);
            this.showLoadError(error);
        } finally {
            this.isLoading = false;
        }
    },

    /**
     * Load authentication page templates (login, register)
     * @returns {Promise<void>}
     */
    async loadAuthTemplates() {
        const container = document.getElementById('auth-container');
        if (!container) return;
        
        const templates = this.templates['auth-container'];
        for (const template of templates) {
            const html = await this.fetchTemplate(template);
            container.insertAdjacentHTML('beforeend', html);
            this.loadedTemplates.add(template);
        }
    },

    /**
     * Load main app layout (sidebar + pages)
     * @returns {Promise<void>}
     */
    async loadAppLayout() {
        // Load sidebar
        const sidebarContainer = document.getElementById('sidebar-container');
        if (sidebarContainer) {
            const sidebarHtml = await this.fetchTemplate('sidebar.html');
            sidebarContainer.innerHTML = sidebarHtml;
            this.loadedTemplates.add('sidebar.html');
        }
        
        // Load page templates
        const pagesContainer = document.getElementById('pages-container');
        if (pagesContainer) {
            const pageTemplates = this.templates['pages-container'];
            for (const template of pageTemplates) {
                const html = await this.fetchTemplate(template);
                pagesContainer.insertAdjacentHTML('beforeend', html);
                this.loadedTemplates.add(template);
            }
        }
    },

    /**
     * Load modal templates
     * @returns {Promise<void>}
     */
    async loadModals() {
        const container = document.getElementById('modals-container');
        if (!container) return;
        
        const templates = this.templates['modals-container'];
        for (const template of templates) {
            const html = await this.fetchTemplate(template);
            container.insertAdjacentHTML('beforeend', html);
            this.loadedTemplates.add(template);
        }
    },

    /**
     * Fetch a single template file
     * @param {string} templateName - Template file name
     * @returns {Promise<string>} - Template HTML content
     */
    async fetchTemplate(templateName) {
        const url = this.basePath + templateName;
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`Failed to load template: ${templateName} (${response.status})`);
            }
            
            return await response.text();
        } catch (error) {
            console.error(`Template fetch error for ${templateName}:`, error);
            throw error;
        }
    },

    /**
     * Load a single template dynamically (for lazy loading)
     * @param {string} templateName - Template file name
     * @param {string} containerId - Container element ID
     * @returns {Promise<void>}
     */
    async loadTemplate(templateName, containerId) {
        if (this.loadedTemplates.has(templateName)) {
            console.log(`Template ${templateName} already loaded`);
            return;
        }
        
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return;
        }
        
        const html = await this.fetchTemplate(templateName);
        container.insertAdjacentHTML('beforeend', html);
        this.loadedTemplates.add(templateName);
    },

    /**
     * Check if a template is loaded
     * @param {string} templateName - Template file name
     * @returns {boolean}
     */
    isTemplateLoaded(templateName) {
        return this.loadedTemplates.has(templateName);
    },

    /**
     * Show loading error to user
     * @param {Error} error - The error that occurred
     */
    showLoadError(error) {
        document.body.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: system-ui, sans-serif; background: #0f172a; color: #f1f5f9;">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <h1 style="margin-top: 24px; font-size: 24px;">Failed to Load Application</h1>
                <p style="margin-top: 8px; color: #94a3b8;">Error: ${error.message}</p>
                <button onclick="location.reload()" style="margin-top: 24px; padding: 12px 24px; background: #008080; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">
                    Reload Page
                </button>
            </div>
        `;
    },

    /**
     * Get list of all loaded templates
     * @returns {string[]}
     */
    getLoadedTemplates() {
        return Array.from(this.loadedTemplates);
    }
};

// Export for global access
window.TemplateLoader = TemplateLoader;

