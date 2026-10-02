/**
 * 夜活ガチャ GAS backend
 * Deploy as a Web App (execute as the owner, access: anyone).
 * Public bridge methods: statusApi(deviceId), drawApi(deviceId).
 */
var YK = Object.freeze({
  TZ: 'Asia/Tokyo',
  SETTINGS: 'Settings',
  CODES: 'CampaignCodes',
  RESULTS: 'Results',
  TEST_RESULTS: 'TestResults',
  STATUS: 'Status',
  HEADERS: {
    Settings: ['key', 'value'],
    CampaignCodes: ['week_id', 'campaign_code'],
    Results: ['timestamp', 'week_id', 'device_id', 'result', 'campaign_code'],
    TestResults: ['timestamp', 'week_id', 'device_id', 'result', 'campaign_code'],
    Status: ['項目', '状態'],
  },
  DEFAULTS: [
    ['win_probability', '0.30'],
    ['weekly_winner_limit', '100'],
    ['timezone', 'Asia/Tokyo'],
    ['test_mode', 'OFF'],
    ['test_result', ''],
    ['test_campaign_code', ''],
    ['allowed_origin', 'https://YOURNAME.github.io'],
  ],
});

/** Run once from the editor. A bound sheet is detected automatically; a standalone script uses SPREADSHEET_ID. */
function setup() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = String(properties.getProperty('SPREADSHEET_ID') || '').trim();
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (spreadsheetId && active && active.getId() !== spreadsheetId) {
    throw new Error('SPREADSHEET_IDが、このGASに紐づくスプレッドシートと一致しません。プロジェクト設定のスクリプトプロパティを確認してください。');
  }
  if (!spreadsheetId && !active) {
    throw new Error('スプレッドシートが見つかりません。紐づけ型GASから実行するか、プロジェクト設定のスクリプトプロパティにSPREADSHEET_IDを登録してください。');
  }
  var spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : active;

  Object.keys(YK.HEADERS).forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 0) {
      var actual = sheet.getRange(1, 1, 1, YK.HEADERS[name].length).getDisplayValues()[0];
      if (actual.join('\u0000') !== YK.HEADERS[name].join('\u0000')) {
        throw new Error(name + ' シートの既存見出しが想定と異なります。既存データ保護のため変更していません。');
      }
    }
  });

  Object.keys(YK.HEADERS).forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, YK.HEADERS[name].length).setValues([YK.HEADERS[name]]);
  });

  var settings = spreadsheet.getSheetByName(YK.SETTINGS);
  var current = settings.getLastRow() > 1 ? settings.getRange(2, 1, settings.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  var add = YK.DEFAULTS.filter(function (row) { return current.indexOf(row[0]) < 0; });
  if (add.length) settings.getRange(settings.getLastRow() + 1, 1, add.length, 2).setValues(add);

  var status = spreadsheet.getSheetByName(YK.STATUS);
  if (status.getLastRow() === 1) {
    status.getRange(2, 1, 3, 2).setValues([
      ['次回のweek_id（水曜日）', ''],
      ['次回コードの登録状況', ''],
      ['他週とのコード重複', ''],
    ]);
    status.getRange('B2').setFormula('=TEXT(TODAY()+MOD(3-WEEKDAY(TODAY(),2),7),"yyyy-mm-dd")');
    status.getRange('B3').setFormula('=IF(COUNTIF(CampaignCodes!A2:A,B2)=0,"未登録",IF(COUNTIFS(CampaignCodes!A2:A,B2,CampaignCodes!B2:B,"<>")<>COUNTIF(CampaignCodes!A2:A,B2),"コード未入力",IF(COUNTIF(CampaignCodes!A2:A,B2)=1,"登録済み","重複・要確認")))');
    status.getRange('B4').setFormula('=IF(COUNTA(CampaignCodes!B2:B)=0,"なし",IF(COUNTA(CampaignCodes!B2:B)=COUNTUNIQUE(FILTER(CampaignCodes!B2:B,CampaignCodes!B2:B<>"")),"なし","重複・要確認"))');
    status.getRange('A5:B5').setValues([['テストモード', '']]);
    status.getRange('B5').setFormula('=IFERROR(VLOOKUP("test_mode",Settings!A:B,2,FALSE),"OFF")');
  }

  SpreadsheetApp.flush();
  if (!spreadsheetId) properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  if (active) spreadsheet.toast('必要なシートを確認しました。既存の設定値と履歴は保持しています。', '夜活ガチャ', 6);
  Logger.log('夜活ガチャ: シート構成を確認し、SPREADSHEET_IDを設定しました。');
}

