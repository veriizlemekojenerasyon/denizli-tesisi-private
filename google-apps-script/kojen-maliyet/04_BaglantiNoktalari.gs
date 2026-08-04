/**
 * 04_BaglantiNoktalari.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * VGen Plan Yöneticisi — Saatlik Üretim/Tüketim Tahminleri (Bağlantı Noktaları)
 *
 * API: GET /vplantmanager/plannings/assetplans/withdetails
 *   Denizli tesisine ait tüketim ve üretim (GM1/GM2/GM3) planlarını çeker.
 *
 * Hedef sayfa: "BaglantiNoktalari"
 * Sütun düzeni: SAAT | Tüketim Noktası | GM1 | GM2 | GM3 | Toplam Kojen | Şebeke Hattı
 *
 * Bağımlılıklar: 00_VGenAuth.gs, 01_VGenConfig.gs
 *
 * Trigger:  baglantiTriggerKur()              → her gün 08:00
 * Manuel:   baglantiDunVerisiniCek()          → dün için
 *           baglantiTarihCek('YYYY-MM-DD')    → belirli tarih
 */

// ─── TRIGGER ─────────────────────────────────────────────────────────────────

function baglantiTriggerKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'baglantiDunVerisiniCek') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('baglantiDunVerisiniCek')
    .timeBased().everyDays(1).atHour(8).nearMinute(0)
    .inTimezone(Session.getScriptTimeZone()).create();
  Logger.log('✅ Bağlantı Noktaları trigger kuruldu — her gün 08:00.');
  return { success: true };
}

// ─── ANA FONKSİYONLAR ────────────────────────────────────────────────────────

/** Dünün plan verisini çekip BaglantiNoktalari sayfasına yazar. */
function baglantiDunVerisiniCek() {
  return baglantiTarihCek(cfgIsoDate(cfgDunTarihi()));
}

/**
 * Belirli tarih için plan verisini çekip BaglantiNoktalari sayfasına yazar.
 * GunlukOtomatikCalisma.gs tarafından çağrılır.
 * @param {string} isoTarih  'YYYY-MM-DD'
 */
function baglantiTarihCek(isoTarih) {
  if (!isoTarih || !/^\d{4}-\d{2}-\d{2}$/.test(isoTarih)) {
    isoTarih = cfgIsoDate(cfgDunTarihi());
    Logger.log('⚠️ Bağlantı: geçersiz tarih, dün kullanılıyor: ' + isoTarih);
  }

  try {
    var apiData = _baglantiApidenCek(isoTarih);
    var tablo   = _baglantiTabloOlustur(apiData, isoTarih);
    var ss      = cfgSsAc();
    var sheet   = _baglantiSayfayaYaz(ss, tablo, isoTarih);

    // Saatlik veriyi dizilere çıkar — 0-23 arası
    var saatlikTahmin     = []; // G sütunu — Şebeke Hattı
    var saatlikKojenUretim = []; // F sütunu — Toplam Kojen
    for (var h = 0; h < 24; h++) { saatlikTahmin.push(0); saatlikKojenUretim.push(0); }

    // Sayfa yazıldıktan sonra G ve F sütunlarını oku
    SpreadsheetApp.flush();
    if (sheet.getLastRow() >= 25) {
      var bagVeriler = sheet.getRange(2, 1, 24, 7).getValues();
      for (var i = 0; i < 24; i++) {
        saatlikKojenUretim[i] = parseFloat(bagVeriler[i][5]) || 0; // F sütunu (index 5)
        saatlikTahmin[i]      = parseFloat(bagVeriler[i][6]) || 0; // G sütunu (index 6)
      }
    }

    Logger.log('✅ BaglantiNoktalari güncellendi: ' + isoTarih +
               ' (' + tablo.assetler.length + ' asset)');
    return {
      success          : true,
      tarih            : isoTarih,
      assetSayisi      : tablo.assetler.length,
      saatlikTahmin    : saatlikTahmin,
      saatlikKojenUretim: saatlikKojenUretim
    };
  } catch(e) {
    Logger.log('❌ Bağlantı veri hatası [' + isoTarih + ']: ' + e.toString());
    return { success: false, tarih: isoTarih, error: e.toString(), saatlikTahmin: [], saatlikKojenUretim: [] };
  }
}

// ─── API KATMANI ─────────────────────────────────────────────────────────────

function _baglantiApidenCek(isoTarih) {
  var url = CFG_PLAN_URL +
    '?tenantId='           + encodeURIComponent(CFG_TENANT_ID) +
    '&deliveryDate='       + encodeURIComponent(isoTarih) +
    '&periodType=Hour' +
    '&includeLockStatus=true' +
    '&active=true' +
    '&page=1&results=2147483647';

  Logger.log('Bağlantı API isteği: deliveryDate=' + isoTarih);
  var resp = vgenApiGet(url, CFG_TENANT_ID);

  if (resp.code < 200 || resp.code >= 300) {
    throw new Error('Bağlantı API HTTP ' + resp.code + ': ' + resp.body.substring(0, 300));
  }

  var json = JSON.parse(resp.body);
  if (!json || !json.items) {
    throw new Error('Bağlantı API beklenmeyen format: ' + resp.body.substring(0, 200));
  }
  return json;
}

