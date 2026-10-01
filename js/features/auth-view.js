import { signIn, register } from '../core/auth.js';
import { $, $$, icon, setBusy } from '../core/dom.js';
import { t, setLanguage, getCurrentLang, translateDom } from '../core/i18n.js';

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;
let mode = 'signin';

function setMode(next) {
    mode = next;
    $$('#auth-screen [role="tab"]').forEach((tab) => {
        const selected = tab.dataset.mode === next;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    $('#auth-panel').setAttribute('aria-labelledby', next === 'signin' ? 'tab-signin' : 'tab-signup');
    $('#auth-submit span').dataset.i18n = next === 'signin' ? 'signIn' : 'register';
    $('#auth-password').autocomplete = next === 'signin' ? 'current-password' : 'new-password';
    $('#auth-password-hint').hidden = next === 'signin';
    $('#auth-error').textContent = '';
    translateDom($('#auth-screen'));
}

function togglePassword() {
    const input = $('#auth-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const button = $('#auth-password-toggle');
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', t(show ? 'hidePassword' : 'showPassword'));
    button.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
}

async function submit(event) {
    event.preventDefault();
    const username = $('#auth-username').value.trim();
    const password = $('#auth-password').value;
    const error = $('#auth-error');
    error.textContent = '';

    if (!USERNAME_PATTERN.test(username)) {
        error.textContent = t('invalidUsername');
        $('#auth-username').focus();
        return;
    }
    if (password.length < 4) {
        error.textContent = t('invalidPassword');
        $('#auth-password').focus();
        return;
    }

    const button = $('#auth-submit');
    const label = button.querySelector('span');
    const original = label.textContent;
    setBusy(button, true);
    label.textContent = t(mode === 'signin' ? 'signingIn' : 'creatingAccount');
    try {
        const remember = $('#auth-remember').checked;
        await (mode === 'signin' ? signIn : register)(username, password, remember);
        $('#auth-password').value = '';
    } catch (failure) {
        error.textContent = failure.network ? t('networkError') : failure.message;
    } finally {
        setBusy(button, false);
        label.textContent = original;
        translateDom($('#auth-screen'));
    }
}

function initAuthView() {
    $$('#auth-screen [role="tab"]').forEach((tab) => {
        tab.addEventListener('click', () => setMode(tab.dataset.mode));
        tab.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            const next = mode === 'signin' ? 'signup' : 'signin';
            setMode(next);
            $(`#tab-${next}`).focus();
        });
    });
    $('#auth-form').addEventListener('submit', submit);
    $('#auth-password-toggle').addEventListener('click', togglePassword);
    $('#auth-password-toggle').replaceChildren(icon('eye'));
    $('#auth-language').value = getCurrentLang();
    $('#auth-language').addEventListener('change', (event) => setLanguage(event.target.value));
    setMode('signin');
}

function resetAuthView() {
    $('#auth-form').reset();
    $('#auth-error').textContent = '';
    $('#auth-password').type = 'password';
    setMode('signin');
}

export { initAuthView, resetAuthView };
