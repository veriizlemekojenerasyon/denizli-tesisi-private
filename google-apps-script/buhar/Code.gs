/**
 * BUHAR VERISI - Google Apps Script Kodu
 * Tarayici acik olmasa bile gunluk otomatik kayit ve mail uyarisi calisir.
 */

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
        result = checkHourlyMissingRecords();
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
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function isWriteAction(action) {
  return ['addRecord', 'sendEmail', 'checkHourlyMissingRecords', 'installHourlyMissingRecordTrigger'].indexOf(action) !== -1;
}

function getBuharSheet(createIfMissing) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName('BuharVerileri');
  if (!sheet && createIfMissing) {
    sheet = spreadsheet.insertSheet('BuharVerileri');
    sheet.appendRow(['Tarih', 'Buhar (Ton)', 'Kaydeden', 'Kayit Tarihi']);
    var headerRange = sheet.getRange(1, 1, 1, 4);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#3498db');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 180);
    sheet.getRange(2, 1, 1000, 1).setNumberFormat('@');
    sheet.getRange(2, 2, 1000, 1).setNumberFormat('0.00');
    sheet.getRange(2, 3, 1000, 2).setNumberFormat('@');
  }
  return sheet;
}

function normalizeDateTR(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  if (text.indexOf('-') !== -1) {
    var parts = text.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  return text;
}

function addRecord(data) {
  try {
    var sheet = getBuharSheet(true);
    var inputTarih = normalizeDateTR(data.tarih);

    if (!inputTarih) {
      return { success: false, error: 'Tarih zorunludur' };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var dates = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < dates.length; i++) {
        if (String(dates[i][0] || '').trim() === inputTarih) {
          return { success: false, error: 'Bu tarih icin kayit zaten var!' };
        }
      }
    }

    var kayitTarihi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
    sheet.appendRow([
      inputTarih,
      parseFloat(data.buharMiktari) || 0,
      data.kaydeden || 'Admin',
      kayitTarihi
    ]);

    var newRow = sheet.getLastRow();
    var dataRange = sheet.getRange(newRow, 1, 1, 4);
    dataRange.setHorizontalAlignment('center');
    dataRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(newRow, 1).setNumberFormat('@');
    sheet.getRange(newRow, 2).setNumberFormat('0.00');
    sheet.getRange(newRow, 3, 1, 2).setNumberFormat('@');

    return { success: true, message: 'Kayit basariyla eklendi!' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getRecords() {
  try {
    var sheet = getBuharSheet(false);
    if (!sheet) return { success: true, data: [], message: 'Sayfa henuz olusturulmamis.' };
    if (sheet.getLastRow() < 2) return { success: true, data: [] };

    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getDisplayValues();
    var records = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      records.push({
        tarih: rows[i][0],
        buharMiktari: rows[i][1],
        kaydeden: rows[i][2],
        kayitTarihi: rows[i][3]
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
  var normalized = normalizeDateTR(tarih);
  var result = getRecords();
  if (!result.success || !result.data) {
    return { success: !!result.success, found: false, record: null, error: result.error };
  }

  for (var i = 0; i < result.data.length; i++) {
    if (String(result.data[i].tarih || '').trim() === normalized) {
      return { success: true, found: true, record: result.data[i] };
    }
  }

  return { success: true, found: false, record: null };
}

function getPreviousDayTarget(date) {
  var now = new Date(date);
  if (now.getHours() < 23 || (now.getHours() === 23 && now.getMinutes() < 55)) {
    now.setDate(now.getDate() - 1);
  }

  var target = new Date(now);
  target.setDate(target.getDate() - 1);

  return {
    tarih: Utilities.formatDate(target, Session.getScriptTimeZone(), 'dd.MM.yyyy'),
    isoTarih: Utilities.formatDate(target, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };
}

function checkHourlyMissingRecords() {
  try {
    var target = getPreviousDayTarget(new Date());
    var sentKey = 'buharDailyCheck:' + target.tarih;
    var props = PropertiesService.getScriptProperties();

    if (props.getProperty(sentKey)) {
      return { success: true, skipped: true, message: 'Bu tarih daha once kontrol edildi' };
    }

    var existing = findRecordByDate(target.tarih);
    if (!existing.success) {
      return { success: false, error: existing.error || 'Kayit kontrolu yapilamadi' };
    }

    if (existing.found) {
      props.setProperty(sentKey, new Date().toISOString());
      addSystemLog({
        tarih: target.tarih,
        modul: 'Buhar',
        eksikKayit: 'Yok',
        otomatikKayitSonucu: 'Gerekmedi',
        mailSonucu: 'Gonderilmedi',
        detay: 'Gunluk buhar kaydi mevcut'
      });
      return { success: true, missing: false, added: false, message: 'Kayit mevcut' };
    }

    var addResult = addRecord({
      tarih: target.isoTarih,
      buharMiktari: '0',
      kaydeden: 'OTOMATIK SISTEM'
    });

    var subject = 'Buhar Verisi Uyarisi - ' + target.tarih + ' Deger Girilmedi';
    var body = 'Buhar Verisi Uyarisi\n\n' +
      'Tarih: ' + target.tarih + '\n\n' +
      target.tarih + ' icin buhar verisi girilmedi. Sistem otomatik bos kayit olusturdu.\n\n' +
      'Otomatik kayit sonucu: ' + (addResult.success ? 'Basarili' : addResult.error);
    var mailResult = sendEmailAlert({ subject: subject, body: body });

    if (addResult.success) {
      props.setProperty(sentKey, new Date().toISOString());
    }

    addSystemLog({
      tarih: target.tarih,
      modul: 'Buhar',
      eksikKayit: 'Gunluk buhar kaydi yok',
      otomatikKayitSonucu: addResult.success ? 'Basarili' : 'Basarisiz',
      mailSonucu: mailResult.success ? 'Basarili' : 'Basarisiz',
      hataMesaji: addResult.success ? (mailResult.success ? '' : mailResult.error) : addResult.error,
      detay: 'Tarayicidan bagimsiz otomatik buhar kaydi'
    });

    return {
      success: true,
      missing: true,
      added: addResult.success,
      addResult: addResult,
      mail: mailResult
    };
  } catch (error) {
    addSystemLog({
      modul: 'Buhar',
      otomatikKayitSonucu: 'Hata',
      mailSonucu: 'Bilinmiyor',
      hataMesaji: error.toString(),
      detay: 'checkHourlyMissingRecords'
    });
    return { success: false, error: error.toString() };
  }
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
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss'),
      data.tarih || data.date || '',
      data.saat || data.hour || '',
      data.modul || data.module || 'Buhar',
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

  return { success: true, message: 'Buhar gunluk eksik kayit tetikleyicisi kuruldu' };
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
      checkedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
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
    var subject = data.subject || 'Buhar Verisi Uyarisi';
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
