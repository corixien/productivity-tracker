import { api } from '../../core/api.js';
import { on } from '../../core/state.js';
import { h, icon, $, swapIn, replaceChildren } from '../../core/dom.js';
import { t, onLanguageChange, locale } from '../../core/i18n.js';
import { toast, confirmDialog, emptyState, skeletonList, showError, openDialog, closeDialog } from '../../core/ui.js';
import { currentView } from '../nav.js';
import { warnNonCritical } from '../shared.js';

const CHUNK = 200;   // rows added to the DOM at a time while scrolling; all rows are already loaded
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'LIKE', 'ILIKE', 'NOT LIKE', 'IN', 'IS NULL', 'IS NOT NULL'];
const NO_VALUE = new Set(['IS NULL', 'IS NOT NULL']);
const TABLE_ORDER = ['users', 'tasks', 'xp_history', 'friends', 'templates', 'system_logs', 'groq_logs', 'user_activity', 'uptime_samples', 'schema_migrations'];
const orderOf = (name) => (TABLE_ORDER.includes(name) ? TABLE_ORDER.indexOf(name) : TABLE_ORDER.length);

const view = { tables: [], current: 'users', rows: [], total: 0, capped: false, shown: 0, q: '', filters: [], sort: { column: '', dir: 'asc' }, loaded: false };
let reloadTimer = null;
let searchTimer = null;
let observer = null;
let openPopover = null;

const tableMeta = () => view.tables.find((table) => table.name === view.current);
const formatTime = (iso) => new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));
const formatCount = (n) => new Intl.NumberFormat(locale(), { notation: n >= 10000 ? 'compact' : 'standard' }).format(n);

/* ---------- cells ---------- */
function plainValue(column, value) {
    if (value === null || value === undefined) return h('span', { class: 'cell-null' }, 'NULL');
    if (typeof value === 'boolean') return h('span', { class: `cell-bool ${value ? 'is-true' : ''}` }, String(value));
    if (column.type.includes('timestamp')) return h('span', { class: 'cell-time' }, formatTime(value));
    if (typeof value === 'string' && UUID.test(value)) return h('span', { class: 'cell-id', title: value }, value.slice(0, 8));
    const text = String(value);
    return h('span', { class: 'cell-text' }, text.length > 60 ? `${text.slice(0, 60)}…` : text);
}

async function saveCell(table, row, column, raw) {
    const { row: updated } = await api.adminUpdate(table.name, row.__key, column.name, raw);
    Object.assign(row, updated);
    toast(t('cellSaved'), { type: 'success', duration: 1500 });
    renderRows();
}

function cell(table, column, row) {
    const value = row[column.name];
    const td = h('td', { dataset: { col: column.name } });
    if (column.editable && typeof value === 'boolean') {
        td.append(h('button', {
            type: 'button', class: `toggle${value ? ' is-on' : ''}`, role: 'switch', 'aria-checked': String(value), 'aria-label': column.name,
            onClick: () => saveCell(table, row, column, String(!value)).catch(showError)
        }, h('span', { class: 'toggle-knob' })));
        return td;
    }
    td.classList.add('is-clickable');
    td.tabIndex = 0;
    td.setAttribute('role', 'button');
    td.setAttribute('aria-label', `${column.name}: ${t('openCell')}`);
    td.append(plainValue(column, value));
    const open = () => openCell(table, column, row);
    td.addEventListener('click', open);
    td.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    return td;
}

/* ---------- big cell editor (dialog with a multi-line field) ---------- */
async function openCell(table, column, row) {
    const dialog = $('#cell-dialog');
    const field = $('#cell-text');
    const save = $('#cell-save');
    const preview = $('#cell-preview');
    $('#cell-title').textContent = `${table.name}.${column.name}`;
    $('#cell-error').textContent = '';
    field.value = '';
    field.placeholder = '';
    preview.hidden = true;
    save.hidden = !column.editable;
    field.readOnly = !column.editable;
    $('#cell-meta').textContent = column.editable ? column.type : `${column.type} · ${t('readOnly')}`;
    openDialog(dialog);

    let value = row[column.name];
    if ((row.__truncated || []).includes(column.name)) {
        field.placeholder = t('cellLoading');
        try { value = (await api.adminCell(table.name, row.__key, column.name)).value; } catch (error) { showError(error); closeDialog(dialog); return; }
    }
    field.value = value ?? '';
    field.placeholder = value === null ? 'NULL' : '';
    if (typeof value === 'string' && value.startsWith('data:image/')) {
        preview.src = value;
        preview.hidden = false;
    }
    field.focus();

    $('#cell-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(field.value); toast(t('cellCopied'), { type: 'success', duration: 1500 }); } catch (error) { field.select(); }
    };
    save.onclick = async () => {
        try {
            await saveCell(table, row, column, field.value);
            closeDialog(dialog);
        } catch (error) {
            $('#cell-error').textContent = error.network ? t('networkError') : error.message;
        }
    };
}

