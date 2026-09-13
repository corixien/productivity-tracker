require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { logger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { closePool } = require('./utils/database');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const taskRoutes = require('./routes/tasks');
const goalRoutes = require('./routes/goals');
const groqRoutes = require('./routes/groq');
const xpRoutes = require('./routes/xp');
const leaderboardRoutes = require('./routes/leaderboard');
const settingsRoutes = require('./routes/settings');
const groqController = require('./controllers/groqController');
const { authenticate } = require('./middleware/auth');
const { validateAiRate } = require('./middleware/validation');
const { securityHeaders } = require('./middleware/security');
const { authRateLimiter } = require('./middleware/rateLimiter');
const { getPool } = require('./utils/database');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..');

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', { error: error && error.message ? error.message : String(error) });
});

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors({
    origin: process.env.CLIENT_ORIGIN || true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startedAt;
        logger.info('HTTP request completed', {
            event: 'http_request',
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            duration_ms: duration,
            ip: req.ip,
            user_agent: req.get('user-agent')
        });
    });
    next();
});

app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

app.get('/api/health', async (req, res) => {
    const health = { status: 'ok', timestamp: new Date().toISOString(), db: 'checking' };
    try {
        const pool = getPool();
        await pool.query('SELECT 1');
        health.db = 'ok';
    } catch (error) {
        health.db = 'error';
        health.dbError = error.message;
        health.status = 'degraded';
    }
    res.json(health);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/xp', xpRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/groq', groqRoutes);

app.post('/api/ai/rate', authenticate, validateAiRate, groqController.rateTask);
app.get('/api/ai/status', groqController.getAiStatus);

app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});
app.get('/LOGO.png', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'LOGO.png'));
});
app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'manifest.json'));
});
app.use('/icons', express.static(path.join(FRONTEND_DIR, 'icons'), { maxAge: '1h' }));
app.use('/js', express.static(path.join(FRONTEND_DIR, 'js'), { maxAge: '1h' }));
app.use('/css', express.static(path.join(FRONTEND_DIR, 'css'), { maxAge: '1h' }));
app.use('/avatars', express.static(path.join(FRONTEND_DIR, 'avatars'), { maxAge: '1h' }));
app.use('/Badges', express.static(path.join(FRONTEND_DIR, 'Badges'), { maxAge: '1h' }));
app.use('/assets', express.static(path.join(FRONTEND_DIR, 'assets'), { maxAge: '1h' }));

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('Productivity Tracker API running', { port: PORT, environment: process.env.NODE_ENV || 'development' });
});

async function shutdown(signal) {
    logger.info('Shutdown received', { signal });
    server.close(async () => {
        await closePool();
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
