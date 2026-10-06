// Liquid-glass interaction layer: a specular highlight that follows the pointer and a ripple on press.
// All visuals live in CSS (components.css); this only feeds pointer coordinates to custom properties.
const TARGETS = '.btn, .icon-btn, .segment, .nav-link, .fab, .check-btn, button.chip';

// Hover zoom: every zooming element grows by the same number of pixels (--hover-grow), so the scale factor is
// computed per element from its layout size. CSS reads it as scale(var(--sx), var(--sy)). Keep in sync with the
// hover rules in components.css and views.css.
const ZOOM = '.btn, .icon-btn, .nav-link, button.chip, .task-card, .stat, .board-row, .podium-spot, .hero, .goal-card, '
    + '.streak-hero, .chart-card, .settings-card, .history-items, .day-circle, .user-mini, .profile-id';

function setZoomFactors(start) {
    const grow = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hover-grow')) || 6;
    for (let el = start.closest(ZOOM); el; el = el.parentElement && el.parentElement.closest(ZOOM)) {
        if (!el.offsetWidth || !el.offsetHeight) continue;
        el.style.setProperty('--sx', (1 + grow / el.offsetWidth).toFixed(4));
        el.style.setProperty('--sy', (1 + grow / el.offsetHeight).toFixed(4));
    }
}

function initGlass() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.addEventListener('pointerover', (event) => {
        if (event.pointerType !== 'touch' && event.target.closest) setZoomFactors(event.target);
    }, { passive: true });

    // At most one style write per frame, and only for the element under the pointer.
    let pending = null;
    document.addEventListener('pointermove', (event) => {
        const el = event.target.closest && event.target.closest(TARGETS);
        if (!el) return;
        const schedule = pending === null;
        pending = { el, x: event.clientX, y: event.clientY };
        if (!schedule) return;
        requestAnimationFrame(() => {
            const { el: target, x, y } = pending;
            pending = null;
            const rect = target.getBoundingClientRect();
            target.style.setProperty('--mx', `${x - rect.left}px`);
            target.style.setProperty('--my', `${y - rect.top}px`);
        });
    }, { passive: true });

    document.addEventListener('pointerdown', (event) => {
        const el = event.target.closest && event.target.closest(TARGETS);
        if (!el || el.disabled) return;
        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
        ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
        el.append(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
        setTimeout(() => ripple.remove(), 900);
    }, { passive: true });
}

export { initGlass };
