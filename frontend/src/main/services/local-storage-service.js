/**
 * LOCAL-STORAGE-SERVICE.JS
 * Encrypted local result file management.
 * Files stored in Electron's userData directory, encrypted with AES-256-GCM.
 * Guest data is wiped on logout.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const encryptionService = require('./encryption-service');

function resultsDir(uid) {
    const dir = path.join(app.getPath('userData'), 'results', uid || 'guest');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function saveResultLocally(analysisId, uid, resultData, meta = null) {
    try {
        const dir = resultsDir(uid);
        const filePath = path.join(dir, `${analysisId}.enc`);
        const toEncrypt = typeof resultData === 'object' ? JSON.stringify(resultData) : resultData;
        const encrypted = encryptionService.encrypt(toEncrypt);
        if (!encrypted.success) throw new Error(encrypted.error);
        fs.writeFileSync(filePath, encrypted.encrypted, 'utf8');

        // Save lightweight unencrypted metadata sidecar for fast listing
        if (meta) {
            const metaPath = path.join(dir, `${analysisId}.meta.json`);
            fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
        }

        return { success: true, localPath: filePath };
    } catch (error) {
        console.error('saveResultLocally error:', error);
        return { success: false, error: error.message };
    }
}

async function loadResultLocally(analysisId, uid) {
    try {
        const filePath = path.join(resultsDir(uid), `${analysisId}.enc`);
        if (!fs.existsSync(filePath)) return { success: false, error: 'Result file not found' };
        const encryptedData = fs.readFileSync(filePath, 'utf8');
        const decrypted = encryptionService.decrypt(encryptedData);
        if (!decrypted.success) throw new Error(decrypted.error);
        return { success: true, data: decrypted.decrypted };
    } catch (error) {
        console.error('loadResultLocally error:', error);
        return { success: false, error: error.message };
    }
}

async function deleteLocalResult(analysisId, uid) {
    try {
        const dir = resultsDir(uid);
        const encPath = path.join(dir, `${analysisId}.enc`);
        const metaPath = path.join(dir, `${analysisId}.meta.json`);
        if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function listLocalResults(uid) {
    try {
        const dir = resultsDir(uid);
        if (!fs.existsSync(dir)) return { success: true, files: [] };
        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.enc'))
            .map(f => {
                const analysisId = f.replace('.enc', '');
                const filePath = path.join(dir, f);
                const stat = fs.statSync(filePath);
                // Read metadata sidecar if present (avoids decrypting just to list)
                let meta = {};
                const metaPath = path.join(dir, `${analysisId}.meta.json`);
                if (fs.existsSync(metaPath)) {
                    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
                }
                return { analysisId, filePath, sizeBytes: stat.size, modifiedAt: stat.mtime, ...meta };
            });
        return { success: true, files };
    } catch (error) {
        return { success: false, error: error.message, files: [] };
    }
}

async function clearGuestData() {
    try {
        const dir = path.join(app.getPath('userData'), 'results', 'guest');
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        return { success: true };
    } catch (error) {
        console.error('clearGuestData error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    saveResultLocally,
    loadResultLocally,
    deleteLocalResult,
    listLocalResults,
    clearGuestData
};
