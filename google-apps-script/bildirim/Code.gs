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

  var action = String(params.action || '').trim();

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

      case '':

      case 'health':

      case 'pingBildirim':

        result = {

          success: true,

          service: 'Bildirim VGen',

          message: 'Bildirim API calisiyor',

          checkedAt: new Date().toISOString(),

          availableActions: [

            'getAnnouncements',

            'addAnnouncement',

            'updateAnnouncement',

            'deleteAnnouncement',

            'setAnnouncementActive',

            'getSystemLogs',

            'sendDailySystemReport',

            'getDailySystemReportPreview',

            'installVgenPlanDailyTrigger',

            'getVgenPlanTriggerHealth',

            'checkVgenPlanSetup',

            'runVgenTomorrowPlanNotification'

          ]

        };

        break;

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

        result = runOptionalVgenFunction_('getVgenPlanTriggerHealth');

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

      htmlBody: report.htmlBody

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



    return {

      success: true,

      tarih: reportDate,

      rowCount: report.rowCount,

      issueCount: report.issueCount,

      alarmSummary: report.alarmSummary,

      summary: report.summary,

      to: to

    };

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

      summary: report.summary,

      moduleStats: report.moduleStats,

      missingData: report.missingData,

      autoActions: report.autoActions,

      repeatedErrors: report.repeatedErrors,

      alarmItems: report.alarmItems,

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

  var logs = [];

  var missingData = [];

  var autoActions = [];

  var alarmItems = [];

  var errorGroups = {};

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

      var log = mapDailyReportLog_(row);

      var modul = row[3] || 'Bilinmeyen';

      if (!moduleStats[modul]) {

        moduleStats[modul] = { total: 0, missing: 0, autoSuccess: 0, warning: 0, errors: 0 };

      }



      moduleStats[modul].total++;

      logs.push(log);

      if (isDailyReportMissingLog_(log)) {

        moduleStats[modul].missing++;

        missingData.push(log);

      }

      if (isDailyReportAutoAction_(log)) {

        moduleStats[modul].autoSuccess++;

        autoActions.push(log);

      }

      var severity = getDailyReportSeverity_(row);

      log.severity = severity;

      alarmSummary[severity]++;

      if (severity === 'critical' || severity === 'warning') {

        if (severity === 'critical') {

          moduleStats[modul].errors++;

          addDailyReportErrorGroup_(errorGroups, log);

        } else {

          moduleStats[modul].warning++;

        }

        issueCount++;

        alarmItems.push(buildDailyReportAlarmItem_(log));

      }

    }

  }



  var moduleNames = Object.keys(moduleStats).sort();

  var repeatedErrors = buildDailyReportRepeatedErrors_(errorGroups);

  var summary = {

    reportDate: reportDate,

    rowCount: rowCount,

    issueCount: issueCount,

    criticalCount: alarmSummary.critical,

    warningCount: alarmSummary.warning,

    okCount: alarmSummary.ok,

    missingCount: missingData.length,

    autoActionCount: autoActions.length,

    repeatedErrorCount: repeatedErrors.length,

    moduleCount: moduleNames.length

  };

  var report = {

    summary: summary,

    reportDate: reportDate,

    rowCount: rowCount,

    issueCount: issueCount,

    alarmSummary: alarmSummary,

    moduleStats: moduleStats,

    moduleNames: moduleNames,

    missingData: missingData.slice(0, 30),

    autoActions: autoActions.slice(0, 30),

    repeatedErrors: repeatedErrors.slice(0, 20),

    alarmItems: alarmItems.slice(0, 40)

  };

  report.body = buildDailySystemReportText_(report);

  report.htmlBody = buildDailySystemReportHtml_(report);

  return report;

}



function mapDailyReportLog_(row) {

  return {

    kayitZamani: row[0] || '',

    tarih: normalizeDate(row[1] || ''),

    saat: row[2] || '',

    modul: row[3] || 'Bilinmeyen',

    eksikKayit: row[4] || '',

    otomatikKayitSonucu: row[5] || '',

    mailSonucu: row[6] || '',

    hataMesaji: row[7] || '',

    detay: row[8] || '',

    severity: 'ok'

  };

}



function isDailyReportMissingLog_(log) {

  var missing = String(log.eksikKayit || '').trim().toLowerCase();

  return !!missing && missing !== '-' && missing !== 'yok' && missing !== '0';

}



