/**
 * KOJEN MOTOR VERİLERİ - Google Apps Script Kodu
 * Bu dosya Google Sheets > Extensions > Apps Script'e yapıştırılacak
 * 
 * Kurulum Adımları:
 * 1. Google Sheets'de yeni bir sayfa oluşturun
 * 2. Sheet adını "KojenMotorVerileri" yapın
 * 3. İlk satır başlıkları: Tarih | Vardiya | Saat | Motor | JEN. YATAK SIC. (DE) | JEN. YATAK SIC. (NDE) | SOĞUTMA SUYU SIC. | SOĞUTMA SUYU BAS. | YAĞ SIC. | YAĞ BAS. | ŞARJ SIC. | ŞARJ BAS. | GAZ REG. (λ) | MAKİNE DAİRESİ SIC. | KARTER BAS. | ÖN KAMARA FARK BAS. | SARGI SIC. -1- | SARGI SIC. -2- | SARGI SIC. -3- | Durum | Kaydeden | Kayıt Tarihi
 * 4. Extensions > Apps Script'e gidin
 * 5. Bu kodu yapıştırın
 * 6. Deploy > New Deployment > Web App seçin
 * 7. Execute as: Me, Who has access: Anyone seçin
 * 8. URL'i kopyalayın ve kojen-motor-config.js'e yapıştırın
 */

// CORS ayarları - tüm origin'lere izin ver
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
      case 'addRecord':
        result = addRecord(params);
        break;
      case 'getRecords':
        result = getRecords();
        break;
      case 'getRecordsByDate':
        result = getRecordsByDate(params.tarih);
        break;
      case 'getRecordsByMotorAndDate':
        result = getRecordsByMotorAndDate(params.motor, params.tarih);
        break;
      case 'checkExistingRecord':
        result = checkExistingRecord(params.motor, params.tarih, params.saat);
        break;
      case 'checkMultipleRecords':
        result = checkMultipleRecords(params.data);
        break;
      case 'addMultipleRecords':
        result = addMultipleRecords(params.data);
        break;
      case 'getLastRecords':
        result = getLastRecords(parseInt(params.count) || 50);
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
        result = { success: false, error: 'Geçersiz işlem' };
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
  return ['addRecord', 'addMultipleRecords', 'sendEmail', 'checkHourlyMissingRecords', 'installHourlyMissingRecordTrigger'].indexOf(action) !== -1;
}

function normalizeDateTR(tarih) {
  var value = String(tarih || '').trim();
  if (value.indexOf('-') !== -1) {
    var parts = value.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  return value;
}

function getMotorSheetIfExists(motor) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Motor GM-' + motor);
}

function mapMotorRow(row) {
  return {
    tarih: row[0],
    vardiya: row[1],
    saat: row[2],
    motor: row[3],
    jenYatakSicaklikDE: row[4],
    jenYatakSicaklikNDE: row[5],
    sogutmaSuyuSicaklik: row[6],
    sogutmaSuyuBasinc: row[7],
    yagSicaklik: row[8],
    yagBasinc: row[9],
    sarjSicaklik: row[10],
    sarjBasinc: row[11],
    gazRegulatoru: row[12],
    makineDairesiSicaklik: row[13],
    karterBasinc: row[14],
    onKamaraFarkBasinc: row[15],
    sargiSicaklik1: row[16],
    sargiSicaklik2: row[17],
    sargiSicaklik3: row[18],
    durum: row[19],
    kaydeden: row[20],
    kayitTarihi: row[21]
  };
}

