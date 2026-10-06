import { api } from '../core/api.js';
import { h, icon, $, $$, swapIn, avatarEl, formatNumber } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';
import { badgeUrl, rankKey, trophyXp } from '../core/ranks.js';
import { profileHash } from './profile.js';
import { toast, confirmDialog, openDialog, closeDialog, emptyState, skeletonList, showError } from '../core/ui.js';

let period = 'all';
let entries = [];
let loaded = false;

const scoreOf = (entry) => (period === 'week' ? entry.weekXp : entry.xp);
const displayName = (entry) => (entry.isSelf ? `${entry.username} (${t('you')})` : entry.username);

// Whole row or podium spot opens the profile page; the remove button keeps its own click.
function makeOpenable(el, entry) {
    const open = () => { location.hash = profileHash(entry.username); };
    el.classList.add('is-link');
    el.tabIndex = 0;
    el.setAttribute('role', 'link');
    el.setAttribute('aria-label', t('pfOpen', { name: entry.username }));
    el.addEventListener('click', (event) => { if (!event.target.closest('button')) open(); });
    el.addEventListener('keydown', (event) => {
        if (event.target === el && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); }
    });
    return el;
}

function removeButton(entry) {
    if (!entry.friendId) return null;
    return h('button', {
        type: 'button', class: 'icon-btn is-danger',
        'aria-label': t('removeFriendLabel', { name: entry.username }), title: t('remove'),
        onClick: () => removeFriend(entry)
    }, icon('close'));
}

function podiumSpot(entry, index) {
    const place = index + 1;
    return makeOpenable(h('div', { class: `podium-spot ${['is-first', 'is-second', 'is-third'][index]}${entry.isSelf ? ' is-self' : ''}`, dataset: { rank: entry.rank } },
        h('span', { class: 'podium-place' }, `#${place}`),
        avatarEl(entry, 'xl'),
        h('span', { class: 'podium-name' }, displayName(entry)),
        h('img', { class: 'rank-img', src: badgeUrl(entry.rank), alt: t(rankKey(entry.rank)), width: 40, height: 40 }),
        h('span', { class: 'podium-score' }, `${formatNumber(scoreOf(entry))} ${t('xpUnit')}`),
        removeButton(entry)
    ), entry);
}

// Same order as the server query: score descending, then name. Lets the period switch re-rank instantly.
function sortEntries() {
    entries.sort((a, b) => scoreOf(b) - scoreOf(a) || String(a.username).localeCompare(String(b.username)));
}

function boardRow(entry, index) {
    return makeOpenable(h('li', { class: `board-row${entry.isSelf ? ' is-self' : ''}`, dataset: { rank: entry.rank } },
        h('span', { class: 'board-place' }, String(index + 1)),
        avatarEl(entry, 'md'),
        h('span', { class: 'board-name' },
            h('strong', {}, displayName(entry)),
            h('span', {}, `${t(rankKey(entry.rank))} · ${t('tasksDoneSmall', { n: entry.tasks })}`)
        ),
        h('span', { class: 'board-score' }, `${formatNumber(scoreOf(entry))} ${t('xpUnit')}`,
            period === 'week' ? h('small', {}, t('xpTotalSmall', { n: formatNumber(entry.xp) })) : null),
        removeButton(entry)
    ), entry);
}

function render() {
    $$('#period-tabs [data-period]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.period === period));
    });
    const podium = $('#podium');
    const list = $('#leaderboard-list');

    if (!loaded) {
        podium.replaceChildren();
        list.replaceChildren(...skeletonList(4));
        return;
    }

    $('#trophy-hint').textContent = t('trophyHint', { n: trophyXp() });
    const showPodium = entries.length >= 3;
    podium.replaceChildren(...(showPodium ? entries.slice(0, 3).map(podiumSpot) : []));
    const rest = showPodium ? entries.slice(3) : entries;
    const offset = showPodium ? 3 : 0;
    const rows = rest.map((entry, i) => boardRow(entry, i + offset));
    if (entries.length < 2) {
        rows.unshift(emptyState('userPlus', t('noFriendsTitle'), t('noFriendsText'),
            h('button', { type: 'button', class: 'btn btn-primary', onClick: openFriendDialog }, icon('userPlus'), t('addFriend'))));
    }
    list.replaceChildren(...rows);
}

async function load() {
    try {
        const fresh = !loaded;
        entries = await api.getLeaderboard(period);
        sortEntries();
        loaded = true;
        render();
        if (fresh) { swapIn($('#podium')); swapIn($('#leaderboard-list')); }
    } catch (error) {
        showError(error);
    }
}

async function removeFriend(entry) {
    const confirmed = await confirmDialog({
        title: t('confirmRemoveFriendTitle'),
        message: t('confirmRemoveFriendMessage', { name: entry.username }),
        confirmLabel: t('remove'),
        danger: true
    });
    if (!confirmed) return;
    try {
        await api.removeFriend(entry.friendId);
        toast(t('friendRemoved'), { type: 'success' });
        await load();
    } catch (error) {
        showError(error);
    }
}

function openFriendDialog() {
    $('#friend-username').value = '';
    $('#friend-error').textContent = '';
    openDialog($('#friend-dialog'));
    $('#friend-username').focus();
}

async function submitFriend(event) {
    event.preventDefault();
    const username = $('#friend-username').value.trim();
    if (!username) return;
    try {
        await api.addFriend(username);
        closeDialog($('#friend-dialog'));
        toast(t('friendAdded'), { type: 'success' });
        await load();
    } catch (error) {
        $('#friend-error').textContent = error.network ? t('networkError') : error.message;
    }
}

function showLeaderboard() {
    render();
    load();
}

function initLeaderboard() {
    $('#add-friend-btn').addEventListener('click', openFriendDialog);
    $('#friend-form').addEventListener('submit', submitFriend);
    $$('#period-tabs [data-period]').forEach((button) => {
        button.addEventListener('click', () => {
            period = button.dataset.period;
            if (loaded) {
                // Both scores are already here: re-rank right away so the content moves with the lens, then refresh quietly.
                sortEntries();
                render();
                swapIn($('#podium'));
                swapIn($('#leaderboard-list'));
            } else {
                render();
            }
            load();
        });
    });
    onLanguageChange(render);
}

export { initLeaderboard, showLeaderboard };
