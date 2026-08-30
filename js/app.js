import { register, signIn, signOut, restoreSession, subscribe, getCurrentUser, getAuthMode, setAuthMode, toggleAuthMode } from './auth.js';
import { api } from './firebase.js';
import { calculateXP, getRankName, getProgressPercent, addTask, completeTask as completeTaskOp, deleteTask as deleteTaskOp, renderTasks, updateXPDisplay } from './tasks.js';
import { addFriend, loadLeaderboard, renderLeaderboard } from './leaderboard.js';
import { changePassword, changeUsername, uploadAvatar, saveGoals, initSettings } from './settings.js';
import { initUI, showSection, closeModals } from './ui.js';
import { setLanguage, getCurrentLang, t } from './i18n.js';
import { rateTaskWithAI } from './ai-service.js';

let currentTasks = { pending: [], completed: [] };
let userData = null;
let taskMode = 'pending';
let authUnsubscribe = null;

function init() {
    console.log('App init starting...');
    
    try {
        initUI();
        initSettings();
        
        subscribeToAuthEvents();
        
        const username = restoreSession();
        console.log('Restored session:', username);
        if (username) {
            showApp(username);
        } else {
            showAuth();
        }
        
        attachEventListeners();
        
        console.log('App init complete');
    } catch (error) {
        console.error('App init failed:', error);
        const errorEl = document.getElementById('auth-error');
        if (errorEl) errorEl.textContent = 'Failed to initialize app. Check console for details.';
    }
}

function subscribeToAuthEvents() {
    authUnsubscribe = subscribe((event, data) => {
        if (event === 'auth:login') {
            showApp(data.username);
        } else if (event === 'auth:logout') {
            showAuth();
        } else if (event === 'auth:modeChange') {
            updateAuthUI(data.mode);
        } else if (event === 'auth:restore') {
            updateAuthUI(getAuthMode());
        }
    });
}

