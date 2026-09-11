const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { logger } = require('./logger');

const SALT_ROUNDS = 12;

function isLegacyPasswordHash(passwordHash) {
    return Boolean(passwordHash && (passwordHash.startsWith('sha256:') || /^[a-f0-9]{64}$/i.test(passwordHash)));
}

function legacySha256(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
    if (!password || !passwordHash) return false;
    try {
        if (isLegacyPasswordHash(passwordHash)) {
            const expected = passwordHash.startsWith('sha256:')
                ? passwordHash.slice('sha256:'.length)
                : passwordHash;
            return legacySha256(password).toLowerCase() === expected.toLowerCase();
        }
        return bcrypt.compare(password, passwordHash);
    } catch (error) {
        logger.error('Password verification failed', { error: error.message });
        return false;
    }
}

module.exports = { hashPassword, verifyPassword, isLegacyPasswordHash, legacySha256 };
