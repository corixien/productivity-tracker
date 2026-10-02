require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { logger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { closePool, getPool } = require('./utils/database');
const { securityHeaders } = require('./middleware/security');
const { apiRateLimiter } = require('./middleware/rateLimiter');
const { timezone } = require('./middleware/timezone');
const { startRetentionJob } = require('./services/retentionService');
const { startUptimeSampler, stopUptimeSampler } = require('./services/uptimeService');
const { promoteConfiguredAdmins } = require('./services/adminService');
const { logActivity } = require('./services/loggingService');
const { warnOnError } = require('./utils/errors');
const groqController = require('./controllers/groqController');
const { authenticate } = require('./middleware/auth');
const { validateAiRate } = require('./middleware/validation');
const { aiRateLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const groqRoutes = require('./routes/groq');
const xpRoutes = require('./routes/xp');
const leaderboardRoutes = require('./routes/leaderboard');
const settingsRoutes = require('./routes/settings');
const metaRoutes = require('./routes/meta');
const adminRoutes = require('./routes/admin');
const eventRoutes = require('./routes/events');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..');

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', { error: error && error.message ? error.message : String(error) });
});

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Timezone']
}));

// Avatars arrive as base64 JSON: raise the limit for that one route only (must precede the global parser).
app.use('/api/users/:username/avatar', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        if (!req.originalUrl.startsWith('/api')) return;
        logger.info('HTTP request completed', {
            event: 'http_request',
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            duration_ms: Date.now() - startedAt,
            ip: req.ip,
            user_agent: req.get('user-agent')
        });
    });
    next();
});

app.get('/api/health', async (req, res) => {
    const health = { status: 'ok', timestamp: new Date().toISOString(), db: 'checking' };
    try {
        await getPool().query('SELECT 1');
        health.db = 'ok';
    } catch (error) {
        health.db = 'error';
        health.dbError = error.message;
        health.status = 'degraded';
    }
    res.set('Cache-Control', 'no-store').json(health);
});

app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});
app.use('/api', apiRateLimiter);
app.use('/api', timezone);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/xp', xpRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/groq', groqRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/events', eventRoutes);

// Legacy routes kept for compatibility with older clients.
app.post('/api/ai/rate', authenticate, aiRateLimiter, validateAiRate, groqController.rateTask);
app.get('/api/ai/status', groqController.getAiStatus);

// Frontend: always revalidate code (ETag => cheap 304), cache binary assets for a week.
const revalidate = { maxAge: 0, etag: true };
const longCache = { maxAge: '7d' };
const sendRoot = (file, headers = {}) => (req, res) => {
    res.set(headers);
    res.sendFile(path.join(FRONTEND_DIR, file));
};

app.get('/', sendRoot('index.html', { 'Cache-Control': 'no-cache' }));
app.get('/manifest.json', sendRoot('manifest.json', { 'Cache-Control': 'no-cache' }));
app.get('/sw.js', sendRoot('sw.js', { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }));
app.get('/offline.html', sendRoot('offline.html', { 'Cache-Control': 'no-cache' }));
app.get('/LOGO.png', sendRoot('LOGO.png', { 'Cache-Control': 'public, max-age=604800' }));
app.use('/js', express.static(path.join(FRONTEND_DIR, 'js'), revalidate));
app.use('/css', express.static(path.join(FRONTEND_DIR, 'css'), revalidate));
app.use('/icons', express.static(path.join(FRONTEND_DIR, 'icons'), longCache));
app.use('/Badges', express.static(path.join(FRONTEND_DIR, 'Badges'), longCache));
app.use('/fonts', express.static(path.join(FRONTEND_DIR, 'fonts'), { maxAge: '365d', immutable: true }));

app.use(notFoundHandler);
app.use(errorHandler);

function start() {
    const server = app.listen(PORT, '0.0.0.0', () => {
        logger.info('Productivity Tracker API running', { port: PORT, environment: process.env.NODE_ENV || 'development' });
        startRetentionJob();
        startUptimeSampler();
        promoteConfiguredAdmins()
            .then((promoted) => logActivity({ action: 'system.boot', message: `Server started${promoted ? `, ${promoted} admin(s) promoted` : ''}`, meta: { port: PORT } }))
            .catch(warnOnError('boot'));
    });

    async function shutdown(signal) {
        logger.info('Shutdown received', { signal });
        server.close(async () => {
            await stopUptimeSampler();
            await closePool();
            process.exit(0);
        });
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    return server;
}

if (require.main === module) {
    start();
}

module.exports = app;
module.exports.start = start;
