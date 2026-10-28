/* A visual season only. Lottery configuration always comes from night-gacha. */
(function () {
  'use strict';
  var START = Date.parse('2026-10-28T00:00:00+09:00');
  var END = Date.parse('2026-11-01T00:00:00+09:00');
  var timer;

  function updateTheme() {
    window.clearTimeout(timer);
    var now = Date.now();
    var theme = now >= START && now < END ? 'halloween' : 'normal';
    var changed = document.documentElement.getAttribute('data-theme') !== theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('[data-normal-src]').forEach(function (img) {
      var src = img.getAttribute('data-' + theme + '-src');
      var alt = img.getAttribute('data-' + theme + '-alt');
      if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
      if (alt !== null) img.setAttribute('alt', alt);
    });
    document.title = theme === 'halloween' ? 'ハロウィン限定 夜活ガチャ' : '水曜日限定 夜活ガチャ';
    var color = document.querySelector('meta[name="theme-color"]');
    if (color) color.setAttribute('content', theme === 'halloween' ? '#220d45' : '#242754');
    if (changed) window.dispatchEvent(new Event('yokatsu-theme-change'));
    // Re-evaluate on an open screen too; never call the lottery API on a theme change.
    if (now < END) {
      var boundary = now < START ? START : END;
      timer = window.setTimeout(updateTheme, Math.max(1, Math.min(boundary - now, 60000)));
    }
  }
  updateTheme();
  document.addEventListener('DOMContentLoaded', updateTheme);
  window.addEventListener('pageshow', updateTheme);
  window.addEventListener('focus', updateTheme);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) updateTheme();
  });
}());
