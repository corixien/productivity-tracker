const { query, transaction } = require('../utils/database');
const { logTaskCreation, logXpGeneration } = require('../services/loggingService');
const { getRankName, getLevel, calculateXpFromTask } = require('../services/rankService');
const { recalculateMultiplier } = require('../models/User');

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

async function create(userId, taskData) {
    const name = taskData.name || taskData.taskText;
    const productivity = Number(taskData.productivity || 0);
    const difficulty = Number(taskData.difficulty || 3);
    const bonus = Number(taskData.bonus || 0);
    const xp = taskData.xp !== undefined
        ? Number(taskData.xp)
        : calculateXpFromTask(Number(taskData.duration), productivity, difficulty, bonus);
    const result = await query(
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
    let paramIndex = 2;

    if (completed !== undefined) {
        conditions.push(`completed = $${paramIndex}`);
        params.push(completed);
        paramIndex += 1;
    }

    const result = await query(
        `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC${limit ? ' LIMIT $' + paramIndex : ''}${offset ? ' OFFSET $' + (paramIndex + Number(Boolean(limit))) : ''}`,
        params.concat(limit ? [Number(limit)] : []).concat(offset ? [Number(offset)] : [])
    );
    return result.rows.map(normalizeTask);
}

async function update(id, updates) {
    const allowedFields = ['name', 'duration', 'productivity', 'difficulty', 'category', 'bonus'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            const column = field === 'name' ? 'name' : field;
            setClause.push(`${column} = $${paramIndex}`);
            values.push(updates[field]);
            paramIndex += 1;
        }
    }

    if (setClause.length === 0) return findById(id);
    values.push(id);
        const result = await query(
            `UPDATE tasks SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
    return normalizeTask(result.rows[0]);
}

async function setCompleted(userId, taskId, completed) {
    return transaction(async (client) => {
        const taskResult = await client.query(
            'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );
        if (!taskResult.rows.length) return null;
        const task = taskResult.rows[0];
        if (Boolean(task.completed) === Boolean(completed)) {
            const totalResult = await client.query('SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1', [userId]);
            const totalXp = parseInt(totalResult.rows[0].total, 10);
            return { task: normalizeTask(task), totalXp, xpEarned: 0 };
        }

        let xpChange = 0;
        if (completed) {
            xpChange = Number(task.xp_awarded || 0);
            const multResult = await client.query(
                'SELECT multiplier FROM users WHERE id = $1',
                [userId]
            );
            const multiplier = multResult.rows[0]?.multiplier || 1.0;
            xpChange = Math.round(xpChange * multiplier);
            await client.query(
                `UPDATE tasks SET completed = true, completed_at = COALESCE(completed_at, NOW()) WHERE id = $1 RETURNING *`,
                [taskId]
            );
            if (xpChange > 0) {
                await client.query(
                    `INSERT INTO xp_history (user_id, xp_amount, source, source_id, created_at)
                     VALUES ($1, $2, 'task', $3, NOW())`,
                    [userId, xpChange, taskId]
                );
            }
        } else {
            xpChange = -Number(task.xp_awarded || 0);
            await client.query(
                `UPDATE tasks SET completed = false, completed_at = NULL WHERE id = $1 RETURNING *`,
                [taskId]
            );
            if (xpChange < 0) {
                await client.query(
                    `INSERT INTO xp_history (user_id, xp_amount, source, source_id, created_at)
                     VALUES ($1, $2, 'task_uncomplete', $3, NOW())`,
                    [userId, xpChange, taskId]
                );
            }
        }

        const totalResult = await client.query('SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1', [userId]);
        const totalXp = parseInt(totalResult.rows[0].total, 10);
        await client.query(
            'UPDATE users SET xp = $1, level = $2, rank = $3, updated_at = NOW() WHERE id = $4',
            [totalXp, getLevel(totalXp), getRankName(totalXp), userId]
        );
        const updatedResult = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
        await logXpGeneration(userId, xpChange, completed ? 'task' : 'task_uncomplete');
        return { task: normalizeTask(updatedResult.rows[0]), totalXp, xpEarned: xpChange };
    });
}

async function complete(userId, taskId) {
    const result = await setCompleted(userId, taskId, true);
    if (result) {
        await recalculateMultiplier(userId).catch(() => {});
    }
    return result;
}

async function deleteTask(userId, taskId) {
    const result = await transaction(async (client) => {
        const taskResult = await client.query(
            'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
            [taskId, userId]
        );
        if (!taskResult.rows.length) return null;
        const task = taskResult.rows[0];
        let xpChange = 0;
        if (task.completed && Number(task.xp_awarded || 0) > 0) {
            xpChange = -Number(task.xp_awarded);
            await client.query(
                `INSERT INTO xp_history (user_id, xp_amount, source, source_id, created_at)
                 VALUES ($1, $2, 'task_delete', $3, NOW())`,
                [userId, xpChange, taskId]
            );
        }
        await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
        const totalResult = await client.query('SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1', [userId]);
        const totalXp = parseInt(totalResult.rows[0].total, 10);
        await client.query(
            'UPDATE users SET xp = $1, level = $2, rank = $3, updated_at = NOW() WHERE id = $4',
            [totalXp, getLevel(totalXp), getRankName(totalXp), userId]
        );
        await logXpGeneration(userId, xpChange, 'task_delete');
        return { deleted: true, totalXp, xpChange };
    });
    if (result) {
        await recalculateMultiplier(userId).catch(() => {});
    }
    return result;
}

async function getCompletedCount(userId) {
    const result = await query(
        'SELECT COUNT(*) AS count FROM tasks WHERE user_id = $1 AND completed = true',
        [userId]
    );
    return parseInt(result.rows[0].count, 10);
}

async function getXpHistory(userId, options = {}) {
    const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
    const offset = Math.max(0, Number(options.offset || 0));
    const result = await query(
        'SELECT * FROM xp_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
    );
    return result.rows;
}

async function getTotalXp(userId) {
    const result = await query(
        'SELECT COALESCE(SUM(xp_amount), 0) AS total FROM xp_history WHERE user_id = $1',
        [userId]
    );
    return parseInt(result.rows[0].total, 10);
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
    normalizeTask
};
