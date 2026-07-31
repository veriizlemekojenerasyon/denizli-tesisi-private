/**
 * GunlukOtomatikCalisma.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * 01/07/2026'dan başlayarak bugüne kadar her gün için tüm verileri çekip
 * ilgili sayfalara kaydeder.
 *
 * Her gün için çalışma sırası:
 *   1. PTF/SMF Piyasa Fiyatları       → PiyasaFiyatlari sayfası
 *   2. AMR Gerçek Tüketim             → AMR_Saatlik sayfası
 *   3. VGen Bağlantı Noktaları        → BaglantiNoktalari sayfası
 *   4. Kojen Çalışma Sayfası          → KojenCalisma_YYYY_MM sayfası
 *   5. Dengesizlik Maliyet Sayfası    → DengesizlikMaliyet_YYYY_MM sayfası
 *   6. Faturalaşma Sayfası            → Faturalasma_YYYY_MM sayfası
 *
 * Kullanım:
 *   tumVerileriCek()                  → 01/07/2026'dan bugüne kadar
 *   tumVerileriCekTarihAralik('2026-07-01', '2026-07-31') → belirli aralık
 */

// ─── SABİT ───────────────────────────────────────────────────────────────────

var BASLANGIC_TARIHI = '2026-07-01';

// ─── ANA FONKSİYONLAR ────────────────────────────────────────────────────────

/**
 * 01/07/2026'dan dünkü tarihe kadar tüm verileri çeker.
 * Trigger ile her gün çalıştırılabilir.
 */
function tumVerileriCek() {
  var baslangic = new Date(BASLANGIC_TARIHI);
  var bitis     = new Date();
  bitis.setDate(bitis.getDate() - 1); // dün
  bitis = new Date(bitis.getFullYear(), bitis.getMonth(), bitis.getDate());

  return tumVerileriCekTarihAralik(
    gocIsoDate(baslangic),
    gocIsoDate(bitis)
  );
}

/**
 * Belirtilen tarih aralığı için tüm verileri çeker.
 * @param {string} baslangicIso  'YYYY-MM-DD'
 * @param {string} bitisIso      'YYYY-MM-DD'
 */
function tumVerileriCekTarihAralik(baslangicIso, bitisIso) {
  Logger.log('Toplu veri cekme basliyor: ' + baslangicIso + ' -> ' + bitisIso);

  var bas   = new Date(baslangicIso);
  var bit   = new Date(bitisIso);
  var sonuc = { basarili: 0, hatali: 0, hatalar: [] };

  for (var d = new Date(bas); d <= bit; d.setDate(d.getDate() + 1)) {
    var isoTarih = gocIsoDate(d);
    var gun      = d.getDate();
    var ay       = d.getMonth() + 1;
    var yil      = d.getFullYear();

    Logger.log('--- ' + isoTarih + ' isleniyor...');

    var gunSonuc = gunlukVerileriCek(isoTarih, gun, ay, yil);

    if (gunSonuc.basarili) {
      sonuc.basarili++;
      Logger.log('OK ' + isoTarih + ' tamamlandi.');
    } else {
      sonuc.hatali++;
      sonuc.hatalar.push({ tarih: isoTarih, hata: gunSonuc.hata });
      Logger.log('HATA ' + isoTarih + ': ' + gunSonuc.hata);
    }

    // GAS zaman aşımını önlemek için kısa bekleme
    Utilities.sleep(500);
  }

  Logger.log('===================================');
  Logger.log('Basarili: ' + sonuc.basarili + ' gun');
  Logger.log('Hatali  : ' + sonuc.hatali   + ' gun');
  if (sonuc.hatalar.length > 0) {
    Logger.log('Hatalar: ' + JSON.stringify(sonuc.hatalar, null, 2));
  }

  return sonuc;
}

/**
 * Tek bir gün için tüm verileri sırayla çeker ve kaydeder.
 * Akış: Bağlantı Noktaları → AMR → EPİAŞ/PTF → Hesapla → Aylık tabloya yaz
 */
