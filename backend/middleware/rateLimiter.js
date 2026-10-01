// In-memory fixed-window limiter. State is per process and resets on restart,
// which is acceptable for the single-instance Render deployment.
function createRateLimiter({ windowMs, max, message = 'Too many requests. Please try again later.', keyFn }) {
    const hits = new Map();
    const getKey = keyFn || ((req) => req.ip || 'unknown');

    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) {
            if (now >= entry.resetAt) hits.delete(key);
        }
    }, Math.max(windowMs, 60 * 1000));
    sweep.unref();

    function limiter(req, res, next) {
        const key = getKey(req);
        const now = Date.now();
        let entry = hits.get(key);
        if (!entry || now >= entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }
        entry.count += 1;
        res.set('RateLimit-Limit', String(max));
        res.set('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
        if (entry.count > max) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({ success: false, error: message, code: 'rate_limited' });
        }
        return next();
    }

    limiter.reset = (key) => hits.delete(key);
    limiter.size = () => hits.size;
    return limiter;
}

const byUser = (req) => (req.user && req.user.id) || req.ip || 'unknown';

const authRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many attempts. Please try again later.'
});
const apiRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 300 });
const aiRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    keyFn: byUser,
    message: 'AI rate limit exceeded. Please try again in a minute.'
});
const avatarRateLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 5, keyFn: byUser });
const friendRateLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 30, keyFn: byUser });
const passwordRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyFn: byUser,
    message: 'Too many password attempts. Please try again later.'
});

function resetAuthRateLimiter(ip) {
    if (ip) authRateLimiter.reset(ip);
}

module.exports = {
    createRateLimiter,
    authRateLimiter,
    apiRateLimiter,
    aiRateLimiter,
    avatarRateLimiter,
    friendRateLimiter,
    passwordRateLimiter,
    resetAuthRateLimiter
};
