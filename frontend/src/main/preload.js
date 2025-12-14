const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // --- File System ---
    selectFile: () => ipcRenderer.invoke('app:select-file'),
    
    // --- Analysis Workflow ---
    // TODO: Frontend calls this to start Snakemake
    startAnalysis: (config) => ipcRenderer.send('app:start-analysis', config),
    
    // TODO: Frontend listens to this for Progress Bars
    onProgress: (callback) => ipcRenderer.on('analysis:progress', (_event, value) => callback(value)),
    
    // TODO: Frontend listens to this for Final JSON Results
    onResult: (callback) => ipcRenderer.on('analysis:complete', (_event, data) => callback(data)),

    // --- System Info ---
    // TODO: Used by Dashboard to show CPU/RAM
    getSystemStats: () => ipcRenderer.invoke('app:get-system-stats'),
    
    getVersion: () => process.versions.electron
});