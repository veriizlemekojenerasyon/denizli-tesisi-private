/**
 * Eski Bakım Takip sayfasından yeni yapıya veri aktarım scripti
 * 
 * Kullanım:
 * 1. Bu dosyayı Google Apps Script editörüne ekleyin
 * 2. migrateAllData() fonksiyonunu çalıştırın
 * 
 * Not: Eski veriler silinmez, sadece kopyalanır
 */

// Eski spreadsheet ID (verdiğiniz link)
const OLD_SPREADSHEET_ID = '1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI';

// Yeni spreadsheet ID (BakimTakip_GAS_Code.gs içindeki SPREADSHEET_ID ile aynı olmalı)
const NEW_SPREADSHEET_ID = '1g6ibbyoc8NmK788oqyxg2EJJGRfRrnPIuULvCRNaEjU';

// Prefix kullanmıyoruz - farklı spreadsheet'ler
const OLD_SHEET_PREFIX = '';  // Boş

// Aktarılacak sayfa isimleri
const SHEETS_TO_MIGRATE = [
  'Periyodik GM-1',
  'Periyodik GM-2',
  'Periyodik GM-3',
  'Yag Numune GM-1',
  'Yag Numune GM-2',
  'Yag Numune GM-3',
  'Yag Filtre Degisimi GM-1',
  'Yag Filtre Degisimi GM-2',
  'Yag Filtre Degisimi GM-3',
  'HT LT Ceket Suyu GM-1',
  'HT LT Ceket Suyu GM-2',
  'HT LT Ceket Suyu GM-3',
  'Alternator Gresleme GM-1',
  'Alternator Gresleme GM-2',
  'Alternator Gresleme GM-3',
  'Ariza GM-1',
  'Ariza GM-2',
  'Ariza GM-3'
];

/**
 * Ana migration fonksiyonu - Tüm verileri aktarır
 */
function migrateAllData() {
  try {
    Logger.log('=== BAKIM TAKIP VERİ AKTARIMI BAŞLADI ===');
    
    const oldSS = SpreadsheetApp.openById(OLD_SPREADSHEET_ID);
    const newSS = SpreadsheetApp.openById(NEW_SPREADSHEET_ID);
    
    let totalRecords = 0;
    let successCount = 0;
    let errorCount = 0;
    const report = [];
    
    SHEETS_TO_MIGRATE.forEach(function(sheetName) {
      Logger.log('\n--- ' + sheetName + ' işleniyor ---');
      
      // ESKİ sayfa adına prefix ekle
      const oldSheetName = OLD_SHEET_PREFIX + sheetName;
      const oldSheet = oldSS.getSheetByName(oldSheetName);
      
      if (!oldSheet) {
        Logger.log('UYARI: ' + oldSheetName + ' eski dosyada bulunamadı!');
        report.push({
          sheet: sheetName,
          status: 'SKIP',
          records: 0,
          message: 'Eski sayfada bulunamadı: ' + oldSheetName
        });
        return;
      }
      
      // YENİ sayfa adı normal (prefix yok)
      const newSheet = newSS.getSheetByName(sheetName);
      if (!newSheet) {
        Logger.log('UYARI: ' + sheetName + ' yeni dosyada bulunamadı! Önce action=init çalıştırın.');
        report.push({
          sheet: sheetName,
          status: 'ERROR',
          records: 0,
          message: 'Yeni sayfada bulunamadı'
        });
        errorCount++;
        return;
      }
      
      try {
        const result = migrateSheet(oldSheet, newSheet);
        totalRecords += result.records;
        successCount++;
        
        report.push({
          sheet: sheetName,
          status: 'SUCCESS',
          records: result.records,
          message: result.records + ' kayıt aktarıldı'
        });
        
        Logger.log('✓ ' + result.records + ' kayıt aktarıldı');
      } catch (error) {
        Logger.log('HATA: ' + error.toString());
        errorCount++;
        report.push({
          sheet: sheetName,
          status: 'ERROR',
          records: 0,
          message: error.toString()
        });
      }
    });
    
    Logger.log('\n=== AKTARIM TAMAMLANDI ===');
    Logger.log('Toplam sayfa: ' + SHEETS_TO_MIGRATE.length);
    Logger.log('Başarılı: ' + successCount);
    Logger.log('Hata: ' + errorCount);
    Logger.log('Toplam kayıt: ' + totalRecords);
    
    Logger.log('\n=== DETAYLI RAPOR ===');
    report.forEach(function(item) {
      Logger.log(item.sheet + ': ' + item.status + ' - ' + item.message);
    });
    
    return {
      success: errorCount === 0,
      totalSheets: SHEETS_TO_MIGRATE.length,
      successCount: successCount,
      errorCount: errorCount,
      totalRecords: totalRecords,
      report: report
    };
    
  } catch (error) {
    Logger.log('KRİTİK HATA: ' + error.toString());
    throw error;
  }
}

/**
 * Tek bir sayfanın verilerini aktarır
 */
