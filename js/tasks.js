import { api } from './firebase.js';
import { t } from './i18n.js';

const RANK_THRESHOLDS = [
    { name: 'Newcomer', min: 0, next: 100 },
    { name: 'Bronze', min: 100, next: 300 },
    { name: 'Silver', min: 300, next: 600 },
    { name: 'Gold', min: 600, next: 1200 },
    { name: 'Platinum', min: 1200, next: 2400 },
    { name: 'Diamond', min: 2400, next: 5000 },
    { name: 'Master', min: 5000, next: null }
];

function getRankInfo(xp) {
    let currentRank = RANK_THRESHOLDS[0];
    for (const rank of RANK_THRESHOLDS) {
        if (xp >= rank.min) {
            currentRank = rank;
        }
    }
    return currentRank;
}

function getRankName(xp) {
    return getRankInfo(xp).name;
}

function getProgressPercent(xp) {
    const current = getRankInfo(xp);
    if (!current.next) return 100;
    const range = current.next - current.min;
    const progress = xp - current.min;
    return Math.min(100, Math.max(0, (progress / range) * 100));
}

async function addTask(userEmail, name, duration, productivity, difficulty, bonus, category) {
    return api.createTask(userEmail, name, duration, productivity, difficulty, bonus, category);
}

async function completeTask(userEmail, taskId) {
    const task = await api.updateTask(taskId, { completed: true, completedAt: new Date().toISOString() });
    if (!task) return { success: false };
    
    const userData = await api.getUser(userEmail);
    const newXP = (userData.xp || 0) + task.xp;
    const newRank = getRankName(newXP);
    const newLevel = Math.floor(newXP / 100);
    
    await api.updateUser(userEmail, { xp: newXP, rank: newRank, level: newLevel });
    
    return { success: true, xpEarned: task.xp, newXP, newRank };
}

async function deleteTask(userEmail, taskId) {
    const task = await api.getTasks(userEmail).then(tasks => tasks.find(t => t.id === taskId));
    if (!task) return { success: false };
    
    let newXP = (await api.getUser(userEmail)).xp || 0;
    
    if (task.completed) {
        newXP = Math.max(0, newXP - task.xp);
        const newRank = getRankName(newXP);
        const newLevel = Math.floor(newXP / 100);
        await api.updateUser(userEmail, { xp: newXP, rank: newRank, level: newLevel });
    }
    
    await api.deleteTask(taskId);
    return { success: true, newXP };
}

function renderTasks(pendingTasks, completedTasks) {
    const pendingList = document.getElementById('pending-list');
    const completedList = document.getElementById('completed-list');
    
    pendingList.innerHTML = '';
    completedList.innerHTML = '';
    
    if (pendingTasks.length === 0) {
        pendingList.innerHTML = `<li class="empty-state">${t('noPendingTasks')}</li>`;
    } else {
        pendingTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item';
            li.innerHTML = `
                <div class="task-item-header">
                    <span class="task-name">${escapeHtml(task.name)}</span>
                    <span class="task-xp">+${task.xp} XP</span>
                </div>
                <div class="task-meta">
                    <span>${t('duration')}: ${task.duration} min</span>
                    <span>${t('productivity')}: ${task.productivity || 0}/5</span>
                    <span>${t('difficulty')}: ${task.difficulty || 3}/5</span>
                    <span>${t('bonus')}: +${task.bonus || 0}</span>
                </div>
                <div class="task-actions">
                    <button class="btn-complete" onclick="app.completeTask('${task.id}')">${t('taskCompleted')}</button>
                    <button class="btn-delete" onclick="app.deleteTask('${task.id}')">${t('delete')}</button>
                </div>
            `;
            pendingList.appendChild(li);
        });
    }
    
    if (completedTasks.length === 0) {
        completedList.innerHTML = `<li class="empty-state">${t('noCompletedTasks')}</li>`;
    } else {
        completedTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item';
            li.innerHTML = `
                <div class="task-item-header">
                    <span class="task-name">${escapeHtml(task.name)}</span>
                    <span class="task-xp">+${task.xp} XP</span>
                </div>
                <div class="task-meta">
                    <span>${t('duration')}: ${task.duration} min</span>
                    <span>${t('productivity')}: ${task.productivity || 0}/5</span>
                    <span>${t('difficulty')}: ${task.difficulty || 3}/5</span>
                    <span>${t('bonus')}: +${task.bonus || 0}</span>
                </div>
                <div class="task-actions">
                    <button class="btn-delete" onclick="app.deleteTask('${task.id}')">${t('delete')}</button>
                </div>
            `;
            completedList.appendChild(li);
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const RANK_ICONS = {
    'Newcomer': '⭐',
    'Bronze': '🥉',
    'Silver': '🥈',
    'Gold': '🥇',
    'Platinum': '💎',
    'Diamond': '💠',
    'Master': '👑'
};

function updateXPDisplay(xp) {
    const rank = getRankName(xp);
    const level = Math.floor(xp / 100);
    const percent = getProgressPercent(xp);
    const current = getRankInfo(xp);
    const nextMin = current.next || current.min;
    
    const badge = document.getElementById('rank-badge');
    badge.setAttribute('data-rank', rank);
    badge.querySelector('.rank-icon').textContent = RANK_ICONS[rank] || '⭐';
    badge.querySelector('.rank-label').textContent = t('rank' + capitalize(rank));
    document.getElementById('level-info').textContent = `Level ${level}`;
    document.getElementById('xp-text').textContent = `${xp} / ${nextMin} XP`;
    document.getElementById('xp-fill').style.width = `${percent}%`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export { getRankName, getProgressPercent, getRankInfo, addTask, completeTask, deleteTask, renderTasks, updateXPDisplay };
