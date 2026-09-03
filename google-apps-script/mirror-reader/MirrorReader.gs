/**
 * MIRROR READER — Web App (v2 — tarih filtreli okuma)
 * =====================================================
 * GAS 30 sn timeout aşımını önlemek için:
 * - startDate / endDate parametresiyle sadece ilgili tarih aralığı okunur
 * - Her çağrı max MAX_ROWS_PER_CALL satır döner
 *
 * KULLANIM:
 *   ?action=getMotorRecords&motor=GM-1&startDate=2026-08-05&endDate=2026-08-12
 *   ?action=getEnerjiRecords&startDate=2026-08-05&endDate=2026-08-12
 *   ?action=health
 */

var MIRROR_SPREADSHEET_ID  = '1sOJPeIT8R812sf8bPfFW3g2ternvaT1JMhPioojKDjk';
var MIRROR_READER_VERSION   = 'mirror-reader-2026-08-12-v3';
var MOTOR_MIRROR_COL_COUNT  = 22;
var ENERJI_MIRROR_COL_COUNT = 18;
var MAX_ROWS_PER_CALL       = 2000; // tek motor sayfası ~800 satır — yeterli margin

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

// ─── Tarih parse yardımcısı ───────────────────────────────────────────────────

/**
 * "YYYY-MM-DD" veya "DD.MM.YYYY" → Date objesi (sadece gün bazlı, saat 00:00)
 */
function parseDateParam(str) {
  if (!str) return null;
  var text = String(str).trim();
  if (!text) return null;
  var parts;
  if (text.indexOf('-') !== -1) {
    parts = text.split('-'); // YYYY-MM-DD
    if (parts[0].length === 4) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  }
  if (text.indexOf('.') !== -1) {
    parts = text.split('.'); // DD.MM.YYYY
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  return null;
}

/**
 * "DD.MM.YYYY" hücre değeri → Date objesi
 */
function parseCellDate(cellValue) {
  var text = String(cellValue || '').trim();
  if (!text) return null;
  // DD.MM.YYYY
  var dot = text.split('.');
  if (dot.length === 3 && dot[2].length === 4) {
    return new Date(parseInt(dot[2]), parseInt(dot[1]) - 1, parseInt(dot[0]));
  }
  // YYYY-MM-DD
  var dash = text.split('-');
  if (dash.length === 3 && dash[0].length === 4) {
    return new Date(parseInt(dash[0]), parseInt(dash[1]) - 1, parseInt(dash[2]));
  }
  return null;
}

// ─── Motor Mirror okuma ───────────────────────────────────────────────────────

function getMotorMirrorRecords(motorFilter, startDateStr, endDateStr) {
  var ss         = SpreadsheetApp.openById(MIRROR_SPREADSHEET_ID);
  var sheets     = ss.getSheets();
  var records    = [];
  var startDate  = parseDateParam(startDateStr);
  var endDate    = parseDateParam(endDateStr);

  // endDate gün sonu olsun
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

    // Tüm satırları okumak yerine tarih sütununu önce tara
    var rowCount = Math.min(lastRow - 1, MAX_ROWS_PER_CALL);
    var data = sheet.getRange(2, 1, rowCount, MOTOR_MIRROR_COL_COUNT).getDisplayValues();

    for (var j = 0; j < data.length; j++) {
      var row = data[j];
      if (!row[0]) continue; // boş tarih atla

      // Tarih filtresi — tüm satırları tara (kronolojik sıra garantisi yok)
      if (startDate || endDate) {
        var rowDate = parseCellDate(row[0]);
        if (!rowDate) continue;
        if (startDate && rowDate < startDate) continue;
        if (endDate   && rowDate > endDate)   continue;
      }

      records.push(mapMotorRow(row));
    }
  }

  return {
    success: true,
    data: records,
    count: records.length,
    version: MIRROR_READER_VERSION
  };
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

    var rowCount = Math.min(lastRow - 1, MAX_ROWS_PER_CALL);
    var data = sheet.getRange(2, 1, rowCount, ENERJI_MIRROR_COL_COUNT).getDisplayValues();

    // Eğer tarih filtresi varsa, sıralı veriden yararlanarak erken çık
    var dateRangeOnly = (startDate || endDate);

    for (var j = 0; j < data.length; j++) {
      var row = data[j];
      if (!row[0]) continue;

      if (dateRangeOnly) {
        var rowDate = parseCellDate(row[0]);
        if (!rowDate) continue;
        
        // Eğer satır başlangıç tarihinden önceyse ve veri sıralıysa atla
        if (startDate && rowDate < startDate) {
          continue;
        }
        
        // Eğer satır bitiş tarihinden sonraysa ve veri sıralıysa döngüyü kır
        if (endDate && rowDate > endDate) {
          break; // Kronolojik veri olduğu için sonraki satırlar da sonrası olacak
        }
      }

      records.push(mapEnerjiRow(row));
    }
  }

  return {
    success: true,
    data: records,
    count: records.length,
    version: MIRROR_READER_VERSION
  };
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
  // 24:00 → 00:00
  if (text === '24:00' || text.startsWith('24:')) return '00:00';
  var parts = text.split(':');
  var h = String(parseInt(parts[0] || '0', 10) || 0).padStart(2, '0');
  var m = String(parseInt(parts[1] || '0', 10) || 0).padStart(2, '0');
  return h + ':' + m;
}

