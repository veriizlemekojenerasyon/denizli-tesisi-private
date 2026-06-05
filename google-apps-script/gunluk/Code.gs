/**
 * GUNLUK VERI GIRISI - Google Apps Script Kodu
 * Tarayici acik olmasa bile gun sonu mail kontrolu calisir.
 */

var GUNLUK_EMAIL_TO = 'mrtcsk0320@gmail.com';
var GUNLUK_SHIFT_NOTIFICATION_HOUR = 15;
var GUNLUK_SHIFT_NOTIFICATION_MINUTE = 50;
var GUNLUK_BILDIRIM_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwyDx3x8B28pDAd9ala4WfC40DlNPyqTmc9wUfV8Dxd_Ux7Pvq_PZmE1hTkdUSqR5P-/exec';
var ANNOUNCEMENTS_SHEET_NAME = 'VardiyaBildirimleri';
var ANNOUNCEMENT_HEADERS = [
  'ID', 'Baslangic Tarihi', 'Bitis Tarihi', 'Vardiya', 'Metin', 'Kategori',
  'Oncelik', 'Hedef', 'Aktif', 'Ek URL', 'Ek Adi', 'Okuyanlar',
  'Olusturan', 'Olusturma Zamani', 'Guncelleme Zamani', 'Sayfa Hedefi',
  'Tamamlayanlar', 'Tamamlandi'
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

  try {
    if (isWriteAction(action)) {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    }

    var result = {};

    switch (action) {
      case 'addRecord':
        result = addRecord(params);
        break;
      case 'updateRecord':
        result = updateRecord(params);
        break;
      case 'getRecords':
        result = getRecords();
        break;
      case 'getLastRecords':
        result = getLastRecords(parseInt(params.count, 10) || 32);
        break;
      case 'sendEmail':
        result = sendEmailAlert(params);
        break;
      case 'checkHourlyMissingRecords':
        result = checkHourlyMissingRecords(params);
        break;
      case 'installHourlyMissingRecordTrigger':
        result = installHourlyMissingRecordTrigger();
        break;
      case 'getTriggerHealth':
        result = getTriggerHealth();
        break;
      case 'getSystemLogs':
        result = getSystemLogs(parseInt(params.count, 10) || 100);
        break;
      default:
        result = { success: false, error: 'Gecersiz islem' };
    }

    if (lock) lock.releaseLock();

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    if (lock) lock.releaseLock();
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function isWriteAction(action) {
  return ['addRecord', 'updateRecord', 'sendEmail', 'checkHourlyMissingRecords', 'installHourlyMissingRecordTrigger'].indexOf(action) !== -1;
}

function getGunlukSheet(createIfMissing) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName('GunlukVeriler');
  if (!sheet && createIfMissing) {
    sheet = spreadsheet.insertSheet('GunlukVeriler');
    sheet.appendRow([
      'ID', 'Tarih', 'Yag Seviyesi (LT)', 'Kuplaj (MWH)',
      'GM-1 (MWH)', 'GM-2 (MWH)', 'GM-3 (MWH)',
      'Ic Ihtiyac (MWH)', 'Redresor-1 (MWH)', 'Redresor-2 (MWH)',
      'Kojen Ic Ihtiyac (KWH)', 'Servis Trafo (MWH)',
      'Kaydeden', 'Kayit Tarihi', 'Duzeltme Aciklamasi'
    ]);
    var headerRange = sheet.getRange(1, 1, 1, 15);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#3498db');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, 1000, 2).setNumberFormat('@');
    sheet.getRange(2, 3, 1000, 10).setNumberFormat('0.00');
    sheet.getRange(2, 13, 1000, 3).setNumberFormat('@');
  }
  return sheet;
}

function getGunlukHistorySheet(createIfMissing) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName('GunlukVeriler_Gecmis');
  if (!sheet && createIfMissing) {
    sheet = spreadsheet.insertSheet('GunlukVeriler_Gecmis');
    sheet.appendRow([
      'Orjinal ID', 'Tarih', 'Yag Seviyesi (LT)', 'Kuplaj (MWH)',
      'GM-1 (MWH)', 'GM-2 (MWH)', 'GM-3 (MWH)',
      'Ic Ihtiyac (MWH)', 'Redresor-1 (MWH)', 'Redresor-2 (MWH)',
      'Kojen Ic Ihtiyac (KWH)', 'Servis Trafo (MWH)',
      'Kaydeden', 'Kayit Tarihi', 'Duzeltme Tarihi', 'Duzelten Kullanici'
    ]);
    var headerRange = sheet.getRange(1, 1, 1, 16);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#9b59b6');
    headerRange.setFontColor('#ffffff');
  }
  return sheet;
}

