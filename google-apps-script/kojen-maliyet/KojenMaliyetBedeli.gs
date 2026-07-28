/**
 * KojenMaliyetBedeli.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Web sayfasındaki "Maliyet Giriş" modalından gelen veriyi Google Sheets'e
 * kaydeder.
 *
 * Hedef sayfalar:
 *   "Maliyet"              → Her dönem için en güncel kayıt (upsert)
 *   "MaliyetDegisiklikLog" → Her kaydetme işleminin değişmez geçmişi (append)
 *
 * Maliyet sayfası sütun düzeni (A–K):
 *   A: Kayıt Tarihi       B: Ay            C: Yıl          D: Dönem
 *   E: Kojen Maliyet (TL/MWh)
 *   F: YEKDEM (TL/MWh)    G: Dağıtım (TL/MWh)   H: VTC Gider (TL/MWh)
 *   I: Not                 J: Kaydeden      K: Güç Bedeli (TL/MWh)
 *
 * Geriye dönük uyumluluk: K sütunu boş olan eski kayıtlar 0 olarak okunur.
 *
 * MaliyetDegisiklikLog sayfası sütun düzeni (A–M):
 *   A: Log Tarihi   B: İşlem (YENİ/GÜNCELLEME)
 *   C–K: Maliyet sayfasıyla aynı sütunlar
 *   L: Eski Kojen Maliyet (güncelleme ise önceki değer, yoksa boş)
 *   M: Eski Güç Bedeli
 *
 * Web App olarak yayınlandıktan sonra URL'yi AppConfig'e ekleyin.
 */

// ─── SAYFA ADLARI ─────────────────────────────────────────────────────────────

var MALIYET_SHEET     = 'Maliyet';
var MALIYET_LOG_SHEET = 'MaliyetDegisiklikLog';
var MALIYET_SS_ID     = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';

var AYLAR_TR = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Sütun sayısı
var MALIYET_SUTUN     = 11; // A–K
var LOG_SUTUN         = 14; // A–N

// ─── WEB APP GİRİŞ NOKTASI ───────────────────────────────────────────────────

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = String(params.action || '');

  if (action === 'maliyetBedeliKaydet') {
    return jsonResponse(maliyetBedeliKaydet(params));
  }
  if (action === 'maliyetBedeliOku') {
    var ay  = parseInt(params.ay  || '0', 10);
    var yil = parseInt(params.yil || '0', 10);
    return jsonResponse(maliyetBedeliOku(ay, yil));
  }
  if (action === 'maliyetBedeliListesi') {
    return jsonResponse(maliyetBedeliListesi());
  }

  return jsonResponse({ success: false, error: 'Bilinmeyen action: ' + action });
}

function doPost(e) { return doGet(e); }

// ─── KAYDET ──────────────────────────────────────────────────────────────────

/**
 * Web sayfasından gelen form verisini "Maliyet" sayfasına kaydeder (upsert).
 * Her kayıtta "MaliyetDegisiklikLog" sayfasına da satır eklenir.
 */