function gunlukVerileriCek(isoTarih, gun, ay, yil) {
  try {
    var ayinIlkGunu = (gun === 1);

    // 1. VGen Bağlantı Noktaları (ÖNCE — tahmin verisi buradan gelir)
    try {
      var bagSonuc = vgenBaglantiVerisiniCekTarih(isoTarih);
      Logger.log('  BAG: ' + (bagSonuc.success ? 'OK ' + bagSonuc.assetSayisi + ' asset' : 'HATA ' + bagSonuc.error));
    } catch(e) { Logger.log('  BAG: HATA ' + e.toString()); }

    // 2. AMR Gerçek Tüketim (SONRA — gerçek tüketim verisi)
    try {
      var amrSonuc = amrTarihCek(isoTarih);
      Logger.log('  AMR: ' + (amrSonuc.success ? 'OK ' + amrSonuc.kayitSayisi + ' kayit' : 'HATA ' + amrSonuc.error));
    } catch(e) { Logger.log('  AMR: HATA ' + e.toString()); }

    // 3. PTF/SMF Piyasa Fiyatları (SON — fiyat verisi)
    try {
      var ptfSonuc = ptfTarihCek(isoTarih);
      Logger.log('  PTF: ' + (ptfSonuc.success ? 'OK ' + ptfSonuc.kayitSayisi + ' kayit' : 'HATA ' + ptfSonuc.error));
    } catch(e) { Logger.log('  PTF: HATA ' + e.toString()); }

    // Veriler güncellendi — şimdi hesapla
    var ss = SpreadsheetApp.openById('1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY');

    // 4. O günün saatlik verilerini hesapla ve SABİT DEĞER kaydet
    var gunlukHesap = gunlukSaatlikHesapla(ss, isoTarih, gun, ay, yil);
    Logger.log('  HESAP: OK EPIAS=' + gunlukHesap.epias.toFixed(2) +
               ' TEIAS=' + gunlukHesap.teias.toFixed(2) +
               ' ToplamMaliyet=' + gunlukHesap.toplamMaliyet.toFixed(2));

    // 5. Aylık tablolara bu günün sabit değerlerini yaz

    // KojenCalisma
    try {
      var kcSayfaAdi = KC_SHEET_PREFIX + yil + '_' + kcPad2(ay);
      var kcSheet    = ss.getSheetByName(kcSayfaAdi);
      if (!kcSheet && ayinIlkGunu) {
        kojenCalismaSayfasiOlustur(ay, yil, gun);
        kcSheet = ss.getSheetByName(kcSayfaAdi);
      }
      if (kcSheet) {
        var kcSatir = gun + 2;
        var ayKisa  = ['','Oca','Sub','Mar','Nis','May','Haz','Tem','Agu','Eyl','Eki','Kas','Ara'][ay];
        kcSheet.getRange(kcSatir, 9)
          .setValue(gunlukHesap.kojenAvantaj)
          .setBackground('#EBF8EE').setFontWeight('bold')
          .setNumberFormat('#,##0.00')
          .setNote('Kojen Avantaj (sabit)\nTarih: ' + gun + '.' + ayKisa + '\nDeger: ' + gunlukHesap.kojenAvantaj.toFixed(2));
        SpreadsheetApp.flush();
        Logger.log('  KC : OK Avantaj=' + gunlukHesap.kojenAvantaj.toFixed(2));
      }
    } catch(e) { Logger.log('  KC : HATA ' + e.toString()); }

    // DengesizlikMaliyet
    try {
      var dmSayfaAdi = DM_SHEET_PREFIX + yil + '_' + dmPad2(ay);
      var dmSheet    = ss.getSheetByName(dmSayfaAdi);
      if (!dmSheet) {
        dengesizlikMaliyetSayfasiOlustur(ay, yil, gun);
        dmSheet = ss.getSheetByName(dmSayfaAdi);
      }
      if (dmSheet) {
        var dmSatir = gun + 2;
        var ayKisa2 = ['','Oca','Sub','Mar','Nis','May','Haz','Tem','Agu','Eyl','Eki','Kas','Ara'][ay];
        dmSheet.getRange(dmSatir, 16).setValue(gunlukHesap.epias)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('EPIAS (sabit)\nTarih: ' + gun + '.' + ayKisa2);
        dmSheet.getRange(dmSatir, 17).setValue(gunlukHesap.teias)
          .setBackground('#EBF8EE').setNumberFormat('#,##0.00')
          .setNote('TEIAS (sabit)\nTarih: ' + gun + '.' + ayKisa2);
        dmSheet.getRange(dmSatir, 18).setValue(gunlukHesap.epias + gunlukHesap.teias)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('Toplam (sabit)\nTarih: ' + gun + '.' + ayKisa2);
        SpreadsheetApp.flush();
        Logger.log('  DM : OK');
      }
    } catch(e) { Logger.log('  DM : HATA ' + e.toString()); }

    // Faturalasma
    try {
      var fdSayfaAdi = FD_SHEET_PREFIX + yil + '_' + fdPad2(ay);
      var fdSheet    = ss.getSheetByName(fdSayfaAdi);
      if (!fdSheet) {
        faturaDetaySayfasiOlustur(ay, yil, gun);
        fdSheet = ss.getSheetByName(fdSayfaAdi);
      }
      if (fdSheet) {
        var fdSatir = gun + 1;
        var ayKisa3 = ['','Oca','Sub','Mar','Nis','May','Haz','Tem','Agu','Eyl','Eki','Kas','Ara'][ay];
        var mVal    = gunlukHesap.sebeke > 0 ? gunlukHesap.toplamMaliyet / gunlukHesap.sebeke : 0;
        fdSheet.getRange(fdSatir, 11).setValue(gunlukHesap.toplamMaliyet)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('Toplam Maliyet (sabit)\nTarih: ' + gun + '.' + ayKisa3);
        fdSheet.getRange(fdSatir, 12).setValue(gunlukHesap.sebeke)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('Sebeke Tuketim (sabit)\nTarih: ' + gun + '.' + ayKisa3);
        fdSheet.getRange(fdSatir, 13).setValue(mVal)
          .setBackground('#FFF9C4').setFontWeight('bold').setNumberFormat('0.00000')
          .setNote('Birim Maliyet (sabit)\nTarih: ' + gun + '.' + ayKisa3);
        // Kojen üretim
        var uretim = yillikToplamUretimCek(gun, ay, yil);
        fdSheet.getRange(fdSatir, 16).setValue(uretim)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.000')
          .setNote('Kojen Uretim\nTarih: ' + gun + '.' + ayKisa3);
        fdSheet.getRange(fdSatir, 17).setValue(uretim * 1300)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('P x 1300\nTarih: ' + gun + '.' + ayKisa3);
        SpreadsheetApp.flush();
        Logger.log('  FD : OK Maliyet=' + gunlukHesap.toplamMaliyet.toFixed(2));
      }
    } catch(e) { Logger.log('  FD : HATA ' + e.toString()); }

    return { basarili: true };

  } catch (err) {
    return { basarili: false, hata: err.toString() };
  }
}

