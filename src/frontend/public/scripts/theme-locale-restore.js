// Restores persisted theme + locale before first paint (BaseLayout).
// Must run synchronously from <head> to avoid flash of wrong theme.
// Companion to CSP refactor #380 — replaces the inline <script is:inline> block.
(function () {
  try {
    var theme = localStorage.getItem('litcrop-theme');
    var locale = localStorage.getItem('litcrop-locale');
    var root = document.documentElement;
    if (theme) root.setAttribute('data-theme', theme);
    if (locale) {
      root.setAttribute('data-locale', locale);
      root.setAttribute('lang', locale === 'ja' ? 'ja' : 'en');
    }
  } catch (_) {
    // localStorage may throw in private mode or when disabled — fail open.
  }
})();
