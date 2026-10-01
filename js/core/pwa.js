import { t, onLanguageChange } from './i18n.js';
import { events, flushQueue, getQueuedCompletions } from './api.js';
import { showBanner, hideBanner, toast } from './ui.js';
import { icon } from './dom.js';
import { emit } from './state.js';

let deferredPrompt = null;
let flushing = false;

function installButtons() {
    return [document.getElementById('install-btn'), document.getElementById('settings-install-btn')].filter(Boolean);
}

function renderInstallButtons() {
    for (const button of installButtons()) {
        button.replaceChildren(icon('download'), t('installApp'));
        button.hidden = !deferredPrompt;
    }
}

async function promptInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    renderInstallButtons();
}

function renderOfflineBanner() {
    if (navigator.onLine) hideBanner('offline');
    else showBanner('offline', { text: t('offlineBanner'), iconName: 'wifiOff', warn: true });
}

async function syncQueue() {
    if (flushing || !navigator.onLine || getQueuedCompletions().length === 0) return;
    flushing = true;
    try {
        const { synced } = await flushQueue();
        if (synced > 0) {
            toast(t('synced'), { type: 'success' });
            emit('sync:done', { synced });
        }
    } finally {
        flushing = false;
    }
}

function initPwa() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        renderInstallButtons();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        renderInstallButtons();
    });
    installButtons().forEach((button) => button.addEventListener('click', promptInstall));
    renderInstallButtons();

    window.addEventListener('offline', renderOfflineBanner);
    window.addEventListener('online', () => { renderOfflineBanner(); syncQueue(); });
    renderOfflineBanner();

    events.addEventListener('slow', (event) => {
        if (event.detail.slow) showBanner('waking', { text: t('wakingBanner'), spinner: true });
        else hideBanner('waking');
    });
    events.addEventListener('waking', (event) => {
        if (event.detail.active) showBanner('waking', { text: t('wakingBanner'), spinner: true });
        else hideBanner('waking');
    });

    onLanguageChange(() => { renderInstallButtons(); renderOfflineBanner(); });

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('/sw.js').catch(() => { /* app works without it */ });
    }
}

export { initPwa, syncQueue };
