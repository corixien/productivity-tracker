const STORAGE_KEY = 'theme';
const THEMES = ['system', 'dark', 'light'];

function getTheme() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return THEMES.includes(stored) ? stored : 'system';
    } catch (error) {
        return 'system';
    }
}

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
}

function setTheme(theme) {
    if (!THEMES.includes(theme)) return;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (error) { /* ignore */ }
    applyTheme(theme);
}

function initTheme() {
    applyTheme(getTheme());
}

export { initTheme, setTheme, getTheme };
