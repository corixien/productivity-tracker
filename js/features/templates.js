import { api } from '../core/api.js';
import { state, on } from '../core/state.js';
import { h, icon, $ } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';
import { calculateXp } from '../core/ranks.js';
import { loadTemplates, refreshCore } from '../core/data.js';
import { toast, confirmDialog, emptyState, skeletonList, showError } from '../core/ui.js';
import { categoryLabel, initSearch } from './shared.js';

let loaded = false;
let query = '';
let drawn = '';   // what the list shows now; an identical re-render would replay the entry animation

function templateCard(template) {
    const xp = calculateXp(template.duration, template.productivity, template.difficulty, template.bonus);
    return h('li', { class: 'task-card template-card', dataset: { category: template.category } },
        icon('bookmark', 'template-icon'),
        h('div', { class: 'task-body' },
            h('div', { class: 'task-title-row' },
                h('p', { class: 'task-name' }, template.name),
                h('span', { class: 'xp-badge' }, `~${xp} ${t('xpUnit')}`)
            ),
            h('div', { class: 'task-meta' },
                h('span', { class: 'chip chip-cat' }, categoryLabel(template.category)),
                h('span', { class: 'chip' }, icon('clock'), t('minutes', { n: template.duration }))
            )
        ),
        h('div', { class: 'task-actions' },
            h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => useTemplate(template) }, icon('plus'), t('useTemplate')),
            h('button', {
                type: 'button', class: 'icon-btn is-danger',
                'aria-label': t('deleteTaskLabel', { name: template.name }), title: t('delete'),
                onClick: () => removeTemplate(template)
            }, icon('trash'))
        )
    );
}

function renderTemplates() {
    const list = $('#template-list');
    const signature = JSON.stringify([loaded, query, t('useTemplate'), state.templates]);
    if (signature === drawn) return;
    drawn = signature;
    if (!loaded) {
        list.replaceChildren(...skeletonList(2));
        return;
    }
    if (state.templates.length === 0) {
        list.replaceChildren(emptyState('bookmark', t('noTemplatesTitle'), t('noTemplatesText')));
        return;
    }
    const visible = query
        ? state.templates.filter((template) => `${template.name} ${categoryLabel(template.category)}`.toLowerCase().includes(query))
        : state.templates;
    if (visible.length === 0) {
        list.replaceChildren(emptyState('search', t('noResultsTitle'), t('noResultsText')));
        return;
    }
    list.replaceChildren(...visible.map(templateCard));
}

async function useTemplate(template) {
    try {
        await api.useTemplate(template.id);
        await refreshCore();
        toast(t('templateAdded'), { type: 'success' });
    } catch (error) {
        showError(error);
    }
}

async function removeTemplate(template) {
    const confirmed = await confirmDialog({
        title: t('confirmDeleteTemplateTitle'),
        message: template.name,
        confirmLabel: t('delete'),
        danger: true
    });
    if (!confirmed) return;
    try {
        await api.deleteTemplate(template.id);
        await loadTemplates();
        toast(t('templateDeleted'), { type: 'success' });
    } catch (error) {
        showError(error);
    }
}

async function showTemplates() {
    renderTemplates();
    try {
        await loadTemplates();
    } catch (error) {
        showError(error);
    }
}

function initTemplates() {
    initSearch($('#template-search'), (next) => { query = next; renderTemplates(); });
    on('templates', () => { loaded = true; renderTemplates(); });
    on('auth:logout', () => { loaded = false; });
    onLanguageChange(renderTemplates);
}

export { initTemplates, showTemplates };
