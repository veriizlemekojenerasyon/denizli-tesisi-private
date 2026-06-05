/**
 * V-GEN ERTESI GUN PLAN BILDIRIMI
 *
 * Bu dosyayi Bildirim Apps Script projesine ayri bir .gs dosyasi olarak ekleyin.
 * Code.gs icindeki addAnnouncement/addSystemLog fonksiyonlarini ayni projeden kullanir.
 *
 * Script Properties:
 * - VGEN_USERNAME
 * - VGEN_PASSWORD
 * - VGEN_PLAN_URL
 * - VGEN_MAIL_TO
 *
 * Opsiyonel:
 * - VGEN_LOGIN_URL
 * - VGEN_PLAN_METHOD                  GET veya POST. Varsayilan: GET
 * - VGEN_PLAN_PAYLOAD_TEMPLATE        POST body sablonu. {{dateIso}}, {{nextDateIso}} destekler.
 * - VGEN_PLAN_HEADERS_JSON            Ek header JSON'u.
 * - VGEN_BEARER_TOKEN                 Gecici/kalici token varsa.
 * - VGEN_TENANT_ID                    X-Tenant-Id header degeri.
 * - VGEN_AUTH_COOKIE                  Cookie ile calisiyorsa.
 * - VGEN_NOTIFICATION_SHIFT           Varsayilan: 16-24
 * - VGEN_NOTIFICATION_PAGE_TARGET     Varsayilan: anasayfa
 * - VGEN_MESSAGE_MOTORS               Varsayilan: GM-1,GM-2,GM-3
 * - VGEN_PLAN_SITE_FILTER             Varsayilan: Denizli
 * - VGEN_PLAN_ASSET_FILTER            Opsiyonel ek kaynak filtresi.
 * - VGEN_PLAN_VALUE_KEYS              Varsayilan: value,amount,quantity,mw,power,plannedPower,planPower,production,plannedProduction,kgup,ddpp
 * - VGEN_MOTOR_NAME_MAP_JSON          {"Unit 1":"GM-1","Unit 2":"GM-2","Unit 3":"GM-3"}
 */

var VGEN_PLAN_TRIGGER_HANDLER = 'runVgenPlanNotification';
var VGEN_PLAN_MODULE_NAME = 'V-Gen Plan';

function installVgenPlanDailyTrigger() {
  deleteVgenPlanDailyTriggers();
  ScriptApp.newTrigger(VGEN_PLAN_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(15)
    .nearMinute(15)
    .inTimezone(Session.getScriptTimeZone())
    .create();

  return {
    success: true,
    message: 'V-Gen plan bildirimi her gun 15:15 civari calisacak sekilde kuruldu.'
  };
}

function deleteVgenPlanDailyTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === VGEN_PLAN_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }
  return { success: true, deletedCount: deleted };
}