/**
 * Belirli bir gün için saatlik hesapları GAS tarafında yapar.
 * BaglantiNoktalari, AMR_Saatlik, PiyasaFiyatlari ve Maliyet sayfalarından okur.
 * @returns {Object} epias, teias, toplamMaliyet, sebeke, kojenAvantaj
 */
function gunlukSaatlikHesapla(ss, isoTarih, gun, ay, yil) {
  var sonuc = { epias: 0, teias: 0, toplamMaliyet: 0, sebeke: 0, kojenAvantaj: 0 };

  try {
    var bagSheet     = ss.getSheetByName('BaglantiNoktalari');
    var amrSheet     = ss.getSheetByName('AMR_Saatlik');
    var ptfSheet     = ss.getSheetByName('PiyasaFiyatlari');
    var maliyetSheet = ss.getSheetByName('Maliyet');

    if (!bagSheet || !amrSheet || !ptfSheet) {
      Logger.log('  UYARI Eksik kaynak: BAG=' + !!bagSheet + ' AMR=' + !!amrSheet + ' PTF=' + !!ptfSheet);
      return sonuc;
    }

    // Maliyet sayfasından o ay değerleri oku
    var yekdem = 0, dagitim = 0, vtc = 0, kojenMaliyet = 0;
    if (maliyetSheet && maliyetSheet.getLastRow() >= 2) {
      var malVeriler = maliyetSheet.getRange(2, 2, maliyetSheet.getLastRow() - 1, 7).getValues();
      for (var m = 0; m < malVeriler.length; m++) {
        if (parseInt(malVeriler[m][0]) === ay && parseInt(malVeriler[m][1]) === yil) {
          kojenMaliyet = parseFloat(malVeriler[m][3]) || 0; // E sütunu
          yekdem       = parseFloat(malVeriler[m][4]) || 0; // F sütunu
          dagitim      = parseFloat(malVeriler[m][5]) || 0; // G sütunu
          vtc          = parseFloat(malVeriler[m][6]) || 0; // H sütunu
          break;
        }
      }
    }

    // PiyasaFiyatlari'nden bu güne ait PTF, SMF, PozDen, NegDen oku (gün filtreli)
    var ptfDizi = [], smfDizi = [], pozDizi = [], negDizi = [];
    for (var h = 0; h < 24; h++) { ptfDizi.push(0); smfDizi.push(0); pozDizi.push(0); negDizi.push(0); }
    if (ptfSheet.getLastRow() >= 2) {
      var ptfVeriler = ptfSheet.getRange(2, 1, ptfSheet.getLastRow() - 1, 6).getValues();
      ptfVeriler.forEach(function(r) {
        var tarihObj = r[0], saatObj = r[1];
        var rAy, rYil, rGun, sHour;
        if (tarihObj instanceof Date) {
          rAy  = tarihObj.getMonth() + 1;
          rYil = tarihObj.getFullYear();
          rGun = tarihObj.getDate();
        } else {
          var p = String(tarihObj).split('.');
          if (p.length < 3) return;
          rGun = parseInt(p[0]);
          rAy  = parseInt(p[1]);
          rYil = parseInt(p[2]);
        }
        if (rAy !== ay || rYil !== yil || rGun !== gun) return; // gün filtresi
        if (saatObj instanceof Date) { sHour = saatObj.getHours(); }
        else { sHour = parseInt(String(saatObj).split(':')[0]); }
        if (isNaN(sHour) || sHour < 0 || sHour > 23) return;
        ptfDizi[sHour] = parseFloat(r[2]) || 0;
        smfDizi[sHour] = parseFloat(r[3]) || 0;
        pozDizi[sHour] = parseFloat(r[4]) || 0;
        negDizi[sHour] = parseFloat(r[5]) || 0;
      });
    }

    // Saatlik hesaplar
    var topEpias = 0, topTeias = 0, topMaliyet = 0, topSebeke = 0, topKojenAv = 0;

    for (var i = 0; i < 24; i++) {
      var bagRow = i + 2;
      var amrRow = i + 2;

      // Tahmin: BaglantiNoktalari G sütunu = Şebeke Hattı Tüketimi (MWh)
      // Sütun: A=SAAT|B=Tüketim Noktası|C=GM1|D=GM2|E=GM3|F=Toplam Kojen|G=Şebeke Hattı
      var tahmin = (bagSheet.getLastRow() >= bagRow) ? (parseFloat(bagSheet.getRange(bagRow, 7).getValue()) || 0) : 0;
      // AMR_Saatlik B sütunu MWh olarak gelir — dönüşüm gerekmez
      var gercek = (amrSheet.getLastRow() >= amrRow) ? (parseFloat(amrSheet.getRange(amrRow, 2).getValue()) || 0) : 0;
      var fark   = gercek - tahmin;
      var ptf    = ptfDizi[i], smf = smfDizi[i];
      var pozFark = pozDizi[i] - ptf;
      var negFark = negDizi[i] - ptf;
      var epias  = Math.abs(fark > 0 ? fark * pozFark : fark * negFark);
      var teias  = 0;
      if (Math.abs(fark) > tahmin * 0.15) {
        teias = Math.abs(fark * Math.max(ptf, smf) * 0.08);
      }

      // Faturalaşma hesapları
      var dagYek    = gercek * (yekdem + dagitim + vtc);
      var toplamSat = epias + (gercek * ptf) + dagYek;

      // Kojen avantaj
      var kojenUretim = (bagSheet.getLastRow() >= bagRow) ? (parseFloat(bagSheet.getRange(bagRow, 6).getValue()) || 0) : 0;
      var kojenBedel  = kojenUretim * kojenMaliyet;
      var sebekeMal   = kojenUretim * (ptf + yekdem + dagitim + vtc);
      var avantaj     = sebekeMal - kojenBedel;

      topEpias   += epias;
      topTeias   += teias;
      topMaliyet += toplamSat;
      topSebeke  += gercek;
      topKojenAv += avantaj;
    }

    sonuc.epias         = topEpias;
    sonuc.teias         = topTeias;
    sonuc.toplamMaliyet = topMaliyet;
    sonuc.sebeke        = topSebeke;
    sonuc.kojenAvantaj  = topKojenAv;

  } catch(e) {
    Logger.log('  gunlukSaatlikHesapla hata: ' + e.toString());
  }

  return sonuc;
}

