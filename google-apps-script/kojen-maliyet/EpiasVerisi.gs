/**
 * VGen vMarket — PTF / SMF Piyasa Fiyatları
 *
 * API: GET https://api.vgen.vtcenerji.com/common/electricitymarketprices
 *   marketClearingPrice    → PTF (TL/MWh)
 *   systemMarginalPrice    → SMF (TL/MWh)
 *   positiveImbalancePrice → Pozitif Dengesizlik Fiyatı
 *   negativeImbalancePrice → Negatif Dengesizlik Fiyatı
 *
 * Hedef sayfa: "PiyasaFiyatlari" (yoksa otomatik oluşturulur)
 * Sütun düzeni: TARİH | SAAT | PTF | SMF | POZ.DEN | NEG.DEN
 *
 * Spreadsheet ID: 1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY
 *
 * Kurulum : ptfTriggerKur()     → her gün 07:30 otomatik
 * Manuel  : ptfDunVerisiniCek() → dün için veri çek
 *           ptfTarihCek('2026-07-30') → belirli tarih için
 */

// ─── SABİTLER ────────────────────────────────────────────────────────────────

var PTF_SPREADSHEET_ID = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';
var PTF_SHEET_NAME     = 'PiyasaFiyatlari';
var PTF_PRICE_URL      = 'https://api.vgen.vtcenerji.com/common/electricitymarketprices';
var PTF_TENANT_ID      = '26e3e75d-4a9c-4095-8e06-928d74dce07f';

// Token sabitleri — VGenBaglantiNoktalari.gs ile aynı
var PTF_LOGIN_ENDPOINT   = 'https://login.vtcenerji.com/oauth/token';
var PTF_CLIENT_ID        = '6wgog3SuEZXxaA4GIjHfSzXnIQfPcy5v';
var PTF_TOKEN_KEY        = 'VGEN_ACCESS_TOKEN';
var PTF_TOKEN_EXPIRY_KEY = 'VGEN_ACCESS_TOKEN_EXPIRES_AT';
var PTF_USERNAME_KEY     = 'VGEN_USERNAME';
var PTF_PASSWORD_KEY     = 'VGEN_PASSWORD';

// ─── TOKEN YÖNETİMİ (bağımsız kopya) ─────────────────────────────────────────

function vgenGetToken(props) {
  props = props || PropertiesService.getScriptProperties();
  var token    = props.getProperty(PTF_TOKEN_KEY)        || '';
  var expiryAt = props.getProperty(PTF_TOKEN_EXPIRY_KEY) || '';
  if (token && expiryAt) {
    var expiry = new Date(expiryAt);
    if (!isNaN(expiry.getTime()) && new Date().getTime() < expiry.getTime() - 5 * 60 * 1000) {
      return token;
    }
  }
  Logger.log('PTF token yenileniyor...');
  return vgenRefreshToken(props);
}

