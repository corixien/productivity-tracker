import { api, setAuthToken, replaceAuthToken, removeAuthToken, getAuthToken } from './api.js';
import { state, setUser, emit } from './state.js';
import { setLanguage, getCurrentLang } from './i18n.js';

const LANG_KEY = 'lang';

function adoptServerLanguage(user) {
    // A language chosen on this device wins until the user changes it in settings.
    let local = null;
    try { local = localStorage.getItem(LANG_KEY); } catch (error) { /* ignore */ }
    if (!local && user.language && user.language !== getCurrentLang()) setLanguage(user.language);
}

async function startSession(result, remember) {
    setAuthToken(result.token, remember);
    const user = await api.getMe();
    setUser(user);
    adoptServerLanguage(user);
    emit('auth:login', user);
    return user;
}

async function signIn(username, password, remember) {
    return startSession(await api.login(username.trim(), password), remember);
}

async function register(username, password, remember) {
    return startSession(await api.register(username.trim(), password), remember);
}

function signOut() {
    removeAuthToken();
    state.tasks = [];
    state.tasksLoaded = false;
    state.stats = null;
    state.templates = [];
    state.pendingSync.clear();
    setUser(null);
    emit('auth:logout');
}

// Returns the user for a stored token, null when there is none or it was rejected.
// A network failure keeps the token and rethrows so the caller can show an offline state.
async function restoreSession() {
    if (!getAuthToken()) return null;
    try {
        const user = await api.getMe();
        setUser(user);
        adoptServerLanguage(user);
        return user;
    } catch (error) {
        if (error.network || error.status >= 500) throw error;
        removeAuthToken();
        return null;
    }
}

async function refreshUser() {
    const user = await api.getMe();
    setUser(user);
    return user;
}

export { signIn, register, signOut, restoreSession, refreshUser, replaceAuthToken };
