function validateDeviceId_(value) {
  var id = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) ? id : '';
}

function validateCampaignId_(value) {
  var id = String(value || '').trim();
  return /^[a-z][a-z0-9_-]{2,39}$/.test(id) ? id : '';
}

function validateRequestId_(value) {
  var id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : '';
}

function parseEnabled_(value) {
  var text = String(value || '').trim().toUpperCase();
  if (text !== 'ON' && text !== 'OFF') throw new Error('有効は ON または OFF で入力してください。');
  return text === 'ON';
}

function parseDateKey_(value) {
  if (value === '' || value === null || value === undefined) return '';
  var text = value instanceof Date
    ? Utilities.formatDate(value, NG.TZ, 'yyyy-MM-dd')
    : String(value).trim();
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error('日付は YYYY-MM-DD で入力してください。');
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() + 1 !== Number(match[2]) ||
      date.getUTCDate() !== Number(match[3])) throw new Error('日付が不正です。');
  return text;
}

function parseTime_(value, allowEndOfDay) {
  var text = String(value || '').trim();
  if (allowEndOfDay && text === '24:00') return 1440;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new Error('時刻は HH:mm で入力してください。');
  }
  return Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
}

function parseCampaign_(row) {
  var id = validateCampaignId_(row[0]);
  if (!id) throw new Error('キャンペーンIDが不正です。');
  var enabled = parseEnabled_(row[2]);
  var origin = String(row[11] || '').trim().replace(/\/$/, '');
  var campaign = {
    id: id, name: String(row[1] || '').trim(), enabled: enabled,
    allowedOrigin: /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) ? origin : '',
  };
  if (!enabled) return campaign;

  var weekday = Number(row[3]);
  var start = parseTime_(row[4], false);
  var end = parseTime_(row[5], true);
  var startDate = parseDateKey_(row[6]);
  var endDate = parseDateKey_(row[7]);
  var probabilityText = String(row[8] === null || row[8] === undefined ? '' : row[8]).trim();
  var pointsText = String(row[9] === null || row[9] === undefined ? '' : row[9]).trim();
  var limitText = String(row[10] === null || row[10] === undefined ? '' : row[10]).trim();
  var probability = Number(probabilityText);
  var points = Number(pointsText);
  var limit = Number(limitText);

  if (!campaign.name || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 ||
      start >= end || (startDate && endDate && startDate > endDate) ||
      !probabilityText || !Number.isFinite(probability) || probability < 0 || probability > 1 ||
      !pointsText || !Number.isInteger(points) || points <= 0 ||
      !limitText || !Number.isInteger(limit) || limit <= 0 || limit > 100000 ||
      !campaign.allowedOrigin) {
    throw new Error('抽選設定の有効行に不足または不正な値があります。');
  }
  // 現行サイトの当選表示は100pt固定。別ポイントのイベントは専用フロントと共に追加する。
  if (id === NG.DEFAULT_CAMPAIGN && (weekday !== 3 || points !== 100)) {
    throw new Error('現行サイトは水曜日・100ptのみ対応しています。');
  }
  Object.assign(campaign, {
    weekday: weekday, startMinute: start, endMinute: end,
    startDate: startDate, endDate: endDate,
    probability: probability, points: points, winnerLimit: limit,
    allowedOrigin: origin,
  });
  return campaign;
}

function eventDate_(now) {
  return Utilities.formatDate(now, NG.TZ, 'yyyy-MM-dd');
}

function isOpenNow_(campaign, now) {
  var date = eventDate_(now);
  var weekday = Number(Utilities.formatDate(now, NG.TZ, 'u'));
  var time = Utilities.formatDate(now, NG.TZ, 'HH:mm');
  var minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return campaign.enabled && weekday === campaign.weekday &&
    (!campaign.startDate || date >= campaign.startDate) &&
    (!campaign.endDate || date <= campaign.endDate) &&
    minute >= campaign.startMinute && minute < campaign.endMinute;
}

function validateCode_(value) {
  var code = String(value || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/.test(code) ? code : '';
}