function maliyetBedeliKaydet(params) {
  try {
    // ── Parametreleri parse et ───────────────────────────────────────────────
    var ay           = parseInt(params.ay  || '0', 10);
    var yil          = parseInt(params.yil || '0', 10);
    var kojenMaliyet = mbFloat(params.kojenMaliyet);
    var yekdem       = mbFloat(params.yekdem);
    var dagitim      = mbFloat(params.dagitim);
    var vtcGider     = mbFloat(params.vtcGider);
    var gucBedeli    = mbFloat(params.gucBedeli);
    var not_         = String(params.not || '').trim();
    var kullanici    = String(params.kaydedenKullanici || 'sistem').trim();

    // ── Doğrulama ────────────────────────────────────────────────────────────
    if (!ay || ay < 1 || ay > 12)         return { success: false, error: 'Geçersiz ay: ' + ay };
    if (!yil || yil < 2020 || yil > 2100) return { success: false, error: 'Geçersiz yıl: ' + yil };

    // ── Spreadsheet ──────────────────────────────────────────────────────────
    var ss         = SpreadsheetApp.openById(MALIYET_SS_ID);
    var sheet      = mbGetOrCreateMaliyetSheet(ss);
    var logSheet   = mbGetOrCreateLogSheet(ss);

    var donem        = (AYLAR_TR[ay] || ay) + ' ' + yil;
    var kayitZamani  = mbSimdi();

    // ── Mevcut dönem satırını bul ────────────────────────────────────────────
    var sonSatir    = sheet.getLastRow();
    var hedefSatir  = mbDonemSatiriBul(sheet, ay, yil, sonSatir);
    var islem       = hedefSatir > 0 ? 'GÜNCELLEME' : 'YENİ';

    // Güncelleme ise eski değerleri sakla
    var eskiKojenMaliyet = '';
    var eskiGucBedeli    = '';
    if (hedefSatir > 0) {
      eskiKojenMaliyet = sheet.getRange(hedefSatir, 5).getValue();
      // K sütunu (11) — eski kayıtta yoksa boş kalır
      var mevSutun = sheet.getLastColumn();
      if (mevSutun >= 11) {
        eskiGucBedeli = sheet.getRange(hedefSatir, 11).getValue();
      }
    }

    // ── Satır verisi (A–K) ───────────────────────────────────────────────────
    var satirVerisi = [
      kayitZamani,   // A – Kayıt Tarihi
      ay,            // B – Ay
      yil,           // C – Yıl
      donem,         // D – Dönem
      kojenMaliyet,  // E – Kojen Maliyet (TL/MWh)
      yekdem,        // F – YEKDEM
      dagitim,       // G – Dağıtım
      vtcGider,      // H – VTC Gider
      not_,          // I – Not
      kullanici,     // J – Kaydeden
      gucBedeli      // K – Güç Bedeli (TL/MWh)
    ];

    // ── Maliyet sayfasına yaz (upsert) ───────────────────────────────────────
    if (hedefSatir > 0) {
      sheet.getRange(hedefSatir, 1, 1, MALIYET_SUTUN).setValues([satirVerisi]);
      Logger.log('✅ Dönem güncellendi: ' + donem + ' → Satır ' + hedefSatir);
    } else {
      hedefSatir = sheet.getLastRow() + 1;
      sheet.getRange(hedefSatir, 1, 1, MALIYET_SUTUN).setValues([satirVerisi]);
      Logger.log('✅ Yeni kayıt eklendi: ' + donem + ' → Satır ' + hedefSatir);
    }
    mbMaliyetSatiriBicimlendir(sheet, hedefSatir);

    // ── Log sayfasına ekle (her zaman append) ────────────────────────────────
    var logVerisi = [kayitZamani, islem].concat(satirVerisi).concat([eskiKojenMaliyet, eskiGucBedeli]);
    var logSatir = logSheet.getLastRow() + 1;
    logSheet.getRange(logSatir, 1, 1, logVerisi.length).setValues([logVerisi]);
    mbLogSatiriBicimlendir(logSheet, logSatir, islem);
    Logger.log('📋 Log eklendi: ' + islem + ' | ' + donem);

    SpreadsheetApp.flush();

    return {
      success      : true,
      message      : donem + ' dönemi maliyet kaydedildi.',
      donem        : donem,
      islem        : islem,
      satir        : hedefSatir,
      kojenMaliyet : kojenMaliyet,
      gucBedeli    : gucBedeli
    };

  } catch (err) {
    Logger.log('❌ maliyetBedeliKaydet hata: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ─── OKU ─────────────────────────────────────────────────────────────────────

function maliyetBedeliOku(ay, yil) {
  try {
    var ss    = SpreadsheetApp.openById(MALIYET_SS_ID);
    var sheet = ss.getSheetByName(MALIYET_SHEET);
    if (!sheet) return null;

    var sonSatir = sheet.getLastRow();
    if (sonSatir < 2) return null;

    var hedef = mbDonemSatiriBul(sheet, ay, yil, sonSatir);
    if (!hedef) return null;

    // Sütun sayısı dinamik — eski kayıtlarda K (11) olmayabilir
    var mevSutun = Math.min(sheet.getLastColumn(), MALIYET_SUTUN);
    var r = sheet.getRange(hedef, 1, 1, mevSutun).getValues()[0];
    // Eksik sütunları 0 ile tamamla
    while (r.length < MALIYET_SUTUN) r.push(0);
    return mbSatiriNesneye(r);
  } catch (err) {
    Logger.log('❌ maliyetBedeliOku hata: ' + err.toString());
    return null;
  }
}

function maliyetBedeliListesi() {
  try {
    var ss    = SpreadsheetApp.openById(MALIYET_SS_ID);
    var sheet = ss.getSheetByName(MALIYET_SHEET);
    if (!sheet || sheet.getLastRow() < 2) return [];

    // Eski kayıtlarda sütun sayısı 10 olabilir — mevcut sütun sayısını oku
    var mevSutun = Math.min(sheet.getLastColumn(), MALIYET_SUTUN);
    var satirlar = sheet.getRange(2, 1, sheet.getLastRow() - 1, mevSutun).getValues();

    return satirlar
      .filter(function (r) { return r[1]; }) // Ay dolu olan satırları al
      .map(function (r) {
        // Eksik sütunları 0 ile tamamla (eski kayıtlar için)
        while (r.length < MALIYET_SUTUN) r.push(0);
        return mbSatiriNesneye(r);
      });
  } catch (err) {
    Logger.log('❌ maliyetBedeliListesi hata: ' + err.toString());
    return [];
  }
}

// ─── SAYFA KURULUMU ──────────────────────────────────────────────────────────

function mbGetOrCreateMaliyetSheet(ss) {
  var sheet = ss.getSheetByName(MALIYET_SHEET);
  if (sheet) {
    // Eski sayfa: K sütunu başlığı yoksa ekle
    if (sheet.getLastColumn() < 11) {
      sheet.getRange(1, 11).setValue('Güç Bedeli (TL/MWh)')
        .setBackground('#1e3a5f').setFontColor('#FFFFFF')
        .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
      sheet.setColumnWidth(11, 140);
      Logger.log('✅ Maliyet sayfasına K (Güç Bedeli) sütunu başlığı eklendi.');
    }
    return sheet;
  }

  sheet = ss.insertSheet(MALIYET_SHEET);
  var basliklar = [
    'Kayıt Tarihi', 'Ay', 'Yıl', 'Dönem',
    'Kojen Maliyet (TL/MWh)', 'YEKDEM (TL/MWh)', 'Dağıtım (TL/MWh)', 'VTC Gider (TL/MWh)',
    'Not', 'Kaydeden', 'Güç Bedeli (TL/MWh)'
  ];
  sheet.getRange(1, 1, 1, basliklar.length)
    .setValues([basliklar])
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);

  var genislikler = [130, 50, 60, 120, 155, 120, 120, 120, 200, 130, 140];
  for (var i = 0; i < genislikler.length; i++) sheet.setColumnWidth(i + 1, genislikler[i]);

  Logger.log('✅ ' + MALIYET_SHEET + ' sayfası oluşturuldu.');
  return sheet;
}

function mbGetOrCreateLogSheet(ss) {
  var sheet = ss.getSheetByName(MALIYET_LOG_SHEET);
  if (sheet) {
    // Eski log sayfası: L ve M başlıkları yoksa ekle
    if (sheet.getLastColumn() < 14) {
      var eksikBasliklar = [
        [12, 'Not'],
        [13, 'Kaydeden'],
        [14, 'Güç Bedeli (TL/MWh)'],  // yeni sütun
        // L ve M zaten Log tarafı
      ];
      // Log başlık düzenini kontrol et — sadece eksik olanları ekle
      var mevcutSutun = sheet.getLastColumn();
      if (mevcutSutun < 13) {
        sheet.getRange(1, 13).setValue('Eski Kojen Maliyet')
          .setBackground('#4a1942').setFontColor('#FFFFFF').setFontWeight('bold');
      }
      if (mevcutSutun < 14) {
        sheet.getRange(1, 14).setValue('Eski Güç Bedeli')
          .setBackground('#4a1942').setFontColor('#FFFFFF').setFontWeight('bold');
      }
      Logger.log('✅ MaliyetDegisiklikLog sayfasına eksik başlıklar eklendi.');
    }
    return sheet;
  }

  sheet = ss.insertSheet(MALIYET_LOG_SHEET);
  var basliklar = [
    'Log Tarihi', 'İşlem',
    'Kayıt Tarihi', 'Ay', 'Yıl', 'Dönem',
    'Kojen Maliyet (TL/MWh)', 'YEKDEM (TL/MWh)', 'Dağıtım (TL/MWh)', 'VTC Gider (TL/MWh)',
    'Not', 'Kaydeden', 'Güç Bedeli (TL/MWh)',
    'Eski Kojen Maliyet', 'Eski Güç Bedeli'
  ];
  sheet.getRange(1, 1, 1, basliklar.length)
    .setValues([basliklar])
    .setBackground('#4a1942').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 110);

  Logger.log('✅ ' + MALIYET_LOG_SHEET + ' sayfası oluşturuldu.');
  return sheet;
}

// ─── BİÇİMLENDİRME ───────────────────────────────────────────────────────────

function mbMaliyetSatiriBicimlendir(sheet, satirNo) {
  var zebra = (satirNo % 2 === 0) ? '#F7F9FC' : '#FFFFFF';
  sheet.getRange(satirNo, 1, 1, MALIYET_SUTUN).setBackground(zebra);
  // Tarih (A): metin, Ay/Yıl (B-C): tam sayı
  sheet.getRange(satirNo, 1).setNumberFormat('@');
  sheet.getRange(satirNo, 2, 1, 2).setNumberFormat('0');
}

function mbLogSatiriBicimlendir(sheet, satirNo, islem) {
  var bg = islem === 'YENİ' ? '#f0fff4' : '#fff8e1';
  sheet.getRange(satirNo, 1, 1, LOG_SUTUN).setBackground(bg);
  sheet.getRange(satirNo, 2).setFontWeight('bold');
}

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function mbDonemSatiriBul(sheet, ay, yil, sonSatir) {
  if (sonSatir < 2) return 0;
  var ayDeger  = sheet.getRange(2, 2, sonSatir - 1, 1).getValues();
  var yilDeger = sheet.getRange(2, 3, sonSatir - 1, 1).getValues();
  for (var i = 0; i < ayDeger.length; i++) {
    if (parseInt(ayDeger[i][0], 10) === ay && parseInt(yilDeger[i][0], 10) === yil) {
      return i + 2;
    }
  }
  return 0;
}

function mbSatiriNesneye(r) {
  return {
    kayitTarihi  : r[0],  ay           : r[1],  yil          : r[2],
    donem        : r[3],  kojenMaliyet : r[4],  yekdem       : r[5],
    dagitim      : r[6],  vtcGider     : r[7],  not          : r[8],
    kaydeden     : r[9],  gucBedeli    : r[10] || 0  // K — eski kayıtlarda boş → 0
  };
}

function mbFloat(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function mbSimdi() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── MANUEL TEST ─────────────────────────────────────────────────────────────

function maliyetBedeliKaydetTest() {
  var result = maliyetBedeliKaydet({
    ay: '7', yil: '2026',
    kojenMaliyet: '4250.00', yekdem: '320.50', dagitim: '185.75', vtcGider: '95.00',
    gucBedeli: '210.00',
    not: 'Test kaydı', kaydedenKullanici: 'test@koruma.com'
  });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function maliyetBedeliOkuTest() {
  var bugun = new Date();
  return maliyetBedeliOku(bugun.getMonth() + 1, bugun.getFullYear());
}

function maliyetBedeliListesiTest() {
  var liste = maliyetBedeliListesi();
  Logger.log('Toplam kayıt: ' + liste.length);
  return liste;
}
