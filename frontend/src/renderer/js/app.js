const App = {
    // Current application state
    state: {
        currentPage: 'login',
        isAuthenticated: false,
        currentUser: null
    },

    /* Initialize the application */
    init() {        
        // Setup event listeners
        this.setupNavigation();
        this.setupLogout();
        
        // Start at login screen
        this.navigateTo('login');
        
        console.log('App initialized');
    },

    /* Setup sidebar navigation click handlers */
    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                if (target) {
                    this.navigateTo(target);
                }
            });
        });
    },

    /* Setup logout button handler */
    setupLogout() {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    },

    /**
     * Navigate to a specific page
     * @param {string} pageId Target page identifier
     */
    navigateTo(pageId) {

        const loginContainer = document.getElementById('page-login');
        const appLayout = document.querySelector('.app-layout');

        // Handle login vs main app layout
        if (pageId === 'login') {
            // Show login, hide main app
            if (loginContainer) loginContainer.classList.remove('hidden');
            if (appLayout) appLayout.classList.add('hidden');
            this.state.isAuthenticated = false;
        } else {
            // Hide login, show main app
            if (loginContainer) loginContainer.classList.add('hidden');
            if (appLayout) appLayout.classList.remove('hidden');
            this.state.isAuthenticated = true;
        }

        // Hide all page views
        document.querySelectorAll('.page-view').forEach(el => {
            el.classList.add('hidden');
        });

        // Show target page
        const targetPage = document.getElementById(`page-${pageId}`);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            
            // Initialize page controllers if they exist
            this.initPageController(pageId);
        }

        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
        });
        
        const activeNav = document.querySelector(`.nav-item[data-target="${pageId}"]`);
        if (activeNav) {
            activeNav.classList.add('active');
        }

        // Update state
        this.state.currentPage = pageId;
    },

    /**
     * Initialize page-specific controller
     * @param {string} pageId - Page identifier
     */
    initPageController(pageId) {
        switch (pageId) {
            case 'dashboard':
                if (window.DashboardPage) DashboardPage.init();
                break;
            case 'analysis':
                if (window.AnalysisPage) AnalysisPage.init();
                break;
            case 'results':
                if (window.ResultsPage) ResultsPage.init();
                break;
            case 'database':
                if (window.DatabasePage) DatabasePage.init();
                break;
        }
    },


    /* Handle user logout */
    async logout() {
        
        try {
            // Call auth service if available
            if (window.api?.auth?.logout) {
                await window.api.auth.logout();
            }
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Reset state
        this.state.isAuthenticated = false;
        this.state.currentUser = null;
        window.currentUser = null;

        // Navigate to login
        this.navigateTo('login');
    },

    /**
     * Set current user info (called after successful login)
     * @param {object} user - User object from auth
     */
    setUser(user) {
        this.state.currentUser = user;
        window.currentUser = user;
        
        // Update UI with user info
        const userName = user.displayName || user.username || 'User';
        const userRole = user.role || 'Researcher';
        
        // Update sidebar
        const sidebarName = document.getElementById('sidebar-user-name');
        const sidebarRole = document.getElementById('sidebar-user-role');
        if (sidebarName) sidebarName.textContent = userName;
        if (sidebarRole) sidebarRole.textContent = userRole;
        
        // Update dashboard greeting
        const dashboardName = document.getElementById('dashboard-user-name');
        if (dashboardName) dashboardName.textContent = userName;
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

// Export for global access
window.App = App;