/** Keep the old editor/menu entry point working for existing installations. */
function setupSheets() {
  return setup();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('夜活ガチャ').addItem('初期設定・シート構成を確認', 'setup').addToUi();
}

/** The iframe bridge checks message origin before calling these methods. */
function statusApi(deviceId) {
  return withScriptLock_(function () {
    var context = getContext_();
    var id = validateDeviceId_(deviceId);
    if (!id) return unavailable_();

    var weekId = getWeekId_(new Date(), context.settings.timezone);
    if (!context.settings.testMode && !isWednesday_(new Date(), context.settings.timezone)) {
      return { ok: false, status: 'closed', weekId: weekId };
    }

    var sheet = context.settings.testMode ? context.testResults : context.results;
    var previous = findResult_(sheet, weekId, id);
    if (previous) return resultResponse_(previous, true, weekId);

    var campaign = getCampaignCode_(context.codes, weekId);
    if (campaign.error) return unavailable_();
    if (context.settings.testMode && context.settings.testResult === 100 && !context.settings.testCampaignCode) return unavailable_();
    if (context.settings.testMode && context.settings.testResult === null && !campaign.code) return unavailable_();
    if (!context.settings.testMode && !campaign.code) return unavailable_();
    return { ok: true, status: 'ready', weekId: weekId };
  });
}

function drawApi(deviceId) {
  return withScriptLock_(function () {
    var now = new Date();
    var context = getContext_();
    var id = validateDeviceId_(deviceId);
    if (!id) return unavailable_();

    var settings = context.settings;
    var weekId = getWeekId_(now, settings.timezone);
    if (!settings.testMode && !isWednesday_(now, settings.timezone)) {
      return { ok: false, status: 'closed', weekId: weekId };
    }

    var resultsSheet = settings.testMode ? context.testResults : context.results;
    var previous = findResult_(resultsSheet, weekId, id);
    if (previous) return resultResponse_(previous, true, weekId);

    var campaign = getCampaignCode_(context.codes, weekId);
    if (campaign.error) return unavailable_();
    var testCode = settings.testMode ? settings.testCampaignCode : '';
    if (settings.testMode && settings.testResult === 100) {
      if (!testCode) return unavailable_();
    } else if (settings.testMode && settings.testResult === 0) {
      // Fixed 0pt tests do not need a redeemable campaign code.
    } else if (!campaign.code) {
      return unavailable_();
    }

    var winners = countWinners_(resultsSheet, weekId);
    var fixedResult = settings.testMode ? settings.testResult : null;
    var isWinner = winners < settings.weeklyWinnerLimit && (fixedResult === null ? Math.random() < settings.winProbability : fixedResult === 100);
    var result = isWinner ? 100 : 0;
    var code = result === 100 ? (settings.testMode && testCode ? testCode : campaign.code) : '';

    resultsSheet.appendRow([now, weekId, id, result, code]);
    SpreadsheetApp.flush();
    return {
      ok: true,
      status: result === 100 ? 'win' : 'lose',
      weekId: weekId,
      result: result,
      ...(result === 100 ? { campaignCode: code } : {}),
    };
  });
}

/** Apps Script serves this small, origin-checked iframe bridge to GitHub Pages. */
function doGet() {
  var template = HtmlService.createTemplateFromFile('Bridge');
  try {
    var settings = readSettings_();
    template.allowedOrigin = settings.allowedOrigin;
  } catch (error) {
    template.allowedOrigin = '';
  }
  return template.evaluate().setTitle('夜活ガチャ通信').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function withScriptLock_(callback) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) return unavailable_();
    try { return callback(); }
    finally { lock.releaseLock(); }
  } catch (error) {
    console.error('Night Gacha request failed: ' + (error && error.message ? error.message : 'unknown'));
    return unavailable_();
  }
}

function getContext_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Spreadsheet is not configured.');
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var settings = readSettings_();
  return {
    settings: settings,
    codes: requireSheet_(spreadsheet, YK.CODES),
    results: requireSheet_(spreadsheet, YK.RESULTS),
    testResults: requireSheet_(spreadsheet, YK.TEST_RESULTS),
  };
}

