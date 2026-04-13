/**
 * BUHAR VERİSİ - Google Apps Script Kodu
 * Bu dosya Google Sheets > Extensions > Apps Script'e yapıştırılacak
 * 
 * Kurulum Adımları:
 * 1. Google Sheets'de yeni bir sayfa oluşturun
 * 2. Sheet adını "BuharVerileri" yapın
 * 3. İlk satır başlıkları: Tarih | Buhar (Ton) | Kaydeden | Kayıt Tarihi
 * 4. Extensions > Apps Script'e gidin
 * 5. Bu kodu yapıştırın
 * 6. Deploy > New Deployment > Web App seçin
 * 7. Execute as: Me, Who has access: Anyone seçin
 * 8. URL'i kopyalayın ve buhar-sheets-config.js'e yapıştırın
 */

// CORS ayarları - tüm origin'lere izin ver
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
      case 'getRecords':
        result = getRecords();
        break;
      case 'getLastRecords':
        result = getLastRecords(parseInt(e.parameter.count) || 32);
        break;
      default:
        result = { success: false, error: 'Geçersiz işlem' };
    }
    
    lock.releaseLock();
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    lock.releaseLock();
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Yeni kayıt ekle
function addRecord(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('BuharVerileri');
    
    // Sayfa yoksa otomatik oluştur
    if (!sheet) {
      sheet = spreadsheet.insertSheet('BuharVerileri');
      
      // Başlık satırını ekle
      var headers = ['Tarih', 'Buhar (Ton)', 'Kaydeden', 'Kayıt Tarihi'];
      sheet.appendRow(headers);
      
      // Başlık formatı - arka plan, yazı rengi, kalınlık
      var headerRange = sheet.getRange(1, 1, 1, 4);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#3498db');
      headerRange.setFontColor('#ffffff');
      headerRange.setHorizontalAlignment('center');
      
      // Sütun genişliklerini ayarla
      sheet.setColumnWidth(1, 120); // Tarih
      sheet.setColumnWidth(2, 150); // Buhar (Ton)
      sheet.setColumnWidth(3, 150); // Kaydeden
      sheet.setColumnWidth(4, 180); // Kayıt Tarihi
      
      // Kenarlıklar ekle
      headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
      
      // Sütun formatlarını ayarla
      // Tarih sütunu: Metin formatı ( düzgün görünüm için)
      sheet.getRange(2, 1, 1000, 1).setNumberFormat('@');
      // Buhar sütunu: Sayı formatı (2 ondalık)
      sheet.getRange(2, 2, 1000, 1).setNumberFormat('0.00');
      // Kaydeden sütunu: Metin formatı
      sheet.getRange(2, 3, 1000, 1).setNumberFormat('@');
      // Kayıt Tarihi sütunu: Metin formatı
      sheet.getRange(2, 4, 1000, 1).setNumberFormat('@');
      
      Logger.log('BuharVerileri sayfası otomatik olarak oluşturuldu.');
    }
    
    // Aynı tarih için kayıt var mı kontrol et
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      
      // Input tarihini dd.MM.yyyy formatına çevir (2026-03-27 -> 27.03.2026)
      var inputTarih = data.tarih;
      var inputParts = inputTarih.split('-');
      var formattedInputTarih = inputParts[2] + '.' + inputParts[1] + '.' + inputParts[0];
      
      for (var i = 0; i < dates.length; i++) {
        var dateValue = dates[i][0];
        if (dateValue instanceof Date) {
          dateValue = Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'dd.MM.yyyy');
        }
        // String olarak karşılaştır
        if (dateValue === formattedInputTarih) {
          return { success: false, error: 'Bu tarih için kayıt zaten var!' };
        }
      }
    }
    
    // Kayıt ekle
    var kayitTarihi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
    
    // Tarih formatını düzelt (2026-03-27 -> 27.03.2026)
    var tarihParts = data.tarih.split('-');
    var formattedTarih = tarihParts[2] + '.' + tarihParts[1] + '.' + tarihParts[0];
    
    sheet.appendRow([
      formattedTarih,
      parseFloat(data.buharMiktari),
      data.kaydeden || 'Admin',
      kayitTarihi
    ]);
    
    // Yeni eklenen satırın formatını ayarla
    var newRow = sheet.getLastRow();
    var dataRange = sheet.getRange(newRow, 1, 1, 4);
    dataRange.setHorizontalAlignment('center');
    dataRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    // Sütun formatlarını koru
    sheet.getRange(newRow, 1).setNumberFormat('@');
    sheet.getRange(newRow, 2).setNumberFormat('0.00');
    sheet.getRange(newRow, 3).setNumberFormat('@');
    sheet.getRange(newRow, 4).setNumberFormat('@');
    
    return { success: true, message: 'Kayıt başarıyla eklendi!' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tüm kayıtları getir
function getRecords() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('BuharVerileri');
    
    // Sayfa yoksa boş sonuç döndür (oluşturma)
    if (!sheet) {
      return { success: true, data: [], message: 'Sayfa henüz oluşturulmamış. İlk kayıtla birlikte otomatik oluşacak.' };
    }
    
    if (sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getDisplayValues();
    var records = [];
    
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      
      records.push({
        tarih: row[0],
        buharMiktari: row[1],
        kaydeden: row[2],
        kayitTarihi: row[3]
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
