const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const {
    logAuthAttempt,
    logError,
    logSystemEvent
} = require('../services/loggingService');
const { uploadAvatar } = require('../services/avatarService');
const { resetAuthRateLimiter } = require('../middleware/rateLimiter');

function safeUser(user) {
    if (!user) return null;
    const { password_hash, ...safe } = user;
    return safe;
}

async function register(req, res) {
    try {
        const { username, password } = req.body;
        const existing = await User.findByUsername(username);
        if (existing) {
            await logAuthAttempt(username, false, req.ip);
            return res.status(409).json({ success: false, error: 'Username already taken' });
        }

        const user = await User.create(username, password);
        const token = generateToken({ userId: user.id, username: user.username });
        await logAuthAttempt(username, true, req.ip);
        resetAuthRateLimiter(req.ip);

        return res.status(201).json({
            success: true,
            username: user.username,
            language: user.language,
            avatar: user.avatar,
            token
        });
    } catch (error) {
        logError(error, { context: 'register', username: req.body.username });
        return res.status(500).json({ success: false, error: 'Registration failed' });
    }
}

async function login(req, res) {
    try {
        const { username, password } = req.body;
        const user = await User.verifyCredentials(username, password);
        if (!user) {
            logAuthAttempt(username, false, req.ip);
            return res.status(401).json({ success: false, error: 'Invalid username or password' });
        }

        const token = generateToken({ userId: user.id, username: user.username });
        await logAuthAttempt(username, true, req.ip);
        resetAuthRateLimiter(req.ip);

        return res.json({
            success: true,
            username: user.username,
            language: user.language,
            avatar: user.avatar,
            token
        });
    } catch (error) {
        await logError(error, { context: 'login', username: req.body.username });
        return res.status(500).json({ success: false, error: 'Login failed' });
    }
}

async function getMe(req, res) {
    try {
        await User.recalculateMultiplier(req.user.id);
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        return res.json(safeUser(user));
    } catch (error) {
        logError(error, { context: 'getMe', userId: req.user && req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to get user' });
    }
}

async function getUser(req, res) {
    try {
        const user = await User.findByUsername(req.params.username);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        await User.recalculateMultiplier(user.id).catch(() => {});
        return res.json(safeUser(user));
    } catch (error) {
        await logError(error, { context: 'getUser', username: req.params.username });
        return res.status(500).json({ success: false, error: 'Failed to get user' });
    }
}

async function updateUser(req, res) {
    try {
        const target = await User.findByUsername(req.params.username);
        if (!target) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (target.id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Not authorized to update this user' });
        }

        const { newPassword, goals, ...updates } = req.body;
        if (newPassword !== undefined) {
            await User.updatePassword(target.id, newPassword);
        }
        if (goals !== undefined) {
            await User.updateGoals(target.id, String(goals));
        }

        const updatedUser = await User.update(target.id, updates);
        return res.json(safeUser(updatedUser));
    } catch (error) {
        await logError(error, { context: 'updateUser', username: req.params.username });
        return res.status(500).json({ success: false, error: 'Failed to update user' });
    }
}

async function changePassword(req, res) {
    try {
        const updated = await User.updatePassword(req.user.id, req.body.newPassword);
        if (!updated) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        await logSystemEvent('info', 'Password changed', {
            event: 'password_changed',
            user_id: req.user.id
        });
        return res.json({ success: true });
    } catch (error) {
        await logError(error, { context: 'changePassword', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to change password' });
    }
}

async function uploadUserAvatar(req, res) {
    try {
        const avatarUrl = await uploadAvatar(req.user.id, req.body.avatar);
        return res.json({ success: true, avatar: avatarUrl, avatarUrl });
    } catch (error) {
        await logError(error, { context: 'uploadAvatar', userId: req.user.id });
        const status = error.statusCode || 500;
        return res.status(status).json({ success: false, error: error.message || 'Failed to upload avatar' });
    }
}

async function changeUsername(req, res) {
    try {
        const { newUsername } = req.body;
        const existing = await User.findByUsername(newUsername);
        if (existing && existing.id !== req.user.id) {
            return res.status(409).json({ success: false, error: 'Username already taken' });
        }

        const user = await User.changeUsername(req.user.id, newUsername);
        const token = generateToken({ userId: user.id, username: user.username });
        await logSystemEvent('info', 'Username changed', {
            event: 'username_changed',
            user_id: user.id,
            username: user.username
        });
        return res.json({ success: true, newUsername: user.username, username: user.username, token });
    } catch (error) {
        await logError(error, { context: 'changeUsername', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to change username' });
    }
}

module.exports = {
    register,
    login,
    getMe,
    getUser,
    updateUser,
    changePassword,
    uploadAvatar: uploadUserAvatar,
    changeUsername
};
