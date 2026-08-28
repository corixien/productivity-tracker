import { register, signIn, signOut, restoreSession, subscribeToUser, getCurrentUser } from './auth.js';
import { api } from './firebase.js';
import { calculateXP, getRankName, getProgressPercent, addTask, completeTask as completeTaskOp, deleteTask as deleteTaskOp, renderTasks, updateXPDisplay } from './tasks.js';
import { addFriend, loadLeaderboard, renderLeaderboard } from './leaderboard.js';
import { changePassword, changeUsername, uploadAvatar, saveGoals, initSettings } from './settings.js';
import { initUI, showSection, closeModals } from './ui.js';
import { setLanguage, getCurrentLang, t } from './i18n.js';
import { rateTaskWithAI } from './ai-service.js';

let currentTasks = { pending: [], completed: [] };
let userData = null;
let isRegisterMode = false;

function init() {
    console.log('App init starting...');
    try {
        initUI();
        initSettings();
        
        const username = restoreSession();
        console.log('Restored session:', username);
        if (username) {
            showApp(username);
        } else {
            showAuth();
        }
        
        const authForm = document.getElementById('auth-form');
        if (authForm) authForm.addEventListener('submit', handleAuth);
        
        const taskForm = document.getElementById('task-form');
        if (taskForm) taskForm.addEventListener('submit', handleAddTask);
        
        const friendForm = document.getElementById('friend-form');
        if (friendForm) friendForm.addEventListener('submit', handleAddFriend);
        
        const addFriendBtn = document.getElementById('add-friend-btn');
        if (addFriendBtn) {
            addFriendBtn.addEventListener('click', () => {
                document.getElementById('add-friend-modal').classList.add('active');
                document.getElementById('overlay').classList.add('active');
                document.getElementById('friend-username').value = '';
            });
        }
        
        const closeFriendModal = document.getElementById('close-friend-modal');
        if (closeFriendModal) closeFriendModal.addEventListener('click', closeModals);
        
        const cancelFriendBtn = document.getElementById('cancel-friend-btn');
        if (cancelFriendBtn) cancelFriendBtn.addEventListener('click', closeModals);
        
        const changeUsernameBtn = document.getElementById('change-username-btn');
        if (changeUsernameBtn) changeUsernameBtn.addEventListener('click', handleChangeUsername);
        
        const saveGoalsBtn = document.getElementById('save-goals-btn');
        if (saveGoalsBtn) saveGoalsBtn.addEventListener('click', handleSaveGoals);
        
        const changePasswordBtn = document.getElementById('change-password-btn');
        if (changePasswordBtn) changePasswordBtn.addEventListener('click', handleChangePassword);
        
        const signOutBtn = document.getElementById('sign-out-btn');
        if (signOutBtn) signOutBtn.addEventListener('click', signOut);
        
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) languageSelect.addEventListener('change', (e) => {
            setLanguage(e.target.value);
        });
        
        const aiSubmitBtn = document.getElementById('ai-submit-btn');
        if (aiSubmitBtn) aiSubmitBtn.addEventListener('click', handleAITaskSubmit);
        
        const aiFallbackBtn = document.getElementById('ai-fallback-btn');
        if (aiFallbackBtn) aiFallbackBtn.addEventListener('click', showManualSection);
        
        const backToAiBtn = document.getElementById('back-to-ai-btn');
        if (backToAiBtn) backToAiBtn.addEventListener('click', showAISection);
        
        const authToggle = document.getElementById('auth-toggle');
        if (authToggle) {
            authToggle.addEventListener('click', () => {
                isRegisterMode = !isRegisterMode;
                const btn = document.querySelector('#auth-form button[type="submit"]');
                const subtitle = document.querySelector('.auth-card p');
                if (isRegisterMode) {
                    btn.textContent = t('register');
                    if (subtitle) subtitle.textContent = t('registerSubtitle');
                } else {
                    btn.textContent = t('signIn');
                    if (subtitle) subtitle.textContent = t('authSubtitle');
                }
            });
        }
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.getAttribute('data-section');
                if (section === 'leaderboard') {
                    const username = getCurrentUser();
                    if (username) loadAndRenderLeaderboard(username);
                }
            });
        });
        console.log('App init complete');
    } catch (error) {
        console.error('App init failed:', error);
        document.getElementById('auth-error').textContent = 'Failed to initialize app. Check console for details.';
    }
}

function showAuth() {
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
}

