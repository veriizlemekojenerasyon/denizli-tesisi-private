/**
 * 02_PiyasaFiyatlari.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * EPİAŞ Şeffaflık Platformu — PTF / SMF / Dengesizlik Fiyatları
 *
 * Kaynak: https://seffaflik.epias.com.tr
 * Kimlik: TGT tabanlı (CAS protokolü) — 8 saat geçerli
 *
 * API Akışı:
 *   1. POST https://giris.epias.com.tr/cas/v1/tickets
 *      → TGT alınır (Ticket Granting Ticket)
 *   2. POST https://giris.epias.com.tr/cas/v1/tickets/{TGT}
 *      → ST alınır (Service Ticket — tek kullanımlık)
 *   3. POST https://seffaflik.epias.com.tr/reporting-service/v1/markets/data/ptf-smf-sdf
 *      Body: { startDate, endDate }  →  saatlik PTF / SMF / POZ / NEG
 *
 * Alan eşleştirmesi:
 *   marketClearingPrice    → PTF  (TL/MWh)
 *   systemMarginalPrice    → SMF  (TL/MWh)
 *   positiveImbalancePrice → Pozitif Dengesizlik Fiyatı
 *   negativeImbalancePrice → Negatif Dengesizlik Fiyatı
 *
 * Hedef sayfa: "PiyasaFiyatlari"
 * Sütun düzeni: TARİH | SAAT | PTF | SMF | POZ.DEN | NEG.DEN
 *
 * Bağımlılıklar: 01_VGenConfig.gs (cfgPad2, cfgParseFloat, cfgSsAc, cfgYazBaslik)
 *
 * Trigger:  ptfTriggerKur()       → her gün 10:30 otomatik
 * Manuel:   ptfDunVerisiniCek()   → dün için veri çek
 *           ptfTarihCek('YYYY-MM-DD')
 * Kurulum:  epiasPtfKurulum()     → kimlik bilgilerini kaydet (bir kez)
 */

// ─── EPİAŞ SABİTLERİ ─────────────────────────────────────────────────────────

var _EPIAS_LOGIN_URL   = 'https://giris.epias.com.tr/cas/v1/tickets';
var _EPIAS_SERVICE_URL = 'https://seffaflik.epias.com.tr/';
var _EPIAS_PTF_PATH    = 'reporting-service/v1/data/ptf-smf-sdf';
var _EPIAS_SS_ID       = '1kind4MK2iLG2b7ATgyR8pVacUh4jCI4F9oXuUdxs_UQ';

var _EPIAS_PROP_TGT        = 'EPIAS_TGT';
var _EPIAS_PROP_TGT_EXPIRY = 'EPIAS_TGT_EXPIRY';
var _EPIAS_PROP_USERNAME   = 'EPIAS_USERNAME';
var _EPIAS_PROP_PASSWORD   = 'EPIAS_PASSWORD';

// ─── YEREL YARDIMCILAR (01_VGenConfig bağımsız çalışmak için) ────────────────

function _ptfPad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function _ptfParseFloat(v) {
  return parseFloat(String(v || '0').replace(',', '.')) || 0;
}

function _ptfDunTarihi() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function _ptfIsoDate(d) {
  return d.getFullYear() + '-' + _ptfPad2(d.getMonth() + 1) + '-' + _ptfPad2(d.getDate());
}

// ─── KURULUM ─────────────────────────────────────────────────────────────────

/**
 * EPİAŞ kullanıcı adı ve şifresini Script Properties'e kaydeder.
 * Apps Script editöründe bir kez çalıştırmanız yeterli.
 */
function epiasPtfKurulum() {
  var KULLANICI = 'mrtcsk0320@gmail.com';  // ← EPİAŞ e-postanız
  var SIFRE     = 'Mrt145300..';           // ← EPİAŞ şifreniz
  return _epiasPtfKimlikKaydet(KULLANICI, SIFRE);
}

function _epiasPtfKimlikKaydet(kullanici, sifre) {
  if (!kullanici || !sifre) throw new Error('Kullanıcı adı veya şifre boş.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty(_EPIAS_PROP_USERNAME, kullanici);
  props.setProperty(_EPIAS_PROP_PASSWORD, sifre);
  props.deleteProperty(_EPIAS_PROP_TGT);
  props.deleteProperty(_EPIAS_PROP_TGT_EXPIRY);
  Logger.log('✅ EPİAŞ kimlik bilgileri kaydedildi.');
  // Hemen TGT alarak doğrula
  var tgt = _epiasTgtAl(props);
  Logger.log('✅ TGT doğrulandı: ' + tgt.substring(0, 30) + '...');
  return { success: true };
}

// ─── TRIGGER ─────────────────────────────────────────────────────────────────

function ptfTriggerKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'ptfDunVerisiniCek') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ptfDunVerisiniCek')
    .timeBased().everyDays(1).atHour(10).nearMinute(30)
    .inTimezone(Session.getScriptTimeZone()).create();
  Logger.log('✅ PTF trigger kuruldu — her gün 10:30.');
  return { success: true };
}

