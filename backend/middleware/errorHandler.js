const { logger } = require('../utils/logger');
const { logError } = require('../services/loggingService');

function errorHandler(err, req, res, next) {
    logError(err, {
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userId: req.user?.id
    }).catch(() => {});

    if (err.name === 'ValidationError') {
        return res.status(400).json({ success: false, error: err.message });
    }

    if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Resource already exists' });
    }

    if (err.code === '23503') {
        return res.status(400).json({ success: false, error: 'Referenced resource not found' });
    }

    logger.error('Unhandled error', {
        event: 'unhandled_error',
        path: req.originalUrl,
        method: req.method,
        error: err.message,
        stack: err.stack
    });
    return res.status(500).json({ success: false, error: 'Internal server error' });
}

function notFoundHandler(req, res) {
    res.status(404).json({ success: false, error: 'Endpoint not found' });
}

module.exports = { errorHandler, notFoundHandler };
