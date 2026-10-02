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
      case 'fillMissingBuharDates':
      case 'fillMissingDateGaps':
        result = fillMissingBuharDates(params.startDate || params.baslangicTarihi, params.endDate || params.bitisTarihi, params.sendMail === 'true');
        break;
      case 'sortBuharRecords':
        result = sortBuharRecords();
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

    var callback = params.callback || '';
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    if (lock) lock.releaseLock();
    var callback2 = (e && e.parameter && e.parameter.callback) ? e.parameter.callback : '';
    var errJson = JSON.stringify({ success: false, error: error.toString() });
    if (callback2) {
      return ContentService.createTextOutput(callback2 + '(' + errJson + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(errJson)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function isWriteAction(action) {
  return [
    'addRecord',
    'sendEmail',
    'checkHourlyMissingRecords',
    'fillMissingBuharDates',
    'fillMissingDateGaps',
    'sortBuharRecords',
    'installHourlyMissingRecordTrigger'
  ].indexOf(action) !== -1;
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

function parseDateTR(value) {
  var text = normalizeDateTR(value);
  if (!text) return null;
  var parts = text.split('.');
  if (parts.length !== 3) return null;

  var day = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  var year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  return new Date(year, month - 1, day);
}

function formatDateTR(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd.MM.yyyy');
}

function getDefaultBuharEndDate() {
  var now = new Date();
  var target = new Date(now);
  target.setDate(target.getDate() - 1);
  return target;
}

function addRecord(data) {
  try {
    var sheet = getBuharSheet(true);
    var inputTarih = normalizeDateTR(data.tarih);

    if (!inputTarih) {
      return { success: false, error: 'Tarih zorunludur' };
    }

    // Buhar miktarı kontrolü — boş veya NaN gelirse reddet
    var buharMiktari = parseFloat(String(data.buharMiktari || '').replace(',', '.'));
    if (isNaN(buharMiktari) || String(data.buharMiktari || '').trim() === '') {
      return { success: false, error: 'Buhar miktari gecersiz veya bos.' };
    }

    // Mükerrer kayıt kontrolü
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var dates = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < dates.length; i++) {
        if (String(dates[i][0] || '').trim() === inputTarih) {
          return { success: false, error: 'Bu tarih icin kayit zaten var: ' + inputTarih };
        }
      }
    }

    var kayitTarihi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
    sheet.appendRow([
      inputTarih,
      buharMiktari,
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

    return { success: true, message: inputTarih + ' tarihi icin ' + buharMiktari.toFixed(2) + ' ton kayit edildi.' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getRecords() {
  try {
    var sheet = getBuharSheet(false);
    if (!sheet) return { success: true, data: [], message: 'Sayfa henuz olusturulmamis.' };
    if (sheet.getLastRow() < 2) return { success: true, data: [] };

    // getValues() kullan — getDisplayValues() Türkçe locale'de sayıları
    // "1.234,56" formatında döndürür, JS parseFloat bunu NaN yapar
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    var records = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var tarih    = rows[i][0];
      var miktar   = rows[i][1];
      var kaydeden = rows[i][2];
      var kayitZam = rows[i][3];

      // Tarih: Date objesi olabilir, string'e çevir
      if (tarih instanceof Date) {
        tarih = Utilities.formatDate(tarih, Session.getScriptTimeZone(), 'dd.MM.yyyy');
      } else {
        tarih = String(tarih || '').trim();
      }

      // Miktar: sayısal değeri direkt al, string ise parse et
      var miktarNum = (typeof miktar === 'number') ? miktar : parseFloat(String(miktar || '0').replace(',', '.'));
      if (isNaN(miktarNum)) miktarNum = 0;

      records.push({
        tarih       : tarih,
        buharMiktari: miktarNum,
        kaydeden    : String(kaydeden || '').trim(),
        kayitTarihi : (kayitZam instanceof Date)
                        ? Utilities.formatDate(kayitZam, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
                        : String(kayitZam || '').trim()
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
  var tz  = Session.getScriptTimeZone();

  // Bugünün tarihi (timezone farkına göre)
  var todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var today    = new Date(todayStr + 'T00:00:00');

  // Hedef: her zaman bugünden bir önceki gün
  var target = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  return {
    tarih   : Utilities.formatDate(target, tz, 'dd.MM.yyyy'),
    isoTarih: Utilities.formatDate(target, tz, 'yyyy-MM-dd')
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

function fillMissingBuharDates(startDate, endDate, sendMail) {
  try {
    var sheet = getBuharSheet(true);
    var lastRow = sheet.getLastRow();
    var existingDates = {};
    var existingDateObjects = [];

    if (lastRow > 1) {
      var dateValues = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      for (var i = 0; i < dateValues.length; i++) {
        var normalized = normalizeDateTR(dateValues[i][0]);
        var parsed = parseDateTR(normalized);
        if (!parsed) continue;
        existingDates[normalized] = true;
        existingDateObjects.push(parsed);
      }
    }

    var rangeStart = parseDateTR(startDate);
    var rangeEnd = parseDateTR(endDate);

    if (!rangeStart && existingDateObjects.length) {
      rangeStart = existingDateObjects[0];
      for (var s = 1; s < existingDateObjects.length; s++) {
        if (existingDateObjects[s].getTime() < rangeStart.getTime()) {
          rangeStart = existingDateObjects[s];
        }
      }
    }

    if (!rangeEnd) {
      rangeEnd = getDefaultBuharEndDate();
    }

    if (!rangeStart || !rangeEnd) {
      return {
        success: false,
        error: 'Baslangic tarihi bulunamadi. startDate parametresi verin. Ornek: startDate=13.05.2026'
      };
    }

    rangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
    rangeEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());

    if (rangeEnd.getTime() < rangeStart.getTime()) {
      return { success: false, error: 'Bitis tarihi baslangic tarihinden once olamaz' };
    }

    var rowsToAdd = [];
    var missingDates = [];
    var scannedDates = [];
    var kayitTarihi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
    var cursor = new Date(rangeStart.getTime());

    while (cursor.getTime() <= rangeEnd.getTime()) {
      var dateText = formatDateTR(cursor);
      scannedDates.push(dateText);
      if (!existingDates[dateText]) {
        missingDates.push(dateText);
        rowsToAdd.push([
          dateText,
          0,
          'OTOMATIK SISTEM',
          kayitTarihi
        ]);
        existingDates[dateText] = true;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (rowsToAdd.length) {
      var appendRow = sheet.getLastRow() + 1;
      sheet.getRange(appendRow, 1, rowsToAdd.length, 4).setValues(rowsToAdd);
      var addedRange = sheet.getRange(appendRow, 1, rowsToAdd.length, 4);
      addedRange.setHorizontalAlignment('center');
      addedRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(appendRow, 1, rowsToAdd.length, 1).setNumberFormat('@');
      sheet.getRange(appendRow, 2, rowsToAdd.length, 1).setNumberFormat('0.00');
      sheet.getRange(appendRow, 3, rowsToAdd.length, 2).setNumberFormat('@');
    }

    var sortResult = sortBuharRecords();
    var mailResult = { success: true, skipped: true };
    if (sendMail && missingDates.length) {
      mailResult = sendMissingBuharDatesMail(missingDates, rangeStart, rangeEnd);
    }

    addSystemLog({
      tarih: formatDateTR(rangeEnd),
      modul: 'Buhar',
      eksikKayit: missingDates.length ? missingDates.join(', ') : 'Yok',
      otomatikKayitSonucu: missingDates.length + ' eksik tarih dolduruldu',
      mailSonucu: sendMail ? (mailResult.success ? 'Basarili' : 'Basarisiz') : 'Gonderilmedi',
      hataMesaji: mailResult.success ? '' : mailResult.error,
      detay: 'Buhar eksik tarih tarama'
    });

    return {
      success: true,
      scannedDateCount: scannedDates.length,
      addedCount: missingDates.length,
      startDate: formatDateTR(rangeStart),
      endDate: formatDateTR(rangeEnd),
      addedDates: missingDates,
      skippedCount: scannedDates.length - missingDates.length,
      sort: sortResult,
      mail: mailResult
    };
  } catch (error) {
    addSystemLog({
      modul: 'Buhar',
      otomatikKayitSonucu: 'Hata',
      mailSonucu: 'Bilinmiyor',
      hataMesaji: error.toString(),
      detay: 'fillMissingBuharDates'
    });
    return { success: false, error: error.toString() };
  }
}

function sortBuharRecords() {
  try {
    var sheet = getBuharSheet(false);
    if (!sheet || sheet.getLastRow() < 3) {
      return { success: true, skipped: true, rowCount: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0 };
    }

    var rowCount = sheet.getLastRow() - 1;
    var range = sheet.getRange(2, 1, rowCount, 4);
    var values = range.getValues();
    var displayValues = range.getDisplayValues();
    var backgrounds = range.getBackgrounds();
    var fontColors = range.getFontColors();
    var rows = [];

    for (var i = 0; i < values.length; i++) {
      var date = parseDateTR(displayValues[i][0] || values[i][0]);
      rows.push({
        values: values[i],
        backgrounds: backgrounds[i],
        fontColors: fontColors[i],
        timestamp: date ? date.getTime() : Number.MAX_SAFE_INTEGER,
        originalIndex: i
      });
    }

    rows.sort(function(a, b) {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.originalIndex - b.originalIndex;
    });

    var sortedValues = [];
    var sortedBackgrounds = [];
    var sortedFontColors = [];
    for (var r = 0; r < rows.length; r++) {
      sortedValues.push(rows[r].values);
      sortedBackgrounds.push(rows[r].backgrounds);
      sortedFontColors.push(rows[r].fontColors);
    }

    range.setValues(sortedValues);
    range.setBackgrounds(sortedBackgrounds);
    range.setFontColors(sortedFontColors);
    range.setHorizontalAlignment('center');
    range.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, rowCount, 1).setNumberFormat('@');
    sheet.getRange(2, 2, rowCount, 1).setNumberFormat('0.00');
    sheet.getRange(2, 3, rowCount, 2).setNumberFormat('@');

    return { success: true, rowCount: rowCount };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function sendMissingBuharDatesMail(missingDates, startDate, endDate) {
  var subject = 'Buhar Verisi Eksik Tarihler Dolduruldu - ' + formatDateTR(startDate) + ' / ' + formatDateTR(endDate);
  var body = 'Buhar Verisi Eksik Tarih Taramasi\n\n' +
    'Baslangic: ' + formatDateTR(startDate) + '\n' +
    'Bitis: ' + formatDateTR(endDate) + '\n' +
    'Eklenen kayit sayisi: ' + missingDates.length + '\n\n' +
    '0 ton olarak otomatik eklenen tarihler:\n' +
    missingDates.join('\n');

  return sendEmailAlert({ subject: subject, body: body });
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
  // Mevcut trigger varsa sil
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkHourlyMissingRecords') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Her gün 01:00'de çalıştır — gece yarısını geçtikten sonra dünün kaydını kontrol eder
  // everyMinutes yerine günlük sabit saat: gecikme ve tarih kayması sorunu ortadan kalkar
  ScriptApp.newTrigger('checkHourlyMissingRecords')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .inTimezone(Session.getScriptTimeZone())
    .create();

  return { success: true, message: 'Buhar günlük eksik kayit tetikleyicisi kuruldu (her gün 08:00)' };
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

// ─── TEMİZLİK FONKSİYONU — bir kez çalıştırın, sonra silebilirsiniz ───────────

/**
 * BuharVerileri sayfasındaki bozuk kayıtları temizler:
 *   - Buhar miktarı boş, NaN veya negatif olan satırlar silinir
 *   - Aynı tarihe ait mükerrer satırlardan sadece EN YÜKSEK değerli olan kalır
 *     (hepsi 0/NaN ise sadece biri kalır)
 *   - Sonunda kayıtlar tarihe göre sıralanır
 *
 * Çalıştırmadan önce: Sheets'te BuharVerileri sayfasının yedeğini alın.
 */
function buharVerileriniTemizle() {
  var sheet = getBuharSheet(false);
  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log('Temizlenecek kayıt yok.');
    return { success: true, message: 'Kayıt yok.' };
  }

  var lastRow = sheet.getLastRow();
  var data    = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();

  // Tarih → satır bilgileri haritası
  var tarihMap = {}; // { 'dd.MM.yyyy': [ {miktar, kaydeden, kayitTarihi, rowIndex}, ... ] }

  for (var i = 0; i < data.length; i++) {
    var tarihHam  = String(data[i][0] || '').trim();
    var miktarHam = String(data[i][1] || '').trim();
    var kaydeden  = String(data[i][2] || '').trim();
    var kayitZam  = String(data[i][3] || '').trim();

    if (!tarihHam) continue; // tarihi olmayan satırı atla

    var tarih   = normalizeDateTR(tarihHam);
    var miktar  = parseFloat(miktarHam.replace(',', '.'));
    var gecerli = !isNaN(miktar) && miktar >= 0;

    if (!tarihMap[tarih]) tarihMap[tarih] = [];
    tarihMap[tarih].push({
      miktar    : gecerli ? miktar : -1,
      kaydeden  : kaydeden,
      kayitZaman: kayitZam,
      gecerli   : gecerli
    });
  }

  // Her tarih için en iyi kaydı seç
  var temizKayitlar = [];
  var tarihler = Object.keys(tarihMap).sort(function(a, b) {
    var da = parseDateTR(a), db = parseDateTR(b);
    if (!da || !db) return 0;
    return da.getTime() - db.getTime();
  });

  var silinenSatir = 0, kalinanSatir = 0;

  tarihler.forEach(function(tarih) {
    var satirlar = tarihMap[tarih];
    silinenSatir += satirlar.length - 1; // en iyi hariç hepsi silinir

    // Önce geçerli (NaN olmayan) olanı bul, yoksa ilkini al
    var enIyi = null;
    satirlar.forEach(function(s) {
      if (!enIyi) { enIyi = s; return; }
      if (s.gecerli && !enIyi.gecerli) { enIyi = s; return; }
      if (s.gecerli && enIyi.gecerli && s.miktar > enIyi.miktar) { enIyi = s; }
    });

    temizKayitlar.push([
      tarih,
      enIyi.gecerli ? enIyi.miktar : 0,
      enIyi.kaydeden,
      enIyi.kayitZaman || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
    ]);
    kalinanSatir++;
  });

  // Sayfayı temizleyip yeniden yaz
  var eski = sheet.getLastRow() - 1;
  if (eski > 0) sheet.getRange(2, 1, eski, 4).clearContent();

  if (temizKayitlar.length > 0) {
    sheet.getRange(2, 1, temizKayitlar.length, 4).setValues(temizKayitlar);
    var range = sheet.getRange(2, 1, temizKayitlar.length, 4);
    range.setHorizontalAlignment('center');
    range.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 1, temizKayitlar.length, 1).setNumberFormat('@');
    sheet.getRange(2, 2, temizKayitlar.length, 1).setNumberFormat('0.00');
    sheet.getRange(2, 3, temizKayitlar.length, 2).setNumberFormat('@');
  }

  var mesaj = 'Temizlendi: ' + eski + ' satır vardı → ' + kalinanSatir + ' kaldı, ' + silinenSatir + ' mükerrer/bozuk silindi.';
  Logger.log('✅ ' + mesaj);
  return { success: true, message: mesaj, onceki: eski, sonraki: kalinanSatir, silinen: silinenSatir };
}