/* ---------- toolbar: search, filter, sort ---------- */
function closePopover() {
    if (!openPopover) return;
    openPopover.panel.hidden = true;
    openPopover.button.setAttribute('aria-expanded', 'false');
    openPopover = null;
}

function togglePopover(button, panel) {
    const wasOpen = openPopover && openPopover.panel === panel;
    closePopover();
    if (wasOpen) return;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    openPopover = { button, panel };
}

function columnSelect(table, value, label) {
    const select = h('select', { class: 'select-sm', 'aria-label': label }, ...table.columns.map((column) => h('option', { value: column.name }, column.name)));
    select.value = value;
    return select;
}

function filterRow(table, draft, index, rerender) {
    const entry = draft[index];
    const column = columnSelect(table, entry.column, t('filterColumn'));
    const operator = h('select', { class: 'select-sm', 'aria-label': t('filterOperator') }, ...OPERATORS.map((op) => h('option', { value: op }, op)));
    operator.value = entry.op;
    const value = h('input', { type: 'text', class: 'filter-value', value: entry.value, placeholder: entry.op === 'IN' ? t('filterValueIn') : t('filterValue'), 'aria-label': t('filterValue'), autocomplete: 'off' });
    value.hidden = NO_VALUE.has(entry.op);
    column.addEventListener('change', () => { entry.column = column.value; });
    operator.addEventListener('change', () => { entry.op = operator.value; rerender(); });
    value.addEventListener('input', () => { entry.value = value.value; });
    value.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('#filter-apply').click(); } });
    return h('div', { class: 'filter-row' },
        h('span', { class: 'filter-where' }, index === 0 ? 'WHERE' : 'AND'),
        column, operator, value,
        h('button', { type: 'button', class: 'icon-btn is-danger', 'aria-label': t('removeFilter'), onClick: () => { draft.splice(index, 1); rerender(); } }, icon('close'))
    );
}

function buildFilterPanel(table, apply) {
    const draft = view.filters.map((filter) => ({ ...filter }));
    const list = h('div', { class: 'filter-list' });
    const rerender = () => {
        if (draft.length === 0) list.replaceChildren(h('p', { class: 'hint' }, t('noFilters')));
        else list.replaceChildren(...draft.map((_, index) => filterRow(table, draft, index, rerender)));
    };
    rerender();
    return h('div', { class: 'popover card filter-panel', role: 'dialog', 'aria-label': t('filterBtn'), hidden: true },
        list,
        h('div', { class: 'popover-actions' },
            h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { draft.push({ column: table.columns[0].name, op: '=', value: '' }); rerender(); } }, icon('plus'), t('addFilter')),
            h('span', { class: 'spacer' }),
            h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { draft.length = 0; rerender(); apply([]); } }, t('clearFilters')),
            h('button', { type: 'button', class: 'btn btn-primary', id: 'filter-apply', onClick: () => apply(draft.filter((entry) => NO_VALUE.has(entry.op) || entry.value !== '').map((entry) => ({ ...entry }))) }, t('applyFilters')))
    );
}

