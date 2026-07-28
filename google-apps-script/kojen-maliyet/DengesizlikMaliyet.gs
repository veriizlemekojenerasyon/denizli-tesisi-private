/**
 * DengesizlikMaliyet.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * "DengesizlikMaliyet" sayfasını oluşturur.
 *
 * Sol tablo (A–L) — Saatlik:
 *   A: SAAT
 *   B: ŞEBEKE TAHMİN (MWh)   ← BaglantiNoktalari G sütunu (Şebeke Hattı Tüketimi)
 *   C: GERÇEK (MWh)           ← AMR saatlik sayfası B sütunu
 *   D: FARK (MWh)             = C - B
 *   E: PTF (TL/MWh)           ← PiyasaFiyatlari C sütunu
 *   F: SMF (TL/MWh)           ← PiyasaFiyatlari D sütunu
 *   G: POZ. DENGESİZLİK (TL/MWh)  ← PiyasaFiyatlari E sütunu
 *   H: NEG. DENGESİZLİK (TL/MWh)  ← PiyasaFiyatlari F sütunu
 *   I: POZİTİF FARK (TL)      = D>0 ? D*G : 0
 *   J: NEGATİF FARK (TL)      = D<0 ? D*H : 0
 *
 * Orta tablo (L–M) — DENGESİZLİK (TL):
 *   L: EPİAŞ (TL)             = I + J
 *   M: TEİAŞ (TL)             (manuel giriş / boş)
 *
 * Sağ tablo (O–R) — AYLIK DENGESİZLİK:
 *   O: Tarih/Gün
 *   P: EPİAŞ (TL)
 *   Q: TEİAŞ (TL)
 *   R: TOPLAM (TL)
 *
 * Spreadsheet ID: 1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY
 */

// ─── SABİTLER ─────────────────────────────────────────────────────────────────

var DM_SPREADSHEET_ID = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';
var DM_SHEET_PREFIX   = 'DengesizlikMaliyet_';

var DM_SAATLER = [
  '00:00:00','01:00:00','02:00:00','03:00:00','04:00:00','05:00:00',
  '06:00:00','07:00:00','08:00:00','09:00:00','10:00:00','11:00:00',
  '12:00:00','13:00:00','14:00:00','15:00:00','16:00:00','17:00:00',
  '18:00:00','19:00:00','20:00:00','21:00:00','22:00:00','23:00:00'
];

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * DengesizlikMaliyet sayfasını oluşturur.
 * @param {number} ay   1-12 (opsiyonel)
 * @param {number} yil  Örn: 2026 (opsiyonel)
 */
