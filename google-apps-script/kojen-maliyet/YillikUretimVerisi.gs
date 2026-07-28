/**
 * YillikUretimVerisi.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Harici Sheets'teki YillikEnerjiToplam-2026 sayfasından
 * belirtilen tarih için toplam üretim (MWh) değerini çeker.
 *
 * Sayfa yapısı:
 *   Satır 1: Tarihler (UTC, her 4 sütunda bir) — 2026-07-30T21:00:00.000Z
 *   Satır 2: Motor başlıkları — GM1, GM2, GM3, TOPLAM
 *   Satır 3: Üretim (MWh)
 *   TOPLAM  : her tarihin 4. sütunu (offset +3)
 *
 * Tarih eşleştirme:
 *   UTC gece 21:00 = Türkiye sabahı 00:00 (ertesi gün)
 *   Örn: 2026-07-30T21:00:00Z → 31 Temmuz 2026 Türkiye saatiyle
 *   Bu yüzden TR tarihi için UTC tarihinden 1 gün çıkarılır.
 *
 * Kaynak: https://docs.google.com/spreadsheets/d/1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI
 */

// ─── SABİTLER ─────────────────────────────────────────────────────────────────

var YILLIK_SS_ID    = '1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI';
var YILLIK_SAYFA    = 'YillikEnerjiToplam-2026';
var URETIM_SATIR    = 3; // Üretim değerleri 3. satırda

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
    var ss    = SpreadsheetApp.openById(YILLIK_SS_ID);
    var sheet = ss.getSheetByName(YILLIK_SAYFA);
    if (!sheet) {
      Logger.log('❌ Sayfa bulunamadı: ' + YILLIK_SAYFA);
      return 0;
    }

    // 1. satırı oku (tarihler)
    var lastCol   = sheet.getLastColumn();
    var tarihSatir = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    // Türkiye tarihine karşılık gelen UTC tarihini bul
    // TR gün X → UTC gün (X-1) saat 21:00
    // Yani UTC'de bir önceki günün 21:00'i, TR'de o günün 00:00'ı
    var hedefUtcGun = gun - 1; // UTC'de bir önceki gün
    var hedefAy     = ay;
    var hedefYil    = yil;
    if (hedefUtcGun === 0) {
      // Ayın ilk günü → önceki ayın son günü
      hedefAy = ay - 1;
      if (hedefAy === 0) { hedefAy = 12; hedefYil = yil - 1; }
      hedefUtcGun = new Date(hedefYil, hedefAy, 0).getDate();
    }

    // Sütunu bul
    var hedefSutun = -1;
    for (var c = 0; c < tarihSatir.length; c++) {
      var hucre = tarihSatir[c];
      if (!hucre) continue;

      var d;
      if (hucre instanceof Date) {
        d = hucre;
      } else {
        var str = String(hucre);
        if (!str.includes('T')) continue;
        d = new Date(str);
      }

      // UTC ay, gün, saat kontrolü (21:00 UTC = TR gece yarısı başlangıcı)
      if (d.getUTCFullYear() === hedefYil &&
          d.getUTCMonth() + 1 === hedefAy &&
          d.getUTCDate()      === hedefUtcGun &&
          d.getUTCHours()     === 21) {
        hedefSutun = c; // 0-indexed
        break;
      }
    }

    if (hedefSutun === -1) {
      Logger.log('⚠️ Tarih bulunamadı: ' + gun + '/' + ay + '/' + yil +
                 ' (UTC aranan: ' + hedefUtcGun + '/' + hedefAy + '/' + hedefYil + ' 21:00)');
      return 0;
    }

    // TOPLAM sütunu = hedefSutun + 3 (GM1, GM2, GM3, TOPLAM sırası)
    var toplamSutun = hedefSutun + 4; // 1-indexed için +1, TOPLAM için +3 = +4
    var toplamDeger = sheet.getRange(URETIM_SATIR, toplamSutun).getValue();
    var sonuc       = parseFloat(toplamDeger) || 0;

    Logger.log('✅ Üretim ' + gun + '/' + ay + '/' + yil +
               ' → Sütun ' + toplamSutun + ' → ' + sonuc + ' MWh');
    return sonuc;

  } catch (err) {
    Logger.log('❌ yillikToplamUretimCek hata: ' + err.toString());
    return 0;
  }
}

/**
 * Hesaplanan günün üretim verisini BaglantiNoktalari'nden alınan tarihle çeker.
 * FaturaDetay.gs'den çağrılır.
 */
function yillikUretimHesaplananGun(ss_local, ay, yil) {
  try {
    // BaglantiNoktalari'nden Veri Tarihi oku
    var bagSheet = ss_local.getSheetByName('BaglantiNoktalari');
    if (!bagSheet) return 0;

    var lastRow = bagSheet.getLastRow();
    var veriler = bagSheet.getRange(1, 1, lastRow, 3).getValues();
    for (var i = 0; i < veriler.length; i++) {
      if (String(veriler[i][0]).indexOf('Veri Tarihi') !== -1) {
        var tarihStr = String(veriler[i][1]).trim();
        var parcalar = tarihStr.split('.');
        if (parcalar.length === 3) {
          var gun  = parseInt(parcalar[0]);
          var tAy  = parseInt(parcalar[1]);
          var tYil = parseInt(parcalar[2]);
          return yillikToplamUretimCek(gun, tAy, tYil);
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
  // 30 Temmuz 2026 için test
  var sonuc = yillikToplamUretimCek(30, 7, 2026);
  Logger.log('30/07/2026 Toplam Üretim: ' + sonuc + ' MWh');
  return sonuc;
}
