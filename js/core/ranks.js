import { state } from './state.js';

// Fallback mirrors backend/services/rankService.js; the server value from /api/meta wins.
const FALLBACK_RANKS = [
    { name: 'Newcomer', min: 0, next: 100 },
    { name: 'Bronze', min: 100, next: 300 },
    { name: 'Silver', min: 300, next: 600 },
    { name: 'Gold', min: 600, next: 1200 },
    { name: 'Platinum', min: 1200, next: 2400 },
    { name: 'Diamond', min: 2400, next: 5000 },
    { name: 'Master', min: 5000, next: null }
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
const FALLBACK_FORMULA = { baseRate: 12, fullMinutes: 120, halfUntilMinutes: 360, bonusCap: 0.1, shortMinutes: 10 };
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
function calculateXp(duration, productivity, difficulty, bonus = 0) {
    if (!productivity) return 0;
    const f = formula();
    const effective = Math.min(duration, f.fullMinutes)
        + 0.5 * Math.min(Math.max(duration - f.fullMinutes, 0), f.halfUntilMinutes - f.fullMinutes)
        + 0.25 * Math.max(duration - f.halfUntilMinutes, 0);
    const base = (f.baseRate + productivity * difficulty) * effective / 60;
    const total = base + Math.min(bonus, base * f.bonusCap);
    return duration < f.shortMinutes ? Math.floor(total) : Math.max(1, Math.round(total));
}

const rankNames = () => ranks().map((rank) => rank.name);

export { rankNames, getRankInfo, getNextRank, getProgress, getLevel, badgeUrl, rankKey, calculateXp };
