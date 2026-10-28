import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const base = new URL('../', import.meta.url);
const headers = {
  '抽選設定': ['キャンペーンID', 'キャンペーン名', '有効', '開催曜日', '開始時刻', '終了時刻', '開始日', '終了日', '当選確率', '当選ポイント', '当選上限', '許可オリジン', '備考'],
  'コード管理': ['キャンペーンID', '開催日', 'キャンペーンコード', '有効', '備考'],
  'ガチャ履歴': ['実行日時', '開催日', 'ユーザーID', 'キャンペーンID', '抽選結果', '付与ポイント', 'キャンペーンコード', '処理結果', 'エラーコード', '備考', 'リクエストID', '重複判定キー'],
  'ハロウィンガチャ履歴': ['実行日時', '開催日', 'ユーザーID', 'キャンペーンID', '抽選結果', '付与ポイント', 'キャンペーンコード', '処理結果', 'エラーコード', '備考', 'リクエストID', '重複判定キー'],
};
const deviceA = '12345678-1234-4234-8234-123456789abc';
const deviceB = '12345678-1234-4234-8234-123456789abd';
const eventDay = new Date('2026-10-30T03:00:00Z'); // 30日12:00 JST
const secondDay = new Date('2026-10-31T03:00:00Z'); // 31日12:00 JST
const afterEvent = new Date('2026-11-01T03:00:00Z');

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
  rows = rows.map(row => row.slice());
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
    '抽選設定': createSheet('抽選設定', [
      headers['抽選設定'],
      ['halloween-2026', 'ハロウィン夜活ガチャ', 'ON', '全日', '00:00', '24:00', '2026-10-30', '2026-10-31', '1', '20000', '無制限', 'https://clear-official.github.io', ''],
      ['night-gacha', '夜活ガチャ', 'ON', '3', '09:00', '21:00', '', '', '0.77', '100', '100', 'https://clear-official.github.io', ''],
    ]),
    'コード管理': createSheet('コード管理', [
      headers['コード管理'],
      ['halloween-2026', '2026-10-30', 'TEST42', 'ON', ''],
      ['night-gacha', '2026-10-07', 'N7K4Q8', 'OFF', ''],
    ]),
    'ガチャ履歴': createSheet('ガチャ履歴', [headers['ガチャ履歴']]),
    'ハロウィンガチャ履歴': createSheet('ハロウィンガチャ履歴', [headers['ハロウィンガチャ履歴']]),
  };
  const spreadsheet = {
    getId: () => 'test-spreadsheet',
    getSheetByName: name => sheets[name] ?? null,
    insertSheet(name) { sheets[name] = createSheet(name, []); return sheets[name]; },
  };
  const properties = { SPREADSHEET_ID: 'test-spreadsheet' };
  const context = vm.createContext({
    Date, Math: Object.create(Math), Object, Number, String, console: { error() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, openById: id => { assert.equal(id, 'test-spreadsheet'); return spreadsheet; }, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key], setProperty: (key, value) => { properties[key] = value; } }) },
    Utilities: { formatDate }, Logger: { log() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createTemplateFromFile: () => ({
        allowedOrigin: '',
        evaluate() { return {
          allowedOrigin: this.allowedOrigin,
          setTitle() { return this; },
          setXFrameOptionsMode() { return this; },
        }; },
      }),
    },
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

test('20,000pt draw is stored once and replays with its code', () => {
  const { context: c, sheets } = fixture();
  const first = c.drawFor_(deviceA, 'halloween-2026', 'request-1', eventDay);
  assert.equal(first.status, 'win');
  assert.equal(first.result, 20000);
  assert.equal(first.campaignCode, 'TEST42');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows[1][1], '2026-10-30');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.length, 2);
  assert.equal(sheets['ガチャ履歴'].rows.length, 1);
  const retry = c.drawFor_(deviceA, 'halloween-2026', 'request-1', eventDay);
  assert.equal(retry.status, 'already_played');
  assert.equal(retry.campaignCode, first.campaignCode);
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.length, 2);
  const newRequest = c.drawFor_(deviceA, 'halloween-2026', 'request-2', secondDay);
  assert.equal(newRequest.status, 'already_played');
  assert.equal(c.statusFor_(deviceA, 'halloween-2026', afterEvent).status, 'already_played');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows[2][7], 'DUPLICATE');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.filter(row => row[7] === 'SUCCESS').length, 1);
});

