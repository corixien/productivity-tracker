const Task = require('../models/Task');
const { logError } = require('../services/loggingService');

async function getXp(req, res) {
    try {
        return res.json({
            userId: req.user.id,
            total: await Task.getTotalXp(req.user.id),
            history: await Task.getXpHistory(req.user.id, {
                limit: req.query.limit,
                offset: req.query.offset
            })
        });
    } catch (error) {
        await logError(error, { context: 'getXp', userId: req.user.id });
        return res.status(500).json({ success: false, error: 'Failed to get XP data' });
    }
}

module.exports = { getXp };