function testVgenPlanPreview() {
  var result = runVgenPlanNotification({ dryRun: true, force: true });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testVgenTodayPlanPreview() {
  var result = runVgenPlanNotification({ dryRun: true, force: true, date: getVgenTodayDate() });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runVgenTodayPlanNotification() {
  var result = runVgenPlanNotification({ force: true, date: getVgenTodayDate() });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runVgenTomorrowPlanNotification() {
  var result = runVgenPlanNotification({ force: true, date: getVgenTomorrowDate() });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function deleteVgenMailToProperty() {
  PropertiesService.getScriptProperties().deleteProperty('VGEN_MAIL_TO');
  return logVgenPlanSetup();
}

function setVgenMailToGmail() {
  PropertiesService.getScriptProperties().setProperty('VGEN_MAIL_TO', 'mrtcsk0320@gmail.com');
  return logVgenPlanSetup();
}

function listVgenPlanProperties() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var keys = Object.keys(props).sort();
  var result = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.indexOf('VGEN_') !== 0 && key.indexOf('vgenPlanNotification:') !== 0) continue;
    result.push({
      key: key,
      value: maskVgenPropertyValue(key, props[key])
    });
  }
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function cleanupVgenPlanRunKeys() {
  return cleanupVgenPlanRunKeysOlderThan(14);
}

function cleanupVgenPlanRunKeysOlderThan(daysToKeep) {
  var keepDays = Math.max(1, parseInt(daysToKeep || 14, 10));
  var today = getVgenTodayDate();
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var deleted = [];

  for (var key in all) {
    if (!all.hasOwnProperty(key) || key.indexOf('vgenPlanNotification:') !== 0) continue;

    var dateText = key.substring('vgenPlanNotification:'.length);
    var date = parseVgenDateOnly(dateText);
    var ageDays = Math.floor((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays > keepDays) {
      props.deleteProperty(key);
      deleted.push(key);
    }
  }

  var result = { success: true, keepDays: keepDays, deletedCount: deleted.length, deletedKeys: deleted };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function maskVgenPropertyValue(key, value) {
  var text = String(value || '');
  if (/(PASSWORD|TOKEN|COOKIE|AUTH|SECRET|HEADER)/i.test(key)) return text ? '[gizli]' : '';
  return text.length > 120 ? text.substring(0, 120) + '...' : text;
}

function checkVgenPlanSetup() {
  var props = PropertiesService.getScriptProperties();
  var planUrl = props.getProperty('VGEN_PLAN_URL') || '';
  var result = {
    success: true,
    hasUsername: !!props.getProperty('VGEN_USERNAME'),
    hasPassword: !!props.getProperty('VGEN_PASSWORD'),
    hasMailTo: !!props.getProperty('VGEN_MAIL_TO'),
    hasPlanUrl: !!planUrl,
    hasLoginUrl: !!props.getProperty('VGEN_LOGIN_URL'),
    hasBearerToken: !!props.getProperty('VGEN_BEARER_TOKEN'),
    hasTenantId: !!props.getProperty('VGEN_TENANT_ID'),
    hasAuthCookie: !!props.getProperty('VGEN_AUTH_COOKIE'),
    planMethod: String(props.getProperty('VGEN_PLAN_METHOD') || 'GET').toUpperCase(),
    notificationPageTarget: props.getProperty('VGEN_NOTIFICATION_PAGE_TARGET') || 'anasayfa',
    messageMotors: props.getProperty('VGEN_MESSAGE_MOTORS') || 'GM-1,GM-2,GM-3',
    planSiteFilter: props.getProperty('VGEN_PLAN_SITE_FILTER') || 'Denizli',
    planAssetFilter: props.getProperty('VGEN_PLAN_ASSET_FILTER') || '',
    planValueKeys: props.getProperty('VGEN_PLAN_VALUE_KEYS') || getDefaultVgenPlanValueKeys().join(','),
    planUrlLooksLikePage: /\/vplantmanager\/planning\/?$/i.test(planUrl),
    note: 'Sifre/token degerleri guvenlik icin gosterilmez.'
  };

  if (result.planUrlLooksLikePage) {
    result.success = false;
    result.warning = 'VGEN_PLAN_URL sayfa URLi gibi gorunuyor. Plan JSONu icin Network > Fetch/XHR altindaki withdetail veya benzeri API URLi gerekli.';
  }

  return result;
}

function logVgenPlanSetup() {
  var result = checkVgenPlanSetup();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testVgenPlanFetchOnly() {
  var targetDate = getVgenTomorrowDate();
  try {
    var payload = fetchVgenPlanForDate(targetDate);
    var rows = extractVgenPlanRows(payload, targetDate);
    var summary = buildVgenMotorSummary(rows);
    var result = {
      success: true,
      date: formatVgenDateTR(targetDate),
      rowCount: rows.length,
      motorNames: getUniqueVgenMotorNames(rows),
      nonZeroRows: getVgenNonZeroRows(rows, 5),
      firstRows: rows.slice(0, 3),
      summaryPreview: getVgenMessageSummary(summary),
      topLevelKeys: payload && typeof payload === 'object' && !Array.isArray(payload)
        ? Object.keys(payload).slice(0, 30)
        : [],
      message: rows.length
        ? 'V-Gen plan verisi cekildi ve satirlara ayrildi.'
        : 'V-Gen cevabi geldi ama plan satiri okunamadi. Response ornegiyle parse ayari yapmak gerekir.'
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    var errorResult = { success: false, date: formatVgenDateTR(targetDate), error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function testVgenPlanDebug() {
  var result = debugVgenPlanForDate(getVgenTomorrowDate());
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testVgenTodayPlanDebug() {
  var result = debugVgenPlanForDate(getVgenTodayDate());
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function debugVgenPlanForDate(targetDate) {
  try {
    var payload = fetchVgenPlanForDate(targetDate);
    var rows = extractVgenPlanRows(payload, targetDate);
    var summary = buildVgenMotorSummary(rows);
    return {
      success: true,
      date: formatVgenDateTR(targetDate),
      rowCount: rows.length,
      nonZeroRows: getVgenNonZeroRows(rows, 30),
      summaryPreview: getVgenMessageSummary(summary),
      messageText: buildVgenPlanMessage(targetDate, summary, rows)
    };
  } catch (error) {
    return { success: false, date: formatVgenDateTR(targetDate), error: error.toString() };
  }
}

function runVgenPlanNotification(options) {
  var opts = options || {};
  var dryRun = opts.dryRun === true;
  var force = opts.force === true;
  var targetDate = opts.date ? parseVgenDateOnly(opts.date) : getVgenTomorrowDate();
  var targetDateIso = formatVgenIsoDate(targetDate);
  var targetDateTr = formatVgenDateTR(targetDate);
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    var props = PropertiesService.getScriptProperties();
    var runKey = 'vgenPlanNotification:' + targetDateIso;
    if (!force && props.getProperty(runKey)) {
      return {
        success: true,
        skipped: true,
        date: targetDateTr,
        message: 'Bu tarih icin V-Gen plan bildirimi daha once olusturulmus.'
      };
    }

    var payload = fetchVgenPlanForDate(targetDate);
    var rows = extractVgenPlanRows(payload, targetDate);
    var summary = buildVgenMotorSummary(rows);
    var message = buildVgenPlanMessage(targetDate, summary, rows);
    var subject = 'V-Gen ' + getVgenPlanDateLabel(targetDate) + ' Motor Plani - ' + targetDateTr;

    var mailResult = dryRun ? { success: true, skipped: true, message: 'Dry run: mail gonderilmedi' } : sendVgenPlanMail(subject, message);
    var announcementResult = dryRun
      ? { success: true, skipped: true, message: 'Dry run: bildirim olusturulmadi' }
      : upsertVgenPlanAnnouncement(targetDate, message);

    if (!dryRun && (mailResult.success || announcementResult.success)) {
      props.setProperty(runKey, new Date().toISOString());
      cleanupVgenPlanRunKeysOlderThan(14);
    }

    addVgenPlanSystemLog(targetDateTr, mailResult, announcementResult, rows.length, '');

    return {
      success: true,
      dryRun: dryRun,
      date: targetDateTr,
      rowCount: rows.length,
      summary: summary,
      messageText: message,
      mail: mailResult,
      announcement: announcementResult
    };
  } catch (error) {
    addVgenPlanSystemLog(targetDateTr, { success: false, error: error.toString() }, null, 0, error.toString());
    return { success: false, date: targetDateTr, error: error.toString() };
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function fetchVgenPlanForDate(date) {
  var props = PropertiesService.getScriptProperties();
  var planUrl = props.getProperty('VGEN_PLAN_URL');
  if (!planUrl) {
    throw new Error('VGEN_PLAN_URL Script Properties icinde tanimli degil.');
  }

  var method = String(props.getProperty('VGEN_PLAN_METHOD') || 'GET').toUpperCase();
  var headers = buildVgenRequestHeaders();
  var url = expandVgenTemplate(planUrl, date);
  var options = {
    method: method.toLowerCase(),
    headers: headers,
    muteHttpExceptions: true
  };

  if (method === 'POST') {
    var payloadTemplate = props.getProperty('VGEN_PLAN_PAYLOAD_TEMPLATE') || '';
    var payloadText = expandVgenTemplate(payloadTemplate, date);
    options.contentType = inferVgenContentType(headers, payloadText);
    options.payload = payloadText;
  }

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('V-Gen plan istegi basarisiz. HTTP ' + code + ': ' + text.substring(0, 500));
  }

  return parseVgenJson(text);
}

function buildVgenRequestHeaders() {
  var props = PropertiesService.getScriptProperties();
  var headers = {
    Accept: 'application/json, text/plain, */*'
  };

  var extraHeadersText = props.getProperty('VGEN_PLAN_HEADERS_JSON') || '';
  if (extraHeadersText) {
    var extraHeaders = parseVgenJson(extraHeadersText);
    for (var key in extraHeaders) {
      headers[key] = extraHeaders[key];
    }
  }

  var bearerToken = props.getProperty('VGEN_BEARER_TOKEN') || '';
  if (bearerToken && !headers.Authorization) {
    headers.Authorization = bearerToken.indexOf('Bearer ') === 0 ? bearerToken : 'Bearer ' + bearerToken;
  }

  var tenantId = props.getProperty('VGEN_TENANT_ID') || '';
  if (tenantId && !headers['X-Tenant-Id']) {
    headers['X-Tenant-Id'] = tenantId;
  }

  var cookie = props.getProperty('VGEN_AUTH_COOKIE') || '';
  if (cookie && !headers.Cookie) {
    headers.Cookie = cookie;
  }

  var loginUrl = props.getProperty('VGEN_LOGIN_URL') || '';
  if (!headers.Authorization && !headers.Cookie && loginUrl) {
    var auth = loginToVgenAndGetAuth();
    if (auth.authorization) headers.Authorization = auth.authorization;
    if (auth.cookie) headers.Cookie = auth.cookie;
  }

  return headers;
}

function loginToVgenAndGetAuth() {
  var props = PropertiesService.getScriptProperties();
  var loginUrl = props.getProperty('VGEN_LOGIN_URL') || '';
  var username = props.getProperty('VGEN_USERNAME') || '';
  var password = props.getProperty('VGEN_PASSWORD') || '';
  if (!loginUrl || !username || !password) {
    return {};
  }

  var response = UrlFetchApp.fetch(loginUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      username: username,
      email: username,
      password: password
    }),
    followRedirects: false,
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 400) {
    throw new Error('V-Gen login basarisiz. HTTP ' + code + ': ' + text.substring(0, 500));
  }

  var headers = response.getAllHeaders();
  var cookie = buildCookieFromSetCookie(headers['Set-Cookie'] || headers['set-cookie']);
  var payload = text ? safeParseVgenJson(text) : null;
  var token = findVgenAuthToken(payload);

  return {
    authorization: token ? 'Bearer ' + token : '',
    cookie: cookie
  };
}

function extractVgenPlanRows(payload, targetDate) {
  var dateIso = formatVgenIsoDate(targetDate);
  var sourceObjects = [];
  collectVgenCandidateObjects(payload, sourceObjects, 0, {});

  var map = getVgenMotorNameMap();
  var rows = [];
  for (var i = 0; i < sourceObjects.length; i++) {
    var item = sourceObjects[i];
    var row = normalizeVgenPlanItem(item, dateIso, map);
    if (row) rows.push(row);
  }

  rows.sort(function(a, b) {
    return String(a.motor).localeCompare(String(b.motor)) || a.startMinutes - b.startMinutes;
  });
  return rows;
}

function collectVgenCandidateObjects(value, result, depth, context) {
  if (depth > 8 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      collectVgenCandidateObjects(value[i], result, depth + 1, context);
    }
    return;
  }

  if (typeof value !== 'object') return;

  var childContext = buildVgenObjectContext(value, context);
  if (looksLikeVgenPlanRow(value)) {
    result.push(mergeVgenContextIntoItem(value, childContext));
  }

  for (var key in value) {
    if (value.hasOwnProperty(key)) {
      collectVgenCandidateObjects(value[key], result, depth + 1, childContext);
    }
  }
}

function looksLikeVgenPlanRow(item) {
  var keys = Object.keys(item || {}).join('|').toLowerCase();
  var hasTime = /(hour|period|date|time|start|begin|delivery)/.test(keys);
  var hasValue = /(mw|power|amount|quantity|value|production|plan|kgup|ddpp)/.test(keys);
  return hasTime && hasValue;
}

function normalizeVgenPlanItem(item, dateIso, motorMap) {
  var startValue = pickVgenValue(item, [
    'startTime', 'startDate', 'beginTime', 'beginDate', 'deliveryStart',
    'periodStart', 'dateTime', 'time', 'date', 'hour', 'period'
  ]);
  var endMatch = pickVgenPlanEndValue(item);
  var rawMotor = pickVgenPlanAssetName(item) || 'Santral';
  if (!isVgenAllowedPlanAsset(rawMotor)) return null;

  var powerMatch = pickVgenPlanPowerValue(item);
  if (!powerMatch) return null;

  var startMinutes = resolveVgenStartMinutes(item, startValue);
  if (startMinutes === null) return null;

  var endMinutes = resolveVgenEndMinutes(endMatch, startMinutes);
  var motor = normalizeVgenMotorName(rawMotor, motorMap);
  var power = parseVgenNumber(powerMatch.value);

  return {
    dateIso: dateIso,
    motor: motor,
    rawMotor: String(rawMotor),
    powerKey: powerMatch.key,
    endKey: endMatch ? endMatch.key : '',
    startMinutes: startMinutes,
    endMinutes: endMinutes,
    start: minutesToVgenTime(startMinutes),
    end: minutesToVgenTime(endMinutes),
    powerMw: power
  };
}

function buildVgenMotorSummary(rows) {
  var byMotor = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!byMotor[row.motor]) byMotor[row.motor] = [];
    if (row.powerMw > 0) {
      byMotor[row.motor].push({
        startMinutes: row.startMinutes,
        endMinutes: row.endMinutes,
        powerMw: row.powerMw
      });
    }
  }

  var motors = Object.keys(byMotor).sort();
  var summary = [];
  for (var m = 0; m < motors.length; m++) {
    var motor = motors[m];
    var intervals = mergeVgenIntervals(byMotor[motor]);
    summary.push({
      motor: motor,
      intervals: intervals,
      totalHours: roundVgenNumber(sumVgenIntervalHours(intervals), 2),
      maxMw: roundVgenNumber(maxVgenIntervalMw(intervals), 2)
    });
  }

  return summary;
}

function getUniqueVgenMotorNames(rows) {
  var seen = {};
  var names = [];
  for (var i = 0; i < rows.length; i++) {
    var motor = rows[i].motor || 'Santral';
    if (!seen[motor]) {
      seen[motor] = true;
      names.push(motor);
    }
  }
  return names.sort();
}

function getVgenNonZeroRows(rows, limit) {
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].powerMw > 0) {
      result.push(rows[i]);
      if (result.length >= limit) break;
    }
  }
  return result;
}

function getVgenGeneratorSummary(summary) {
  return summary.filter(function(item) {
    return isVgenGeneratorMotorName(item.motor);
  }).sort(function(a, b) {
    return compareVgenMotorNames(a.motor, b.motor);
  });
}

function getVgenMessageSummary(summary) {
  var messageMotors = getVgenMessageMotors();
  var byMotor = {};
  for (var i = 0; i < summary.length; i++) {
    byMotor[summary[i].motor] = summary[i];
  }

  var result = [];
  for (var m = 0; m < messageMotors.length; m++) {
    if (byMotor[messageMotors[m]]) result.push(byMotor[messageMotors[m]]);
  }
  return result;
}

function getVgenMessageMotors() {
  var configured = PropertiesService.getScriptProperties().getProperty('VGEN_MESSAGE_MOTORS') || 'GM-1,GM-2,GM-3';
  var parts = configured.split(',');
  var motors = [];
  for (var i = 0; i < parts.length; i++) {
    var motor = String(parts[i] || '').trim();
    if (motor) motors.push(normalizeVgenMotorName(motor, {}));
  }
  return motors.length ? motors : ['GM-1', 'GM-2', 'GM-3'];
}

function isVgenGeneratorMotorName(value) {
  return /^GM-\d+$/i.test(String(value || '').trim());
}

function compareVgenMotorNames(a, b) {
  var aMatch = String(a || '').match(/^GM-(\d+)$/i);
  var bMatch = String(b || '').match(/^GM-(\d+)$/i);
  if (aMatch && bMatch) return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
  return String(a || '').localeCompare(String(b || ''));
}

function buildVgenPlanMessage(targetDate, summary, rows) {
  var dateText = formatVgenDateTR(targetDate);
  var lines = [];
  lines.push(dateText + ' V-Gen ' + getVgenPlanDateLabel(targetDate).toLowerCase() + ' motor plani');
  lines.push('');

  if (!rows.length) {
    lines.push('Plan verisi cekildi ancak motor/saat satiri okunamadi. V-Gen API cevabi parse ayari gerektiriyor.');
    return lines.join('\n');
  }

  var expectedMotors = getVgenMessageMotors();
  var summaryMap = {};
  for (var i = 0; i < summary.length; i++) {
    summaryMap[summary[i].motor] = summary[i];
  }

  for (var e = 0; e < expectedMotors.length; e++) {
    var motor = expectedMotors[e];
    var item = summaryMap[motor];
    if (!item || !item.intervals.length) {
      lines.push(motor + ': Planlanan calisma yok.');
      continue;
    }
    lines.push(motor + ': ' + formatVgenIntervals(item.intervals) + ' calisacak. Toplam ' + item.totalHours + ' saat.');
  }

  lines.push('');
  lines.push('Kaynak: V-Plant Manager / V-Gen');
  return lines.join('\n');
}

function sendVgenPlanMail(subject, body) {
  var props = PropertiesService.getScriptProperties();
  var to = props.getProperty('VGEN_MAIL_TO') || '';
  if (!to) {
    return { success: true, skipped: true, message: 'VGEN_MAIL_TO tanimli degil; mail gonderilmedi.' };
  }

  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body
    });
    return { success: true, to: to, message: 'Mail gonderildi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function upsertVgenPlanAnnouncement(targetDate, message) {
  var dateIso = formatVgenIsoDate(targetDate);
  var dateText = formatVgenDateTR(targetDate);
  var props = PropertiesService.getScriptProperties();
  var id = 'auto-vgen-plan-' + dateIso;
  var shift = props.getProperty('VGEN_NOTIFICATION_SHIFT') || '16-24';
  var pageTarget = props.getProperty('VGEN_NOTIFICATION_PAGE_TARGET') || 'anasayfa';

  try {
    var record = {
      id: id,
      startDate: formatVgenDateTR(new Date()),
      endDate: dateText,
      shift: shift,
      title: message,
      category: 'plan',
      priority: 'medium',
      target: 'all',
      active: 'TRUE',
      createdBy: 'V-Gen Otomatik Plan',
      createdAt: formatDateTimeTR(new Date()),
      pageTarget: pageTarget,
      completed: 'FALSE'
    };

    var existing = getAnnouncementById(id);
    if (existing) {
      return updateAnnouncement(record);
    }

    return addAnnouncement(record);
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function addVgenPlanSystemLog(dateText, mailResult, announcementResult, rowCount, error) {
  try {
    addSystemLog({
      tarih: dateText,
      saat: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'),
      modul: VGEN_PLAN_MODULE_NAME,
      eksikKayit: 'Ertesi gun plan bildirimi',
      otomatikKayitSonucu: announcementResult && announcementResult.success ? 'Bildirim olusturuldu' : 'Bildirim yok',
      mailSonucu: mailResult && mailResult.skipped ? 'Gonderilmedi' : (mailResult && mailResult.success ? 'Basarili' : 'Basarisiz'),
      hataMesaji: error || (mailResult && mailResult.error) || (announcementResult && announcementResult.error) || '',
      detay: 'Okunan plan satiri: ' + rowCount
    });
  } catch (ignore) {}
}

function buildVgenObjectContext(item, context) {
  var result = {};
  context = context || {};
  for (var key in context) {
    if (context.hasOwnProperty(key)) result[key] = context[key];
  }

  var motor = pickVgenMotorValue(item, '');
  if (motor) result.rawMotor = motor;
  return result;
}

function mergeVgenContextIntoItem(item, context) {
  var result = {};
  for (var key in item) {
    if (item.hasOwnProperty(key)) result[key] = item[key];
  }
  if (context && context.rawMotor && !pickVgenMotorValue(result, '')) {
    result.__vgenRawMotor = context.rawMotor;
  }
  return result;
}

function pickVgenMotorValue(item, fallbackValue) {
  var direct = pickVgenPrimitiveValue(item, [
    'motor', 'motorName', 'unit', 'unitName', 'assetName', 'assetCode',
    'resourceName', 'generatorName', 'plantName', 'powerPlantName',
    'name', 'title', 'description'
  ]);
  if (direct) return direct;

  var nestedKeys = ['asset', 'unitInfo', 'unit', 'resource', 'generator', 'plant', 'powerPlant'];
  for (var i = 0; i < nestedKeys.length; i++) {
    var nested = item && item[nestedKeys[i]];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      var nestedName = pickVgenPrimitiveValue(nested, [
        'name', 'displayName', 'shortName', 'code', 'title', 'description'
      ]);
      if (nestedName) return nestedName;
    }
  }

  return fallbackValue || '';
}

function pickVgenPlanAssetName(item) {
  var candidates = [];
  addVgenAssetNameCandidate(candidates, item && item.__vgenRawMotor);
  addVgenAssetNameCandidate(candidates, pickVgenMotorValue(item, ''));

  var nestedKeys = ['asset', 'unitInfo', 'unit', 'resource', 'generator', 'plant', 'powerPlant'];
  for (var i = 0; i < nestedKeys.length; i++) {
    var nested = item && item[nestedKeys[i]];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      addVgenAssetNameCandidate(candidates, pickVgenPrimitiveValue(nested, [
        'name', 'displayName', 'shortName', 'code', 'title', 'description'
      ]));
    }
  }

  for (var c = 0; c < candidates.length; c++) {
    var text = normalizeVgenSearchText(candidates[c]);
    if (text.indexOf('denizli') !== -1 && text.indexOf('uretim') !== -1) {
      return candidates[c];
    }
  }
  return candidates.length ? candidates[0] : '';
}

function addVgenAssetNameCandidate(candidates, value) {
  if (value === null || value === undefined || value === '') return;
  var text = String(value);
  for (var i = 0; i < candidates.length; i++) {
    if (String(candidates[i]) === text) return;
  }
  candidates.push(text);
}

function pickVgenPrimitiveValue(item, keys) {
  if (!item || typeof item !== 'object') return null;
  for (var i = 0; i < keys.length; i++) {
    if (isVgenPrimitiveValue(item[keys[i]])) return item[keys[i]];
  }

  var lowerMap = {};
  for (var key in item) {
    if (item.hasOwnProperty(key)) lowerMap[String(key).toLowerCase()] = item[key];
  }
  for (var j = 0; j < keys.length; j++) {
    var value = lowerMap[String(keys[j]).toLowerCase()];
    if (isVgenPrimitiveValue(value)) return value;
  }
  return null;
}

function isVgenPrimitiveValue(value) {
  return value !== undefined
    && value !== null
    && value !== ''
    && typeof value !== 'object';
}

function pickVgenValue(item, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (item[keys[i]] !== undefined && item[keys[i]] !== null && item[keys[i]] !== '') {
      return item[keys[i]];
    }
  }

  var lowerMap = {};
  for (var key in item) {
    lowerMap[String(key).toLowerCase()] = item[key];
  }
  for (var j = 0; j < keys.length; j++) {
    var lowerKey = String(keys[j]).toLowerCase();
    if (lowerMap[lowerKey] !== undefined && lowerMap[lowerKey] !== null && lowerMap[lowerKey] !== '') {
      return lowerMap[lowerKey];
    }
  }
  return null;
}

function normalizeVgenMotorName(value, map) {
  var text = String(value || '').trim();
  if (map[text]) return map[text];
  var upper = text.toUpperCase();
  if (map[upper]) return map[upper];

  var gmMatch = upper.match(/GM\s*-?\s*(\d+)/);
  if (gmMatch) return 'GM-' + gmMatch[1];

  var numberMatch = upper.match(/(?:UNIT|UNITE|MOTOR|GENERATOR|JEN|GEN)\D*(\d+)/);
  if (numberMatch) return 'GM-' + numberMatch[1];

  return text || 'Santral';
}

function isVgenAllowedPlanAsset(value) {
  var text = normalizeVgenSearchText(value);
  var motor = normalizeVgenMotorName(value, {});
  var props = PropertiesService.getScriptProperties();
  var siteFilter = props.getProperty('VGEN_PLAN_SITE_FILTER') || 'Denizli';
  var configured = props.getProperty('VGEN_PLAN_ASSET_FILTER') || '';

  if (siteFilter && !matchesVgenConfiguredAssetFilter(text, motor, siteFilter)) return false;
  if (configured && !matchesVgenConfiguredAssetFilter(text, motor, configured)) return false;
  if (getVgenMessageMotors().indexOf(motor) === -1) return false;
  if (text.indexOf('uretim') === -1) return false;
  if (/(tuketim|olcum|sayac|meter)/.test(text)) return false;
  return true;
}

function matchesVgenConfiguredAssetFilter(text, motor, configured) {
  var parts = String(configured || '').split(',');
  for (var i = 0; i < parts.length; i++) {
    var filter = String(parts[i] || '').trim();
    if (!filter) continue;

    var filterText = normalizeVgenSearchText(filter);
    if (filterText && text.indexOf(filterText) !== -1) return true;
  }
  return false;
}

function pickVgenPlanPowerValue(item) {
  var keys = getVgenPlanValueKeys();
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = pickVgenPrimitiveValue(item, [key]);
    if (value !== null && value !== undefined && value !== '') {
      return { key: key, value: value };
    }
  }
  return null;
}

