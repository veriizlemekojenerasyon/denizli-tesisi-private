/**
 * 07_DengesizlikMaliyet.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * "DengesizlikMaliyet_YYYY_MM" sayfasını oluşturur.
 *
 * Sol tablo (A–M) — Saatlik:
 *   A: SAAT
 *   B: ŞEBEKE TAHMİN (MWh)        ← BaglantiNoktalari G sütunu
 *   C: GERÇEK (MWh)                ← AMR_Saatlik B sütunu
 *   D: FARK (MWh)                  = C - B
 *   E: PTF (TL/MWh)
 *   F: SMF (TL/MWh)
 *   G: POZ. DENGESİZLİK (TL/MWh)
 *   H: NEG. DENGESİZLİK (TL/MWh)
 *   I: POZİTİF FARK (TL)           = PozDen - PTF
 *   J: NEGATİF FARK (TL)           = NegDen - PTF
 *   K: [Ayraç]
 *   L: EPİAŞ (TL)
 *   M: TEİAŞ (TL)
 *
 * Sağ tablo (O–R) — Aylık dengesizlik özeti
 *
 * Bağımlılıklar: 01_VGenConfig.gs
 */

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * DengesizlikMaliyet sayfasını oluşturur.
 * @param {number} ay   1-12 (opsiyonel)
 * @param {number} yil  Örn: 2026 (opsiyonel)
 * @param {number} gun  1-31 (opsiyonel, PTF filtresi için)
 */
