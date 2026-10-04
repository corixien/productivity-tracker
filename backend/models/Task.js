const { query, transaction } = require('../utils/database');
const { logActivity } = require('../services/loggingService');
const { calculateXpFromTask } = require('../services/rankService');
const { recalculateMultiplier } = require('../models/User');
const { warnOnError } = require('../utils/errors');
const { reconcileDailyGoal, EARNED_SOURCES } = require('../services/bonusService');

const defaultDb = { query };

function normalizeTask(task) {
    if (!task) return null;
    return {
        id: task.id,
        userId: task.user_id,
        name: task.name,
        xp: task.xp_awarded,
        xpAwarded: task.xp_awarded,
        duration: task.duration,
        productivity: task.productivity,
        difficulty: task.difficulty,
        bonus: task.bonus,
        category: task.category,
        completed: task.completed,
        createdAt: task.created_at,
        completedAt: task.completed_at
    };
}

async function create(userId, taskData, db = defaultDb) {
    const name = taskData.name;
    const productivity = Number(taskData.productivity || 0);
    const difficulty = Number(taskData.difficulty || 3);
    const bonus = Number(taskData.bonus || 0);
    const xp = calculateXpFromTask(Number(taskData.duration), productivity, difficulty, bonus);
    const result = await db.query(
        `INSERT INTO tasks (user_id, name, xp_awarded, duration, productivity, difficulty, category, bonus, completed, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())
         RETURNING *`,
        [userId, name, xp, Number(taskData.duration), productivity, difficulty, taskData.category || 'other', bonus]
    );
    const task = normalizeTask(result.rows[0]);
    await logActivity({
        userId, action: 'task.create', message: `Created task "${task.name}" (${task.xp} XP)`,
        meta: { taskId: task.id, xp: task.xp, duration: task.duration, category: task.category }
    });
    return task;
}

async function findById(id) {
    const result = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    return normalizeTask(result.rows[0]);
}

async function findByUserId(userId, options = {}) {
    const { completed, limit, offset } = options;
    const conditions = ['user_id = $1'];
    const params = [userId];

    if (completed !== undefined) {
        params.push(completed);
        conditions.push(`completed = $${params.length}`);
    }

    let sql = `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    if (limit) {
        params.push(Number(limit));
        sql += ` LIMIT $${params.length}`;
    }
    if (offset) {
        params.push(Number(offset));
        sql += ` OFFSET $${params.length}`;
    }
    const result = await query(sql, params);
    return result.rows.map(normalizeTask);
}

// XP actually credited for a task so far: the sum of its xp_history rows (multiplier included).
async function getAwardedXp(client, userId, taskId) {
    const result = await client.query(
        'SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1 AND source_id = $2',
        [userId, taskId]
    );
    return Math.max(0, parseInt(result.rows[0].total, 10));
}

// Re-sums xp_history and writes users.xp (rank and level are derived by a trigger). Must run inside the caller's transaction.
async function syncUserTotals(client, userId) {
    const totalResult = await client.query(
        'SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1',
        [userId]
    );
    const totalXp = parseInt(totalResult.rows[0].total, 10);
    // rank and level follow xp inside the database (users_sync_progress trigger)
    await client.query('UPDATE users SET xp = $1, updated_at = NOW() WHERE id = $2', [totalXp, userId]);
    return totalXp;
}

async function insertXpHistory(client, userId, amount, source, taskId) {
    await client.query(
        `INSERT INTO xp_history (user_id, xp_amount, source, source_id, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, amount, source, taskId]
    );
}

const EDITABLE_FIELDS = ['name', 'duration', 'productivity', 'difficulty', 'category', 'bonus'];
const XP_FIELDS = ['duration', 'productivity', 'difficulty', 'bonus'];

