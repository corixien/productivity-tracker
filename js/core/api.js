const API_BASE = '/api';
const TOKEN_KEY = 'productivity_tracker_token';
const TOKEN_SESSION_KEY = 'productivity_tracker_session_token';
const QUEUE_KEY = 'pt_offline_queue';
const SESSION_ERROR_CODES = new Set(['auth_required', 'invalid_token', 'session_revoked', 'user_not_found']);
const RETRY_DELAYS = [1500, 3000, 6000];
const SLOW_AFTER_MS = 3000;

// Events: 'unauthorized' (session no longer valid), 'slow' ({slow}), 'waking' ({active}: server cold start).
const events = new EventTarget();
const fire = (name, detail) => events.dispatchEvent(new CustomEvent(name, { detail }));

class ApiError extends Error {
    constructor(message, status = 0, code = undefined) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.network = status === 0;
    }
}

/* ---- token storage ---- */
function storageGet(storage, key) {
    try { return storage.getItem(key); } catch (error) { return null; }
}
function storageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (error) { /* storage unavailable */ }
}
function storageRemove(storage, key) {
    try { storage.removeItem(key); } catch (error) { /* storage unavailable */ }
}

const getAuthToken = () => storageGet(localStorage, TOKEN_KEY) || storageGet(sessionStorage, TOKEN_SESSION_KEY);

function setAuthToken(token, remember) {
    if (remember) {
        storageSet(localStorage, TOKEN_KEY, token);
        storageRemove(sessionStorage, TOKEN_SESSION_KEY);
    } else {
        storageSet(sessionStorage, TOKEN_SESSION_KEY, token);
        storageRemove(localStorage, TOKEN_KEY);
    }
}

// Keeps the "remember me" choice when the server hands out a fresh token.
function replaceAuthToken(token) {
    setAuthToken(token, Boolean(storageGet(localStorage, TOKEN_KEY)));
}

function removeAuthToken() {
    storageRemove(localStorage, TOKEN_KEY);
    storageRemove(sessionStorage, TOKEN_SESSION_KEY);
}

/* ---- request core ---- */
let activeRequests = 0;
let slowTimer = null;
let slowShown = false;

function trackStart() {
    activeRequests += 1;
    if (!slowTimer && !slowShown) {
        slowTimer = setTimeout(() => {
            slowTimer = null;
            if (activeRequests > 0) { slowShown = true; fire('slow', { slow: true }); }
        }, SLOW_AFTER_MS);
    }
}

function trackEnd() {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) {
        clearTimeout(slowTimer);
        slowTimer = null;
        if (slowShown) { slowShown = false; fire('slow', { slow: false }); }
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function canRetry(method, status) {
    if ([502, 503, 504].includes(status)) return true;   // proxy answered: the request never reached the app
    return status === 0 && method === 'GET';              // plain network failure: only safe for reads
}

async function apiRequest(endpoint, { method = 'GET', body, signal, headers = {} } = {}) {
    const config = {
        method,
        signal,
        headers: {
            'Content-Type': 'application/json',
            'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            ...headers
        }
    };
    if (body !== undefined) config.body = JSON.stringify(body);
    const token = getAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;

    let waking = false;
    trackStart();
    try {
        for (let attempt = 0; ; attempt += 1) {
            let response;
            let text = '';
            try {
                response = await fetch(`${API_BASE}${endpoint}`, config);
                text = await response.text();
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                if (attempt < RETRY_DELAYS.length && canRetry(method, 0)) {
                    await sleep(RETRY_DELAYS[attempt]);
                    continue;
                }
                throw new ApiError('Network error', 0, 'network');
            }

            if (attempt < RETRY_DELAYS.length && canRetry(method, response.status)) {
                waking = true;
                fire('waking', { active: true });
                await sleep(RETRY_DELAYS[attempt]);
                continue;
            }

            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }

            if (!response.ok) {
                const code = data && data.code;
                if (response.status === 401 && token && SESSION_ERROR_CODES.has(code)) fire('unauthorized', { code });
                throw new ApiError((data && (data.error || data.message)) || `Request failed (${response.status})`, response.status, code);
            }
            if (data === null) throw new ApiError('The server returned an invalid response.', response.status, 'invalid_response');
            return data;
        }
    } finally {
        if (waking) fire('waking', { active: false });
        trackEnd();
    }
}

/* ---- offline queue: completing an existing task is the only action that is queued ---- */
function readQueue() {
    try { return JSON.parse(storageGet(localStorage, QUEUE_KEY) || '[]'); } catch (error) { return []; }
}
function writeQueue(queue) {
    storageSet(localStorage, QUEUE_KEY, JSON.stringify(queue));
}
const getQueuedCompletions = () => readQueue();

