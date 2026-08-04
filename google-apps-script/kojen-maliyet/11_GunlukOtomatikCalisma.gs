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
    .timeBased().everyDays(1).atHour(10).nearMinute(30)
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

    Utilities.sleep(500); // GAS kota koruması
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
    try {
      var bagSonuc = baglantiTarihCek(isoTarih);
      Logger.log('  BAG: ' + (bagSonuc.success ? 'OK ' + bagSonuc.assetSayisi + ' asset' : 'HATA ' + bagSonuc.error));
    } catch(e) { Logger.log('  BAG: HATA ' + e.toString()); }

    // ── 2. AMR Gerçek Tüketim ────────────────────────────────────────────────
    try {
      var amrSonuc = amrTarihCek(isoTarih);
      Logger.log('  AMR: ' + (amrSonuc.success ? 'OK ' + amrSonuc.kayitSayisi + ' kayıt' : 'HATA ' + amrSonuc.error));
    } catch(e) { Logger.log('  AMR: HATA ' + e.toString()); }

    // ── 3. PTF/SMF Piyasa Fiyatları ──────────────────────────────────────────
    try {
      var ptfSonuc = ptfTarihCek(isoTarih);
      Logger.log('  PTF: ' + (ptfSonuc.success ? 'OK ' + ptfSonuc.kayitSayisi + ' kayıt' : 'HATA ' + ptfSonuc.error));
    } catch(e) { Logger.log('  PTF: HATA ' + e.toString()); }

    // ── 4. Saatlik hesaplama (GAS tarafında) ─────────────────────────────────
    var ss        = cfgSsAc();
    var gunHesap  = _gocSaatlikHesapla(ss, gun, ay, yil);
    Logger.log('  HESAP: EPIAS=' + gunHesap.epias.toFixed(2) +
               ' TEIAS=' + gunHesap.teias.toFixed(2) +
               ' TopMaliyet=' + gunHesap.toplamMaliyet.toFixed(2) +
               ' KojenAv=' + gunHesap.kojenAvantaj.toFixed(2));

    // ── 5. Aylık tablolara bu günün sabit değerlerini yaz ────────────────────
    var ayKisa = CFG_AYLAR_KISA[ay] || ay;

    // KojenCalisma
    try {
      var kcAdi   = CFG_PREF_KOJEN_CALISMA + yil + '_' + cfgPad2(ay);
      var kcSheet = ss.getSheetByName(kcAdi);
      if (!kcSheet && ayinIlkGunu) {
        kojenCalismaSayfasiOlustur(ay, yil, gun);
        kcSheet = ss.getSheetByName(kcAdi);
      }
      if (kcSheet) {
        kcSheet.getRange(gun + 2, 9)
          .setValue(gunHesap.kojenAvantaj)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('Kojen Avantaj (sabit)\nTarih: ' + gun + '.' + ayKisa + '\nDeğer: ' + gunHesap.kojenAvantaj.toFixed(2));
        SpreadsheetApp.flush();
        Logger.log('  KC : OK Avantaj=' + gunHesap.kojenAvantaj.toFixed(2));
      } else {
        Logger.log('  KC : Sayfa yok, atlandı (' + kcAdi + ')');
      }
    } catch(e) { Logger.log('  KC : HATA ' + e.toString()); }

    // DengesizlikMaliyet
    try {
      var dmAdi   = CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay);
      var dmSheet = ss.getSheetByName(dmAdi);
      if (!dmSheet) {
        dengesizlikMaliyetSayfasiOlustur(ay, yil, gun);
        dmSheet = ss.getSheetByName(dmAdi);
      }
      if (dmSheet) {
        var dmSatir = gun + 2;
        dmSheet.getRange(dmSatir, 16).setValue(gunHesap.epias)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('EPİAŞ (sabit)\nTarih: ' + gun + '.' + ayKisa);
        dmSheet.getRange(dmSatir, 17).setValue(gunHesap.teias)
          .setBackground('#EBF8EE').setNumberFormat('#,##0.00 "₺"')
          .setNote('TEİAŞ (sabit)\nTarih: ' + gun + '.' + ayKisa);
        dmSheet.getRange(dmSatir, 18).setValue(gunHesap.epias + gunHesap.teias)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('EPİAŞ + TEİAŞ\nTarih: ' + gun + '.' + ayKisa);
        SpreadsheetApp.flush();
        Logger.log('  DM : OK EPİAŞ=' + gunHesap.epias.toFixed(2) + ' TEİAŞ=' + gunHesap.teias.toFixed(2));
      } else {
        Logger.log('  DM : Sayfa yok, atlandı (' + dmAdi + ')');
      }
    } catch(e) { Logger.log('  DM : HATA ' + e.toString()); }

    // Faturalasma
    try {
      var fdAdi   = CFG_PREF_FATURA + yil + '_' + cfgPad2(ay);
      var fdSheet = ss.getSheetByName(fdAdi);
      if (!fdSheet) {
        faturaDetaySayfasiOlustur(ay, yil, gun);
        fdSheet = ss.getSheetByName(fdAdi);
      }
      if (fdSheet) {
        var fdSatir = gun + 1;
        var uretim  = yillikToplamUretimCek(gun, ay, yil);

        // D28 değerini hesapla — Faturalaşma sayfasındaki günlük toplam maliyet
        // Excel: =11293 + D26 + E26 + G26 + DM!X35 - F26
        // Bizim: maliyetK2 + C26(EPİAŞ) + D26(Dağıtım) + F26(VTC) + DM!Toplam - E26(Koruma)
        var d28Val = 0;
        try {
          SpreadsheetApp.flush();
          var malSheet2  = ss.getSheetByName(CFG_SAYFA_MALIYET);
          var maliyetK2  = malSheet2 ? (parseFloat(malSheet2.getRange(2, 11).getValue()) || 0) : 0;
          var c26epias   = parseFloat(fdSheet.getRange(26, 3).getValue()) || 0;
          var d26dagitim = parseFloat(fdSheet.getRange(26, 4).getValue()) || 0;
          var e26koruma  = parseFloat(fdSheet.getRange(26, 5).getValue()) || 0;
          var f26vtc     = parseFloat(fdSheet.getRange(26, 6).getValue()) || 0;
          var dmAdi2     = CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay);
          var dmSheet2   = ss.getSheetByName(dmAdi2);
          var dmTopSatir = new Date(yil, ay, 0).getDate() + 3;
          var dmToplam   = dmSheet2 && dmSheet2.getLastRow() >= dmTopSatir
            ? (parseFloat(dmSheet2.getRange(dmTopSatir, 18).getValue()) || 0) : 0;
          d28Val = maliyetK2 + c26epias + d26dagitim + f26vtc + dmToplam - e26koruma;
        } catch(e2) {
          Logger.log('  FD D28 hesap hatası: ' + e2.toString());
          d28Val = gunHesap.toplamMaliyet; // fallback
        }

        var sebeke   = parseFloat(fdSheet.getRange(26, 8).getValue()) || gunHesap.sebeke;
        var birimMal = sebeke > 0 ? d28Val / sebeke : 0;

        // K: D28 değeri — o günün toplam maliyet
        fdSheet.getRange(fdSatir, 11).setValue(d28Val)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('D28 Toplam Maliyet\nTarih: ' + gun + '.' + ayKisa);
        fdSheet.getRange(fdSatir, 12).setValue(sebeke)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('0.000')
          .setNote('Şebeke Tüketim (sabit)\nTarih: ' + gun + '.' + ayKisa);
        fdSheet.getRange(fdSatir, 13).setValue(birimMal)
          .setBackground('#FFF9C4').setFontWeight('bold').setNumberFormat('0.00000 "₺"')
          .setNote('Birim Maliyet (D28/H26)\nTarih: ' + gun + '.' + ayKisa);
        fdSheet.getRange(fdSatir, 16).setValue(uretim)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.000')
          .setNote('Kojen Üretim\nTarih: ' + gun + '.' + ayKisa);
        fdSheet.getRange(fdSatir, 17).setValue(uretim * 1300)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
          .setNote('P × 1300\nTarih: ' + gun + '.' + ayKisa);
        SpreadsheetApp.flush();
        Logger.log('  FD : OK D28=' + d28Val.toFixed(2) + ' Şebeke=' + sebeke.toFixed(3) + ' Üretim=' + uretim + ' MWh');
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
 * @returns {{ epias, teias, toplamMaliyet, sebeke, kojenAvantaj }}
 */
function _gocSaatlikHesapla(ss, gun, ay, yil) {
  var sonuc = { epias: 0, teias: 0, toplamMaliyet: 0, sebeke: 0, kojenAvantaj: 0 };

  try {
    var bagSheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);
    var amrSheet = ss.getSheetByName(CFG_SAYFA_AMR_SAATLIK);
    var ptfSheet = ss.getSheetByName(CFG_SAYFA_PIYASA);
    var malSheet = ss.getSheetByName(CFG_SAYFA_MALIYET);

    if (!bagSheet || !amrSheet || !ptfSheet) {
      Logger.log('  ⚠️ Eksik kaynak — BAG:' + !!bagSheet + ' AMR:' + !!amrSheet + ' PTF:' + !!ptfSheet);
      return sonuc;
    }

    // Maliyet sayfasından o dönemin değerlerini oku
    var yekdem = 0, dagitim = 0, vtc = 0, kojenMaliyet = 0;
    if (malSheet && malSheet.getLastRow() >= 2) {
      var malVeriler = malSheet.getRange(2, 2, malSheet.getLastRow() - 1, 7).getValues();
      for (var m = 0; m < malVeriler.length; m++) {
        if (parseInt(malVeriler[m][0]) === ay && parseInt(malVeriler[m][1]) === yil) {
          kojenMaliyet = parseFloat(malVeriler[m][3]) || 0; // E sütunu (B offset 3)
          yekdem       = parseFloat(malVeriler[m][4]) || 0; // F
          dagitim      = parseFloat(malVeriler[m][5]) || 0; // G
          vtc          = parseFloat(malVeriler[m][6]) || 0; // H
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
        if (rAy !== ay || rYil !== yil || rGun !== gun) return; // sadece bu günün verisi

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
      var bagRow = i + 2, amrRow = i + 2;

      // Tahmin: BaglantiNoktalari G = Şebeke Hattı Tüketimi (MWh)
      var tahmin = (bagSheet.getLastRow() >= bagRow)
        ? (parseFloat(bagSheet.getRange(bagRow, 7).getValue()) || 0) : 0;

      // Gerçek: AMR_Saatlik B (MWh)
      var gercek = (amrSheet.getLastRow() >= amrRow)
        ? (parseFloat(amrSheet.getRange(amrRow, 2).getValue()) || 0) : 0;

      var fark    = tahmin - gercek;  // TAHMİN - GERÇEK
      var ptf     = ptfDizi[i], smf = smfDizi[i];
      var pozFark = pozDizi[i] - ptf;  // PozDen - PTF
      var negFark = negDizi[i] - ptf;  // NegDen - PTF

      // EPİAŞ dengesizlik maliyeti = MUTLAK(EĞER(D>0; D*I; D*J))
      var epias = Math.abs(fark > 0 ? fark * pozFark : fark * negFark);

      // TEİAŞ — 16:00-21:00 arası 0.04, diğer saatler 0
      var teias = 0;
      if (i >= 16 && i <= 21) {
        if (Math.abs(fark) > tahmin * 0.15) {
          teias = Math.abs(fark * Math.max(ptf, smf) * 0.04);
        }
      }
      // diğer saatler: 0.08 * 0 = 0

      // Toplam fatura maliyeti bu saat için
      var dagYek   = gercek * (yekdem + dagitim + vtc);
      var satirMal = epias + (gercek * ptf) + dagYek;

      // Kojen avantajı: şebeke maliyeti − kojen bedeli
      var kojenUretim = (bagSheet.getLastRow() >= bagRow)
        ? (parseFloat(bagSheet.getRange(bagRow, 6).getValue()) || 0) : 0;
      var kojenBedel  = kojenUretim * kojenMaliyet;
      var sebekeMal   = kojenUretim * (ptf + yekdem + dagitim + vtc);

      sonuc.epias         += epias;
      sonuc.teias         += teias;
      sonuc.toplamMaliyet += satirMal;
      sonuc.sebeke        += gercek;
      sonuc.kojenAvantaj  += (sebekeMal - kojenBedel);
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
