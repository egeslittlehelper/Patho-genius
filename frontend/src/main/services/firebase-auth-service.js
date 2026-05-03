/**
 * FIREBASE-AUTH-SERVICE.JS
 * All Firebase operations via REST API — no browser SDK dependencies.
 * Auth: Firebase Auth REST API
 * Data: Firestore REST API
 */

const crypto = require('crypto');
const keytar = require('keytar');
const { firebaseConfig } = require('./firebase-config');
const encryptionService = require('./encryption-service');

const API_KEY = firebaseConfig.apiKey;
const PROJECT_ID = firebaseConfig.projectId;
const KEYTAR_SERVICE = 'pathogenius';
const KEYTAR_SESSION = 'auth-session';

const AUTH_BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN_BASE = 'https://securetoken.googleapis.com/v1/token';
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const DELETE_USER_FN_URL = 'https://deleteuser-7bio2qpqoa-uc.a.run.app';
const DELETE_SELF_FN_URL = 'https://deleteself-7bio2qpqoa-uc.a.run.app';

// In-memory session (cleared on app exit)
let currentSession = null; // { idToken, refreshToken, uid, email }

// Cached refresh token from a just-registered account, used to check email
// verification without doing a full sign-in on every button click.
let pendingVerificationRefreshToken = null;

/* ─── Firestore helpers ─────────────────────────────────────── */

function toFsVal(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsVal) } };
    if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFsVal(val)])) } };
    return { stringValue: String(v) };
}

function fromFsVal(v) {
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return parseInt(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('timestampValue' in v) return new Date(v.timestampValue);
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsVal);
    if ('mapValue' in v) return fromFsFields(v.mapValue.fields || {});
    return null;
}

function fromFsFields(fields) {
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFsVal(v)]));
}

function authHeaders(idToken) {
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
}

async function fsGet(path, idToken) {
    const res = await fetch(`${FS_BASE}/${path}`, { headers: authHeaders(idToken) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore GET ${path} failed: ${res.status}`);
    const doc = await res.json();
    return fromFsFields(doc.fields || {});
}

async function fsSet(path, data, idToken) {
    const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFsVal(v)]));
    const res = await fetch(`${FS_BASE}/${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(idToken) },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Firestore SET ${path} failed: ${res.status} ${err.error?.message || ''}`);
    }
}

async function fsUpdate(path, updates, idToken) {
    const fields = Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, toFsVal(v)]));
    const mask = Object.keys(updates).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const res = await fetch(`${FS_BASE}/${path}?${mask}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(idToken) },
        body: JSON.stringify({ fields })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Firestore UPDATE ${path} failed: ${res.status} ${err.error?.message || ''}`);
    }
}

async function fsList(path, idToken) {
    const res = await fetch(`${FS_BASE}/${path}`, { headers: authHeaders(idToken) });
    if (!res.ok) throw new Error(`Firestore LIST ${path} failed: ${res.status}`);
    const data = await res.json();
    return (data.documents || []).map(doc => fromFsFields(doc.fields || {}));
}

async function fsDelete(path, idToken) {
    const res = await fetch(`${FS_BASE}/${path}`, {
        method: 'DELETE',
        headers: authHeaders(idToken)
    });
    if (!res.ok && res.status !== 404) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Firestore DELETE ${path} failed: ${res.status} ${err.error?.message || ''}`);
    }
}

/* ─── Auth REST helpers ─────────────────────────────────────── */

async function authPost(endpoint, body) {
    const res = await fetch(`${AUTH_BASE}:${endpoint}?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Auth request failed');
    return data;
}

async function refreshIdToken() {
    if (!currentSession?.refreshToken) throw new Error('No refresh token');
    const res = await fetch(`${TOKEN_BASE}?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: currentSession.refreshToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Token refresh failed');
    currentSession.idToken = data.id_token;
    currentSession.refreshToken = data.refresh_token;
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_SESSION, JSON.stringify(currentSession));
    return data.id_token;
}

/* ─── Session helpers ───────────────────────────────────────── */

async function storeSession(session) {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_SESSION, JSON.stringify(session));
}

