const { query } = require('../utils/database');
const Task = require('../models/Task');
const User = require('../models/User');
const { getAdminUsernames } = require('../config');
const { validateUsername } = require('../utils/validation');
const { RANK_THRESHOLDS } = require('./rankService');
const { badRequest, notFound, conflict } = require('../utils/errors');
const events = require('../utils/events');
const { logActivity } = require('./loggingService');

const SECRET_COLUMNS = new Set(['password_hash', 'token_version']);
const MAX_ROWS = 5000;
const PREVIEW_CHARS = 200;      // longer cell values are cut in lists; the full value is fetched when a cell is opened
const MAX_AVATAR_CHARS = 700000;
const FILTER_OPERATORS = new Set(['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'ILIKE', 'NOT LIKE', 'IN', 'IS NULL', 'IS NOT NULL']);
const KEY_SEPARATOR = '~';
const RANKS = RANK_THRESHOLDS.map((rank) => rank.name);

// Per-table behaviour. Tables that exist in the database but are not listed here are shown read-only.
const TABLES = {
    users: {
        pk: ['id'],
        order: 'created_at DESC',
        deletable: true,
        editable: {
            username: 'text', language: 'enum:en,de', xp: 'int:0', rank: `enum:${RANKS.join(',')}`,
            tasks_completed: 'int:0', daily_goal_xp: 'int:10:5000', goals: 'text', is_admin: 'bool', avatar_url: 'avatar'
        }
    },
    tasks: {
        pk: ['id'],
        order: 'created_at DESC',
        deletable: true,
        editable: {
            name: 'text', duration: 'int:1:1440', productivity: 'int:0:5', difficulty: 'int:1:5',
            category: 'enum:learning,exercise,creative,admin,social,deep-work,other', bonus: 'int:0', completed: 'bool'
        }
    },
    xp_history: { pk: ['id'], order: 'created_at DESC', deletable: false, editable: {} },
    friends: { pk: ['user_id', 'friend_id'], order: 'added_at DESC', deletable: true, editable: {} },
    templates: {
        pk: ['id'],
        order: 'created_at DESC',
        deletable: true,
        editable: {
            name: 'text', duration: 'int:1:1440', productivity: 'int:0:5', difficulty: 'int:1:5',
            category: 'enum:learning,exercise,creative,admin,social,deep-work,other', bonus: 'int:0'
        }
    },
    groq_logs: { pk: ['id'], order: 'created_at DESC', deletable: true, editable: {} },
    system_logs: { pk: ['id'], order: 'created_at DESC', deletable: true, editable: {} },
    user_activity: { pk: ['user_id', 'hour'], order: 'hour DESC', deletable: true, editable: {} },
    uptime_samples: { pk: ['sampled_at'], order: 'sampled_at DESC', deletable: true, editable: {} },
    schema_migrations: { pk: ['id'], order: 'id DESC', deletable: false, editable: {} }
};

/* ---- schema discovery ---- */
const configOf = (name) => TABLES[name] || { pk: ['id'], deletable: false, editable: {} };

function optionsOf(spec) {
    return spec && spec.startsWith('enum:') ? spec.slice(5).split(',') : undefined;
}

function describeColumns(name, rows) {
    const cfg = configOf(name);
    return rows
        .filter((row) => !SECRET_COLUMNS.has(row.column_name))
        .map((row) => ({
            name: row.column_name,
            type: row.data_type,
            editable: Boolean(cfg.editable[row.column_name]),
            options: optionsOf(cfg.editable[row.column_name])
        }));
}

async function listTables() {
    const [columns, tables] = await Promise.all([
        query(`SELECT table_name, column_name, data_type FROM information_schema.columns
               WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`),
        query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`)
    ]);
    const counts = await Promise.all(tables.rows.map(({ name }) => query(`SELECT COUNT(*)::int AS n FROM "${name}"`)));
    return tables.rows.map(({ name }, i) => {
        const cfg = configOf(name);
        return {
            name,
            count: counts[i].rows[0].n,
            readonly: Object.keys(cfg.editable).length === 0 && !cfg.deletable,
            deletable: Boolean(cfg.deletable),
            columns: describeColumns(name, columns.rows.filter((row) => row.table_name === name))
        };
    });
}

// Table names come from the catalog, never from the request, so they are safe to interpolate.
async function tableMeta(name) {
    const result = await query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [name]
    );
    if (result.rows.length === 0) throw notFound('Unknown table');
    return { table: { name, columns: describeColumns(name, result.rows) }, cfg: configOf(name) };
}

/* ---- rows ---- */
const keyOf = (cfg, row) => cfg.pk.map((column) => (row[column] instanceof Date ? row[column].toISOString() : String(row[column]))).join(KEY_SEPARATOR);

// Values are sent as display strings; long ones are cut and listed in __truncated.
function presentRow(cfg, columns, row) {
    const out = { __key: keyOf(cfg, row) };
    const truncated = [];
    for (const column of columns) {
        let value = row[column.name];
        if (value instanceof Date) value = value.toISOString();
        else if (value !== null && typeof value === 'object') value = JSON.stringify(value);
        if (typeof value === 'string' && value.length > PREVIEW_CHARS) {
            value = value.slice(0, PREVIEW_CHARS);
            truncated.push(column.name);
        }
        out[column.name] = value;
    }
    if (truncated.length) out.__truncated = truncated;
    return out;
}

function keyWhere(cfg, key, startIndex = 1) {
    const parts = String(key).split(KEY_SEPARATOR);
    if (parts.length !== cfg.pk.length) throw badRequest('Invalid row key');
    return { sql: cfg.pk.map((column, i) => `"${column}"::text = $${startIndex + i}`).join(' AND '), params: parts };
}

// Neon-style filters: [{ column, op, value }]. Column names are checked against the catalog and
// operators against a whitelist; values are always bound parameters.
function buildWhere(table, { q, filters }) {
    const names = new Set(table.columns.map((column) => column.name));
    const params = [];
    const clauses = [];
    const bind = (value) => { params.push(value); return `$${params.length}`; };

    for (const filter of filters || []) {
        if (!filter || !names.has(filter.column)) throw badRequest('Unknown filter column');
        const op = String(filter.op || '').toUpperCase();
        if (!FILTER_OPERATORS.has(op)) throw badRequest('Unknown filter operator');
        const column = `"${filter.column}"`;
        if (op === 'IS NULL' || op === 'IS NOT NULL') clauses.push(`${column} ${op}`);
        else if (op === 'IN') {
            const items = String(filter.value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
            if (items.length === 0) throw badRequest('IN needs at least one value');
            clauses.push(`${column}::text = ANY(${bind(items)}::text[])`);
        } else if (['LIKE', 'ILIKE', 'NOT LIKE'].includes(op)) clauses.push(`${column}::text ${op} ${bind(String(filter.value ?? ''))}`);
        else clauses.push(`${column} ${op} ${bind(String(filter.value ?? ''))}`);
    }
    if (q) {
        const needle = bind(`%${q}%`);
        clauses.push(`(${table.columns.map((column) => `"${column.name}"::text ILIKE ${needle}`).join(' OR ')})`);
    }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function getRows(name, { limit = MAX_ROWS, q = '', filters = [], sort = '', dir = 'asc' }) {
    const { table, cfg } = await tableMeta(name);
    const where = buildWhere(table, { q, filters });
    const names = new Set(table.columns.map((column) => column.name));
    let order = cfg.order ? `ORDER BY ${cfg.order}` : '';
    if (sort) {
        if (!names.has(sort)) throw badRequest('Unknown sort column');
        const tieBreak = cfg.pk.filter((column) => column !== sort).map((column) => `, "${column}"`).join('');
        order = `ORDER BY "${sort}" ${dir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST${tieBreak}`;
    }
    const select = table.columns.map((col) => `"${col.name}"`).join(', ');
    const [rows, total] = await Promise.all([
        query(`SELECT ${select} FROM "${name}" ${where.sql} ${order} LIMIT ${Math.min(MAX_ROWS, Math.max(1, limit))}`, where.params),
        query(`SELECT COUNT(*)::int AS n FROM "${name}" ${where.sql}`, where.params)
    ]);
    return { table, rows: rows.rows.map((row) => presentRow(cfg, table.columns, row)), total: total.rows[0].n, capped: total.rows[0].n > rows.rows.length };
}

// Full, untruncated value of one cell (pretty-printed for JSON).
async function getCell(name, key, column) {
    const { table, cfg } = await tableMeta(name);
    if (!table.columns.some((entry) => entry.name === column)) throw badRequest('Unknown column');
    const where = keyWhere(cfg, key);
    const result = await query(`SELECT "${column}" AS value FROM "${name}" WHERE ${where.sql}`, where.params);
    if (!result.rows[0]) throw notFound('Row not found');
    let value = result.rows[0].value;
    if (value instanceof Date) value = value.toISOString();
    else if (value !== null && typeof value === 'object') value = JSON.stringify(value, null, 2);
    return value;
}

async function getRow(name, key) {
    const { table, cfg } = await tableMeta(name);
    const where = keyWhere(cfg, key);
    const select = table.columns.map((col) => `"${col.name}"`).join(', ');
    const result = await query(`SELECT ${select} FROM "${name}" WHERE ${where.sql}`, where.params);
    if (!result.rows[0]) throw notFound('Row not found');
    return { row: presentRow(cfg, table.columns, result.rows[0]), raw: result.rows[0], table, cfg };
}

/* ---- value validation ---- */
function coerce(spec, value, column) {
    const [kind, a, b] = spec.split(':');
    if (kind === 'bool') {
        if (typeof value === 'boolean') return value;
        if (value === 'true' || value === 'false') return value === 'true';
        throw badRequest(`${column} must be true or false`);
    }
    if (kind === 'int') {
        const number = Number(value);
        if (!Number.isInteger(number)) throw badRequest(`${column} must be a whole number`);
        if (a !== undefined && number < Number(a)) throw badRequest(`${column} must be at least ${a}`);
        if (b !== undefined && number > Number(b)) throw badRequest(`${column} must be at most ${b}`);
        return number;
    }
    if (kind === 'avatar') {
        const text = String(value ?? '').trim();
        if (text === '') return null;
        if (text.length > MAX_AVATAR_CHARS || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(text)) {
            throw badRequest('avatar_url must be empty or a data:image URL (png, jpeg, webp, gif) under 512 KB');
        }
        return text;
    }
    if (kind === 'enum') {
        if (!a.split(',').includes(String(value))) throw badRequest(`${column} must be one of ${a.replace(/,/g, ', ')}`);
        return String(value);
    }
    const text = String(value ?? '').trim();
    if (text.length > 5000) throw badRequest(`${column} is too long`);
    return text;
}

async function afterChange(admin, { table, key, userId, message, meta, revoke = false }) {
    await logActivity({ userId: admin.id, username: admin.username, action: 'admin.edit', message, meta: { table, key, ...meta } });
    if (userId) {
        events.publishToUser(userId, revoke ? 'revoked' : 'sync', { by: 'admin' });
    }
    events.publishAdmin('db', { tables: [table] });
}

/* ---- updates ---- */
async function updateCell(admin, name, key, column, rawValue) {
    const { raw, cfg } = await getRow(name, key);
    const spec = cfg.editable[column];
    if (!spec) throw badRequest(`${column} cannot be edited`);
    let value = coerce(spec, rawValue, column);
    const userId = name === 'users' ? raw.id : raw.user_id;
    const label = name === 'users' ? raw.username : (raw.name || key);
    const shortValue = column === 'avatar_url' ? (value === null ? 'NULL' : '(image)') : value;
    const describe = () => `Admin ${admin.username} set ${name}.${column} = ${shortValue} (${label})`;

    if (name === 'users') {
        if (column === 'username') {
            const check = validateUsername(value);
            if (!check.valid) throw badRequest(check.error);
            value = check.value;
            const taken = await User.findByUsername(value);
            if (taken && taken.id !== raw.id) throw conflict('Username already taken');
            if (getAdminUsernames().has(value.toLowerCase()) && !raw.is_admin) throw conflict('Username is reserved');
        }
        if (column === 'is_admin' && raw.id === admin.id && value === false) throw badRequest('You cannot remove your own admin access');
        // xp, rank and tasks_completed are linked inside the database (users_sync_progress trigger).
        await query(`UPDATE users SET "${column}" = $1, updated_at = NOW() WHERE id = $2`, [value, raw.id]);
    } else if (name === 'tasks') {
        if (column === 'completed') {
            const outcome = await Task.setCompleted(raw.user_id, raw.id, value);
            if (!outcome) throw notFound('Task not found');
        } else {
            const outcome = await Task.update(raw.user_id, raw.id, { [column]: value });
            if (!outcome) throw notFound('Task not found');
        }
    } else {
        const where = keyWhere(cfg, key, 2);
        await query(`UPDATE "${name}" SET "${column}" = $1 WHERE ${where.sql}`, [value, ...where.params]);
    }

    await afterChange(admin, { table: name, key, userId, message: describe(), meta: { column, value: column === 'avatar_url' ? shortValue : value } });
    return (await getRow(name, key)).row;
}

/* ---- deletes ---- */
async function deleteRow(admin, name, key) {
    const { raw, cfg, table } = await getRow(name, key);
    if (!cfg.deletable) throw badRequest(`${name} rows cannot be deleted`);
    let userId = raw.user_id || null;
    let label = key;

    if (name === 'users') {
        if (raw.id === admin.id) throw badRequest('You cannot delete your own account');
        userId = raw.id;
        label = raw.username;
        await query('DELETE FROM users WHERE id = $1', [raw.id]);
    } else if (name === 'tasks') {
        label = raw.name;
        await Task.delete(raw.user_id, raw.id);
    } else {
        const where = keyWhere(cfg, key);
        await query(`DELETE FROM "${table.name}" WHERE ${where.sql}`, where.params);
        label = raw.name || key;
    }
    await afterChange(admin, {
        table: name, key, userId, revoke: name === 'users',
        message: `Admin ${admin.username} deleted ${name} row (${label})`, meta: { deleted: true }
    });
}

/* ---- logs ---- */
async function getLogs({ limit = 100, q = '', level = '', category = '', user = '', before = '' }) {
    const where = [];
    const params = [];
    const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
    if (level) add('level = ?', level);
    if (category) add('action LIKE ?', `${category}.%`);
    if (user) add('username ILIKE ?', `%${user}%`);
    if (before) add('id < ?', before);
    if (q) {
        params.push(`%${q}%`);
        const p = `$${params.length}`;
        where.push(`(message ILIKE ${p} OR COALESCE(action, '') ILIKE ${p} OR COALESCE(username, '') ILIKE ${p} OR metadata::text ILIKE ${p})`);
    }
    const sql = `SELECT id, created_at, level, action, user_id, username, message, metadata FROM system_logs
                 ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ${Math.min(500, Math.max(1, limit))}`;
    return (await query(sql, params)).rows;
}

/* ---- analytics ---- */
async function getAnalytics() {
    const hours = `generate_series(date_trunc('hour', NOW()) - INTERVAL '23 hours', date_trunc('hour', NOW()), INTERVAL '1 hour')`;
    const [uptime, users, groq, top, totals] = await Promise.all([
        query(`SELECT h AS hour, COALESCE(c.n, 0)::int AS samples FROM ${hours} h
               LEFT JOIN (SELECT date_trunc('hour', sampled_at) AS hr, COUNT(*) AS n FROM uptime_samples
                          WHERE sampled_at > NOW() - INTERVAL '25 hours' GROUP BY 1) c ON c.hr = h ORDER BY h`),
        query(`SELECT h AS hour, COALESCE(c.n, 0)::int AS users FROM ${hours} h
               LEFT JOIN (SELECT hour AS hr, COUNT(*) AS n FROM user_activity WHERE hour > NOW() - INTERVAL '25 hours' GROUP BY 1) c ON c.hr = h ORDER BY h`),
        query(`SELECT h AS hour, COALESCE(c.calls, 0)::int AS calls, COALESCE(c.errors, 0)::int AS errors, c.avg_ms
               FROM ${hours} h
               LEFT JOIN (SELECT date_trunc('hour', created_at) AS hr, COUNT(*) AS calls, COUNT(*) FILTER (WHERE NOT success) AS errors,
                                 AVG(response_time_ms)::int AS avg_ms
                          FROM groq_logs WHERE created_at > NOW() - INTERVAL '25 hours' GROUP BY 1) c ON c.hr = h ORDER BY h`),
        query('SELECT username, avatar_url AS avatar, xp, rank, level, tasks_completed FROM users ORDER BY xp DESC, username LIMIT 5'),
        query(`SELECT (SELECT COUNT(*) FROM users)::int AS users, (SELECT COUNT(*) FROM tasks)::int AS tasks,
                      (SELECT COUNT(DISTINCT user_id) FROM user_activity WHERE hour > NOW() - INTERVAL '24 hours')::int AS active_users,
                      (SELECT COUNT(*) FROM groq_logs WHERE created_at > NOW() - INTERVAL '24 hours')::int AS groq_calls,
                      (SELECT COUNT(*) FROM uptime_samples WHERE sampled_at > NOW() - INTERVAL '24 hours')::int AS samples`)
    ]);
    const elapsedThisHour = Math.max(1, new Date().getMinutes() + 1);
    const lastIndex = uptime.rows.length - 1;
    const t = totals.rows[0];
    return {
        generatedAt: new Date().toISOString(),
        uptime: uptime.rows.map((row, i) => ({
            hour: row.hour,
            percent: Math.min(100, Math.round((row.samples / (i === lastIndex ? elapsedThisHour : 60)) * 100))
        })),
        uptimePercent24h: Math.min(100, Math.round((t.samples / (24 * 60)) * 100)),
        users: users.rows.map((row) => ({ hour: row.hour, count: row.users })),
        groq: groq.rows.map((row) => ({ hour: row.hour, calls: row.calls, errors: row.errors, avgMs: row.avg_ms })),
        topUsers: top.rows,
        totals: { users: t.users, tasks: t.tasks, activeUsers24h: t.active_users, groqCalls24h: t.groq_calls, liveConnections: events.stats() }
    };
}

async function promoteConfiguredAdmins() {
    const names = [...getAdminUsernames()];
    if (names.length === 0) return 0;
    const result = await query('UPDATE users SET is_admin = true WHERE LOWER(username) = ANY($1::text[]) AND NOT is_admin', [names]);
    return result.rowCount;
}

module.exports = { listTables, getRows, getCell, updateCell, deleteRow, getLogs, getAnalytics, promoteConfiguredAdmins };
