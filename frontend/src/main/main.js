const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');

// TODO: Import your Service Modules here
const authService = require('./services/auth-service');
// const analysisService = require('./services/analysis-service');
// const databaseService = require('./services/database-service');

let mainWindow = null;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        backgroundColor: '#F5F7FA',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false // SECURITY: Keep this false
        }
    });

    global.mainWindow = mainWindow;

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    
    // Uncomment this for development to see Console Errors
    // mainWindow.webContents.openDevTools(); 

    mainWindow.on('closed', () => {
        mainWindow = null;
        global.mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC HANDLERS ---

// Authentication
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

// File System
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

// Analysis

// System Stats
// TODO
ipcMain.handle('app:get-system-stats', async () => {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    // Get disk space
    let diskInfo = { free: 0, total: 0 };
    try {
        // MOCK! use 'check-disk-space'
        diskInfo = {
            free: 42.3 * 1024 * 1024 * 1024, // Mock 42.3 GB
            total: 500 * 1024 * 1024 * 1024
        };
    } catch (e) {
        console.error('Failed to get disk info:', e);
    }
    
    return {
        cpu: {
            cores: cpus.length,
            model: cpus[0]?.model || 'Unknown',
            usage: Math.round(Math.random() * 40 + 20) // Mock CPU usage
        },
        memory: {
            total: totalMemory,
            used: usedMemory,
            free: freeMemory,
            percentUsed: Math.round((usedMemory / totalMemory) * 100)
        },
        disk: diskInfo,
        gpu: {
            available: true, // Would need CUDA check for real detection
            name: 'NVIDIA GPU' // Mock
        },
        platform: os.platform(),
        hostname: os.hostname()
    };
});


console.log(' Pathogenius Main Process Ready');
console.log(`   Platform: ${os.platform()}`);
console.log(`   Node: ${process.versions.node}`);
console.log(`   Electron: ${process.versions.electron}`);