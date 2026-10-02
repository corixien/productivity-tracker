// Liquid-glass interaction layer: a specular highlight that follows the pointer and a ripple on press.
// All visuals live in CSS (components.css); this only feeds pointer coordinates to custom properties.
const TARGETS = '.btn, .icon-btn, .segment, .nav-link, .fab, .check-btn, button.chip';

function initGlass() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
