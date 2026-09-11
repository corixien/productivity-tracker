const Goal = require('../models/Goal');
const { logError } = require('../services/loggingService');

async function getGoals(req, res) {
    try {
        return res.json(await Goal.findByUserId(req.user.id));
    } catch (error) {
        await logError(error, { context: 'getGoals', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to get goals' });
    }
}

async function createGoal(req, res) {
    try {
        return res.status(201).json(await Goal.create(req.user.id, req.body));
    } catch (error) {
        await logError(error, { context: 'createGoal', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to create goal' });
    }
}

async function updateGoal(req, res) {
    try {
        const goal = await Goal.update(req.params.id, req.user.id, req.body);
        if (!goal) return res.status(404).json({ success: false, error: 'Goal not found' });
        return res.json(goal);
    } catch (error) {
        await logError(error, { context: 'updateGoal', goalId: req.params.id });
        return res.status(500).json({ success: false, error: 'Failed to update goal' });
    }
}

async function deleteGoal(req, res) {
    try {
        const goal = await Goal.delete(req.params.id, req.user.id);
        if (!goal) return res.status(404).json({ success: false, error: 'Goal not found' });
        return res.json({ success: true });
    } catch (error) {
        await logError(error, { context: 'deleteGoal', goalId: req.params.id });
        return res.status(500).json({ success: false, error: 'Failed to delete goal' });
    }
}

async function getGoalsCount(req, res) {
    try {
        return res.json({ count: await Goal.getActiveCount(req.user.id) });
    } catch (error) {
        await logError(error, { context: 'getGoalsCount', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to get goals count' });
    }
}

module.exports = {
    getGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    getGoalsCount
};
