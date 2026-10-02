import { api } from '../../core/api.js';
import { on } from '../../core/state.js';
import { h, $, avatarEl, formatNumber } from '../../core/dom.js';
import { t, onLanguageChange, locale } from '../../core/i18n.js';
import { badgeUrl, rankKey } from '../../core/ranks.js';
import { skeletonList, showError } from '../../core/ui.js';
import { currentView } from '../nav.js';
import { areaChart, barChart } from '../charts.js';

const REFRESH_MS = 30000;
let data = null;
let timer = null;

const hourLabel = (iso) => new Intl.DateTimeFormat(locale(), { hour: 'numeric' }).format(new Date(iso));

function chartCard(title, headline, subline, chart, note) {
    return h('section', { class: 'card chart-card analytics-card', 'aria-label': title },
        h('div', { class: 'analytics-head' },
            h('div', {}, h('h2', {}, title), subline ? h('p', { class: 'hint' }, subline) : null),
            h('strong', { class: 'analytics-number' }, headline)),
        chart,
        note ? h('p', { class: 'hint' }, note) : null
    );
}

function topUsers(list) {
    return h('section', { class: 'card chart-card analytics-card', 'aria-label': t('topUsersTitle') },
        h('h2', {}, t('topUsersTitle')),
        h('ol', { class: 'board board-plain' }, ...list.map((user, index) =>
            h('li', { class: 'board-row', dataset: { rank: user.rank } },
                h('span', { class: 'board-place' }, String(index + 1)),
                avatarEl(user, 'md'),
                h('span', { class: 'board-name' },
                    h('strong', {}, user.username),
                    h('span', {}, `${t(rankKey(user.rank))} · ${t('tasksDoneSmall', { n: user.tasks_completed })}`)),
                h('img', { class: 'rank-img', src: badgeUrl(user.rank), alt: '', width: 32, height: 32 }),
                h('span', { class: 'board-score' }, `${formatNumber(user.xp)} ${t('xpUnit')}`)
            )
        ))
    );
}

function render() {
    const grid = $('#analytics-grid');
    if (!data) {
        grid.replaceChildren(...skeletonList(4));
        return;
    }
    const uptimePoints = data.uptime.map((row) => ({ label: hourLabel(row.hour), value: row.percent, title: `${hourLabel(row.hour)}: ${row.percent}%` }));
    const userPoints = data.users.map((row) => ({ label: hourLabel(row.hour), value: row.count, title: `${hourLabel(row.hour)}: ${t('usersN', { n: row.count })}` }));
    const groqPoints = data.groq.map((row) => ({
        label: hourLabel(row.hour), value: row.calls, errors: row.errors,
        title: `${hourLabel(row.hour)}: ${row.calls} ${t('groqCalls')}${row.errors ? `, ${t('groqErrors', { n: row.errors })}` : ''}${row.avgMs ? `, ${row.avgMs} ms` : ''}`
    }));
    const callsTotal = data.groq.reduce((sum, row) => sum + row.calls, 0);
    const errorsTotal = data.groq.reduce((sum, row) => sum + row.errors, 0);
    const timed = data.groq.filter((row) => row.avgMs);
    const avgMs = timed.length ? Math.round(timed.reduce((sum, row) => sum + row.avgMs, 0) / timed.length) : null;

    grid.replaceChildren(
        chartCard(t('uptimeTitle'), `${data.uptimePercent24h}%`, t('uptimeNote'),
            areaChart(uptimePoints, { max: 100, unit: '%', label: t('uptimeTitle') })),
        chartCard(t('usersTitle'), String(data.totals.activeUsers24h), t('usersTotal', { n: data.totals.users }),
            barChart(userPoints, { label: t('usersTitle') })),
        chartCard(t('groqTitle'), String(callsTotal),
            [errorsTotal ? t('groqErrors', { n: errorsTotal }) : t('groqNoErrors'), avgMs ? t('groqAvg', { ms: avgMs }) : null].filter(Boolean).join(' · '),
            barChart(groqPoints, { label: t('groqTitle') })),
        topUsers(data.topUsers)
    );
}

async function load() {
    try {
        data = await api.adminAnalytics();
        render();
    } catch (error) {
        showError(error);
    }
}

function showAnalytics() {
    render();
    load();
    clearInterval(timer);
    timer = setInterval(() => {
        if (currentView() !== 'admin-analytics' || document.visibilityState === 'hidden') {
            if (currentView() !== 'admin-analytics') clearInterval(timer);
            return;
        }
        load();
    }, REFRESH_MS);
}

function initAnalytics() {
    on('auth:logout', () => { data = null; clearInterval(timer); });
    onLanguageChange(() => { if (data) render(); });
}

export { initAnalytics, showAnalytics };
