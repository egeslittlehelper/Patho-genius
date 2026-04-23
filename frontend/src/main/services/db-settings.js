/**
 * DB-SETTINGS.JS — Persistent Custom Database Settings
 * ═══════════════════════════════════════════════════════
 * Stores the user-selected custom genome folder path and its discovered
 * FASTA/FNA files in a JSON file so it survives app restarts.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const SETTINGS_FILE = path.join(REPO_ROOT, 'frontend', 'db-settings.json');
const WORKFLOW_DIR = path.join(REPO_ROOT, 'Patho-genius');

/** File extensions recognized as FASTA genome files */
const FASTA_EXTENSIONS = new Set(['.fna', '.fasta', '.fa', '.fsa']);

/**
 * Check if a filename is a recognized FASTA file (plain or gzipped).
 */
function isFastaFile(fileName) {
    const lower = fileName.toLowerCase();
    const ext = path.extname(lower);

    // Direct match: .fna, .fasta, .fa, .fsa
    if (FASTA_EXTENSIONS.has(ext)) return true;

    // Gzipped: .fna.gz, .fasta.gz, etc.
    if (ext === '.gz') {
        const innerExt = path.extname(path.basename(lower, '.gz'));
        return FASTA_EXTENSIONS.has(innerExt);
    }

    return false;
}

/**
 * Load settings from disk. Returns defaults if file doesn't exist.
 */
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        }
    } catch (err) {
        console.error('Failed to read db-settings.json:', err.message);
    }
    return { customDbPath: null, customDbMapping: null, customDbFiles: [], lastUpdated: null, isBuilt: false };
}

/**
 * Save settings to disk.
 */
function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error('Failed to write db-settings.json:', err.message);
    }
}

/**
 * Get the stored custom database folder path (or null).
 */
function getCustomDbPath() {
    return loadSettings().customDbPath;
}

/**
 * Scan a folder for FASTA/FNA files and persist the path and mapping file.
 * Returns { success, path, files: [{ name, size }], totalSize }.
 */
function setCustomDbPath(folderPath, mappingFile = null) {
    if (!fs.existsSync(folderPath)) {
        return { success: false, error: `Folder not found: ${folderPath}` };
    }

    const stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
        return { success: false, error: 'Selected path is not a directory' };
    }

    // Scan for FASTA files
    let entries;
    try {
        entries = fs.readdirSync(folderPath);
    } catch (err) {
        return { success: false, error: `Cannot read folder: ${err.message}` };
    }

    const fastaFiles = [];
    let totalSize = 0;

    for (const entry of entries) {
        if (!isFastaFile(entry)) continue;
        const fullPath = path.join(folderPath, entry);
        try {
            const fileStat = fs.statSync(fullPath);
            if (fileStat.isFile()) {
                fastaFiles.push({ name: entry, size: fileStat.size });
                totalSize += fileStat.size;
            }
        } catch {
            // skip unreadable files
        }
    }

    if (fastaFiles.length === 0) {
        return {
            success: false,
            error: 'No FASTA files found (.fasta, .fna, .fa, .fsa, or .gz variants)',
        };
    }

    const settings = {
        customDbPath: folderPath,
        customDbMapping: mappingFile,
        customDbFiles: fastaFiles,
        totalSize,
        lastUpdated: new Date().toISOString(),
        isBuilt: false
    };
    saveSettings(settings);

    return {
        success: true,
        path: folderPath,
        files: fastaFiles,
        totalSize,
    };
}

/**
 * Clear the custom database path.
 */
function clearCustomDb() {
    saveSettings({ customDbPath: null, customDbMapping: null, customDbFiles: [], lastUpdated: null, isBuilt: false });
}

/**
 * Update config.yaml with custom database folder and run build script.
 */
