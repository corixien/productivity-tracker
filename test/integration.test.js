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
        assert.equal(created.json.xp, 18);
        taskId = created.json.id;

        const done = await call('POST', `/api/tasks/${taskId}/complete`, { token: tokenA });
        assert.equal(done.json.newXP, 18);

        const stats = (await call('GET', '/api/xp/stats', { token: tokenA })).json;
        assert.equal(stats.streak.current, 1);
        assert.equal(stats.streak.activeToday, true);
        assert.equal(stats.today.xp, 18);
        assert.equal(stats.today.goal, 50);

        const history = (await call('GET', '/api/xp', { token: tokenA })).json;
        assert.equal(history.total, 18);
        assert.equal(history.history[0].task_name, 'Study');

        const undone = await call('PUT', `/api/tasks/${taskId}`, { token: tokenA, body: { completed: false } });
        assert.equal(undone.json.newXP, 0);
        await call('POST', `/api/tasks/${taskId}/complete`, { token: tokenA });
    });

    await t.test('editing a completed task re-prices its XP', async () => {
        const edited = await call('PUT', `/api/tasks/${taskId}`, { token: tokenA, body: { duration: 60, difficulty: 4 } });
        assert.equal(edited.status, 200);
        assert.equal(edited.json.xp, 28);
        assert.equal(edited.json.newXP, 28);
        const history = (await call('GET', '/api/xp', { token: tokenA })).json;
        assert.ok(history.history.some((row) => row.source === 'task_edit' && row.xp_amount === 10));
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

        // Leader gets the lowest position multiplier: XP is now scaled by it.
        const me = (await call('GET', '/api/auth/me', { token: tokenA })).json;
        assert.equal(Number(me.multiplier), 0.7);
        const second = await call('POST', '/api/tasks', { token: tokenA, body: { name: 'Second', duration: 30, productivity: 4, difficulty: 3 } });
        const done = await call('POST', `/api/tasks/${second.json.id}/complete`, { token: tokenA });
        assert.equal(done.json.xpEarned, Math.round(18 * 0.7));
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
        const list = await call('GET', '/api/users/quick-tasks', { token: tokenA });
        assert.equal(list.json.length, 1);
        const used = await call('POST', `/api/users/quick-tasks/${created.json.id}/use`, { token: tokenA });
        assert.equal(used.status, 201);
        assert.equal(used.json.name, 'Daily reading');
        assert.equal((await call('DELETE', `/api/users/quick-tasks/${created.json.id}`, { token: tokenA })).status, 200);
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
        for (const xp of [0, 99, 100, 299, 300, 599, 600, 1199, 1200, 2399, 2400, 4999, 5000, 9000]) {
            const { rows } = await query('SELECT rank_for_xp($1) AS rank', [xp]);
            assert.equal(rows[0].rank, getRankName(xp), `rank_for_xp(${xp})`);
        }

        await query('UPDATE users SET xp = 700 WHERE username = $1', [nameB]);
        assert.deepEqual(await rankOf(nameB), { xp: 700, level: 7, rank: 'Gold', tasks_completed: 0 });
        const audit = await query("SELECT xp_amount FROM xp_history WHERE source = 'admin_adjust' AND user_id = (SELECT id FROM users WHERE username = $1)", [nameB]);
        assert.equal(audit.rows[0].xp_amount, 700, 'direct xp edit is booked as an adjustment');

        await query("UPDATE users SET rank = 'Silver' WHERE username = $1", [nameB]);
        assert.deepEqual(await rankOf(nameB), { xp: 599, level: 5, rank: 'Silver', tasks_completed: 0 }, 'lowering the rank lowers xp');
        await query("UPDATE users SET rank = 'Diamond' WHERE username = $1", [nameB]);
        assert.equal((await rankOf(nameB)).xp, 2400, 'raising the rank raises xp');

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

        const edited = await call('PATCH', `/api/admin/tables/users/${key}`, { token: tokenC, body: { column: 'xp', value: 750 } });
        assert.equal(edited.status, 200);
        assert.equal(edited.json.row.xp, 750);
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
});
