const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../data/app.db');
const SALT_ROUNDS = 12;

async function getPgPool() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL not set');
    }
    return new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
}

function getSqliteDb() {
    return new sqlite3.Database(SQLITE_DB_PATH, sqlite3.OPEN_READONLY);
}

function sqliteAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function migrateUsers(sqliteDb, pgPool) {
    console.log('Migrating users...');
    const users = await sqliteAll(sqliteDb, 'SELECT * FROM users');

    for (const user of users) {
        let passwordHash = user.password_hash;

        if (passwordHash && passwordHash.length === 64 && /^[a-f0-9]+$/i.test(passwordHash)) {
            passwordHash = await bcrypt.hash('migrate_temp_' + user.username, SALT_ROUNDS);
            console.log(`  Note: User ${user.username} had SHA-256 hash, set to bcrypt hash of temporary password`);
        }

        await pgPool.query(
            `INSERT INTO users (id, username, password_hash, xp, level, rank, language, avatar_url, goals, created_at, updated_at)
             VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (username) DO UPDATE SET
                 password_hash = EXCLUDED.password_hash,
                 xp = EXCLUDED.xp,
                 level = EXCLUDED.level,
                 rank = EXCLUDED.rank,
                 language = EXCLUDED.language,
                 avatar_url = EXCLUDED.avatar_url,
                 goals = EXCLUDED.goals,
                 updated_at = NOW()`,
            [
                user.username,
                passwordHash,
                user.xp || 0,
                user.level || 0,
                user.rank || 'Newcomer',
                user.language || 'en',
                user.avatar || null,
                user.goals || '',
                user.created_at || new Date().toISOString()
            ]
        );
    }
    console.log(`  Migrated ${users.length} users`);
}

async function migrateTasks(sqliteDb, pgPool) {
    console.log('Migrating tasks...');
    const tasks = await sqliteAll(sqliteDb, 'SELECT * FROM tasks');

    for (const task of tasks) {
        const owner = await pgPool.query('SELECT id FROM users WHERE username = $1', [task.user_id]);
        if (owner.rows.length === 0) {
            console.log(`  Skipping task owned by unknown user: ${task.user_id}`);
            continue;
        }

        await pgPool.query(
            `INSERT INTO tasks (id, user_id, task_text, name, ai_score, xp_awarded, completed, duration, productivity, difficulty, category, bonus, created_at, completed_at)
             VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT DO NOTHING`,
            [
                owner.rows[0].id,
                task.name,
                task.name,
                0,
                task.xp || 0,
                task.completed === 1 || task.completed === true,
                task.duration || null,
                task.productivity || 0,
                task.difficulty || 3,
                task.category || 'other',
                task.offline_bonus || task.bonus || 0,
                task.created_at || new Date().toISOString(),
                task.completed_at || null
            ]
        );
    }
    console.log(`  Migrated ${tasks.length} tasks`);
}

async function migrateFriends(sqliteDb, pgPool) {
    console.log('Migrating friends...');
    const users = await sqliteAll(sqliteDb, 'SELECT id, username, friends FROM users');

    let friendCount = 0;
    for (const user of users) {
        let friends = [];
        try {
            friends = JSON.parse(user.friends || '[]');
        } catch (e) {
            continue;
        }

        const currentUser = await pgPool.query('SELECT id FROM users WHERE username = $1', [user.username]);
        if (currentUser.rows.length === 0) continue;

        for (const friend of friends) {
            const friendUser = await pgPool.query('SELECT id FROM users WHERE username = $1', [friend.username]);
            if (friendUser.rows.length === 0) continue;

            await pgPool.query(
                `INSERT INTO friends (user_id, friend_id, added_at)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, friend_id) DO NOTHING`,
                [currentUser.rows[0].id, friendUser.rows[0].id, friend.addedAt || new Date().toISOString()]
            );
            friendCount++;
        }
    }
    console.log(`  Migrated ${friendCount} friend relationships`);
}

async function migrateXpHistory(pgPool) {
    console.log('Migrating XP history...');
    const tasks = await pgPool.query('SELECT id, user_id, xp_awarded FROM tasks WHERE completed = true AND xp_awarded > 0');

    let count = 0;
    for (const task of tasks.rows) {
        await pgPool.query(
            `INSERT INTO xp_history (user_id, xp_amount, source, source_id, created_at)
             VALUES ($1, $2, 'task', $3, NOW())
             ON CONFLICT DO NOTHING`,
            [task.user_id, task.xp_awarded, task.id]
        );
        count++;
    }
    console.log(`  Created ${count} XP history entries`);
}

async function runMigration() {
    console.log('Starting SQLite to PostgreSQL migration...');

    const sqliteDb = getSqliteDb();
    const pgPool = await getPgPool();

    try {
        await migrateUsers(sqliteDb, pgPool);
        await migrateTasks(sqliteDb, pgPool);
        await migrateFriends(sqliteDb, pgPool);
        await migrateXpHistory(pgPool);

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    } finally {
        sqliteDb.close();
        await pgPool.end();
    }
}

if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { runMigration };