function dengesizlikMaliyetSayfasiOlustur(ay, yil) {
  try {
    var bugun = new Date();
    ay  = ay  || (bugun.getMonth() + 1);
    yil = yil || bugun.getFullYear();

    var ss       = SpreadsheetApp.openById(DM_SPREADSHEET_ID);
    var sayfaAdi = DM_SHEET_PREFIX + yil + '_' + dmPad2(ay);
    var sheet    = dmGetOrCreateSheet(ss, sayfaAdi);

    sheet.clear();
    try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch(e) {}

    // ── Başlıkları yaz ────────────────────────────────────────────────────────
    dmBasliklariYaz(sheet);
    // ── Veri kaynaklarını oku ─────────────────────────────────────────────────
    var baglantiVerisi  = dmBaglantiNoktasiOku(ss);        // B sütunu (Şebeke Tahmini)
    var amrSayfaAdi     = dmAmrSayfaAdiBul(ss, ay, yil);   // AMR_YYYYMMDD sayfa adı
    var piyasaVerisi    = dmPiyasaVerisiOku(ss, ay, yil);  // PTF, SMF, PozDen, NegDen

    // ── Saatlik veriler ───────────────────────────────────────────────────────
    var hesaplananGun = dmBaglantiTarihiOku(ss);

    for (var i = 0; i < 24; i++) {
      var saat    = DM_SAATLER[i];
      var satirNo = i + 3;
      var bagRow  = i + 2; // BaglantiNoktalari 2. satırdan başlar
      var amrRow  = i + 2; // AMR sayfası 2. satırdan başlar

      var ptf     = piyasaVerisi.ptf[i]    || 0;
      var smf     = piyasaVerisi.smf[i]    || 0;
      var pozDen  = piyasaVerisi.pozDen[i] || 0;
      var negDen  = piyasaVerisi.negDen[i] || 0;

      // A: SAAT
      sheet.getRange(satirNo, 1).setValue(saat)
        .setBackground('#1C2B3A').setFontColor('#FFFFFF')
        .setFontWeight('bold').setHorizontalAlignment('center');

      // B: Şebeke Tahmini — BaglantiNoktalari B sütundan sabit değer
      var tahmin = baglantiVerisi[i] || 0;
      sheet.getRange(satirNo, 2)
        .setValue(tahmin)
        .setNumberFormat('0.000')
        .setNote('Kaynak: BaglantiNoktalari!B' + bagRow);

      // C: Gerçek — AMR_YYYYMMDD B sütunu sabit değer
      var amrDeger = 0;
      if (amrSayfaAdi) {
        var amrSheet = ss.getSheetByName(amrSayfaAdi);
        if (amrSheet && amrSheet.getLastRow() >= amrRow) {
          amrDeger = parseFloat(amrSheet.getRange(amrRow, 2).getValue()) || 0;
        }
      }
      sheet.getRange(satirNo, 3)
        .setValue(amrDeger)
        .setNumberFormat('0.000')
        .setNote('Kaynak: ' + (amrSayfaAdi || 'AMR bulunamadı') + ' B' + amrRow);

      // D: Fark = Gerçek - Tahmin (sabit hesap)
      var fark = amrDeger - tahmin;
      sheet.getRange(satirNo, 4)
        .setValue(fark)
        .setNumberFormat('0.000')
        .setNote('Hesaplama: Gerçek − Tahmin = ' + amrDeger + ' − ' + tahmin);

      // E–H: PTF, SMF, PozDen, NegDen (sabit değer — PiyasaFiyatlari'nden okundu)
      sheet.getRange(satirNo, 5).setValue(ptf).setNumberFormat('#,##0.00')
        .setNote('Kaynak: PiyasaFiyatlari PTF\nSaat: ' + saat);
      sheet.getRange(satirNo, 6).setValue(smf).setNumberFormat('#,##0.00')
        .setNote('Kaynak: PiyasaFiyatlari SMF\nSaat: ' + saat);
      sheet.getRange(satirNo, 7).setValue(pozDen).setNumberFormat('#,##0.00')
        .setNote('Kaynak: PiyasaFiyatlari Pozitif Dengesizlik Fiyatı\nSaat: ' + saat);
      sheet.getRange(satirNo, 8).setValue(negDen).setNumberFormat('#,##0.00')
        .setNote('Kaynak: PiyasaFiyatlari Negatif Dengesizlik Fiyatı\nSaat: ' + saat);

      // I: Pozitif Fark (TL) = PozDen - PTF
      var pozFark = pozDen - ptf;
      sheet.getRange(satirNo, 9)
        .setValue(pozFark)
        .setNumberFormat('#,##0.00')
        .setNote('Pozitif Fark = PozDen − PTF = ' + pozDen + ' − ' + ptf);

      // J: Negatif Fark (TL) = NegDen - PTF
      var negFark = negDen - ptf;
      sheet.getRange(satirNo, 10)
        .setValue(negFark)
        .setNumberFormat('#,##0.00')
        .setNote('Negatif Fark = NegDen − PTF = ' + negDen + ' − ' + ptf);

      // K: Boş ayraç
      sheet.getRange(satirNo, 11).setValue('');

      // L: EPİAŞ = ABS(D>0 ? D*pozFark : D*negFark)
      var epias = Math.abs(fark > 0 ? fark * pozFark : fark * negFark);
      sheet.getRange(satirNo, 12)
        .setValue(epias)
        .setNumberFormat('#,##0.00')
        .setNote('EPİAŞ = MUTLAK(EĞER(D>0; D×I; D×J))\nFark: ' + fark.toFixed(3) + '\nPozFark: ' + pozFark.toFixed(2) + '\nNegFark: ' + negFark.toFixed(2));

      // M: TEİAŞ = ABS(EĞER(ABS(D)>(B*0.15); D*MAX(PTF,SMF)*0.08))
      var teias = 0;
      if (Math.abs(fark) > tahmin * 0.15) {
        teias = Math.abs(fark * Math.max(ptf, smf) * 0.08);
      }
      sheet.getRange(satirNo, 13)
        .setValue(teias)
        .setNumberFormat('#,##0.00')
        .setNote('TEİAŞ = MUTLAK(EĞER(MUTLAK(D)>(B×0,15); D×MAK(PTF,SMF)×0,08))\nABS(Fark)=' + Math.abs(fark).toFixed(3) + ' | Eşik=' + (tahmin * 0.15).toFixed(3) + '\nMAX(PTF,SMF)=' + Math.max(ptf, smf).toFixed(2));

      // Satır rengi (D değeri bilinmediği için nötr)
      sheet.getRange(satirNo, 2, 1, 12)
        .setBackground(i % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    }

    // ── Toplam satırı (27. satır) ─────────────────────────────────────────────
    dmToplamSatirYaz(sheet);

    // ── Aylık dengesizlik tablosu ─────────────────────────────────────────────
    dmAylikDengesizlikTablosu(sheet, ss, ay, yil, hesaplananGun);

    SpreadsheetApp.flush();
    Logger.log('✅ ' + sayfaAdi + ' oluşturuldu.');

    return { success: true, sayfa: sayfaAdi, ay: ay, yil: yil };

  } catch (err) {
    Logger.log('❌ dengesizlikMaliyetSayfasiOlustur hata: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ─── BAŞLIK YAZMA ─────────────────────────────────────────────────────────────

function dmBasliklariYaz(sheet) {
  // Freeze önce — merge olmadan
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);

  // 1. satır: Grup başlıkları (merge YOK — her hücreye ayrı renk)
  // Sol grup: A1:J1
  sheet.getRange(1, 1, 1, 10)
    .setValue('').setBackground('#1e3a5f');
  sheet.getRange(1, 1)
    .setValue('SAATLİK DENGESİZLİK ANALİZİ')
    .setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);
  sheet.setRowHeight(1, 36);

  // K1: ayraç
  sheet.getRange(1, 11).setValue('').setBackground('#E2E8F0');

  // L1:M1: Dengesizlik başlığı
  sheet.getRange(1, 12, 1, 2)
    .setValue('').setBackground('#c0392b');
  sheet.getRange(1, 12)
    .setValue('DENGESİZLİK (TL)')
    .setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);

  // N1: ayraç
  sheet.getRange(1, 14).setValue('').setBackground('#E2E8F0');

  // O1:R1: Aylık dengesizlik başlığı
  sheet.getRange(1, 15, 1, 4)
    .setValue('').setBackground('#276749');
  sheet.getRange(1, 15)
    .setValue('AYLIK DENGESİZLİK')
    .setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);

  // 2. satır: Sütun başlıkları
  var solBasliklar = [
    'SAAT',
    'ŞEBEKE TAHMİN\n(MWh)',
    'GERÇEK\n(MWh)',
    'FARK\n(MWh)',
    'PTF\n(TL/MWh)',
    'SMF\n(TL/MWh)',
    'POZ. DENGESİZLİK\n(TL/MWh)',
    'NEG. DENGESİZLİK\n(TL/MWh)',
    'POZİTİF FARK\n(TL)',
    'NEGATİF FARK\n(TL)'
  ];
  sheet.getRange(2, 1, 1, solBasliklar.length)
    .setValues([solBasliklar])
    .setBackground('#2c5282').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center')
    .setVerticalAlignment('middle').setWrap(true);

  // K2: boş ayraç
  sheet.getRange(2, 11).setValue('').setBackground('#E2E8F0');

  // L2–M2: Dengesizlik başlıkları
  sheet.getRange(2, 12).setValue('EPİAŞ (TL)')
    .setBackground('#e74c3c').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(2, 13).setValue('TEİAŞ (TL)')
    .setBackground('#e74c3c').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');

  // N2: boş ayraç
  sheet.getRange(2, 14).setValue('').setBackground('#E2E8F0');

  // O2:R2: Aylık başlıklar
  var sagBasliklar = ['TARİH', 'EPİAŞ (TL)', 'TEİAŞ (TL)', 'TOPLAM (TL)'];
  sheet.getRange(2, 15, 1, sagBasliklar.length)
    .setValues([sagBasliklar])
    .setBackground('#2d6a4f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');

  sheet.setRowHeight(2, 44);

  // Sütun genişlikleri
  var genislikler = [80, 110, 90, 90, 100, 100, 130, 130, 110, 110, 20, 110, 110, 20, 100, 110, 110, 120];
  for (var i = 0; i < genislikler.length; i++) {
    sheet.setColumnWidth(i + 1, genislikler[i]);
  }
}

