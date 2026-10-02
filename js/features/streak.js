import { state } from '../core/state.js';
import { h, icon, formatNumber } from '../core/dom.js';
import { t, locale } from '../core/i18n.js';

const CHART_DAYS = 14;

const parseDay = (iso) => new Date(`${iso}T12:00:00`);
const weekdayShort = (iso) => new Intl.DateTimeFormat(locale(), { weekday: 'narrow' }).format(parseDay(iso));
const dayLong = (iso) => new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(parseDay(iso));
const statusText = (status) => t({ done: 'statusDone', frozen: 'statusFrozen', none: 'statusNone' }[status]);

function iceSlots(streak) {
    return Array.from({ length: streak.maxFreezes }, (_, index) =>
        h('span', { class: `ice-slot${index < streak.freezes ? ' is-full' : ''}` }, icon('snowflake'))
    );
}

function iceText(streak) {
    if (streak.freezes >= streak.maxFreezes) return t('iceFull', { max: streak.maxFreezes });
    const n = streak.nextFreezeIn;
    return t('iceNext', { days: t(n === 1 ? 'streakDay' : 'streakDays', { n }) });
}

function weekStrip(days) {
    return h('ol', { class: 'week-strip' }, ...days.slice(-7).map((day) =>
        h('li', {
            class: `day-dot is-${day.status}${day.today ? ' is-today' : ''}`,
            'aria-label': `${dayLong(day.date)}: ${statusText(day.status)}`
        },
            h('span', { class: 'day-letter', 'aria-hidden': 'true' }, weekdayShort(day.date)),
            h('span', { class: 'day-circle', 'aria-hidden': 'true' },
                day.status === 'done' ? icon('flame') : day.status === 'frozen' ? icon('snowflake') : null)
        )
    ));
}

function streakHero(stats) {
    const { streak, days } = stats;
    return h('section', { class: 'card streak-hero', 'aria-labelledby': 'streak-title' },
        h('div', { class: `streak-main${streak.current > 0 ? ' is-lit' : ''}` },
            h('span', { class: 'streak-flame', 'aria-hidden': 'true' }, icon('flame')),
            h('div', {},
                h('p', { class: 'streak-number', id: 'streak-title' }, h('strong', {}, String(streak.current)), ' ', t('dayStreakLabel')),
                h('p', { class: 'streak-sub' },
                    streak.current === 0 ? t('streakStart') : streak.activeToday ? t('longestStreak', { n: streak.longest }) : t('streakKeep'))
            )
        ),
        h('div', { class: 'streak-side' },
            weekStrip(days),
            h('div', { class: 'ice-panel', title: t('iceHint') },
                h('span', { class: 'ice-title' }, icon('snowflake'), t('iceTitle')),
                h('span', { class: 'ice-slots', role: 'img', 'aria-label': t('iceCount', { n: streak.freezes, max: streak.maxFreezes }) }, ...iceSlots(streak)),
                h('span', { class: 'ice-text' }, iceText(streak))
            )
        ),
        h('p', { class: 'hint streak-hint' }, t('iceHint'))
    );
}

function barChart(stats) {
    const days = stats.days.slice(-CHART_DAYS);
    const goal = stats.today.goal;
    const max = Math.max(goal, ...days.map((day) => day.xp), 1);
    const goalLine = h('span', { class: 'goal-line', 'aria-hidden': 'true', dataset: { label: `${t('dailyGoal')}: ${formatNumber(goal)}` } });
    goalLine.style.setProperty('--g', (goal / max).toFixed(4));
    return h('section', { class: 'card chart-card', 'aria-labelledby': 'chart-title' },
        h('h2', { id: 'chart-title' }, t('chartTitle')),
        h('div', { class: 'bar-chart', role: 'img', 'aria-label': days.map((day) => `${dayLong(day.date)}: ${day.xp} ${t('xpUnit')}`).join('; ') },
            goalLine,
            ...days.map((day) => {
                const bar = h('span', { class: `bar${day.xp >= goal ? ' is-goal' : ''}${day.status === 'frozen' ? ' is-frozen' : ''}`, title: `${dayLong(day.date)}: ${day.xp} ${t('xpUnit')}` });
                bar.style.setProperty('--h', (day.xp / max).toFixed(4));
                return h('span', { class: `bar-col${day.today ? ' is-today' : ''}`, 'aria-hidden': 'true' },
                    h('span', { class: 'bar-value' }, day.xp > 0 ? String(day.xp) : ''),
                    h('span', { class: 'bar-track' }, bar),
                    h('span', { class: 'bar-label' }, String(parseDay(day.date).getDate())));
            })
        )
    );
}

function heatLevel(day, goal) {
    if (day.tasks === 0) return 0;
    if (day.xp >= goal) return 4;
    if (day.xp >= goal * 0.66) return 3;
    return day.xp >= goal * 0.33 ? 2 : 1;
}

function calendar(stats) {
    const days = stats.days;
    const goal = stats.today.goal;
    const lead = (parseDay(days[0].date).getDay() + 6) % 7;      // weeks start on Monday
    const cells = [
        ...Array.from({ length: lead }, () => h('li', { class: 'heat-cell is-empty', 'aria-hidden': 'true' })),
        ...days.map((day) => h('li', {
            class: `heat-cell level-${heatLevel(day, goal)}${day.status === 'frozen' ? ' is-frozen' : ''}${day.today ? ' is-today' : ''}`,
            title: `${dayLong(day.date)}: ${day.xp} ${t('xpUnit')}`,
            'aria-label': `${dayLong(day.date)}: ${statusText(day.status)}, ${day.xp} ${t('xpUnit')}`
        }, day.status === 'frozen' ? icon('snowflake') : null))
    ];
    const mondayLabels = Array.from({ length: 7 }, (_, i) => weekdayShort(`2024-01-0${i + 1}`));
    return h('section', { class: 'card chart-card', 'aria-labelledby': 'calendar-title' },
        h('h2', { id: 'calendar-title' }, t('calendarTitle')),
        h('div', { class: 'heatmap' },
            h('ol', { class: 'heat-head', 'aria-hidden': 'true' }, ...mondayLabels.map((letter) => h('li', {}, letter))),
            h('ol', { class: 'heat-grid' }, ...cells)
        ),
        h('div', { class: 'heat-legend', 'aria-hidden': 'true' },
            t('legendLess'),
            ...[0, 1, 2, 3, 4].map((level) => h('span', { class: `heat-cell level-${level}` })),
            t('legendMore'),
            h('span', { class: 'heat-cell is-frozen' }, icon('snowflake')),
            t('statusFrozen'))
    );
}

function renderStreakHero(container) {
    const stats = state.stats;
    if (!stats || !stats.days) container.replaceChildren(h('div', { class: 'skeleton skeleton-tall', 'aria-hidden': 'true' }));
    else container.replaceChildren(streakHero(stats));
}

function renderCharts(container) {
    const stats = state.stats;
    if (!stats || !stats.days) container.replaceChildren(h('div', { class: 'skeleton skeleton-tall', 'aria-hidden': 'true' }), h('div', { class: 'skeleton skeleton-tall', 'aria-hidden': 'true' }));
    else container.replaceChildren(barChart(stats), calendar(stats));
}

export { renderStreakHero, renderCharts };
