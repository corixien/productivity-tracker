const User = require('../models/User');
const { asyncHandler, notFound } = require('../utils/errors');

async function readSettings(userId) {
    const user = await User.findById(userId);
    if (!user) throw notFound('User not found');
    const profile = await User.getUserProfile(userId);
    const goals = profile?.five_year_goal || user.goals || '';
    return {
        language: user.language,
        fiveYearGoal: goals,
        goals,
        dailyGoalXp: user.daily_goal_xp,
        productivityPreferences: profile?.productivity_preferences || {}
    };
}

const getSettings = asyncHandler(async (req, res) => {
    res.json(await readSettings(req.user.id));
});

const updateSettings = asyncHandler(async (req, res) => {
    const current = await User.getUserProfile(req.user.id);
    await User.updateSettings(req.user.id, {
        productivityPreferences: req.body.productivityPreferences !== undefined
            ? req.body.productivityPreferences
            : current?.productivity_preferences || {},
        language: req.body.language,
        dailyGoalXp: req.body.dailyGoalXp
    });
    if (req.body.goals !== undefined) {
        await User.updateGoals(req.user.id, req.body.goals);
    }
    res.json(await readSettings(req.user.id));
});

module.exports = { getSettings, updateSettings };
