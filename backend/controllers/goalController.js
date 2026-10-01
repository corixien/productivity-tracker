const Goal = require('../models/Goal');
const { asyncHandler, notFound } = require('../utils/errors');

const getGoals = asyncHandler(async (req, res) => {
    res.json(await Goal.findByUserId(req.user.id));
});

const createGoal = asyncHandler(async (req, res) => {
    res.status(201).json(await Goal.create(req.user.id, req.body));
});

const updateGoal = asyncHandler(async (req, res) => {
    const goal = await Goal.update(req.params.id, req.user.id, req.body);
    if (!goal) throw notFound('Goal not found');
    res.json(goal);
});

const deleteGoal = asyncHandler(async (req, res) => {
    const goal = await Goal.delete(req.params.id, req.user.id);
    if (!goal) throw notFound('Goal not found');
    res.json({ success: true });
});

const getGoalsCount = asyncHandler(async (req, res) => {
    res.json({ count: await Goal.getActiveCount(req.user.id) });
});

module.exports = { getGoals, createGoal, updateGoal, deleteGoal, getGoalsCount };
