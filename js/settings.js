import { api } from './firebase.js';

api.changeUsername = async (oldUsername, newUsername) => {
    const response = await fetch(`/api/users/${encodeURIComponent(oldUsername)}/change-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUsername })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to change username');
    return data;
};
import { setLanguage, getCurrentLang } from './i18n.js';
import { getCurrentUser } from './auth.js';

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
        const username = getCurrentUser() || '';
        usernameDisplay.textContent = username;
    }
    
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        langSelect.value = getCurrentLang();
    }
    
    const currentAvatar = document.getElementById('current-avatar');
    const avatarPlaceholder = document.getElementById('avatar-placeholder');
    const username = getCurrentUser() || '';
    
    if (username && currentAvatar) {
        api.getUser(username).then(user => {
            if (user.avatar) {
                currentAvatar.src = user.avatar + '?t=' + Date.now();
                currentAvatar.style.display = 'block';
                if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
            }
        });
    }
    
    const uploadBtn = document.getElementById('upload-avatar-btn');
    const saveAvatarBtn = document.getElementById('save-avatar-btn');
    const avatarInput = document.getElementById('avatar-input');
    let selectedAvatarBase64 = null;
    
    if (uploadBtn && avatarInput) {
        uploadBtn.addEventListener('click', () => {
            avatarInput.click();
        });
        
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                selectedAvatarBase64 = event.target.result.split(',')[1];
                if (currentAvatar && avatarPlaceholder) {
                    currentAvatar.src = event.target.result;
                    currentAvatar.style.display = 'block';
                    avatarPlaceholder.style.display = 'none';
                }
                if (saveAvatarBtn) {
                    saveAvatarBtn.style.display = 'inline-block';
                }
            };
            reader.readAsDataURL(file);
        });
    }
    
    if (saveAvatarBtn) {
        saveAvatarBtn.addEventListener('click', async () => {
            if (!selectedAvatarBase64) {
                alert('Please select an image first');
                return;
            }
            
            const result = await uploadAvatar(username, selectedAvatarBase64);
            if (result.success) {
                if (currentAvatar && avatarPlaceholder) {
                    currentAvatar.src = result.avatar + '?t=' + Date.now();
                    currentAvatar.style.display = 'block';
                    avatarPlaceholder.style.display = 'none';
                }
                if (saveAvatarBtn) {
                    saveAvatarBtn.style.display = 'none';
                }
                selectedAvatarBase64 = null;
                alert('Avatar saved!');
            } else {
                alert(result.error || 'Failed to save avatar');
            }
        });
    }
    
    const goalsTextarea = document.getElementById('settings-goals');
    if (goalsTextarea && username) {
        api.getUser(username).then(user => {
            if (user.goals) {
                goalsTextarea.value = user.goals;
            }
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
    
    const result = await api.changeUsername(oldUsername, newUsername);
    return result;
}

async function saveGoals(username) {
    const goals = document.getElementById('settings-goals').value.trim();
    const result = await api.updateUser(username, { goals });
    return result;
}

export { changePassword, changeUsername, uploadAvatar, saveGoals, initSettings };