// ─── TOPLAM SATIRI ────────────────────────────────────────────────────────────

function dmToplamSatirYaz(sheet) {
  var toplamSatir = 27;
  sheet.getRange(toplamSatir, 1).setValue('TOP')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(toplamSatir, 2).setFormula('=SUM(B3:B26)').setNumberFormat('0.000');
  sheet.getRange(toplamSatir, 3).setFormula('=SUM(C3:C26)').setNumberFormat('0.000');
  sheet.getRange(toplamSatir, 4).setFormula('=SUM(D3:D26)').setNumberFormat('0.000');
  sheet.getRange(toplamSatir, 5, 1, 4).setValue('');
  sheet.getRange(toplamSatir, 9).setFormula('=SUM(I3:I26)').setNumberFormat('#,##0.00');
  sheet.getRange(toplamSatir, 10).setFormula('=SUM(J3:J26)').setNumberFormat('#,##0.00');
  sheet.getRange(toplamSatir, 12).setFormula('=SUM(L3:L26)').setNumberFormat('#,##0.00');
  sheet.getRange(toplamSatir, 13).setFormula('=SUM(M3:M26)').setNumberFormat('#,##0.00');
  sheet.getRange(toplamSatir, 1, 1, 13)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold');
}

// ─── AYLIK DENGESİZLİK TABLOSU ───────────────────────────────────────────────

