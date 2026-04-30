/**
 * Encryption Service (Main Process)
 */

const crypto = require('crypto');

const ENCRYPTION_CONFIG = {
    ALGORITHM: 'aes-256-gcm',
    KEY_LENGTH: 32,
    IV_LENGTH: 16,
    SALT_LENGTH: 16,
    TAG_LENGTH: 16,
    ITERATIONS: 210000, // PBKDF2 SHA-512 iterations (default for new accounts)
    DIGEST: 'sha512'
};

// In-memory key storage (cleared on process exit)
let encryptionKey = null;
let isEncryptionEnabled = false;

/**
 * Derive encryption key from password using PBKDF2
 * @param {string} password - User password
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Buffer} Derived key
 */
function deriveKey(password, salt, iterations) {
    return crypto.pbkdf2Sync(
        password,
        salt,
        iterations || ENCRYPTION_CONFIG.ITERATIONS,
        ENCRYPTION_CONFIG.KEY_LENGTH,
        ENCRYPTION_CONFIG.DIGEST
    );
}

/**
 * Unlock encryption with existing salt
 * @param {string} password - User password
 * @param {string} saltBase64 - Salt from previous initialization
 * @returns {{success: boolean, error?: string}}
 */
function unlockEncryption(password, saltBase64, iterations) {
    try {
        const salt = Buffer.from(saltBase64, 'base64');
        encryptionKey = deriveKey(password, salt, iterations);
        isEncryptionEnabled = true;
        console.log('Encryption unlocked');
        return { success: true };
    } catch (error) {
        console.error('Encryption unlock error:', error);
        return { success: false, error: 'Invalid password or corrupted data' };
    }
}

/**
 * Encrypt data
 * @param {string|object} data - Data to encrypt
 * @returns {{success: boolean, encrypted?: string, error?: string}}
 */
function encrypt(data) {
    try {
        if (!isEncryptionEnabled || !encryptionKey) {
            // Return data as-is if encryption not enabled
            return { 
                success: true, 
                encrypted: typeof data === 'string' ? data : JSON.stringify(data),
                isPlaintext: true
            };
        }

        const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
        
        // Generate random IV
        const iv = crypto.randomBytes(ENCRYPTION_CONFIG.IV_LENGTH);
        
        // Create cipher
        const cipher = crypto.createCipheriv(
            ENCRYPTION_CONFIG.ALGORITHM,
            encryptionKey,
            iv
        );
        
        // Encrypt
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        // Get auth tag
        const authTag = cipher.getAuthTag();
        
        // Combine IV + AuthTag + Encrypted data
        const combined = Buffer.concat([
            iv,
            authTag,
            Buffer.from(encrypted, 'base64')
        ]).toString('base64');
        
        return { success: true, encrypted: combined };
    } catch (error) {
        console.error('Encryption error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Decrypt data
 * @param {string} encryptedData - Encrypted data string
 * @returns {{success: boolean, decrypted?: any, error?: string}}
 */
function decrypt(encryptedData) {
    try {
        if (!isEncryptionEnabled || !encryptionKey) {
            try { return { success: true, decrypted: JSON.parse(encryptedData) }; }
            catch { return { success: true, decrypted: encryptedData }; }
        }

        const combined = Buffer.from(encryptedData, 'base64');
        const iv = combined.slice(0, ENCRYPTION_CONFIG.IV_LENGTH);
        const authTag = combined.slice(
            ENCRYPTION_CONFIG.IV_LENGTH,
            ENCRYPTION_CONFIG.IV_LENGTH + ENCRYPTION_CONFIG.TAG_LENGTH
        );
        const encrypted = combined.slice(ENCRYPTION_CONFIG.IV_LENGTH + ENCRYPTION_CONFIG.TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ENCRYPTION_CONFIG.ALGORITHM, encryptionKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        try { return { success: true, decrypted: JSON.parse(decrypted) }; }
        catch { return { success: true, decrypted }; }
    } catch (error) {
        console.error('Decryption error:', error);
        return { success: false, error: 'Decryption failed - invalid password or corrupted data' };
    }
}

/**
 * Disable encryption and clear key
 */
function disableEncryption() {
    encryptionKey = null;
    isEncryptionEnabled = false;
    console.log('Encryption disabled');
}

/**
 * Check if encryption is enabled
 * @returns {boolean}
 */
function isEnabled() {
    return isEncryptionEnabled;
}

/**
 * Hash password for storage (NOT for encryption key)
 * @param {string} password - Password to hash
 * @returns {string} Hashed password
 */
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512');
    return salt.toString('hex') + ':' + hash.toString('hex');
}

function verifyPassword(password, storedHash) {
    const [saltHex, hashHex] = storedHash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const hash = crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512');
    return hash.toString('hex') === hashHex;
}

/**
 * Generate secure random token
 * @param {number} length - Token length in bytes
 * @returns {string} Random token
 */
function generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

module.exports = {
    unlockEncryption,
    encrypt,
    decrypt,
    disableEncryption,
    isEnabled,
    hashPassword,
    verifyPassword,
    generateToken,
    ENCRYPTION_CONFIG
};

