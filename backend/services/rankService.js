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
// Effective time follows a saturating exponential curve: the first minute is worth maxMinutes / tauMinutes (about
// 1.15 effective minutes) and every further minute is worth exponentially less (e^(-t/tau)), so minute 1 is worth far
// more than minute 100 or 200 and very long entries hit a ceiling of maxMinutes. The bonus is capped at 10% of the base.
// 0 productivity = 0 XP. Tasks under 30 minutes round down; from 10 minutes a productive task gives at least 1 XP.
const XP_FORMULA = { baseRate: 12, maxMinutes: 276, tauMinutes: 240, bonusCap: 0.1, shortMinutes: 30, minPayMinutes: 10 };

function effectiveMinutes(duration) {
    return XP_FORMULA.maxMinutes * (1 - Math.exp(-duration / XP_FORMULA.tauMinutes));
}

// Money made (euros, slider 0-100, 100 = "100+"): a flat XP bonus by tier, not subject to the 10% bonus cap.
// 1-9 EUR a tiny bonus, from 10 a bonus, from 50 a bigger one, from 100 the maximum.
const MONEY_BONUS = { maxEuro: 100, tiers: [{ min: 100, xp: 10 }, { min: 50, xp: 6 }, { min: 10, xp: 3 }, { min: 1, xp: 1 }] };

function calculateMoneyBonus(money) {
    const euro = Math.min(Number(money) || 0, MONEY_BONUS.maxEuro);
    const tier = MONEY_BONUS.tiers.find((entry) => euro >= entry.min);
    return tier ? tier.xp : 0;
}

// Short tasks round down so that rounding cannot be farmed: a 10-minute p3d3 task pays its XP rounded down, many of
// them would otherwise beat one longer task. From shortMinutes on the rounding error is small.
function roundXp(total, duration) {
    if (duration >= XP_FORMULA.shortMinutes) return Math.max(1, Math.round(total));
    return duration >= XP_FORMULA.minPayMinutes ? Math.max(1, Math.floor(total)) : Math.floor(total);
}

function calculateXpFromTask(duration, productivity, difficulty, bonus = 0, money = 0) {
    if (!productivity) return 0;
    const base = (XP_FORMULA.baseRate + productivity * difficulty) * effectiveMinutes(duration) / 60;
    const total = base + Math.min(bonus, base * XP_FORMULA.bonusCap) + calculateMoneyBonus(money);
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
const WEEKLY_TROPHY = { xp: 50, minWeekXp: 50, minPlayers: 2, firstWeek: '2026-09-28' };

// Extra XP on a task marked "offline or with friends" (the checkbox in the task dialog, also set by the AI rating).
const TASK_BONUS = 3;

// Rank-up bonus: reaching a rank pays 1% of the XP that rank needs (Bronze 360 -> 4, Silver 11, Gold 22, Platinum 43,
// Diamond 86), at most 100 (Master). Paid once per rank and user, never again after dropping below and climbing back.
const RANK_BONUS = { rate: 0.01, max: 100 };

function calculateRankBonus(rankName) {
    const rank = RANK_THRESHOLDS.find((entry) => entry.name === rankName);
    if (!rank || rank.min <= 0) return 0;
    return Math.min(RANK_BONUS.max, Math.round(rank.min * RANK_BONUS.rate));
}

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
        rankBonus: { ...RANK_BONUS },
        taskBonus: TASK_BONUS,
        moneyBonus: { maxEuro: MONEY_BONUS.maxEuro, tiers: MONEY_BONUS.tiers.map((tier) => ({ ...tier })) },
        weeklyTrophy: { xp: WEEKLY_TROPHY.xp, minWeekXp: WEEKLY_TROPHY.minWeekXp, minPlayers: WEEKLY_TROPHY.minPlayers }
    };
}

module.exports = {
    RANK_THRESHOLDS,
    XP_FORMULA,
    MULTIPLIER,
    GOAL_BONUS,
    RANK_BONUS,
    TASK_BONUS,
    MONEY_BONUS,
    calculateMoneyBonus,
    WEEKLY_TROPHY,
    calculateGoalBonus,
    calculateRankBonus,
    getRankInfo,
    getRankName,
    getProgressPercent,
    getLevel,
    getXpForNextRank,
    calculateXpFromTask,
    computePositionMultiplier,
    getMeta
};
