const { logger } = require('../utils/logger');
const { logError } = require('../services/loggingService');
const { AppError, warnOnError } = require('../utils/errors');

function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
        if (err.status >= 500) {
            logError(err, { path: req.originalUrl, method: req.method, userId: req.user?.id }).catch(warnOnError('errorHandler.logError'));
        }
        return res.status(err.status).json({ success: false, error: err.message, code: err.code });
    }

    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, error: 'Request body too large', code: 'payload_too_large' });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, error: 'Invalid JSON body', code: 'invalid_json' });
    }
    if (err.name === 'ValidationError') {
        return res.status(400).json({ success: false, error: err.message, code: 'validation_error' });
    }
    if (err.code === '23505') {
        return res.status(409).json({ success: false, error: 'Resource already exists', code: 'conflict' });
    }
    if (err.code === '23503') {
        return res.status(400).json({ success: false, error: 'Referenced resource not found', code: 'invalid_reference' });
    }
    if (err.code === '23514' || err.code === '22P02') {
        return res.status(400).json({ success: false, error: 'Invalid value', code: 'invalid_value' });
    }

    logError(err, { path: req.originalUrl, method: req.method, ip: req.ip, userId: req.user?.id })
        .catch(warnOnError('errorHandler.logError'));
    logger.error('Unhandled error', { event: 'unhandled_error', path: req.originalUrl, method: req.method, error: err.message });
    return res.status(500).json({ success: false, error: 'Internal server error', code: 'internal_error' });
}

function notFoundHandler(req, res) {
    res.status(404).json({ success: false, error: 'Endpoint not found', code: 'not_found' });
}

module.exports = { errorHandler, notFoundHandler };
