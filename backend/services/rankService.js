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

async function recalculateUserRank(userId, userModel) {
    const totalXp = await userModel.getTotalXp ? await userModel.getTotalXp(userId) : 0;
    const rank = getRankName(totalXp);
    const level = getLevel(totalXp);
    return { totalXp, rank, level };
}

const RANK_MULTIPLIERS = {
    Newcomer: 1.5,
    Bronze: 1.3,
    Silver: 1.1,
    Gold: 1.0,
    Platinum: 0.8,
    Diamond: 0.7,
    Master: 0.6
};

function getRankMultiplier(rank) {
    return RANK_MULTIPLIERS[rank] || 1.0;
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
    recalculateUserRank,
    getRankMultiplier
};