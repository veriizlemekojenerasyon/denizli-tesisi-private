/**
 * AMR TÜKETİM VERİSİ — Google Apps Script
 *
 * API: GET /vsensor/electricity/readings/reports/assetamrconsumptiongenerations
 *   consumption → Tüketim (Wh → kWh'ye çevrilir)
 *   generation  → Üretim  (Wh → kWh'ye çevrilir)
 *
 * Hedef sayfalar:
 *   Saatlik : "AMR_YYYYAAGG"   → TARİH | SAAT | TÜKETİM (kWh) | ÜRETİM (kWh) | NET (kWh)
 *   Günlük  : "AMR_YYYY_AA"    → TARİH | TÜKETİM (kWh) | ÜRETİM (kWh) | NET (kWh)
 *
 * Spreadsheet ID: 1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY
 *
 * Kurulum : amrKurulum()              → kullanıcı adı/şifre kaydet, token al
 *           amrTriggerKur()           → her gün 07:00 otomatik
 * Manuel  : amrDunVerisiniCek()       → dün saatlik veri
 *           amrTarihCek('2026-07-30') → belirli tarih saatlik veri
 *           amrAylikCek(7, 2026)      → temmuz 2026 günlük veri
 */

// ─── SABİTLER ────────────────────────────────────────────────────────────────

var AMR_SPREADSHEET_ID = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';
var AMR_API_BASE       = 'https://api.vgen.vtcenerji.com';
var AMR_LOGIN_URL      = 'https://login.vtcenerji.com/oauth/token';
var AMR_ENDPOINT       = AMR_API_BASE + '/vsensor/electricity/readings/reports/assetamrconsumptiongenerations';
var AMR_CLIENT_ID      = 'HppJv66LWx7SCF6q7DKhnWiRZdVhZSUO';
var AMR_DEFAULT_TENANT = '26e3e75d-4a9c-4095-8e06-928d74dce07f';
var AMR_DEFAULT_ASSET  = 'ddf0cf67-b302-431f-999b-3de26cfac7c4';
var AMR_TOKEN_KEY      = 'AMR_ACCESS_TOKEN';
var AMR_EXPIRY_KEY     = 'AMR_TOKEN_EXPIRES_AT';
var AMR_USERNAME_KEY   = 'AMR_USERNAME';
var AMR_PASSWORD_KEY   = 'AMR_PASSWORD';
var AMR_ASSET_KEY      = 'AMR_ASSET_ID';
var AMR_TENANT_KEY     = 'AMR_TENANT_ID';

// ─── KURULUM & TRİGGER ────────────────────────────────────────────────────────

/**
 * İlk kurulum — kullanıcı adı ve şifreyi Script Properties'e kaydeder.
 * KULLANICI_ADI ve SIFRE alanlarını doldurup çalıştırın.
 */
function amrKurulum() {
  var KULLANICI_ADI = 'BURAYA_EMAIL_YAZ';   // ← değiştirin
  var SIFRE         = 'BURAYA_SIFRE_YAZ';   // ← değiştirin

  if (KULLANICI_ADI === 'BURAYA_EMAIL_YAZ') {
    throw new Error('KULLANICI_ADI ve SIFRE alanlarını doldurun.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty(AMR_USERNAME_KEY, KULLANICI_ADI);
  props.setProperty(AMR_PASSWORD_KEY, SIFRE);
  props.setProperty(AMR_TENANT_KEY,   AMR_DEFAULT_TENANT);
  props.setProperty(AMR_ASSET_KEY,    AMR_DEFAULT_ASSET);
  props.deleteProperty(AMR_TOKEN_KEY);
  props.deleteProperty(AMR_EXPIRY_KEY);
  amrGetToken(props);
  Logger.log('✅ AMR kurulum tamam. Test için amrDunVerisiniCek() çalıştırın.');
}

/** Her gün 07:00'de otomatik çalışacak trigger kurar. */
function amrTriggerKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'amrDunVerisiniCek') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('amrDunVerisiniCek')
    .timeBased().everyDays(1).atHour(7).nearMinute(0)
    .inTimezone(Session.getScriptTimeZone()).create();
  Logger.log('✅ AMR trigger kuruldu — her gün 07:00.');
  return { success: true };
}

// ─── ANA FONKSİYONLAR ────────────────────────────────────────────────────────

/** Dünün saatlik verisini çekip sayfaya yazar. Trigger çağırır. */
function amrDunVerisiniCek() {
  var dun = new Date();
  dun.setDate(dun.getDate() - 1);
  return amrTarihCek(amrIsoDate(dun));
}

/**
 * Belirli tarih için saatlik veri çekip sayfaya yazar.
 * @param {string} isoTarih  Örn: '2026-07-30'
 */
