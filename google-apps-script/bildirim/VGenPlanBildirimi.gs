/**
 * V-GEN ERTESI GUN PLAN BILDIRIMI
 *
 * Bu dosyayi Bildirim Apps Script projesine ayri bir .gs dosyasi olarak ekleyin.
 * Code.gs icindeki addAnnouncement/addSystemLog fonksiyonlarini ayni projeden kullanir.
 *
 * Script Properties:
 * - VGEN_ACCESS_TOKEN
 * - VGEN_MAIL_TO
 *
 * Opsiyonel:
 * - VGEN_NOTIFICATION_SHIFT           Varsayilan: 16-24
 * - VGEN_NOTIFICATION_PAGE_TARGET     Varsayilan: anasayfa
 * - VGEN_MESSAGE_MOTORS               Varsayilan: GM-1,GM-2,GM-3
 * - VGEN_PLAN_SOURCE                  api veya mail. Varsayilan: api
 * - VGEN_PLAN_MAIL_QUERY              Gmail arama sorgusu. Mail yedegi kullanilirsa.
 * - VGEN_PLAN_MAIL_SUBJECT            Varsayilan: Koruma Klor. Mail yedegi kullanilirsa.
 * - VGEN_PLAN_MAIL_LOOKBACK_DAYS      Varsayilan: 7. Mail yedegi kullanilirsa.
 */

var VGEN_PLAN_TRIGGER_HANDLER = 'runVgenPlanNotification';
var VGEN_PLAN_MODULE_NAME = 'V-Gen Plan';
var VGEN_DEFAULT_PLAN_SOURCE = 'api';
var VGEN_DEFAULT_TENANT_ID = '26e3e75d-4a9c-4095-8e06-928d74dce07f';

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

function setupVgenPlanMailSource() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('VGEN_PLAN_SOURCE', 'mail');
  props.setProperty('VGEN_PLAN_MAIL_SUBJECT', 'Koruma Klor');
  props.setProperty('VGEN_PLAN_MAIL_LOOKBACK_DAYS', '7');
  return logVgenPlanSetup();
}

function setupVgenPlanApiSource() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('VGEN_PLAN_SOURCE', VGEN_DEFAULT_PLAN_SOURCE);
  return logVgenPlanSetup();
}

function setVgenAccessTokenOnce() {
  var token = 'BURAYA_BEARER_TOKEN_YAPISTIR';
  if (token === 'BURAYA_BEARER_TOKEN_YAPISTIR' || token.indexOf('Bearer ') !== 0) {
    throw new Error('Token degerini Bearer ile baslayacak sekilde setVgenAccessTokenOnce icine yapistirin.');
  }
  PropertiesService.getScriptProperties().setProperty('VGEN_ACCESS_TOKEN', token);
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
  var result = {
    success: true,
    source: props.getProperty('VGEN_PLAN_SOURCE') || VGEN_DEFAULT_PLAN_SOURCE,
    hasAccessToken: !!props.getProperty('VGEN_ACCESS_TOKEN'),
    tenantId: props.getProperty('VGEN_TENANT_ID') || VGEN_DEFAULT_TENANT_ID,
    hasMailTo: !!props.getProperty('VGEN_MAIL_TO'),
    planMailSubject: props.getProperty('VGEN_PLAN_MAIL_SUBJECT') || 'Koruma Klor',
    planMailLookbackDays: props.getProperty('VGEN_PLAN_MAIL_LOOKBACK_DAYS') || '7',
    hasPlanMailQuery: !!props.getProperty('VGEN_PLAN_MAIL_QUERY'),
    notificationPageTarget: props.getProperty('VGEN_NOTIFICATION_PAGE_TARGET') || 'anasayfa',
    messageMotors: props.getProperty('VGEN_MESSAGE_MOTORS') || 'GM-1,GM-2,GM-3',
    note: 'API kaynaginda token Script Properties icinde saklanir ve loglarda gosterilmez.'
  };

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
    var plan = getVgenPlanRowsForDate(targetDate);
    var rows = plan.rows;
    var summary = buildVgenMotorSummary(rows);
    var result = {
      success: true,
      source: plan.source,
      date: formatVgenDateTR(targetDate),
      rowCount: rows.length,
      motorNames: getUniqueVgenMotorNames(rows),
      nonZeroRows: getVgenNonZeroRows(rows, 5),
      firstRows: rows.slice(0, 3),
      summaryPreview: getVgenMessageSummary(summary),
      mail: plan.mail || '',
      workbookPreview: plan.workbookPreview || [],
      message: rows.length
        ? 'V-Gen plan verisi okundu ve satirlara ayrildi.'
        : 'Plan verisi okundu ama plan satiri bulunamadi.'
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
    var plan = getVgenPlanRowsForDate(targetDate);
    var rows = plan.rows;
    var summary = buildVgenMotorSummary(rows);
    return {
      success: true,
      source: plan.source,
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

    var plan = getVgenPlanRowsForDate(targetDate);
    var rows = plan.rows;
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
      source: plan.source,
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

function getVgenPlanRowsForDate(targetDate) {
  var source = String(PropertiesService.getScriptProperties().getProperty('VGEN_PLAN_SOURCE') || VGEN_DEFAULT_PLAN_SOURCE).toLowerCase();
  if (source === 'mail') return getVgenPlanRowsFromMail(targetDate);
  return getVgenPlanRowsFromApi(targetDate);
}

function getVgenPlanRowsFromApi(targetDate) {
  var payload = fetchVgenPlanApiForDate(targetDate);
  return {
    source: 'api',
    rows: extractVgenPlanRowsFromApiPayload(payload, targetDate)
  };
}

function fetchVgenPlanApiForDate(targetDate) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('VGEN_ACCESS_TOKEN') || '';
  var tenantId = props.getProperty('VGEN_TENANT_ID') || VGEN_DEFAULT_TENANT_ID;
  if (!token) throw new Error('VGEN_ACCESS_TOKEN Script Properties icinde tanimli degil.');

  var url = 'https://api.vgen.vtcenerji.com/vplantmanager/plannings/assetplans/withdetails' +
    '?tenantId=' + encodeURIComponent(tenantId) +
    '&deliveryDate=' + encodeURIComponent(formatVgenIsoDate(targetDate)) +
    '&periodType=Hour&includeLockStatus=true&active=true&page=1&results=2147483647';

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Accept: 'application/json',
      Authorization: token.indexOf('Bearer ') === 0 ? token : 'Bearer ' + token,
      'X-Tenant-Id': tenantId
    },
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('V-Gen plan API istegi basarisiz. HTTP ' + code + ': ' + text.substring(0, 500));
  }
  return JSON.parse(text);
}

