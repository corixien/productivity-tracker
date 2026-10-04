import { api, getQueuedCompletions } from './api.js';
import { state, emit, setUser } from './state.js';
import { trophyToast } from './ui.js';

const META_CACHE_KEY = 'pt_meta';

async function loadMeta() {
    try {
        state.meta = await api.getMeta();
        try { localStorage.setItem(META_CACHE_KEY, JSON.stringify(state.meta)); } catch (error) { /* ignore */ }
    } catch (error) {
        try { state.meta = JSON.parse(localStorage.getItem(META_CACHE_KEY)); } catch (parseError) { state.meta = null; }
    }
    emit('meta', state.meta);
}

function syncPendingSet() {
    state.pendingSync = new Set(getQueuedCompletions());
}

async function loadTasks() {
    try {
        state.tasks = await api.getTasks();
        state.tasksError = false;
    } catch (error) {
        state.tasksError = true;
        throw error;
    } finally {
        state.tasksLoaded = true;
        syncPendingSet();
        emit('tasks', state.tasks);
    }
}

async function loadStats() {
    state.stats = await api.getStats();
    trophyToast(state.stats.trophy);
    emit('stats', state.stats);
}

async function loadTemplates() {
    state.templates = await api.getTemplates();
    emit('templates', state.templates);
}

// Reloads everything that an XP change can affect, in parallel.
async function refreshCore() {
    const [user, tasks, stats] = await Promise.all([api.getMe(), api.getTasks(), api.getStats()]);
    state.tasks = tasks;
    state.tasksLoaded = true;
    state.tasksError = false;
    state.stats = stats;
    trophyToast(stats.trophy);
    syncPendingSet();
    setUser(user);
    emit('tasks', tasks);
    emit('stats', stats);
    return user;
}

export { loadMeta, loadTasks, loadStats, loadTemplates, refreshCore };
