/**
 * MIRROR READER — Web App
 * ========================
 * startDate / endDate parametresiyle tarih filtreli okuma yapar.
 * Önce A sütununu tarar (tarih), sonra yalnızca eşleşen satır aralığını okur.
 *
 * KULLANIM:
 *   ?action=getMotorRecords&motor=GM-1&startDate=2026-08-05&endDate=2026-08-12
 *   ?action=getEnerjiRecords&startDate=2026-08-05&endDate=2026-08-12
 *   ?action=health
 */

var MIRROR_SPREADSHEET_ID  = '1sOJPeIT8R812sf8bPfFW3g2ternvaT1JMhPioojKDjk';
var MIRROR_READER_VERSION   = 'mirror-reader-2026-09-04-v4';
var MOTOR_MIRROR_COL_COUNT  = 22;
var ENERJI_MIRROR_COL_COUNT = 18;

// ─── Entry point ──────────────────────────────────────────────────────────────

function doGet(e) {
  return handleMirrorRequest(e);
}

function doPost(e) {
  return handleMirrorRequest(e);
}

function handleMirrorRequest(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = String(params.action || 'health').trim();

  try {
    var result;
    switch (action) {
      case 'health':
        result = getMirrorHealth();
        break;
      case 'getRecords':
      case 'getMotorRecords':
        result = getMotorMirrorRecords(
          params.motor      || '',
          params.startDate  || '',
          params.endDate    || ''
        );
        break;
      case 'getEnerjiRecords':
        result = getEnerjiMirrorRecords(
          params.motor      || '',
          params.startDate  || '',
          params.endDate    || ''
        );
        break;
      case 'updateRecord':
        result = updateMirrorRecord(params);
        break;
      default:
        result = { success: false, error: 'Gecersiz action: ' + action };
    }
    return buildResponse(result);
  } catch (err) {
    return buildResponse({ success: false, error: err.toString() });
  }
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Sağlık kontrolü ──────────────────────────────────────────────────────────

function getMirrorHealth() {
  return {
    success: true,
    version: MIRROR_READER_VERSION,
    spreadsheetId: MIRROR_SPREADSHEET_ID,
    checkedAt: new Date().toISOString()
  };
}

// ─── Tarih parse yardımcıları ─────────────────────────────────────────────────

/**
 * "YYYY-MM-DD" veya "DD.MM.YYYY" parametre string'i → Date objesi
 */
function parseDateParam(str) {
  if (!str) return null;
  var text = String(str).trim();
  if (!text) return null;
  var parts;
  if (text.indexOf('-') !== -1) {
    parts = text.split('-');
    if (parts[0].length === 4) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  }
  if (text.indexOf('.') !== -1) {
    parts = text.split('.');
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return null;
}

/**
 * Hücre değeri → Date objesi
 * Desteklenen formatlar: DD.MM.YYYY | DD/MM/YYYY | YYYY-MM-DD | Date nesnesi
 */
function parseCellDate(cellValue) {
  if (!cellValue) return null;
  if (cellValue instanceof Date) {
    return new Date(cellValue.getFullYear(), cellValue.getMonth(), cellValue.getDate());
  }
  var text = String(cellValue).trim();
  if (!text) return null;

  var y, m, d, parts;

  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    parts = text.split('-');
    y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10);
    if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d);
  }
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(text)) {
    parts = text.split('.');
    d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
    if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(text)) {
    parts = text.split('/');
    d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
    if (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(y, m - 1, d);
  }
  return null;
}

// ─── Tarih aralığına göre satır aralığı bul ───────────────────────────────────

/**
 * Sayfanın A sütununu tarar, startDate–endDate aralığındaki
 * ilk ve son satır numaralarını döner. Eşleşme yoksa null döner.
 */
function findRowRange(sheet, lastRow, startDate, endDate) {
  var dateCol    = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  var firstMatch = -1;
  var lastMatch  = -1;

  for (var i = 0; i < dateCol.length; i++) {
    var rd = parseCellDate(dateCol[i][0]);
    if (!rd) continue;
    if (startDate && rd < startDate) continue;
    if (endDate   && rd > endDate)   continue;
    if (firstMatch === -1) firstMatch = i + 2; // +2: 0-index + başlık satırı
    lastMatch = i + 2;
  }

  if (firstMatch === -1) return null;
  return { first: firstMatch, last: lastMatch };
}

