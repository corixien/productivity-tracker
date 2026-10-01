const QuickTask = require('../models/QuickTask');
const { asyncHandler, notFound } = require('../utils/errors');

const getQuickTasks = asyncHandler(async (req, res) => {
    res.json(await QuickTask.findByUserId(req.user.id));
});

const createQuickTask = asyncHandler(async (req, res) => {
    res.status(201).json(await QuickTask.create(req.user.id, req.body));
});

const updateQuickTask = asyncHandler(async (req, res) => {
    const template = await QuickTask.update(req.params.id, req.user.id, req.body);
    if (!template) throw notFound('Quick task not found');
    res.json(template);
});

const deleteQuickTask = asyncHandler(async (req, res) => {
    if (!await QuickTask.remove(req.params.id, req.user.id)) throw notFound('Quick task not found');
    res.json({ success: true });
});

const useQuickTask = asyncHandler(async (req, res) => {
    const task = await QuickTask.createTaskFrom(req.params.id, req.user.id);
    if (!task) throw notFound('Quick task not found');
    res.status(201).json(task);
});

const spawnRecurring = asyncHandler(async (req, res) => {
    const tasks = await QuickTask.spawnRecurring(req.user.id, req.tz);
    res.json({ success: true, tasks });
});

module.exports = { getQuickTasks, createQuickTask, updateQuickTask, deleteQuickTask, useQuickTask, spawnRecurring };
