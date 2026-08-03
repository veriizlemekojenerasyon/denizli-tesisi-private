/**
 * 03_AMRVerisi.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * VGen VSensor — AMR Tüketim / Üretim Okumaları
 *
 * API: GET /vsensor/electricity/readings/reports/assetamrconsumptiongenerations
 *   consumption → Tüketim (MWh — VTC API doğrudan MWh döner)
 *   generation  → Üretim  (MWh)
 *
 * Hedef sayfalar:
 *   Saatlik : "AMR_Saatlik"   → SAAT | TÜKETİM (MWh) | ÜRETİM (MWh) | NET (MWh) | TAHMİNİ?
 *   Aylık   : "AMR_YYYY_MM"   → TARİH | TÜKETİM (MWh) | ÜRETİM (MWh) | NET (MWh) | DURUM
 *
 * Bağımlılıklar: 00_VGenAuth.gs, 01_VGenConfig.gs
 *
 * Trigger:  amrTriggerKur()             → her gün 07:00
 * Manuel:   amrDunVerisiniCek()         → dün saatlik
 *           amrTarihCek('YYYY-MM-DD')   → belirli tarih saatlik
 *           amrAylikCek(7, 2026)        → aylık günlük özet
 */

// ─── TRIGGER ─────────────────────────────────────────────────────────────────

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

/** Dünün saatlik verisini çekip AMR_Saatlik sayfasına yazar. */
function amrDunVerisiniCek() {
  return amrTarihCek(cfgIsoDate(cfgDunTarihi()));
}

/**
 * Belirli tarih için saatlik veri çekip AMR_Saatlik sayfasına yazar.
 * @param {string} isoTarih  'YYYY-MM-DD'
 */
function amrTarihCek(isoTarih) {
  if (!isoTarih || !/^\d{4}-\d{2}-\d{2}$/.test(isoTarih)) {
    isoTarih = cfgIsoDate(cfgDunTarihi());
    Logger.log('⚠️ AMR: geçersiz tarih, dün kullanılıyor: ' + isoTarih);
  }

  try {
    var data  = _amrApidenCek(isoTarih, isoTarih, 'Hourly');
    var ss    = cfgSsAc();
    var sheet = _amrSaatlikYaz(ss, data.items, isoTarih);
    Logger.log('✅ AMR_Saatlik güncellendi: ' + isoTarih + ' (' + data.items.length + ' kayıt)');
    return { success: true, tarih: isoTarih, kayitSayisi: data.items.length };
  } catch(e) {
    Logger.log('❌ AMR saatlik hata [' + isoTarih + ']: ' + e.toString());
    return { success: false, tarih: isoTarih, error: e.toString() };
  }
}

/**
 * Belirli ay için günlük özet verisi çekip "AMR_YYYY_MM" sayfasına yazar.
 * @param {number} ay   1-12
 * @param {number} yil
 */
function amrAylikCek(ay, yil) {
  ay  = ay  || (new Date().getMonth() + 1);
  yil = yil || new Date().getFullYear();

  var bas = cfgIsoDate(new Date(yil, ay - 1, 1));
  var bit = cfgIsoDate(new Date(yil, ay, 0));

  try {
    var data  = _amrApidenCek(bas, bit, 'Daily');
    var ss    = cfgSsAc();
    var sheet = _amrAylikYaz(ss, data.items, ay, yil);
    Logger.log('✅ AMR aylık güncellendi: ' + yil + '/' + cfgPad2(ay) + ' (' + data.items.length + ' gün)');
    return { success: true, ay: ay, yil: yil, gunSayisi: data.items.length };
  } catch(e) {
    Logger.log('❌ AMR aylık hata [' + ay + '/' + yil + ']: ' + e.toString());
    return { success: false, ay: ay, yil: yil, error: e.toString() };
  }
}

// ─── API KATMANI ─────────────────────────────────────────────────────────────

function _amrApidenCek(fromDate, toDate, frequency) {
  var from = encodeURIComponent(fromDate + 'T00:00:00.000+03:00');
  var to   = encodeURIComponent(toDate   + 'T23:59:59.999+03:00');
  var url  = CFG_AMR_URL +
    '?assetId='    + CFG_AMR_ASSET_ID +
    '&frequency='  + frequency +
    '&readAtFrom=' + from +
    '&readAtTo='   + to +
    '&page=1&results=2147483647';

  var resp = vgenApiGet(url, CFG_TENANT_ID);

  if (resp.code < 200 || resp.code >= 300) {
    throw new Error('AMR API HTTP ' + resp.code + ': ' + resp.body.substring(0, 200));
  }

  return JSON.parse(resp.body);
}

// ─── SAYFA YAZMA — SAATLİK ───────────────────────────────────────────────────

