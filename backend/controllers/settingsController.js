const User = require('../models/User');
const { logError } = require('../services/loggingService');

async function getSettings(req, res) {
    try {
        const user = await User.findById(req.user.id);
        const profile = await User.getUserProfile(req.user.id);
        return res.json({
            language: user.language,
            fiveYearGoal: profile?.five_year_goal || profile?.goals || user.goals || '',
            goals: profile?.five_year_goal || profile?.goals || user.goals || '',
            productivityPreferences: profile?.productivity_preferences || {}
        });
    } catch (error) {
        await logError(error, { context: 'getSettings', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to get settings' });
    }
}

async function updateSettings(req, res) {
    try {
        const current = await User.getUserProfile(req.user.id);
        const productivityPreferences = req.body.productivityPreferences !== undefined
            ? req.body.productivityPreferences
            : current?.productivity_preferences || {};

        const settings = {
            ...req.body,
            productivityPreferences
        };

        await User.updateSettings(req.user.id, settings);
        if (req.body.fiveYearGoal !== undefined || req.body.goals !== undefined) {
            await User.updateGoals(req.user.id, req.body.fiveYearGoal ?? req.body.goals);
        }
        const user = await User.findById(req.user.id);
        const profile = await User.getUserProfile(req.user.id);
        return res.json({
            language: user.language,
            fiveYearGoal: profile?.five_year_goal || '',
            goals: profile?.five_year_goal || '',
            productivityPreferences: profile?.productivity_preferences || {}
        });
    } catch (error) {
        await logError(error, { context: 'updateSettings', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
}

module.exports = { getSettings, updateSettings };
