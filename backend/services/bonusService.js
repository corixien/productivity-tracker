const { query, transaction } = require('../utils/database');
const { getTrophyTimezone } = require('../config');
const { calculateGoalBonus, WEEKLY_TROPHY } = require('./rankService');
const { publishToUser } = require('../utils/events');
const { logActivity } = require('./loggingService');
const { warnOnError } = require('../utils/errors');

// Sources that count as XP earned by doing tasks. Bonuses and trophies never count towards the goal or the weekly ranking.
const EARNED_SOURCES = ['task', 'task_uncomplete', 'task_delete', 'task_edit'];
const DAY_START = "date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2";

// Brings today's daily-goal bonus in line with today's task XP: +bonus when the goal is reached, a negative row
// that takes it back when the XP fell below the goal again (or the goal was raised). Idempotent. Must run inside the
// caller's transaction, before syncUserTotals. Returns the XP change booked now (0, +bonus or -bonus).
async function reconcileDailyGoal(client, userId, tz = getTrophyTimezone()) {
    const user = await client.query('SELECT daily_goal_xp FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rows.length) return 0;
    const goal = user.rows[0].daily_goal_xp;
    const sums = await client.query(
        `SELECT COALESCE(SUM(xp_amount) FILTER (WHERE source = ANY($3)), 0)::int AS earned,
                COALESCE(SUM(xp_amount) FILTER (WHERE source = 'daily_goal'), 0)::int AS paid
         FROM xp_history
         WHERE user_id = $1 AND created_at >= ${DAY_START}`,
        [userId, tz, EARNED_SOURCES]
    );
    const { earned, paid } = sums.rows[0];
    const target = goal && earned >= goal ? calculateGoalBonus(goal) : 0;
    const delta = target - paid;
    if (delta !== 0) {
        await client.query(
            `INSERT INTO xp_history (user_id, xp_amount, source, source_id, created_at) VALUES ($1, $2, 'daily_goal', NULL, NOW())`,
            [userId, delta]
        );
    }
    return delta;
}

// Settles every finished week (Monday-Sunday in the trophy timezone) that has no weekly_trophies row yet:
// the player with the most task XP gets WEEKLY_TROPHY.xp, everybody else nothing. Weeks are settled lazily
// (the free-tier server sleeps), at most the last 4 finished weeks, never before WEEKLY_TROPHY.firstWeek.
let settledThrough = null;

async function awardWeeklyTrophies() {
    const tz = getTrophyTimezone();
    const current = (await query(`SELECT (date_trunc('week', NOW() AT TIME ZONE $1))::date::text AS ws`, [tz])).rows[0].ws;
    if (settledThrough === current) return [];

    const pending = await query(
        `SELECT w::text AS week_start
         FROM generate_series(1, 4) n,
              LATERAL (SELECT ($1::date - n * 7) AS w) d
         WHERE w >= $2::date AND NOT EXISTS (SELECT 1 FROM weekly_trophies t WHERE t.week_start = w)
         ORDER BY w ASC`,
        [current, process.env.TROPHY_FIRST_WEEK || WEEKLY_TROPHY.firstWeek]
    );
    const awards = [];
    for (const { week_start: weekStart } of pending.rows) {
        const award = await settleWeek(weekStart, tz);
        if (award) awards.push(award);
    }
    settledThrough = current;
    return awards;
}

async function settleWeek(weekStart, tz) {
    const Task = require('../models/Task');
    const { recalculateMultiplier } = require('../models/User');
    const outcome = await transaction(async (client) => {
        const board = await client.query(
            `SELECT user_id, SUM(xp_amount)::int AS xp, MAX(created_at) AS last_at
             FROM xp_history
             WHERE source = ANY($3)
               AND created_at >= ($1::date::timestamp AT TIME ZONE $2)
               AND created_at < (($1::date + 7)::timestamp AT TIME ZONE $2)
             GROUP BY user_id HAVING SUM(xp_amount) > 0
             ORDER BY xp DESC, last_at ASC`,
            [weekStart, tz, EARNED_SOURCES]
        );
        const winner = board.rows.length >= WEEKLY_TROPHY.minPlayers && board.rows[0].xp >= WEEKLY_TROPHY.minWeekXp ? board.rows[0] : null;
        const settled = await client.query(
            `INSERT INTO weekly_trophies (week_start, user_id, xp_amount, week_xp) VALUES ($1, $2, $3, $4)
             ON CONFLICT (week_start) DO NOTHING RETURNING week_start`,
            [weekStart, winner ? winner.user_id : null, winner ? WEEKLY_TROPHY.xp : 0, winner ? winner.xp : 0]
        );
        if (!settled.rows.length || !winner) return null;
        await client.query(
            `INSERT INTO xp_history (user_id, xp_amount, source, source_id, created_at) VALUES ($1, $2, 'weekly_trophy', NULL, NOW())`,
            [winner.user_id, WEEKLY_TROPHY.xp]
        );
        await Task.syncUserTotals(client, winner.user_id);
        await recalculateMultiplier(winner.user_id, true, client);
        return { userId: winner.user_id, weekStart, xp: WEEKLY_TROPHY.xp, weekXp: winner.xp };
    });
    if (outcome) {
        publishToUser(outcome.userId, 'sync', { reason: 'trophy' });
        await logActivity({
            userId: outcome.userId, action: 'task.trophy',
            message: `Won the week of ${weekStart} with ${outcome.weekXp} XP = +${outcome.xp} XP`,
            meta: outcome
        }).catch(warnOnError('bonusService.trophy.log'));
    }
    return outcome;
}

// Trophy of this user from the last 14 days, so the client can congratulate once.
async function getRecentTrophy(userId) {
    const result = await query(
        `SELECT week_start::text AS "weekStart", xp_amount AS xp, week_xp AS "weekXp" FROM weekly_trophies
         WHERE user_id = $1 AND awarded_at > NOW() - INTERVAL '14 days' ORDER BY week_start DESC LIMIT 1`,
        [userId]
    );
    return result.rows[0] || null;
}

// Tests backdate XP rows and need the next check to look again.
const resetSettledCache = () => { settledThrough = null; };

module.exports = { EARNED_SOURCES, reconcileDailyGoal, awardWeeklyTrophies, getRecentTrophy, resetSettledCache };
