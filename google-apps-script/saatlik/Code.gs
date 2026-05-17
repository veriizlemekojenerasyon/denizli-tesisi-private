/**
 * SAATLIK VERI GIRISI - Google Apps Script Kodu
 * Bu dosya Google Sheets > Extensions > Apps Script'e yapıştırılacak
 * 
 * Özellikler:
 * - Otomatik sayfa ve tablo oluşturma
 * - TR tarih formatı (dd.MM.yyyy)
 * - Son 48 kayıt getirme
 * - Saat ve vardiya bazlı kayıt
 */

// CORS ayarları
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
      lock.waitLock(5000);
    }
    
    var result = {};
    
    switch(action) {
      case 'saveRecord':
        result = saveRecord(params);
        break;
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
        result = getLastRecords(parseInt(params.count) || 48);
        break;
      case 'getRecordByDateTime':
        result = getRecordByDateTime(params.tarih, params.saat);
        break;
      case 'sendEmail':
        result = sendEmailAlert(params);
        break;
      case 'checkHourlyMissingRecords':
        result = checkHourlyMissingRecords();
        break;
      case 'fillMissingRecordsForDate':
        result = fillMissingRecordsForDate(params.tarih, params.startSaat, params.endSaat);
        break;
      case 'fillMissingRecordGaps':
        result = fillMissingRecordGaps(params.tarih);
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
      case 'addSystemLog':
        result = addSystemLog(params);
        break;
      default:
        result = { success: false, error: 'Geçersiz işlem' };
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
  return ['saveRecord', 'addRecord', 'updateRecord', 'sendEmail', 'checkHourlyMissingRecords', 'fillMissingRecordsForDate', 'fillMissingRecordGaps', 'installHourlyMissingRecordTrigger', 'addSystemLog'].indexOf(action) !== -1;
}

function getSaatlikSheet(createIfMissing) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName('SaatlikVeriler');
  if (!sheet && createIfMissing) {
    sheet = createSaatlikSheet(spreadsheet);
  }
  return sheet;
}

function createSaatlikSheet(spreadsheet) {
  var sheet = spreadsheet.insertSheet('SaatlikVeriler');
  var headers = [
    'ID', 'Tarih', 'Saat', 'Vardiya',
    'Aktif Enerji (MWh)', 'Reaktif Enerji (kVArh)', 'Aydem Aktif (MWh)', 'Aydem Reaktif (kVArh)', 'Kaydeden', 'Notlar', 'Kayıt Tarihi'
  ];

  sheet.appendRow(headers);
  var headerRange = sheet.getRange(1, 1, 1, 11);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#3498db');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

  sheet.setColumnWidth(1, 60);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 140);
  sheet.setColumnWidth(6, 160);
  sheet.setColumnWidth(7, 140);
  sheet.setColumnWidth(8, 160);
  sheet.setColumnWidth(9, 120);
  sheet.setColumnWidth(10, 180);
  sheet.setColumnWidth(11, 140);

  sheet.getRange(2, 1, 1000, 4).setNumberFormat('@');
  sheet.getRange(2, 5, 1000, 4).setNumberFormat('0.000');
  sheet.getRange(2, 9, 1000, 3).setNumberFormat('@');
  return sheet;
}

function mapSaatlikRow(row) {
  return {
    id: row[0],
    tarih: row[1],
    saat: row[2],
    vardiya: row[3],
    aktifMwh: row[4],
    reaktifMwh: row[5],
    aydemAktif: row[6],
    aydemReaktif: row[7],
    kaydeden: row[8],
    notlar: row[9],
    kayitTarihi: row[10]
  };
}

function findSaatlikRowByDateTime(sheet, tarih, saat) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, 2, lastRow - 1, 2).getDisplayValues();
  var targetTarih = formatDateTR(tarih);
  var targetSaat = String(saat || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === targetTarih && String(values[i][1] || '').trim() === targetSaat) {
      return i + 2;
    }
  }
  return -1;
}