function migrateSheet(oldSheet, newSheet) {
  const lastRow = oldSheet.getLastRow();
  
  if (lastRow <= 1) {
    Logger.log('Veri yok, atlanıyor');
    return { records: 0 };
  }
  
  // Eski sayfadan tüm verileri al (başlık dahil)
  const oldData = oldSheet.getRange(1, 1, lastRow, oldSheet.getLastColumn()).getValues();
  const oldHeaders = oldData[0];
  const oldRecords = oldData.slice(1);
  
  Logger.log('Eski sayfa: ' + oldRecords.length + ' kayıt, ' + oldHeaders.length + ' sütun');
  
  // Yeni sayfanın başlıklarını al
  const newHeaders = newSheet.getRange(1, 1, 1, newSheet.getLastColumn()).getValues()[0];
  Logger.log('Yeni sayfa: ' + newHeaders.length + ' sütun');
  
  // Sütun eşleştirmesi oluştur
  const columnMap = createColumnMap(oldHeaders, newHeaders);
  
  // Verileri yeni formata dönüştür
  const newRecords = oldRecords.map(function(oldRow) {
    return mapRecord(oldRow, oldHeaders, newHeaders, columnMap);
  });
  
  // Yeni sayfaya yaz
  if (newRecords.length > 0) {
    const newLastRow = newSheet.getLastRow();
    newSheet.getRange(newLastRow + 1, 1, newRecords.length, newHeaders.length).setValues(newRecords);
    Logger.log('Yazıldı: satır ' + (newLastRow + 1) + ' - ' + (newLastRow + newRecords.length));
  }
  
  return { records: newRecords.length };
}

/**
 * Eski ve yeni başlıklar arasında eşleştirme oluşturur
 */
function createColumnMap(oldHeaders, newHeaders) {
  const map = {};
  
  oldHeaders.forEach(function(oldHeader, oldIndex) {
    const normalized = normalizeHeader(oldHeader);
    
    // Yeni başlıklarda eşleşen var mı bul
    for (let newIndex = 0; newIndex < newHeaders.length; newIndex++) {
      if (normalizeHeader(newHeaders[newIndex]) === normalized) {
        map[oldIndex] = newIndex;
        break;
      }
    }
  });
  
  return map;
}

/**
 * Başlık ismini normalize eder (karşılaştırma için)
 */
function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[İI]/g, 'I')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ş/g, 'S')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');
}

/**
 * Bir kaydı eski formattan yeni formata dönüştürür
 */
function mapRecord(oldRow, oldHeaders, newHeaders, columnMap) {
  const newRow = new Array(newHeaders.length).fill('');
  
  // Eşleşen sütunları kopyala
  Object.keys(columnMap).forEach(function(oldIndex) {
    const newIndex = columnMap[oldIndex];
    let value = oldRow[oldIndex];
    
    // Saat sütunlarını kontrol et ve düzelt
    const headerName = normalizeHeader(newHeaders[newIndex]);
    if (headerName.indexOf('SAAT') !== -1 || 
        headerName.indexOf('SAATI') !== -1 ||
        headerName === 'BASLANGICSAATI' ||
        headerName === 'BITISSAATI') {
      
      // Eğer değer Date objesi ise, sadece saat kısmını al
      if (value instanceof Date) {
        value = formatTimeOnly(value);
      }
      // Eğer numeric değer ise (0.6 gibi), saate çevir
      else if (typeof value === 'number' && value > 0 && value < 1) {
        value = formatTimeFromDecimal(value);
      }
      // Eğer string ise ve tarih içeriyorsa, sadece saat kısmını al
      else if (typeof value === 'string' && value.indexOf('1899') !== -1) {
        var parts = value.split(' ');
        if (parts.length > 1) {
          value = parts[parts.length - 1]; // Son kısmı al (saat)
        }
      }
    }
    
    newRow[newIndex] = value;
  });
  
  return newRow;
}

/**
 * Date objesinden sadece saat formatı çıkarır (HH:MM)
 */
function formatTimeOnly(date) {
  if (!date || !(date instanceof Date)) return '';
  
  var hours = date.getHours();
  var minutes = date.getMinutes();
  
  return padZero(hours) + ':' + padZero(minutes);
}

/**
 * Decimal değerden saat formatı çıkarır (0.5 -> 12:00)
 */
function formatTimeFromDecimal(decimal) {
  if (!decimal || decimal < 0 || decimal >= 1) return '';
  
  var totalMinutes = Math.round(decimal * 24 * 60);
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  
  return padZero(hours) + ':' + padZero(minutes);
}

/**
 * Sayıyı 2 haneli string'e çevirir (9 -> "09")
 */
function padZero(num) {
  return num < 10 ? '0' + num : String(num);
}

/**
 * Sadece bir sayfayı test etmek için
 */