function pickVgenPlanEndValue(item) {
  var keys = [
    'endTime', 'endDate', 'finishTime', 'finishDate', 'deliveryEnd',
    'periodEnd', 'endPeriod', 'periodTo', 'periodEndHour'
  ];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = pickVgenPrimitiveValue(item, [key]);
    if (value !== null && value !== undefined && value !== '') {
      return { key: key, value: value };
    }
  }
  return null;
}

function getVgenPlanValueKeys() {
  var configured = PropertiesService.getScriptProperties().getProperty('VGEN_PLAN_VALUE_KEYS') || '';
  var source = configured ? configured.split(',') : getDefaultVgenPlanValueKeys();
  var keys = [];
  var seen = {};
  for (var i = 0; i < source.length; i++) {
    var key = String(source[i] || '').trim();
    if (key && !seen[key.toLowerCase()]) {
      keys.push(key);
      seen[key.toLowerCase()] = true;
    }
  }
  return keys.length ? keys : getDefaultVgenPlanValueKeys();
}

function getDefaultVgenPlanValueKeys() {
  return [
    'value', 'amount', 'quantity',
    'mw', 'MW', 'power', 'plannedPower', 'planPower',
    'production', 'plannedProduction',
    'kgup', 'ddpp'
  ];
}

function normalizeVgenSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c');
}

