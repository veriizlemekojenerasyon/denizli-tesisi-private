/**
 * 02_PiyasaFiyatlari.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * VGen vMarket — EPİAŞ PTF / SMF Piyasa Fiyatları
 *
 * API: GET /common/electricitymarketprices
 *   marketClearingPrice    → PTF  (TL/MWh)
 *   systemMarginalPrice    → SMF  (TL/MWh)
 *   positiveImbalancePrice → Pozitif Dengesizlik Fiyatı
 *   negativeImbalancePrice → Negatif Dengesizlik Fiyatı
 *
 * Hedef sayfa: "PiyasaFiyatlari"
 * Sütun düzeni: TARİH | SAAT | PTF | SMF | POZ.DEN | NEG.DEN
 *
 * Bağımlılıklar: 00_VGenAuth.gs, 01_VGenConfig.gs
 *
 * Trigger:  ptfTriggerKur()       → her gün 07:30 otomatik
 * Manuel:   ptfDunVerisiniCek()   → dün için veri çek
 *           ptfTarihCek('YYYY-MM-DD')
 */

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

/** Dünün PTF/SMF verisini çekip sayfaya yazar. */
function ptfDunVerisiniCek() {
  return ptfTarihCek(cfgIsoDate(cfgDunTarihi()));
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
    var items = _ptfApidenCek(isoTarih);
    var ss    = cfgSsAc();
    var sheet = _ptfSayfayaYaz(ss, items, isoTarih);
    Logger.log('✅ PiyasaFiyatlari güncellendi: ' + isoTarih + ' (' + items.length + ' kayıt)');
    return { success: true, tarih: isoTarih, kayitSayisi: items.length };
  } catch(e) {
    Logger.log('❌ PTF veri hatası [' + isoTarih + ']: ' + e.toString());
    return { success: false, tarih: isoTarih, error: e.toString() };
  }
}

// ─── API KATMANI ─────────────────────────────────────────────────────────────

function _ptfApidenCek(isoTarih) {
  var url = CFG_PTF_URL +
    '?marketCode=EPIAS' +
    '&deliveryDateFrom=' + isoTarih +
    '&deliveryDateTo='   + isoTarih +
    '&page=1&results=2147483647';

  var resp = vgenApiGet(url, CFG_TENANT_ID);

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

// ─── SAYFA YAZMA ─────────────────────────────────────────────────────────────

function _ptfSayfayaYaz(ss, items, isoTarih) {
  var sheet   = _ptfGetOrCreateSheet(ss);
  var trTarih = isoTarih.split('-').reverse().join('.');

  // Saat → veri map'i
  var map = {};
  items.forEach(function(i) { map[String(i.period || '').trim()] = i; });

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
    var saat = cfgPad2(h) + ':00:00';
    var item = map[saat] || {};
    satirlar.push([
      trTarih,
      saat,
      cfgParseFloat(item.marketClearingPrice),
      cfgParseFloat(item.systemMarginalPrice),
      cfgParseFloat(item.positiveImbalancePrice),
      cfgParseFloat(item.negativeImbalancePrice)
    ]);
  }

  var insertRow = sheet.getLastRow() + 1;
  sheet.getRange(insertRow, 1, 24, 6).setValues(satirlar);
  sheet.getRange(insertRow, 3, 24, 4).setNumberFormat('#,##0.00');

  // Zebra renklendirme
  for (var z = 0; z < 24; z++) {
    sheet.getRange(insertRow + z, 1, 1, 6)
      .setBackground(z % 2 === 0 ? '#F7F9FC' : '#FFFFFF');
  }

  SpreadsheetApp.flush();
  return sheet;
}

function _ptfGetOrCreateSheet(ss) {
  var sheet = ss.getSheetByName(CFG_SAYFA_PIYASA);
  if (sheet) return sheet;

  sheet = ss.insertSheet(CFG_SAYFA_PIYASA);
  var basliklar = ['TARİH', 'SAAT', 'PTF (TL/MWh)', 'SMF (TL/MWh)', 'POZ.DEN (TL/MWh)', 'NEG.DEN (TL/MWh)'];
  cfgYazBaslik(sheet, 1, basliklar, '#2c5282', '#FFFFFF');
  sheet.setFrozenRows(1);
  [90, 80, 120, 120, 150, 150].forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  Logger.log('✅ PiyasaFiyatlari sayfası oluşturuldu.');
  return sheet;
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function ptfTarihTest() {
  var r = ptfTarihCek('2026-07-30');  // ← tarihi değiştirin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
