// Translates [data-i18n] elements after DOM ready (BaseLayout).
// Static inline JA map (English is default page content).
// Companion to CSP refactor #380 — replaces the inline <script is:inline> block.
(function () {
  var JA = {
    'nav.farm': '作物',
    'nav.weather': '天気',
    'nav.diary': '日誌',
    'nav.setup': 'プロフィール',
    'nav.manage': 'デバイス',
    'nav.admin': '管理',
    'nav.layout': 'レイアウト',
    'nav.pilot_banner': 'パイロット版 — リリース候補です。フィードバックをお待ちしています。',
    'page.weather': '⛅ 天気',
    'page.device': '📡 デバイス',
    'page.profile': '🌱 プロフィール',
    'footer.help': 'ヘルプ',
  };

  function apply() {
    var locale = document.documentElement.getAttribute('data-locale') || 'en';
    if (locale === 'en') return;
    var map = locale === 'ja' ? JA : null;
    if (!map) return;
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      if (key && map[key]) els[i].textContent = map[key];
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
