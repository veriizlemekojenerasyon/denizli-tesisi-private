/**
 * VARDIYA TAKIP - Google Apps Script Kodu
 * Bu dosya Google Sheets > Extensions > Apps Script'e yapıştırılacak
 * 
 * Özellikler:
 * - Otomatik sayfa ve tablo oluşturma
 * - TR tarih formatı (dd.MM.yyyy)
 * - Vardiya bazlı kayıt (08-16, 16-24, 24-08)
 * - Personel ve operatör takibi
 * - Yardımcı operatör desteği
 */

// CORS ayarları
var VARDIYA_LOCK_WAIT_MS = 1200;

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var requestStartedAt = new Date().getTime();
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action;
  var lock = null;
  var lockWaitMs = 0;
  var lockSkipped = false;
  try {
    if (isVardiyaWriteAction(action)) {
      var lockStartedAt = new Date().getTime();
      lock = LockService.getScriptLock();
      if (!lock.tryLock(VARDIYA_LOCK_WAIT_MS)) {
        lock = null;
        lockSkipped = true;
      }
      lockWaitMs = new Date().getTime() - lockStartedAt;
    }
    
    var result = {};
    
    switch(action) {
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
        result = getLastRecords(parseInt(params.count) || 32);
        break;
      case 'getLastRecordsWithIslemler':
        result = getLastRecordsWithIslemler(parseInt(params.count) || 32);
        break;
      case 'getRecordByDateVardiya':
        result = getRecordByDateVardiya(params.tarih, params.vardiya);
        break;
      case 'endVardiya':
        result = endVardiya(params);
        break;
      case 'addIslem':
        result = addIslem(params);
        break;
      case 'updateDevredenIsler':
        result = updateDevredenIsler(params);
        break;
      case 'getIslemlerByVardiyaId':
        result = getIslemlerByVardiyaId(params.vardiyaId);
        break;
      case 'getMonthlyCleaningList':
        result = getMonthlyCleaningList(params.year, params.month);
        break;
      case 'saveCleaningChecklist':
        result = saveCleaningChecklist(params);
        break;
      case 'getCleaningChecklist':
        result = getCleaningChecklist(params);
        break;
      default:
        result = { success: false, error: 'Geçersiz işlem' };
    }
    
    if (result && typeof result === 'object') {
      result.totalDurationMs = new Date().getTime() - requestStartedAt;
      result.lockWaitMs = lockWaitMs;
      result.lockSkipped = lockSkipped;
    }

    if (lock) lock.releaseLock();
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    if (lock) {
      try {
        lock.releaseLock();
      } catch (lockError) {}
    }
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString(),
      totalDurationMs: new Date().getTime() - requestStartedAt,
      lockWaitMs: lockWaitMs,
      lockSkipped: lockSkipped
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function isVardiyaWriteAction(action) {
  return [
    'addRecord',
    'updateRecord',
    'endVardiya',
    'addIslem',
    'updateDevredenIsler',
    'saveCleaningChecklist'
  ].indexOf(action) !== -1;
}

// Yeni vardiya kaydı ekle
function addRecord(data) {
  var startedAt = new Date().getTime();
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('VardiyaTakip');
    
    // Sayfa yoksa otomatik oluştur
    if (!sheet) {
      sheet = spreadsheet.insertSheet('VardiyaTakip');
      
      // Başlıklar (10 sütun)
      var headers = [
        'ID', 'Tarih', 'Vardiya', 'Personel', 'Operator',
        'Yardimci Operator', 'Baslangic Saati', 'Bitis Saati',
        'Durum', 'Kayit Tarihi', 'Devreden Isler'
      ];
      
      sheet.appendRow(headers);
      
      // Başlık formatı
      var headerRange = sheet.getRange(1, 1, 1, 11);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#9b59b6');
      headerRange.setFontColor('#ffffff');
      headerRange.setHorizontalAlignment('center');
      
      // Sütun genişlikleri
      sheet.setColumnWidth(1, 60);    // ID
      sheet.setColumnWidth(2, 100);   // Tarih
      sheet.setColumnWidth(3, 100);   // Vardiya
      sheet.setColumnWidth(4, 150);   // Personel
      sheet.setColumnWidth(5, 150);   // Operatör
      sheet.setColumnWidth(6, 150);   // Yardımcı Operatör
      sheet.setColumnWidth(7, 130);   // Başlangıç Saati
      sheet.setColumnWidth(8, 130);   // Bitiş Saati
      sheet.setColumnWidth(9, 100);   // Durum
      sheet.setColumnWidth(10, 140);  // Kayıt Tarihi
      sheet.setColumnWidth(11, 260);  // Devreden Isler
      
      // Kenarlıklar
      headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
      
      // Sütun formatları
      sheet.getRange(2, 1, 1000, 1).setNumberFormat('@');   // ID
      sheet.getRange(2, 2, 1000, 1).setNumberFormat('@');   // Tarih metin
      sheet.getRange(2, 3, 1000, 9).setNumberFormat('@');  // Diger metin sutunlari
      
      Logger.log('VardiyaTakip sayfası otomatik olarak oluşturuldu.');
    } else {
      if (!getVardiyaDevredenIslerColumn(sheet)) {
        ensureVardiyaDevredenIslerColumn(sheet);
      }
    }
    
    // Aynı tarih ve vardiya için aktif kayıt var mı kontrol et
    var lastRow = sheet.getLastRow();
    var nextID = 1;

    {
      var fastFormattedTarih = formatDateTR(data.tarih);
      var fastInputVardiya = data.vardiya;
      var fastCloseExisting = String(data.closeExisting || '').toLowerCase() === '1' ||
        String(data.closeExisting || '').toLowerCase() === 'true';
      var fastActiveDuplicateRow = 0;
      var fastActiveDuplicateId = '';
      var fastMaxID = 0;

      if (lastRow > 1) {
        fastMaxID = parseInt(sheet.getRange(lastRow, 1).getDisplayValue(), 10) || (lastRow - 1);
        var fastDateMatches = sheet.getRange(2, 2, lastRow - 1, 1)
          .createTextFinder(fastFormattedTarih)
          .matchEntireCell(true)
          .findAll();

        for (var fastIndex = 0; fastIndex < fastDateMatches.length; fastIndex++) {
          var fastRowNumber = fastDateMatches[fastIndex].getRow();
          var fastRowMeta = sheet.getRange(fastRowNumber, 1, 1, 9).getDisplayValues()[0];

          if (fastRowMeta[2] === fastInputVardiya && isActiveStatus(fastRowMeta[8])) {
            fastActiveDuplicateRow = fastRowNumber;
            fastActiveDuplicateId = fastRowMeta[0];
            break;
          }
        }
        nextID = fastMaxID + 1;
      }

      if (fastActiveDuplicateRow) {
        if (!fastCloseExisting) {
          return {
            success: false,
            duplicateActive: true,
            existingId: fastActiveDuplicateId,
            error: 'Bu tarih ve vardiya icin aktif kayit zaten var!',
            durationMs: new Date().getTime() - startedAt
          };
        }

        var closeTime = formatTimeTR(new Date());
        var closeDateTime = formatDateTimeTR(new Date());
        sheet.getRange(fastActiveDuplicateRow, 8, 1, 3).setValues([[closeTime, 'Tamamlandi', closeDateTime]]);
      }

      var fastNow = new Date();
      var fastKayitTarihi = formatDateTimeTR(fastNow);
      var fastBaslangicSaati = formatTimeTR(fastNow);
      var fastNewRow = lastRow + 1;
      sheet.getRange(fastNewRow, 1, 1, 11).setValues([[
        nextID.toString(),
        fastFormattedTarih,
        fastInputVardiya,
        data.personel || '',
        data.operator || '',
        data.yardimciOperator || '',
        fastBaslangicSaati,
        '',
        'Aktif',
        fastKayitTarihi,
        ''
      ]]);

      return {
        success: true,
        message: 'Vardiya basariyla baslatildi! (ID: ' + nextID + ')',
        durationMs: new Date().getTime() - startedAt,
        closedExistingId: fastActiveDuplicateId || '',
        data: {
          id: nextID.toString(),
          baslangicSaati: fastBaslangicSaati
        }
      };
    }
    
    if (lastRow > 1) {
      var dates = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
      var vardiyas = sheet.getRange(2, 3, lastRow - 1, 1).getDisplayValues();
      var statuses = sheet.getRange(2, 9, lastRow - 1, 1).getDisplayValues();
      var inputTarih = formatDateTR(data.tarih);
      var inputVardiya = data.vardiya;
      
      for (var i = 0; i < dates.length; i++) {
        if (dates[i][0] === inputTarih && vardiyas[i][0] === inputVardiya && statuses[i][0] === 'Aktif') {
          return { success: false, error: 'Bu tarih ve vardiya için aktif kayıt zaten var!' };
        }
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
    var baslangicSaati = formatTimeTR(new Date());
    var formattedTarih = formatDateTR(data.tarih);
    
    sheet.appendRow([
      nextID.toString(),
      formattedTarih,
      data.vardiya,
      data.personel || '',
      data.operator || '',
      data.yardimciOperator || '',
      baslangicSaati,
      '',  // Bitis Saati (bos)
      'Aktif',
      kayitTarihi,
      ''
    ]);
    
    // Yeni satır formatı
    var newRow = sheet.getLastRow();
    var formatColumnCount = Math.max(11, sheet.getLastColumn());
    sheet.getRange(newRow, 1, 1, formatColumnCount).setHorizontalAlignment('center');
    sheet.getRange(newRow, 1, 1, formatColumnCount).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    return { 
      success: true, 
      message: 'Vardiya başarıyla başlatıldı! (ID: ' + nextID + ')',
      data: {
        id: nextID.toString(),
        baslangicSaati: baslangicSaati
      }
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function ensureVardiyaDevredenIslerColumn(sheet) {
  var devredenColumn = getVardiyaDevredenIslerColumn(sheet);
  if (!devredenColumn) {
    devredenColumn = Math.max(sheet.getLastColumn() + 1, 11);
    sheet.getRange(1, devredenColumn).setValue('Devreden Isler');
  }
  sheet.setColumnWidth(devredenColumn, 260);

  var columnCount = Math.max(11, sheet.getLastColumn());
  var headerRange = sheet.getRange(1, 1, 1, columnCount);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#9b59b6');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  sheet.getRange(2, 1, Math.max(1000, sheet.getLastRow()), columnCount).setNumberFormat('@');
  return devredenColumn;
}

function getVardiyaDevredenIslerColumn(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return 0;

  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (normalizeVardiyaHeader(headers[i]) === 'devreden isler') {
      return i + 1;
    }
  }

  return 0;
}

function normalizeVardiyaHeader(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/\u0131/g, 'i')
    .replace(/\u015f/g, 's')
    .replace(/\u015e/g, 's')
    .replace(/\u00fc/g, 'u')
    .replace(/\u00dc/g, 'u')
    .replace(/\u00f6/g, 'o')
    .replace(/\u00d6/g, 'o')
    .replace(/\u00e7/g, 'c')
    .replace(/\u00c7/g, 'c')
    .replace(/\u011f/g, 'g')
    .replace(/\u011e/g, 'g');
}

// Vardiya bitir
function endVardiya(data) {
  var startedAt = new Date().getTime();
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('VardiyaTakip');
    
    if (!sheet) {
      return { success: false, error: 'Sayfa bulunamadı!' };
    }
    var devredenColumn = getVardiyaDevredenIslerColumn(sheet);
    if (!devredenColumn) {
      devredenColumn = ensureVardiyaDevredenIslerColumn(sheet);
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }

    {
      var fastTargetId = String(data.id || '').trim();
      var fastTargetTarih = formatDateTR(data.tarih);
      var fastTargetVardiya = String(data.vardiya || '').trim();
      var fastFoundRow = -1;
      var fastRecordID = '';

      if (fastTargetId) {
        var fastIdMatches = sheet.getRange(2, 1, lastRow - 1, 1)
          .createTextFinder(fastTargetId)
          .matchEntireCell(true)
          .findAll();

        for (var fastIdIndex = 0; fastIdIndex < fastIdMatches.length; fastIdIndex++) {
          var fastIdRow = fastIdMatches[fastIdIndex].getRow();
          var fastIdMeta = sheet.getRange(fastIdRow, 1, 1, 9).getDisplayValues()[0];
          if (isActiveStatus(fastIdMeta[8])) {
            fastFoundRow = fastIdRow;
            fastRecordID = fastIdMeta[0];
            break;
          }
        }
      }

      if (fastFoundRow === -1 && fastTargetTarih && fastTargetVardiya) {
        var fastDateMatches = sheet.getRange(2, 2, lastRow - 1, 1)
          .createTextFinder(fastTargetTarih)
          .matchEntireCell(true)
          .findAll();

        for (var fastDateIndex = 0; fastDateIndex < fastDateMatches.length; fastDateIndex++) {
          var fastDateRow = fastDateMatches[fastDateIndex].getRow();
          var fastDateMeta = sheet.getRange(fastDateRow, 1, 1, 9).getDisplayValues()[0];
          if (fastDateMeta[2] === fastTargetVardiya && isActiveStatus(fastDateMeta[8])) {
            fastFoundRow = fastDateRow;
            fastRecordID = fastDateMeta[0];
            break;
          }
        }
      }

      if (fastFoundRow === -1) {
        return { success: false, error: 'Aktif vardiya kaydı bulunamadı!', durationMs: new Date().getTime() - startedAt };
      }

      var fastNow = new Date();
      var fastBitisSaati = formatTimeTR(fastNow);
      sheet.getRange(fastFoundRow, 8, 1, 3).setValues([[
        fastBitisSaati,
        'Tamamlandı',
        formatDateTimeTR(fastNow)
      ]]);
      sheet.getRange(fastFoundRow, devredenColumn).setValue(data.devredenIsler || '');

      return {
        success: true,
        message: 'Vardiya başarıyla sonlandırıldı! (ID: ' + fastRecordID + ')',
        durationMs: new Date().getTime() - startedAt,
        data: {
          id: fastRecordID,
          bitisSaati: fastBitisSaati
        }
      };
    }
    
    // Tarih ve vardiyaya göre aktif kaydı bul
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    var dates = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    var vardiyas = sheet.getRange(2, 3, lastRow - 1, 1).getDisplayValues();
    var statuses = sheet.getRange(2, 9, lastRow - 1, 1).getDisplayValues();
    var targetId = data.id || '';
    var targetTarih = formatDateTR(data.tarih);
    var targetVardiya = data.vardiya;
    var foundRow = -1;
    var recordID = '';
    
    for (var i = 0; i < dates.length; i++) {
      var idMatches = targetId && ids[i][0] === targetId;
      var dateShiftMatches = dates[i][0] === targetTarih && vardiyas[i][0] === targetVardiya;
      if ((idMatches || dateShiftMatches) && isActiveStatus(statuses[i][0])) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return { success: false, error: 'Aktif vardiya kaydı bulunamadı!' };
    }
    
    // ID'yi al
    recordID = sheet.getRange(foundRow, 1).getDisplayValue();
    
    // Bitiş saati ve durumu güncelle
    var bitisSaati = formatTimeTR(new Date());
    sheet.getRange(foundRow, 8).setValue(bitisSaati);
    sheet.getRange(foundRow, 9).setValue('Tamamlandı');
    sheet.getRange(foundRow, 10).setValue(formatDateTimeTR(new Date()));
    sheet.getRange(foundRow, devredenColumn).setValue(data.devredenIsler || '');
    
    Logger.log('Vardiya sonlandırıldı - Satır ' + foundRow + ' (ID: ' + recordID + ')');
    
    return { 
      success: true, 
      message: 'Vardiya başarıyla sonlandırıldı! (ID: ' + recordID + ')',
      data: {
        id: recordID,
        bitisSaati: bitisSaati
      }
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Kayıt güncelle
function updateDevredenIsler(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('VardiyaTakip');

    if (!sheet || sheet.getLastRow() < 2) {
      return { success: false, error: 'Vardiya kaydi bulunamadi!' };
    }

    var devredenColumn = ensureVardiyaDevredenIslerColumn(sheet);
    var lastRow = sheet.getLastRow();
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    var dates = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    var vardiyas = sheet.getRange(2, 3, lastRow - 1, 1).getDisplayValues();
    var targetId = String(data.id || data.vardiyaId || '').trim();
    var targetTarih = formatDateTR(data.tarih || '');
    var targetVardiya = String(data.vardiya || '').trim();
    var foundRow = -1;

    for (var i = 0; i < ids.length; i++) {
      var idMatches = targetId && String(ids[i][0] || '').trim() === targetId;
      var dateShiftMatches = targetTarih && targetVardiya && dates[i][0] === targetTarih && vardiyas[i][0] === targetVardiya;
      if (idMatches || dateShiftMatches) {
        foundRow = i + 2;
        break;
      }
    }

    if (foundRow === -1) {
      return { success: false, error: 'Devreden isler icin vardiya kaydi bulunamadi!' };
    }

    sheet.getRange(foundRow, devredenColumn).setValue(data.devredenIsler || '');

    return {
      success: true,
      message: 'Devreden isler kaydedildi',
      data: {
        id: sheet.getRange(foundRow, 1).getDisplayValue(),
        devredenIsler: data.devredenIsler || ''
      }
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateRecord(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('VardiyaTakip');
    
    if (!sheet) {
      return { success: false, error: 'Sayfa bulunamadı!' };
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    // ID'ye göre kaydı bul
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    var targetID = data.id;
    var foundRow = -1;
    
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === targetID) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    // Verileri güncelle
    if (data.personel) sheet.getRange(foundRow, 4).setValue(data.personel);
    if (data.operator) sheet.getRange(foundRow, 5).setValue(data.operator);
    if (data.yardimciOperator) sheet.getRange(foundRow, 6).setValue(data.yardimciOperator);
    sheet.getRange(foundRow, 10).setValue(formatDateTimeTR(new Date()));
    
    Logger.log('Kayıt güncellendi - Satır ' + foundRow + ' (ID: ' + targetID + ')');
    
    return { success: true, message: 'Kayıt başarıyla güncellendi! (ID: ' + targetID + ')' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tüm kayıtları getir
function getRecords() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('VardiyaTakip');
    
    if (!sheet) {
      return { success: true, data: [], message: 'Sayfa henüz oluşturulmamış.' };
    }
    
    if (sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    var devredenColumn = getVardiyaDevredenIslerColumn(sheet) || 11;
    var columnCount = Math.max(11, devredenColumn, sheet.getLastColumn());
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, columnCount).getDisplayValues();
    var records = [];
    
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      records.push({
        id: row[0],
        tarih: row[1],
        vardiya: row[2],
        personel: row[3],
        operator: row[4],
        yardimciOperator: row[5],
        baslangicSaati: row[6],
        bitisSaati: row[7],
        durum: row[8],
        kayitTarihi: row[9],
        devredenIsler: row[devredenColumn - 1] || ''
      });
    }
    
    return { success: true, data: records };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Son N kaydı getir
function getLastRecords(count) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('VardiyaTakip');

    if (!sheet) {
      return { success: true, data: [], total: 0, message: 'Sayfa henuz olusturulmamis.' };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: true, data: [], total: 0 };
    }

    var total = lastRow - 1;
    var rowCount = Math.min(Math.max(parseInt(count, 10) || 32, 1), total, 500);
    var startRow = Math.max(2, lastRow - rowCount + 1);
    var devredenColumn = getVardiyaDevredenIslerColumn(sheet) || 11;
    var columnCount = Math.max(11, devredenColumn, sheet.getLastColumn());
    var data = sheet.getRange(startRow, 1, rowCount, columnCount).getDisplayValues();
    var records = [];

    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      records.push({
        id: row[0],
        tarih: row[1],
        vardiya: row[2],
        personel: row[3],
        operator: row[4],
        yardimciOperator: row[5],
        baslangicSaati: row[6],
        bitisSaati: row[7],
        durum: row[8],
        kayitTarihi: row[9],
        devredenIsler: row[devredenColumn - 1] || ''
      });
    }
    
    return { 
      success: true, 
      data: records,
      total: total
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tarih ve vardiyaya göre kayıt getir
function getRecordByDateVardiya(tarih, vardiya) {
  try {
    var result = getRecords();
    if (!result.success) return result;
    
    var formattedTarih = formatDateTR(tarih);
    var records = result.data.filter(function(record) {
      return record.tarih === formattedTarih && record.vardiya === vardiya;
    });
    var record = records.find(function(item) {
      return isActiveStatus(item.durum);
    }) || records[0];
    
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
function formatDateTR(dateString) {
  if (!dateString) return '';
  var parts = dateString.split('-');
  if (parts.length === 3) {
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  return dateString;
}

// Saat formatı (HH:mm:ss)
function isActiveStatus(value) {
  return String(value || '').trim().toLowerCase() === 'aktif';
}

function formatTimeTR(date) {
  if (!date) return '';
  var d = new Date(date);
  var hours = String(d.getHours()).padStart(2, '0');
  var minutes = String(d.getMinutes()).padStart(2, '0');
  var seconds = String(d.getSeconds()).padStart(2, '0');
  return hours + ':' + minutes + ':' + seconds;
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

// Yeni işlem kaydı ekle
function addIslem(data) {
  try {
    if (!String(data.islem || '').trim()) {
      return { success: false, error: 'Islem aciklamasi eksik' };
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('VardiyaIslemleri');
    
    // Sayfa yoksa otomatik oluştur
    if (!sheet) {
      sheet = spreadsheet.insertSheet('VardiyaIslemleri');
      
      // Başlıklar (6 sütun)
      var headers = [
        'ID', 'Vardiya ID', 'İşlem Açıklaması', 'Zaman', 'Kaydeden', 'Kayıt Tarihi'
      ];
      
      sheet.appendRow(headers);
      
      // Başlık formatı
      var headerRange = sheet.getRange(1, 1, 1, 6);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#3498db');
      headerRange.setFontColor('#ffffff');
      headerRange.setHorizontalAlignment('center');
      
      // Sütun genişlikleri
      sheet.setColumnWidth(1, 60);    // ID
      sheet.setColumnWidth(2, 100);   // Vardiya ID
      sheet.setColumnWidth(3, 300);   // İşlem Açıklaması
      sheet.setColumnWidth(4, 140);   // Zaman
      sheet.setColumnWidth(5, 150);   // Kaydeden
      sheet.setColumnWidth(6, 140);   // Kayıt Tarihi
      
      // Kenarlıklar
      headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
      
      Logger.log('VardiyaIslemleri sayfası otomatik olarak oluşturuldu.');
    }
    
    // Son ID'yi bul
    var lastRow = sheet.getLastRow();
    var nextID = 1;
    
    if (lastRow > 1) {
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
    var zaman = data.zaman || formatDateTimeTR(new Date());
    
    sheet.appendRow([
      nextID.toString(),
      data.vardiyaId || '',
      data.islem || '',
      zaman,
      data.kaydeden || '',
      kayitTarihi
    ]);
    
    // Yeni satır formatı
    var newRow = sheet.getLastRow();
    sheet.getRange(newRow, 1, 1, 6).setHorizontalAlignment('center');
    sheet.getRange(newRow, 3).setHorizontalAlignment('left'); // İşlem açıklaması sola yaslı
    sheet.getRange(newRow, 1, 1, 6).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    return { 
      success: true, 
      message: 'İşlem başarıyla kaydedildi! (ID: ' + nextID + ')',
      data: { id: nextID.toString() }
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Vardiya ID'sine göre işlemleri getir
function getIslemlerByVardiyaId(vardiyaId) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('VardiyaIslemleri');
    
    if (!sheet) {
      return { success: true, data: [], message: 'Sayfa henüz oluşturulmamış.' };
    }
    
    if (sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getDisplayValues();
    var islemler = [];
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (row[1] === vardiyaId) {
        islemler.push({
          id: row[0],
          vardiyaId: row[1],
          islem: row[2],
          zaman: row[3],
          kaydeden: row[4],
          kayitTarihi: row[5]
        });
      }
    }
    
    // Zmana göre sırala (en yeni en üste)
    islemler.sort(function(a, b) {
      return new Date(b.zaman) - new Date(a.zaman);
    });
    
    return { success: true, data: islemler };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Son kayıtları işlemleri ile birlikte getir
function getLastRecordsWithIslemler(count) {
  try {
    // Vardiya kayıtlarını çek
    var vardiyaResult = getLastRecords(count);
    
    if (!vardiyaResult.success) {
      return vardiyaResult;
    }
    
    var vardiyaKayitlari = vardiyaResult.data;
    var vardiyaIdSet = {};
    for (var recordIndex = 0; recordIndex < vardiyaKayitlari.length; recordIndex++) {
      if (vardiyaKayitlari[recordIndex].id) {
        vardiyaIdSet[String(vardiyaKayitlari[recordIndex].id)] = true;
      }
    }
    
    // Tüm işlemleri çek
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var islemSheet = spreadsheet.getSheetByName('VardiyaIslemleri');
    var islemlerMap = {};
    
    if (islemSheet && islemSheet.getLastRow() > 1) {
      var islemData = islemSheet.getRange(2, 1, islemSheet.getLastRow() - 1, 6).getDisplayValues();
      
      for (var i = 0; i < islemData.length; i++) {
        var row = islemData[i];
        var vardiyaId = String(row[1] || '');
        if (!vardiyaIdSet[vardiyaId]) continue;
        
        if (!islemlerMap[vardiyaId]) {
          islemlerMap[vardiyaId] = [];
        }
        
        islemlerMap[vardiyaId].push({
          id: row[0],
          vardiyaId: row[1],
          islem: row[2],
          zaman: row[3],
          kaydeden: row[4],
          kayitTarihi: row[5]
        });
      }
    }
    
    // Her vardiya kaydına işlemleri ekle
    for (var j = 0; j < vardiyaKayitlari.length; j++) {
      var vardiya = vardiyaKayitlari[j];
      var vardiyaId = vardiya.id;
      
      if (islemlerMap[vardiyaId]) {
        vardiya.islemler = islemlerMap[vardiyaId];
      } else {
        vardiya.islemler = [];
      }
    }
    
    return { success: true, data: vardiyaKayitlari };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getCleaningTaskDefinitions() {
  return [
    { vardiya: '08-16', role: 'Ana Vardiya', area: 'Tuvalet/Banyo, Soyunma Odasi ve Mutfak', sort: 1 },
    { vardiya: '08-16', role: 'Yardimci Vardiya', area: 'Hucre Odasi ve Merdivenleri', sort: 2, helperOnly: true },
    { vardiya: '16-24', role: 'Ana Vardiya', area: 'Kontrol Odasi ve Koridor', sort: 4 },
    { vardiya: '24-08', role: 'Ana Vardiya', area: 'Motor Dairesi', sort: 5 }
  ];
}

function getCleaningSheetName(year, month) {
  return 'TemizlikListesi-' + year + '-' + String(month).padStart(2, '0');
}

function ensureCleaningSheet(year, month) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = getCleaningSheetName(year, month);
  var sheet = spreadsheet.getSheetByName(sheetName);
  var headers = [
    'ID', 'Ay', 'Tarih', 'Vardiya', 'Rol', 'Temizlik Alani',
    'Planlanan Sorumlu', 'Yardimci Operator', 'Yapildi',
    'Yapilma Zamani', 'Kaydeden', 'Vardiya ID', 'Kayit Tarihi'
  ];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0f766e');
    headerRange.setFontColor('#ffffff');
    headerRange.setHorizontalAlignment('center');
    headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 90);
    sheet.setColumnWidth(2, 90);
    sheet.setColumnWidth(3, 100);
    sheet.setColumnWidth(4, 80);
    sheet.setColumnWidth(5, 130);
    sheet.setColumnWidth(6, 230);
    sheet.setColumnWidth(7, 170);
    sheet.setColumnWidth(8, 170);
    sheet.setColumnWidth(9, 80);
    sheet.setColumnWidth(10, 150);
    sheet.setColumnWidth(11, 150);
    sheet.setColumnWidth(12, 90);
    sheet.setColumnWidth(13, 150);
  }

  if (sheet.getLastRow() < 2) {
    seedMonthlyCleaningRows(sheet, year, month);
  } else {
    normalizeMonthlyCleaningRows(sheet, year, month);
  }

  return sheet;
}

function seedMonthlyCleaningRows(sheet, year, month) {
  var rows = [];
  var daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  var monthText = String(month).padStart(2, '0') + '.' + year;
  var tasks = getCleaningTaskDefinitions();

  for (var day = 1; day <= daysInMonth; day++) {
    var dateText = String(day).padStart(2, '0') + '.' + String(month).padStart(2, '0') + '.' + year;
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      rows.push([
        year + String(month).padStart(2, '0') + String(day).padStart(2, '0') + '-' + task.vardiya + '-' + task.sort,
        monthText,
        dateText,
        task.vardiya,
        task.role,
        task.area,
        '',
        '',
        '',
        '',
        '',
        '',
        ''
      ]);
    }
  }

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 13).setValues(rows);
    var dataRange = sheet.getRange(2, 1, rows.length, 13);
    dataRange.setHorizontalAlignment('center');
    dataRange.setBorder(true, true, true, true, true, true, '#d1d5db', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 6, rows.length, 1).setHorizontalAlignment('left');
  }
}

function normalizeMonthlyCleaningRows(sheet, year, month) {
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getDisplayValues();
  var daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  var expectedCount = daysInMonth * getCleaningTaskDefinitions().length;
  var needsNormalize = rows.length !== expectedCount;

  for (var i = 0; i < rows.length; i++) {
    if (rows[i][5] === 'Tuvalet/Banyo' || rows[i][5] === 'Soyunma Odasi ve Mutfak') {
      needsNormalize = true;
      break;
    }
  }

  if (!needsNormalize) return;

  var oldMap = {};
  for (var r = 0; r < rows.length; r++) {
    var key = rows[r][2] + '|' + rows[r][3] + '|' + rows[r][4] + '|' + rows[r][5];
    oldMap[key] = rows[r];
  }

  var rebuilt = buildMonthlyCleaningRows(year, month, oldMap);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).clearContent();
  }
  if (rebuilt.length) {
    sheet.getRange(2, 1, rebuilt.length, 13).setValues(rebuilt);
    var dataRange = sheet.getRange(2, 1, rebuilt.length, 13);
    dataRange.setHorizontalAlignment('center');
    dataRange.setBorder(true, true, true, true, true, true, '#d1d5db', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 6, rebuilt.length, 1).setHorizontalAlignment('left');
  }
}

function buildMonthlyCleaningRows(year, month, oldMap) {
  var rows = [];
  var daysInMonth = new Date(Number(year), Number(month), 0).getDate();
  var monthText = String(month).padStart(2, '0') + '.' + year;
  var tasks = getCleaningTaskDefinitions();

  for (var day = 1; day <= daysInMonth; day++) {
    var dateText = String(day).padStart(2, '0') + '.' + String(month).padStart(2, '0') + '.' + year;
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      var exact = oldMap ? oldMap[dateText + '|' + task.vardiya + '|' + task.role + '|' + task.area] : null;
      var legacyA = oldMap ? oldMap[dateText + '|08-16|Ana Vardiya|Tuvalet/Banyo'] : null;
      var legacyB = oldMap ? oldMap[dateText + '|08-16|Ana Vardiya|Soyunma Odasi ve Mutfak'] : null;
      var preserved = exact || null;

      if (!preserved && task.vardiya === '08-16' && task.role === 'Ana Vardiya') {
        preserved = mergeLegacyCleaningRows(legacyA, legacyB);
      }

      rows.push([
        year + String(month).padStart(2, '0') + String(day).padStart(2, '0') + '-' + task.vardiya + '-' + task.sort,
        monthText,
        dateText,
        task.vardiya,
        task.role,
        task.area,
        preserved ? preserved[6] : '',
        preserved ? preserved[7] : '',
        preserved ? preserved[8] : '',
        preserved ? preserved[9] : '',
        preserved ? preserved[10] : '',
        preserved ? preserved[11] : '',
        preserved ? preserved[12] : ''
      ]);
    }
  }

  return rows;
}

function mergeLegacyCleaningRows(rowA, rowB) {
  if (!rowA && !rowB) return null;
  var bothDone = (!rowA || rowA[8] === 'EVET') && (!rowB || rowB[8] === 'EVET');
  var base = rowA || rowB;
  var other = rowA && rowB ? rowB : null;
  var merged = base.slice();
  merged[8] = bothDone ? 'EVET' : '';
  merged[9] = bothDone ? ((other && other[9]) || base[9] || '') : '';
  merged[10] = (base[10] || (other && other[10]) || '');
  merged[11] = (base[11] || (other && other[11]) || '');
  merged[12] = (base[12] || (other && other[12]) || '');
  return merged;
}

function getMonthlyCleaningList(year, month) {
  try {
    var now = new Date();
    var targetYear = parseInt(year, 10) || now.getFullYear();
    var targetMonth = parseInt(month, 10) || (now.getMonth() + 1);
    var sheet = ensureCleaningSheet(targetYear, targetMonth);
    var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getDisplayValues();
    var data = rows.map(function(row) {
      return {
        id: row[0],
        ay: row[1],
        tarih: row[2],
        vardiya: row[3],
        rol: row[4],
        alan: row[5],
        sorumlu: row[6],
        yardimciOperator: row[7],
        yapildi: row[8],
        yapilmaZamani: row[9],
        kaydeden: row[10],
        vardiyaId: row[11],
        kayitTarihi: row[12]
      };
    });

    return {
      success: true,
      sheetName: sheet.getName(),
      year: targetYear,
      month: targetMonth,
      data: data
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function saveCleaningChecklist(data) {
  try {
    var tarih = formatDateTR(data.tarih || '');
    if (!tarih) return { success: false, error: 'Tarih eksik' };

    var dateParts = tarih.split('.');
    var year = parseInt(dateParts[2], 10);
    var month = parseInt(dateParts[1], 10);
    var sheet = ensureCleaningSheet(year, month);
    var vardiya = String(data.vardiya || '').trim();
    var taskPayload = JSON.parse(data.tasks || '[]');
    var taskMap = {};
    for (var i = 0; i < taskPayload.length; i++) {
      taskMap[String(taskPayload[i].role || '') + '|' + String(taskPayload[i].area || '')] = taskPayload[i];
    }

    if (sheet.getLastRow() < 2) {
      return { success: false, error: 'Temizlik listesi bos' };
    }

    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getDisplayValues();
    var updated = 0;
    var nowText = formatDateTimeTR(new Date());

    for (var row = 0; row < values.length; row++) {
      if (values[row][2] !== tarih || values[row][3] !== vardiya) continue;

      var key = values[row][4] + '|' + values[row][5];
      if (!Object.prototype.hasOwnProperty.call(taskMap, key)) continue;

      var task = taskMap[key];
      var sheetRow = row + 2;
      var responsible = values[row][4] === 'Yardimci Vardiya'
        ? (data.yardimciOperator || data.personel || '')
        : (data.personel || '');
      sheet.getRange(sheetRow, 7).setValue(responsible);
      sheet.getRange(sheetRow, 8).setValue(data.yardimciOperator || '');
      sheet.getRange(sheetRow, 9).setValue(task.done ? 'EVET' : '');
      sheet.getRange(sheetRow, 10).setValue(task.done ? (task.doneAt || nowText) : '');
      sheet.getRange(sheetRow, 11).setValue(data.kaydeden || data.personel || '');
      sheet.getRange(sheetRow, 12).setValue(data.vardiyaId || '');
      sheet.getRange(sheetRow, 13).setValue(nowText);
      updated++;
    }

    return {
      success: true,
      message: 'Temizlik kontrol listesi kaydedildi',
      updatedCount: updated,
      sheetName: sheet.getName()
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getCleaningChecklist(data) {
  try {
    var tarih = formatDateTR(data.tarih || '');
    var vardiya = String(data.vardiya || '').trim();
    var hasHelper = String(data.hasHelper || '').toLowerCase() === 'true';
    var dateParts = tarih.split('.');
    var year = parseInt(dateParts[2], 10);
    var month = parseInt(dateParts[1], 10);
    var sheet = ensureCleaningSheet(year, month);
    var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getDisplayValues();
    var tasks = [];

    for (var i = 0; i < rows.length; i++) {
      if (rows[i][2] !== tarih || rows[i][3] !== vardiya) continue;
      if (rows[i][4] === 'Yardimci Vardiya' && !hasHelper) continue;
      tasks.push({
        role: rows[i][4],
        area: rows[i][5],
        done: rows[i][8] === 'EVET',
        doneAt: rows[i][9],
        kaydeden: rows[i][10]
      });
    }

    return { success: true, sheetName: sheet.getName(), data: tasks };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
