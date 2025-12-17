const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    
    auth: {
        login: (username, password) => 
            ipcRenderer.invoke('auth:login', username, password),
        
        loginAsGuest: () => 
            ipcRenderer.invoke('auth:login-guest'),
        
        logout: () => 
            ipcRenderer.invoke('auth:logout'),
        
        getSession: () => 
            ipcRenderer.invoke('auth:get-session')
    },

    files: {
        selectFile: () => 
            ipcRenderer.invoke('app:select-file'),
        
        selectFiles: () => 
            ipcRenderer.invoke('app:select-files'),
        
        selectFolder: () => 
            ipcRenderer.invoke('app:select-folder')
    },
    
    // analysis
    // database
    // system
    
    getVersion: () => process.versions.electron
});