function _amrSaatlikYaz(ss, items, isoTarih) {
  var trTarih = isoTarih.split('-').reverse().join('.');
  var sheet   = cfgGetOrCreateSheet(ss, CFG_SAYFA_AMR_SAATLIK);
  sheet.clear();
  try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch(e) {}
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  var basliklar = ['SAAT', 'TÜKETİM (MWh)', 'ÜRETİM (MWh)', 'NET (MWh)', 'TAHMİNİ?'];
  cfgYazBaslik(sheet, 1, basliklar);
  [80, 130, 120, 130, 90].forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.setRowHeight(1, 36);

  // UTC → TR+3 saat map'i
  var map = {};
  items.forEach(function(item) {
    var d   = new Date(item.readAt);
    var tr  = new Date(d.getTime() + 3 * 3600000);
    var key = cfgPad2(tr.getUTCHours()) + ':00:00';
    map[key] = item;
  });

  var topK = 0, topU = 0;

  for (var h = 0; h < 24; h++) {
    var saat = cfgPad2(h) + ':00:00';
    var item = map[saat] || null;
    var kwh  = item ? cfgYuvarla(parseFloat(item.consumption) || 0) : 0;  // MWh
    var ukwh = item ? cfgYuvarla(parseFloat(item.generation)  || 0) : 0;  // MWh
    var net  = cfgYuvarla(kwh - ukwh);
    var auto = (item && item.consumptionAutoFilled) ? 'EVET' : '';
    var row  = h + 2;

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
  sheet.getRange(topSatir, 1, 1, 5)
    .setValues([['TOPLAM', cfgYuvarla(topK), cfgYuvarla(topU), cfgYuvarla(topK - topU), '']]);
  sheet.getRange(topSatir, 1, 1, 5)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(topSatir, 2, 1, 4).setNumberFormat('0.000');

  // Özet kutusu
  var ozetSatir = 28;
  sheet.getRange(ozetSatir, 1, 1, 3)
    .setValue('GÜNLÜK ÖZET')
    .setBackground('#344a5e').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');

  var ozetler = [
    ['Tarih',           trTarih,                       ''],
    ['Toplam Tüketim',  cfgYuvarla(topK),              'MWh'],
    ['Toplam Üretim',   cfgYuvarla(topU),              'MWh'],
    ['Net Tüketim',     cfgYuvarla(topK - topU),       'MWh'],
    ['Ortalama/Saat',   cfgYuvarla(topK / 24),         'MWh'],
    ['Son Güncelleme',  Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm'), '']
  ];

  ozetler.forEach(function(oz, o) {
    var r = ozetSatir + 1 + o;
    sheet.getRange(r, 1).setValue(oz[0]).setFontWeight('bold');
    sheet.getRange(r, 2).setValue(oz[1]).setNumberFormat(o >= 1 && o <= 4 ? '0.000' : '@');
    sheet.getRange(r, 3).setValue(oz[2]);
    sheet.getRange(r, 1, 1, 3).setBackground(o % 2 === 0 ? '#EEF4FB' : '#FFFFFF');
  });

  cfgSetBorder(sheet, 1, topSatir, 1, 5);
  cfgSetBorder(sheet, ozetSatir, ozetSatir + ozetler.length, 1, 3);
  SpreadsheetApp.flush();
  return sheet;
}

// ─── SAYFA YAZMA — AYLIK ─────────────────────────────────────────────────────

function _amrAylikYaz(ss, items, ay, yil) {
  var sayfaAdi = 'AMR_' + yil + '_' + cfgPad2(ay);
  var sheet    = cfgGetOrCreateSheet(ss, sayfaAdi);
  sheet.clear();
  try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch(e) {}
  sheet.setFrozenRows(1);

  var basliklar = ['TARİH', 'TÜKETİM (MWh)', 'ÜRETİM (MWh)', 'NET (MWh)', 'DURUM'];
  cfgYazBaslik(sheet, 1, basliklar);
  [110, 140, 130, 130, 90].forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });

  var topK = 0, topU = 0;

  items.forEach(function(item, i) {
    var d       = new Date(item.readAt);
    var tr      = new Date(d.getTime() + 3 * 3600000);
    var trTarih = cfgPad2(tr.getUTCDate()) + '.' + cfgPad2(tr.getUTCMonth() + 1) + '.' + tr.getUTCFullYear();
    var kwh     = cfgYuvarla(parseFloat(item.consumption) || 0);
    var ukwh    = cfgYuvarla(parseFloat(item.generation)  || 0);
    var net     = cfgYuvarla(kwh - ukwh);
    var durum   = item.consumptionAutoFilled ? '⚠ Tahmini' : '✓';
    var row     = i + 2;

    sheet.getRange(row, 1, 1, 5).setValues([[trTarih, kwh, ukwh, net, durum]]);
    sheet.getRange(row, 2, 1, 4).setNumberFormat('0.000');
    sheet.getRange(row, 1, 1, 5)
      .setBackground(item.consumptionAutoFilled ? '#FFF3CD' : (i % 2 === 0 ? '#F7F9FC' : '#FFFFFF'));

    topK += kwh;
    topU += ukwh;
  });

  var topSatir = items.length + 2;
  sheet.getRange(topSatir, 1, 1, 5)
    .setValues([['TOPLAM', cfgYuvarla(topK), cfgYuvarla(topU), cfgYuvarla(topK - topU), '']]);
  sheet.getRange(topSatir, 1, 1, 5)
    .setBackground('#1e3a5f').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheet.getRange(topSatir, 2, 1, 4).setNumberFormat('0.000');

  cfgSetBorder(sheet, 1, topSatir, 1, 5);
  SpreadsheetApp.flush();
  return sheet;
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

function amrTarihTest() {
  var r = amrTarihCek('2026-07-30');  // ← tarihi değiştirin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}

function amrAylikTest() {
  var r = amrAylikCek(7, 2026);  // ← ay, yıl değiştirin
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
