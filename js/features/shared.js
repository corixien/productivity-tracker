import { t } from '../core/i18n.js';
import { state } from '../core/state.js';
import { icon } from '../core/dom.js';
import { rankKey, rankNames } from '../core/ranks.js';
import { toast, xpToast } from '../core/ui.js';

const CATEGORY_KEYS = {
    learning: 'catLearning',
    exercise: 'catExercise',
    creative: 'catCreative',
    admin: 'catAdmin',
    social: 'catSocial',
    'deep-work': 'catDeepWork',
    other: 'catOther'
};
const categoryLabel = (category) => t(CATEGORY_KEYS[category] || 'catOther');

// After an XP change: show the delta and celebrate rank-ups / level-ups.
function announceProgress(before, after, delta, bonus = 0, rankBonus = 0) {
    xpToast(delta, bonus);
    if (!before || !after) return;
    const order = rankNames();
    if (order.indexOf(after.rank) > order.indexOf(before.rank)) {
        const rank = t(rankKey(after.rank));
        toast(rankBonus ? t('rankUpBonus', { rank, n: rankBonus }) : t('rankUp', { rank }), { type: 'xp' });
    } else if ((after.level || 0) > (before.level || 0)) {
        toast(t('levelUp', { n: after.level }), { type: 'xp' });
    }
}

// Two templates are the same when every field matches (name ignoring case and outer spaces).
const templateKey = (item) => [
    String(item.name || '').trim().toLowerCase(), item.duration, item.productivity || 0, item.difficulty || 3, item.category || 'other', item.bonus || 0
].join('|');
const findTemplate = (item) => state.templates.find((template) => templateKey(template) === templateKey(item)) || null;

// Adds the magnifier icon to a search field and reports the lowercase query on every keystroke.
function initSearch(input, onChange) {
    input.parentElement.prepend(icon('search', 'search-icon'));
    input.addEventListener('input', () => onChange(input.value.trim().toLowerCase()));
}

// Console-only reporting for failures that must not interrupt the user.
function warnNonCritical(context) {
    return (error) => console.warn(`[${context}]`, error && error.message ? error.message : error);
}
export { CATEGORY_KEYS, categoryLabel, templateKey, findTemplate, initSearch, announceProgress, warnNonCritical };