async function buildCustomDb(folderPath) {
    return new Promise((resolve, reject) => {
        try {
            // Update config.yaml
            const configPath = path.join(WORKFLOW_DIR, 'config.yaml');
            let configContent = fs.readFileSync(configPath, 'utf8');
            const doc = yaml.load(configContent);

            const settings = loadSettings();
            
            const customSource = { path: folderPath };
            if (settings.customDbMapping) {
                customSource.reads_mapping = settings.customDbMapping;
            }

            // Ensure the genome_sources array contains both default and the new custom folder
            doc.genome_sources = [
                { path: "./clark_db" },
                customSource
            ];

            // Write back to config.yaml
            fs.writeFileSync(configPath, yaml.dump(doc));

            console.log('Spawning build_clark_db.py...');
            const pythonExec = process.platform === 'win32' ? 'python' : 'python3';
            const buildProc = spawn(pythonExec, ['build_clark_db.py'], {
                cwd: WORKFLOW_DIR,
                stdio: ['ignore', 'pipe', 'pipe'], // capture stdout/stderr
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });
            
            buildProc.stdout.on('data', (data) => {
                console.log(`[build_clark_db] ${data.toString().trim()}`);
            });
            
            buildProc.stderr.on('data', (data) => {
                console.error(`[build_clark_db ERROR] ${data.toString().trim()}`);
            });

            buildProc.on('close', async (code) => {
                console.log(`build_clark_db.py exited with code ${code}`);
                if (code === 0) {
                    // Update settings isBuilt to true
                    const settings = loadSettings();
                    settings.isBuilt = true;
                    saveSettings(settings);

                    // Sync to Jetson Nano if configured
                    try {
                        const syncResult = await syncDbToJetson();
                        if (syncResult.skipped) {
                            console.log('[DB Build] Jetson sync skipped (no GPU config)');
                        }
                    } catch (syncError) {
                        console.error('[DB Build] Warning: Jetson sync failed:', syncError.message);
                        console.error('[DB Build] CPU classification will still work. Fix Jetson connectivity and re-import to sync.');
                    }

                    resolve({ success: true });
                } else {
                    reject(new Error(`Database build failed with exit code ${code}`));
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Get info about the default built-in database (clark_db/).
 */
function getDefaultDbInfo() {
    const clarkDb = path.join(WORKFLOW_DIR, 'clark_db');
    const targetsFile = path.join(clarkDb, 'targets.txt');
    const customDir = path.join(clarkDb, 'Custom');

    let genomeCount = 0;
    let isBuilt = false;

    if (fs.existsSync(targetsFile)) {
        isBuilt = true;
        try {
            const lines = fs.readFileSync(targetsFile, 'utf-8').trim().split('\n');
            genomeCount = lines.length;
        } catch { /* ignore */ }
    }

    if (genomeCount === 0 && fs.existsSync(customDir)) {
        try {
            const files = fs.readdirSync(customDir).filter(f => isFastaFile(f));
            genomeCount = files.length;
        } catch { /* ignore */ }
    }

    return { path: clarkDb, isBuilt, genomeCount };
}

// ---------------------------------------------------------------------------
// Helper: spawn a command and return a promise
// ---------------------------------------------------------------------------
function runCommand(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, {
            cwd: opts.cwd || WORKFLOW_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            ...opts,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
        });
        proc.on('error', reject);
    });
}

// ---------------------------------------------------------------------------
// Sync custom database to Jetson Nano (GPU path)
// ---------------------------------------------------------------------------

/**
 * Sync the local clark_db/ directory to the Jetson Nano so CU-CLARK-L
 * can classify against the same custom reference database.
 *
 * Flow:
 *   1. Create a tar.gz archive of clark_db/ locally
 *   2. SSH: clean stale .tsk index files + old Custom/ on the Nano
 *   3. SCP: upload the tar.gz to the Nano
 *   4. SSH: extract, fix targets.txt paths (/db/ → remote_db), cleanup
 *
 * If jetson_nano config is missing in config.yaml, sync is skipped silently.
 */
async function syncDbToJetson() {
    // Read Jetson config from config.yaml
    const configPath = path.join(WORKFLOW_DIR, 'config.yaml');
    const doc = yaml.load(fs.readFileSync(configPath, 'utf8'));

    const jetson = doc.jetson_nano;
    if (!jetson || !jetson.host || !jetson.user || !jetson.remote_db) {
        console.log('[DB Sync] No Jetson Nano config found — skipping GPU sync');
        return { success: true, skipped: true };
    }

    const sshTarget = `${jetson.user}@${jetson.host}`;
    const remoteDb  = jetson.remote_db;
    const batchMode = jetson.ssh_batch_mode !== false ? 'yes' : 'no';
    const sshOpts   = [
        '-o', 'StrictHostKeyChecking=no',
        '-o', `BatchMode=${batchMode}`,
        '-o', 'ConnectTimeout=15',
        '-o', 'ServerAliveInterval=15',
    ];

    const clarkDb = path.join(WORKFLOW_DIR, 'clark_db');
    const tarFile = path.join(WORKFLOW_DIR, 'clark_db_sync.tar');

    console.log(`[DB Sync] Syncing clark_db to ${sshTarget}:${remoteDb} ...`);

    try {
        // 1) Create tar archive of clark_db locally (NO gzip — bsdtar gzip
        //    on 3 GB of FASTA text takes 20+ min; uncompressed tar is instant)
        console.log('[DB Sync] Step 1/4 — Creating archive...');
        await runCommand('tar', ['-cf', tarFile, '-C', clarkDb, '.']);

        // 2) SSH: clean stale index files and old Custom/ directory on Nano
        console.log('[DB Sync] Step 2/4 — Cleaning remote...');
        await runCommand('ssh', [
            ...sshOpts, sshTarget,
            `rm -rf ${remoteDb}/Custom ${remoteDb}/*.tsk.* && mkdir -p ${remoteDb}`,
        ]);

        // 3) SCP: upload the tar to the Nano
        const tarSizeMB = (fs.statSync(tarFile).size / (1024 * 1024)).toFixed(1);
        console.log(`[DB Sync] Step 3/4 — Uploading archive (${tarSizeMB} MB)...`);
        await runCommand('scp', [
            ...sshOpts, tarFile,
            `${sshTarget}:/tmp/clark_db_sync.tar`,
        ]);

        // 4) SSH: extract, fix targets.txt paths, cleanup temp file
        //    targets.txt has Docker paths like /db/Custom/file.fasta
        //    Nano needs absolute paths like /home/pathogen/cuclark_db/Custom/file.fasta
        console.log('[DB Sync] Step 4/4 — Extracting on Jetson Nano...');
        await runCommand('ssh', [
            ...sshOpts, sshTarget,
            `tar -xf /tmp/clark_db_sync.tar -C ${remoteDb} && ` +
            `rm -f /tmp/clark_db_sync.tar && ` +
            `sed -i 's|/db/|${remoteDb}/|g' ${remoteDb}/targets.txt`,
        ]);

        // Cleanup local tar
        try { fs.unlinkSync(tarFile); } catch { /* ignore */ }

        console.log('[DB Sync] Custom database synced to Jetson Nano');
        return { success: true };

    } catch (e) {
        // Cleanup local tar on error
        try { fs.unlinkSync(tarFile); } catch { /* ignore */ }
        throw e;
    }
}

module.exports = {
    loadSettings,
    saveSettings,
    getCustomDbPath,
    setCustomDbPath,
    buildCustomDb,
    syncDbToJetson,
    clearCustomDb,
    getDefaultDbInfo,
    isFastaFile,
    WORKFLOW_DIR,
};
