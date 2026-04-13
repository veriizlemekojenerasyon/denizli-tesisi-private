/**
 * GUNLUK VERI GIRISI - Google Apps Script Kodu (Sadeleştirilmiş)
 * - ID sütunu eklendi (otomatik artan)
 * - Düzenleme geçmişi ayrı sayfada (GunlukVeriler_Gecmis)
 * - 14 sütun (sade yapı)
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
    var sheet = spreadsheet.getSheetByName('GunlukVeriler');
    
    // Sayfa yoksa otomatik oluştur
    if (!sheet) {
      sheet = spreadsheet.insertSheet('GunlukVeriler');
      
      // Başlıklar (15 sütun - sade + açıklama)
      var headers = [
        'ID', 'Tarih', 'Yağ Seviyesi (LT)', 'Kuplaj (MWH)', 
        'GM-1 (MWH)', 'GM-2 (MWH)', 'GM-3 (MWH)',
        'İç İhtiyaç (MWH)', 'Redresör-1 (MWH)', 'Redresör-2 (MWH)',
        'Kojen İç İhtiyaç (KWH)', 'Servis Trafo (MWH)',
        'Kaydeden', 'Kayıt Tarihi', 'Düzeltme Açıklaması'
      ];
      
      sheet.appendRow(headers);
      
      // Başlık formatı (15 sütun)
      var headerRange = sheet.getRange(1, 1, 1, 15);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#3498db');
      headerRange.setFontColor('#ffffff');
      headerRange.setHorizontalAlignment('center');
      
      // Sütun genişlikleri (15 sütun)
      sheet.setColumnWidth(1, 60);    // ID
      sheet.setColumnWidth(2, 100);   // Tarih
      sheet.setColumnWidth(3, 120);   // Yağ Seviyesi
      sheet.setColumnWidth(4, 110);   // Kuplaj
      sheet.setColumnWidth(5, 90);    // GM-1
      sheet.setColumnWidth(6, 90);    // GM-2
      sheet.setColumnWidth(7, 90);    // GM-3
      sheet.setColumnWidth(8, 100);   // İç İhtiyaç
      sheet.setColumnWidth(9, 110);   // Redresör-1
      sheet.setColumnWidth(10, 110);  // Redresör-2
      sheet.setColumnWidth(11, 140);  // Kojen İç İhtiyaç
      sheet.setColumnWidth(12, 110);  // Servis Trafo
      sheet.setColumnWidth(13, 100);  // Kaydeden
      sheet.setColumnWidth(14, 140);  // Kayıt Tarihi
      sheet.setColumnWidth(15, 200);  // Düzeltme Açıklaması
      
      // Kenarlıklar
      headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
      
      // Sütun formatları
      sheet.getRange(2, 1, 1000, 2).setNumberFormat('@');     // ID ve Tarih metin
      sheet.getRange(2, 3, 1000, 10).setNumberFormat('0.00');  // Sayısal
      sheet.getRange(2, 13, 1000, 2).setNumberFormat('@');    // Metin sütunları
      sheet.setColumnWidth(18, 140);  // Kojen İç İhtiyaç
      sheet.setColumnWidth(19, 140);  // Kojen İç İhtiyaç Önceki
      sheet.setColumnWidth(20, 110);  // Servis Trafo
      sheet.setColumnWidth(21, 110);  // Servis Trafo Önceki
      sheet.setColumnWidth(22, 100);  // Kaydeden
      sheet.setColumnWidth(23, 130);  // Kayıt Tarihi
      sheet.setColumnWidth(24, 130);  // Düzeltme Tarihi
      sheet.setColumnWidth(25, 130);  // Düzelten Kullanıcı
      
      // Kenarlıklar
      headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
      
      // Sütun formatları
      sheet.getRange(2, 1, 1000, 1).setNumberFormat('@');     // Tarih metin
      sheet.getRange(2, 2, 1000, 20).setNumberFormat('0.00'); // Sayısal
      sheet.getRange(2, 22, 1000, 4).setNumberFormat('@');    // Metin sütunları
      
      Logger.log('GunlukVeriler sayfası otomatik olarak oluşturuldu.');
    }
    
    // Aynı tarih için kayıt var mı kontrol et ve ID ata
    var lastRow = sheet.getLastRow();
    var nextID = 1;
    
    if (lastRow > 1) {
      var dates = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
      var inputTarih = formatDateTR(data.tarih);
      
      for (var i = 0; i < dates.length; i++) {
        if (dates[i][0] === inputTarih) {
          return { success: false, error: 'Bu tarih için kayıt zaten var! Düzenleme yapın.' };
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
    
    // Kayıt ekle (14 sütun)
    var kayitTarihi = formatDateTimeTR(new Date());
    var formattedTarih = formatDateTR(data.tarih);
    
    sheet.appendRow([
      nextID.toString(),
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
      kayitTarihi,
      ''  // Düzeltme Açıklaması (boş)
    ]);
    
    // Yeni satır formatı
    var newRow = sheet.getLastRow();
    sheet.getRange(newRow, 1, 1, 15).setHorizontalAlignment('center');
    sheet.getRange(newRow, 1, 1, 15).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    return { success: true, message: 'Kayıt başarıyla eklendi! (ID: ' + nextID + ')' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Kayıt güncelle
function updateRecord(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('GunlukVeriler');
    
    if (!sheet) {
      return { success: false, error: 'Sayfa bulunamadı!' };
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    // Tarihi bul (sütun 2'de)
    var dates = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    var targetTarih = formatDateTR(data.tarih);
    var foundRow = -1;
    var recordID = '';
    
    for (var i = 0; i < dates.length; i++) {
      if (dates[i][0] === targetTarih) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    // ID'yi al
    recordID = sheet.getRange(foundRow, 1).getDisplayValue();
    
    // Düzeltme öncesi verileri al (14 sütun)
    var oldValues = sheet.getRange(foundRow, 1, 1, 14).getDisplayValues()[0];
    
    // Geçmiş sayfasına kaydet
    var historySheet = spreadsheet.getSheetByName('GunlukVeriler_Gecmis');
    if (!historySheet) {
      historySheet = spreadsheet.insertSheet('GunlukVeriler_Gecmis');
      var historyHeaders = [
        'Orjinal ID', 'Tarih', 'Yağ Seviyesi (LT)', 'Kuplaj (MWH)', 
        'GM-1 (MWH)', 'GM-2 (MWH)', 'GM-3 (MWH)',
        'İç İhtiyaç (MWH)', 'Redresör-1 (MWH)', 'Redresör-2 (MWH)',
        'Kojen İç İhtiyaç (KWH)', 'Servis Trafo (MWH)',
        'Kaydeden', 'Kayıt Tarihi', 'Düzeltme Tarihi', 'Düzelten Kullanıcı'
      ];
      historySheet.appendRow(historyHeaders);
      var hRange = historySheet.getRange(1, 1, 1, 16);
      hRange.setFontWeight('bold');
      hRange.setBackground('#9b59b6');
      hRange.setFontColor('#ffffff');
    }
    
    // Eski değerleri geçmiş sayfasına kaydet
    var duzeltmeTarihi = formatDateTimeTR(new Date());
    historySheet.appendRow([
      oldValues[0],  // Orjinal ID
      oldValues[1],  // Tarih
      oldValues[2], oldValues[3], oldValues[4], oldValues[5], oldValues[6],
      oldValues[7], oldValues[8], oldValues[9], oldValues[10], oldValues[11],
      oldValues[12], oldValues[13],  // Kaydeden ve Kayıt Tarihi
      duzeltmeTarihi,
      data.duzeltenKullanici || 'Admin'
    ]);
    
    // Yeni verileri güncelle (ID ve Tarih değişmez)
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
    sheet.getRange(foundRow, 14).setValue(duzeltmeTarihi); // Kayıt Tarihi güncelle
    sheet.getRange(foundRow, 15).setValue(data.aciklama || ''); // Düzeltme Açıklaması
    
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
    var sheet = spreadsheet.getSheetByName('GunlukVeriler');
    
    if (!sheet) {
      return { success: true, data: [], message: 'Sayfa henüz oluşturulmamış.' };
    }
    
    if (sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getDisplayValues();
    var records = [];
    
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      records.push({
        id: row[0],
        tarih: row[1],
        yagSeviyesi: row[2],
        kuplaj: row[3],
        gm1: row[4],
        gm2: row[5],
        gm3: row[6],
        icihtiyac: row[7],
        redresor1: row[8],
        redresor2: row[9],
        kojenIcihtiyac: row[10],
        servisTrafo: row[11],
        kaydeden: row[12],
        kayitTarihi: row[13],
        aciklama: row[14]
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
