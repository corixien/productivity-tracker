const Task = require('../models/Task');
const { asyncHandler, notFound } = require('../utils/errors');

const EDIT_FIELDS = ['name', 'duration', 'productivity', 'difficulty', 'category', 'bonus'];

const getTasks = asyncHandler(async (req, res) => {
    const { completed, limit, offset } = req.query;
    const options = {};
    if (completed !== undefined) options.completed = completed === 'true';
    if (limit) options.limit = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    if (offset) options.offset = Math.max(0, parseInt(offset, 10) || 0);
    res.json(await Task.findByUserId(req.user.id, options));
});

const createTask = asyncHandler(async (req, res) => {
    res.status(201).json(await Task.create(req.user.id, req.body));
});

// PUT /:id edits fields (XP recalculated server-side) and/or toggles `completed`.
const updateTask = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const id = req.params.id;
    const hasEdits = EDIT_FIELDS.some((field) => req.body[field] !== undefined);
    let task = null;
    let xpChange = 0;
    let goalBonus = 0;
    let newXP = null;

    if (hasEdits) {
        const edited = await Task.update(userId, id, req.body, req.tz);
        if (!edited) throw notFound('Task not found');
        task = edited.task;
        xpChange = edited.xpChange;
        goalBonus += edited.goalBonus;
        newXP = edited.totalXp;
    }

    if (req.body.completed !== undefined) {
        const result = await Task.setCompleted(userId, id, Boolean(req.body.completed), req.tz);
        if (!result) throw notFound('Task not found');
        task = result.task;
        xpChange += result.xpEarned;
        goalBonus += result.goalBonus;
        newXP = result.totalXp;
    }

    if (!task) {
        task = await Task.findById(id);
        if (!task || task.userId !== userId) throw notFound('Task not found');
    }
    if (newXP === null) newXP = await Task.getTotalXp(userId);

    res.json({ ...task, success: true, xpEarned: xpChange, xpChange, goalBonus, newXP });
});

const completeTask = asyncHandler(async (req, res) => {
    const result = await Task.complete(req.user.id, req.params.id, req.tz);
    if (!result) throw notFound('Task not found');
    res.json({ success: true, task: result.task, xpEarned: result.xpEarned, goalBonus: result.goalBonus, newXP: result.totalXp });
});

const deleteTask = asyncHandler(async (req, res) => {
    const result = await Task.delete(req.user.id, req.params.id, req.tz);
    if (!result) throw notFound('Task not found');
    res.json({ success: true, newXP: result.totalXp, xpChange: result.xpChange, goalBonus: result.goalBonus });
});

module.exports = { getTasks, createTask, updateTask, completeTask, deleteTask };
