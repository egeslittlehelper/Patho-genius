/**
 * CLOUD-SERVICE.JS
 * Firebase Storage (REST API) + Firestore metadata for analysis results.
 * Results are AES-256-GCM encrypted before upload.
 */

const { firebaseConfig } = require('./firebase-config');
const { getIdToken, fsSet, fsUpdate, fsList } = require('./firebase-auth-service');
const encryptionService = require('./encryption-service');

const BUCKET = firebaseConfig.storageBucket;
const STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
const PROJECT_ID = firebaseConfig.projectId;
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function storagePath(uid, analysisId) {
    return `results%2F${uid}%2F${analysisId}.enc`;
}

async function storageHeaders(idToken) {
    return { Authorization: `Bearer ${idToken}` };
}

/* ─── Upload ────────────────────────────────────────────────── */

async function uploadResult(analysisId, uid, resultData) {
    try {
        const idToken = await getIdToken();
        if (!idToken) return { success: false, error: 'Not authenticated' };

        // Encrypt before upload
        const encrypted = encryptionService.encrypt(resultData);
        if (!encrypted.success) throw new Error('Encryption failed: ' + encrypted.error);

        const encodedPath = storagePath(uid, analysisId);
        const uploadUrl = `${STORAGE_BASE}?uploadType=media&name=${encodedPath.replace(/%2F/g, '/')}`;

        const res = await fetch(
            `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=results/${uid}/${analysisId}.enc`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    'Content-Type': 'text/plain'
                },
                body: encrypted.encrypted
            }
        );

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Upload failed: ${res.status}`);
        }

        const cloudPath = `results/${uid}/${analysisId}.enc`;

        // Parse metadata from result data to populate Firestore fields
        let sampleName = analysisId;
        let sampleType = '';
        let completedAt = new Date();
        let detectedCount = 0;
        try {
            const parsed = typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
            sampleName = parsed.analysis_name || parsed.config?.analysis_name || analysisId;
            sampleType = parsed.sample_type || parsed.config?.sample_type || '';
            completedAt = parsed.completed_at ? new Date(parsed.completed_at) : new Date();
            detectedCount = Array.isArray(parsed.pathogens) ? parsed.pathogens.length : 0;
        } catch {}

        // Update Firestore metadata with full fields so cloud results list shows correct names
        await syncMetadataField(uid, analysisId, {
            analysisId,
            sampleName,
            sampleType,
            hasCloudBackup: true,
            cloudPath,
            completedAt,
            detectedCount,
            status: 'completed'
        }, idToken);

        return { success: true, cloudPath };
    } catch (error) {
        console.error('Upload error:', error);
        return { success: false, error: error.message };
    }
}

/* ─── Download ──────────────────────────────────────────────── */

async function downloadResult(analysisId, uid) {
    try {
        const idToken = await getIdToken();
        if (!idToken) return { success: false, error: 'Not authenticated' };

        const encodedPath = storagePath(uid, analysisId);
        const res = await fetch(`${STORAGE_BASE}/${encodedPath}?alt=media`, {
            headers: { Authorization: `Bearer ${idToken}` }
        });

        if (!res.ok) {
            if (res.status === 404) return { success: false, error: 'File not found in cloud' };
            throw new Error(`Download failed: ${res.status}`);
        }

        const encryptedStr = await res.text();
        const decrypted = encryptionService.decrypt(encryptedStr);
        if (!decrypted.success) throw new Error('Decryption failed — wrong key or corrupted data');

        return { success: true, data: decrypted.decrypted };
    } catch (error) {
        console.error('Download error:', error);
        return { success: false, error: error.message };
    }
}

/* ─── Delete ────────────────────────────────────────────────── */

async function deleteCloudResult(analysisId, uid) {
    try {
        const idToken = await getIdToken();
        if (!idToken) return { success: false, error: 'Not authenticated' };

        const encodedPath = storagePath(uid, analysisId);
        const res = await fetch(`${STORAGE_BASE}/${encodedPath}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${idToken}` }
        });

        if (!res.ok && res.status !== 404) {
            throw new Error(`Delete failed: ${res.status}`);
        }

        // Update Firestore metadata
        await syncMetadataField(uid, analysisId, { hasCloudBackup: false, cloudPath: null }, idToken);

        return { success: true };
    } catch (error) {
        console.error('Delete cloud result error:', error);
        return { success: false, error: error.message };
    }
}

/* ─── List cloud results ────────────────────────────────────── */

async function getCloudResultsList(uid) {
    try {
        const idToken = await getIdToken();
        if (!idToken) return { success: false, error: 'Not authenticated', results: [] };

        // List all analysis metadata docs for this user
        const docs = await fsList(`analysis_metadata/${uid}/analyses`, idToken);
        const results = docs.filter(d => d.hasCloudBackup);
        return { success: true, results };
    } catch (error) {
        console.error('Get cloud results error:', error);
        return { success: false, error: error.message, results: [] };
    }
}

/* ─── Sync analysis metadata to Firestore ───────────────────── */

async function syncAnalysisMetadata(uid, analysisId, metadata) {
    try {
        const idToken = await getIdToken();
        if (!idToken) return { success: false, error: 'Not authenticated' };

        await syncMetadataField(uid, analysisId, {
            analysisId,
            sampleName: metadata.sampleName || '',
            sampleType: metadata.sampleType || '',
            status: metadata.status || 'completed',
            createdAt: metadata.createdAt ? new Date(metadata.createdAt) : new Date(),
            completedAt: new Date(),
            detectedCount: typeof metadata.detectedCount === 'number' ? metadata.detectedCount : 0,
            hasCloudBackup: false,
            cloudPath: null
        }, idToken);

        return { success: true };
    } catch (error) {
        console.error('Sync metadata error:', error);
        return { success: false, error: error.message };
    }
}

/* ─── Internal helpers ──────────────────────────────────────── */

async function syncMetadataField(uid, analysisId, fields, idToken) {
    const path = `analysis_metadata/${uid}/analyses/${analysisId}`;
    // Try update first; if doc doesn't exist, create it
    try {
        await fsUpdate(path, { ...fields, updatedAt: new Date() }, idToken);
    } catch {
        await fsSet(path, { analysisId, ...fields, updatedAt: new Date() }, idToken);
    }
}

module.exports = {
    uploadResult,
    downloadResult,
    deleteCloudResult,
    getCloudResultsList,
    syncAnalysisMetadata
};
