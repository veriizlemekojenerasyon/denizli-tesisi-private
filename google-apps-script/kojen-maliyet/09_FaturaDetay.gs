/**
 * 09_FaturaDetay.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * "Faturalasma_YYYY_MM" sayfasını oluşturur.
 *
 * Sol tablo (A–H, saatlik 24 saat + toplam):
 *   A: SAAT
 *   B: DENGESİZLİK ALIŞ SATIŞ (TL)
 *   C: EPİAŞ (TL)              = TAHMİN × PTF
 *   D: DAĞITIM+YEKDEM (TL)     = GERÇEK × (YEKDEM+DAĞ+VTC)
 *   E: KORUMA FATURA (TL)      = B>0 ? B : 0
 *   F: VTC FATURA (TL)         = B<0 ? B : 0
 *   G: TAHMİN (MWh)
 *   H: GERÇEK (MWh)
 *
 * Orta tablo (J–M, aylık özet)
 * Sağ tablo  (O–Q, aylık kojen)
 *
 * Bağımlılıklar: 01_VGenConfig.gs, 05_YillikUretimVerisi.gs
 */

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * @param {number} ay   1-12 (opsiyonel)
 * @param {number} yil  (opsiyonel)
 * @param {number} gun  1-31 (opsiyonel, PTF filtresi için)
 */
