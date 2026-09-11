const { Pool } = require('pg');
const { logger } = require('./logger');
const { getDatabaseConfig } = require('../config');

let pool = null;

function getPool() {
    if (!pool) {
        const config = getDatabaseConfig();
        pool = new Pool({
            ...config,
            max: Number(process.env.DATABASE_POOL_MAX || 20),
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            application_name: 'productivity-tracker'
        });
        pool.on('error', (error) => {
            logger.error('Unexpected database pool error', { error: error.message });
        });
        logger.info('Database pool initialized');
    }
    return pool;
}

async function query(text, params = []) {
    const activePool = getPool();
    const startedAt = Date.now();
    try {
        const result = await activePool.query(text, params);
        logger.debug('Database query completed', {
            duration_ms: Date.now() - startedAt,
            row_count: result.rowCount
        });
        return result;
    } catch (error) {
        logger.error('Database query failed', {
            duration_ms: Date.now() - startedAt,
            error: error.message
        });
        throw error;
    }
}

async function transaction(callback) {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            logger.error('Database transaction rollback failed', { error: rollbackError.message });
        }
        throw error;
    } finally {
        client.release();
    }
}

async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        logger.info('Database pool closed');
    }
}

module.exports = { getPool, query, transaction, closePool };
