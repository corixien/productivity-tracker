const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { verifyPassword } = require('../utils/password');
const { logAuthAttempt, logSystemEvent } = require('../services/loggingService');
const { uploadAvatar } = require('../services/avatarService');
const { resetAuthRateLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, AppError, badRequest, notFound, conflict, forbidden, warnOnError } = require('../utils/errors');

const PRIVATE_FIELDS = ['password_hash', 'token_version'];

function safeUser(user) {
    if (!user) return null;
    const safe = { ...user };
    PRIVATE_FIELDS.forEach((field) => delete safe[field]);
    return { ...safe, dailyGoalXp: user.daily_goal_xp };
}

// What other users may see about someone.
function publicUser(user) {
    return {
        username: user.username,
        avatar: user.avatar || null,
        xp: user.xp || 0,
        level: user.level || 0,
        rank: user.rank
    };
}

function issueToken(user) {
    return generateToken({ userId: user.id, username: user.username, tv: user.token_version });
}

const register = asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (await User.findByUsername(username)) {
        logAuthAttempt(username, false, req.ip).catch(warnOnError('register.log'));
        throw conflict('Username already taken', 'username_taken');
    }

    const user = await User.create(username, password);
    logAuthAttempt(username, true, req.ip).catch(warnOnError('register.log'));
    resetAuthRateLimiter(req.ip);

    res.status(201).json({
        success: true,
        username: user.username,
        language: user.language,
        avatar: user.avatar,
        token: issueToken(user)
    });
});

const login = asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await User.verifyCredentials(username, password);
    if (!user) {
        logAuthAttempt(username, false, req.ip).catch(warnOnError('login.log'));
        throw new AppError(401, 'Invalid username or password', 'invalid_credentials');
    }

    logAuthAttempt(username, true, req.ip).catch(warnOnError('login.log'));
    resetAuthRateLimiter(req.ip);

    res.json({
        success: true,
        username: user.username,
        language: user.language,
        avatar: user.avatar,
        token: issueToken(user)
    });
});

const getMe = asyncHandler(async (req, res) => {
    await User.recalculateMultiplier(req.user.id, true).catch(warnOnError('getMe.recalculate'));
    const user = await User.findById(req.user.id);
    if (!user) throw notFound('User not found');
    res.json(safeUser(user));
});

const getUser = asyncHandler(async (req, res) => {
    const user = await User.findByUsername(req.params.username);
    if (!user) throw notFound('User not found');
    if (user.id !== req.user.id) return res.json(publicUser(user));
    await User.recalculateMultiplier(user.id).catch(warnOnError('getUser.recalculate'));
    res.json(safeUser(await User.findById(user.id)));
});

const updateUser = asyncHandler(async (req, res) => {
    const target = await User.findByUsername(req.params.username);
    if (!target) throw notFound('User not found');
    if (target.id !== req.user.id) throw forbidden('Not authorized to update this user');

    const { language, goals } = req.body;
    const updated = await User.update(target.id, { language, goals });
    res.json(safeUser(updated));
});

const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) throw notFound('User not found');
    if (!await verifyPassword(currentPassword, user.password_hash)) {
        throw new AppError(403, 'Current password is incorrect', 'wrong_password');
    }

    const updated = await User.updatePassword(req.user.id, newPassword);
    await logSystemEvent('info', 'Password changed', { event: 'password_changed', user_id: req.user.id });
    // token_version moved on: this response carries the only valid token for this session.
    res.json({ success: true, token: issueToken(updated) });
});

const uploadUserAvatar = asyncHandler(async (req, res) => {
    const avatarUrl = await uploadAvatar(req.user.id, req.body.avatar);
    res.json({ success: true, avatar: avatarUrl, avatarUrl });
});

const changeUsername = asyncHandler(async (req, res) => {
    const { newUsername } = req.body;
    const existing = await User.findByUsername(newUsername);
    if (existing && existing.id !== req.user.id) throw conflict('Username already taken', 'username_taken');

    const user = await User.changeUsername(req.user.id, newUsername);
    await logSystemEvent('info', 'Username changed', {
        event: 'username_changed',
        user_id: user.id,
        username: user.username
    });
    res.json({ success: true, newUsername: user.username, username: user.username, token: issueToken(user) });
});

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
