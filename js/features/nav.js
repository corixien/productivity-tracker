import { state } from '../core/state.js';
import { h, icon, $, $$ } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';

// The admin area lives under #/admin. The route is public knowledge:
// every admin API call is checked on the server against users.is_admin.
const ADMIN_PREFIX = 'admin';

const APP_VIEWS = [
    { id: 'tasks', hash: 'tasks', icon: 'tasks', label: 'navTasks' },
    { id: 'templates', hash: 'templates', icon: 'templates', label: 'navTemplates' },
    { id: 'activity', hash: 'activity', icon: 'activity', label: 'navActivity' },
    { id: 'leaderboard', hash: 'leaderboard', icon: 'trophy', label: 'navLeaderboard' },
    { id: 'settings', hash: 'settings', icon: 'settings', label: 'navSettings' }
];
const ADMIN_VIEWS = [
    { id: 'admin-database', hash: `${ADMIN_PREFIX}/database`, icon: 'database', label: 'navDatabase' },
    { id: 'admin-logs', hash: `${ADMIN_PREFIX}/logs`, icon: 'terminal', label: 'navLogs' },
    { id: 'admin-analytics', hash: `${ADMIN_PREFIX}/analytics`, icon: 'chart', label: 'navAnalytics' },
    { id: 'admin-exit', hash: 'tasks', icon: 'arrowLeft', label: 'navBackToApp', exit: true }
];

const handlers = new Map();
let current = null;
let mode = 'app';

const isAdmin = () => Boolean(state.user && state.user.isAdmin);
const currentViews = () => (mode === 'admin' ? ADMIN_VIEWS : APP_VIEWS);

// Accepts #/tasks, #/admin/logs and the "#?/" spelling.
function resolveRoute() {
    const raw = location.hash.replace(/^#\??\/?/, '');
    if (raw === ADMIN_PREFIX || raw.startsWith(`${ADMIN_PREFIX}/`)) {
        if (!isAdmin()) {
            history.replaceState(null, '', `${location.pathname}#/tasks`);
            return { mode: 'app', view: APP_VIEWS[0] };
        }
        return { mode: 'admin', view: ADMIN_VIEWS.find((view) => view.hash === raw) || ADMIN_VIEWS[0] };
    }
    return { mode: 'app', view: APP_VIEWS.find((view) => view.hash === raw) || APP_VIEWS[0] };
}

function buildNav(container) {
    container.replaceChildren(
        h('span', { class: 'nav-indicator', 'aria-hidden': 'true' }),
        ...currentViews().map((view) =>
            h('a', { class: 'nav-link', href: `#/${view.hash}`, dataset: { view: view.id } }, icon(view.icon), h('span', {}, t(view.label)))
        )
    );
}

// The glass "lens" behind the active item glides to it with a spring and stretches while moving.
function moveIndicator(container, { animate = true } = {}) {
    const indicator = container.querySelector('.nav-indicator');
    const link = container.querySelector('.nav-link[aria-current="page"]');
    if (!indicator || !link || link.offsetWidth === 0) return;
    const geometry = { x: `${link.offsetLeft}px`, y: `${link.offsetTop}px`, w: `${link.offsetWidth}px`, h: `${link.offsetHeight}px` };
    const changed = indicator.style.getPropertyValue('--x') !== geometry.x || indicator.style.getPropertyValue('--y') !== geometry.y;
    indicator.classList.toggle('no-motion', !animate);
    for (const [key, value] of Object.entries(geometry)) indicator.style.setProperty(`--${key}`, value);
    if (animate && changed) {
        indicator.classList.remove('is-moving');
        void indicator.offsetWidth;
        indicator.classList.add('is-moving');
    }
}

const navContainers = () => $$('#sidebar-nav, #tabbar');
const syncIndicators = (options) => navContainers().forEach((container) => moveIndicator(container, options));

function rebuildNavs() {
    navContainers().forEach(buildNav);
}

function applyChrome(id) {
    const view = [...APP_VIEWS, ...ADMIN_VIEWS].find((entry) => entry.id === id);
    $$('.view').forEach((section) => { section.hidden = section.dataset.view !== id; });
    $$('.nav-link').forEach((link) => {
        if (link.dataset.view === id) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
    $('#fab-add-task').hidden = id !== 'tasks';
    $('#admin-badge').hidden = mode !== 'admin';
    document.title = `${t(view.label)} \u00b7 ${t('appTitle')}`;
    syncIndicators({ animate: true });
}

function show(route, { focus = false } = {}) {
    if (route.mode !== mode) {
        mode = route.mode;
        rebuildNavs();
    }
    current = route.view.id;
    applyChrome(current);
    if (focus) $('#main-content').focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    const handler = handlers.get(current);
    if (handler) handler();
}

function registerView(id, onShow) {
    handlers.set(id, onShow);
}

function initNav() {
    rebuildNavs();
    // Containers are hidden until sign-in and one of them stays hidden per breakpoint: place without animation when they resize.
    const observer = new ResizeObserver(() => syncIndicators({ animate: false }));
    navContainers().forEach((container) => observer.observe(container));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => syncIndicators({ animate: false }));
    window.addEventListener('hashchange', () => { if (state.user) show(resolveRoute(), { focus: true }); });
    onLanguageChange(() => {
        rebuildNavs();
        if (current) applyChrome(current);
        syncIndicators({ animate: false });
    });
}

const startNav = () => show(resolveRoute());
const currentView = () => current;

// Re-runs the handler of the visible view (used when the server pushes a change).
function refreshCurrentView() {
    const handler = handlers.get(current);
    if (handler) handler();
}

export { initNav, registerView, startNav, currentView, refreshCurrentView };