function dengesizlikMaliyetSayfasiOlustur(ay, yil, gun) {
  try {
    var bugun = new Date();
    ay  = ay  || (bugun.getMonth() + 1);
    yil = yil || bugun.getFullYear();
    var ss  = cfgSsAc();
    if (!gun) gun = cfgBaglantiTarihiOku(ss).getDate();

    var sayfaAdi = CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay);
    var sheet    = cfgSayfayiSifirla(ss, sayfaAdi);

    _dmBasliklariYaz(sheet);

    var baglantiVerisi = _dmBaglantiNoktasiOku(ss);
    var piyasaVerisi   = _dmPiyasaVerisiOku(ss, ay, yil, gun);
    var hesaplananGun  = cfgBaglantiTarihiOku(ss);

    for (var i = 0; i < 24; i++) {
      var satirNo = i + 3;
      var ptf     = piyasaVerisi.ptf[i]    || 0;
      var smf     = piyasaVerisi.smf[i]    || 0;
      var pozDen  = piyasaVerisi.pozDen[i] || 0;
      var negDen  = piyasaVerisi.negDen[i] || 0;

      // A: SAAT
      sheet.getRange(satirNo, 1).setValue(CFG_SAATLER_24[i])
        .setBackground('#1C2B3A').setFontColor('#FFFFFF')
        .setFontWeight('bold').setHorizontalAlignment('center');

      // B: Şebeke Tahmini
      var tahmin = baglantiVerisi[i] || 0;
      sheet.getRange(satirNo, 2).setValue(tahmin).setNumberFormat('0.000')
        .setNote('Kaynak: BaglantiNoktalari!G' + (i + 2));

      // C: Gerçek tüketim — AMR_Saatlik
      var amrDeger = 0;
      var amrSheet = ss.getSheetByName(CFG_SAYFA_AMR_SAATLIK);
      if (amrSheet && amrSheet.getLastRow() >= i + 2) {
        amrDeger = parseFloat(amrSheet.getRange(i + 2, 2).getValue()) || 0;
      }
      sheet.getRange(satirNo, 3).setValue(amrDeger).setNumberFormat('0.000')
        .setNote('Kaynak: AMR_Saatlik B' + (i + 2));

      // D: Fark
      var fark = amrDeger - tahmin;
      sheet.getRange(satirNo, 4).setValue(fark).setNumberFormat('0.000');

      // E–H: Fiyatlar
      sheet.getRange(satirNo, 5).setValue(ptf).setNumberFormat('#,##0.00');
      sheet.getRange(satirNo, 6).setValue(smf).setNumberFormat('#,##0.00');
      sheet.getRange(satirNo, 7).setValue(pozDen).setNumberFormat('#,##0.00');
      sheet.getRange(satirNo, 8).setValue(negDen).setNumberFormat('#,##0.00');

      // I: Pozitif Fark = PozDen - PTF
      var pozFark = pozDen - ptf;
      sheet.getRange(satirNo, 9).setValue(pozFark).setNumberFormat('#,##0.00')
        .setNote('PozDen − PTF = ' + pozDen + ' − ' + ptf);

      // J: Negatif Fark = NegDen - PTF
      var negFark = negDen - ptf;
      sheet.getRange(satirNo, 10).setValue(negFark).setNumberFormat('#,##0.00')
        .setNote('NegDen − PTF = ' + negDen + ' − ' + ptf);

      // K: Ayraç
      sheet.getRange(satirNo, 11).setValue('');

      // L: EPİAŞ
      var epias = Math.abs(fark > 0 ? fark * pozFark : fark * negFark);
      sheet.getRange(satirNo, 12).setValue(epias).setNumberFormat('#,##0.00');

      // M: TEİAŞ
      var teias = 0;
      if (Math.abs(fark) > tahmin * 0.15) {
        teias = Math.abs(fark * Math.max(ptf, smf) * 0.08);
      }
      sheet.getRange(satirNo, 13).setValue(teias).setNumberFormat('#,##0.00');

      // Satır rengi
      sheet.getRange(satirNo, 2, 1, 12).setBackground(i % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    }

    _dmToplamSatirYaz(sheet);
    _dmAylikDengesizlikTablosu(sheet, ss, ay, yil, hesaplananGun);

    SpreadsheetApp.flush();
    Logger.log('✅ ' + sayfaAdi + ' oluşturuldu.');
    return { success: true, sayfa: sayfaAdi, ay: ay, yil: yil };

  } catch(e) {
    Logger.log('❌ dengesizlikMaliyetSayfasiOlustur: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ─── BAŞLIK YAZMA ─────────────────────────────────────────────────────────────

function _dmBasliklariYaz(sheet) {
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);

  // 1. satır grup başlıkları
  sheet.getRange(1, 1, 1, 10).setBackground('#1e3a5f');
  sheet.getRange(1, 1).setValue('SAATLİK DENGESİZLİK ANALİZİ').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);
  sheet.getRange(1, 11).setBackground('#E2E8F0');
  sheet.getRange(1, 12, 1, 2).setBackground('#c0392b');
  sheet.getRange(1, 12).setValue('DENGESİZLİK (TL)').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);
  sheet.getRange(1, 14).setBackground('#E2E8F0');
  sheet.getRange(1, 15, 1, 4).setBackground('#276749');
  sheet.getRange(1, 15).setValue('AYLIK DENGESİZLİK').setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);
  sheet.setRowHeight(1, 36);

  // 2. satır sütun başlıkları
  var solBasliklar = ['SAAT','ŞEBEKE TAHMİN\n(MWh)','GERÇEK\n(MWh)','FARK\n(MWh)','PTF\n(TL/MWh)','SMF\n(TL/MWh)','POZ. DENGESİZLİK\n(TL/MWh)','NEG. DENGESİZLİK\n(TL/MWh)','POZİTİF FARK\n(TL)','NEGATİF FARK\n(TL)'];
  sheet.getRange(2, 1, 1, solBasliklar.length).setValues([solBasliklar])
    .setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.getRange(2, 11).setValue('').setBackground('#E2E8F0');
  sheet.getRange(2, 12).setValue('EPİAŞ (TL)').setBackground('#e74c3c').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(2, 13).setValue('TEİAŞ (TL)').setBackground('#e74c3c').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(2, 14).setValue('').setBackground('#E2E8F0');
  sheet.getRange(2, 15, 1, 4).setValues([['TARİH','EPİAŞ (TL)','TEİAŞ (TL)','TOPLAM (TL)']])
    .setBackground('#2d6a4f').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setRowHeight(2, 44);

  var genislikler = [80,110,90,90,100,100,130,130,110,110,20,110,110,20,100,110,110,120];
  genislikler.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
}

// ─── TOPLAM SATIRI ────────────────────────────────────────────────────────────

function _dmToplamSatirYaz(sheet) {
  var r = 27;
  sheet.getRange(r, 1).setValue('TOP');
  sheet.getRange(r, 2).setFormula('=SUM(B3:B26)').setNumberFormat('0.000');
  sheet.getRange(r, 3).setFormula('=SUM(C3:C26)').setNumberFormat('0.000');
  sheet.getRange(r, 4).setFormula('=SUM(D3:D26)').setNumberFormat('0.000');
  sheet.getRange(r, 9).setFormula('=SUM(I3:I26)').setNumberFormat('#,##0.00');
  sheet.getRange(r, 10).setFormula('=SUM(J3:J26)').setNumberFormat('#,##0.00');
  sheet.getRange(r, 12).setFormula('=SUM(L3:L26)').setNumberFormat('#,##0.00');
  sheet.getRange(r, 13).setFormula('=SUM(M3:M26)').setNumberFormat('#,##0.00');
  sheet.getRange(r, 1, 1, 13).setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold');
}

