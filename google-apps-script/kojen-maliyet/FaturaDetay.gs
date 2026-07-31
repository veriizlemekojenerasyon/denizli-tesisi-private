/**
 * FaturaDetay.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * "FaturaDetay_YYYY_MM" sayfasını oluşturur.
 *
 * Sayfa yapısı (görsele birebir):
 *
 * Sol tablo (A–H, saatlik 24 saat + toplam):
 *   A: SAAT
 *   B: DENGESİZLİK ALIŞ SATIŞ (TL)
 *   C: EPİAŞ (TL)
 *   D: DAĞITIM+YEKDEM (TL)
 *   E: KORUMA FATURA (TL)
 *   F: VTC FATURA (TL)
 *   G: TAHMİN (MWh)
 *   H: GERÇEK (MWh)
 *
 * Orta tablo (J–M, aylık özet):
 *   J: Tarih (1.Tem … 31.Tem)
 *   K: AYLIK TOPLAM MALİYET (TL)
 *   L: ŞEBEKE TÜKETİM (kWh)
 *   M: BİRİM MALİYET (TL/kWh) — sarı vurgulu
 *
 * Sağ tablo (O–Q, aylık kojen):
 *   O: Tarih
 *   P: KOJEN ÜRETİM (kWh)
 *   Q: KOJEN MALİYET (TL)
 *
 * Spreadsheet ID: 1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY
 */

// ─── SABİTLER ─────────────────────────────────────────────────────────────────

var FD_SPREADSHEET_ID = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';
var FD_SHEET_PREFIX   = 'Faturalasma_';

var FD_SAATLER = [
  '00:00:00','01:00:00','02:00:00','03:00:00','04:00:00','05:00:00',
  '06:00:00','07:00:00','08:00:00','09:00:00','10:00:00','11:00:00',
  '12:00:00','13:00:00','14:00:00','15:00:00','16:00:00','17:00:00',
  '18:00:00','19:00:00','20:00:00','21:00:00','22:00:00','23:00:00'
];

