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

function calculateXpFromTask(duration, productivity, difficulty, bonus = 0) {
    if (productivity === 0) return 0;
    return Math.round((productivity * difficulty) + (duration / 5) + bonus);
}

const RANK_MULTIPLIERS = {
    Newcomer: 1.0,
    Bronze: 0.95,
    Silver: 0.9,
    Gold: 0.85,
    Platinum: 0.8,
    Diamond: 0.75,
    Master: 0.7
};

function getRankMultiplier(rank) {
    return RANK_MULTIPLIERS[rank] || 1.0;
}

// Position multiplier (catch-up mechanic): the member with the least XP in the friend group gets 1.5,
// the leader gets 0.7.
// lowerCount = group members with less XP than the user, total = group size including the user.
function computePositionMultiplier(lowerCount, total) {
    if (total <= 1) return 1.0;
    return 1.5 - (lowerCount / (total - 1)) * 0.8;
}

function getMeta() {
    return {
        ranks: RANK_THRESHOLDS.map((rank) => ({ ...rank, multiplier: RANK_MULTIPLIERS[rank.name] })),
        xpPerLevel: 100,
        xpFormula: { durationDivisor: 5 }
    };
}

module.exports = {
    RANK_THRESHOLDS,
    RANK_MULTIPLIERS,
    getRankInfo,
    getRankName,
    getProgressPercent,
    getLevel,
    getXpForNextRank,
    calculateXpFromTask,
    computePositionMultiplier,
    getMeta,
    getRankMultiplier
};