// ─── Motor Mirror okuma ───────────────────────────────────────────────────────

function getMotorMirrorRecords(motorFilter, startDateStr, endDateStr) {
  var ss        = SpreadsheetApp.openById(MIRROR_SPREADSHEET_ID);
  var sheets    = ss.getSheets();
  var records   = [];
  var startDate = parseDateParam(startDateStr);
  var endDate   = parseDateParam(endDateStr);

  if (endDate) endDate.setHours(23, 59, 59, 999);

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name  = sheet.getName();

    if (!/^Motor Mirror GM-\d+$/i.test(name)) continue;

    if (motorFilter) {
      var sheetMotor = normalizeMotor(name.replace(/^Motor Mirror /i, ''));
      if (sheetMotor !== normalizeMotor(motorFilter)) continue;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;

    var readStart = 2;
    var readEnd   = lastRow;

    if (startDate || endDate) {
      var range = findRowRange(sheet, lastRow, startDate, endDate);
      if (!range) continue;
      readStart = range.first;
      readEnd   = range.last;
    }

    var data = sheet.getRange(readStart, 1, readEnd - readStart + 1, MOTOR_MIRROR_COL_COUNT).getDisplayValues();
    for (var j = 0; j < data.length; j++) {
      if (!data[j][0]) continue;
      records.push(mapMotorRow(data[j]));
    }
  }

  return { success: true, data: records, count: records.length, version: MIRROR_READER_VERSION };
}

function mapMotorRow(row) {
  return {
    tarih:                 normalizeDateTR(row[0]),
    vardiya:               row[1]  || '',
    saat:                  normalizeSaat(row[2]),
    motor:                 normalizeMotor(row[3]),
    jenYatakSicaklikDE:    row[4]  || '0',
    jenYatakSicaklikNDE:   row[5]  || '0',
    sogutmaSuyuSicaklik:   row[6]  || '0',
    sogutmaSuyuBasinc:     row[7]  || '0',
    yagSicaklik:           row[8]  || '0',
    yagBasinc:             row[9]  || '0',
    sarjSicaklik:          row[10] || '0',
    sarjBasinc:            row[11] || '0',
    gazRegulatoru:         row[12] || '0',
    makineDairesiSicaklik: row[13] || '0',
    karterBasinc:          row[14] || '0',
    onKamaraFarkBasinc:    row[15] || '0',
    sargiSicaklik1:        row[16] || '0',
    sargiSicaklik2:        row[17] || '0',
    sargiSicaklik3:        row[18] || '0',
    durum:                 row[19] || 'NORMAL',
    kaydeden:              row[20] || '',
    kayitTarihi:           row[21] || ''
  };
}

// ─── Enerji Mirror okuma ──────────────────────────────────────────────────────

function getEnerjiMirrorRecords(motorFilter, startDateStr, endDateStr) {
  var ss        = SpreadsheetApp.openById(MIRROR_SPREADSHEET_ID);
  var sheets    = ss.getSheets();
  var records   = [];
  var startDate = parseDateParam(startDateStr);
  var endDate   = parseDateParam(endDateStr);

  if (endDate) endDate.setHours(23, 59, 59, 999);

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name  = sheet.getName();

    if (!/^Enerji Mirror GM-\d+$/i.test(name)) continue;

    if (motorFilter) {
      var sheetMotor = normalizeMotor(name.replace(/^Enerji Mirror /i, ''));
      if (sheetMotor !== normalizeMotor(motorFilter)) continue;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;

    var readStart = 2;
    var readEnd   = lastRow;

    if (startDate || endDate) {
      var range = findRowRange(sheet, lastRow, startDate, endDate);
      if (!range) continue;
      readStart = range.first;
      readEnd   = range.last;
    }

    var data = sheet.getRange(readStart, 1, readEnd - readStart + 1, ENERJI_MIRROR_COL_COUNT).getDisplayValues();
    for (var j = 0; j < data.length; j++) {
      if (!data[j][0]) continue;
      records.push(mapEnerjiRow(data[j]));
    }
  }

  return { success: true, data: records, count: records.length, version: MIRROR_READER_VERSION };
}

