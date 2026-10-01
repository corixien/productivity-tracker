const { query } = require('../utils/database');
const { logger } = require('../utils/logger');
const { warnOnError } = require('../utils/errors');

const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function getRetentionDays() {
    const days = parseInt(process.env.LOG_RETENTION_DAYS, 10);
    return Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
}

// system_logs and groq_logs grow with every request; keep a rolling window.
async function purgeOldLogs(days = getRetentionDays()) {
    const system = await query(
        "DELETE FROM system_logs WHERE created_at < NOW() - make_interval(days => $1)",
        [days]
    );
    const groq = await query(
        "DELETE FROM groq_logs WHERE created_at < NOW() - make_interval(days => $1)",
        [days]
    );
    logger.info('Log retention purge completed', {
        event: 'log_retention',
        retention_days: days,
        system_logs_deleted: system.rowCount,
        groq_logs_deleted: groq.rowCount
    });
    return { systemLogs: system.rowCount, groqLogs: groq.rowCount };
}

// The free tier restarts often, so purge shortly after boot and then daily while awake.
function startRetentionJob() {
    const run = () => purgeOldLogs().catch(warnOnError('retention.purge'));
    setTimeout(run, 30 * 1000).unref();
    setInterval(run, DAY_MS).unref();
}

module.exports = { purgeOldLogs, startRetentionJob, getRetentionDays };