function vgenRefreshToken(props) {
  props = props || PropertiesService.getScriptProperties();
  var username = props.getProperty(PTF_USERNAME_KEY);
  var password = props.getProperty(PTF_PASSWORD_KEY);
  if (!username || !password) {
    throw new Error('VGEN_USERNAME/PASSWORD eksik. vgenKurulum() çalıştırın.');
  }
  var payload = JSON.stringify({
    grant_type : 'password',
    username   : username,
    password   : password,
    audience   : 'https://api.vgen.vtcenerji.com',
    scope      : 'openid email offline_access',
    client_id  : PTF_CLIENT_ID,
    realm      : 'Username-Password-Authentication'
  });
  var resp = UrlFetchApp.fetch(PTF_LOGIN_ENDPOINT, {
    method: 'post', contentType: 'application/json',
    payload: payload, muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('PTF login HTTP ' + resp.getResponseCode());
  }
  var json  = JSON.parse(resp.getContentText());
  var token = json.access_token || '';
  if (!token) throw new Error('PTF login: access_token bulunamadı.');
  props.setProperty(PTF_TOKEN_KEY, token);
  if (json.expires_in) {
    props.setProperty(PTF_TOKEN_EXPIRY_KEY,
      new Date(Date.now() + json.expires_in * 1000).toISOString());
  }
  Logger.log('✅ PTF token yenilendi.');
  return token;
}

// ─── KURULUM ─────────────────────────────────────────────────────────────────

/**
 * Bu GAS projesine VGen credentials kaydeder.
 * KULLANICI_ADI ve SIFRE alanlarını doldurup bir kez çalıştırın.
 */
function ptfKurulum() {
  var KULLANICI_ADI = 'BURAYA_EMAIL_YAZ';  // ← değiştirin
  var SIFRE         = 'BURAYA_SIFRE_YAZ';  // ← değiştirin

  if (KULLANICI_ADI === 'BURAYA_EMAIL_YAZ') {
    throw new Error('KULLANICI_ADI ve SIFRE alanlarını doldurun.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty('VGEN_USERNAME', KULLANICI_ADI);
  props.setProperty('VGEN_PASSWORD', SIFRE);
  props.deleteProperty('VGEN_ACCESS_TOKEN');
  props.deleteProperty('VGEN_ACCESS_TOKEN_EXPIRES_AT');

  // Test — token alabiliyorsa kurulum tamam
  var token = vgenGetToken(props);
  Logger.log('✅ PTF kurulum tamamlandı. Token alındı.');
  return { success: true };
}

// ─── TRIGGER ─────────────────────────────────────────────────────────────────

function ptfTriggerKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'ptfDunVerisiniCek') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ptfDunVerisiniCek')
    .timeBased().everyDays(1).atHour(7).nearMinute(30)
    .inTimezone(Session.getScriptTimeZone()).create();
  Logger.log('✅ PTF trigger kuruldu — her gün 07:30.');
  return { success: true };
}

// ─── ANA FONKSİYONLAR ────────────────────────────────────────────────────────

/** Dünün PTF/SMF verisini çekip sayfaya yazar. Trigger çağırır. */
function ptfDunVerisiniCek() {
  var dun = new Date();
  dun.setDate(dun.getDate() - 1);
  return ptfTarihCek(ptfIsoDate(dun));
}

/**
 * Belirli tarih için PTF/SMF verisini çekip sayfaya yazar.
 * @param {string} isoTarih  Örn: '2026-07-30'
 */
function ptfTarihCek(isoTarih) {
  if (!isoTarih || !/^\d{4}-\d{2}-\d{2}$/.test(isoTarih)) {
    isoTarih = ptfIsoDate(new Date(new Date().setDate(new Date().getDate() - 1)));
    Logger.log('⚠️ Geçersiz tarih, dün kullanılıyor: ' + isoTarih);
  }

  var props    = PropertiesService.getScriptProperties();
  var token    = vgenGetToken(props);
  var tenantId = props.getProperty('VGEN_TENANT_ID') || PTF_TENANT_ID;

  try {
    var items = ptfApiCek(isoTarih, token, tenantId, props);
    var ss    = SpreadsheetApp.openById(PTF_SPREADSHEET_ID);
    var sheet = ptfSayfayaYaz(ss, items, isoTarih);
    Logger.log('✅ PiyasaFiyatlari güncellendi: ' + isoTarih + ' (' + items.length + ' kayıt)');
    return { success: true, tarih: isoTarih, kayitSayisi: items.length, sheet: sheet.getName() };
  } catch (e) {
    Logger.log('❌ PTF veri hatası: ' + e.toString());
    return { success: false, tarih: isoTarih, error: e.toString() };
  }
}

// ─── API KATMANI ─────────────────────────────────────────────────────────────

function ptfApiCek(isoTarih, token, tenantId, props) {
  var url = PTF_PRICE_URL +
    '?marketCode=EPIAS' +
    '&deliveryDateFrom=' + isoTarih +
    '&deliveryDateTo='   + isoTarih +
    '&page=1&results=2147483647';

  var resp = ptfApiFetch(url, token, tenantId);

  if (resp.code === 401 || resp.code === 403) {
    Logger.log('Token süresi dolmuş, yenileniyor...');
    token = vgenRefreshToken(props);
    resp  = ptfApiFetch(url, token, tenantId);
  }

  if (resp.code < 200 || resp.code >= 300) {
    throw new Error('PTF API HTTP ' + resp.code + ': ' + resp.body.substring(0, 200));
  }

  var json  = JSON.parse(resp.body);
  var items = (json.items || []).filter(function(i) {
    return i.deliveryDate && String(i.deliveryDate).substring(0, 10) === isoTarih;
  });

  if (!items.length) throw new Error('PTF verisi bulunamadı: ' + isoTarih);
  return items;
}

function ptfApiFetch(url, token, tenantId) {
  var resp = UrlFetchApp.fetch(url, {
    method : 'get',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept'       : 'application/json',
      'X-Tenant-Id'  : tenantId,
      'Origin'       : 'https://vgen.vtcenerji.com',
      'Referer'      : 'https://vgen.vtcenerji.com/'
    },
    muteHttpExceptions: true
  });
  return { code: resp.getResponseCode(), body: resp.getContentText() };
}

