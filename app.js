(function () {
  'use strict';

  // 公開WebアプリURLとキャンペーンIDだけを設定します。確率・コード・抽選条件はGASに置きます。
  var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzCbbOyCLhaORCh-NIt2co7FOSdwYAYxvAxvUVLIUP0eBTMHL0uIZbyFyrJJKjyfU0b/exec';
  var CAMPAIGN_ID = 'halloween-2026';
  var PRELAUNCH = false;
  var demoType = new URLSearchParams(window.location.search).get('demo');
  var DEMO_MODE = demoType === '1' || demoType === 'lose';
  var DEMO_CODE = 'HW8K2P';
  var API_TIMEOUT_MS = 20000;
  var BRIDGE_READY_TIMEOUT_MS = 20000;
  var root = document.querySelector('[data-app]');
  if (!root) return;
  if (window.innerWidth < 600) window.scrollTo(0, 0);

  var frame = root.querySelector('.gas-bridge');
  var eventPanel = root.querySelector('.event');
  var winCard = root.querySelector('.result--win');
  var winHelp = winCard.querySelector('.result__help');
  var claimButton = winCard.querySelector('.button--claim');
  var machine = root.querySelector('[data-machine]');
  var confetti = root.querySelector('[data-confetti]');
  var confettiTimer = 0;
  var activeView = 'loading';
  var frameReady = false;
  var bridgeWindow = null;
  var bridgeOrigin = '';
  var pending = new Map();
  var sequence = 0;
  var apiUrl = '';

  function centerWinHelp() {
    if (window.innerWidth >= 600 || activeView !== 'win') {
      winHelp.style.removeProperty('--help-offset');
      return;
    }
    winHelp.style.setProperty('--help-offset', '0px');
    var card = winCard.getBoundingClientRect();
    var claim = claimButton.getBoundingClientRect();
    var help = winHelp.getBoundingClientRect();
    var space = card.bottom - claim.bottom;
    if (space < help.height + 20) return;
    var centeredTop = claim.bottom + (space - help.height) / 2;
    var offset = Math.min(centeredTop - help.top, card.bottom - 12 - help.bottom);
    winHelp.style.setProperty('--help-offset', Math.max(0, offset).toFixed(2) + 'px');
  }

  function fitGacha() {
    if (window.innerWidth >= 600 || activeView === 'win' || activeView === 'lose') {
      root.classList.remove('is-fitted');
      root.classList.remove('is-booting');
      root.style.removeProperty('--viewport-height');
      centerWinHelp();
      return;
    }
    var viewportHeight = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    if (!viewportHeight) return;
    root.style.setProperty('--viewport-height', viewportHeight + 'px');
    root.classList.add('is-fitted');
    var style = window.getComputedStyle(root);
    var availableHeight = root.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 1;
    var panelHeight = eventPanel.offsetHeight;
    if (!panelHeight) return;
    var scale = Math.min(1, Math.max(0, availableHeight / panelHeight));
    root.style.setProperty('--stage-scale', scale.toFixed(5));
    root.style.setProperty('--stage-height', (panelHeight * scale).toFixed(2) + 'px');
    root.classList.remove('is-booting');
  }

  var fitQueued = false;
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    window.requestAnimationFrame(function () { fitQueued = false; fitGacha(); });
  }
  window.addEventListener('resize', queueFit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queueFit);
  if (window.ResizeObserver) new ResizeObserver(queueFit).observe(eventPanel);
  window.addEventListener('pagehide', function () {
    if (window.innerWidth < 600 && activeView !== 'win' && activeView !== 'lose') root.classList.add('is-booting');
  });
  window.addEventListener('pageshow', function () {
    if (activeView !== 'win' && activeView !== 'lose') window.scrollTo(0, 0);
    fitGacha();
  });

  function clearConfetti() {
    window.clearTimeout(confettiTimer);
    confetti.textContent = '';
  }

  function celebrateWin() {
    clearConfetti();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#ffbe4d', '#f78034', '#ffecaa', '#af66eb'];
    var pieces = document.createDocumentFragment();
    for (var i = 0; i < 18; i++) {
      var piece = document.createElement('span');
      piece.className = 'confetti__piece';
      piece.style.setProperty('--left', ((i * 37 + 13) % 94 + 3) + '%');
      piece.style.setProperty('--color', colors[i % colors.length]);
      piece.style.setProperty('--delay', ((i % 6) * 0.09) + 's');
      piece.style.setProperty('--drift', (((i % 5) - 2) * 19) + 'px');
      piece.style.setProperty('--spin', (i % 2 ? 540 : -540) + 'deg');
      pieces.appendChild(piece);
    }
    confetti.appendChild(pieces);
    confettiTimer = window.setTimeout(clearConfetti, 3400);
  }

  function show(view) {
    if (view !== 'win') clearConfetti();
    activeView = view;
    root.setAttribute('data-state', view);
    root.querySelector('[data-action="draw"]').disabled = view !== 'ready';
    root.querySelectorAll('[data-view]').forEach(function (el) {
      el.hidden = el.getAttribute('data-view') !== view;
    });
    fitGacha();
  }

  function getDeviceId() {
    var key = 'yokatsu_gacha_device_id';
    var id = '';
    try { id = localStorage.getItem(key) || ''; } catch (e) {}
    var valid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!valid.test(id)) {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') id = window.crypto.randomUUID();
      else if (window.crypto && window.crypto.getRandomValues) {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        var hex = Array.from(bytes, function (value) { return ('0' + value.toString(16)).slice(-2); }).join('');
        id = hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-' + ((parseInt(hex.charAt(16), 16) & 3) | 8).toString(16) + hex.slice(17, 20) + '-' + hex.slice(20);
      } else {
        // 暗号APIを使えない古いWebViewでは安全側に倒して通信不可とします。
        return '';
      }
      try { localStorage.setItem(key, id); } catch (e) {}
    }
    return id.toLowerCase();
  }

  var deviceId = DEMO_MODE ? '' : getDeviceId();
  function configured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(GAS_WEB_APP_URL);
  }

  function callApi(action) {
    return new Promise(function (resolve, reject) {
      if (!frameReady || !bridgeWindow) return reject(new Error('bridge_not_ready'));
      var id = 'yk-' + Date.now() + '-' + (++sequence);
      var timer = window.setTimeout(function () {
        pending.delete(id);
        reject(new Error('timeout'));
      }, API_TIMEOUT_MS);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      bridgeWindow.postMessage({ type: 'yokatsu-request', requestId: id, action: action, deviceId: deviceId, campaignId: CAMPAIGN_ID }, bridgeOrigin);
    });
  }

  window.addEventListener('message', function (event) {
    if (DEMO_MODE || PRELAUNCH) return;
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'yokatsu-ready') {
      if (!/^https:\/\/(?:[a-z0-9-]+-)?script\.googleusercontent\.com$/i.test(event.origin)) return;
      bridgeWindow = event.source;
      bridgeOrigin = event.origin;
      frameReady = true;
      syncStatus();
      return;
    }
    if (!bridgeWindow || event.source !== bridgeWindow || event.origin !== bridgeOrigin) return;
    if (event.data.type !== 'yokatsu-response' || typeof event.data.requestId !== 'string') return;
    var item = pending.get(event.data.requestId);
    if (!item) return;
    window.clearTimeout(item.timer);
    pending.delete(event.data.requestId);
    if (event.data.payload && typeof event.data.payload === 'object') item.resolve(event.data.payload);
    else item.reject(new Error('invalid_response'));
  });

  function applyResponse(data) {
    if (!data || data.ok !== true) {
      if (data && data.status === 'closed') return show('closed');
      if (data && data.status === 'temporarily_unavailable') return show('unavailable');
      return show('error');
    }
    if (data.status === 'ready') return show('ready');
    if (data.status === 'closed') return show('closed');
    if (data.status === 'temporarily_unavailable') return show('unavailable');
    if (data.status === 'win' || data.status === 'lose' || data.status === 'already_played') {
      var isWin = data.status !== 'lose' && Number(data.result) === 20000 &&
        typeof data.campaignCode === 'string' && /^[A-Za-z0-9]{6}$/.test(data.campaignCode);
      var isLose = data.status !== 'win' && Number(data.result) === 0 && !data.campaignCode;
      // 想定外の応答は結果として見せない。
      if (!isWin && !isLose) return show('unavailable');
      root.querySelectorAll('[data-participated]').forEach(function (label) { label.hidden = data.status !== 'already_played'; });
      root.querySelector('[data-code]').textContent = isWin ? data.campaignCode : '';
      show(isWin ? 'win' : 'lose');
      if (isWin && data.status === 'win') celebrateWin();
      return;
    }
    return show('error');
  }

  function syncStatus() {
    if (DEMO_MODE) return show('ready');
    if (!configured() || !deviceId) return show('unavailable');
    show('loading');
    callApi('status').then(applyResponse).catch(function () { show('error'); });
  }

  function wait(ms) { return new Promise(function (resolve) { window.setTimeout(resolve, ms); }); }

  function doDraw() {
    if (activeView !== 'ready') return;
    show('drawing');
    machine.classList.add('is-shaking');
    window.setTimeout(function () { machine.classList.remove('is-shaking'); }, 1200);
    // 結果はGASが保存・決定します。画面は演出時間の後に返却値だけを表示します。
    // デモでは本番APIを呼ばず、画面上だけで当たりを再現する。
    var result = DEMO_MODE
      ? Promise.resolve(demoType === 'lose'
        ? { ok: true, status: 'lose', result: 0 }
        : { ok: true, status: 'win', result: 20000, campaignCode: DEMO_CODE })
      : callApi('draw');
    Promise.all([result, wait(1700)]).then(function (values) {
      machine.classList.remove('is-shaking');
      applyResponse(values[0]);
    }).catch(function () {
      machine.classList.remove('is-shaking');
      show('error');
      if (DEMO_MODE) return;
      // 通信結果が不明なときはstatusで保存済みの結果を復元する。画面で抽選し直さない。
      callApi('status').then(applyResponse).catch(function () { show('error'); });
    });
  }

  function copyCode(button) {
    var code = root.querySelector('[data-code]').textContent;
    if (!code) return;
    var feedback = root.querySelector('[data-copy-feedback]');
    var copied = function () {
      button.setAttribute('aria-label', 'コピーしました');
      button.setAttribute('title', 'コピーしました');
      button.classList.add('is-copied');
      if (feedback) feedback.textContent = 'コピーしました';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(copied).catch(function () { fallbackCopy(code, button); });
    } else fallbackCopy(code, button);
  }

  function fallbackCopy(code, button) {
    var field = document.createElement('textarea');
    field.value = code; field.readOnly = true; field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.appendChild(field); field.select();
    var feedback = root.querySelector('[data-copy-feedback]');
    try {
      if (document.execCommand('copy')) {
        button.setAttribute('aria-label', 'コピーしました');
        button.setAttribute('title', 'コピーしました');
        button.classList.add('is-copied');
        if (feedback) feedback.textContent = 'コピーしました';
      } else if (feedback) feedback.textContent = 'コードを選択してコピーしてください';
    } catch (e) { if (feedback) feedback.textContent = 'コードを選択してコピーしてください'; }
    document.body.removeChild(field);
  }

  root.addEventListener('click', function (event) {
    if (DEMO_MODE && event.target.closest('[data-demo-block-claim]')) {
      event.preventDefault();
      root.querySelector('[data-demo-claim-feedback]').textContent = 'デモのためアプリへは遷移しません';
      return;
    }
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');
    if (action === 'draw') doDraw();
    if (action === 'retry') syncStatus();
    if (action === 'copy') copyCode(button);
  });

  fitGacha();

  if (DEMO_MODE) {
    root.setAttribute('data-demo', 'true');
    root.querySelectorAll('[data-demo-only]').forEach(function (el) { el.hidden = false; });
    root.querySelector('[data-code-label]').textContent = 'テスト用コード';
    root.querySelector('[data-demo-block-claim]').setAttribute('href', '#');
    show('ready');
    return;
  }
  // GAS・シート設定の準備が完了していない場合のみ通常アクセスを停止する。
  if (PRELAUNCH) { show('closed'); return; }

  if (!configured()) { show('unavailable'); return; }
  apiUrl = GAS_WEB_APP_URL;
  frame.src = apiUrl + (apiUrl.indexOf('?') < 0 ? '?' : '&') + 'campaignId=' + encodeURIComponent(CAMPAIGN_ID);
  window.setTimeout(function () { if (!frameReady) show('error'); }, BRIDGE_READY_TIMEOUT_MS);
}());
