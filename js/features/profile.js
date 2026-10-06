import { api } from '../core/api.js';
import { h, icon, $, avatarEl, formatNumber, dayLabel, timeLabel } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';
import { getNextRank, getProgress, badgeUrl, rankKey } from '../core/ranks.js';
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

// Two cards side by side: avatar and name on the left, the rank hero (badge with level pill, rank name, XP to the next rank, progress bar) on the right.
function renderHeader() {
    const user = data && data.user;
    const head = $('#profile-head');
    const identity = h('div', { class: 'profile-id card' },
        user ? avatarEl(user, 'xl') : h('span', { class: 'avatar avatar-xl' }),
        h('h1', { id: 'h-profile' }, user ? user.username : name)
    );
    if (!user) {
        head.replaceChildren(identity);
        return;
    }
    const next = getNextRank(user.xp);
    const progress = getProgress(user.xp);
    const fill = h('div', { class: 'progress-fill' });
    fill.style.setProperty('--p', progress.toFixed(4));
    head.replaceChildren(
        identity,
        h('div', { class: 'hero card', dataset: { rank: user.rank } },
            h('div', { class: `hero-badge${user.rank === 'Platinum' ? ' is-platinum' : ''}` },
                h('img', { src: badgeUrl(user.rank), alt: '', width: 104, height: 104 }),
                h('span', { class: 'level-pill' }, t('levelN', { n: user.level }))
            ),
            h('div', { class: 'hero-main' },
                h('div', { class: 'hero-top' }, h('h2', {}, t(rankKey(user.rank)))),
                h('div', { class: 'xp-line' },
                    h('strong', {}, `${formatNumber(user.xp)} ${t('xpUnit')}`),
                    h('span', {}, next ? t('xpToNext', { n: formatNumber(next.min - user.xp), rank: t(rankKey(next.name)) }) : t('maxRank'))
                ),
                h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(progress * 100)), 'aria-label': t('xpProgress') }, fill)
            )
        )
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
        tile('star', t('pfLevel'), formatNumber(user.level)),
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
