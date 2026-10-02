const { query } = require('../utils/database');
const { warnOnError } = require('../utils/errors');

const SEEN_REFRESH_MS = 10 * 60 * 1000;
const seenHours = new Set();        // "userId|hourISO" already stored
const lastSeenWrite = new Map();    // userId -> timestamp of the last users.last_seen_at write

// Called for every authenticated request, but writes at most once per user per hour (analytics)
// and once per 10 minutes (last_seen_at), so it adds almost no database traffic.
function trackActivity(user) {
    const now = Date.now();
    const hour = new Date(now - (now % 3600000)).toISOString();
    const key = `${user.id}|${hour}`;
    if (!seenHours.has(key)) {
        if (seenHours.size > 5000) seenHours.clear();
        seenHours.add(key);
        query('INSERT INTO user_activity (user_id, hour) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, hour])
            .catch(warnOnError('trackActivity.hour'));
    }
    if (now - (lastSeenWrite.get(user.id) || 0) > SEEN_REFRESH_MS) {
        lastSeenWrite.set(user.id, now);
        query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]).catch(warnOnError('trackActivity.lastSeen'));
    }
}

module.exports = { trackActivity };
