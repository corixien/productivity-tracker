const { query } = require('../utils/database');
const { logger } = require('../utils/logger');

function stringify(value) {
    try {
        return JSON.stringify(value);
    } catch (error) {
        return JSON.stringify({ value: String(value), serializationError: error.message });
    }
}

async function persist(level, message, metadata = {}) {
    try {
        await query(
            `INSERT INTO system_logs (level, message, metadata, created_at)
             VALUES ($1, $2, $3::jsonb, NOW())`,
            [level, message, stringify(metadata)]
        );
    } catch (error) {
        logger.error('Failed to persist system log', { error: error.message, level, message });
    }
}

async function logSystemEvent(level, message, metadata = {}) {
    const entry = { event: metadata.event || 'system_event', ...metadata };
    logger.log(level, message, entry);
    await persist(level, message, entry);
}

async function logAuthAttempt(username, success, ip) {
    await logSystemEvent(success ? 'info' : 'warn', 'Authentication attempt', {
        event: 'auth_attempt',
        username,
        success,
        ip
    });
}

async function logTaskCreation(userId, task) {
    await logSystemEvent('info', 'Task created', {
        event: 'task_creation',
        user_id: userId,
        task_id: task.id
    });
}

async function logXpGeneration(userId, xpAmount, source) {
    await logSystemEvent('info', 'XP changed', {
        event: 'xp_generation',
        user_id: userId,
        xp_amount: xpAmount,
        source
    });
}

async function logError(error, context = {}) {
    const metadata = {
        event: 'error',
        ...context,
        stack: error && error.stack ? error.stack : undefined
    };
    logger.error(error && error.message ? error.message : 'Application error', metadata);
    await persist('error', error && error.message ? error.message : 'Application error', metadata);
}

async function logGroqRequest(userId, username, requestPayload, model) {
    try {
        logger.info('GROQ request', {
            event: 'groq_request',
            user_id: userId,
            username,
            model,
            request_payload: requestPayload
        });
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
        logger.info('GROQ response', {
            event: 'groq_response',
            log_id: logId,
            response_time_ms: responseTimeMs,
            success,
            error_message: errorMessage,
            response_payload: responsePayload
        });
        await query(
            `UPDATE groq_logs
             SET response_payload = $1::jsonb,
                 response_time_ms = $2,
                 success = $3,
                 error_message = $4
             WHERE id = $5`,
            [stringify(responsePayload), responseTimeMs, success, errorMessage, logId]
        );
    } catch (error) {
        logger.error('Failed to log GROQ response', { error: error.message, log_id: logId });
    }
}

module.exports = {
    logSystemEvent,
    logAuthAttempt,
    logTaskCreation,
    logXpGeneration,
    logError,
    logGroqRequest,
    logGroqResponse
};
