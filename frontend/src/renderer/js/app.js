const App = {
    // State to track current view
    currentPage: 'login',

    init: () => {
        // Start at login screen
        App.navigateTo('login');
        
        // Setup Sidebar Navigation Click Listeners
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.target;
                if(target) App.navigateTo(target);
            });
        });
    },

    navigateTo: (pageId) => {
        console.log("Navigating to:", pageId);

        // 1. Handle Global Layout (Login vs Main App)
        const loginContainer = document.getElementById('page-login');
        const appLayout = document.querySelector('.app-layout');

        if (pageId === 'login') {
            if(loginContainer) loginContainer.classList.remove('hidden');
            if(appLayout) appLayout.classList.add('hidden');
        } else {
            if(loginContainer) loginContainer.classList.add('hidden');
            if(appLayout) appLayout.classList.remove('hidden');
        }

        // 2. Hide all internal Pages
        document.querySelectorAll('.page-view').forEach(el => el.classList.add('hidden'));

        // 3. Show Target Page
        const targetPage = document.getElementById(`page-${pageId}`);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            
            // TODO: Lazy Load Page Logic
            // This ensures scripts run only when the user visits the page
            if (pageId === 'dashboard' && window.DashboardPage) window.DashboardPage.init();
            if (pageId === 'analysis' && window.AnalysisPage) window.AnalysisPage.init();
            if (pageId === 'results' && window.ResultsPage) window.ResultsPage.init();
            if (pageId === 'database' && window.DatabasePage) window.DatabasePage.init();
        }

        // 4. Update Sidebar Active State
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.querySelector(`.nav-item[data-target="${pageId}"]`);
        if (activeNav) activeNav.classList.add('active');
    }
};

// Initialize App when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);