function mapEnerjiRow(row) {
  return {
    tarih:             normalizeDateTR(row[0]),
    vardiya:           row[1]  || '',
    saat:              normalizeSaat(row[2]),
    motor:             normalizeMotor(row[3]),
    aydemVoltaji:      row[4]  || '0',
    aktifGuc:          row[5]  || '0',
    reaktifGuc:        row[6]  || '0',
    cosPhi:            row[7]  || '0',
    ortAkim:           row[8]  || '0',
    ortGerilim:        row[9]  || '0',
    notrAkim:          row[10] || '0',
    tahrikGerilimi:    row[11] || '0',
    toplamAktifEnerji: row[12] || '0',
    calismaSaati:      row[13] || '0',
    kalkisSayisi:      row[14] || '0',
    durum:             row[15] || 'NORMAL',
    kaydeden:          row[16] || '',
    kayitTarihi:       row[17] || ''
  };
}

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function normalizeDateTR(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  if (text.indexOf('-') !== -1) {
    var parts = text.split('-');
    if (parts[0].length === 4) return parts[2] + '.' + parts[1] + '.' + parts[0];
    return parts[0] + '.' + parts[1] + '.' + parts[2];
  }
  return text;
}

function normalizeSaat(value) {
  var text = String(value || '').trim();
  if (!text) return '00:00';
  if (text === '24:00' || text.startsWith('24:')) return '00:00';
  var parts = text.split(':');
  var h = String(parseInt(parts[0] || '0', 10) || 0).padStart(2, '0');
  var m = String(parseInt(parts[1] || '0', 10) || 0).padStart(2, '0');
  return h + ':' + m;
}

function normalizeMotor(value) {
  var text  = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  var match = text.match(/GM-?(\d+)$/);
  if (match) return 'GM-' + match[1];
  return text || 'GM-1';
}

// ─── Record Update ────────────────────────────────────────────────────────────

/**
 * type parametresi:
 *   'motor'  → Motor Mirror GM-* sayfasına yazar (22 sütun)
 *   'enerji' → Enerji Mirror GM-* sayfasına yazar (18 sütun)
 *
 * Kayıt bulunamazsa yeni satır olarak ekler, bulunursa üzerine yazar.
 */