function readSettings_() {
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Spreadsheet is not configured.');
  var sheet = requireSheet_(SpreadsheetApp.openById(spreadsheetId), YK.SETTINGS);
  var values = sheet.getDataRange().getDisplayValues();
  var map = {};
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(map, key)) throw new Error('Duplicate settings key.');
    map[key] = String(values[i][1] || '').trim();
  }
  var probability = Number(map.win_probability);
  var limit = Number(map.weekly_winner_limit);
  var timezone = map.timezone || YK.TZ;
  var testMode = /^ON$/i.test(map.test_mode || 'OFF');
  var testResultText = String(map.test_result || '').trim();
  var testResult = testResultText === '' ? null : Number(testResultText);
  var allowedOrigin = String(map.allowed_origin || '').trim().replace(/\/$/, '');
  if (!(probability >= 0 && probability <= 1) || !Number.isInteger(limit) || limit < 1 || limit > 100 || timezone !== YK.TZ) throw new Error('Invalid settings.');
  if (testResult !== null && testResult !== 0 && testResult !== 100) throw new Error('Invalid test result setting.');
  if (allowedOrigin && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(allowedOrigin)) throw new Error('Invalid allowed origin.');
  return {
    winProbability: probability,
    weeklyWinnerLimit: limit,
    timezone: timezone,
    testMode: testMode,
    testResult: testResult,
    testCampaignCode: String(map.test_campaign_code || '').trim(),
    allowedOrigin: allowedOrigin,
  };
}

function requireSheet_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('Required sheet missing.');
  var headers = YK.HEADERS[name];
  if (!headers) throw new Error('Unknown sheet.');
  var actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (actual.join('\u0000') !== headers.join('\u0000')) throw new Error('Invalid sheet headers.');
  return sheet;
}

function validateDeviceId_(value) {
  var id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : '';
}

function isWednesday_(date, timezone) {
  return Utilities.formatDate(date, timezone, 'u') === '3';
}

function getWeekId_(date, timezone) {
  var localDate = Utilities.formatDate(date, timezone, 'yyyy-MM-dd').split('-').map(Number);
  var weekday = Number(Utilities.formatDate(date, timezone, 'u'));
  var utcWednesday = new Date(Date.UTC(localDate[0], localDate[1] - 1, localDate[2] + (3 - weekday)));
  return Utilities.formatDate(utcWednesday, 'UTC', 'yyyy-MM-dd');
}

function findResult_(sheet, weekId, deviceId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var matches = sheet.getRange(2, 3, lastRow - 1, 1).createTextFinder(deviceId).matchEntireCell(true).findAll();
  for (var i = matches.length - 1; i >= 0; i--) {
    var row = matches[i].getRow();
    var values = sheet.getRange(row, 1, 1, 5).getValues()[0];
    if (String(values[1]) === weekId) {
      return { weekId: weekId, result: Number(values[3]), campaignCode: String(values[4] || '') };
    }
  }
  return null;
}

function countWinners_(sheet, weekId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var rows = sheet.getRange(2, 2, lastRow - 1, 3).getValues();
  return rows.reduce(function (total, row) {
    return total + (String(row[0]) === weekId && Number(row[2]) === 100 ? 1 : 0);
  }, 0);
}

function getCampaignCode_(sheet, weekId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { code: '', error: false };
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  var matches = [];
  var allCodes = {};
  for (var i = 0; i < values.length; i++) {
    var candidateWeek = String(values[i][0] || '').trim();
    var candidateCode = String(values[i][1] || '').trim();
    if (!candidateWeek && !candidateCode) continue;
    if (!isWednesdayWeekId_(candidateWeek) || !candidateCode) return { code: '', error: true };
    var key = candidateCode.toLowerCase();
    if (allCodes[key]) return { code: '', error: true };
    allCodes[key] = candidateWeek;
    if (candidateWeek === weekId) matches.push(candidateCode);
  }
  if (matches.length > 1) return { code: '', error: true };
  return { code: matches.length === 1 ? matches[0] : '', error: false };
}

function isWednesdayWeekId_(value) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]) && date.getUTCDay() === 3;
}

function resultResponse_(record, alreadyPlayed, weekId) {
  var result = Number(record.result) === 100 ? 100 : 0;
  return {
    ok: true,
    status: alreadyPlayed ? 'already_played' : (result === 100 ? 'win' : 'lose'),
    weekId: weekId,
    result: result,
    ...(result === 100 && record.campaignCode ? { campaignCode: record.campaignCode } : {}),
  };
}

function unavailable_() {
  return { ok: false, status: 'temporarily_unavailable' };
}
