const { logger } = require('./logger');

class AppError extends Error {
    constructor(status, message, code) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code || undefined;
    }
}

const badRequest = (message, code) => new AppError(400, message, code);
const unauthorized = (message = 'Authentication required', code) => new AppError(401, message, code);
const forbidden = (message = 'Not authorized', code) => new AppError(403, message, code);
const notFound = (message = 'Not found', code) => new AppError(404, message, code);
const conflict = (message, code) => new AppError(409, message, code);

function asyncHandler(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

// For non-critical side effects whose failure must not fail the request but must stay visible.
function warnOnError(context) {
    return (error) => {
        logger.warn('Non-critical operation failed', { context, error: error && error.message ? error.message : String(error) });
    };
}

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, asyncHandler, warnOnError };