// ─── ANA FONKSİYONLAR ────────────────────────────────────────────────────────

/** Dünün PTF/SMF verisini çekip sayfaya yazar. */
function ptfDunVerisiniCek() {
  return ptfTarihCek(_ptfIsoDate(_ptfDunTarihi()));
}

/**
 * Belirli tarih için PTF/SMF verisini çekip "PiyasaFiyatlari" sayfasına yazar.
 * @param {string} isoTarih  'YYYY-MM-DD'
 */
function ptfTarihCek(isoTarih) {
  if (!isoTarih || !/^\d{4}-\d{2}-\d{2}$/.test(isoTarih)) {
    isoTarih = cfgIsoDate(cfgDunTarihi());
    Logger.log('⚠️ PTF: geçersiz tarih, dün kullanılıyor: ' + isoTarih);
  }

  try {
    var items = _epiasApidenCek(isoTarih);
    var ss    = SpreadsheetApp.openById('1kind4MK2iLG2b7ATgyR8pVacUh4jCI4F9oXuUdxs_UQ');
    _ptfSayfayaYaz(ss, items, isoTarih);
    Logger.log('✅ PiyasaFiyatlari güncellendi: ' + isoTarih + ' (' + items.length + ' kayıt)');
    return { success: true, tarih: isoTarih, kayitSayisi: items.length };
  } catch(e) {
    Logger.log('❌ PTF veri hatası [' + isoTarih + ']: ' + e.toString());
    return { success: false, tarih: isoTarih, error: e.toString() };
  }
}

// ─── TGT / ST KİMLİK DOĞRULAMA ───────────────────────────────────────────────

/**
 * Script Properties'ten TGT döndürür.
 * Süresi dolmuşsa yeniler.
 */
function _epiasTgtAl(props) {
  props = props || PropertiesService.getScriptProperties();
  var tgt    = props.getProperty(_EPIAS_PROP_TGT)        || '';
  var expiry = props.getProperty(_EPIAS_PROP_TGT_EXPIRY) || '';

  if (tgt && expiry) {
    var expDate = new Date(expiry);
    // 10 dakika tampon — süresi dolmak üzereyse yenile
    if (!isNaN(expDate.getTime()) && Date.now() < expDate.getTime() - 10 * 60 * 1000) {
      return tgt;
    }
    Logger.log('EPİAŞ: TGT süresi dolmak üzere, yenileniyor...');
  } else {
    Logger.log('EPİAŞ: TGT bulunamadı, giriş yapılıyor...');
  }

  return _epiasTgtYenile(props);
}

/**
 * EPİAŞ CAS login endpoint'inden yeni TGT alır.
 */
function _epiasTgtYenile(props) {
  props = props || PropertiesService.getScriptProperties();
  var username = props.getProperty(_EPIAS_PROP_USERNAME);
  var password = props.getProperty(_EPIAS_PROP_PASSWORD);

  if (!username || !password) {
    throw new Error('EPİAŞ kimlik bilgisi eksik. Önce epiasPtfKurulum() çalıştırın.');
  }

  // CAS login — form-encoded
  var resp = UrlFetchApp.fetch(_EPIAS_LOGIN_URL, {
    method            : 'post',
    contentType       : 'application/x-www-form-urlencoded',
    muteHttpExceptions: true,
    payload           : 'username=' + encodeURIComponent(username) +
                        '&password=' + encodeURIComponent(password)
  });

  var code = resp.getResponseCode();
  // CAS başarılı girişte 201 Created döner, Location header'ında TGT URL'si gelir
  if (code !== 201 && code !== 200) {
    throw new Error('EPİAŞ TGT alınamadı. HTTP ' + code + ': ' +
                    resp.getContentText().substring(0, 300));
  }

  // TGT, Location header'ından veya response body'den alınır
  var location = resp.getHeaders()['Location'] || resp.getHeaders()['location'] || '';
  var tgt = '';
  if (location) {
    // Location: https://giris.epias.com.tr/cas/v1/tickets/TGT-xxxxx
    tgt = location.split('/').pop();
  }
  if (!tgt) {
    // Fallback: body içinde TGT aranır
    var body = resp.getContentText();
    var match = body.match(/TGT-[A-Za-z0-9\-_]+/);
    if (match) tgt = match[0];
  }
  if (!tgt) {
    throw new Error('EPİAŞ TGT: yanıtta token bulunamadı. Body: ' +
                    resp.getContentText().substring(0, 300));
  }

  // TGT'yi 7.5 saat (27000 sn) geçerli olarak sakla (8 saatlik ömründen tampon)
  var expiresAt = new Date(Date.now() + 27000 * 1000).toISOString();
  props.setProperty(_EPIAS_PROP_TGT,        tgt);
  props.setProperty(_EPIAS_PROP_TGT_EXPIRY, expiresAt);
  Logger.log('✅ EPİAŞ TGT yenilendi: ' + tgt.substring(0, 30) + '...');
  return tgt;
}

