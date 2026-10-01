import { t } from '../core/i18n.js';
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
function announceProgress(before, after, delta) {
    if (delta) xpToast(delta);
    if (!before || !after) return;
    const order = rankNames();
    if (order.indexOf(after.rank) > order.indexOf(before.rank)) {
        toast(t('rankUp', { rank: t(rankKey(after.rank)) }), { type: 'xp' });
    } else if ((after.level || 0) > (before.level || 0)) {
        toast(t('levelUp', { n: after.level }), { type: 'xp' });
    }
}




// Console-only reporting for failures that must not interrupt the user.
function warnNonCritical(context) {
    return (error) => console.warn(`[${context}]`, error && error.message ? error.message : error);
}
export { CATEGORY_KEYS, categoryLabel, announceProgress, warnNonCritical };
