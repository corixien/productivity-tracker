const { query } = require('../utils/database');

const DAY_MS = 86400000;
const shiftDay = (day, deltaDays) => new Date(Date.parse(`${day}T00:00:00Z`) + deltaDays * DAY_MS).toISOString().slice(0, 10);

// Longest and trailing run of `true` values. The last period is still open: while it is not won, the trailing run of
// the finished periods stays alive (like "today never counts as missed" for the activity streak).
function runs(wins) {
    let longest = 0;
    let run = 0;
    for (const won of wins) {
        run = won ? run + 1 : 0;
        longest = Math.max(longest, run);
    }
    const open = wins.length ? wins[wins.length - 1] : false;
    let current = 0;
    for (let i = wins.length - 2; i >= 0 && wins[i]; i -= 1) current += 1;
    return { current: open ? current + 1 : current, record: longest, isFirst: open };
}

// rows: [{ id, period: 'YYYY-MM-DD', xp }] with the XP booked in that period. periods: every period from the first row
// to the current one, step days apart. Rank order matches the leaderboard: score descending, then name ascending.
// With `cumulative` the score is the running total (all-time), otherwise the XP of the period alone (weekly).
function streakFor({ selfId, names, rows, current, step, cumulative }) {
    if (names.size < 2 || !rows.length) return { current: 0, record: 0, isFirst: false };
    const byPeriod = new Map();
    for (const row of rows) {
        if (!byPeriod.has(row.period)) byPeriod.set(row.period, new Map());
        byPeriod.get(row.period).set(row.id, (byPeriod.get(row.period).get(row.id) || 0) + row.xp);
    }
    const first = [...byPeriod.keys()].sort()[0];
    const totals = new Map([...names.keys()].map((id) => [id, 0]));
    const wins = [];
    for (let period = first; period <= current; period = shiftDay(period, step)) {
        const delta = byPeriod.get(period) || new Map();
        const scores = [...names.keys()].map((id) => {
            const score = (cumulative ? totals.get(id) : 0) + (delta.get(id) || 0);
            return { id, score };
        });
        if (cumulative) scores.forEach((entry) => totals.set(entry.id, entry.score));
        scores.sort((a, b) => b.score - a.score || String(names.get(a.id)).localeCompare(String(names.get(b.id))));
        wins.push(scores[0].id === selfId && scores[0].score > 0);
    }
    return runs(wins);
}

// Consecutive first places in the user's own leaderboard (you and your friends, as it stands today):
// all-time = consecutive days ranked first by total XP, weekly = consecutive weeks (Monday-Sunday) ranked first by
// task XP. The history is rebuilt from xp_history, so adding a friend also changes the past.
function computeFirstPlace({ selfId, names, daily, weekly, today, thisWeek }) {
    return {
        allTime: { unit: 'day', ...streakFor({ selfId, names, rows: daily, current: today, step: 1, cumulative: true }) },
        weekly: { unit: 'week', ...streakFor({ selfId, names, rows: weekly, current: thisWeek, step: 7, cumulative: false }) }
    };
}

async function getFirstPlace(userId, tz) {
    const members = await query(
        `SELECT u.id, u.username FROM users u
         WHERE u.id = $1 OR u.id IN (SELECT friend_id FROM friends WHERE user_id = $1)`,
        [userId]
    );
    const ids = members.rows.map((row) => row.id);
    const [daily, weekly, now] = await Promise.all([
        query(
            `SELECT user_id AS id, ((created_at AT TIME ZONE $2)::date)::text AS period, SUM(xp_amount)::int AS xp
             FROM xp_history WHERE user_id = ANY($1) GROUP BY 1, 2`,
            [ids, tz]
        ),
        query(
            `SELECT user_id AS id, (date_trunc('week', completed_at AT TIME ZONE $2)::date)::text AS period, SUM(xp_amount)::int AS xp
             FROM v_task_xp WHERE user_id = ANY($1) GROUP BY 1, 2`,
            [ids, tz]
        ),
        query(
            `SELECT ((NOW() AT TIME ZONE $1)::date)::text AS today, (date_trunc('week', NOW() AT TIME ZONE $1)::date)::text AS week`,
            [tz]
        )
    ]);
    return computeFirstPlace({
        selfId: userId,
        names: new Map(members.rows.map((row) => [row.id, row.username])),
        daily: daily.rows,
        weekly: weekly.rows,
        today: now.rows[0].today,
        thisWeek: now.rows[0].week
    });
}

module.exports = { getFirstPlace, computeFirstPlace, runs };