function normalizeMotor(value) {
  var text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  var match = text.match(/GM-?(\d+)$/);
  if (match) return 'GM-' + match[1];
  return text || 'GM-1';
}

// ─── Record Update ─────────────────────────────────────────────────────────────

/**
 * Trigger'lardan ve GAS updateRecord çağrılarından gelen istekleri işler.
 *
 * Tarih hem DD.MM.YYYY hem de YYYY-MM-DD formatında gelebilir — her ikisini
 * de normalize ederek DD.MM.YYYY'ye çevirir.
 *
 * type parametresi:
 *   'motor'  → Motor Mirror GM-* sayfasına yazar (22 sütun)
 *   'enerji' → Enerji Mirror GM-* sayfasına yazar (18 sütun)
 *   Belirtilmezse motor adından otomatik algılar.
 *
 * Kayıt bulunamazsa — mirror'da henüz yoksa — yeni satır olarak ekler.
 * Kayıt bulunursa — üzerine yazar (kaydeden ve kayitTarihi korunur).
 */
function updateMirrorRecord(params) {
  var motor = normalizeMotor(params.motor || '');
  // Tarih her iki formattan gelebilir; standart DD.MM.YYYY'ye çevir
  var tarih = mirrorNormalizeDateTR(params.tarih || '');
  var saat  = normalizeSaat(params.saat || '00:00');

  if (!motor || !tarih) {
    return { success: false, error: 'Motor veya tarih eksik' };
  }

  // type parametresi belirtilmişse onu kullan, yoksa sayfadan algıla
  var typeParam = String(params.type || '').toLowerCase();

  var ss     = SpreadsheetApp.openById(MIRROR_SPREADSHEET_ID);
  var sheets = ss.getSheets();

  var targetSheet = null;
  var isMotor     = true;

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name  = sheet.getName();

    if (/^Motor Mirror GM-\d+$/i.test(name) &&
        normalizeMotor(name.replace(/^Motor Mirror /i, '')) === motor) {
      // type='enerji' ise motor sayfasını atla
      if (typeParam === 'enerji') continue;
      targetSheet = sheet;
      isMotor     = true;
      break;
    }

    if (/^Enerji Mirror GM-\d+$/i.test(name) &&
        normalizeMotor(name.replace(/^Enerji Mirror /i, '')) === motor) {
      // type='motor' ise enerji sayfasını atla
      if (typeParam === 'motor') continue;
      targetSheet = sheet;
      isMotor     = false;
      break;
    }
  }

  // Sayfa yoksa oluştur
  if (!targetSheet) {
    var newSheetName = (typeParam === 'enerji')
      ? 'Enerji Mirror ' + motor
      : 'Motor Mirror '  + motor;

    targetSheet = ss.insertSheet(newSheetName);
    isMotor     = (typeParam !== 'enerji');

    // Başlık satırı
    var motorHeaders  = ['Tarih','Vardiya','Saat','Motor','JEN. YATAK SIC. (DE)','JEN. YATAK SIC. (NDE)','SOĞUTMA SUYU SIC.','SOĞUTMA SUYU BAS.','YAĞ SIC.','YAĞ BAS.','ŞARJ SIC.','ŞARJ BAS.','GAZ REG. (λ)','MAKİNE DAİRESİ SIC.','KARTER BAS.','ÖN KAMARA FARK BAS.','SARGI SIC. -1-','SARGI SIC. -2-','SARGI SIC. -3-','Durum','Kaydeden','Kayıt Tarihi'];
    var enerjiHeaders = ['Tarih','Vardiya','Saat','Motor','AYDEM VOLTAJI','AKTİF GÜÇ','REAKTİF GÜÇ','Cos φ','ORT.AKIM','ORT.GERİLİM','NÖTR AKIMI','TAHRİK GERİLİMİ','TOPLAM AKTİF ENERJİ','ÇALIŞMA SAATİ','KALKIŞ SAYISI','Durum','Kaydeden','Kayıt Tarihi'];
    var hdr = isMotor ? motorHeaders : enerjiHeaders;
    var hdrRange = targetSheet.getRange(1, 1, 1, hdr.length);
    hdrRange.setValues([hdr]);
    hdrRange.setFontWeight('bold');
    hdrRange.setBackground('#0f172a');
    hdrRange.setFontColor('#ffffff');
    Logger.log('[MirrorReader] Yeni mirror sayfasi olusturuldu: ' + newSheetName);
  }

  var colCount  = isMotor ? MOTOR_MIRROR_COL_COUNT : ENERJI_MIRROR_COL_COUNT;
  var lastRow   = targetSheet.getLastRow();
  var foundRow  = -1;

  // Eşleşen satırı bul
  if (lastRow >= 2) {
    var data = targetSheet.getRange(2, 1, lastRow - 1, colCount).getDisplayValues();
    for (var j = 0; j < data.length; j++) {
      var rowDate  = mirrorNormalizeDateTR(data[j][0] || '');
      var rowHour  = normalizeSaat(data[j][2] || '');
      var rowMotor = normalizeMotor(data[j][3] || '');
      if (rowDate === tarih && rowHour === saat && rowMotor === motor) {
        foundRow = j + 2;
        break;
      }
    }
  }

  // Bulunamazsa en sona ekle
  var writeRow = (foundRow !== -1) ? foundRow : (lastRow + 1);

  // Kaydeden ve kayıt tarihi: parametreden geliyorsa kullan,
  // yoksa mevcut satırdan koru, o da yoksa boş bırak
  var existingKaydeden    = '';
  var existingKayitTarihi = '';
  if (foundRow !== -1 && lastRow >= 2) {
    var existingRowData = targetSheet.getRange(foundRow, 1, 1, colCount).getDisplayValues()[0];
    existingKaydeden    = existingRowData[isMotor ? 20 : 16] || '';
    existingKayitTarihi = existingRowData[isMotor ? 21 : 17] || '';
  }

  var kaydeden    = params.kaydeden    || existingKaydeden    || '';
  var kayitTarihi = params.kayitTarihi || existingKayitTarihi || '';

  if (isMotor) {
    targetSheet.getRange(writeRow, 1, 1, 22).setValues([[
      tarih,
      params.vardiya            || '',
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

  // Basit formatlama
  var range = targetSheet.getRange(writeRow, 1, 1, colCount);
  range.setHorizontalAlignment('center');
  range.setFontSize(10);
  range.setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);

  var durumVal = String(params.durum || '').toUpperCase();
  if (durumVal.indexOf('CALISIMIYOR') !== -1 || durumVal.indexOf('CALISMIYOR') !== -1 ||
      durumVal.indexOf('\u00c7ALI\u015eMIYOR') !== -1) {
    range.setFontColor('#c62828');
  }

  var action = (foundRow !== -1) ? 'guncellendi' : 'eklendi (yeni satir)';
  Logger.log('[MirrorReader] updateMirrorRecord ' + action + ': ' + motor + ' ' + tarih + ' ' + saat +
             ' (' + (isMotor ? 'motor' : 'enerji') + ')');

  return {
    success: true,
    action:  action,
    motor:   motor,
    tarih:   tarih,
    saat:    saat,
    row:     writeRow
  };
}

/**
 * Tarih her iki formattan gelebilir → DD.MM.YYYY'ye normalize eder.
 * YYYY-MM-DD → DD.MM.YYYY
 * DD.MM.YYYY → değişmeden döner
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
