/**
 * KojenCalisma.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * "KojenCalisma" sayfasını oluşturur ve güncel ayın kojen avantaj hesaplamasını yapar.
 *
 * Veri Kaynakları:
 *   BaglantiNoktalari F2:F25 → Kojen Üretim (MWh)
 *   Maliyet E sütunu         → Kojen Maliyet (TL/MWh)
 *   PiyasaFiyatlari          → Şebeke + Dağıtım + YEKDEM verileri
 *
 * Sütun Düzeni:
 *   A: SAAT
 *   B: Kojen Üretim (MWh)
 *   C: Kojen Maliyet (TL/MWh)
 *   D: Bedel (B*C)
 *   E: Şebeke+Dağıtım+YEKDEM (TL/MWh)
 *   F: Şebeke Maliyet (TL)
 *   G: [BOŞ]
 *   H: SAAT (tekrar)
 *   I: Kojen Avantaj (TL)
 *
 * Kullanım:
 *   kojenCalismaSayfasiOlustur()         → Güncel ay için sayfa oluştur
 *   kojenCalismaSayfasiOlustur(7, 2026) → Temmuz 2026 için
 */

// ─── SABİTLER ─────────────────────────────────────────────────────────────────

var KC_SPREADSHEET_ID = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';
var KC_SHEET_PREFIX   = 'KojenCalisma_';

var KC_SAATLER = [
  '00:00:00','01:00:00','02:00:00','03:00:00','04:00:00','05:00:00',
  '06:00:00','07:00:00','08:00:00','09:00:00','10:00:00','11:00:00',
  '12:00:00','13:00:00','14:00:00','15:00:00','16:00:00','17:00:00',
  '18:00:00','19:00:00','20:00:00','21:00:00','22:00:00','23:00:00'
];

/**
 * Güncel ay veya belirtilen ay/yıl için KojenCalisma sayfasını oluşturur.
 * @param {number} ay  - 1-12 (opsiyonel, yoksa güncel ay)
 * @param {number} yil - Örn: 2026 (opsiyonel, yoksa güncel yıl)
 */