function getVgenMotorNameMap() {
  var text = PropertiesService.getScriptProperties().getProperty('VGEN_MOTOR_NAME_MAP_JSON') || '';
  if (!text) return {};
  return parseVgenJson(text);
}

function normalizeVgenStartMinutes(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (value >= 0 && value <= 23) return value * 60;
    if (value >= 1 && value <= 24) return (value - 1) * 60;
  }

  var text = String(value);
  var dateMatch = text.match(/T(\d{2}):(\d{2})/);
  if (dateMatch) return parseInt(dateMatch[1], 10) * 60 + parseInt(dateMatch[2], 10);

  var timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) return parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);

  var number = parseInt(text, 10);
  if (!isNaN(number) && number >= 0 && number <= 24) {
    return number === 24 ? 23 * 60 : number * 60;
  }
  return null;
}

function resolveVgenStartMinutes(item, fallbackValue) {
  var explicitStart = pickVgenValue(item, [
    'startTime', 'startDate', 'beginTime', 'beginDate', 'deliveryStart',
    'periodStart', 'dateTime', 'time', 'date'
  ]);
  if (explicitStart !== null && explicitStart !== undefined && explicitStart !== '') {
    return normalizeVgenStartMinutes(explicitStart);
  }

  var period = pickVgenValue(item, ['period', 'periodNo', 'periodNumber', 'hourIndex']);
  if (period !== null && period !== undefined && period !== '') {
    var periodNumber = parseInt(period, 10);
    if (!isNaN(periodNumber) && periodNumber >= 0 && periodNumber <= 23) {
      return periodNumber * 60;
    }
    if (!isNaN(periodNumber) && periodNumber === 24) {
      return 23 * 60;
    }
  }

  return normalizeVgenStartMinutes(fallbackValue);
}

