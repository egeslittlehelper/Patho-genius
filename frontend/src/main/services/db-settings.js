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

            buildProc.on('close', (code) => {
                console.log(`build_clark_db.py exited with code ${code}`);
                if (code === 0) {
                    // Update settings isBuilt to true
                    const settings = loadSettings();
                    settings.isBuilt = true;
                    saveSettings(settings);
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

module.exports = {
    loadSettings,
    saveSettings,
    getCustomDbPath,
    setCustomDbPath,
    buildCustomDb,
    clearCustomDb,
    getDefaultDbInfo,
    isFastaFile,
    WORKFLOW_DIR,
};
