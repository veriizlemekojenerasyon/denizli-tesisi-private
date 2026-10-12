/**
 * 05_YillikUretimVerisi.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * EnerjiGunSonu-Toplam sayfasından belirtilen tarihe ait
 * toplam kojen üretim değerini (MWh) çeker.
 *
 * Kaynak Sheets: 1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI
 * Sayfa adı    : EnerjiGunSonu-Toplam
 *
 * Sayfa yapısı:
 *   A sütunu → Tarih (gg.aa.yyyy formatında, satır 3'ten başlar)
 *   J sütunu → TOPLAM Aktif Enerji (kWh)
 *
 * Not: Değer kWh cinsinden gelir, 1000'e bölünerek MWh'a çevrilir.
 *
 * Bağımlılıklar: —
 */

// ─── SABİTLER ─────────────────────────────────────────────────────────────────

var URETIM_SS_ID  = '1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI';
var URETIM_SAYFA  = 'EnerjiGunSonu-Toplam';
var URETIM_SUTUN  = 11;  // K sütunu = TOPLAM Aktif Enerji (kWh)
var URETIM_BASLIK = 3;   // Veri 3. satırdan başlar

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * Belirtilen Türkiye tarihine ait toplam üretim (MWh) değerini döner.
 * @param {number} gun  Gün (1-31)
 * @param {number} ay   Ay (1-12)
 * @param {number} yil  Yıl (örn: 2026)
 * @returns {number} Toplam üretim MWh, bulunamazsa 0
 */
function yillikToplamUretimCek(gun, ay, yil) {
  try {
    var ss    = SpreadsheetApp.openById(URETIM_SS_ID);
    var sheet = ss.getSheetByName(URETIM_SAYFA);

    if (!sheet) {
      Logger.log('❌ Üretim sayfası bulunamadı: ' + URETIM_SAYFA);
      return 0;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < URETIM_BASLIK) {
      Logger.log('⚠️ Üretim sayfası boş.');
      return 0;
    }

    // A ve J sütunlarını oku
    var satirSayisi = lastRow - URETIM_BASLIK + 1;
    var veriler = sheet.getRange(URETIM_BASLIK, 1, satirSayisi, URETIM_SUTUN).getValues();

    // Gelen tarih doğrudan aranır
    var hedefTarih = _uretimPad2(gun) + '.' + _uretimPad2(ay) + '.' + yil;

    for (var i = 0; i < veriler.length; i++) {
      var satirTarih = String(veriler[i][0]).trim();

      // Tarih hücresi Date objesi olabilir
      if (veriler[i][0] instanceof Date) {
        var d = veriler[i][0];
        satirTarih = _uretimPad2(d.getDate()) + '.' +
                     _uretimPad2(d.getMonth() + 1) + '.' +
                     d.getFullYear();
      }

      if (satirTarih === hedefTarih) {
        var mwhDeger = Math.round((parseFloat(String(veriler[i][URETIM_SUTUN - 1]).replace(',', '.')) || 0) * 1000) / 1000;
        Logger.log('✅ Üretim ' + hedefTarih + ' → ' + mwhDeger + ' MWh');
        return mwhDeger;
      }
    }

    Logger.log('⚠️ Üretim verisi bulunamadı: ' + hedefTarih);
    return 0;

  } catch(e) {
    Logger.log('❌ yillikToplamUretimCek hata: ' + e.toString());
    return 0;
  }
}

// ─── YARDIMCI ────────────────────────────────────────────────────────────────

function _uretimPad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/**
 * BaglantiNoktalari sayfasındaki "Veri Tarihi"ni okuyarak o güne ait üretimi döner.
 * FaturaDetay.gs'den çağrılır.
 */
function yillikUretimHesaplananGun(ss) {
  try {
    var bagSheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);
    if (!bagSheet) return 0;
    var veriler = bagSheet.getRange(1, 1, bagSheet.getLastRow(), 3).getValues();
    for (var i = 0; i < veriler.length; i++) {
      if (String(veriler[i][0]).indexOf('Veri Tarihi') !== -1) {
        var p = String(veriler[i][1]).trim().split('.');
        if (p.length === 3) {
          return yillikToplamUretimCek(parseInt(p[0]), parseInt(p[1]), parseInt(p[2]));
        }
      }
    }
    return 0;
  } catch(e) {
    Logger.log('❌ yillikUretimHesaplananGun: ' + e.toString());
    return 0;
  }
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function yillikUretimTest() {
  var sonuc = yillikToplamUretimCek(1, 10, 2026);  // ← gün/ay/yıl değiştirin
  Logger.log('Toplam Üretim: ' + sonuc + ' MWh');
  return sonuc;
}