// ─── VERİ DÖNÜŞÜMÜ ───────────────────────────────────────────────────────────

/**
 * API yanıtını Denizli asset'lerine göre filtreler,
 * 24 saatlik tablo yapısına dönüştürür.
 */
function _baglantiTabloOlustur(apiData, isoTarih) {
  var assetler = [];

  for (var i = 0; i < apiData.items.length; i++) {
    var item     = apiData.items[i];
    var asset    = item.asset || {};
    var assetAdi = asset.name || item.assetName || '';

    if (!_baglantiDenizliMi(assetAdi)) continue;

    var saatler = {};
    var detaylar = item.assetPlanDetails || item.details || [];
    for (var d = 0; d < detaylar.length; d++) {
      saatler[String(detaylar[d].period || '').trim()] = parseFloat(detaylar[d].amount) || 0;
    }

    assetler.push({ ad: assetAdi, tip: asset.assetType || '', saatler: saatler });
  }

  // Sıralama: tüketim önce, sonra GM1, GM2, GM3
  assetler.sort(function(a, b) {
    return _baglantiSiralama(a.ad) - _baglantiSiralama(b.ad);
  });

  return { tarih: isoTarih, assetler: assetler };
}

function _baglantiDenizliMi(assetAdi) {
  var norm = cfgNormalize(assetAdi);
  for (var i = 0; i < CFG_ASSET_KEYWORDS.length; i++) {
    if (norm.indexOf(cfgNormalize(CFG_ASSET_KEYWORDS[i])) !== -1) return true;
  }
  return false;
}

function _baglantiSiralama(ad) {
  var n = cfgNormalize(ad);
  if (n.indexOf('tuketim') !== -1) return 0;
  var m = n.match(/gm[\s-]*(\d+)/);
  return m ? parseInt(m[1], 10) : 99;
}

// ─── SAYFA YAZMA ─────────────────────────────────────────────────────────────

