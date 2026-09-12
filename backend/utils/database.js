const { Pool } = require('pg');
const { logger } = require('./logger');
const { getDatabaseConfig } = require('../config');

let pool = null;

function getPool() {
    if (!pool) {
        const config = getDatabaseConfig();
        const poolConfig = {
            ...config,
            max: Number(process.env.DATABASE_POOL_MAX || 10),
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 3000,
            application_name: 'productivity-tracker',
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000
        };
        // Prevent queries from hanging forever if the database is unresponsive.
        if (!poolConfig.options) {
            poolConfig.options = '-c statement_timeout=10000';
        } else if (!poolConfig.options.includes('statement_timeout')) {
            poolConfig.options += ' -c statement_timeout=10000';
        }
        pool = new Pool(poolConfig);
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
