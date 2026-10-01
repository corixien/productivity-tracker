import { api } from '../core/api.js';
import { state, on } from '../core/state.js';
import { h, icon, $ } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';
import { calculateXp } from '../core/ranks.js';
import { loadTemplates, refreshCore } from '../core/data.js';
import { toast, confirmDialog, emptyState, skeletonList, showError } from '../core/ui.js';
import { categoryLabel, warnNonCritical } from './shared.js';

let loaded = false;

function templateCard(template) {
    const xp = calculateXp(template.duration, template.productivity, template.difficulty, template.bonus);
    const recurrence = h('select', {
        class: 'select-sm recur-select',
        'aria-label': t('recurrenceFor', { name: template.name }),
        onChange: (event) => updateRecurrence(template, event.target.value)
    },
        h('option', { value: 'none' }, t('recurNone')),
        h('option', { value: 'daily' }, t('recurDaily')),
        h('option', { value: 'weekly' }, t('recurWeekly'))
    );
    recurrence.value = template.recurrence || 'none';

    return h('li', { class: 'task-card template-card', dataset: { category: template.category } },
        icon('bookmark', 'template-icon'),
        h('div', { class: 'task-body' },
            h('div', { class: 'task-title-row' },
                h('p', { class: 'task-name' }, template.name),
                h('span', { class: 'xp-badge' }, `~${xp} ${t('xpUnit')}`)
            ),
            h('div', { class: 'task-meta' },
                h('span', { class: 'chip chip-cat' }, categoryLabel(template.category)),
                h('span', { class: 'chip' }, icon('clock'), t('minutes', { n: template.duration })),
                template.recurrence !== 'none'
                    ? h('span', { class: 'chip chip-accent' }, icon('repeat'), t(template.recurrence === 'daily' ? 'recurDaily' : 'recurWeekly'))
                    : null
            )
        ),
        h('div', { class: 'task-actions' },
            recurrence,
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
    if (!loaded) {
        list.replaceChildren(...skeletonList(2));
        return;
    }
    if (state.templates.length === 0) {
        list.replaceChildren(emptyState('bookmark', t('noTemplatesTitle'), t('noTemplatesText')));
        return;
    }
    list.replaceChildren(...state.templates.map(templateCard));
}

async function updateRecurrence(template, recurrence) {
    try {
        await api.updateTemplate(template.id, { recurrence });
        await loadTemplates();
        if (recurrence !== 'none') {
            // Due templates become tasks right away instead of waiting for the next app start.
            const { tasks } = await api.spawnRecurring();
            if (tasks.length > 0) {
                await refreshCore();
                toast(t('recurringAdded', { n: tasks.length }), { type: 'success' });
            }
            await loadTemplates();
        }
    } catch (error) {
        showError(error);
        await loadTemplates().catch(warnNonCritical('templates.reload'));
    }
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
    on('templates', () => { loaded = true; renderTemplates(); });
    on('auth:logout', () => { loaded = false; });
    onLanguageChange(renderTemplates);
}

export { initTemplates, showTemplates };
