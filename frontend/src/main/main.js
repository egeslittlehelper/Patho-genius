/**
 * MAIN.JS - Electron Main Process (MERGED)
 * Purpose: Application entry point, window management, IPC handlers
 *
 * Combines:
 *   - Working Snakemake/CLARK pipeline backend (analysis-service, db-settings)
 *   - Firebase auth, cloud sync, encrypted local storage, LLM
 *   - User isolation (analysisUserMap, .owner files)
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const si = require('systeminformation');

// Services
const firebaseAuth = require('./services/firebase-auth-service');
const analysisService = require('./services/analysis-service');
const encryptionService = require('./services/encryption-service');
const dbSettings = require('./services/db-settings');
const cloudService = require('./services/cloud-service');
const localStorageService = require('./services/local-storage-service');
const llmService = require('./services/llm-service');

// Global reference to main window
let mainWindow = null;

// GPU: fetched once in background after app ready, never awaited in the stats handler
let _cachedGpuInfo = { available: false, name: 'No GPU detected', vendor: '—' };
let _gpuFetchStarted = false;

function startGpuFetch() {
    if (_gpuFetchStarted) return;
    _gpuFetchStarted = true;
    si.graphics().then(data => {
        const controllers = data?.controllers || [];
        const gpu = controllers.find(c => c.model && c.vendor !== 'Microsoft') || controllers[0];
        if (gpu?.model) {
            _cachedGpuInfo = { available: true, name: gpu.model, vendor: gpu.vendor || '—' };
            mainWindow?.webContents.send('system:gpu-ready', _cachedGpuInfo);
        }
    }).catch(() => {});
}

// CPU usage via two os.cpus() snapshots 200ms apart — no WMI
function cpuUsagePercent() {
    return new Promise(resolve => {
        const t1 = os.cpus();
        setTimeout(() => {
            const t2 = os.cpus();
            let idle = 0, total = 0;
            for (let i = 0; i < t1.length; i++) {
                const d1 = t1[i].times, d2 = t2[i].times;
                idle += d2.idle - d1.idle;
                const dTotal = Object.values(d2).reduce((a, b) => a + b, 0) -
                               Object.values(d1).reduce((a, b) => a + b, 0);
                total += dTotal;
            }
            resolve(total > 0 ? Math.round(100 * (1 - idle / total)) : 0);
        }, 200);
    });
}

// In-memory ownership map: analysisId -> uid (or 'guest')
// Rebuilt from .owner files on disk, so survives across sessions.
const analysisUserMap = new Map();

const RESULTS_DIR = analysisService.ANALYSIS_CONFIG.RESULTS_DIR;

function getCurrentUid() {
    const user = firebaseAuth.getCurrentUser();
    return user ? user.uid : 'guest';
}

// Reject any analysisId that doesn't match the generated format (prevents path traversal).
function isValidAnalysisId(id) {
    return typeof id === 'string' && /^analysis_[0-9]+_[a-z0-9]+$/.test(id);
}

// Strip file paths and long stack traces from error strings before persisting.
function sanitizeError(err) {
    if (!err) return 'Unknown error';
    // Take only the first line (removes path-containing stack trace lines)
    const firstLine = String(err).split('\n')[0].trim();
    // Remove anything that looks like a Windows or Unix path
    const noPath = firstLine.replace(/[A-Za-z]:\\[^\s,)]+/g, '[path]').replace(/\/[^\s,)]+/g, '[path]');
    return noPath.slice(0, 120);
}

/**
 * Scan RESULTS_DIR for directories whose .owner file matches uid.
 * Returns synthetic analysis records for cross-session persistence.
 */
