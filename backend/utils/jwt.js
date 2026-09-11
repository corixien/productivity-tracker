const jwt = require('jsonwebtoken');
const { logger } = require('./logger');
const { getAuthConfig } = require('../config');

function generateToken(payload) {
    const config = getAuthConfig();
    return jwt.sign(
        { ...payload, type: 'access' },
        config.secret,
        { expiresIn: config.expiresIn }
    );
}

function verifyToken(token) {
    if (!token) return null;
    try {
        const config = getAuthConfig();
        const decoded = jwt.verify(token, config.secret);
        if (!decoded || !decoded.userId || decoded.type !== 'access') return null;
        return decoded;
    } catch (error) {
        logger.warn('Token verification failed', { error: error.message });
        return null;
    }
}

function extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    return token || null;
}

module.exports = { generateToken, verifyToken, extractTokenFromHeader };