// Edits a task. XP is recomputed when an XP input changes; for completed tasks the
// difference is booked as a 'task_edit' xp_history row, keeping the multiplier used at completion.
async function update(userId, id, updates, tz) {
    const outcome = await transaction(async (client) => {
        const found = await client.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId]);
        const task = found.rows[0];
        if (!task) return null;

        const next = {};
        for (const field of EDITABLE_FIELDS) {
            next[field] = updates[field] !== undefined ? updates[field] : task[field];
        }
        const xpInputsChanged = XP_FIELDS.some((field) => updates[field] !== undefined && Number(updates[field]) !== Number(task[field]));
        const newXp = xpInputsChanged
            ? calculateXpFromTask(Number(next.duration), Number(next.productivity), Number(next.difficulty), Number(next.bonus))
            : task.xp_awarded;

        const updated = await client.query(
            `UPDATE tasks SET name = $1, duration = $2, productivity = $3, difficulty = $4,
                 category = $5, bonus = $6, xp_awarded = $7, updated_at = NOW()
             WHERE id = $8 RETURNING *`,
            [next.name, next.duration, next.productivity, next.difficulty, next.category, next.bonus, newXp, id]
        );

        let xpChange = 0;
        let goalBonus = 0;
        let totalXp = null;
        if (task.completed && newXp !== task.xp_awarded) {
            const awarded = await getAwardedXp(client, userId, id);
            const ratio = task.xp_awarded > 0 ? awarded / task.xp_awarded : 1;
            xpChange = Math.round(newXp * ratio) - awarded;
            if (xpChange !== 0) {
                await insertXpHistory(client, userId, xpChange, 'task_edit', id);
                goalBonus = await reconcileDailyGoal(client, userId, tz);
                totalXp = await syncUserTotals(client, userId);
                await recalculateMultiplier(userId, true, client);
            }
        }
        return { task: normalizeTask(updated.rows[0]), xpChange, goalBonus, totalXp };
    });
    if (outcome) {
        const delta = outcome.xpChange !== 0 ? ` (${outcome.xpChange > 0 ? '+' : ''}${outcome.xpChange} XP)` : '';
        await logActivity({
            userId, action: 'task.edit', message: `Edited task "${outcome.task.name}"${delta}`,
            meta: { taskId: id, xpChange: outcome.xpChange, changes: updates }
        }).catch(warnOnError('Task.update.log'));
    }
    return outcome;
}

async function setCompleted(userId, taskId, completed, tz) {
    const outcome = await transaction(async (client) => {
        const taskResult = await client.query(
            'SELECT * FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [taskId, userId]
        );
        if (!taskResult.rows.length) return null;
        const task = taskResult.rows[0];
        if (Boolean(task.completed) === Boolean(completed)) {
            const totalResult = await client.query('SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1', [userId]);
            return { task: normalizeTask(task), totalXp: parseInt(totalResult.rows[0].total, 10), xpEarned: 0, goalBonus: 0 };
        }

        let xpChange = 0;
        if (completed) {
            // Use current standings, not a possibly stale stored multiplier.
            const multiplier = (await recalculateMultiplier(userId, true, client)) ?? 1.0;
            xpChange = Math.round(Number(task.xp_awarded || 0) * multiplier);
            await client.query(
                'UPDATE tasks SET completed = true, completed_at = COALESCE(completed_at, NOW()) WHERE id = $1',
                [taskId]
            );
            if (xpChange > 0) {
                await insertXpHistory(client, userId, xpChange, 'task', taskId);
            }
        } else {
            xpChange = -(await getAwardedXp(client, userId, taskId));
            await client.query(
                'UPDATE tasks SET completed = false, completed_at = NULL WHERE id = $1',
                [taskId]
            );
            if (xpChange < 0) {
                await insertXpHistory(client, userId, xpChange, 'task_uncomplete', taskId);
            }
        }

        const goalBonus = await reconcileDailyGoal(client, userId, tz);
        const totalXp = await syncUserTotals(client, userId);
        await recalculateMultiplier(userId, true, client);
        const updatedResult = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
        return { task: normalizeTask(updatedResult.rows[0]), totalXp, xpEarned: xpChange, goalBonus, changed: true };
    });
    if (outcome && outcome.changed) {
        const sign = outcome.xpEarned > 0 ? '+' : '';
        await logActivity({
            userId,
            action: completed ? 'task.complete' : 'task.uncomplete',
            message: `${completed ? 'Completed' : 'Undid'} task "${outcome.task.name}" = ${sign}${outcome.xpEarned} XP`,
            meta: { taskId, xpChange: outcome.xpEarned, totalXp: outcome.totalXp }
        }).catch(warnOnError('Task.setCompleted.log'));
    }
    return outcome;
}

