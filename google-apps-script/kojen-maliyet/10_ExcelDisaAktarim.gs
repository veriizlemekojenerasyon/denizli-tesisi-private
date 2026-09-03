/**
 * 10_ExcelDisaAktarim.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * KojenCalisma, DengesizlikMaliyet ve Faturalasma sayfalarını
 * Excel (.xlsx) dosyası olarak dışa aktarır.
 * Sayfa yoksa aynı ay/yılın yedek kopyasını kullanır.
 *
 * Bağımlılıklar: 01_VGenConfig.gs
 */

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * İstenen sayfaları xlsx olarak dışa aktarır.
 * @param {Object} params  { ay, yil, tip: 'hepsi'|'kojen'|'dengesizlik'|'fatura' }
 * @returns {{ success, base64, dosyaAdi, sayfalar } | { success: false, error }}
 */
function excelIndir(params) {
  try {
    var ay  = parseInt(params.ay  || new Date().getMonth() + 1, 10);
    var yil = parseInt(params.yil || new Date().getFullYear(),  10);
    var tip = String(params.tip || 'hepsi').toLowerCase();
    var suffix = yil + '_' + cfgPad2(ay);

    var hedefler = [
      { ad: CFG_PREF_KOJEN_CALISMA  + suffix, kisaAd: 'KC' },
      { ad: CFG_PREF_DENGESIZLIK    + suffix, kisaAd: 'DM' },
      { ad: CFG_PREF_FATURA         + suffix, kisaAd: 'FD' }
    ];

    if (tip !== 'hepsi') {
      var tipMap = { kojen: 'KC', dengesizlik: 'DM', fatura: 'FD' };
      if (!tipMap[tip]) return { success: false, error: 'Geçersiz tip: ' + tip };
      hedefler = hedefler.filter(function(h) { return h.kisaAd === tipMap[tip]; });
    }

    var ss        = cfgSsAc();
    var yeniSS    = SpreadsheetApp.create('KojenExcel_GECICI_' + new Date().getTime());
    var yeniSSId  = yeniSS.getId();
    var eklenenler = [];

    hedefler.forEach(function(hedef) {
      var kaynak = ss.getSheetByName(hedef.ad);

      // Sayfa yoksa yedeği ara
      if (!kaynak) {
        var aramaAdi = 'Yedek_' + hedef.kisaAd + '_' + suffix;
        ss.getSheets().forEach(function(s) {
          if (!kaynak && s.getName().indexOf(aramaAdi) === 0) {
            kaynak = s;
            Logger.log('📦 Yedek kullanılıyor: ' + s.getName());
          }
        });
      }
      if (!kaynak) {
        Logger.log('⚠️ Bulunamadı: ' + hedef.ad);
        return;
      }

      SpreadsheetApp.flush();
      var lastRow = kaynak.getLastRow();
      var lastCol = kaynak.getLastColumn();
      var kopya   = kaynak.copyTo(yeniSS);
      kopya.setName(hedef.ad);

      if (lastRow > 0 && lastCol > 0) {
        var srcVals = kaynak.getRange(1, 1, lastRow, lastCol).getValues();
        kopya.clearContents();
        kopya.getRange(1, 1, lastRow, lastCol).setValues(srcVals);
      }
      eklenenler.push(hedef.ad);
      Logger.log('✅ Eklendi: ' + hedef.ad);
    });

    if (eklenenler.length === 0) {
      try { DriveApp.getFileById(yeniSSId).setTrashed(true); } catch(e) {}
      return { success: false, error: 'Hiçbir sayfa bulunamadı.' };
    }

    // Varsayılan boş sayfayı sil
    var varsayilan = yeniSS.getSheets()[0];
    if (varsayilan && eklenenler.indexOf(varsayilan.getName()) === -1) {
      try { yeniSS.deleteSheet(varsayilan); } catch(e) {}
    }

    SpreadsheetApp.flush();

    // xlsx olarak export
    var token     = ScriptApp.getOAuthToken();
    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + yeniSSId + '/export?format=xlsx';
    var resp      = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    try { DriveApp.getFileById(yeniSSId).setTrashed(true); } catch(e) {}

    if (resp.getResponseCode() !== 200) {
      return { success: false, error: 'Export HTTP ' + resp.getResponseCode() };
    }

    var base64   = Utilities.base64Encode(resp.getBlob().getBytes());
    var dosyaAdi = 'Kojen_' + cfgPad2(ay) + '_' + yil + (tip !== 'hepsi' ? '_' + tip : '') + '.xlsx';

    Logger.log('✅ Excel hazır: ' + dosyaAdi + ' | ' + eklenenler.join(', '));
    return { success: true, base64: base64, dosyaAdi: dosyaAdi, sayfalar: eklenenler };

  } catch(e) {
    Logger.log('❌ excelIndir: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ─── AY YEDEKLEMESİ ──────────────────────────────────────────────────────────

/**
 * Belirtilen ay/yılın KojenCalisma, DengesizlikMaliyet ve Faturalasma
 * sayfalarını kopyalayarak arşivler.
 */
function ayYedekle(ay, yil) {
  try {
    var ss     = cfgSsAc();
    var suffix = yil + '_' + cfgPad2(ay);
    var zaman  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'ddMMyyyy_HHmm');

    var sayfaAdilar = [
      CFG_PREF_KOJEN_CALISMA  + suffix,
      CFG_PREF_DENGESIZLIK    + suffix,
      CFG_PREF_FATURA         + suffix
    ];

    var yedeklenen = [];
    sayfaAdilar.forEach(function(sayfaAdi) {
      var sheet = ss.getSheetByName(sayfaAdi);
      if (!sheet) {
        Logger.log('⚠️ Yedeklenecek sayfa bulunamadı: ' + sayfaAdi);
        return;
      }
      var kisaAd  = sayfaAdi.replace(CFG_PREF_KOJEN_CALISMA, 'KC_').replace(CFG_PREF_DENGESIZLIK, 'DM_').replace(CFG_PREF_FATURA, 'FD_');
      var yedekAd = 'Yedek_' + kisaAd + '_' + zaman;
      var kopya   = sheet.copyTo(ss);
      kopya.setName(yedekAd);
      ss.moveActiveSheet(ss.getNumSheets());
      kopya.getRange(1, 1).setNote('YEDEK KOPYA\nKaynak: ' + sayfaAdi + '\nOlusturma: ' + zaman);
      yedeklenen.push(yedekAd);
      Logger.log('✅ Yedeklendi: ' + yedekAd);
    });

    Logger.log('Ay yedekleme tamamlandı: ' + yedeklenen.length + ' sayfa');
    return { success: true, yedeklenen: yedeklenen };
  } catch(e) {
    Logger.log('❌ ayYedekle: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function excelIndirTest() {
  var r = excelIndir({ ay: '7', yil: '2026', tip: 'hepsi' });
  Logger.log(r.success ? '✅ ' + r.dosyaAdi : '❌ ' + r.error);
  return r;
}

function ayYedekleTest() {
  return ayYedekle(7, 2026);
}