var FD_AYLAR = ['','Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * FaturaDetay sayfasını oluşturur.
 * @param {number} ay   1-12 (opsiyonel)
 * @param {number} yil  Örn: 2026 (opsiyonel)
 * @param {number} gun  1-31 (opsiyonel, PTF filtresi için; yoksa BaglantiNoktalari'nden okunur)
 */
function faturaDetaySayfasiOlustur(ay, yil, gun) {
  try {
    var bugun = new Date();
    ay  = ay  || (bugun.getMonth() + 1);
    yil = yil || bugun.getFullYear();
    // gun belirtilmemişse BaglantiNoktalari'nden veya dünden al
    if (!gun) {
      var ss0 = SpreadsheetApp.openById(FD_SPREADSHEET_ID);
      var bgTarih = fdHesaplananGunuBul(ss0, ay, yil);
      gun = bgTarih ? bgTarih.getDate() : (bugun.getDate() - 1 || 1);
    }

    var ss       = SpreadsheetApp.openById(FD_SPREADSHEET_ID);
    var sayfaAdi = FD_SHEET_PREFIX + yil + '_' + fdPad2(ay);

    // Varsa sil, sıfırdan oluştur
    var mevcutSheet = ss.getSheetByName(sayfaAdi);
    if (mevcutSheet) ss.deleteSheet(mevcutSheet);
    var sheet = ss.insertSheet(sayfaAdi);

    // ── Başlıkları yaz ────────────────────────────────────────────────────────
    fdBasliklariYaz(sheet, ay, yil);

    // ── Saatlik satırları yaz ─────────────────────────────────────────────────
    fdSaatlikSatirlariYaz(sheet, ay, yil, gun);

    // ── Toplam satırı ─────────────────────────────────────────────────────────
    fdToplamSatirYaz(sheet);

    // ── Özet satırları ────────────────────────────────────────────────────────
    fdOzetSatirlariYaz(sheet, ay, yil, ss);

    // ── Aylık tablolar ────────────────────────────────────────────────────────
    var hesaplananGun = fdHesaplananGunuBul(ss, ay, yil);
    fdAylikTablolariYaz(sheet, ay, yil, hesaplananGun);

    SpreadsheetApp.flush();
    Logger.log('✅ ' + sayfaAdi + ' oluşturuldu.');
    return { success: true, sayfa: sayfaAdi };

  } catch (err) {
    Logger.log('❌ faturaDetaySayfasiOlustur hata: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ─── BAŞLIKLAR ────────────────────────────────────────────────────────────────

function fdBasliklariYaz(sheet, ay, yil) {
  // Freeze önce
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // 1. satır: Sütun başlıkları — sol tablo
  var solBasliklar = [
    'SAAT',
    'DENGESİZLİK\nALIŞ SATIŞ (TL)',
    'EPİAŞ (TL)',
    'DAĞITIM+\nYEKDEM (TL)',
    'KORUMA\nFATURA (TL)',
    'VTC\nFATURA (TL)',
    'TAHMİN\n(MWh)',
    'GERÇEK\n(MWh)'
  ];
  sheet.getRange(1, 1, 1, solBasliklar.length)
    .setValues([solBasliklar])
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center')
    .setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(1, 48);

  // I: boş ayraç
  sheet.getRange(1, 9).setValue('').setBackground('#E2E8F0');

  // Orta tablo başlıkları (J–M)
  var ortaBasliklar = ['', 'AYLIK TOPLAM\nMALİYET (TL)', 'ŞEBEKE TÜKETİM\n(kWh)', 'BİRİM MALİYET\n(TL/kWh)'];
  sheet.getRange(1, 10, 1, ortaBasliklar.length)
    .setValues([ortaBasliklar])
    .setBackground('#2c5282').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center')
    .setVerticalAlignment('middle').setWrap(true);

  // M (BİRİM MALİYET) sarı vurgulu
  sheet.getRange(1, 13)
    .setBackground('#b7950b').setFontColor('#FFFFFF');

  // N: boş ayraç
  sheet.getRange(1, 14).setValue('').setBackground('#E2E8F0');

  // Sağ tablo başlıkları (O–Q) — Kojen
  var sagBasliklar = ['', 'KOJEN ÜRETİM\n(kWh)', 'KOJEN MALİYET\n(TL)'];
  sheet.getRange(1, 15, 1, sagBasliklar.length)
    .setValues([sagBasliklar])
    .setBackground('#276749').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center')
    .setVerticalAlignment('middle').setWrap(true);

  // Sütun genişlikleri
  var genislikler = [80, 130, 110, 130, 120, 110, 90, 90, 20, 90, 130, 120, 120, 20, 90, 120, 120];
  for (var i = 0; i < genislikler.length; i++) {
    sheet.setColumnWidth(i + 1, genislikler[i]);
  }
}

// ─── SAATLİK SATIRLAR ─────────────────────────────────────────────────────────

function fdSaatlikSatirlariYaz(sheet, ay, yil, gun) {
  var dmSayfaAdi = 'DengesizlikMaliyet_' + yil + '_' + fdPad2(ay);
  var ss         = SpreadsheetApp.openById(FD_SPREADSHEET_ID);
  var dmSheet    = ss.getSheetByName(dmSayfaAdi);
  // AMR_Saatlik doğrudan gerçek tüketim için kullanılır
  var amrSheet   = ss.getSheetByName('AMR_Saatlik');
  // BaglantiNoktalari tahmin (şebeke tahmini) için
  var bagSheet   = ss.getSheetByName('BaglantiNoktalari');

  // DengesizlikMaliyet'ten D, G, H sütunlarını oku (satır 3-26) — dengesizlik hesabı için
  var dmVeriler = null;
  if (dmSheet && dmSheet.getLastRow() >= 26) {
    dmVeriler = dmSheet.getRange(3, 4, 24, 5).getValues(); // D,E,F,G,H sütunları
  }

  // PiyasaFiyatlari'nden PTF değerlerini oku (ay/yıl/gün filtreli)
  var ptfMap = fdPtfVerisiniOku(ss, ay, yil, gun);

  // Maliyet sayfasından YEKDEM(F), Dağıtım(G), VTC(H) sabit değerlerini oku
  var yekdem = 0, dagitim = 0, vtc = 0;
  var maliyetSheet = ss.getSheetByName('Maliyet');
  if (maliyetSheet && maliyetSheet.getLastRow() >= 2) {
    var malVeriler = maliyetSheet.getRange(2, 2, maliyetSheet.getLastRow() - 1, 7).getValues();
    for (var m = 0; m < malVeriler.length; m++) {
      if (parseInt(malVeriler[m][0]) === ay && parseInt(malVeriler[m][1]) === yil) {
        yekdem  = parseFloat(malVeriler[m][4]) || 0; // F sütunu (index 4 = B'den 5. sütun)
        dagitim = parseFloat(malVeriler[m][5]) || 0; // G sütunu
        vtc     = parseFloat(malVeriler[m][6]) || 0; // H sütunu
        break;
      }
    }
  }
  Logger.log('Maliyet: YEKDEM=' + yekdem + ' Dagitim=' + dagitim + ' VTC=' + vtc + ' | ay=' + ay + ' yil=' + yil);

  // Maliyet bulunamadıysa uyarı log'la — 0 ile devam eder
  if (yekdem === 0 && dagitim === 0 && vtc === 0) {
    Logger.log('UYARI: Maliyet sayfasinda ' + ay + '/' + yil + ' donemi bulunamadi! Dagitim+YEKDEM 0 yazilacak.');
  }

  for (var i = 0; i < 24; i++) {
    var satirNo = i + 2;
    var bg      = i % 2 === 0 ? '#F7F9FC' : '#FFFFFF';
    var amrRow  = i + 2; // AMR_Saatlik 2. satırdan başlar
    var bagRow  = i + 2; // BaglantiNoktalari 2. satırdan başlar
    var dmSatir = i + 3; // DengesizlikMaliyet 3. satırdan başlar

    // A: SAAT
    sheet.getRange(satirNo, 1)
      .setValue(FD_SAATLER[i])
      .setBackground('#1C2B3A').setFontColor('#FFFFFF')
      .setFontWeight('bold').setHorizontalAlignment('center');

    // Tahmin: BaglantiNoktalari G sütunu = Şebeke Hattı Tüketimi (MWh)
    // Sütun yapısı: A=SAAT|B=Tüketim Noktası|C=GM1|D=GM2|E=GM3|F=Toplam Kojen|G=Şebeke Hattı
    var tahminVal = 0;
    if (bagSheet && bagSheet.getLastRow() >= bagRow) {
      tahminVal = parseFloat(bagSheet.getRange(bagRow, 7).getValue()) || 0; // G sütunu
    }
    if (tahminVal === 0 && dmSheet && dmSheet.getLastRow() >= dmSatir) {
      tahminVal = parseFloat(dmSheet.getRange(dmSatir, 2).getValue()) || 0; // DM B sütunu fallback
    }

    // Gerçek tüketim: AMR_Saatlik B sütunu MWh olarak gelir — dönüşüm gerekmez
    var gercekVal = 0;
    if (amrSheet && amrSheet.getLastRow() >= amrRow) {
      gercekVal = parseFloat(amrSheet.getRange(amrRow, 2).getValue()) || 0; // MWh
    }
    // AMR yoksa DM'den oku (geriye dönük uyumluluk)
    if (gercekVal === 0 && dmSheet && dmSheet.getLastRow() >= dmSatir) {
      gercekVal = parseFloat(dmSheet.getRange(dmSatir, 3).getValue()) || 0;
    }

    // B: DENGESİZLİK ALIŞ SATIŞ
    var bVal = 0;
    if (dmVeriler) {
      var d = parseFloat(dmVeriler[i][0]) || 0; // D sütunu (Fark)
      var g = parseFloat(dmVeriler[i][3]) || 0; // G sütunu (PozFark)
      var h = parseFloat(dmVeriler[i][4]) || 0; // H sütunu (NegFark)
      bVal = d > 0 ? d * g : d * h;
      sheet.getRange(satirNo, 2)
        .setValue(bVal)
        .setBackground(bg).setNumberFormat('#,##0.00')
        .setNote('Kaynak: ' + dmSayfaAdi + '\nFark(D)=' + d.toFixed(3) + ' | PozFark(G)=' + g.toFixed(2) + ' | NegFark(H)=' + h.toFixed(2));
    } else {
      sheet.getRange(satirNo, 2).setValue(0).setBackground(bg).setNumberFormat('#,##0.00');
    }

    // C: EPİAŞ (TL) = TAHMİN × PTF
    var ptf = ptfMap[i] || 0;
    sheet.getRange(satirNo, 3)
      .setValue(tahminVal * ptf)
      .setBackground(bg).setNumberFormat('#,##0.00')
      .setNote('EPIAS = TAHMIN x PTF\nTAHMIN=' + tahminVal.toFixed(3) + ' MWh\nPTF=' + ptf.toFixed(2) + ' TL/MWh\nSaat: ' + FD_SAATLER[i]);

    // D: DAĞITIM+YEKDEM (TL) = GERÇEK × (YEKDEM + DAĞITIM + VTC)
    var dagYekVal = gercekVal * (yekdem + dagitim + vtc);
    sheet.getRange(satirNo, 4)
      .setValue(dagYekVal)
      .setBackground(bg).setNumberFormat('#,##0.00')
      .setNote('DAGITIM+YEKDEM = GERCEK x (YEKDEM+DAGITIM+VTC)\nGERCEK=' + gercekVal.toFixed(3) +
               ' MWh\nYEKDEM=' + yekdem + ' | Dagitim=' + dagitim + ' | VTC=' + vtc +
               '\nToplam katsayi=' + (yekdem+dagitim+vtc).toFixed(2) + ' TL/MWh\nKaynak: Maliyet sayfasi F,G,H');

    // E: KORUMA FATURA (TL) = B>0 ? B : 0
    var korumaVal = bVal > 0 ? bVal : 0;
    sheet.getRange(satirNo, 5)
      .setValue(korumaVal)
      .setBackground(bg).setNumberFormat('#,##0.00')
      .setNote('KORUMA FATURA = EGER(B>0; B; 0)\nB=' + bVal.toFixed(2));

    // F: VTC FATURA (TL) = B<0 ? B : 0
    var vtcFaturaVal = bVal < 0 ? bVal : 0;
    sheet.getRange(satirNo, 6)
      .setValue(vtcFaturaVal)
      .setBackground(bg).setNumberFormat('#,##0.00')
      .setNote('VTC FATURA = EGER(B<0; B; 0)\nB=' + bVal.toFixed(2));

    // G: TAHMİN (MWh) — BaglantiNoktalari G sütunu (Şebeke Hattı Tüketimi)
    sheet.getRange(satirNo, 7)
      .setValue(tahminVal)
      .setBackground(bg).setNumberFormat('0.000')
      .setNote('Kaynak: BaglantiNoktalari!G' + bagRow + ' (Sebeke Hatti Tuketimi MWh)');

    // H: GERÇEK (MWh) — AMR_Saatlik B sütunundan doğrudan (MWh)
    sheet.getRange(satirNo, 8)
      .setValue(gercekVal)
      .setBackground(bg).setNumberFormat('0.000')
      .setNote('Kaynak: AMR_Saatlik B' + amrRow + ' (MWh - VTC API doğrudan MWh yazar)');

    // I: Boş ayraç
    sheet.getRange(satirNo, 9).setBackground('#E2E8F0');
  }
}

// ─── TOPLAM SATIRI ────────────────────────────────────────────────────────────

function fdToplamSatirYaz(sheet) {
  var toplamSatir = 26; // 24 saat + başlık + toplam

  sheet.getRange(toplamSatir, 1).setValue('TOPLAM')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');

  // B–H: SUM formülleri
  for (var s = 2; s <= 8; s++) {
    var sutunHarf = String.fromCharCode(64 + s);
    sheet.getRange(toplamSatir, s)
      .setFormula('=SUM(' + sutunHarf + '2:' + sutunHarf + '25)')
      .setNumberFormat(s <= 6 ? '#,##0.00' : '0.000');
  }

  sheet.getRange(toplamSatir, 1, 1, 8)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold');

  sheet.getRange(toplamSatir, 9).setBackground('#E2E8F0');
}

// ─── ÖZET SATIRLARI ───────────────────────────────────────────────────────────

function fdOzetSatirlariYaz(sheet, ay, yil, ss) {
  // 28. satır: TOPLAM özet
  sheet.getRange(28, 1).setValue('TOPLAM')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  sheet.getRange(28, 2, 1, 3).setBackground('#1e3a5f');

  // D28 = Maliyet!K2 + C26 + D26 + F26 + DengesizlikMaliyet!R29 - E26
  var maliyetSheet = ss.getSheetByName('Maliyet');
  var dmSayfaAdi   = 'DengesizlikMaliyet_' + yil + '_' + fdPad2(ay);
  var dmSheet      = ss.getSheetByName(dmSayfaAdi);

  var maliyetK2 = 0, c26 = 0, d26 = 0, f26 = 0, dmR29 = 0, e26 = 0;

  if (maliyetSheet && maliyetSheet.getLastRow() >= 2) {
    maliyetK2 = parseFloat(maliyetSheet.getRange(2, 11).getValue()) || 0;
  }
  c26  = parseFloat(sheet.getRange(26, 3).getValue()) || 0;
  d26  = parseFloat(sheet.getRange(26, 4).getValue()) || 0;
  e26  = parseFloat(sheet.getRange(26, 5).getValue()) || 0;
  f26  = parseFloat(sheet.getRange(26, 6).getValue()) || 0;
  if (dmSheet && dmSheet.getLastRow() >= 29) {
    dmR29 = parseFloat(dmSheet.getRange(29, 18).getValue()) || 0;
  }

  var d28Val = maliyetK2 + c26 + d26 + f26 + dmR29 - e26;

  sheet.getRange(28, 4)
    .setValue(d28Val)
    .setBackground('#276749').setFontColor('#FFFFFF')
    .setFontWeight('bold').setNumberFormat('#,##0.00')
    .setNote('D28 = Maliyet!K2 + C26 + D26 + F26 + ' + dmSayfaAdi + '!R29 − E26\n' +
             'Maliyet!K2=' + maliyetK2.toFixed(2) +
             ' | C26=' + c26.toFixed(2) +
             ' | D26=' + d26.toFixed(2) +
             ' | F26=' + f26.toFixed(2) +
             ' | DM!R29=' + dmR29.toFixed(2) +
             ' | E26=' + e26.toFixed(2));

  // ŞEBEKE
  sheet.getRange(28, 7).setValue('ŞEBEKE')
    .setBackground('#2c5282').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(28, 8).setFormula('=H26')
    .setNumberFormat('0.000')
    .setBackground('#EEF4FF');
}

// ─── AYLIK TABLOLAR ───────────────────────────────────────────────────────────

function fdAylikTablolariYaz(sheet, ay, yil, hesaplananGun) {
  var gunSayisi = new Date(yil, ay, 0).getDate();
  var ayKisa    = FD_AYLAR[ay] || ay;

  var hesGun = hesaplananGun ? hesaplananGun.getDate()      : 0;
  var hesAy  = hesaplananGun ? hesaplananGun.getMonth() + 1 : 0;
  var hesYil = hesaplananGun ? hesaplananGun.getFullYear()  : 0;

  for (var g = 1; g <= gunSayisi; g++) {
    var satirNo = g + 1;
    var bg      = g % 2 === 0 ? '#F7F9FC' : '#FFFFFF';
    var tarihEt = g + '.' + ayKisa;
    var buGun   = (g === hesGun && hesAy === ay && hesYil === yil);

    // J: Tarih
    sheet.getRange(satirNo, 10).setValue(tarihEt)
      .setHorizontalAlignment('center').setBackground(bg);

    // K: Aylık Toplam Maliyet — D28 sabit değer olarak oku
    var kHucre = sheet.getRange(satirNo, 11);
    if (buGun) {
      SpreadsheetApp.flush();
      var d28Val = parseFloat(sheet.getRange(28, 4).getValue()) || 0;
      kHucre.setValue(d28Val)
        .setBackground('#EBF8EE').setFontWeight('bold')
        .setNote('Kaynak: D28 (sabit değer kaydedildi)\nTarih: ' + tarihEt);
    } else {
      kHucre.setValue('').setBackground(bg);
    }
    kHucre.setNumberFormat('#,##0.00');

    // L: Şebeke Tüketim — H26 sabit değer olarak oku
    var lHucre = sheet.getRange(satirNo, 12);
    if (buGun) {
      SpreadsheetApp.flush();
      var h26Val = parseFloat(sheet.getRange(26, 8).getValue()) || 0;
      lHucre.setValue(h26Val)
        .setBackground('#EBF8EE').setFontWeight('bold')
        .setNote('Kaynak: H26 (sabit değer kaydedildi)\nTarih: ' + tarihEt);
    } else {
      lHucre.setValue('').setBackground(bg);
    }
    lHucre.setNumberFormat('#,##0.00');

    // M: Birim Maliyet = K / L (GAS hesaplar)
    var mHucre = sheet.getRange(satirNo, 13);
    if (buGun) {
      // K ve L değerleri formül — flush yapıp oku
      SpreadsheetApp.flush();
      var kVal = parseFloat(sheet.getRange(satirNo, 11).getValue()) || 0;
      var lVal = parseFloat(sheet.getRange(satirNo, 12).getValue()) || 0;
      var mVal = lVal > 0 ? kVal / lVal : 0;
      mHucre.setValue(mVal)
        .setBackground('#FFF9C4').setFontWeight('bold')
        .setNote('Birim Maliyet = K' + satirNo + ' / L' + satirNo + '\nK=' + kVal.toFixed(2) + ' | L=' + lVal.toFixed(2));
    } else {
      mHucre.setValue('').setBackground('#FFF9C4');
    }
    mHucre.setNumberFormat('0.00000');

    sheet.getRange(satirNo, 14).setBackground('#E2E8F0');

    // O: Tarih, P: Kojen Üretim, Q: Kojen Maliyet
    sheet.getRange(satirNo, 15).setValue(tarihEt)
      .setHorizontalAlignment('center').setBackground(bg);

    var pHucre = sheet.getRange(satirNo, 16);
    if (buGun) {
      // Yıllık üretim verisini harici Sheets'ten çek
      var uretimMwh = yillikToplamUretimCek(g, ay, yil);
      pHucre.setValue(uretimMwh)
        .setBackground('#EBF8EE').setFontWeight('bold')
        .setNumberFormat('#,##0.000')
        .setNote('Kaynak: YillikEnerjiToplam-2026\nTarih: ' + tarihEt + '\nToplam Üretim: ' + uretimMwh + ' MWh');
    } else {
      pHucre.setValue('').setBackground(bg).setNumberFormat('#,##0.000');
    }

    var qHucre = sheet.getRange(satirNo, 17);
    if (buGun) {
      var uretimMwh = parseFloat(sheet.getRange(satirNo, 16).getValue()) || 0;
      qHucre.setValue(uretimMwh * 1300)
        .setBackground('#EBF8EE').setFontWeight('bold')
        .setNumberFormat('#,##0.00')
        .setNote('Kojen Maliyet = P' + satirNo + ' × 1300\n= ' + uretimMwh + ' × 1300');
    } else {
      qHucre.setValue('').setBackground(bg).setNumberFormat('#,##0.00');
    }
  }

  // TOPLAM satırları
  var toplamSatir = gunSayisi + 2;

  sheet.getRange(toplamSatir, 10).setValue('TOPLAM')
    .setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(toplamSatir, 11)
    .setFormula('=SUM(K2:K' + (gunSayisi + 1) + ')')
    .setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
  sheet.getRange(toplamSatir, 12)
    .setFormula('=SUM(L2:L' + (gunSayisi + 1) + ')')
    .setBackground('#2c5282').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
  SpreadsheetApp.flush();
  var kTop = parseFloat(sheet.getRange(toplamSatir, 11).getValue()) || 0;
  var lTop = parseFloat(sheet.getRange(toplamSatir, 12).getValue()) || 0;
  sheet.getRange(toplamSatir, 13)
    .setValue(lTop > 0 ? kTop / lTop : 0)
    .setBackground('#b7950b').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('0.00000')
    .setNote('Aylık Birim Maliyet = K Toplam / L Toplam\nK=' + kTop.toFixed(2) + ' | L=' + lTop.toFixed(2));
  sheet.getRange(toplamSatir, 14).setBackground('#E2E8F0');

  sheet.getRange(toplamSatir, 15).setValue('TOPLAM')
    .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(toplamSatir, 16)
    .setFormula('=SUM(P2:P' + (gunSayisi + 1) + ')')
    .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
  sheet.getRange(toplamSatir, 17)
    .setFormula('=SUM(Q2:Q' + (gunSayisi + 1) + ')')
    .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
}

// ─── YARDIMCILAR ──────────────────────────────────────────────────────────────

/**
 * PiyasaFiyatlari sayfasından ay/yıl ve gün için 24 saatlik PTF dizisi döner.
 * @param {number} gun - Filtrelenecek gün (1-31); 0 veya undefined ise gün filtresi uygulanmaz
 * @returns {Array} 24 elemanlı PTF dizisi (index=saat)
 */
function fdPtfVerisiniOku(ss, ay, yil, gun) {
  var ptfDizi = [];
  for (var i = 0; i < 24; i++) ptfDizi.push(0);

  var sheet = ss.getSheetByName('PiyasaFiyatlari');
  if (!sheet || sheet.getLastRow() < 2) return ptfDizi;

  var veriler = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  veriler.forEach(function(r) {
    var tarihObj = r[0];
    var saatObj  = r[1];
    var ptf      = parseFloat(r[2]) || 0;

    var rAy, rYil, rGun;
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
    if (rAy !== ay || rYil !== yil) return;
    // Gün filtresi — belirtilmişse kontrol et
    if (gun && rGun !== gun) return;

    var sHour;
    if (saatObj instanceof Date) {
      sHour = saatObj.getHours();
    } else {
      sHour = parseInt(String(saatObj).split(':')[0]);
    }
    if (!isNaN(sHour) && sHour >= 0 && sHour <= 23) {
      ptfDizi[sHour] = ptf;
    }
  });

  return ptfDizi;
}

function fdPad2(n) { return n < 10 ? '0' + n : String(n); }

/**
 * BaglantiNoktalari sayfasındaki "Veri Tarihi" hücresinden hesaplanan günü bulur.
 * Bulamazsa dünün tarihini döner.
 */
function fdHesaplananGunuBul(ss, ay, yil) {
  try {
    var sheet = ss.getSheetByName('BaglantiNoktalari');
    if (!sheet) return fdDunTarihi();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return fdDunTarihi();

    var veriler = sheet.getRange(1, 1, lastRow, 3).getValues();
    for (var i = 0; i < veriler.length; i++) {
      if (String(veriler[i][0]).indexOf('Veri Tarihi') !== -1) {
        var tarihStr = String(veriler[i][1]).trim(); // GG.AA.YYYY
        var parcalar = tarihStr.split('.');
        if (parcalar.length === 3) {
          var gun  = parseInt(parcalar[0]);
          var tAy  = parseInt(parcalar[1]);
          var tYil = parseInt(parcalar[2]);
          if (tAy === ay && tYil === yil) {
            return new Date(tYil, tAy - 1, gun);
          }
        }
      }
    }
    return fdDunTarihi();
  } catch(e) {
    return fdDunTarihi();
  }
}

function fdDunTarihi() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function faturaDetayTest() {
  var r = faturaDetaySayfasiOlustur(7, 2026, 30); // ← gün de belirtin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