function getDiskAnalyses(uid) {
    const records = [];
    try {
        if (!fs.existsSync(RESULTS_DIR)) return records;
        for (const entry of fs.readdirSync(RESULTS_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const ownerFile = path.join(RESULTS_DIR, entry.name, '.owner');
            if (!fs.existsSync(ownerFile)) continue;
            if (fs.readFileSync(ownerFile, 'utf8').trim() !== uid) continue;
            const resultsFile = path.join(RESULTS_DIR, entry.name, 'results.json');
            if (!fs.existsSync(resultsFile)) continue;
            try {
                const resultData = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
                const cfgFile = path.join(RESULTS_DIR, entry.name, 'config.json');
                const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
                records.push({
                    id: entry.name,
                    analysis_name: resultData.analysis_name || cfg.analysis_name || entry.name,
                    sample_type: resultData.sample_type || cfg.sample_type || '—',
                    status: 'completed',
                    completed_at: resultData.completed_at,
                    startTime: resultData.completed_at ? new Date(resultData.completed_at).getTime() : 0,
                    outputDir: path.join(RESULTS_DIR, entry.name),
                    results: resultData
                });
            } catch {}
        }
    } catch {}
    return records;
}

/**
 * Scan userData/results/{uid}/ for encrypted results saved from cloud downloads.
 * Uses .meta.json sidecars so we never decrypt just to list.
 */
async function getEncryptedLocalAnalyses(uid) {
    if (!uid || uid === 'guest') return [];
    const listed = await localStorageService.listLocalResults(uid);
    if (!listed.success) return [];
    return listed.files.map(f => ({
        id: f.analysisId,
        analysis_name: f.analysis_name || f.analysisId,  // failed analyses store name in meta; others decrypt on open
        sample_type: '—',              // sample_type is encrypted
        status: f.status || 'completed',
        error: f.error || null,
        completed_at: f.completed_at || f.modifiedAt?.toISOString?.() || null,
        startTime: f.completed_at ? new Date(f.completed_at).getTime() : (f.modifiedAt?.getTime?.() || 0),
        detectedCount: f.detectedCount ?? null,
        synced: !!f.hasCloudBackup,
        _fromEncrypted: true
    }));
}

/**
 * Delete an analysis's output directory from RESULTS_DIR.
 */
function deleteAnalysisDir(analysisId) {
    const dir = path.join(RESULTS_DIR, analysisId);
    try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
        console.error('Failed to delete analysis dir:', e.message);
    }
}

/**
 * One-time migration: encrypt any plain results in frontend/results/ that belong
 * to uid and move them into the encrypted local store.
 * Runs silently after login / session restore.
 */
async function migratePlainResults(uid) {
    if (!uid || uid === 'guest') return;
    if (!fs.existsSync(RESULTS_DIR)) return;

    let entries;
    try { entries = fs.readdirSync(RESULTS_DIR, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(RESULTS_DIR, entry.name);
        const ownerFile = path.join(dir, '.owner');
        const resultsFile = path.join(dir, 'results.json');

        try {
            if (!fs.existsSync(ownerFile) || !fs.existsSync(resultsFile)) continue;
            if (fs.readFileSync(ownerFile, 'utf8').trim() !== uid) continue;

            const resultData = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
            const cfgFile = path.join(dir, 'config.json');
            const cfg = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};

            const meta = {
                analysis_name: resultData.analysis_name || cfg.analysis_name || entry.name,
                sample_type: resultData.sample_type || cfg.sample_type || '—',
                completed_at: resultData.completed_at || new Date().toISOString(),
                status: 'completed',
                detectedCount: Array.isArray(resultData.pathogens) ? resultData.pathogens.length : 0
            };

            const saved = await localStorageService.saveResultLocally(entry.name, uid, resultData, meta);
            if (saved.success) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`[migration] Encrypted and migrated result: ${entry.name}`);
            }
        } catch (e) {
            console.error(`[migration] Failed to migrate ${entry.name}:`, e.message);
        }
    }
}

