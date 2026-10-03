import { api } from '../core/api.js';
import { state, on } from '../core/state.js';
import { h, icon, $, swapIn, formatNumber, timeLabel, setBusy } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';
import { getRankInfo, getNextRank, getProgress, getLevel, badgeUrl, rankKey } from '../core/ranks.js';
import { refreshCore, loadTemplates, loadTasks } from '../core/data.js';
import { toast, xpToast, confirmDialog, emptyState, skeletonList, showError } from '../core/ui.js';
import { statTiles } from './stats.js';
import { openTaskDialog } from './task-dialog.js';
import { categoryLabel, announceProgress, findTemplate } from './shared.js';

let filter = 'pending';
let drawn = '';   // what the list shows now; an identical re-render would replay the entry animation

function taskSubtitle() {
    if (!state.tasksLoaded) return '';
    const pending = state.tasks.filter((task) => !task.completed).length;
    if (pending > 0) return t(pending === 1 ? 'tasksOpenOne' : 'tasksOpenMany', { n: pending });
    return t(state.tasks.length === 0 ? 'tasksNone' : 'tasksAllDone');
}

function renderHero() {
    const user = state.user;
    if (!user) return;
    const xp = user.xp || 0;
    const rank = user.rank || getRankInfo(xp).name;
    const next = getNextRank(xp);

    $('#hero').dataset.rank = rank;
    const badge = $('#hero-badge');
    badge.classList.toggle('is-platinum', rank === 'Platinum');
    $('#hero-badge-img').src = badgeUrl(rank);
    $('#hero-level').textContent = t('levelN', { n: user.level ?? getLevel(xp) });
    $('#hero-rank').textContent = t(rankKey(rank));
    $('#hero-xp').textContent = `${formatNumber(xp)} ${t('xpUnit')}`;
    $('#hero-next').textContent = next ? t('xpToNext', { n: formatNumber(next.min - xp), rank: t(rankKey(next.name)) }) : t('maxRank');

    const progress = getProgress(xp);
    $('#hero-fill').style.setProperty('--p', progress.toFixed(4));
    $('#hero-progress').setAttribute('aria-valuenow', String(Math.round(progress * 100)));

    const chip = $('#hero-multiplier');
    const multiplier = Number(user.multiplier);
    chip.hidden = !Number.isFinite(multiplier);
    if (Number.isFinite(multiplier)) {
        chip.textContent = t('multiplierChip', { n: multiplier.toFixed(2) });
        chip.title = t('multiplierTitle', { n: multiplier.toFixed(2) });
    }
    renderGoal();
}

function renderGoal() {
    const goal = (state.stats && state.stats.today.goal) || (state.user && state.user.daily_goal_xp) || 50;
    const earned = state.stats ? state.stats.today.xp : 0;
    const ring = $('#goal-ring');
    const done = earned >= goal;
    ring.classList.toggle('is-done', done);
    ring.querySelector('.ring-fill').style.setProperty('--p', Math.min(1, earned / goal).toFixed(4));
    $('#goal-xp').textContent = formatNumber(earned);
    $('#goal-label').textContent = done ? t('goalDone') : t('goalLabel', { n: formatNumber(goal) });
    ring.setAttribute('role', 'img');
    ring.setAttribute('aria-label', `${t('dailyGoal')}: ${formatNumber(earned)} / ${formatNumber(goal)} ${t('xpUnit')}`);
}

function renderStats() {
    $('#stat-row').replaceChildren(...statTiles(state.stats));
    renderGoal();
}

function metaChip(iconName, text, extra = '') {
    return h('span', { class: `chip ${extra}`.trim() }, icon(iconName), text);
}

function taskCard(task, index) {
    const done = task.completed;
    const syncing = state.pendingSync.has(task.id);
    const checkButton = h('button', {
        type: 'button',
        class: `check-btn${done ? ' is-checked' : ''}`,
        'aria-label': done ? t('undoTask', { name: task.name }) : t('completeTask', { name: task.name }),
        title: done ? t('undo') : t('completeTask', { name: task.name }),
        disabled: syncing,
        onClick: () => (done ? undoTask(task, checkButton) : completeTask(task, checkButton))
    }, icon('check'));

    const card = h('li', {
        class: `task-card${done ? ' is-done' : ''}${syncing ? ' is-syncing' : ''}`,
        dataset: { category: task.category, id: task.id }
    },
        checkButton,
        h('div', { class: 'task-body' },
            h('div', { class: 'task-title-row' },
                h('p', { class: 'task-name' }, task.name),
                h('span', { class: 'xp-badge' }, `+${task.xp} ${t('xpUnit')}`)
            ),
            h('div', { class: 'task-meta' },
                h('span', { class: 'chip chip-cat' }, categoryLabel(task.category)),
                metaChip('clock', t('minutes', { n: task.duration })),
                metaChip('star', t('productivityChip', { n: task.productivity || 0 })),
                metaChip('activity', t('difficultyChip', { n: task.difficulty || 3 })),
                task.bonus ? metaChip('sparkles', t('bonusChip', { n: task.bonus }), 'chip-accent') : null,
                done && task.completedAt ? metaChip('check', timeLabel(new Date(task.completedAt))) : null,
                syncing ? metaChip('wifiOff', t('waitingSync'), 'chip-warn') : null
            )
        ),
        h('div', { class: 'task-actions' },
            iconButton('edit', t('editTaskLabel', { name: task.name }), () => openTaskDialog({ mode: 'edit', task })),
            templateButton(task),
            iconButton('trash', t('deleteTaskLabel', { name: task.name }), () => deleteTask(task), 'is-danger')
        )
    );
    card.style.animationDelay = `${Math.min(index, 8) * 30}ms`;
    return card;
}

