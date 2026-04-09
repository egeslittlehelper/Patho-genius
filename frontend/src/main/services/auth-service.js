/**
 * Authentication Service (Main Process)
 * Handles user authentication logic - ready for backend integration
 */

// TODO: Replace with actual backend API calls when backend is ready
const AUTH_CONFIG = {
    // Backend API endpoint (configure when backend is ready)
    API_BASE_URL: process.env.AUTH_API_URL || 'http://localhost:8000/api',
    
    // Session timeout in milliseconds (30 minutes)
    SESSION_TIMEOUT: 30 * 60 * 1000,
    
    // Enable offline/guest mode
    ALLOW_GUEST_MODE: true
};

// In-memory session store (replace with proper session management)
let currentSession = null;

/**
 * Authenticate user with username and password
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function login(username, password) {
    try {
        // Input validation
        if (!username || !password) {
            return { success: false, error: 'Username and password are required' };
        }

        // TODO: Replace this mock with actual API call
        // Example backend integration:
        // const response = await fetch(`${AUTH_CONFIG.API_BASE_URL}/auth/login`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ username, password })
        // });
        // const data = await response.json();
        // if (!response.ok) throw new Error(data.message);

        // MOCK: Simulated authentication (remove when backend is ready)
        const mockUser = await mockAuthenticate(username, password);
        
        if (mockUser) {
            currentSession = {
                user: mockUser,
                token: generateMockToken(),
                expiresAt: Date.now() + AUTH_CONFIG.SESSION_TIMEOUT,
                isGuest: false
            };
            
            return { 
                success: true, 
                user: mockUser,
                token: currentSession.token
            };
        }

        return { success: false, error: 'Invalid username or password' };
        
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message || 'Authentication failed' };
    }
}

/**
 * Enter guest mode for offline/emergency access
 * @returns {Promise<{success: boolean, user: object}>}
 */
async function loginAsGuest() {
    if (!AUTH_CONFIG.ALLOW_GUEST_MODE) {
        return { success: false, error: 'Guest mode is disabled' };
    }

    // Guest permissions for offline/portable use:
    // - 'read': Can view ALL stored analysis results (important for portable field use)
    // - 'analyze': Can run new analyses during this session
    // - Cannot: manage users, manage database, modify system settings
    const guestUser = {
        id: 'guest',
        username: 'Guest',
        displayName: 'Guest User',
        role: 'guest',
        permissions: ['read', 'analyze'],
        // Guest sessions track analyses locally - results persist even after logout
        sessionAnalyses: [] // Will store IDs of analyses created in this session
    };

    currentSession = {
        user: guestUser,
        token: null,
        expiresAt: null, // Guest sessions don't expire
        isGuest: true
    };

    return { success: true, user: guestUser };
}

/**
 * Log out current user
 * @returns {Promise<{success: boolean}>}
 */
async function logout() {
    try {
        // TODO: Call backend to invalidate token if needed
        // await fetch(`${AUTH_CONFIG.API_BASE_URL}/auth/logout`, {
        //     method: 'POST',
        //     headers: { 'Authorization': `Bearer ${currentSession?.token}` }
        // });

        currentSession = null;
        return { success: true };
    } catch (error) {
        console.error('Logout error:', error);
        currentSession = null;
        return { success: true }; // Always succeed locally
    }
}

/**
 * Get current session info
 * @returns {{isAuthenticated: boolean, user?: object, isGuest: boolean}}
 */
function getSession() {
    if (!currentSession) {
        return { isAuthenticated: false, isGuest: false };
    }

    // Check if session expired (non-guest)
    if (!currentSession.isGuest && currentSession.expiresAt < Date.now()) {
        currentSession = null;
        return { isAuthenticated: false, isGuest: false, expired: true };
    }

    return {
        isAuthenticated: true,
        user: currentSession.user,
        isGuest: currentSession.isGuest
    };
}

/**
 * Validate if current session has specific permission
 * @param {string} permission 
 * @returns {boolean}
 */
function hasPermission(permission) {
    if (!currentSession?.user?.permissions) return false;
    return currentSession.user.permissions.includes(permission);
}

// ============================================
// MOCK FUNCTIONS (Remove when backend is ready)
// ============================================

/**
 * Mock authentication - replace with real API call
 */
async function mockAuthenticate(username, password) {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock users for testing (REMOVE IN PRODUCTION)
    const mockUsers = {
        'admin': { password: 'admin123', role: 'admin', displayName: 'Administrator' },
        'doctor': { password: 'doctor123', role: 'doctor', displayName: 'Dr. Field Worker' },
        'technician': { password: 'tech123', role: 'technician', displayName: 'Lab Technician' }
    };

    const user = mockUsers[username.toLowerCase()];
    if (user && user.password === password) {
        return {
            id: username.toLowerCase(),
            username: username.toLowerCase(),
            displayName: user.displayName,
            role: user.role,
            permissions: getPermissionsForRole(user.role)
        };
    }
    return null;
}

function getPermissionsForRole(role) {
    const rolePermissions = {
        'admin': ['read', 'write', 'analyze', 'manage_users', 'manage_database'],
        'doctor': ['read', 'write', 'analyze'],
        'technician': ['read', 'analyze'],
        'guest': ['read', 'analyze']
    };
    return rolePermissions[role] || ['read'];
}

function generateMockToken() {
    return 'mock_' + Math.random().toString(36).substring(2, 15);
}

// ============================================

/**
 * Register a new user
 * @param {object} userData - User registration data
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function register(userData) {
    try {
        const { username, email, password, displayName, role } = userData;

        // Input validation
        if (!username || username.length < 3) {
            return { success: false, error: 'Username must be at least 3 characters' };
        }

        if (!email || !email.includes('@')) {
            return { success: false, error: 'Invalid email address' };
        }

        if (!password || password.length < 6) {
            return { success: false, error: 'Password must be at least 6 characters' };
        }

        // TODO: Replace with actual backend API call
        // Example:
        // const response = await fetch(`${AUTH_CONFIG.API_BASE_URL}/auth/register`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(userData)
        // });

        // MOCK: Simulated registration (remove when backend is ready)
        await new Promise(resolve => setTimeout(resolve, 500));

        const newUser = {
            id: Date.now().toString(),
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            displayName: displayName || username,
            role: role || 'researcher',
            permissions: getPermissionsForRole(role || 'researcher'),
            createdAt: new Date().toISOString()
        };

        console.log('User registered:', newUser.username);

        return {
            success: true,
            user: {
                id: newUser.id,
                username: newUser.username,
                displayName: newUser.displayName,
                role: newUser.role
            }
        };
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, error: error.message || 'Registration failed' };
    }
}

module.exports = {
    login,
    loginAsGuest,
    logout,
    getSession,
    hasPermission,
    register,
    AUTH_CONFIG
};

