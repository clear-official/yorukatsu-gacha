/**
 * 夜活ガチャの公開入口。Sheets の列定義と抽選処理は別ファイルに置く。
 * Apps Script エディターでは gas/ の各 .gs と Bridge.html を同じプロジェクトへ追加する。
 */

function setup() {
  return setupSheets_();
}

function setupSheets() {
  return setup();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('夜活ガチャ')
    .addItem('シート構成を確認', 'setup')
    .addToUi();
}

/** 現行の GitHub Pages から呼ばれる公開関数。 */
function statusApi(deviceId, campaignId) {
  return withScriptLock_(function () {
    return statusFor_(deviceId, campaignId || NG.DEFAULT_CAMPAIGN, new Date());
  });
}

/** requestId は通信再送の識別用。重複判定の主キーは開催日＋ユーザーID。 */
function drawApi(deviceId, requestId, campaignId) {
  return withScriptLock_(function () {
    return drawFor_(deviceId, campaignId || NG.DEFAULT_CAMPAIGN, requestId, new Date());
  });
}

/** GitHub Pages が読み込む、送信元制限付きの iframe ブリッジ。 */
function doGet() {
  var template = HtmlService.createTemplateFromFile('Bridge');
  try {
    template.allowedOrigin = readAllowedOrigin_(NG.DEFAULT_CAMPAIGN);
  } catch (error) {
    template.allowedOrigin = '';
    console.error('Night Gacha bridge configuration: ' + safeError_(error));
  }
  return template.evaluate()
    .setTitle('夜活ガチャ通信')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) return unavailable_();
    try { return callback(); }
    finally { lock.releaseLock(); }
  } catch (error) {
    console.error('Night Gacha request failed: ' + safeError_(error));
    return unavailable_();
  }
}

function safeError_(error) {
  return error && error.message ? String(error.message).slice(0, 300) : 'unknown';
}

function unavailable_() {
  return { ok: false, status: 'temporarily_unavailable' };
}
