/**
 * GunlukOtomatikCalisma.gs
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * 01/07/2026'dan baÅŸlayarak bugÃ¼ne kadar her gÃ¼n iÃ§in tÃ¼m verileri Ã§ekip
 * ilgili sayfalara kaydeder.
 *
 * Her gÃ¼n iÃ§in Ã§alÄ±ÅŸma sÄ±rasÄ±:
 *   1. PTF/SMF Piyasa FiyatlarÄ±       â†’ PiyasaFiyatlari sayfasÄ±
 *   2. AMR GerÃ§ek TÃ¼ketim             â†’ AMR_YYYYMMDD sayfasÄ±
 *   3. VGen BaÄŸlantÄ± NoktalarÄ±        â†’ BaglantiNoktalari sayfasÄ±
 *   4. Kojen Ã‡alÄ±ÅŸma SayfasÄ±          â†’ KojenCalisma_YYYY_MM sayfasÄ±
 *   5. Dengesizlik Maliyet SayfasÄ±    â†’ DengesizlikMaliyet_YYYY_MM sayfasÄ±
 *   6. FaturalaÅŸma SayfasÄ±            â†’ Faturalasma_YYYY_MM sayfasÄ±
 *
 * KullanÄ±m:
 *   tumVerileriCek()                  â†’ 01/07/2026'dan bugÃ¼ne kadar
 *   tumVerileriCekTarihAralik('2026-07-01', '2026-07-31') â†’ belirli aralÄ±k
 */

// â”€â”€â”€ SABÄ°T â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

var BASLANGIC_TARIHI = '2026-07-01';

// â”€â”€â”€ ANA FONKSÄ°YONLAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * 01/07/2026'dan dÃ¼nkÃ¼ tarihe kadar tÃ¼m verileri Ã§eker.
 * Trigger ile her gÃ¼n Ã§alÄ±ÅŸtÄ±rÄ±labilir.
 */
function tumVerileriCek() {
  var baslangic = new Date(BASLANGIC_TARIHI);
  var bitis     = new Date();
  bitis.setDate(bitis.getDate() - 1); // dÃ¼n
  bitis = new Date(bitis.getFullYear(), bitis.getMonth(), bitis.getDate());

  return tumVerileriCekTarihAralik(
    gocIsoDate(baslangic),
    gocIsoDate(bitis)
  );
}

/**
 * Belirtilen tarih aralÄ±ÄŸÄ± iÃ§in tÃ¼m verileri Ã§eker.
 * @param {string} baslangicIso  'YYYY-MM-DD'
 * @param {string} bitisIso      'YYYY-MM-DD'
 */