function faturaDetaySayfasiOlustur(ay, yil, gun) {
  try {
    var bugun = new Date();
    ay  = ay  || (bugun.getMonth() + 1);
    yil = yil || bugun.getFullYear();
    var ss = cfgSsAc();
    if (!gun) {
      var bgTarih = _fdHesaplananGunuBul(ss, ay, yil);
      gun = bgTarih ? bgTarih.getDate() : (bugun.getDate() - 1 || 1);
    }

    var sayfaAdi = CFG_PREF_FATURA + yil + '_' + cfgPad2(ay);
    var sheet    = cfgSayfayiSifirla(ss, sayfaAdi);

    _fdBasliklariYaz(sheet, ay, yil);
    _fdSaatlikSatirlariYaz(sheet, ss, ay, yil, gun);
    _fdToplamSatirYaz(sheet);
    _fdOzetSatirlariYaz(sheet, ay, yil, ss);

    var hesaplananGun = _fdHesaplananGunuBul(ss, ay, yil);
    _fdAylikTablolariYaz(sheet, ay, yil, hesaplananGun);

    SpreadsheetApp.flush();
    Logger.log('✅ ' + sayfaAdi + ' oluşturuldu.');
    return { success: true, sayfa: sayfaAdi };

  } catch(e) {
    Logger.log('❌ faturaDetaySayfasiOlustur: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ─── BAŞLIKLAR ────────────────────────────────────────────────────────────────

function _fdBasliklariYaz(sheet, ay, yil) {
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  var solBasliklar = ['SAAT','DENGESİZLİK\nALIŞ SATIŞ (TL)','EPİAŞ (TL)','DAĞITIM+\nYEKDEM (TL)','KORUMA\nFATURA (TL)','VTC\nFATURA (TL)','TAHMİN\n(MWh)','GERÇEK\n(MWh)'];
  sheet.getRange(1, 1, 1, solBasliklar.length).setValues([solBasliklar])
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(1, 48);

  sheet.getRange(1, 9).setValue('').setBackground('#E2E8F0');

  var ortaBasliklar = ['','AYLIK TOPLAM\nMALİYET (TL)','ŞEBEKE TÜKETİM\n(kWh)','BİRİM MALİYET\n(TL/kWh)'];
  sheet.getRange(1, 10, 1, ortaBasliklar.length).setValues([ortaBasliklar])
    .setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.getRange(1, 13).setBackground('#b7950b').setFontColor('#FFFFFF');

  sheet.getRange(1, 14).setValue('').setBackground('#E2E8F0');

  var sagBasliklar = ['','KOJEN ÜRETİM\n(kWh)','KOJEN MALİYET\n(TL)'];
  sheet.getRange(1, 15, 1, sagBasliklar.length).setValues([sagBasliklar])
    .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);

  [80,130,110,130,120,110,90,90,20,90,130,120,120,20,90,120,120].forEach(function(w,i) { sheet.setColumnWidth(i+1,w); });
}

// ─── SAATLİK SATIRLAR ─────────────────────────────────────────────────────────

function _fdSaatlikSatirlariYaz(sheet, ss, ay, yil, gun) {
  var dmSheet  = ss.getSheetByName(CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay));
  var amrSheet = ss.getSheetByName(CFG_SAYFA_AMR_SAATLIK);
  var bagSheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);

  // DengesizlikMaliyet D, G, H sütunları (satır 3-26)
  var dmVeriler = null;
  if (dmSheet && dmSheet.getLastRow() >= 26) {
    dmVeriler = dmSheet.getRange(3, 4, 24, 5).getValues();
  }

  // PTF dizisi
  var ptfMap = _fdPtfVerisiniOku(ss, ay, yil, gun);

  // Maliyet sayfasından YEKDEM, Dağıtım, VTC
  var yekdem = 0, dagitim = 0, vtc = 0;
  var malSheet = ss.getSheetByName(CFG_SAYFA_MALIYET);
  if (malSheet && malSheet.getLastRow() >= 2) {
    var malVeriler = malSheet.getRange(2, 2, malSheet.getLastRow() - 1, 7).getValues();
    for (var m = 0; m < malVeriler.length; m++) {
      if (parseInt(malVeriler[m][0]) === ay && parseInt(malVeriler[m][1]) === yil) {
        yekdem  = parseFloat(malVeriler[m][4]) || 0;
        dagitim = parseFloat(malVeriler[m][5]) || 0;
        vtc     = parseFloat(malVeriler[m][6]) || 0;
        break;
      }
    }
  }

  for (var i = 0; i < 24; i++) {
    var satirNo = i + 2;
    var bg      = i % 2 === 0 ? '#F7F9FC' : '#FFFFFF';
    var bagRow  = i + 2;

    // A: SAAT
    sheet.getRange(satirNo, 1).setValue(CFG_SAATLER_24[i])
      .setBackground('#1C2B3A').setFontColor('#FFFFFF')
      .setFontWeight('bold').setHorizontalAlignment('center');

    // Tahmin: BaglantiNoktalari G (Şebeke Hattı)
    var tahminVal = 0;
    if (bagSheet && bagSheet.getLastRow() >= bagRow) {
      tahminVal = parseFloat(bagSheet.getRange(bagRow, 7).getValue()) || 0;
    }
    if (tahminVal === 0 && dmSheet && dmSheet.getLastRow() >= i + 3) {
      tahminVal = parseFloat(dmSheet.getRange(i + 3, 2).getValue()) || 0;
    }

    // Gerçek: AMR_Saatlik B (MWh)
    var gercekVal = 0;
    if (amrSheet && amrSheet.getLastRow() >= bagRow) {
      gercekVal = parseFloat(amrSheet.getRange(bagRow, 2).getValue()) || 0;
    }
    if (gercekVal === 0 && dmSheet && dmSheet.getLastRow() >= i + 3) {
      gercekVal = parseFloat(dmSheet.getRange(i + 3, 3).getValue()) || 0;
    }

    // B: Dengesizlik alış/satış
    var bVal = 0;
    if (dmVeriler) {
      var d = parseFloat(dmVeriler[i][0]) || 0;
      var g = parseFloat(dmVeriler[i][3]) || 0;
      var h = parseFloat(dmVeriler[i][4]) || 0;
      bVal  = d > 0 ? d * g : d * h;
    }
    sheet.getRange(satirNo, 2).setValue(bVal).setBackground(bg).setNumberFormat('#,##0.00 "₺"');

    // C: EPİAŞ = TAHMİN × PTF
    var ptf = ptfMap[i] || 0;
    sheet.getRange(satirNo, 3).setValue(tahminVal * ptf).setBackground(bg).setNumberFormat('#,##0.00 "₺"')
      .setNote('TAHMİN=' + tahminVal.toFixed(3) + ' × PTF=' + ptf.toFixed(2));

    // D: Dağıtım+YEKDEM = GERÇEK × (YEKDEM+DAĞ+VTC)
    sheet.getRange(satirNo, 4).setValue(gercekVal * (yekdem + dagitim + vtc))
      .setBackground(bg).setNumberFormat('#,##0.00 "₺"')
      .setNote('GERÇEK=' + gercekVal.toFixed(3) + ' × ' + (yekdem+dagitim+vtc).toFixed(2));

    // E: Koruma = B>0 ? B : 0
    sheet.getRange(satirNo, 5).setValue(bVal > 0 ? bVal : 0).setBackground(bg).setNumberFormat('#,##0.00 "₺"');

    // F: VTC = B<0 ? B : 0
    sheet.getRange(satirNo, 6).setValue(bVal < 0 ? bVal : 0).setBackground(bg).setNumberFormat('#,##0.00 "₺"');

    // G: Tahmin (MWh)
    sheet.getRange(satirNo, 7).setValue(tahminVal).setBackground(bg).setNumberFormat('0.000');

    // H: Gerçek (MWh)
    sheet.getRange(satirNo, 8).setValue(gercekVal).setBackground(bg).setNumberFormat('0.000');

    sheet.getRange(satirNo, 9).setBackground('#E2E8F0');
  }
}

