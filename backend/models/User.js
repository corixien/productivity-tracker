const { query, transaction } = require('../utils/database');
const { hashPassword, verifyPassword } = require('../utils/password');
const { logSystemEvent } = require('../services/loggingService');
const { getRankMultiplier } = require('../services/rankService');

const USER_WITH_PROFILE = `
    SELECT
        u.*,
        p.five_year_goal AS goals,
        p.productivity_preferences,
        u.avatar_url AS avatar
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
`;

function normalizeUser(user) {
    if (!user) return null;
    return {
        ...user,
        avatar: user.avatar || user.avatar_url || null
    };
}

async function findByUsername(username) {
    const result = await query(`${USER_WITH_PROFILE} WHERE LOWER(u.username) = LOWER($1)`, [username]);
    return normalizeUser(result.rows[0]);
}

async function findById(id) {
    const result = await query(`${USER_WITH_PROFILE} WHERE u.id = $1`, [id]);
    return normalizeUser(result.rows[0]);
}

async function findByUsernameOrId(identifier) {
    if (/^[0-9a-f-]{36}$/i.test(identifier)) {
        return findById(identifier);
    }
    return findByUsername(identifier);
}

async function create(username, password) {
    return transaction(async (client) => {
        const passwordHash = await hashPassword(password);
        const userResult = await client.query(
            `INSERT INTO users (username, password_hash, xp, level, rank, language, avatar_url, goals, created_at, updated_at)
             VALUES ($1, $2, 0, 0, 'Newcomer', 'en', NULL, '', NOW(), NOW())
             RETURNING *`,
            [username, passwordHash]
        );
        const user = userResult.rows[0];
        await client.query(
            `INSERT INTO profiles (user_id, five_year_goal, productivity_preferences, created_at, updated_at)
             VALUES ($1, '', '{}'::jsonb, NOW(), NOW())`,
            [user.id]
        );
        return user;
    }).then(async (user) => {
        await logSystemEvent('info', 'User registered', {
            event: 'user_registered',
            user_id: user.id,
            username
        });
        return normalizeUser(user);
    });
}

