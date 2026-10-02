const admin = require('../services/adminService');
const { asyncHandler, badRequest } = require('../utils/errors');

const int = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const listTables = asyncHandler(async (req, res) => {
    res.json({ tables: await admin.listTables() });
});

function parseFilters(raw) {
    if (!raw) return [];
    let parsed;
    try { parsed = JSON.parse(raw); } catch (error) { throw badRequest('filters must be JSON'); }
    if (!Array.isArray(parsed) || parsed.length > 20) throw badRequest('filters must be a list of at most 20 entries');
    return parsed;
}

const getRows = asyncHandler(async (req, res) => {
    res.json(await admin.getRows(req.params.table, {
        limit: int(req.query.limit, 5000),
        q: String(req.query.q || '').slice(0, 100),
        filters: parseFilters(req.query.filters),
        sort: String(req.query.sort || ''),
        dir: req.query.dir === 'desc' ? 'desc' : 'asc'
    }));
});

const getCell = asyncHandler(async (req, res) => {
    res.json({ value: await admin.getCell(req.params.table, req.params.key, String(req.query.column || '')) });
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

module.exports = { listTables, getRows, getCell, updateCell, deleteRow, getLogs, getAnalytics };
