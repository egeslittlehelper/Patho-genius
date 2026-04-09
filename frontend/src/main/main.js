/**
 * MAIN.JS - Electron Main Process
 * Purpose: Application entry point, window management, IPC handlers
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const si = require('systeminformation');

// Services
const authService = require('./services/auth-service');
const analysisService = require('./services/analysis-service');
const encryptionService = require('./services/encryption-service');

// Global reference to main window
let mainWindow = null;

/**
 * Create main application window
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#F5F7FA',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Make mainWindow accessible for progress events
    global.mainWindow = mainWindow;

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    
    // Open DevTools in development
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
        global.mainWindow = null;
    });
}

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

/* ============================================
   IPC HANDLERS - Authentication
   ============================================ */

ipcMain.handle('auth:login', async (event, username, password) => {
    return await authService.login(username, password);
});

ipcMain.handle('auth:login-guest', async () => {
    return await authService.loginAsGuest();
});

ipcMain.handle('auth:logout', async () => {
    return await authService.logout();
});

ipcMain.handle('auth:get-session', () => {
    return authService.getSession();
});

ipcMain.handle('auth:register', async (event, userData) => {
    return await authService.register(userData);
});

/* IPC HANDLERS - File System */

ipcMain.handle('app:select-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'FASTQ Files', extensions: ['fastq', 'fq', 'fastq.gz', 'fq.gz'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return canceled ? null : filePaths[0];
});

ipcMain.handle('app:select-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'FASTQ Files', extensions: ['fastq', 'fq', 'gz'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return canceled ? [] : filePaths;
});

