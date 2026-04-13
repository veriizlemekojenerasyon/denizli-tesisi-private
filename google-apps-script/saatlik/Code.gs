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
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    var action = e.parameter.action;
    var result = {};
    
    switch(action) {
      case 'addRecord':
        result = addRecord(e.parameter);
        break;
      case 'updateRecord':
        result = updateRecord(e.parameter);
        break;
      case 'getRecords':
        result = getRecords();
        break;
      case 'getLastRecords':
        result = getLastRecords(parseInt(e.parameter.count) || 48);
        break;
      case 'getRecordByDateTime':
        result = getRecordByDateTime(e.parameter.tarih, e.parameter.saat);
        break;
      default:
        result = { success: false, error: 'Geçersiz işlem' };
    }
    
    lock.releaseLock();
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    lock.releaseLock();
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Yeni kayıt ekle
function addRecord(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('SaatlikVeriler');
    
    // Sayfa yoksa otomatik oluştur
    if (!sheet) {
      sheet = spreadsheet.insertSheet('SaatlikVeriler');
      
      // Başlıklar (10 sütun - Aydem alanları eklendi)
      var headers = [
        'ID', 'Tarih', 'Saat', 'Vardiya',
        'Aktif Enerji (MWh)', 'Reaktif Enerji (kVArh)',
        'Aydem Aktif (MWh)', 'Aydem Reaktif (kVArh)',
        'Notlar', 'Kayıt Tarihi'
      ];
      
      sheet.appendRow(headers);
      
      // Başlık formatı (10 sütun)
      var headerRange = sheet.getRange(1, 1, 1, 10);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#3498db');
      headerRange.setFontColor('#ffffff');
      headerRange.setHorizontalAlignment('center');
      
      // Sütun genişlikleri (10 sütun)
      sheet.setColumnWidth(1, 60);    // ID
      sheet.setColumnWidth(2, 100);   // Tarih
      sheet.setColumnWidth(3, 80);    // Saat
      sheet.setColumnWidth(4, 100);   // Vardiya
      sheet.setColumnWidth(5, 140);   // Aktif Enerji
      sheet.setColumnWidth(6, 160);   // Reaktif Enerji
      sheet.setColumnWidth(7, 140);   // Aydem Aktif
      sheet.setColumnWidth(8, 160);   // Aydem Reaktif
      sheet.setColumnWidth(9, 250);   // Notlar
      sheet.setColumnWidth(10, 140);  // Kayıt Tarihi
      
      // Kenarlıklar
      headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
      
      // Sütun formatları
      sheet.getRange(2, 1, 1000, 4).setNumberFormat('@');     // ID, Tarih, Saat, Vardiya metin
      sheet.getRange(2, 5, 1000, 4).setNumberFormat('0.000');  // Sayısal değerler (4 sütun)
      sheet.getRange(2, 9, 1000, 2).setNumberFormat('@');      // Notlar ve Kayıt Tarihi
      
      Logger.log('SaatlikVeriler sayfası otomatik olarak oluşturuldu.');
    }
    
    // Aynı tarih ve saat için kayıt var mı kontrol et
    var lastRow = sheet.getLastRow();
    var nextID = 1;
    
    if (lastRow > 1) {
      var dates = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
      var times = sheet.getRange(2, 3, lastRow - 1, 1).getDisplayValues();
      var inputTarih = formatDateTR(data.tarih);
      var inputSaat = data.saat;
      
      for (var i = 0; i < dates.length; i++) {
        if (dates[i][0] === inputTarih && times[i][0] === inputSaat) {
          return { success: false, error: 'Bu tarih ve saat için kayıt zaten var! Düzenleme yapın.' };
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
    var formattedTarih = formatDateTR(data.tarih);
    
    sheet.appendRow([
      nextID.toString(),
      formattedTarih,
      data.saat,
      data.vardiya,
      parseFloat(data.aktifMwh) || 0,
      parseFloat(data.reaktifMwh) || 0,
      parseFloat(data.aydemAktif) || 0,
      parseFloat(data.aydemReaktif) || 0,
      data.notlar || '',
      kayitTarihi
    ]);
    
    // Yeni satır formatı
    var newRow = sheet.getLastRow();
    sheet.getRange(newRow, 1, 1, 10).setHorizontalAlignment('center');
    sheet.getRange(newRow, 1, 1, 10).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    return { success: true, message: 'Kayıt başarıyla eklendi! (ID: ' + nextID + ')' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Kayıt güncelle
function updateRecord(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('SaatlikVeriler');
    
    if (!sheet) {
      return { success: false, error: 'Sayfa bulunamadı!' };
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    // Tarih ve saati bul
    var dates = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    var times = sheet.getRange(2, 3, lastRow - 1, 1).getDisplayValues();
    var targetTarih = formatDateTR(data.tarih);
    var targetSaat = data.saat;
    var foundRow = -1;
    var recordID = '';
    
    for (var i = 0; i < dates.length; i++) {
      if (dates[i][0] === targetTarih && times[i][0] === targetSaat) {
        foundRow = i + 2;
        break;
      }
    }
    
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
    sheet.getRange(foundRow, 9).setValue(data.notlar || '');
    sheet.getRange(foundRow, 10).setValue(formatDateTimeTR(new Date()));
    
    Logger.log('Satır ' + foundRow + ' (ID: ' + recordID + ') güncellendi.');
    
    return { success: true, message: 'Kayıt başarıyla güncellendi! (ID: ' + recordID + ')' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tüm kayıtları getir
function getRecords() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('SaatlikVeriler');
    
    if (!sheet) {
      return { success: true, data: [], message: 'Sayfa henüz oluşturulmamış.' };
    }
    
    if (sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getDisplayValues();
    var records = [];
    
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      records.push({
        id: row[0],
        tarih: row[1],
        saat: row[2],
        vardiya: row[3],
        aktifMwh: row[4],
        reaktifMwh: row[5],
        aydemAktif: row[6],
        aydemReaktif: row[7],
        notlar: row[8],
        kayitTarihi: row[9]
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

// Tarih ve saate göre kayıt getir
function getRecordByDateTime(tarih, saat) {
  try {
    var result = getRecords();
    if (!result.success) return result;
    
    var formattedTarih = formatDateTR(tarih);
    var record = result.data.find(r => r.tarih === formattedTarih && r.saat === saat);
    
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