function isDailyReportAutoAction_(log) {

  var text = String(log.otomatikKayitSonucu || '').toLowerCase();

  if (!text || text === '-' || text === 'bilinmiyor') return false;

  return text.indexOf('basarili') !== -1 ||

    text.indexOf('basarisiz') !== -1 ||

    text.indexOf('hata') !== -1 ||

    text.indexOf('gerekmedi') !== -1 ||

    text.indexOf('rapor') !== -1 ||

    text.indexOf('kuruldu') !== -1 ||

    text.indexOf('ertelendi') !== -1 ||

    text.indexOf('olusturuldu') !== -1 ||

    text.indexOf('eklendi') !== -1;

}



function addDailyReportErrorGroup_(groups, log) {

  var errorText = normalizeDailyReportErrorText_(log.hataMesaji || log.detay || log.otomatikKayitSonucu || 'Bilinmeyen hata');

  var key = log.modul + '|' + errorText;

  if (!groups[key]) {

    groups[key] = {

      modul: log.modul,

      error: errorText,

      count: 0,

      firstTime: log.kayitZamani || log.saat || '',

      lastTime: log.kayitZamani || log.saat || '',

      examples: []

    };

  }

  groups[key].count++;

  groups[key].lastTime = log.kayitZamani || log.saat || groups[key].lastTime;

  if (groups[key].examples.length < 3) {

    groups[key].examples.push(log.saat || log.kayitZamani || '-');

  }

}



function buildDailyReportRepeatedErrors_(groups) {

  var list = [];

  for (var key in groups) {

    if (!groups.hasOwnProperty(key)) continue;

    if (groups[key].count < 2) continue;

    list.push(groups[key]);

  }

  list.sort(function(a, b) {

    return b.count - a.count;

  });

  return list;

}



function normalizeDailyReportErrorText_(value) {

  var text = String(value || '').replace(/\s+/g, ' ').trim();

  if (!text) return 'Bilinmeyen hata';

  if (text.length > 180) return text.substring(0, 177) + '...';

  return text;

}



function buildDailyReportAlarmItem_(log) {

  return {

    level: log.severity === 'critical' ? 'danger' : 'warn',

    label: log.severity === 'critical' ? 'KIRMIZI' : 'SARI',

    time: log.saat || log.kayitZamani || '--:--',

    module: log.modul,

    title: log.eksikKayit || log.otomatikKayitSonucu || 'Sistem olayi',

    detail: log.hataMesaji || log.detay || log.mailSonucu || '-'

  };

}



function buildDailySystemReportText_(report) {

  var body = 'Gunluk Sistem Raporu\n\n' +

    'Tarih: ' + report.reportDate + '\n' +

    'Toplam log: ' + report.rowCount + '\n' +

    'Dikkat gerektiren olay: ' + report.issueCount + '\n\n';



  body += 'Gunluk Ozet\n' +

    '- Kritik alarm: ' + report.alarmSummary.critical + '\n' +

    '- Uyari: ' + report.alarmSummary.warning + '\n' +

    '- Normal/basarili: ' + report.alarmSummary.ok + '\n' +

    '- Eksik veri olayi: ' + report.summary.missingCount + '\n' +

    '- Otomatik mudahale: ' + report.summary.autoActionCount + '\n' +

    '- Tekrar eden hata: ' + report.summary.repeatedErrorCount + '\n\n';



  body += 'Eksik Veri Takibi\n';

  body += buildDailyReportTextList_(report.missingData, function(item) {

    return '- ' + (item.saat || '--:--') + ' | ' + item.modul + ' | ' + (item.eksikKayit || '-') + ' | ' + (item.otomatikKayitSonucu || '-');

  });



  body += '\nOtomatik Mudahale Ozeti\n';

  body += buildDailyReportTextList_(report.autoActions, function(item) {

    return '- ' + (item.saat || '--:--') + ' | ' + item.modul + ' | ' + (item.otomatikKayitSonucu || '-') + ' | ' + (item.detay || item.mailSonucu || '-');

  });



  body += '\nTekrar Eden Hata Analizi\n';

  body += buildDailyReportTextList_(report.repeatedErrors, function(item) {

    return '- ' + item.modul + ' | ' + item.count + ' kez | ' + item.error;

  });



  body += '\nRenkli Alarm Merkezi\n';

  body += buildDailyReportTextList_(report.alarmItems, function(item) {

    return '- [' + item.label + '] ' + item.time + ' | ' + item.module + ' | ' + item.title + ' | ' + item.detail;

  });



  body += '\nYoneticinin Gun Sonu Maili\n' +

    '- Bu rapor sistem loglarindan otomatik uretilmistir.\n' +

    '- Kritik veya tekrar eden hata varsa ilgili modulde Hata Mesaji sutunu kontrol edilmelidir.\n';



  return body;

}



function buildDailyReportTextList_(items, mapper) {

  if (!items || !items.length) return '- Kayit yok\n';

  var lines = [];

  for (var i = 0; i < items.length; i++) {

    lines.push(mapper(items[i]));

  }

  return lines.join('\n') + '\n';

}



