/**
 * LOCAL-STORAGE-SERVICE.JS
 * Encrypted local result file management.
 * Files stored in Electron's userData directory, encrypted with AES-256-GCM.
 * Guest data is wiped on logout.
 *
 * On-disk layout per analysis:
 *   {analysisId}.enc        — encrypted full result payload (omitted for failures)
 *   {analysisId}.meta.json  — plain-text index fields ONLY: id, status, date, detectedCount
 *                             NO user-provided names or sample types (those go in .enc)
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

/**
 * Save a completed analysis result.
 * Writes an encrypted .enc file (full result) and a plain .meta.json (non-sensitive index only).
 * For failed analyses (resultData is null), only the .meta.json is written.
 *
 * meta fields:
 *   status           — 'completed' | 'failed' | 'cancelled'  (plain — needed for filtering)
 *   completed_at     — ISO timestamp                          (plain — needed for sorting)
 *   detectedCount    — integer                               (plain — needed for summary)
 *   error            — error message for failures             (plain — needed to display reason)
 *   analysis_name    — ENCRYPTED ONLY (inside resultData or encryptedMeta)
 *   sample_type      — ENCRYPTED ONLY
 */
async function saveResultLocally(analysisId, uid, resultData, meta = null) {
    try {
        const dir = resultsDir(uid);

        const hasResult = resultData !== null && resultData !== undefined;

        if (hasResult) {
            // Wrap result alongside sensitive meta so both are encrypted together
            const payload = {
                result: typeof resultData === 'string' ? JSON.parse(resultData) : resultData,
                analysis_name: meta?.analysis_name || null,
                sample_type: meta?.sample_type || null,
            };
            const encrypted = encryptionService.encrypt(JSON.stringify(payload));
            if (!encrypted.success) throw new Error(encrypted.error);
            fs.writeFileSync(path.join(dir, `${analysisId}.enc`), encrypted.encrypted, 'utf8');
        }

        // Plain sidecar — index fields + analysis_name for failed results (no .enc exists for them)
        if (meta) {
            const safeMeta = {
                status: meta.status || 'completed',
                completed_at: meta.completed_at || new Date().toISOString(),
                detectedCount: meta.detectedCount ?? 0,
                ...(meta.hasCloudBackup !== undefined ? { hasCloudBackup: meta.hasCloudBackup } : {}),
                ...(meta.error ? { error: meta.error } : {}),
                ...(!hasResult && meta.analysis_name ? { analysis_name: meta.analysis_name } : {}),
            };
            fs.writeFileSync(
                path.join(dir, `${analysisId}.meta.json`),
                JSON.stringify(safeMeta),
                'utf8'
            );
        }

        return { success: true };
    } catch (error) {
        console.error('saveResultLocally error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Load a result. Returns the decrypted payload including analysis_name and sample_type.
 * For failures (no .enc file), returns null data with the plain meta fields.
 */
async function loadResultLocally(analysisId, uid) {
    try {
        const dir = resultsDir(uid);
        const encPath = path.join(dir, `${analysisId}.enc`);

        if (!fs.existsSync(encPath)) {
            // Failure record — no encrypted data, return meta only
            const metaPath = path.join(dir, `${analysisId}.meta.json`);
            if (!fs.existsSync(metaPath)) return { success: false, error: 'Result not found' };
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            return { success: true, data: null, meta };
        }

        const encryptedData = fs.readFileSync(encPath, 'utf8');
        const decrypted = encryptionService.decrypt(encryptedData);
        if (!decrypted.success) throw new Error(decrypted.error);

        // Unwrap the payload (new format has .result / .analysis_name / .sample_type)
        const payload = decrypted.decrypted;
        if (payload && typeof payload === 'object' && 'result' in payload) {
            return { success: true, data: payload.result, analysis_name: payload.analysis_name, sample_type: payload.sample_type };
        }
        // Legacy format: payload IS the result directly
        return { success: true, data: payload };
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

/**
 * List all local results. Includes both completed (.enc + .meta.json) and
 * failed (only .meta.json) entries. Sensitive fields (name, sample_type) are
 * not available here — they are only inside the encrypted .enc file.
 */
async function listLocalResults(uid) {
    try {
        const dir = resultsDir(uid);
        if (!fs.existsSync(dir)) return { success: true, files: [] };

        const allFiles = fs.readdirSync(dir);
        const metaFiles = allFiles.filter(f => f.endsWith('.meta.json'));

        const files = metaFiles.map(f => {
            const analysisId = f.replace('.meta.json', '');
            const metaPath = path.join(dir, f);
            const encPath = path.join(dir, `${analysisId}.enc`);
            const hasEnc = fs.existsSync(encPath);
            const stat = fs.statSync(metaPath);

            let meta = {};
            try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}

            return {
                analysisId,
                hasResult: hasEnc,
                sizeBytes: hasEnc ? fs.statSync(encPath).size : 0,
                modifiedAt: stat.mtime,
                ...meta,
            };
        });

        return { success: true, files };
    } catch (error) {
        return { success: false, error: error.message, files: [] };
    }
}

async function markAsCloudSynced(analysisId, uid) {
    try {
        const metaPath = path.join(resultsDir(uid), `${analysisId}.meta.json`);
        if (!fs.existsSync(metaPath)) return { success: false, error: 'Meta not found' };
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        meta.hasCloudBackup = true;
        fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function unmarkCloudSync(analysisId, uid) {
    try {
        const metaPath = path.join(resultsDir(uid), `${analysisId}.meta.json`);
        if (!fs.existsSync(metaPath)) return { success: false, error: 'Meta not found' };
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        meta.hasCloudBackup = false;
        delete meta.cloudPath;
        fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
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
    markAsCloudSynced,
    unmarkCloudSync,
    clearGuestData
};