function complete(userId, taskId, tz) {
    return setCompleted(userId, taskId, true, tz);
}

async function deleteTask(userId, taskId, tz) {
    const outcome = await transaction(async (client) => {
        const taskResult = await client.query(
            'SELECT * FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [taskId, userId]
        );
        if (!taskResult.rows.length) return null;
        const task = taskResult.rows[0];

        const awarded = task.completed ? await getAwardedXp(client, userId, taskId) : 0;
        const xpChange = awarded > 0 ? -awarded : 0;
        if (xpChange !== 0) {
            await insertXpHistory(client, userId, xpChange, 'task_delete', taskId);
        }
        await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
        const goalBonus = xpChange !== 0 ? await reconcileDailyGoal(client, userId, tz) : 0;
        const totalXp = await syncUserTotals(client, userId);
        await recalculateMultiplier(userId, true, client);
        return { deleted: true, totalXp, xpChange, goalBonus, name: task.name };
    });
    if (outcome) {
        const delta = outcome.xpChange !== 0 ? ` (${outcome.xpChange} XP)` : '';
        await logActivity({
            userId, action: 'task.delete', message: `Deleted task "${outcome.name}"${delta}`,
            meta: { taskId, xpChange: outcome.xpChange, totalXp: outcome.totalXp }
        }).catch(warnOnError('Task.delete.log'));
    }
    return outcome;
}

async function getCompletedCount(userId) {
    const result = await query(
        'SELECT COUNT(*) AS count FROM tasks WHERE user_id = $1 AND completed = true',
        [userId]
    );
    return parseInt(result.rows[0].count, 10);
}

// Newest first, each row joined with the task name (null once the task was deleted).
// Returns up to `limit` rows plus hasMore.
async function getXpHistory(userId, options = {}) {
    const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
    const offset = Math.max(0, Number(options.offset || 0));
    const result = await query(
        `SELECT h.id, h.xp_amount, h.source, h.source_id, h.created_at, t.name AS task_name
         FROM xp_history h
         LEFT JOIN tasks t ON t.id = h.source_id
         WHERE h.user_id = $1
         ORDER BY h.created_at DESC, h.id
         LIMIT $2 OFFSET $3`,
        [userId, limit + 1, offset]
    );
    return { rows: result.rows.slice(0, limit), hasMore: result.rows.length > limit };
}

async function getTotalXp(userId) {
    const result = await query(
        'SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1',
        [userId]
    );
    return parseInt(result.rows[0].total, 10);
}

const DAY_MS = 86400000;
const shiftDay = (day, deltaDays) => new Date(Date.parse(`${day}T00:00:00Z`) + deltaDays * DAY_MS).toISOString().slice(0, 10);

const FREEZE_EVERY_DAYS = 7;
const MAX_FREEZES = 3;
const CALENDAR_DAYS = 35;

// dates: 'YYYY-MM-DD' strings with at least one completed task. today: 'YYYY-MM-DD'.
// Walks the calendar day by day:
//  - a day with a completed task extends the streak; every 7th streak day earns an ice streak (max 3 stored)
//  - a missed day spends one ice streak (the streak survives) or, with none left, resets the streak
//  - today never counts as missed: the day is not over yet
function computeStreaks(dates, today, maxFreezes = MAX_FREEZES) {
    const done = new Set(dates);
    if (done.size === 0) return { current: 0, longest: 0, freezes: 0, frozenDates: [] };

    let streak = 0;
    let longest = 0;
    let freezes = 0;
    const frozenDates = [];
    for (let day = [...done].sort()[0]; day <= today; day = shiftDay(day, 1)) {
        if (done.has(day)) {
            streak += 1;
            longest = Math.max(longest, streak);
            if (streak % FREEZE_EVERY_DAYS === 0 && freezes < maxFreezes) freezes += 1;
        } else if (day === today) {
            // still open
        } else if (streak > 0 && freezes > 0) {
            freezes -= 1;
            frozenDates.push(day);
        } else {
            streak = 0;
        }
    }
    return { current: streak, longest, freezes, frozenDates };
}

