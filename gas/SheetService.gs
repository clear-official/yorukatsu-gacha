/** 不足シートと見出しだけを作り、既存の値は変更しない。 */
function setupSheets_() {
  var properties = PropertiesService.getScriptProperties();
  var savedId = String(properties.getProperty('SPREADSHEET_ID') || '').trim();
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (savedId && active && active.getId() !== savedId) {
    throw new Error('SPREADSHEET_ID と紐づくシートが一致しません。');
  }
  if (!savedId && !active) {
    throw new Error('紐づけ型GASで実行するか、SPREADSHEET_ID をスクリプトプロパティに設定してください。');
  }
  var spreadsheet = savedId ? SpreadsheetApp.openById(savedId) : active;
  var names = [NG.CAMPAIGNS, NG.CODES, NG.HISTORY];

  // 先に全シートを確認し、既存見出しが違う場合は作成を始めない。
  names.forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 0) assertHeaders_(sheet, name);
  });

  names.forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, NG.HEADERS[name].length).setValues([NG.HEADERS[name]]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, NG.HEADERS[name].length).setFontWeight('bold');
    }
  });

  SpreadsheetApp.flush();
  if (!savedId) properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  Logger.log('夜活ガチャ: 3シートの見出しを確認しました。運営値は自動入力していません。');
  return '抽選設定・コード管理・ガチャ履歴の見出しを確認しました。';
}

function configuredSpreadsheet_() {
  var id = String(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '').trim();
  if (!id) throw new Error('SPREADSHEET_ID が未設定です。');
  return SpreadsheetApp.openById(id);
}

function assertHeaders_(sheet, name) {
  var expected = NG.HEADERS[name];
  var actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
  if (actual.join('\u0000') !== expected.join('\u0000')) {
    throw new Error(name + ' の見出しが想定と異なります。');
  }
}

function requiredSheet_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error(name + ' シートがありません。');
  assertHeaders_(sheet, name);
  return sheet;
}

function sheetRows_(sheet, display) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var range = sheet.getRange(2, 1, last - 1, NG.HEADERS[sheet.getName()].length);
  return display ? range.getDisplayValues() : range.getValues();
}

function readCampaign_(campaignId) {
  var id = validateCampaignId_(campaignId);
  if (!id) throw new Error('キャンペーンIDが不正です。');
  var sheet = requiredSheet_(configuredSpreadsheet_(), NG.CAMPAIGNS);
  var matches = sheetRows_(sheet, true).filter(function (row) { return String(row[0]).trim() === id; });
  if (matches.length !== 1) throw new Error('キャンペーン設定がないか重複しています。');
  return parseCampaign_(matches[0]);
}

function readCode_(campaignId, eventDate) {
  var sheet = requiredSheet_(configuredSpreadsheet_(), NG.CODES);
  var rows = sheetRows_(sheet, true);
  var active = [];
  rows.forEach(function (row) {
    if (String(row[0] || '').trim() !== campaignId) return;
    var date = parseDateKey_(row[1]);
    if (!date) throw new Error('コード管理に開催日の空欄があります。');
    if (date === eventDate && parseEnabled_(row[3])) active.push(validateCode_(row[2]));
  });
  if (active.length !== 1 || !active[0]) throw new Error('開催日に有効なコードが1件必要です。');
  var code = active[0];
  var reused = rows.filter(function (row) {
    return String(row[2] || '').trim().toLowerCase() === code.toLowerCase();
  });
  if (reused.length !== 1) throw new Error('キャンペーンコードが重複しています。');
  return code;
}

function readHistory_() {
  return sheetRows_(requiredSheet_(configuredSpreadsheet_(), NG.HISTORY), false);
}

function appendHistory_(entry) {
  var sheet = requiredSheet_(configuredSpreadsheet_(), NG.HISTORY);
  sheet.appendRow([
    entry.timestamp, entry.eventDate || '', entry.userId || '', entry.campaignId || '',
    entry.result || '', entry.points === undefined ? '' : entry.points,
    entry.campaignCode || '', entry.status, entry.errorCode || '', entry.note || '',
    entry.requestId || '', entry.dedupeKey || '',
  ]);
  SpreadsheetApp.flush();
}