function updateMirrorRecord(params) {
  var motor = normalizeMotor(params.motor || '');
  var tarih = mirrorNormalizeDateTR(params.tarih || '');
  var saat  = normalizeSaat(params.saat || '00:00');

  if (!motor || !tarih) {
    return { success: false, error: 'Motor veya tarih eksik' };
  }

  var typeParam   = String(params.type || '').toLowerCase();
  var ss          = SpreadsheetApp.openById(MIRROR_SPREADSHEET_ID);
  var sheets      = ss.getSheets();
  var targetSheet = null;
  var isMotor     = true;

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name  = sheet.getName();

    if (/^Motor Mirror GM-\d+$/i.test(name) &&
        normalizeMotor(name.replace(/^Motor Mirror /i, '')) === motor) {
      if (typeParam === 'enerji') continue;
      targetSheet = sheet;
      isMotor     = true;
      break;
    }
    if (/^Enerji Mirror GM-\d+$/i.test(name) &&
        normalizeMotor(name.replace(/^Enerji Mirror /i, '')) === motor) {
      if (typeParam === 'motor') continue;
      targetSheet = sheet;
      isMotor     = false;
      break;
    }
  }

  if (!targetSheet) {
    var newSheetName = (typeParam === 'enerji') ? 'Enerji Mirror ' + motor : 'Motor Mirror ' + motor;
    targetSheet = ss.insertSheet(newSheetName);
    isMotor     = (typeParam !== 'enerji');

    var motorHeaders  = ['Tarih','Vardiya','Saat','Motor','JEN. YATAK SIC. (DE)','JEN. YATAK SIC. (NDE)','SOĞUTMA SUYU SIC.','SOĞUTMA SUYU BAS.','YAĞ SIC.','YAĞ BAS.','ŞARJ SIC.','ŞARJ BAS.','GAZ REG. (λ)','MAKİNE DAİRESİ SIC.','KARTER BAS.','ÖN KAMARA FARK BAS.','SARGI SIC. -1-','SARGI SIC. -2-','SARGI SIC. -3-','Durum','Kaydeden','Kayıt Tarihi'];
    var enerjiHeaders = ['Tarih','Vardiya','Saat','Motor','AYDEM VOLTAJI','AKTİF GÜÇ','REAKTİF GÜÇ','Cos φ','ORT.AKIM','ORT.GERİLİM','NÖTR AKIMI','TAHRİK GERİLİMİ','TOPLAM AKTİF ENERJİ','ÇALIŞMA SAATİ','KALKIŞ SAYISI','Durum','Kaydeden','Kayıt Tarihi'];
    var hdr      = isMotor ? motorHeaders : enerjiHeaders;
    var hdrRange = targetSheet.getRange(1, 1, 1, hdr.length);
    hdrRange.setValues([hdr]);
    hdrRange.setFontWeight('bold');
    hdrRange.setBackground('#0f172a');
    hdrRange.setFontColor('#ffffff');
    Logger.log('[MirrorReader] Yeni sayfa oluşturuldu: ' + newSheetName);
  }

  var colCount = isMotor ? MOTOR_MIRROR_COL_COUNT : ENERJI_MIRROR_COL_COUNT;
  var lastRow  = targetSheet.getLastRow();
  var foundRow = -1;

  if (lastRow >= 2) {
    var data = targetSheet.getRange(2, 1, lastRow - 1, colCount).getDisplayValues();
    for (var j = 0; j < data.length; j++) {
      if (mirrorNormalizeDateTR(data[j][0]) === tarih &&
          normalizeSaat(data[j][2])         === saat  &&
          normalizeMotor(data[j][3])        === motor) {
        foundRow = j + 2;
        break;
      }
    }
  }

  var writeRow        = (foundRow !== -1) ? foundRow : (lastRow + 1);
  var existingRow     = (foundRow !== -1) ? targetSheet.getRange(foundRow, 1, 1, colCount).getDisplayValues()[0] : [];
  var kaydeden        = params.kaydeden    || existingRow[isMotor ? 20 : 16] || '';
  var kayitTarihi     = params.kayitTarihi || existingRow[isMotor ? 21 : 17] || '';

  if (isMotor) {
    targetSheet.getRange(writeRow, 1, 1, 22).setValues([[
      tarih,
      params.vardiya               || '',
      saat,
      motor,
      params.jenYatakSicaklikDE    || '0',
      params.jenYatakSicaklikNDE   || '0',
      params.sogutmaSuyuSicaklik   || '0',
      params.sogutmaSuyuBasinc     || '0',
      params.yagSicaklik           || '0',
      params.yagBasinc             || '0',
      params.sarjSicaklik          || '0',
      params.sarjBasinc            || '0',
      params.gazRegulatoru         || '0',
      params.makineDairesiSicaklik || '0',
      params.karterBasinc          || '0',
      params.onKamaraFarkBasinc    || '0',
      params.sargiSicaklik1        || '0',
      params.sargiSicaklik2        || '0',
      params.sargiSicaklik3        || '0',
      params.durum                 || 'NORMAL',
      kaydeden,
      kayitTarihi
    ]]);
  } else {
    targetSheet.getRange(writeRow, 1, 1, 18).setValues([[
      tarih,
      params.vardiya           || '',
      saat,
      motor,
      params.aydemVoltaji      || '0',
      params.aktifGuc          || '0',
      params.reaktifGuc        || '0',
      params.cosPhi            || '0',
      params.ortAkim           || '0',
      params.ortGerilim        || '0',
      params.notrAkim          || '0',
      params.tahrikGerilimi    || '0',
      params.toplamAktifEnerji || '0',
      params.calismaSaati      || '0',
      params.kalkisSayisi      || '0',
      params.durum             || 'NORMAL',
      kaydeden,
      kayitTarihi
    ]]);
  }

  var range    = targetSheet.getRange(writeRow, 1, 1, colCount);
  range.setHorizontalAlignment('center');
  range.setFontSize(10);
  range.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);

  var durumVal = String(params.durum || '').toUpperCase();
  if (durumVal.indexOf('CALISMIYOR') !== -1 || durumVal.indexOf('\u00c7ALI\u015eMIYOR') !== -1) {
    range.setFontColor('#c62828');
  }

  var action = (foundRow !== -1) ? 'guncellendi' : 'eklendi';
  Logger.log('[MirrorReader] ' + action + ': ' + motor + ' ' + tarih + ' ' + saat +
             ' (' + (isMotor ? 'motor' : 'enerji') + ')');

  return { success: true, action: action, motor: motor, tarih: tarih, saat: saat, row: writeRow };
}

/**
 * Tarih normalize: YYYY-MM-DD → DD.MM.YYYY, DD.MM.YYYY → değişmeden döner
 */
function mirrorNormalizeDateTR(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    var p = text.slice(0, 10).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  return text;
}
