// Gliding glass "lens" behind the active option of every segmented control and tab strip
// (task filter, leaderboard period, database tables, sign-in tabs). The active button only changes
// its text colour; this indicator travels to it with a spring and stretches while moving.
const SELECTOR = '.segmented, .table-tabs';
const ACTIVE = '[aria-pressed="true"], [aria-selected="true"]';

function attach(container) {
    if (container.dataset.lens) return;
    container.dataset.lens = '1';
    container.classList.add('has-lens');

    const indicator = document.createElement('span');
    indicator.className = 'seg-indicator no-motion';
    indicator.setAttribute('aria-hidden', 'true');
    let placed = false;
    let frame = 0;

    function place() {
        frame = 0;
        if (!container.contains(indicator)) container.prepend(indicator);   // survives replaceChildren() re-renders
        const active = container.querySelector(`.segment${ACTIVE}, .table-tab${ACTIVE}`);
        if (!active || active.offsetWidth === 0) return;
        const next = { x: `${active.offsetLeft}px`, y: `${active.offsetTop}px`, w: `${active.offsetWidth}px`, h: `${active.offsetHeight}px` };
        const moved = indicator.style.getPropertyValue('--x') !== next.x || indicator.style.getPropertyValue('--y') !== next.y;
        indicator.classList.toggle('no-motion', !placed);
        for (const [key, value] of Object.entries(next)) indicator.style.setProperty(`--${key}`, value);
        if (placed && moved) {
            indicator.classList.remove('is-moving');
            void indicator.offsetWidth;
            indicator.classList.add('is-moving');
        }
        placed = true;
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };

    new MutationObserver(schedule).observe(container, { attributes: true, attributeFilter: ['aria-pressed', 'aria-selected'], subtree: true, childList: true });
    new ResizeObserver(schedule).observe(container);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    container.prepend(indicator);
    schedule();
}

function initSegmented() {
    document.querySelectorAll(SELECTOR).forEach(attach);
}

export { initSegmented };