function _baglantiSayfayaYaz(ss, tablo, isoTarih) {
  var sheet   = cfgGetOrCreateSheet(ss, CFG_SAYFA_BAGLANTI);
  sheet.clear();
  try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch(e) {}
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  var trTarih = isoTarih.split('-').reverse().join('.');

  // Asset'leri ayır
  var tuketimAsset   = null;
  var uretimAssetler = [];
  tablo.assetler.forEach(function(a) {
    if (cfgNormalize(a.ad).indexOf('tuketim') !== -1) tuketimAsset = a;
    else uretimAssetler.push(a);
  });

  // Sütun sayısı: SAAT + Tüketim + GM'ler + Toplam Kojen + Şebeke
  var sutunSayisi = 1 + 1 + uretimAssetler.length + 2;

  // Başlıklar
  var basliklar = ['SAAT'];
  basliklar.push(tuketimAsset ? tuketimAsset.ad : 'Tüketim Noktası');
  uretimAssetler.forEach(function(a) { basliklar.push(a.ad); });
  basliklar.push('Toplam Kojen Üretim (MWh)');
  basliklar.push('Şebeke Hattı Tüketimi (MWh)');

  cfgYazBaslik(sheet, 1, basliklar);
  sheet.setRowHeight(1, 40);
  sheet.getRange(1, 1, 1, sutunSayisi).setWrap(true);

  // Saatlik veriler
  var topTuketim         = 0, topKojen = 0, topSebeke = 0;
  var uretimToplamlari   = uretimAssetler.map(function() { return 0; });

  for (var s = 0; s < CFG_SAATLER_24.length; s++) {
    var saat    = CFG_SAATLER_24[s];
    var satirNo = s + 2;

    var tuketim  = tuketimAsset ? (tuketimAsset.saatler[saat] !== undefined ? tuketimAsset.saatler[saat] : '') : '';
    var uretimler = uretimAssetler.map(function(a) {
      return a.saatler[saat] !== undefined ? a.saatler[saat] : '';
    });

    var kojenToplam = 0;
    uretimler.forEach(function(u) { kojenToplam += (typeof u === 'number') ? u : 0; });
    var sebeke = (typeof tuketim === 'number') ? tuketim - kojenToplam : '';

    var satirDeger = [saat, tuketim].concat(uretimler).concat([
      kojenToplam > 0 ? kojenToplam : '',
      sebeke !== '' ? sebeke : ''
    ]);
    sheet.getRange(satirNo, 1, 1, sutunSayisi).setValues([satirDeger]);

    // Saat sütunu stili
    sheet.getRange(satirNo, 1)
      .setBackground('#1C2B3A').setFontColor('#FFFFFF')
      .setFontWeight('bold').setHorizontalAlignment('center');

    // Satır rengi: kojen devrede → yeşil, değil → zebra
    var bgRenk = kojenToplam > 0 ? '#EBF8EE' : (s % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    sheet.getRange(satirNo, 2, 1, sutunSayisi - 1)
      .setBackground(bgRenk).setNumberFormat('0.000');

    if (typeof tuketim === 'number') topTuketim += tuketim;
    topKojen  += kojenToplam;
    if (typeof sebeke === 'number') topSebeke += sebeke;
    uretimler.forEach(function(u, ui) {
      if (typeof u === 'number') uretimToplamlari[ui] += u;
    });
  }

  // Toplam satırı
  var toplamSatir = CFG_SAATLER_24.length + 2;
  var toplamDeger = ['Total', topTuketim].concat(uretimToplamlari).concat([topKojen, topSebeke]);
  sheet.getRange(toplamSatir, 1, 1, sutunSayisi).setValues([toplamDeger]);
  sheet.getRange(toplamSatir, 1, 1, sutunSayisi)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(toplamSatir, 2, 1, sutunSayisi - 1).setNumberFormat('0.000');

  // Özet kutusu
  var ozetSatir = toplamSatir + 2;
  sheet.getRange(ozetSatir, 1, 1, 3)
    .setValue('GÜNLÜK ÖZET')
    .setBackground('#344a5e').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  ozetSatir++;

  var karsilama = topTuketim > 0 ? (topKojen / topTuketim * 100) : 0;
  var ozetler   = [
    ['Toplam Tüketim Noktası',    topTuketim,  'MWh'],
    ['Toplam Kojen Üretimi',      topKojen,    'MWh'],
    ['Toplam Şebeke Çekimi',      topSebeke,   'MWh'],
    ['Kojen Karşılama Oranı (%)', karsilama,   '%'],
    ['Veri Tarihi',               trTarih,     ''],
    ['Son Güncelleme',            Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'), '']
  ];
  ozetler.forEach(function(oz, o) {
    sheet.getRange(ozetSatir + o, 1).setValue(oz[0]).setFontWeight('bold');
    sheet.getRange(ozetSatir + o, 2).setValue(oz[1])
      .setNumberFormat(o === 3 ? '0.00' : (o < 4 ? '0.000' : '@'));
    sheet.getRange(ozetSatir + o, 3).setValue(oz[2]);
    sheet.getRange(ozetSatir + o, 1, 1, 3)
      .setBackground(o === 3 ? '#FFF2CC' : (o % 2 === 0 ? '#EEF4FB' : '#FFFFFF'));
  });

  // Motor bazlı toplamlar
  var motorSatir = ozetSatir + ozetler.length + 2;
  sheet.getRange(motorSatir, 1, 1, 3)
    .setValue('MOTOR BAZLI ÜRETİM')
    .setBackground('#344a5e').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  motorSatir++;

  uretimAssetler.forEach(function(a, mg) {
    var motorAdi = a.ad.replace('Denizli ', '').replace(' Üretim Noktası', '');
    sheet.getRange(motorSatir + mg, 1).setValue(motorAdi);
    sheet.getRange(motorSatir + mg, 2).setValue(uretimToplamlari[mg]).setNumberFormat('0.000');
    sheet.getRange(motorSatir + mg, 3).setValue('MWh');
    sheet.getRange(motorSatir + mg, 1, 1, 3)
      .setBackground(mg % 2 === 0 ? '#EEF4FB' : '#FFFFFF');
  });

  var genelTopSatir = motorSatir + uretimAssetler.length;
  sheet.getRange(genelTopSatir, 1).setValue('GENEL TOPLAM').setFontWeight('bold');
  sheet.getRange(genelTopSatir, 2).setValue(topKojen).setNumberFormat('0.000').setFontWeight('bold');
  sheet.getRange(genelTopSatir, 3).setValue('MWh');
  sheet.getRange(genelTopSatir, 1, 1, 3).setBackground('#FFF2CC');

  // Sütun genişlikleri
  var genislikler = [80, 160];
  uretimAssetler.forEach(function() { genislikler.push(140); });
  genislikler.push(140, 150);
  genislikler.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });

  cfgSetBorder(sheet, 1, toplamSatir, 1, sutunSayisi);
  cfgSetBorder(sheet, ozetSatir, ozetSatir + ozetler.length - 1, 1, 3);
  cfgSetBorder(sheet, motorSatir, genelTopSatir, 1, 3);

  SpreadsheetApp.flush();
  return sheet;
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function baglantiTarihTest() {
  var r = baglantiTarihCek('2026-07-30');  // ← tarihi değiştirin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
