var window = typeof window === 'undefined' ? {} : window;

/**
 * KOJEN ENERJİ VERİLERİ - Google Apps Script Kodu
 * Bu dosya Google Sheets > Extensions > Apps Script'e yapıştırılacak
 * 
 * Kurulum Adımları:
 * 1. Google Sheets'de yeni bir sayfa oluşturun
 * 2. Sheet adını "KojenEnerjiVerileri" yapın
 * 3. İlk satır başlıkları: Tarih | Vardiya | Saat | Motor | L1-L2 AYDEM VOLTAJI | (P) AKTİF GÜÇ | (Q) REAKTİF GÜÇ | Cos φ | ORT.AKIM | ORT.GERİLİM | NÖTR AKIMI (LN) | TAHRİK GERİLİMİ (UE) | TOPLAM AKTİF ENERJİ | ÇALIŞMA SAATİ | KALKIŞ SAYISI | Durum | Kaydeden | Kayıt Tarihi
 * 4. Extensions > Apps Script'e gidin
 * 5. Bu kodu yapıştırın
 * 6. Deploy > New Deployment > Web App seçin
 * 7. Execute as: Me, Who has access: Anyone seçin
 * 8. URL'i kopyalayın ve kojen-enerji-sheets-config.js'e yapıştırın
 */

var KOJEN_ENERJI_DEPLOY_MARKER = 'kojen-enerji-veri-2026-06-05';
var KOJEN_ENERJI_WRITE_LOCK_WAIT_MS = 5000;
var KOJEN_ENERJI_SPREADSHEET_ID = '1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI';

// CORS ayarları - tüm origin'lere izin ver
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function onEdit(e) {
  return;
}

