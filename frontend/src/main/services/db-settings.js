/**
 * DB-SETTINGS.JS — Persistent Custom Database Settings
 * ═══════════════════════════════════════════════════════
 * Stores the user-selected custom genome folder path and its discovered
 * FASTA/FNA files in a JSON file so it survives app restarts.
 */

const fs = require('fs');
const path = require('path');

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
    return { customDbPath: null, customDbFiles: [], lastUpdated: null };
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
 * Scan a folder for FASTA/FNA files and persist the path.
 * Returns { success, path, files: [{ name, size }], totalSize }.
 */
function setCustomDbPath(folderPath) {
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
        customDbFiles: fastaFiles,
        totalSize,
        lastUpdated: new Date().toISOString(),
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
    saveSettings({ customDbPath: null, customDbFiles: [], lastUpdated: null });
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
    clearCustomDb,
    getDefaultDbInfo,
    isFastaFile,
    WORKFLOW_DIR,
};