// Bookmark: filled when an identical template exists. Clicking toggles the template.
function templateButton(task) {
    const saved = findTemplate(task);
    return saved
        ? iconButton('bookmark', t('removeTemplate', { name: task.name }), () => removeTemplate(saved), 'is-saved template-toggle')
        : iconButton('bookmark', t('saveAsTemplate', { name: task.name }), () => saveAsTemplate(task), 'template-toggle');
}

// Templates changed: swap only the bookmark buttons so the cards stay put (no re-render, no replayed animation).
function refreshTemplateMarks() {
    for (const card of document.querySelectorAll('#task-list .task-card[data-id]')) {
        const task = state.tasks.find((item) => item.id === card.dataset.id);
        const button = card.querySelector('.template-toggle');
        if (task && button) button.replaceWith(templateButton(task));
    }
}

function iconButton(name, label, onClick, extra = '') {
    return h('button', { type: 'button', class: `icon-btn ${extra}`.trim(), 'aria-label': label, title: label, onClick }, icon(name));
}

function renderTasks() {
    const pending = state.tasks.filter((task) => !task.completed);
    const completed = state.tasks
        .filter((task) => task.completed)
        .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

    $('#tab-pending').replaceChildren(t('tabPending'), h('span', { class: 'count' }, String(pending.length)));
    $('#tab-completed').replaceChildren(t('tabCompleted'), h('span', { class: 'count' }, String(completed.length)));
    $('#tab-pending').setAttribute('aria-pressed', String(filter === 'pending'));
    $('#tab-completed').setAttribute('aria-pressed', String(filter === 'completed'));

    $('#task-subtitle').textContent = taskSubtitle();

    const list = $('#task-list');
    const signature = JSON.stringify([filter, state.tasksLoaded, state.tasksError, state.tasks, [...state.pendingSync], t('tabPending')]);
    if (signature === drawn) return;
    drawn = signature;
    if (!state.tasksLoaded) {
        list.replaceChildren(...skeletonList(3));
        return;
    }
    if (state.tasksError && state.tasks.length === 0) {
        list.replaceChildren(emptyState('wifiOff', t('loadFailed'), t('networkError'),
            h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => loadTasks().catch(showError) }, t('retry'))));
        return;
    }
    const items = filter === 'pending' ? pending : completed;
    if (items.length === 0) {
        const empty = filter === 'pending'
            ? emptyState('sparkles', t('noPendingTitle'), t('noPendingText'), h('button', { type: 'button', class: 'btn btn-primary', onClick: () => openTaskDialog({ mode: 'create' }) }, icon('plus'), t('addTask')))
            : emptyState('trophy', t('noCompletedTitle'), t('noCompletedText'));
        list.replaceChildren(empty);
        return;
    }
    list.replaceChildren(...items.map(taskCard));
}

/* ---- actions ---- */
async function completeTask(task, button) {
    setBusy(button, true);
    const before = state.user;
    const freezesBefore = state.stats ? state.stats.streak.freezes : null;
    try {
        const result = await api.completeTask(task.id);
        if (result.queued) {
            state.pendingSync.add(task.id);
            toast(t('savedOffline'), { type: 'info' });
            renderTasks();
            return;
        }
        const after = await refreshCore();
        announceProgress(before, after, result.xpEarned);
        if (freezesBefore !== null && state.stats.streak.freezes > freezesBefore) toast(t('iceEarned'), { type: 'xp' });
    } catch (error) {
        showError(error);
        setBusy(button, false);
    }
}

async function undoTask(task, button) {
    setBusy(button, true);
    try {
        const result = await api.uncompleteTask(task.id);
        await refreshCore();
        toast(t('taskUncompleted'), { type: 'success' });
        if (result.xpEarned) xpToast(result.xpEarned);
    } catch (error) {
        showError(error);
        setBusy(button, false);
    }
}

async function deleteTask(task) {
    const confirmed = await confirmDialog({
        title: t('confirmDeleteTitle'),
        message: t(task.completed ? 'confirmDeleteCompleted' : 'confirmDeleteMessage', { name: task.name }),
        confirmLabel: t('delete'),
        danger: true
    });
    if (!confirmed) return;
    try {
        const result = await api.deleteTask(task.id);
        await refreshCore();
        toast(t('taskDeleted'), { type: 'success' });
        if (result.xpChange) xpToast(result.xpChange);
    } catch (error) {
        showError(error);
    }
}

async function saveAsTemplate(task) {
    try {
        await api.createTemplate({
            name: task.name,
            duration: task.duration,
            productivity: task.productivity || 0,
            difficulty: task.difficulty || 3,
            category: task.category,
            bonus: task.bonus || 0
        });
        await loadTemplates();
        toast(t('templateSaved'), { type: 'success' });
    } catch (error) {
        showError(error);
    }
}

async function removeTemplate(template) {
    try {
        await api.deleteTemplate(template.id);
        await loadTemplates();
        toast(t('templateDeleted'), { type: 'success' });
    } catch (error) {
        showError(error);
    }
}

function setFilter(next) {
    filter = next;
    renderTasks();
    swapIn($('#task-list'));
}

function initDashboard() {
    $('#tab-pending').addEventListener('click', () => setFilter('pending'));
    $('#tab-completed').addEventListener('click', () => setFilter('completed'));
    $('#fab-add-task').addEventListener('click', () => openTaskDialog({ mode: 'create' }));
    $('#fab-add-task').replaceChildren(icon('plus'));

    on('user', renderHero);
    on('tasks', renderTasks);
    on('templates', refreshTemplateMarks);
    on('stats', renderStats);
    onLanguageChange(() => { renderHero(); renderStats(); renderTasks(); });
    renderStats();
}

export { initDashboard, renderHero, renderTasks };
