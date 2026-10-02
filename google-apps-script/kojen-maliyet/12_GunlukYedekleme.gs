/**
 * 12_GunlukYedekleme.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Her gün 09:55'te PiyasaFiyatlari, BaglantiNoktalari ve AMR_Saatlik
 * sayfalarını TEK bir Excel dosyasında 3 ayrı sekme olarak kaydeder.
 *
 * Klasör: https://drive.google.com/drive/folders/1bTABzy5c4l9N94GoV7B26OgITx1Tvd78
 *
 * Dosya adı örneği:
 *   MaliyetYedek_2026-09-30.xlsx  (3 sekme: PiyasaFiyatlari, BaglantiNoktalari, AMR_Saatlik)
 *
 * Trigger:  yedekTriggerKur()   → her gün 09:55
 * Manuel:   gunlukYedekAl()     → hemen yedek al
 */

// ─── SABİTLER ─────────────────────────────────────────────────────────────────

var YEDEK_KLASOR_ID = '1bTABzy5c4l9N94GoV7B26OgITx1Tvd78';
var YEDEK_SS_ID     = '1kind4MK2iLG2b7ATgyR8pVacUh4jCI4F9oXuUdxs_UQ';

var YEDEK_SAYFALAR  = [
  'PiyasaFiyatlari',
  'BaglantiNoktalari',
  'AMR_Saatlik'
];

// ─── TRIGGER ─────────────────────────────────────────────────────────────────

function yedekTriggerKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'gunlukYedekAl') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('gunlukYedekAl')
    .timeBased().everyDays(1).atHour(9).nearMinute(55)
    .inTimezone(Session.getScriptTimeZone()).create();
  Logger.log('✅ Yedek trigger kuruldu — her gün 09:55.');
  return { success: true };
}

// ─── ANA FONKSİYON ───────────────────────────────────────────────────────────

/**
 * 3 sayfayı tek bir geçici Sheets dosyasına kopyalar,
 * tek bir Excel dosyası olarak Drive'a kaydeder.
 */
function gunlukYedekAl() {
  var bugun    = new Date();
  var dun      = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - 1);
  var isoTarih = _yedekIsoDate(dun);
  var klasor   = DriveApp.getFolderById(YEDEK_KLASOR_ID);
  var dosyaAdi = 'MaliyetYedek_' + isoTarih + '.xlsx';

  Logger.log('=== Günlük yedekleme başladı: ' + isoTarih + ' ===');

  var ss       = SpreadsheetApp.openById(YEDEK_SS_ID);
  var geciciAd = 'YEDEK_GECICI_' + isoTarih;
  var geciciSS = SpreadsheetApp.create(geciciAd);
  var geciciId = geciciSS.getId();

  try {
    // Her sayfayı geçici dosyaya kopyala
    YEDEK_SAYFALAR.forEach(function(sayfaAdi) {
      var sheet = ss.getSheetByName(sayfaAdi);
      if (sheet) {
        sheet.copyTo(geciciSS).setName(sayfaAdi);
        Logger.log('  ✅ ' + sayfaAdi + ' kopyalandı.');
      } else {
        Logger.log('  ⚠️ ' + sayfaAdi + ' bulunamadı, atlandı.');
      }
    });

    // Geçici dosyadaki ilk boş sayfayı sil
    var sheets = geciciSS.getSheets();
    if (sheets.length > YEDEK_SAYFALAR.length) {
      geciciSS.deleteSheet(sheets[0]);
    }

    SpreadsheetApp.flush();

    // Excel formatında dışa aktar
    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + geciciId +
                    '/export?format=xlsx&id=' + geciciId;

    var token = ScriptApp.getOAuthToken();
    var resp  = UrlFetchApp.fetch(exportUrl, {
      headers           : { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      throw new Error('Export HTTP ' + resp.getResponseCode());
    }

    // Aynı isimde eski dosyayı sil
    var eskiDosyalar = klasor.getFilesByName(dosyaAdi);
    while (eskiDosyalar.hasNext()) {
      eskiDosyalar.next().setTrashed(true);
    }

    // Yeni dosyayı kaydet
    klasor.createFile(resp.getBlob().setName(dosyaAdi));
    Logger.log('📁 ' + dosyaAdi + ' → Drive klasörüne kaydedildi.');
    Logger.log('=== Yedekleme tamamlandı. ===');
    return { success: true, dosya: dosyaAdi, tarih: isoTarih };

  } catch(e) {
    Logger.log('❌ Yedekleme hatası: ' + e.toString());
    return { success: false, hata: e.toString() };

  } finally {
    // Geçici dosyayı her durumda sil
    try { DriveApp.getFileById(geciciId).setTrashed(true); } catch(e) {}
  }
}

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function _yedekIsoDate(d) {
  var ay  = d.getMonth() + 1;
  var gun = d.getDate();
  return d.getFullYear() + '-' +
         (ay  < 10 ? '0' + ay  : ay)  + '-' +
         (gun < 10 ? '0' + gun : gun);
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function yedekTest() {
  var sonuc = gunlukYedekAl();
  Logger.log(JSON.stringify(sonuc, null, 2));
  return sonuc;
}
