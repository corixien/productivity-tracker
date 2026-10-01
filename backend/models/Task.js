const { query, transaction } = require('../utils/database');
const { logTaskCreation, logXpGeneration } = require('../services/loggingService');
const { getRankName, getLevel, calculateXpFromTask } = require('../services/rankService');
const { recalculateMultiplier } = require('../models/User');
const { warnOnError } = require('../utils/errors');

const defaultDb = { query };

function normalizeTask(task) {
    if (!task) return null;
    return {
        id: task.id,
        userId: task.user_id,
        taskText: task.task_text,
        name: task.name || task.task_text,
        aiScore: task.ai_score,
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
    const name = taskData.name || taskData.taskText;
    const productivity = Number(taskData.productivity || 0);
    const difficulty = Number(taskData.difficulty || 3);
    const bonus = Number(taskData.bonus || 0);
    const xp = taskData.xp !== undefined
        ? Number(taskData.xp)
        : calculateXpFromTask(Number(taskData.duration), productivity, difficulty, bonus);
    const result = await db.query(
        `INSERT INTO tasks (user_id, task_text, name, ai_score, xp_awarded, duration, productivity, difficulty, category, bonus, completed, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, NOW())
         RETURNING *`,
        [userId, name, name, productivity, xp, Number(taskData.duration), productivity, difficulty, taskData.category || 'other', bonus]
    );
    const task = normalizeTask(result.rows[0]);
    await logTaskCreation(userId, task);
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

// Re-sums xp_history and writes users.xp/level/rank. Must run inside the caller's transaction.
async function syncUserTotals(client, userId) {
    const totalResult = await client.query(
        'SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1',
        [userId]
    );
    const totalXp = parseInt(totalResult.rows[0].total, 10);
    await client.query(
        'UPDATE users SET xp = $1, level = $2, rank = $3, updated_at = NOW() WHERE id = $4',
        [totalXp, getLevel(totalXp), getRankName(totalXp), userId]
    );
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
async function update(userId, id, updates) {
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
            `UPDATE tasks SET name = $1, task_text = $2, duration = $3, productivity = $4, difficulty = $5,
                 category = $6, bonus = $7, xp_awarded = $8, updated_at = NOW()
             WHERE id = $9 RETURNING *`,
            [next.name, next.name, next.duration, next.productivity, next.difficulty, next.category, next.bonus, newXp, id]
        );

        let xpChange = 0;
        let totalXp = null;
        if (task.completed && newXp !== task.xp_awarded) {
            const awarded = await getAwardedXp(client, userId, id);
            const ratio = task.xp_awarded > 0 ? awarded / task.xp_awarded : 1;
            xpChange = Math.round(newXp * ratio) - awarded;
            if (xpChange !== 0) {
                await insertXpHistory(client, userId, xpChange, 'task_edit', id);
                totalXp = await syncUserTotals(client, userId);
                await recalculateMultiplier(userId, true, client);
            }
        }
        return { task: normalizeTask(updated.rows[0]), xpChange, totalXp };
    });
    if (outcome && outcome.xpChange !== 0) {
        await logXpGeneration(userId, outcome.xpChange, 'task_edit').catch(warnOnError('Task.update.log'));
    }
    return outcome;
}

async function setCompleted(userId, taskId, completed) {
    const outcome = await transaction(async (client) => {
        const taskResult = await client.query(
            'SELECT * FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [taskId, userId]
        );
        if (!taskResult.rows.length) return null;
        const task = taskResult.rows[0];
        if (Boolean(task.completed) === Boolean(completed)) {
            const totalResult = await client.query('SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1', [userId]);
            return { task: normalizeTask(task), totalXp: parseInt(totalResult.rows[0].total, 10), xpEarned: 0 };
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

        const totalXp = await syncUserTotals(client, userId);
        await recalculateMultiplier(userId, true, client);
        const updatedResult = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
        return { task: normalizeTask(updatedResult.rows[0]), totalXp, xpEarned: xpChange, changed: true };
    });
    if (outcome && outcome.changed) {
        await logXpGeneration(userId, outcome.xpEarned, completed ? 'task' : 'task_uncomplete').catch(warnOnError('Task.setCompleted.log'));
    }
    return outcome;
}

function complete(userId, taskId) {
    return setCompleted(userId, taskId, true);
}

async function deleteTask(userId, taskId) {
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
        const totalXp = await syncUserTotals(client, userId);
        await recalculateMultiplier(userId, true, client);
        return { deleted: true, totalXp, xpChange };
    });
    if (outcome) {
        await logXpGeneration(userId, outcome.xpChange, 'task_delete').catch(warnOnError('Task.delete.log'));
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

// dates: distinct 'YYYY-MM-DD' strings with completed tasks. today: 'YYYY-MM-DD'.
// The streak stays alive through today if nothing is completed yet, but breaks after a missed day.
function computeStreaks(dates, today) {
    const set = new Set(dates);
    let current = 0;
    let cursor = set.has(today) ? today : shiftDay(today, -1);
    while (set.has(cursor)) {
        current += 1;
        cursor = shiftDay(cursor, -1);
    }

    let longest = 0;
    let run = 0;
    let previous = null;
    for (const date of [...set].sort()) {
        run = previous && shiftDay(previous, 1) === date ? run + 1 : 1;
        longest = Math.max(longest, run);
        previous = date;
    }
    return { current, longest };
}

async function getStats(userId, tz) {
    const [datesResult, windowResult, goalResult] = await Promise.all([
        query(
            `SELECT DISTINCT ((completed_at AT TIME ZONE $2)::date)::text AS d
             FROM tasks WHERE user_id = $1 AND completed = true AND completed_at IS NOT NULL
             ORDER BY d DESC LIMIT 400`,
            [userId, tz]
        ),
        query(
            `SELECT ((NOW() AT TIME ZONE $2)::date)::text AS today,
                    (SELECT COALESCE(SUM(xp_amount), 0)::int FROM xp_history
                     WHERE user_id = $1 AND created_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS today_xp,
                    (SELECT COUNT(*)::int FROM tasks
                     WHERE user_id = $1 AND completed = true AND completed_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS today_tasks,
                    (SELECT COALESCE(SUM(xp_amount), 0)::int FROM xp_history
                     WHERE user_id = $1 AND created_at >= date_trunc('week', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS week_xp,
                    (SELECT COUNT(*)::int FROM tasks
                     WHERE user_id = $1 AND completed = true AND completed_at >= date_trunc('week', NOW() AT TIME ZONE $2) AT TIME ZONE $2) AS week_tasks`,
            [userId, tz]
        ),
        query('SELECT daily_goal_xp FROM users WHERE id = $1', [userId])
    ]);
    const window = windowResult.rows[0];
    const dates = datesResult.rows.map((row) => row.d);
    return {
        streak: { ...computeStreaks(dates, window.today), activeToday: dates.includes(window.today) },
        today: { xp: Math.max(0, window.today_xp), tasks: window.today_tasks, goal: goalResult.rows[0]?.daily_goal_xp ?? 50 },
        week: { xp: Math.max(0, window.week_xp), tasks: window.week_tasks }
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
    computeStreaks,
    normalizeTask
};
