const API_BASE = '/api';
const TOKEN_KEY = 'productivity_tracker_token';
const TOKEN_SESSION_KEY = 'productivity_tracker_session_token';

function getAuthToken() {
    try {
        return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_SESSION_KEY);
    } catch (e) {
        return null;
    }
}

function setAuthToken(token, remember) {
    try {
        if (remember) {
            localStorage.setItem(TOKEN_KEY, token);
            sessionStorage.removeItem(TOKEN_SESSION_KEY);
        } else {
            sessionStorage.setItem(TOKEN_SESSION_KEY, token);
            localStorage.removeItem(TOKEN_KEY);
        }
    } catch (e) {
        console.error('Token storage error:', e);
    }
}

function removeAuthToken() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_SESSION_KEY);
    } catch (e) {
        console.error('Token storage error:', e);
    }
}

async function apiRequest(endpoint, options = {}, retryCount = 0) {
    const MAX_RETRIES = 3;
    const DELAYS = [2000, 4000, 8000];
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options
    };

    const token = getAuthToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, config);
        const text = await response.text();

        const shouldRetry = retryCount < MAX_RETRIES && (
            !text ||
            response.status >= 500 ||
            response.status === 429 ||
            response.status === 503 ||
            response.status === 502 ||
            response.status === 504
        );

        if (!text && shouldRetry) {
            await new Promise(resolve => setTimeout(resolve, DELAYS[retryCount] || DELAYS[MAX_RETRIES - 1]));
            return apiRequest(endpoint, options, retryCount + 1);
        }

        if (!text) {
            throw new Error('Server returned an empty response. Please try again.');
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            if (shouldRetry) {
                await new Promise(resolve => setTimeout(resolve, DELAYS[retryCount] || DELAYS[MAX_RETRIES - 1]));
                return apiRequest(endpoint, options, retryCount + 1);
            }
            throw new Error('Server returned an invalid response. Please try again.');
        }

        if (!response.ok) {
            if (shouldRetry) {
                await new Promise(resolve => setTimeout(resolve, DELAYS[retryCount] || DELAYS[MAX_RETRIES - 1]));
                return apiRequest(endpoint, options, retryCount + 1);
            }
            throw new Error(data.error || data.message || 'API error');
        }

        return data;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        console.error('API request failed:', error);
        throw error;
    }
}

const api = {
    async register(username, password) {
        return apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    async login(username, password) {
        return apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    async getMe() {
        return apiRequest('/auth/me');
    },

    async getUser(username) {
        return apiRequest(`/users/${encodeURIComponent(username)}`);
    },

    async updateUser(username, data) {
        return apiRequest(`/users/${encodeURIComponent(username)}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async uploadAvatar(username, base64Image) {
        return apiRequest(`/users/${encodeURIComponent(username)}/avatar`, {
            method: 'POST',
            body: JSON.stringify({ avatar: base64Image })
        });
    },

    async changeUsername(oldUsername, newUsername) {
        return apiRequest(`/users/${encodeURIComponent(oldUsername)}/change-username`, {
            method: 'POST',
            body: JSON.stringify({ newUsername })
        });
    },

    async getTasks(userId) {
        return apiRequest(`/tasks?userId=${encodeURIComponent(userId)}`);
    },

    async createTask(userId, name, duration, productivity, difficulty, bonus, category) {
        return apiRequest('/tasks', {
            method: 'POST',
            body: JSON.stringify({ userId, name, duration, productivity, difficulty, bonus, category })
        });
    },

    async updateTask(taskId, data) {
        return apiRequest(`/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async deleteTask(taskId) {
        return apiRequest(`/tasks/${taskId}`, {
            method: 'DELETE'
        });
    },

    async completeTask(taskId) {
        return apiRequest(`/tasks/${taskId}/complete`, {
            method: 'POST'
        });
    },

    async getLeaderboard(userId) {
        return apiRequest(`/leaderboard?userId=${encodeURIComponent(userId)}`);
    },

    async addFriend(friendUsername) {
        return apiRequest('/users/friends', {
            method: 'POST',
            body: JSON.stringify({ friendUsername })
        });
    },

    async removeFriend(friendId) {
        return apiRequest(`/users/friends/${friendId}`, {
            method: 'DELETE'
        });
    },

    async getSettings() {
        return apiRequest('/settings');
    },

    async updateSettings(data) {
        return apiRequest('/settings', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
};

export { api, apiRequest, getAuthToken, setAuthToken, removeAuthToken };
