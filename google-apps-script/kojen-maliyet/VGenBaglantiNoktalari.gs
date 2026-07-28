/**
 * VGEN BAĞLANTI NOKTALARI — Google Apps Script
 *
 * vgen.vtcenerji.com sitesinden bir önceki günün plan verilerini çekip
 * Google Sheets'teki "BaglantiNoktalari" sayfasına yazar.
 *
 * API Endpoint (keşfedilen):
 *   GET https://api.vgen.vtcenerji.com/vplantmanager/plannings/assetplans/withdetails
 *   Parametreler: tenantId, deliveryDate (YYYY-MM-DD), periodType=Hour,
 *                 includeLockStatus=true, active=true, page=1, results=2147483647
 *
 * Response yapısı:
 *   { items: [ { asset: { name }, assetPlanDetails: [ { period, amount } ] } ] }
 *
 * Kurulum (bir kez):
 *   1. vgenKurulum() fonksiyonunu çalıştırın — kullanıcı adı/şifre girerek token alır
 *   2. vgenGunlukTriggerKur() ile her gün 08:00'de otomatik çalışacak şekilde ayarlayın
 *
 * Manuel çalıştırma:
 *   vgenBaglantiVerisiniCek()         → dün için veri çek + sayfayı güncelle
 *   vgenBaglantiVerisiniCekTarih('2026-07-28') → belirli tarih için
 */

// ─── SABİTLER ────────────────────────────────────────────────────────────────

var VGEN_SPREADSHEET_ID   = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';
var VGEN_API_BASE         = 'https://api.vgen.vtcenerji.com';
var VGEN_LOGIN_ENDPOINT   = 'https://login.vtcenerji.com/oauth/token';
var VGEN_PLAN_ENDPOINT    = VGEN_API_BASE + '/vplantmanager/plannings/assetplans/withdetails';
var VGEN_TENANT_ID_KEY    = 'VGEN_TENANT_ID';
var VGEN_TOKEN_KEY        = 'VGEN_ACCESS_TOKEN';
var VGEN_TOKEN_EXPIRY_KEY = 'VGEN_ACCESS_TOKEN_EXPIRES_AT';
var VGEN_USERNAME_KEY     = 'VGEN_USERNAME';
var VGEN_PASSWORD_KEY     = 'VGEN_PASSWORD';
var VGEN_CLIENT_ID        = '6wgog3SuEZXxaA4GIjHfSzXnIQfPcy5v';
var VGEN_DEFAULT_TENANT   = '26e3e75d-4a9c-4095-8e06-928d74dce07f';
var VGEN_KEYWORDS         = ['denizli'];

// ─── 24 SAATLİK SABİT LİSTE ──────────────────────────────────────────────────

var SAATLER_24 = [
  '00:00:00','01:00:00','02:00:00','03:00:00','04:00:00','05:00:00',
  '06:00:00','07:00:00','08:00:00','09:00:00','10:00:00','11:00:00',
  '12:00:00','13:00:00','14:00:00','15:00:00','16:00:00','17:00:00',
  '18:00:00','19:00:00','20:00:00','21:00:00','22:00:00','23:00:00'
];

/**
 * Veri dizisini saat anahtarına göre map'e çevirir.
 */
function saatMapOlustur(diziVerisi) {
  var map = {};
  for (var i = 0; i < diziVerisi.length; i++) {
    var ham    = String(diziVerisi[i][0] || '').trim();
    var parca  = ham.split(':');
    var anahtar = (parca[0] || '00') + ':00:00';
    map[anahtar] = diziVerisi[i].slice(1);
  }
  return map;
}  // hangi tesisleri alacağız

// ─── KURULUM ─────────────────────────────────────────────────────────────────

/**
 * İlk kurulum — kullanıcı adı ve şifreyi Script Properties'e kaydeder,
 * hemen token alır ve BaglantiNoktalari sayfasını test eder.
 *
 * Kullanım:
 *   Aşağıdaki iki satırı doldurup fonksiyonu çalıştırın.
 */
