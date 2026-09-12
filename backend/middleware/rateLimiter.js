const rateAttempts = new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

function authRateLimiter(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let entry = rateAttempts.get(ip);

    if (!entry) {
        rateAttempts.set(ip, { count: 1, first: now, last: now, lockedUntil: null });
        return next();
    }

    if (now - entry.first > WINDOW_MS) {
        rateAttempts.set(ip, { count: 1, first: now, last: now, lockedUntil: null });
        return next();
    }

    if (entry.lockedUntil && now < entry.lockedUntil) {
        return res.status(429).json({ success: false, error: 'Too many attempts. Please try again later.' });
    }

    entry.count += 1;
    entry.last = now;

    if (entry.count >= MAX_ATTEMPTS) {
        entry.lockedUntil = now + LOCKOUT_MS;
        return res.status(429).json({ success: false, error: 'Too many attempts. Please try again later.' });
    }

    next();
}

function resetAuthRateLimiter(ip) {
    if (ip) rateAttempts.delete(ip);
}

module.exports = { authRateLimiter, resetAuthRateLimiter };
