/**
 * UTILS.JS - Utility Functions
 * Purpose: Common helper functions for the application
 */

const Utils = {
    /**
     * Format bytes to human readable (e.g., "12.4 GB")
     * @param {number} bytes - Size in bytes
     * @param {number} decimals - Decimal places
     * @returns {string} Formatted size
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        if (!bytes) return '—';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
    },

    /**
     * Format large numbers (e.g., "3.42M", "1.5K")
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    formatLargeNumber(num) {
        if (!num && num !== 0) return '—';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return num.toString();
    },

    /**
     * Format read counts (alias for formatLargeNumber for semantic clarity)
     * @param {number} reads - Number of reads
     * @returns {string} Formatted reads
     */
    formatReads(reads) {
        return this.formatLargeNumber(reads);
    },

    /**
     * Format date (e.g., "Dec 12, 2025")
     * @param {string|Date} date - Date to format
     * @returns {string} Formatted date
     */
    formatDate(date) {
        if (!date) return '—';
        const d = new Date(date);
        if (isNaN(d.getTime())) return date.toString();
        return d.toLocaleDateString('en-US', {
            year: 'numeric', 
            month: 'short', 
            day: 'numeric'
        });
    },

    /**
     * Format date with time (e.g., "Dec 12, 2025 at 3:45 PM")
     * @param {string|Date} date - Date to format
     * @returns {string} Formatted date and time
     */
    formatDateTime(date) {
        if (!date) return '—';
        const d = new Date(date);
        if (isNaN(d.getTime())) return date.toString();
        return this.formatDate(d) + ' at ' + d.toLocaleTimeString('en-US', {
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true
        });
    },

    /**
     * Format relative time (e.g., "5 minutes ago", "2 days ago")
     * @param {string|Date} date - Date to format
     * @returns {string} Relative time string
     */
    formatRelativeTime(date) {
        if (!date) return '—';
        const d = new Date(date);
        if (isNaN(d.getTime())) return date.toString();
        
        const now = new Date();
        const diffMs = now - d;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
        if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
        if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
        
        return this.formatDate(d);
    },

    /**
     * Debounce function calls
     * @param {function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {function} Debounced function
     */
    debounce(func, wait = 300) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    },

    /**
     * Throttle function calls
     * @param {function} func - Function to throttle
     * @param {number} limit - Limit in ms
     * @returns {function} Throttled function
     */
    throttle(func, limit = 300) {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Check if running in Electron
     * @returns {boolean} True if running in Electron
     */
    isElectron() {
        return typeof window !== 'undefined' && typeof window.api !== 'undefined';
    },

    /**
     * Capitalize first letter
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    /**
     * Truncate string with ellipsis
     * @param {string} str - String to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated string
     */
    truncate(str, maxLength = 50) {
        if (!str) return '';
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength - 3) + '...';
    },

    /**
     * Get file name from path
     * @param {string} path - File path
     * @returns {string} File name
     */
    getFileName(path) {
        if (!path) return '';
        return path.split(/[\\/]/).pop();
    },

    /**
     * Get file extension
     * @param {string} filename - File name
     * @returns {string} File extension
     */
    getFileExtension(filename) {
        if (!filename) return '';
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    },

    /**
     * Check if value is empty (null, undefined, empty string, empty array)
     * @param {any} value - Value to check
     * @returns {boolean} True if empty
     */
    isEmpty(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    },

    /**
     * Deep clone an object
     * @param {object} obj - Object to clone
     * @returns {object} Cloned object
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Validate email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },

    /**
     * Sleep/delay helper for async functions
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Safely parse JSON
     * @param {string} str - JSON string
     * @param {any} fallback - Fallback value if parse fails
     * @returns {any} Parsed object or fallback
     */
    safeJsonParse(str, fallback = null) {
        try {
            return JSON.parse(str);
        } catch {
            return fallback;
        }
    },

    /**
     * Format percentage
     * @param {number} value - Value (0-100 or 0-1)
     * @param {number} decimals - Decimal places
     * @returns {string} Formatted percentage
     */
    formatPercent(value, decimals = 1) {
        if (value === null || value === undefined) return '—';
        // If value is between 0 and 1, multiply by 100
        const percent = value <= 1 && value >= 0 ? value * 100 : value;
        return percent.toFixed(decimals) + '%';
    }
};

window.Utils = Utils;
