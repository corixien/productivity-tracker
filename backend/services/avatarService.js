const crypto = require('crypto');
const { logger } = require('../utils/logger');
const User = require('../models/User');

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function parseAvatar(avatar) {
    if (!avatar || typeof avatar !== 'string') {
        return { buffer: null, mime: null, ext: null, error: 'Avatar is required' };
    }

    let base64 = avatar;
    let mime = 'image/png';

    const dataUrlMatch = avatar.match(/^data:(image\/[a-z]+);base64,/i);
    if (dataUrlMatch) {
        mime = dataUrlMatch[1];
        base64 = avatar.slice(dataUrlMatch[0].length);
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
        return { buffer: null, mime: null, ext: null, error: 'Invalid avatar format' };
    }

    let buffer;
    try {
        buffer = Buffer.from(base64, 'base64');
    } catch (error) {
        return { buffer: null, mime: null, ext: null, error: 'Invalid avatar encoding' };
    }

    if (buffer.length === 0) {
        return { buffer: null, mime: null, ext: null, error: 'Avatar is empty' };
    }

    if (buffer.length > MAX_AVATAR_SIZE) {
        return { buffer: null, mime: null, ext: null, error: 'Avatar must be under 5MB' };
    }

    const mimeToExt = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };

    const ext = mimeToExt[mime] || 'png';
    const detectedMime = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
        ? 'image/png'
        : buffer[0] === 0xff && buffer[1] === 0xd8
            ? 'image/jpeg'
            : buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46
                ? 'image/webp'
                : mime;

    return {
        buffer,
        mime: detectedMime,
        ext: mimeToExt[detectedMime] || ext,
        error: null
    };
}

async function uploadAvatar(userId, avatarBase64) {
    const parsed = parseAvatar(avatarBase64);
    if (parsed.error) {
        const error = new Error(parsed.error);
        error.statusCode = 400;
        throw error;
    }

    const b64 = parsed.buffer.toString('base64');
    const dataUrl = `data:${parsed.mime};base64,${b64}`;

    try {
        await User.updateAvatar(userId, dataUrl);
    } catch (error) {
        logger.error('Avatar database save failed', { error: error.message, userId });
        throw error;
    }

    return dataUrl;
}

module.exports = { uploadAvatar };