function buildSortPanel(table, apply) {
    const column = h('select', { class: 'select-sm', 'aria-label': t('sortColumn') },
        h('option', { value: '' }, t('sortNone')), ...table.columns.map((entry) => h('option', { value: entry.name }, entry.name)));
    column.value = view.sort.column;
    const dir = h('select', { class: 'select-sm', 'aria-label': t('sortDirection') },
        h('option', { value: 'asc' }, t('sortAsc')), h('option', { value: 'desc' }, t('sortDesc')));
    dir.value = view.sort.dir;
    dir.disabled = !column.value;
    const change = () => { dir.disabled = !column.value; apply({ column: column.value, dir: dir.value }); };
    column.addEventListener('change', change);
    dir.addEventListener('change', change);
    return h('div', { class: 'popover card sort-panel', role: 'dialog', 'aria-label': t('sortBtn'), hidden: true },
        h('label', { class: 'popover-label' }, t('sortColumn'), column),
        h('label', { class: 'popover-label' }, t('sortDirection'), dir));
}

function buildToolbar(table) {
    const search = h('input', { type: 'text', class: 'db-search', value: view.q, placeholder: t('searchRows'), 'aria-label': t('searchRows'), autocomplete: 'off' });
    search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { view.q = search.value.trim(); reload(); }, 250);
    });

    const filterBadge = h('span', { class: 'badge', hidden: view.filters.length === 0 }, String(view.filters.length));
    const filterButton = h('button', { type: 'button', class: 'btn btn-secondary tool-btn', 'aria-expanded': 'false', 'aria-haspopup': 'dialog' }, icon('filter'), t('filterBtn'), filterBadge);
    const filterPanel = buildFilterPanel(table, (filters) => {
        view.filters = filters;
        closePopover();
        reload();
        renderToolbar();
    });
    filterButton.addEventListener('click', () => togglePopover(filterButton, filterPanel));

    const sortBadge = h('span', { class: 'badge', hidden: !view.sort.column }, view.sort.dir === 'desc' ? '↓' : '↑');
    const sortButton = h('button', { type: 'button', class: 'btn btn-secondary tool-btn', 'aria-expanded': 'false', 'aria-haspopup': 'dialog' }, icon('sort'), t('sortBtn'), sortBadge);
    const sortPanel = buildSortPanel(table, (sort) => {
        view.sort = sort;
        sortBadge.hidden = !sort.column;
        sortBadge.textContent = sort.dir === 'desc' ? '↓' : '↑';
        reload();
    });
    sortButton.addEventListener('click', () => togglePopover(sortButton, sortPanel));

    return h('div', { class: 'db-toolbar' },
        h('div', { class: 'db-search-wrap' }, icon('search'), search),
        h('div', { class: 'db-tools' },
            h('div', { class: 'popover-anchor' }, filterButton, filterPanel),
            h('div', { class: 'popover-anchor' }, sortButton, sortPanel)),
        h('span', { class: 'db-range', id: 'db-range', role: 'status' }));
}

function renderToolbar() {
    const table = tableMeta();
    const body = $('#admin-db-body');
    const existing = body.querySelector('.db-toolbar');
    const toolbar = buildToolbar(table);
    if (existing) existing.replaceWith(toolbar); else body.prepend(toolbar);
    closePopover();
    updateRange();
}

function updateRange() {
    const range = $('#db-range');
    if (!range) return;
    const table = tableMeta();
    const text = view.capped ? t('rowsCapped', { n: formatCount(view.rows.length), total: formatCount(view.total) }) : t('rowsCount', { n: formatCount(view.total) });
    replaceChildren(range, text, table && table.readonly ? h('span', { class: 'chip chip-warn' }, t('readOnly')) : null);
}

/* ---------- table ---------- */
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

function rowElement(table, row) {
    return h('tr', { dataset: { key: row.__key } },
        ...table.columns.map((column) => cell(table, column, row)),
        table.deletable ? h('td', { class: 'col-actions' }, h('button', {
            type: 'button', class: 'icon-btn is-danger', 'aria-label': t('delete'), title: t('delete'), onClick: () => removeRow(table, row)
        }, icon('trash'))) : null);
}

function appendChunk(tbody, table) {
    const next = view.rows.slice(view.shown, view.shown + CHUNK);
    tbody.append(...next.map((row) => rowElement(table, row)));
    view.shown += next.length;
}