// ─── SAYFA YAZMA ─────────────────────────────────────────────────────────────

/**
 * API verisini PiyasaFiyatlari sayfasına yazar.
 * Her çalıştırmada o günün satırlarını üzerine yazar (upsert mantığı).
 * Sütunlar: TARİH | SAAT | PTF | SMF | POZ.DEN | NEG.DEN
 */
function ptfSayfayaYaz(ss, items, isoTarih) {
  var sheet = ptfGetOrCreateSheet(ss);

  // Saat → veri map'i
  var map = {};
  items.forEach(function(i) { map[String(i.period || '').trim()] = i; });

  var trTarih = isoTarih.split('-').reverse().join('.');

  // O tarihe ait mevcut satırları bul ve sil
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var tarihSutun = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    // Arkadan silerek satır kaymasını önle
    for (var r = lastRow - 1; r >= 1; r--) {
      if (String(tarihSutun[r - 1][0]).trim() === trTarih) {
        sheet.deleteRow(r + 1);
      }
    }
  }

  // Yeni satırları ekle (24 saat)
  var yeniSatirlar = [];
  for (var h = 0; h < 24; h++) {
    var saat = ptfPad2(h) + ':00:00';
    var item = map[saat] || {};
    yeniSatirlar.push([
      trTarih,
      saat,
      ptfParseFloat(item.marketClearingPrice),
      ptfParseFloat(item.systemMarginalPrice),
      ptfParseFloat(item.positiveImbalancePrice),
      ptfParseFloat(item.negativeImbalancePrice)
    ]);
  }

  var insertRow = sheet.getLastRow() + 1;
  sheet.getRange(insertRow, 1, 24, 6).setValues(yeniSatirlar);

  // Sayı formatı
  sheet.getRange(insertRow, 3, 24, 4).setNumberFormat('#,##0.00');

  // Renk: zebra
  for (var z = 0; z < 24; z++) {
    var bg = z % 2 === 0 ? '#F7F9FC' : '#FFFFFF';
    sheet.getRange(insertRow + z, 1, 1, 6).setBackground(bg);
  }

  SpreadsheetApp.flush();
  return sheet;
}

/**
 * PiyasaFiyatlari sayfasını getirir; yoksa oluşturup başlık satırı ekler.
 */
function ptfGetOrCreateSheet(ss) {
  var sheet = ss.getSheetByName(PTF_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PTF_SHEET_NAME);
    var basliklar = ['TARİH', 'SAAT', 'PTF (TL/MWh)', 'SMF (TL/MWh)', 'POZ.DEN (TL/MWh)', 'NEG.DEN (TL/MWh)'];
    sheet.getRange(1, 1, 1, basliklar.length)
      .setValues([basliklar])
      .setBackground('#2c5282')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 90);
    sheet.setColumnWidth(2, 80);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 120);
    sheet.setColumnWidth(5, 150);
    sheet.setColumnWidth(6, 150);
    Logger.log('✅ PiyasaFiyatlari sayfası oluşturuldu.');
  }
  return sheet;
}

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function ptfIsoDate(date) {
  return date.getFullYear() + '-' +
    ptfPad2(date.getMonth() + 1) + '-' +
    ptfPad2(date.getDate());
}

function ptfPad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function ptfParseFloat(val) {
  return parseFloat(String(val || '0').replace(',', '.')) || 0;
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

/** Belirli tarih için test — tarihi değiştirin */
function ptfTarihTest() {
  var tarih = '2026-07-30';  // ← değiştirin
  var r = ptfTarihCek(tarih);
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