test('another participant wins on day two without a winner limit', () => {
  const { context: c, sheets } = fixture();
  c.drawFor_(deviceA, 'halloween-2026', 'request-1', eventDay);
  assert.equal(c.statusFor_(deviceB, 'halloween-2026', secondDay).status, 'ready');
  const next = c.drawFor_(deviceB, 'halloween-2026', 'request-2', secondDay);
  assert.equal(next.status, 'win');
  assert.equal(next.result, 20000);
  assert.equal(next.campaignCode, 'TEST42');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.filter(row => row[7] === 'SUCCESS').length, 2);
});

test('dates outside the two-day event reject without a draw', () => {
  const { context: c, sheets } = fixture();
  assert.equal(c.drawFor_(deviceA, 'halloween-2026', 'request-1', afterEvent).status, 'closed');
  assert.equal(c.drawFor_(deviceA, 'halloween-2026', 'request-2', new Date('2026-10-29T14:59:00Z')).status, 'closed');
  assert.equal(c.statusFor_(deviceA, 'halloween-2026', new Date('2026-10-29T15:00:00Z')).status, 'ready');
  assert.equal(c.statusFor_(deviceA, 'halloween-2026', new Date('2026-10-31T14:59:00Z')).status, 'ready');
  assert.equal(c.statusFor_(deviceA, 'halloween-2026', new Date('2026-10-31T15:00:00Z')).status, 'closed');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.filter(row => row[7] === 'SUCCESS').length, 0);
});

test('disabled campaign, invalid ID, missing code and bad settings fail closed', () => {
  const { context: c, sheets } = fixture();
  sheets['抽選設定'].rows[1][2] = 'OFF';
  assert.equal(c.readCampaign_('halloween-2026').allowedOrigin, 'https://clear-official.github.io');
  assert.equal(c.statusFor_(deviceA, 'halloween-2026', eventDay).status, 'closed');
  sheets['抽選設定'].rows[1][2] = 'ON';
  assert.equal(c.drawFor_('=evil', 'halloween-2026', 'request-1', eventDay).status, 'temporarily_unavailable');
  sheets['コード管理'].rows.splice(1, 1);
  assert.equal(c.drawFor_(deviceA, 'halloween-2026', 'request-2', eventDay).status, 'temporarily_unavailable');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows[1][8], 'CODE_CONFIGURATION');
  sheets['抽選設定'].rows[1][8] = '';
  assert.throws(() => c.statusFor_(deviceA, 'halloween-2026', eventDay), /抽選設定/);
});

test('bridge origin remains available while draw settings are temporarily invalid', () => {
  const { context: c, sheets } = fixture();
  sheets['抽選設定'].rows[1][4] = '21:00';
  sheets['抽選設定'].rows[1][5] = '11:30';
  assert.throws(() => c.readCampaign_('halloween-2026'), /抽選設定/);
  assert.equal(c.readAllowedOrigin_('halloween-2026'), 'https://clear-official.github.io');
});

test('bridge selects the requested campaign origin and preserves the old default', () => {
  const { context: c, sheets } = fixture();
  assert.equal(c.doGet({ parameter: { campaignId: 'halloween-2026' } }).allowedOrigin,
    'https://clear-official.github.io');
  assert.equal(c.doGet().allowedOrigin, 'https://clear-official.github.io');
  sheets['抽選設定'].rows.splice(2, 1);
  assert.equal(c.doGet({ parameter: { campaignId: 'halloween-2026' } }).allowedOrigin,
    'https://clear-official.github.io');
  assert.equal(c.doGet().allowedOrigin, '');
});

