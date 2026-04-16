// Delegated click handler for back-nav anchors with [data-litcrop-back-button].
// Replaces `href="javascript:history.back()"` which is classified as an
// inline script under CSP and would be blocked once unsafe-inline is dropped
// from script-src (#380). Falls back to the href target when there is no
// history entry to return to (direct link or page reload).
(function () {
  function handleClick(e) {
    var target = e.target;
    // Walk up to the nearest back-button anchor if the click landed on a child.
    while (target && target !== document && !(target.matches && target.matches('[data-litcrop-back-button]'))) {
      target = target.parentNode;
    }
    if (!target || target === document) return;
    e.preventDefault();
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    var fallback = target.getAttribute('href');
    window.location.href = fallback && fallback !== '#' ? fallback : '/';
  }
  document.addEventListener('click', handleClick);
})();