function normalizeVgenEndMinutes(value, startMinutes) {
  var end = normalizeVgenStartMinutes(value);
  if (end === null || end <= startMinutes) {
    end = startMinutes + 60;
  }
  return Math.min(end, 24 * 60);
}

function resolveVgenEndMinutes(endMatch, startMinutes) {
  if (!endMatch) return Math.min(startMinutes + 60, 24 * 60);

  var end = normalizeVgenStartMinutes(endMatch.value);
  if (end === null || end <= startMinutes) {
    end = startMinutes + 60;
  } else if (isVgenInclusivePeriodEnd(endMatch)) {
    end += 60;
  }
  return Math.min(end, 24 * 60);
}

function isVgenInclusivePeriodEnd(endMatch) {
  var key = String(endMatch && endMatch.key || '').toLowerCase();
  var valueText = String(endMatch && endMatch.value || '').trim();
  if (!/(period|hour)/.test(key)) return false;
  if (/[T:]/.test(valueText)) return false;

  var number = parseInt(valueText, 10);
  return !isNaN(number) && number >= 0 && number <= 23;
}

function mergeVgenIntervals(intervals) {
  if (!intervals || !intervals.length) return [];
  intervals.sort(function(a, b) {
    return a.startMinutes - b.startMinutes;
  });

  var merged = [];
  for (var i = 0; i < intervals.length; i++) {
    var item = intervals[i];
    if (!merged.length || item.startMinutes > merged[merged.length - 1].endMinutes) {
      merged.push({
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        maxMw: item.powerMw
      });
      continue;
    }

    var last = merged[merged.length - 1];
    last.endMinutes = Math.max(last.endMinutes, item.endMinutes);
    last.maxMw = Math.max(last.maxMw, item.powerMw);
  }
  return merged;
}

