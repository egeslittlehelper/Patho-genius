/**
 * DB-SETTINGS.JS — Named Reference Database Manager
 * ═══════════════════════════════════════════════════
 * Stores an array of named custom reference databases (genomes folder +
 * reads-mapping TSV) with per-database Jetson Nano sync status.
 *
 * Only ONE database can be "active" at a time — the one whose content is
 * currently materialised in clark_db/.  Creating / building a new database
 * makes it the active one and deactivates all others.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const SETTINGS_FILE = path.join(REPO_ROOT, 'frontend', 'db-settings.json');
const WORKFLOW_DIR = path.join(REPO_ROOT, 'Patho-genius');

/** File extensions recognised as FASTA genome files */
const FASTA_EXTENSIONS = new Set(['.fna', '.fasta', '.fa', '.fsa']);

function isFastaFile(fileName) {
    const lower = fileName.toLowerCase();
    const ext = path.extname(lower);
    if (FASTA_EXTENSIONS.has(ext)) return true;
    if (ext === '.gz') {
        const innerExt = path.extname(path.basename(lower, '.gz'));
        return FASTA_EXTENSIONS.has(innerExt);
    }
    return false;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            // Migrate from legacy single-DB format
            if (!raw.databases) {
                return { databases: [] };
            }
            return raw;
        }
    } catch (err) {
        console.error('Failed to read db-settings.json:', err.message);
    }
    return { databases: [] };
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error('Failed to write db-settings.json:', err.message);
    }
}

// ---------------------------------------------------------------------------
// Database CRUD
// ---------------------------------------------------------------------------

/**
 * Return the full list of named databases.
 */
function listDatabases() {
    return loadSettings().databases;
}

/**
 * Return the currently active database (the one clark_db/ was built from), or null.
 */
function getActiveDatabase() {
    return listDatabases().find(db => db.isActive) || null;
}

/**
 * Scan a genomes folder and register a new named database.
 * Does NOT build yet — call buildDatabase() for that.
 * Returns the new database record or an error.
 */
function addDatabase(name, genomesPath, mappingFile, syncToJetson) {
    if (!name || !name.trim()) {
        return { success: false, error: 'Database name is required' };
    }
    if (!fs.existsSync(genomesPath) || !fs.statSync(genomesPath).isDirectory()) {
        return { success: false, error: `Genomes folder not found: ${genomesPath}` };
    }
    if (mappingFile && !fs.existsSync(mappingFile)) {
        return { success: false, error: `Mapping file not found: ${mappingFile}` };
    }

    // Scan for FASTA files
    let entries;
    try { entries = fs.readdirSync(genomesPath); }
    catch (err) { return { success: false, error: `Cannot read folder: ${err.message}` }; }

    const fastaFiles = [];
    let totalSize = 0;
    for (const entry of entries) {
        if (!isFastaFile(entry)) continue;
        const fullPath = path.join(genomesPath, entry);
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
                fastaFiles.push({ name: entry, size: stat.size });
                totalSize += stat.size;
            }
        } catch { /* skip */ }
    }

    if (fastaFiles.length === 0) {
        return { success: false, error: 'No FASTA files found (.fasta, .fna, .fa, .fsa, or .gz)' };
    }

    const id = 'db_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const record = {
        id,
        name: name.trim(),
        genomesPath,
        mappingFile: mappingFile || null,
        files: fastaFiles,
        genomeCount: fastaFiles.length,
        totalSize,
        isBuilt: false,
        isActive: false,
        syncToJetson: !!syncToJetson,
        syncedToJetson: false,
        createdAt: new Date().toISOString(),
    };

    const settings = loadSettings();
    settings.databases.push(record);
    saveSettings(settings);

    return { success: true, database: record };
}

/**
 * Remove a named database by ID.
 */
function removeDatabase(id) {
    const settings = loadSettings();
    settings.databases = settings.databases.filter(db => db.id !== id);
    saveSettings(settings);
    return { success: true };
}

// ---------------------------------------------------------------------------
// Build & Sync
// ---------------------------------------------------------------------------

/**
 * Build clark_db/ from the named database's genomes + mapping.
 * This makes the database "active" and deactivates all others.
 */
