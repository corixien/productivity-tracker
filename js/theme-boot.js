// Classic (non-module) script loaded in <head>: applies the saved theme before first paint.
(function () {
    try {
        var theme = localStorage.getItem('theme');
        if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
    } catch (error) { /* storage unavailable: keep system theme */ }
})();
