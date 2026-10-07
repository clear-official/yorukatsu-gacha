(function () {
  'use strict';

  // 公開WebアプリURLだけを設定します。確率・コード・抽選条件はGASに置きます。
  var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzCbbOyCLhaORCh-NIt2co7FOSdwYAYxvAxvUVLIUP0eBTMHL0uIZbyFyrJJKjyfU0b/exec';
  var root = document.querySelector('[data-app]');
  if (!root) return;

  var frame = root.querySelector('.gas-bridge');
  var machine = root.querySelector('[data-machine]');
  var confetti = root.querySelector('[data-confetti]');
  var confettiTimer = 0;
  var activeView = 'loading';
  var frameReady = false;
  var pending = new Map();
  var sequence = 0;
  var apiUrl = '';

  function clearConfetti() {
    window.clearTimeout(confettiTimer);
    confetti.textContent = '';
  }

  function celebrateWin() {
    clearConfetti();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#f4b7d3', '#a8daef', '#fff0ac', '#c3b3ef'];
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
    confettiTimer = window.setTimeout(clearConfetti, 2900);
  }

  function show(view) {
    if (view !== 'win') clearConfetti();
    activeView = view;
    root.setAttribute('data-state', view);
    root.querySelector('[data-action="draw"]').disabled = view !== 'ready';
    root.querySelectorAll('[data-view]').forEach(function (el) {
      el.hidden = el.getAttribute('data-view') !== view;
    });
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

  var deviceId = getDeviceId();
  function configured() {
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(GAS_WEB_APP_URL);
  }

  function callApi(action) {
    return new Promise(function (resolve, reject) {
      if (!frameReady) return reject(new Error('bridge_not_ready'));
      var id = 'yk-' + Date.now() + '-' + (++sequence);
      var timer = window.setTimeout(function () {
        pending.delete(id);
        reject(new Error('timeout'));
      }, 12000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      frame.contentWindow.postMessage({ type: 'yokatsu-request', requestId: id, action: action, deviceId: deviceId }, '*');
    });
  }

  window.addEventListener('message', function (event) {
    if (event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'yokatsu-ready') {
      frameReady = true;
      syncStatus();
      return;
    }
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
      var isWin = Number(data.result) === 100 && typeof data.campaignCode === 'string' && data.campaignCode.length > 0;
      if (Number(data.result) === 100 && !isWin) return show('unavailable');
      root.querySelectorAll('[data-participated]').forEach(function (label) { label.hidden = data.status !== 'already_played'; });
      if (isWin) root.querySelector('[data-code]').textContent = data.campaignCode;
      show(isWin ? 'win' : 'lose');
      if (isWin && data.status === 'win') celebrateWin();
      return;
    }
    return show('error');
  }

  function syncStatus() {
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
    Promise.all([callApi('draw'), wait(1700)]).then(function (values) {
      machine.classList.remove('is-shaking');
      applyResponse(values[0]);
    }).catch(function () {
      machine.classList.remove('is-shaking');
      show('error');
      // 通信結果が不明なときはstatusで保存済みの結果を復元する。画面で抽選し直さない。
      callApi('status').then(applyResponse).catch(function () { show('error'); });
    });
  }

  function copyCode(button) {
    var code = root.querySelector('[data-code]').textContent;
    if (!code) return;
    var copied = function () { button.textContent = 'コピーしました'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(copied).catch(function () { fallbackCopy(code, button); });
    } else fallbackCopy(code, button);
  }

  function fallbackCopy(code, button) {
    var field = document.createElement('textarea');
    field.value = code; field.readOnly = true; field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.appendChild(field); field.select();
    try { button.textContent = document.execCommand('copy') ? 'コピーしました' : 'コードを選択してコピーしてください'; }
    catch (e) { button.textContent = 'コードを選択してコピーしてください'; }
    document.body.removeChild(field);
  }

  root.addEventListener('click', function (event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;
    var action = button.getAttribute('data-action');
    if (action === 'draw') doDraw();
    if (action === 'retry') syncStatus();
    if (action === 'copy') copyCode(button);
  });

  if (!configured()) { show('unavailable'); return; }
  apiUrl = GAS_WEB_APP_URL;
  frame.src = apiUrl;
  window.setTimeout(function () { if (!frameReady) show('error'); }, 15000);
}());