test('Halloween configuration keeps 20,000pt and a six-character code', () => {
  const { context: c, sheets } = fixture();
  assert.equal(c.NG.DEFAULT_CAMPAIGN, 'night-gacha');
  assert.equal(c.NG.HALLOWEEN_CAMPAIGN, 'halloween-2026');
  assert.equal(c.readCampaign_('night-gacha').points, 100);
  assert.equal(c.statusFor_(deviceA, 'halloween-2026', eventDay).status, 'ready');
  sheets['抽選設定'].rows[1][8] = '0.77';
  assert.equal(c.readCampaign_('halloween-2026').probability, 0.77);
  sheets['抽選設定'].rows[1][8] = '1';
  sheets['抽選設定'].rows[1][9] = '100';
  assert.throws(() => c.readCampaign_('halloween-2026'), /20,000pt/);
  sheets['抽選設定'].rows[1][9] = '20000';
  sheets['抽選設定'].rows[1][10] = '100';
  assert.equal(c.readCampaign_('halloween-2026').winnerLimit, 100);
  sheets['抽選設定'].rows[1][10] = '無制限';
  sheets['抽選設定'].rows[1][6] = '2026-10-29';
  assert.equal(c.readCampaign_('halloween-2026').startDate, '2026-10-29');
  sheets['抽選設定'].rows[1][6] = '2026-10-30';
  sheets['コード管理'].rows[1][2] = 'TOO-LONG';
  assert.equal(c.statusFor_(deviceA, 'halloween-2026', eventDay).status, 'temporarily_unavailable');
});

test('Halloween numeric winner limit is enforced across both days', () => {
  const { context: c, sheets } = fixture();
  sheets['抽選設定'].rows[1][10] = '1';
  const first = c.drawFor_(deviceA, 'halloween-2026', 'request-1', eventDay);
  const second = c.drawFor_(deviceB, 'halloween-2026', 'request-2', secondDay);
  assert.equal(first.status, 'win');
  assert.equal(second.status, 'lose');
  assert.equal(second.result, 0);
  assert.equal(second.campaignCode, undefined);
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.filter(row => row[4] === 'win').length, 1);
});

test('the original Wednesday campaign retains its winner limit', () => {
  const { context: c, sheets } = fixture();
  sheets['抽選設定'].rows[2][8] = '1';
  sheets['抽選設定'].rows[2][10] = '1';
  sheets['コード管理'].rows[2][3] = 'ON';
  const oldEvent = new Date('2026-10-07T03:00:00Z');
  assert.equal(c.drawFor_(deviceA, 'night-gacha', 'old-1', oldEvent).status, 'win');
  assert.equal(c.drawFor_(deviceB, 'night-gacha', 'old-2', oldEvent).status, 'lose');
  assert.equal(sheets['ガチャ履歴'].rows.length, 3);
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.length, 1);
});

test('the same device can enter each campaign without mixing history', () => {
  const { context: c, sheets } = fixture();
  const oldEvent = new Date('2026-10-07T03:00:00Z');
  sheets['抽選設定'].rows[2][8] = '1';
  sheets['コード管理'].rows[2][3] = 'ON';
  assert.equal(c.drawFor_(deviceA, 'night-gacha', 'old-1', oldEvent).status, 'win');
  assert.equal(c.drawFor_(deviceA, 'halloween-2026', 'new-1', eventDay).status, 'win');
  assert.equal(sheets['ガチャ履歴'].rows[1][3], 'night-gacha');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows[1][3], 'halloween-2026');
});