// 🔥 MOTOR BAZLI SAYFA GETİRME FONKSİYONU
function getOrCreateSheet(motor) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Motor bazlı sayfa adı
  var sheetName = 'Motor GM-' + motor;
  var sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    
    // Başlık satırını ekle
    var headers = [
      'Tarih', 'Vardiya', 'Saat', 'Motor',
      'JEN. YATAK SIC. (DE)', 'JEN. YATAK SIC. (NDE)',
      'SOĞUTMA SUYU SIC.', 'SOĞUTMA SUYU BAS.',
      'YAĞ SIC.', 'YAĞ BAS.',
      'ŞARJ SIC.', 'ŞARJ BAS.',
      'GAZ REG. (λ)', 'MAKİNE DAİRESİ SIC.',
      'KARTER BAS.', 'ÖN KAMARA FARK BAS.',
      'SARGI SIC. -1-', 'SARGI SIC. -2-', 'SARGI SIC. -3-',
      'Durum', 'Kaydeden', 'Kayıt Tarihi'
    ];
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]).setFontWeight('bold');
    headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    
    console.log('📄 Yeni motor sayfası oluşturuldu: ' + sheetName);
    
    // Sütun genişliklerini ayarla
    sheet.setColumnWidth(1, 100);  // Tarih
    sheet.setColumnWidth(2, 80);   // Vardiya
    sheet.setColumnWidth(3, 60);   // Saat
    sheet.setColumnWidth(4, 80);   // Motor
    sheet.setColumnWidth(5, 120);  // JEN. YATAK SIC. (DE)
    sheet.setColumnWidth(6, 120);  // JEN. YATAK SIC. (NDE)
    sheet.setColumnWidth(7, 120);  // SOĞUTMA SUYU SIC.
    sheet.setColumnWidth(8, 120);  // SOĞUTMA SUYU BAS.
    sheet.setColumnWidth(9, 80);   // YAĞ SIC.
    sheet.setColumnWidth(10, 80);  // YAĞ BAS.
    sheet.setColumnWidth(11, 80);  // ŞARJ SIC.
    sheet.setColumnWidth(12, 80);  // ŞARJ BAS.
    sheet.setColumnWidth(13, 100); // GAZ REG. (λ)
    sheet.setColumnWidth(14, 130); // MAKİNE DAİRESİ SIC.
    sheet.setColumnWidth(15, 90);  // KARTER BAS.
    sheet.setColumnWidth(16, 140); // ÖN KAMARA FARK BAS.
    sheet.setColumnWidth(17, 100); // SARGI SIC. -1-
    sheet.setColumnWidth(18, 100); // SARGI SIC. -2-
    sheet.setColumnWidth(19, 100); // SARGI SIC. -3-
    sheet.setColumnWidth(20, 120); // Durum
    sheet.setColumnWidth(21, 100); // Kaydeden
    sheet.setColumnWidth(22, 150); // Kayıt Tarihi
    
    // Sütun formatlarını ayarla
    sheet.getRange(2, 1, 1000, 1).setNumberFormat('@'); // Tarih
    sheet.getRange(2, 2, 1000, 1).setNumberFormat('@'); // Vardiya
    sheet.getRange(2, 3, 1000, 1).setNumberFormat('@'); // Saat
    sheet.getRange(2, 4, 1000, 1).setNumberFormat('@'); // Motor
    sheet.getRange(2, 5, 1000, 15).setNumberFormat('0.00'); // Tüm sayısal değerler
    sheet.getRange(2, 20, 1000, 1).setNumberFormat('@'); // Durum
    sheet.getRange(2, 21, 1000, 1).setNumberFormat('@'); // Kaydeden
    sheet.getRange(2, 22, 1000, 1).setNumberFormat('@'); // Kayıt Tarihi
    
    Logger.log('KojenMotorVerileri sayfası otomatik olarak oluşturuldu.');
  }
  
  return sheet;
}

