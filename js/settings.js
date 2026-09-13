import { api } from './api.js';
import { setLanguage, getCurrentLang, t } from './i18n.js';
import { getCurrentUser, updateSession } from './auth.js';

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

async function changeUsername(oldUsername, newUsername) {
    if (!newUsername || newUsername.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters' };
    }

    if (newUsername.toLowerCase() === oldUsername.toLowerCase()) {
        return { success: false, error: 'Username unchanged' };
    }

    let existingUser = null;
    try {
        existingUser = await api.getUser(newUsername);
    } catch (e) {
        // 404 means the username is available — that's what we want
        existingUser = null;
    }

    if (existingUser && existingUser.username && existingUser.username.toLowerCase() !== oldUsername.toLowerCase()) {
        return { success: false, error: 'Username already taken' };
    }

    const result = await api.changeUsername(oldUsername, newUsername);
    return result;
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
                currentAvatar.src = user.avatar;
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

            const currentUser = getCurrentUser();
            if (!currentUser) {
                alert('Session expired. Please log in again to save your avatar.');
                return;
            }

            const result = await uploadAvatar(currentUser, selectedAvatarBase64);
            if (result.success) {
                if (currentAvatar && avatarPlaceholder) {
                    currentAvatar.src = result.avatar;
                    currentAvatar.style.display = 'block';
                    if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
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

let cancelHandler = null;
let submitHandler = null;

function initChangeCredentials(showAppFn) {
    const changeForm = document.getElementById('change-credentials-form');
    const usernameInput = document.getElementById('change-username-input');
    const passwordInput = document.getElementById('change-password-input');
    const cancelBtn = document.getElementById('cancel-change-credentials');
    const errorEl = document.getElementById('change-credentials-error');
    const currentUser = getCurrentUser();

    if (!currentUser) return;

    if (usernameInput) {
        usernameInput.value = currentUser;
    }

    if (cancelBtn) {
        if (cancelHandler) cancelBtn.removeEventListener('click', cancelHandler);
        cancelHandler = () => {
            if (errorEl) errorEl.textContent = '';
            showAppFn(currentUser);
        };
        cancelBtn.addEventListener('click', cancelHandler);
    }

    if (changeForm) {
        if (submitHandler) changeForm.removeEventListener('submit', submitHandler);
        submitHandler = async (e) => {
            e.preventDefault();
            if (errorEl) errorEl.textContent = '';

            const newUsername = (usernameInput?.value || '').trim();
            const newPassword = passwordInput?.value || '';

            if (!newUsername && !newPassword) {
                alert('Please enter a new username or a new password.');
                return;
            }

            let success = true;
            let message = '';

            if (success && newPassword) {
                const result = await changePassword(currentUser, newPassword);
                if (result.success) {
                    message = message ? message + ' ' + t('passwordChanged') : t('passwordChanged');
                } else {
                    success = false;
                    message = result.error || 'Failed to change password';
                }
            }

            if (success && newUsername && newUsername.toLowerCase() !== currentUser.toLowerCase()) {
                const result = await changeUsername(currentUser, newUsername);
                if (result.success) {
                    const remember = localStorage.getItem('productivity_tracker_token') || sessionStorage.getItem('productivity_tracker_session_token');
                    updateSession(newUsername, result.token, !!remember);
                    const display = document.getElementById('settings-username-display');
                    if (display) display.textContent = newUsername;
                    message = t('usernameChanged');
                } else {
                    success = false;
                    message = result.error || 'Failed to change username';
                }
            }

            if (success) {
                alert(message);
                if (passwordInput) passwordInput.value = '';
                showAppFn(getCurrentUser() || currentUser);
            } else {
                alert(message);
                if (errorEl) errorEl.textContent = message;
            }
        };
        changeForm.addEventListener('submit', submitHandler);
    }
}

async function saveGoals(username) {
    const goals = document.getElementById('settings-goals').value.trim();
    const result = await api.updateSettings({ goals });
    return result;
}

export { uploadAvatar, saveGoals, initSettings, initChangeCredentials };