ipcMain.handle('app:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

/* IPC HANDLERS - Analysis (Snakemake) */

ipcMain.handle('app:start-analysis', async (event, config) => {
    return await analysisService.startAnalysis(config);
});

ipcMain.handle('app:get-analysis-status', async (event, analysisId) => {
    return analysisService.getAnalysisStatus(analysisId);
});

ipcMain.handle('app:get-analysis-results', async (event, analysisId) => {
    return analysisService.getAnalysisResults(analysisId);
});

ipcMain.handle('app:get-all-analyses', async () => {
    return analysisService.getAllAnalyses();
});

ipcMain.handle('app:cancel-analysis', async (event, analysisId) => {
    return analysisService.cancelAnalysis(analysisId);
});

ipcMain.handle('app:pause-analysis', async (event, analysisId) => {
    return analysisService.pauseAnalysis(analysisId);
});

ipcMain.handle('app:resume-analysis', async (event, analysisId) => {
    return analysisService.resumeAnalysis(analysisId);
});

ipcMain.handle('app:delete-analysis', async (event, analysisId) => {
    return analysisService.deleteAnalysis(analysisId);
});

/* IPC HANDLERS - System Status */

ipcMain.handle('app:get-system-stats', async () => {
    try {
        // Get CPU information
        const cpuInfo = await si.cpu();
        const cpuUsage = 34; // Hardcoded CPU usage
        
        // Get memory information
        const memInfo = await si.mem();
        
        // Get disk information
        const diskInfo = await si.fsSize();
        const mainDisk = diskInfo.find(disk => disk.mount === 'C:' || disk.mount === '/') || diskInfo[0];
        
        // Get GPU information
        const gpuInfo = await si.graphics();
        const primaryGpu = gpuInfo.controllers.find(gpu => gpu.vendor !== 'Microsoft') || gpuInfo.controllers[0];
        
        // Get network information
        const networkInterfaces = await si.networkInterfaces();
        const activeInterface = networkInterfaces.find(iface => iface.operstate === 'up' && iface.ip4);
        
        return {
            cpu: {
                cores: cpuInfo.cores,
                model: cpuInfo.brand,
                usage: cpuUsage
            },
            memory: {
                total: memInfo.total,
                used: memInfo.used,
                free: memInfo.free,
                percentUsed: Math.round((memInfo.used / memInfo.total) * 100)
            },
            disk: {
                free: mainDisk ? mainDisk.available : 0,
                total: mainDisk ? mainDisk.size : 0,
                used: mainDisk ? mainDisk.used : 0,
                percentUsed: mainDisk ? Math.round(mainDisk.use) : 0
            },
            gpu: {
                available: gpuInfo.controllers.length > 0,
                name: primaryGpu ? primaryGpu.model : 'No GPU detected',
                vendor: primaryGpu ? primaryGpu.vendor : 'Unknown'
            },
            network: {
                connected: activeInterface ? true : false,
                interface: activeInterface ? activeInterface.iface : 'None',
                ip: activeInterface ? activeInterface.ip4 : 'N/A'
            },
            platform: os.platform(),
            hostname: os.hostname(),
            // Analysis service config
            analysisConfig: {
                workflowDir: analysisService.ANALYSIS_CONFIG.WORKFLOW_DIR,
                resultsDir: analysisService.ANALYSIS_CONFIG.RESULTS_DIR,
                databasePath: analysisService.ANALYSIS_CONFIG.KRAKEN2_DB
            }
        };
    } catch (error) {
        console.error('Failed to get system stats:', error);
        // Fallback to basic OS info
        const cpus = os.cpus();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        
        return {
            cpu: {
                cores: cpus.length,
                model: cpus[0]?.model || 'Unknown',
                usage: 0 // Unable to get usage
            },
            memory: {
                total: totalMemory,
                used: usedMemory,
                free: freeMemory,
                percentUsed: Math.round((usedMemory / totalMemory) * 100)
            },
            disk: { free: 0, total: 0, used: 0, percentUsed: 0 },
            gpu: { available: false, name: 'Unknown', vendor: 'Unknown' },
            network: { connected: false, interface: 'Unknown', ip: 'N/A' },
            platform: os.platform(),
            hostname: os.hostname(),
            analysisConfig: {
                workflowDir: analysisService.ANALYSIS_CONFIG.WORKFLOW_DIR,
                resultsDir: analysisService.ANALYSIS_CONFIG.RESULTS_DIR,
                databasePath: analysisService.ANALYSIS_CONFIG.KRAKEN2_DB
            }
        };
    }
});

/* IPC HANDLERS - Database Management */

ipcMain.handle('app:get-database-info', async () => {
    // Return database information
    // TODO: Read actual database metadata when available
    return {
        name: 'NCBI RefSeq 2025',
        version: '2025.01',
        type: 'Bacterial and Viral Genomes',
        indexSize: 12.4 * 1024 * 1024 * 1024, // 12.4 GB
        totalGenomes: 24582,
        lastUpdated: '2025-12-01',
        path: analysisService.ANALYSIS_CONFIG.KRAKEN2_DB,
        components: [
            { name: 'Bacterial Genomes', species: 15234, size: 8.2 },
            { name: 'Viral Genomes', species: 4521, size: 2.1 },
            { name: 'AMR Gene Database', genes: 2847, size: 1.8 },
            { name: 'Taxonomy Index', type: 'k-mer', size: 0.3 }
        ]
    };
});

ipcMain.handle('app:import-database', async (event, folderPath) => {
    // TODO: Implement database import from FASTA files
    console.log('Importing database from:', folderPath);
    return { success: true, message: 'Database import started' };
});

ipcMain.handle('app:check-database-updates', async () => {
    // TODO: Check for database updates (would require network)
    return { 
        hasUpdate: false, 
        currentVersion: '2025.01',
        message: 'Database is up to date'
    };
});

ipcMain.handle('app:add-fasta', async (event, filePath, metadata) => {
    console.log('Adding FASTA:', filePath, metadata);
    // TODO: Implement FASTA indexing with Kraken2
    return { success: true, message: 'FASTA file added to database' };
});

ipcMain.handle('app:remove-species', async (event, speciesId) => {
    console.log('Removing species:', speciesId);
    // TODO: Implement species removal from database
    return { success: true, message: 'Species removed from database' };
});

ipcMain.handle('app:update-species', async (event, speciesId, metadata) => {
    console.log('Updating species:', speciesId, metadata);
    // TODO: Implement species metadata update
    return { success: true, message: 'Species metadata updated' };
});

/* IPC HANDLERS - Encryption */

ipcMain.handle('app:init-encryption', async (event, password) => {
    return encryptionService.initializeEncryption(password);
});

ipcMain.handle('app:unlock-encryption', async (event, password, salt) => {
    return encryptionService.unlockEncryption(password, salt);
});

ipcMain.handle('app:encrypt-data', async (event, data) => {
    return encryptionService.encrypt(data);
});

ipcMain.handle('app:decrypt-data', async (event, encryptedData) => {
    return encryptionService.decrypt(encryptedData);
});

ipcMain.handle('app:disable-encryption', async () => {
    encryptionService.disableEncryption();
    return { success: true };
});

ipcMain.handle('app:is-encryption-enabled', () => {
    return encryptionService.isEnabled();
});

/* IPC HANDLERS - Password Reset */

ipcMain.handle('auth:request-password-reset', async (event, emailOrUsername) => {
    console.log('Password reset requested for:', emailOrUsername);
    // TODO: Implement email sending logic
    // In production, this would:
    // 1. Verify the email/username exists
    // 2. Generate a secure token
    // 3. Send email with reset link
    return { success: true, message: 'If account exists, reset email sent' };
});

ipcMain.handle('auth:reset-password', async (event, token, newPassword) => {
    console.log('Password reset with token');
    // TODO: Implement password reset logic
    // In production, this would:
    // 1. Validate the token
    // 2. Hash the new password
    // 3. Update the database
    return { success: true, message: 'Password reset successfully' };
});

ipcMain.handle('auth:change-password', async (event, currentPassword, newPassword) => {
    console.log('User changing password');
    // TODO: Implement password change logic
    // In production, this would:
    // 1. Verify current password matches
    // 2. Hash the new password
    // 3. Update the database
    // 4. Optionally invalidate other sessions
    return { success: true, message: 'Password changed successfully' };
});

/* IPC HANDLERS - Cloud Sync */

ipcMain.handle('cloud:check-connection', async () => {
    // Check if we can reach the cloud server
    try {
        // TODO: Implement actual cloud connection check
        return { connected: true, latency: 45 };
    } catch (error) {
        return { connected: false, error: error.message };
    }
});

ipcMain.handle('cloud:get-results', async () => {
    console.log('Fetching cloud results...');
    // TODO: Implement actual cloud API call
    // This would fetch from your cloud storage/API
    return [];
});

ipcMain.handle('cloud:download-result', async (event, resultId) => {
    console.log('Downloading result from cloud:', resultId);
    // TODO: Implement actual download from cloud
    // 1. Fetch from cloud storage
    // 2. Save to local directory
    // 3. Add to local analysis history
    return { success: true, localPath: `/path/to/downloaded/${resultId}` };
});

ipcMain.handle('cloud:upload-result', async (event, analysisId) => {
    console.log('Uploading result to cloud:', analysisId);
    // TODO: Implement actual upload to cloud
    // 1. Read local result files
    // 2. Encrypt if enabled
    // 3. Upload to cloud storage
    // 4. Mark as synced locally
    return { success: true, cloudId: `cloud-${analysisId}` };
});

ipcMain.handle('cloud:delete-result', async (event, resultId) => {
    console.log('Deleting cloud result:', resultId);
    // TODO: Implement actual cloud deletion
    return { success: true };
});

/* IPC HANDLERS - Admin */

ipcMain.handle('admin:get-users', async () => {
    console.log('Admin: Getting user list');
    // TODO: Implement actual user retrieval from database
    return [];
});

ipcMain.handle('admin:reset-user-password', async (event, userId, newPassword) => {
    console.log('Admin: Resetting password for user:', userId);
    // TODO: Implement actual password reset
    // 1. Hash the new password
    // 2. Update in database
    // 3. Log the action
    return { success: true };
});

ipcMain.handle('admin:update-user-role', async (event, userId, newRole) => {
    console.log('Admin: Updating role for user:', userId, 'to', newRole);
    // TODO: Implement actual role update
    return { success: true };
});

ipcMain.handle('admin:delete-user', async (event, userId) => {
    console.log('Admin: Deleting user:', userId);
    // TODO: Implement actual user deletion
    return { success: true };
});

console.log(' Pathogenius Main Process Ready');
console.log(`   Platform: ${os.platform()}`);
console.log(`   Node: ${process.versions.node}`);
console.log(`   Electron: ${process.versions.electron}`);
