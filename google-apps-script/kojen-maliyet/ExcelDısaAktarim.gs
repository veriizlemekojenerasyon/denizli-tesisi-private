/**
 * ExcelDısaAktarim.gs
 * Kojen Çalışma, Dengesizlik Maliyet ve Faturalaşma sayfalarını Excel'e aktarır.
 * Sayfa yoksa aynı ay/yılın yedeğini kullanır.
 */

var EXCEL_SS_ID = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = String(params.action || '');
  if (action === 'excelIndir') return jsonExcelResponse(excelIndir(params));
  return jsonExcelResponse({ success: false, error: 'Bilinmeyen action: ' + action });
}

function doPost(e) { return doGet(e); }

function jsonExcelResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

function excelIndir(params) {
  try {
    var ay  = parseInt(params.ay  || new Date().getMonth() + 1, 10);
    var yil = parseInt(params.yil || new Date().getFullYear(), 10);
    var tip = String(params.tip || 'hepsi').toLowerCase();
    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    var suffix = yil + '_' + pad(ay);

    // Hedef sayfa adları ve yedek kısa adları
    var hedefler = [
      { ad: 'KojenCalisma_'       + suffix, kisaAd: 'KC' },
      { ad: 'DengesizlikMaliyet_' + suffix, kisaAd: 'DM' },
      { ad: 'Faturalasma_'        + suffix, kisaAd: 'FD' }
    ];

    if (tip !== 'hepsi') {
      var tipMap = { kojen: 'KC', dengesizlik: 'DM', fatura: 'FD' };
      if (!tipMap[tip]) return { success: false, error: 'Geçersiz tip: ' + tip };
      hedefler = hedefler.filter(function(h) { return h.kisaAd === tipMap[tip]; });
    }

    var ss = SpreadsheetApp.openById(EXCEL_SS_ID);

    // Geçici yeni spreadsheet oluştur — sadece istenen sayfaları içerecek
    var yeniSS    = SpreadsheetApp.create('KojenExcel_GECICI_' + new Date().getTime());
    var yeniSSId  = yeniSS.getId();
    var eklenanlar = [];

    hedefler.forEach(function(hedef) {
      var kaynak = ss.getSheetByName(hedef.ad);

      // Sayfa yoksa yedeği ara
      if (!kaynak) {
        var aramaAdi = 'Yedek_' + hedef.kisaAd + '_' + suffix;
        ss.getSheets().forEach(function(s) {
          if (!kaynak && s.getName().indexOf(aramaAdi) === 0) {
            kaynak = s;
            Logger.log('📦 Yedek: ' + s.getName());
          }
        });
      }

      if (!kaynak) {
        Logger.log('⚠️ Bulunamadı: ' + hedef.ad);
        return;
      }

      Logger.log('✅ Ekleniyor: ' + kaynak.getName());

      // Ana SS'den ekranda görünen değerleri oku (formül değil, mevcut rakamlar)
      SpreadsheetApp.flush();
      var srcLastRow = kaynak.getLastRow();
      var srcLastCol = kaynak.getLastColumn();

      // Sayfayı yeni SS'ye kopyala (biçimlendirme gelsin diye)
      var kopya = kaynak.copyTo(yeniSS);
      kopya.setName(hedef.ad);

      if (srcLastRow > 0 && srcLastCol > 0) {
        // getValues() — hesaplanmış değerleri al (cross-sheet formüller burada çalışır)
        var srcVals = kaynak.getRange(1, 1, srcLastRow, srcLastCol).getValues();
        // Kopyada tüm içeriği sil, sabit değerleri yaz
        kopya.clearContents();
        kopya.getRange(1, 1, srcLastRow, srcLastCol).setValues(srcVals);
      }

      eklenanlar.push(hedef.ad);
    });

    if (eklenanlar.length === 0) {
      try { DriveApp.getFileById(yeniSSId).setTrashed(true); } catch(e) {}
      return { success: false, error: 'Hiçbir sayfa bulunamadı.' };
    }

    // Varsayılan boş sayfayı sil
    var varsayilan = yeniSS.getSheets()[0];
    if (varsayilan && eklenanlar.indexOf(varsayilan.getName()) === -1) {
      try { yeniSS.deleteSheet(varsayilan); } catch(e) {}
    }

    SpreadsheetApp.flush();

    // xlsx olarak export et
    var token     = ScriptApp.getOAuthToken();
    var exportUrl = 'https://docs.google.com/spreadsheets/d/' + yeniSSId + '/export?format=xlsx';
    var resp      = UrlFetchApp.fetch(exportUrl, {
      headers          : { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    // Geçici SS'yi sil
    try { DriveApp.getFileById(yeniSSId).setTrashed(true); } catch(e) {
      Logger.log('⚠️ Geçici SS silinemedi: ' + yeniSSId);
    }

    if (resp.getResponseCode() !== 200) {
      return { success: false, error: 'Export HTTP ' + resp.getResponseCode() };
    }

    var base64   = Utilities.base64Encode(resp.getBlob().getBytes());
    var dosyaAdi = 'Kojen_' + pad(ay) + '_' + yil + (tip !== 'hepsi' ? '_' + tip : '') + '.xlsx';

    Logger.log('✅ Excel hazır: ' + dosyaAdi + ' | ' + eklenanlar.join(', '));
    return { success: true, base64: base64, dosyaAdi: dosyaAdi, sayfalar: eklenanlar };

  } catch(err) {
    Logger.log('❌ excelIndir hata: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function excelIndirTest() {
  var sonuc = excelIndir({ ay: '7', yil: '2026', tip: 'hepsi' });
  Logger.log(sonuc.success
    ? '✅ ' + sonuc.dosyaAdi + ' | ' + sonuc.sayfalar.join(', ')
    : '❌ ' + sonuc.error);
  return sonuc;
}