async function getStats(userId, tz) {
    const [datesResult, windowResult, goalResult, daysResult] = await Promise.all([
        query(
            `SELECT DISTINCT ((completed_at AT TIME ZONE $2)::date)::text AS d
             FROM tasks WHERE user_id = $1 AND completed = true AND completed_at IS NOT NULL
               AND completed_at > NOW() - INTERVAL '1500 days'
             ORDER BY d ASC`,
            [userId, tz]
        ),
        query(
            `SELECT ((NOW() AT TIME ZONE $2)::date)::text AS today,
                    (SELECT COALESCE(SUM(xp_amount), 0)::int FROM xp_history
                     WHERE user_id = $1 AND source = ANY($3) AND created_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS today_xp,
                    (SELECT COUNT(*)::int FROM tasks
                     WHERE user_id = $1 AND completed = true AND completed_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS today_tasks,
                    (SELECT COALESCE(SUM(xp_amount), 0)::int FROM xp_history
                     WHERE user_id = $1 AND source = ANY($3) AND created_at >= date_trunc('week', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS week_xp,
                    (SELECT COUNT(*)::int FROM tasks
                     WHERE user_id = $1 AND completed = true AND completed_at >= date_trunc('week', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS week_tasks`,
            [userId, tz, EARNED_SOURCES]
        ),
        query('SELECT daily_goal_xp FROM users WHERE id = $1', [userId]),
        query(
            `WITH days AS (
                 SELECT (date_trunc('day', NOW() AT TIME ZONE $2)::date - g) AS d FROM generate_series(0, $3::int - 1) g
             )
             SELECT d::text AS date,
                    COALESCE((SELECT SUM(h.xp_amount) FROM xp_history h
                              WHERE h.user_id = $1 AND h.source = ANY($4) AND h.created_at > NOW() - INTERVAL '60 days'
                                AND (h.created_at AT TIME ZONE $2)::date = days.d), 0)::int AS xp,
                    (SELECT COUNT(*) FROM tasks t
                     WHERE t.user_id = $1 AND t.completed = true AND t.completed_at > NOW() - INTERVAL '60 days'
                       AND (t.completed_at AT TIME ZONE $2)::date = days.d)::int AS tasks
             FROM days ORDER BY d ASC`,
            [userId, tz, CALENDAR_DAYS, EARNED_SOURCES]
        )
    ]);
    const window = windowResult.rows[0];
    const dates = datesResult.rows.map((row) => row.d);
    const streak = computeStreaks(dates, window.today);
    const frozen = new Set(streak.frozenDates);

    return {
        streak: {
            current: streak.current,
            longest: streak.longest,
            activeToday: dates.includes(window.today),
            freezes: streak.freezes,
            maxFreezes: MAX_FREEZES,
            nextFreezeIn: streak.freezes >= MAX_FREEZES ? null : FREEZE_EVERY_DAYS - (streak.current % FREEZE_EVERY_DAYS)
        },
        today: { xp: Math.max(0, window.today_xp), tasks: window.today_tasks, goal: goalResult.rows[0]?.daily_goal_xp ?? 50 },
        week: { xp: Math.max(0, window.week_xp), tasks: window.week_tasks },
        days: daysResult.rows.map((row) => ({
            date: row.date,
            xp: Math.max(0, row.xp),
            tasks: row.tasks,
            status: row.tasks > 0 ? 'done' : frozen.has(row.date) ? 'frozen' : 'none',
            today: row.date === window.today
        }))
    };
}

module.exports = {
    create,
    findById,
    findByUserId,
    update,
    setCompleted,
    complete,
    delete: deleteTask,
    getCompletedCount,
    getXpHistory,
    getTotalXp,
    getStats,
    syncUserTotals,
    computeStreaks,
    normalizeTask
};
