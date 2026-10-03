import { api, replaceAuthToken } from '../core/api.js';
import { state, on } from '../core/state.js';
import { $, fillAvatar, setBusy } from '../core/dom.js';
import { t, setLanguage, getCurrentLang, onLanguageChange } from '../core/i18n.js';
import { setTheme, getTheme } from '../core/theme.js';
import { refreshUser, signOut } from '../core/auth.js';
import { loadStats } from '../core/data.js';
import { toast, openDialog, closeDialog, showError } from '../core/ui.js';
import { warnNonCritical } from './shared.js';

const AVATAR_SIZE = 256;

// Center-crops to a square and downsizes in the browser, so uploads stay a few KB.
async function resizeImage(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    canvas.getContext('2d').drawImage(
        bitmap,
        (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
        0, 0, AVATAR_SIZE, AVATAR_SIZE
    );
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.86);
}

function render() {
    const user = state.user;
    if (!user) return;
    $('#settings-username').textContent = t('settingsSubtitle', { name: user.username });
    $('#sidebar-username').textContent = user.username;
    fillAvatar($('#settings-avatar'), user);
    fillAvatar($('#sidebar-avatar'), user);
    // Do not overwrite what the user is typing.
    if (document.activeElement !== $('#settings-goals')) $('#settings-goals').value = user.goals || '';
    if (document.activeElement !== $('#settings-daily-goal')) $('#settings-daily-goal').value = user.daily_goal_xp || 50;
    $('#language-select').value = getCurrentLang();
    $('#theme-select').value = getTheme();
}

async function uploadAvatar(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const button = $('#upload-avatar-btn');
    setBusy(button, true);
    try {
        let dataUrl;
        try {
            dataUrl = await resizeImage(file);
        } catch (error) {
            toast(t('avatarInvalid'), { type: 'error' });
            return;
        }
        await api.uploadAvatar(state.user.username, dataUrl);
        await refreshUser();
        toast(t('avatarSaved'), { type: 'success' });
    } catch (error) {
        showError(error);
    } finally {
        setBusy(button, false);
    }
}

async function saveGoals(event) {
    event.preventDefault();
    const button = event.submitter;
    setBusy(button, true);
    try {
        await api.updateSettings({
            goals: $('#settings-goals').value.trim(),
            dailyGoalXp: parseInt($('#settings-daily-goal').value, 10) || 50
        });
        await refreshUser();
        loadStats().catch(warnNonCritical('settings.loadStats'));
        toast(t('goalsSaved'), { type: 'success' });
    } catch (error) {
        showError(error);
    } finally {
        setBusy(button, false);
    }
}

function openAccountDialog() {
    ['#new-username', '#current-password', '#new-password'].forEach((selector) => { $(selector).value = ''; });
    ['#username-error', '#password-error'].forEach((selector) => { $(selector).textContent = ''; });
    $('#new-username').value = state.user.username;
    openDialog($('#account-dialog'));
}

async function submitUsername(event) {
    event.preventDefault();
    const newUsername = $('#new-username').value.trim();
    const error = $('#username-error');
    error.textContent = '';
    if (newUsername.toLowerCase() === state.user.username.toLowerCase() && newUsername === state.user.username) {
        closeDialog($('#account-dialog'));
        return;
    }
    setBusy(event.submitter, true);
    try {
        const result = await api.changeUsername(state.user.username, newUsername);
        replaceAuthToken(result.token);
        await refreshUser();
        closeDialog($('#account-dialog'));
        toast(t('usernameChanged'), { type: 'success' });
    } catch (failure) {
        error.textContent = failure.network ? t('networkError') : failure.message;
    } finally {
        setBusy(event.submitter, false);
    }
}

async function submitPassword(event) {
    event.preventDefault();
    const error = $('#password-error');
    error.textContent = '';
    const current = $('#current-password').value;
    const next = $('#new-password').value;
    if (!current || next.length < 4) {
        error.textContent = next.length < 4 ? t('passwordHint') : t('currentPassword');
        return;
    }
    setBusy(event.submitter, true);
    try {
        // The server revokes every older token and returns the only valid one for this device.
        const result = await api.changePassword(state.user.username, current, next);
        replaceAuthToken(result.token);
        closeDialog($('#account-dialog'));
        toast(t('passwordChanged'), { type: 'success' });
    } catch (failure) {
        error.textContent = failure.network ? t('networkError') : failure.message;
    } finally {
        setBusy(event.submitter, false);
    }
}

function initSettings() {
    on('user', render);
    onLanguageChange(render);
    $('#upload-avatar-btn').addEventListener('click', () => $('#avatar-input').click());
    $('#avatar-input').addEventListener('change', uploadAvatar);
    $('#goals-form').addEventListener('submit', saveGoals);
    $('#account-btn').addEventListener('click', openAccountDialog);
    $('#username-form').addEventListener('submit', submitUsername);
    $('#password-form').addEventListener('submit', submitPassword);
    $('#sign-out-btn').addEventListener('click', signOut);

    $('#language-select').addEventListener('change', (event) => {
        setLanguage(event.target.value);
        api.updateSettings({ language: event.target.value }).catch(warnNonCritical('settings.language'));
    });
    $('#theme-select').addEventListener('change', (event) => setTheme(event.target.value));
}

export { initSettings, render as renderSettings };