function vgenKurulum() {
  var KULLANICI_ADI = 'BURAYA_EMAIL_YAZ';   // ← değiştirin
  var SIFRE         = 'BURAYA_SIFRE_YAZ';   // ← değiştirin

  if (KULLANICI_ADI === 'BURAYA_EMAIL_YAZ' || SIFRE === 'BURAYA_SIFRE_YAZ') {
    throw new Error('vgenKurulum() içindeki KULLANICI_ADI ve SIFRE alanlarını doldurun.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty(VGEN_USERNAME_KEY,   KULLANICI_ADI);
  props.setProperty(VGEN_PASSWORD_KEY,   SIFRE);
  props.setProperty(VGEN_TENANT_ID_KEY,  VGEN_DEFAULT_TENANT);
  props.deleteProperty(VGEN_TOKEN_KEY);
  props.deleteProperty(VGEN_TOKEN_EXPIRY_KEY);

  // Hemen token al — çalışıyor mu doğrula
  var token = vgenGetToken(props);
  Logger.log('✅ Kurulum tamamlandı. Token alındı.');

  // Dünün verisini test olarak çek
  var result = vgenBaglantiVerisiniCek();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Her gün 08:00'de otomatik çalışacak trigger kurar.
 * Script, bir önceki günün planını çekip sayfayı günceller.
 */
function vgenGunlukTriggerKur() {
  // Mevcut trigger'ları sil
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'vgenBaglantiVerisiniCek') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('vgenBaglantiVerisiniCek')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .nearMinute(0)
    .inTimezone(Session.getScriptTimeZone())
    .create();

  Logger.log('✅ VGen günlük trigger kuruldu — her gün 08:00 civarı çalışır.');
  return { success: true, message: 'Trigger kuruldu. Her gün 08:00 çalışacak.' };
}

// ─── ANA FONKSİYONLAR ────────────────────────────────────────────────────────

/**
 * Bir önceki günün plan verisini API'den çekip BaglantiNoktalari sayfasına yazar.
 * Trigger tarafından otomatik çağrılır, manuel de çalıştırılabilir.
 */
function vgenBaglantiVerisiniCek() {
  var dun = vgenDunTarih();
  return vgenBaglantiVerisiniCekTarih(vgenIsoTarih(dun));
}

/**
 * Belirli bir tarih için veri çeker.
 * @param {string} isoTarih  Örn: '2026-07-28' — boş bırakılırsa dünü kullanır
 */
function vgenBaglantiVerisiniCekTarih(isoTarih) {
  // Parametre gelmezse veya geçersizse dünün tarihini kullan
  if (!isoTarih || typeof isoTarih !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoTarih)) {
    isoTarih = vgenIsoTarih(vgenDunTarih());
    Logger.log('⚠️ isoTarih geçersiz veya eksik, dün kullanılıyor: ' + isoTarih);
  }

  var props = PropertiesService.getScriptProperties();
  try {
    // 1. Token al
    var token = vgenGetToken(props);

    // 2. API'den plan verilerini çek
    var tenantId = props.getProperty(VGEN_TENANT_ID_KEY) || VGEN_DEFAULT_TENANT;
    var apiData  = vgenPlanApiCek(isoTarih, tenantId, token);

    // 3. Denizli assetlerini filtrele ve 24 saatlik tabloya dönüştür
    var tablo    = vgenApiVerisiniTabloYap(apiData, isoTarih);

    // 4. Google Sheets sayfasını güncelle
    var ss    = SpreadsheetApp.openById(VGEN_SPREADSHEET_ID);
    var sheet = vgenBaglantiSayfasiYaz(ss, tablo, isoTarih);

    Logger.log('✅ BaglantiNoktalari güncellendi: ' + isoTarih);
    return {
      success   : true,
      tarih     : isoTarih,
      assetSayisi: tablo.assetler.length,
      sheetName : sheet.getName()
    };

  } catch (err) {
    Logger.log('❌ VGen veri çekme hatası: ' + err.toString());
    return { success: false, tarih: isoTarih, error: err.toString() };
  }
}

// ─── API KATMANI ─────────────────────────────────────────────────────────────

/**
 * API'den ham plan verisini çeker. Token süresi dolmuşsa otomatik yeniler.
 */
function vgenPlanApiCek(isoTarih, tenantId, token) {
  var url = vgenPlanUrl(isoTarih, tenantId);

  var resp = vgenApiFetch(url, tenantId, token);

  // 401/403 → token yenile, bir kez daha dene
  if (resp.code === 401 || resp.code === 403) {
    Logger.log('Token süresi dolmuş, yenileniyor...');
    token = vgenRefreshToken(PropertiesService.getScriptProperties());
    resp  = vgenApiFetch(url, tenantId, token);
  }

  if (resp.code < 200 || resp.code >= 300) {
    throw new Error('VGen API HTTP ' + resp.code + ': ' + resp.body.substring(0, 300));
  }

  var json = JSON.parse(resp.body);
  if (!json || !json.items) {
    throw new Error('VGen API beklenmeyen format: ' + resp.body.substring(0, 200));
  }
  return json;
}

function vgenApiFetch(url, tenantId, token) {
  var response = UrlFetchApp.fetch(url, {
    method          : 'get',
    headers         : {
      'Authorization': 'Bearer ' + token,
      'Accept'       : 'application/json',
      'X-Tenant-Id'  : tenantId,
      'Origin'       : 'https://vgen.vtcenerji.com',
      'Referer'      : 'https://vgen.vtcenerji.com/'
    },
    muteHttpExceptions: true
  });
  return {
    code: response.getResponseCode(),
    body: response.getContentText()
  };
}

function vgenPlanUrl(isoTarih, tenantId) {
  if (!isoTarih || isoTarih === 'undefined') {
    throw new Error('vgenPlanUrl: isoTarih parametresi geçersiz → "' + isoTarih + '"');
  }
  var url = VGEN_PLAN_ENDPOINT +
    '?tenantId='          + encodeURIComponent(tenantId) +
    '&deliveryDate='      + encodeURIComponent(isoTarih) +
    '&periodType=Hour'    +
    '&includeLockStatus=true' +
    '&active=true'        +
    '&page=1'             +
    '&results=2147483647';
  Logger.log('VGen API isteği: deliveryDate=' + isoTarih);
  return url;
}

// ─── TOKEN YÖNETİMİ ───────────────────────────────────────────────────────────

/**
 * Geçerli token'ı döndürür; süresi dolmak üzereyse otomatik yeniler.
 */
function vgenGetToken(props) {
  props = props || PropertiesService.getScriptProperties();
  var token    = props.getProperty(VGEN_TOKEN_KEY) || '';
  var expiryAt = props.getProperty(VGEN_TOKEN_EXPIRY_KEY) || '';

  if (token && expiryAt) {
    var expiry = new Date(expiryAt);
    // 5 dakika öncesine kadar geçerliyse kullan
    if (!isNaN(expiry.getTime()) && new Date().getTime() < expiry.getTime() - 5 * 60 * 1000) {
      return token;
    }
  }

  if (!token) {
    Logger.log('Token bulunamadı, giriş yapılıyor...');
  } else {
    Logger.log('Token süresi dolmak üzere, yenileniyor...');
  }

  return vgenRefreshToken(props);
}

/**
 * Auth0 password grant ile yeni token alır, Properties'e kaydeder.
 * Güvenlik: şifre hiçbir zaman log'a yazdırılmaz.
 */
function vgenRefreshToken(props) {
  props = props || PropertiesService.getScriptProperties();

  var username = props.getProperty(VGEN_USERNAME_KEY);
  var password = props.getProperty(VGEN_PASSWORD_KEY);

  if (!username || !password) {
    throw new Error(
      'VGEN_USERNAME ve VGEN_PASSWORD Script Properties\'e kaydedilmemiş. ' +
      'Önce vgenKurulum() çalıştırın.'
    );
  }

  var payload = JSON.stringify({
    grant_type : 'password',
    username   : username,
    password   : password,
    audience   : 'https://api.vgen.vtcenerji.com',
    scope      : 'openid email offline_access',
    client_id  : VGEN_CLIENT_ID,
    realm      : 'Username-Password-Authentication'
  });

  var resp = UrlFetchApp.fetch(VGEN_LOGIN_ENDPOINT, {
    method            : 'post',
    contentType       : 'application/json',
    payload           : payload,
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() < 200 || resp.getResponseCode() >= 300) {
    throw new Error('VGen login başarısız. HTTP ' + resp.getResponseCode() +
                    ': ' + resp.getContentText().substring(0, 300));
  }

  var json = JSON.parse(resp.getContentText());
  var token = json.access_token || json.token || '';
  if (!token) {
    throw new Error('VGen login cevabında access_token bulunamadı.');
  }

  // Token'ı kaydet
  props.setProperty(VGEN_TOKEN_KEY, token);
  if (json.expires_in) {
    var expiry = new Date(new Date().getTime() + json.expires_in * 1000);
    props.setProperty(VGEN_TOKEN_EXPIRY_KEY, expiry.toISOString());
  }

  Logger.log('✅ VGen token yenilendi.');
  return token;
}

// ─── VERİ DÖNÜŞÜMÜ ───────────────────────────────────────────────────────────

/**
 * API response'undan Denizli asset'lerini filtreler ve
 * 24 saatlik tablo yapısına dönüştürür.
 *
 * Döndürülen yapı:
 * {
 *   tarih: '2026-07-28',
 *   assetler: [
 *     { ad: 'Denizli Tüketim Noktası', tip: 'Consumer', saatler: { '00:00:00': 13, ... } },
 *     { ad: 'Denizli GM1 Üretim Noktası', tip: 'PowerPlant', saatler: { ... } },
 *     ...
 *   ]
 * }
 */
function vgenApiVerisiniTabloYap(apiData, isoTarih) {
  var assetler = [];

  for (var i = 0; i < apiData.items.length; i++) {
    var item      = apiData.items[i];
    var asset     = item.asset || {};
    var assetAdi  = asset.name || item.assetName || '';
    var assetTipi = asset.assetType || item.assetType || '';

    // Sadece Denizli keyword'üne uyan assetleri al
    if (!vgenDenizliMi(assetAdi)) continue;

    var saatler  = {};
    var detaylar = item.assetPlanDetails || item.details || [];

    for (var d = 0; d < detaylar.length; d++) {
      var period = String(detaylar[d].period || '').trim();
      var amount = parseFloat(detaylar[d].amount) || 0;
      saatler[period] = amount;
    }

    assetler.push({
      ad    : assetAdi,
      tip   : assetTipi,
      saatler: saatler
    });
  }

  // Sıralama: Tüketim önce, sonra GM1, GM2, GM3
  assetler.sort(function(a, b) {
    var aOrder = vgenAssetSiralama(a.ad);
    var bOrder = vgenAssetSiralama(b.ad);
    return aOrder - bOrder;
  });

  return { tarih: isoTarih, assetler: assetler };
}

/**
 * Asset adının Denizli tesisine ait olup olmadığını kontrol eder.
 */
function vgenDenizliMi(assetAdi) {
  var normalized = vgenNormalize(assetAdi);
  for (var i = 0; i < VGEN_KEYWORDS.length; i++) {
    if (normalized.indexOf(vgenNormalize(VGEN_KEYWORDS[i])) !== -1) return true;
  }
  return false;
}

function vgenAssetSiralama(ad) {
  var n = vgenNormalize(ad);
  if (n.indexOf('tuketim') !== -1) return 0;
  var m = n.match(/gm[\s-]*(\d+)/);
  return m ? parseInt(m[1], 10) : 99;
}

function vgenNormalize(text) {
  return String(text || '').toLowerCase()
    .replace(/\u0131/g, 'i').replace(/\u0130/g, 'i')
    .replace(/\u011f/g, 'g').replace(/\u011e/g, 'g')
    .replace(/\u00fc/g, 'u').replace(/\u00dc/g, 'u')
    .replace(/\u015f/g, 's').replace(/\u015e/g, 's')
    .replace(/\u00f6/g, 'o').replace(/\u00d6/g, 'o')
    .replace(/\u00e7/g, 'c').replace(/\u00c7/g, 'c');
}

// ─── SAYFA YAZMA ─────────────────────────────────────────────────────────────

/**
 * API'den gelen tabloyu BaglantiNoktalari sayfasına yazar.
 * Sayfadaki eski veri silinir, yeni veri SAATLER_24 sıralamasıyla yazılır.
 * Kojen devrede olan saatler yeşil, olmayanlar zebra renklendirme alır.
 */
function vgenBaglantiSayfasiYaz(ss, tablo, isoTarih) {
  var sheet = vgenGetOrCreateSheet(ss, 'BaglantiNoktalari');
  sheet.clear();
  // Önceki merge kalıntılarını temizle — setFrozenColumns ile çakışır
  try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch(e) {}

  // Tüketim ve üretim assetlerini ayır
  var tuketimAsset = null;
  var uretimAssetler = [];
  for (var i = 0; i < tablo.assetler.length; i++) {
    var a = tablo.assetler[i];
    if (vgenNormalize(a.ad).indexOf('tuketim') !== -1) {
      tuketimAsset = a;
    } else {
      uretimAssetler.push(a);
    }
  }

  // Sütun yapısı: SAAT | Tüketim | GM1 | GM2 | GM3 | Toplam Kojen | Şebeke
  var sutunSayisi = 1 + 1 + uretimAssetler.length + 2; // saat+tuketim+GMler+kojenToplam+sebeke

  var trTarih = isoTarih.split('-').reverse().join('.');

  // ── Freeze ÖNCE — merge'den önce yapılmalı ────────────────────────────────
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // ── Sütun başlıkları — API'den gelen asset adlarını doğrudan kullan ────────
  var basliklar = ['SAAT'];
  basliklar.push(tuketimAsset ? tuketimAsset.ad : 'Denizli Tüketim Noktası');
  for (var g = 0; g < uretimAssetler.length; g++) {
    basliklar.push(uretimAssetler[g].ad);
  }
  basliklar.push('Toplam Kojen Üretim (MWh)');
  basliklar.push('Şebeke Hattı Tüketimi (MWh)');

  vgenYazBaslik(sheet, 1, basliklar, '#2c5282', '#FFFFFF');
  sheet.setRowHeight(1, 40);
  sheet.getRange(1, 1, 1, sutunSayisi).setWrap(true);

  // ── Saatlik veri ───────────────────────────────────────────────────────────
  var topTuketim = 0, topKojen = 0, topSebeke = 0;
  var uretimToplamlari = uretimAssetler.map(function() { return 0; });

  for (var s = 0; s < SAATLER_24.length; s++) {
    var saat    = SAATLER_24[s];
    var satirNo = s + 2;

    var tuketim = tuketimAsset ? (tuketimAsset.saatler[saat] !== undefined ? tuketimAsset.saatler[saat] : '') : '';
    var uretimler = uretimAssetler.map(function(a) {
      return a.saatler[saat] !== undefined ? a.saatler[saat] : '';
    });

    var kojenToplam = 0;
    for (var u = 0; u < uretimler.length; u++) {
      kojenToplam += (typeof uretimler[u] === 'number') ? uretimler[u] : 0;
    }
    var sebeke = (typeof tuketim === 'number') ? tuketim - kojenToplam : '';

    // Satır değerleri
    var satirDeger = [saat, tuketim].concat(uretimler).concat([
      kojenToplam > 0 ? kojenToplam : '',
      sebeke !== '' ? sebeke : ''
    ]);
    sheet.getRange(satirNo, 1, 1, sutunSayisi).setValues([satirDeger]);

    // Saat sütunu — koyu sabit stil
    sheet.getRange(satirNo, 1)
      .setBackground('#1C2B3A').setFontColor('#FFFFFF')
      .setFontWeight('bold').setHorizontalAlignment('center');

    // Satır rengi
    var bgRenk = kojenToplam > 0 ? '#EBF8EE' : (s % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    vgenRenklendir(sheet, satirNo, 2, 1, sutunSayisi - 1, bgRenk);
    sheet.getRange(satirNo, 2, 1, sutunSayisi - 1).setNumberFormat('0.000');

    // Toplamlar
    if (typeof tuketim === 'number') topTuketim += tuketim;
    topKojen += kojenToplam;
    if (typeof sebeke === 'number') topSebeke += sebeke;
    for (var ut = 0; ut < uretimler.length; ut++) {
      if (typeof uretimler[ut] === 'number') uretimToplamlari[ut] += uretimler[ut];
    }
  }

  // ── Toplam satırı ──────────────────────────────────────────────────────────
  var toplamSatir = SAATLER_24.length + 2;
  var toplamDeger = ['Total', topTuketim].concat(uretimToplamlari).concat([topKojen, topSebeke]);
  sheet.getRange(toplamSatir, 1, 1, sutunSayisi).setValues([toplamDeger]);
  vgenYazToplamStil(sheet, toplamSatir, 1, sutunSayisi, '#1e3a5f');
  sheet.getRange(toplamSatir, 2, 1, sutunSayisi - 1).setNumberFormat('0.000');

  // ── Özet kutuları ──────────────────────────────────────────────────────────
  var ozetSatir = toplamSatir + 2;
  sheet.getRange(ozetSatir, 1, 1, 3)
    .setValue('GÜNLÜK ÖZET').setBackground('#344a5e')
    .setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  ozetSatir++;

  var karsilama = topTuketim > 0 ? (topKojen / topTuketim * 100) : 0;
  var ozetler = [
    ['Toplam Tüketim Noktası',    topTuketim,  'MWh'],
    ['Toplam Kojen Üretimi',      topKojen,    'MWh'],
    ['Toplam Şebeke Çekimi',      topSebeke,   'MWh'],
    ['Kojen Karşılama Oranı (%)', karsilama,   '%'],
    ['Veri Tarihi',               trTarih,     ''],
    ['Son Güncelleme',            Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'), '']
  ];
  for (var o = 0; o < ozetler.length; o++) {
    sheet.getRange(ozetSatir + o, 1).setValue(ozetler[o][0]).setFontWeight('bold');
    sheet.getRange(ozetSatir + o, 2).setValue(ozetler[o][1])
      .setNumberFormat(o === 3 ? '0.00' : (o < 4 ? '0.000' : '@'));
    sheet.getRange(ozetSatir + o, 3).setValue(ozetler[o][2]);
    vgenRenklendir(sheet, ozetSatir + o, 1, 1, 3,
               o === 3 ? '#FFF2CC' : (o % 2 === 0 ? '#EEF4FB' : '#FFFFFF'));
  }

  // ── Motor bazlı toplamlar ──────────────────────────────────────────────────
  var motorSatir = ozetSatir + ozetler.length + 2;
  sheet.getRange(motorSatir, 1, 1, 3)
    .setValue('MOTOR BAZLI ÜRETİM').setBackground('#344a5e')
    .setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  motorSatir++;

  for (var mg = 0; mg < uretimAssetler.length; mg++) {
    var motorAdi = uretimAssetler[mg].ad.replace('Denizli ', '').replace(' Üretim Noktası', '');
    sheet.getRange(motorSatir + mg, 1).setValue(motorAdi).setFontWeight('normal');
    sheet.getRange(motorSatir + mg, 2).setValue(uretimToplamlari[mg]).setNumberFormat('0.000');
    sheet.getRange(motorSatir + mg, 3).setValue('MWh');
    vgenRenklendir(sheet, motorSatir + mg, 1, 1, 3, mg % 2 === 0 ? '#EEF4FB' : '#FFFFFF');
  }
  var genelToplamSatir = motorSatir + uretimAssetler.length;
  sheet.getRange(genelToplamSatir, 1).setValue('GENEL TOPLAM').setFontWeight('bold');
  sheet.getRange(genelToplamSatir, 2).setValue(topKojen).setNumberFormat('0.000').setFontWeight('bold');
  sheet.getRange(genelToplamSatir, 3).setValue('MWh');
  vgenRenklendir(sheet, genelToplamSatir, 1, 1, 3, '#FFF2CC');

  // ── Format ─────────────────────────────────────────────────────────────────
  var genislikler = [80];
  genislikler.push(160); // tüketim
  for (var gw = 0; gw < uretimAssetler.length; gw++) genislikler.push(140);
  genislikler.push(140); // kojen toplam
  genislikler.push(150); // şebeke
  vgenFormatSutunGenislikleri(sheet, genislikler);

  vgenSetBorderAll(sheet, 1, toplamSatir, 1, sutunSayisi);
  vgenSetBorderAll(sheet, ozetSatir, ozetSatir + ozetler.length - 1, 1, 3);
  vgenSetBorderAll(sheet, motorSatir, genelToplamSatir, 1, 3);

  return sheet;
}

// ─── TARİH YARDIMCILARI ───────────────────────────────────────────────────────

function vgenDunTarih() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function vgenIsoTarih(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

// ─── SAYFA YARDIMCILARI (bağımsız proje için yerel kopyalar) ─────────────────

function vgenGetOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function vgenYazBaslik(sheet, satir, basliklar, bgRenk, fontRenk) {
  sheet.getRange(satir, 1, 1, basliklar.length)
    .setValues([basliklar])
    .setBackground(bgRenk  || '#1e3a5f')
    .setFontColor(fontRenk || '#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
}

function vgenYazToplamStil(sheet, satir, sutunBas, sutunSayisi, bgRenk) {
  sheet.getRange(satir, sutunBas, 1, sutunSayisi)
    .setBackground(bgRenk || '#1e3a5f')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
}

function vgenRenklendir(sheet, satir, sutun, satirSayisi, sutunSayisi, renk) {
  sheet.getRange(satir, sutun, satirSayisi, sutunSayisi)
    .setBackground(renk || '#FFFFFF');
}

function vgenFormatSutunGenislikleri(sheet, genislikler) {
  for (var i = 0; i < genislikler.length; i++) {
    sheet.setColumnWidth(i + 1, genislikler[i]);
  }
}

function vgenSetBorderAll(sheet, ilkSatir, sonSatir, ilkSutun, sonSutun) {
  if (sonSatir < ilkSatir || sonSutun < ilkSutun) return;
  sheet.getRange(
    ilkSatir, ilkSutun,
    sonSatir - ilkSatir + 1,
    sonSutun - ilkSutun + 1
  ).setBorder(
    true, true, true, true, true, true,
    '#BBBBBB', SpreadsheetApp.BorderStyle.SOLID
  );
}
