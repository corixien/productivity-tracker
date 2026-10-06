import { api } from '../core/api.js';
import { h, icon, $, swapIn, avatarEl, formatNumber, dayLabel, timeLabel } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';
import { badgeUrl, rankKey } from '../core/ranks.js';
import { emptyState, skeletonList, showError } from '../core/ui.js';
import { statTiles, tile } from './stats.js';
import { firstPlaceTiles } from './first-place.js';
import { categoryLabel, initSearch } from './shared.js';

const profileHash = (username) => `#/profile/${encodeURIComponent(username)}`;

let data = null;
let name = '';
let query = '';
let requestId = 0;

function taskRow(task) {
    return h('li', { class: 'history-item' },
        h('span', { class: 'history-icon' }, icon('check')),
        h('span', { class: 'history-text' },
            h('span', { class: 'history-title' }, task.name),
            h('span', { class: 'history-time' }, `${categoryLabel(task.category)} · ${t('minutes', { n: task.duration })} · ${timeLabel(new Date(task.completedAt))}`)
        ),
        h('span', { class: 'history-amount' }, `+${formatNumber(task.xp)} ${t('xpUnit')}`)
    );
}

function matches(task) {
    const text = `${task.name} ${categoryLabel(task.category)} ${task.xp} ${dayLabel(new Date(task.completedAt))}`;
    return text.toLowerCase().includes(query);
}

function renderHeader() {
    const user = data && data.user;
    $('#profile-head').replaceChildren(
        user ? avatarEl(user, 'xl') : h('span', { class: 'avatar avatar-xl' }),
        h('div', { class: 'profile-id' },
            h('h1', { id: 'h-profile' }, user ? user.username : name),
            user ? h('p', { class: 'subtitle' }, `${t(rankKey(user.rank))} · ${t('pfLevelValue', { n: user.level })}`) : null
        ),
        user ? h('img', { class: 'rank-img', src: badgeUrl(user.rank), alt: t(rankKey(user.rank)), width: 56, height: 56 }) : null
    );
}

function renderSections() {
    const stat = (selector, nodes) => $(selector).replaceChildren(...nodes);
    if (!data) {
        const sk = () => h('div', { class: 'skeleton', 'aria-hidden': 'true' });
        stat('#profile-info', [sk(), sk(), sk()]);
        stat('#profile-stats', [sk(), sk(), sk()]);
        stat('#profile-first', [sk(), sk()]);
        $('#profile-hint').textContent = '';
        return;
    }
    const { user } = data;
    stat('#profile-info', [
        tile('trophy', t('pfTotalXp'), `${formatNumber(user.xp)} ${t('xpUnit')}`),
        tile('star', t('pfRank'), t(rankKey(user.rank)), t('pfLevelValue', { n: user.level })),
        tile('check', t('pfTasksDone'), formatNumber(user.tasks))
    ]);
    stat('#profile-stats', statTiles(data.stats));
    stat('#profile-first', firstPlaceTiles(data.firstPlace));
    $('#profile-hint').textContent = t('pfFpHint', { name: user.username });
}

function renderTasks() {
    const list = $('#profile-tasks');
    $('#profile-truncated').hidden = !(data && data.tasks.length >= 500);
    if (!data) {
        list.replaceChildren(h('ul', { class: 'task-list' }, ...skeletonList(3)));
        return;
    }
    if (data.tasks.length === 0) {
        list.replaceChildren(h('ul', {}, emptyState('tasks', t('pfNoTasksTitle'), t('pfNoTasksText'))));
        return;
    }
    const visible = query ? data.tasks.filter(matches) : data.tasks;
    if (visible.length === 0) {
        list.replaceChildren(h('ul', {}, emptyState('search', t('noResultsTitle'), t('noResultsText'))));
        return;
    }
    const groups = [];
    for (const task of visible) {
        const label = dayLabel(new Date(task.completedAt));
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.tasks.push(task);
        else groups.push({ label, tasks: [task] });
    }
    list.replaceChildren(...groups.map((group) =>
        h('section', { class: 'history-day' },
            h('h2', {}, group.label),
            h('ul', { class: 'history-items' }, ...group.tasks.map(taskRow))
        )
    ));
}

function render() {
    renderHeader();
    renderSections();
    renderTasks();
}

async function showProfile(username) {
    name = username || '';
    query = '';
    data = null;
    $('#profile-search').value = '';
    document.title = `${name} · ${t('appTitle')}`;
    render();
    const id = ++requestId;
    try {
        const fresh = await api.getProfile(name);
        if (id !== requestId) return;
        data = fresh;
        name = fresh.user.username;
        document.title = `${name} · ${t('appTitle')}`;
        render();
        swapIn($('#profile-body'));
    } catch (error) {
        if (id !== requestId) return;
        showError(error);
        location.hash = '#/leaderboard';
    }
}

function initProfile() {
    initSearch($('#profile-search'), (next) => { query = next; renderTasks(); });
    onLanguageChange(() => { if (name) render(); });
}

export { initProfile, showProfile, profileHash };
