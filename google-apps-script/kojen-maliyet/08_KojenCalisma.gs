/**
 * 08_KojenCalisma.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * "KojenCalisma_YYYY_MM" sayfasını oluşturur.
 * Kojen avantaj hesabı: Şebeke maliyeti − Kojen bedeli
 *
 * Sütun düzeni (A–I):
 *   A: SAAT
 *   B: Kojen Üretim (MWh)           ← BaglantiNoktalari F sütunu
 *   C: Kojen Maliyet (TL/MWh)       ← Maliyet sayfası E sütunu
 *   D: Bedel (TL)                   = B × C
 *   E: Şebeke+Dağıtım+YEKDEM (TL/MWh)  = PTF + Maliyet F+G+H
 *   F: Şebeke Maliyet (TL)          = B × E
 *   G: [Boş]
 *   H: TARİH (aylık avantaj tablosu)
 *   I: KOJEN AVANTAJ (TL/gün)
 *
 * Bağımlılıklar: 01_VGenConfig.gs
 */

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * @param {number} ay   1-12 (opsiyonel)
 * @param {number} yil  (opsiyonel)
 * @param {number} gun  1-31 (opsiyonel, PTF filtresi için)
 */
function kojenCalismaSayfasiOlustur(ay, yil, gun) {
  try {
    var bugun = new Date();
    ay  = ay  || (bugun.getMonth() + 1);
    yil = yil || bugun.getFullYear();
    var ss = cfgSsAc();
    if (!gun) gun = cfgBaglantiTarihiOku(ss).getDate();

    var sayfaAdi = CFG_PREF_KOJEN_CALISMA + yil + '_' + cfgPad2(ay);
    var sheet    = cfgGetOrCreateSheet(ss, sayfaAdi);
    sheet.clear();
    _kcBaslikYaz(sheet);

    // Maliyet sayfasında bu dönemin satır numarası
    var maliyetSatir = cfgMaliyetSatiriBul(ss, ay, yil) || 2;

    for (var i = 0; i < 24; i++) {
      var satirNo  = i + 3;
      var bagRow   = i + 2;

      // A: SAAT
      sheet.getRange(satirNo, 1).setValue(CFG_SAATLER_24[i]);

      // B: Kojen Üretim — BaglantiNoktalari F
      sheet.getRange(satirNo, 2)
        .setFormula('=BaglantiNoktalari!F' + bagRow)
        .setNote('Kaynak: BaglantiNoktalari F' + bagRow);

      // C: Kojen Maliyet — Maliyet E (sabit dönem)
      sheet.getRange(satirNo, 3)
        .setFormula('=Maliyet!$E$' + maliyetSatir)
        .setNote('Kaynak: Maliyet E' + maliyetSatir);

      // D: Bedel = B × C
      sheet.getRange(satirNo, 4).setFormula('=B' + satirNo + '*C' + satirNo);

      // E: Şebeke+Dağ+YEKDEM = PTF (sabit) + Maliyet F+G+H
      var ptfSayi = _kcPtfDegeriniAl(ss, CFG_SAATLER_24[i], ay, yil, gun);
      var ptfInt  = Math.round(ptfSayi);
      sheet.getRange(satirNo, 5)
        .setFormula('=' + ptfInt + '+Maliyet!$F$' + maliyetSatir + '+Maliyet!$G$' + maliyetSatir + '+Maliyet!$H$' + maliyetSatir)
        .setNote('PTF(' + CFG_SAATLER_24[i] + ')=' + ptfSayi + ' + YEKDEM + Dağıtım + VTC');

      // F: Şebeke Maliyet = B × E
      sheet.getRange(satirNo, 6).setFormula('=B' + satirNo + '*E' + satirNo);

      // G: Boş
      sheet.getRange(satirNo, 7).setValue('');

      _kcSatirBicimlendir(sheet, satirNo);
    }

    // Toplam satırı (27)
    sheet.getRange(27, 1).setValue('TOPLAM');
    sheet.getRange(27, 2).setFormula('=SUM(B3:B26)');
    sheet.getRange(27, 4).setFormula('=SUM(D3:D26)');
    sheet.getRange(27, 6).setFormula('=SUM(F3:F26)');
    _kcToplamSatirBicimlendir(sheet);

    // Avantaj hücresi (28)
    sheet.getRange(28, 5).setValue('AVANTAJ');
    sheet.getRange(28, 6).setFormula('=F27-D27')
      .setNote('Toplam Kojen Avantaj = Şebeke Maliyet − Kojen Bedel');
    sheet.getRange(28, 5, 1, 2)
      .setBackground('#276749').setFontColor('#FFFFFF')
      .setFontWeight('bold').setHorizontalAlignment('center')
      .setNumberFormat('#,##0.00');

    // Aylık avantaj tablosu
    _kcAylikAvantajTablosu(sheet, ss, ay, yil);

    SpreadsheetApp.flush();
    Logger.log('✅ ' + sayfaAdi + ' oluşturuldu.');
    return { success: true, sayfa: sayfaAdi, ay: ay, yil: yil };

  } catch(e) {
    Logger.log('❌ kojenCalismaSayfasiOlustur: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ─── BAŞLIK & BİÇİMLENDİRME ──────────────────────────────────────────────────

function _kcBaslikYaz(sheet) {
  sheet.getRange(1, 1, 1, 7).merge()
    .setValue('KOJEN DEVREDEYİKEN')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sheet.setRowHeight(1, 40);

  var basliklar = ['SAAT','Kojen Üretim (MWh)','Kojen Maliyet (TL/MWh)','Bedel (TL)','Şebeke+Dağıtım+YEKDEM (TL/MWh)','Şebeke Maliyet (TL)',''];
  sheet.getRange(2, 1, 1, basliklar.length).setValues([basliklar])
    .setBackground('#2c5282').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(2, 36);
  sheet.setFrozenRows(2);

  [90, 140, 160, 120, 200, 150, 30].forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
}

function _kcSatirBicimlendir(sheet, satirNo) {
  sheet.getRange(satirNo, 1, 1, 7).setBackground('#EBF8EE');
  sheet.getRange(satirNo, 1).setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(satirNo, 2).setNumberFormat('0.000');
  sheet.getRange(satirNo, 3).setNumberFormat('0.#####');
  sheet.getRange(satirNo, 4).setNumberFormat('#,##0.00');
  sheet.getRange(satirNo, 5).setNumberFormat('#,##0.00');
  sheet.getRange(satirNo, 6).setNumberFormat('#,##0.00');
}

function _kcToplamSatirBicimlendir(sheet) {
  sheet.getRange(27, 1, 1, 7).setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(27, 2).setNumberFormat('0.000');
  sheet.getRange(27, 4).setNumberFormat('#,##0.00');
  sheet.getRange(27, 6).setNumberFormat('#,##0.00');
}

// ─── AYLIK AVANTAJ TABLOSU ────────────────────────────────────────────────────

function _kcAylikAvantajTablosu(sheet, ss, ay, yil) {
  // Başlık
  sheet.getRange(1, 8, 1, 2).merge()
    .setValue('AYLIK KOJEN AVANTAJ')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  sheet.getRange(2, 8).setValue('TARİH').setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(2, 9).setValue('KOJEN AVANTAJ (TL)').setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setColumnWidth(8, 110);
  sheet.setColumnWidth(9, 150);

  var hesaplananGun = cfgBaglantiTarihiOku(ss);
  var hesGun = hesaplananGun ? hesaplananGun.getDate()      : -1;
  var hesAy  = hesaplananGun ? hesaplananGun.getMonth() + 1 : -1;
  var hesYil = hesaplananGun ? hesaplananGun.getFullYear()  : -1;
  var gunSayisi = new Date(yil, ay, 0).getDate();

  for (var g = 1; g <= gunSayisi; g++) {
    var satirNo = g + 2;
    var tarihStr = cfgPad2(g) + '/' + cfgPad2(ay) + '/' + yil;
    sheet.getRange(satirNo, 8).setValue(tarihStr).setHorizontalAlignment('center')
      .setBackground(g % 2 === 0 ? '#F7F9FC' : '#FFFFFF');

    var iHucre = sheet.getRange(satirNo, 9);
    if (g === hesGun && hesAy === ay && hesYil === yil) {
      iHucre.setFormula('=F28').setBackground('#EBF8EE').setFontWeight('bold')
        .setNote('Kaynak: F28 (Toplam Kojen Avantaj)\nTarih: ' + tarihStr);
    } else {
      iHucre.setValue('').setBackground(g % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    }
    iHucre.setNumberFormat('#,##0.00');
  }

  // Toplam
  var toplamSatir = gunSayisi + 3;
  sheet.getRange(toplamSatir, 8).setValue('TOPLAM').setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(toplamSatir, 9).setFormula('=SUM(I3:I' + (gunSayisi + 2) + ')').setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
}

// ─── PTF DEĞER OKUMA ──────────────────────────────────────────────────────────

function _kcPtfDegeriniAl(ss, saat, ay, yil, gun) {
  var sheet = ss.getSheetByName(CFG_SAYFA_PIYASA);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var hedefSaat = parseInt(saat.split(':')[0], 10);
  var veriler   = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();

  for (var i = 0; i < veriler.length; i++) {
    var tarihObj = veriler[i][0], saatObj = veriler[i][1];
    var satirAy, satirYil, satirGun, satirSaat;

    if (tarihObj instanceof Date) {
      satirAy = tarihObj.getMonth() + 1; satirYil = tarihObj.getFullYear(); satirGun = tarihObj.getDate();
    } else {
      var p = String(tarihObj).split('.');
      if (p.length < 3) continue;
      satirGun = parseInt(p[0],10); satirAy = parseInt(p[1],10); satirYil = parseInt(p[2],10);
    }
    if (satirAy !== ay || satirYil !== yil) continue;
    if (gun && satirGun !== gun) continue;

    satirSaat = (saatObj instanceof Date) ? saatObj.getHours() : parseInt(String(saatObj).split(':')[0], 10);
    if (isNaN(satirSaat) || satirSaat !== hedefSaat) continue;

    var deger = parseFloat(veriler[i][2]);
    return isNaN(deger) ? 0 : deger;
  }
  return 0;
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function kojenCalismaTest() {
  var r = kojenCalismaSayfasiOlustur(7, 2026, 30);  // ← gün de belirtin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