function testMigrateSingleSheet() {
  const testSheetName = 'Periyodik GM-1';
  
  Logger.log('Test: ' + testSheetName);
  
  const oldSS = SpreadsheetApp.openById(OLD_SPREADSHEET_ID);
  const newSS = SpreadsheetApp.openById(NEW_SPREADSHEET_ID);
  
  const oldSheetName = OLD_SHEET_PREFIX + testSheetName;
  const oldSheet = oldSS.getSheetByName(oldSheetName);
  const newSheet = newSS.getSheetByName(testSheetName);
  
  if (!oldSheet) {
    Logger.log('HATA: Eski sayfa bulunamadı: ' + oldSheetName);
    return;
  }
  
  if (!newSheet) {
    Logger.log('HATA: Yeni sayfa bulunamadı: ' + testSheetName + '. Önce action=init çalıştırın');
    return;
  }
  
  const result = migrateSheet(oldSheet, newSheet);
  Logger.log('Sonuç: ' + result.records + ' kayıt aktarıldı');
}

/**
 * Eski sayfadaki veri yapısını analiz eder
 */
function analyzeOldSheets() {
  Logger.log('=== ESKİ SAYFA ANALİZİ ===\n');
  
  const oldSS = SpreadsheetApp.openById(OLD_SPREADSHEET_ID);
  
  SHEETS_TO_MIGRATE.forEach(function(sheetName) {
    const oldSheetName = OLD_SHEET_PREFIX + sheetName;
    const sheet = oldSS.getSheetByName(oldSheetName);
    
    if (!sheet) {
      Logger.log(oldSheetName + ': BULUNAMADI');
      return;
    }
    
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow > 0) {
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      Logger.log('\n' + oldSheetName + ':');
      Logger.log('  Satır: ' + lastRow + ' (başlık dahil)');
      Logger.log('  Sütun: ' + lastCol);
      Logger.log('  Başlıklar: ' + headers.join(', '));
    } else {
      Logger.log(oldSheetName + ': BOŞ');
    }
  });
}

/**
 * Yeni sayfaların hazır olup olmadığını kontrol eder
 */
function checkNewSheets() {
  Logger.log('=== YENİ SAYFA KONTROLÜ ===\n');
  
  const newSS = SpreadsheetApp.openById(NEW_SPREADSHEET_ID);
  let allReady = true;
  
  SHEETS_TO_MIGRATE.forEach(function(sheetName) {
    const sheet = newSS.getSheetByName(sheetName);
    
    if (!sheet) {
      Logger.log('❌ ' + sheetName + ': BULUNAMADI');
      allReady = false;
    } else {
      const lastCol = sheet.getLastColumn();
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      Logger.log('✓ ' + sheetName + ': HAZIR (' + lastCol + ' sütun)');
    }
  });
  
  if (allReady) {
    Logger.log('\n✓ Tüm sayfalar hazır! migrateAllData() çalıştırabilirsiniz.');
  } else {
    Logger.log('\n❌ Bazı sayfalar eksik! Önce şu linki çalıştırın:');
    Logger.log('https://script.google.com/macros/s/AKfycbyrBtgc3spsh4jCpVtojfiFac5La8WKzh0Hlazndj0w-O-GCpMzYwCNevUJReXUI_zV/exec?action=init');
  }
  
  return allReady;
}

/**
 * Eski sayfaları yedeklemek için prefix ekler
 * Bu fonksiyonu çalıştırarak eski sayfaları "ESKİ_" ile başlayacak şekilde yeniden adlandırın
 */
function renameOldSheetsWithPrefix() {
  Logger.log('=== ESKİ SAYFALARI YENİDEN ADLANDIRMA ===\n');
  
  const ss = SpreadsheetApp.openById(OLD_SPREADSHEET_ID);
  let renamedCount = 0;
  let skipCount = 0;
  
  SHEETS_TO_MIGRATE.forEach(function(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      Logger.log('⚠️ ' + sheetName + ': Bulunamadı, atlanıyor');
      skipCount++;
      return;
    }
    
    const newName = OLD_SHEET_PREFIX + sheetName;
    
    // Zaten prefix'li isim varsa çakışma olmasın
    const existingSheet = ss.getSheetByName(newName);
    if (existingSheet) {
      Logger.log('❌ ' + newName + ': Zaten var! Manuel kontrol edin.');
      skipCount++;
      return;
    }
    
    try {
      sheet.setName(newName);
      Logger.log('✓ ' + sheetName + ' → ' + newName);
      renamedCount++;
    } catch (error) {
      Logger.log('❌ ' + sheetName + ': Hata - ' + error.toString());
      skipCount++;
    }
  });
  
  Logger.log('\n=== SONUÇ ===');
  Logger.log('Yeniden adlandırılan: ' + renamedCount);
  Logger.log('Atlanan: ' + skipCount);
  Logger.log('Toplam: ' + SHEETS_TO_MIGRATE.length);
  
  if (renamedCount > 0) {
    Logger.log('\n✓ Şimdi action=init ile yeni sayfaları oluşturun:');
    Logger.log('https://script.google.com/macros/s/AKfycbyrBtgc3spsh4jCpVtojfiFac5La8WKzh0Hlazndj0w-O-GCpMzYwCNevUJReXUI_zV/exec?action=init');
  }
}
