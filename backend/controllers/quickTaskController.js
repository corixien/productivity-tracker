const QuickTask = require('../models/QuickTask');
const { logActivity } = require('../services/loggingService');
const { asyncHandler, notFound } = require('../utils/errors');

const getQuickTasks = asyncHandler(async (req, res) => {
    res.json(await QuickTask.findByUserId(req.user.id));
});

const createQuickTask = asyncHandler(async (req, res) => {
    const template = await QuickTask.create(req.user.id, req.body);
    await logActivity({ userId: req.user.id, action: 'template.create', message: `Saved template "${template.name}"`, meta: { templateId: template.id } });
    res.status(201).json(template);
});

const updateQuickTask = asyncHandler(async (req, res) => {
    const template = await QuickTask.update(req.params.id, req.user.id, req.body);
    if (!template) throw notFound('Quick task not found');
    res.json(template);
});

const deleteQuickTask = asyncHandler(async (req, res) => {
    if (!await QuickTask.remove(req.params.id, req.user.id)) throw notFound('Quick task not found');
    await logActivity({ userId: req.user.id, action: 'template.delete', message: 'Deleted a template', meta: { templateId: req.params.id } });
    res.json({ success: true });
});

const useQuickTask = asyncHandler(async (req, res) => {
    const task = await QuickTask.createTaskFrom(req.params.id, req.user.id);
    if (!task) throw notFound('Quick task not found');
    await logActivity({ userId: req.user.id, action: 'template.use', message: `Added task "${task.name}" from template`, meta: { templateId: req.params.id, taskId: task.id } });
    res.status(201).json(task);
});

module.exports = { getQuickTasks, createQuickTask, updateQuickTask, deleteQuickTask, useQuickTask };
