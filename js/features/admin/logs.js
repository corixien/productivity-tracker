import { api } from '../../core/api.js';
import { on } from '../../core/state.js';
import { h, $, swapIn } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { showError } from '../../core/ui.js';

const LIMIT = 100;
let rows = [];
let loadToken = 0;
let searchTimer = null;

const pad = (n) => String(n).padStart(2, '0');
const clock = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

const filters = () => ({
    q: $('#log-search').value.trim(),
    level: $('#log-level').value,
    category: $('#log-category').value
});

// Same rules as the server query, so live entries only appear when they would match a reload.
function matches(row, { q, level, category }) {
    if (level && row.level !== level) return false;
    if (category && !(row.action || '').startsWith(`${category}.`)) return false;
    if (!q) return true;
    const needle = q.toLowerCase();
    return [row.message, row.action, row.username, JSON.stringify(row.metadata || {})].some((part) => (part || '').toLowerCase().includes(needle));
}

function logLine(row) {
    const detail = h('pre', { class: 'log-detail', hidden: true }, JSON.stringify({
        id: row.id, time: row.created_at, level: row.level, action: row.action,
        user: row.username, user_id: row.user_id, message: row.message, metadata: row.metadata
    }, null, 2));
    const line = h('button', { type: 'button', class: `log-line is-${row.level}`, 'aria-expanded': 'false', title: row.action || '' },
        h('span', { class: 'log-time' }, clock(row.created_at)),
        h('span', { class: 'log-user' }, `${row.username || 'system'}:`),
        h('span', { class: 'log-message' }, row.message),
        h('span', { class: 'log-action' }, row.action || '')
    );
    line.addEventListener('click', () => {
        detail.hidden = !detail.hidden;
        line.setAttribute('aria-expanded', String(!detail.hidden));
    });
    return h('li', { class: 'log-row', dataset: { id: row.id } }, line, detail);
}

function render() {
    const list = $('#log-list');
    if (rows.length === 0) {
        list.replaceChildren(h('li', { class: 'log-empty' }, t('logEmpty')));
    } else {
        // The server sends newest first; the terminal reads oldest at the top, newest at the bottom.
        list.replaceChildren(...rows.slice().reverse().map(logLine));
        list.scrollTop = list.scrollHeight;
    }
    $('#log-count').textContent = t('logCount', { n: rows.length });
}

async function load() {
    const token = ++loadToken;
    try {
        const { logs } = await api.adminLogs({ ...filters(), limit: LIMIT });
        if (token !== loadToken) return;
        rows = logs;
        render();
        swapIn($('#log-list'));
    } catch (error) {
        showError(error);
    }
}

function onLiveLog(row) {
    if (!$('#log-live').checked || $('#view-admin-logs').hidden) return;
    if (!matches(row, filters())) return;
    row.metadata = row.metadata || {};
    rows = [row, ...rows].slice(0, LIMIT);
    const list = $('#log-list');
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    const first = list.querySelector('.log-empty');
    if (first) first.remove();
    const item = logLine(row);
    item.classList.add('is-new');
    list.append(item);
    while (list.children.length > LIMIT) list.firstElementChild.remove();
    if (atBottom) list.scrollTop = list.scrollHeight;
    $('#log-count').textContent = t('logCount', { n: rows.length });
}

function initLogs() {
    const debounced = () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 250); };
    $('#log-search').addEventListener('input', debounced);
    $('#log-level').addEventListener('change', load);
    $('#log-category').addEventListener('change', load);
    $('#log-controls').addEventListener('submit', (event) => { event.preventDefault(); load(); });
    on('live:log', onLiveLog);
    on('auth:logout', () => { rows = []; });
}

const showLogs = () => load();

export { initLogs, showLogs };