function amrTarihCek(isoTarih) {
  if (!isoTarih || !/^\d{4}-\d{2}-\d{2}$/.test(isoTarih)) {
    isoTarih = amrIsoDate(new Date(Date.now() - 86400000));
    Logger.log('⚠️ Geçersiz tarih, dün kullanılıyor: ' + isoTarih);
  }

  var props    = PropertiesService.getScriptProperties();
  var token    = amrGetToken(props);
  var assetId  = props.getProperty(AMR_ASSET_KEY)  || AMR_DEFAULT_ASSET;
  var tenantId = props.getProperty(AMR_TENANT_KEY) || AMR_DEFAULT_TENANT;

  try {
    var data  = amrApiFetch(assetId, tenantId, token, isoTarih, isoTarih, 'Hourly');
    var ss    = SpreadsheetApp.openById(AMR_SPREADSHEET_ID);
    var sheet = amrSaatlikSayfasiYaz(ss, data.items, isoTarih);
    Logger.log('✅ AMR saatlik güncellendi: ' + isoTarih + ' (' + data.items.length + ' kayıt)');
    return { success: true, tarih: isoTarih, kayitSayisi: data.items.length, sheet: sheet.getName() };
  } catch (e) {
    Logger.log('❌ AMR saatlik hata: ' + e.toString());
    return { success: false, tarih: isoTarih, error: e.toString() };
  }
}

/**
 * Belirli ay için günlük veri çekip sayfaya yazar.
 * @param {number} ay   1-12
 * @param {number} yil  Örn: 2026
 */
function amrAylikCek(ay, yil) {
  ay  = ay  || new Date().getMonth() + 1;
  yil = yil || new Date().getFullYear();

  var bas = amrIsoDate(new Date(yil, ay - 1, 1));
  var bit = amrIsoDate(new Date(yil, ay, 0));

  var props    = PropertiesService.getScriptProperties();
  var token    = amrGetToken(props);
  var assetId  = props.getProperty(AMR_ASSET_KEY)  || AMR_DEFAULT_ASSET;
  var tenantId = props.getProperty(AMR_TENANT_KEY) || AMR_DEFAULT_TENANT;

  try {
    var data  = amrApiFetch(assetId, tenantId, token, bas, bit, 'Daily');
    var ss    = SpreadsheetApp.openById(AMR_SPREADSHEET_ID);
    var sheet = amrAylikSayfasiYaz(ss, data.items, ay, yil);
    Logger.log('✅ AMR aylık güncellendi: ' + yil + '/' + amrPad2(ay) + ' (' + data.items.length + ' gün)');
    return { success: true, ay: ay, yil: yil, gunSayisi: data.items.length, sheet: sheet.getName() };
  } catch (e) {
    Logger.log('❌ AMR aylık hata: ' + e.toString());
    return { success: false, ay: ay, yil: yil, error: e.toString() };
  }
}

// ─── TOKEN YÖNETİMİ ──────────────────────────────────────────────────────────

function amrGetToken(props) {
  props = props || PropertiesService.getScriptProperties();
  var token = props.getProperty(AMR_TOKEN_KEY) || '';
  var exp   = props.getProperty(AMR_EXPIRY_KEY) || '';
  if (token && exp) {
    var d = new Date(exp);
    if (!isNaN(d.getTime()) && Date.now() < d.getTime() - 300000) return token;
  }
  return amrRefreshToken(props);
}

function amrRefreshToken(props) {
  props = props || PropertiesService.getScriptProperties();
  var u = props.getProperty(AMR_USERNAME_KEY);
  var p = props.getProperty(AMR_PASSWORD_KEY);
  if (!u || !p) throw new Error('AMR_USERNAME/PASSWORD eksik. amrKurulum() çalıştırın.');

  var resp = UrlFetchApp.fetch(AMR_LOGIN_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      grant_type : 'password',
      username   : u,
      password   : p,
      audience   : 'https://api.vgen.vtcenerji.com',
      scope      : 'openid email offline_access',
      client_id  : AMR_CLIENT_ID,
      realm      : 'Username-Password-Authentication'
    })
  });

  if (resp.getResponseCode() >= 300) {
    throw new Error('AMR login HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0, 200));
  }

  var json  = JSON.parse(resp.getContentText());
  var token = json.access_token || '';
  if (!token) throw new Error('AMR login: access_token bulunamadı.');

  props.setProperty(AMR_TOKEN_KEY, token);
  if (json.expires_in) {
    props.setProperty(AMR_EXPIRY_KEY, new Date(Date.now() + json.expires_in * 1000).toISOString());
  }
  Logger.log('✅ AMR token yenilendi.');
  return token;
}

// ─── API KATMANI ─────────────────────────────────────────────────────────────