function saveRecord(data) {
  var sheet = getSaatlikSheet(true);
  var foundRow = findSaatlikRowByDateTime(sheet, data.tarih, data.saat);
  return foundRow === -1 ? addRecord(data) : updateRecord(data);
}

// Yeni kayıt ekle
function addRecord(data) {
  try {
    var sheet = getSaatlikSheet(true);
    
    // Aynı tarih ve saat için kayıt var mı kontrol et
    var lastRow = sheet.getLastRow();
    var nextID = 1;
    
    if (lastRow > 1) {
      if (findSaatlikRowByDateTime(sheet, data.tarih, data.saat) !== -1) {
        return { success: false, error: 'Bu tarih ve saat için kayıt zaten var! Düzenleme yapın.' };
      }

      // Son ID'yi bul
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      var maxID = 0;
      for (var j = 0; j < ids.length; j++) {
        var idNum = parseInt(ids[j][0]) || 0;
        if (idNum > maxID) maxID = idNum;
      }
      nextID = maxID + 1;
    }
    
    // Kayıt ekle
    var kayitTarihi = formatDateTimeTR(new Date());
    var formattedTarih = formatDateTR(data.tarih);
    
    var rowData = [
      nextID.toString(),
      formattedTarih,
      data.saat,
      data.vardiya,
      
      parseFloat(data.aktifMwh) || 0,
      parseFloat(data.reaktifMwh) || 0,
      parseFloat(data.aydemAktif) || 0,
      parseFloat(data.aydemReaktif) || 0,
      data.kaydeden || '',
      data.notlar || '',
      kayitTarihi
    ];
    var newRow = findInsertPosition(sheet, formattedTarih, data.saat);
    if (newRow <= sheet.getLastRow()) {
      sheet.insertRowBefore(newRow);
    }
    sheet.getRange(newRow, 1, 1, 11).setValues([rowData]);
    
    // Yeni satır formatı
    sheet.getRange(newRow, 1, 1, 11).setHorizontalAlignment('center');
    sheet.getRange(newRow, 1, 1, 11).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    return { success: true, message: 'Kayıt başarıyla eklendi! (ID: ' + nextID + ')' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Kayıt güncelle
function updateRecord(data) {
  try {
    var sheet = getSaatlikSheet(false);
    
    if (!sheet) {
      return { success: false, error: 'Sayfa bulunamadı!' };
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    var foundRow = findSaatlikRowByDateTime(sheet, data.tarih, data.saat);
    var recordID = '';
    
    if (foundRow === -1) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    // ID'yi al
    recordID = sheet.getRange(foundRow, 1).getDisplayValue();
    
    // Yeni verileri güncelle
    sheet.getRange(foundRow, 4).setValue(data.vardiya);
    sheet.getRange(foundRow, 5).setValue(parseFloat(data.aktifMwh) || 0);
    sheet.getRange(foundRow, 6).setValue(parseFloat(data.reaktifMwh) || 0);
    sheet.getRange(foundRow, 7).setValue(parseFloat(data.aydemAktif) || 0);
    sheet.getRange(foundRow, 8).setValue(parseFloat(data.aydemReaktif) || 0);
    sheet.getRange(foundRow, 9).setValue(data.kaydeden || '');
    sheet.getRange(foundRow, 10).setValue(data.notlar || '');
    sheet.getRange(foundRow, 11).setValue(formatDateTimeTR(new Date()));
    
    Logger.log('Satır ' + foundRow + ' (ID: ' + recordID + ') güncellendi.');
    
    return { success: true, message: 'Kayıt başarıyla güncellendi! (ID: ' + recordID + ')' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tüm kayıtları getir
function getRecords() {
  try {
    var sheet = getSaatlikSheet(false);
    
    if (!sheet) {
      return { success: true, data: [], message: 'Sayfa henüz oluşturulmamış.' };
    }
    
    if (sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getDisplayValues();
    var records = [];
    
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      records.push(mapSaatlikRow(row));
    }
    
    return { success: true, data: records };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Son N kaydı getir
function getLastRecords(count) {
  try {
    var sheet = getSaatlikSheet(false);
    if (!sheet) {
      return { success: true, data: [], total: 0, message: 'Sayfa henüz oluşturulmamış.' };
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: true, data: [], total: 0 };
    }

    var total = lastRow - 1;
    var rowCount = Math.min(count || 48, total);
    var startRow = Math.max(2, lastRow - rowCount + 1);
    var rows = sheet.getRange(startRow, 1, rowCount, 11).getDisplayValues();
    var records = rows.map(mapSaatlikRow).reverse();
    
    return { 
      success: true, 
      data: records,
      total: total
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tarih ve saate göre kayıt getir
function getRecordByDateTime(tarih, saat) {
  try {
    var sheet = getSaatlikSheet(false);
    if (!sheet) return { success: true, data: null, found: false };

    var foundRow = findSaatlikRowByDateTime(sheet, tarih, saat);
    var record = foundRow === -1 ? null : mapSaatlikRow(sheet.getRange(foundRow, 1, 1, 11).getDisplayValues()[0]);
    
    if (record) {
      return { success: true, data: record, found: true };
    } else {
      return { success: true, data: null, found: false };
    }
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tarih formatı (dd.MM.yyyy)
function checkHourlyMissingRecords() {
  try {
    var now = new Date();
    var target = getHourlyCheckTarget(now);
    var tarih = target.tarih;
    var saat = target.saat;
    var sentKey = 'saatlikHourlyCheck:' + tarih + ':' + saat;
    var props = PropertiesService.getScriptProperties();

    if (props.getProperty(sentKey)) {
      return { success: true, skipped: true, message: 'Bu saat daha once kontrol edildi' };
    }

    var existing = getRecordByDateTime(tarih, saat);
    if (existing.success && existing.found) {
      props.setProperty(sentKey, new Date().toISOString());
      addSystemLog({
        tarih: tarih,
        saat: saat,
        modul: 'Saatlik Veri',
        eksikKayit: 'Yok',
        otomatikKayitSonucu: 'Gerekmedi',
        mailSonucu: 'Gonderilmedi',
        detay: 'Kayit mevcut'
      });
      return { success: true, missing: false, added: false, message: 'Kayit mevcut' };
    }

    var vardiya = getVardiyaByHour(target.hour);
    var addResult = addRecord({
      tarih: tarih,
      saat: saat,
      vardiya: vardiya,
      aktifMwh: '0',
      reaktifMwh: '0',
      aydemAktif: '0',
      aydemReaktif: '0',
      kaydeden: 'OTOMATIK SISTEM',
      notlar: 'KAYIT GIRILMEDI - OTOMATIK'
    });

    var subject = 'Saatlik Veri Girisi Uyarisi - ' + tarih + ' ' + saat + ' Kayit Girilmedi';
    var body = 'Saatlik Veri Girisi Uyarisi\n\n' +
      'Tarih: ' + tarih + '\n' +
      'Saat: ' + saat + '\n' +
      'Vardiya: ' + vardiya + '\n\n' +
      'Bu saat icin saatlik veri girilmedi. Sistem otomatik bos kayit olusturdu.\n\n' +
      'Otomatik kayit sonucu: ' + (addResult.success ? 'Basarili' : addResult.error);

    var mailResult = sendEmailAlert({ subject: subject, body: body });
    if (addResult.success) {
      props.setProperty(sentKey, new Date().toISOString());
    }
    addSystemLog({
      tarih: tarih,
      saat: saat,
      modul: 'Saatlik Veri',
      eksikKayit: 'Saatlik kayit yok',
      otomatikKayitSonucu: addResult.success ? 'Basarili' : 'Basarisiz',
      mailSonucu: mailResult.success ? 'Basarili' : 'Basarisiz',
      hataMesaji: addResult.success ? (mailResult.success ? '' : mailResult.error) : addResult.error,
      detay: 'Otomatik bos kayit kontrolu'
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
      modul: 'Saatlik Veri',
      otomatikKayitSonucu: 'Hata',
      mailSonucu: 'Bilinmiyor',
      hataMesaji: error.toString(),
      detay: 'checkHourlyMissingRecords'
    });
    return { success: false, error: error.toString() };
  }
}

function fillMissingRecordsForDate(tarih, startSaat, endSaat) {
  try {
    var sheet = getSaatlikSheet(false);
    if (!sheet || sheet.getLastRow() < 2) {
      if (!startSaat || !endSaat) {
        return { success: false, error: 'Saatlik veri yok. Bos bir gun icin startSaat ve endSaat gondermelisiniz.' };
      }
    }

    var targetTarih = formatDateTR(tarih);
    if (!targetTarih) {
      return { success: false, error: 'Tarih zorunludur.' };
    }

    var rows = sheet && sheet.getLastRow() >= 2
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getDisplayValues()
      : [];
    var existingByHour = {};
    var hoursOnDate = [];

    for (var i = 0; i < rows.length; i++) {
      var record = mapSaatlikRow(rows[i]);
      if (String(record.tarih || '').trim() !== targetTarih) continue;
      var hourValue = parseSaatLabel(record.saat);
      if (hourValue === null) continue;
      existingByHour[hourValue] = true;
      hoursOnDate.push(hourValue);
    }

    var startHour = startSaat ? parseSaatLabel(startSaat) : (hoursOnDate.length ? Math.min.apply(null, hoursOnDate) : null);
    var endHour = endSaat ? parseSaatLabel(endSaat) : (hoursOnDate.length ? Math.max.apply(null, hoursOnDate) : null);

    if (startHour === null || endHour === null) {
      return { success: false, error: 'Bu tarihte mevcut kayit yoksa startSaat ve endSaat gonderin. Ornek: 08:00' };
    }

    if (endHour < startHour) {
      return { success: false, error: 'Bitis saati baslangic saatinden kucuk olamaz.' };
    }

    var added = [];
    var skipped = [];
    var errors = [];

    for (var hour = startHour; hour <= endHour; hour++) {
      if (existingByHour[hour]) {
        skipped.push(formatHourLabel(hour));
        continue;
      }

      var saat = formatHourLabel(hour);
      var addResult = addRecord({
        tarih: targetTarih,
        saat: saat,
        vardiya: getVardiyaByHour(hour),
        aktifMwh: '0',
        reaktifMwh: '0',
        aydemAktif: '0',
        aydemReaktif: '0',
        kaydeden: 'OTOMATIK SISTEM',
        notlar: 'ARADAKI BOS SAAT - OTOMATIK'
      });

      if (addResult.success) {
        added.push(saat);
      } else {
        errors.push(saat + ': ' + addResult.error);
      }
    }

    addSystemLog({
      tarih: targetTarih,
      modul: 'Saatlik Veri',
      eksikKayit: added.join(', '),
      otomatikKayitSonucu: added.length ? 'Test Backfill' : 'Gerekmedi',
      mailSonucu: 'Gonderilmedi',
      hataMesaji: errors.join('; '),
      detay: 'Aradaki bos saatler otomatik dolduruldu'
    });

    return {
      success: true,
      tarih: targetTarih,
      startSaat: formatHourLabel(startHour),
      endSaat: formatHourLabel(endHour),
      addedCount: added.length,
      addedHours: added,
      skippedHours: skipped,
      errors: errors
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function fillMissingRecordGaps(tarih) {
  try {
    var sheet = getSaatlikSheet(false);
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: false, error: 'Saatlik veri sayfasi bos.' };
    }

    var targetTarih = tarih ? formatDateTR(tarih) : '';
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getDisplayValues();
    var hoursByDate = {};
    var allDates = [];

    for (var i = 0; i < rows.length; i++) {
      var record = mapSaatlikRow(rows[i]);
      var recordTarih = String(record.tarih || '').trim();
      if (!recordTarih) continue;
      if (targetTarih && recordTarih !== targetTarih) continue;

      var hourValue = parseSaatLabel(record.saat);
      if (hourValue === null) continue;

      if (!hoursByDate[recordTarih]) {
        hoursByDate[recordTarih] = {};
        allDates.push(recordTarih);
      }

      hoursByDate[recordTarih][hourValue] = true;
    }

    if (!allDates.length) {
      return {
        success: false,
        error: targetTarih
          ? 'Bu tarihte kayit bulunamadi.'
          : 'Taranacak saatlik kayit bulunamadi.'
      };
    }

    allDates.sort(function(a, b) {
      return parseDateTimeTR(a, '00:00') - parseDateTimeTR(b, '00:00');
    });

    var perDate = [];
    var totalAdded = 0;
    var totalSkipped = 0;
    var allErrors = [];

    for (var j = 0; j < allDates.length; j++) {
      var currentDate = allDates[j];
      var hourMap = hoursByDate[currentDate];
      var existingHours = Object.keys(hourMap).map(function(hour) {
        return parseInt(hour, 10);
      }).sort(function(a, b) {
        return a - b;
      });

      if (!existingHours.length) continue;

      var startHour = existingHours[0];
      var endHour = existingHours[existingHours.length - 1];
      var addedHours = [];
      var skippedHours = [];
      var errors = [];

      for (var hour = startHour; hour <= endHour; hour++) {
        if (hourMap[hour]) {
          skippedHours.push(formatHourLabel(hour));
          totalSkipped++;
          continue;
        }

        var addResult = addRecord({
          tarih: currentDate,
          saat: formatHourLabel(hour),
          vardiya: getVardiyaByHour(hour),
          aktifMwh: '0',
          reaktifMwh: '0',
          aydemAktif: '0',
          aydemReaktif: '0',
          kaydeden: 'OTOMATIK SISTEM',
          notlar: 'KAYIT SAYFASI ARADAKI BOS SAAT - OTOMATIK'
        });

        if (addResult.success) {
          addedHours.push(formatHourLabel(hour));
          totalAdded++;
          hourMap[hour] = true;
        } else {
          errors.push(formatHourLabel(hour) + ': ' + addResult.error);
          allErrors.push(currentDate + ' ' + formatHourLabel(hour) + ': ' + addResult.error);
        }
      }

      perDate.push({
        tarih: currentDate,
        baslangicSaat: formatHourLabel(startHour),
        bitisSaat: formatHourLabel(endHour),
        addedCount: addedHours.length,
        addedHours: addedHours,
        skippedCount: skippedHours.length,
        skippedHours: skippedHours,
        errors: errors
      });
    }

    addSystemLog({
      tarih: targetTarih || allDates[0],
      modul: 'Saatlik Veri',
      eksikKayit: totalAdded ? ('Toplam ' + totalAdded + ' saat dolduruldu') : 'Yok',
      otomatikKayitSonucu: totalAdded ? 'Kayit sayfasi bosluk doldurma' : 'Gerekmedi',
      mailSonucu: 'Gonderilmedi',
      hataMesaji: allErrors.join('; '),
      detay: targetTarih ? 'Tek tarih icin aradaki bos saatler dolduruldu' : 'Tum sayfada aradaki bos saatler dolduruldu'
    });

    return {
      success: true,
      scannedDateCount: allDates.length,
      totalAddedCount: totalAdded,
      totalSkippedCount: totalSkipped,
      dates: perDate,
      errors: allErrors
    };
  } catch (error) {
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
      formatDateTimeTR(new Date()),
      formatDateTR(data.tarih || data.date || ''),
      data.saat || data.hour || '',
      data.modul || data.module || 'Saatlik Veri',
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

  return { success: true, message: 'Saatlik eksik kayit tetikleyicisi kuruldu' };
}

function getTriggerHealth() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var hourlyTriggers = [];
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'checkHourlyMissingRecords') {
        hourlyTriggers.push({
          handler: triggers[i].getHandlerFunction(),
          source: String(triggers[i].getTriggerSource()),
          eventType: String(triggers[i].getEventType())
        });
      }
    }

    var logs = getSystemLogs(1);
    return {
      success: true,
      installed: hourlyTriggers.length > 0,
      triggerCount: hourlyTriggers.length,
      triggers: hourlyTriggers,
      lastLog: logs.success && logs.data.length ? logs.data[0] : null,
      checkedAt: formatDateTimeTR(new Date())
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getHourlyCheckTarget(date) {
  var target = new Date(date);
  if (target.getMinutes() < 55) {
    target.setHours(target.getHours() - 1);
  }

  return {
    hour: target.getHours(),
    tarih: Utilities.formatDate(target, Session.getScriptTimeZone(), 'dd.MM.yyyy'),
    saat: pad2(target.getHours()) + ':00'
  };
}

function getVardiyaByHour(hour) {
  if (hour >= 8 && hour < 16) return '08-16';
  if (hour >= 16 && hour < 24) return '16-24';
  return '24-08';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseSaatLabel(value) {
  var text = String(value || '').trim();
  if (!text) return null;
  var parts = text.split(':');
  var hour = parseInt(parts[0], 10);
  return isNaN(hour) || hour < 0 || hour > 23 ? null : hour;
}

function formatHourLabel(hour) {
  return pad2(hour) + ':00';
}

function findInsertPosition(sheet, tarih, saat) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return 2;
  }

  var targetTime = parseDateTimeTR(tarih, saat).getTime();
  var data = sheet.getRange(2, 2, lastRow - 1, 2).getDisplayValues();

  for (var i = 0; i < data.length; i++) {
    var rowTime = parseDateTimeTR(data[i][0], data[i][1]).getTime();
    if (rowTime > targetTime) {
      return i + 2;
    }
  }

  return lastRow + 1;
}

function parseDateTimeTR(tarih, saat) {
  var parts = String(tarih || '').indexOf('-') !== -1
    ? String(tarih || '').split('-').reverse()
    : String(tarih || '').split('.');
  var hourParts = String(saat || '00:00').split(':');

  return new Date(
    parseInt(parts[2], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[0], 10),
    parseInt(hourParts[0] || '0', 10),
    parseInt(hourParts[1] || '0', 10)
  );
}

function formatDateTR(dateString) {
  if (!dateString) return '';
  var parts = dateString.split('-');
  if (parts.length === 3) {
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  return dateString;
}

// Tarih-saat formatı (dd.MM.yyyy HH:mm:ss)
function formatDateTimeTR(date) {
  if (!date) return '';
  var d = new Date(date);
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var year = d.getFullYear();
  var hours = String(d.getHours()).padStart(2, '0');
  var minutes = String(d.getMinutes()).padStart(2, '0');
  var seconds = String(d.getSeconds()).padStart(2, '0');
  return day + '.' + month + '.' + year + ' ' + hours + ':' + minutes + ':' + seconds;
}

// 📧 Mail gönderme fonksiyonu
function sendEmailAlert(data) {
  try {
    // Parametreleri kontrol et
    if (!data) {
      return { success: false, error: 'Veri parametresi eksik' };
    }
    
    var to = data.to || 'mrtcsk0320@gmail.com'; // Varsayılan mail adresi
    var subject = data.subject || 'Saatlik Veri Girişi Uyarısı';
    var body = data.body || '';
    
    Logger.log('Mail gönderiliyor: ' + to + ', Konu: ' + subject);
    
    // Mail gönder
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body,
      htmlBody: body.replace(/\n/g, '<br>')
    });
    
    Logger.log('Mail başarıyla gönderildi: ' + to);
    return { success: true, message: 'Mail başarıyla gönderildi!' };
    
  } catch (error) {
    Logger.log('Mail gönderme hatası: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}
