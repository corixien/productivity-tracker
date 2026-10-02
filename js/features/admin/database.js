import { api } from '../../core/api.js';
import { on } from '../../core/state.js';
import { h, icon, $, setBusy } from '../../core/dom.js';
import { t, onLanguageChange, locale } from '../../core/i18n.js';
import { toast, confirmDialog, emptyState, skeletonList, showError } from '../../core/ui.js';
import { currentView } from '../nav.js';
import { warnNonCritical } from '../shared.js';

const PAGE = 50;
const STORAGE = '__storage';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TABLE_ORDER = ['users', 'tasks', 'xp_history', 'friends', 'quick_tasks', 'system_logs', 'groq_logs', 'user_activity', 'uptime_samples', 'schema_migrations'];
const rankOf = (name) => (TABLE_ORDER.includes(name) ? TABLE_ORDER.indexOf(name) : TABLE_ORDER.length);

const view = { tables: [], current: 'users', rows: [], total: 0, offset: 0, q: '', loaded: false, avatars: null, editing: false };
let reloadTimer = null;
let searchTimer = null;

const tableMeta = () => view.tables.find((table) => table.name === view.current);
const formatTime = (iso) => new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));

/* ---------- cells ---------- */
function plainValue(column, value) {
    if (value === null || value === undefined) return h('span', { class: 'cell-null' }, '—');
    if (typeof value === 'boolean') return h('span', { class: `cell-bool ${value ? 'is-true' : ''}` }, String(value));
    if (column.type.includes('timestamp')) return h('span', { class: 'cell-time' }, formatTime(value));
    if (typeof value === 'string' && UUID.test(value)) return h('span', { class: 'cell-id', title: value }, value.slice(0, 8));
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return h('span', { class: 'cell-text', title: text.length > 40 ? text : null }, text.length > 60 ? `${text.slice(0, 60)}…` : text);
}

function editorFor(column, value, commit, cancel) {
    const options = column.options;
    let input;
    if (options) {
        input = h('select', { class: 'cell-input' }, ...options.map((option) => h('option', { value: option }, option)));
        input.value = value;
    } else {
        const numeric = ['integer', 'numeric', 'bigint', 'smallint'].includes(column.type);
        input = h('input', { class: 'cell-input', type: numeric ? 'number' : 'text', value: value ?? '' });
    }
    input.setAttribute('aria-label', column.name);
    let done = false;
    const finish = (save) => {
        if (done) return;
        done = true;
        view.editing = false;
        if (save) commit(input.value); else cancel();
    };
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); finish(true); }
        if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    if (options) input.addEventListener('change', () => finish(true));
    return input;
}

function cell(table, column, row) {
    const value = row[column.name];
    if (!column.editable) return h('td', { dataset: { col: column.name } }, plainValue(column, value));

    const td = h('td', { dataset: { col: column.name }, class: 'is-editable' });
    const save = async (raw) => {
        if (String(raw) === String(value ?? '')) { td.replaceChildren(show()); return; }
        try {
            const { row: updated } = await api.adminUpdate(table.name, row.__key, column.name, raw);
            Object.assign(row, updated);
            renderBody();
            toast(t('cellSaved'), { type: 'success', duration: 1500 });
        } catch (error) {
            showError(error);
            td.replaceChildren(show());
        }
    };
    function show() {
        if (typeof value === 'boolean') {
            return h('button', {
                type: 'button', class: `toggle${value ? ' is-on' : ''}`, role: 'switch', 'aria-checked': String(value),
                'aria-label': column.name, onClick: () => save(String(!value))
            }, h('span', { class: 'toggle-knob' }));
        }
        return h('button', {
            type: 'button', class: 'cell-edit', title: t('editCell'),
            onClick: () => {
                view.editing = true;
                const input = editorFor(column, value, save, () => td.replaceChildren(show()));
                td.replaceChildren(input);
                input.focus();
                if (input.select) input.select();
            }
        }, plainValue(column, value), icon('edit2'));
    }
    td.append(show());
    return td;
}

/* ---------- table view ---------- */
async function removeRow(table, row) {
    const confirmed = await confirmDialog({
        title: t('confirmDeleteRowTitle'),
        message: table.name === 'users' ? t('confirmDeleteUserMessage') : t('confirmDeleteRowMessage', { table: table.name }),
        confirmLabel: t('delete'), danger: true
    });
    if (!confirmed) return;
    try {
        await api.adminDelete(table.name, row.__key);
        toast(t('rowDeleted'), { type: 'success' });
        await reload();
    } catch (error) {
        showError(error);
    }
}

function renderTabs() {
    const tabs = [
        ...view.tables.map((table) => ({ id: table.name, label: table.name, count: table.count })),
        { id: STORAGE, label: t('storageTab'), count: null }
    ];
    const container = $('#admin-table-tabs');
    container.replaceChildren(...tabs.map((tab) =>
        h('button', {
            type: 'button', class: 'segment table-tab', 'aria-pressed': String(tab.id === view.current),
            onClick: () => select(tab.id)
        }, tab.label, tab.count !== null ? h('span', { class: 'count' }, formatCount(tab.count)) : null)
    ));
}

const formatCount = (n) => new Intl.NumberFormat(locale(), { notation: n >= 10000 ? 'compact' : 'standard' }).format(n);

