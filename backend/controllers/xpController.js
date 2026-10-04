const Task = require('../models/Task');
const { awardWeeklyTrophies, getRecentTrophy } = require('../services/bonusService');
const { asyncHandler, warnOnError } = require('../utils/errors');

const getXp = asyncHandler(async (req, res) => {
    const { rows, hasMore } = await Task.getXpHistory(req.user.id, {
        limit: req.query.limit,
        offset: req.query.offset
    });
    res.json({
        userId: req.user.id,
        total: await Task.getTotalXp(req.user.id),
        history: rows,
        hasMore
    });
});

const getStats = asyncHandler(async (req, res) => {
    await awardWeeklyTrophies().catch(warnOnError('xp.trophies'));
    const [stats, trophy] = await Promise.all([Task.getStats(req.user.id, req.tz), getRecentTrophy(req.user.id)]);
    res.json({ ...stats, trophy });
});

module.exports = { getXp, getStats };
