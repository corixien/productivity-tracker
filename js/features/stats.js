import { h, icon, formatNumber } from '../core/dom.js';
import { t } from '../core/i18n.js';

function tile(iconName, label, value, sub, extraClass = '') {
    return h('div', { class: `stat ${extraClass}`.trim() },
        h('span', { class: 'stat-label' }, icon(iconName), label),
        h('strong', { class: 'stat-value' }, value),
        sub ? h('span', { class: 'stat-sub' }, sub) : null
    );
}

const tasksText = (n) => (n === 1 ? t('taskN', { n }) : t('tasksN', { n }));

// Streak, today and this-week tiles shared by the Tasks and Activity views.
function statTiles(stats) {
    if (!stats) return [h('div', { class: 'skeleton', 'aria-hidden': 'true' }), h('div', { class: 'skeleton', 'aria-hidden': 'true' }), h('div', { class: 'skeleton', 'aria-hidden': 'true' })];
    const { streak, today, week } = stats;
    const streakValue = streak.current === 1 ? t('streakDay', { n: 1 }) : t('streakDays', { n: streak.current });
    const streakSub = streak.current === 0
        ? t('streakStart')
        : streak.activeToday
            ? t('longestStreak', { n: streak.longest })
            : t('streakKeep');
    return [
        tile('flame', t('streak'), streakValue, streakSub, streak.current > 0 ? 'is-hot' : ''),
        tile('target', t('today'), `${formatNumber(today.xp)} ${t('xpUnit')}`, tasksText(today.tasks)),
        tile('trendingUp', t('thisWeek'), `${formatNumber(week.xp)} ${t('xpUnit')}`, tasksText(week.tasks))
    ];
}

export { statTiles, tasksText };
