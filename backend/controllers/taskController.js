const Task = require('../models/Task');
const { logError } = require('../services/loggingService');

function formatTask(task) {
    return task;
}

async function getTasks(req, res) {
    try {
        const { completed, limit, offset } = req.query;
        const options = {};
        if (completed !== undefined) options.completed = completed === 'true';
        if (limit) options.limit = parseInt(limit, 10);
        if (offset) options.offset = parseInt(offset, 10);
        const tasks = await Task.findByUserId(req.user.id, options);
        return res.json(tasks.map(formatTask));
    } catch (error) {
        await logError(error, { context: 'getTasks', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to get tasks' });
    }
}

async function createTask(req, res) {
    try {
        const task = await Task.create(req.user.id, req.body);
        return res.status(201).json(formatTask(task));
    } catch (error) {
        await logError(error, { context: 'createTask', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to create task' });
    }
}

async function updateTask(req, res) {
    try {
        const current = await Task.findById(req.params.id);
        if (!current) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }
        if (current.userId !== req.user.id) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }
        if (req.body.completed !== undefined) {
            const result = await Task.setCompleted(req.user.id, req.params.id, Boolean(req.body.completed));
            if (!result) {
                return res.status(404).json({ success: false, error: 'Task not found' });
            }
            return res.json({
                ...formatTask(result.task),
                success: true,
                xpEarned: result.xpEarned,
                newXP: result.totalXp
            });
        }
        const task = await Task.update(req.params.id, req.body);
        return res.json(formatTask(task));
    } catch (error) {
        await logError(error, { context: 'updateTask', taskId: req.params.id });
        return res.status(500).json({ success: false, error: 'Failed to update task' });
    }
}

async function completeTask(req, res) {
    try {
        const result = await Task.complete(req.user.id, req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }
        return res.json({
            success: true,
            task: formatTask(result.task),
            xpEarned: result.xpEarned,
            newXP: result.totalXp
        });
    } catch (error) {
        await logError(error, { context: 'completeTask', taskId: req.params.id });
        return res.status(500).json({ success: false, error: 'Failed to complete task', detail: error.message });
    }
}

async function deleteTask(req, res) {
    try {
        const result = await Task.delete(req.user.id, req.params.id);
        if (!result) {
            return res.status(404).json({ success: false, error: 'Task not found' });
        }
        return res.json({ success: true, newXP: result.totalXp, xpChange: result.xpChange });
    } catch (error) {
        await logError(error, { context: 'deleteTask', taskId: req.params.id });
        return res.status(500).json({ success: false, error: 'Failed to delete task' });
    }
}

module.exports = {
    getTasks,
    createTask,
    updateTask,
    completeTask,
    deleteTask
};
