import { h, icon, $, $$ } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';

const VIEWS = [
    { id: 'tasks', icon: 'tasks', label: 'navTasks' },
    { id: 'templates', icon: 'templates', label: 'navTemplates' },
    { id: 'activity', icon: 'activity', label: 'navActivity' },
    { id: 'leaderboard', icon: 'trophy', label: 'navLeaderboard' },
    { id: 'settings', icon: 'settings', label: 'navSettings' }
];

const handlers = new Map();
let current = null;

const viewFromHash = () => {
    const id = location.hash.replace(/^#\/?/, '');
    return VIEWS.some((view) => view.id === id) ? id : 'tasks';
};

function buildNav(container) {
    container.replaceChildren(
        h('span', { class: 'nav-indicator', 'aria-hidden': 'true' }),
        ...VIEWS.map((view) =>
            h('a', { class: 'nav-link', href: `#/${view.id}`, dataset: { view: view.id } }, icon(view.icon), h('span', {}, t(view.label)))
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

function applyChrome(id) {
    const view = VIEWS.find((entry) => entry.id === id);
    $$('.view').forEach((section) => { section.hidden = section.dataset.view !== id; });
    $$('.nav-link').forEach((link) => {
        if (link.dataset.view === id) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
    $('#fab-add-task').hidden = id !== 'tasks';
    document.title = `${t(view.label)} · ${t('appTitle')}`;
    syncIndicators({ animate: true });
}

function show(id, { focus = false } = {}) {
    current = id;
    applyChrome(id);
    if (focus) $('#main-content').focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    const handler = handlers.get(id);
    if (handler) handler();
}

function registerView(id, onShow) {
    handlers.set(id, onShow);
}

function initNav() {
    buildNav($('#sidebar-nav'));
    buildNav($('#tabbar'));
    // Containers are hidden until sign-in and one of them stays hidden per breakpoint: place without animation when they resize.
    const observer = new ResizeObserver(() => syncIndicators({ animate: false }));
    navContainers().forEach((container) => observer.observe(container));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => syncIndicators({ animate: false }));
    window.addEventListener('hashchange', () => show(viewFromHash(), { focus: true }));
    onLanguageChange(() => {
        buildNav($('#sidebar-nav'));
        buildNav($('#tabbar'));
        if (current) applyChrome(current);
        syncIndicators({ animate: false });
    });
}

function navigate(id) {
    if (location.hash === `#/${id}`) show(id);
    else location.hash = `#/${id}`;
}

const startNav = () => show(viewFromHash());
const currentView = () => current;

export { initNav, registerView, navigate, startNav, currentView };
