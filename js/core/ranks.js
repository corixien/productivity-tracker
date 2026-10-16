import { state } from './state.js';

// Fallback mirrors backend/services/rankService.js; the server value from /api/meta wins.
const FALLBACK_RANKS = [
    { name: 'Newcomer', min: 0, next: 360 },
    { name: 'Bronze', min: 360, next: 1080 },
    { name: 'Silver', min: 1080, next: 2160 },
    { name: 'Gold', min: 2160, next: 4320 },
    { name: 'Platinum', min: 4320, next: 8640 },
    { name: 'Diamond', min: 8640, next: 18000 },
    { name: 'Master', min: 18000, next: null }
];

// Six badge images exist; Platinum reuses the silver one with a tint (see .is-platinum).
const BADGES = {
    Newcomer: 'newcomer',
    Bronze: 'bronze',
    Silver: 'silver',
    Gold: 'gold',
    Platinum: 'silver',
    Diamond: 'diamond',
    Master: 'master'
};

const ranks = () => (state.meta && state.meta.ranks) || FALLBACK_RANKS;
const xpPerLevel = () => (state.meta && state.meta.xpPerLevel) || 100;
const FALLBACK_FORMULA = { baseRate: 12, maxMinutes: 276, tauMinutes: 240, bonusCap: 0.1, shortMinutes: 30, minPayMinutes: 10 };
const formula = () => (state.meta && state.meta.xpFormula && state.meta.xpFormula.baseRate ? state.meta.xpFormula : FALLBACK_FORMULA);

function getRankInfo(xp) {
    let current = ranks()[0];
    for (const rank of ranks()) {
        if (xp >= rank.min) current = rank;
    }
    return current;
}

function getNextRank(xp) {
    const current = getRankInfo(xp);
    return ranks().find((rank) => rank.min === current.next) || null;
}

function getProgress(xp) {
    const current = getRankInfo(xp);
    if (!current.next) return 1;
    return Math.min(1, Math.max(0, (xp - current.min) / (current.next - current.min)));
}

const getLevel = (xp) => Math.floor(xp / xpPerLevel());
const badgeUrl = (rank) => `Badges/${BADGES[rank] || 'newcomer'}.png`;
const rankKey = (rank) => `rank${rank}`;

// Same formula as the server (rankService.calculateXpFromTask); the server stays the source of truth.
function calculateXp(duration, productivity, difficulty, bonus = 0, money = 0) {
    if (!productivity) return 0;
    const f = formula();
    const effective = f.maxMinutes * (1 - Math.exp(-duration / f.tauMinutes));
    const base = (f.baseRate + productivity * difficulty) * effective / 60;
    const total = base + Math.min(bonus, base * f.bonusCap) + moneyBonus(money);
    if (duration >= f.shortMinutes) return Math.max(1, Math.round(total));
    return duration >= (f.minPayMinutes ?? 10) ? Math.max(1, Math.floor(total)) : Math.floor(total);
}

const FALLBACK_MONEY = { maxEuro: 100, tiers: [{ min: 100, xp: 10 }, { min: 50, xp: 6 }, { min: 10, xp: 3 }, { min: 1, xp: 1 }] };

// Same as the server (rankService.calculateMoneyBonus): tiered XP bonus for money made.
function moneyBonus(money) {
    const config = (state.meta && state.meta.moneyBonus) || FALLBACK_MONEY;
    const euro = Math.min(Number(money) || 0, config.maxEuro);
    const tier = config.tiers.find((entry) => euro >= entry.min);
    return tier ? tier.xp : 0;
}

const FALLBACK_GOAL_BONUS = { rate: 0.1, min: 1, max: 100 };
const FALLBACK_TROPHY = { xp: 50 };
const trophyXp = () => ((state.meta && state.meta.weeklyTrophy) || FALLBACK_TROPHY).xp;

// Same as the server (rankService.calculateGoalBonus): the XP a reached daily goal pays.
function goalBonus(goal) {
    const f = (state.meta && state.meta.goalBonus) || FALLBACK_GOAL_BONUS;
    if (!goal || goal <= 0) return 0;
    return Math.min(f.max, Math.max(f.min, Math.round(goal * f.rate)));
}

const rankNames = () => ranks().map((rank) => rank.name);

export { rankNames, getRankInfo, getNextRank, getProgress, getLevel, badgeUrl, rankKey, calculateXp, moneyBonus, goalBonus, trophyXp };
