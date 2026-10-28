/* A visual season only. Lottery configuration always comes from night-gacha. */
(function () {
  'use strict';
  var START = Date.parse('2026-10-28T00:00:00+09:00');
  var END = Date.parse('2026-11-01T00:00:00+09:00');
  var timer;

  function prepareImages(view) {
    var theme = document.documentElement.getAttribute('data-theme') || 'normal';
    var tasks = [];
    document.querySelectorAll('[data-normal-src], img[data-src]').forEach(function (img) {
      var group = img.closest('[data-theme-only]');
      var panel = img.closest('[data-view]');
      if (group && group.getAttribute('data-theme-only') !== theme) return;
      if (panel && panel.getAttribute('data-view') !== view) return;
      var src = img.getAttribute('data-' + theme + '-src') || img.getAttribute('data-src');
      var alt = img.getAttribute('data-' + theme + '-alt');
      ['width', 'height'].forEach(function (dimension) {
        var value = img.getAttribute('data-' + theme + '-' + dimension);
        if (value && img.getAttribute(dimension) !== value) img.setAttribute(dimension, value);
      });
      if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
      if (alt !== null && img.getAttribute('alt') !== alt) img.setAttribute('alt', alt);
      if (src && typeof img.decode === 'function') tasks.push(img.decode().catch(function () {}));
    });
    return Promise.all(tasks);
  }
  window.YokatsuTheme = { prepare: prepareImages };

  function updateTheme() {
    window.clearTimeout(timer);
    var now = Date.now();
    var theme = now >= START && now < END ? 'halloween' : 'normal';
    var changed = document.documentElement.getAttribute('data-theme') !== theme;
    if (changed) document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('link[data-normal-href]').forEach(function (link) {
      var href = link.getAttribute('data-' + theme + '-href');
      if (href && link.getAttribute('href') !== href) link.setAttribute('href', href);
    });
    var app = document.querySelector('[data-app]');
    prepareImages(app ? app.getAttribute('data-state') : 'loading');
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
