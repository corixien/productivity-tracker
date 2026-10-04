// End-to-end API tests against a real PostgreSQL. Skipped unless TEST_DATABASE_URL is set,
// and refuses to run against anything that is not a local database.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
const isLocal = url && ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
const skip = !url ? 'set TEST_DATABASE_URL to a local, migrated database to run' : !isLocal ? 'TEST_DATABASE_URL must point to localhost' : false;

if (!skip) {
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'integration-secret';
    process.env.TROPHY_FIRST_WEEK = '2000-01-03';
    process.env.LOG_LEVEL = 'error';
    process.env.LOG_DIR = require('os').tmpdir();
}

test('API integration', { skip }, async (t) => {
    const app = require('../backend/index');
    const { closePool } = require('../backend/utils/database');
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));
        await closePool();
    });

    async function call(method, path, { body, token, headers } = {}) {
        const res = await fetch(base + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Timezone': 'Europe/Berlin',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* not json */ }
        return { status: res.status, json, headers: res.headers };
    }


    // A completed task of `xp` XP finished at the given SQL timestamp expression, with its ledger row.
    async function backdatedTask(query, userId, xp, whenSql) {
        const task = await query(
            `INSERT INTO tasks (user_id, name, xp_awarded, duration, productivity, difficulty, category, bonus, completed, completed_at, created_at)
             VALUES ($1, 'old task', $2, 60, 3, 3, 'other', 0, true, ${whenSql}, ${whenSql}) RETURNING id`,
            [userId, xp]
        );
        await query(
            `INSERT INTO xp_history (user_id, xp_amount, source, source_id, created_at) VALUES ($1, $2, 'task', $3, ${whenSql})`,
            [userId, xp, task.rows[0].id]
        );
    }

    const suffix = Date.now().toString(36).slice(-6);
    const nameA = `alice_${suffix}`;
    const nameB = `bob_${suffix}`;
    let tokenA;
    let tokenB;
    let taskId;

    await t.test('security headers and meta', async () => {
        const res = await call('GET', '/api/meta');
        assert.equal(res.status, 200);
        assert.equal(res.json.ranks.length, 7);
        const csp = res.headers.get('content-security-policy');
        assert.match(csp, /script-src 'self'/);
        assert.match(csp, /frame-ancestors 'none'/);
        assert.equal((await call('GET', '/api/tasks')).status, 401);
        const status = await call('GET', '/api/groq/status');
        assert.equal(status.status, 200);
        assert.equal('keyLength' in status.json, false);
        const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
        assert.equal(bad.status, 400);
    });

    await t.test('register and login', async () => {
        const a = await call('POST', '/api/auth/register', { body: { username: nameA, password: 'secret1' } });
        assert.equal(a.status, 201);
        tokenA = a.json.token;
        const b = await call('POST', '/api/auth/register', { body: { username: nameB, password: 'secret2' } });
        tokenB = b.json.token;
        assert.equal((await call('POST', '/api/auth/register', { body: { username: nameA, password: 'secret1' } })).status, 409);
        const login = await call('POST', '/api/auth/login', { body: { username: nameA, password: 'secret1' } });
        assert.equal(login.status, 200);
        assert.equal((await call('POST', '/api/auth/login', { body: { username: nameA, password: 'wrong' } })).status, 401);
        const me = await call('GET', '/api/auth/me', { token: tokenA });
        assert.equal(me.json.username, nameA);
        assert.equal(me.json.password_hash, undefined);
        assert.equal(me.json.token_version, undefined);
    });

    await t.test('task lifecycle keeps XP consistent', async () => {
        const created = await call('POST', '/api/tasks', { token: tokenA, body: { name: 'Study', duration: 30, productivity: 4, difficulty: 3 } });
        assert.equal(created.status, 201);
        assert.equal(created.json.xp, 12);
        taskId = created.json.id;

        const done = await call('POST', `/api/tasks/${taskId}/complete`, { token: tokenA });
        assert.equal(done.json.newXP, 12);

        const stats = (await call('GET', '/api/xp/stats', { token: tokenA })).json;
        assert.equal(stats.streak.current, 1);
        assert.equal(stats.streak.activeToday, true);
        assert.equal(stats.today.xp, 12);
        assert.equal(stats.today.goal, 50);

        const history = (await call('GET', '/api/xp', { token: tokenA })).json;
        assert.equal(history.total, 12);
        assert.equal(history.history[0].task_name, 'Study');

        const undone = await call('PUT', `/api/tasks/${taskId}`, { token: tokenA, body: { completed: false } });
        assert.equal(undone.json.newXP, 0);
        await call('POST', `/api/tasks/${taskId}/complete`, { token: tokenA });
    });

    await t.test('clients cannot set task XP or an oversized bonus', async () => {
        const body = { name: 'cheat', duration: 60, productivity: 4, difficulty: 3, category: 'other' };
        const honest = await call('POST', '/api/tasks', { token: tokenA, body });
        const cheat = await call('POST', '/api/tasks', { token: tokenA, body: { ...body, xp: 99999, xp_awarded: 99999, xpAwarded: 99999 } });
        assert.equal(cheat.status, 201);
        assert.equal(cheat.json.xp, honest.json.xp);
        assert.equal((await call('POST', '/api/tasks', { token: tokenA, body: { ...body, bonus: 101 } })).status, 400);
        for (const id of [honest.json.id, cheat.json.id]) await call('DELETE', `/api/tasks/${id}`, { token: tokenA });
    });

    await t.test('editing a completed task re-prices its XP', async () => {
        const edited = await call('PUT', `/api/tasks/${taskId}`, { token: tokenA, body: { duration: 60, difficulty: 4 } });
        assert.equal(edited.status, 200);
        assert.equal(edited.json.xp, 28);
        assert.equal(edited.json.newXP, 28);
        const history = (await call('GET', '/api/xp', { token: tokenA })).json;
        assert.ok(history.history.some((row) => row.source === 'task_edit' && row.xp_amount === 16));
        assert.equal((await call('PUT', `/api/tasks/${taskId}`, { token: tokenB, body: { name: 'hijack' } })).status, 404);
    });

    await t.test('friends, leaderboard and multiplier', async () => {
        assert.equal((await call('POST', '/api/users/friends', { token: tokenA, body: { friendUsername: nameB } })).status, 200);
        assert.equal((await call('POST', '/api/users/friends', { token: tokenA, body: { friendUsername: nameB } })).status, 409);
        const all = (await call('GET', '/api/leaderboard', { token: tokenA })).json;
        assert.deepEqual(all.map((row) => row.username), [nameA, nameB]);
        assert.equal(all[0].isSelf, true);
        const week = (await call('GET', '/api/leaderboard?period=week', { token: tokenA })).json;
        assert.equal(week[0].score, 28);
        assert.equal(week[1].score, 0);

        // Leader (28 XP vs 0): the catch-up multiplier is below 1 and scales new XP.
        const me = (await call('GET', '/api/auth/me', { token: tokenA })).json;
        assert.equal(Number(me.multiplier), 0.93);
        const second = await call('POST', '/api/tasks', { token: tokenA, body: { name: 'Second', duration: 30, productivity: 4, difficulty: 3 } });
        const done = await call('POST', `/api/tasks/${second.json.id}/complete`, { token: tokenA });
        assert.equal(done.json.xpEarned, Math.round(12 * 0.93));
        const undone = await call('PUT', `/api/tasks/${second.json.id}`, { token: tokenA, body: { completed: false } });
        assert.equal(undone.json.newXP, 28, 'uncompleting removes exactly what was awarded');
    });

    await t.test('other users only expose public fields', async () => {
        const other = await call('GET', `/api/users/${nameA}`, { token: tokenB });
        assert.deepEqual(Object.keys(other.json).sort(), ['avatar', 'level', 'rank', 'username', 'xp']);
    });

    await t.test('templates', async () => {
        const created = await call('POST', '/api/users/quick-tasks', { token: tokenA, body: { name: 'Daily reading', duration: 20, productivity: 3 } });
        assert.equal(created.status, 201);
        const dupe = await call('POST', '/api/users/quick-tasks', { token: tokenA, body: { name: ' daily READING ', duration: 20, productivity: 3 } });
        assert.equal(dupe.status, 409);
        const list = await call('GET', '/api/users/quick-tasks', { token: tokenA });
        assert.equal(list.json.length, 1);
        const used = await call('POST', `/api/users/quick-tasks/${created.json.id}/use`, { token: tokenA });
        assert.equal(used.status, 201);
        assert.equal(used.json.name, 'Daily reading');
        assert.equal((await call('DELETE', `/api/users/quick-tasks/${created.json.id}`, { token: tokenA })).status, 200);
    });

    await t.test('database guards: case-insensitive usernames, closed value sets, integrity view', async () => {
        const { query } = require('../backend/utils/database');
        await assert.rejects(query("INSERT INTO users (username, password_hash) VALUES ($1, 'x')", [nameA.toUpperCase()]), /idx_users_username_lower/);
        await assert.rejects(query("UPDATE users SET language = 'xx' WHERE username = $1", [nameA]), /users_language_known/);
        assert.equal((await query('SELECT * FROM v_user_integrity')).rows.length, 0);
    });

    await t.test('settings and daily goal', async () => {
        const res = await call('PUT', '/api/settings', { token: tokenA, body: { dailyGoalXp: 120, goals: 'ship it', language: 'de' } });
        assert.equal(res.status, 200);
        assert.equal(res.json.dailyGoalXp, 120);
        assert.equal(res.json.goals, 'ship it');
        assert.equal((await call('PUT', '/api/settings', { token: tokenA, body: { dailyGoalXp: 1 } })).status, 400);
        assert.equal((await call('GET', '/api/xp/stats', { token: tokenA })).json.today.goal, 120);
    });

    await t.test('avatar upload is capped', async () => {
        const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const ok = await call('POST', `/api/users/${nameA}/avatar`, { token: tokenA, body: { avatar: `data:image/png;base64,${png}` } });
        assert.equal(ok.status, 200);
        const big = Buffer.alloc(600 * 1024, 1).toString('base64');
        const tooBig = await call('POST', `/api/users/${nameA}/avatar`, { token: tokenA, body: { avatar: big } });
        assert.equal(tooBig.status, 400);
        const huge = await call('POST', '/api/tasks', { token: tokenA, body: { name: 'x'.repeat(200 * 1024), duration: 5 } });
        assert.equal(huge.status, 413);
    });

    await t.test('password change revokes old tokens', async () => {
        const wrong = await call('POST', `/api/users/${nameA}/password`, { token: tokenA, body: { currentPassword: 'nope', newPassword: 'newpass1' } });
        assert.equal(wrong.status, 403);
        const missing = await call('POST', `/api/users/${nameA}/password`, { token: tokenA, body: { newPassword: 'newpass1' } });
        assert.equal(missing.status, 400);
        const changed = await call('POST', `/api/users/${nameA}/password`, { token: tokenA, body: { currentPassword: 'secret1', newPassword: 'newpass1' } });
        assert.equal(changed.status, 200);
        const stale = await call('GET', '/api/auth/me', { token: tokenA });
        assert.equal(stale.status, 401);
        assert.equal(stale.json.code, 'session_revoked');
        const fresh = await call('GET', '/api/auth/me', { token: changed.json.token });
        assert.equal(fresh.status, 200);
        assert.equal((await call('POST', '/api/auth/login', { body: { username: nameA, password: 'newpass1' } })).status, 200);
        tokenA = changed.json.token;
    });

    await t.test('log retention purges old rows only', async () => {
        const { query } = require('../backend/utils/database');
        const { purgeOldLogs } = require('../backend/services/retentionService');
        await query("INSERT INTO system_logs (level, message, created_at) VALUES ('info', 'retention-old', NOW() - INTERVAL '40 days'), ('info', 'retention-new', NOW())");
        await purgeOldLogs(30);
        const remaining = await query("SELECT message FROM system_logs WHERE message LIKE 'retention-%'");
        assert.deepEqual(remaining.rows.map((row) => row.message), ['retention-new']);
        await query("DELETE FROM system_logs WHERE message = 'retention-new'");
    });

    await t.test('database links rank, level, xp and the task count', async () => {
        const { query } = require('../backend/utils/database');
        const { getRankName } = require('../backend/services/rankService');
        const rankOf = async (name) => (await query('SELECT xp, level, rank, tasks_completed FROM users WHERE username = $1', [name])).rows[0];

        // SQL thresholds match rankService
        for (const xp of [0, 359, 360, 1079, 1080, 2159, 2160, 4319, 4320, 8639, 8640, 17999, 18000, 40000]) {
            const { rows } = await query('SELECT rank_for_xp($1) AS rank', [xp]);
            assert.equal(rows[0].rank, getRankName(xp), `rank_for_xp(${xp})`);
        }

        await query('UPDATE users SET xp = 5000 WHERE username = $1', [nameB]);
        assert.deepEqual(await rankOf(nameB), { xp: 5000, level: 50, rank: 'Platinum', tasks_completed: 0 });
        const audit = await query("SELECT xp_amount FROM xp_history WHERE source = 'admin_adjust' AND user_id = (SELECT id FROM users WHERE username = $1)", [nameB]);
        assert.equal(audit.rows[0].xp_amount, 5000, 'direct xp edit is booked as an adjustment');

        await query("UPDATE users SET rank = 'Silver' WHERE username = $1", [nameB]);
        assert.deepEqual(await rankOf(nameB), { xp: 2159, level: 21, rank: 'Silver', tasks_completed: 0 }, 'lowering the rank lowers xp');
        await query("UPDATE users SET rank = 'Diamond' WHERE username = $1", [nameB]);
        assert.equal((await rankOf(nameB)).xp, 8640, 'raising the rank raises xp');

        // task count: trim completed tasks, take their XP back, keep pending ones
        const ids = [];
        for (let i = 0; i < 3; i += 1) {
            const task = await call('POST', '/api/tasks', { token: tokenB, body: { name: `Link ${i}`, duration: 30, productivity: 4, difficulty: 3 } });
            ids.push(task.json.id);
        }
        for (const id of ids.slice(0, 2)) await call('POST', `/api/tasks/${id}/complete`, { token: tokenB });
        assert.equal((await rankOf(nameB)).tasks_completed, 2);
        await query('UPDATE users SET tasks_completed = 99 WHERE username = $1', [nameB]);
        assert.equal((await rankOf(nameB)).tasks_completed, 2, 'cannot exceed the real count');
        await query('UPDATE users SET tasks_completed = 1 WHERE username = $1', [nameB]);
        const left = await query("SELECT name FROM tasks WHERE user_id = (SELECT id FROM users WHERE username = $1) AND completed", [nameB]);
        assert.deepEqual(left.rows.map((row) => row.name), ['Link 1'], 'oldest completed task is removed first');
        await query('UPDATE users SET tasks_completed = 0 WHERE username = $1', [nameB]);
        const remaining = await query("SELECT completed FROM tasks WHERE user_id = (SELECT id FROM users WHERE username = $1)", [nameB]);
        assert.deepEqual(remaining.rows, [{ completed: false }], 'count 0 removes completed tasks, pending stays');
        const sum = await query("SELECT COALESCE(SUM(xp_amount), 0)::int AS sum FROM xp_history WHERE user_id = (SELECT id FROM users WHERE username = $1)", [nameB]);
        assert.equal(sum.rows[0].sum, (await rankOf(nameB)).xp, 'history always explains users.xp');
    });

    await t.test('admin API: access, edits, storage, logs, analytics, live sync', async () => {
        const { query } = require('../backend/utils/database');
        const c = await call('POST', '/api/auth/register', { body: { username: `carol_${suffix}`, password: 'secret3' } });
        let tokenC = c.token || c.json.token;
        assert.equal((await call('GET', '/api/admin/tables', { token: tokenC })).status, 404, 'non-admins get 404');
        assert.equal((await call('GET', '/api/admin/tables')).status, 401);
        await query('UPDATE users SET is_admin = true WHERE username = $1', [`carol_${suffix}`]);
        const me = await call('GET', '/api/auth/me', { token: tokenC });
        assert.equal(me.json.isAdmin, true);

        const tables = (await call('GET', '/api/admin/tables', { token: tokenC })).json.tables;
        const names = tables.map((table) => table.name);
        for (const name of ['users', 'tasks', 'xp_history', 'friends', 'templates', 'groq_logs', 'system_logs', 'schema_migrations']) assert.ok(names.includes(name), name);
        assert.ok(!names.includes('profiles') && !names.includes('goals'));
        const users = tables.find((table) => table.name === 'users');
        assert.ok(!users.columns.some((col) => col.name === 'password_hash'), 'secrets are never exposed');

        const listed = (await call('GET', `/api/admin/tables/users?q=alice_${suffix}`, { token: tokenC })).json;
        assert.equal(listed.rows.length, 1);
        const key = listed.rows[0].__key;

        // live sync: a connected user hears about the admin edit
        const controller = new AbortController();
        const stream = await fetch(`${base}/api/events`, { headers: { Authorization: `Bearer ${tokenA}` }, signal: controller.signal });
        const reader = stream.body.getReader();
        let received = '';
        const gotSync = (async () => {
            const decoder = new TextDecoder();
            while (!received.includes('event: sync')) {
                const { value, done } = await reader.read();
                if (done) break;
                received += decoder.decode(value);
            }
            return received;
        })();
        await new Promise((resolve) => setTimeout(resolve, 150));

        const edited = await call('PATCH', `/api/admin/tables/users/${key}`, { token: tokenC, body: { column: 'xp', value: 2500 } });
        assert.equal(edited.status, 200);
        assert.equal(edited.json.row.xp, 2500);
        assert.equal(edited.json.row.rank, 'Gold');
        assert.match(await Promise.race([gotSync, new Promise((_, reject) => setTimeout(() => reject(new Error('no sync event')), 3000))]), /event: sync/);
        controller.abort();

        assert.equal((await call('PATCH', `/api/admin/tables/users/${key}`, { token: tokenC, body: { column: 'password_hash', value: 'x' } })).status, 400);
        assert.equal((await call('PATCH', `/api/admin/tables/users/${key}`, { token: tokenC, body: { column: 'rank', value: 'Emperor' } })).status, 400);
        assert.equal((await call('PATCH', `/api/admin/tables/xp_history/${key}`, { token: tokenC, body: { column: 'xp_amount', value: 1 } })).status, 404);
        assert.equal((await call('DELETE', `/api/admin/tables/users/${(await call('GET', `/api/admin/tables/users?q=carol_${suffix}`, { token: tokenC })).json.rows[0].__key}`, { token: tokenC })).status, 400, 'cannot delete yourself');

        // avatar_url is a normal column: truncated in lists, full value on demand, editable, NULL removes it
        const withAvatar = (await call('GET', `/api/admin/tables/users?q=alice_${suffix}`, { token: tokenC })).json.rows[0];
        assert.match(withAvatar.avatar_url, /^data:image\/png;base64,/);
        const full = (await call('GET', `/api/admin/tables/users/${withAvatar.__key}/cell?column=avatar_url`, { token: tokenC })).json.value;
        assert.ok(full.startsWith('data:image/png;base64,') && full.length >= withAvatar.avatar_url.length);
        assert.equal((await call('PATCH', `/api/admin/tables/users/${withAvatar.__key}`, { token: tokenC, body: { column: 'avatar_url', value: 'http://evil.example/x.png' } })).status, 400);
        const cleared = await call('PATCH', `/api/admin/tables/users/${withAvatar.__key}`, { token: tokenC, body: { column: 'avatar_url', value: '' } });
        assert.equal(cleared.status, 200);
        assert.equal(cleared.json.row.avatar_url, null);
        assert.equal((await call('GET', `/api/users/alice_${suffix}`, { token: tokenA })).json.avatar, null);
        assert.equal((await call('GET', '/api/admin/storage', { token: tokenC })).status, 404, 'storage endpoint is gone');

        // filters and sorting (Neon style)
        const rowsFor = async (params) => (await call('GET', `/api/admin/tables/users?${new URLSearchParams(params)}`, { token: tokenC }));
        const f = (filters) => JSON.stringify(filters);
        const mine = `${suffix}`;
        const eq = await rowsFor({ filters: f([{ column: 'username', op: '=', value: `alice_${suffix}` }]) });
        assert.equal(eq.json.rows.length, 1);
        const ilike = await rowsFor({ filters: f([{ column: 'username', op: 'ILIKE', value: `%${mine.toUpperCase()}` }]) });
        assert.ok(ilike.json.rows.length >= 3);
        const notLike = await rowsFor({ filters: f([{ column: 'username', op: 'ILIKE', value: `%${mine}` }, { column: 'username', op: 'NOT LIKE', value: 'alice%' }]) });
        assert.ok(notLike.json.rows.every((row) => !row.username.startsWith('alice')));
        const inList = await rowsFor({ filters: f([{ column: 'username', op: 'IN', value: `alice_${suffix}, bob_${suffix}` }]) });
        assert.equal(inList.json.rows.length, 2);
        const gte = await rowsFor({ filters: f([{ column: 'xp', op: '>=', value: 700 }, { column: 'username', op: 'LIKE', value: `%${mine}` }]) });
        assert.ok(gte.json.rows.length >= 1 && gte.json.rows.every((row) => row.xp >= 700));
        const noAvatar = await rowsFor({ filters: f([{ column: 'avatar_url', op: 'IS NULL' }, { column: 'username', op: 'LIKE', value: `%${mine}` }]) });
        assert.ok(noAvatar.json.rows.length >= 3);
        const sorted = await rowsFor({ filters: f([{ column: 'username', op: 'LIKE', value: `%${mine}` }]), sort: 'xp', dir: 'desc' });
        assert.ok(sorted.json.rows.every((row, i, all) => i === 0 || all[i - 1].xp >= row.xp), 'sorted by xp desc');
        assert.equal(sorted.json.capped, false);
        assert.equal((await rowsFor({ filters: f([{ column: 'nope', op: '=', value: 1 }]) })).status, 400);
        assert.equal((await rowsFor({ filters: f([{ column: 'xp', op: 'DROP', value: 1 }]) })).status, 400);
        assert.equal((await rowsFor({ sort: 'nope' })).status, 400);
        assert.equal((await rowsFor({ filters: f([{ column: 'xp', op: '>', value: 'abc' }]) })).status, 400, 'bad value for the column type');

        // logs: compact, filterable, include the admin edit
        const logs = (await call('GET', '/api/admin/logs?limit=100', { token: tokenC })).json.logs;
        assert.ok(logs.length > 5 && logs.length <= 100);
        assert.ok(logs.some((log) => log.action === 'task.complete' && /Completed task "Study" = \+\d+ XP/.test(log.message)));
        assert.ok(logs.some((log) => log.action === 'admin.edit' && /Admin carol_/.test(log.message)));
        const onlyAuth = (await call('GET', '/api/admin/logs?category=auth', { token: tokenC })).json.logs;
        assert.ok(onlyAuth.length > 0 && onlyAuth.every((log) => log.action.startsWith('auth.')));
        const searched = (await call('GET', `/api/admin/logs?q=${encodeURIComponent('Study')}&user=alice`, { token: tokenC })).json.logs;
        assert.ok(searched.length > 0 && searched.every((log) => /alice/.test(log.username)));

        // analytics shape
        const analytics = (await call('GET', '/api/admin/analytics', { token: tokenC })).json;
        assert.equal(analytics.uptime.length, 24);
        assert.equal(analytics.users.length, 24);
        assert.equal(analytics.groq.length, 24);
        assert.ok(analytics.topUsers.length >= 1 && analytics.topUsers.length <= 5);
        assert.ok(analytics.topUsers.every((entry, i, all) => i === 0 || all[i - 1].xp >= entry.xp));
        assert.ok(analytics.totals.activeUsers24h >= 1);
    });

    await t.test('deleting a completed task removes exactly its XP', async () => {
        const before = (await call('GET', '/api/auth/me', { token: tokenA })).json.xp;
        const del = await call('DELETE', `/api/tasks/${taskId}`, { token: tokenA });
        assert.equal(del.status, 200);
        assert.equal(del.json.xpChange, -28);
        assert.equal(del.json.newXP, before - 28);
        assert.equal((await call('DELETE', `/api/tasks/${taskId}`, { token: tokenA })).status, 404);
        assert.equal((await call('DELETE', '/api/tasks/not-a-uuid', { token: tokenA })).status, 400);
    });
    await t.test('daily goal bonus is paid once and taken back when the day falls below the goal', async () => {
        const { query } = require('../backend/utils/database');
        const name = `goal_${suffix}`;
        const token = (await call('POST', '/api/auth/register', { body: { username: name, password: 'secret123' } })).json.token;
        const addDone = async (duration, productivity, difficulty) => {
            const task = await call('POST', '/api/tasks', { token, body: { name: 'goal task', duration, productivity, difficulty, category: 'other' } });
            return { id: task.json.id, done: await call('POST', `/api/tasks/${task.json.id}/complete`, { token }) };
        };
        const xp = async () => (await call('GET', '/api/auth/me', { token })).json.xp;
        const bonusRows = async () => (await query(
            "SELECT COALESCE(SUM(xp_amount), 0)::int AS paid, COUNT(*)::int AS rows FROM xp_history WHERE source = 'daily_goal' AND user_id = (SELECT id FROM users WHERE username = $1)", [name])).rows[0];

        const first = await addDone(60, 5, 5); // 37 XP, goal is 50
        assert.equal(first.done.json.goalBonus, 0);
        assert.equal(await xp(), 37);
        const second = await addDone(60, 4, 3); // +24 = 61 >= 50
        assert.equal(second.done.json.goalBonus, 5);
        assert.equal(second.done.json.newXP, 66);
        const third = await addDone(60, 4, 3);
        assert.equal(third.done.json.goalBonus, 0);
        assert.deepEqual(await bonusRows(), { paid: 5, rows: 1 });
        const stats = (await call('GET', '/api/xp/stats', { token })).json;
        assert.equal(stats.today.xp, 85, 'goal progress counts task XP only');

        await call('PUT', `/api/tasks/${third.id}`, { token, body: { completed: false } });
        assert.equal((await bonusRows()).paid, 5, 'still 61 XP, goal still reached');
        const undone = await call('PUT', `/api/tasks/${second.id}`, { token, body: { completed: false } });
        assert.equal(undone.json.goalBonus, -5);
        assert.equal(await xp(), 37);
        assert.equal((await bonusRows()).paid, 0);

        assert.equal((await call('POST', `/api/tasks/${second.id}/complete`, { token })).json.goalBonus, 5);
        const raised = await call('PUT', '/api/settings', { token, body: { dailyGoalXp: 200 } });
        assert.equal(raised.status, 200);
        assert.equal((await bonusRows()).paid, 0, 'raising the goal takes the bonus back');
        await call('PUT', '/api/settings', { token, body: { dailyGoalXp: 50 } });
        assert.equal((await bonusRows()).paid, 5, 'lowering it pays the bonus again');
        assert.equal(await xp(), 66);

        const removed = await call('DELETE', `/api/tasks/${second.id}`, { token });
        assert.equal(removed.json.goalBonus, -5);
        assert.equal(await xp(), 37);
        assert.equal((await query('SELECT COUNT(*)::int AS n FROM v_user_integrity WHERE username = $1', [name])).rows[0].n, 0);
    });

    await t.test('weekly trophy goes to first place only, once, and never counts towards the next week', async () => {
        const { query } = require('../backend/utils/database');
        const { resetSettledCache } = require('../backend/services/bonusService');
        await query("DELETE FROM users WHERE username LIKE 'trophy\\_%'");
        const weekStart = (await query("SELECT (date_trunc('week', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '7 days')::date::text AS w")).rows[0].w;
        await query('DELETE FROM weekly_trophies WHERE week_start = $1', [weekStart]);
        const players = {};
        for (const [key, weekXp] of [['first', 80], ['second', 60], ['third', 20]]) {
            const username = `trophy_${key}_${suffix}`;
            const token = (await call('POST', '/api/auth/register', { body: { username, password: 'secret123' } })).json.token;
            const id = (await query('SELECT id FROM users WHERE username = $1', [username])).rows[0].id;
            await backdatedTask(query, id, weekXp, "(date_trunc('week', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '5 days' + INTERVAL '12 hours') AT TIME ZONE 'Europe/Berlin'");
            await query('UPDATE users SET xp = $2 WHERE id = $1', [id, weekXp]);
            players[key] = { token, id, weekXp };
        }
        resetSettledCache();
        const winnerStats = (await call('GET', '/api/xp/stats', { token: players.first.token })).json;
        assert.deepEqual(winnerStats.trophy && winnerStats.trophy.xp, 50);
        assert.equal(winnerStats.trophy.weekStart, weekStart);
        assert.equal((await call('GET', '/api/xp/stats', { token: players.second.token })).json.trophy, null);
        assert.equal((await call('GET', '/api/auth/me', { token: players.first.token })).json.xp, 80 + 50);
        for (const key of ['second', 'third']) {
            assert.equal((await call('GET', '/api/auth/me', { token: players[key].token })).json.xp, players[key].weekXp);
        }

        resetSettledCache();
        await call('GET', '/api/xp/stats', { token: players.first.token });
        const rows = await query("SELECT COUNT(*)::int AS n FROM xp_history WHERE source = 'weekly_trophy' AND user_id = ANY($1)", [Object.values(players).map((p) => p.id)]);
        assert.equal(rows.rows[0].n, 1, 'settled once');
        const settled = (await query('SELECT user_id, xp_amount, week_xp FROM weekly_trophies WHERE week_start = $1', [weekStart])).rows[0];
        assert.deepEqual([settled.user_id, settled.xp_amount, settled.week_xp], [players.first.id, 50, 80]);

        await call('POST', `/api/users/friends`, { token: players.first.token, body: { friendUsername: `trophy_second_${suffix}` } });
        const board = (await call('GET', '/api/leaderboard?period=week', { token: players.first.token })).json;
        assert.equal(board.find((entry) => entry.isSelf).weekXp, 0, 'the trophy is not weekly XP');
        await query("DELETE FROM users WHERE username LIKE 'trophy\\_%'");
    });
    await t.test('concurrent requests never double-pay XP, the goal bonus or the weekly trophy', async () => {
        const { query } = require('../backend/utils/database');
        const { resetSettledCache } = require('../backend/services/bonusService');
        const name = `race_${suffix}`;
        const token = (await call('POST', '/api/auth/register', { body: { username: name, password: 'secret123' } })).json.token;
        const userId = (await query('SELECT id FROM users WHERE username = $1', [name])).rows[0].id;
        const ids = [];
        for (let i = 0; i < 6; i += 1) {
            ids.push((await call('POST', '/api/tasks', { token, body: { name: `race ${i}`, duration: 60, productivity: 4, difficulty: 3, category: 'other' } })).json.id);
        }
        // the same task completed 8 times at once pays once
        await Promise.all(Array.from({ length: 8 }, () => call('POST', `/api/tasks/${ids[0]}/complete`, { token })));
        assert.equal((await call('GET', '/api/auth/me', { token })).json.xp, 24);
        // five tasks at once reach the goal (6 x 24 = 144 >= 50): one bonus row only
        await Promise.all(ids.slice(1).map((id) => call('POST', `/api/tasks/${id}/complete`, { token })));
        const paid = (await query("SELECT COUNT(*)::int AS rows, COALESCE(SUM(xp_amount), 0)::int AS sum FROM xp_history WHERE user_id = $1 AND source = 'daily_goal'", [userId])).rows[0];
        assert.deepEqual(paid, { rows: 1, sum: 5 });
        // undo and complete racing on the same tasks must leave the ledger and users.xp in agreement
        await Promise.all(ids.flatMap((id) => [
            call('PUT', `/api/tasks/${id}`, { token, body: { completed: false } }),
            call('POST', `/api/tasks/${id}/complete`, { token }),
            call('PUT', `/api/tasks/${id}`, { token, body: { duration: 90 } })
        ]));
        const drift = await query('SELECT COUNT(*)::int AS n FROM v_user_integrity WHERE username = $1', [name]);
        assert.equal(drift.rows[0].n, 0);
        const completed = (await query('SELECT COUNT(*)::int AS n FROM tasks WHERE user_id = $1 AND completed', [userId])).rows[0].n;
        const sums = (await query(
            `SELECT COALESCE(SUM(xp_amount) FILTER (WHERE source = 'daily_goal'), 0)::int AS bonus,
                    COALESCE(SUM(xp_amount) FILTER (WHERE source <> 'daily_goal'), 0)::int AS tasks FROM xp_history WHERE user_id = $1`, [userId])).rows[0];
        assert.equal(sums.bonus, sums.tasks >= 50 ? 5 : 0, 'bonus matches the final day total');
        assert.ok(completed === 0 || sums.tasks > 0);

        // many stats requests right after the week switch settle the week once
        const weekStart = (await query("SELECT (date_trunc('week', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '7 days')::date::text AS w")).rows[0].w;
        await query('DELETE FROM weekly_trophies WHERE week_start = $1', [weekStart]);
        await query("DELETE FROM users WHERE username LIKE 'tie\\_%'");
        const rivals = [];
        for (const key of ['a', 'b']) {
            const username = `tie_${key}_${suffix}`;
            const tk = (await call('POST', '/api/auth/register', { body: { username, password: 'secret123' } })).json.token;
            const id = (await query('SELECT id FROM users WHERE username = $1', [username])).rows[0].id;
            await backdatedTask(query, id, 90, `(date_trunc('week', NOW() AT TIME ZONE 'Europe/Berlin') - INTERVAL '4 days' + INTERVAL '${key === 'a' ? 9 : 15} hours') AT TIME ZONE 'Europe/Berlin'`);
            await query('UPDATE users SET xp = 90 WHERE id = $1', [id]);
            rivals.push({ id, token: tk });
        }
        resetSettledCache();
        await Promise.all(Array.from({ length: 10 }, (_, i) => call('GET', '/api/xp/stats', { token: rivals[i % 2].token })));
        const awards = await query("SELECT user_id FROM xp_history WHERE source = 'weekly_trophy' AND user_id = ANY($1)", [rivals.map((r) => r.id)]);
        assert.equal(awards.rows.length, 1, 'exactly one trophy');
        assert.equal(awards.rows[0].user_id, rivals[0].id, 'tie goes to whoever got there first');
        await query("DELETE FROM users WHERE username LIKE 'tie\\_%'");
    });
    await t.test('undoing or editing an old task never changes today\'s goal progress or bonus', async () => {
        const { query } = require('../backend/utils/database');
        const name = `old_${suffix}`;
        const token = (await call('POST', '/api/auth/register', { body: { username: name, password: 'secret123' } })).json.token;
        const userId = (await query('SELECT id FROM users WHERE username = $1', [name])).rows[0].id;
        await backdatedTask(query, userId, 30, "NOW() - INTERVAL '2 days'");
        await query('UPDATE users SET xp = 30 WHERE id = $1', [userId]);
        const oldId = (await call('GET', '/api/tasks?completed=true', { token })).json[0].id;
        for (const [duration, productivity, difficulty] of [[60, 5, 5], [60, 4, 3]]) {
            const task = await call('POST', '/api/tasks', { token, body: { name: 'today', duration, productivity, difficulty, category: 'other' } });
            await call('POST', `/api/tasks/${task.json.id}/complete`, { token });
        }
        const before = (await call('GET', '/api/xp/stats', { token })).json;
        assert.equal(before.today.xp, 61, 'only tasks completed today count');
        assert.equal((await call('GET', '/api/auth/me', { token })).json.xp, 30 + 61 + 5);
        await call('PUT', `/api/tasks/${oldId}`, { token, body: { duration: 120 } });
        const undone = await call('PUT', `/api/tasks/${oldId}`, { token, body: { completed: false } });
        assert.equal(undone.json.goalBonus, 0);
        const after = (await call('GET', '/api/xp/stats', { token })).json;
        assert.equal(after.today.xp, 61, 'old task changes leave today alone');
        assert.equal((await call('GET', '/api/auth/me', { token })).json.xp, 61 + 5, 'bonus kept, old task XP taken back');
        const history = (await call('GET', '/api/xp?limit=10', { token })).json.history;
        const bonusAt = history.findIndex((row) => row.source === 'daily_goal');
        assert.ok(bonusAt >= 0 && history[bonusAt].xp_amount === 5, 'the bonus is listed in the XP activity');
        assert.equal(history[bonusAt + 1].source, 'task', 'right above the task that reached the goal');
    });

    await t.test('first place streaks follow the leaderboard', async () => {
        const { query } = require('../backend/utils/database');
        const a = `fp_a_${suffix}`;
        const b = `fp_b_${suffix}`;
        const tokenFpA = (await call('POST', '/api/auth/register', { body: { username: a, password: 'secret123' } })).json.token;
        const tokenFpB = (await call('POST', '/api/auth/register', { body: { username: b, password: 'secret123' } })).json.token;
        assert.deepEqual((await call('GET', '/api/xp/first-place', { token: tokenFpA })).json.allTime.current, 0, 'alone: no streak');
        await call('POST', '/api/users/friends', { token: tokenFpA, body: { friendUsername: b } });
        const task = await call('POST', '/api/tasks', { token: tokenFpA, body: { name: 'lead', duration: 60, productivity: 4, difficulty: 3, category: 'other' } });
        await call('POST', `/api/tasks/${task.json.id}/complete`, { token: tokenFpA });
        const result = (await call('GET', '/api/xp/first-place', { token: tokenFpA })).json;
        assert.equal(result.allTime.isFirst, true);
        assert.equal(result.allTime.current, 1);
        assert.equal(result.allTime.record, 1);
        assert.equal(result.weekly.isFirst, true);
        assert.equal(result.weekly.unit, 'week');
        const other = (await call('GET', '/api/xp/first-place', { token: tokenFpB })).json;
        assert.equal(other.allTime.isFirst, false);
        assert.equal(other.weekly.current, 0, 'friends are directional: B has no friends, so no race');
        assert.equal((await call('GET', '/api/xp/first-place')).status, 401);
        await query("DELETE FROM users WHERE username LIKE 'fp\\_%'");
    });
    await t.test('rank-up bonus is 1% of the rank threshold, paid once per rank', async () => {
        const { query } = require('../backend/utils/database');
        const name = `rankup_${suffix}`;
        const token = (await call('POST', '/api/auth/register', { body: { username: name, password: 'secret123' } })).json.token;
        const userId = (await query('SELECT id FROM users WHERE username = $1', [name])).rows[0].id;
        await backdatedTask(query, userId, 350, "NOW() - INTERVAL '3 days'");
        await query('UPDATE users SET xp = 350 WHERE id = $1', [userId]);
        const paid = async () => (await query("SELECT COALESCE(SUM(xp_amount), 0)::int AS sum, COUNT(*)::int AS rows FROM xp_history WHERE user_id = $1 AND source = 'rank_up'", [userId])).rows[0];
        const task = await call('POST', '/api/tasks', { token, body: { name: 'cross', duration: 60, productivity: 5, difficulty: 5, category: 'other' } }); // 37 XP: 350 -> 387
        const done = await call('POST', `/api/tasks/${task.json.id}/complete`, { token });
        assert.equal(done.json.rankBonus, 4, '1% of 360 = 3.6, rounded');
        const me = (await call('GET', '/api/auth/me', { token })).json;
        assert.equal(me.rank, 'Bronze');
        assert.equal(me.xp, 350 + 37 + 4, 'task XP + rank bonus (37 XP today is below the daily goal)');
        assert.deepEqual(await paid(), { sum: 4, rows: 1 });
        // drop below Bronze and climb again: no second payment
        await call('PUT', `/api/tasks/${task.json.id}`, { token, body: { completed: false } });
        const again = await call('POST', `/api/tasks/${task.json.id}/complete`, { token });
        assert.equal(again.json.rankBonus, 0);
        assert.deepEqual(await paid(), { sum: 4, rows: 1 });
        const history = (await call('GET', '/api/xp?limit=10', { token })).json.history;
        assert.ok(history.some((row) => row.source === 'rank_up' && row.xp_amount === 4), 'listed in the XP activity');
        assert.equal((await query('SELECT COUNT(*)::int AS n FROM v_user_integrity WHERE username = $1', [name])).rows[0].n, 0);
        const rank = require('../backend/services/rankService');
        assert.equal(rank.calculateRankBonus('Master'), 100);
    });

    await t.test('AI rating fills the offline / with friends bonus and names the task in the chosen language', async () => {
        const http = require('node:http');
        const seen = [];
        let reply = { name: 'Jogging', duration: 30, productivity: 4, difficulty: 3, category: 'exercise', bonus: true };
        const fake = http.createServer((req, res) => {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                seen.push(JSON.parse(body));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
            });
        });
        await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
        const previous = { key: process.env.GROQ_API_KEY, url: process.env.GROQ_BASE_URL };
        process.env.GROQ_API_KEY = 'test-key';
        process.env.GROQ_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
        try {
            const token = (await call('POST', '/api/auth/register', { body: { username: `ai_${suffix}`, password: 'secret123' } })).json.token;
            const withFriends = await call('POST', '/api/groq', { token, body: { description: 'jogging with a friend', language: 'de' } });
            assert.equal(withFriends.status, 200);
            assert.equal(withFriends.json.bonus, 3);
            assert.equal(withFriends.json.xp, 13, 'bonus is part of the XP: 12 base + 1.2 (3 capped at 10%) = 13');
            assert.match(seen[0].messages[0].content, /German/);
            assert.match(seen[0].messages[0].content, /"bonus":true or false/);
            reply = { name: 'Coding', duration: 60, productivity: 5, difficulty: 4, category: 'deep-work', bonus: false };
            const alone = await call('POST', '/api/groq', { token, body: { description: 'coding', language: 'en' } });
            assert.equal(alone.json.bonus, 0);
            assert.match(seen[1].messages[0].content, /English/);
            reply = { name: 'x', duration: 10, productivity: 3, difficulty: 3, category: 'other', bonus: 'yes please' };
            assert.equal((await call('POST', '/api/groq', { token, body: { description: 'odd answer' } })).json.bonus, 0, 'only a real true counts');
        } finally {
            if (previous.key === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous.key;
            if (previous.url === undefined) delete process.env.GROQ_BASE_URL; else process.env.GROQ_BASE_URL = previous.url;
            await new Promise((resolve) => fake.close(resolve));
        }
    });
    await t.test('a reserved admin name can be registered again while no admin exists', async () => {
        const { query } = require('../backend/utils/database');
        const owner = `owner_${suffix}`;
        const previous = process.env.ADMIN_USERNAMES;
        process.env.ADMIN_USERNAMES = owner;
        try {
            await query('UPDATE users SET is_admin = false');
            const register = (username) => call('POST', '/api/auth/register', { body: { username, password: 'secret123' } });
            const first = await register(owner);
            assert.equal(first.status, 201, 'the owner can claim the name when no admin exists');
            assert.equal((await call('GET', '/api/auth/me', { token: first.json.token })).json.isAdmin, true);
            assert.equal((await call('GET', '/api/admin/tables', { token: first.json.token })).status, 200);
            await query('DELETE FROM users WHERE username = $1', [owner]);
            await register(`boss_${suffix}`);
            await query('UPDATE users SET is_admin = true WHERE username = $1', [`boss_${suffix}`]);
            assert.equal((await register(owner)).status, 409, 'with an admin present the name stays reserved');
        } finally {
            if (previous === undefined) delete process.env.ADMIN_USERNAMES; else process.env.ADMIN_USERNAMES = previous;
        }
    });
});
