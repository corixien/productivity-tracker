const RANK_THRESHOLDS = [
    { name: 'Newcomer', min: 0, next: 100 },
    { name: 'Bronze', min: 100, next: 300 },
    { name: 'Silver', min: 300, next: 600 },
    { name: 'Gold', min: 600, next: 1200 },
    { name: 'Platinum', min: 1200, next: 2400 },
    { name: 'Diamond', min: 2400, next: 5000 },
    { name: 'Master', min: 5000, next: null }
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
const XP_FORMULA = { baseRate: 12, fullMinutes: 120, halfUntilMinutes: 360, bonusCap: 0.1, shortMinutes: 10 };

function effectiveMinutes(duration) {
    const { fullMinutes, halfUntilMinutes } = XP_FORMULA;
    return Math.min(duration, fullMinutes)
        + 0.5 * Math.min(Math.max(duration - fullMinutes, 0), halfUntilMinutes - fullMinutes)
        + 0.25 * Math.max(duration - halfUntilMinutes, 0);
}

function calculateXpFromTask(duration, productivity, difficulty, bonus = 0) {
    if (!productivity) return 0;
    const base = (XP_FORMULA.baseRate + productivity * difficulty) * effectiveMinutes(duration) / 60;
    const total = base + Math.min(bonus, base * XP_FORMULA.bonusCap);
    return duration < XP_FORMULA.shortMinutes ? Math.floor(total) : Math.max(1, Math.round(total));
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

function getMeta() {
    return {
        ranks: RANK_THRESHOLDS.map((rank) => ({ ...rank })),
        xpPerLevel: 100,
        xpFormula: { ...XP_FORMULA },
        multiplier: { ...MULTIPLIER }
    };
}

module.exports = {
    RANK_THRESHOLDS,
    XP_FORMULA,
    MULTIPLIER,
    getRankInfo,
    getRankName,
    getProgressPercent,
    getLevel,
    getXpForNextRank,
    calculateXpFromTask,
    computePositionMultiplier,
    getMeta
};