// ─── AYLIK DENGESİZLİK TABLOSU ───────────────────────────────────────────────

function _dmAylikDengesizlikTablosu(sheet, ss, ay, yil, hesaplananGun) {
  var gunSayisi = new Date(yil, ay, 0).getDate();
  var hesGun    = hesaplananGun ? hesaplananGun.getDate()      : 0;
  var hesAy     = hesaplananGun ? hesaplananGun.getMonth() + 1 : 0;
  var hesYil    = hesaplananGun ? hesaplananGun.getFullYear()  : 0;

  for (var g = 1; g <= gunSayisi; g++) {
    var satirNo = g + 2;
    var bg      = g % 2 === 0 ? '#F7F9FC' : '#FFFFFF';
    var ayKisa  = CFG_AYLAR_KISA[ay] || ay;
    sheet.getRange(satirNo, 15).setValue(g + '.' + ayKisa).setHorizontalAlignment('center').setBackground(bg);

    var pHucre = sheet.getRange(satirNo, 16);
    var qHucre = sheet.getRange(satirNo, 17);
    var rHucre = sheet.getRange(satirNo, 18);

    if (g === hesGun && hesAy === ay && hesYil === yil) {
      SpreadsheetApp.flush();
      var epiasVal = parseFloat(sheet.getRange(27, 12).getValue()) || 0;
      var teiasVal = parseFloat(sheet.getRange(27, 13).getValue()) || 0;
      pHucre.setValue(epiasVal).setBackground('#EBF8EE').setFontWeight('bold');
      qHucre.setValue(teiasVal).setBackground('#EBF8EE');
      rHucre.setValue(epiasVal + teiasVal).setBackground('#EBF8EE').setFontWeight('bold');
    } else {
      pHucre.setValue('').setBackground(bg);
      qHucre.setValue('').setBackground(bg);
      rHucre.setFormula('=P' + satirNo + '+Q' + satirNo).setBackground(bg);
    }
    pHucre.setNumberFormat('#,##0.00');
    qHucre.setNumberFormat('#,##0.00');
    rHucre.setNumberFormat('#,##0.00');
  }

  // Toplam satırı
  var topSatir = gunSayisi + 3;
  sheet.getRange(topSatir, 15).setValue('TOP').setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(topSatir, 16).setFormula('=SUM(P3:P' + (gunSayisi + 2) + ')').setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
  sheet.getRange(topSatir, 17).setFormula('=SUM(Q3:Q' + (gunSayisi + 2) + ')').setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
  sheet.getRange(topSatir, 18).setFormula('=SUM(R3:R' + (gunSayisi + 2) + ')').setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
}

// ─── VERİ OKUMA ───────────────────────────────────────────────────────────────

function _dmBaglantiNoktasiOku(ss) {
  var sheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);
  if (!sheet || sheet.getLastRow() < 25) return _dmBosArray(24);
  return sheet.getRange(2, 7, 24, 1).getValues().map(function(r) { return parseFloat(r[0]) || 0; });
}

function _dmPiyasaVerisiOku(ss, ay, yil, gun) {
  var sonuc = { ptf: [], smf: [], pozDen: [], negDen: [] };
  for (var i = 0; i < 24; i++) { sonuc.ptf.push(0); sonuc.smf.push(0); sonuc.pozDen.push(0); sonuc.negDen.push(0); }

  var sheet = ss.getSheetByName(CFG_SAYFA_PIYASA);
  if (!sheet || sheet.getLastRow() < 2) return sonuc;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues().forEach(function(r) {
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
    if (isNaN(sHour) || sHour < 0 || sHour > 23) return;
    sonuc.ptf[sHour]    = parseFloat(r[2]) || 0;
    sonuc.smf[sHour]    = parseFloat(r[3]) || 0;
    sonuc.pozDen[sHour] = parseFloat(r[4]) || 0;
    sonuc.negDen[sHour] = parseFloat(r[5]) || 0;
  });

  return sonuc;
}

function _dmBosArray(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

// ─── TEST ─────────────────────────────────────────────────────────────────────

function dengesizlikMaliyetTest() {
  var r = dengesizlikMaliyetSayfasiOlustur(7, 2026, 30);  // ← gün de belirtin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