function renderBody() {
    const body = $('#admin-db-body');
    if (view.current === STORAGE) return renderStorage(body);
    const table = tableMeta();
    if (!table || !view.loaded) {
        body.replaceChildren(h('ul', {}, ...skeletonList(4)));
        return undefined;
    }

    const from = view.total === 0 ? 0 : view.offset + 1;
    const to = Math.min(view.offset + PAGE, view.total);
    const search = h('input', { type: 'text', class: 'db-search', value: view.q, placeholder: t('searchRows'), 'aria-label': t('searchRows'), autocomplete: 'off' });
    search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { view.q = search.value.trim(); view.offset = 0; reload(); }, 250);
    });

    const toolbar = h('div', { class: 'db-toolbar' },
        h('div', { class: 'db-search-wrap' }, icon('search'), search),
        h('span', { class: 'db-range' }, t('rowsRange', { from, to, total: view.total }), table.readonly ? h('span', { class: 'chip chip-warn' }, t('readOnly')) : null),
        h('div', { class: 'db-pager' },
            h('button', { type: 'button', class: 'btn btn-secondary', disabled: view.offset === 0, onClick: () => page(-1) }, t('pagePrev')),
            h('button', { type: 'button', class: 'btn btn-secondary', disabled: to >= view.total, onClick: () => page(1) }, t('pageNext')))
    );

    const head = h('tr', {}, ...table.columns.map((column) => h('th', { scope: 'col' }, column.name)), table.deletable ? h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, t('delete'))) : null);
    const rows = view.rows.map((row) => h('tr', { dataset: { key: row.__key } },
        ...table.columns.map((column) => cell(table, column, row)),
        table.deletable ? h('td', { class: 'col-actions' }, h('button', {
            type: 'button', class: 'icon-btn is-danger', 'aria-label': t('delete'), title: t('delete'), onClick: () => removeRow(table, row)
        }, icon('trash'))) : null
    ));

    body.replaceChildren(
        toolbar,
        view.rows.length === 0
            ? h('ul', {}, emptyState('database', t('noRowsTitle'), t('noRowsText')))
            : h('div', { class: 'card table-card' }, h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' }, h('thead', {}, head), h('tbody', {}, ...rows))))
    );
    const searchInput = body.querySelector('.db-search');
    if (view.q && document.activeElement === document.body) searchInput.focus();
    return undefined;
}

function renderStorage(body) {
    if (!view.avatars) {
        body.replaceChildren(h('ul', {}, ...skeletonList(3)));
        return;
    }
    if (view.avatars.length === 0) {
        body.replaceChildren(h('ul', {}, emptyState('database', t('storageEmptyTitle'), t('storageEmptyText'))));
        return;
    }
    const total = view.avatars.reduce((sum, item) => sum + item.bytes, 0);
    body.replaceChildren(
        h('p', { class: 'hint storage-summary' }, t('storageSummary', { n: view.avatars.length, kb: Math.round(total / 1024) })),
        h('div', { class: 'storage-grid' }, ...view.avatars.map((item) => h('figure', { class: 'card storage-card' },
            h('img', { src: item.dataUrl, alt: item.username, width: 96, height: 96, loading: 'lazy' }),
            h('figcaption', {}, h('strong', {}, item.username), h('span', {}, `${Math.round(item.bytes / 1024 * 10) / 10} KB`)),
            h('button', { type: 'button', class: 'btn btn-danger', onClick: (event) => removeAvatar(item, event.currentTarget) }, icon('trash'), t('storageRemove'))
        )))
    );
}

async function removeAvatar(item, button) {
    const confirmed = await confirmDialog({ title: t('storageRemoveTitle'), message: item.username, confirmLabel: t('delete'), danger: true });
    if (!confirmed) return;
    setBusy(button, true);
    try {
        await api.adminRemoveAvatar(item.userId);
        toast(t('storageRemoved'), { type: 'success' });
        await loadStorage();
    } catch (error) {
        showError(error);
        setBusy(button, false);
    }
}

/* ---------- loading ---------- */
async function loadTables() {
    const { tables } = await api.adminTables();
    view.tables = tables.sort((a, b) => rankOf(a.name) - rankOf(b.name) || a.name.localeCompare(b.name));
    renderTabs();
}

async function loadRows() {
    const data = await api.adminRows(view.current, { limit: PAGE, offset: view.offset, q: view.q });
    view.rows = data.rows;
    view.total = data.total;
    view.loaded = true;
}

async function loadStorage() {
    view.avatars = (await api.adminStorage()).avatars;
    renderBody();
}

async function reload() {
    try {
        await Promise.all([loadTables(), view.current === STORAGE ? loadStorage() : loadRows()]);
        renderBody();
    } catch (error) {
        showError(error);
    }
}

function select(id) {
    view.current = id;
    view.offset = 0;
    view.q = '';
    view.loaded = false;
    renderTabs();
    renderBody();
    reload();
}

function page(direction) {
    view.offset = Math.max(0, view.offset + direction * PAGE);
    view.loaded = false;
    renderBody();
    reload();
}

function showDatabase() {
    renderTabs();
    renderBody();
    reload();
}

function onLiveDatabase({ tables = [] }) {
    if (currentView() !== 'admin-database' || view.editing) return;
    const relevant = view.current === STORAGE ? tables.includes('users') : tables.includes(view.current);
    // Counts in the tabs change with any table, rows only when the open table changed.
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => (relevant ? reload() : loadTables().catch(warnNonCritical('admin.tables'))), 500);
}

function initDatabase() {
    on('live:db', onLiveDatabase);
    on('auth:logout', () => { view.tables = []; view.rows = []; view.loaded = false; view.avatars = null; });
    onLanguageChange(() => { if (currentView() === 'admin-database') { renderTabs(); renderBody(); } });
}

export { initDatabase, showDatabase };
