const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';
process.env.LOG_DIR = process.env.LOG_DIR || require('os').tmpdir();

const rank = require('../backend/services/rankService');
const { computeStreaks } = require('../backend/models/Task');
const { createRateLimiter } = require('../backend/middleware/rateLimiter');
const { generateToken, verifyToken, tokenMatchesVersion } = require('../backend/utils/jwt');
const { isValidTimeZone } = require('../backend/middleware/timezone');
const { validateQuickTask, validateChangePassword, validateSettings } = require('../backend/middleware/validation');

function run(middleware, req) {
    return new Promise((resolve) => {
        const res = {
            set() { return this; },
            status(code) { this.code = code; return this; },
            json(body) { resolve({ code: this.code, body }); }
        };
        middleware(req, res, () => resolve({ next: true, req }));
    });
}

test('rank thresholds and levels', () => {
    assert.equal(rank.getRankName(0), 'Newcomer');
    assert.equal(rank.getRankName(99), 'Newcomer');
    assert.equal(rank.getRankName(100), 'Bronze');
    assert.equal(rank.getRankName(5000), 'Master');
    assert.equal(rank.getLevel(250), 2);
    assert.equal(rank.getProgressPercent(150), 25);
    assert.equal(rank.getProgressPercent(9999), 100);
});

test('task XP formula', () => {
    assert.equal(rank.calculateXpFromTask(30, 4, 3, 0), 18);
    assert.equal(rank.calculateXpFromTask(30, 0, 3, 0), 0);
    assert.equal(rank.calculateXpFromTask(60, 5, 4, 3), 35);
});

test('position multiplier: leader gets least, last place gets most', () => {
    assert.equal(rank.computePositionMultiplier(0, 1), 1.0);
    assert.equal(rank.computePositionMultiplier(0, 3), 1.5);
    assert.equal(rank.computePositionMultiplier(2, 3), 0.7);
    assert.ok(Math.abs(rank.computePositionMultiplier(1, 3) - 1.1) < 1e-9);
});

test('meta exposes ranks with multipliers', () => {
    const meta = rank.getMeta();
    assert.equal(meta.ranks.length, 7);
    assert.equal(meta.ranks[6].multiplier, 0.7);
});

function days(start, count) {
    return Array.from({ length: count }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
}

test('streaks', () => {
    assert.deepEqual(computeStreaks([], '2026-10-01'), { current: 0, longest: 0, freezes: 0, frozenDates: [] });
    assert.equal(computeStreaks(['2026-10-01', '2026-09-30', '2026-09-29'], '2026-10-01').current, 3);
    assert.equal(computeStreaks(['2026-09-30', '2026-09-29'], '2026-10-01').current, 2, 'alive until end of today');
    assert.equal(computeStreaks(['2026-09-29'], '2026-10-01').current, 0, 'broken after a missed day');
    assert.equal(computeStreaks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10'], '2026-10-01').longest, 3);
    assert.equal(computeStreaks(['2026-02-28', '2026-03-01'], '2026-03-01').current, 2, 'month boundary');
});

test('ice streaks: earned every 7 days, max 3, spent on missed days', () => {
    const week = days('2026-09-01', 7);
    assert.equal(computeStreaks(week, '2026-09-07').freezes, 1, 'earned on day 7');
    assert.equal(computeStreaks(days('2026-09-01', 6), '2026-09-06').freezes, 0);
    assert.equal(computeStreaks(days('2026-09-01', 28), '2026-09-28').freezes, 3, 'capped at 3');

    // 7 days, miss day 8 (ice spent), back on day 9: streak survives
    const saved = computeStreaks([...week, '2026-09-09'], '2026-09-09');
    assert.equal(saved.current, 8);
    assert.equal(saved.freezes, 0);
    assert.deepEqual(saved.frozenDates, ['2026-09-08']);

    // today still open: yesterday missed spends ice, streak alive
    const open = computeStreaks(week, '2026-09-09');
    assert.equal(open.current, 7);
    assert.deepEqual(open.frozenDates, ['2026-09-08']);

    // 14 days earn 2 ice streaks; 3 missed days: two saved, the third breaks it
    const fortnight = days('2026-09-01', 14);
    const broken = computeStreaks(fortnight, '2026-09-18');
    assert.equal(broken.current, 0);
    assert.equal(broken.freezes, 0);
    assert.equal(computeStreaks(fortnight, '2026-09-17').current, 14, 'two missed days are covered');
});

test('rate limiter blocks after max and resets', async () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, keyFn: (req) => req.key });
    const hit = (key) => run(limiter, { key });
    assert.ok((await hit('a')).next);
    assert.ok((await hit('a')).next);
    const blocked = await hit('a');
    assert.equal(blocked.code, 429);
    assert.equal(blocked.body.code, 'rate_limited');
    assert.ok((await hit('b')).next, 'other keys unaffected');
    limiter.reset('a');
    assert.ok((await hit('a')).next);
});

test('token version revokes old tokens', () => {
    const token = generateToken({ userId: 'u1', username: 'x', tv: 0 });
    const decoded = verifyToken(token);
    assert.equal(decoded.userId, 'u1');
    assert.ok(tokenMatchesVersion(decoded, 0));
    assert.ok(!tokenMatchesVersion(decoded, 1));
    const legacy = verifyToken(generateToken({ userId: 'u1', username: 'x' }));
    assert.ok(tokenMatchesVersion(legacy, 0), 'tokens without tv count as version 0');
    assert.equal(verifyToken('garbage'), null);
});

test('timezone validation', () => {
    assert.ok(isValidTimeZone('Europe/Berlin'));
    assert.ok(isValidTimeZone('UTC'));
    assert.ok(!isValidTimeZone('Not/AZone'));
    assert.ok(!isValidTimeZone("'; DROP TABLE users;--"));
    assert.ok(!isValidTimeZone(undefined));
});

test('quick task validation', async () => {
    const ok = await run(validateQuickTask, { method: 'POST', body: { name: ' Read ', duration: '20' } });
    assert.ok(ok.next);
    assert.deepEqual(ok.req.body, { name: 'Read', duration: 20, productivity: 0, difficulty: 3, category: 'other', bonus: 0 });
    const bad = await run(validateQuickTask, { method: 'POST', body: { name: 'x', duration: 5000 } });
    assert.equal(bad.code, 400);
    const partial = await run(validateQuickTask, { method: 'PUT', body: { category: 'learning' } });
    assert.deepEqual(partial.req.body, { category: 'learning' });
});

test('password change requires current password', async () => {
    assert.equal((await run(validateChangePassword, { body: { newPassword: 'abcd' } })).code, 400);
    assert.equal((await run(validateChangePassword, { body: { currentPassword: 'x', newPassword: 'ab' } })).code, 400);
    assert.ok((await run(validateChangePassword, { body: { currentPassword: 'x', newPassword: 'abcd' } })).next);
});

test('settings validation', async () => {
    assert.equal((await run(validateSettings, { body: { dailyGoalXp: 5 } })).code, 400);
    assert.equal((await run(validateSettings, { body: { language: 'fr' } })).code, 400);
    const ok = await run(validateSettings, { body: { goals: ' be great ', dailyGoalXp: '80' } });
    assert.equal(ok.req.body.goals, 'be great');
    assert.equal(ok.req.body.dailyGoalXp, 80);
});
