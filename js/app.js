import { api, events } from './core/api.js';
import { state, on } from './core/state.js';
import { $, hydrateIcons } from './core/dom.js';
import { t, setLanguage, getCurrentLang, onLanguageChange } from './core/i18n.js';
import { initTheme } from './core/theme.js';
import { restoreSession, signOut } from './core/auth.js';
import { loadMeta, loadTasks, loadStats, loadTemplates, refreshCore } from './core/data.js';
import { initDialogs, toast, closeDialog, showError } from './core/ui.js';
import { initPwa, syncQueue } from './core/pwa.js';
import { initGlass } from './core/glass.js';
import { initNav, registerView, startNav } from './features/nav.js';
import { initAuthView, resetAuthView } from './features/auth-view.js';
import { initDashboard } from './features/dashboard.js';
import { initTaskDialog } from './features/task-dialog.js';
import { initTemplates, showTemplates } from './features/templates.js';
import { initActivity, showActivity } from './features/activity.js';
import { initLeaderboard, showLeaderboard } from './features/leaderboard.js';
import { initSettings, renderSettings } from './features/settings.js';
import { warnNonCritical } from './features/shared.js';

const STALE_AFTER_MS = 60 * 1000;
let lastRefresh = 0;

function showScreen(name) {
    $('#splash').hidden = true;
    $('#auth-screen').hidden = name !== 'auth';
    $('#app-screen').hidden = name !== 'app';
}

async function loadAll() {
    // Recurring templates first, so the task list below already contains what they spawned.
    const spawned = await api.spawnRecurring().catch(warnNonCritical('spawnRecurring'));
    const results = await Promise.allSettled([loadTasks(), loadStats(), loadTemplates()]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) showError(failed.reason, 'loadFailed');
    if (spawned && spawned.tasks.length > 0) toast(t('recurringAdded', { n: spawned.tasks.length }), { type: 'success' });
    lastRefresh = Date.now();
    syncQueue();
}

function showApp() {
    showScreen('app');
    renderSettings();
    startNav();
    loadAll();
}

function showAuth() {
    document.querySelectorAll('dialog[open]').forEach(closeDialog);
    resetAuthView();
    history.replaceState(null, '', location.pathname);
    showScreen('auth');
    document.title = t('appTitle');
    $('#auth-username').focus();
}

// Pull fresh data when the user comes back to a tab that has been idle (friends, multiplier, streak).
function refreshWhenVisible() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !state.user) return;
        if (Date.now() - lastRefresh < STALE_AFTER_MS) return;
        lastRefresh = Date.now();
        refreshCore().catch(warnNonCritical('refreshWhenVisible'));
    });
}

async function init() {
    initTheme();
    hydrateIcons();
    setLanguage(getCurrentLang());
    initDialogs();
    initPwa();
    initGlass();
    initNav();
    initAuthView();
    initDashboard();
    initTaskDialog();
    initTemplates();
    initActivity();
    initLeaderboard();
    initSettings();

    registerView('templates', showTemplates);
    registerView('activity', showActivity);
    registerView('leaderboard', showLeaderboard);
    registerView('settings', renderSettings);

    on('auth:login', showApp);
    on('auth:logout', showAuth);
    on('sync:done', () => refreshCore().catch(warnNonCritical('sync:done')));
    events.addEventListener('unauthorized', () => {
        if (!state.user) return;
        signOut();
        toast(t('sessionExpired'), { type: 'error' });
    });
    onLanguageChange(() => { if (!state.user) document.title = t('appTitle'); });
    refreshWhenVisible();

    loadMeta();
    try {
        const user = await restoreSession();
        if (user) showApp();
        else showAuth();
    } catch (error) {
        // Token exists but the server cannot be reached: stay signed in and let the user retry.
        showScreen('auth');
        $('#auth-error').textContent = t('networkError');
    }
}

init();