/**
 * TGT'den tek kullanımlık ST (Service Ticket) alır.
 */
function _epiastStAl(tgt) {
  var stUrl = _EPIAS_LOGIN_URL + '/' + tgt;
  var resp  = UrlFetchApp.fetch(stUrl, {
    method            : 'post',
    contentType       : 'application/x-www-form-urlencoded',
    muteHttpExceptions: true,
    payload           : 'service=' + encodeURIComponent('https://seffaflik.epias.com.tr/')
  });

  var code = resp.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('EPİAŞ ST alınamadı. HTTP ' + code + ': ' +
                    resp.getContentText().substring(0, 200));
  }

  var st = resp.getContentText().trim();
  if (!st || st.indexOf('ST-') !== 0) {
    throw new Error('EPİAŞ ST: geçersiz ticket. Body: ' + st.substring(0, 200));
  }
  return st;
}

// ─── API KATMANI ─────────────────────────────────────────────────────────────

/**
 * EPİAŞ BPM endpoint'inden belirtilen tarih için saatlik fiyatları çeker.
 * TGT geçersizse yeniler ve tekrar dener.
 */
function _epiasApidenCek(isoTarih) {
  var props = PropertiesService.getScriptProperties();

  // İlk deneme
  try {
    return _epiasApiIstekAt(isoTarih, props);
  } catch(e) {
    // TGT geçersiz olabilir — temizle ve tekrar dene
    if (e.toString().indexOf('401') !== -1 || e.toString().indexOf('TGT') !== -1) {
      Logger.log('EPİAŞ: yeniden giriş yapılıyor...');
      props.deleteProperty(_EPIAS_PROP_TGT);
      props.deleteProperty(_EPIAS_PROP_TGT_EXPIRY);
      return _epiasApiIstekAt(isoTarih, props);
    }
    throw e;
  }
}

function _epiasApiIstekAt(isoTarih, props) {
  var tgt = _epiasTgtAl(props);

  // Tarih formatı: "2026-07-01T00:00:00+03:00"
  var startDate = isoTarih + 'T00:00:00+03:00';
  var endDate   = isoTarih + 'T23:00:00+03:00';

  var url = _EPIAS_SERVICE_URL + _EPIAS_PTF_PATH;

  var resp = UrlFetchApp.fetch(url, {
    method            : 'post',
    contentType       : 'application/json',
    muteHttpExceptions: true,
    headers           : {
      'TGT' : tgt
    },
    payload: JSON.stringify({
      startDate : startDate,
      endDate   : endDate
    })
  });

  var code = resp.getResponseCode();
  if (code === 401 || code === 403) {
    throw new Error('401 EPİAŞ yetkisiz istek');
  }
  if (code < 200 || code >= 300) {
    throw new Error('EPİAŞ API HTTP ' + code + ': ' + resp.getContentText().substring(0, 300));
  }

  var json  = JSON.parse(resp.getContentText());
  // Yanıt yapısı: { items: [...] }
  var items = json.items || [];

  if (!items || !items.length) {
    throw new Error('EPİAŞ: ' + isoTarih + ' için veri bulunamadı. Body: ' +
                    resp.getContentText().substring(0, 200));
  }

  Logger.log('EPİAŞ: ' + items.length + ' kayıt alındı (' + isoTarih + ')');
  return items;
}

// ─── SAYFA YAZMA ─────────────────────────────────────────────────────────────

