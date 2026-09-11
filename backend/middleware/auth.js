const { verifyToken, extractTokenFromHeader } = require('../utils/jwt');
const User = require('../models/User');

async function authenticate(req, res, next) {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);
        if (!token) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }

        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        req.user = { id: user.id, username: user.username };
        next();
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Authentication error' });
    }
}

async function optionalAuth(req, res, next) {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);
        if (!token) return next();

        const decoded = verifyToken(token);
        if (!decoded) return next();

        const user = await User.findById(decoded.userId);
        if (user) {
            req.user = { id: user.id, username: user.username };
        }
    } catch (error) {
        // Non-critical: allow public access with an unrecognized token
    }
    next();
}

module.exports = { authenticate, optionalAuth };