// ─── TOPLAM SATIRI ────────────────────────────────────────────────────────────

function _fdToplamSatirYaz(sheet) {
  var r = 26;
  sheet.getRange(r, 1).setValue('TOPLAM').setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  for (var s = 2; s <= 8; s++) {
    var harf = String.fromCharCode(64 + s);
    sheet.getRange(r, s).setFormula('=SUM(' + harf + '2:' + harf + '25)').setNumberFormat(s <= 6 ? '#,##0.00' : '0.000');
  }
  sheet.getRange(r, 1, 1, 8).setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold');
  sheet.getRange(r, 9).setBackground('#E2E8F0');
}

// ─── ÖZET SATIRLARI ───────────────────────────────────────────────────────────

function _fdOzetSatirlariYaz(sheet, ay, yil, ss) {
  sheet.getRange(28, 1).setValue('TOPLAM').setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  sheet.getRange(28, 2, 1, 3).setBackground('#1e3a5f');

  var malSheet = ss.getSheetByName(CFG_SAYFA_MALIYET);
  var dmSheet  = ss.getSheetByName(CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay));

  var maliyetK2 = 0, c26 = 0, d26 = 0, e26 = 0, f26 = 0, dmR29 = 0;
  if (malSheet && malSheet.getLastRow() >= 2) maliyetK2 = parseFloat(malSheet.getRange(2, 11).getValue()) || 0;
  c26 = parseFloat(sheet.getRange(26, 3).getValue()) || 0;
  d26 = parseFloat(sheet.getRange(26, 4).getValue()) || 0;
  e26 = parseFloat(sheet.getRange(26, 5).getValue()) || 0;
  f26 = parseFloat(sheet.getRange(26, 6).getValue()) || 0;
  if (dmSheet && dmSheet.getLastRow() >= 27) dmR29 = parseFloat(dmSheet.getRange(27, 18).getValue()) || 0;

  var d28Val = maliyetK2 + c26 + d26 + f26 + dmR29 - e26;
  sheet.getRange(28, 4).setValue(d28Val).setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"')
    .setNote('Maliyet!K2=' + maliyetK2.toFixed(2) + ' + C26=' + c26.toFixed(2) + ' + D26=' + d26.toFixed(2) + ' + F26=' + f26.toFixed(2) + ' + DM!R29=' + dmR29.toFixed(2) + ' − E26=' + e26.toFixed(2));

  sheet.getRange(28, 7).setValue('ŞEBEKE').setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(28, 8).setFormula('=H26').setNumberFormat('0.000').setBackground('#EEF4FF');
}

// ─── AYLIK TABLOLAR ───────────────────────────────────────────────────────────