async function buildDatabase(databaseId) {
    const settings = loadSettings();
    const db = settings.databases.find(d => d.id === databaseId);
    if (!db) return Promise.reject(new Error('Database not found'));

    // Update config.yaml with this database's genome sources
    const configPath = path.join(WORKFLOW_DIR, 'config.yaml');
    const doc = yaml.load(fs.readFileSync(configPath, 'utf8'));

    const customSource = { path: db.genomesPath };
    if (db.mappingFile) {
        customSource.reads_mapping = db.mappingFile;
    }
    doc.genome_sources = [
        { path: './clark_db' },
        customSource,
    ];
    fs.writeFileSync(configPath, yaml.dump(doc));

    // Run build_clark_db.py
    return new Promise((resolve, reject) => {
        console.log(`[DB Build] Building database "${db.name}" from ${db.genomesPath} ...`);
        const pythonExec = process.platform === 'win32' ? 'python' : 'python3';
        const proc = spawn(pythonExec, ['build_clark_db.py'], {
            cwd: WORKFLOW_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });

        proc.stdout.on('data', d => console.log(`[build_clark_db] ${d.toString().trim()}`));
        proc.stderr.on('data', d => console.error(`[build_clark_db ERROR] ${d.toString().trim()}`));

        proc.on('close', async (code) => {
            console.log(`build_clark_db.py exited with code ${code}`);
            if (code !== 0) {
                return reject(new Error(`Database build failed with exit code ${code}`));
            }

            // Mark as built & active
            const s = loadSettings();
            for (const d of s.databases) {
                d.isActive = (d.id === databaseId);
            }
            const rec = s.databases.find(d => d.id === databaseId);
            if (rec) {
                rec.isBuilt = true;
            }
            saveSettings(s);

            // Optionally sync to Jetson
            if (db.syncToJetson) {
                try {
                    const syncResult = await syncDbToJetson();
                    if (syncResult.skipped) {
                        console.log('[DB Build] Jetson sync skipped (no GPU config in config.yaml)');
                    } else {
                        // Mark synced
                        const s2 = loadSettings();
                        const rec2 = s2.databases.find(d => d.id === databaseId);
                        if (rec2) rec2.syncedToJetson = true;
                        saveSettings(s2);
                    }
                } catch (err) {
                    console.error('[DB Build] Jetson sync failed:', err.message);
                    console.error('[DB Build] CPU classification will still work.');
                }
            }

            resolve({ success: true });
        });

        proc.on('error', reject);
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
async function syncDbToJetson() {
    const configPath = path.join(WORKFLOW_DIR, 'config.yaml');
    const doc = yaml.load(fs.readFileSync(configPath, 'utf8'));

    const jetson = doc.jetson_nano;
    if (!jetson || !jetson.host || !jetson.user || !jetson.remote_db) {
        console.log('[DB Sync] No Jetson Nano config found - skipping GPU sync');
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
        console.log('[DB Sync] Step 1/4 - Creating archive...');
        await runCommand('tar', ['-cf', tarFile, '-C', clarkDb, '.']);

        console.log('[DB Sync] Step 2/4 - Cleaning remote...');
        await runCommand('ssh', [
            ...sshOpts, sshTarget,
            `rm -rf ${remoteDb}/Custom ${remoteDb}/*.tsk.* && mkdir -p ${remoteDb}`,
        ]);

        const tarSizeMB = (fs.statSync(tarFile).size / (1024 * 1024)).toFixed(1);
        console.log(`[DB Sync] Step 3/4 - Uploading archive (${tarSizeMB} MB)...`);
        await runCommand('scp', [
            ...sshOpts, tarFile,
            `${sshTarget}:/tmp/clark_db_sync.tar`,
        ]);

        console.log('[DB Sync] Step 4/4 - Extracting on Jetson Nano...');
        await runCommand('ssh', [
            ...sshOpts, sshTarget,
            `tar -xf /tmp/clark_db_sync.tar -C ${remoteDb} && ` +
            `rm -f /tmp/clark_db_sync.tar && ` +
            `sed -i 's|/db/|${remoteDb}/|g' ${remoteDb}/targets.txt`,
        ]);

        try { fs.unlinkSync(tarFile); } catch { /* ignore */ }
        console.log('[DB Sync] Custom database synced to Jetson Nano');
        return { success: true };

    } catch (e) {
        try { fs.unlinkSync(tarFile); } catch { /* ignore */ }
        throw e;
    }
}

// ---------------------------------------------------------------------------
// Legacy compat: clearCustomDb / setCustomDbPath / getCustomDbPath
// ---------------------------------------------------------------------------
function clearCustomDb() {
    const settings = loadSettings();
    settings.databases = settings.databases.filter(db => !db.isActive);
    saveSettings(settings);
}

function getCustomDbPath() {
    const active = getActiveDatabase();
    return active ? active.genomesPath : null;
}

function setCustomDbPath(folderPath, mappingFile = null) {
    // Legacy: creates a temporary unnamed database
    const result = addDatabase('Custom Database', folderPath, mappingFile, false);
    return result;
}

// Legacy buildCustomDb — now delegates to buildDatabase
async function buildCustomDb(folderPath) {
    const active = getActiveDatabase();
    if (!active) {
        // Find the most recently added database that matches this folder
        const dbs = listDatabases();
        const match = dbs.find(db => db.genomesPath === folderPath) || dbs[dbs.length - 1];
        if (match) return buildDatabase(match.id);
        throw new Error('No database found to build');
    }
    return buildDatabase(active.id);
}

module.exports = {
    loadSettings,
    saveSettings,
    listDatabases,
    getActiveDatabase,
    addDatabase,
    removeDatabase,
    buildDatabase,
    syncDbToJetson,
    getDefaultDbInfo,
    isFastaFile,
    // Legacy
    getCustomDbPath,
    setCustomDbPath,
    buildCustomDb,
    clearCustomDb,
    WORKFLOW_DIR,
};
