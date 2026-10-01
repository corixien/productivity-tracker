const { query, transaction } = require('../utils/database');
const { hashPassword, verifyPassword, isLegacyPasswordHash } = require('../utils/password');
const { logSystemEvent, logError } = require('../services/loggingService');
const { getRankMultiplier, computePositionMultiplier } = require('../services/rankService');
const { warnOnError } = require('../utils/errors');

// Any object with .query(text, params): the pool wrapper by default, or a transaction client.
const defaultDb = { query };

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

// Lightweight lookup for per-request authentication (no avatar blob, no profile join).
async function findAuthById(id) {
    const result = await query('SELECT id, username, token_version FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
}

async function findByUsernameOrId(identifier) {
    if (/^[0-9a-f-]{36}$/i.test(identifier)) {
        return findById(identifier);
    }
    return findByUsername(identifier);
}

async function create(username, password) {
    const passwordHash = await hashPassword(password);
    const user = await transaction(async (client) => {
        const userResult = await client.query(
            `INSERT INTO users (username, password_hash, xp, level, rank, language, avatar_url, goals, created_at, updated_at)
             VALUES ($1, $2, 0, 0, 'Newcomer', 'en', NULL, '', NOW(), NOW())
             RETURNING *`,
            [username, passwordHash]
        );
        const created = userResult.rows[0];
        await client.query(
            `INSERT INTO profiles (user_id, five_year_goal, productivity_preferences, created_at, updated_at)
             VALUES ($1, '', '{}'::jsonb, NOW(), NOW())`,
            [created.id]
        );
        return created;
    });
    await logSystemEvent('info', 'User registered', {
        event: 'user_registered',
        user_id: user.id,
        username
    });
    return normalizeUser(user);
}

async function update(id, updates) {
    if (updates.goals !== undefined) {
        await updateGoals(id, updates.goals);
        updates = { ...updates };
        delete updates.goals;
    }

    const allowedFields = ['language', 'daily_goal_xp'];
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
    const result = await query(
        'UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [newUsername, id]
    );
    return normalizeUser(result.rows[0]);
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
    const userUpdates = {};
    if (settings.language) userUpdates.language = settings.language;
    if (settings.dailyGoalXp !== undefined) userUpdates.daily_goal_xp = settings.dailyGoalXp;
    if (Object.keys(userUpdates).length > 0) await update(id, userUpdates);
    return result.rows[0];
}

// Changing the password bumps token_version, which invalidates every previously issued JWT.
async function updatePassword(id, newPassword) {
    const passwordHash = await hashPassword(newPassword);
    const result = await query(
        `UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = NOW()
         WHERE id = $2 RETURNING id, username, token_version`,
        [passwordHash, id]
    );
    return result.rows[0] || null;
}

async function verifyCredentials(username, password) {
    const user = await findByUsername(username);
    if (!user || !await verifyPassword(password, user.password_hash)) return null;
    if (isLegacyPasswordHash(user.password_hash)) {
        const upgraded = await hashPassword(password);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [upgraded, user.id])
            .catch(warnOnError('verifyCredentials.rehash'));
    }
    return user;
}