function _ptfSayfayaYaz(ss, items, isoTarih) {
  var sheet   = _ptfGetOrCreateSheet(ss);
  var trTarih = isoTarih.split('-').reverse().join('.');

  // Saat → veri map'i oluştur
  // EPİAŞ yanıtı: date: "2026-09-29T00:00:00+03:00"
  var map = {};
  items.forEach(function(item) {
    var saatStr = '';
    var dateField = item.date || item.time || '';
    if (dateField) {
      // "2026-09-29T00:00:00+03:00" → saat kısmını al
      var timePart = String(dateField).split('T')[1] || '';
      // "00:00:00+03:00" → "00:00:00"
      saatStr = timePart.split('+')[0].split('-')[0].trim();
      // "00:00" → "00:00:00"
      if (saatStr.length === 5) saatStr = saatStr + ':00';    }
    if (saatStr) map[saatStr] = item;
  });

  // O tarihe ait mevcut satırları temizle (upsert)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var tarihler = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var r = lastRow - 1; r >= 1; r--) {
      if (String(tarihler[r - 1][0]).trim() === trTarih) sheet.deleteRow(r + 1);
    }
  }

  // 24 saatlik yeni satırlar
  var satirlar = [];
  for (var h = 0; h < 24; h++) {
    var saat = _ptfPad2(h) + ':00:00';
    var item = map[saat] || {};

    // Alan adı uyumu: EPİAŞ yanıt formatı
    var ptf = _ptfParseFloat(item.ptf || 0);
    var smf = _ptfParseFloat(item.smf || 0);
    var poz = _ptfParseFloat(item.positiveImbalance || 0);
    var neg = _ptfParseFloat(item.negativeImbalance || 0);

    satirlar.push([trTarih, saat, ptf, smf, poz, neg]);
  }

  var insertRow = sheet.getLastRow() + 1;
  sheet.getRange(insertRow, 1, 24, 6).setValues(satirlar);
  sheet.getRange(insertRow, 3, 24, 4).setNumberFormat('#,##0.00 "₺"');

  // Zebra renklendirme
  for (var z = 0; z < 24; z++) {
    sheet.getRange(insertRow + z, 1, 1, 6)
      .setBackground(z % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
  }

  SpreadsheetApp.flush();
  return sheet;
}

function _ptfGetOrCreateSheet(ss) {
  var sheet = ss.getSheetByName('PiyasaFiyatlari');
  if (sheet) return sheet;

  sheet = ss.insertSheet('PiyasaFiyatlari');
  var basliklar = ['TARİH', 'SAAT', 'PTF (TL/MWh)', 'SMF (TL/MWh)', 'POZ.DEN (TL/MWh)', 'NEG.DEN (TL/MWh)'];
  sheet.getRange(1, 1, 1, basliklar.length)
    .setValues([basliklar])
    .setBackground('#2c5282').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  [90, 80, 120, 120, 150, 150].forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  Logger.log('✅ PiyasaFiyatlari sayfası oluşturuldu.');
  return sheet;
}

// ─── TEST & TANI ─────────────────────────────────────────────────────────────

/** TGT alınabiliyor mu test eder */
function epiasTgtTest() {
  try {
    var props = PropertiesService.getScriptProperties();
    var tgt = _epiasTgtYenile(props);
    Logger.log('✅ TGT alındı: ' + tgt.substring(0, 40) + '...');
    return { success: true, tgt: tgt.substring(0, 20) + '...' };
  } catch(e) {
    Logger.log('❌ TGT hatası: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/** Belirli tarih için veri çeker — test amaçlı */
function ptfTarihTest() {
  var iso = '2026-09-30';   // ← tarihi değiştirin
  var r   = ptfTarihCek(iso);
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

/** Ham API yanıtını loglara yazar — alan adlarını görmek için */
function epiasHamYanitTest() {
  try {
    var isoTarih = '2026-09-30';  // ← tarihi değiştirin
    var props = PropertiesService.getScriptProperties();
    var tgt = _epiasTgtAl(props);
    var url = _EPIAS_SERVICE_URL + _EPIAS_PTF_PATH;
    var resp = UrlFetchApp.fetch(url, {
      method            : 'post',
      contentType       : 'application/json',
      muteHttpExceptions: true,
      headers           : { 'TGT': tgt },
      payload           : JSON.stringify({
        startDate: isoTarih + 'T00:00:00+03:00',
        endDate  : isoTarih + 'T23:00:00+03:00'
      })
    });
    Logger.log('HTTP: ' + resp.getResponseCode());
    Logger.log('Body (ilk 500): ' + resp.getContentText().substring(0, 500));
    return { code: resp.getResponseCode(), body: resp.getContentText().substring(0, 500) };
  } catch(e) {
    Logger.log('❌ ' + e.toString());
    return { error: e.toString() };
  }
}
