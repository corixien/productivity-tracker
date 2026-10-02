const { query } = require('../utils/database');
const { logger } = require('../utils/logger');
const { warnOnError } = require('../utils/errors');

// One sample per minute while the process is awake (the free tier sleeps when idle, which shows up as gaps).
// Samples are buffered and written in one statement every few minutes to keep the database quiet.
const SAMPLE_MS = 60 * 1000;
const FLUSH_MS = 5 * 60 * 1000;
let buffer = [];
let timers = [];

const minuteStart = () => new Date(Date.now() - (Date.now() % 60000)).toISOString();

async function flushUptime() {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    try {
        await query('INSERT INTO uptime_samples (sampled_at) SELECT unnest($1::timestamptz[]) ON CONFLICT DO NOTHING', [batch]);
    } catch (error) {
        buffer = batch.concat(buffer);
        logger.warn('Uptime flush failed', { error: error.message });
    }
}

function startUptimeSampler() {
    buffer.push(minuteStart());
    timers = [
        setInterval(() => buffer.push(minuteStart()), SAMPLE_MS),
        setInterval(() => flushUptime(), FLUSH_MS),
        setTimeout(() => flushUptime(), 20 * 1000)
    ];
    timers.forEach((timer) => timer.unref());
}

async function stopUptimeSampler() {
    timers.forEach((timer) => { clearInterval(timer); clearTimeout(timer); });
    buffer.push(minuteStart());
    await flushUptime().catch(warnOnError('uptime.stop'));
}

module.exports = { startUptimeSampler, stopUptimeSampler, flushUptime };