function buildDailySystemReportHtml_(report) {

  return [

    '<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.45">',

    '<h2 style="margin:0 0 6px">Gunluk Sistem Raporu</h2>',

    '<p style="margin:0 0 14px;color:#64748b">Tarih: ', escapeHtml_(report.reportDate), '</p>',

    buildDailyReportHtmlSummary_(report),

    buildDailyReportHtmlSection_('Eksik Veri Takibi', report.missingData, function(item) {

      return escapeHtml_((item.saat || '--:--') + ' | ' + item.modul + ' | ' + (item.eksikKayit || '-') + ' | ' + (item.otomatikKayitSonucu || '-'));

    }),

    buildDailyReportHtmlSection_('Otomatik Mudahale Ozeti', report.autoActions, function(item) {

      return escapeHtml_((item.saat || '--:--') + ' | ' + item.modul + ' | ' + (item.otomatikKayitSonucu || '-') + ' | ' + (item.detay || item.mailSonucu || '-'));

    }),

    buildDailyReportHtmlSection_('Tekrar Eden Hata Analizi', report.repeatedErrors, function(item) {

      return escapeHtml_(item.modul + ' | ' + item.count + ' kez | ' + item.error);

    }),

    buildDailyReportHtmlAlarmSection_(report.alarmItems),

    '<p style="margin-top:16px;color:#64748b">Bu rapor sistem loglarindan otomatik uretilmistir.</p>',

    '</div>'

  ].join('');

}



function buildDailyReportHtmlSummary_(report) {

  var cards = [

    ['Kritik', report.alarmSummary.critical, '#dc2626'],

    ['Uyari', report.alarmSummary.warning, '#d97706'],

    ['Normal', report.alarmSummary.ok, '#16a34a'],

    ['Eksik Veri', report.summary.missingCount, '#2563eb'],

    ['Otomatik Mudahale', report.summary.autoActionCount, '#2563eb'],

    ['Tekrar Eden Hata', report.summary.repeatedErrorCount, '#dc2626']

  ];

  var html = '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0">';

  for (var i = 0; i < cards.length; i++) {

    html += '<div style="border:1px solid #d7e0ec;border-left:4px solid ' + cards[i][2] + ';border-radius:8px;padding:10px;background:#f8fafc">' +

      '<span style="display:block;color:#64748b;font-size:12px;font-weight:bold">' + escapeHtml_(cards[i][0]) + '</span>' +

      '<strong style="font-size:22px">' + escapeHtml_(cards[i][1]) + '</strong>' +

      '</div>';

  }

  html += '</div>';

  return html;

}



function buildDailyReportHtmlSection_(title, items, mapper) {

  var html = '<h3 style="margin:16px 0 8px">' + escapeHtml_(title) + '</h3>';

  if (!items || !items.length) {

    return html + '<p style="margin:0;color:#64748b">Kayit yok.</p>';

  }

  html += '<ul style="margin:0;padding-left:18px">';

  for (var i = 0; i < items.length; i++) {

    html += '<li style="margin-bottom:6px">' + mapper(items[i]) + '</li>';

  }

  html += '</ul>';

  return html;

}



function buildDailyReportHtmlAlarmSection_(items) {

  var html = '<h3 style="margin:16px 0 8px">Renkli Alarm Merkezi</h3>';

  if (!items || !items.length) {

    return html + '<p style="margin:0;color:#16a34a">Aktif alarm yok.</p>';

  }

  for (var i = 0; i < items.length; i++) {

    var item = items[i];

    var color = item.level === 'danger' ? '#dc2626' : '#d97706';

    var bg = item.level === 'danger' ? '#fef2f2' : '#fffbeb';

    html += '<div style="border:1px solid #d7e0ec;border-left:5px solid ' + color + ';background:' + bg + ';border-radius:8px;padding:10px;margin-bottom:8px">' +

      '<strong>' + escapeHtml_(item.label + ' | ' + item.module + ' | ' + item.title) + '</strong>' +

      '<p style="margin:4px 0 0;color:#64748b">' + escapeHtml_(item.time + ' - ' + item.detail) + '</p>' +

      '</div>';

  }

  return html;

}



function escapeHtml_(value) {

  return String(value === null || value === undefined ? '' : value)

    .replace(/&/g, '&amp;')

    .replace(/</g, '&lt;')

    .replace(/>/g, '&gt;')

    .replace(/"/g, '&quot;')

    .replace(/'/g, '&#39;');

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

      text.indexOf('mesgul') !== -1 ||

      text.indexOf('busy') !== -1) {

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

