import { api } from './firebase.js';
import { setLanguage, getCurrentLang } from './i18n.js';

async function changePassword(username, newPassword) {
    if (!newPassword || newPassword.length < 4) {
        return { success: false, error: 'Password must be at least 4 characters' };
    }
    
    const userData = await api.getUser(username);
    if (!userData.username) {
        return { success: false, error: 'User not found' };
    }
    
    await api.updateUser(username, { newPassword });
    return { success: true };
}

async function uploadAvatar(username, base64Data) {
    try {
        const result = await api.uploadAvatar(username, base64Data);
        return result;
    } catch (error) {
        console.error('Avatar upload error:', error);
        return { success: false, error: error.message };
    }
}

function initSettings() {
    const usernameDisplay = document.getElementById('settings-username-display');
    if (usernameDisplay) {
        const username = window.app.getCurrentUser ? window.app.getCurrentUser() : '';
        usernameDisplay.textContent = username;
    }
    
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        langSelect.value = getCurrentLang();
    }
    
    const currentAvatar = document.getElementById('current-avatar');
    const avatarPlaceholder = document.getElementById('avatar-placeholder');
    const username = window.app.getCurrentUser ? window.app.getCurrentUser() : '';
    
    if (username && currentAvatar) {
        api.getUser(username).then(user => {
            if (user.avatar) {
                currentAvatar.src = user.avatar;
                currentAvatar.style.display = 'block';
                if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
            }
        });
    }
    
    const uploadBtn = document.getElementById('upload-avatar-btn');
    const avatarInput = document.getElementById('avatar-input');
    
    if (uploadBtn && avatarInput) {
        uploadBtn.addEventListener('click', () => {
            avatarInput.click();
        });
        
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target.result.split(',')[1];
                const result = await uploadAvatar(username, base64);
                if (result.success) {
                    if (currentAvatar && avatarPlaceholder) {
                        currentAvatar.src = result.avatar;
                        currentAvatar.style.display = 'block';
                        avatarPlaceholder.style.display = 'none';
                    }
                } else {
                    alert(result.error || 'Failed to upload avatar');
                }
            };
            reader.readAsDataURL(file);
        });
    }
}

async function changeUsername(oldUsername, newUsername) {
    if (!newUsername || newUsername.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters' };
    }
    
    const existingUser = await api.getUser(newUsername);
    if (existingUser && existingUser.username && existingUser.username.toLowerCase() !== oldUsername.toLowerCase()) {
        return { success: false, error: 'Username already taken' };
    }
    
    const userData = await api.getUser(oldUsername);
    const tasks = await api.getTasks(oldUsername);
    
    await api.updateUser(newUsername, { ...userData, username: newUsername });
    
    for (const task of tasks) {
        await api.updateTask(task.id, { userId: newUsername });
    }
    
    await api.updateUser(oldUsername, { username: '__deleted__' });
    
    return { success: true, newUsername };
}

export { changePassword, changeUsername, uploadAvatar, initSettings };
