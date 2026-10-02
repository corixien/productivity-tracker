import { events } from './core/api.js';
import { state, on } from './core/state.js';
import { $, hydrateIcons } from './core/dom.js';
import { t, setLanguage, getCurrentLang, onLanguageChange } from './core/i18n.js';
import { initTheme } from './core/theme.js';
import { restoreSession, signOut } from './core/auth.js';
import { loadMeta, loadTasks, loadStats, loadTemplates, refreshCore } from './core/data.js';
import { initDialogs, toast, closeDialog, showError } from './core/ui.js';
import { initPwa, syncQueue } from './core/pwa.js';
import { initGlass } from './core/glass.js';
import { startLive, stopLive } from './core/live.js';
import { initSegmented } from './core/segmented.js';
import { initNav, registerView, startNav, refreshCurrentView } from './features/nav.js';
import { initAuthView, resetAuthView } from './features/auth-view.js';
import { initDashboard } from './features/dashboard.js';
import { initTaskDialog } from './features/task-dialog.js';
import { initTemplates, showTemplates } from './features/templates.js';
import { initActivity, showActivity } from './features/activity.js';
import { initLeaderboard, showLeaderboard } from './features/leaderboard.js';
import { initSettings, renderSettings } from './features/settings.js';
import { initDatabase, showDatabase } from './features/admin/database.js';
import { initLogs, showLogs } from './features/admin/logs.js';
import { initAnalytics, showAnalytics } from './features/admin/analytics.js';
import { warnNonCritical } from './features/shared.js';

const STALE_AFTER_MS = 60 * 1000;
let lastRefresh = 0;

function showScreen(name) {
    $('#splash').hidden = true;
    $('#auth-screen').hidden = name !== 'auth';
    $('#app-screen').hidden = name !== 'app';
}

async function loadAll() {
    const results = await Promise.allSettled([loadTasks(), loadStats(), loadTemplates()]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) showError(failed.reason, 'loadFailed');
    lastRefresh = Date.now();
    syncQueue();
}

function showApp() {
    showScreen('app');
    startLive();
    renderSettings();
    startNav();
    loadAll();
}

function showAuth() {
    stopLive();
    document.querySelectorAll('dialog[open]').forEach(closeDialog);
    resetAuthView();
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
    initSegmented();
    initNav();
    initAuthView();
    initDashboard();
    initTaskDialog();
    initTemplates();
    initActivity();
    initLeaderboard();
    initSettings();
    initDatabase();
    initLogs();
    initAnalytics();

    registerView('templates', showTemplates);
    registerView('activity', showActivity);
    registerView('leaderboard', showLeaderboard);
    registerView('settings', renderSettings);
    registerView('admin-database', showDatabase);
    registerView('admin-logs', showLogs);
    registerView('admin-analytics', showAnalytics);

    on('auth:login', showApp);
    // Deep links (such as the admin URL) survive the sign-in screen; signing out resets the route.
    on('auth:logout', () => { history.replaceState(null, '', location.pathname); showAuth(); });
    on('sync:done', () => refreshCore().catch(warnNonCritical('sync:done')));
    // An admin (or another device) changed this account: reload everything that is on screen.
    let syncTimer = null;
    on('live:sync', () => {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(async () => {
            await Promise.allSettled([refreshCore(), loadTemplates()]);
            refreshCurrentView();
        }, 300);
    });
    on('live:revoked', () => {
        if (!state.user) return;
        signOut();
        toast(t('accountChanged'), { type: 'error' });
    });
    on('live:resume', () => { if (state.user) refreshCore().catch(warnNonCritical('live:resume')); });
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
