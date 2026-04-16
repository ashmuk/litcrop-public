// Query-preserving client redirect used by deprecated-path shims.
// Reads target from the <script data-target="…"> element that loaded this file.
// Companion to CSP refactor #380 — replaces the inline <script is:inline> block.
(function () {
  var scripts = document.querySelectorAll('script[data-litcrop-redirect]');
  if (scripts.length === 0) return;
  // Use the last matching script so multiple shims on one page stay independent.
  var script = scripts[scripts.length - 1];
  var target = script.getAttribute('data-target');
  if (!target) return;
  var search = window.location.search || '';
  window.location.replace(target + search);
})();
