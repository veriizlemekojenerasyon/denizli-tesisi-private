/**
 * 06_KojenMaliyetBedeli.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Web sayfasındaki "Maliyet Giriş" modalından gelen veriyi Google Sheets'e
 * kaydeder. Web App giriş noktası (doGet/doPost) burada.
 *
 * Hedef sayfalar:
 *   "Maliyet"              → Her dönem için en güncel kayıt (upsert)
 *   "MaliyetDegisiklikLog" → Her kaydetme işleminin değişmez geçmişi (append)
 *
 * Maliyet sayfası sütun düzeni (A–K):
 *   A: Kayıt Tarihi   B: Ay       C: Yıl     D: Dönem
 *   E: Kojen Maliyet (TL/MWh)
 *   F: YEKDEM (TL/MWh)    G: Dağıtım (TL/MWh)   H: VTC Gider (TL/MWh)
 *   I: Not             J: Kaydeden    K: Güç Bedeli (TL/MWh)
 *
 * Bağımlılıklar: 01_VGenConfig.gs
 */

// ─── WEB APP GİRİŞ NOKTASI ───────────────────────────────────────────────────

function doGet(e) {
  var params   = (e && e.parameter) ? e.parameter : {};
  var action   = String(params.action || '');
  var callback = String(params.callback || '');

  var sonuc;
  if      (action === 'maliyetBedeliKaydet')      sonuc = maliyetBedeliKaydet(params);
  else if (action === 'maliyetBedeliOku')         sonuc = maliyetBedeliOku(parseInt(params.ay||'0',10), parseInt(params.yil||'0',10));
  else if (action === 'maliyetBedeliListesi')     sonuc = maliyetBedeliListesi();
  else if (action === 'getRaporData')             sonuc = getRaporData(params);
  else if (action === 'getBaglantiNoktalari')     sonuc = getBaglantiNoktalari(params);
  else if (action === 'excelIndir')               sonuc = excelIndir(params);
  else if (action === 'otomatikHesapla')          sonuc = otomatikHesaplaAralik(params);
  else                                            sonuc = { success: false, error: 'Bilinmeyen action: ' + action };

  // JSONP: callback parametresi varsa callback(json) formatında döndür
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(sonuc) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return _jsonCevap(sonuc);
}

function doPost(e) { return doGet(e); }

// ─── KAYDET ──────────────────────────────────────────────────────────────────

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

    if (!ay  || ay  < 1 || ay  > 12)         return { success: false, error: 'Geçersiz ay: '  + ay  };
    if (!yil || yil < 2020 || yil > 2100)    return { success: false, error: 'Geçersiz yıl: ' + yil };

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

// ─── OKU ─────────────────────────────────────────────────────────────────────

function maliyetBedeliOku(ay, yil) {
  try {
    var ss    = cfgSsAc();
    var sheet = ss.getSheetByName(CFG_SAYFA_MALIYET);
    if (!sheet || sheet.getLastRow() < 2) return null;
    var hedef    = _mbDonemSatiriBul(sheet, ay, yil, sheet.getLastRow());
    if (!hedef) return null;
    var mevSutun = Math.min(sheet.getLastColumn(), 11);
    var r        = sheet.getRange(hedef, 1, 1, mevSutun).getValues()[0];
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
<<<<<<< HEAD
    var ss  = cfgSsAc();
    var maliyet = maliyetBedeliOku(ay, yil) || {};

    var fdSheet = ss.getSheetByName(CFG_PREF_FATURA    + yil + '_' + cfgPad2(ay));
    var dmSheet = ss.getSheetByName(CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay));
    var kcSheet = ss.getSheetByName(CFG_PREF_KOJEN_CALISMA + yil + '_' + cfgPad2(ay));
=======

    if (!ay || ay < 1 || ay > 12)        return { success: false, error: 'Geçersiz ay: ' + ay };
    if (!yil || yil < 2020 || yil > 2100) return { success: false, error: 'Geçersiz yıl: ' + yil };

    var ss  = cfgSsAc();
    var maliyet = maliyetBedeliOku(ay, yil);

    var fdSheetAdi = CFG_PREF_FATURA      + yil + '_' + cfgPad2(ay);
    var dmSheetAdi = CFG_PREF_DENGESIZLIK + yil + '_' + cfgPad2(ay);
    var kcSheetAdi = CFG_PREF_KOJEN_CALISMA + yil + '_' + cfgPad2(ay);

    var fdSheet = ss.getSheetByName(fdSheetAdi);
    var dmSheet = ss.getSheetByName(dmSheetAdi);
    var kcSheet = ss.getSheetByName(kcSheetAdi);

    // Hangi sayfaların eksik olduğunu logla
    var eksikSayfalar = [];
    if (!fdSheet) eksikSayfalar.push(fdSheetAdi);
    if (!dmSheet) eksikSayfalar.push(dmSheetAdi);
    if (!kcSheet) eksikSayfalar.push(kcSheetAdi);
    if (eksikSayfalar.length > 0) {
      Logger.log('⚠️ getRaporData: Eksik sayfalar → ' + eksikSayfalar.join(', '));
    }
>>>>>>> 1aa3d90 (Güncelleme)

    var gunSayisi = new Date(yil, ay, 0).getDate();
    var aylikGunler = [], topAvantaj = 0, topSebekeMal = 0, topKojenUretim = 0, topKojenMal = 0;
    var topEpias = 0, topTeias = 0, dengesizlikAylik = [];

    for (var g = 1; g <= gunSayisi; g++) {
      var fdSatir = g + 1, dmSatir = g + 2, kcSatir = g + 2;
      var toplamMal = 0, sebeke = 0, birimMal = 0, kojenUretim = 0, kojenMal = 0, epias = 0, teias = 0, avantaj = 0;

      if (fdSheet && fdSheet.getLastRow() >= fdSatir) {
        var fdRow   = fdSheet.getRange(fdSatir, 11, 1, 7).getValues()[0];
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

      if (toplamMal || kojenUretim || epias || avantaj) {
        var tarih = cfgPad2(g) + '.' + cfgPad2(ay) + '.' + yil;
        aylikGunler.push({ tarih: tarih, avantaj: avantaj, sebekeMal: toplamMal, birimMal: birimMal, kojenUretim: kojenUretim, kojenMal: kojenMal, dengesizlik: epias + teias });
        topAvantaj     += avantaj;
        topSebekeMal   += toplamMal;
        topKojenUretim += kojenUretim;
        topKojenMal    += kojenMal;
      }
      if (epias || teias) {
        var tarih2 = cfgPad2(g) + '.' + cfgPad2(ay) + '.' + yil;
        dengesizlikAylik.push({ tarih: tarih2, epias: epias, teias: teias });
        topEpias += epias; topTeias += teias;
      }
    }

    // Faturalaşma saatlik
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
        faturasToplam += Math.abs(parseFloat(fRow[1])||0)   // Dengesizlik alış/satış
                      + Math.abs(parseFloat(fRow[2])||0)   // EPİAŞ
                      + Math.abs(parseFloat(fRow[3])||0)   // Dağıtım+YEKDEM
                      + Math.abs(parseFloat(fRow[4])||0)   // Koruma
                      + Math.abs(parseFloat(fRow[5])||0);  // VTC
        faturasSebeke += parseFloat(fRow[7]) || 0;
      }
    }

    // BaglantiNoktalari özet
    var bagSheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);
    var toplamUretim = 0, toplamSebeke = 0;
    if (bagSheet && bagSheet.getLastRow() >= 26) {
      var bagToplam = bagSheet.getRange(26, 1, 1, 7).getValues()[0];
      toplamSebeke = parseFloat(bagToplam[1]) || 0;
      toplamUretim = ((parseFloat(bagToplam[2])||0) + (parseFloat(bagToplam[3])||0) + (parseFloat(bagToplam[4])||0));
    }
    var karsilama = toplamSebeke > 0 ? toplamUretim / toplamSebeke * 100 : 0;

