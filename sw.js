// Service worker: makes the app shell load offline. API calls are never cached.
const VERSION = 'v8';
const SHELL_CACHE = `pt-shell-${VERSION}`;
const RUNTIME_CACHE = `pt-runtime-${VERSION}`;

// Keep in sync with the files in css/ and js/ (test/unit.test.js verifies this).
const SHELL = [
    '/',
    '/offline.html',
    '/manifest.json',
    '/LOGO.png',
    '/css/fonts.css',
    '/css/tokens.css',
    '/css/base.css',
    '/css/components.css',
    '/css/layout.css',
    '/css/views.css',
    '/js/theme-boot.js',
    '/js/app.js',
    '/js/core/api.js',
    '/js/core/auth.js',
    '/js/core/data.js',
    '/js/core/dom.js',
    '/js/core/glass.js',
    '/js/core/live.js',
    '/js/core/segmented.js',
    '/js/core/i18n.js',
    '/js/core/pwa.js',
    '/js/core/ranks.js',
    '/js/core/state.js',
    '/js/core/theme.js',
    '/js/core/ui.js',
    '/js/features/activity.js',
    '/js/features/admin/analytics.js',
    '/js/features/admin/database.js',
    '/js/features/admin/logs.js',
    '/js/features/auth-view.js',
    '/js/features/charts.js',
    '/js/features/dashboard.js',
    '/js/features/leaderboard.js',
    '/js/features/nav.js',
    '/js/features/settings.js',
    '/js/features/shared.js',
    '/js/features/stats.js',
    '/js/features/streak.js',
    '/js/features/task-dialog.js',
    '/js/features/templates.js',
    '/Badges/newcomer.png',
    '/Badges/bronze.png',
    '/Badges/silver.png',
    '/Badges/gold.png',
    '/Badges/diamond.png',
    '/Badges/master.png',
    '/icons/favicon-32x32.png',
    '/icons/favicon-192x192.png',
    '/icons/logo.svg',
    '/fonts/lexend-deca-latin-wght-normal.woff2',
    '/fonts/lexend-deca-latin-ext-wght-normal.woff2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request, fallbackUrl) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request, { ignoreSearch: true });
        return cached || caches.match(fallbackUrl);
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    const refresh = fetch(request)
        .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);
    return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(new Request('/'), '/offline.html'));
        return;
    }
    event.respondWith(staleWhileRevalidate(request));
});