function kojenCalismaSayfasiOlustur(ay, yil) {
  try {
    var bugun = new Date();
    ay  = ay  || (bugun.getMonth() + 1);
    yil = yil || bugun.getFullYear();

    var ss         = SpreadsheetApp.openById(KC_SPREADSHEET_ID);
    var sayfaAdi   = KC_SHEET_PREFIX + yil + '_' + kcPad2(ay);
    var sheet      = kcGetOrCreateSheet(ss, sayfaAdi);

    // ── Sayfayı temizle ve başlık yaz ────────────────────────────────────────
    sheet.clear();
    kcBaslikYaz(sheet);

    // ── Saatlik veriler (24 satır) ───────────────────────────────────────────
    var toplamKojenUretim = 0, toplamBedel = 0, toplamSebekeMaliyet = 0;

    // Maliyet sayfasında ay/yıl satır numarası (F/G/H için sabit referans)
    var maliyetSatir = kcMaliyetSatiriBul(ss, ay, yil);

    for (var i = 0; i < 24; i++) {
      var saat    = KC_SAATLER[i];
      var satirNo = i + 3; // 3. satırdan başlar (1=ana başlık, 2=alt başlıklar, 3=00:00:00)

      // A: SAAT (sabit)
      sheet.getRange(satirNo, 1).setValue(saat);

      // B: Kojen Üretim — BaglantiNoktalari F satırı
      var baglantiRow = i + 2; // BaglantiNoktalari'nde 2. satırdan başlıyor
      sheet.getRange(satirNo, 2)
        .setFormula('=BaglantiNoktalari!F' + baglantiRow)
        .setNote('Kaynak: BaglantiNoktalari sayfası F' + baglantiRow + '\nToplam Kojen Üretim (MWh)');

      // C: Kojen Maliyet — Maliyet sayfası E sütunu (sabit referans)
      sheet.getRange(satirNo, 3)
        .setFormula('=Maliyet!$E$' + maliyetSatir)
        .setNote('Kaynak: Maliyet sayfası E' + maliyetSatir + '\n' + ay + '/' + yil + ' dönemi Kojen Maliyet (TL/MWh)');

      // D: Bedel — B × C
      sheet.getRange(satirNo, 4)
        .setFormula('=B' + satirNo + '*C' + satirNo)
        .setNote('Hesaplama: Kojen Üretim × Kojen Maliyet\n= B' + satirNo + ' × C' + satirNo);

      // E: Şebeke+Dağıtım+YEKDEM — PTF sabit değer + Maliyet F/G/H sabitleri
      var ptfDegeri = kcPtfDegeriniAl(ss, saat, ay, yil);
      var ptfSayi = isNaN(parseFloat(ptfDegeri)) ? 0 : parseFloat(ptfDegeri);
      // Ondalık locale sorununu önlemek için PTF'yi tam sayıya yuvarlayarak formüle yaz
      var ptfTamsayi = Math.round(ptfSayi * 100) / 100;
      // Ondalık kısmı varsa virgülle değil nokta olmadan — sadece integer kısmı kullan
      // En güvenli yol: PTF'yi sabit değer olarak hücreye yaz, Maliyet referansları formül olsun
      var ptfHucre = sheet.getRange(satirNo, 5);
      // Önce PTF sabit değerini yaz
      ptfHucre.setValue(ptfSayi);
      // Sonra üstüne Maliyet kısmını ekleyen formül yaz
      ptfHucre.setFormula('=' + Math.round(ptfSayi) + '+Maliyet!$F$' + maliyetSatir + '+Maliyet!$G$' + maliyetSatir + '+Maliyet!$H$' + maliyetSatir)
        .setNote('Hesaplama: PTF + YEKDEM + Dağıtım + VTC Gider\nPTF (' + saat + '): ' + ptfSayi + '\nYEKDEM: Maliyet!$F$' + maliyetSatir + '\nDağıtım: Maliyet!$G$' + maliyetSatir + '\nVTC Gider: Maliyet!$H$' + maliyetSatir);

      // F: Şebeke Maliyet — B × E
      sheet.getRange(satirNo, 6)
        .setFormula('=B' + satirNo + '*E' + satirNo)
        .setNote('Hesaplama: Kojen Üretim × (PTF+Dağıtım+YEKDEM)\n= B' + satirNo + ' × E' + satirNo);

      // G: BOŞ
      sheet.getRange(satirNo, 7).setValue('');

      kcSatirBicimlendir(sheet, satirNo, true); // Renklendirme dinamik hale gelecek
    }

    // ── Toplam satırı (27. satır) ────────────────────────────────────────────
    sheet.getRange(27, 1).setValue('TOPLAM');
    sheet.getRange(27, 2).setFormula('=SUM(B3:B26)').setNote('Toplam Kojen Üretim (MWh)');
    sheet.getRange(27, 3).setValue('');
    sheet.getRange(27, 4).setFormula('=SUM(D3:D26)').setNote('Toplam Kojen Bedel (TL)');
    sheet.getRange(27, 5).setValue('');
    sheet.getRange(27, 6).setFormula('=SUM(F3:F26)').setNote('Toplam Şebeke Maliyet (TL)');
    sheet.getRange(27, 7).setValue('');
    kcToplamSatirBicimlendir(sheet);

    // ── Avantaj hücresi (28. satır, E-F) ─────────────────────────────────────
    sheet.getRange(28, 5).setValue('AVANTAJ');
    sheet.getRange(28, 6)
      .setFormula('=F27-D27')
      .setNote('Toplam Kojen Avantaj = Toplam Şebeke Maliyet − Toplam Kojen Bedel\n= F27 − D27');
    sheet.getRange(28, 5, 1, 2)
      .setBackground('#276749').setFontColor('#FFFFFF')
      .setFontWeight('bold').setHorizontalAlignment('center')
      .setNumberFormat('#,##0.00');

    // ── Aylık avantaj tablosu (H ve I sütunları) ──────────────────────────────
    kcAylikAvantajTablosu(sheet, ss, ay, yil);

    SpreadsheetApp.flush();
    Logger.log('✅ ' + sayfaAdi + ' oluşturuldu (formüller ve açıklamalar eklendi)');

    return {
      success       : true,
      sayfa         : sayfaAdi,
      ay            : ay,
      yil           : yil
    };

  } catch (err) {
    Logger.log('❌ kojenCalismaSayfasiOlustur hata: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function kcGetOrCreateSheet(ss, sayfaAdi) {
  var sheet = ss.getSheetByName(sayfaAdi);
  if (sheet) {
    sheet.clear();
    return sheet;
  }
  return ss.insertSheet(sayfaAdi);
}

function kcBaslikYaz(sheet) {
  sheet.getRange(1, 1, 1, 7).merge()
    .setValue('KOJEN DEVREDEYİKEN')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sheet.setRowHeight(1, 40);

  var basliklar = [
    'SAAT',
    'Kojen Üretim (MWh)',
    'Kojen Maliyet (TL/MWh)',
    'Bedel (TL)',
    'Şebeke+Dağıtım+YEKDEM (TL/MWh)',
    'Şebeke Maliyet (TL)',
    ''
  ];

  sheet.getRange(2, 1, 1, basliklar.length).setValues([basliklar])
    .setBackground('#2c5282').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(2, 36);
  sheet.setFrozenRows(2);

  var genislikler = [90, 140, 160, 120, 200, 150, 30];
  for (var i = 0; i < genislikler.length; i++) {
    sheet.setColumnWidth(i + 1, genislikler[i]);
  }
}

function kcSatirBicimlendir(sheet, satirNo, kojenAktif) {
  var bg = kojenAktif ? '#EBF8EE' : '#F7F9FC';
  sheet.getRange(satirNo, 1, 1, 7).setBackground(bg);

  sheet.getRange(satirNo, 1).setFontWeight('bold').setHorizontalAlignment('center');

  sheet.getRange(satirNo, 2).setNumberFormat('0.000');    // Kojen Üretim
  sheet.getRange(satirNo, 3).setNumberFormat('0.#####');  // Kojen Maliyet — ham değer
  sheet.getRange(satirNo, 4).setNumberFormat('#,##0.00'); // Bedel
  sheet.getRange(satirNo, 5).setNumberFormat('#,##0.00'); // Şebeke+Dağ+YEK
  sheet.getRange(satirNo, 6).setNumberFormat('#,##0.00'); // Şebeke Maliyet
}

function kcToplamSatirBicimlendir(sheet) {
  sheet.getRange(27, 1, 1, 7)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(27, 2).setNumberFormat('0.000');
  sheet.getRange(27, 4).setNumberFormat('#,##0.00');
  sheet.getRange(27, 6).setNumberFormat('#,##0.00');
}

// ─── AYLIK AVANTAJ TABLOSU ────────────────────────────────────────────────────

/**
 * H sütununa ayın her günü (01/07/2026 … 31/07/2026),
 * I sütununa o günün kojen avantajı yazar.
 * Hesaplanan günün avantajı F28'den alınır, diğer günler boş kalır.
 * Başlık: 1. satır (H1=TARİH, I1=KOJEN AVANTAJ (TL))
 * Veri  : 2. satırdan itibaren (ayın gün sayısı kadar)
 */
function kcAylikAvantajTablosu(sheet, ss, ay, yil) {

  // 1. satır: Ana başlık (merge H1:I1)
  sheet.getRange(1, 8, 1, 2).merge()
    .setValue('AYLIK KOJEN AVANTAJ')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');

  // 2. satır: Sütun başlıkları
  sheet.getRange(2, 8).setValue('TARİH')
    .setBackground('#2c5282').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(2, 9).setValue('KOJEN AVANTAJ (TL)')
    .setBackground('#2c5282').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');

  sheet.setColumnWidth(8, 110);
  sheet.setColumnWidth(9, 150);

  // Hesaplanan günü bul
  var hesaplananGun = kcBaglantiTarihiOku(ss);
  var hesaplananAy  = hesaplananGun ? hesaplananGun.getMonth() + 1 : ay;
  var hesaplananYil = hesaplananGun ? hesaplananGun.getFullYear()  : yil;

  // Ayın gün sayısı
  var gunSayisi = new Date(yil, ay, 0).getDate();

  for (var g = 1; g <= gunSayisi; g++) {
    var satirNo = g + 2; // 3. satırdan başlar

    // H: Tarih
    var tarihStr = kcPad2(g) + '/' + kcPad2(ay) + '/' + yil;
    sheet.getRange(satirNo, 8)
      .setValue(tarihStr)
      .setHorizontalAlignment('center')
      .setBackground(g % 2 === 0 ? '#F7F9FC' : '#FFFFFF');

    // I: Avantaj — sadece hesaplanan gün için =F28
    var iHucre = sheet.getRange(satirNo, 9);
    if (hesaplananGun &&
        g === hesaplananGun.getDate() &&
        hesaplananAy === ay &&
        hesaplananYil === yil) {
      iHucre.setFormula('=F28')
        .setNote('Kaynak: F28 (Toplam Kojen Avantaj)\nHesaplanan gün: ' + tarihStr)
        .setBackground('#EBF8EE').setFontWeight('bold');
    } else {
      iHucre.setValue('').setBackground(g % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    }
    iHucre.setNumberFormat('#,##0.00');
  }

  // Toplam satırı
  var toplamSatir = gunSayisi + 3; // gün sayısı + 2 başlık satırı + 1
  sheet.getRange(toplamSatir, 8).setValue('TOPLAM')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(toplamSatir, 9)
    .setFormula('=SUM(I3:I' + (gunSayisi + 2) + ')')
    .setBackground('#1e3a5f').setFontColor('#FFFFFF').setFontWeight('bold')
    .setNumberFormat('#,##0.00')
    .setNote('Aylık toplam kojen avantaj (TL)');
}

/**
 * BaglantiNoktalari sayfasındaki A1 hücresinden tarih okumaya çalışır.
 * Bulamazsa dünün tarihini döner.
 */
function kcBaglantiTarihiOku(ss) {
  try {
    var sheet = ss.getSheetByName('BaglantiNoktalari');
    if (!sheet) return kcDunTarihi();

    // BaglantiNoktalari'nde veri tarihi özet kısmında yazıyor
    // Tüm sayfada tarih bilgisi arayalım
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return kcDunTarihi();

    // Özet bölümünde "Veri Tarihi" etiketi ve değeri var
    var veriler = sheet.getRange(1, 1, lastRow, 3).getValues();
    for (var i = 0; i < veriler.length; i++) {
      if (String(veriler[i][0]).indexOf('Veri Tarihi') !== -1) {
        var tarihStr = String(veriler[i][1]).trim(); // GG.AA.YYYY
        var parcalar = tarihStr.split('.');
        if (parcalar.length === 3) {
          return new Date(
            parseInt(parcalar[2]), // yıl
            parseInt(parcalar[1]) - 1, // ay (0-indexed)
            parseInt(parcalar[0])  // gün
          );
        }
      }
    }
    return kcDunTarihi();
  } catch(e) {
    return kcDunTarihi();
  }
}

function kcDunTarihi() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * PiyasaFiyatlari sayfasından belirtilen ay/yıl ve saate ait PTF değerini okur.
 * A=TARİH (Date objesi), B=SAAT (Date objesi), C=PTF
 * B sütunu Date objesi olduğu için saat bilgisi karşılaştırılır.
 */
function kcPtfDegeriniAl(ss, saat, ay, yil) {
  var sheet = ss.getSheetByName('PiyasaFiyatlari');
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var hedefSaat = parseInt(saat.split(':')[0], 10);
  var veriler = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();

  for (var i = 0; i < veriler.length; i++) {
    var tarihObj = veriler[i][0];
    var saatObj  = veriler[i][1];
    var ptf      = veriler[i][2];

    // Tarih: Date objesi veya string olabilir
    var satirAy, satirYil;
    if (tarihObj instanceof Date) {
      satirAy  = tarihObj.getMonth() + 1;
      satirYil = tarihObj.getFullYear();
    } else {
      var parcalar = String(tarihObj).split('.');
      if (parcalar.length < 3) continue;
      satirAy  = parseInt(parcalar[1], 10);
      satirYil = parseInt(parcalar[2], 10);
    }
    if (satirAy !== ay || satirYil !== yil) continue;

    // Saat: Date objesi veya string olabilir
    var satirSaat;
    if (saatObj instanceof Date) {
      satirSaat = saatObj.getHours();
    } else {
      satirSaat = parseInt(String(saatObj).split(':')[0], 10);
    }
    if (isNaN(satirSaat) || satirSaat !== hedefSaat) continue;

    var deger = parseFloat(ptf);
    return isNaN(deger) ? 0 : deger;
  }
  return 0;
}

/**
 * Maliyet sayfasında ay/yıl için satır numarasını bulur.
 * @returns {number} Satır numarası, bulunamazsa 2
 */
function kcMaliyetSatiriBul(ss, ay, yil) {
  var sheet = ss.getSheetByName('Maliyet');
  if (!sheet || sheet.getLastRow() < 2) return 2;

  var veriler = sheet.getRange(2, 2, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < veriler.length; i++) {
    if (parseInt(veriler[i][0]) === ay && parseInt(veriler[i][1]) === yil) {
      return i + 2;
    }
  }
  return 2;
}

function kcBosArray(uzunluk) {
  var arr = [];
  for (var i = 0; i < uzunluk; i++) arr.push(0);
  return arr;
}

function kcPad2(n) {
  return n < 10 ? '0' + n : String(n);
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function kojenCalismaTest() {
  var result = kojenCalismaSayfasiOlustur(7, 2026);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
