const { query, transaction } = require('../utils/database');
const Task = require('./Task');

const COLUMNS = 'id, name, duration, productivity, difficulty, category, bonus, recurrence, last_spawned_on';
const EDITABLE_FIELDS = ['name', 'duration', 'productivity', 'difficulty', 'category', 'bonus', 'recurrence'];

async function findByUserId(userId) {
    const result = await query(
        `SELECT ${COLUMNS} FROM quick_tasks WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
    );
    return result.rows;
}

async function findOwned(id, userId) {
    const result = await query(
        `SELECT ${COLUMNS} FROM quick_tasks WHERE id = $1 AND user_id = $2`,
        [id, userId]
    );
    return result.rows[0] || null;
}

async function create(userId, data) {
    const result = await query(
        `INSERT INTO quick_tasks (user_id, name, duration, productivity, difficulty, category, bonus, recurrence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
        [userId, data.name, data.duration, data.productivity, data.difficulty, data.category, data.bonus, data.recurrence]
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
        `UPDATE quick_tasks SET ${setClause.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING ${COLUMNS}`,
        values
    );
    return result.rows[0] || null;
}

async function remove(id, userId) {
    const result = await query('DELETE FROM quick_tasks WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    return Boolean(result.rows[0]);
}

// Creates a pending task from a template (XP computed server-side).
async function createTaskFrom(id, userId) {
    const template = await findOwned(id, userId);
    if (!template) return null;
    return Task.create(userId, template);
}

// Creates one pending task per due recurring template (daily: once per local day,
// weekly: once per 7 days). Marking and creation share a transaction, so a template
// is never marked spawned without its task. A template is skipped while a pending
// task with the same name still exists.
async function spawnRecurring(userId, tz) {
    return transaction(async (client) => {
        const due = await client.query(
            `UPDATE quick_tasks SET last_spawned_on = (NOW() AT TIME ZONE $2)::date
             WHERE user_id = $1 AND recurrence <> 'none' AND (
                 last_spawned_on IS NULL
                 OR (recurrence = 'daily' AND last_spawned_on < (NOW() AT TIME ZONE $2)::date)
                 OR (recurrence = 'weekly' AND last_spawned_on <= (NOW() AT TIME ZONE $2)::date - 7)
             )
             RETURNING ${COLUMNS}`,
            [userId, tz]
        );
        const created = [];
        for (const template of due.rows) {
            const existing = await client.query(
                'SELECT 1 FROM tasks WHERE user_id = $1 AND completed = false AND LOWER(name) = LOWER($2) LIMIT 1',
                [userId, template.name]
            );
            if (existing.rows.length > 0) continue;
            created.push(await Task.create(userId, template, client));
        }
        return created;
    });
}

module.exports = { findByUserId, findOwned, create, update, remove, createTaskFrom, spawnRecurring };
