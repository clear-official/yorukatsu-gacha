import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const base = new URL('../', import.meta.url);
const headers = {
  '抽選設定': ['キャンペーンID', 'キャンペーン名', '有効', '開催曜日', '開始時刻', '終了時刻', '開始日', '終了日', '当選確率', '当選ポイント', '当選上限', '許可オリジン', '備考'],
  'コード管理': ['キャンペーンID', '開催日', 'キャンペーンコード', '有効', '備考'],
  'ガチャ履歴': ['実行日時', '開催日', 'ユーザーID', 'キャンペーンID', '抽選結果', '付与ポイント', 'キャンペーンコード', '処理結果', 'エラーコード', '備考', 'リクエストID', '重複判定キー'],
};
const deviceA = '12345678-1234-4234-8234-123456789abc';
const deviceB = '12345678-1234-4234-8234-123456789abd';
const wed = new Date('2026-10-07T03:00:00Z'); // 12:00 JST
const thu = new Date('2026-10-08T03:00:00Z');

function formatDate(date, timezone, pattern) {
  assert.equal(timezone, 'Asia/Tokyo');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date).map(x => [x.type, x.value]));
  if (pattern === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
  if (pattern === 'HH:mm') return `${parts.hour}:${parts.minute}`;
  if (pattern === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1);
  throw new Error(`unexpected format ${pattern}`);
}

function createSheet(name, rows) {
  return {
    name, rows,
    getName() { return name; },
    getLastRow() { return this.rows.length; },
    getLastColumn() { return this.rows[0]?.length ?? headers[name].length; },
    getRange(r, c, h = 1, w = 1) {
      const sheet = this;
      return {
        getDisplayValues() { return sheet.rows.slice(r - 1, r - 1 + h).map(row => row.slice(c - 1, c - 1 + w).map(String)); },
        getValues() { return sheet.rows.slice(r - 1, r - 1 + h).map(row => row.slice(c - 1, c - 1 + w)); },
        setValues(values) { values.forEach((row, i) => { sheet.rows[r - 1 + i] = row; }); return this; },
        setFontWeight() { return this; },
      };
    },
    setFrozenRows() {},
    appendRow(row) { this.rows.push(row); },
  };
}

function fixture() {
  const sheets = {
    '抽選設定': createSheet('抽選設定', [headers['抽選設定'], ['night-gacha', '夜活ガチャ', 'ON', '3', '09:00', '21:00', '', '', '1', '100', '1', 'https://clear-official.github.io', '']]),
    'コード管理': createSheet('コード管理', [headers['コード管理'], ['night-gacha', '2026-10-07', 'TEST-CODE-1', 'ON', '']]),
    'ガチャ履歴': createSheet('ガチャ履歴', [headers['ガチャ履歴']]),
  };
  const spreadsheet = {
    getId: () => 'test-spreadsheet',
    getSheetByName: name => sheets[name] ?? null,
    insertSheet(name) { sheets[name] = createSheet(name, []); return sheets[name]; },
  };
  const properties = { SPREADSHEET_ID: 'test-spreadsheet' };
  const context = vm.createContext({
    Date, Math, Object, Number, String, console: { error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: id => { assert.equal(id, 'test-spreadsheet'); return spreadsheet; }, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key], setProperty: (key, value) => { properties[key] = value; } }) },
    Utilities: { formatDate }, Logger: { log() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  });
  for (const name of ['Config.gs', 'ValidationService.gs', 'SheetService.gs', 'LotteryService.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(new URL(name, base), 'utf8'), context, { filename: name });
  }
  return { context, sheets, spreadsheet };
}

let checks = 0;
function test(name, fn) {
  fn(); checks++;
  process.stdout.write(`ok ${checks} - ${name}\n`);
}