// ─── TRİGGER ─────────────────────────────────────────────────────────────────

/**
 * Her gün 10:30'da çalışacak trigger kurar.
 */
function gunlukTriggerKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'gunlukOtomatikCalis') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('gunlukOtomatikCalis')
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .nearMinute(30)
    .inTimezone(Session.getScriptTimeZone())
    .create();

  Logger.log('Gunluk trigger kuruldu - her gun 10:30.');
  return { success: true };
}

/**
 * Trigger tarafından çağrılan ana fonksiyon.
 * 1. Dünün verisini hesaplar ve kaydeder.
 * 2. Ay değiştiyse önceki ayın sayfalarını yedekler.
 */
function gunlukOtomatikCalis() {
  var bugun = new Date();
  var dun   = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - 1);

  var gun = dun.getDate();
  var ay  = dun.getMonth() + 1;
  var yil = dun.getFullYear();
  var iso = gocIsoDate(dun);

  Logger.log('Otomatik calisma: ' + iso);

  var sonuc = gunlukVerileriCek(iso, gun, ay, yil);
  Logger.log(sonuc.basarili ? 'OK ' + iso + ' tamamlandi.' : 'HATA ' + iso + ': ' + sonuc.hata);

  // Ay değişti mi? (Bugün 1. gün ise dün son gündü)
  if (bugun.getDate() === 1) {
    Logger.log('Ay degisti - onceki ayin verileri yedekleniyor...');
    ayYedekle(ay, yil);
  }

  return sonuc;
}