async function getFriends(userId, db = defaultDb) {
    const result = await db.query(
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

// Rank among the user and their friends, computed in SQL.
async function getPositionMultiplier(userId, xp, db = defaultDb) {
    const userXp = xp || 0;
    const result = await db.query(
        `SELECT COUNT(*)::int AS friends, COUNT(*) FILTER (WHERE u.xp < $2)::int AS lower
         FROM friends f JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = $1`,
        [userId, userXp]
    );
    const { friends, lower } = result.rows[0];
    return computePositionMultiplier(lower, friends + 1);
}

function combineMultipliers(positionMultiplier, rankMultiplier) {
    return Math.round((positionMultiplier - (1 - rankMultiplier)) * 100) / 100;
}

async function recalculateMultiplier(userId, force = false, db = defaultDb) {
    const userResult = await db.query('SELECT rank, xp, last_multiplier_check FROM users WHERE id = $1', [userId]);
    if (!userResult.rows[0]) return null;

    if (!force) {
        const lastCheck = userResult.rows[0].last_multiplier_check;
        if (lastCheck && (Date.now() - new Date(lastCheck).getTime() < 60000)) {
            return null;
        }
    }

    const { rank, xp } = userResult.rows[0];
    const rankMultiplier = getRankMultiplier(rank);
    const positionMultiplier = await getPositionMultiplier(userId, xp, db);
    const combined = combineMultipliers(positionMultiplier, rankMultiplier);

    await db.query(
        `UPDATE users SET multiplier = $1, position_based_multiplier = $2, rank_based_multiplier = $3,
             tasks_completed = (SELECT COUNT(*) FROM tasks WHERE user_id = $5 AND completed = true),
             last_multiplier_check = NOW(), updated_at = NOW()
         WHERE id = $4`,
        [combined, positionMultiplier, rankMultiplier, userId, userId]
    );
    return combined;
}

async function monitorMultipliers(maxAgeMinutes = 5) {
    const staleUsers = await query(
        `SELECT id, username, multiplier, position_based_multiplier, rank_based_multiplier, xp, rank, last_multiplier_check
         FROM users WHERE last_multiplier_check < NOW() - make_interval(mins => $1) LIMIT 200`,
        [maxAgeMinutes]
    );

    const discrepancies = [];
    for (const user of staleUsers.rows) {
        const currentRankMultiplier = getRankMultiplier(user.rank);
        const currentPositionMultiplier = await getPositionMultiplier(user.id, user.xp);
        const expectedCombined = combineMultipliers(currentPositionMultiplier, currentRankMultiplier);

        if (Math.abs((user.multiplier || 0) - expectedCombined) > 0.01) {
            discrepancies.push({
                userId: user.id,
                username: user.username,
                storedMultiplier: user.multiplier,
                expectedMultiplier: expectedCombined,
                storedPosition: user.position_based_multiplier,
                expectedPosition: currentPositionMultiplier,
                storedRank: user.rank_based_multiplier,
                expectedRank: currentRankMultiplier,
                lastCheck: user.last_multiplier_check,
                severity: Math.abs((user.multiplier || 0) - expectedCombined) > 0.5 ? 'high' : 'medium'
            });
        }

        await recalculateMultiplier(user.id, true).catch(warnOnError('monitorMultipliers.recalculate'));
    }

    if (discrepancies.length > 0) {
        await logError(new Error('Multiplier discrepancies detected'), {
            context: 'monitorMultipliers',
            count: discrepancies.length,
            discrepancies
        });
    }

    return discrepancies;
}

// The server sleeps on the free tier, so there is no reliable timer: run the audit
// opportunistically from request handlers, at most once per interval.
let lastMonitorRun = 0;
function monitorMultipliersThrottled(intervalMs = 5 * 60 * 1000) {
    const now = Date.now();
    if (now - lastMonitorRun < intervalMs) return;
    lastMonitorRun = now;
    monitorMultipliers(5).catch(warnOnError('monitorMultipliersThrottled'));
}

// Friend-group leaderboard (self + friends) in one query.
// period 'week' ranks by XP earned since Monday 00:00 in the user's timezone.
async function getLeaderboard(userId, period, tz) {
    const result = await query(
        `WITH members AS (
             SELECT id FROM users WHERE id = $1
             UNION
             SELECT friend_id FROM friends WHERE user_id = $1
         ), week AS (
             SELECT user_id, GREATEST(0, SUM(xp_amount))::int AS xp
             FROM xp_history
             WHERE user_id IN (SELECT id FROM members)
               AND created_at >= date_trunc('week', NOW() AT TIME ZONE $2) AT TIME ZONE $2
             GROUP BY user_id
         )
         SELECT u.id, u.username, u.avatar_url AS avatar, u.xp, u.level, u.rank,
                u.tasks_completed AS tasks, COALESCE(w.xp, 0) AS week_xp,
                (u.id = $1) AS is_self
         FROM users u
         JOIN members m ON m.id = u.id
         LEFT JOIN week w ON w.user_id = u.id
         ORDER BY ${period === 'week' ? 'COALESCE(w.xp, 0)' : 'u.xp'} DESC, u.username ASC`,
        [userId, tz]
    );
    return result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        avatar: row.avatar || null,
        xp: row.xp || 0,
        level: row.level || 0,
        rank: row.rank,
        tasks: row.tasks || 0,
        weekXp: row.week_xp,
        score: period === 'week' ? row.week_xp : row.xp || 0,
        isSelf: row.is_self,
        friendId: row.is_self ? null : row.id
    }));
}

module.exports = {
    findByUsername,
    findById,
    findAuthById,
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
    combineMultipliers,
    recalculateMultiplier,
    monitorMultipliers,
    monitorMultipliersThrottled,
    getLeaderboard
};