<<<<<<< HEAD
    return {
      success: true,
      data: {
        maliyet: { kojenMaliyet: maliyet.kojenMaliyet||0, yekdem: maliyet.yekdem||0, dagitim: maliyet.dagitim||0, vtcGider: maliyet.vtcGider||0, birimMaliyet: maliyet.kojenMaliyet||0, net: maliyet.kojenMaliyet||0 },
        avantaj: { toplam: topAvantaj, gunSayisi: aylikGunler.length, gunluk: aylikGunler.map(function(g) { return { tarih: g.tarih, avantaj: g.avantaj }; }) },
        dengesizlik: { epiasToplam: topEpias, teiasToplam: topTeias, aylik: dengesizlikAylik },
        fatura: { toplam: faturasToplam, sebekeMwh: faturasSebeke, saatlik: faturasSaatlik },
        baglanti: { toplamUretim: toplamUretim, toplamSebeke: toplamSebeke, karsilama: karsilama },
        motorlar: { gm1: {}, gm2: {}, gm3: {} },
        aylikOzet: { gunluk: aylikGunler }
=======
    // Hiç günlük veri yoksa uyarı mesajını döndür — success:true ile gelir,
    // tablolar "Veri yok" gösterir; sahte veri üretilmez.
    var maliyetObj = maliyet
      ? { kojenMaliyet: maliyet.kojenMaliyet||0, yekdem: maliyet.yekdem||0, dagitim: maliyet.dagitim||0, vtcGider: maliyet.vtcGider||0, gucBedeli: maliyet.gucBedeli||0, birimMaliyet: maliyet.kojenMaliyet||0, net: maliyet.kojenMaliyet||0 }
      : { kojenMaliyet: 0, yekdem: 0, dagitim: 0, vtcGider: 0, gucBedeli: 0, birimMaliyet: 0, net: 0 };

    var eksikUyari = eksikSayfalar.length > 0
      ? 'Eksik sayfalar: ' + eksikSayfalar.join(', ')
      : null;

    return {
      success  : true,
      uyari    : eksikUyari,
      data: {
        maliyet    : maliyetObj,
        avantaj    : { toplam: topAvantaj,   gunSayisi: aylikGunler.length,    gunluk: aylikGunler.map(function(g) { return { tarih: g.tarih, avantaj: g.avantaj }; }) },
        dengesizlik: { epiasToplam: topEpias, teiasToplam: topTeias,           aylik: dengesizlikAylik },
        fatura     : { toplam: faturasToplam, sebekeMwh: faturasSebeke,        saatlik: faturasSaatlik },
        baglanti   : { toplamUretim: toplamUretim, toplamSebeke: toplamSebeke, karsilama: karsilama },
        motorlar   : { gm1: {}, gm2: {}, gm3: {} },
        aylikOzet  : { gunluk: aylikGunler }
>>>>>>> 1aa3d90 (Güncelleme)
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
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 110);
  return sheet;
}

// ─── BİÇİMLENDİRME & YARDIMCILAR ────────────────────────────────────────────

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

// ─── TEST ─────────────────────────────────────────────────────────────────────

function maliyetBedeliKaydetTest() {
  var r = maliyetBedeliKaydet({ ay:'7', yil:'2026', kojenMaliyet:'4250.00', yekdem:'320.50', dagitim:'185.75', vtcGider:'95.00', gucBedeli:'210.00', not:'Test', kaydedenKullanici:'test@koruma.com' });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
