import { api } from './api.js';
import { t } from './i18n.js';

async function addFriend(friendUsername) {
    if (!friendUsername) {
        return { success: false, error: t('invalidUsername') };
    }

    try {
        await api.addFriend(friendUsername);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function loadLeaderboard(username) {
    const entries = await api.getLeaderboard(username);
    console.log('Leaderboard entries:', entries);
    return entries;
}

function renderLeaderboard(entries) {
    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = '';

    if (entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${t('noFriends')}</td></tr>`;
        return;
    }

    entries.forEach((entry, index) => {
        const tr = document.createElement('tr');
        const avatarSrc = entry.avatar || null;
        const avatarId = 'avatar-' + index;
        const avatarHtml = avatarSrc
            ? `<img src="${avatarSrc}" class="leaderboard-avatar" alt="avatar" id="${avatarId}" onerror="this.style.display='none';document.getElementById('placeholder-${avatarId}').style.display='flex';">`
            : `<span class="leaderboard-avatar-placeholder" id="placeholder-${avatarId}">👤</span>`;

        const deleteBtn = entry.friendId
            ? `<button class="friend-delete-btn" data-friend-id="${entry.friendId}" title="${t('removeFriend')}">&times;</button>`
            : '';

        tr.innerHTML = `
            <td>#${index + 1}</td>
            <td><div class="leaderboard-user-cell">${avatarHtml}<span>${escapeHtml(entry.username)}</span>${deleteBtn}</div></td>
            <td>${entry.xp.toLocaleString()}</td>
            <td>${entry.tasks}</td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.friend-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const friendId = btn.getAttribute('data-friend-id');
            const row = btn.closest('tr');
            if (confirm(t('confirmRemoveFriend'))) {
                try {
                    await api.removeFriend(friendId);
                    row.remove();
                    const remaining = tbody.querySelectorAll('tr');
                    if (remaining.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">${t('noFriends')}</td></tr>`;
                    }
                } catch (error) {
                    alert(t('failedRemoveFriend'));
                }
            }
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export { addFriend, loadLeaderboard, renderLeaderboard };