async function clearSession() {
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_SESSION);
    currentSession = null;
    pendingVerificationRefreshToken = null;
}

async function initUserEncryption(uid, idToken, userData) {
    let keyMaterial, salt, iterations;

    if (userData?.encKeyMaterial && userData?.encKeySalt) {
        // Key already exists in Firestore — use it with stored iteration count.
        // Legacy accounts that predate the 210k bump will have no encKeyIterations
        // field; default to 100000 so their existing blobs still decrypt.
        keyMaterial = userData.encKeyMaterial;
        salt = userData.encKeySalt;
        iterations = userData.encKeyIterations || 100000;
    } else {
        // Fresh account — generate key with current iteration target.
        keyMaterial = crypto.randomBytes(32).toString('hex');
        salt = crypto.randomBytes(16).toString('base64');
        iterations = 210000;

        // Write to Firestore — must succeed so all future machines converge on this key
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await fsUpdate(`users/${uid}`, {
                    encKeyMaterial: keyMaterial,
                    encKeySalt: salt,
                    encKeyIterations: iterations
                }, idToken);
                lastError = null;
                break;
            } catch (err) {
                lastError = err;
                if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }
        }
        if (lastError) {
            throw new Error('Failed to initialize account encryption key. Please check your connection and try again.');
        }
    }

    encryptionService.unlockEncryption(keyMaterial, salt, iterations);
}

function mapAuthError(message) {
    const map = {
        EMAIL_EXISTS: 'Email already registered',
        INVALID_EMAIL: 'Invalid email address',
        WEAK_PASSWORD: 'Password too weak (min 6 chars)',
        EMAIL_NOT_FOUND: 'Invalid username or password',
        INVALID_PASSWORD: 'Invalid username or password',
        INVALID_LOGIN_CREDENTIALS: 'Invalid username or password',
        USER_DISABLED: 'Account has been disabled',
        TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many failed attempts. Try again later.',
        OPERATION_NOT_ALLOWED: 'Operation not allowed'
    };
    for (const [key, msg] of Object.entries(map)) {
        if (message.includes(key)) return msg;
    }
    return 'Something went wrong. Please try again.';
}

/* ─── Public Auth API ───────────────────────────────────────── */

async function register({ username, email, password, displayName, institution }) {
    try {
        // 1. Check username availability (unauthenticated read — security rule: allow read: if true)
        const existing = await fsGet(`usernames/${username.toLowerCase()}`);
        if (existing) return { success: false, error: 'Username already taken' };

        // 2. Create Firebase Auth user
        const authData = await authPost('signUp', { email, password, returnSecureToken: true });
        const { localId: uid, idToken } = authData;

        // 3. Send verification email; cache refresh token for verification polling
        await authPost('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken });
        pendingVerificationRefreshToken = authData.refreshToken;

        // 4. Write user profile to Firestore (authenticated with fresh idToken)
        const now = new Date();
        await fsSet(`users/${uid}`, {
            uid,
            username: username.toLowerCase(),
            email: email.toLowerCase(),
            displayName: displayName || username,
            institution: institution || '',
            role: 'user',
            status: 'active',
            createdAt: now,
            updatedAt: now
        }, idToken);

        // 5. Write username → uid mapping
        await fsSet(`usernames/${username.toLowerCase()}`, {
            uid,
            email: email.toLowerCase()
        }, idToken);

        return { success: true, requiresVerification: true, email };
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, error: mapAuthError(error.message) };
    }
}