function extractVgenPlanRowsFromApiPayload(payload, targetDate) {
  var items = Array.isArray(payload) ? payload : (payload && payload.items) || [];
  var rows = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var asset = item.asset || {};
    var assetName = asset.name || item.assetName || '';
    if (!isVgenTargetProductionAsset(assetName)) continue;

    var motor = normalizeVgenMotorName(assetName);
    if (getVgenMessageMotors().indexOf(motor) === -1) continue;

    var details = item.assetPlanDetails || item.details || [];
    for (var d = 0; d < details.length; d++) {
      var detail = details[d] || {};
      var amount = parseVgenNumber(detail.amount);
      if (amount <= 0) continue;

      var startMinutes = findVgenLineStartMinutes(detail.period);
      if (startMinutes === null) continue;
      rows.push(buildMailVgenPlanRow(targetDate, motor, 'V-Gen API', startMinutes, amount, 'api-amount'));
    }
  }
  rows.sort(function(a, b) {
    return String(a.motor).localeCompare(String(b.motor)) || a.startMinutes - b.startMinutes;
  });
  return dedupeVgenPlanRows(rows);
}

function isVgenTargetProductionAsset(assetName) {
  var text = normalizeVgenSearchText(assetName);
  return text.indexOf('denizli') !== -1 &&
    text.indexOf('uretim') !== -1 &&
    text.indexOf('tuketim') === -1;
}