function tumVerileriCekTarihAralik(baslangicIso, bitisIso) {
  Logger.log('ğŸš€ Toplu veri Ã§ekme baÅŸlÄ±yor: ' + baslangicIso + ' â†’ ' + bitisIso);

  var bas   = new Date(baslangicIso);
  var bit   = new Date(bitisIso);
  var sonuc = { basarili: 0, hatali: 0, hatalar: [] };

  for (var d = new Date(bas); d <= bit; d.setDate(d.getDate() + 1)) {
    var isoTarih = gocIsoDate(d);
    var gun      = d.getDate();
    var ay       = d.getMonth() + 1;
    var yil      = d.getFullYear();

    Logger.log('â”€â”€â”€ ' + isoTarih + ' iÅŸleniyor...');

    var gunSonuc = gunlukVerileriCek(isoTarih, gun, ay, yil);

    if (gunSonuc.basarili) {
      sonuc.basarili++;
      Logger.log('âœ… ' + isoTarih + ' tamamlandÄ±.');
    } else {
      sonuc.hatali++;
      sonuc.hatalar.push({ tarih: isoTarih, hata: gunSonuc.hata });
      Logger.log('âŒ ' + isoTarih + ' hata: ' + gunSonuc.hata);
    }

    // GAS zaman aÅŸÄ±mÄ±nÄ± Ã¶nlemek iÃ§in kÄ±sa bekleme
    Utilities.sleep(500);
  }

  Logger.log('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
  Logger.log('âœ… BaÅŸarÄ±lÄ±: ' + sonuc.basarili + ' gÃ¼n');
  Logger.log('âŒ HatalÄ±  : ' + sonuc.hatali + ' gÃ¼n');
  if (sonuc.hatalar.length > 0) {
    Logger.log('Hatalar: ' + JSON.stringify(sonuc.hatalar, null, 2));
  }

  return sonuc;
}

/**
 * Tek bir gÃ¼n iÃ§in tÃ¼m verileri sÄ±rayla Ã§eker ve kaydeder.
 * AkÄ±ÅŸ: Veri Ã§ek â†’ Saatlik hesapla â†’ Sabit deÄŸer kaydet â†’ AylÄ±k tabloya yaz
 */
function gunlukVerileriCek(isoTarih, gun, ay, yil) {
  try {
    var ayinIlkGunu = (gun === 1);

    // â”€â”€ 1. PTF/SMF Piyasa FiyatlarÄ± â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      var ptfSonuc = ptfTarihCek(isoTarih);
      Logger.log('  PTF: ' + (ptfSonuc.success ? 'âœ… ' + ptfSonuc.kayitSayisi + ' kayÄ±t' : 'âŒ ' + ptfSonuc.error));
    } catch(e) { Logger.log('  PTF: âŒ ' + e.toString()); }

    // â”€â”€ 2. AMR GerÃ§ek TÃ¼ketim â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      var amrSonuc = amrTarihCek(isoTarih);
      Logger.log('  AMR: ' + (amrSonuc.success ? 'âœ… ' + amrSonuc.kayitSayisi + ' kayÄ±t' : 'âŒ ' + amrSonuc.error));
    } catch(e) { Logger.log('  AMR: âŒ ' + e.toString()); }

    // â”€â”€ 3. VGen BaÄŸlantÄ± NoktalarÄ± â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      var bagSonuc = vgenBaglantiVerisiniCekTarih(isoTarih);
      Logger.log('  BAG: ' + (bagSonuc.success ? 'âœ… ' + bagSonuc.assetSayisi + ' asset' : 'âŒ ' + bagSonuc.error));
    } catch(e) { Logger.log('  BAG: âŒ ' + e.toString()); }

    // Veriler gÃ¼ncellendi â€” ÅŸimdi hesapla
    var ss = SpreadsheetApp.openById('1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY');

    // â”€â”€ 4. O gÃ¼nÃ¼n saatlik verilerini hesapla ve SABIT DEÄER kaydet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var gunlukHesap = gunlukSaatlikHesapla(ss, isoTarih, gun, ay, yil);
    Logger.log('  HESAP: âœ… EPÄ°AÅ=' + gunlukHesap.epias.toFixed(2) +
               ' TEÄ°AÅ=' + gunlukHesap.teias.toFixed(2) +
               ' ToplamMaliyet=' + gunlukHesap.toplamMaliyet.toFixed(2));

    // â”€â”€ 5. AylÄ±k tablolara bu gÃ¼nÃ¼n sabit deÄŸerlerini yaz â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // KojenCalisma
    try {
      var kcSayfaAdi = KC_SHEET_PREFIX + yil + '_' + kcPad2(ay);
      var kcSheet    = ss.getSheetByName(kcSayfaAdi);
      if (!kcSheet && ayinIlkGunu) {
        kojenCalismaSayfasiOlustur(ay, yil);
        kcSheet = ss.getSheetByName(kcSayfaAdi);
      }
      if (kcSheet) {
        var kcSatir = gun + 2;
        var ayKisa  = ['','Oca','Åub','Mar','Nis','May','Haz','Tem','AÄŸu','Eyl','Eki','Kas','Ara'][ay];
        kcSheet.getRange(kcSatir, 9)
          .setValue(gunlukHesap.kojenAvantaj)
          .setBackground('#EBF8EE').setFontWeight('bold')
          .setNumberFormat('#,##0.00')
          .setNote('Kojen Avantaj (sabit)\nTarih: ' + gun + '.' + ayKisa + '\nDeÄŸer: ' + gunlukHesap.kojenAvantaj.toFixed(2));
        SpreadsheetApp.flush();
        Logger.log('  KC : âœ… Avantaj=' + gunlukHesap.kojenAvantaj.toFixed(2));
      }
    } catch(e) { Logger.log('  KC : âŒ ' + e.toString()); }

    // DengesizlikMaliyet
    try {
      var dmSayfaAdi = DM_SHEET_PREFIX + yil + '_' + dmPad2(ay);
      var dmSheet    = ss.getSheetByName(dmSayfaAdi);
      if (!dmSheet) {
        dengesizlikMaliyetSayfasiOlustur(ay, yil);
        dmSheet = ss.getSheetByName(dmSayfaAdi);
      }
      if (dmSheet) {
        var dmSatir = gun + 2;
        var ayKisa2 = ['','Oca','Åub','Mar','Nis','May','Haz','Tem','AÄŸu','Eyl','Eki','Kas','Ara'][ay];
        dmSheet.getRange(dmSatir, 16).setValue(gunlukHesap.epias)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('EPÄ°AÅ (sabit)\nTarih: ' + gun + '.' + ayKisa2);
        dmSheet.getRange(dmSatir, 17).setValue(gunlukHesap.teias)
          .setBackground('#EBF8EE').setNumberFormat('#,##0.00')
          .setNote('TEÄ°AÅ (sabit)\nTarih: ' + gun + '.' + ayKisa2);
        dmSheet.getRange(dmSatir, 18).setValue(gunlukHesap.epias + gunlukHesap.teias)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('Toplam (sabit)\nTarih: ' + gun + '.' + ayKisa2);
        SpreadsheetApp.flush();
        Logger.log('  DM : âœ…');
      }
    } catch(e) { Logger.log('  DM : âŒ ' + e.toString()); }

    // FaturalaÅŸma
    try {
      var fdSayfaAdi = FD_SHEET_PREFIX + yil + '_' + fdPad2(ay);
      var fdSheet    = ss.getSheetByName(fdSayfaAdi);
      if (!fdSheet) {
        faturaDetaySayfasiOlustur(ay, yil);
        fdSheet = ss.getSheetByName(fdSayfaAdi);
      }
      if (fdSheet) {
        var fdSatir = gun + 1;
        var ayKisa3 = ['','Oca','Åub','Mar','Nis','May','Haz','Tem','AÄŸu','Eyl','Eki','Kas','Ara'][ay];
        var mVal    = gunlukHesap.sebeke > 0 ? gunlukHesap.toplamMaliyet / gunlukHesap.sebeke : 0;
        fdSheet.getRange(fdSatir, 11).setValue(gunlukHesap.toplamMaliyet)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('Toplam Maliyet (sabit)\nTarih: ' + gun + '.' + ayKisa3);
        fdSheet.getRange(fdSatir, 12).setValue(gunlukHesap.sebeke)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('Åebeke TÃ¼ketim (sabit)\nTarih: ' + gun + '.' + ayKisa3);
        fdSheet.getRange(fdSatir, 13).setValue(mVal)
          .setBackground('#FFF9C4').setFontWeight('bold').setNumberFormat('0.00000')
          .setNote('Birim Maliyet (sabit)\nTarih: ' + gun + '.' + ayKisa3);
        // Kojen Ã¼retim
        var uretim = yillikToplamUretimCek(gun, ay, yil);
        fdSheet.getRange(fdSatir, 16).setValue(uretim)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.000')
          .setNote('Kojen Ãœretim\nTarih: ' + gun + '.' + ayKisa3);
        fdSheet.getRange(fdSatir, 17).setValue(uretim * 1300)
          .setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00')
          .setNote('PÃ—1300\nTarih: ' + gun + '.' + ayKisa3);
        SpreadsheetApp.flush();
        Logger.log('  FD : âœ… Maliyet=' + gunlukHesap.toplamMaliyet.toFixed(2));
      }
    } catch(e) { Logger.log('  FD : âŒ ' + e.toString()); }

    return { basarili: true };

  } catch (err) {
    return { basarili: false, hata: err.toString() };
  }
}

