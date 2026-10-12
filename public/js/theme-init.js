/* Apply saved light/dark theme before the page paints. */
(function () { try { var t = localStorage.getItem('swavy-theme'); if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ } })();
