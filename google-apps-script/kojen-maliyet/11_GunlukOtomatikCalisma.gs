/**
 * 11_GunlukOtomatikCalisma.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Ana orkestratör — tüm günlük veri çekme ve hesaplama akışını yönetir.
 *
 * Çalışma sırası (her gün için):
 *   1. Bağlantı Noktaları  → baglantiTarihCek()              (04_BaglantiNoktalari.gs)
 *   2. AMR Tüketim         → amrTarihCek()                   (03_AMRVerisi.gs)
 *   3. PTF/SMF Fiyatları   → ptfTarihCek()                   (02_PiyasaFiyatlari.gs)
 *   4. Saatlik Hesaplama   → _gocSaatlikHesapla()            (bu dosya)
 *   5. Aylık Tablolara Yaz → KojenCalisma / Dengesizlik / Faturalasma sayfaları
 *
 * Trigger:   gunlukTriggerKur()          → her gün 10:30
 * Toplu:     tumVerileriCek()            → başlangıç tarihinden dünkü tarihe
 *            tumVerileriCekTarihAralik() → belirli tarih aralığı
 * Tek gün:   gunlukVerileriCek()         → tek bir gün işle
 *
 * Bağımlılıklar: 00_VGenAuth.gs, 01_VGenConfig.gs,
 *                02_PiyasaFiyatlari.gs, 03_AMRVerisi.gs, 04_BaglantiNoktalari.gs,
 *                07_DengesizlikMaliyet.gs, 08_KojenCalisma.gs, 09_FaturaDetay.gs,
 *                05_YillikUretimVerisi.gs, 10_ExcelDisaAktarim.gs
 */

// ─── SABİT ───────────────────────────────────────────────────────────────────

var GOC_BASLANGIC_TARIHI = '2026-07-01';

// ─── TRIGGER ─────────────────────────────────────────────────────────────────

/**
 * Her gün 10:30'da çalışacak trigger kurar.
 * Bir kez çalıştırmanız yeterli.
 */
function gunlukTriggerKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'gunlukOtomatikCalis') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('gunlukOtomatikCalis')
    .timeBased().everyDays(1).atHour(8).nearMinute(50)
    .inTimezone(Session.getScriptTimeZone()).create();
  Logger.log('✅ Günlük trigger kuruldu — her gün 10:30.');
  return { success: true };
}

// ─── OTOMATİK ÇALIŞMA (TRIGGER TARAFINDAN ÇAĞRILIR) ─────────────────────────

/**
 * Her gün trigger tarafından çağrılır.
 * Dünkü veriyi işler; ay bittiyse yedekleme yapar.
 */
function gunlukOtomatikCalis() {
  var bugun = new Date();
  var dun   = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - 1);
  var iso   = cfgIsoDate(dun);

  Logger.log('=== Otomatik çalışma: ' + iso + ' ===');
  var sonuc = gunlukVerileriCek(iso, dun.getDate(), dun.getMonth() + 1, dun.getFullYear());
  Logger.log(sonuc.basarili ? '✅ ' + iso + ' tamamlandı.' : '❌ ' + iso + ': ' + sonuc.hata);

  // Bugün ayın 1'i ise dünkü ay bitti → yedekle
  if (bugun.getDate() === 1) {
    Logger.log('Ay değişti — yedekleme başlıyor...');
    ayYedekle(dun.getMonth() + 1, dun.getFullYear());
  }

  return sonuc;
}

// ─── TOPLU VERİ ÇEKME ────────────────────────────────────────────────────────

/**
 * GOC_BASLANGIC_TARIHI'nden dünkü tarihe kadar tüm günleri işler.
 * GAS zaman aşımı riski: çok uzun aralıklar için tarih aralığı versiyonunu kullanın.
 */
function tumVerileriCek() {
  return tumVerileriCekTarihAralik(
    GOC_BASLANGIC_TARIHI,
    cfgIsoDate(cfgDunTarihi())
  );
}

/**
 * Belirtilen tarih aralığındaki her günü sırayla işler.
 * @param {string} baslangicIso  'YYYY-MM-DD'
 * @param {string} bitisIso      'YYYY-MM-DD'
 */
function tumVerileriCekTarihAralik(baslangicIso, bitisIso) {
  Logger.log('Toplu çekme: ' + baslangicIso + ' → ' + bitisIso);

  var bas   = new Date(baslangicIso);
  var bit   = new Date(bitisIso);
  var sonuc = { basarili: 0, hatali: 0, hatalar: [] };

  for (var d = new Date(bas); d <= bit; d.setDate(d.getDate() + 1)) {
    var iso = cfgIsoDate(d);
    var gun = d.getDate(), ay = d.getMonth() + 1, yil = d.getFullYear();

    Logger.log('--- ' + iso + ' işleniyor...');
    var gunSonuc = gunlukVerileriCek(iso, gun, ay, yil);

    if (gunSonuc.basarili) {
      sonuc.basarili++;
      Logger.log('✅ ' + iso);
    } else {
      sonuc.hatali++;
      sonuc.hatalar.push({ tarih: iso, hata: gunSonuc.hata });
      Logger.log('❌ ' + iso + ': ' + gunSonuc.hata);
    }

    Utilities.sleep(1500); // GAS kota koruması + yazma gecikmesi
  }

  Logger.log('=== Toplu çekme bitti ===');
  Logger.log('Başarılı: ' + sonuc.basarili + ' | Hatalı: ' + sonuc.hatali);
  if (sonuc.hatalar.length) Logger.log(JSON.stringify(sonuc.hatalar, null, 2));
  return sonuc;
}

// ─── TEK GÜN İŞLEME ─────────────────────────────────────────────────────────

/**
 * Tek bir gün için tüm veri çekme + hesaplama + kaydetme akışını çalıştırır.
 *
 * @param {string} isoTarih  'YYYY-MM-DD'
 * @param {number} gun       Gün (1-31)
 * @param {number} ay        Ay (1-12)
 * @param {number} yil       Yıl
 * @returns {{ basarili: boolean, hata?: string }}
 */