function amrApiFetch(assetId, tenantId, token, fromDate, toDate, frequency) {
  var from = encodeURIComponent(fromDate + 'T00:00:00.000+03:00');
  var to   = encodeURIComponent(toDate   + 'T23:59:59.999+03:00');
  var url  = AMR_ENDPOINT +
    '?assetId='    + assetId +
    '&frequency='  + frequency +
    '&readAtFrom=' + from +
    '&readAtTo='   + to +
    '&page=1&results=2147483647';

  var hdrs = {
    'Authorization': 'Bearer ' + token,
    'Accept'       : 'application/json',
    'X-Tenant-Id'  : tenantId,
    'Origin'       : 'https://vgen.vtcenerji.com',
    'Referer'      : 'https://vgen.vtcenerji.com/'
  };

  var resp = UrlFetchApp.fetch(url, { method: 'get', headers: hdrs, muteHttpExceptions: true });
  var code = resp.getResponseCode();

  if (code === 401 || code === 403) {
    token = amrRefreshToken(PropertiesService.getScriptProperties());
    hdrs['Authorization'] = 'Bearer ' + token;
    resp = UrlFetchApp.fetch(url, { method: 'get', headers: hdrs, muteHttpExceptions: true });
    code = resp.getResponseCode();
  }

  if (code < 200 || code >= 300) {
    throw new Error('AMR API HTTP ' + code + ': ' + resp.getContentText().substring(0, 200));
  }

  return JSON.parse(resp.getContentText());
}

// ─── SAYFA YAZMA — SAATLİK ───────────────────────────────────────────────────

/**
 * Saatlik veriyi "AMR_YYYYAAGG" sayfasına yazar.
 * Sütunlar: SAAT | TÜKETİM (kWh) | ÜRETİM (kWh) | NET (kWh)
 */
