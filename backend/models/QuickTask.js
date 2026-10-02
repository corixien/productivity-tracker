const { query } = require('../utils/database');
const Task = require('./Task');

const COLUMNS = 'id, name, duration, productivity, difficulty, category, bonus';
const EDITABLE_FIELDS = ['name', 'duration', 'productivity', 'difficulty', 'category', 'bonus'];

async function findByUserId(userId) {
    const result = await query(
        `SELECT ${COLUMNS} FROM templates WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
    );
    return result.rows;
}

async function findOwned(id, userId) {
    const result = await query(
        `SELECT ${COLUMNS} FROM templates WHERE id = $1 AND user_id = $2`,
        [id, userId]
    );
    return result.rows[0] || null;
}

async function create(userId, data) {
    const result = await query(
        `INSERT INTO templates (user_id, name, duration, productivity, difficulty, category, bonus)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
        [userId, data.name, data.duration, data.productivity, data.difficulty, data.category, data.bonus]
    );
    return result.rows[0];
}

async function update(id, userId, updates) {
    const setClause = [];
    const values = [];
    for (const field of EDITABLE_FIELDS) {
        if (updates[field] !== undefined) {
            values.push(updates[field]);
            setClause.push(`${field} = $${values.length}`);
        }
    }
    if (setClause.length === 0) return findOwned(id, userId);
    values.push(id, userId);
    const result = await query(
        `UPDATE templates SET ${setClause.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING ${COLUMNS}`,
        values
    );
    return result.rows[0] || null;
}

async function remove(id, userId) {
    const result = await query('DELETE FROM templates WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    return Boolean(result.rows[0]);
}

// Creates a pending task from a template (XP computed server-side).
async function createTaskFrom(id, userId) {
    const template = await findOwned(id, userId);
    if (!template) return null;
    return Task.create(userId, template);
}

module.exports = { findByUserId, findOwned, create, update, remove, createTaskFrom };
