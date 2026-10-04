const RANK_THRESHOLDS = [
    { name: 'Newcomer', min: 0, next: 360 },
    { name: 'Bronze', min: 360, next: 1080 },
    { name: 'Silver', min: 1080, next: 2160 },
    { name: 'Gold', min: 2160, next: 4320 },
    { name: 'Platinum', min: 4320, next: 8640 },
    { name: 'Diamond', min: 8640, next: 18000 },
    { name: 'Master', min: 18000, next: null }
];

function getRankInfo(xp) {
    let currentRank = RANK_THRESHOLDS[0];
    for (const rank of RANK_THRESHOLDS) {
        if (xp >= rank.min) {
            currentRank = rank;
        }
    }
    return currentRank;
}

function getRankName(xp) {
    return getRankInfo(xp).name;
}

function getProgressPercent(xp) {
    const current = getRankInfo(xp);
    if (!current.next) return 100;
    const range = current.next - current.min;
    const progress = xp - current.min;
    return Math.min(100, Math.max(0, (progress / range) * 100));
}

function getLevel(xp) {
    return Math.floor(xp / 100);
}

function getXpForNextRank(xp) {
    const current = getRankInfo(xp);
    if (!current.next) return current.min;
    return current.next;
}

// Task XP = (baseRate + productivity x difficulty) XP per hour of effective time.
// Effective time: full up to 120 min, half weight for minutes 120-360, a quarter after that, so splitting
// work into tiny tasks gains nothing and very long entries have diminishing returns. The bonus is capped
// at 10% of the base so it cannot be farmed with tiny tasks. 0 productivity = 0 XP. Tasks under 10 minutes round
// down (no rounding gain from spamming 1-minute tasks); longer productive tasks give at least 1 XP.
const XP_FORMULA = { baseRate: 12, fullMinutes: 120, halfUntilMinutes: 360, bonusCap: 0.1, shortMinutes: 30, minPayMinutes: 10 };

function effectiveMinutes(duration) {
    const { fullMinutes, halfUntilMinutes } = XP_FORMULA;
    return Math.min(duration, fullMinutes)
        + 0.5 * Math.min(Math.max(duration - fullMinutes, 0), halfUntilMinutes - fullMinutes)
        + 0.25 * Math.max(duration - halfUntilMinutes, 0);
}

// Short tasks round down so that rounding cannot be farmed: a 10-minute p3d3 task is 3.5 XP, and twelve of them
// would pay 48 instead of the 42 of one two-hour task. From shortMinutes on the rounding error is at most about 8%, and under 4% for typical tasks.
function roundXp(total, duration) {
    if (duration >= XP_FORMULA.shortMinutes) return Math.max(1, Math.round(total));
    return duration >= XP_FORMULA.minPayMinutes ? Math.max(1, Math.floor(total)) : Math.floor(total);
}

function calculateXpFromTask(duration, productivity, difficulty, bonus = 0) {
    if (!productivity) return 0;
    const base = (XP_FORMULA.baseRate + productivity * difficulty) * effectiveMinutes(duration) / 60;
    const total = base + Math.min(bonus, base * XP_FORMULA.bonusCap);
    return roundXp(total, duration);
}

// Catch-up multiplier (position among you and your friends), a smooth function of the XP gap:
// ((average friend XP + s) / (own XP + s)) ^ exponent, clamped to [min, max]. Equal XP = 1.0, behind > 1, ahead < 1.
// Alone, or no friends: 1.0. The smoothing keeps brand-new accounts from jumping to the extremes.
const MULTIPLIER = { smoothing: 150, exponent: 0.4, min: 0.85, max: 1.3 };

function computePositionMultiplier(ownXp, friendXpTotal, friendCount) {
    if (!friendCount) return 1.0;
    const ratio = ((friendXpTotal / friendCount) + MULTIPLIER.smoothing) / (ownXp + MULTIPLIER.smoothing);
    const value = Math.pow(ratio, MULTIPLIER.exponent);
    return Math.round(Math.min(MULTIPLIER.max, Math.max(MULTIPLIER.min, value)) * 100) / 100;
}

// Daily goal bonus: reaching the daily XP goal pays goalRate x goal (at least min, at most max), so a higher goal
// pays more but never more than a tenth of the XP it took to reach it. Paid once per local day, taken back when the
// day's XP falls below the goal again (undo, delete, edit, goal raised).
const GOAL_BONUS = { rate: 0.1, min: 1, max: 100 };

// Weekly trophy: the player with the most task XP in the finished week (Monday to Sunday, TROPHY_TIMEZONE) gets xp.
// Needs at least minWeekXp and a second player with XP, so a quiet week or a solo player earns nothing.
// 2nd and 3rd place get nothing. Weeks before firstWeek are never awarded.
const WEEKLY_TROPHY = { xp: 75, minWeekXp: 50, minPlayers: 2, firstWeek: '2026-09-28' };

function calculateGoalBonus(goal) {
    if (!goal || goal <= 0) return 0;
    return Math.min(GOAL_BONUS.max, Math.max(GOAL_BONUS.min, Math.round(goal * GOAL_BONUS.rate)));
}

function getMeta() {
    return {
        ranks: RANK_THRESHOLDS.map((rank) => ({ ...rank })),
        xpPerLevel: 100,
        xpFormula: { ...XP_FORMULA },
        multiplier: { ...MULTIPLIER },
        goalBonus: { ...GOAL_BONUS },
        weeklyTrophy: { xp: WEEKLY_TROPHY.xp, minWeekXp: WEEKLY_TROPHY.minWeekXp, minPlayers: WEEKLY_TROPHY.minPlayers }
    };
}

module.exports = {
    RANK_THRESHOLDS,
    XP_FORMULA,
    MULTIPLIER,
    GOAL_BONUS,
    WEEKLY_TROPHY,
    calculateGoalBonus,
    getRankInfo,
    getRankName,
    getProgressPercent,
    getLevel,
    getXpForNextRank,
    calculateXpFromTask,
    computePositionMultiplier,
    getMeta
};
