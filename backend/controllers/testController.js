const { query } = require('../utils/database');
const { logError } = require('../services/loggingService');

async function rawDeleteAndCheck(req, res) {
    try {
        const taskId = req.params.id;
        const taskResult = await query('SELECT id, user_id, xp_awarded FROM tasks WHERE id = $1', [taskId]);
        if (!taskResult.rows.length) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }
        const task = taskResult.rows[0];

        const userResult = await query('SELECT xp, level, rank FROM users WHERE id = $1', [task.user_id]);
        const beforeXp = parseInt(userResult.rows[0].xp, 10);

        await query('DELETE FROM tasks WHERE id = $1', [taskId]);

        const afterResult = await query('SELECT xp, level, rank FROM users WHERE id = $1', [task.user_id]);
        const afterXp = parseInt(afterResult.rows[0].xp, 10);

        return res.json({
            success: true,
            taskId,
            deletedUserId: task.user_id,
            taskXpAwarded: Number(task.xp_awarded),
            beforeXp,
            afterXp,
            expectedXp: Math.max(0, beforeXp - Number(task.xp_awarded)),
            level: afterResult.rows[0].level,
            rank: afterResult.rows[0].rank
        });
    } catch (error) {
        await logError(error, { context: 'rawDeleteAndCheck', taskId: req.params.id });
        return res.status(500).json({ success: false, error: 'Raw delete test failed' });
    }
}

module.exports = { rawDeleteAndCheck };
