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
    assert.equal(rank.getRankName(359), 'Newcomer');
    assert.equal(rank.getRankName(360), 'Bronze');
    assert.equal(rank.getRankName(17999), 'Diamond');
    assert.equal(rank.getRankName(18000), 'Master');
    assert.equal(rank.getLevel(250), 2);
    assert.equal(rank.getProgressPercent(540), 25);
    assert.equal(rank.getProgressPercent(99999), 100);
    // proportional to the old 100/300/600/1200/2400/5000 ladder (x3.6): Master after about a year at 50 XP per day
    assert.deepEqual(rank.RANK_THRESHOLDS.map((r) => r.min), [0, 360, 1080, 2160, 4320, 8640, 18000]);
    assert.ok(Math.abs(18000 / 50 - 365) < 10);
});

test('task XP formula: (12 + productivity x difficulty) per hour, diminishing for long tasks', () => {
    assert.equal(rank.calculateXpFromTask(60, 4, 3, 0), 24);
    assert.equal(rank.calculateXpFromTask(30, 4, 3, 0), 12);
    assert.equal(rank.calculateXpFromTask(30, 0, 3, 0), 0);
    assert.equal(rank.calculateXpFromTask(60, 5, 5, 0), 37);
    assert.equal(rank.calculateXpFromTask(10, 1, 1, 0), 2);
    assert.equal(rank.calculateXpFromTask(15, 1, 1, 0), 3);
    assert.equal(rank.calculateXpFromTask(1, 5, 5, 0), 0, 'under 10 minutes rounds down');
    // 3 h: 120 full + 60 min at half weight = 150 effective minutes
    assert.equal(rank.calculateXpFromTask(180, 5, 4, 0), 80);
});

test('task XP cannot be farmed by splitting or padding', () => {
    const whole = rank.calculateXpFromTask(60, 5, 5, 3);
    const split = 12 * rank.calculateXpFromTask(5, 5, 5, 3);
    assert.ok(split <= whole + 6, `12 five-minute tasks (${split}) must not beat one hour (${whole})`);
    assert.ok(rank.calculateXpFromTask(1440, 1, 1, 0) < 150, 'a 24 h low-value entry stays small');
    assert.ok(60 * rank.calculateXpFromTask(1, 5, 5, 3) <= whole, 'sixty one-minute tasks must not beat one hour');
    // the bonus is capped at 10% of the base
    assert.equal(rank.calculateXpFromTask(60, 4, 3, 3), 26);
    assert.equal(rank.calculateXpFromTask(5, 4, 3, 3), 2);
});

test('catch-up multiplier: smooth in the XP gap, clamped to 0.85-1.3', () => {
    const m = rank.computePositionMultiplier;
    assert.equal(m(500, 0, 0), 1.0, 'no friends');
    assert.equal(m(500, 500, 1), 1.0, 'equal XP');
    assert.equal(m(0, 0, 3), 1.0, 'everyone at zero');
    assert.equal(m(0, 3000, 1), 1.3, 'far behind hits the cap');
    assert.equal(m(3000, 0, 1), 0.85, 'far ahead hits the floor');
    assert.ok(m(500, 600, 1) > 1 && m(500, 400, 1) < 1);
    assert.ok(Math.abs(m(500, 501, 1) - m(501, 500, 1)) < 0.02, 'one XP changes almost nothing (no rank-flip cliff)');
    // average of several friends
    assert.equal(m(100, 300, 3), m(100, 100, 1));
});

