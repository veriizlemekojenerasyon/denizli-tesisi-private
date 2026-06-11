/**
 * VARDIYA BILDIRIMLERI - Google Apps Script Kodu
 *
 * Kurulum:
 * 1. Google Sheets > Extensions > Apps Script acin.
 * 2. Bu kodu yapistirin.
 * 3. Deploy > New deployment > Web app.
 * 4. Execute as: Me, Who has access: Anyone secin.
 * 5. /exec URL'ini js/bildirim-sheets.js icindeki WEB_APP_URL alanina yazin.
 */

var ANNOUNCEMENTS_SHEET_NAME = 'VardiyaBildirimleri';
var ANNOUNCEMENT_HEADERS = [
  'ID', 'Baslangic Tarihi', 'Bitis Tarihi', 'Vardiya', 'Metin', 'Kategori',
  'Oncelik', 'Hedef', 'Aktif', 'Ek URL', 'Ek Adi', 'Okuyanlar',
  'Olusturan', 'Olusturma Zamani', 'Guncelleme Zamani', 'Sayfa Hedefi',
  'Tamamlayanlar', 'Tamamlandi'
];
var SYSTEM_LOGS_SHEET_NAME = 'SistemLoglari';
var SYSTEM_LOG_HEADERS = [
  'Kayit Zamani', 'Tarih', 'Saat', 'Modul', 'Eksik Kayit',
  'Otomatik Kayit Sonucu', 'Mail Sonucu', 'Hata Mesaji', 'Detay'
];

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action;
  var lock = null;
  var lockAcquired = false;
  try {
    if (isBildirimWriteAction(action)) {
      lock = LockService.getScriptLock();
      lockAcquired = lock.tryLock(15000);
      if (!lockAcquired) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          retryable: true,
          busy: true,
          action: action || '',
          error: 'Bildirim sistemi mesgul; islem tekrar denenebilir'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var result = {};

    switch (action) {
      case 'getAnnouncements':
        result = getAnnouncements(params);
        break;
      case 'addAnnouncement':
        result = addAnnouncement(params);
        break;
      case 'updateAnnouncement':
        result = updateAnnouncement(params);
        break;
      case 'deleteAnnouncement':
        result = deleteAnnouncement(params.id);
        break;
      case 'setAnnouncementActive':
        result = setAnnouncementActive(params.id, params.active);
        break;
      case 'clearInactiveAnnouncements':
        result = clearInactiveAnnouncements();
        break;
      case 'markAnnouncementRead':
        result = markAnnouncementRead(params);
        break;
      case 'completeAnnouncement':
        result = completeAnnouncement(params);
        break;
      case 'addSystemLog':
        result = addSystemLog(params);
        break;
      case 'getSystemLogs':
        result = getSystemLogs(parseInt(params.count, 10) || 100);
        break;
      case 'sendDailySystemReport':
        result = sendDailySystemReport(params);
        break;
      case 'getDailySystemReportPreview':
        result = getDailySystemReportPreview(params);
        break;
      case 'installDailySystemReportTrigger':
        result = installDailySystemReportTrigger();
        break;
      case 'getDailySystemReportTriggerHealth':
        result = getDailySystemReportTriggerHealth();
        break;
      case 'installVgenPlanDailyTrigger':
        result = runOptionalVgenFunction_('installVgenPlanDailyTrigger');
        break;
      case 'getVgenPlanTriggerHealth':
        result = getVgenPlanTriggerHealth();
        break;
      case 'testVgenPlanPreview':
        result = runOptionalVgenFunction_('testVgenPlanPreview');
        break;
      case 'checkVgenPlanSetup':
        result = runOptionalVgenFunction_('checkVgenPlanSetup');
        break;
      case 'setupVgenPlanAllDayNotification':
        result = runOptionalVgenFunction_('setupVgenPlanAllDayNotification');
        break;
      case 'makeExistingVgenPlanAnnouncementsAllDay':
        result = runOptionalVgenFunction_('makeExistingVgenPlanAnnouncementsAllDay');
        break;
      case 'testVgenAccessTokenRefresh':
        result = runOptionalVgenFunction_('testVgenAccessTokenRefresh');
        break;
      case 'testVgenPlanFetchOnly':
        result = runOptionalVgenFunction_('testVgenPlanFetchOnly');
        break;
      case 'runVgenTomorrowPlanNotification':
        result = runOptionalVgenFunction_('runVgenTomorrowPlanNotification');
        break;
      default:
        result = { success: false, error: 'Gecersiz islem' };
    }

    if (lockAcquired) lock.releaseLock();
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (lockError) {}
    }
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function isBildirimWriteAction(action) {
  return [
    'addAnnouncement',
    'updateAnnouncement',
    'deleteAnnouncement',
    'setAnnouncementActive',
    'clearInactiveAnnouncements',
    'markAnnouncementRead',
    'completeAnnouncement',
    'addSystemLog',
    'sendDailySystemReport',
    'installDailySystemReportTrigger',
    'installVgenPlanDailyTrigger',
    'makeExistingVgenPlanAnnouncementsAllDay',
    'testVgenAccessTokenRefresh',
    'testVgenPlanPreview',
    'runVgenTomorrowPlanNotification'
  ].indexOf(action) !== -1;
}

function runOptionalVgenFunction_(functionName) {
  try {
    var fn = (typeof globalThis !== 'undefined' && globalThis[functionName]) || this[functionName];
    if (typeof fn !== 'function') {
      return {
        success: false,
        error: functionName + ' fonksiyonu bu Apps Script projesinde bulunamadi. VGenPlanBildirimi.gs dosyasini projeye ekleyin.'
      };
    }
    return fn();
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getOrCreateAnnouncementsSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(ANNOUNCEMENTS_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(ANNOUNCEMENTS_SHEET_NAME);
    sheet.appendRow(ANNOUNCEMENT_HEADERS);

    var headerRange = sheet.getRange(1, 1, 1, ANNOUNCEMENT_HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#2563eb');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 110);
    sheet.setColumnWidth(3, 90);
    sheet.setColumnWidth(5, 420);
    sheet.setColumnWidth(10, 260);
    sheet.setColumnWidth(12, 260);
    sheet.getRange(2, 1, 1000, ANNOUNCEMENT_HEADERS.length).setNumberFormat('@');
  } else {
    migrateAnnouncementsSheet(sheet);
  }

  return sheet;
}

function migrateAnnouncementsSheet(sheet) {
  var lastColumn = sheet.getLastColumn();
  var currentHeaders = sheet.getRange(1, 1, 1, Math.max(lastColumn, 1)).getDisplayValues()[0];
  if (currentHeaders[1] === 'Baslangic Tarihi' && lastColumn < ANNOUNCEMENT_HEADERS.length && lastColumn >= 16) {
    for (var addCol = lastColumn + 1; addCol <= ANNOUNCEMENT_HEADERS.length; addCol++) {
      sheet.getRange(1, addCol).setValue(ANNOUNCEMENT_HEADERS[addCol - 1]);
      if (sheet.getLastRow() > 1 && addCol === 18) {
        sheet.getRange(2, addCol, sheet.getLastRow() - 1, 1).setValue('FALSE');
      }
    }
    sheet.getRange(2, 1, Math.max(1000, sheet.getLastRow()), ANNOUNCEMENT_HEADERS.length).setNumberFormat('@');
    return;
  }
  if (currentHeaders[1] === 'Baslangic Tarihi' && lastColumn === ANNOUNCEMENT_HEADERS.length - 1) {
    sheet.getRange(1, ANNOUNCEMENT_HEADERS.length).setValue('Sayfa Hedefi');
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, ANNOUNCEMENT_HEADERS.length, sheet.getLastRow() - 1, 1).setValue('all');
    }
    sheet.getRange(2, 1, Math.max(1000, sheet.getLastRow()), ANNOUNCEMENT_HEADERS.length).setNumberFormat('@');
    return;
  }
  if (currentHeaders[1] === 'Baslangic Tarihi' && lastColumn >= ANNOUNCEMENT_HEADERS.length) return;

  var lastRow = sheet.getLastRow();
  var oldRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, Math.min(lastColumn, 10)).getDisplayValues() : [];
  var migratedRows = oldRows.map(function(row) {
    return [
      row[0], row[1], '', row[2], row[3], 'general', row[4] || 'normal',
      row[5] || 'all', row[6], '', '', '', row[7], row[8], row[9], 'all', '', 'FALSE'
    ];
  });

  sheet.clear();
  sheet.appendRow(ANNOUNCEMENT_HEADERS);
  if (migratedRows.length > 0) {
    sheet.getRange(2, 1, migratedRows.length, ANNOUNCEMENT_HEADERS.length).setValues(migratedRows);
  }

  var headerRange = sheet.getRange(1, 1, 1, ANNOUNCEMENT_HEADERS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2563eb');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  sheet.getRange(2, 1, Math.max(1000, migratedRows.length + 1), ANNOUNCEMENT_HEADERS.length).setNumberFormat('@');
}

function getAnnouncements(params) {
  try {
    var sheet = getOrCreateAnnouncementsSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: true, data: [] };
    }

    var rows = sheet.getRange(2, 1, lastRow - 1, ANNOUNCEMENT_HEADERS.length).getDisplayValues();
    var onlyActive = String(params.active || '').toLowerCase() === 'true';
    var dateFilter = params.date || '';
    var shiftFilter = params.shift || '';

    var data = rows.map(rowToAnnouncement).filter(function(item) {
      if (onlyActive && item.active === false) return false;
      if (dateFilter && item.startDate && item.startDate !== dateFilter) return false;
      if (shiftFilter && item.shift && item.shift !== shiftFilter) return false;
      return true;
    });

    data.sort(function(a, b) {
      return String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt));
    });

    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function addAnnouncement(data) {
  try {
    var sheet = getOrCreateAnnouncementsSheet();
    var now = formatDateTimeTR(new Date());
    var id = data.id || createAnnouncementId();

    if (!data.title && !data.message) {
      return { success: false, error: 'Bildirim metni zorunludur' };
    }

    var attachment = saveAttachmentIfNeeded(data);

    sheet.appendRow([
      id,
      normalizeDate(data.startDate || data.date || ''),
      normalizeDate(data.endDate || ''),
      data.shift || '',
      data.title || data.message || '',
      data.category || 'general',
      data.priority || 'normal',
      data.target || 'all',
      normalizeActive(data.active),
      attachment.url || data.attachmentUrl || '',
      attachment.name || data.attachmentName || '',
      '',
      data.createdBy || 'Admin',
      data.createdAt || now,
      now,
      data.pageTarget || 'all',
      '',
      'FALSE'
    ]);

    formatAnnouncementRow(sheet, sheet.getLastRow());
    return { success: true, data: getAnnouncementById(id), message: 'Bildirim eklendi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateAnnouncement(data) {
  try {
    if (!data.id) return { success: false, error: 'ID zorunludur' };
    var sheet = getOrCreateAnnouncementsSheet();
    var row = findRowById(sheet, data.id);
    if (!row) return { success: false, error: 'Bildirim bulunamadi' };

    var existing = rowToAnnouncement(sheet.getRange(row, 1, 1, ANNOUNCEMENT_HEADERS.length).getDisplayValues()[0]);
    var now = formatDateTimeTR(new Date());
    var attachment = saveAttachmentIfNeeded(data);

    var values = [[
      data.id,
      normalizeDate(data.startDate !== undefined ? data.startDate : (data.date !== undefined ? data.date : existing.startDate)),
      normalizeDate(data.endDate !== undefined ? data.endDate : existing.endDate),
      data.shift !== undefined ? data.shift : existing.shift,
      data.title || data.message || existing.title,
      data.category || existing.category || 'general',
      data.priority || existing.priority || 'normal',
      data.target || existing.target || 'all',
      normalizeActive(data.active !== undefined ? data.active : existing.active),
      attachment.url || data.attachmentUrl || existing.attachmentUrl || '',
      attachment.name || data.attachmentName || existing.attachmentName || '',
      existing.readByText || '',
      data.createdBy || existing.createdBy || 'Admin',
      existing.createdAt || now,
      now,
      data.pageTarget || existing.pageTarget || 'all',
      existing.completedByText || '',
      normalizeCompleted(data.completed !== undefined ? data.completed : existing.completed)
    ]];

    sheet.getRange(row, 1, 1, ANNOUNCEMENT_HEADERS.length).setValues(values);
    formatAnnouncementRow(sheet, row);
    return { success: true, data: getAnnouncementById(data.id), message: 'Bildirim guncellendi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function deleteAnnouncement(id) {
  try {
    var sheet = getOrCreateAnnouncementsSheet();
    var row = findRowById(sheet, id);
    if (!row) return { success: false, error: 'Bildirim bulunamadi' };
    sheet.deleteRow(row);
    return { success: true, message: 'Bildirim silindi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function setAnnouncementActive(id, active) {
  try {
    var sheet = getOrCreateAnnouncementsSheet();
    var row = findRowById(sheet, id);
    if (!row) return { success: false, error: 'Bildirim bulunamadi' };
    sheet.getRange(row, 9).setValue(normalizeActive(active));
    sheet.getRange(row, 15).setValue(formatDateTimeTR(new Date()));
    formatAnnouncementRow(sheet, row);
    return { success: true, data: getAnnouncementById(id), message: 'Durum guncellendi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function clearInactiveAnnouncements() {
  try {
    var sheet = getOrCreateAnnouncementsSheet();
    var lastRow = sheet.getLastRow();
    var deleted = 0;

    for (var row = lastRow; row >= 2; row--) {
      var active = String(sheet.getRange(row, 9).getDisplayValue()).toLowerCase();
      if (active === 'false' || active === 'pasif') {
        sheet.deleteRow(row);
        deleted++;
      }
    }

    return { success: true, deletedCount: deleted, message: deleted + ' pasif bildirim silindi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getAnnouncementById(id) {
  var sheet = getOrCreateAnnouncementsSheet();
  var row = findRowById(sheet, id);
  if (!row) return null;
  return rowToAnnouncement(sheet.getRange(row, 1, 1, ANNOUNCEMENT_HEADERS.length).getDisplayValues()[0]);
}

function findRowById(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return null;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return null;
}

function rowToAnnouncement(row) {
  var readByText = row[11] || '';
  var completedByText = row[16] || '';
  return {
    id: row[0],
    date: row[1],
    startDate: row[1],
    endDate: row[2],
    shift: row[3],
    title: row[4],
    message: row[4],
    category: row[5] || 'general',
    priority: row[6] || 'normal',
    target: row[7] || 'all',
    active: String(row[8]).toLowerCase() !== 'false' && String(row[8]).toLowerCase() !== 'pasif',
    attachmentUrl: row[9] || '',
    attachmentName: row[10] || '',
    readByText: readByText,
    readBy: parseReadBy(readByText),
    createdBy: row[12],
    createdAt: row[13],
    updatedAt: row[14],
    pageTarget: row[15] || 'all',
    completedByText: completedByText,
    completedBy: parseReadBy(completedByText),
    completed: String(row[17]).toLowerCase() === 'true' || String(row[17]).toLowerCase() === 'tamamlandi'
  };
}

function formatAnnouncementRow(sheet, row) {
  var range = sheet.getRange(row, 1, 1, ANNOUNCEMENT_HEADERS.length);
  range.setBorder(true, true, true, true, true, true, '#d9e2ef', SpreadsheetApp.BorderStyle.SOLID);
  range.setVerticalAlignment('middle');
  sheet.getRange(row, 5).setWrap(true);

  var priority = String(sheet.getRange(row, 7).getDisplayValue()).toLowerCase();
  var active = String(sheet.getRange(row, 9).getDisplayValue()).toLowerCase();
  var color = '#ffffff';
  if (active === 'false' || active === 'pasif') color = '#f1f5f9';
  else if (priority === 'high') color = '#fee2e2';
  else if (priority === 'medium') color = '#fef3c7';
  range.setBackground(color);
}

function markAnnouncementRead(data) {
  try {
    if (!data.id) return { success: false, error: 'ID zorunludur' };
    var sheet = getOrCreateAnnouncementsSheet();
    var row = findRowById(sheet, data.id);
    if (!row) return { success: false, error: 'Bildirim bulunamadi' };

    var reader = data.reader || data.email || 'Kullanici';
    var email = data.email || '';
    var key = email || reader;
    var existingText = sheet.getRange(row, 12).getDisplayValue();
    var entries = parseReadBy(existingText);
    var exists = entries.some(function(entry) {
      return entry.key === key;
    });

    if (!exists) {
      entries.push({
        key: key,
        reader: reader,
        email: email,
        readAt: formatDateTimeTR(new Date())
      });
      sheet.getRange(row, 12).setValue(stringifyReadBy(entries));
      sheet.getRange(row, 15).setValue(formatDateTimeTR(new Date()));
    }

    return { success: true, data: getAnnouncementById(data.id), message: 'Okundu olarak islendi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function completeAnnouncement(data) {
  try {
    if (!data.id) return { success: false, error: 'ID zorunludur' };
    var sheet = getOrCreateAnnouncementsSheet();
    var row = findRowById(sheet, data.id);
    if (!row) return { success: false, error: 'Bildirim bulunamadi' };

    var user = data.reader || data.email || data.completedBy || 'Kullanici';
    var email = data.email || '';
    var key = email || user;
    var entries = parseReadBy(sheet.getRange(row, 17).getDisplayValue());
    var exists = entries.some(function(entry) {
      return entry.key === key;
    });

    if (!exists) {
      entries.push({
        key: key,
        reader: user,
        email: email,
        readAt: formatDateTimeTR(new Date())
      });
    }

    sheet.getRange(row, 17).setValue(stringifyReadBy(entries));
    sheet.getRange(row, 18).setValue('TRUE');
    sheet.getRange(row, 15).setValue(formatDateTimeTR(new Date()));
    formatAnnouncementRow(sheet, row);

    return { success: true, data: getAnnouncementById(data.id), message: 'Bildirim tamamlandi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getOrCreateSystemLogsSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SYSTEM_LOGS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SYSTEM_LOGS_SHEET_NAME);
    sheet.appendRow(SYSTEM_LOG_HEADERS);
    var headerRange = sheet.getRange(1, 1, 1, SYSTEM_LOG_HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0f172a');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    sheet.getRange(2, 1, 1000, SYSTEM_LOG_HEADERS.length).setNumberFormat('@');
  }
  return sheet;
}

function addSystemLog(data) {
  try {
    var sheet = getOrCreateSystemLogsSheet();
    sheet.appendRow([
      formatDateTimeTR(new Date()),
      normalizeDate(data.tarih || data.date || ''),
      data.saat || data.hour || '',
      data.modul || data.module || '',
      data.eksikKayit || data.missing || '',
      data.otomatikKayitSonucu || data.autoResult || '',
      data.mailSonucu || data.mailResult || '',
      data.hataMesaji || data.error || '',
      data.detay || data.detail || ''
    ]);
    return { success: true, message: 'Sistem logu eklendi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getSystemLogs(count) {
  try {
    var sheet = getOrCreateSystemLogsSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, data: [] };
    var rowCount = Math.min(count || 100, lastRow - 1);
    var startRow = Math.max(2, lastRow - rowCount + 1);
    var rows = sheet.getRange(startRow, 1, rowCount, SYSTEM_LOG_HEADERS.length).getDisplayValues();
    var data = rows.map(function(row) {
      return {
        kayitZamani: row[0],
        tarih: row[1],
        saat: row[2],
        modul: row[3],
        eksikKayit: row[4],
        otomatikKayitSonucu: row[5],
        mailSonucu: row[6],
        hataMesaji: row[7],
        detay: row[8]
      };
    }).reverse();
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function sendDailySystemReport(data) {
  try {
    data = data || {};
    var reportDate = normalizeDate(data.tarih || data.date || getDailyReportTargetDate_());
    var props = PropertiesService.getScriptProperties();
    var reportKey = 'dailySystemReport:' + reportDate;

    if (props.getProperty(reportKey) && String(data.force || '').toLowerCase() !== 'true') {
      return { success: true, skipped: true, message: reportDate + ' raporu daha once gonderildi.' };
    }

    var report = buildDailySystemReport_(reportDate);
    if (!report.rowCount && String(data.sendEmpty || '').toLowerCase() !== 'true') {
      props.setProperty(reportKey, new Date().toISOString());
      return { success: true, skipped: true, rowCount: 0, message: reportDate + ' icin raporlanacak sistem logu yok.' };
    }

    var to = data.to || 'mrtcsk0320@gmail.com';
    MailApp.sendEmail({
      to: to,
      subject: 'Gunluk Sistem Raporu - ' + reportDate,
      body: report.body,
      htmlBody: report.body.replace(/\n/g, '<br>')
    });

    props.setProperty(reportKey, new Date().toISOString());
    addSystemLog({
      tarih: reportDate,
      modul: 'Merkezi Kontrol',
      eksikKayit: report.issueCount ? String(report.issueCount) + ' olay' : 'Yok',
      otomatikKayitSonucu: 'Gunluk rapor gonderildi',
      mailSonucu: 'Basarili',
      detay: 'Gunluk sistem raporu'
    });

    return { success: true, tarih: reportDate, rowCount: report.rowCount, issueCount: report.issueCount, to: to };
  } catch (error) {
    addSystemLog({
      modul: 'Merkezi Kontrol',
      otomatikKayitSonucu: 'Hata',
      mailSonucu: 'Basarisiz',
      hataMesaji: error.toString(),
      detay: 'sendDailySystemReport'
    });
    return { success: false, error: error.toString() };
  }
}

function getDailySystemReportPreview(data) {
  try {
    data = data || {};
    var reportDate = normalizeDate(data.tarih || data.date || getDailyReportTargetDate_());
    var report = buildDailySystemReport_(reportDate);
    return {
      success: true,
      tarih: reportDate,
      rowCount: report.rowCount,
      issueCount: report.issueCount,
      alarmSummary: report.alarmSummary,
      body: report.body
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function installDailySystemReportTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailySystemReport') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('sendDailySystemReport')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .nearMinute(20)
    .create();

  return { success: true, message: 'Gunluk sistem raporu tetikleyicisi 00:20 civarina kuruldu.' };
}

function getDailySystemReportTriggerHealth() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var matching = [];
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'sendDailySystemReport') {
        matching.push({
          handler: triggers[i].getHandlerFunction(),
          source: String(triggers[i].getTriggerSource()),
          eventType: String(triggers[i].getEventType())
        });
      }
    }

    var logs = getSystemLogs(1);
    return {
      success: true,
      installed: matching.length > 0,
      triggerCount: matching.length,
      triggers: matching,
      lastLog: logs.success && logs.data.length ? logs.data[0] : null,
      checkedAt: formatDateTimeTR(new Date())
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getVgenPlanTriggerHealth() {
  try {
    var handler = 'runVgenPlanNotification';
    var triggers = ScriptApp.getProjectTriggers();
    var matching = [];
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === handler) {
        matching.push({
          handler: triggers[i].getHandlerFunction(),
          source: String(triggers[i].getTriggerSource()),
          eventType: String(triggers[i].getEventType())
        });
      }
    }

    var setup = runOptionalVgenFunction_('checkVgenPlanSetup');
    var logs = getSystemLogs(20);
    var lastVgenLog = null;
    if (logs.success && logs.data && logs.data.length) {
      for (var j = 0; j < logs.data.length; j++) {
        if (String(logs.data[j].modul || '').indexOf('V-Gen') !== -1) {
          lastVgenLog = logs.data[j];
          break;
        }
      }
    }

    return {
      success: true,
      installed: matching.length > 0,
      triggerCount: matching.length,
      triggers: matching,
      setup: setup,
      lastLog: lastVgenLog,
      checkedAt: formatDateTimeTR(new Date())
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getDailyReportTargetDate_() {
  var date = new Date();
  date.setDate(date.getDate() - 1);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd.MM.yyyy');
}

function buildDailySystemReport_(reportDate) {
  var sheet = getOrCreateSystemLogsSheet();
  var lastRow = sheet.getLastRow();
  var moduleStats = {};
  var issueLines = [];
  var rowCount = 0;
  var issueCount = 0;
  var alarmSummary = { critical: 0, warning: 0, ok: 0 };

  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, SYSTEM_LOG_HEADERS.length).getDisplayValues();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var tarih = normalizeDate(row[1] || '');
      if (tarih !== reportDate) continue;

      rowCount++;
      var modul = row[3] || 'Bilinmeyen';
      if (!moduleStats[modul]) {
        moduleStats[modul] = { total: 0, missing: 0, autoSuccess: 0, errors: 0 };
      }

      moduleStats[modul].total++;
      if (row[4] && row[4] !== 'Yok') moduleStats[modul].missing++;
      if (String(row[5] || '').indexOf('Basarili') !== -1 || String(row[5] || '').indexOf('rapor gonderildi') !== -1) {
        moduleStats[modul].autoSuccess++;
      }
      var severity = getDailyReportSeverity_(row);
      alarmSummary[severity]++;
      if (severity === 'critical' || severity === 'warning') {
        moduleStats[modul].errors++;
        issueCount++;
        if (issueLines.length < 30) {
          issueLines.push('- ' + (row[2] || '--:--') + ' | ' + modul + ' | ' + (row[4] || '-') + ' | ' + (row[7] || row[5] || '-'));
        }
      }
    }
  }

  var moduleNames = Object.keys(moduleStats).sort();
  var body = 'Gunluk Sistem Raporu\n\n' +
    'Tarih: ' + reportDate + '\n' +
    'Toplam log: ' + rowCount + '\n' +
    'Dikkat gerektiren olay: ' + issueCount + '\n\n';

  body += 'Alarm Ozeti\n' +
    '- Kritik: ' + alarmSummary.critical + '\n' +
    '- Uyari: ' + alarmSummary.warning + '\n' +
    '- Basarili/normal: ' + alarmSummary.ok + '\n\n';

  body += 'Modul Ozeti\n';
  if (!moduleNames.length) {
    body += '- Log bulunamadi\n';
  } else {
    for (var j = 0; j < moduleNames.length; j++) {
      var name = moduleNames[j];
      var stat = moduleStats[name];
      body += '- ' + name +
        ': toplam ' + stat.total +
        ', eksik/otomatik olay ' + stat.missing +
        ', basarili ' + stat.autoSuccess +
        ', hata ' + stat.errors + '\n';
    }
  }

  body += '\nHata / Uyari Detayi\n';
  body += issueLines.length ? issueLines.join('\n') : '- Kritik hata veya uyari yok';

  return { body: body, rowCount: rowCount, issueCount: issueCount, alarmSummary: alarmSummary };
}

function getDailyReportSeverity_(row) {
  var text = [
    row[4] || '',
    row[5] || '',
    row[6] || '',
    row[7] || '',
    row[8] || ''
  ].join(' ').toLowerCase();

  if (text.indexOf('hata') !== -1 ||
      text.indexOf('basarisiz') !== -1 ||
      text.indexOf('kilitleme') !== -1 ||
      text.indexOf('exception') !== -1 ||
      text.indexOf('danger') !== -1) {
    return 'critical';
  }

  if (text.indexOf('warn') !== -1 ||
      text.indexOf('uyari') !== -1 ||
      text.indexOf('eksik') !== -1 ||
      text.indexOf('ertelendi') !== -1 ||
      text.indexOf('kontrol') !== -1) {
    return 'warning';
  }

  return 'ok';
}

function parseReadBy(value) {
  if (!value) return [];
  return String(value).split('||').filter(Boolean).map(function(part) {
    var pieces = part.split('|');
    return {
      key: pieces[0] || '',
      reader: pieces[1] || pieces[0] || '',
      email: pieces[2] || '',
      readAt: pieces[3] || ''
    };
  });
}

function stringifyReadBy(entries) {
  return entries.map(function(entry) {
    return [entry.key, entry.reader, entry.email, entry.readAt].join('|');
  }).join('||');
}

function saveAttachmentIfNeeded(data) {
  if (!data.attachmentData || !data.attachmentName) {
    return { url: '', name: '' };
  }

  var bytes = Utilities.base64Decode(data.attachmentData);
  var blob = Utilities.newBlob(bytes, data.attachmentType || 'application/octet-stream', data.attachmentName);
  var file = DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    url: file.getUrl(),
    name: file.getName()
  };
}

function createAnnouncementId() {
  return 'ann-' + new Date().getTime() + '-' + Math.floor(Math.random() * 100000);
}

function normalizeActive(value) {
  if (value === false) return 'FALSE';
  var text = String(value);
  return (text.toLowerCase() === 'false' || text.toLowerCase() === 'pasif') ? 'FALSE' : 'TRUE';
}

function normalizeCompleted(value) {
  return (value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'tamamlandi') ? 'TRUE' : 'FALSE';
}

function normalizeDate(value) {
  if (!value) return '';
  if (String(value).indexOf('.') !== -1) return String(value);
  var parts = String(value).split('-');
  return parts.length === 3 ? parts[2] + '.' + parts[1] + '.' + parts[0] : String(value);
}

function formatDateTimeTR(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
}
