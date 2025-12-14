const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// TODO: Import your Service Modules here
// const analysisService = require('./services/analysis-service');
// const databaseService = require('./services/database-service');

function createWindow() {
    const mainWindow = new BrowserWindow({
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

    // TODO: Ensure this path is correct relative to where you run 'npm start'
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    
    // TODO: Uncomment this for development to see Console Errors
    // mainWindow.webContents.openDevTools(); 
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS (The API Layer) ---

// 1. File System Access
ipcMain.handle('app:select-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Sequencing Data', extensions: ['fastq', 'gz'] }]
    });
    return canceled ? null : filePaths[0];
});

// TODO: Add Handler for 'app:start-analysis'
// This should call your python script using child_process.spawn
// ipcMain.on('app:start-analysis', (event, filePath) => { ... });

// TODO: Add Handler for 'app:get-system-status'
// This should return CPU/RAM usage for the Dashboard