const Task = require('../models/Task');
const { asyncHandler } = require('../utils/errors');

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
    res.json(await Task.getStats(req.user.id, req.tz));
});

module.exports = { getXp, getStats };
