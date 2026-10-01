import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { h, $, setBusy } from '../core/dom.js';
import { t, onLanguageChange } from '../core/i18n.js';
import { calculateXp } from '../core/ranks.js';
import { refreshCore, loadTemplates } from '../core/data.js';
import { refreshUser } from '../core/auth.js';
import { toast, openDialog, closeDialog, showError } from '../core/ui.js';
import { CATEGORY_KEYS, categoryLabel, announceProgress, warnNonCritical } from './shared.js';

const AI_TIMEOUT_MS = 25000;
const BONUS_VALUE = 3;

let mode = 'create';
let editing = null;
let aiController = null;
let originalBonus = 0;

const el = {
    get dialog() { return $('#task-dialog'); },
    get describe() { return $('#task-step-describe'); },
    get loading() { return $('#task-step-loading'); },
    get form() { return $('#task-form'); }
};

function showStep(step) {
    el.describe.hidden = step !== 'describe';
    el.loading.hidden = step !== 'loading';
    el.form.hidden = step !== 'form';
}

function fillCategories() {
    const select = $('#task-category');
    const value = select.value;
    select.replaceChildren(...Object.keys(CATEGORY_KEYS).map((key) => h('option', { value: key }, categoryLabel(key))));
    select.value = value || 'other';
}

function setSliderFill(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    input.style.setProperty('--fill', `${((input.value - min) / (max - min)) * 100}%`);
}

function readForm() {
    const bonusChecked = $('#task-bonus').checked;
    return {
        name: $('#task-name').value.trim(),
        duration: parseInt($('#task-duration').value, 10),
        category: $('#task-category').value,
        productivity: parseInt($('#task-productivity').value, 10),
        difficulty: parseInt($('#task-difficulty').value, 10),
        // Keep unusual stored bonus values (not 0/3) unless the checkbox was changed.
        bonus: bonusChecked ? (originalBonus > 0 ? originalBonus : BONUS_VALUE) : 0
    };
}

function updatePreview() {
    const values = readForm();
    ['#task-productivity', '#task-difficulty'].forEach((selector) => setSliderFill($(selector)));
    $('#task-productivity-out').textContent = values.productivity;
    $('#task-difficulty-out').textContent = values.difficulty;
    $('#task-productivity-hint').textContent = values.productivity === 0 ? t('productivityZero') : '';

    const duration = Number.isFinite(values.duration) ? values.duration : 0;
    const base = calculateXp(duration, values.productivity, values.difficulty, values.bonus);
    const multiplier = Number(state.user && state.user.multiplier) || 1;
    const showMultiplier = !(mode === 'edit' && editing && editing.completed) && Math.abs(multiplier - 1) > 0.004;
    const final = showMultiplier ? Math.round(base * multiplier) : base;
    $('#xp-preview-value').textContent = `${final} ${t('xpUnit')}`;
    $('#xp-preview-eq').textContent = showMultiplier
        ? t('previewEq', { base, mult: multiplier.toFixed(2) })
        : t('previewBase', { base });
}

function fillForm(values) {
    $('#task-name').value = values.name || '';
    $('#task-duration').value = values.duration || 30;
    $('#task-category').value = CATEGORY_KEYS[values.category] ? values.category : 'other';
    $('#task-productivity').value = values.productivity ?? 3;
    $('#task-difficulty').value = values.difficulty ?? 3;
    originalBonus = values.bonus || 0;
    $('#task-bonus').checked = originalBonus > 0;
    updatePreview();
}

function setError(message) {
    $('#task-error').textContent = message || '';
}

function renderTemplateStrip() {
    const strip = $('#task-template-strip');
    const templates = state.templates.slice(0, 8);
    strip.hidden = templates.length === 0;
    $('#task-template-items').replaceChildren(...templates.map((template) =>
        h('button', {
            type: 'button',
            class: 'chip',
            onClick: () => { fillForm(template); enterForm(); }
        }, template.name)
    ));
}

function enterForm() {
    setError('');
    showStep('form');
    $('#task-back-btn').hidden = mode === 'edit';
    $('#task-create-options').hidden = mode === 'edit';
    $('#task-save-btn').textContent = mode === 'edit' ? t('save') : t('create');
    $('#task-name').focus();
}

function aiErrorMessage(error) {
    if (error.name === 'AbortError') return t('aiTimeout');
    if (error.code === 'ai_not_configured') return t('aiNotConfigured');
    if (error.code === 'ai_rate_limited' || error.status === 429) return t('aiRateLimited');
    return t('aiFailed');
}

