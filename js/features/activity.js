import { api } from '../core/api.js';
import { state, on } from '../core/state.js';
import { h, icon, $, dayLabel, timeLabel } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';
import { loadStats } from '../core/data.js';
import { emptyState, skeletonList, showError } from '../core/ui.js';
import { statTiles } from './stats.js';
import { warnNonCritical } from './shared.js';

const PAGE_SIZE = 30;
const SOURCES = {
    task: { icon: 'check', key: 'historyTask' },
    task_uncomplete: { icon: 'undo', key: 'historyUncomplete' },
    task_delete: { icon: 'trash', key: 'historyDelete' },
    task_edit: { icon: 'edit', key: 'historyEdit' }
};

let rows = [];
let hasMore = false;
let loaded = false;
let loading = false;

function historyItem(row) {
    const source = SOURCES[row.source] || SOURCES.task;
    const date = new Date(row.created_at);
    const name = row.task_name || t('historyDeletedTask');
    const amount = row.xp_amount;
    return h('li', { class: 'history-item' },
        h('span', { class: 'history-icon' }, icon(source.icon)),
        h('span', { class: 'history-text' },
            h('span', { class: 'history-title' }, t(source.key, { name })),
            h('span', { class: 'history-time' }, timeLabel(date))
        ),
        h('span', { class: `history-amount${amount < 0 ? ' is-negative' : ''}` }, `${amount > 0 ? '+' : ''}${amount} ${t('xpUnit')}`)
    );
}

function renderHistory() {
    const container = $('#history-list');
    $('#history-more').hidden = !hasMore;
    if (!loaded) {
        container.replaceChildren(h('ul', { class: 'task-list' }, ...skeletonList(3)));
        return;
    }
    if (rows.length === 0) {
        container.replaceChildren(h('ul', {}, emptyState('activity', t('noHistoryTitle'), t('noHistoryText'))));
        return;
    }

    const groups = [];
    for (const row of rows) {
        const label = dayLabel(new Date(row.created_at));
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.rows.push(row);
        else groups.push({ label, rows: [row] });
    }
    container.replaceChildren(...groups.map((group) =>
        h('section', { class: 'history-day' },
            h('h2', {}, group.label),
            h('ul', { class: 'history-items' }, ...group.rows.map(historyItem))
        )
    ));
}

function renderStats() {
    $('#activity-stats').replaceChildren(...statTiles(state.stats));
}

async function loadHistory(reset) {
    if (loading) return;
    loading = true;
    try {
        const data = await api.getXp(PAGE_SIZE, reset ? 0 : rows.length);
        rows = reset ? data.history : rows.concat(data.history);
        hasMore = data.hasMore;
        loaded = true;
        renderHistory();
    } catch (error) {
        showError(error);
    } finally {
        loading = false;
    }
}

function showActivity() {
    renderStats();
    renderHistory();
    loadStats().catch(warnNonCritical('activity.stats'));
    loadHistory(true);
}

function initActivity() {
    $('#history-more').addEventListener('click', () => loadHistory(false));
    on('stats', renderStats);
    // Any XP change makes the cached history stale: reload on next visit.
    on('tasks', () => { loaded = false; });
    on('auth:logout', () => { loaded = false; rows = []; hasMore = false; });
    onLanguageChange(() => { renderStats(); renderHistory(); });
}

export { initActivity, showActivity };