function formatDateTR(dateString) {
  if (!dateString) return '';
  var parts = String(dateString).split('-');
  if (parts.length === 3) {
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  return String(dateString);
}

function formatDateTimeTR(date) {
  var d = new Date(date || new Date());
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var year = d.getFullYear();
  var hours = String(d.getHours()).padStart(2, '0');
  var minutes = String(d.getMinutes()).padStart(2, '0');
  var seconds = String(d.getSeconds()).padStart(2, '0');
  return day + '.' + month + '.' + year + ' ' + hours + ':' + minutes + ':' + seconds;
}

function addRecord(data) {
  try {
    var sheet = getGunlukSheet(true);
    var lastRow = sheet.getLastRow();
    var nextID = 1;
    var formattedTarih = formatDateTR(data.tarih);

    if (lastRow > 1) {
      var dates = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < dates.length; i++) {
        if (String(dates[i][0] || '').trim() === formattedTarih) {
          return { success: false, error: 'Bu tarih icin kayit zaten var! Duzenleme yapin.' };
        }
      }

      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      var maxID = 0;
      for (var j = 0; j < ids.length; j++) {
        var idNum = parseInt(ids[j][0], 10) || 0;
        if (idNum > maxID) maxID = idNum;
      }
      nextID = maxID + 1;
    }

    sheet.appendRow([
      String(nextID),
      formattedTarih,
      parseFloat(data.yagSeviyesi) || 0,
      parseFloat(data.kuplaj) || 0,
      parseFloat(data.gm1) || 0,
      parseFloat(data.gm2) || 0,
      parseFloat(data.gm3) || 0,
      parseFloat(data.icihtiyac) || 0,
      parseFloat(data.redresor1) || 0,
      parseFloat(data.redresor2) || 0,
      parseFloat(data.kojenIcihtiyac) || 0,
      parseFloat(data.servisTrafo) || 0,
      data.kaydeden || 'Admin',
      formatDateTimeTR(new Date()),
      data.aciklama || ''
    ]);

    var newRow = sheet.getLastRow();
    sheet.getRange(newRow, 1, 1, 15).setHorizontalAlignment('center');
    sheet.getRange(newRow, 1, 1, 15).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);

    return { success: true, message: 'Kayit basariyla eklendi! (ID: ' + nextID + ')' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateRecord(data) {
  try {
    var sheet = getGunlukSheet(false);
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: false, error: 'Kayit bulunamadi!' };
    }

    var targetTarih = formatDateTR(data.tarih);
    var dates = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getDisplayValues();
    var foundRow = -1;

    for (var i = 0; i < dates.length; i++) {
      if (String(dates[i][0] || '').trim() === targetTarih) {
        foundRow = i + 2;
        break;
      }
    }

    if (foundRow === -1) {
      return { success: false, error: 'Kayit bulunamadi!' };
    }

    var oldValues = sheet.getRange(foundRow, 1, 1, 14).getDisplayValues()[0];
    var historySheet = getGunlukHistorySheet(true);
    historySheet.appendRow([
      oldValues[0], oldValues[1], oldValues[2], oldValues[3], oldValues[4], oldValues[5],
      oldValues[6], oldValues[7], oldValues[8], oldValues[9], oldValues[10], oldValues[11],
      oldValues[12], oldValues[13], formatDateTimeTR(new Date()), data.duzeltenKullanici || 'Admin'
    ]);

    sheet.getRange(foundRow, 3).setValue(parseFloat(data.yagSeviyesi) || 0);
    sheet.getRange(foundRow, 4).setValue(parseFloat(data.kuplaj) || 0);
    sheet.getRange(foundRow, 5).setValue(parseFloat(data.gm1) || 0);
    sheet.getRange(foundRow, 6).setValue(parseFloat(data.gm2) || 0);
    sheet.getRange(foundRow, 7).setValue(parseFloat(data.gm3) || 0);
    sheet.getRange(foundRow, 8).setValue(parseFloat(data.icihtiyac) || 0);
    sheet.getRange(foundRow, 9).setValue(parseFloat(data.redresor1) || 0);
    sheet.getRange(foundRow, 10).setValue(parseFloat(data.redresor2) || 0);
    sheet.getRange(foundRow, 11).setValue(parseFloat(data.kojenIcihtiyac) || 0);
    sheet.getRange(foundRow, 12).setValue(parseFloat(data.servisTrafo) || 0);
    sheet.getRange(foundRow, 14).setValue(formatDateTimeTR(new Date()));
    sheet.getRange(foundRow, 15).setValue(data.aciklama || '');

    return { success: true, message: 'Kayit basariyla guncellendi!' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getRecords() {
  try {
    var sheet = getGunlukSheet(false);
    if (!sheet) return { success: true, data: [], message: 'Sayfa henuz olusturulmamis.' };
    if (sheet.getLastRow() < 2) return { success: true, data: [] };

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getDisplayValues();
    var records = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      records.push({
        id: rows[i][0],
        tarih: rows[i][1],
        yagSeviyesi: rows[i][2],
        kuplaj: rows[i][3],
        gm1: rows[i][4],
        gm2: rows[i][5],
        gm3: rows[i][6],
        icihtiyac: rows[i][7],
        redresor1: rows[i][8],
        redresor2: rows[i][9],
        kojenIcihtiyac: rows[i][10],
        servisTrafo: rows[i][11],
        kaydeden: rows[i][12],
        kayitTarihi: rows[i][13],
        aciklama: rows[i][14]
      });
    }

    return { success: true, data: records };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getLastRecords(count) {
  try {
    var result = getRecords();
    if (!result.success) return result;
    return {
      success: true,
      data: result.data.slice(0, count),
      total: result.data.length,
      message: result.message
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function findRecordByDate(tarih) {
  var targetTarih = formatDateTR(tarih);
  var result = getRecords();
  if (!result.success || !result.data) {
    return { success: !!result.success, found: false, record: null, error: result.error };
  }

  for (var i = 0; i < result.data.length; i++) {
    if (String(result.data[i].tarih || '').trim() === targetTarih) {
      return { success: true, found: true, record: result.data[i] };
    }
  }

  return { success: true, found: false, record: null };
}

function getDailyCheckTarget(date) {
  var now = new Date(date);
  var hour = now.getHours();
  var minute = now.getMinutes();
  var shiftNotificationReady =
    hour > GUNLUK_SHIFT_NOTIFICATION_HOUR ||
    (hour === GUNLUK_SHIFT_NOTIFICATION_HOUR && minute >= GUNLUK_SHIFT_NOTIFICATION_MINUTE);

  return {
    tarih: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd.MM.yyyy'),
    isoTarih: Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    shiftNotificationReady: shiftNotificationReady,
    shiftNotificationCheckTime: '15:50',
    finalMailReady: hour > 23 || (hour === 23 && minute >= 55)
  };
}

function checkHourlyMissingRecords(params) {
  try {
    var force = String((params && params.force) || '').toLowerCase() === 'true' ||
      String((params && params.force) || '') === '1';
    var target = getDailyCheckTarget(new Date());
    var shiftNotificationKey = 'gunlukShiftNotification:' + target.tarih;
    var finalMailKey = 'gunlukDailyCheck:' + target.tarih;
    var props = PropertiesService.getScriptProperties();

    if (!force && !target.shiftNotificationReady && !target.finalMailReady) {
      return { success: true, skipped: true, message: 'Gunluk kontrol saati henuz gelmedi' };
    }

    if (!force && props.getProperty(shiftNotificationKey) && (!target.finalMailReady || props.getProperty(finalMailKey))) {
      return { success: true, skipped: true, message: 'Bugunun eksik kayit kontrolleri daha once yapildi' };
    }

    var existing = findRecordByDate(target.isoTarih);
    if (!existing.success) {
      return { success: false, error: existing.error || 'Kayit kontrolu yapilamadi' };
    }

    if (existing.found) {
      props.setProperty(shiftNotificationKey, new Date().toISOString());
      if (target.finalMailReady) props.setProperty(finalMailKey, new Date().toISOString());
      addSystemLog({
        tarih: target.tarih,
        modul: 'Gunluk Veri',
        eksikKayit: 'Yok',
        otomatikKayitSonucu: 'Gerekmedi',
        mailSonucu: 'Gonderilmedi',
        detay: 'Gunluk kayit mevcut'
      });
      return { success: true, missing: false, mailed: false, message: 'Kayit mevcut' };
    }

    var notificationResult = { success: true, skipped: true, message: 'Bildirim daha once olusturuldu' };
    var shiftMailResult = { success: true, skipped: true, message: 'Bildirim maili daha once gonderildi' };
    var finalMailResult = { success: true, skipped: true, message: 'Gun sonu maili henuz gerekli degil' };

    if ((force || target.shiftNotificationReady) && (force || !props.getProperty(shiftNotificationKey))) {
      notificationResult = createMissingDailyRecordAnnouncement(target);

      if (notificationResult.success || notificationResult.duplicate) {
        shiftMailResult = sendMissingDailyRecordShiftMail(target, notificationResult);
        props.setProperty(shiftNotificationKey, new Date().toISOString());
      } else {
        shiftMailResult = {
          success: true,
          skipped: true,
          message: 'Merkezi bildirim olusmadigi icin vardiya maili gonderilmedi'
        };
      }

      addSystemLog({
        tarih: target.tarih,
        saat: target.shiftNotificationCheckTime,
        modul: 'Gunluk Veri',
        eksikKayit: '08-16 vardiyasinda gunluk kayit yok',
        otomatikKayitSonucu: notificationResult.success ? '16-24 vardiyasina bildirim olusturuldu' : 'Bildirim olusturulamadi',
        mailSonucu: shiftMailResult.skipped ? 'Gonderilmedi' : (shiftMailResult.success ? 'Basarili' : 'Basarisiz'),
        hataMesaji: notificationResult.success ? (shiftMailResult.success ? '' : shiftMailResult.error) : notificationResult.error,
        detay: 'Gunduz vardiyasi gunluk veri girmedigi icin 16-24 vardiyasina otomatik bildirim'
      });
    }

    if (target.finalMailReady && (force || !props.getProperty(finalMailKey))) {
      finalMailResult = sendMissingDailyRecordFinalMail(target);
      if (finalMailResult.success) {
        props.setProperty(finalMailKey, new Date().toISOString());
      }

      addSystemLog({
        tarih: target.tarih,
        saat: '23:55',
        modul: 'Gunluk Veri',
        eksikKayit: 'Gunluk kayit yok',
        otomatikKayitSonucu: 'Gun sonu mail uyarisi',
        mailSonucu: finalMailResult.success ? 'Basarili' : 'Basarisiz',
        hataMesaji: finalMailResult.success ? '' : finalMailResult.error,
        detay: 'Gun sonuna kadar gunluk veri girilmedigi icin mail uyarisi'
      });
    }

    return {
      success: true,
      missing: true,
      notification: notificationResult,
      shiftMail: shiftMailResult,
      finalMail: finalMailResult,
      message: notificationResult.success ? 'Bildirim olusturuldu' : 'Eksik kayit kontrolu tamamlandi'
    };
  } catch (error) {
    addSystemLog({
      modul: 'Gunluk Veri',
      otomatikKayitSonucu: 'Hata',
      mailSonucu: 'Bilinmiyor',
      hataMesaji: error.toString(),
      detay: 'checkHourlyMissingRecords'
    });
    return { success: false, error: error.toString() };
  }
}

function createMissingDailyRecordAnnouncement(target) {
  try {
    var id = 'auto-gunluk-eksik-' + target.isoTarih;
    var now = formatDateTimeTR(new Date());
    var title = target.tarih + ' tarihli gunluk veri girisi 08-16 vardiyasinda yapilmadi. 16-24 vardiyasi lutfen kaydi kontrol edip tamamlasin.';
    var record = {
      id: id,
      startDate: target.tarih,
      endDate: target.tarih,
      shift: '16-24',
      title: title,
      category: 'shift',
      priority: 'high',
      target: 'all',
      active: 'TRUE',
      createdBy: 'Otomatik Sistem',
      createdAt: now,
      pageTarget: 'all',
      completed: 'FALSE'
    };

    var webAppResult = addAnnouncementViaBildirimWebApp(record);
    if (webAppResult.success) {
      return { success: true, id: id, message: 'Bildirim web app uzerinden olusturuldu', data: webAppResult };
    }

    var localResult = upsertLocalMissingDailyAnnouncement(target, id, title, now);
    return {
      success: false,
      localBackup: localResult.success,
      id: id,
      error: 'Merkezi Bildirim Web App bildirimi olusturamadi: ' + (webAppResult.error || 'Bilinmeyen hata'),
      localMessage: localResult.message || '',
      localError: localResult.error || ''
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function upsertLocalMissingDailyAnnouncement(target, id, title, now) {
  try {
    var sheet = getOrCreateAnnouncementsSheet();
    var existingRow = findAnnouncementRowById(sheet, id);

    if (existingRow) {
      sheet.getRange(existingRow, 2).setValue(target.tarih);
      sheet.getRange(existingRow, 3).setValue(target.tarih);
      sheet.getRange(existingRow, 4).setValue('16-24');
      sheet.getRange(existingRow, 5).setValue(title);
      sheet.getRange(existingRow, 6).setValue('shift');
      sheet.getRange(existingRow, 7).setValue('high');
      sheet.getRange(existingRow, 8).setValue('all');
      sheet.getRange(existingRow, 9).setValue('TRUE');
      sheet.getRange(existingRow, 15).setValue(now);
      sheet.getRange(existingRow, 16).setValue('all');
      sheet.getRange(existingRow, 18).setValue('FALSE');
      return { success: true, duplicate: true, id: id, message: 'Yerel bildirim yedegi guncellendi' };
    }

    sheet.appendRow([
      id,
      target.tarih,
      target.tarih,
      '16-24',
      title,
      'shift',
      'high',
      'all',
      'TRUE',
      '',
      '',
      '',
      'Otomatik Sistem',
      now,
      now,
      'all',
      '',
      'FALSE'
    ]);

    return { success: true, id: id, message: 'Yerel bildirim yedegi olusturuldu' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function addAnnouncementViaBildirimWebApp(record) {
  var bildirimWebAppUrl = getBildirimWebAppUrl();
  if (!bildirimWebAppUrl) {
    return { success: false, error: 'Bildirim web app URL tanimli degil' };
  }

  try {
    var existingResponse = UrlFetchApp.fetch(
      bildirimWebAppUrl + '?action=getAnnouncements&active=true&date=' + encodeURIComponent(record.startDate),
      {
        method: 'get',
        muteHttpExceptions: true
      }
    );
    if (existingResponse.getResponseCode() >= 200 && existingResponse.getResponseCode() < 300) {
      var existingPayload = JSON.parse(existingResponse.getContentText() || '{}');
      var existingItems = existingPayload.data || [];
      for (var i = 0; i < existingItems.length; i++) {
        if (String(existingItems[i].id || '') === String(record.id)) {
          return { success: true, duplicate: true, data: existingItems[i], message: 'Bildirim zaten mevcut' };
        }
      }
    }

    var response = UrlFetchApp.fetch(bildirimWebAppUrl, {
      method: 'post',
      payload: Object.assign({ action: 'addAnnouncement' }, record),
      muteHttpExceptions: true
    });
    var text = response.getContentText();
    var result = JSON.parse(text || '{}');
    if (!result.success) {
      return { success: false, error: result.error || text || 'Bildirim web app basarisiz' };
    }
    return result;
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getBildirimWebAppUrl() {
  if (typeof getAppsScriptUrl === 'function') {
    return getAppsScriptUrl('bildirim') || GUNLUK_BILDIRIM_WEB_APP_URL;
  }
  return GUNLUK_BILDIRIM_WEB_APP_URL;
}

function sendMissingDailyRecordShiftMail(target, notificationResult) {
  var subject = 'Gunluk Veri Girisi Eksik - 16-24 Vardiyasina Bildirim Olusturuldu - ' + target.tarih;
  var body = 'Gunluk Veri Girisi Uyarisi\n\n' +
    'Tarih: ' + target.tarih + '\n' +
    'Kontrol: ' + target.shiftNotificationCheckTime + ' 08-16 vardiyasi bitis kontrolu\n\n' +
    'Gunluk veri kaydi 08-16 vardiyasinda girilmedi.\n' +
    'Otomatik bildirim sistemi 16-24 vardiyasina kritik bildirim olusturdu.\n\n' +
    'Bildirim durumu: ' + (notificationResult.success ? 'Olusturuldu' : 'Olusturulamadi') + '\n' +
    (notificationResult.error ? 'Hata: ' + notificationResult.error + '\n' : '') +
    '\nLutfen kaydin tamamlandigini kontrol edin.';

  return sendEmailAlert({ to: GUNLUK_EMAIL_TO, subject: subject, body: body });
}

function sendMissingDailyRecordFinalMail(target) {
  var subject = 'Gunluk Veri Girisi Uyarisi - ' + target.tarih + ' Kayit Girilmedi';
  var body = 'Gunluk Veri Girisi Uyarisi\n\n' +
    'Tarih: ' + target.tarih + '\n\n' +
    'Bugun icin gunluk veri kaydi gun sonuna kadar girilmedi.\n\n' +
    'Lutfen ilgili personeli bilgilendirin.';

  return sendEmailAlert({ to: GUNLUK_EMAIL_TO, subject: subject, body: body });
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
    sheet.getRange(2, 1, 1000, ANNOUNCEMENT_HEADERS.length).setNumberFormat('@');
    return sheet;
  }

  var lastColumn = sheet.getLastColumn();
  if (lastColumn < ANNOUNCEMENT_HEADERS.length) {
    for (var col = lastColumn + 1; col <= ANNOUNCEMENT_HEADERS.length; col++) {
      sheet.getRange(1, col).setValue(ANNOUNCEMENT_HEADERS[col - 1]);
    }
    sheet.getRange(2, 1, Math.max(1000, sheet.getLastRow()), ANNOUNCEMENT_HEADERS.length).setNumberFormat('@');
  }

  return sheet;
}

function findAnnouncementRowById(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return null;
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return null;
}

function getOrCreateSystemLogsSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName('SistemLoglari');
  var headers = ['Kayit Zamani', 'Tarih', 'Saat', 'Modul', 'Eksik Kayit', 'Otomatik Kayit Sonucu', 'Mail Sonucu', 'Hata Mesaji', 'Detay'];
  if (!sheet) {
    sheet = spreadsheet.insertSheet('SistemLoglari');
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0f172a');
    headerRange.setFontColor('#ffffff');
    sheet.getRange(2, 1, 1000, headers.length).setNumberFormat('@');
  }
  return sheet;
}

function addSystemLog(data) {
  try {
    var sheet = getOrCreateSystemLogsSheet();
    sheet.appendRow([
      formatDateTimeTR(new Date()),
      formatDateTR(data.tarih || data.date || ''),
      data.saat || data.hour || '',
      data.modul || data.module || 'Gunluk Veri',
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
    var rows = sheet.getRange(startRow, 1, rowCount, 9).getDisplayValues();
    var data = rows.map(function(row) {
      return { kayitZamani: row[0], tarih: row[1], saat: row[2], modul: row[3], eksikKayit: row[4], otomatikKayitSonucu: row[5], mailSonucu: row[6], hataMesaji: row[7], detay: row[8] };
    }).reverse();
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function installHourlyMissingRecordTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkHourlyMissingRecords') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('checkHourlyMissingRecords')
    .timeBased()
    .everyMinutes(5)
    .create();

  return { success: true, message: 'Gunluk eksik kayit mail tetikleyicisi kuruldu' };
}

function getTriggerHealth() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var matching = [];
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'checkHourlyMissingRecords') {
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

function sendEmailAlert(data) {
  try {
    if (!data) {
      return { success: false, error: 'Veri parametresi eksik' };
    }

    var to = data.to || 'mrtcsk0320@gmail.com';
    var subject = data.subject || 'Gunluk Veri Girisi Uyarisi';
    var body = data.body || '';

    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      htmlBody: body.replace(/\n/g, '<br>')
    });

    return { success: true, message: 'Mail basariyla gonderildi!' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
