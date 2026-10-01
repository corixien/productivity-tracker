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

    await t.test('templates and recurring tasks', async () => {
        const created = await call('POST', '/api/users/quick-tasks', { token: tokenA, body: { name: 'Daily reading', duration: 20, productivity: 3, recurrence: 'daily' } });
        assert.equal(created.status, 201);
        const list = await call('GET', '/api/users/quick-tasks', { token: tokenA });
        assert.equal(list.json.length, 1);
        const first = await call('POST', '/api/users/quick-tasks/spawn-recurring', { token: tokenA });
        assert.equal(first.json.tasks.length, 1);
        assert.equal(first.json.tasks[0].name, 'Daily reading');
        const again = await call('POST', '/api/users/quick-tasks/spawn-recurring', { token: tokenA });
        assert.equal(again.json.tasks.length, 0);
        const used = await call('POST', `/api/users/quick-tasks/${created.json.id}/use`, { token: tokenA });
        assert.equal(used.status, 201);
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

    await t.test('deleting a completed task removes its XP', async () => {
        const del = await call('DELETE', `/api/tasks/${taskId}`, { token: tokenA });
        assert.equal(del.status, 200);
        assert.equal(del.json.newXP, 0);
        assert.equal((await call('DELETE', `/api/tasks/${taskId}`, { token: tokenA })).status, 404);
        assert.equal((await call('DELETE', '/api/tasks/not-a-uuid', { token: tokenA })).status, 400);
    });
});