// ─── GÜNLÜK GÜNCELLEME FONKSİYONLARI ────────────────────────────────────────
// Aylık sayfalar silinmez — sadece ilgili günün satırları güncellenir.

/**
 * KojenCalisma sayfası varsa sadece bu günün I sütununu günceller.
 */
function kojenCalismaGunGuncelle(gun, ay, yil) {
  try {
    var ss       = SpreadsheetApp.openById(KC_SPREADSHEET_ID);
    var sayfaAdi = KC_SHEET_PREFIX + yil + '_' + kcPad2(ay);
    var sheet    = ss.getSheetByName(sayfaAdi);

    // Sayfa yoksa tam oluştur
    if (!sheet) return kojenCalismaSayfasiOlustur(ay, yil, gun);

    var ayKisa    = ['','Oca','Sub','Mar','Nis','May','Haz','Tem','Agu','Eyl','Eki','Kas','Ara'][ay];
    var tarihEt   = gun + '.' + ayKisa;
    var gunSayisi = new Date(yil, ay, 0).getDate();

    for (var g = 1; g <= gunSayisi; g++) {
      var satirNo = g + 2;
      var hVal    = sheet.getRange(satirNo, 8).getValue();
      if (String(hVal).trim() === tarihEt || g === gun) {
        sheet.getRange(satirNo, 9)
          .setFormula('=F28')
          .setBackground('#EBF8EE').setFontWeight('bold')
          .setNote('Guncellendi: ' + tarihEt);
        break;
      }
    }

    SpreadsheetApp.flush();
    return { success: true, sayfa: sayfaAdi, gun: gun };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * DengesizlikMaliyet sayfası varsa sadece bu günün P, Q, R sütunlarını günceller.
 */
function dengesizlikMaliyetGunGuncelle(gun, ay, yil) {
  try {
    var ss       = SpreadsheetApp.openById(DM_SPREADSHEET_ID);
    var sayfaAdi = DM_SHEET_PREFIX + yil + '_' + dmPad2(ay);
    var sheet    = ss.getSheetByName(sayfaAdi);

    if (!sheet) return dengesizlikMaliyetSayfasiOlustur(ay, yil, gun);

    var ayKisa  = ['','Oca','Sub','Mar','Nis','May','Haz','Tem','Agu','Eyl','Eki','Kas','Ara'][ay];
    var tarihEt = gun + '.' + ayKisa;
    var satirNo = gun + 2;

    SpreadsheetApp.flush();
    var epiasVal  = parseFloat(sheet.getRange(27, 12).getValue()) || 0; // L27
    var teiasVal  = parseFloat(sheet.getRange(27, 13).getValue()) || 0; // M27
    var toplamVal = epiasVal + teiasVal;

    sheet.getRange(satirNo, 16).setValue(epiasVal)
      .setBackground('#EBF8EE').setFontWeight('bold')
      .setNumberFormat('#,##0.00')
      .setNote('L27 degeri kaydedildi (EPIAS)\nTarih: ' + tarihEt + '\nDeger: ' + epiasVal.toFixed(2));
    sheet.getRange(satirNo, 17).setValue(teiasVal)
      .setBackground('#EBF8EE').setNumberFormat('#,##0.00')
      .setNote('M27 degeri kaydedildi (TEIAS)\nTarih: ' + tarihEt + '\nDeger: ' + teiasVal.toFixed(2));
    sheet.getRange(satirNo, 18).setValue(toplamVal)
      .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
      .setNote('EPIAS + TEIAS\n' + epiasVal.toFixed(2) + ' + ' + teiasVal.toFixed(2) + '\nTarih: ' + tarihEt);

    SpreadsheetApp.flush();
    Logger.log('  DM guncellendi: ' + tarihEt + ' | EPIAS=' + epiasVal.toFixed(2) + ' TEIAS=' + teiasVal.toFixed(2));
    return { success: true, sayfa: sayfaAdi, gun: gun };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Faturalasma sayfası varsa sadece bu günün K, L, M, P, Q satırlarını günceller.
 */
function faturaDetayGunGuncelle(gun, ay, yil) {
  try {
    var ss       = SpreadsheetApp.openById(FD_SPREADSHEET_ID);
    var sayfaAdi = FD_SHEET_PREFIX + yil + '_' + fdPad2(ay);
    var sheet    = ss.getSheetByName(sayfaAdi);

    if (!sheet) return faturaDetaySayfasiOlustur(ay, yil, gun);

    var ayKisa  = ['','Oca','Sub','Mar','Nis','May','Haz','Tem','Agu','Eyl','Eki','Kas','Ara'][ay];
    var tarihEt = gun + '.' + ayKisa;
    var satirNo = gun + 1;

    SpreadsheetApp.flush();
    var d28Val = parseFloat(sheet.getRange(28, 4).getValue()) || 0;
    var h26Val = parseFloat(sheet.getRange(26, 8).getValue()) || 0;
    var mVal   = h26Val > 0 ? d28Val / h26Val : 0;

    sheet.getRange(satirNo, 11).setValue(d28Val)
      .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
      .setNote('D28 degeri kaydedildi\nTarih: ' + tarihEt + '\nDeger: ' + d28Val.toFixed(2));
    sheet.getRange(satirNo, 12).setValue(h26Val)
      .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
      .setNote('H26 degeri kaydedildi\nTarih: ' + tarihEt + '\nDeger: ' + h26Val.toFixed(2));
    sheet.getRange(satirNo, 13).setValue(mVal)
      .setBackground('#FFF9C4').setFontWeight('bold').setNumberFormat('0.00000')
      .setNote('K/L = ' + d28Val.toFixed(2) + ' / ' + h26Val.toFixed(2) + '\nTarih: ' + tarihEt);

    var uretimMwh = yillikToplamUretimCek(gun, ay, yil);
    sheet.getRange(satirNo, 16).setValue(uretimMwh)
      .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.000')
      .setNote('Kaynak: YillikEnerjiToplam\nTarih: ' + tarihEt);
    sheet.getRange(satirNo, 17).setValue(uretimMwh * 1300)
      .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
      .setNote('P x 1300\nTarih: ' + tarihEt);

    SpreadsheetApp.flush();
    Logger.log('  FD guncellendi: ' + tarihEt + ' | K=' + d28Val.toFixed(2) + ' L=' + h26Val.toFixed(2) + ' M=' + mVal.toFixed(5));
    return { success: true, sayfa: sayfaAdi, gun: gun };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

function gocIsoDate(d) {
  var ay  = d.getMonth() + 1;
  var gun = d.getDate();
  return d.getFullYear() + '-' +
    (ay  < 10 ? '0' + ay  : ay)  + '-' +
    (gun < 10 ? '0' + gun : gun);
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

/** Sadece dün için çalıştır */
function dunkuVerileriCekTest() {
  var dun = new Date();
  dun.setDate(dun.getDate() - 1);
  var iso = gocIsoDate(dun);
  return gunlukVerileriCek(iso, dun.getDate(), dun.getMonth() + 1, dun.getFullYear());
}

/** Belirli bir gün için test — tarihi değiştirin */
function tekGunTest() {
  var iso = '2026-08-01'; // <- degistirin
  var d   = new Date(iso);
  return gunlukVerileriCek(iso, d.getDate(), d.getMonth() + 1, d.getFullYear());
}

// ─── AY YEDEKLEMESİ ──────────────────────────────────────────────────────────

/**
 * Belirtilen ay/yılın KojenCalisma, DengesizlikMaliyet ve Faturalasma
 * sayfalarını kopyalayarak "Yedek_SayfaAdi_DDMMYYYY" formatında arşivler.
 */
function ayYedekle(ay, yil) {
  try {
    var ss     = SpreadsheetApp.openById('1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY');
    var suffix = yil + '_' + (ay < 10 ? '0' + ay : ay);
    var zaman  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'ddMMyyyy_HHmm');

    var sayfalar = [
      KC_SHEET_PREFIX + suffix,
      DM_SHEET_PREFIX + suffix,
      FD_SHEET_PREFIX + suffix
    ];

    var yedeklenen = [];

    sayfalar.forEach(function(sayfaAdi) {
      var sheet = ss.getSheetByName(sayfaAdi);
      if (!sheet) {
        Logger.log('  UYARI Yedeklenecek sayfa bulunamadi: ' + sayfaAdi);
        return;
      }

      var kisaAd = sayfaAdi
        .replace('KojenCalisma_',       'KC_')
        .replace('DengesizlikMaliyet_', 'DM_')
        .replace('Faturalasma_',        'FD_');
      var yedekAdi = 'Yedek_' + kisaAd + '_' + zaman;

      var kopya = sheet.copyTo(ss);
      kopya.setName(yedekAdi);
      ss.moveActiveSheet(ss.getNumSheets());
      kopya.getRange(1, 1).setNote('YEDEK KOPYA\nKaynak: ' + sayfaAdi + '\nOlusturma: ' + zaman);

      yedeklenen.push(yedekAdi);
      Logger.log('  Yedeklendi: ' + yedekAdi);
    });

    Logger.log('Ay yedekleme tamamlandi: ' + yedeklenen.length + ' sayfa');
    return { success: true, yedeklenen: yedeklenen };

  } catch(e) {
    Logger.log('ayYedekle hata: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/** Manuel yedekleme testi */
function ayYedekleTest() {
  return ayYedekle(7, 2026);
}