function formatVgenIntervals(intervals) {
  var parts = [];
  for (var i = 0; i < intervals.length; i++) {
    parts.push(minutesToVgenTime(intervals[i].startMinutes) + '-' + minutesToVgenTime(intervals[i].endMinutes));
  }
  return parts.join(', ');
}

function sumVgenIntervalHours(intervals) {
  var total = 0;
  for (var i = 0; i < intervals.length; i++) {
    total += Math.max(0, intervals[i].endMinutes - intervals[i].startMinutes) / 60;
  }
  return total;
}

function maxVgenIntervalMw(intervals) {
  var max = 0;
  for (var i = 0; i < intervals.length; i++) {
    max = Math.max(max, intervals[i].maxMw || 0);
  }
  return max;
}

function parseVgenNumber(value) {
  if (typeof value === 'number') return value;
  var text = String(value || '').trim();
  if (text.indexOf(',') !== -1) text = text.replace(/\./g, '').replace(',', '.');
  var parsed = parseFloat(text);
  return isNaN(parsed) ? 0 : parsed;
}

function roundVgenNumber(value, digits) {
  var factor = Math.pow(10, digits || 2);
  return Math.round(parseVgenNumber(value) * factor) / factor;
}

function minutesToVgenTime(minutes) {
  var safe = Math.max(0, Math.min(24 * 60, minutes));
  if (safe === 24 * 60) return '24:00';
  var hour = Math.floor(safe / 60);
  var minute = safe % 60;
  return padVgen2(hour) + ':' + padVgen2(minute);
}