async function login(username, password) {
    try {
        // 1. Look up email by username
        const usernameDoc = await fsGet(`usernames/${username.toLowerCase()}`);
        if (!usernameDoc) return { success: false, error: 'Invalid username or password' };
        const { email } = usernameDoc;

        // 2. Sign in with Firebase Auth
        const authData = await authPost('signInWithPassword', { email, password, returnSecureToken: true });
        const { localId: uid, idToken, refreshToken } = authData;

        // 3. Check email verification
        const userInfo = await authPost('lookup', { idToken });
        if (!userInfo.users[0].emailVerified) {
            return { success: false, error: 'email-not-verified', email, password };
        }

        // 4. Check account status
        const userData = await fsGet(`users/${uid}`, idToken);
        if (!userData) return { success: false, error: 'Account not found. Please contact support.' };
        if (userData.status === 'suspended') return { success: false, error: 'account-suspended' };

        // 5. Store session
        currentSession = { idToken, refreshToken, uid, email: userData.email, role: userData.role || 'user' };
        await storeSession(currentSession);

        // 6. Initialize local file encryption for this user
        await initUserEncryption(uid, idToken, userData);

        // 7. Load settings
        let settings = null;
        try {
            settings = await fsGet(`settings/${uid}`, idToken);
        } catch { }

        return {
            success: true,
            user: {
                uid,
                username: userData.username,
                email: userData.email,
                displayName: userData.displayName,
                institution: userData.institution,
                role: userData.role,
                settings
            }
        };
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: mapAuthError(error.message) };
    }
}

async function logout(isGuest = false) {
    encryptionService.disableEncryption();
    if (!isGuest) await clearSession();
    currentSession = null;
    return { success: true };
}

async function restoreSession() {
    try {
        const raw = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_SESSION);
        if (!raw) return { success: false };

        currentSession = JSON.parse(raw);

        // Refresh idToken (expires after 1 hour)
        const idToken = await refreshIdToken();

        // Validate email still verified and account still active
        const userInfo = await authPost('lookup', { idToken });
        if (!userInfo.users[0].emailVerified) { await clearSession(); return { success: false }; }

        const userData = await fsGet(`users/${currentSession.uid}`, idToken);
        if (!userData || userData.status === 'suspended') { await clearSession(); return { success: false }; }

        // Keep role in sync with Firestore (may have changed since session was stored)
        currentSession.role = userData.role || 'user';

        // Re-init encryption
        await initUserEncryption(currentSession.uid, idToken, userData);

        // Load settings
        let settings = null;
        try { settings = await fsGet(`settings/${currentSession.uid}`, idToken); } catch { }

        return {
            success: true,
            user: {
                uid: currentSession.uid,
                username: userData.username,
                email: userData.email,
                displayName: userData.displayName,
                institution: userData.institution,
                role: userData.role,
                settings
            }
        };
    } catch (error) {
        console.error('Session restore failed:', error.message);
        await clearSession();
        return { success: false };
    }
}

async function changePassword(currentPassword, newPassword) {
    try {
        if (!currentSession) return { success: false, error: 'Not logged in' };

        // Re-authenticate with current password
        let reauth;
        try {
            reauth = await authPost('signInWithPassword', {
                email: currentSession.email,
                password: currentPassword,
                returnSecureToken: true
            });
        } catch (reauthError) {
            return { success: false, error: 'Incorrect current password' };
        }

        // Update password
        const updated = await authPost('update', {
            idToken: reauth.idToken,
            password: newPassword,
            returnSecureToken: true
        });

        // Refresh stored session tokens
        currentSession.idToken = updated.idToken;
        currentSession.refreshToken = updated.refreshToken;
        await storeSession(currentSession);

        return { success: true };
    } catch (error) {
        console.error('Change password error:', error);
        return { success: false, error: mapAuthError(error.message) };
    }
}

async function sendPasswordReset(email) {
    try {
        await authPost('sendOobCode', { requestType: 'PASSWORD_RESET', email });
    } catch { }
    // Always return success — don't reveal if email exists
    return { success: true, message: 'If an account exists with that email, a reset link has been sent.' };
}