test('meta exposes ranks and the formula constants', () => {
    const meta = rank.getMeta();
    assert.equal(meta.ranks.length, 7);
    assert.equal(meta.xpFormula.baseRate, 12);
    assert.equal(meta.multiplier.max, 1.3);
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

test('daily goal bonus scales with the goal and stays within its bounds', () => {
    assert.equal(rank.calculateGoalBonus(50), 5);
    assert.equal(rank.calculateGoalBonus(100), 10);
    assert.equal(rank.calculateGoalBonus(200), 20);
    assert.equal(rank.calculateGoalBonus(10), 1);
    assert.equal(rank.calculateGoalBonus(5000), rank.GOAL_BONUS.max);
    assert.equal(rank.calculateGoalBonus(0), 0);
    for (let goal = 10; goal <= 5000; goal += 10) {
        assert.ok(rank.calculateGoalBonus(goal) <= goal * 0.1 + 0.5 || rank.calculateGoalBonus(goal) === rank.GOAL_BONUS.max, 'never more than a tenth of the goal');
    }
    assert.equal(rank.getMeta().weeklyTrophy.xp, rank.WEEKLY_TROPHY.xp);
});

test('task XP never decreases with duration, productivity or difficulty', () => {
    for (let p = 0; p <= 5; p += 1) {
        for (let d = 1; d <= 5; d += 1) {
            let previous = -1;
            for (let minutes = 1; minutes <= 1440; minutes += 1) {
                const xp = rank.calculateXpFromTask(minutes, p, d, 0);
                assert.ok(xp >= previous, `duration p${p} d${d} ${minutes}min`);
                previous = xp;
            }
        }
    }
    for (const minutes of [5, 10, 29, 30, 60, 240]) {
        for (let d = 1; d <= 5; d += 1) {
            for (let p = 1; p <= 5; p += 1) {
                assert.ok(rank.calculateXpFromTask(minutes, p, d) >= rank.calculateXpFromTask(minutes, p - 1, d));
                if (d > 1) assert.ok(rank.calculateXpFromTask(minutes, p, d) >= rank.calculateXpFromTask(minutes, p, d - 1));
            }
        }
    }
});

test('splitting work into several tasks gains at most the rounding error', () => {
    let worst = 0;
    for (let p = 1; p <= 5; p += 1) {
        for (let d = 1; d <= 5; d += 1) {
            for (const total of [30, 60, 90, 120]) {
                for (const part of [10, 15, 20, 30, 40, 45, 60]) {
                    if (part >= total || total % part) continue;
                    const split = (total / part) * rank.calculateXpFromTask(part, p, d);
                    worst = Math.max(worst, split / rank.calculateXpFromTask(total, p, d));
                }
            }
        }
    }
    assert.ok(worst <= 1.08, `split gain ${worst}`);
    // tasks under 30 minutes round down, so a 10-minute p3d3 task (3.5 XP) pays 3
    assert.equal(rank.calculateXpFromTask(10, 3, 3), 3);
    assert.equal(rank.calculateXpFromTask(10, 1, 1), 2);
    assert.equal(rank.calculateXpFromTask(30, 3, 3), 11);
    // very long entries pay less per hour than focused blocks
    assert.ok(rank.calculateXpFromTask(480, 3, 3) < 4 * rank.calculateXpFromTask(120, 3, 3));
});

test('catch-up multiplier is bounded, falls with own XP, rises with friend XP and moves gently', () => {
    const { min, max } = rank.MULTIPLIER;
    for (const friends of [0, 50, 500, 3000, 18000]) {
        let previous = Infinity;
        for (let own = 0; own <= 20000; own += 1) {
            const value = rank.computePositionMultiplier(own, friends, 1);
            assert.ok(value >= min && value <= max);
            assert.ok(value <= previous + 1e-9, `own ${own}, friends ${friends}`);
            assert.ok(previous === Infinity || previous - value <= 0.011, 'one XP moves it by at most one rounding step');
            previous = value;
        }
    }
    for (let own = 0; own <= 5000; own += 50) {
        let previous = 0;
        for (let friends = 0; friends <= 20000; friends += 25) {
            const value = rank.computePositionMultiplier(own, friends, 1);
            assert.ok(value >= previous - 1e-9);
            previous = value;
        }
    }
    assert.equal(rank.computePositionMultiplier(1234, 1234, 1), 1);
    assert.equal(rank.computePositionMultiplier(1234, 0, 0), 1, 'no friends = no multiplier');
    assert.equal(rank.computePositionMultiplier(1000, 3000, 2), rank.computePositionMultiplier(1000, 1500, 1), 'uses the friend average');
});

test('first place streaks: all-time by day, weekly by week, current and record', () => {
    const { computeFirstPlace, runs } = require('../backend/services/firstPlaceService');
    assert.deepEqual(runs([true, true, false, true, true, true]), { current: 3, record: 3, isFirst: true });
    assert.deepEqual(runs([true, true, true, false]), { current: 3, record: 3, isFirst: false }, 'an open period that is not won keeps the finished streak alive');
    assert.deepEqual(runs([false, false]), { current: 0, record: 0, isFirst: false });
    assert.deepEqual(runs([]), { current: 0, record: 0, isFirst: false });

    const names = new Map([['me', 'me'], ['ann', 'ann']]);
    const result = computeFirstPlace({
        selfId: 'me', names, today: '2026-10-06', thisWeek: '2026-10-05',
        daily: [
            { id: 'me', period: '2026-10-01', xp: 50 }, { id: 'ann', period: '2026-10-01', xp: 40 },
            { id: 'me', period: '2026-10-02', xp: 10 }, { id: 'ann', period: '2026-10-02', xp: 5 },
            { id: 'ann', period: '2026-10-04', xp: 100 },
            { id: 'me', period: '2026-10-05', xp: 100 }
        ],
        weekly: [
            { id: 'me', period: '2026-09-21', xp: 80 }, { id: 'ann', period: '2026-09-21', xp: 70 },
            { id: 'me', period: '2026-09-28', xp: 90 }, { id: 'ann', period: '2026-09-28', xp: 60 },
            { id: 'ann', period: '2026-10-05', xp: 20 }
        ]
    });
    // totals: me 50/60/60/60/160/160, ann 40/45/45/145/145/145: me led days 1-3, ann day 4, me from day 5
    assert.deepEqual(result.allTime, { unit: 'day', current: 2, record: 3, isFirst: true });
    // weeks: me, me, then ann leads the open week: the streak of 2 stays alive, not first right now
    assert.deepEqual(result.weekly, { unit: 'week', current: 2, record: 2, isFirst: false });
    // alone, or nobody active: nothing
    assert.deepEqual(computeFirstPlace({ selfId: 'me', names: new Map([['me', 'me']]), daily: [{ id: 'me', period: '2026-10-01', xp: 5 }], weekly: [], today: '2026-10-01', thisWeek: '2026-09-28' }).allTime.current, 0);
});