function amrSaatlikSayfasiYaz(ss, items, isoTarih) {
  var trTarih  = isoTarih.split('-').reverse().join('.');
  var sayfaAdi = 'AMR_Saatlik'; // Tek sayfa — her gün üzerine yazılır
  var sheet    = amrGetOrCreateSheet(ss, sayfaAdi);
  sheet.clear();
  try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch(e) {}

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // Başlık
  var basliklar = ['SAAT', 'TÜKETİM (kWh)', 'ÜRETİM (kWh)', 'NET (kWh)', 'TAHMİNİ?'];
  amrYazBaslik(sheet, basliklar);
  sheet.setColumnWidth(1, 80);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 90);

  // Saat → veri map'i (UTC → TR+3)
  var map = {};
  items.forEach(function(item) {
    var tr   = amrUtcToTr(item.readAt);
    var saat = tr.substring(11, 13) + ':00:00';
    map[saat] = item;
  });

  var topK = 0, topU = 0;
  for (var h = 0; h < 24; h++) {
    var saat  = amrPad2(h) + ':00:00';
    var item  = map[saat] || null;
    var wh    = item ? parseFloat(item.consumption) || 0 : 0;
    var uwh   = item ? parseFloat(item.generation)  || 0 : 0;
    var kwh   = amrRound(wh  / 1000);
    var ukwh  = amrRound(uwh / 1000);
    var net   = amrRound(kwh - ukwh);
    var auto  = (item && item.consumptionAutoFilled) ? 'EVET' : '';
    var row   = h + 2;

    sheet.getRange(row, 1, 1, 5).setValues([[saat, kwh, ukwh, net, auto]]);
    sheet.getRange(row, 1)
      .setBackground('#1C2B3A').setFontColor('#FFFFFF')
      .setFontWeight('bold').setHorizontalAlignment('center');
    sheet.getRange(row, 2, 1, 4).setNumberFormat('0.000');

    var bg = auto ? '#FFF3CD' : (h % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    sheet.getRange(row, 2, 1, 4).setBackground(bg);

    topK += kwh;
    topU += ukwh;
  }

  // Toplam satırı
  var topSatir = 26;
  sheet.getRange(topSatir, 1, 1, 5).setValues([['TOPLAM', amrRound(topK), amrRound(topU), amrRound(topK - topU), '']]);
  sheet.getRange(topSatir, 1, 1, 5)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(topSatir, 2, 1, 4).setNumberFormat('0.000');

  // Özet kutusu
  var ozetSatir = topSatir + 2;
  sheet.getRange(ozetSatir, 1, 1, 3)
    .setValue('GÜNLÜK ÖZET').setBackground('#344a5e')
    .setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');

  var ozetler = [
    ['Tarih',              trTarih,                  ''],
    ['Toplam Tüketim',     amrRound(topK),            'kWh'],
    ['Toplam Üretim',      amrRound(topU),            'kWh'],
    ['Net Tüketim',        amrRound(topK - topU),     'kWh'],
    ['Ortalama / Saat',    amrRound(topK / 24),       'kWh'],
    ['Son Güncelleme',     Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'), '']
  ];

  for (var o = 0; o < ozetler.length; o++) {
    var oz = ozetSatir + 1 + o;
    sheet.getRange(oz, 1).setValue(ozetler[o][0]).setFontWeight('bold');
    sheet.getRange(oz, 2).setValue(ozetler[o][1])
      .setNumberFormat(o >= 1 && o <= 4 ? '0.000' : '@');
    sheet.getRange(oz, 3).setValue(ozetler[o][2]);
    sheet.getRange(oz, 1, 1, 3).setBackground(o % 2 === 0 ? '#EEF4FB' : '#FFFFFF');
  }

  // Kenarlık
  amrSetBorder(sheet, 1, topSatir, 1, 5);
  amrSetBorder(sheet, ozetSatir, ozetSatir + ozetler.length, 1, 3);

  SpreadsheetApp.flush();
  return sheet;
}

// ─── SAYFA YAZMA — AYLIK ─────────────────────────────────────────────────────

/**
 * Günlük veriyi "AMR_YYYY_AA" sayfasına yazar.
 * Sütunlar: TARİH | TÜKETİM (kWh) | ÜRETİM (kWh) | NET (kWh) | DURUM
 */
function amrAylikSayfasiYaz(ss, items, ay, yil) {
  var sayfaAdi = 'AMR_' + yil + '_' + amrPad2(ay);
  var sheet    = amrGetOrCreateSheet(ss, sayfaAdi);
  sheet.clear();
  try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch(e) {}

  sheet.setFrozenRows(1);

  var basliklar = ['TARİH', 'TÜKETİM (kWh)', 'ÜRETİM (kWh)', 'NET (kWh)', 'DURUM'];
  amrYazBaslik(sheet, basliklar);
  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 90);

  var topK = 0, topU = 0;
  items.forEach(function(item, i) {
    var trTarih = amrUtcToTr(item.readAt).substring(0, 10).split('-').reverse().join('.');
    var kwh     = amrRound(parseFloat(item.consumption) / 1000);
    var ukwh    = amrRound(parseFloat(item.generation)  / 1000);
    var net     = amrRound(kwh - ukwh);
    var durum   = item.consumptionAutoFilled ? '⚠ Tahmini' : '✓';
    var row     = i + 2;

    sheet.getRange(row, 1, 1, 5).setValues([[trTarih, kwh, ukwh, net, durum]]);
    sheet.getRange(row, 2, 1, 4).setNumberFormat('0.000');

    var bg = item.consumptionAutoFilled ? '#FFF3CD' : (i % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
    sheet.getRange(row, 1, 1, 5).setBackground(bg);

    topK += kwh;
    topU += ukwh;
  });

  // Toplam satırı
  var topSatir = items.length + 2;
  sheet.getRange(topSatir, 1, 1, 5)
    .setValues([['TOPLAM', amrRound(topK), amrRound(topU), amrRound(topK - topU), '']]);
  sheet.getRange(topSatir, 1, 1, 5)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(topSatir, 2, 1, 4).setNumberFormat('0.000');

  amrSetBorder(sheet, 1, topSatir, 1, 5);
  SpreadsheetApp.flush();
  return sheet;
}

// ─── SAYFA YARDIMCILARI ──────────────────────────────────────────────────────

function amrGetOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function amrYazBaslik(sheet, basliklar) {
  sheet.getRange(1, 1, 1, basliklar.length)
    .setValues([basliklar])
    .setBackground('#2c5282')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
}

function amrSetBorder(sheet, ilkSatir, sonSatir, ilkSutun, sonSutun) {
  if (sonSatir < ilkSatir) return;
  sheet.getRange(ilkSatir, ilkSutun, sonSatir - ilkSatir + 1, sonSutun - ilkSutun + 1)
    .setBorder(true, true, true, true, true, true, '#BBBBBB', SpreadsheetApp.BorderStyle.SOLID);
}

// ─── GENEL YARDIMCILAR ───────────────────────────────────────────────────────

function amrUtcToTr(isoStr) {
  var d  = new Date(isoStr);
  var tr = new Date(d.getTime() + 3 * 3600000);
  return tr.toISOString().replace('Z', '').substring(0, 19);
}

function amrIsoDate(d) {
  return d.getFullYear() + '-' + amrPad2(d.getMonth() + 1) + '-' + amrPad2(d.getDate());
}

function amrPad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function amrRound(n) {
  return Math.round((n || 0) * 1000) / 1000;
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

/** Dün için saatlik veri — hızlı test */
function amrDunTest() {
  var r = amrDunVerisiniCek();
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

/** Belirli tarih için test — tarihi değiştirin */
function amrTarihTest() {
  var tarih = '2026-07-30';  // ← değiştirin
  var r = amrTarihCek(tarih);
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

/** Belirli ay için test */
function amrAylikTest() {
  var r = amrAylikCek(7, 2026);  // ← ay, yıl değiştirin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