test('a missing Halloween history tab fails closed without writing to the regular tab', () => {
  const { context: c, sheets } = fixture();
  delete sheets['ハロウィンガチャ履歴'];
  assert.equal(c.statusApi(deviceA, 'halloween-2026').status, 'temporarily_unavailable');
  assert.equal(c.drawApi(deviceA, 'request-1', 'halloween-2026').status, 'temporarily_unavailable');
  assert.equal(sheets['ガチャ履歴'].rows.length, 1);
});

test('a request ID cannot be reused by another user', () => {
  const { context: c, sheets } = fixture();
  c.drawFor_(deviceA, 'halloween-2026', 'request-1', eventDay);
  assert.equal(c.drawFor_(deviceB, 'halloween-2026', 'request-1', eventDay).status, 'temporarily_unavailable');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.filter(row => row[7] === 'SUCCESS').length, 1);
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


test('seasonal frontend uses regular sheet rules, code, deduplication and history', () => {
  const { context: c, sheets } = fixture();
  const row = sheets['抽選設定'].rows[2];
  Object.assign(row, { 4: '21:00', 5: '24:00', 6: '2026-10-28', 7: '2026-10-28', 8: '0.85', 9: '100', 10: '100' });
  sheets['コード管理'].rows[2] = ['night-gacha', '2026-10-28', 'TEST-NORMAL-42', 'ON', ''];
  const now = new Date('2026-10-28T12:00:00Z');
  c.Math.random = () => 0.84;
  assert.equal(c.readCode_('night-gacha', '2026-10-28'), 'TEST-NORMAL-42');
  assert.equal(c.statusFor_(deviceA, 'night-gacha', now).status, 'ready');
  const win = c.drawFor_(deviceA, 'night-gacha', 'normal-1', now);
  assert.equal(win.result, 100);
  assert.equal(win.campaignCode, 'TEST-NORMAL-42');
  assert.equal(sheets['ガチャ履歴'].rows[1][3], 'night-gacha');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.length, 1);
  assert.equal(c.drawFor_(deviceA, 'night-gacha', 'normal-1', now).status, 'already_played');
  assert.equal(sheets['ガチャ履歴'].rows.length, 2);
  c.Math.random = () => 0.85;
  const lose = c.drawFor_(deviceB, 'night-gacha', 'normal-2', now);
  assert.equal(lose.status, 'lose');
  assert.equal(lose.result, 0);
  assert.equal(lose.campaignCode, undefined);
  assert.equal(c.statusFor_(deviceB, 'night-gacha', new Date('2026-10-28T11:59:00Z')).status, 'already_played');
});

test('normal lottery keeps schedule and limits despite the Halloween campaign being open', () => {
  const { context: c, sheets } = fixture();
  const row = sheets['抽選設定'].rows[2];
  Object.assign(row, { 4: '21:00', 5: '24:00', 6: '2026-10-28', 7: '2026-10-28', 8: '1', 10: '1' });
  sheets['コード管理'].rows[2] = ['night-gacha', '2026-10-28', 'TEST-NORMAL-42', 'ON', ''];
  const now = new Date('2026-10-28T12:00:00Z');
  assert.equal(c.statusFor_(deviceA, 'night-gacha', new Date('2026-10-28T11:59:59Z')).status, 'closed');
  assert.equal(c.statusFor_(deviceA, 'night-gacha', now).status, 'ready');
  assert.equal(c.drawFor_(deviceA, 'night-gacha', 'normal-cap-1', now).result, 100);
  assert.equal(c.drawFor_(deviceB, 'night-gacha', 'normal-cap-2', now).result, 0);
  assert.equal(c.statusFor_(deviceB, 'night-gacha', new Date('2026-10-30T12:00:00Z')).status, 'closed');
  assert.equal(c.statusFor_(deviceB, 'halloween-2026', eventDay).status, 'ready');
  assert.equal(sheets['ハロウィンガチャ履歴'].rows.length, 1);
});

process.stdout.write(`${checks} focused checks passed\n`);
