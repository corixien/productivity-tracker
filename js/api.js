const API_BASE = '/api';

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options
    };
    
    try {
        const response = await fetch(url, config);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.message || 'API error');
        }
        return data;
    } catch (error) {
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

    async getTasks(userId) {
        const result = await apiRequest(`/tasks?userId=${encodeURIComponent(userId)}`);
        return result;
    },

    async createTask(userId, name, duration, productivity, difficulty, offlineBonus, category) {
        return apiRequest('/tasks', {
            method: 'POST',
            body: JSON.stringify({ userId, name, duration, productivity, difficulty, offlineBonus, category })
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

    async getLeaderboard(userId) {
        const result = await apiRequest(`/leaderboard?userId=${encodeURIComponent(userId)}`);
        return result;
    },

    async addFriend(username, friendUsername) {
        return apiRequest('/friends', {
            method: 'POST',
            body: JSON.stringify({ username, friendUsername })
        });
    }
};

export { api };