function gunlukVerileriCek(isoTarih, gun, ay, yil) {
  try {
    var ayinIlkGunu = (gun === 1);

    // ── 1. Bağlantı Noktaları (tahmin verisi — ÖNCE gelir) ───────────────────
    var bagSonuc = { success: false, saatlikTahmin: [], saatlikKojenUretim: [] };
    try {
      bagSonuc = baglantiTarihCek(isoTarih);
      Logger.log('  BAG: ' + (bagSonuc.success ? 'OK ' + bagSonuc.assetSayisi + ' asset' : 'HATA ' + bagSonuc.error));
    } catch(e) { Logger.log('  BAG: HATA ' + e.toString()); }

    // ── 2. AMR Gerçek Tüketim ────────────────────────────────────────────────
    var amrSonuc = { success: false, saatlikMwh: [] };
    try {
      amrSonuc = amrTarihCek(isoTarih);
      Logger.log('  AMR: ' + (amrSonuc.success ? 'OK ' + amrSonuc.kayitSayisi + ' kayıt' : 'HATA ' + amrSonuc.error));
    } catch(e) { Logger.log('  AMR: HATA ' + e.toString()); }

    // ── 3. PTF/SMF Piyasa Fiyatları ──────────────────────────────────────────
    try {
      var ptfSonuc = ptfTarihCek(isoTarih);
      Logger.log('  PTF: ' + (ptfSonuc.success ? 'OK ' + ptfSonuc.kayitSayisi + ' kayıt' : 'HATA ' + ptfSonuc.error));
    } catch(e) { Logger.log('  PTF: HATA ' + e.toString()); }

    // ── 4. Saatlik hesaplama (GAS tarafında) ─────────────────────────────────
    SpreadsheetApp.flush(); // BAG ve AMR sayfalarının tamamen yazılmasını bekle
    Utilities.sleep(1000);  // API yazma gecikmesi için ekstra bekleme
    var ss        = cfgSsAc();
    Logger.log('  SS ID kontrol: ' + ss.getId());
    var gunHesap  = _gocSaatlikHesapla(ss, gun, ay, yil, bagSonuc, amrSonuc);
    Logger.log('  HESAP: EPIAS=' + gunHesap.epias.toFixed(2) +
               ' TEIAS=' + gunHesap.teias.toFixed(2) +
               ' TopMaliyet=' + gunHesap.toplamMaliyet.toFixed(2) +
               ' KojenAv=' + gunHesap.kojenAvantaj.toFixed(2));

    // ── 5. Aylık tablolara bu günün sabit değerlerini yaz ────────────────────
    var ayKisa = CFG_AYLAR_KISA[ay] || ay;
    var saatlik = gunHesap.saatlik || [];

    // KojenCalisma — I sütunu (kojenAvantaj) + saatlik D, F sütunları
    try {
      var kcAdi   = CFG_PREF_KOJEN_CALISMA + yil + '_' + cfgPad2(ay);
      var kcSheet = ss.getSheetByName(kcAdi);
      if (!kcSheet) {
        kojenCalismaSayfasiOlustur(ay, yil, gun);
        kcSheet = ss.getSheetByName(kcAdi);
      }
      if (kcSheet) {
        // I sütunu: günlük kojen avantaj toplamı
        kcSheet.getRange(gun + 2, 9)
          .setValue(gunHesap.kojenAvantaj)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('Kojen Avantaj (sabit)\nTarih: ' + gun + '.' + ayKisa + '\nDeğer: ' + gunHesap.kojenAvantaj.toFixed(2));
        // Saatlik D (Bedel=KojenUretim×KojenMaliyet) ve F (SebekeMal=KojenUretim×(PTF+YEKDEM+DAG+VTC))
        for (var si = 0; si < saatlik.length; si++) {
          var kcSatir = si + 3;
          kcSheet.getRange(kcSatir, 4).setValue(saatlik[si].kojenBedel)
            .setBackground('#EBF8EE').setNumberFormat('#,##0.00 "₺"');
          kcSheet.getRange(kcSatir, 6).setValue(saatlik[si].sebekeMal)
            .setBackground('#EBF8EE').setNumberFormat('#,##0.00 "₺"');
        }
        SpreadsheetApp.flush();
        Logger.log('  KC : OK Avantaj=' + gunHesap.kojenAvantaj.toFixed(2));
      } else {
        Logger.log('  KC : Sayfa yok, atlandı (' + kcAdi + ')');
      }
    } catch(e) { Logger.log('  KC : HATA ' + e.toString()); }

    // DengesizlikMaliyet — P/Q/R (aylık) + saatlik L/M sütunları
    try {
      var dmAdi   = CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay);
      var dmSheet = ss.getSheetByName(dmAdi);
      if (!dmSheet) {
        dengesizlikMaliyetSayfasiOlustur(ay, yil, gun);
        dmSheet = ss.getSheetByName(dmAdi);
      }
      if (dmSheet) {
        var dmSatir = gun + 2;
        // Aylık özet: P=EPİAŞ, Q=TEİAŞ, R=Toplam
        dmSheet.getRange(dmSatir, 16).setValue(gunHesap.epias)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('EPİAŞ (sabit)\nTarih: ' + gun + '.' + ayKisa);
        dmSheet.getRange(dmSatir, 17).setValue(gunHesap.teias)
          .setBackground('#EBF8EE').setNumberFormat('#,##0.00 "₺"')
          .setNote('TEİAŞ (sabit)\nTarih: ' + gun + '.' + ayKisa);
        dmSheet.getRange(dmSatir, 18).setValue(gunHesap.epias + gunHesap.teias)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('EPİAŞ + TEİAŞ\nTarih: ' + gun + '.' + ayKisa);
        // Saatlik L=EPİAŞ, M=TEİAŞ (satır 3'ten başlar)
        for (var si = 0; si < saatlik.length; si++) {
          var dmSaatSatir = si + 3;
          dmSheet.getRange(dmSaatSatir, 12).setValue(saatlik[si].epias)
            .setBackground('#EBF8EE').setNumberFormat('#,##0.00 "₺"');
          dmSheet.getRange(dmSaatSatir, 13).setValue(saatlik[si].teias)
            .setBackground('#EBF8EE').setNumberFormat('#,##0.00 "₺"');
          // B=Tahmin, C=Gerçek, D=Fark, E=PTF, F=SMF, G=PozDen, H=NegDen, I=PozFark, J=NegFark
          dmSheet.getRange(dmSaatSatir, 2).setValue(saatlik[si].tahmin).setNumberFormat('0.000');
          dmSheet.getRange(dmSaatSatir, 3).setValue(saatlik[si].gercek).setNumberFormat('0.000');
          dmSheet.getRange(dmSaatSatir, 4).setValue(saatlik[si].fark).setNumberFormat('0.000');
          dmSheet.getRange(dmSaatSatir, 5).setValue(saatlik[si].ptf).setNumberFormat('#,##0.00 "₺"');
          dmSheet.getRange(dmSaatSatir, 6).setValue(saatlik[si].smf).setNumberFormat('#,##0.00 "₺"');
          dmSheet.getRange(dmSaatSatir, 7).setValue(saatlik[si].pozDen).setNumberFormat('#,##0.00 "₺"');
          dmSheet.getRange(dmSaatSatir, 8).setValue(saatlik[si].negDen).setNumberFormat('#,##0.00 "₺"');
          dmSheet.getRange(dmSaatSatir, 9).setValue(saatlik[si].pozFark).setNumberFormat('#,##0.00 "₺"');
          dmSheet.getRange(dmSaatSatir, 10).setValue(saatlik[si].negFark).setNumberFormat('#,##0.00 "₺"');
        }
        SpreadsheetApp.flush();
        Logger.log('  DM : OK EPİAŞ=' + gunHesap.epias.toFixed(2) + ' TEİAŞ=' + gunHesap.teias.toFixed(2));
      } else {
        Logger.log('  DM : Sayfa yok, atlandı (' + dmAdi + ')');
      }
    } catch(e) { Logger.log('  DM : HATA ' + e.toString()); }

    // Faturalasma — K/L/M/P/Q (aylık) + saatlik A-H sütunları
    try {
      var fdAdi   = CFG_PREF_FATURA + yil + '_' + cfgPad2(ay);
      var fdSheet = ss.getSheetByName(fdAdi);
      if (!fdSheet) {
        faturaDetaySayfasiOlustur(ay, yil, gun);
        fdSheet = ss.getSheetByName(fdAdi);
      }
      if (fdSheet) {
        // Saatlik A-H sütunlarını yaz (satır 2'den başlar)
        for (var si = 0; si < saatlik.length; si++) {
          var fdSaatSatir = si + 2;
          var s = saatlik[si];
          fdSheet.getRange(fdSaatSatir, 1).setValue(s.saat)
            .setBackground('#1C2B3A').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
          fdSheet.getRange(fdSaatSatir, 2).setValue(s.bVal).setNumberFormat('#,##0.00 "₺"');
          fdSheet.getRange(fdSaatSatir, 3).setValue(s.cVal).setNumberFormat('#,##0.00 "₺"')
            .setNote('TAHMİN=' + s.tahmin.toFixed(3) + ' × PTF=' + s.ptf.toFixed(2));
          fdSheet.getRange(fdSaatSatir, 4).setValue(s.dVal).setNumberFormat('#,##0.00 "₺"')
            .setNote('GERÇEK=' + s.gercek.toFixed(3) + ' × ' + (s.yekdem+s.dagitim+s.vtc).toFixed(2));
          fdSheet.getRange(fdSaatSatir, 5).setValue(s.eVal).setNumberFormat('#,##0.00 "₺"');
          fdSheet.getRange(fdSaatSatir, 6).setValue(s.fVal).setNumberFormat('#,##0.00 "₺"');
          fdSheet.getRange(fdSaatSatir, 7).setValue(s.tahmin).setNumberFormat('0.000');
          fdSheet.getRange(fdSaatSatir, 8).setValue(s.gercek).setNumberFormat('0.000');
          var bg = si % 2 === 0 ? '#F7F9FC' : '#FFFFFF';
          fdSheet.getRange(fdSaatSatir, 2, 1, 7).setBackground(bg);
        }
        SpreadsheetApp.flush();

        // Toplam satırı (26) formülleri — her gün yenile
        for (var ts = 2; ts <= 8; ts++) {
          var harf = String.fromCharCode(64 + ts);
          if (ts === 6) {
            fdSheet.getRange(26, ts).setFormula('=ABS(SUM(' + harf + '2:' + harf + '25))').setNumberFormat('#,##0.00 "₺"');
          } else if (ts <= 6) {
            fdSheet.getRange(26, ts).setFormula('=SUM(' + harf + '2:' + harf + '25)').setNumberFormat('#,##0.00 "₺"');
          } else {
            fdSheet.getRange(26, ts).setFormula('=SUM(' + harf + '2:' + harf + '25)').setNumberFormat('0.000');
          }
        }
        fdSheet.getRange(26, 1, 1, 8).setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold');
        SpreadsheetApp.flush();

        // D28 hesapla
        var fdSatir  = gun + 1;
        var uretim   = yillikToplamUretimCek(gun, ay, yil);
        var malSheet2 = ss.getSheetByName(CFG_SAYFA_MALIYET);
        var maliyetSatir = malSheet2 ? (cfgMaliyetSatiriBul(ss, ay, yil) || 2) : 2;
        var maliyetK2 = malSheet2 ? (parseFloat(malSheet2.getRange(maliyetSatir, 11).getValue()) || 0) : 0;
        var c26epias   = parseFloat(fdSheet.getRange(26, 3).getValue()) || 0;
        var d26dagitim = parseFloat(fdSheet.getRange(26, 4).getValue()) || 0;
        var e26koruma  = parseFloat(fdSheet.getRange(26, 5).getValue()) || 0;
        var f26vtc     = parseFloat(fdSheet.getRange(26, 6).getValue()) || 0;
        // O günün EPİAŞ + TEİAŞ değeri — DM sayfasında gun+2. satır, P ve Q sütunları
        var dmSheet3  = ss.getSheetByName(CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay));
        var dmGunSatir = gun + 2;  // 01/07 → satır 3, 02/07 → satır 4 ...
        var dmGunEpias = dmSheet3 && dmSheet3.getLastRow() >= dmGunSatir
          ? (parseFloat(dmSheet3.getRange(dmGunSatir, 16).getValue()) || 0) : gunHesap.epias;
        var dmGunTeias = dmSheet3 && dmSheet3.getLastRow() >= dmGunSatir
          ? (parseFloat(dmSheet3.getRange(dmGunSatir, 17).getValue()) || 0) : gunHesap.teias;
        var dmGunToplam = dmGunEpias + dmGunTeias;
        var d28Val     = maliyetK2 + c26epias + d26dagitim + f26vtc + dmGunToplam - e26koruma;

        fdSheet.getRange(28, 4).setValue(d28Val)
          .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('K2=' + maliyetK2 + ' C26=' + c26epias + ' D26=' + d26dagitim + ' F26=' + f26vtc + ' DM(gun' + gun + ')=' + dmGunToplam + ' E26=' + e26koruma);
        fdSheet.getRange(28, 8).setFormula('=H26').setNumberFormat('0.000').setBackground('#EEF4FF');
        SpreadsheetApp.flush();

        var sebeke   = parseFloat(fdSheet.getRange(28, 8).getValue()) || gunHesap.sebeke;
        var birimMal = sebeke > 0 ? d28Val / sebeke : 0;

        // Aylık K/L/M/P/Q satırına yaz
        fdSheet.getRange(fdSatir, 11).setValue(d28Val)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('D28 Toplam Maliyet\nTarih: ' + gun + '.' + ayKisa);
        fdSheet.getRange(fdSatir, 12).setValue(sebeke)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('0.000')
          .setNote('Şebeke Tüketim\nTarih: ' + gun + '.' + ayKisa);
        fdSheet.getRange(fdSatir, 13).setValue(birimMal)
          .setBackground('#FFF9C4').setFontWeight('bold').setNumberFormat('0.00000 "₺"')
          .setNote('Birim Maliyet (D28/H28)\nTarih: ' + gun + '.' + ayKisa);
        fdSheet.getRange(fdSatir, 16).setValue(uretim)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.000')
          .setNote('Kojen Üretim\nTarih: ' + gun + '.' + ayKisa);
        fdSheet.getRange(fdSatir, 17).setValue(uretim * 1300)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('P × 1300\nTarih: ' + gun + '.' + ayKisa);
        SpreadsheetApp.flush();
        Logger.log('  FD : OK D28=' + d28Val.toFixed(2) + ' Şebeke=' + sebeke.toFixed(3) + ' Üretim=' + uretim);
      } else {
        Logger.log('  FD : Sayfa yok, atlandı (' + fdAdi + ')');
      }
    } catch(e) { Logger.log('  FD : HATA ' + e.toString()); }

    return { basarili: true };

  } catch(e) {
    return { basarili: false, hata: e.toString() };
  }
}