function notifyYearlyEnergyForRecords(records) {
  try {
    var yearlyReportUrl = getKojenEnerjiServiceUrl('yillikEnerjiRapor');
    if (!yearlyReportUrl) {
      return { success: false, skipped: true, error: 'Yillik enerji rapor URL eksik.' };
    }

    var payload = [];
    var seen = {};
    for (var i = 0; i < (records || []).length; i++) {
      var record = records[i] || {};
      var motor = normalizeEnerjiMotorLabel(record.motor || '');
      var tarih = normalizeDateTR(record.tarih || '');
      var saat = normalizeEnerjiSaat(record.saat || '');
      if (!motor || !tarih || !saat) continue;

      var key = motor + '|' + tarih + '|' + saat;
      if (seen[key]) continue;
      seen[key] = true;
      payload.push({ motor: motor, tarih: tarih, saat: saat });
    }

    if (!payload.length) {
      return { success: true, skipped: true, message: 'Guncellenecek enerji kaydi yok.' };
    }

    var response = UrlFetchApp.fetch(yearlyReportUrl, {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: {
        action: 'updateYearlyEnergyForRecords',
        data: JSON.stringify(payload)
      },
      muteHttpExceptions: true
    });

    var text = response.getContentText();
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      parsed = { success: false, error: 'Yillik enerji cevabi JSON degil: ' + text };
    }

    parsed.httpCode = response.getResponseCode();
    return parsed;
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getKojenEnerjiServiceUrl(key) {
  if (typeof getAppsScriptUrl === 'function') {
    return getAppsScriptUrl(key) || '';
  }
  return '';
}

function buildKojenEnerjiServiceUrl(key, query) {
  var baseUrl = getKojenEnerjiServiceUrl(key);
  if (!baseUrl) return '';

  var params = [];
  for (var name in query) {
    if (query.hasOwnProperty(name) && query[name] !== undefined && query[name] !== null) {
      params.push(encodeURIComponent(name) + '=' + encodeURIComponent(query[name]));
    }
  }
  if (!params.length) return baseUrl;
  return baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + params.join('&');
}

function shouldSyncYearlyEnergyUpdate(data) {
  var value = String((data && (data.syncYearlyUpdate || data.waitYearlyUpdate)) || '').toLowerCase();
  return value === 'true' || value === '1';
}

function skippedYearlyEnergyUpdateMessage() {
  return {
    success: true,
    skipped: true,
    async: true,
    message: 'Yillik enerji guncellemesi kayit hizli donsun diye istemci/manuel islem tarafindan ayri tetiklenecek.'
  };
}

function handleRequest(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = String(params.action || '').trim();
  var lock = null;
  try {
    if (isWriteAction(action)) {
      lock = LockService.getScriptLock();
      lock.waitLock(KOJEN_ENERJI_WRITE_LOCK_WAIT_MS);
    }
    
    var result = {};
    
    switch(action) {
      case '':
      case 'health':
        result = getApiHealth();
        break;
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
      case 'updateRecord':
        result = updateRecord(params);
        break;
      case 'getLastRecords':
        result = getLastRecords(parseInt(params.count) || 50);
        break;
      case 'getDashboardSummary':
        result = getDashboardSummary(params.tarih);
        break;
      case 'getDashboardMotorCards':
        result = getDashboardMotorCards(params.tarih);
        break;
      case 'sendEmail':
        result = sendEmailAlert(params);
        break;
      case 'checkHourlyMissingRecords':
        result = checkHourlyMissingRecords();
        break;
      case 'fillMissingFullDay':
        result = fillMissingFullDay(params.tarih, params.motor, params.startSaat, params.endSaat);
        break;
      case 'sortEnergySheet':
        result = sortEnergySheet(params.motor);
        break;
      case 'colorizeEnergySheet':
        result = colorizeEnergySheet(params.motor);
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
  // checkHourlyMissingRecords kendi kilidini aliyor; web handler'da tekrar kilit almak
  // ayni calismanin kendi kendini beklemesine ve Lock timeout hatasina yol acabiliyor.
  return ['addRecord', 'addMultipleRecords', 'sendEmail', 'fillMissingFullDay', 'sortEnergySheet', 'colorizeEnergySheet', 'installHourlyMissingRecordTrigger'].indexOf(action) !== -1;
}

function getApiHealth() {
  return {
    success: true,
    service: 'Kojen Enerji',
    deployMarker: KOJEN_ENERJI_DEPLOY_MARKER,
    message: 'API calisiyor. Islem yapmak icin action parametresi ekleyin.',
    checkedAt: new Date().toISOString(),
    availableActions: [
      'addRecord',
      'getRecords',
      'getRecordsByDate',
      'getRecordsByMotorAndDate',
      'checkExistingRecord',
      'checkMultipleRecords',
      'addMultipleRecords',
      'getLastRecords',
      'getDashboardSummary',
      'getDashboardMotorCards',
      'sendEmail',
      'checkHourlyMissingRecords',
      'fillMissingFullDay',
      'sortEnergySheet',
      'colorizeEnergySheet',
      'installHourlyMissingRecordTrigger',
      'getTriggerHealth',
      'getSystemLogs'
    ],
    examples: {
      health: '?action=health',
      lastRecords: '?action=getLastRecords&count=10'
    }
  };
}

function normalizeDateTR(tarih) {
  var value = String(tarih || '').trim();
  if (value.indexOf('-') !== -1) {
    var parts = value.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  return value;
}

function normalizeEnerjiDurum(durum) {
  var value = String(durum || 'NORMAL').trim();
  if (!value) return 'NORMAL';

  var upper = value.toUpperCase()
    .replace(/\u00C7/g, 'C')
    .replace(/\u011E/g, 'G')
    .replace(/\u0130/g, 'I')
    .replace(/\u0049\u0307/g, 'I')
    .replace(/\u00D6/g, 'O')
    .replace(/\u015E/g, 'S')
    .replace(/\u00DC/g, 'U');

  if (upper.indexOf('MOTOR') !== -1 && upper.indexOf('NORMAL') === -1) {
    return 'MOTOR ÇALIŞMIYOR';
  }

  return value;
}

function normalizeEnerjiMotorLabel(motor) {
  var value = String(motor || 'GM-1').trim().toUpperCase();
  if (!value) return 'GM-1';
  value = value.replace(/\s+/g, '');
  var gmMatch = value.match(/GM-?(\d+)$/);
  if (gmMatch) return 'GM-' + gmMatch[1];
  if (/^\d+$/.test(value)) return 'GM-' + value;
  return 'GM-' + value;
}

function getEnerjiSheetName(motor) {
  return 'Enerji ' + normalizeEnerjiMotorLabel(motor);
}

function getEnerjiSheetIfExists(motor) {
  var spreadsheet = SpreadsheetApp.openById(KOJEN_ENERJI_SPREADSHEET_ID);
  var targetMotor = normalizeEnerjiMotorLabel(motor);
  var exactSheet = spreadsheet.getSheetByName(getEnerjiSheetName(targetMotor));
  if (exactSheet) {
    return exactSheet;
  }

  var sheets = spreadsheet.getSheets();
  var bestSheet = null;
  var bestScore = -1;
  var bestRowCount = -1;

  for (var i = 0; i < sheets.length; i++) {
    var currentSheet = sheets[i];
    var sheetName = currentSheet.getName();
    if (sheetName.indexOf('YillikEnerji') === 0 || sheetName === 'SistemLoglari') {
      continue;
    }

    if (!/^Enerji\s+/i.test(sheetName)) {
      continue;
    }

    if (currentSheet.getLastColumn() < 4) {
      continue;
    }

    var score = 0;
    var dataRowCount = Math.max(0, currentSheet.getLastRow() - 1);
    var normalizedSheetMotor = normalizeEnerjiMotorLabel(sheetName.replace(/^Enerji\s+/i, ''));
    if (normalizedSheetMotor === targetMotor) {
      score += 10;
    }

    if (currentSheet.getLastRow() >= 2) {
      var rowCount = Math.min(currentSheet.getLastRow() - 1, 500);
      var motorValues = currentSheet.getRange(2, 4, rowCount, 1).getDisplayValues();
      for (var j = 0; j < motorValues.length; j++) {
        var rawMotor = String(motorValues[j][0] || '').trim();
        if (rawMotor && normalizeEnerjiMotorLabel(rawMotor) === targetMotor) {
          score++;
        }
      }
    }

    if (score > bestScore || (score === bestScore && dataRowCount > bestRowCount)) {
      bestScore = score;
      bestRowCount = dataRowCount;
      bestSheet = currentSheet;
    }
  }

  if (bestScore > 0) {
    return bestSheet;
  }

  return null;
}

function mapEnerjiRow(row) {
  return {
    tarih: row[0],
    vardiya: row[1],
    saat: row[2],
    motor: row[3],
    aydemVoltaji: row[4],
    aktifGuc: row[5],
    reaktifGuc: row[6],
    cosPhi: row[7],
    ortAkim: row[8],
    ortGerilim: row[9],
    notrAkim: row[10],
    tahrikGerilimi: row[11],
    toplamAktifEnerji: row[12],
    calismaSaati: row[13],
    kalkisSayisi: row[14],
    durum: row[15],
    kaydeden: row[16],
    kayitTarihi: row[17]
  };
}

function getLastEnerjiCountersBefore(sheet, tarih, saat) {
  var fallback = {
    toplamAktifEnerji: 0,
    calismaSaati: 0,
    kalkisSayisi: 0
  };

  try {
    if (!sheet || sheet.getLastRow() < 2) {
      return fallback;
    }

    var targetTime = parseDateTimeTR(tarih, saat).getTime();
    var firstDataRow = 2;
    var cursor = sheet.getLastRow();
    var chunkSize = 250;

    while (cursor >= firstDataRow) {
      var startRow = Math.max(firstDataRow, cursor - chunkSize + 1);
      var rowCount = cursor - startRow + 1;
      var rows = sheet.getRange(startRow, 1, rowCount, 18).getDisplayValues();

      for (var i = rows.length - 1; i >= 0; i--) {
        var record = mapEnerjiRow(rows[i]);
        var recordTime = parseDateTimeTR(record.tarih, record.saat).getTime();
        if (isNaN(recordTime) || recordTime >= targetTime) {
          continue;
        }

        var energy = parseEnerjiNumber(record.toplamAktifEnerji);
        var hours = parseEnerjiNumber(record.calismaSaati);
        var starts = parseEnerjiNumber(record.kalkisSayisi);
        if (energy > 0 || hours > 0 || starts > 0) {
          return {
            toplamAktifEnerji: energy,
            calismaSaati: hours,
            kalkisSayisi: starts
          };
        }
      }

      cursor = startRow - 1;
    }

    return fallback;
  } catch (error) {
    Logger.log('Son enerji sayaclari alinamadi: ' + error.toString());
    return fallback;
  }
}

function getLatestCounterOrFallback(value, latestValue) {
  var parsed = parseEnerjiNumber(value);
  var latest = parseEnerjiNumber(latestValue);
  return latest > 0 ? latest : parsed;
}

function getCounterOrLatest(value, latestValue) {
  return getLatestCounterOrFallback(value, latestValue);
}

// 🔥 MOTOR BAZLI SAYFA GETİRME FONKSİYONU
function getOrCreateSheet(motor) {
  var spreadsheet = SpreadsheetApp.openById(KOJEN_ENERJI_SPREADSHEET_ID);
  var existingSheet = getEnerjiSheetIfExists(motor);
  if (existingSheet) {
    return existingSheet;
  }
  
  // Motor bazlı sayfa adı
  var sheetName = getEnerjiSheetName(motor);
  var sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    
    // Başlık satırını ekle
    var headers = [
      'Tarih', 'Vardiya', 'Saat', 'Motor',
      'L1-L2 AYDEM VOLTAJI', '(P) AKTİF GÜÇ', '(Q) REAKTİF GÜÇ',
      'Cos φ', 'ORT.AKIM', 'ORT.GERİLİM',
      'NÖTR AKIMI (LN)', 'TAHRİK GERİLİMİ (UE)',
      'TOPLAM AKTİF ENERJİ', 'ÇALIŞMA SAATİ', 'KALKIŞ SAYISI',
      'Durum', 'Kaydeden', 'Kayıt Tarihi'
    ];
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]).setFontWeight('bold');
    headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
    
    console.log('📄 Yeni enerji sayfası oluşturuldu: ' + sheetName);
    
    // Sütun genişliklerini ayarla
    sheet.setColumnWidth(1, 100);  // Tarih
    sheet.setColumnWidth(2, 80);   // Vardiya
    sheet.setColumnWidth(3, 60);   // Saat
    sheet.setColumnWidth(4, 80);   // Motor
    sheet.setColumnWidth(5, 130);  // L1-L2 AYDEM VOLTAJI
    sheet.setColumnWidth(6, 110);  // (P) AKTİF GÜÇ
    sheet.setColumnWidth(7, 110);  // (Q) REAKTİF GÜÇ
    sheet.setColumnWidth(8, 80);   // Cos φ
    sheet.setColumnWidth(9, 90);   // ORT.AKIM
    sheet.setColumnWidth(10, 100); // ORT.GERİLİM
    sheet.setColumnWidth(11, 110); // NÖTR AKIMI
    sheet.setColumnWidth(12, 120); // TAHRİK GERİLİMİ
    sheet.setColumnWidth(13, 130); // TOPLAM AKTİF ENERJİ
    sheet.setColumnWidth(14, 100); // ÇALIŞMA SAATİ
    sheet.setColumnWidth(15, 100); // KALKIŞ SAYISI
    sheet.setColumnWidth(16, 120); // Durum
    sheet.setColumnWidth(17, 100); // Kaydeden
    sheet.setColumnWidth(18, 150); // Kayıt Tarihi
    
    // Sütun formatlarını ayarla
    sheet.getRange(2, 1, 1000, 4).setNumberFormat('@'); // Tarih, Vardiya, Saat, Motor
    sheet.getRange(2, 5, 1000, 11).setNumberFormat('0.00'); // Sayısal değerler
    sheet.getRange(2, 16, 1000, 3).setNumberFormat('@'); // Durum, Kaydeden, Kayıt Tarihi
    
    Logger.log('KojenEnerjiVerileri sayfası otomatik olarak oluşturuldu.');
  }
  
  return sheet;
}

// Yeni kayıt ekle (Motor Bazlı)
function addRecord(data) {
  try {
    // Motor bilgisinden sayfa adı belirle
    var motor = normalizeEnerjiMotorLabel(data.motor);
    var sheet = data.onlyExistingSheet ? getEnerjiSheetIfExists(motor) : getOrCreateSheet(motor);
    if (!sheet) {
      return { success: false, error: motor + ' icin mevcut enerji sayfasi bulunamadi. Yeni sayfa olusturulmadi.' };
    }
    
    // Zorunlu alanları kontrol et
    if (!data.tarih || !data.vardiya || !data.saat || !data.motor) {
      return { success: false, error: 'Tarih, vardiya, saat ve motor zorunludur!' };
    }
    
    // Aynı tarih, saat ve motor için kayıt var mı kontrol et
    var formattedTarih = normalizeDateTR(data.tarih);
    var formattedSaat = normalizeEnerjiSaat(data.saat);
    var insertInfo = findEnerjiInsertInfoByDateTime(sheet, formattedTarih, formattedSaat);
    if (insertInfo.exists) {
      return { success: false, error: 'Bu tarih, saat ve motor icin kayit zaten var!' };
    }
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
    
    // Kayıt zamanı
    var kayitTarihi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
    
    // Verileri al (Motor çalışmıyor durumu kontrolü)
    var durum = normalizeEnerjiDurum(data.durum || 'NORMAL');
    var kaydeden = data.kaydeden || 'Admin';
    
    // Eğer motor çalışmıyorsa, M, N, O sütunları için son değerleri kullan, diğerlerini 0 olarak kaydet
    var values;
    if (durum === 'MOTOR ÇALIŞMIYOR') {
      var zeroValue = parseEnerjiNumber('0.00');
      var latestCounters = getLastEnerjiCountersBefore(sheet, formattedTarih, formattedSaat);
      var toplamAktifEnerji = getLatestCounterOrFallback(data.toplamAktifEnerji, latestCounters.toplamAktifEnerji);
      var calismaSaati = getLatestCounterOrFallback(data.calismaSaati, latestCounters.calismaSaati);
      var kalkisSayisi = getLatestCounterOrFallback(data.kalkisSayisi, latestCounters.kalkisSayisi);

      values = [
        formattedTarih, data.vardiya, formattedSaat, motor,
        zeroValue, zeroValue, zeroValue, zeroValue, zeroValue, zeroValue, zeroValue, zeroValue, // Diğer değerler 0.00 (8 tane)
        toplamAktifEnerji, // M sütunu - son değer
        calismaSaati,      // N sütunu - son değer
        kalkisSayisi,      // O sütunu - son değer
        durum, kaydeden, kayitTarihi
      ];
    } else {
      values = [
        formattedTarih,
        data.vardiya,
        formattedSaat,
        motor,
        parseFloat(data.aydemVoltaji) || 0,
        parseFloat(data.aktifGuc) || 0,
        parseFloat(data.reaktifGuc) || 0,
        parseFloat(data.cosPhi) || 0,
        parseFloat(data.ortAkim) || 0,
        parseFloat(data.ortGerilim) || 0,
        parseFloat(data.notrAkim) || 0,
        parseFloat(data.tahrikGerilimi) || 0,
        parseFloat(data.toplamAktifEnerji) || 0,
        parseFloat(data.calismaSaati) || 0,
        parseFloat(data.kalkisSayisi) || 0,
        durum,
        kaydeden,
        kayitTarihi
      ];
    }
    
    // 🔥 SAAT SIRALAMASI İÇİN DOĞRU KONUMU BUL
    var insertRow = insertInfo.insertRow;
    if (insertRow <= sheet.getLastRow()) {
      sheet.insertRowBefore(insertRow);
    }
    sheet.getRange(insertRow, 1, 1, 18).setValues([values]);
    
    // Yeni eklenen satırın formatını ayarla
    var newRow = insertRow;
    var dataRange = sheet.getRange(newRow, 1, 1, 18);
    dataRange.setHorizontalAlignment('center');
    dataRange.setFontSize(10);
    dataRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    // Sayısal sütunları ortala
    sheet.getRange(newRow, 5, 1, 11).setNumberFormat('0.00');
    
    colorizeDates(sheet, [{ tarih: formattedTarih, saat: formattedSaat, row: newRow }]);

    // Motor çalışmıyor durumunda yazıyı kırmızı yap, tarih rengini ezme
    if (durum === 'MOTOR ÇALIŞMIYOR') {
      dataRange.setFontColor('#c62828');
    }
    var result = { success: true, message: motor + ' motoru için enerji kaydı başarıyla eklendi!', record: mapEnerjiRow(values), row: newRow };
    if (shouldSyncYearlyEnergyUpdate(data)) {
      result.yearlyUpdate = notifyYearlyEnergyForRecords([result.record]);
    } else {
      result.yearlyUpdate = skippedYearlyEnergyUpdateMessage();
    }
    return result;
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tüm kayıtları getir (Tüm Motor Sayfalarından)
function getRecords() {
  try {
    var spreadsheet = SpreadsheetApp.openById(KOJEN_ENERJI_SPREADSHEET_ID);
    var sheets = spreadsheet.getSheets();
    var records = [];
    
    // Sadece Enerji GM-* sayfalarını işle
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var sheetName = sheet.getName();
      
      // Sadece enerji sayfalarını işle
      if (!sheetName.startsWith('Enerji GM-')) {
        continue;
      }
      
      console.log('📊 Enerji sayfası okunuyor: ' + sheetName);
      
      if (sheet.getLastRow() < 2) {
        continue;
      }
      
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getDisplayValues();
      
      for (var j = data.length - 1; j >= 0; j--) {
        var row = data[j];
        
        records.push(mapEnerjiRow(row));
      }
    }
    
    console.log('📊 Toplam ' + records.length + ' enerji kaydı okundu');
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
function getRecordsByMotorAndDate(motor, tarih) {
  try {
    var sheet = getEnerjiSheetIfExists(motor);
    if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

    var searchTarih = normalizeDateTR(tarih);
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getDisplayValues();
    var filtered = [];
    for (var i = rows.length - 1; i >= 0; i--) {
      var record = mapEnerjiRow(rows[i]);
      if (normalizeDateTR(record.tarih) === searchTarih) filtered.push(record);
    }
    
    return { success: true, data: filtered };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Kayıt var mı kontrol et
function checkExistingRecord(motor, tarih, saat) {
  try {
    var sheet = getEnerjiSheetIfExists(motor);
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: true, exists: false, record: null };
    }

    var searchTarih = normalizeDateTR(tarih);
    var searchMotor = normalizeEnerjiMotorLabel(motor);
    var searchSaat = normalizeEnerjiSaat(saat);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getDisplayValues();
    var existing = null;

    for (var i = 0; i < data.length; i++) {
      var record = mapEnerjiRow(data[i]);
      var recMotor = normalizeEnerjiMotorLabel(record.motor);
      var recTarih = normalizeDateTR(record.tarih || '');
      var recSaat = normalizeEnerjiSaat(record.saat || '');

      if (recMotor === searchMotor && recTarih === searchTarih && recSaat === searchSaat) {
        existing = record;
        break;
      }
    }
    
    var result = { 
      success: true, 
      exists: !!existing,
      record: existing || null
    };
    
    return result;
    
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

      var motor = normalizeEnerjiMotorLabel(parts[0]);
      var tarih = parts[1].trim();
      var saat = normalizeEnerjiSaat(parts[2]);
      var searchTarih = normalizeDateTR(tarih);
      var key = motor + '|' + tarih + '|' + saat;

      if (!recordsByMotor[motor]) {
        var sheet = getEnerjiSheetIfExists(motor);
        if (!sheet || sheet.getLastRow() < 2) {
          recordsByMotor[motor] = [];
        } else {
          var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
          recordsByMotor[motor] = rows.map(function(row) {
            return {
              tarih: row[0],
              saat: normalizeEnerjiSaat(row[2] || '')
            };
          });
        }
      }

      var existing = recordsByMotor[motor].find(function(record) {
        var recTarih = normalizeDateTR(record.tarih || '');
        var recSaat = normalizeEnerjiSaat(record.saat || '');

        return recTarih === searchTarih && recSaat === saat;
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
    console.error('Toplu kayıt kontrolü hatası: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// Son N kaydı getir
function getLastRecords(count) {
  try {
    var spreadsheet = SpreadsheetApp.openById(KOJEN_ENERJI_SPREADSHEET_ID);
    var sheets = spreadsheet.getSheets();
    var records = [];
    var total = 0;
    var perSheetCount = Math.max(count || 50, 10);

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      if (!sheet.getName().startsWith('Enerji GM-')) continue;
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) continue;

      total += lastRow - 1;
      var rowCount = Math.min(perSheetCount, lastRow - 1);
      var startRow = Math.max(2, lastRow - rowCount + 1);
      var rows = sheet.getRange(startRow, 1, rowCount, 18).getDisplayValues();
      for (var j = 0; j < rows.length; j++) {
        records.push(mapEnerjiRow(rows[j]));
      }
    }

    records.sort(function(a, b) {
      return parseDateTimeTR(b.tarih, b.saat) - parseDateTimeTR(a.tarih, a.saat);
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

function getDashboardSummary(tarih) {
  var startedAt = new Date();
  var targetTarih = normalizeDateTR(tarih || Utilities.formatDate(startedAt, Session.getScriptTimeZone(), 'dd.MM.yyyy'));
  var motorData = createEmptyDashboardMotors();
  var summary = {
    dailyProduction: 0,
    dailySteam: null,
    pendingMaintenance: 0,
    activeFaults: 0
  };
  var errors = [];

  try {
    summary.dailyProduction = getDashboardDailyProductionMwh(targetTarih);

    var latestEnergy = getLastRecords(100);
    if (latestEnergy.success && latestEnergy.data) {
      applyLatestEnergyToDashboard(motorData, latestEnergy.data);
    } else if (!latestEnergy.success) {
      errors.push('latestEnergy: ' + latestEnergy.error);
    }

    var external = fetchDashboardExternalData();
    applyDashboardMotorStatus(motorData, external.motorRecords);
    summary.dailySteam = getDashboardSteamValue(external.buharRecords);
    var maintenanceSummary = getDashboardMaintenanceSummary(external.maintenanceRecords);
    summary.pendingMaintenance = maintenanceSummary.pendingMaintenance;
    summary.activeFaults = maintenanceSummary.activeFaults;

    if (external.errors.length) {
      errors = errors.concat(external.errors);
    }

    return {
      success: true,
      tarih: targetTarih,
      summary: summary,
      motors: motorData,
      announcements: external.announcements,
      errors: errors,
      durationMs: new Date().getTime() - startedAt.getTime()
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString(),
      durationMs: new Date().getTime() - startedAt.getTime()
    };
  }
}

function getDashboardMotorCards(tarih) {
  var startedAt = new Date();
  var targetTarih = normalizeDateTR(tarih || Utilities.formatDate(startedAt, Session.getScriptTimeZone(), 'dd.MM.yyyy'));
  var motorData = createEmptyDashboardMotors();
  var summary = {
    dailyProduction: 0
  };
  var errors = [];

  try {
    var latestEnergy = getLastRecords(240);
    if (latestEnergy.success && latestEnergy.data) {
      applyLatestEnergyToDashboard(motorData, latestEnergy.data);
      summary.dailyProduction = getDashboardDailyProductionFromRecords(latestEnergy.data, targetTarih);
    } else if (!latestEnergy.success) {
      errors.push('latestEnergy: ' + latestEnergy.error);
    }

    return {
      success: true,
      tarih: targetTarih,
      summary: summary,
      motors: motorData,
      errors: errors,
      durationMs: new Date().getTime() - startedAt.getTime()
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString(),
      durationMs: new Date().getTime() - startedAt.getTime()
    };
  }
}

function createEmptyDashboardMotors() {
  return {
    gm1: { totalProduction: 0, hourlyProduction: 0, totalHours: 0, hourlyHours: 0, totalStarts: 0, status: 'stopped' },
    gm2: { totalProduction: 0, hourlyProduction: 0, totalHours: 0, hourlyHours: 0, totalStarts: 0, status: 'stopped' },
    gm3: { totalProduction: 0, hourlyProduction: 0, totalHours: 0, hourlyHours: 0, totalStarts: 0, status: 'stopped' }
  };
}

function getDashboardDailyProductionMwh(tarih) {
  var motors = ['GM-1', 'GM-2', 'GM-3'];
  var totalMwh = 0;
  var targetStart = parseDateTimeTR(tarih, '00:00').getTime();

  for (var i = 0; i < motors.length; i++) {
    var sheet = getEnerjiSheetIfExists(motors[i]);
    if (!sheet || sheet.getLastRow() < 2) continue;

    var rows = getDashboardRecentRowsForDate(sheet, tarih, targetStart);
    var records = [];
    for (var j = 0; j < rows.length; j++) {
      var record = mapEnerjiRow(rows[j]);
      if (String(record.tarih || '').trim() === tarih) {
        records.push(record);
      }
    }

    records.sort(function(a, b) {
      return parseDateTimeTR(a.tarih, a.saat) - parseDateTimeTR(b.tarih, b.saat);
    });

    var firstEnergy = null;
    var lastEnergy = null;
    for (var k = 0; k < records.length; k++) {
      var energy = parseEnerjiNumber(records[k].toplamAktifEnerji);
      if (firstEnergy === null) firstEnergy = energy;
      lastEnergy = energy;
    }

    if (firstEnergy !== null && lastEnergy !== null) {
      totalMwh += Math.max(0, lastEnergy - firstEnergy);
    }
  }

  return totalMwh;
}

function getDashboardDailyProductionFromRecords(records, tarih) {
  var recordsByMotor = {};
  var totalMwh = 0;

  for (var i = 0; i < (records || []).length; i++) {
    var record = records[i];
    if (normalizeDateTR(record.tarih || '') !== tarih) continue;

    var key = getDashboardMotorKey(record.motor);
    if (!recordsByMotor[key]) recordsByMotor[key] = [];
    recordsByMotor[key].push(record);
  }

  var motorKeys = Object.keys(recordsByMotor);
  for (var j = 0; j < motorKeys.length; j++) {
    var motorRecords = recordsByMotor[motorKeys[j]].sort(function(a, b) {
      return parseDateTimeTR(a.tarih, a.saat) - parseDateTimeTR(b.tarih, b.saat);
    });

    if (motorRecords.length < 2) continue;

    var firstEnergy = parseEnerjiNumber(motorRecords[0].toplamAktifEnerji);
    var lastEnergy = parseEnerjiNumber(motorRecords[motorRecords.length - 1].toplamAktifEnerji);
    totalMwh += Math.max(0, lastEnergy - firstEnergy);
  }

  return totalMwh;
}

function getDashboardRecentRowsForDate(sheet, tarih, targetStart) {
  var rows = [];
  var chunkSize = 120;
  var firstDataRow = 2;
  var cursor = sheet.getLastRow();
  var foundTargetDate = false;

  while (cursor >= firstDataRow) {
    var startRow = Math.max(firstDataRow, cursor - chunkSize + 1);
    var rowCount = cursor - startRow + 1;
    var chunk = sheet.getRange(startRow, 1, rowCount, 18).getDisplayValues();

    for (var i = chunk.length - 1; i >= 0; i--) {
      var rowDate = String(chunk[i][0] || '').trim();
      if (rowDate === tarih) {
        rows.push(chunk[i]);
        foundTargetDate = true;
        continue;
      }

      if (foundTargetDate) {
        var rowTime = parseDateTimeTR(rowDate, '00:00').getTime();
        if (!isNaN(rowTime) && rowTime < targetStart) {
          return rows;
        }
      }
    }

    cursor = startRow - 1;
    if (foundTargetDate && rows.length >= 24) {
      break;
    }
  }

  return rows;
}

function getDashboardMotorKey(value) {
  var text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  var gmMatch = text.match(/GM-?(?:GM-?)?(\d+)$/);
  if (gmMatch) return 'gm' + gmMatch[1];

  var numericMatch = text.match(/(\d+)$/);
  if (numericMatch) return 'gm' + numericMatch[1];

  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeDashboardText(value) {
  return String(value || '').toLowerCase()
    .replace(/\u0131/g, 'i')
    .replace(/\u011F/g, 'g')
    .replace(/\u00FC/g, 'u')
    .replace(/\u015F/g, 's')
    .replace(/\u00F6/g, 'o')
    .replace(/\u00E7/g, 'c');
}

function isDashboardStoppedStatus(value) {
  var status = normalizeDashboardText(value);
  return status.indexOf('calismiyor') !== -1 ||
    status.indexOf('durdu') !== -1 ||
    status.indexOf('stop') !== -1;
}

function isDashboardFaultType(value) {
  return normalizeDashboardText(value) === 'ariza';
}

function applyLatestEnergyToDashboard(motorData, records) {
  var seen = {};
  var recordsByMotor = {};

  for (var groupIndex = 0; groupIndex < records.length; groupIndex++) {
    var groupRecord = records[groupIndex];
    var groupKey = getDashboardMotorKey(groupRecord.motor);
    if (!motorData[groupKey]) continue;
    if (!recordsByMotor[groupKey]) recordsByMotor[groupKey] = [];
    recordsByMotor[groupKey].push(groupRecord);
  }

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var key = getDashboardMotorKey(record.motor);
    if (!motorData[key] || seen[key]) continue;
    seen[key] = true;

    var totalEnergy = parseEnerjiNumber(record.toplamAktifEnerji);
    var totalHours = parseEnerjiNumber(record.calismaSaati);
    var totalStarts = parseEnerjiNumber(record.kalkisSayisi);
    var previousRecord = recordsByMotor[key] && recordsByMotor[key].length > 1 ? recordsByMotor[key][1] : null;
    var previousEnergy = previousRecord ? parseEnerjiNumber(previousRecord.toplamAktifEnerji) : totalEnergy;
    var previousHours = previousRecord ? parseEnerjiNumber(previousRecord.calismaSaati) : totalHours;

    motorData[key].totalProduction = totalEnergy;
    motorData[key].hourlyProduction = Math.max(0, totalEnergy - previousEnergy);
    motorData[key].totalHours = totalHours;
    motorData[key].hourlyHours = Math.max(0, totalHours - previousHours);
    motorData[key].totalStarts = totalStarts;
    motorData[key].status = isDashboardStoppedStatus(record.durum) ? 'stopped' : 'running';
  }
}

function applyDashboardMotorStatus(motorData, records) {
  var seen = {};
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var key = getDashboardMotorKey(record.motor);
    if (!motorData[key] || seen[key]) continue;
    seen[key] = true;
    motorData[key].status = isDashboardStoppedStatus(record.durum) ? 'stopped' : 'running';
  }
}

function getDashboardSteamValue(records) {
  if (!records || !records.length) return null;
  var record = records[0];
  return parseEnerjiNumber(record.buharMiktari);
}

function getDashboardMaintenanceSummary(records) {
  var result = { pendingMaintenance: 0, activeFaults: 0 };
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    if (normalizeDashboardText(record.status) !== 'aktif') continue;
    if (isDashboardFaultType(record.type)) {
      result.activeFaults++;
    } else {
      result.pendingMaintenance++;
    }
  }
  return result;
}

function fetchDashboardExternalData() {
  var urls = {
    motor: buildKojenEnerjiServiceUrl('motor', { action: 'getLastRecords', count: 100 }),
    buhar: buildKojenEnerjiServiceUrl('buhar', { action: 'getLastRecords', count: 1 }),
    announcements: buildKojenEnerjiServiceUrl('bildirim', { action: 'getAnnouncements', active: 'true' })
  };

  var keys = ['motor', 'buhar', 'announcements'];
  var output = {
    motorRecords: [],
    buharRecords: [],
    maintenanceRecords: [],
    announcements: [],
    errors: []
  };

  var requestKeys = [];
  var requests = [];
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    if (!urls[key]) {
      output.errors.push(key + ': URL tanimli degil');
      continue;
    }
    requestKeys.push(key);
    requests.push({
      url: urls[key],
      method: 'get',
      muteHttpExceptions: true
    });
  }

  if (!requests.length) return output;

  try {
    var responses = UrlFetchApp.fetchAll(requests);
    for (var i = 0; i < responses.length; i++) {
      var key = requestKeys[i];
      var response = responses[i];
      var code = response.getResponseCode();
      if (code < 200 || code >= 300) {
        output.errors.push(key + ': HTTP ' + code);
        continue;
      }

      var payload = JSON.parse(response.getContentText());
      if (!payload.success) {
        output.errors.push(key + ': ' + (payload.error || payload.message || 'Basarisiz'));
        continue;
      }

      if (key === 'motor') output.motorRecords = payload.data || [];
      if (key === 'buhar') output.buharRecords = payload.data || [];
      if (key === 'announcements') output.announcements = payload.data || [];
    }
  } catch (error) {
    output.errors.push('externalFetch: ' + error.toString());
  }

  return output;
}

// Saat ve tarih yardimci fonksiyonlari
function normalizeEnerjiSaat(value) {
  var text = String(value || '').trim();
  if (!text) return '00:00';
  var parts = text.split(':');
  var hour = parseInt(parts[0] || '0', 10);
  var minute = parseInt(parts[1] || '0', 10);
  return pad2(isNaN(hour) ? 0 : hour) + ':' + pad2(isNaN(minute) ? 0 : minute);
}

function formatEnerjiDateTR(date) {
  return pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
}

function formatEnerjiHeaderDate(date) {
  return date.getDate() + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
}

function findInsertPosition(sheet, tarih, saat) {
  var lastRow = sheet.getLastRow();
  
  // Tablo boşsa 2. satıra ekle
  if (lastRow <= 1) {
    return 2;
  }
  
  // Mevcut verileri al (tarih, saat)
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  
  // Saati sayısal olarak karşılaştır (08:00 -> 8, 09:00 -> 9)
  var saatNum = parseInt(saat.split(':')[0]);
  
  // Tarih ve saate göre doğru konumu bul
  for (var i = 0; i < data.length; i++) {
    var rowTarih = data[i][0];
    var rowSaat = data[i][2];
    var rowSaatNum = parseInt(rowSaat.toString().split(':')[0]);
    
    // Aynı tarih ve saatten önceki konumu bul
    if (rowTarih === tarih && rowSaatNum > saatNum) {
      return i + 2; // +2 çünkü başlıklar var
    }
    
    // Farklı tarihse, tarihe göre sırala
    if (rowTarih > tarih) {
      return i + 2;
    }
  }
  
  // En sona ekle
  return lastRow + 1;
}

// Çoklu kayıt ekleme
function findInsertPositionByDateTime(sheet, tarih, saat) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return 2;
  }

  var targetTime = parseDateTimeTR(tarih, saat).getTime();
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();

  for (var i = 0; i < data.length; i++) {
    var rowTime = parseDateTimeTR(data[i][0], data[i][2]).getTime();
    if (rowTime > targetTime) {
      return i + 2;
    }
  }

  return lastRow + 1;
}

function findEnerjiInsertInfoByDateTime(sheet, tarih, saat) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { exists: false, insertRow: 2 };
  }

  var targetTime = parseDateTimeTR(tarih, saat).getTime();
  var normalizedSaat = normalizeEnerjiSaat(saat);
  var lastValues = sheet.getRange(lastRow, 1, 1, 3).getDisplayValues()[0];
  var lastTarih = normalizeDateTR(lastValues[0] || '');
  var lastSaat = normalizeEnerjiSaat(lastValues[2] || '');
  var lastTime = parseDateTimeTR(lastTarih, lastSaat).getTime();

  if (lastTarih === tarih && lastSaat === normalizedSaat) {
    return { exists: true, insertRow: lastRow };
  }

  if (!isNaN(targetTime) && !isNaN(lastTime) && targetTime > lastTime) {
    return { exists: false, insertRow: lastRow + 1 };
  }

  var data = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
  var insertRow = lastRow + 1;

  for (var i = 0; i < data.length; i++) {
    var rowTarih = normalizeDateTR(data[i][0] || '');
    var rowSaat = normalizeEnerjiSaat(data[i][2] || '');

    if (rowTarih === tarih && rowSaat === normalizedSaat) {
      return { exists: true, insertRow: i + 2 };
    }

    var rowTime = parseDateTimeTR(rowTarih, rowSaat).getTime();
    if (insertRow === lastRow + 1 && !isNaN(rowTime) && rowTime > targetTime) {
      insertRow = i + 2;
    }
  }

  return { exists: false, insertRow: insertRow };
}

function parseEnerjiNumber(value) {
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

function addMultipleRecords(dataString) {
  var startedAt = new Date().getTime();
  try {
    var records = JSON.parse(dataString);
    if (!Array.isArray(records)) {
      return { success: false, error: 'Veri formatı hatalı' };
    }
    
    var addedRecords = [];
    var errors = [];
    var motorSheets = {};
    var groupedRecords = {};

    for (var i = 0; i < records.length; i++) {
      var groupedMotor = normalizeEnerjiMotorLabel(records[i].motor);
      if (!groupedRecords[groupedMotor]) groupedRecords[groupedMotor] = [];
      groupedRecords[groupedMotor].push(records[i]);
    }

    Object.keys(groupedRecords).forEach(function(motor) {
      try {
        var sheet = getOrCreateSheet(motor);
        motorSheets[motor] = sheet;

        var lastRow = sheet.getLastRow();
        var existingMetaRows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues() : [];
        var existingCounterRows = lastRow >= 2 ? sheet.getRange(2, 13, lastRow - 1, 3).getDisplayValues() : [];
        var counterRecords = [];
        var existingKeys = {};
        var maxExistingTimestamp = -1;
        var needsSortAfterAppend = false;

        for (var rowIndex = 0; rowIndex < existingMetaRows.length; rowIndex++) {
          var existingDate = normalizeDateTR(existingMetaRows[rowIndex][0] || '');
          var existingSaat = normalizeEnerjiSaat(existingMetaRows[rowIndex][2] || '');
          if (existingDate && existingSaat) {
            existingKeys[existingDate + '|' + existingSaat] = true;
          }

          var recordTime = parseDateTimeTR(existingDate, existingSaat).getTime();
          if (isNaN(recordTime)) continue;
          if (recordTime > maxExistingTimestamp) maxExistingTimestamp = recordTime;

          var energy = parseEnerjiNumber(existingCounterRows[rowIndex][0]);
          var hours = parseEnerjiNumber(existingCounterRows[rowIndex][1]);
          var starts = parseEnerjiNumber(existingCounterRows[rowIndex][2]);
          if (energy > 0 || hours > 0 || starts > 0) {
            counterRecords.push({
              timestamp: recordTime,
              toplamAktifEnerji: energy,
              calismaSaati: hours,
              kalkisSayisi: starts
            });
          }
        }

        counterRecords.sort(function(a, b) {
          return a.timestamp - b.timestamp;
        });

        var motorRecords = groupedRecords[motor].slice().sort(function(a, b) {
          return parseDateTimeTR(a.tarih, a.saat).getTime() - parseDateTimeTR(b.tarih, b.saat).getTime();
        });
        var rowsToAdd = [];
        var groupAddedRecords = [];
        var appendStartRow = sheet.getLastRow() + 1;

        for (var recordIndex = 0; recordIndex < motorRecords.length; recordIndex++) {
          var record = motorRecords[recordIndex];
          var tarih = normalizeDateTR(record.tarih || '');
          var saat = normalizeEnerjiSaat(record.saat || '');
          var recordKey = tarih + '|' + saat;
          if (existingKeys[recordKey]) {
            continue;
          }

          var targetTime = parseDateTimeTR(tarih, saat).getTime();
          if (!isNaN(targetTime) && maxExistingTimestamp !== -1 && targetTime < maxExistingTimestamp) {
            needsSortAfterAppend = true;
          }
          var rowData = [
            tarih || '',
            record.vardiya || '',
            saat || '',
            motor || '',
            parseEnerjiNumber(record.aydemVoltaji),
            parseEnerjiNumber(record.aktifGuc),
            parseEnerjiNumber(record.reaktifGuc),
            parseEnerjiNumber(record.cosPhi),
            parseEnerjiNumber(record.ortAkim),
            parseEnerjiNumber(record.ortGerilim),
            parseEnerjiNumber(record.notrAkim),
            parseEnerjiNumber(record.tahrikGerilimi),
            parseEnerjiNumber(record.toplamAktifEnerji),
            parseEnerjiNumber(record.calismaSaati),
            parseEnerjiNumber(record.kalkisSayisi),
            normalizeEnerjiDurum(record.durum || 'MOTOR ÇALIŞMIYOR'),
            record.kullanici || '',
            new Date().toLocaleString('tr-TR')
          ];

          if (rowData[15] !== 'NORMAL') {
            var latestCounters = {
              toplamAktifEnerji: 0,
              calismaSaati: 0,
              kalkisSayisi: 0
            };
            for (var counterIndex = 0; counterIndex < counterRecords.length; counterIndex++) {
              if (counterRecords[counterIndex].timestamp >= targetTime) break;
              latestCounters = counterRecords[counterIndex];
            }

            rowData[4] = 0;
            rowData[5] = 0;
            rowData[6] = 0;
            rowData[7] = 0;
            rowData[8] = 0;
            rowData[9] = 0;
            rowData[10] = 0;
            rowData[11] = 0;
            rowData[12] = getLatestCounterOrFallback(record.toplamAktifEnerji, latestCounters.toplamAktifEnerji);
            rowData[13] = getLatestCounterOrFallback(record.calismaSaati, latestCounters.calismaSaati);
            rowData[14] = getLatestCounterOrFallback(record.kalkisSayisi, latestCounters.kalkisSayisi);
          }

          rowsToAdd.push(rowData);
          groupAddedRecords.push({
            motor: motor,
            tarih: tarih,
            saat: saat,
            row: appendStartRow + rowsToAdd.length - 1
          });

          existingKeys[recordKey] = true;

          counterRecords.push({
            timestamp: targetTime,
            toplamAktifEnerji: rowData[12],
            calismaSaati: rowData[13],
            kalkisSayisi: rowData[14]
          });
          counterRecords.sort(function(a, b) {
            return a.timestamp - b.timestamp;
          });
        }

        if (rowsToAdd.length) {
          sheet.getRange(appendStartRow, 1, rowsToAdd.length, 18).setValues(rowsToAdd);
          var dataRange = sheet.getRange(appendStartRow, 1, rowsToAdd.length, 18);
          dataRange.setHorizontalAlignment('center');
          dataRange.setFontSize(10);
          dataRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
          dataRange.setFontColor('#c62828');
          sheet.getRange(appendStartRow, 5, rowsToAdd.length, 11).setNumberFormat('0.00');
          if (needsSortAfterAppend) {
            sortEnerjiSheetRowsByDateTime(sheet, motor);
            for (var addedIndex = 0; addedIndex < groupAddedRecords.length; addedIndex++) {
              delete groupAddedRecords[addedIndex].row;
            }
          }
          colorizeDates(sheet, groupAddedRecords.map(function(record) {
            return {
              tarih: record.tarih,
              saat: record.saat,
              row: record.row
            };
          }));
          addedRecords = addedRecords.concat(groupAddedRecords);
        }
      } catch (recordError) {
        errors.push({
          motor: motor,
          error: recordError.toString()
        });
      }
    });
    
    console.log('📊 Çoklu enerji kayıt sonucu: ' + addedRecords.length + ' eklendi, ' + errors.length + ' hata');
    var yearlyUpdate = shouldSyncYearlyEnergyUpdate(records[0] || {})
      ? notifyYearlyEnergyForRecords(addedRecords)
      : skippedYearlyEnergyUpdateMessage();
return {
      success: true,
      addedCount: addedRecords.length,
      totalCount: records.length,
      addedRecords: addedRecords,
      errors: errors,
      yearlyUpdate: yearlyUpdate,
      durationMs: new Date().getTime() - startedAt
    };
    
  } catch (error) {
    console.error('Çoklu enerji kayıt ekleme hatası: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// 🔥 Tarihleri renklendirme fonksiyonu
function checkHourlyMissingRecords() {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  try {
    lockAcquired = lock.tryLock(8000);
    if (!lockAcquired) {
      addSystemLog({
        modul: 'Kojen Enerji',
        otomatikKayitSonucu: 'Atlandi',
        mailSonucu: 'Kilit mesgul',
        hataMesaji: 'checkHourlyMissingRecords lock alinmadi',
        detay: 'Sistem mesgul; saatlik otomatik kontrol sonraki calismaya birakildi'
      });
      return {
        success: true,
        skipped: true,
        busy: true,
        message: 'Sistem mesgul; enerji kontrolu sonraki calismaya birakildi'
      };
    }

    var targets = getHourlyCheckTargets(new Date(), 3);
    var results = [];
    var totalMissing = 0;
    var totalAdded = 0;
    var allErrors = [];

    for (var i = 0; i < targets.length; i++) {
      var result = checkHourlyMissingRecordTarget(targets[i]);
      results.push(result);
      totalMissing += result.missingCount || 0;
      totalAdded += result.addedCount || 0;
      if (result.errors && result.errors.length) {
        allErrors = allErrors.concat(result.errors);
      }
    }

    return {
      success: true,
      checkedCount: targets.length,
      missingCount: totalMissing,
      addedCount: totalAdded,
      results: results,
      errors: allErrors
    };
  } catch (error) {
    addSystemLog({
      modul: 'Kojen Enerji',
      otomatikKayitSonucu: 'Hata',
      mailSonucu: 'Bilinmiyor',
      hataMesaji: error.toString(),
      detay: 'checkHourlyMissingRecords'
    });
    return { success: false, error: error.toString() };
  } finally {
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (ignore) {}
    }
  }
}

function checkHourlyMissingRecordTarget(target) {
  try {
    var hour = target.hour;
    var saat = target.saat;
    var tarih = target.tarih;
    var vardiya = getVardiyaByHour(hour);
    var sentKey = 'kojenEnerjiHourlyCheck:' + tarih + ':' + saat;
    var props = PropertiesService.getScriptProperties();

    var motors = ['GM-1', 'GM-2', 'GM-3'];
    var missing = [];
    var existingErrors = [];
    for (var i = 0; i < motors.length; i++) {
      var exists = checkExistingRecord(motors[i], tarih, saat);
      if (!exists.success || !exists.exists) {
        missing.push(motors[i]);
        if (!exists.success) {
          existingErrors.push(motors[i] + ': ' + exists.error);
        }
      }
    }

    if (props.getProperty(sentKey) && missing.length === 0) {
      return { success: true, skipped: true, tarih: tarih, saat: saat, missingCount: 0, addedCount: 0, message: 'Bu saat daha once kontrol edildi' };
    }

    if (missing.length === 0) {
      props.setProperty(sentKey, new Date().toISOString());
      addSystemLog({
        tarih: tarih,
        saat: saat,
        modul: 'Kojen Enerji',
        eksikKayit: 'Yok',
        otomatikKayitSonucu: 'Gerekmedi',
        mailSonucu: 'Gonderilmedi',
        detay: 'Eksik enerji kaydi yok'
      });
      return { success: true, tarih: tarih, saat: saat, missingCount: 0, addedCount: 0, message: 'Eksik enerji kaydi yok' };
    }

    var added = [];
    var errors = [];
    var addedRecords = [];
    var sheetsByMotor = {};
    for (var j = 0; j < missing.length; j++) {
      var motor = missing[j];
      var autoData = {
        tarih: tarih,
        vardiya: vardiya,
        saat: saat,
        motor: motor,
        kaydeden: 'OTOMATIK SISTEM',
        durum: 'MOTOR ÇALIŞMIYOR',
        toplamAktifEnerji: '0',
        calismaSaati: '0',
        kalkisSayisi: '0'
      };
      var addResult = addRecord(autoData);
      if (addResult.success) {
        added.push(motor);
        addedRecords.push({ motor: motor, tarih: tarih, saat: saat });
        sheetsByMotor[motor] = getEnerjiSheetIfExists(motor);
      } else {
        errors.push(motor + ': ' + addResult.error);
      }
    }

    for (var sheetMotor in sheetsByMotor) {
      if (!sheetsByMotor[sheetMotor]) continue;
      colorizeDates(sheetsByMotor[sheetMotor], addedRecords.filter(function(record) {
        return record.motor === sheetMotor;
      }));
    }
    var mailResult = { success: false, skipped: true, error: 'Gunluk rapora ertelendi' };
    var completedAfterAdd = added.length === missing.length;
    var unresolvedMissing = [];
    if (!completedAfterAdd) {
      for (var r = 0; r < missing.length; r++) {
        var recheck = checkExistingRecord(missing[r], tarih, saat);
        if (!recheck.success || !recheck.exists) {
          unresolvedMissing.push(missing[r]);
        }
      }
      completedAfterAdd = unresolvedMissing.length === 0;
    }

    if (completedAfterAdd) {
      props.setProperty(sentKey, new Date().toISOString());
    }

    var autoResultText = added.length + '/' + missing.length + ' basarili';
    if (completedAfterAdd && added.length < missing.length) {
      autoResultText += ' (kayitlar son kontrolde mevcut)';
    }

    addSystemLog({
      tarih: tarih,
      saat: saat,
      modul: 'Kojen Enerji',
      eksikKayit: missing.join(', '),
      otomatikKayitSonucu: autoResultText,
      mailSonucu: mailResult.skipped ? 'Gunluk rapora ertelendi' : (mailResult.success ? 'Basarili' : 'Basarisiz'),
      hataMesaji: existingErrors.concat(errors).concat(mailResult.success || mailResult.skipped ? [] : [mailResult.error]).join('; '),
      detay: 'Otomatik motor calismiyor enerji kaydi'
    });

    return {
      success: true,
      tarih: tarih,
      saat: saat,
      missingCount: missing.length,
      addedCount: added.length,
      missing: missing,
      added: added,
      unresolvedMissing: unresolvedMissing,
      errors: existingErrors.concat(errors),
      mail: mailResult
    };
  } catch (error) {
    addSystemLog({
      tarih: target && target.tarih ? target.tarih : '',
      saat: target && target.saat ? target.saat : '',
      modul: 'Kojen Enerji',
      otomatikKayitSonucu: 'Hata',
      mailSonucu: 'Bilinmiyor',
      hataMesaji: error.toString(),
      detay: 'checkHourlyMissingRecordTarget'
    });
    return { success: false, error: error.toString() };
  }
}

function fillMissingFullDay(tarih, motor, startSaat, endSaat) {
  try {
    var targetTarih = normalizeDateTR(tarih || '');
    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var startHour = startSaat ? parseInt(normalizeEnerjiSaat(startSaat).split(':')[0], 10) : 0;
    var endHour = endSaat ? parseInt(normalizeEnerjiSaat(endSaat).split(':')[0], 10) : 23;

    if (isNaN(startHour) || isNaN(endHour) || startHour < 0 || endHour > 23 || endHour < startHour) {
      return { success: false, error: 'Saat araligi hatali. Ornek: 00:00 - 23:00' };
    }

    var dates = [];
    if (targetTarih) {
      dates.push(targetTarih);
    } else {
      var allRecords = getRecords();
      if (!allRecords.success) return allRecords;
      var dateMap = {};
      for (var r = 0; r < allRecords.data.length; r++) {
        var recordDate = normalizeDateTR(allRecords.data[r].tarih || '');
        if (recordDate) dateMap[recordDate] = true;
      }
      dates = Object.keys(dateMap).sort(function(a, b) {
        return parseDateTimeTR(a, '00:00') - parseDateTimeTR(b, '00:00');
      });
    }

    if (!dates.length) {
      return { success: false, error: 'Taranacak tarih bulunamadi.' };
    }

    var totalAdded = 0;
    var allErrors = [];
    var perDate = [];
    var addedRecords = [];

    for (var d = 0; d < dates.length; d++) {
      var currentDate = dates[d];
      var dateResult = {
        tarih: currentDate,
        motors: []
      };

      for (var m = 0; m < motors.length; m++) {
        var currentMotor = motors[m];
        var sheet = getEnerjiSheetIfExists(currentMotor);
        if (!sheet) {
          var sheetError = currentMotor + ' icin mevcut enerji sayfasi bulunamadi. Yeni sayfa olusturulmadi.';
          allErrors.push(currentDate + ' ' + currentMotor + ': ' + sheetError);
          dateResult.motors.push({
            motor: currentMotor,
            addedCount: 0,
            addedHours: [],
            skippedCount: 0,
            skippedHours: [],
            errors: [sheetError]
          });
          continue;
        }

        var lastRow = sheet.getLastRow();
        var rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 18).getDisplayValues() : [];
        var existingByDateHour = {};
        var counterRecords = [];

        for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          var existingRecord = mapEnerjiRow(rows[rowIndex]);
          var existingDate = normalizeDateTR(existingRecord.tarih || '');
          var existingHour = normalizeEnerjiSaat(existingRecord.saat || '');
          if (existingDate && existingHour) {
            existingByDateHour[existingDate + '|' + existingHour] = true;
          }

          var recordTime = parseDateTimeTR(existingDate, existingHour).getTime();
          if (isNaN(recordTime)) continue;

          var energy = parseEnerjiNumber(existingRecord.toplamAktifEnerji);
          var hours = parseEnerjiNumber(existingRecord.calismaSaati);
          var starts = parseEnerjiNumber(existingRecord.kalkisSayisi);
          if (energy > 0 || hours > 0 || starts > 0) {
            counterRecords.push({
              timestamp: recordTime,
              toplamAktifEnerji: energy,
              calismaSaati: hours,
              kalkisSayisi: starts
            });
          }
        }

        counterRecords.sort(function(a, b) {
          return a.timestamp - b.timestamp;
        });

        var rowsToAdd = [];
        var addedHours = [];
        var skippedHours = [];
        var errors = [];

        for (var hour = startHour; hour <= endHour; hour++) {
          var saat = pad2(hour) + ':00';
          if (existingByDateHour[currentDate + '|' + saat]) {
            skippedHours.push(saat);
            continue;
          }

          var targetTime = parseDateTimeTR(currentDate, saat).getTime();
          var latestCounters = {
            toplamAktifEnerji: 0,
            calismaSaati: 0,
            kalkisSayisi: 0
          };
          for (var counterIndex = 0; counterIndex < counterRecords.length; counterIndex++) {
            if (counterRecords[counterIndex].timestamp >= targetTime) break;
            latestCounters = counterRecords[counterIndex];
          }

          rowsToAdd.push([
            currentDate,
            getVardiyaByHour(hour),
            saat,
            currentMotor,
            0, 0, 0, 0, 0, 0, 0, 0,
            latestCounters.toplamAktifEnerji,
            latestCounters.calismaSaati,
            latestCounters.kalkisSayisi,
            normalizeEnerjiDurum('MOTOR CALISMIYOR'),
            'OTOMATIK SISTEM',
            Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
          ]);

          existingByDateHour[currentDate + '|' + saat] = true;
          addedHours.push(saat);
          totalAdded++;
          addedRecords.push({ motor: currentMotor, tarih: currentDate, saat: saat });
        }

        if (rowsToAdd.length) {
          var appendStartRow = sheet.getLastRow() + 1;
          sheet.getRange(appendStartRow, 1, rowsToAdd.length, 18).setValues(rowsToAdd);
          var addedRange = sheet.getRange(appendStartRow, 1, rowsToAdd.length, 18);
          addedRange.setHorizontalAlignment('center');
          addedRange.setFontSize(10);
          addedRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
          addedRange.setFontColor('#c62828');
          sheet.getRange(appendStartRow, 5, rowsToAdd.length, 11).setNumberFormat('0.00');
          sortEnerjiSheetRowsByDateTime(sheet);
          colorizeDates(sheet, addedHours.map(function(addedSaat) {
            return { tarih: currentDate, saat: addedSaat };
          }));
        }

        dateResult.motors.push({
          motor: currentMotor,
          addedCount: addedHours.length,
          addedHours: addedHours,
          skippedCount: skippedHours.length,
          skippedHours: skippedHours,
          errors: errors
        });
      }

      perDate.push(dateResult);
    }
addSystemLog({
      tarih: targetTarih || dates[0],
      modul: 'Kojen Enerji',
      eksikKayit: totalAdded ? ('Toplam ' + totalAdded + ' saat dolduruldu') : 'Yok',
      otomatikKayitSonucu: totalAdded ? 'Tum gun eksik saat doldurma' : 'Gerekmedi',
      mailSonucu: 'Gonderilmedi',
      hataMesaji: allErrors.join('; '),
      detay: targetTarih ? 'Tek tarih icin kojen enerji eksikleri dolduruldu' : 'Tum tarihler icin kojen enerji eksikleri dolduruldu'
    });

    return {
      success: true,
      scannedDateCount: dates.length,
      totalAddedCount: totalAdded,
      dates: perDate,
      errors: allErrors
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function sortEnergySheet(motor) {
  try {
    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var results = [];

    for (var i = 0; i < motors.length; i++) {
      var currentMotor = motors[i];
      var sheet = getEnerjiSheetIfExists(currentMotor);
      if (!sheet) {
        results.push({
          motor: currentMotor,
          success: false,
          error: 'Mevcut enerji sayfasi bulunamadi'
        });
        continue;
      }

      results.push(sortEnerjiSheetRowsByDateTime(sheet, currentMotor));
    }

    return { success: true, results: results };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function colorizeEnergySheet(motor) {
  try {
    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var results = [];

    for (var i = 0; i < motors.length; i++) {
      var currentMotor = motors[i];
      var sheet = getEnerjiSheetIfExists(currentMotor);
      if (!sheet) {
        results.push({
          motor: currentMotor,
          success: false,
          error: 'Mevcut enerji sayfasi bulunamadi'
        });
        continue;
      }

      var records = [];
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
        for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          records.push({
            row: rowIndex + 2,
            tarih: rows[rowIndex][0],
            saat: rows[rowIndex][2]
          });
        }
      }

      var colorResult = colorizeDates(sheet, records);
      results.push({
        success: colorResult.success !== false,
        motor: currentMotor,
        sheetName: sheet.getName(),
        rowCount: Math.max(0, lastRow - 1),
        coloredCount: colorResult.coloredCount || 0,
        error: colorResult.error || ''
      });
    }

    return { success: true, results: results };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function sortEnerjiSheetRowsByDateTime(sheet, motor) {
  try {
    if (!sheet || sheet.getLastRow() < 3) {
      return {
        success: true,
        sheetName: sheet ? sheet.getName() : '',
        rowCount: 0,
        skipped: true
      };
    }

    var rowCount = sheet.getLastRow() - 1;
    var range = sheet.getRange(2, 1, rowCount, 18);
    var values = range.getValues();
    var displayValues = range.getDisplayValues();
    var backgrounds = range.getBackgrounds();
    var fontColors = range.getFontColors();
    var rows = [];

    for (var i = 0; i < values.length; i++) {
      rows.push({
        values: values[i],
        backgrounds: backgrounds[i],
        fontColors: fontColors[i],
        timestamp: parseDateTimeTR(displayValues[i][0] || values[i][0], displayValues[i][2] || values[i][2]).getTime(),
        originalIndex: i
      });
    }

    rows.sort(function(a, b) {
      var aTime = isNaN(a.timestamp) ? Number.MAX_SAFE_INTEGER : a.timestamp;
      var bTime = isNaN(b.timestamp) ? Number.MAX_SAFE_INTEGER : b.timestamp;
      if (aTime !== bTime) return aTime - bTime;
      return a.originalIndex - b.originalIndex;
    });

    var sortedValues = [];
    var sortedBackgrounds = [];
    var sortedFontColors = [];
    for (var j = 0; j < rows.length; j++) {
      sortedValues.push(rows[j].values);
      sortedBackgrounds.push(rows[j].backgrounds);
      sortedFontColors.push(rows[j].fontColors);
    }

    range.setValues(sortedValues);
    range.setBackgrounds(sortedBackgrounds);
    range.setFontColors(sortedFontColors);
    range.setHorizontalAlignment('center');
    sheet.getRange(2, 5, rowCount, 11).setNumberFormat('0.00');

    return {
      success: true,
      motor: motor || '',
      sheetName: sheet.getName(),
      rowCount: rowCount
    };
  } catch (error) {
    return {
      success: false,
      sheetName: sheet ? sheet.getName() : '',
      error: error.toString()
    };
  }
}

function getOrCreateSystemLogsSheet() {
  var spreadsheet = SpreadsheetApp.openById(KOJEN_ENERJI_SPREADSHEET_ID);
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
      data.modul || data.module || 'Kojen Enerji',
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
    .everyHours(1)
    .create();

  return { success: true, message: 'Enerji saatlik eksik kayit tetikleyicisi kuruldu. Kontrol saatte bir calisir; mail gunluk rapora ertelendi.' };
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
  if (target.getMinutes() < 59) {
    target.setHours(target.getHours() - 1);
  }
  return {
    hour: target.getHours(),
    saat: pad2(target.getHours()) + ':00',
    tarih: Utilities.formatDate(target, Session.getScriptTimeZone(), 'dd.MM.yyyy')
  };
}

function getHourlyCheckTargets(date, lookbackHours) {
  var baseTarget = getHourlyCheckTarget(date);
  var baseDateTime = parseDateTimeTR(baseTarget.tarih, baseTarget.saat);
  var count = Math.max(1, parseInt(lookbackHours, 10) || 1);
  var targets = [];
  var seen = {};

  for (var i = 0; i < count; i++) {
    var targetDate = new Date(baseDateTime.getTime());
    targetDate.setHours(targetDate.getHours() - i);

    var target = {
      hour: targetDate.getHours(),
      saat: pad2(targetDate.getHours()) + ':00',
      tarih: Utilities.formatDate(targetDate, Session.getScriptTimeZone(), 'dd.MM.yyyy')
    };
    var key = target.tarih + '|' + target.saat;
    if (seen[key]) continue;
    seen[key] = true;
    targets.push(target);
  }

  return targets;
}

function getLastNormalRecordBefore(motor, tarih, saat) {
  var result = getRecords();
  if (!result.success || !result.data) return null;

  var limit = parseDateTimeTR(tarih, saat);
  var searchMotor = normalizeEnerjiMotorLabel(motor);
  var records = result.data.filter(function(record) {
    return normalizeEnerjiMotorLabel(record.motor) === searchMotor &&
      String(record.durum || '').toUpperCase() === 'NORMAL' &&
      parseDateTimeTR(record.tarih, record.saat) < limit;
  });

  records.sort(function(a, b) {
    return parseDateTimeTR(b.tarih, b.saat) - parseDateTimeTR(a.tarih, a.saat);
  });

  return records[0] || null;
}

function parseDateTimeTR(tarih, saat) {
  if (Object.prototype.toString.call(tarih) === '[object Date]' && !isNaN(tarih.getTime())) {
    var dateHourParts = String(saat || '00:00').split(':');
    return new Date(
      tarih.getFullYear(),
      tarih.getMonth(),
      tarih.getDate(),
      parseInt(dateHourParts[0] || '0', 10),
      parseInt(dateHourParts[1] || '0', 10)
    );
  }

  var text = String(tarih || '');
  var parts;
  if (text.indexOf('-') !== -1) {
    parts = text.split('-').reverse();
  } else if (text.indexOf('/') !== -1) {
    var slashParts = text.split('/');
    parts = slashParts[0].length === 4
      ? [slashParts[2], slashParts[1], slashParts[0]]
      : [slashParts[1], slashParts[0], slashParts[2]];
  } else {
    parts = text.split('.');
  }
  var hourParts = String(saat || '00:00').split(':');
  return new Date(
    parseInt(parts[2], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[0], 10),
    parseInt(hourParts[0] || '0', 10),
    parseInt(hourParts[1] || '0', 10)
  );
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function colorizeDates(sheet, addedRecords) {
  try {
    if (!sheet || !addedRecords || !addedRecords.length) {
      return { success: true, coloredCount: 0, dateCount: 0 };
    }

    var dateGroups = {};
    var rowTargets = {};
    var keyTargets = {};

    for (var i = 0; i < addedRecords.length; i++) {
      var record = addedRecords[i] || {};
      var tarih = normalizeDateTR(record.tarih || '');
      var saat = normalizeEnerjiSaat(record.saat || '');
      if (!tarih) continue;

      dateGroups[tarih] = true;
      if (record.row) {
        rowTargets[String(record.row)] = tarih;
      }
      if (saat) {
        keyTargets[tarih + '|' + saat] = tarih;
      }
    }

    var directRowKeys = Object.keys(rowTargets);
    if (directRowKeys.length && directRowKeys.length === addedRecords.length && directRowKeys.length <= 100) {
      var directRows = [];
      for (var directIndex = 0; directIndex < directRowKeys.length; directIndex++) {
        var directRow = parseInt(directRowKeys[directIndex], 10);
        if (!directRow || directRow < 2) continue;
        directRows.push({
          row: directRow,
          color: getDateColor(rowTargets[directRowKeys[directIndex]])
        });
      }

      directRows.sort(function(a, b) {
        return a.row - b.row;
      });

      var runStartRow = 0;
      var runBackgrounds = [];
      var coloredDirectCount = 0;

      function flushDirectBackgroundRun() {
        if (!runStartRow || !runBackgrounds.length) return;
        sheet.getRange(runStartRow, 1, runBackgrounds.length, 18).setBackgrounds(runBackgrounds);
        coloredDirectCount += runBackgrounds.length;
        runStartRow = 0;
        runBackgrounds = [];
      }

      for (var rowIndex = 0; rowIndex < directRows.length; rowIndex++) {
        var item = directRows[rowIndex];
        var rowBackground = [];
        for (var colIndex = 0; colIndex < 18; colIndex++) {
          rowBackground.push(item.color);
        }

        if (!runStartRow) {
          runStartRow = item.row;
          runBackgrounds = [rowBackground];
          continue;
        }

        if (item.row === runStartRow + runBackgrounds.length) {
          runBackgrounds.push(rowBackground);
        } else {
          flushDirectBackgroundRun();
          runStartRow = item.row;
          runBackgrounds = [rowBackground];
        }
      }
      flushDirectBackgroundRun();

      return {
        success: true,
        coloredCount: coloredDirectCount,
        dateCount: Object.keys(dateGroups).length,
        direct: true
      };
    }

    var coloredCount = 0;
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var rowCount = lastRow - 1;
      var displayRows = sheet.getRange(2, 1, rowCount, 3).getDisplayValues();
      var backgrounds = sheet.getRange(2, 1, rowCount, 18).getBackgrounds();

      for (var rowIndex = 0; rowIndex < displayRows.length; rowIndex++) {
        var sheetRow = rowIndex + 2;
        var rowDate = normalizeDateTR(displayRows[rowIndex][0] || '');
        var rowSaat = normalizeEnerjiSaat(displayRows[rowIndex][2] || '');
        var targetDate = rowTargets[String(sheetRow)] || keyTargets[rowDate + '|' + rowSaat] || '';
        if (!targetDate) continue;

        var color = getDateColor(targetDate);
        for (var col = 0; col < 18; col++) {
          backgrounds[rowIndex][col] = color;
        }
        coloredCount++;
      }

      sheet.getRange(2, 1, rowCount, 18).setBackgrounds(backgrounds);
    }

    console.log('Enerji tarih renklendirme: ' + coloredCount + ' satir, ' + Object.keys(dateGroups).length + ' tarih');
    return { success: true, coloredCount: coloredCount, dateCount: Object.keys(dateGroups).length };
  } catch (error) {
    console.error('Enerji renklendirme hatası: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function getDateColor(tarih) {
  var colors = [
    '#e8f4ff', '#eaf7ea', '#fff4d6', '#f3e8ff', '#ffe8ef',
    '#e7f7f7', '#f7efe7', '#eef2ff', '#f2f7e7', '#fff0e6'
  ];
  var text = normalizeDateTR(tarih || '');
  var hash = 0;
  for (var i = 0; i < text.length; i++) {
    hash = ((hash * 31) + text.charCodeAt(i)) % colors.length;
  }
  return colors[Math.abs(hash) % colors.length];
}

// Geriye dönük uyumluluk için bırakıldı
function getRandomColor() {
  return getDateColor(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy'));
}

// Mail gönderme fonksiyonu
function sendEmailAlert(data) {
  try {
    if (!data) {
      return { success: false, error: 'Veri parametresi eksik' };
    }

    var to = data.to || 'mrtcsk0320@gmail.com';
    var subject = data.subject || 'Kojen Enerji Veri Uyarısı';
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

// 🔥 KAYIT GÜNCELLEME FONKSİYONU
function updateRecord(params) {
  var startedAt = new Date().getTime();
  try {
    var motor = normalizeEnerjiMotorLabel(params.motor);
    var tarih = normalizeDateTR(params.tarih);
    var saat = normalizeEnerjiSaat(params.saat);
    
    // Motor bazlı sayfayı bul
    var sheet = getEnerjiSheetIfExists(motor);
    if (!sheet) {
      return { success: false, error: motor + ' motoru için enerji sayfası bulunamadı.' };
    }
    
    // Kaydı bul
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: 'Kayıt bulunamadı - sayfa boş' };
    }
    
    var data = sheet.getRange(2, 1, lastRow - 1, 18).getDisplayValues();
    var foundRow = -1;
    var oldValues = null;
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rowTarih = normalizeDateTR(row[0] || '');
      var rowSaat = normalizeEnerjiSaat(row[2] || '');
      var rowMotor = normalizeEnerjiMotorLabel(row[3] || '');
      
      if (rowTarih === tarih && rowSaat === saat && rowMotor === motor) {
        foundRow = i + 2;
        oldValues = row.slice();
        break;
      }
    }
    
    if (foundRow === -1) {
      return { success: false, error: 'Kayıt bulunamadı' };
    }
    
    // Eski değerleri düzenleme geçmişine kaydet
    var duzenlemeGecmisSheet = getOrCreateDuzenlemeGecmisSheet();
    var duzenlemeTarihi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
    
    duzenlemeGecmisSheet.appendRow([
      duzenlemeTarihi,
      tarih,
      saat,
      motor,
      oldValues[4] || '', // Eski AYDEM VOLTAJI
      oldValues[5] || '', // Eski AKTİF GÜÇ
      oldValues[6] || '', // Eski REAKTİF GÜÇ
      oldValues[7] || '', // Eski Cos φ
      oldValues[8] || '', // Eski ORT.AKIM
      oldValues[9] || '', // Eski ORT.GERİLİM
      oldValues[10] || '', // Eski NÖTR AKIMI
      oldValues[11] || '', // Eski TAHRİK GERİLİMİ
      oldValues[12] || '', // Eski TOPLAM AKTİF ENERJİ
      oldValues[13] || '', // Eski ÇALIŞMA SAATİ
      oldValues[14] || '', // Eski KALKIŞ SAYISI
      oldValues[15] || '', // Eski Durum
      params.aydemVoltaji || '',
      params.aktifGuc || '',
      params.reaktifGuc || '',
      params.cosPhi || '',
      params.ortAkim || '',
      params.ortGerilim || '',
      params.notrAkim || '',
      params.tahrikGerilimi || '',
      params.toplamAktifEnerji || '',
      params.calismaSaati || '',
      params.kalkisSayisi || '',
      params.durum || 'NORMAL',
      params.duzenlemeNotu || '',
      params.duzenleyen || 'Admin'
    ]);
    
    // Yeni değerleri güncelle
    var durum = normalizeEnerjiDurum(params.durum || 'NORMAL');
    var newValues = [
      tarih,
      params.vardiya || '',
      saat,
      motor,
      parseFloat(params.aydemVoltaji) || 0,
      parseFloat(params.aktifGuc) || 0,
      parseFloat(params.reaktifGuc) || 0,
      parseFloat(params.cosPhi) || 0,
      parseFloat(params.ortAkim) || 0,
      parseFloat(params.ortGerilim) || 0,
      parseFloat(params.notrAkim) || 0,
      parseFloat(params.tahrikGerilimi) || 0,
      parseFloat(params.toplamAktifEnerji) || 0,
      parseFloat(params.calismaSaati) || 0,
      parseFloat(params.kalkisSayisi) || 0,
      durum,
      oldValues[16] || '', // Kaydeden (değişmez)
      oldValues[17] || ''  // Kayıt Tarihi (değişmez)
    ];
    
    sheet.getRange(foundRow, 1, 1, 18).setValues([newValues]);
    
    // Formatlama
    var dataRange = sheet.getRange(foundRow, 1, 1, 18);
    dataRange.setHorizontalAlignment('center');
    dataRange.setFontSize(10);
    dataRange.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    // Sayısal formatlar
    sheet.getRange(foundRow, 5, 1, 10).setNumberFormat('0.00');
    sheet.getRange(foundRow, 15, 1, 1).setNumberFormat('0');
    
    // Tarih renklendirme
    colorizeDates(sheet, [{ tarih: tarih, saat: saat, row: foundRow }]);
    
    // Motor çalışmıyor durumunda kırmızı yazı
    if (durum === 'MOTOR ÇALIŞMIYOR') {
      dataRange.setFontColor('#c62828');
    }
    
    Logger.log('Kayıt güncellendi: ' + motor + ' ' + tarih + ' ' + saat);
    
    return {
      success: true,
      message: 'Kayıt başarıyla güncellendi',
      row: foundRow,
      durationMs: new Date().getTime() - startedAt
    };
    
  } catch (error) {
    Logger.log('Kayıt güncelleme hatası: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// 🔥 DÜZENLEME GEÇMİŞİ SAYFASI OLUŞTURMA
function getOrCreateDuzenlemeGecmisSheet() {
  var spreadsheet = SpreadsheetApp.openById(KOJEN_ENERJI_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName('DuzenlemeGecmisi');
  var headers = ['Düzenleme Tarihi', 'Tarih', 'Saat', 'Motor', 
                 'Eski AYDEM VOLTAJI', 'Eski AKTİF GÜÇ', 'Eski REAKTİF GÜÇ', 'Eski Cos φ', 
                 'Eski ORT.AKIM', 'Eski ORT.GERİLİM', 'Eski NÖTR AKIMI', 'Eski TAHRİK GERİLİMİ',
                 'Eski TOPLAM AKTİF ENERJİ', 'Eski ÇALIŞMA SAATİ', 'Eski KALKIŞ SAYISI', 'Eski Durum',
                 'Yeni AYDEM VOLTAJI', 'Yeni AKTİF GÜÇ', 'Yeni REAKTİF GÜÇ', 'Yeni Cos φ',
                 'Yeni ORT.AKIM', 'Yeni ORT.GERİLİM', 'Yeni NÖTR AKIMI', 'Yeni TAHRİK GERİLİMİ',
                 'Yeni TOPLAM AKTİF ENERJİ', 'Yeni ÇALIŞMA SAATİ', 'Yeni KALKIŞ SAYISI', 'Yeni Durum',
                 'Düzenleme Notu', 'Düzenleyen'];
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet('DuzenlemeGecmisi');
    sheet.appendRow(headers);
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#0f172a');
    headerRange.setFontColor('#ffffff');
    sheet.getRange(2, 1, 1000, headers.length).setNumberFormat('@');
    
    // Sütun genişlikleri
    sheet.setColumnWidth(1, 150); // Düzenleme Tarihi
    sheet.setColumnWidth(2, 100); // Tarih
    sheet.setColumnWidth(3, 80);  // Saat
    sheet.setColumnWidth(4, 80);  // Motor
    for (var i = 5; i <= 16; i++) {
      sheet.setColumnWidth(i, 120); // Eski değerler
    }
    for (var i = 17; i <= 28; i++) {
      sheet.setColumnWidth(i, 120); // Yeni değerler
    }
    sheet.setColumnWidth(29, 200); // Düzenleme Notu
    sheet.setColumnWidth(30, 120); // Düzenleyen
  }
  
  return sheet;
}

function normalizeEnerjiDurum(durum) {
  var value = String(durum || 'NORMAL').trim();
  if (!value) return 'NORMAL';

  var upper = value.toUpperCase()
    .replace(/\u00C7/g, 'C')
    .replace(/\u011E/g, 'G')
    .replace(/\u0130/g, 'I')
    .replace(/\u0049\u0307/g, 'I')
    .replace(/\u00D6/g, 'O')
    .replace(/\u015E/g, 'S')
    .replace(/\u00DC/g, 'U');

  if (upper.indexOf('MOTOR') !== -1 && upper.indexOf('NORMAL') === -1) {
    return 'MOTOR ÇALIŞMIYOR';
  }

  return value;
}