// Yeni kayıt ekle (Motor Bazlı)
function addRecord(data) {
  try {
    // Motor bilgisinden sayfa adı belirle
    var motor = data.motor || '1';
    var sheet = getOrCreateSheet(motor);
    
    // Zorunlu alanları kontrol et
    if (!data.tarih || !data.vardiya || !data.saat || !data.motor) {
      return { success: false, error: 'Tarih, vardiya, saat ve motor zorunludur!' };
    }
    
    // Aynı tarih, saat ve motor için kayıt var mı kontrol et
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var allData = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
      var inputTarih = normalizeDateTR(data.tarih);
      var inputSaat = String(data.saat || '').trim();

      for (var i = 0; i < allData.length; i++) {
        var row = allData[i];
        var rowTarih = String(row[0] || '').trim();
        var rowSaat = String(row[2] || '').trim();

        if (rowTarih === inputTarih && rowSaat === inputSaat) {
          return { success: false, error: 'Bu tarih, saat ve motor için kayıt zaten var!' };
        }
      }
    }
    
    // Tarih formatını düzelt ve Sheets formatına çevir
    var formattedTarih = normalizeDateTR(data.tarih);
    
    // dd.MM.yyyy formatını tarih nesnesine çevir
    var tarihObj;
    if (formattedTarih.includes('.')) {
      var tarihParts = formattedTarih.split('.');
      tarihObj = new Date(tarihParts[2], tarihParts[1] - 1, tarihParts[0]);
    } else {
      tarihObj = new Date(formattedTarih);
    }
    
    // Kayıt zamanı
    var kayitTarihi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
    
    // Verileri al (Motor çalışmıyor durumu kontrolü)
    var durum = data.durum || 'NORMAL';
    var kaydeden = data.kaydeden || 'Admin';
    
    // Eğer motor çalışmıyorsa, tüm değerleri 0 olarak kaydet
    var values;
    if (durum === 'MOTOR ÇALIŞMIYOR') {
      values = [
        tarihObj, data.vardiya, data.saat, data.motor,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        durum, kaydeden, kayitTarihi
      ];
    } else {
      values = [
        tarihObj,
        data.vardiya,
        data.saat,
        data.motor,
        parseFloat(data.jenYatakSicaklikDE) || 0,
        parseFloat(data.jenYatakSicaklikNDE) || 0,
        parseFloat(data.sogutmaSuyuSicaklik) || 0,
        parseFloat(data.sogutmaSuyuBasinc) || 0,
        parseFloat(data.yagSicaklik) || 0,
        parseFloat(data.yagBasinc) || 0,
        parseFloat(data.sarjSicaklik) || 0,
        parseFloat(data.sarjBasinc) || 0,
        parseFloat(data.gazRegulatoru) || 0,
        parseFloat(data.makineDairesiSicaklik) || 0,
        parseFloat(data.karterBasinc) || 0,
        parseFloat(data.onKamaraFarkBasinc) || 0,
        parseFloat(data.sargiSicaklik1) || 0,
        parseFloat(data.sargiSicaklik2) || 0,
        parseFloat(data.sargiSicaklik3) || 0,
        durum,
        kaydeden,
        kayitTarihi
      ];
    }
    
    // Kayıt ekle
    var insertRow = sheet.getLastRow() + 1;
    sheet.getRange(insertRow, 1, 1, 22).setValues([values]);
    
    // Yeni eklenen satırın formatını ayarla
    var newRow = insertRow;
    var dataRange = sheet.getRange(newRow, 1, 1, 22);
    dataRange.setHorizontalAlignment('center');
    dataRange.setFontSize(10);
    dataRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    // Sayısal sütunları ortala
    sheet.getRange(newRow, 5, 1, 15).setNumberFormat('0.00');
    
    // Motor çalışmıyor durumunda kırmızı arka plan
    if (durum === 'MOTOR ÇALIŞMIYOR') {
      dataRange.setBackground('#ffebee');
      dataRange.setFontColor('#c62828');
    }
    
    return { success: true, message: data.motor + ' motoru için kayıt başarıyla eklendi!' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tüm kayıtları getir (Tüm Motor Sayfalarından)
function getRecords() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = spreadsheet.getSheets();
    var records = [];
    
    // Sadece Motor GM-* sayfalarını işle
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var sheetName = sheet.getName();
      
      // Sadece motor sayfalarını işle
      if (!sheetName.startsWith('Motor GM-')) {
        continue;
      }
      
      console.log('📊 Motor sayfası okunuyor: ' + sheetName);
      
      if (sheet.getLastRow() < 2) {
        continue;
      }
      
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 22).getDisplayValues();
      
      for (var j = data.length - 1; j >= 0; j--) {
        var row = data[j];
        
        records.push(mapMotorRow(row));
      }
    }
    
    console.log('📊 Toplam ' + records.length + ' motor kaydı okundu');
    return { success: true, data: records };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tarihe göre kayıtları getir