// ─── SAATLIK HESAPLAMA ───────────────────────────────────────────────────────

/**
 * Belirli bir gün için BaglantiNoktalari + AMR_Saatlik + PiyasaFiyatlari +
 * Maliyet sayfalarını okuyarak tüm saatlik hesapları GAS tarafında yapar.
 *
 * @returns {{
 *   epias, teias, toplamMaliyet, sebeke, kojenAvantaj,
 *   saatlik: [{
 *     tahmin, gercek, fark, ptf, smf, pozDen, negDen,
 *     pozFark, negFark, bVal, cVal, dVal, eVal, fVal,
 *     epias, teias, kojenUretim, kojenBedel, sebekeMal
 *   }]
 * }}
 */
function _gocSaatlikHesapla(ss, gun, ay, yil, bagSonuc, amrSonuc) {
  var sonuc = { epias: 0, teias: 0, toplamMaliyet: 0, sebeke: 0, kojenAvantaj: 0, saatlik: [] };

  try {
    var ptfSheet = ss.getSheetByName(CFG_SAYFA_PIYASA);
    var malSheet = ss.getSheetByName(CFG_SAYFA_MALIYET);

    if (!ptfSheet) {
      Logger.log('  ⚠️ Eksik kaynak — PTF:' + !!ptfSheet);
      return sonuc;
    }

    // API'den gelen saatlik veriler — sayfa gecikmesi yok
    var saatlikTahmin     = (bagSonuc && bagSonuc.saatlikTahmin     && bagSonuc.saatlikTahmin.length     === 24) ? bagSonuc.saatlikTahmin     : null;
    var saatlikKojen      = (bagSonuc && bagSonuc.saatlikKojenUretim && bagSonuc.saatlikKojenUretim.length === 24) ? bagSonuc.saatlikKojenUretim : null;
    var saatlikAmr        = (amrSonuc && amrSonuc.saatlikMwh         && amrSonuc.saatlikMwh.length         === 24) ? amrSonuc.saatlikMwh         : null;

    // Sayfa referansları — fallback içi veya döngü içi her iki yerde lazım olduğu için dışarıda tanımla
    var bagSheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);
    var amrSheet = ss.getSheetByName(CFG_SAYFA_AMR_SAATLIK);

    // Fallback: API verisi yoksa sayfadan oku
    if (!saatlikTahmin || !saatlikAmr) {
      Logger.log('  ⚠️ API verisi eksik, sayfadan okunuyor...');
      saatlikTahmin = saatlikTahmin || [];
      saatlikKojen  = saatlikKojen  || [];
      saatlikAmr    = saatlikAmr    || [];
      if (bagSheet && bagSheet.getLastRow() >= 25) {
        var bagVerilerFallback = bagSheet.getRange(2, 1, 24, 7).getValues();
        for (var h = 0; h < 24; h++) {
          saatlikTahmin[h] = saatlikTahmin[h] || (parseFloat(bagVerilerFallback[h][6]) || 0);
          saatlikKojen[h]  = saatlikKojen[h]  || (parseFloat(bagVerilerFallback[h][5]) || 0);
        }
      }
      if (amrSheet && amrSheet.getLastRow() >= 25) {
        var amrVerilerFallback = amrSheet.getRange(2, 1, 24, 2).getValues();
        for (var h = 0; h < 24; h++) {
          saatlikAmr[h] = saatlikAmr[h] || (parseFloat(amrVerilerFallback[h][1]) || 0);
        }
      }
    }

    // Maliyet sayfasından o dönemin değerlerini oku
    var yekdem = 0, dagitim = 0, vtc = 0, kojenMaliyet = 0;
    if (malSheet && malSheet.getLastRow() >= 2) {
      var malVeriler = malSheet.getRange(2, 2, malSheet.getLastRow() - 1, 7).getValues();
      for (var m = 0; m < malVeriler.length; m++) {
        if (parseInt(malVeriler[m][0]) === ay && parseInt(malVeriler[m][1]) === yil) {
          kojenMaliyet = parseFloat(malVeriler[m][3]) || 0;
          yekdem       = parseFloat(malVeriler[m][4]) || 0;
          dagitim      = parseFloat(malVeriler[m][5]) || 0;
          vtc          = parseFloat(malVeriler[m][6]) || 0;
          break;
        }
      }
    }

    // PiyasaFiyatlari'nden bu günün saatlik PTF/SMF/PozDen/NegDen dizileri
    var ptfDizi = [], smfDizi = [], pozDizi = [], negDizi = [];
    for (var h = 0; h < 24; h++) { ptfDizi.push(0); smfDizi.push(0); pozDizi.push(0); negDizi.push(0); }

    if (ptfSheet.getLastRow() >= 2) {
      ptfSheet.getRange(2, 1, ptfSheet.getLastRow() - 1, 6).getValues().forEach(function(r) {
        var tarihObj = r[0], saatObj = r[1];
        var rAy, rYil, rGun, sHour;
        if (tarihObj instanceof Date) {
          rAy = tarihObj.getMonth() + 1; rYil = tarihObj.getFullYear(); rGun = tarihObj.getDate();
        } else {
          var p = String(tarihObj).split('.');
          if (p.length < 3) return;
          rGun = parseInt(p[0]); rAy = parseInt(p[1]); rYil = parseInt(p[2]);
        }
        if (rAy !== ay || rYil !== yil || rGun !== gun) return;
        sHour = (saatObj instanceof Date) ? saatObj.getHours() : parseInt(String(saatObj).split(':')[0]);
        if (isNaN(sHour) || sHour < 0 || sHour > 23) return;
        ptfDizi[sHour] = parseFloat(r[2]) || 0;
        smfDizi[sHour] = parseFloat(r[3]) || 0;
        pozDizi[sHour] = parseFloat(r[4]) || 0;
        negDizi[sHour] = parseFloat(r[5]) || 0;
      });
    }

    // Saatlik hesaplar
    for (var i = 0; i < 24; i++) {
      var tahmin      = saatlikTahmin[i] || 0;
      var kojenUretim = saatlikKojen[i]  || 0;
      var gercek      = saatlikAmr[i]    || 0;

      // İlk saat için tanı logu
      if (i === 0) {
        Logger.log('  [TANILAMA 00:00] tahmin=' + tahmin + ' gercek=' + gercek +
                   ' kojenUretim=' + kojenUretim +
                   ' ptf=' + ptfDizi[0] + ' smf=' + smfDizi[0] +
                   ' pozDen=' + pozDizi[0] + ' negDen=' + negDizi[0]);
      }

      var fark    = tahmin - gercek;
      var ptf     = ptfDizi[i], smf = smfDizi[i];
      var pozDen  = pozDizi[i], negDen = negDizi[i];
      var pozFark = pozDen - ptf;
      var negFark = negDen - ptf;

      // EPİAŞ = MUTLAK(EĞER(D>0; D*I; D*J))
      var epias = Math.abs(fark > 0 ? fark * pozFark : fark * negFark);

      // TEİAŞ — 16:00-22:00 arası (dahil) %15 sapma aşılırsa 0.04, diğer saatler 0
      var teias = 0;
      if (i >= 16 && i <= 22) {
        if (Math.abs(fark) > tahmin * 0.15) {
          teias = Math.abs(fark * Math.max(ptf, smf) * 0.04);
        }
      }

      // Faturalaşma sütunları
      var bVal = fark > 0 ? fark * pozDen : fark * negDen;   // Dengesizlik alış/satış = Fark × Den.Fiyatı
      var cVal = tahmin * ptf;                                // EPİAŞ = TAHMİN × PTF
      var dVal = gercek * (yekdem + dagitim + vtc);           // Dağıtım+YEKDEM
      var eVal = bVal > 0 ? bVal : 0;                        // Koruma
      var fVal = bVal < 0 ? bVal : 0;                        // VTC

      // Toplam fatura maliyeti bu saat için
      var satirMal    = epias + (gercek * ptf) + dVal;
      var kojenBedel  = kojenUretim * kojenMaliyet;
      var sebekeMal   = kojenUretim * (ptf + yekdem + dagitim + vtc);

      sonuc.epias         += epias;
      sonuc.teias         += teias;
      sonuc.toplamMaliyet += satirMal;
      sonuc.sebeke        += gercek;
      sonuc.kojenAvantaj  += (sebekeMal - kojenBedel);

      // Saatlik detayı sakla
      sonuc.saatlik.push({
        saat        : CFG_SAATLER_24[i],
        tahmin      : tahmin,
        gercek      : gercek,
        fark        : fark,
        ptf         : ptf,
        smf         : smf,
        pozDen      : pozDen,
        negDen      : negDen,
        pozFark     : pozFark,
        negFark     : negFark,
        bVal        : bVal,
        cVal        : cVal,
        dVal        : dVal,
        eVal        : eVal,
        fVal        : fVal,
        epias       : epias,
        teias       : teias,
        kojenUretim : kojenUretim,
        kojenBedel  : kojenBedel,
        sebekeMal   : sebekeMal,
        yekdem      : yekdem,
        dagitim     : dagitim,
        vtc         : vtc,
        kojenMaliyet: kojenMaliyet
      });
    }

  } catch(e) {
    Logger.log('  _gocSaatlikHesapla hata: ' + e.toString());
  }

  return sonuc;
}