async function update(id, updates) {
    if (updates.goals !== undefined) {
        await updateGoals(id, updates.goals);
        updates = { ...updates };
        delete updates.goals;
    }

    const allowedFields = ['username', 'language', 'avatar_url'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (updates[field] !== undefined) {
            setClause.push(`${field} = $${paramIndex}`);
            values.push(updates[field]);
            paramIndex += 1;
        }
    }

    if (setClause.length === 0) return findById(id);

    values.push(id);
    const result = await query(
        `UPDATE users SET ${setClause.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
        values
    );
    return normalizeUser(result.rows[0]);
}

async function updateAvatar(userId, avatarUrl) {
    const result = await query(
        'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [avatarUrl, userId]
    );
    return result.rows[0];
}

async function changeUsername(id, newUsername) {
    return transaction(async (client) => {
        const result = await client.query(
            'UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [newUsername, id]
        );
        return normalizeUser(result.rows[0]);
    });
}

async function updateGoals(id, goals) {
    return transaction(async (client) => {
        const result = await client.query(
            `INSERT INTO profiles (user_id, five_year_goal, productivity_preferences, created_at, updated_at)
             VALUES ($1, $2, '{}'::jsonb, NOW(), NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                 five_year_goal = EXCLUDED.five_year_goal,
                 updated_at = NOW()
             RETURNING five_year_goal`,
            [id, goals]
        );
        await client.query('UPDATE users SET goals = $1, updated_at = NOW() WHERE id = $2', [goals, id]);
        return result.rows[0].five_year_goal;
    });
}

async function updateSettings(id, settings) {
    const productivityPreferences = settings.productivityPreferences || {};
    const result = await query(
        `INSERT INTO profiles (user_id, five_year_goal, productivity_preferences, created_at, updated_at)
         VALUES ($1, COALESCE((SELECT five_year_goal FROM profiles WHERE user_id = $1), ''), $2::jsonb, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
             productivity_preferences = EXCLUDED.productivity_preferences,
             updated_at = NOW()
         RETURNING *`,
        [id, JSON.stringify(productivityPreferences)]
    );
    if (settings.language) await update(id, { language: settings.language });
    return result.rows[0];
}

async function updatePassword(id, newPassword) {
    const passwordHash = await hashPassword(newPassword);
    const result = await query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
        [passwordHash, id]
    );
    return Boolean(result.rows[0]);
}

async function verifyCredentials(username, password) {
    const user = await findByUsername(username);
    if (!user || !await verifyPassword(password, user.password_hash)) return null;
    return user;
}

async function getFriends(userId) {
    const result = await query(
        `SELECT f.friend_id, f.added_at, u.username, u.avatar_url, u.avatar_url AS avatar
         FROM friends f
         JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = $1
         ORDER BY f.added_at`,
        [userId]
    );
    return result.rows;
}

async function addFriend(userId, friendId) {
    const result = await query(
        `INSERT INTO friends (user_id, friend_id, added_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, friend_id) DO NOTHING
         RETURNING *`,
        [userId, friendId]
    );
    return result.rows[0] || null;
}

async function removeFriend(userId, friendId) {
    const result = await query(
        'DELETE FROM friends WHERE user_id = $1 AND friend_id = $2 RETURNING *',
        [userId, friendId]
    );
    return result.rows[0] || null;
}

async function isFriend(userId, friendId) {
    const result = await query(
        'SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2',
        [userId, friendId]
    );
    return result.rows.length > 0;
}

async function getUserProfile(userId) {
    const result = await query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
    return result.rows[0] || null;
}

async function upsertProfile(userId, profileData) {
    const current = await getUserProfile(userId);
    const fiveYearGoal = profileData.fiveYearGoal !== undefined
        ? profileData.fiveYearGoal
        : profileData.goals !== undefined
            ? profileData.goals
            : current?.five_year_goal || current?.goals || '';
    const productivityPreferences = profileData.productivityPreferences || {};
    const result = await query(
        `INSERT INTO profiles (user_id, five_year_goal, productivity_preferences, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
             five_year_goal = EXCLUDED.five_year_goal,
             productivity_preferences = EXCLUDED.productivity_preferences,
             updated_at = NOW()
         RETURNING *`,
        [userId, fiveYearGoal, JSON.stringify(productivityPreferences)]
    );
    await query('UPDATE users SET goals = $1, updated_at = NOW() WHERE id = $2', [fiveYearGoal, userId]);
    return result.rows[0];
}

async function getPositionMultiplier(userId, xp) {
    const friends = await getFriends(userId);
    const friendIds = friends.map(f => f.friend_id);

    let friendXps = [];
    if (friendIds.length > 0) {
        const placeholders = friendIds.map((_, i) => `$${i + 1}`).join(',');
        const result = await query(
            `SELECT xp FROM users WHERE id IN (${placeholders})`,
            friendIds
        );
        friendXps = result.rows.map(r => r.xp || 0);
    }

    const entries = [...friendXps, xp || 0];
    const total = entries.length;

    if (total <= 1) return 1.0;

    const userXp = xp || 0;
    const lowerXpCount = entries.filter(x => x < userXp).length;
    const position = lowerXpCount;

    return 1.5 - (position / (total - 1)) * 0.8;
}

async function recalculateMultiplier(userId) {
    const userResult = await query('SELECT username, rank, xp FROM users WHERE id = $1', [userId]);
    if (!userResult.rows[0]) return;

    const { rank, xp } = userResult.rows[0];
    const rankMultiplier = getRankMultiplier(rank);
    const positionMultiplier = await getPositionMultiplier(userId, xp);
    const combined = Math.round((positionMultiplier + (1 - rankMultiplier)) * 100) / 100;

    await query(
        'UPDATE users SET multiplier = $1, position_based_multiplier = $2, rank_based_multiplier = $3, updated_at = NOW() WHERE id = $4',
        [combined, positionMultiplier, rankMultiplier, userId]
    );
}

module.exports = {
    findByUsername,
    findById,
    findByUsernameOrId,
    create,
    update,
    updateAvatar,
    changeUsername,
    updateGoals,
    updateSettings,
    updatePassword,
    verifyCredentials,
    getFriends,
    addFriend,
    removeFriend,
    isFriend,
    getUserProfile,
    upsertProfile,
    normalizeUser,
    getPositionMultiplier,
    recalculateMultiplier
};