function getRecordsByDate(tarih) {
  try {
    var allRecords = getRecords();
    if (!allRecords.success) return allRecords;
    
    // Tarih formatını normalize et
    var searchTarih = tarih;
    if (searchTarih.includes('-')) {
      var parts = searchTarih.split('-');
      searchTarih = parts[2] + '.' + parts[1] + '.' + parts[0];
    }
    
    var filtered = allRecords.data.filter(function(record) {
      return record.tarih === searchTarih;
    });
    
    return { success: true, data: filtered };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Motor ve tarihe göre kayıtları getir
function getRecordsByMotorAndDate(motor, tarih, vardiya) {
  try {
    var sheet = getMotorSheetIfExists(motor);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    var searchTarih = normalizeDateTR(tarih);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 22).getDisplayValues();
    var filtered = [];

    for (var i = data.length - 1; i >= 0; i--) {
      var record = mapMotorRow(data[i]);
      var matchTarih = record.tarih === searchTarih;
      var matchVardiya = true;

      if (vardiya) {
        var saat = record.saat || '';
        var hour = parseInt(saat.split(':')[0]) || 0;
        if (vardiya === '08-16') {
          matchVardiya = (hour >= 8 && hour < 16);
        } else if (vardiya === '16-24') {
          matchVardiya = (hour >= 16 && hour < 24);
        } else if (vardiya === '24-08') {
          matchVardiya = (hour >= 0 && hour < 8);
        }
      }

      if (matchTarih && matchVardiya) filtered.push(record);
    }
    
    return { success: true, data: filtered };
    
  } catch (error) {
    Logger.log('Hata: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// Kayıt var mı kontrol et
function checkExistingRecord(motor, tarih, saat) {
  try {
    var sheet = getMotorSheetIfExists(motor);
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: true, exists: false, record: null };
    }

    var searchTarih = normalizeDateTR(tarih);
    var searchMotor = String(motor || '').trim();
    var searchSaat = String(saat || '').trim();
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 22).getDisplayValues();
    var existing = null;

    for (var i = 0; i < data.length; i++) {
      var record = mapMotorRow(data[i]);
      var recMotor = String(record.motor || '').trim();
      var recTarih = String(record.tarih || '').trim();
      var recSaat = String(record.saat || '').trim();

      if (recMotor === searchMotor && recTarih === searchTarih && recSaat === searchSaat) {
        existing = record;
        break;
      }
    }
    
    return { 
      success: true, 
      exists: !!existing,
      record: existing || null
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// 🚀 TOPLU KAYIT KONTROLÜ - Tek seferde çoklu kayıt kontrolü
function checkMultipleRecords(data) {
  try {
    var kombinasyonlar = data.split(',');
    var sonuclar = {};
    var varOlanlar = [];
    var recordsByMotor = {};

    for (var i = 0; i < kombinasyonlar.length; i++) {
      var parts = kombinasyonlar[i].split('|');
      if (parts.length !== 3) continue;

      var motor = parts[0].trim();
      var tarih = parts[1].trim();
      var saat = parts[2].trim();
      var searchTarih = normalizeDateTR(tarih);
      var key = motor + '|' + tarih + '|' + saat;

      if (!recordsByMotor[motor]) {
        var sheet = getMotorSheetIfExists(motor);
        recordsByMotor[motor] = !sheet || sheet.getLastRow() < 2
          ? []
          : sheet.getRange(2, 1, sheet.getLastRow() - 1, 22).getDisplayValues().map(mapMotorRow);
      }

      var existing = recordsByMotor[motor].find(function(record) {
        var recMotor = String(record.motor || '').trim();
        var recTarih = String(record.tarih || '').trim();
        var recSaat = String(record.saat || '').trim();

        return recMotor === motor && recTarih === searchTarih && recSaat === saat;
      });

      sonuclar[key] = {
        exists: !!existing,
        record: existing || null
      };

      if (existing) {
        varOlanlar.push(key);
      }
    }

    return { 
      success: true, 
      results: sonuclar,
      existingCount: varOlanlar.length,
      totalCount: kombinasyonlar.length
    };
    
  } catch (error) {
    console.error('Toplu motor kayıt kontrolü hatası: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// Son N kaydı getir
function getLastRecords(count) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = spreadsheet.getSheets();
    var records = [];
    var total = 0;
    var perSheetCount = Math.max(count || 50, 10);

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      if (!sheet.getName().startsWith('Motor GM-')) continue;
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) continue;

      total += lastRow - 1;
      var rowCount = Math.min(perSheetCount, lastRow - 1);
      var startRow = Math.max(2, lastRow - rowCount + 1);
      var rows = sheet.getRange(startRow, 1, rowCount, 22).getDisplayValues();
      for (var j = 0; j < rows.length; j++) {
        records.push(mapMotorRow(rows[j]));
      }
    }

    records.sort(function(a, b) {
      return parseRecordDateTime(b.tarih, b.saat) - parseRecordDateTime(a.tarih, a.saat);
    });
    
    return { 
      success: true, 
      data: records.slice(0, count),
      total: total
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Çoklu kayıt ekleme
function parseMotorNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  var normalized = String(value).trim();
  if (normalized.indexOf(',') !== -1) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  var parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function findInsertPosition(sheet, tarih, saat) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return 2;
  }

  var targetTime = parseRecordDateTime(tarih, saat).getTime();
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();

  for (var i = 0; i < data.length; i++) {
    var rowTime = parseRecordDateTime(data[i][0], data[i][2]).getTime();
    if (rowTime > targetTime) {
      return i + 2;
    }
  }

  return lastRow + 1;
}

function parseRecordDateTime(tarih, saat) {
  var text = String(tarih || '');
  var parts = text.indexOf('-') !== -1 ? text.split('-').reverse() : text.split('.');
  var hourParts = String(saat || '00:00').split(':');
  return new Date(
    parseInt(parts[2], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[0], 10),
    parseInt(hourParts[0] || '0', 10),
    parseInt(hourParts[1] || '0', 10)
  );
}

function addMultipleRecords(dataString) {
  try {
    // Verileri parse et
    var records = JSON.parse(dataString);
    if (!Array.isArray(records)) {
      return { success: false, error: 'Veri formatı hatalı' };
    }
    
    var addedRecords = [];
    var errors = [];
    var motorSheets = {}; // Motor sayfalarını sakla
    
    // Her bir kaydı ekle
    for (var i = 0; i < records.length; i++) {
      try {
        var record = records[i];
        
        // Motor için doğru sayfayı al ve sakla
        var sheet = getOrCreateSheet(record.motor);
        motorSheets[record.motor] = sheet;
        
        // Tarih formatını kontrol et (Türkçe formatında tut)
        var tarih = record.tarih;
        // Gelen tarih zaten dd.MM.yyyy formatında olduğu gibi kullan
        
        // Satır verilerini hazırla (Excel sütunlarına göre)
        var rowData = [
          tarih || '',                                     // Tarih (2026-05-11)
          record.vardiya || '',                            // Vardiya (08-16)
          record.saat || '',                               // Saat (08:00)
          record.motor || '',                              // Motor (GM-1)
          parseMotorNumber(record.jenYatakSicaklikDE),     // JEN. YATAK SIC. (DE)
          parseMotorNumber(record.jenYatakSicaklikNDE),    // JEN. YATAK SIC. (NDE)
          record.sogutmaSoyuSicaklik || '0',               // SOĞUTMA SUYU SIC.
          record.sogutmaSoyuBasinc || '0',                 // SOĞUTMA SUYU BAS.
          record.yagSicaklik || '0',                       // YAĞ SIC.
          record.yagBasinc || '0',                         // YAĞ BAS.
          record.sarjSicaklik || '0',                      // ŞARJ SIC.
          record.sarjBasinc || '0',                        // ŞARJ BAS.
          record.gazRegulator || '0',                      // GAZ REG. (λ)
          record.makineDairesiSicaklik || '0',             // MAKİNE DAİRESİ SIC.
          record.karterBasinc || '0',                      // KARTER BAS.
          record.onKamaraFarkBasinc || '0',                 // ÖN KAMARA FARK BAS.
          record.sargiSicaklik1 || '0',                    // SARGI SIC. -1-
          record.sargiSicaklik2 || '0',                    // SARGI SIC. -2-
          record.sargiSicaklik3 || '0',                    // SARGI SIC. -3-
          record.not || 'Motor çalışmıyor',               // Durum
          record.kullanici || '',                          // Kaydeden
          new Date().toLocaleString('tr-TR')               // Kayıt Tarihi
        ];
        rowData[6] = parseMotorNumber(record.sogutmaSuyuSicaklik);
        rowData[7] = parseMotorNumber(record.sogutmaSuyuBasinc);
        rowData[8] = parseMotorNumber(record.yagSicaklik);
        rowData[9] = parseMotorNumber(record.yagBasinc);
        rowData[10] = parseMotorNumber(record.sarjSicaklik);
        rowData[11] = parseMotorNumber(record.sarjBasinc);
        rowData[12] = parseMotorNumber(record.gazRegulatoru);
        rowData[13] = parseMotorNumber(record.makineDairesiSicaklik);
        rowData[14] = parseMotorNumber(record.karterBasinc);
        rowData[15] = parseMotorNumber(record.onKamaraFarkBasinc);
        rowData[16] = parseMotorNumber(record.sargiSicaklik1);
        rowData[17] = parseMotorNumber(record.sargiSicaklik2);
        rowData[18] = parseMotorNumber(record.sargiSicaklik3);
        rowData[19] = record.durum || 'MOTOR ÇALIŞMIYOR';
        
        // Satırı ekle
        var newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1, 1, 22).setValues([rowData]);
        var dataRange = sheet.getRange(newRow, 1, 1, 22);
        dataRange.setHorizontalAlignment('center');
        dataRange.setFontSize(10);
        dataRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
        sheet.getRange(newRow, 5, 1, 15).setNumberFormat('0.00');
        dataRange.setBackground('#ffebee');
        dataRange.setFontColor('#c62828');
        addedRecords.push({
          motor: record.motor,
          tarih: record.tarih,
          saat: record.saat,
          row: newRow
        });
        
      } catch (recordError) {
        errors.push({
          record: records[i],
          error: recordError.toString()
        });
      }
    }
    
    console.log('📊 Çoklu kayıt sonucu: ' + addedRecords.length + ' eklendi, ' + errors.length + ' hata');
    
    // 🔥 Her motor için tarihleri renklendir
    for (var motorName in motorSheets) {
      var motorRecords = addedRecords.filter(function(r) { return r.motor === motorName; });
      colorizeDates(motorSheets[motorName], motorRecords);
    }
    for (var j = 0; j < addedRecords.length; j++) {
      var addedRecord = addedRecords[j];
      var addedSheet = motorSheets[addedRecord.motor];
      if (addedSheet) {
        var addedRange = addedSheet.getRange(addedRecord.row, 1, 1, 22);
        addedRange.setHorizontalAlignment('center');
        addedRange.setFontSize(10);
        addedRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
        addedSheet.getRange(addedRecord.row, 5, 1, 15).setNumberFormat('0.00');
        addedRange.setBackground('#ffebee');
        addedRange.setFontColor('#c62828');
      }
    }
    
    return {
      success: true,
      addedCount: addedRecords.length,
      totalCount: records.length,
      addedRecords: addedRecords,
      errors: errors
    };
    
  } catch (error) {
    console.error('Çoklu kayıt ekleme hatası: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// 🔥 Tarihleri renklendirme fonksiyonu
function checkHourlyMissingRecords() {
  try {
    var now = new Date();
    var target = getHourlyCheckTarget(now);
    var hour = target.hour;
    var saat = target.saat;
    var tarih = target.tarih;
    var vardiya = getVardiyaByHour(hour);
    var sentKey = 'kojenMotorHourlyCheck:' + tarih + ':' + saat;
    var props = PropertiesService.getScriptProperties();

    if (props.getProperty(sentKey)) {
      return { success: true, skipped: true, message: 'Bu saat daha once kontrol edildi' };
    }

    var motors = ['GM-1', 'GM-2', 'GM-3'];
    var missing = [];
    for (var i = 0; i < motors.length; i++) {
      var exists = checkExistingRecord(motors[i], tarih, saat);
      if (!exists.success || !exists.exists) {
        missing.push(motors[i]);
      }
    }

    if (missing.length === 0) {
      props.setProperty(sentKey, new Date().toISOString());
      addSystemLog({
        tarih: tarih,
        saat: saat,
        modul: 'Kojen Motor',
        eksikKayit: 'Yok',
        otomatikKayitSonucu: 'Gerekmedi',
        mailSonucu: 'Gonderilmedi',
        detay: 'Eksik motor kaydi yok'
      });
      return { success: true, missingCount: 0, addedCount: 0, message: 'Eksik motor kaydi yok' };
    }

    var added = [];
    var errors = [];
    for (var j = 0; j < missing.length; j++) {
      var motor = missing[j];
      var autoData = {
        tarih: tarih,
        vardiya: vardiya,
        saat: saat,
        motor: motor,
        kaydeden: 'OTOMATIK SISTEM',
        durum: 'MOTOR ÇALIŞMIYOR'
      };
      var addResult = addRecord(autoData);
      if (addResult.success) {
        added.push(motor);
      } else {
        errors.push(motor + ': ' + addResult.error);
      }
    }

    var subject = 'Kojen Motor Veri Uyarisi - ' + tarih + ' ' + saat + ' Kayit Girilmedi';
    var body = 'Kojen Motor Veri Uyarisi\n\n' +
      'Tarih: ' + tarih + '\n' +
      'Saat: ' + saat + '\n' +
      'Vardiya: ' + vardiya + '\n\n' +
      'Eksik motor kayitlari: ' + missing.join(', ') + '\n' +
      'Otomatik bos kayit eklenenler: ' + (added.length ? added.join(', ') : '-') + '\n' +
      (errors.length ? 'Kayit hatalari: ' + errors.join('; ') + '\n' : '') +
      '\nBu saat icin veri girilmedigi icin sistem otomatik bos kayit olusturdu.';

    var mailResult = sendEmailAlert({ subject: subject, body: body });
    if (added.length === missing.length) {
      props.setProperty(sentKey, new Date().toISOString());
    }
    addSystemLog({
      tarih: tarih,
      saat: saat,
      modul: 'Kojen Motor',
      eksikKayit: missing.join(', '),
      otomatikKayitSonucu: added.length + '/' + missing.length + ' basarili',
      mailSonucu: mailResult.success ? 'Basarili' : 'Basarisiz',
      hataMesaji: errors.concat(mailResult.success ? [] : [mailResult.error]).join('; '),
      detay: 'Otomatik motor calismiyor kaydi'
    });

    return {
      success: true,
      missingCount: missing.length,
      addedCount: added.length,
      errors: errors,
      mail: mailResult
    };
  } catch (error) {
    addSystemLog({
      modul: 'Kojen Motor',
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
      data.modul || data.module || 'Kojen Motor',
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

  return { success: true, message: 'Motor saatlik eksik kayit tetikleyicisi kuruldu' };
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
      checkedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getVardiyaByHour(hour) {
  if (hour >= 8 && hour < 16) return '08-16';
  if (hour >= 16 && hour < 24) return '16-24';
  return '24-08';
}

function getHourlyCheckTarget(date) {
  var target = new Date(date);
  if (target.getMinutes() < 55) {
    target.setHours(target.getHours() - 1);
  }
  return {
    hour: target.getHours(),
    saat: pad2(target.getHours()) + ':00',
    tarih: Utilities.formatDate(target, Session.getScriptTimeZone(), 'dd.MM.yyyy')
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function colorizeDates(sheet, addedRecords) {
  try {
    // Tarihleri grupla
    var dateGroups = {};
    for (var i = 0; i < addedRecords.length; i++) {
      var record = addedRecords[i];
      var tarih = record.tarih;
      if (!dateGroups[tarih]) {
        dateGroups[tarih] = [];
      }
      dateGroups[tarih].push(record.row);
    }
    
    // Her tarih için rastgele renk atayıp boyala
    for (var tarih in dateGroups) {
      var rows = dateGroups[tarih];
      var color = getRandomColor();
      
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j];
        // Tüm satırı boyala (21 sütun)
        var range = sheet.getRange(row, 1, 1, 21);
        range.setBackground(color);
      }
    }
    
    console.log('🎨 Tarihler renklendirildi: ' + Object.keys(dateGroups).length + ' farklı tarih');
  } catch (error) {
    console.error('Renklendirme hatası: ' + error.toString());
  }
}

// Rastgele pastel renk üret
function getRandomColor() {
  var colors = [
    '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
    '#E2F0CB', '#B5EAD7', '#C7CEEA', '#F0E68C', '#DDA0DD',
    '#98FB98', '#FFDAB9', '#E6E6FA', '#F0FFF0', '#FFF0F5',
    '#FFE4E1', '#E0FFFF', '#F5F5DC', '#FFEFD5', '#FAEBD7'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Mail gönderme fonksiyonu
function sendEmailAlert(data) {
  try {
    if (!data) {
      return { success: false, error: 'Veri parametresi eksik' };
    }

    var to = data.to || 'mrtcsk0320@gmail.com';
    var subject = data.subject || 'Kojen Motor Veri Uyarısı';
    var body = data.body || '';

    Logger.log('Mail gönderiliyor: ' + to + ', Konu: ' + subject);

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