/**
 * Belirli bir gÃ¼n iÃ§in saatlik hesaplarÄ± GAS tarafÄ±nda yapar.
 * BaglantiNoktalari, AMR, PiyasaFiyatlari ve Maliyet sayfalarÄ±ndan okur.
 * @returns {Object} epias, teias, toplamMaliyet, sebeke, kojenAvantaj
 */
function gunlukSaatlikHesapla(ss, isoTarih, gun, ay, yil) {
  var sonuc = { epias: 0, teias: 0, toplamMaliyet: 0, sebeke: 0, kojenAvantaj: 0 };

  try {
    // Veri kaynaklarÄ±
    var bagSheet    = ss.getSheetByName('BaglantiNoktalari');
    var amrSayfaAdi = 'AMR_' + isoTarih.replace(/-/g, '');
    var amrSheet    = ss.getSheetByName(amrSayfaAdi);
    var ptfSheet    = ss.getSheetByName('PiyasaFiyatlari');
    var maliyetSheet = ss.getSheetByName('Maliyet');

    if (!bagSheet || !amrSheet || !ptfSheet) {
      Logger.log('  âš ï¸ Eksik kaynak: BAG=' + !!bagSheet + ' AMR=' + !!amrSheet + ' PTF=' + !!ptfSheet);
      return sonuc;
    }

    // Maliyet sayfasÄ±ndan o ay deÄŸerleri oku
    var yekdem = 0, dagitim = 0, vtc = 0, kojenMaliyet = 0;
    if (maliyetSheet && maliyetSheet.getLastRow() >= 2) {
      var malVeriler = maliyetSheet.getRange(2, 2, maliyetSheet.getLastRow() - 1, 7).getValues();
      for (var m = 0; m < malVeriler.length; m++) {
        if (parseInt(malVeriler[m][0]) === ay && parseInt(malVeriler[m][1]) === yil) {
          kojenMaliyet = parseFloat(malVeriler[m][3]) || 0; // E sÃ¼tunu
          yekdem       = parseFloat(malVeriler[m][4]) || 0; // F sÃ¼tunu
          dagitim      = parseFloat(malVeriler[m][5]) || 0; // G sÃ¼tunu
          vtc          = parseFloat(malVeriler[m][6]) || 0; // H sÃ¼tunu
          break;
        }
      }
    }

    // PiyasaFiyatlari'nden bu gÃ¼ne ait PTF, SMF, PozDen, NegDen oku
    var ptfDizi = []; var smfDizi = []; var pozDizi = []; var negDizi = [];
    for (var h = 0; h < 24; h++) { ptfDizi.push(0); smfDizi.push(0); pozDizi.push(0); negDizi.push(0); }
    if (ptfSheet.getLastRow() >= 2) {
      var ptfVeriler = ptfSheet.getRange(2, 1, ptfSheet.getLastRow() - 1, 6).getValues();
      ptfVeriler.forEach(function(r) {
        var tarihObj = r[0]; var saatObj = r[1];
        var rAy, rYil, sHour;
        if (tarihObj instanceof Date) { rAy = tarihObj.getMonth() + 1; rYil = tarihObj.getFullYear(); }
        else { var p = String(tarihObj).split('.'); rAy = parseInt(p[1]); rYil = parseInt(p[2]); }
        if (rAy !== ay || rYil !== yil) return;
        if (saatObj instanceof Date) { sHour = saatObj.getHours(); }
        else { sHour = parseInt(String(saatObj).split(':')[0]); }
        if (isNaN(sHour) || sHour < 0 || sHour > 23) return;
        // Tarih gÃ¼nÃ¼ kontrolÃ¼
        if (tarihObj instanceof Date && tarihObj.getDate() !== gun) return;
        ptfDizi[sHour] = parseFloat(r[2]) || 0;
        smfDizi[sHour] = parseFloat(r[3]) || 0;
        pozDizi[sHour] = parseFloat(r[4]) || 0;
        negDizi[sHour] = parseFloat(r[5]) || 0;
      });
    }

    // Saatlik hesaplar
    var topEpias = 0, topTeias = 0, topMaliyet = 0, topSebeke = 0, topKojenAv = 0;

    for (var i = 0; i < 24; i++) {
      var bagRow  = i + 2;
      var amrRow  = i + 2;

      var tahmin  = (bagSheet.getLastRow() >= bagRow) ? (parseFloat(bagSheet.getRange(bagRow, 2).getValue()) || 0) : 0;
      var gercek  = (amrSheet.getLastRow() >= amrRow) ? (parseFloat(amrSheet.getRange(amrRow, 2).getValue()) || 0) : 0;
      var fark    = gercek - tahmin;
      var ptf     = ptfDizi[i]; var smf = smfDizi[i];
      var pozFark = pozDizi[i] - ptf;
      var negFark = negDizi[i] - ptf;
      var epias   = Math.abs(fark > 0 ? fark * pozFark : fark * negFark);
      var teias   = 0;
      if (Math.abs(fark) > tahmin * 0.15) {
        teias = Math.abs(fark * Math.max(ptf, smf) * 0.08);
      }

      // FaturalaÅŸma hesaplarÄ±
      var dagYek    = gercek * (yekdem + dagitim + vtc);
      var toplamSat = epias + (gercek * ptf) + dagYek;

      // Kojen avantaj
      var kojenUretim = (bagSheet.getLastRow() >= bagRow) ? (parseFloat(bagSheet.getRange(bagRow, 6).getValue()) || 0) : 0;
      var kojenBedel  = kojenUretim * kojenMaliyet;
      var sebekeMal   = kojenUretim * (ptf + yekdem + dagitim + vtc);
      var avantaj     = sebekeMal - kojenBedel;

      topEpias    += epias;
      topTeias    += teias;
      topMaliyet  += toplamSat;
      topSebeke   += gercek;
      topKojenAv  += avantaj;
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

// â”€â”€â”€ TRIGGER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Her gÃ¼n 10:30'da Ã§alÄ±ÅŸacak trigger kurar.
 * DÃ¼nÃ¼n verisini otomatik olarak Ã§eker.
 * Ay deÄŸiÅŸmiÅŸse Ã¶nceki ayÄ±n verilerini yedekler.
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

  Logger.log('âœ… GÃ¼nlÃ¼k trigger kuruldu â€” her gÃ¼n 10:30.');
  return { success: true };
}

/**
 * Trigger tarafÄ±ndan Ã§aÄŸrÄ±lan ana fonksiyon.
 * 1. DÃ¼nÃ¼n verisini hesaplar ve kaydeder.
 * 2. Ay deÄŸiÅŸtiyse Ã¶nceki ayÄ±n sayfalarÄ±nÄ± yedekler.
 */
function gunlukOtomatikCalis() {
  var bugun = new Date();
  var dun   = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - 1);

  var gun = dun.getDate();
  var ay  = dun.getMonth() + 1;
  var yil = dun.getFullYear();
  var iso = gocIsoDate(dun);

  Logger.log('ğŸ•™ Otomatik Ã§alÄ±ÅŸma: ' + iso);

  // DÃ¼nÃ¼n verilerini hesapla
  var sonuc = gunlukVerileriCek(iso, gun, ay, yil);
  Logger.log(sonuc.basarili ? 'âœ… ' + iso + ' tamamlandÄ±.' : 'âŒ ' + iso + ' hata: ' + sonuc.hata);

  // Ay deÄŸiÅŸti mi? (BugÃ¼n 1. gÃ¼n ise dÃ¼n son gÃ¼ndÃ¼)
  if (bugun.getDate() === 1) {
    Logger.log('ğŸ“¦ Ay deÄŸiÅŸti â€” Ã¶nceki ayÄ±n verileri yedekleniyor...');
    ayYedekle(ay, yil);
  }

  return sonuc;
}

// â”€â”€â”€ GÃœNLÃœK GÃœNCELLEME FONKSÄ°YONLARI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AylÄ±k sayfalar silinmez â€” sadece ilgili gÃ¼nÃ¼n satÄ±rlarÄ± gÃ¼ncellenir.

/**
 * KojenCalisma sayfasÄ± varsa sadece H ve I sÃ¼tunlarÄ±ndaki
 * hesaplanan gÃ¼n satÄ±rÄ±nÄ± gÃ¼nceller.
 */
function kojenCalismaGunGuncelle(gun, ay, yil) {
  try {
    var ss       = SpreadsheetApp.openById(KC_SPREADSHEET_ID);
    var sayfaAdi = KC_SHEET_PREFIX + yil + '_' + kcPad2(ay);
    var sheet    = ss.getSheetByName(sayfaAdi);

    // Sayfa yoksa tam oluÅŸtur
    if (!sheet) return kojenCalismaSayfasiOlustur(ay, yil);

    // H ve I sÃ¼tunlarÄ±nda bu gÃ¼nÃ¼n satÄ±rÄ±nÄ± bul ve gÃ¼ncelle
    var ayKisa  = ['','Oca','Åub','Mar','Nis','May','Haz','Tem','AÄŸu','Eyl','Eki','Kas','Ara'][ay];
    var tarihEt = gun + '.' + ayKisa;
    var gunSayisi = new Date(yil, ay, 0).getDate();

    for (var g = 1; g <= gunSayisi; g++) {
      var satirNo = g + 2; // H/I 3. satÄ±rdan baÅŸlÄ±yor
      var hVal    = sheet.getRange(satirNo, 8).getValue();
      if (String(hVal).trim() === tarihEt || g === gun) {
        // Bu gÃ¼nÃ¼n avantajÄ±nÄ± gÃ¼ncelle â€” F28 referansÄ± zaten canlÄ±
        sheet.getRange(satirNo, 9)
          .setFormula('=F28')
          .setBackground('#EBF8EE').setFontWeight('bold')
          .setNote('GÃ¼ncellendi: ' + tarihEt);
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
 * DengesizlikMaliyet sayfasÄ± varsa sadece P, Q, R sÃ¼tunlarÄ±ndaki
 * bu gÃ¼nÃ¼n satÄ±rÄ±nÄ± gÃ¼nceller.
 */
function dengesizlikMaliyetGunGuncelle(gun, ay, yil) {
  try {
    var ss       = SpreadsheetApp.openById(DM_SPREADSHEET_ID);
    var sayfaAdi = DM_SHEET_PREFIX + yil + '_' + dmPad2(ay);
    var sheet    = ss.getSheetByName(sayfaAdi);

    if (!sheet) return dengesizlikMaliyetSayfasiOlustur(ay, yil);

    var ayKisa  = ['','Oca','Åub','Mar','Nis','May','Haz','Tem','AÄŸu','Eyl','Eki','Kas','Ara'][ay];
    var tarihEt = gun + '.' + ayKisa;
    var satirNo = gun + 2; // 3. satÄ±rdan baÅŸlÄ±yor

    // L27 ve M27 deÄŸerlerini ÅŸu an oku â€” sol tablo bu gÃ¼nÃ¼n verisiyle dolu
    SpreadsheetApp.flush();
    var epiasVal = parseFloat(sheet.getRange(27, 12).getValue()) || 0; // L27
    var teiasVal = parseFloat(sheet.getRange(27, 13).getValue()) || 0; // M27
    var toplamVal = epiasVal + teiasVal;

    // P, Q, R â€” sabit deÄŸer yaz
    sheet.getRange(satirNo, 16).setValue(epiasVal)
      .setBackground('#EBF8EE').setFontWeight('bold')
      .setNumberFormat('#,##0.00')
      .setNote('L27 deÄŸeri kaydedildi (EPÄ°AÅ)\nTarih: ' + tarihEt + '\nDeÄŸer: ' + epiasVal.toFixed(2));

    sheet.getRange(satirNo, 17).setValue(teiasVal)
      .setBackground('#EBF8EE')
      .setNumberFormat('#,##0.00')
      .setNote('M27 deÄŸeri kaydedildi (TEÄ°AÅ)\nTarih: ' + tarihEt + '\nDeÄŸer: ' + teiasVal.toFixed(2));

    sheet.getRange(satirNo, 18).setValue(toplamVal)
      .setBackground('#EBF8EE').setFontWeight('bold')
      .setNumberFormat('#,##0.00')
      .setNote('EPÄ°AÅ + TEÄ°AÅ\n' + epiasVal.toFixed(2) + ' + ' + teiasVal.toFixed(2) + '\nTarih: ' + tarihEt);

    SpreadsheetApp.flush();
    Logger.log('  DM gÃ¼ncellendi: ' + tarihEt + ' | EPÄ°AÅ=' + epiasVal.toFixed(2) + ' TEÄ°AÅ=' + teiasVal.toFixed(2));
    return { success: true, sayfa: sayfaAdi, gun: gun };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * FaturalaÅŸma sayfasÄ± varsa sadece bu gÃ¼nÃ¼n K, L, M, P, Q satÄ±rlarÄ±nÄ± gÃ¼nceller.
 */
function faturaDetayGunGuncelle(gun, ay, yil) {
  try {
    var ss       = SpreadsheetApp.openById(FD_SPREADSHEET_ID);
    var sayfaAdi = FD_SHEET_PREFIX + yil + '_' + fdPad2(ay);
    var sheet    = ss.getSheetByName(sayfaAdi);

    if (!sheet) return faturaDetaySayfasiOlustur(ay, yil);

    var ayKisa  = ['','Oca','Åub','Mar','Nis','May','Haz','Tem','AÄŸu','Eyl','Eki','Kas','Ara'][ay];
    var tarihEt = gun + '.' + ayKisa;
    var satirNo = gun + 1; // 2. satÄ±rdan baÅŸlÄ±yor

    // D28 ve H26 deÄŸerlerini ÅŸu an oku â€” sol tablo bu gÃ¼nÃ¼n verisiyle dolu
    SpreadsheetApp.flush();
    var d28Val = parseFloat(sheet.getRange(28, 4).getValue()) || 0;
    var h26Val = parseFloat(sheet.getRange(26, 8).getValue()) || 0;
    var mVal   = h26Val > 0 ? d28Val / h26Val : 0;

    // K: Sabit deÄŸer (formÃ¼l deÄŸil)
    sheet.getRange(satirNo, 11).setValue(d28Val)
      .setBackground('#EBF8EE').setFontWeight('bold')
      .setNumberFormat('#,##0.00')
      .setNote('D28 deÄŸeri kaydedildi\nTarih: ' + tarihEt + '\nDeÄŸer: ' + d28Val.toFixed(2));

    // L: Sabit deÄŸer
    sheet.getRange(satirNo, 12).setValue(h26Val)
      .setBackground('#EBF8EE').setFontWeight('bold')
      .setNumberFormat('#,##0.00')
      .setNote('H26 deÄŸeri kaydedildi\nTarih: ' + tarihEt + '\nDeÄŸer: ' + h26Val.toFixed(2));

    // M: Sabit deÄŸer
    sheet.getRange(satirNo, 13).setValue(mVal)
      .setBackground('#FFF9C4').setFontWeight('bold')
      .setNumberFormat('0.00000')
      .setNote('K/L = ' + d28Val.toFixed(2) + ' / ' + h26Val.toFixed(2) + '\nTarih: ' + tarihEt);

    // P: Kojen Ã¼retim, Q: PÃ—1300
    var uretimMwh = yillikToplamUretimCek(gun, ay, yil);
    sheet.getRange(satirNo, 16).setValue(uretimMwh)
      .setBackground('#EBF8EE').setFontWeight('bold')
      .setNumberFormat('#,##0.000')
      .setNote('Kaynak: YillikEnerjiToplam\nTarih: ' + tarihEt);
    sheet.getRange(satirNo, 17).setValue(uretimMwh * 1300)
      .setBackground('#EBF8EE').setFontWeight('bold')
      .setNumberFormat('#,##0.00')
      .setNote('P Ã— 1300\nTarih: ' + tarihEt);

    SpreadsheetApp.flush();
    Logger.log('  FD gÃ¼ncellendi: ' + tarihEt + ' | K=' + d28Val.toFixed(2) + ' L=' + h26Val.toFixed(2) + ' M=' + mVal.toFixed(5));
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

// â”€â”€â”€ TEST â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Sadece dÃ¼n iÃ§in Ã§alÄ±ÅŸtÄ±r */
function dunkuVerileriCekTest() {
  var dun = new Date();
  dun.setDate(dun.getDate() - 1);
  var iso = gocIsoDate(dun);
  return gunlukVerileriCek(iso, dun.getDate(), dun.getMonth() + 1, dun.getFullYear());
}

/** Belirli bir gÃ¼n iÃ§in test */
function tekGunTest() {
  var iso = '2026-07-30'; // â† deÄŸiÅŸtirin
  var d   = new Date(iso);
  return gunlukVerileriCek(iso, d.getDate(), d.getMonth() + 1, d.getFullYear());
}

// â”€â”€â”€ AY YEDEKLEMESÄ° â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Belirtilen ay/yÄ±lÄ±n KojenCalisma, DengesizlikMaliyet ve Faturalasma
 * sayfalarÄ±nÄ± kopyalayarak "Yedek_SayfaAdi_DDMMYYYY" formatÄ±nda arÅŸivler.
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
        Logger.log('  âš ï¸ Yedeklenecek sayfa bulunamadÄ±: ' + sayfaAdi);
        return;
      }

      // Sayfa adÄ± max 100 karakter â€” kÄ±sa tutuyoruz
      var kisaAd  = sayfaAdi.replace('KojenCalisma_', 'KC_')
                             .replace('DengesizlikMaliyet_', 'DM_')
                             .replace('Faturalasma_', 'FD_');
      var yedekAdi = 'Yedek_' + kisaAd + '_' + zaman;

      var kopya = sheet.copyTo(ss);
      kopya.setName(yedekAdi);

      // YedeÄŸi listenin sonuna taÅŸÄ±
      ss.moveActiveSheet(ss.getNumSheets());

      // Yedek olduÄŸunu belirt
      kopya.getRange(1, 1).setNote('YEDEK KOPYA\nKaynak: ' + sayfaAdi + '\nOluÅŸturma: ' + zaman);

      yedeklenen.push(yedekAdi);
      Logger.log('  ğŸ“¦ Yedeklendi: ' + yedekAdi);
    });

    Logger.log('âœ… Ay yedekleme tamamlandÄ±: ' + yedeklenen.length + ' sayfa');
    return { success: true, yedeklenen: yedeklenen };

  } catch(e) {
    Logger.log('âŒ ayYedekle hata: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/** Manuel yedekleme testi */
function ayYedekleTest() {
  return ayYedekle(7, 2026);
}