test('100pt draw is stored once and replays with its code', () => {
  const { context: c, sheets } = fixture();
  const first = c.drawFor_(deviceA, 'night-gacha', 'request-1', wed);
  assert.equal(first.status, 'win');
  assert.equal(first.result, 100);
  assert.equal(first.campaignCode, 'TEST-CODE-1');
  assert.equal(sheets['ガチャ履歴'].rows.length, 2);
  const retry = c.drawFor_(deviceA, 'night-gacha', 'request-1', wed);
  assert.equal(retry.status, 'already_played');
  assert.equal(retry.campaignCode, first.campaignCode);
  assert.equal(sheets['ガチャ履歴'].rows.length, 2);
  const newRequest = c.drawFor_(deviceA, 'night-gacha', 'request-2', wed);
  assert.equal(newRequest.status, 'already_played');
  assert.equal(sheets['ガチャ履歴'].rows[2][7], 'DUPLICATE');
  assert.equal(sheets['ガチャ履歴'].rows.filter(row => row[7] === 'SUCCESS').length, 1);
});

test('winner limit caps a later participant', () => {
  const { context: c, sheets } = fixture();
  c.drawFor_(deviceA, 'night-gacha', 'request-1', wed);
  const next = c.drawFor_(deviceB, 'night-gacha', 'request-2', wed);
  assert.equal(next.status, 'lose');
  assert.equal(next.result, 0);
  assert.equal('campaignCode' in next, false);
  assert.equal(sheets['ガチャ履歴'].rows[2][6], '');
});

test('non-Wednesday and outside hours reject without a draw', () => {
  const { context: c, sheets } = fixture();
  assert.equal(c.drawFor_(deviceA, 'night-gacha', 'request-1', thu).status, 'closed');
  assert.equal(c.drawFor_(deviceA, 'night-gacha', 'request-2', new Date('2026-10-06T23:59:00Z')).status, 'closed');
  assert.equal(sheets['ガチャ履歴'].rows.filter(row => row[7] === 'SUCCESS').length, 0);
});

test('disabled campaign, invalid ID, missing code and bad settings fail closed', () => {
  const { context: c, sheets } = fixture();
  sheets['抽選設定'].rows[1][2] = 'OFF';
  assert.equal(c.readCampaign_('night-gacha').allowedOrigin, 'https://clear-official.github.io');
  assert.equal(c.statusFor_(deviceA, 'night-gacha', wed).status, 'closed');
  sheets['抽選設定'].rows[1][2] = 'ON';
  assert.equal(c.drawFor_('=evil', 'night-gacha', 'request-1', wed).status, 'temporarily_unavailable');
  sheets['コード管理'].rows.pop();
  assert.equal(c.drawFor_(deviceA, 'night-gacha', 'request-2', wed).status, 'temporarily_unavailable');
  assert.equal(sheets['ガチャ履歴'].rows[1][8], 'CODE_CONFIGURATION');
  sheets['抽選設定'].rows[1][8] = '';
  assert.throws(() => c.statusFor_(deviceA, 'night-gacha', wed), /抽選設定/);
});

test('a request ID cannot be reused by another user', () => {
  const { context: c, sheets } = fixture();
  c.drawFor_(deviceA, 'night-gacha', 'request-1', wed);
  assert.equal(c.drawFor_(deviceB, 'night-gacha', 'request-1', wed).status, 'temporarily_unavailable');
  assert.equal(sheets['ガチャ履歴'].rows.filter(row => row[7] === 'SUCCESS').length, 1);
});

test('setup preserves populated rows and existing spreadsheet ID', () => {
  const { context: c, sheets } = fixture();
  const prior = JSON.stringify(sheets['抽選設定'].rows);
  c.setup();
  c.setup();
  assert.equal(JSON.stringify(sheets['抽選設定'].rows), prior);
});

test('setup creates only headers when the spreadsheet is empty', () => {
  const { context: c, sheets } = fixture();
  for (const name of Object.keys(sheets)) delete sheets[name];
  c.setup();
  for (const [name, columns] of Object.entries(headers)) {
    assert.equal(JSON.stringify(sheets[name].rows), JSON.stringify([columns]));
  }
});

test('setup stops before changing a sheet with a mismatched header', () => {
  const { context: c, sheets } = fixture();
  sheets['コード管理'].rows[0][0] = 'wrong';
  const before = JSON.stringify(sheets);
  assert.throws(() => c.setup(), /見出し/);
  assert.equal(JSON.stringify(sheets), before);
});

process.stdout.write(`${checks} focused checks passed\n`);
