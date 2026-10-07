/** status と draw は Code.gs の script lock 内から呼ぶ。 */
function statusFor_(deviceId, campaignId, now) {
  var userId = validateDeviceId_(deviceId);
  var id = validateCampaignId_(campaignId);
  if (!userId || !id) return unavailable_();
  var campaign = readCampaign_(id);
  if (!campaign.enabled) return { ok: false, status: 'closed' };

  var eventDate = eventDate_(now);
  var key = dedupeKey_(id, eventDate, userId);
  var previous = findSuccess_(readHistory_(), key);
  if (previous) return resultResponse_(previous, true, eventDate);
  if (!isOpenNow_(campaign, now)) return { ok: false, status: 'closed', weekId: eventDate };

  try { readCode_(id, eventDate); }
  catch (error) {
    console.error('Night Gacha status configuration: ' + safeError_(error));
    return unavailable_();
  }
  return { ok: true, status: 'ready', weekId: eventDate };
}

function drawFor_(deviceId, campaignId, requestId, now) {
  var userId = validateDeviceId_(deviceId);
  var id = validateCampaignId_(campaignId);
  var request = validateRequestId_(requestId);
  if (!userId || !id || !request) return unavailable_();

  var campaign = readCampaign_(id);
  if (!campaign.enabled) return { ok: false, status: 'closed' };
  var eventDate = eventDate_(now);
  var key = dedupeKey_(id, eventDate, userId);
  var rows = readHistory_();
  var requestRow = findRequest_(rows, request);
  if (requestRow && String(requestRow[11]) !== key) return unavailable_();

  var previous = findSuccess_(rows, key);
  if (previous) {
    // 同一リクエストの再送は新しいログ行も作らない。
    if (!requestRow) appendHistory_({
      timestamp: now, eventDate: eventDate, userId: userId, campaignId: id,
      status: 'DUPLICATE', errorCode: 'ALREADY_PLAYED',
      requestId: request, dedupeKey: key,
    });
    return resultResponse_(previous, true, eventDate);
  }

  if (!isOpenNow_(campaign, now)) {
    if (!requestRow) appendHistory_({
      timestamp: now, eventDate: eventDate, userId: userId, campaignId: id,
      status: 'REJECTED', errorCode: 'OUTSIDE_SCHEDULE',
      requestId: request, dedupeKey: key,
    });
    return { ok: false, status: 'closed', weekId: eventDate };
  }

  var code;
  try { code = readCode_(id, eventDate); }
  catch (error) {
    console.error('Night Gacha draw configuration: ' + safeError_(error));
    if (!requestRow) appendHistory_({
      timestamp: now, eventDate: eventDate, userId: userId, campaignId: id,
      status: 'ERROR', errorCode: 'CODE_CONFIGURATION',
      requestId: request, dedupeKey: key,
    });
    return unavailable_();
  }

  var winners = countWinners_(rows, id, eventDate);
  var won = winners < campaign.winnerLimit && Math.random() < campaign.probability;
  var points = won ? campaign.points : 0;
  appendHistory_({
    timestamp: now, eventDate: eventDate, userId: userId, campaignId: id,
    result: won ? 'win' : 'lose', points: points,
    campaignCode: won ? code : '', status: 'SUCCESS',
    requestId: request, dedupeKey: key,
  });
  return {
    ok: true, status: won ? 'win' : 'lose', weekId: eventDate,
    result: points,
    ...(won ? { campaignCode: code } : {}),
  };
}

function dedupeKey_(campaignId, eventDate, userId) {
  return campaignId + '|' + eventDate + '|' + userId;
}

function findSuccess_(rows, key) {
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i];
    if (String(row[11]) === key && String(row[7]) === 'SUCCESS') return row;
  }
  return null;
}

function findRequest_(rows, requestId) {
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][10]) === requestId) return rows[i];
  }
  return null;
}

function countWinners_(rows, campaignId, eventDate) {
  return rows.reduce(function (count, row) {
    return count + (String(row[3]) === campaignId && String(row[1]) === eventDate &&
      String(row[7]) === 'SUCCESS' && String(row[4]) === 'win' ? 1 : 0);
  }, 0);
}

function resultResponse_(row, alreadyPlayed, eventDate) {
  var points = Number(row[5]);
  var won = String(row[4]) === 'win' && points > 0;
  return {
    ok: true,
    status: alreadyPlayed ? 'already_played' : (won ? 'win' : 'lose'),
    weekId: eventDate,
    result: won ? points : 0,
    ...(won ? { campaignCode: String(row[6] || '') } : {}),
  };
}