function _fdAylikTablolariYaz(sheet, ay, yil, hesaplananGun) {
  var gunSayisi = new Date(yil, ay, 0).getDate();
  var ayKisa    = CFG_AYLAR_KISA[ay] || ay;
  var hesGun    = hesaplananGun ? hesaplananGun.getDate()      : 0;
  var hesAy     = hesaplananGun ? hesaplananGun.getMonth() + 1 : 0;
  var hesYil    = hesaplananGun ? hesaplananGun.getFullYear()  : 0;

  for (var g = 1; g <= gunSayisi; g++) {
    var satirNo = g + 1;
    var bg      = g % 2 === 0 ? '#F7F9FC' : '#FFFFFF';
    var tarihEt = g + '.' + ayKisa;
    var buGun   = (g === hesGun && hesAy === ay && hesYil === yil);

    sheet.getRange(satirNo, 10).setValue(tarihEt).setHorizontalAlignment('center').setBackground(bg);

    var kHucre = sheet.getRange(satirNo, 11);
    var lHucre = sheet.getRange(satirNo, 12);
    var mHucre = sheet.getRange(satirNo, 13);

    if (buGun) {
      SpreadsheetApp.flush();
      var d28Val = parseFloat(sheet.getRange(28, 4).getValue()) || 0;
      var h26Val = parseFloat(sheet.getRange(26, 8).getValue()) || 0;
      kHucre.setValue(d28Val).setBackground('#EBF8EE').setFontWeight('bold');
      lHucre.setValue(h26Val).setBackground('#EBF8EE').setFontWeight('bold');
      mHucre.setValue(h26Val > 0 ? d28Val / h26Val : 0).setBackground('#FFF9C4').setFontWeight('bold');
    } else {
      kHucre.setValue('').setBackground(bg);
      lHucre.setValue('').setBackground(bg);
      mHucre.setValue('').setBackground('#FFF9C4');
    }
    kHucre.setNumberFormat('#,##0.00 "₺"');
    lHucre.setNumberFormat('#,##0.00 "₺"');
    mHucre.setNumberFormat('0.00000 "₺"');

    sheet.getRange(satirNo, 14).setBackground('#E2E8F0');

    sheet.getRange(satirNo, 15).setValue(tarihEt).setHorizontalAlignment('center').setBackground(bg);

    var pHucre = sheet.getRange(satirNo, 16);
    var qHucre = sheet.getRange(satirNo, 17);
    if (buGun) {
      var uretimMwh = yillikToplamUretimCek(g, ay, yil);
      pHucre.setValue(uretimMwh).setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.000');
      SpreadsheetApp.flush();
      var pVal = parseFloat(sheet.getRange(satirNo, 16).getValue()) || 0;
      qHucre.setValue(pVal * 1300).setBackground('#EBF8EE').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"');
    } else {
      pHucre.setValue('').setBackground(bg).setNumberFormat('#,##0.000');
      qHucre.setValue('').setBackground(bg).setNumberFormat('#,##0.00 "₺"');
    }
  }

  // Toplam satırları
  var topSatir = gunSayisi + 2;
  sheet.getRange(topSatir, 10).setValue('TOPLAM').setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(topSatir, 11).setFormula('=SUM(K2:K' + (gunSayisi+1) + ')').setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"');
  sheet.getRange(topSatir, 12).setFormula('=SUM(L2:L' + (gunSayisi+1) + ')').setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"');
  SpreadsheetApp.flush();
  var kTop = parseFloat(sheet.getRange(topSatir, 11).getValue()) || 0;
  var lTop = parseFloat(sheet.getRange(topSatir, 12).getValue()) || 0;
  sheet.getRange(topSatir, 13).setValue(lTop > 0 ? kTop / lTop : 0).setBackground('#b7950b').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('0.00000 "₺"');
  sheet.getRange(topSatir, 14).setBackground('#E2E8F0');
  sheet.getRange(topSatir, 15).setValue('TOPLAM').setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(topSatir, 16).setFormula('=SUM(P2:P' + (gunSayisi+1) + ')').setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"');
  sheet.getRange(topSatir, 17).setFormula('=SUM(Q2:Q' + (gunSayisi+1) + ')').setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00 "₺"');
}

// ─── YARDIMCILAR ──────────────────────────────────────────────────────────────

function _fdPtfVerisiniOku(ss, ay, yil, gun) {
  var ptfDizi = [];
  for (var i = 0; i < 24; i++) ptfDizi.push(0);
  var sheet = ss.getSheetByName(CFG_SAYFA_PIYASA);
  if (!sheet || sheet.getLastRow() < 2) return ptfDizi;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function(r) {
    var tarihObj = r[0], saatObj = r[1];
    var rAy, rYil, rGun;
    if (tarihObj instanceof Date) {
      rAy = tarihObj.getMonth() + 1; rYil = tarihObj.getFullYear(); rGun = tarihObj.getDate();
    } else {
      var p = String(tarihObj).split('.');
      if (p.length < 3) return;
      rGun = parseInt(p[0]); rAy = parseInt(p[1]); rYil = parseInt(p[2]);
    }
    if (rAy !== ay || rYil !== yil) return;
    if (gun && rGun !== gun) return;
    var sHour = (saatObj instanceof Date) ? saatObj.getHours() : parseInt(String(saatObj).split(':')[0]);
    if (!isNaN(sHour) && sHour >= 0 && sHour <= 23) ptfDizi[sHour] = parseFloat(r[2]) || 0;
  });
  return ptfDizi;
}

function _fdHesaplananGunuBul(ss, ay, yil) {
  try {
    var sheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);
    if (!sheet || sheet.getLastRow() < 2) return cfgDunTarihi();
    var veriler = sheet.getRange(1, 1, sheet.getLastRow(), 3).getValues();
    for (var i = 0; i < veriler.length; i++) {
      if (String(veriler[i][0]).indexOf('Veri Tarihi') !== -1) {
        var p = String(veriler[i][1]).trim().split('.');
        if (p.length === 3) {
          var gun = parseInt(p[0]), tAy = parseInt(p[1]), tYil = parseInt(p[2]);
          if (tAy === ay && tYil === yil) return new Date(tYil, tAy - 1, gun);
        }
      }
    }
  } catch(e) {}
  return cfgDunTarihi();
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function faturaDetayTest() {
  var r = faturaDetaySayfasiOlustur(7, 2026, 30);  // ← gün de belirtin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