// ─── WEB APP KÖPRÜSÜ — otomatikHesaplaAralik ─────────────────────────────────

/**
 * Web sayfasından gelen 'otomatikHesapla' action'ını karşılar.
 * GAS zaman aşımı (6 dk) nedeniyle çok uzun aralıklar reddedilir.
 *
 * @param {object} params  { baslangic: 'YYYY-MM-DD', bitis: 'YYYY-MM-DD' }
 * @returns {{ success, basarili, hatali, hatalar, sure }}
 */
function otomatikHesaplaAralik(params) {
  var baslangic = String(params.baslangic || '').trim();
  var bitis     = String(params.bitis     || '').trim();

  // Basit format doğrulama
  var isoRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRe.test(baslangic)) return { success: false, error: 'Geçersiz başlangıç tarihi: ' + baslangic };
  if (!isoRe.test(bitis))     return { success: false, error: 'Geçersiz bitiş tarihi: '     + bitis     };

  var bas = new Date(baslangic);
  var bit = new Date(bitis);

  if (isNaN(bas.getTime())) return { success: false, error: 'Başlangıç tarihi okunamadı.' };
  if (isNaN(bit.getTime())) return { success: false, error: 'Bitiş tarihi okunamadı.'     };
  if (bas > bit)            return { success: false, error: 'Başlangıç tarihi bitiş tarihinden sonra olamaz.' };

  // Gün sayısı kısıtlaması — GAS 6 dk zaman aşımı
  var gunFarki = Math.round((bit - bas) / 86400000) + 1;
  if (gunFarki > 60) return { success: false, error: 'En fazla 60 günlük aralık hesaplanabilir. Seçilen: ' + gunFarki + ' gün.' };

  var baslangicMs = Date.now();
  try {
    var sonuc = tumVerileriCekTarihAralik(baslangic, bitis);
    var sureSn = ((Date.now() - baslangicMs) / 1000).toFixed(1);
    return {
      success  : true,
      basarili : sonuc.basarili,
      hatali   : sonuc.hatali,
      hatalar  : sonuc.hatalar || [],
      gunSayisi: gunFarki,
      sure     : sureSn + ' sn',
      mesaj    : gunFarki + ' gün işlendi. Başarılı: ' + sonuc.basarili + ', Hatalı: ' + sonuc.hatali
    };
  } catch(e) {
    Logger.log('❌ otomatikHesaplaAralik: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ─── TEST FONKSİYONLARI ──────────────────────────────────────────────────────

/** Sadece dünkü veriyi çek ve işle */
function dunkuVerileriCekTest() {
  var dun = cfgDunTarihi();
  return gunlukVerileriCek(cfgIsoDate(dun), dun.getDate(), dun.getMonth() + 1, dun.getFullYear());
}

/** Belirli bir gün için test — tarihi değiştirin */
function tekGunTest() {
  var iso = '2026-08-01';  // ← değiştirin
  var d   = new Date(iso);
  return gunlukVerileriCek(iso, d.getDate(), d.getMonth() + 1, d.getFullYear());
}

/** Belirli bir tarih aralığı için test */
function tarihAraligiTest() {
  return tumVerileriCekTarihAralik('2026-07-01', '2026-07-07');  // ← değiştirin
}

// ─── WEB APP GİRİŞ NOKTASI (06_KojenMaliyetBedeli.gs'ten taşındı) ───────────

function doGet(e) {
  var params   = (e && e.parameter) ? e.parameter : {};
  var action   = String(params.action || '');
  var callback = String(params.callback || '');

  var sonuc;
  if      (action === 'maliyetBedeliKaydet')  sonuc = maliyetBedeliKaydet(params);
  else if (action === 'maliyetBedeliOku')     sonuc = maliyetBedeliOku(parseInt(params.ay||'0',10), parseInt(params.yil||'0',10));
  else if (action === 'maliyetBedeliListesi') sonuc = maliyetBedeliListesi();
  else if (action === 'getRaporData')         sonuc = getRaporData(params);
  else if (action === 'getBaglantiNoktalari') sonuc = getBaglantiNoktalari(params);
  else if (action === 'excelIndir')           sonuc = excelIndir(params);
  else if (action === 'otomatikHesapla')      sonuc = otomatikHesaplaAralik(params);
  else                                        sonuc = { success: false, error: 'Bilinmeyen action: ' + action };

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(sonuc) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return _jsonCevap(sonuc);
}

function doPost(e) { return doGet(e); }

// ─── MALİYET KAYDET ──────────────────────────────────────────────────────────

function maliyetBedeliKaydet(params) {
  try {
    var ay           = parseInt(params.ay  || '0', 10);
    var yil          = parseInt(params.yil || '0', 10);
    var kojenMaliyet = _mbFloat(params.kojenMaliyet);
    var yekdem       = _mbFloat(params.yekdem);
    var dagitim      = _mbFloat(params.dagitim);
    var vtcGider     = _mbFloat(params.vtcGider);
    var gucBedeli    = _mbFloat(params.gucBedeli);
    var not_         = String(params.not || '').trim();
    var kullanici    = String(params.kaydedenKullanici || 'sistem').trim();

    if (!ay  || ay  < 1 || ay  > 12)       return { success: false, error: 'Geçersiz ay: '  + ay  };
    if (!yil || yil < 2020 || yil > 2100)  return { success: false, error: 'Geçersiz yıl: ' + yil };

    var ss       = cfgSsAc();
    var sheet    = _mbGetOrCreateMaliyetSheet(ss);
    var logSheet = _mbGetOrCreateLogSheet(ss);
    var donem    = (CFG_AYLAR_UZUN[ay] || ay) + ' ' + yil;
    var kayitZamani = _mbSimdi();

    var sonSatir   = sheet.getLastRow();
    var hedefSatir = _mbDonemSatiriBul(sheet, ay, yil, sonSatir);
    var islem      = hedefSatir > 0 ? 'GÜNCELLEME' : 'YENİ';

    var eskiKojenMaliyet = '', eskiGucBedeli = '';
    if (hedefSatir > 0) {
      eskiKojenMaliyet = sheet.getRange(hedefSatir, 5).getValue();
      if (sheet.getLastColumn() >= 11) eskiGucBedeli = sheet.getRange(hedefSatir, 11).getValue();
    }

    var satirVerisi = [kayitZamani, ay, yil, donem, kojenMaliyet, yekdem, dagitim, vtcGider, not_, kullanici, gucBedeli];
    if (hedefSatir > 0) {
      sheet.getRange(hedefSatir, 1, 1, 11).setValues([satirVerisi]);
    } else {
      hedefSatir = sheet.getLastRow() + 1;
      sheet.getRange(hedefSatir, 1, 1, 11).setValues([satirVerisi]);
    }
    _mbMaliyetSatiriBicimlendir(sheet, hedefSatir);

    var logVerisi = [kayitZamani, islem].concat(satirVerisi).concat([eskiKojenMaliyet, eskiGucBedeli]);
    var logSatir  = logSheet.getLastRow() + 1;
    logSheet.getRange(logSatir, 1, 1, logVerisi.length).setValues([logVerisi]);
    _mbLogSatiriBicimlendir(logSheet, logSatir, islem);

    SpreadsheetApp.flush();
    Logger.log('✅ Maliyet kaydedildi: ' + donem + ' (' + islem + ')');
    return { success: true, message: donem + ' kaydedildi.', donem: donem, islem: islem, satir: hedefSatir, kojenMaliyet: kojenMaliyet, gucBedeli: gucBedeli };
  } catch(e) {
    Logger.log('❌ maliyetBedeliKaydet: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ─── MALİYET OKU ─────────────────────────────────────────────────────────────

function maliyetBedeliOku(ay, yil) {
  try {
    var ss    = cfgSsAc();
    var sheet = ss.getSheetByName(CFG_SAYFA_MALIYET);
    if (!sheet || sheet.getLastRow() < 2) return null;
    var hedef = _mbDonemSatiriBul(sheet, ay, yil, sheet.getLastRow());
    if (!hedef) return null;
    var mevSutun = Math.min(sheet.getLastColumn(), 11);
    var r = sheet.getRange(hedef, 1, 1, mevSutun).getValues()[0];
    while (r.length < 11) r.push(0);
    return _mbSatiriNesneye(r);
  } catch(e) {
    Logger.log('❌ maliyetBedeliOku: ' + e.toString());
    return null;
  }
}

function maliyetBedeliListesi() {
  try {
    var ss    = cfgSsAc();
    var sheet = ss.getSheetByName(CFG_SAYFA_MALIYET);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var mevSutun = Math.min(sheet.getLastColumn(), 11);
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, mevSutun).getValues()
      .filter(function(r) { return r[1]; })
      .map(function(r) {
        while (r.length < 11) r.push(0);
        return _mbSatiriNesneye(r);
      });
  } catch(e) {
    Logger.log('❌ maliyetBedeliListesi: ' + e.toString());
    return [];
  }
}

// ─── RAPOR VERİSİ ────────────────────────────────────────────────────────────

function getRaporData(params) {
  try {
    var ay  = parseInt(params.month || params.ay  || new Date().getMonth() + 1, 10);
    var yil = parseInt(params.year  || params.yil || new Date().getFullYear(),  10);
    var ss  = cfgSsAc();
    var maliyet = maliyetBedeliOku(ay, yil) || {};

    var fdSheet = ss.getSheetByName(CFG_PREF_FATURA      + yil + '_' + cfgPad2(ay));
    var dmSheet = ss.getSheetByName(CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay));
    var kcSheet = ss.getSheetByName(CFG_PREF_KOJEN_CALISMA + yil + '_' + cfgPad2(ay));

    var gunSayisi = new Date(yil, ay, 0).getDate();
    var aylikGunler = [], topAvantaj = 0, topSebekeMal = 0, topKojenUretim = 0, topKojenMal = 0;
    var topEpias = 0, topTeias = 0, dengesizlikAylik = [];

    for (var g = 1; g <= gunSayisi; g++) {
      var fdSatir = g + 1, dmSatir = g + 2, kcSatir = g + 2;
      var toplamMal = 0, sebeke = 0, birimMal = 0, kojenUretim = 0, kojenMal = 0, epias = 0, teias = 0, avantaj = 0;

      if (fdSheet && fdSheet.getLastRow() >= fdSatir) {
        var fdRow = fdSheet.getRange(fdSatir, 11, 1, 7).getValues()[0];
        toplamMal   = parseFloat(fdRow[0]) || 0;
        sebeke      = parseFloat(fdRow[1]) || 0;
        birimMal    = parseFloat(fdRow[2]) || 0;
        kojenUretim = parseFloat(fdRow[5]) || 0;
        kojenMal    = parseFloat(fdRow[6]) || 0;
      }
      if (dmSheet && dmSheet.getLastRow() >= dmSatir) {
        var dmRow = dmSheet.getRange(dmSatir, 16, 1, 3).getValues()[0];
        epias = parseFloat(dmRow[0]) || 0;
        teias = parseFloat(dmRow[1]) || 0;
      }
      if (kcSheet && kcSheet.getLastRow() >= kcSatir) {
        avantaj = parseFloat(kcSheet.getRange(kcSatir, 9).getValue()) || 0;
      }

      if (toplamMal || kojenUretim || epias || avantaj || sebeke) {
        var tarih = cfgPad2(g) + '.' + cfgPad2(ay) + '.' + yil;
        aylikGunler.push({ tarih: tarih, avantaj: avantaj, sebekeMal: toplamMal, birimMal: birimMal, kojenUretim: kojenUretim, kojenMal: kojenMal, dengesizlik: epias + teias, sebeke: sebeke });
        topAvantaj     += avantaj;
        topSebekeMal   += toplamMal;
        topKojenUretim += kojenUretim;
        topKojenMal    += kojenMal;
      }
      if (epias || teias) {
        dengesizlikAylik.push({ tarih: cfgPad2(g) + '.' + cfgPad2(ay) + '.' + yil, epias: epias, teias: teias });
        topEpias += epias; topTeias += teias;
      }
    }

    var faturasSaatlik = [], faturasToplam = 0, faturasSebeke = 0;
    if (fdSheet && fdSheet.getLastRow() >= 26) {
      for (var h = 0; h < 24; h++) {
        var fRow = fdSheet.getRange(h + 2, 1, 1, 8).getValues()[0];
        faturasSaatlik.push({
          saat: String(fRow[0]).trim() || cfgPad2(h) + ':00:00',
          dengesizlik: parseFloat(fRow[1]) || 0, epias: parseFloat(fRow[2]) || 0,
          dagitim    : parseFloat(fRow[3]) || 0, koruma: parseFloat(fRow[4]) || 0,
          vtc        : parseFloat(fRow[5]) || 0, tahmin: parseFloat(fRow[6]) || 0,
          gercek     : parseFloat(fRow[7]) || 0
        });
        faturasToplam += (parseFloat(fRow[2])||0) + (parseFloat(fRow[3])||0) + Math.max(0, parseFloat(fRow[4])||0);
        faturasSebeke += parseFloat(fRow[7]) || 0;
      }
    }

    // Aylık şebeke ve kojen üretim toplamları — günlük verilerden hesapla
    var toplamUretim = 0, toplamSebeke = 0;
    for (var sg = 0; sg < aylikGunler.length; sg++) {
      toplamSebeke += (aylikGunler[sg].sebeke      || 0);
      toplamUretim += (aylikGunler[sg].kojenUretim || 0);
    }
    var karsilama = toplamSebeke > 0 ? toplamUretim / toplamSebeke * 100 : 0;

    return {
      success: true,
      data: {
        maliyet: { kojenMaliyet: maliyet.kojenMaliyet||0, yekdem: maliyet.yekdem||0, dagitim: maliyet.dagitim||0, vtcGider: maliyet.vtcGider||0, birimMaliyet: maliyet.kojenMaliyet||0, net: maliyet.kojenMaliyet||0 },
        avantaj: { toplam: topAvantaj, gunSayisi: aylikGunler.length, gunluk: aylikGunler.map(function(g) { return { tarih: g.tarih, avantaj: g.avantaj }; }) },
        dengesizlik: { epiasToplam: topEpias, teiasToplam: topTeias, aylik: dengesizlikAylik },
        fatura: { toplam: topSebekeMal, sebekeMwh: toplamSebeke, saatlik: faturasSaatlik },
        baglanti: { toplamUretim: toplamUretim, toplamSebeke: toplamSebeke, karsilama: toplamSebeke > 0 ? toplamUretim / toplamSebeke * 100 : 0 },
        motorlar: { gm1: {}, gm2: {}, gm3: {} },
        aylikOzet: { gunluk: aylikGunler }
      }
    };
  } catch(e) {
    Logger.log('❌ getRaporData: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

function getBaglantiNoktalari(params) {
  try {
    var ss    = cfgSsAc();
    var sheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);
    if (!sheet || sheet.getLastRow() < 25) return { success: true, data: [] };
    var rows = [];
    for (var i = 0; i < 24; i++) {
      var r = sheet.getRange(i + 2, 1, 1, 7).getValues()[0];
      rows.push({ saat: String(r[0]).trim(), tuketim: parseFloat(r[1])||0, gm1: parseFloat(r[2])||0, gm2: parseFloat(r[3])||0, gm3: parseFloat(r[4])||0, kojenTop: parseFloat(r[5])||0, sebeke: parseFloat(r[6])||0 });
    }
    return { success: true, data: rows };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// ─── SAYFA KURULUMU ──────────────────────────────────────────────────────────

function _mbGetOrCreateMaliyetSheet(ss) {
  var sheet = ss.getSheetByName(CFG_SAYFA_MALIYET);
  if (sheet) {
    if (sheet.getLastColumn() < 11) {
      sheet.getRange(1, 11).setValue('Güç Bedeli (TL/MWh)')
        .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold')
        .setHorizontalAlignment('center').setVerticalAlignment('middle');
      sheet.setColumnWidth(11, 140);
    }
    return sheet;
  }
  sheet = ss.insertSheet(CFG_SAYFA_MALIYET);
  var basliklar = ['Kayıt Tarihi','Ay','Yıl','Dönem','Kojen Maliyet (TL/MWh)','YEKDEM (TL/MWh)','Dağıtım (TL/MWh)','VTC Gider (TL/MWh)','Not','Kaydeden','Güç Bedeli (TL/MWh)'];
  cfgYazBaslik(sheet, 1, basliklar, '#1e3a5f');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
  [130,50,60,120,155,120,120,120,200,130,140].forEach(function(w,i){ sheet.setColumnWidth(i+1,w); });
  return sheet;
}

function _mbGetOrCreateLogSheet(ss) {
  var sheet = ss.getSheetByName(CFG_SAYFA_MALIYET_LOG);
  if (sheet) {
    var mc = sheet.getLastColumn();
    if (mc < 13) sheet.getRange(1,13).setValue('Eski Kojen Maliyet').setBackground('#4a1942').setFontColor('#FFFFFF').setFontWeight('bold');
    if (mc < 14) sheet.getRange(1,14).setValue('Eski Güç Bedeli').setBackground('#4a1942').setFontColor('#FFFFFF').setFontWeight('bold');
    return sheet;
  }
  sheet = ss.insertSheet(CFG_SAYFA_MALIYET_LOG);
  var basliklar = ['Log Tarihi','İşlem','Kayıt Tarihi','Ay','Yıl','Dönem','Kojen Maliyet (TL/MWh)','YEKDEM (TL/MWh)','Dağıtım (TL/MWh)','VTC Gider (TL/MWh)','Not','Kaydeden','Güç Bedeli (TL/MWh)','Eski Kojen Maliyet','Eski Güç Bedeli'];
  cfgYazBaslik(sheet, 1, basliklar, '#4a1942');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 130); sheet.setColumnWidth(2, 110);
  return sheet;
}

function _mbMaliyetSatiriBicimlendir(sheet, satirNo) {
  sheet.getRange(satirNo, 1, 1, 11).setBackground(satirNo % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
  sheet.getRange(satirNo, 1).setNumberFormat('@');
  sheet.getRange(satirNo, 2, 1, 2).setNumberFormat('0');
}

function _mbLogSatiriBicimlendir(sheet, satirNo, islem) {
  sheet.getRange(satirNo, 1, 1, 14).setBackground(islem === 'YENİ' ? '#f0fff4' : '#fff8e1');
  sheet.getRange(satirNo, 2).setFontWeight('bold');
}

function _mbDonemSatiriBul(sheet, ay, yil, sonSatir) {
  if (sonSatir < 2) return 0;
  var ayDeger  = sheet.getRange(2, 2, sonSatir - 1, 1).getValues();
  var yilDeger = sheet.getRange(2, 3, sonSatir - 1, 1).getValues();
  for (var i = 0; i < ayDeger.length; i++) {
    if (parseInt(ayDeger[i][0],10) === ay && parseInt(yilDeger[i][0],10) === yil) return i + 2;
  }
  return 0;
}

function _mbSatiriNesneye(r) {
  return { kayitTarihi: r[0], ay: r[1], yil: r[2], donem: r[3], kojenMaliyet: r[4], yekdem: r[5], dagitim: r[6], vtcGider: r[7], not: r[8], kaydeden: r[9], gucBedeli: r[10] || 0 };
}

function _mbFloat(v) {
  if (v === null || v === undefined || v === '') return 0;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function _mbSimdi() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
}

function _jsonCevap(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