// When a logged-in user's analysis finishes, encrypt and save it to per-user
// local storage, then remove the plain working directory.
analysisService.setOnCompleteCallback(async (analysisId, record) => {
    const uid = analysisUserMap.get(analysisId);
    if (!uid || uid === 'guest') return;

    const succeeded = record.status === 'completed' && record.results;

    if (succeeded) {
        const meta = {
            analysis_name: record.analysis_name || analysisId,
            sample_type: record.sample_type || '—',
            completed_at: record.completed_at || new Date().toISOString(),
            status: 'completed',
            detectedCount: Array.isArray(record.results?.pathogens) ? record.results.pathogens.length : 0
        };
        const saved = await localStorageService.saveResultLocally(analysisId, uid, record.results, meta);
        if (saved.success) {
            deleteAnalysisDir(analysisId);
        } else {
            console.error('Failed to encrypt result locally - plain copy kept:', saved.error);
        }
    } else {
        // Save a minimal failure record — no file paths, no config, just enough to
        // show in history and stats. The working dir is deleted regardless.
        const meta = {
            analysis_name: record.analysis_name || analysisId,
            sample_type: record.sample_type || '—',
            completed_at: new Date().toISOString(),
            status: 'failed',
            error: sanitizeError(record.error),
            detectedCount: 0
        };
        await localStorageService.saveResultLocally(analysisId, uid, null, meta);
        deleteAnalysisDir(analysisId);
    }
});

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
            nodeIntegration: false,
            sandbox: true
        }
    });

    global.mainWindow = mainWindow;
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    // mainWindow.webContents.openDevTools();

    // Allow about:blank popups (used by PDF export), deny everything else
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url === 'about:blank') return { action: 'allow' };
        return { action: 'deny' };
    });

    // Block navigating away from the local file — prevents renderer XSS from
    // redirecting to a remote page that escapes the sandbox.
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('file://')) event.preventDefault();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        global.mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();
    startGpuFetch();

    // ── Relay main-process console output to the renderer Terminal page ──
    const _origLog = console.log.bind(console);
    const _origError = console.error.bind(console);
    const _origWarn = console.warn.bind(console);

    function sendToTerminal(text, type) {
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal:log', { text: String(text), type });
            }
        } catch { /* ignore if window is gone */ }
    }

    console.log = (...args) => {
        _origLog(...args);
        sendToTerminal(args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '), 'info');
    };
    console.error = (...args) => {
        _origError(...args);
        sendToTerminal(args.map(a => (typeof a === 'object' ? (a?.stack || JSON.stringify(a, null, 2)) : String(a))).join(' '), 'error');
    };
    console.warn = (...args) => {
        _origWarn(...args);
        sendToTerminal(args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '), 'warning');
    };

    llmService.loadModel().then(status => {
        if (status.loadError) console.error('LLM auto-load failed:', status.loadError);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

/* ============================================
   IPC HANDLERS - Authentication (Firebase)
   ============================================ */

ipcMain.handle('auth:register', async (event, userData) => {
    return await firebaseAuth.register(userData);
});

ipcMain.handle('auth:login', async (event, username, password) => {
    const result = await firebaseAuth.login(username, password);
    if (result.success) migratePlainResults(result.user.uid).catch(() => {});
    return result;
});

ipcMain.handle('auth:login-guest', async () => {
    return {
        success: true,
        user: { uid: null, username: 'guest', displayName: 'Guest User', role: 'guest' },
        isGuest: true
    };
});

ipcMain.handle('auth:logout', async (event, isGuest) => {
    if (isGuest) {
        try {
            if (fs.existsSync(RESULTS_DIR)) {
                for (const entry of fs.readdirSync(RESULTS_DIR, { withFileTypes: true })) {
                    if (!entry.isDirectory()) continue;
                    const ownerFile = path.join(RESULTS_DIR, entry.name, '.owner');
                    if (!fs.existsSync(ownerFile)) continue;
                    if (fs.readFileSync(ownerFile, 'utf8').trim() === 'guest') {
                        fs.rmSync(path.join(RESULTS_DIR, entry.name), { recursive: true, force: true });
                    }
                }
            }
        } catch (e) {
            console.error('Guest data cleanup error:', e.message);
        }
        for (const [id, uid] of analysisUserMap.entries()) {
            if (uid === 'guest') analysisUserMap.delete(id);
        }
        await localStorageService.clearGuestData();
        encryptionService.disableEncryption();
        return { success: true };
    }
    return await firebaseAuth.logout();
});

ipcMain.handle('auth:restore-session', async () => {
    const result = await firebaseAuth.restoreSession();
    if (result.success) migratePlainResults(result.user.uid).catch(() => {});
    return result;
});

ipcMain.handle('auth:get-session', () => {
    const user = firebaseAuth.getCurrentUser();
    return user ? { success: true, user } : { success: false };
});

ipcMain.handle('auth:change-password', async (event, currentPassword, newPassword) => {
    return await firebaseAuth.changePassword(currentPassword, newPassword);
});

ipcMain.handle('auth:delete-self', async () => {
    return await firebaseAuth.deleteSelf();
});

ipcMain.handle('auth:request-password-reset', async (event, email) => {
    return await firebaseAuth.sendPasswordReset(email);
});

ipcMain.handle('auth:resend-verification', async (event, email, password) => {
    return await firebaseAuth.resendVerificationEmail(email, password);
});

ipcMain.handle('auth:check-verification', async (event, email, password) => {
    return await firebaseAuth.checkEmailVerified(email, password);
});

/* ============================================
   IPC HANDLERS - Settings (Firebase)
   ============================================ */

ipcMain.handle('settings:save', async (event, settings) => {
    return await firebaseAuth.saveSettings(settings);
});

ipcMain.handle('settings:load', async () => {
    return await firebaseAuth.loadSettings();
});

/* ============================================
   IPC HANDLERS - File System
   ============================================ */

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

// ── SeqKit FASTQ statistics ──────────────────────────────────────────────────
ipcMain.handle('app:seqkit-stats', async (_event, filePath) => {
    const { execFile } = require('child_process');
    const seqkitBin = path.join(__dirname, '..', '..', 'bin', 'seqkit.exe');

    if (!fs.existsSync(seqkitBin)) {
        console.warn('SeqKit binary not found at', seqkitBin);
        return { success: false, error: 'SeqKit binary not found' };
    }
    if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
    }

    return new Promise((resolve) => {
        execFile(seqkitBin, ['stats', '-T', filePath], { timeout: 120000 }, (err, stdout, stderr) => {
            if (err) {
                console.error('SeqKit error:', err.message);
                return resolve({ success: false, error: err.message });
            }
            try {
                const lines = stdout.trim().split('\n');
                if (lines.length < 2) return resolve({ success: false, error: 'No data from SeqKit' });

                const headers = lines[0].split('\t');
                const values = lines[1].split('\t');
                const stats = {};
                headers.forEach((h, i) => { stats[h.trim()] = values[i]?.trim(); });

                resolve({
                    success: true,
                    stats: {
                        file: stats['file'] || filePath,
                        format: stats['format'] || 'FASTQ',
                        type: stats['type'] || 'DNA',
                        num_seqs: parseInt(stats['num_seqs'], 10) || 0,
                        sum_len: parseInt(stats['sum_len'], 10) || 0,
                        min_len: parseInt(stats['min_len'], 10) || 0,
                        avg_len: parseFloat(stats['avg_len']) || 0,
                        max_len: parseInt(stats['max_len'], 10) || 0
                    }
                });
            } catch (parseErr) {
                resolve({ success: false, error: 'Failed to parse SeqKit output: ' + parseErr.message });
            }
        });
    });
});

ipcMain.handle('app:select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
});

ipcMain.handle('app:select-mapping-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Reads Mapping Files', extensions: ['tsv', 'tsv.gz', 'txt', 'csv'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return canceled ? null : filePaths[0];
});

/* ============================================
   IPC HANDLERS - Analysis (Snakemake / CLARK)
   ============================================ */

ipcMain.handle('app:start-analysis', async (event, config) => {
    const result = await analysisService.startAnalysis(config);
    if (result.success) {
        const uid = getCurrentUid();
        analysisUserMap.set(result.analysisId, uid);
        // Write .owner file so ownership survives app restarts
        try {
            fs.writeFileSync(path.join(result.outputDir, '.owner'), uid, 'utf8');
        } catch {}
    }
    return result;
});

ipcMain.handle('app:get-analysis-status', async (event, analysisId) => {
    return analysisService.getAnalysisStatus(analysisId);
});

ipcMain.handle('app:get-analysis-results', async (event, analysisId) => {
    if (!isValidAnalysisId(analysisId)) return null;
    const uid = getCurrentUid();
    // 1. In-memory (current session, e.g. just ran)
    const fromService = analysisService.getAnalysisResults(analysisId);
    if (fromService) return fromService;
    // 2. Encrypted local store (completed analyses and cloud downloads)
    if (uid !== 'guest') {
        const enc = await localStorageService.loadResultLocally(analysisId, uid);
        if (enc.success) {
            // New format: { data: result, analysis_name, sample_type }
            // Legacy format: data IS the result directly
            const data = enc.data;
            if (data && typeof data === 'object') return data;
            if (typeof data === 'string') { try { return JSON.parse(data); } catch {} }
        }
    }
    return null;
});

ipcMain.handle('app:get-all-analyses', async () => {
    const uid = getCurrentUid();

    // 1. Current-session in-memory analyses owned by this user
    const fromMemory = analysisService.getAllAnalyses().filter(a => {
        const owner = analysisUserMap.get(a.id);
        return owner === uid;
    });

    // 2. Encrypted local store — decrypt name/sample_type for each entry so the
    //    history list can display them. Full result is only decrypted on demand.
    let fromEncrypted = [];
    if (uid !== 'guest') {
        const listed = await getEncryptedLocalAnalyses(uid);
        fromEncrypted = await Promise.all(listed.map(async entry => {
            if (!entry._fromEncrypted || entry.status === 'failed') return entry;
            try {
                const loaded = await localStorageService.loadResultLocally(entry.id, uid);
                if (loaded.success && loaded.analysis_name) {
                    entry.analysis_name = loaded.analysis_name;
                    entry.sample_type = loaded.sample_type || '—';
                }
            } catch {}
            return entry;
        }));
    }

    // 3. Plain pipeline working dir — guests only
    const fromDisk = getDiskAnalyses(uid);

    // Merge: memory > encrypted > disk
    const seen = new Set(fromMemory.map(a => a.id));
    for (const a of fromEncrypted) {
        if (!seen.has(a.id)) { fromMemory.push(a); seen.add(a.id); }
    }
    for (const a of fromDisk) {
        if (!seen.has(a.id)) { fromMemory.push(a); seen.add(a.id); }
    }

    return fromMemory.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
});

ipcMain.handle('app:cancel-analysis', async (event, analysisId) => {
    return analysisService.cancelAnalysis(analysisId);
});


ipcMain.handle('app:delete-analysis', async (event, analysisId) => {
    if (!isValidAnalysisId(analysisId)) return { success: false, error: 'Invalid analysis ID' };
    const uid = getCurrentUid();
    analysisService.deleteAnalysis(analysisId, true);
    deleteAnalysisDir(analysisId);
    if (uid !== 'guest') {
        await localStorageService.deleteLocalResult(analysisId, uid);
    }
    analysisUserMap.delete(analysisId);
    return { success: true };
});

/* ============================================
   IPC HANDLERS - System Status
   ============================================ */

ipcMain.handle('app:get-system-stats', async () => {
    try {
        const cpus = os.cpus();
        const rootPath = os.platform() === 'win32' ? 'C:\\' : '/';
        const [cpuUsage, diskStats] = await Promise.all([
            cpuUsagePercent(),
            fs.promises.statfs(rootPath)
        ]);

        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const totalDisk = diskStats.blocks * diskStats.bsize;
        const freeDisk = diskStats.bavail * diskStats.bsize;
        const usedDisk = totalDisk - freeDisk;

        return {
            cpu: {
                cores: cpus.length,
                model: cpus[0]?.model || 'Unknown',
                usage: cpuUsage
            },
            memory: {
                total: totalMem,
                used: usedMem,
                free: freeMem,
                percentUsed: Math.round((usedMem / totalMem) * 100)
            },
            disk: {
                free: freeDisk,
                total: totalDisk,
                used: usedDisk,
                percentUsed: totalDisk > 0 ? Math.round((usedDisk / totalDisk) * 100) : 0
            },
            gpu: _cachedGpuInfo,
            network: { connected: null, interface: '—', ip: '—' },
            platform: os.platform(),
            hostname: os.hostname(),
            analysisConfig: {
                workflowDir: analysisService.ANALYSIS_CONFIG.WORKFLOW_DIR,
                resultsDir: analysisService.ANALYSIS_CONFIG.RESULTS_DIR,
                databasePath: analysisService.ANALYSIS_CONFIG.KRAKEN2_DB
            }
        };
    } catch (error) {
        console.error('Failed to get system stats:', error);
        const cpus = os.cpus();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        return {
            cpu: { cores: cpus.length, model: cpus[0]?.model || 'Unknown', usage: 0 },
            memory: {
                total: totalMemory,
                used: totalMemory - freeMemory,
                free: freeMemory,
                percentUsed: Math.round(((totalMemory - freeMemory) / totalMemory) * 100)
            },
            disk: { free: 0, total: 0, used: 0, percentUsed: 0 },
            gpu: _cachedGpuInfo,
            network: { connected: null, interface: '—', ip: '—' },
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

/* ============================================
   IPC HANDLERS - Database Management (real CLARK)
   ============================================ */

ipcMain.handle('app:get-database-info', async () => {
    const defaultDb = dbSettings.getDefaultDbInfo();
    const databases = dbSettings.listDatabases();
    const active = dbSettings.getActiveDatabase();
    return {
        defaultDb: {
            path: defaultDb.path,
            isBuilt: defaultDb.isBuilt,
            genomeCount: defaultDb.genomeCount,
        },
        databases,
        activeDatabase: active,
    };
});

ipcMain.handle('app:list-databases', async () => {
    return dbSettings.listDatabases();
});

ipcMain.handle('app:create-database', async (event, config) => {
    const { name, genomesPath, mappingFile, syncToJetson } = config;
    console.log(`Creating database "${name}" from ${genomesPath}, sync=${syncToJetson}`);

    const addResult = dbSettings.addDatabase(name, genomesPath, mappingFile, syncToJetson);
    if (!addResult.success) return addResult;

    try {
        await dbSettings.buildDatabase(addResult.database.id);
        // Re-read after build to get updated flags
        const databases = dbSettings.listDatabases();
        const built = databases.find(d => d.id === addResult.database.id);
        return { success: true, database: built };
    } catch (error) {
        return { success: false, error: 'Database build failed: ' + error.message };
    }
});

ipcMain.handle('app:delete-database', async (event, databaseId) => {
    console.log('Deleting database:', databaseId);
    return dbSettings.removeDatabase(databaseId);
});

ipcMain.handle('app:import-database', async (event, folderPath, mappingFile) => {
    console.log('Legacy import from:', folderPath, 'Mapping:', mappingFile);
    const result = dbSettings.setCustomDbPath(folderPath, mappingFile);
    if (!result.success) return result;
    try {
        await dbSettings.buildCustomDb(folderPath);
    } catch (error) {
        return { success: false, error: 'Database build failed: ' + error.message };
    }
    return result;
});

ipcMain.handle('app:clear-custom-db', async () => {
    dbSettings.clearCustomDb();
    return { success: true };
});

ipcMain.handle('app:check-database-updates', async () => {
    return { hasUpdate: false, currentVersion: '2025.01', message: 'Database is up to date' };
});

ipcMain.handle('app:add-fasta', async (event, filePath, metadata) => {
    console.log('Adding FASTA:', filePath, metadata);
    return { success: true, message: 'FASTA file added to database' };
});

ipcMain.handle('app:remove-species', async (event, speciesId) => {
    console.log('Removing species:', speciesId);
    return { success: true, message: 'Species removed from database' };
});

ipcMain.handle('app:update-species', async (event, speciesId, metadata) => {
    console.log('Updating species:', speciesId, metadata);
    return { success: true, message: 'Species metadata updated' };
});

/* ============================================
   IPC HANDLERS - Cloud Sync (Firebase)
   ============================================ */

ipcMain.handle('cloud:check-connection', async () => {
    try {
        const res = await fetch('https://firestore.googleapis.com', { method: 'HEAD' });
        return { connected: res.status < 500, latency: null };
    } catch {
        return { connected: false };
    }
});

ipcMain.handle('cloud:get-results', async () => {
    const user = firebaseAuth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in', results: [] };
    return await cloudService.getCloudResultsList(user.uid);
});

ipcMain.handle('cloud:upload-result', async (event, analysisId) => {
    if (!isValidAnalysisId(analysisId)) return { success: false, error: 'Invalid analysis ID' };
    const user = firebaseAuth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const loaded = await localStorageService.loadResultLocally(analysisId, user.uid);
    if (!loaded.success || !loaded.data) return { success: false, error: 'Result not found in local storage' };
    const result = {
        ...loaded.data,
        analysis_name: loaded.analysis_name || loaded.data?.analysis_name,
        sample_type:   loaded.sample_type   || loaded.data?.sample_type,
    };

    if (!result) return { success: false, error: 'Analysis results not found locally' };
    const upResult = await cloudService.uploadResult(analysisId, user.uid, result);
    if (upResult.success) {
        await localStorageService.markAsCloudSynced(analysisId, user.uid);
    }
    return upResult;
});

ipcMain.handle('cloud:download-result', async (event, analysisId) => {
    if (!isValidAnalysisId(analysisId)) return { success: false, error: 'Invalid analysis ID' };
    const user = firebaseAuth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const dlResult = await cloudService.downloadResult(analysisId, user.uid);
    if (!dlResult.success) return dlResult;

    let resultData;
    try {
        resultData = typeof dlResult.data === 'string' ? JSON.parse(dlResult.data) : dlResult.data;
    } catch {
        resultData = dlResult.data;
    }

    const meta = {
        analysis_name: resultData?.analysis_name || analysisId,
        sample_type: resultData?.sample_type || '—',
        completed_at: resultData?.completed_at || new Date().toISOString(),
        hasCloudBackup: true
    };
    await localStorageService.saveResultLocally(analysisId, user.uid, resultData, meta);

    return { success: true };
});

ipcMain.handle('cloud:delete-result', async (event, analysisId) => {
    if (!isValidAnalysisId(analysisId)) return { success: false, error: 'Invalid analysis ID' };
    const user = firebaseAuth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    const delResult = await cloudService.deleteCloudResult(analysisId, user.uid);
    if (delResult.success) {
        await localStorageService.unmarkCloudSync(analysisId, user.uid);
    }
    return delResult;
});

ipcMain.handle('cloud:unmark-sync', async (event, analysisId) => {
    if (!isValidAnalysisId(analysisId)) return { success: false, error: 'Invalid analysis ID' };
    const user = firebaseAuth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    return await localStorageService.unmarkCloudSync(analysisId, user.uid);
});

ipcMain.handle('cloud:sync-metadata', async (event, analysisId, metadata) => {
    const user = firebaseAuth.getCurrentUser();
    if (!user) return { success: false, error: 'Not logged in' };
    return await cloudService.syncAnalysisMetadata(user.uid, analysisId, metadata);
});

/* ============================================
   IPC HANDLERS - Admin (Firebase)
   ============================================ */

function requireAdmin() {
    const user = firebaseAuth.getCurrentUser();
    if (!user) return { success: false, error: 'Not authenticated' };
    if (user.role !== 'admin') return { success: false, error: 'Unauthorized' };
    return null;
}

ipcMain.handle('admin:get-users', async () => {
    const deny = requireAdmin(); if (deny) return deny;
    return await firebaseAuth.adminGetUsers();
});

ipcMain.handle('admin:suspend-user', async (event, uid) => {
    const deny = requireAdmin(); if (deny) return deny;
    return await firebaseAuth.adminSuspendUser(uid);
});

ipcMain.handle('admin:activate-user', async (event, uid) => {
    const deny = requireAdmin(); if (deny) return deny;
    return await firebaseAuth.adminActivateUser(uid);
});

ipcMain.handle('admin:update-user-role', async (event, userId, newRole) => {
    const deny = requireAdmin(); if (deny) return deny;
    return await firebaseAuth.adminChangeUserRole(userId, newRole);
});

ipcMain.handle('admin:send-password-reset', async (event, email) => {
    const deny = requireAdmin(); if (deny) return deny;
    return await firebaseAuth.adminSendPasswordReset(email);
});

ipcMain.handle('admin:get-stats', async () => {
    const deny = requireAdmin(); if (deny) return deny;
    return await firebaseAuth.adminGetStats();
});

ipcMain.handle('admin:reset-user-password', async (event, userId) => {
    const deny = requireAdmin(); if (deny) return deny;
    const users = await firebaseAuth.adminGetUsers();
    if (!users.success) return { success: false, error: users.error };
    const user = users.users.find(u => u.uid === userId);
    if (!user) return { success: false, error: 'User not found' };
    return await firebaseAuth.adminSendPasswordReset(user.email);
});

ipcMain.handle('admin:delete-user', async (event, userId) => {
    const deny = requireAdmin(); if (deny) return deny;
    return await firebaseAuth.adminDeleteUser(userId);
});

/* ============================================
   IPC HANDLERS - LLM Service
   ============================================ */

ipcMain.handle('llm:get-status', () => {
    return llmService.getStatus();
});

ipcMain.handle('llm:load-model', async () => {
    return await llmService.loadModel();
});

ipcMain.handle('llm:chat', async (event, prompt) => {
    try {
        const response = await llmService.chat(prompt, (chunk) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('llm:token', chunk);
            }
        });
        return { success: true, response };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('llm:generate-summary', async (event, resultData) => {
    try {
        const response = await llmService.generateSummary(resultData, (chunk) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('llm:token', chunk);
            }
        });
        return { success: true, response };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('system:get-app-version', () => app.getVersion());

ipcMain.handle('system:focus-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        mainWindow.webContents.focus();
    }
});

ipcMain.handle('system:open-external', async (event, url) => {
    // Only allow mailto: and https: to prevent arbitrary shell execution
    if (!url.startsWith('mailto:') && !url.startsWith('https://')) {
        return { success: false, error: 'Blocked URL scheme' };
    }
    await shell.openExternal(url);
    return { success: true };
});

ipcMain.handle('system:print-report', async (event, html) => {
    return new Promise((resolve) => {
        const htmlPath = path.join(app.getPath('temp'), `pathogenius-report-${Date.now()}.html`);
        const pdfPath  = htmlPath.replace('.html', '.pdf');

        try {
            fs.writeFileSync(htmlPath, html, 'utf8');
        } catch (e) {
            return resolve({ success: false, error: e.message });
        }

        const printWin = new BrowserWindow({
            show: false,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
        });

        printWin.loadFile(htmlPath);

        printWin.webContents.once('did-finish-load', () => {
            printWin.webContents.printToPDF({ pageSize: 'A4', printBackground: false })
                .then((pdfData) => {
                    printWin.destroy();
                    try { fs.unlinkSync(htmlPath); } catch {}
                    fs.writeFileSync(pdfPath, pdfData);
                    shell.openPath(pdfPath);
                    // Clean up PDF after viewer has had time to load it
                    setTimeout(() => { try { fs.unlinkSync(pdfPath); } catch {} }, 60000);
                    resolve({ success: true });
                })
                .catch((err) => {
                    printWin.destroy();
                    try { fs.unlinkSync(htmlPath); } catch {}
                    resolve({ success: false, error: err.message });
                });
        });

        printWin.webContents.once('did-fail-load', () => {
            printWin.destroy();
            try { fs.unlinkSync(htmlPath); } catch {}
            resolve({ success: false, error: 'Failed to load report' });
        });
    });
});

console.log('\n Pathogenius Main Process Ready');
console.log(`   Platform: ${os.platform()}`);
console.log(`   Node: ${process.versions.node}`);
console.log(`   Electron: ${process.versions.electron}`);
