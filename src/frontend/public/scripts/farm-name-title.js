// Hydrates a page title element with the cached farm name (BaseLayout).
// Reads target element ID + prefix from <html data-farm-name-title-id=…
// data-farm-name-prefix=…>; no-op when the attribute is absent.
// Companion to CSP refactor #380 — replaces the inline <script is:inline> block.
(function () {
  function hydrate() {
    try {
      var root = document.documentElement;
      var id = root.getAttribute('data-farm-name-title-id');
      if (!id) return;
      var name = localStorage.getItem('litcrop-farmName');
      if (!name) return;
      var el = document.getElementById(id);
      if (!el) return;
      var prefix = root.getAttribute('data-farm-name-prefix') || '';
      el.textContent = prefix + name;
    } catch (_) {
      // fail open
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrate);
  } else {
    hydrate();
  }
})();