function attachEventListeners() {
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
    if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);
    
    const languageSelect = document.getElementById('language-select');
    if (languageSelect) languageSelect.addEventListener('change', (e) => {
        setLanguage(e.target.value);
    });
    
    const aiSubmitBtn = document.getElementById('ai-submit-btn');
    if (aiSubmitBtn) aiSubmitBtn.addEventListener('click', handleAITaskSubmit);
    
    const addPendingBtn = document.getElementById('add-pending-btn');
    if (addPendingBtn) {
        addPendingBtn.addEventListener('click', () => {
            taskMode = 'pending';
        });
    }
    
    const addCompletedBtn = document.getElementById('add-completed-btn');
    if (addCompletedBtn) addCompletedBtn.addEventListener('click', handleAddCompletedTask);
    
    const addPendingTaskBtn = document.getElementById('add-pending-task-btn');
    if (addPendingTaskBtn) {
        addPendingTaskBtn.addEventListener('click', () => {
            taskMode = 'pending';
            openTaskModal();
        });
    }
    
    const addCompletedTaskBtn = document.getElementById('add-completed-task-btn');
    if (addCompletedTaskBtn) {
        addCompletedTaskBtn.addEventListener('click', () => {
            taskMode = 'completed';
            openTaskModal();
        });
    }
    
    const authToggle = document.getElementById('auth-toggle');
    if (authToggle) {
        authToggle.addEventListener('click', () => {
            toggleAuthMode();
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
}

function updateAuthUI(mode) {
    const submitBtn = document.querySelector('#auth-form button[type="submit"]');
    const subtitle = document.querySelector('.auth-card p');
    const modeIndicator = document.getElementById('auth-mode');
    
    if (mode === 'signup') {
        if (submitBtn) submitBtn.textContent = t('register');
        if (subtitle) subtitle.textContent = t('registerSubtitle');
        if (modeIndicator) {
            modeIndicator.textContent = 'Register Mode';
            modeIndicator.style.color = '#4caf50';
        }
    } else {
        if (submitBtn) submitBtn.textContent = t('signIn');
        if (subtitle) subtitle.textContent = t('authSubtitle');
        if (modeIndicator) {
            modeIndicator.textContent = 'Sign In Mode';
            modeIndicator.style.color = '#4a90d9';
        }
    }
}

function showAuth() {
    document.getElementById('auth-screen').classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
    updateAuthUI(getAuthMode());
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

function openTaskModal() {
    const modal = document.getElementById('add-task-modal');
    const overlay = document.getElementById('overlay');
    if (modal) {
        modal.classList.add('active');
        overlay.classList.add('active');
        resetAddTaskModal();
    }
}

async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const remember = document.getElementById('auth-remember').checked;
    const errorEl = document.getElementById('auth-error');
    const submitBtn = document.querySelector('#auth-form button[type="submit"]');
    
    if (!username || !password) {
        errorEl.textContent = t('invalidUsername');
        return;
    }
    
    errorEl.textContent = getAuthMode() === 'signup' ? 'Creating account...' : 'Signing in...';
    if (submitBtn) submitBtn.disabled = true;
    
    try {
        let result;
        if (getAuthMode() === 'signup') {
            result = await register(username, password);
        } else {
            result = await signIn(username, password);
        }
        
        if (result.success) {
            errorEl.textContent = '';
            storeUsername(result.username, remember);
        } else {
            errorEl.textContent = result.error || 'Authentication failed';
        }
    } catch (error) {
        console.error('Auth handler error:', error);
        errorEl.textContent = 'An error occurred. Please try again.';
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function handleSignOut() {
    signOut();
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
    if (e) e.preventDefault();
    const username = getCurrentUser();
    if (!username) return;
    
    const name = document.getElementById('task-name').value.trim();
    const duration = document.getElementById('task-duration').value;
    const hardness = document.getElementById('task-hardness').value;
    const taskSize = document.getElementById('task-size')?.value || 'medium';
    const usefulness = document.getElementById('task-usefulness')?.value || 5;
    const category = 'other';
    
    if (!name || !duration || !hardness) return;
    
    if (taskMode === 'completed') {
        await handleAddCompletedTask(username, name, duration, hardness, taskSize, usefulness, category);
    } else {
        await addTask(username, name, duration, hardness, taskSize, usefulness, category);
        closeModals();
        document.getElementById('task-form').reset();
        document.getElementById('hardness-value').textContent = '5';
        document.getElementById('usefulness-value').textContent = '5';
        document.getElementById('task-size').value = 'medium';
        document.getElementById('xp-preview').textContent = '25 XP';
        refreshTasks(username);
    }
}

async function handleAddCompletedTask(username, name, duration, hardness, taskSize, usefulness, category) {
    const task = await addTask(username, name, duration, hardness, taskSize, usefulness, category);
    const result = await completeTaskOp(username, task.id);
    closeModals();
    document.getElementById('task-form').reset();
    document.getElementById('hardness-value').textContent = '5';
    document.getElementById('usefulness-value').textContent = '5';
    document.getElementById('task-size').value = 'medium';
    document.getElementById('xp-preview').textContent = '25 XP';
    refreshTasks(username);
    if (result.success) {
        updateXPDisplay(result.newXP);
    }
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
    if (!newPassword || newPassword.length < 4) {
        alert(t('invalidPassword'));
        return;
    }
    
    try {
        const result = await changePassword(username, newPassword);
        if (result.success) {
            alert(t('passwordChanged'));
            document.getElementById('settings-new-password').value = '';
        } else {
            alert(result.error || 'Failed to change password');
        }
    } catch (error) {
        alert(error.message || 'Failed to change password');
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
    
    try {
        const result = await changeUsername(username, newUsername);
        if (result.success) {
            localStorage.setItem('productivity_tracker_user', newUsername);
            sessionStorage.setItem('productivity_tracker_user', newUsername);
            alert(t('usernameChanged'));
            signOut();
        } else {
            alert(result.error);
        }
    } catch (error) {
        alert(error.message || 'Failed to change username');
    }
}

function showAISection() {
    document.getElementById('ai-task-section').style.display = 'block';
    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('manual-fallback-section').style.display = 'none';
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
        
        document.getElementById('task-name').value = taskData.name;
        document.getElementById('task-duration').value = taskData.duration;
        document.getElementById('task-hardness').value = taskData.hardness;
        document.getElementById('hardness-value').textContent = taskData.hardness;
        document.getElementById('task-size').value = taskData.taskSize || 'medium';
        document.getElementById('task-usefulness').value = taskData.usefulness || 5;
        document.getElementById('usefulness-value').textContent = taskData.usefulness || 5;
        updateXPPreview();
        
        document.getElementById('ai-task-section').style.display = 'none';
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('manual-fallback-section').style.display = 'block';
    } catch (error) {
        console.error('AI task submission failed:', error);
        const errorKey = error.name === 'AbortError' ? 'aiTimeout' : 'aiFailed';
        alert(t(errorKey));
        showAISection();
    }
}

export { init, calculateXP, getCurrentUser, completeTask, deleteTask };

window.app = { init, calculateXP, getCurrentUser, completeTask, deleteTask };

init();