function testVgenPlanMailFetchOnly() {
  var targetDate = getVgenTomorrowDate();
  try {
    var plan = getVgenPlanRowsFromMail(targetDate);
    var summary = buildVgenMotorSummary(plan.rows);
    var result = {
      success: true,
      source: plan.source,
      date: formatVgenDateTR(targetDate),
      rowCount: plan.rows.length,
      motorNames: getUniqueVgenMotorNames(plan.rows),
      nonZeroRows: getVgenNonZeroRows(plan.rows, 10),
      mail: plan.mail,
      workbookPreview: plan.workbookPreview,
      summaryPreview: getVgenMessageSummary(summary),
      messageText: buildVgenPlanMessage(targetDate, summary, plan.rows)
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    var errorResult = { success: false, date: formatVgenDateTR(targetDate), error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function getVgenPlanRowsFromMail(targetDate) {
  var attachmentResult = findVgenPlanMailAttachment(targetDate);
  var workbook = readVgenPlanWorkbookFromAttachment(attachmentResult.attachment);
  var rows = extractVgenPlanRowsFromWorkbook(workbook, targetDate);
  return {
    source: 'mail',
    rows: rows,
    mail: {
      subject: attachmentResult.message.getSubject(),
      from: attachmentResult.message.getFrom(),
      date: formatDateTimeTR(attachmentResult.message.getDate()),
      attachmentName: attachmentResult.attachment.getName()
    },
    workbookPreview: buildVgenWorkbookPreview(workbook)
  };
}

function findVgenPlanMailAttachment(targetDate) {
  var props = PropertiesService.getScriptProperties();
  var query = props.getProperty('VGEN_PLAN_MAIL_QUERY') || buildDefaultVgenPlanMailQuery(targetDate);
  var threads = GmailApp.search(query, 0, 20);
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = messages.length - 1; m >= 0; m--) {
      var attachments = messages[m].getAttachments({ includeInlineImages: false, includeAttachments: true });
      for (var a = 0; a < attachments.length; a++) {
        if (isVgenPlanAttachment(attachments[a])) {
          return { message: messages[m], attachment: attachments[a], query: query };
        }
      }
    }
  }
  throw new Error('V-Gen plan mail eki bulunamadi. Gmail sorgusu: ' + query);
}

function buildDefaultVgenPlanMailQuery(targetDate) {
  var props = PropertiesService.getScriptProperties();
  var subject = props.getProperty('VGEN_PLAN_MAIL_SUBJECT') || 'Koruma Klor';
  var lookbackDays = Math.max(1, parseInt(props.getProperty('VGEN_PLAN_MAIL_LOOKBACK_DAYS') || '7', 10));
  return 'subject:"' + subject + '" newer_than:' + lookbackDays + 'd has:attachment';
}

function isVgenPlanAttachment(attachment) {
  var name = String(attachment.getName() || '').toLowerCase();
  var type = String(attachment.getContentType() || '').toLowerCase();
  return /\.(xlsx|xls|csv)$/.test(name) ||
    type.indexOf('spreadsheet') !== -1 ||
    type.indexOf('excel') !== -1 ||
    type.indexOf('csv') !== -1;
}

function readVgenPlanWorkbookFromAttachment(attachment) {
  var name = String(attachment.getName() || '');
  if (/\.csv$/i.test(name) || String(attachment.getContentType() || '').indexOf('csv') !== -1) {
    return [{
      name: name || 'CSV',
      values: Utilities.parseCsv(attachment.getDataAsString())
    }];
  }

  var convertedFile = null;
  try {
    if (typeof Drive === 'undefined' || !Drive.Files || (!Drive.Files.insert && !Drive.Files.create)) {
      throw new Error('Drive API advanced service acik degil. Apps Script > Services > Drive API ekleyin.');
    }

    var resourceV2 = {
      title: 'vgen-plan-temp-' + new Date().getTime() + '-' + name,
      mimeType: MimeType.GOOGLE_SHEETS
    };
    var resourceV3 = {
      name: resourceV2.title,
      mimeType: MimeType.GOOGLE_SHEETS
    };
    convertedFile = Drive.Files.insert
      ? Drive.Files.insert(resourceV2, attachment.copyBlob(), { convert: true })
      : Drive.Files.create(resourceV3, attachment.copyBlob(), { fields: 'id' });
    var tempSpreadsheet = SpreadsheetApp.openById(convertedFile.id);
    return tempSpreadsheet.getSheets().map(function(sheet) {
      var range = sheet.getDataRange();
      return {
        name: sheet.getName(),
        values: range.getDisplayValues()
      };
    });
  } finally {
    if (convertedFile && convertedFile.id) {
      try {
        DriveApp.getFileById(convertedFile.id).setTrashed(true);
      } catch (cleanupError) {}
    }
  }
}

function extractVgenPlanRowsFromWorkbook(workbook, targetDate) {
  var rows = [];
  for (var s = 0; s < workbook.length; s++) {
    rows = rows.concat(extractVgenPlanRowsFromSheetValues(workbook[s].values, workbook[s].name, targetDate));
  }
  rows.sort(function(a, b) {
    return String(a.motor).localeCompare(String(b.motor)) || a.startMinutes - b.startMinutes;
  });
  return rows;
}

function extractVgenPlanRowsFromSheetValues(values, sheetName, targetDate) {
  var rows = [];
  var headerInfo = findVgenMotorHeaderInfo(values);
  if (headerInfo.motorColumns.length) {
    rows = rows.concat(extractVgenRowsFromMotorColumns(values, sheetName, targetDate, headerInfo));
  }
  rows = rows.concat(extractVgenRowsFromLineText(values, sheetName, targetDate));
  return dedupeVgenPlanRows(rows);
}

function findVgenMotorHeaderInfo(values) {
  var info = { rowIndex: -1, motorColumns: [] };
  var limit = Math.min(values.length, 40);
  for (var r = 0; r < limit; r++) {
    var columns = [];
    for (var c = 0; c < values[r].length; c++) {
      var motor = normalizeVgenMotorName(values[r][c], {});
      if (getVgenMessageMotors().indexOf(motor) !== -1) {
        columns.push({ index: c, motor: motor });
      }
    }
    if (columns.length > info.motorColumns.length) {
      info = { rowIndex: r, motorColumns: columns };
    }
  }
  return info;
}

function extractVgenRowsFromMotorColumns(values, sheetName, targetDate, headerInfo) {
  var result = [];
  for (var r = headerInfo.rowIndex + 1; r < values.length; r++) {
    var row = values[r] || [];
    var startMinutes = findVgenRowStartMinutes(row);
    if (startMinutes === null) continue;

    for (var m = 0; m < headerInfo.motorColumns.length; m++) {
      var column = headerInfo.motorColumns[m];
      var power = parseVgenNumber(row[column.index]);
      if (power <= 0) continue;
      result.push(buildMailVgenPlanRow(targetDate, column.motor, sheetName, startMinutes, power, 'motor-column'));
    }
  }
  return result;
}

function extractVgenRowsFromLineText(values, sheetName, targetDate) {
  var result = [];
  var motors = getVgenMessageMotors();
  for (var r = 0; r < values.length; r++) {
    var rowText = (values[r] || []).join(' ');
    var startMinutes = findVgenLineStartMinutes(rowText);
    if (startMinutes === null) continue;

    for (var m = 0; m < motors.length; m++) {
      if (normalizeVgenSearchText(rowText).indexOf(normalizeVgenSearchText(motors[m])) === -1) continue;
      var power = findVgenLinePower(rowText);
      if (power <= 0) power = 1;
      result.push(buildMailVgenPlanRow(targetDate, motors[m], sheetName, startMinutes, power, 'line-text'));
    }
  }
  return result;
}

function buildMailVgenPlanRow(targetDate, motor, sheetName, startMinutes, power, sourceKey) {
  var endMinutes = Math.min(startMinutes + 60, 24 * 60);
  return {
    dateIso: formatVgenIsoDate(targetDate),
    motor: motor,
    rawMotor: motor,
    powerKey: sourceKey,
    endKey: '',
    startMinutes: startMinutes,
    endMinutes: endMinutes,
    start: minutesToVgenTime(startMinutes),
    end: minutesToVgenTime(endMinutes),
    powerMw: power,
    sheetName: sheetName
  };
}

function findVgenRowStartMinutes(row) {
  for (var c = 0; c < Math.min(row.length, 8); c++) {
    var minutes = findVgenLineStartMinutes(row[c]);
    if (minutes !== null) return minutes;
  }
  return null;
}

function findVgenLineStartMinutes(value) {
  var text = String(value || '');
  var rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/);
  if (rangeMatch) return parseInt(rangeMatch[1], 10) * 60 + parseInt(rangeMatch[2], 10);

  var timeMatch = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (timeMatch) return parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);

  var hourMatch = text.match(/\b(?:saat|hour|period|periyot)\D*(\d{1,2})\b/i);
  if (hourMatch) {
    var hour = parseInt(hourMatch[1], 10);
    if (hour >= 0 && hour <= 24) return hour === 24 ? 23 * 60 : hour * 60;
  }
  return null;
}

function findVgenLinePower(value) {
  var text = String(value || '').replace(/\s+/g, ' ');
  var mwMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:mw|mwh|kw|kwh)\b/i);
  if (mwMatch) return parseVgenNumber(mwMatch[1]);
  return 0;
}

function dedupeVgenPlanRows(rows) {
  var seen = {};
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    var key = rows[i].dateIso + '|' + rows[i].motor + '|' + rows[i].startMinutes + '|' + rows[i].endMinutes;
    if (seen[key]) continue;
    seen[key] = true;
    result.push(rows[i]);
  }
  return result;
}

function buildVgenWorkbookPreview(workbook) {
  return (workbook || []).map(function(sheet) {
    return {
      sheetName: sheet.name,
      rowCount: sheet.values.length,
      firstRows: sheet.values.slice(0, 8).map(function(row) {
        return row.slice(0, 10);
      })
    };
  });
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

function normalizeVgenMotorName(value, map) {
  map = map || {};
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
