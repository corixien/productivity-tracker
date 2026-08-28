import { api } from './firebase.js';
import { setLanguage, getCurrentLang } from './i18n.js';

let currentUser = null;

const STORAGE_KEY = 'productivity_tracker_user';
const SESSION_KEY = 'productivity_tracker_session';

function getStoredUsername() {
    const remembered = localStorage.getItem(STORAGE_KEY);
    if (remembered) return remembered;
    return sessionStorage.getItem(SESSION_KEY);
}

function storeUsername(username, remember) {
    if (remember) {
        localStorage.setItem(STORAGE_KEY, username);
        sessionStorage.removeItem(SESSION_KEY);
    } else {
        sessionStorage.setItem(SESSION_KEY, username);
        localStorage.removeItem(STORAGE_KEY);
    }
}

function clearStoredUsername() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
}

async function register(username, password, remember) {
    try {
        const result = await api.register(username, password);
        storeUsername(username, remember);
        currentUser = username;
        return { success: true, username };
    } catch (error) {
        console.error('Register error:', error);
        return { success: false, error: error.message };
    }
}

async function signIn(username, password, remember) {
    try {
        const result = await api.login(username, password);
        
        const userData = await api.getUser(username);
        if (userData.language && getCurrentLang() !== userData.language) {
            setLanguage(userData.language);
        }
        
        storeUsername(username, remember);
        currentUser = username;
        return { success: true, username };
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message };
    }
}

function signOut() {
    currentUser = null;
    clearStoredUsername();
    window.location.reload();
}

function getCurrentUser() {
    return currentUser;
}

function restoreSession() {
    const username = getStoredUsername();
    if (username) {
        currentUser = username;
        return username;
    }
    return null;
}

function subscribeToUser(callback) {
    if (!currentUser) return;
    api.getUser(currentUser).then(data => callback(data));
}

export { register, signIn, signOut, getCurrentUser, restoreSession, subscribeToUser };
