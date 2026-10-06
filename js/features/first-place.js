import { api } from '../core/api.js';
import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { tile } from './stats.js';

let data = null;

const unitText = (unit, n) => t(`${unit === 'week' ? 'week' : 'day'}${n === 1 ? 'Unit' : 'Units'}`, { n });

function streakTile(label, entry) {
    const sub = entry.current === 0
        ? t('fpNone')
        : entry.isFirst ? t('fpLeading') : t('fpNotLeading');
    return tile('trophy', label, unitText(entry.unit, entry.current), `${t('fpRecord', { n: unitText(entry.unit, entry.record) })} · ${sub}`, entry.current > 0 ? 'is-hot' : '');
}

function render(container) {
    if (!data) {
        container.replaceChildren(h('div', { class: 'skeleton', 'aria-hidden': 'true' }));
        return;
    }
    container.replaceChildren(
        h('h2', { class: 'section-title' }, t('fpTitle')),
        h('div', { class: 'stat-row first-place-row' }, streakTile(t('fpAllTime'), data.allTime), streakTile(t('fpWeekly'), data.weekly)),
        h('p', { class: 'hint' }, t('fpHint'))
    );
}

// Current and record streaks of ranking first in your own all-time and weekly leaderboard.
async function renderFirstPlace(container) {
    render(container);
    try {
        data = await api.getFirstPlace();
    } catch (error) {
        console.warn('[first-place]', error && error.message ? error.message : error);
        if (!data) { container.replaceChildren(); return; }
    }
    render(container);
}

const firstPlaceTiles = (info) => [streakTile(t('fpAllTime'), info.allTime), streakTile(t('fpWeekly'), info.weekly)];

export { renderFirstPlace, firstPlaceTiles };