async function resendVerificationEmail(email, password) {
    try {
        const authData = await authPost('signInWithPassword', { email, password, returnSecureToken: true });
        await authPost('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: authData.idToken });
        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to resend. Please check your email and password.' };
    }
}

async function checkEmailVerified(email, password) {
    try {
        let idToken;

        // Prefer refreshing the token from registration rather than a full re-auth,
        // to avoid hitting Firebase's rate limiter when the user polls the button.
        if (pendingVerificationRefreshToken) {
            try {
                const res = await fetch(`${TOKEN_BASE}?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: pendingVerificationRefreshToken })
                });
                const data = await res.json();
                if (res.ok) {
                    pendingVerificationRefreshToken = data.refresh_token;
                    idToken = data.id_token;
                }
            } catch { /* fall through to full sign-in */ }
        }

        if (!idToken) {
            const authData = await authPost('signInWithPassword', { email, password, returnSecureToken: true });
            idToken = authData.idToken;
        }

        const userInfo = await authPost('lookup', { idToken });
        const verified = userInfo.users[0].emailVerified;
        if (verified) pendingVerificationRefreshToken = null;
        return { success: true, verified };
    } catch {
        return { success: false, verified: false };
    }
}

function getCurrentUser() {
    return currentSession ? { uid: currentSession.uid, email: currentSession.email, role: currentSession.role || 'user' } : null;
}

async function getIdToken() {
    if (!currentSession) return null;
    try { return await refreshIdToken(); } catch { return null; }
}

/* ─── Settings ──────────────────────────────────────────────── */

async function saveSettings(settings) {
    try {
        if (!currentSession) return { success: false, error: 'Not logged in' };
        const idToken = await getIdToken();
        await fsSet(`settings/${currentSession.uid}`, { ...settings, updatedAt: new Date() }, idToken);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function loadSettings() {
    try {
        if (!currentSession) return { success: false, error: 'Not logged in' };
        const idToken = await getIdToken();
        const settings = await fsGet(`settings/${currentSession.uid}`, idToken);
        return { success: true, settings };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/* ─── Admin operations ──────────────────────────────────────── */

async function adminGetUsers() {
    try {
        const idToken = await getIdToken();
        if (!idToken) return { success: false, error: 'Not authenticated' };
        const users = await fsList('users', idToken);
        return { success: true, users };
    } catch (error) {
        console.error('adminGetUsers error:', error);
        return { success: false, error: error.message };
    }
}

async function adminSuspendUser(uid) {
    try {
        const idToken = await getIdToken();
        await fsUpdate(`users/${uid}`, { status: 'suspended', updatedAt: new Date() }, idToken);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function adminActivateUser(uid) {
    try {
        const idToken = await getIdToken();
        await fsUpdate(`users/${uid}`, { status: 'active', updatedAt: new Date() }, idToken);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function adminChangeUserRole(uid, newRole) {
    try {
        const idToken = await getIdToken();
        await fsUpdate(`users/${uid}`, { role: newRole, updatedAt: new Date() }, idToken);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function adminSendPasswordReset(email) {
    try {
        await authPost('sendOobCode', { requestType: 'PASSWORD_RESET', email });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function adminDeleteUser(uid) {
    try {
        const idToken = await getIdToken();
        const res = await fetch(DELETE_USER_FN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ uid })
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            return { success: false, error: `Cloud Function not reachable (HTTP ${res.status}). Make sure it is deployed.` };
        }
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error || 'Delete failed' };
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function deleteSelf() {
    try {
        const idToken = await getIdToken();
        const res = await fetch(DELETE_SELF_FN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            }
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            return { success: false, error: `Cloud Function not reachable (HTTP ${res.status}). Make sure it is deployed.` };
        }
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error || 'Delete failed' };
        currentSession = null;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function adminGetStats() {
    try {
        const idToken = await getIdToken();
        const users = await fsList('users', idToken);
        return {
            success: true,
            stats: {
                totalUsers: users.length,
                activeUsers: users.filter(u => u.status === 'active').length,
                suspendedUsers: users.filter(u => u.status === 'suspended').length,
                adminCount: users.filter(u => u.role === 'admin').length
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    register,
    login,
    logout,
    restoreSession,
    changePassword,
    sendPasswordReset,
    resendVerificationEmail,
    checkEmailVerified,
    getCurrentUser,
    getIdToken,
    saveSettings,
    loadSettings,
    adminGetUsers,
    adminSuspendUser,
    adminActivateUser,
    adminChangeUserRole,
    adminSendPasswordReset,
    adminDeleteUser,
    adminGetStats,
    deleteSelf,
    // Expose Firestore helpers for cloud-service
    fsGet,
    fsSet,
    fsUpdate,
    fsList,
    fsDelete
};
