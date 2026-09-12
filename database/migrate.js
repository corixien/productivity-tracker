const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function getPool() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set');
    }
    return new Pool({
        connectionString,
        ssl: process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
            : false
    });
}

async function ensureMigrationsTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);
}

async function getAppliedMigrations(pool) {
    const result = await pool.query('SELECT filename FROM schema_migrations ORDER BY id');
    return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(pool, filename) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filepath, 'utf8');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`Applied migration: ${filename}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function runMigrations() {
    const pool = await getPool();
    try {
        await ensureMigrationsTable(pool);
        const applied = await getAppliedMigrations(pool);
        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter((file) => file.endsWith('.sql'))
            .sort();
        for (const file of files) {
            if (applied.has(file)) {
                console.log(`Skipping already applied migration: ${file}`);
            } else {
                await applyMigration(pool, file);
            }
        }
        console.log('All migrations completed successfully');
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    runMigrations()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = { runMigrations };
