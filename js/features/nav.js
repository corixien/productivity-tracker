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
    container.replaceChildren(...VIEWS.map((view) =>
        h('a', { class: 'nav-link', href: `#/${view.id}`, dataset: { view: view.id } }, icon(view.icon), h('span', {}, t(view.label)))
    ));
}

function applyChrome(id) {
    const view = VIEWS.find((entry) => entry.id === id);
    $$('.view').forEach((section) => { section.hidden = section.dataset.view !== id; });
    $$('.nav-link').forEach((link) => {
        if (link.dataset.view === id) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
    $('#fab-add-task').hidden = id !== 'tasks';
    document.title = `${t(view.label)} · ${t('appTitle')}`;
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
    window.addEventListener('hashchange', () => show(viewFromHash(), { focus: true }));
    onLanguageChange(() => {
        buildNav($('#sidebar-nav'));
        buildNav($('#tabbar'));
        if (current) applyChrome(current);
    });
}

function navigate(id) {
    if (location.hash === `#/${id}`) show(id);
    else location.hash = `#/${id}`;
}

const startNav = () => show(viewFromHash());
const currentView = () => current;

export { initNav, registerView, navigate, startNav, currentView };
