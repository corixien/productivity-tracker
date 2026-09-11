const { getSupabaseConfig, getSupabaseClient } = require('../config');
const { logger } = require('../utils/logger');

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

    const config = getSupabaseConfig();
    const supabase = getSupabaseClient();
    const objectPath = `avatars/${userId}/${Date.now()}-${crypto.randomUUID()}.${parsed.ext}`;

    try {
        const { data, error: uploadError } = await supabase.storage
            .from(config.storageBucket)
            .upload(objectPath, parsed.buffer, {
                contentType: parsed.mime,
                upsert: true
            });

        if (uploadError) {
            const error = new Error(uploadError.message || 'Avatar upload failed');
            error.statusCode = uploadError.status || 503;
            throw error;
        }

        const { data: publicData } = supabase.storage.from(config.storageBucket).getPublicUrl(objectPath);
        if (!publicData?.publicUrl) {
            const error = new Error('Avatar upload completed but public URL unavailable');
            error.statusCode = 503;
            throw error;
        }

        return publicData.publicUrl;
    } catch (error) {
        logger.error('Avatar upload failed', { error: error.message, userId });
        throw error;
    }
}

module.exports = { uploadAvatar };
