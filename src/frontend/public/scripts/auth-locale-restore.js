// Restores persisted locale preference for auth routes (AuthLayout).
// Theme is forced to "earthy" via SSR on <html> and must not be touched here.
// Companion to CSP refactor #380 — replaces the inline <script is:inline> block.
(function () {
  try {
    var locale = localStorage.getItem('litcrop-locale');
    if (locale === 'en' || locale === 'ja') {
      var root = document.documentElement;
      root.setAttribute('data-locale', locale);
      root.setAttribute('lang', locale);
    }
  } catch (_) {
    // fail open
  }
})();
