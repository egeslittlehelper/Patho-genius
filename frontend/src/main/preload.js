/**
 * PRELOAD.JS - Secure Context Bridge
 * Purpose: Expose safe APIs from main process to renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    
    /* AUTHENTICATION */
    auth: {
        login: (username, password) => 
            ipcRenderer.invoke('auth:login', username, password),
        
        loginAsGuest: () => 
            ipcRenderer.invoke('auth:login-guest'),
        
        logout: () => 
            ipcRenderer.invoke('auth:logout'),
        
        getSession: () => 
            ipcRenderer.invoke('auth:get-session'),
        
        register: (userData) => 
            ipcRenderer.invoke('auth:register', userData),
        
        requestPasswordReset: (emailOrUsername) => 
            ipcRenderer.invoke('auth:request-password-reset', emailOrUsername),
        
        resetPassword: (token, newPassword) => 
            ipcRenderer.invoke('auth:reset-password', token, newPassword),
        
        changePassword: (currentPassword, newPassword) => 
            ipcRenderer.invoke('auth:change-password', currentPassword, newPassword)
    },

    /* FILE SYSTEM */
    files: {
        selectFile: () => 
            ipcRenderer.invoke('app:select-file'),
        
        selectFiles: () => 
            ipcRenderer.invoke('app:select-files'),
        
        selectFolder: () => 
            ipcRenderer.invoke('app:select-folder')
    },

    /* ANALYSIS (Snakemake Workflow) */
    analysis: {
        /**
         * Start a new analysis
         * @param {object} config - Analysis configuration
         * @param {string} config.analysis_name - Name for the analysis
         * @param {string} config.sample_type - Sample type (clinical, environmental, etc.)
         * @param {string[]} config.input_files - Array of FASTQ file paths
         * @param {string} config.database - Reference database to use
         * @param {number} config.confidence_threshold - Classification confidence (0-1)
         */
        start: (config) => 
            ipcRenderer.invoke('app:start-analysis', config),
        
        /**
         * Get status of an analysis
         * @param {string} analysisId
         */
        getStatus: (analysisId) => 
            ipcRenderer.invoke('app:get-analysis-status', analysisId),
        
        /**
         * Get results of a completed analysis
         * @param {string} analysisId
         */
        getResults: (analysisId) => 
            ipcRenderer.invoke('app:get-analysis-results', analysisId),
        
        /**
         * Get all analyses (history)
         */
        getAll: () => 
            ipcRenderer.invoke('app:get-all-analyses'),
        
        /**
         * Cancel a running analysis
         * @param {string} analysisId
         */
        cancel: (analysisId) => 
            ipcRenderer.invoke('app:cancel-analysis', analysisId),
        
        /**
         * Pause a running analysis
         * @param {string} analysisId
         */
        pause: (analysisId) => 
            ipcRenderer.invoke('app:pause-analysis', analysisId),
        
        /**
         * Resume a paused analysis
         * @param {string} analysisId
         */
        resume: (analysisId) => 
            ipcRenderer.invoke('app:resume-analysis', analysisId),
        
        /**
         * Delete an analysis
         * @param {string} analysisId
         */
        delete: (analysisId) => 
            ipcRenderer.invoke('app:delete-analysis', analysisId),
        
        /**
         * Listen for analysis progress updates
         * @param {function} callback - Called with progress data
         */
        onProgress: (callback) => {
            ipcRenderer.on('analysis:progress', (_event, data) => callback(data));
        },
        
        /**
         * Listen for analysis completion
         * @param {function} callback - Called when analysis completes
         */
        onComplete: (callback) => {
            ipcRenderer.on('analysis:complete', (_event, data) => callback(data));
        },
        
        /**
         * Remove progress listener
         */
        removeProgressListener: () => {
            ipcRenderer.removeAllListeners('analysis:progress');
        },
        
        /**
         * Remove completion listener
         */
        removeCompleteListener: () => {
            ipcRenderer.removeAllListeners('analysis:complete');
        }
    },

    /* DATABASE MANAGEMENT */
    database: {
        /**
         * Get information about installed database
         */
        getInfo: () => 
            ipcRenderer.invoke('app:get-database-info'),
        
        /**
         * Import custom FASTA files to extend database
         * @param {string} folderPath - Path to folder with FASTA files
         */
        import: (folderPath) => 
            ipcRenderer.invoke('app:import-database', folderPath),
        
        /**
         * Check for database updates
         */
        checkUpdates: () => 
            ipcRenderer.invoke('app:check-database-updates'),
        
        /**
         * Add FASTA file to database
         * @param {string} filePath - Path to FASTA file
         * @param {object} metadata - Species metadata
         */
        addFasta: (filePath, metadata) => 
            ipcRenderer.invoke('app:add-fasta', filePath, metadata),
        
        /**
         * Remove species from database
         * @param {string} speciesId - Species ID to remove
         */
        removeSpecies: (speciesId) => 
            ipcRenderer.invoke('app:remove-species', speciesId),
        
        /**
         * Update species metadata
         * @param {string} speciesId - Species ID
         * @param {object} metadata - Updated metadata
         */
        updateSpecies: (speciesId, metadata) => 
            ipcRenderer.invoke('app:update-species', speciesId, metadata)
    },

    /* SYSTEM INFORMATION */
    system: {
        /**
         * Get system resource stats (CPU, RAM, disk, GPU)
         */
        getStats: () => 
            ipcRenderer.invoke('app:get-system-stats'),
        
        /**
         * Get Electron version
         */
        getVersion: () => process.versions.electron,
        
        /**
         * Get platform
         */
        getPlatform: () => process.platform,
        
        /**
         * Get Node.js version
         */
        getNodeVersion: () => process.versions.node
    },

    /* ENCRYPTION */
    encryption: {
        /**
         * Initialize encryption with password
         * @param {string} password - Encryption password
         */
        initialize: (password) => 
            ipcRenderer.invoke('app:init-encryption', password),
        
        /**
         * Unlock encryption with password and salt
         * @param {string} password - Encryption password
         * @param {string} salt - Salt from initialization
         */
        unlock: (password, salt) => 
            ipcRenderer.invoke('app:unlock-encryption', password, salt),
        
        /**
         * Encrypt data
         * @param {any} data - Data to encrypt
         */
        encrypt: (data) => 
            ipcRenderer.invoke('app:encrypt-data', data),
        
        /**
         * Decrypt data
         * @param {string} encryptedData - Encrypted data
         */
        decrypt: (encryptedData) => 
            ipcRenderer.invoke('app:decrypt-data', encryptedData),
        
        /**
         * Disable encryption
         */
        disable: () => 
            ipcRenderer.invoke('app:disable-encryption'),
        
        /**
         * Check if encryption is enabled
         */
        isEnabled: () => 
            ipcRenderer.invoke('app:is-encryption-enabled')
    },

    /* CLOUD SYNC */
    cloud: {
        /**
         * Get all cloud-stored results
         */
        getResults: () => 
            ipcRenderer.invoke('cloud:get-results'),
        
        /**
         * Download a result from cloud to local
         * @param {string} resultId - Cloud result ID
         */
        downloadResult: (resultId) => 
            ipcRenderer.invoke('cloud:download-result', resultId),
        
        /**
         * Upload a local result to cloud
         * @param {string} analysisId - Local analysis ID
         */
        uploadResult: (analysisId) => 
            ipcRenderer.invoke('cloud:upload-result', analysisId),
        
        /**
         * Delete a result from cloud
         * @param {string} resultId - Cloud result ID
         */
        deleteResult: (resultId) => 
            ipcRenderer.invoke('cloud:delete-result', resultId),
        
        /**
         * Check cloud connection status
         */
        checkConnection: () => 
            ipcRenderer.invoke('cloud:check-connection')
    },

    /* ADMIN */
    admin: {
        /**
         * Get all users (admin only)
         */
        getUsers: () => 
            ipcRenderer.invoke('admin:get-users'),
        
        /**
         * Reset a user's password (admin only)
         * @param {string} userId - User ID
         * @param {string} newPassword - New password
         */
        resetUserPassword: (userId, newPassword) => 
            ipcRenderer.invoke('admin:reset-user-password', userId, newPassword),
        
        /**
         * Update user role (admin only)
         * @param {string} userId - User ID
         * @param {string} newRole - New role
         */
        updateUserRole: (userId, newRole) => 
            ipcRenderer.invoke('admin:update-user-role', userId, newRole),
        
        /**
         * Delete user (admin only)
         * @param {string} userId - User ID
         */
        deleteUser: (userId) => 
            ipcRenderer.invoke('admin:delete-user', userId)
    },

    /* LLM (Local Model) */
    llm: {
        getStatus: () =>
            ipcRenderer.invoke('llm:get-status'),

        loadModel: () =>
            ipcRenderer.invoke('llm:load-model'),

        chat: (prompt) =>
            ipcRenderer.invoke('llm:chat', prompt),

        generateSummary: (resultData) =>
            ipcRenderer.invoke('llm:generate-summary', resultData),

        onToken: (callback) => {
            ipcRenderer.on('llm:token', (_event, chunk) => callback(chunk));
        },

        removeTokenListener: () => {
            ipcRenderer.removeAllListeners('llm:token');
        }
    }
});

console.log('Pathogenius Preload Bridge Ready');
