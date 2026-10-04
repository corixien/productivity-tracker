import { h, icon, replaceChildren } from './dom.js';
import { t } from './i18n.js';

/* ---- toasts ---- */
const TOAST_MS = 4200;
const TOAST_MS_PHONE = 2500;
const onPhone = () => window.matchMedia('(max-width: 960px)').matches;

function toast(message, { type = 'info', title, duration } = {}) {
    if (duration === undefined) duration = onPhone() ? TOAST_MS_PHONE : TOAST_MS;
    const region = document.getElementById('toast-region');
    if (!region) return;
    const iconName = { success: 'check', error: 'close', xp: 'sparkles', info: 'sparkles' }[type] || 'sparkles';
    const el = h('div', { class: `toast is-${type}` },
        icon(iconName),
        h('div', { class: 'toast-text' }, title ? h('strong', {}, title) : null, message)
    );
    region.append(el);
    const dismiss = () => {
        el.classList.add('is-leaving');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 400);
    };
    setTimeout(dismiss, duration);
    el.addEventListener('click', dismiss);
    while (region.children.length > 4) region.firstElementChild.remove();
}

// Weekly trophy: congratulate once per week and device.
const TROPHY_SEEN_KEY = 'pt_trophy_seen';
function trophyToast(trophy) {
    if (!trophy) return;
    try {
        if (localStorage.getItem(TROPHY_SEEN_KEY) === trophy.weekStart) return;
        localStorage.setItem(TROPHY_SEEN_KEY, trophy.weekStart);
    } catch (error) { /* storage blocked: show the toast again next time */ }
    toast(t('trophyWon', { n: trophy.xp }), { type: 'xp', duration: 6000 });
}

// One toast for everything one action paid: the task XP and, on a second line, the daily goal bonus that came with it
// (or its take-back). Negative amounts are red.
function xpToast(amount, bonus = 0) {
    const region = document.getElementById('toast-region');
    if (!region || (!amount && !bonus)) return;
    const positive = (amount || bonus) >= 0 && amount >= 0;
    const lines = [];
    if (amount) lines.push(h('span', { class: positive ? 'xp-gain' : '' }, positive ? t('xpGained', { n: amount }) : t('xpLost', { n: amount })));
    if (bonus) lines.push(h('span', { class: 'toast-sub' }, t(bonus > 0 ? 'goalBonusEarned' : 'goalBonusLost', { n: bonus })));
    const el = h('div', { class: `toast ${positive ? 'is-xp' : 'is-error'}` },
        icon(positive ? 'sparkles' : 'undo'),
        h('div', { class: 'toast-text' }, ...lines)
    );
    region.append(el);
    setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 300); }, bonus ? 4200 : onPhone() ? TOAST_MS_PHONE : 2600);
}

/* ---- banners (offline / waking) ---- */
const banners = new Map();

function showBanner(id, { text, iconName, spinner = false, warn = false }) {
    hideBanner(id);
    const region = document.getElementById('banner-region');
    if (!region) return;
    const el = h('div', { class: `banner${warn ? ' is-warn' : ''}` },
        spinner ? h('span', { class: 'spinner' }) : iconName ? icon(iconName) : null,
        h('span', {}, text)
    );
    banners.set(id, el);
    region.append(el);
}

function hideBanner(id) {
    const el = banners.get(id);
    if (el) { el.remove(); banners.delete(id); }
}

/* ---- dialogs ---- */
function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
    if (dialog.open) dialog.close();
}

// Wires [data-close] buttons and backdrop clicks of every dialog.
function initDialogs() {
    document.querySelectorAll('dialog').forEach((dialog) => {
        dialog.querySelectorAll('[data-close]').forEach((button) => {
            button.replaceChildren(icon('close'));
            button.addEventListener('click', () => dialog.close());
        });
        dialog.addEventListener('mousedown', (event) => {
            if (event.target === dialog) dialog.dataset.backdropDown = '1';
        });
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog && dialog.dataset.backdropDown === '1') dialog.close();
            delete dialog.dataset.backdropDown;
        });
    });
}

// Promise-based replacement for window.confirm().
function confirmDialog({ title, message, confirmLabel, danger = false }) {
    const dialog = document.getElementById('confirm-dialog');
    const ok = document.getElementById('confirm-ok');
    const cancel = document.getElementById('confirm-cancel');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    ok.textContent = confirmLabel || t('add');
    ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

    return new Promise((resolve) => {
        let result = false;
        const finish = () => {
            ok.removeEventListener('click', onOk);
            cancel.removeEventListener('click', onCancel);
            dialog.removeEventListener('close', finish);
            resolve(result);
        };
        const onOk = () => { result = true; dialog.close(); };
        const onCancel = () => dialog.close();
        ok.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
        dialog.addEventListener('close', finish);
        dialog.showModal();
        (danger ? cancel : ok).focus();
    });
}

function emptyState(iconName, title, text, action) {
    return h('li', { class: 'empty-state' }, icon(iconName), h('strong', {}, title), h('p', {}, text), action || null);
}

function skeletonList(count = 3) {
    return Array.from({ length: count }, () => h('li', { class: 'skeleton', 'aria-hidden': 'true' }));
}

function showError(error, fallbackKey = 'genericError') {
    if (error && error.network) toast(t('networkError'), { type: 'error' });
    else toast((error && error.message) || t(fallbackKey), { type: 'error' });
}

export { toast, xpToast, trophyToast, showBanner, hideBanner, openDialog, closeDialog, initDialogs, confirmDialog, emptyState, skeletonList, showError, replaceChildren };
