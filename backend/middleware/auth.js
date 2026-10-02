const { verifyToken, extractTokenFromHeader, tokenMatchesVersion } = require('../utils/jwt');
const { asyncHandler, unauthorized, notFound } = require('../utils/errors');
const User = require('../models/User');
const { trackActivity } = require('../services/activityTracker');

async function resolveUser(req) {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) return { error: unauthorized('Authentication required', 'auth_required') };

    const decoded = verifyToken(token);
    if (!decoded) return { error: unauthorized('Invalid or expired token', 'invalid_token') };

    const user = await User.findAuthById(decoded.userId);
    if (!user) return { error: unauthorized('User not found', 'user_not_found') };
    if (!tokenMatchesVersion(decoded, user.token_version)) {
        return { error: unauthorized('Session expired. Please sign in again.', 'session_revoked') };
    }
    return { user: { id: user.id, username: user.username, isAdmin: Boolean(user.is_admin) } };
}

const authenticate = asyncHandler(async (req, res, next) => {
    const { user, error } = await resolveUser(req);
    if (error) throw error;
    req.user = user;
    trackActivity(user);
    next();
});

// Answers 404 (not 403) so the admin API does not reveal that it exists.
function requireAdmin(req, res, next) {
    if (req.user && req.user.isAdmin) return next();
    return next(notFound('Endpoint not found', 'not_found'));
}

module.exports = { authenticate, requireAdmin };