function getVgenTomorrowDate() {
  var date = new Date();
  date.setDate(date.getDate() + 1);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getVgenTodayDate() {
  var date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getVgenPlanDateLabel(date) {
  var today = getVgenTodayDate();
  var tomorrow = getVgenTomorrowDate();
  var iso = formatVgenIsoDate(date);
  if (iso === formatVgenIsoDate(today)) return 'Bugun';
  if (iso === formatVgenIsoDate(tomorrow)) return 'Ertesi Gun';
  return 'Gunluk';
}

function parseVgenDateOnly(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  var text = String(value || '').trim();
  var parts = text.indexOf('-') !== -1 ? text.split('-') : text.split('.').reverse();
  if (parts.length !== 3) throw new Error('Tarih formati okunamadi: ' + text);
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function formatVgenIsoDate(date) {
  return date.getFullYear() + '-' + padVgen2(date.getMonth() + 1) + '-' + padVgen2(date.getDate());
}

function formatVgenDateTR(date) {
  return padVgen2(date.getDate()) + '.' + padVgen2(date.getMonth() + 1) + '.' + date.getFullYear();
}

function padVgen2(value) {
  return String(value).padStart(2, '0');
}

function expandVgenTemplate(text, date) {
  var iso = formatVgenIsoDate(date);
  var tr = formatVgenDateTR(date);
  return String(text || '')
    .replace(/{{dateIso}}/g, iso)
    .replace(/{{nextDateIso}}/g, iso)
    .replace(/{{dateTr}}/g, tr)
    .replace(/{{nextDateTr}}/g, tr)
    .replace(/([?&]deliveryDate=)\d{4}-\d{2}-\d{2}/i, '$1' + iso);
}

function inferVgenContentType(headers, payloadText) {
  if (headers['Content-Type']) return headers['Content-Type'];
  if (headers['content-type']) return headers['content-type'];
  var text = String(payloadText || '').trim();
  return text.charAt(0) === '{' || text.charAt(0) === '['
    ? 'application/json'
    : 'application/x-www-form-urlencoded';
}

function parseVgenJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('JSON okunamadi: ' + error.toString() + ' / ' + String(text || '').substring(0, 300));
  }
}

function safeParseVgenJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function findVgenAuthToken(payload) {
  if (!payload || typeof payload !== 'object') return '';
  var directKeys = ['access_token', 'accessToken', 'token', 'id_token', 'idToken'];
  for (var i = 0; i < directKeys.length; i++) {
    if (payload[directKeys[i]]) return payload[directKeys[i]];
  }
  for (var key in payload) {
    if (payload.hasOwnProperty(key) && typeof payload[key] === 'object') {
      var nested = findVgenAuthToken(payload[key]);
      if (nested) return nested;
    }
  }
  return '';
}

function buildCookieFromSetCookie(setCookie) {
  if (!setCookie) return '';
  var values = Array.isArray(setCookie) ? setCookie : [setCookie];
  var parts = [];
  for (var i = 0; i < values.length; i++) {
    var first = String(values[i]).split(';')[0];
    if (first) parts.push(first);
  }
  return parts.join('; ');
}
