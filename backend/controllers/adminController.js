const admin = require('../services/adminService');
const { asyncHandler, badRequest } = require('../utils/errors');

const int = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const listTables = asyncHandler(async (req, res) => {
    res.json({ tables: await admin.listTables() });
});

const getRows = asyncHandler(async (req, res) => {
    res.json(await admin.getRows(req.params.table, {
        limit: int(req.query.limit, 50),
        offset: int(req.query.offset, 0),
        q: String(req.query.q || '').slice(0, 100)
    }));
});

const updateCell = asyncHandler(async (req, res) => {
    const { column, value } = req.body;
    if (typeof column !== 'string') throw badRequest('column is required');
    res.json({ row: await admin.updateCell(req.user, req.params.table, req.params.key, column, value) });
});

const deleteRow = asyncHandler(async (req, res) => {
    await admin.deleteRow(req.user, req.params.table, req.params.key);
    res.json({ success: true });
});

const listAvatars = asyncHandler(async (req, res) => {
    res.json({ avatars: await admin.listAvatars() });
});

const removeAvatar = asyncHandler(async (req, res) => {
    await admin.removeAvatar(req.user, req.params.userId);
    res.json({ success: true });
});

const getLogs = asyncHandler(async (req, res) => {
    const { q, level, category, user, before } = req.query;
    res.json({
        logs: await admin.getLogs({
            limit: int(req.query.limit, 100),
            q: String(q || '').slice(0, 100),
            level: ['info', 'warn', 'error'].includes(level) ? level : '',
            category: /^[a-z]+$/.test(category || '') ? category : '',
            user: String(user || '').slice(0, 30),
            before: /^\d+$/.test(before || '') ? before : ''
        })
    });
});

const getAnalytics = asyncHandler(async (req, res) => {
    res.json(await admin.getAnalytics());
});

module.exports = { listTables, getRows, updateCell, deleteRow, listAvatars, removeAvatar, getLogs, getAnalytics };