function dmAylikDengesizlikTablosu(sheet, ss, ay, yil, hesaplananGun) {
  var gunSayisi = new Date(yil, ay, 0).getDate();

  // Hesaplanan gün kontrolü
  var hesGun = hesaplananGun ? hesaplananGun.getDate()         : 0;
  var hesAy  = hesaplananGun ? hesaplananGun.getMonth() + 1    : 0;
  var hesYil = hesaplananGun ? hesaplananGun.getFullYear()     : 0;

  var AYLAR = ['','Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

  for (var g = 1; g <= gunSayisi; g++) {
    var satirNo = g + 2; // 3. satırdan başlar

    // O: Tarih etiketi (1.Tem, 2.Tem, ...)
    sheet.getRange(satirNo, 15)
      .setValue(g + '.' + (AYLAR[ay] || ay))
      .setHorizontalAlignment('center')
      .setBackground(g % 2 === 0 ? '#F7F9FC' : '#FFFFFF');

    // P: EPİAŞ, Q: TEİAŞ, R: TOPLAM
    var pHucre = sheet.getRange(satirNo, 16);
    var qHucre = sheet.getRange(satirNo, 17);
    var rHucre = sheet.getRange(satirNo, 18);

    if (g === hesGun && hesAy === ay && hesYil === yil) {
      // L27 ve M27 değerlerini şu an oku — sabit değer yaz
      SpreadsheetApp.flush();
      var epiasVal = parseFloat(sheet.getRange(27, 12).getValue()) || 0;
      var teiasVal = parseFloat(sheet.getRange(27, 13).getValue()) || 0;
      pHucre.setValue(epiasVal)
        .setBackground('#EBF8EE').setFontWeight('bold')
        .setNote('L27 değeri kaydedildi (EPİAŞ)\nTarih: ' + g + '.' + (AYLAR[ay] || ay));
      qHucre.setValue(teiasVal)
        .setBackground('#EBF8EE')
        .setNote('M27 değeri kaydedildi (TEİAŞ)\nTarih: ' + g + '.' + (AYLAR[ay] || ay));
      rHucre.setValue(epiasVal + teiasVal)
        .setBackground('#EBF8EE').setFontWeight('bold')
        .setNote('EPİAŞ + TEİAŞ\nTarih: ' + g + '.' + (AYLAR[ay] || ay));
    } else {
      pHucre.setValue('').setBackground(g % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
      qHucre.setValue('').setBackground(g % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
      rHucre.setFormula('=P' + satirNo + '+Q' + satirNo)
        .setBackground(g % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    }

    pHucre.setNumberFormat('#,##0.00');
    qHucre.setNumberFormat('#,##0.00');
    rHucre.setNumberFormat('#,##0.00');
  }

  // TOP satırı
  var topSatir = gunSayisi + 3;
  sheet.getRange(topSatir, 15).setValue('TOP')
    .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(topSatir, 16).setFormula('=SUM(P3:P' + (gunSayisi + 2) + ')')
    .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
  sheet.getRange(topSatir, 17).setFormula('=SUM(Q3:Q' + (gunSayisi + 2) + ')')
    .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
  sheet.getRange(topSatir, 18).setFormula('=SUM(R3:R' + (gunSayisi + 2) + ')')
    .setBackground('#276749').setFontColor('#FFFFFF').setFontWeight('bold').setNumberFormat('#,##0.00');
}

// ─── VERİ OKUMA ───────────────────────────────────────────────────────────────

/**
 * BaglantiNoktalari B2:B25 → Tüketim / Şebeke Tahmini (MWh)
 * (Formül referansı için sayfa adı kontrolü yeterli)
 */
function dmBaglantiNoktasiOku(ss) {
  var sheet = ss.getSheetByName('BaglantiNoktalari');
  if (!sheet || sheet.getLastRow() < 25) return dmBosArray(24);
  return sheet.getRange(2, 2, 24, 1).getValues().map(function(r) {
    return parseFloat(r[0]) || 0;
  });
}

/**
 * O ay/yıl için en son AMR_YYYYMMDD sayfa adını bulur.
 * @returns {string|null} Sayfa adı veya null
 */
function dmAmrSayfaAdiBul(ss, ay, yil) {
  var sheets = ss.getSheets();
  var enSonTarih = 0;
  var bulunanAd  = null;

  sheets.forEach(function(s) {
    var ad = s.getName();
    // AMR_YYYYMMDD formatı: AMR_ + 8 rakam = 12 karakter
    if (ad.length !== 12 || ad.indexOf('AMR_') !== 0) return;
    var tarihKisim = ad.substring(4); // YYYYMMDD
    var sYil = parseInt(tarihKisim.substring(0, 4));
    var sAy  = parseInt(tarihKisim.substring(4, 6));
    var tarihNum = parseInt(tarihKisim);
    if (sYil === yil && sAy === ay && tarihNum > enSonTarih) {
      enSonTarih = tarihNum;
      bulunanAd  = ad;
    }
  });

  if (bulunanAd) {
    Logger.log('AMR sayfası bulundu: ' + bulunanAd);
  } else {
    Logger.log('⚠️ ' + yil + '/' + dmPad2(ay) + ' için AMR sayfası bulunamadı.');
  }
  return bulunanAd;
}

/**
 * PiyasaFiyatlari sayfasından ay/yıl için PTF, SMF, PozDen, NegDen okur.
 * A=TARİH (Date), B=SAAT (Date), C=PTF, D=SMF, E=PozDen, F=NegDen
 */
function dmPiyasaVerisiOku(ss, ay, yil) {
  var sonuc = { ptf: [], smf: [], pozDen: [], negDen: [] };
  for (var i = 0; i < 24; i++) {
    sonuc.ptf.push(0); sonuc.smf.push(0);
    sonuc.pozDen.push(0); sonuc.negDen.push(0);
  }

  var sheet = ss.getSheetByName('PiyasaFiyatlari');
  if (!sheet || sheet.getLastRow() < 2) return sonuc;

  var veriler = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();

  veriler.forEach(function(r) {
    var tarihObj = r[0];
    var saatObj  = r[1];

    // Tarih kontrolü
    var rAy, rYil;
    if (tarihObj instanceof Date) {
      rAy  = tarihObj.getMonth() + 1;
      rYil = tarihObj.getFullYear();
    } else {
      var p = String(tarihObj).split('.');
      if (p.length < 3) return;
      rAy  = parseInt(p[1]);
      rYil = parseInt(p[2]);
    }
    if (rAy !== ay || rYil !== yil) return;

    // Saat indeksi
    var sHour;
    if (saatObj instanceof Date) {
      sHour = saatObj.getHours();
    } else {
      sHour = parseInt(String(saatObj).split(':')[0]);
    }
    if (isNaN(sHour) || sHour < 0 || sHour > 23) return;

    sonuc.ptf[sHour]    = parseFloat(r[2]) || 0;
    sonuc.smf[sHour]    = parseFloat(r[3]) || 0;
    sonuc.pozDen[sHour] = parseFloat(r[4]) || 0;
    sonuc.negDen[sHour] = parseFloat(r[5]) || 0;
  });

  return sonuc;
}

// ─── YARDIMCILAR ──────────────────────────────────────────────────────────────

function dmGetOrCreateSheet(ss, sayfaAdi) {
  var mevcutSheet = ss.getSheetByName(sayfaAdi);
  if (mevcutSheet) {
    // Tamamen sil ve yeniden oluştur — eski veri/merge kalıntısı olmasın
    ss.deleteSheet(mevcutSheet);
  }
  return ss.insertSheet(sayfaAdi);
}

function dmBaglantiTarihiOku(ss) {
  try {
    var sheet = ss.getSheetByName('BaglantiNoktalari');
    if (!sheet) return dmDunTarihi();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return dmDunTarihi();
    var veriler = sheet.getRange(1, 1, lastRow, 3).getValues();
    for (var i = 0; i < veriler.length; i++) {
      if (String(veriler[i][0]).indexOf('Veri Tarihi') !== -1) {
        var tarihStr = String(veriler[i][1]).trim();
        var parcalar = tarihStr.split('.');
        if (parcalar.length === 3) {
          return new Date(parseInt(parcalar[2]), parseInt(parcalar[1]) - 1, parseInt(parcalar[0]));
        }
      }
    }
    return dmDunTarihi();
  } catch(e) {
    return dmDunTarihi();
  }
}

function dmDunTarihi() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dmBosArray(uzunluk) {
  var arr = [];
  for (var i = 0; i < uzunluk; i++) arr.push(0);
  return arr;
}

function dmPad2(n) { return n < 10 ? '0' + n : String(n); }

// ─── TEST ─────────────────────────────────────────────────────────────────────

function dengesizlikMaliyetTest() {
  var r = dengesizlikMaliyetSayfasiOlustur(7, 2026);
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
