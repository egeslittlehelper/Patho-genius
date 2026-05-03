/**
 * PRELOAD.JS - Secure Context Bridge (MERGED)
 * Purpose: Expose safe APIs from main process to renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

    /* AUTHENTICATION (Firebase) */
    auth: {
        login: (username, password) =>
            ipcRenderer.invoke('auth:login', username, password),

        loginAsGuest: () =>
            ipcRenderer.invoke('auth:login-guest'),

        logout: (isGuest) =>
            ipcRenderer.invoke('auth:logout', isGuest),

        register: (userData) =>
            ipcRenderer.invoke('auth:register', userData),

        restoreSession: () =>
            ipcRenderer.invoke('auth:restore-session'),

        getSession: () =>
            ipcRenderer.invoke('auth:get-session'),

        changePassword: (currentPassword, newPassword) =>
            ipcRenderer.invoke('auth:change-password', currentPassword, newPassword),

        requestPasswordReset: (email) =>
            ipcRenderer.invoke('auth:request-password-reset', email),

        resendVerification: (email, password) =>
            ipcRenderer.invoke('auth:resend-verification', email, password),

        checkVerification: (email, password) =>
            ipcRenderer.invoke('auth:check-verification', email, password),

        deleteSelf: () =>
            ipcRenderer.invoke('auth:delete-self')
    },

    /* FILE SYSTEM */
    files: {
        selectFile: () =>
            ipcRenderer.invoke('app:select-file'),

        selectFiles: () =>
            ipcRenderer.invoke('app:select-files'),

        selectFolder: () =>
            ipcRenderer.invoke('app:select-folder'),

        selectMappingFile: () =>
            ipcRenderer.invoke('app:select-mapping-file'),

        seqkitStats: (filePath) =>
            ipcRenderer.invoke('app:seqkit-stats', filePath)
    },

    /* ANALYSIS (CLARK / CuCLARK Workflow) */
    analysis: {
        start: (config) =>
            ipcRenderer.invoke('app:start-analysis', config),

        getStatus: (analysisId) =>
            ipcRenderer.invoke('app:get-analysis-status', analysisId),

        getResults: (analysisId) =>
            ipcRenderer.invoke('app:get-analysis-results', analysisId),

        getAll: () =>
            ipcRenderer.invoke('app:get-all-analyses'),

        cancel: (analysisId) =>
            ipcRenderer.invoke('app:cancel-analysis', analysisId),

        delete: (analysisId) =>
            ipcRenderer.invoke('app:delete-analysis', analysisId),

        onProgress: (callback) => {
            ipcRenderer.on('analysis:progress', (_event, data) => callback(data));
        },

        onComplete: (callback) => {
            ipcRenderer.on('analysis:complete', (_event, data) => callback(data));
        },

        removeProgressListener: () => {
            ipcRenderer.removeAllListeners('analysis:progress');
        },

        removeCompleteListener: () => {
            ipcRenderer.removeAllListeners('analysis:complete');
        }
    },

    /* DATABASE MANAGEMENT (CLARK custom DB) */
    database: {
        getInfo: () =>
            ipcRenderer.invoke('app:get-database-info'),

        list: () =>
            ipcRenderer.invoke('app:list-databases'),

        create: (config) =>
            ipcRenderer.invoke('app:create-database', config),

        remove: (databaseId) =>
            ipcRenderer.invoke('app:delete-database', databaseId),

        import: (folderPath, mappingFile) =>
            ipcRenderer.invoke('app:import-database', folderPath, mappingFile),

        clearCustomDb: () =>
            ipcRenderer.invoke('app:clear-custom-db'),

        checkUpdates: () =>
            ipcRenderer.invoke('app:check-database-updates'),

        addFasta: (filePath, metadata) =>
            ipcRenderer.invoke('app:add-fasta', filePath, metadata),

        removeSpecies: (speciesId) =>
            ipcRenderer.invoke('app:remove-species', speciesId),

        updateSpecies: (speciesId, metadata) =>
            ipcRenderer.invoke('app:update-species', speciesId, metadata)
    },

    /* SYSTEM INFORMATION */
    system: {
        getStats: () =>
            ipcRenderer.invoke('app:get-system-stats'),

        onGpuReady: (callback) => {
            ipcRenderer.once('system:gpu-ready', (_event, gpu) => callback(gpu));
        },

        getAppVersion: () => ipcRenderer.invoke('system:get-app-version'),
        getElectronVersion: () => process.versions.electron,
        getPlatform: () => process.platform,
        getNodeVersion: () => process.versions.node,
        openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
        focusWindow: () => ipcRenderer.invoke('system:focus-window'),
        printReport: (html) => ipcRenderer.invoke('system:print-report', html)
    },

    /* SETTINGS (Firebase) */
    settings: {
        save: (settings) =>
            ipcRenderer.invoke('settings:save', settings),

        load: () =>
            ipcRenderer.invoke('settings:load')
    },

    /* CLOUD SYNC (Firebase) */
    cloud: {
        checkConnection: () =>
            ipcRenderer.invoke('cloud:check-connection'),

        getResults: () =>
            ipcRenderer.invoke('cloud:get-results'),

        uploadResult: (analysisId) =>
            ipcRenderer.invoke('cloud:upload-result', analysisId),

        downloadResult: (analysisId) =>
            ipcRenderer.invoke('cloud:download-result', analysisId),

        deleteResult: (analysisId) =>
            ipcRenderer.invoke('cloud:delete-result', analysisId),

        unmarkSync: (analysisId) =>
            ipcRenderer.invoke('cloud:unmark-sync', analysisId),

        syncMetadata: (analysisId, metadata) =>
            ipcRenderer.invoke('cloud:sync-metadata', analysisId, metadata)
    },

    /* ADMIN (Firebase) */
    admin: {
        getUsers: () =>
            ipcRenderer.invoke('admin:get-users'),

        suspendUser: (uid) =>
            ipcRenderer.invoke('admin:suspend-user', uid),

        activateUser: (uid) =>
            ipcRenderer.invoke('admin:activate-user', uid),

        updateUserRole: (userId, newRole) =>
            ipcRenderer.invoke('admin:update-user-role', userId, newRole),

        sendPasswordReset: (email) =>
            ipcRenderer.invoke('admin:send-password-reset', email),

        getStats: () =>
            ipcRenderer.invoke('admin:get-stats'),

        resetUserPassword: (userId) =>
            ipcRenderer.invoke('admin:reset-user-password', userId),

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
    },

    /* TERMINAL (Process Logs) */
    terminal: {
        onLog: (callback) => {
            ipcRenderer.on('terminal:log', (_event, data) => callback(data));
        },

        removeLogListener: () => {
            ipcRenderer.removeAllListeners('terminal:log');
        }
    }
});

console.log('Pathogenius Preload Bridge Ready');