function showApp(username) {
    document.getElementById('auth-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    
    loadUserData(username);
    subscribeToUser((data) => {
        userData = data;
        updateXPDisplay(data.xp);
        refreshTasks(username);
    });
}

async function handleAuth(e) {
    console.log('handleAuth called');
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const remember = document.getElementById('auth-remember').checked;
    const errorEl = document.getElementById('auth-error');
    
    if (!username || !password) {
        errorEl.textContent = t('invalidUsername');
        return;
    }
    
    errorEl.textContent = '';
    console.log('Attempting auth for:', username);
    
    let result;
    if (isRegisterMode) {
        result = await register(username, password, remember);
    } else {
        result = await signIn(username, password, remember);
    }
    console.log('Auth result:', result);
    
    if (result.success) {
        showApp(result.username);
    } else {
        errorEl.textContent = result.error;
    }
}

async function loadUserData(username) {
    const data = await api.getUser(username);
    if (data && data.username) {
        userData = data;
        updateXPDisplay(data.xp || 0);
    }
    refreshTasks(username);
}

async function refreshTasks(username) {
    const tasks = await api.getTasks(username);
    const pending = [];
    const completed = [];
    
    tasks.forEach(task => {
        if (task.completed) {
            completed.push(task);
        } else {
            pending.push(task);
        }
    });
    
    currentTasks = { pending, completed };
    renderTasks(pending, completed);
}

async function handleAddTask(e) {
    e.preventDefault();
    const username = getCurrentUser();
    if (!username) return;
    
    const name = document.getElementById('task-name').value.trim();
    const duration = document.getElementById('task-duration').value;
    const hardness = document.getElementById('task-hardness').value;
    
    if (!name || !duration || !hardness) return;
    
    await addTask(username, name, duration, hardness, 'medium', 5, 'other');
    closeModals();
    document.getElementById('task-form').reset();
    document.getElementById('hardness-value').textContent = '5';
    document.getElementById('xp-preview').textContent = '25 XP';
    refreshTasks(username);
}

async function completeTask(taskId) {
    const username = getCurrentUser();
    if (!username) return;
    
    const result = await completeTaskOp(username, taskId);
    if (result.success) {
        updateXPDisplay(result.newXP);
        refreshTasks(username);
    }
}

async function deleteTask(taskId) {
    const username = getCurrentUser();
    if (!username) return;
    
    const confirmed = confirm('Delete this task? ' + (currentTasks.completed.some(t => t.id === taskId) ? 'This will remove its XP from your total.' : ''));
    if (!confirmed) return;
    
    const result = await deleteTaskOp(username, taskId);
    if (result.success) {
        updateXPDisplay(result.newXP);
        refreshTasks(username);
    }
}

async function handleAddFriend(e) {
    e.preventDefault();
    const username = getCurrentUser();
    if (!username) return;
    
    const friendUsername = document.getElementById('friend-username').value.trim();
    if (!friendUsername) return;
    
    const result = await addFriend(username, friendUsername);
    if (result.success) {
        closeModals();
        loadAndRenderLeaderboard(username);
    } else {
        alert(result.error);
    }
}

async function loadAndRenderLeaderboard(username) {
    const entries = await loadLeaderboard(username);
    renderLeaderboard(entries);
}

async function handleChangePassword() {
    const username = getCurrentUser();
    if (!username) return;
    
    const newPassword = document.getElementById('settings-new-password').value.trim();
    if (!newPassword) {
        alert(t('invalidPassword'));
        return;
    }
    
    const result = await changePassword(username, newPassword);
    if (result.success) {
        alert(t('passwordChanged'));
        document.getElementById('settings-new-password').value = '';
    } else {
        alert(result.error);
    }
}

async function handleSaveGoals() {
    const username = getCurrentUser();
    if (!username) return;
    
    const result = await saveGoals(username);
    if (result) {
        alert(t('goalsSaved'));
    }
}

async function handleChangeUsername() {
    const username = getCurrentUser();
    if (!username) return;
    
    const newUsername = document.getElementById('settings-new-username').value.trim();
    if (!newUsername || newUsername.length < 3) {
        alert(t('invalidUsername'));
        return;
    }
    
    const result = await changeUsername(username, newUsername);
    if (result.success) {
        alert(t('usernameChanged'));
        signOut();
    } else {
        alert(result.error);
    }
}

function showAISection() {
    document.getElementById('ai-task-section').style.display = 'block';
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('manual-fallback-section').style.display = 'none';
}

function showManualSection() {
    document.getElementById('ai-task-section').style.display = 'none';
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('manual-fallback-section').style.display = 'block';
}

function showLoadingSection() {
    document.getElementById('ai-task-section').style.display = 'none';
    document.getElementById('ai-loading').style.display = 'flex';
    document.getElementById('manual-fallback-section').style.display = 'none';
}

async function handleAITaskSubmit() {
    const username = getCurrentUser();
    if (!username) return;
    
    const description = document.getElementById('ai-task-input').value.trim();
    if (!description) return;
    
    showLoadingSection();
    
    try {
        const goals = userData?.goals || '';
        const taskData = await rateTaskWithAI(description, goals);
        await addTask(username, taskData.name, taskData.duration, taskData.hardness, taskData.taskSize, taskData.usefulness, taskData.category);
        closeModals();
        document.getElementById('ai-task-input').value = '';
        refreshTasks(username);
        showAISection();
    } catch (error) {
        console.error('AI task submission failed:', error);
        const errorKey = error.name === 'AbortError' ? 'aiTimeout' : 'aiFailed';
        alert(t(errorKey));
        showManualSection();
    }
}

export { init, calculateXP, getCurrentUser, completeTask, deleteTask };

window.app = { init, calculateXP, getCurrentUser, completeTask, deleteTask };

init();
