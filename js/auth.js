import { api } from './firebase.js';
import { setLanguage, getCurrentLang } from './i18n.js';

const STORAGE_KEY = 'productivity_tracker_user';
const SESSION_KEY = 'productivity_tracker_session';

let currentUser = null;
let authMode = 'signin';
const listeners = new Set();

function emit(event, data) {
    listeners.forEach(cb => {
        try { cb(event, data); } catch (e) { console.error('Auth listener error:', e); }
    });
}

function getStoredUsername() {
    try {
        return localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(SESSION_KEY);
    } catch (e) {
        return null;
    }
}

function storeUsername(username, remember) {
    try {
        if (remember) {
            localStorage.setItem(STORAGE_KEY, username);
            sessionStorage.removeItem(SESSION_KEY);
        } else {
            sessionStorage.setItem(SESSION_KEY, username);
            localStorage.removeItem(STORAGE_KEY);
        }
    } catch (e) {
        console.error('Storage error:', e);
    }
}

function clearStoredUsername() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
        console.error('Storage error:', e);
    }
}

async function validateUser(username) {
    try {
        const response = await fetch(`/api/users/${encodeURIComponent(username)}`);
        if (!response.ok) return null;
        const user = await response.json();
        return user && user.username ? user : null;
    } catch (e) {
        return null;
    }
}

async function register(username, password, remember) {
    const trimmed = username.trim();
    
    if (!trimmed) return { success: false, error: 'Username is required' };
    if (trimmed.length < 3) return { success: false, error: 'Username must be at least 3 characters' };
    if (!password) return { success: false, error: 'Password is required' };
    if (password.length < 4) return { success: false, error: 'Password must be at least 4 characters' };
    
    try {
        const existing = await validateUser(trimmed);
        if (existing) {
            return { success: false, error: 'Username already taken' };
        }
        
        const result = await api.register(trimmed, password);
        if (result.success) {
            currentUser = trimmed;
            storeUsername(trimmed, remember);
            emit('auth:login', { username: trimmed });
            return { success: true, username: trimmed };
        }
        return result;
    } catch (error) {
        console.error('Registration error:', error);
        return { success: false, error: error.message || 'Registration failed. Please try again.' };
    }
}

async function signIn(username, password, remember) {
    const trimmed = username.trim();
    
    if (!trimmed) return { success: false, error: 'Username is required' };
    if (!password) return { success: false, error: 'Password is required' };
    
    try {
        const result = await api.login(trimmed, password);
        if (result.success) {
            currentUser = trimmed;
            storeUsername(trimmed, remember);
            
            loadUserPreferences(trimmed);
            
            emit('auth:login', { username: trimmed });
            return { success: true, username: trimmed };
        }
        return result;
    } catch (error) {
        console.error('Sign in error:', error);
        return { success: false, error: error.message || 'Login failed. Please try again.' };
    }
}

async function loadUserPreferences(username) {
    try {
        const userData = await api.getUser(username);
        if (userData?.language && getCurrentLang() !== userData.language) {
            setLanguage(userData.language);
        }
    } catch (e) {
        // Non-critical
    }
}

function signOut() {
    currentUser = null;
    clearStoredUsername();
    emit('auth:logout', {});
}

function getCurrentUser() {
    return currentUser;
}

function setAuthMode(mode) {
    if (mode === 'signin' || mode === 'signup') {
        authMode = mode;
        emit('auth:modeChange', { mode });
    }
}

function getAuthMode() {
    return authMode;
}

function toggleAuthMode() {
    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
}

async function restoreSession() {
    const username = getStoredUsername();
    if (!username) return null;
    
    const user = await validateUser(username);
    if (user) {
        currentUser = username;
        emit('auth:restore', { username, user });
        return username;
    }
    
    clearStoredUsername();
    return null;
}

function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

export {
    register,
    signIn,
    signOut,
    getCurrentUser,
    restoreSession,
    subscribe,
    setAuthMode,
    getAuthMode,
    toggleAuthMode
};
