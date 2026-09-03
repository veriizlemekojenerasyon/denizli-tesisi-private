/**
 * 05_YillikUretimVerisi.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Harici Sheets'teki YillikEnerjiToplam-2026 sayfasından
 * belirtilen Türkiye tarihine ait toplam üretim (MWh) değerini çeker.
 *
 * Sayfa yapısı:
 *   Satır 1: Tarihler (UTC, her 4 sütunda bir) — 2026-07-30T21:00:00.000Z
 *   Satır 2: Motor başlıkları — GM1 | GM2 | GM3 | TOPLAM
 *   Satır 3: Üretim değerleri (MWh)
 *
 * Tarih eşleştirme:
 *   UTC gece 21:00 = Türkiye sabahı 00:00 (ertesi gün)
 *   Yani TR tarih X için UTC'de (X-1) 21:00 aranır.
 *
 * Bağımlılıklar: 01_VGenConfig.gs (CFG_YILLIK_SS_ID, CFG_YILLIK_SAYFA)
 */

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * Belirtilen Türkiye tarihine ait toplam üretim (MWh) değerini döner.
 * @param {number} gun  Gün (1-31)
 * @param {number} ay   Ay (1-12)
 * @param {number} yil  Yıl (örn: 2026)
 * @returns {number} Toplam üretim MWh, bulunamazsa 0
 */
function yillikToplamUretimCek(gun, ay, yil) {
  // ID ve sayfa adı burada sabit — CFG_ değişkeni farklı bir dosyada ezildiği için
  var YILLIK_SS_ID = '1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI';
  var YILLIK_SAYFA = 'YillikEnerjiToplam-2026';
  try {
    var ss    = SpreadsheetApp.openById(YILLIK_SS_ID);
    var sheet = ss.getSheetByName(YILLIK_SAYFA);
    if (!sheet) {
      Logger.log('❌ Yıllık üretim sayfası bulunamadı: ' + CFG_YILLIK_SAYFA);
      return 0;
    }

    // 1. satırı oku (tarih başlıkları)
    var lastCol    = sheet.getLastColumn();
    var tarihSatir = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // TR gün X → UTC gün (X-1) saat 21:00
    var utcGun = gun - 1;
    var utcAy  = ay;
    var utcYil = yil;
    if (utcGun === 0) {
      utcAy = ay - 1;
      if (utcAy === 0) { utcAy = 12; utcYil = yil - 1; }
      utcGun = new Date(utcYil, utcAy, 0).getDate();
    }

    // Hedef sütunu bul
    var hedefSutun = -1;
    for (var c = 0; c < tarihSatir.length; c++) {
      var hucre = tarihSatir[c];
      if (!hucre) continue;

      var d = (hucre instanceof Date) ? hucre : new Date(String(hucre));
      if (isNaN(d.getTime())) continue;

      if (d.getUTCFullYear() === utcYil &&
          d.getUTCMonth() + 1 === utcAy &&
          d.getUTCDate()       === utcGun &&
          d.getUTCHours()      === 21) {
        hedefSutun = c;
        break;
      }
    }

    if (hedefSutun === -1) {
      Logger.log('⚠️ Yıllık üretim: tarih bulunamadı → ' + gun + '/' + ay + '/' + yil +
                 ' (UTC aranan: ' + utcGun + '/' + utcAy + '/' + utcYil + ' 21:00)');
      return 0;
    }

    // TOPLAM sütunu = hedefSutun + 4 (1-indexed: +1, GM1+GM2+GM3+TOPLAM: +3 = +4)
    var toplamSutun = hedefSutun + 4;
    var deger       = sheet.getRange(3, toplamSutun).getValue(); // 3. satır = üretim
    var sonuc       = Math.round((parseFloat(deger) || 0) * 1000) / 1000; // 3 ondalık

    Logger.log('✅ Yıllık üretim ' + gun + '/' + ay + '/' + yil +
               ' → sütun ' + toplamSutun + ' → ' + sonuc + ' MWh');
    return sonuc;

  } catch(e) {
    Logger.log('❌ yillikToplamUretimCek hata: ' + e.toString());
    return 0;
  }
}

/**
 * BaglantiNoktalari sayfasındaki "Veri Tarihi"ni okuyarak o güne ait üretimi döner.
 * FaturaDetay.gs'den çağrılır.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss  Ana spreadsheet
 * @returns {number} MWh
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
  var sonuc = yillikToplamUretimCek(30, 7, 2026);  // ← gün/ay/yıl değiştirin
  Logger.log('Toplam Üretim: ' + sonuc + ' MWh');
  return sonuc;
}