function enqueueCompletion(taskId) {
    const queue = readQueue();
    if (!queue.includes(taskId)) writeQueue([...queue, taskId]);
}

// Replays queued completions in order. Returns how many were synced and how many remain.
async function flushQueue() {
    let queue = readQueue();
    let synced = 0;
    for (const taskId of [...queue]) {
        try {
            await apiRequest(`/tasks/${taskId}/complete`, { method: 'POST' });
            synced += 1;
        } catch (error) {
            if (error.network || error.status >= 500) break;   // try again later
            // 4xx (e.g. task deleted meanwhile): drop it
        }
        queue = queue.filter((id) => id !== taskId);
        writeQueue(queue);
    }
    return { synced, remaining: readQueue().length };
}

const api = {
    register: (username, password) => apiRequest('/auth/register', { method: 'POST', body: { username, password } }),
    login: (username, password) => apiRequest('/auth/login', { method: 'POST', body: { username, password } }),
    getMe: () => apiRequest('/auth/me'),
    getMeta: () => apiRequest('/meta'),

    updateSettings: (data) => apiRequest('/settings', { method: 'PUT', body: data }),
    uploadAvatar: (username, avatar) => apiRequest(`/users/${encodeURIComponent(username)}/avatar`, { method: 'POST', body: { avatar } }),
    changeUsername: (username, newUsername) => apiRequest(`/users/${encodeURIComponent(username)}/change-username`, { method: 'POST', body: { newUsername } }),
    changePassword: (username, currentPassword, newPassword) => apiRequest(`/users/${encodeURIComponent(username)}/password`, { method: 'POST', body: { currentPassword, newPassword } }),

    getTasks: () => apiRequest('/tasks'),
    createTask: (task) => apiRequest('/tasks', { method: 'POST', body: task }),
    updateTask: (id, data) => apiRequest(`/tasks/${id}`, { method: 'PUT', body: data }),
    deleteTask: (id) => apiRequest(`/tasks/${id}`, { method: 'DELETE' }),
    async completeTask(id) {
        try {
            return await apiRequest(`/tasks/${id}/complete`, { method: 'POST' });
        } catch (error) {
            if (!error.network) throw error;
            enqueueCompletion(id);
            return { success: true, queued: true, taskId: id };
        }
    },
    uncompleteTask: (id) => apiRequest(`/tasks/${id}`, { method: 'PUT', body: { completed: false } }),

    getStats: () => apiRequest('/xp/stats'),
    getFirstPlace: () => apiRequest('/xp/first-place'),
    getXp: (limit, offset) => apiRequest(`/xp?limit=${limit}&offset=${offset}`),
    getLeaderboard: (period) => apiRequest(`/leaderboard?period=${period}`),
    addFriend: (friendUsername) => apiRequest('/users/friends', { method: 'POST', body: { friendUsername } }),
    removeFriend: (friendId) => apiRequest(`/users/friends/${friendId}`, { method: 'DELETE' }),

    getTemplates: () => apiRequest('/users/quick-tasks'),
    createTemplate: (template) => apiRequest('/users/quick-tasks', { method: 'POST', body: template }),
    updateTemplate: (id, data) => apiRequest(`/users/quick-tasks/${id}`, { method: 'PUT', body: data }),
    deleteTemplate: (id) => apiRequest(`/users/quick-tasks/${id}`, { method: 'DELETE' }),
    useTemplate: (id) => apiRequest(`/users/quick-tasks/${id}/use`, { method: 'POST' }),

    adminTables: () => apiRequest('/admin/tables'),
    adminRows(table, { q = '', filters = [], sort = '', dir = 'asc' }) {
        const params = new URLSearchParams({ q, sort, dir });
        if (filters.length) params.set('filters', JSON.stringify(filters));
        return apiRequest(`/admin/tables/${table}?${params}`);
    },
    adminCell: (table, key, column) => apiRequest(`/admin/tables/${table}/${encodeURIComponent(key)}/cell?column=${encodeURIComponent(column)}`),
    adminUpdate: (table, key, column, value) => apiRequest(`/admin/tables/${table}/${encodeURIComponent(key)}`, { method: 'PATCH', body: { column, value } }),
    adminDelete: (table, key) => apiRequest(`/admin/tables/${table}/${encodeURIComponent(key)}`, { method: 'DELETE' }),
    adminLogs: (params) => apiRequest(`/admin/logs?${new URLSearchParams(params)}`),
    adminAnalytics: () => apiRequest('/admin/analytics'),

    rateTask(description, goals, language, signal) {
        return apiRequest('/groq', { method: 'POST', body: { description, goals, language }, signal });
    }
};

export {
    api, apiRequest, events, ApiError,
    getAuthToken, setAuthToken, replaceAuthToken, removeAuthToken,
    getQueuedCompletions, flushQueue
};
