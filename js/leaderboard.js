import { api } from './firebase.js';
import { t } from './i18n.js';

async function addFriend(username, friendUsername) {
    if (friendUsername.toLowerCase() === username.toLowerCase()) {
        return { success: false, error: t('invalidUsername') };
    }
    
    try {
        await api.addFriend(username, friendUsername);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function loadLeaderboard(username) {
    const entries = await api.getLeaderboard(username);
    return entries;
}

function renderLeaderboard(entries) {
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';
    
    if (entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">${t('noFriends')}</td></tr>`;
        return;
    }
    
    entries.forEach((entry, index) => {
        const tr = document.createElement('tr');
        const avatarSrc = entry.avatar ? entry.avatar + '?t=' + Date.now() : null;
        const avatarHtml = avatarSrc 
            ? `<img src="${avatarSrc}" class="leaderboard-avatar" alt="avatar">` 
            : `<span class="leaderboard-avatar-placeholder">👤</span>`;
        
        tr.innerHTML = `
            <td>#${index + 1}</td>
            <td><div class="leaderboard-user-cell">${avatarHtml}<span>${escapeHtml(entry.username)}</span></div></td>
            <td>${entry.xp.toLocaleString()}</td>
            <td>${entry.tasks}</td>
        `;
        tbody.appendChild(tr);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export { addFriend, loadLeaderboard, renderLeaderboard };
