const { query } = require('../utils/database');
const { logger } = require('../utils/logger');
const { publishAdmin } = require('../utils/events');

function stringify(value) {
    try {
        return JSON.stringify(value);
    } catch (error) {
        return JSON.stringify({ value: String(value), serializationError: error.message });
    }
}

// Which admin-visible tables an activity touches (drives the live refresh of the admin database page).
const TABLES_BY_PREFIX = {
    auth: ['users'],
    task: ['tasks', 'xp_history', 'users'],
    profile: ['users'],
    friend: ['friends'],
    template: ['quick_tasks'],
    ai: ['groq_logs'],
    admin: ['users', 'tasks', 'xp_history', 'friends', 'quick_tasks']
};

// Central activity log: one compact message per event plus the full context as metadata.
// action is "<category>.<verb>", e.g. task.complete, profile.avatar, auth.login_failed.
async function logActivity({ userId = null, username = null, action, message, level = 'info', meta = {} }) {
    logger.log(level, message, { event: action, user_id: userId, username, ...meta });
    try {
        const result = await query(
            `INSERT INTO system_logs (level, message, metadata, user_id, username, action, created_at)
             VALUES ($1, $2, $3::jsonb, $4::uuid, COALESCE($5, (SELECT username FROM users WHERE id = $4::uuid)), $6, NOW())
             RETURNING id, level, message, metadata, user_id, username, action, created_at`,
            [level, message, stringify(meta), userId, username, action]
        );
        const row = result.rows[0];
        publishAdmin('log', row);
        const category = action.split('.')[0];
        publishAdmin('db', { tables: [...(TABLES_BY_PREFIX[category] || []), 'system_logs'] });
        return row;
    } catch (error) {
        logger.error('Failed to persist activity log', { error: error.message, action });
        return null;
    }
}

const logSystemEvent = (level, message, metadata = {}) =>
    logActivity({ action: metadata.event || 'system.event', message, level, meta: metadata });

const logAuthAttempt = (username, success, ip) =>
    logActivity({
        username,
        action: success ? 'auth.login' : 'auth.login_failed',
        level: success ? 'info' : 'warn',
        message: success ? 'Logged in' : 'Login failed',
        meta: { ip }
    });

const logError = (error, context = {}) =>
    logActivity({
        userId: context.userId || null,
        action: 'system.error',
        level: 'error',
        message: error && error.message ? error.message : 'Application error',
        meta: { ...context, stack: error && error.stack ? error.stack : undefined }
    });

async function logGroqRequest(userId, username, requestPayload, model) {
    try {
        logger.info('GROQ request', { event: 'groq_request', user_id: userId, username, model });
        const result = await query(
            `INSERT INTO groq_logs (user_id, username, request_payload, response_payload, response_time_ms, model, success, error_message, created_at)
             VALUES ($1, $2, $3::jsonb, NULL, NULL, $4, false, 'request_started', NOW())
             RETURNING id`,
            [userId, username, stringify(requestPayload), model]
        );
        return result.rows[0]?.id || null;
    } catch (error) {
        logger.error('Failed to log GROQ request', { error: error.message, user_id: userId });
        return null;
    }
}

async function logGroqResponse(logId, responsePayload, responseTimeMs, success, errorMessage = null) {
    if (!logId) return;
    try {
        await query(
            `UPDATE groq_logs
             SET response_payload = $1::jsonb, response_time_ms = $2, success = $3, error_message = $4
             WHERE id = $5`,
            [stringify(responsePayload), responseTimeMs, success, errorMessage, logId]
        );
    } catch (error) {
        logger.error('Failed to log GROQ response', { error: error.message, log_id: logId });
    }
}

module.exports = { logActivity, logSystemEvent, logAuthAttempt, logError, logGroqRequest, logGroqResponse };
