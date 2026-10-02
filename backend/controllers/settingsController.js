const User = require('../models/User');
const { logActivity } = require('../services/loggingService');
const { asyncHandler, notFound } = require('../utils/errors');

async function readSettings(userId) {
    const user = await User.findById(userId);
    if (!user) throw notFound('User not found');
    return { language: user.language, goals: user.goals || '', dailyGoalXp: user.daily_goal_xp };
}

const getSettings = asyncHandler(async (req, res) => {
    res.json(await readSettings(req.user.id));
});

const updateSettings = asyncHandler(async (req, res) => {
    const { language, goals, dailyGoalXp } = req.body;
    await User.update(req.user.id, { language, goals, daily_goal_xp: dailyGoalXp });
    const changed = [language !== undefined && 'language', goals !== undefined && 'goals', dailyGoalXp !== undefined && 'daily goal'].filter(Boolean);
    if (changed.length) {
        await logActivity({
            userId: req.user.id, action: goals !== undefined ? 'profile.goals' : 'profile.settings',
            message: `Changed ${changed.join(', ')}`, meta: { language, dailyGoalXp, goalsLength: goals === undefined ? undefined : goals.length }
        });
    }
    res.json(await readSettings(req.user.id));
});

module.exports = { getSettings, updateSettings };