// Every loaded row is in view.rows; the DOM grows while the user scrolls so thousands of rows stay fast.
function renderRows() {
    const container = $('#db-table');
    const table = tableMeta();
    if (!container || !table) return;
    if (observer) observer.disconnect();
    if (!view.loaded) {
        container.replaceChildren(h('ul', {}, ...skeletonList(4)));
        return;
    }
    updateRange();
    if (view.rows.length === 0) {
        container.replaceChildren(h('ul', {}, emptyState('database', t('noRowsTitle'), t('noRowsText'))));
        return;
    }
    const previous = container.querySelector('.table-scroll');
    const scrollTop = previous ? previous.scrollTop : 0;
    const scrollLeft = previous ? previous.scrollLeft : 0;

    const head = h('tr', {}, ...table.columns.map((column) => h('th', { scope: 'col' }, column.name)),
        table.deletable ? h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, t('delete'))) : null);
    const tbody = h('tbody', {});
    const sentinel = h('div', { class: 'table-sentinel', 'aria-hidden': 'true' });
    const scroller = h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' }, h('thead', {}, head), tbody), sentinel);
    view.shown = 0;
    const target = Math.max(CHUNK, Math.ceil((previous ? previous.querySelectorAll('tbody tr').length : 0) / CHUNK) * CHUNK);
    while (view.shown < Math.min(target, view.rows.length)) appendChunk(tbody, table);
    container.replaceChildren(h('div', { class: 'card table-card' }, scroller));
    scroller.scrollTop = scrollTop;
    scroller.scrollLeft = scrollLeft;

    observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting) && view.shown < view.rows.length) appendChunk(tbody, table);
    }, { root: scroller, rootMargin: '400px' });
    observer.observe(sentinel);
}

function renderTabs() {
    const container = $('#admin-table-tabs');
    // Swap only the tab buttons: re-inserting the lens element would cancel its glide to the new tab.
    container.querySelectorAll('.table-tab').forEach((tab) => tab.remove());
    container.append(...view.tables.map((table) =>
        h('button', {
            type: 'button', class: 'segment table-tab', 'aria-pressed': String(table.name === view.current),
            onClick: () => select(table.name)
        }, table.name, h('span', { class: 'count' }, formatCount(table.count)))
    ));
}

function renderShell() {
    const body = $('#admin-db-body');
    body.replaceChildren(h('div', { id: 'db-table' }));
    if (tableMeta()) renderToolbar();
    renderRows();
}

/* ---------- loading ---------- */
async function loadTables() {
    const { tables } = await api.adminTables();
    view.tables = tables.sort((a, b) => orderOf(a.name) - orderOf(b.name) || a.name.localeCompare(b.name));
    if (!view.tables.some((table) => table.name === view.current)) view.current = view.tables[0] ? view.tables[0].name : '';
    renderTabs();
}

async function loadRows() {
    const data = await api.adminRows(view.current, { q: view.q, filters: view.filters, sort: view.sort.column, dir: view.sort.dir });
    view.rows = data.rows;
    view.total = data.total;
    view.capped = data.capped;
    view.loaded = true;
}

async function reload() {
    try {
        await Promise.all([loadTables(), loadRows()]);
        renderRows();
    } catch (error) {
        showError(error);
        if (!view.loaded) { view.loaded = true; renderRows(); }
    }
}

function select(name) {
    view.current = name;
    view.q = '';
    view.filters = [];
    view.sort = { column: '', dir: 'asc' };
    view.loaded = false;
    view.rows = [];
    renderTabs();
    renderShell();
    swapIn($('#admin-db-body'));
    reload();
}

async function showDatabase() {
    renderTabs();
    renderShell();
    try {
        await loadTables();
        renderShell();
        await loadRows();
        renderRows();
    } catch (error) {
        showError(error);
    }
}

function onLiveDatabase({ tables = [] }) {
    if (currentView() !== 'admin-database' || $('#cell-dialog').open) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => (tables.includes(view.current) ? reload() : loadTables().catch(warnNonCritical('admin.tables'))), 500);
}

function initDatabase() {
    on('live:db', onLiveDatabase);
    on('auth:logout', () => { view.tables = []; view.rows = []; view.loaded = false; view.filters = []; view.sort = { column: '', dir: 'asc' }; });
    document.addEventListener('pointerdown', (event) => {
        if (openPopover && !openPopover.panel.contains(event.target) && !openPopover.button.contains(event.target)) closePopover();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePopover(); });
    onLanguageChange(() => { if (currentView() === 'admin-database') { renderTabs(); renderShell(); } });
}

export { initDatabase, showDatabase };
