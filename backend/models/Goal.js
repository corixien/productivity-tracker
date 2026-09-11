const { query } = require('../utils/database');

async function findByUserId(userId) {
    const result = await query(
        'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at',
        [userId]
    );
    return result.rows;
}

async function findById(id) {
    const result = await query('SELECT * FROM goals WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function create(userId, goalData) {
    const { title, description, target_date, category } = goalData;
    const result = await query(
        `INSERT INTO goals (user_id, title, description, target_date, category, completed, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
         RETURNING *`,
        [userId, title, description || '', target_date || null, category || 'personal']
    );
    return result.rows[0];
}

async function update(id, userId, updates) {
    const allowedFields = ['title', 'description', 'target_date', 'category', 'completed'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            setClause.push(`${field} = $${paramIndex}`);
            values.push(updates[field]);
            paramIndex++;
        }
    }

    if (setClause.length === 0) {
        return findById(id);
    }

    setClause.push(`updated_at = NOW()`);
    values.push(id);
    values.push(userId);

    const result = await query(
        `UPDATE goals SET ${setClause.join(', ')} WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`,
        values
    );
    return result.rows[0] || null;
}

async function deleteGoal(id, userId) {
    const result = await query(
        'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
    );
    return result.rows[0] || null;
}

async function getActiveCount(userId) {
    const result = await query(
        'SELECT COUNT(*) as count FROM goals WHERE user_id = $1 AND completed = false',
        [userId]
    );
    return parseInt(result.rows[0].count, 10);
}

module.exports = {
    findByUserId,
    findById,
    create,
    update,
    delete: deleteGoal,
    getActiveCount
};