async function rateWithAi() {
    const description = $('#ai-input').value.trim();
    if (!description) {
        $('#ai-input').focus();
        return;
    }
    showStep('loading');
    aiController = new AbortController();
    const timer = setTimeout(() => aiController.abort(), AI_TIMEOUT_MS);
    try {
        const rating = await api.rateTask(description, (state.user && state.user.goals) || '', aiController.signal);
        fillForm({
            name: rating.name || description.slice(0, 100),
            duration: rating.duration,
            category: rating.category,
            productivity: rating.productivity,
            difficulty: rating.difficulty,
            bonus: 0
        });
        enterForm();
    } catch (error) {
        if (!el.dialog.open) return;
        showStep('describe');
        toast(aiErrorMessage(error), { type: 'error' });
    } finally {
        clearTimeout(timer);
        aiController = null;
    }
}

function manualEntry() {
    const description = $('#ai-input').value.trim();
    fillForm({ name: description.slice(0, 200), duration: 30, category: 'other', productivity: 3, difficulty: 3, bonus: 0 });
    enterForm();
}

function validate(values) {
    if (!values.name) return t('nameRequired');
    if (!Number.isFinite(values.duration) || values.duration < 1 || values.duration > 1440) return t('durationInvalid');
    return '';
}

async function submit(event) {
    event.preventDefault();
    const values = readForm();
    const problem = validate(values);
    if (problem) {
        setError(problem);
        return;
    }
    setError('');
    const button = $('#task-save-btn');
    setBusy(button, true);
    const before = state.user;
    try {
        if (mode === 'edit') {
            const result = await api.updateTask(editing.id, values);
            closeDialog(el.dialog);
            const after = await refreshCore();
            toast(t('taskUpdated'), { type: 'success' });
            announceProgress(before, after, result.xpChange);
            return;
        }

        const created = await api.createTask(values);
        let xpEarned = 0;
        if ($('#task-done').checked) {
            const completion = await api.completeTask(created.id);
            xpEarned = completion.xpEarned || 0;
        }
        if ($('#task-save-template').checked) {
            await api.createTemplate({ ...values, recurrence: $('#task-recurrence').value });
            await loadTemplates();
        }
        closeDialog(el.dialog);
        const after = await refreshCore();
        toast(t('taskCreated'), { type: 'success' });
        announceProgress(before, after, xpEarned);
    } catch (error) {
        setError(error.network ? t('networkError') : error.message);
        showError(error);
    } finally {
        setBusy(button, false);
    }
}

function reset() {
    if (aiController) aiController.abort();
    $('#ai-input').value = '';
    $('#task-done').checked = false;
    $('#task-save-template').checked = false;
    $('#task-recurrence').value = 'none';
    $('#task-recurrence').disabled = true;
    setError('');
    showStep('describe');
}

function openTaskDialog({ mode: nextMode = 'create', task = null } = {}) {
    mode = nextMode;
    editing = task;
    reset();
    $('#task-dialog-title').textContent = mode === 'edit' ? t('editTask') : t('addTask');
    if (mode === 'edit') {
        fillForm(task);
        enterForm();
    } else {
        renderTemplateStrip();
        showStep('describe');
    }
    openDialog(el.dialog);
    if (mode === 'create') $('#ai-input').focus();
    // Friends may have gained XP since the last load: refresh the multiplier the preview uses.
    refreshUser().then(() => { if (el.dialog.open && !el.form.hidden) updatePreview(); }).catch(warnNonCritical('refreshUser'));
}

function initTaskDialog() {
    fillCategories();
    $('#ai-rate-btn').addEventListener('click', rateWithAi);
    $('#task-manual-btn').addEventListener('click', manualEntry);
    $('#task-back-btn').addEventListener('click', () => { setError(''); showStep('describe'); $('#ai-input').focus(); });
    el.form.addEventListener('submit', submit);
    el.form.addEventListener('input', updatePreview);
    $('#ai-input').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) rateWithAi();
    });
    $('#task-save-template').addEventListener('change', (event) => {
        $('#task-recurrence').disabled = !event.target.checked;
    });
    el.dialog.addEventListener('close', reset);
    onLanguageChange(() => { fillCategories(); if (el.dialog.open) updatePreview(); });
}

export { initTaskDialog, openTaskDialog };
