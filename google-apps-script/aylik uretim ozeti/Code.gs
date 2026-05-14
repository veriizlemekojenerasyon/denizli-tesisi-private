/**
 * KOJEN AYLIK URETIM OZETI - Google Apps Script Kodu
 *
 * Bu kod, ayni Google Sheets dosyasindaki Enerji GM-1 / GM-2 / GM-3
 * sayfalarindan TOPLAM AKTIF ENERJI degerlerini okuyup aylik uretim
 * ozet sayfasi olusturur.
 *
 * Kullanim:
 * - Apps Script'e ayri bir dosya olarak eklenebilir.
 * - Manuel calistirma: updateMonthlyProductionSheet()
 * - Web app: ?action=updateMonthlyProductionSheet&year=2026&month=5
 */

function doGet(e) {
  return handleMonthlyProductionRequest(e);
}

function doPost(e) {
  return handleMonthlyProductionRequest(e);
}

function handleMonthlyProductionRequest(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || 'updateMonthlyProductionSheet';
  var result;

  try {
    switch (action) {
      case 'getMonthlyProductionSummary':
        result = getMonthlyProductionSummary(params.year, params.month);
        break;
      case 'updateMonthlyProductionSheet':
        result = updateMonthlyProductionSheet(params.year, params.month);
        break;
      default:
        result = { success: false, error: 'Gecersiz islem' };
    }
  } catch (error) {
    result = { success: false, error: error.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getMonthlyProductionSummary(year, month) {
  var now = new Date();
  var targetYear = parseInt(year, 10) || now.getFullYear();
  var targetMonth = parseInt(month, 10) || (now.getMonth() + 1);
  var daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  var motors = ['GM-1', 'GM-2', 'GM-3'];
  var rows = [];
  var totals = {
    GM1: 0,
    GM2: 0,
    GM3: 0,
    totalKwh: 0,
    totalMwh: 0
  };

  var recordsByMotor = {};
  for (var m = 0; m < motors.length; m++) {
    recordsByMotor[motors[m]] = readMonthlyEnergyRecords(motors[m], targetYear, targetMonth);
  }

  for (var day = 1; day <= daysInMonth; day++) {
    var dateText = pad2(day) + '.' + pad2(targetMonth) + '.' + targetYear;
    var gm1 = calculateDailyProduction(recordsByMotor['GM-1'][dateText] || []);
    var gm2 = calculateDailyProduction(recordsByMotor['GM-2'][dateText] || []);
    var gm3 = calculateDailyProduction(recordsByMotor['GM-3'][dateText] || []);
    var dayTotal = gm1.kwh + gm2.kwh + gm3.kwh;

    totals.GM1 += gm1.kwh;
    totals.GM2 += gm2.kwh;
    totals.GM3 += gm3.kwh;
    totals.totalKwh += dayTotal;

    rows.push({
      tarih: dateText,
      gm1Kwh: gm1.kwh,
      gm2Kwh: gm2.kwh,
      gm3Kwh: gm3.kwh,
      toplamKwh: dayTotal,
      toplamMwh: dayTotal / 1000,
      gm1Kayit: gm1.recordCount,
      gm2Kayit: gm2.recordCount,
      gm3Kayit: gm3.recordCount
    });
  }

  totals.totalMwh = totals.totalKwh / 1000;

  return {
    success: true,
    year: targetYear,
    month: targetMonth,
    monthLabel: pad2(targetMonth) + '.' + targetYear,
    daysInMonth: daysInMonth,
    rows: rows,
    totals: {
      gm1Kwh: totals.GM1,
      gm2Kwh: totals.GM2,
      gm3Kwh: totals.GM3,
      toplamKwh: totals.totalKwh,
      toplamMwh: totals.totalMwh
    }
  };
}

function updateMonthlyProductionSheet(year, month) {
  var summary = getMonthlyProductionSummary(year, month);
  if (!summary.success) return summary;

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'AylikUretimOzeti';
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  sheet.getDataRange().breakApart();
  sheet.clear();

  sheet.getRange(1, 1, 1, 6).merge();
  sheet.getRange(1, 1).setValue('AYLIK URETIM OZETI - ' + summary.monthLabel);
  sheet.getRange(1, 1).setFontWeight('bold');
  sheet.getRange(1, 1).setHorizontalAlignment('center');
  sheet.getRange(1, 1).setBackground('#c4d79b');

  var headers = [[
    'Tarih',
    'GM-1 Uretim (kWh)',
    'GM-2 Uretim (kWh)',
    'GM-3 Uretim (kWh)',
    'Toplam Uretim (kWh)',
    'Toplam Uretim (MWh)'
  ]];
  sheet.getRange(2, 1, 1, headers[0].length).setValues(headers);
  sheet.getRange(2, 1, 1, headers[0].length).setFontWeight('bold');
  sheet.getRange(2, 1, 1, headers[0].length).setHorizontalAlignment('center');
  sheet.getRange(2, 1, 1, headers[0].length).setBackground('#e2efd9');

  var values = summary.rows.map(function(row) {
    return [
      row.tarih,
      row.gm1Kwh,
      row.gm2Kwh,
      row.gm3Kwh,
      row.toplamKwh,
      row.toplamMwh
    ];
  });

  if (values.length > 0) {
    sheet.getRange(3, 1, values.length, 6).setValues(values);
    sheet.getRange(3, 1, values.length, 6).setHorizontalAlignment('center');
    sheet.getRange(3, 2, values.length, 4).setNumberFormat('0.00');
    sheet.getRange(3, 6, values.length, 1).setNumberFormat('0.000');
  }

  var totalRow = values.length + 3;
  sheet.getRange(totalRow, 1).setValue('AYLIK TOPLAM');
  sheet.getRange(totalRow, 2).setValue(summary.totals.gm1Kwh);
  sheet.getRange(totalRow, 3).setValue(summary.totals.gm2Kwh);
  sheet.getRange(totalRow, 4).setValue(summary.totals.gm3Kwh);
  sheet.getRange(totalRow, 5).setValue(summary.totals.toplamKwh);
  sheet.getRange(totalRow, 6).setValue(summary.totals.toplamMwh);
  sheet.getRange(totalRow, 1, 1, 6).setFontWeight('bold');
  sheet.getRange(totalRow, 2, 1, 4).setNumberFormat('0.00');
  sheet.getRange(totalRow, 6).setNumberFormat('0.000');
  sheet.getRange(totalRow, 1, 1, 6).setBackground('#fff2cc');

  sheet.getRange(1, 1, totalRow, 6)
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 145);
  sheet.setColumnWidth(6, 145);

  summary.sheet = {
    success: true,
    sheetName: sheetName,
    updatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
  };
  return summary;
}

function readMonthlyEnergyRecords(motor, year, month) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Enerji ' + motor);
  var grouped = {};
  if (!sheet || sheet.getLastRow() < 2) return grouped;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    var record = mapMonthlyEnergyRow(rows[i]);
    var date = parseDateTR(record.tarih);
    if (!date) continue;
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;

    var dateText = Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd.MM.yyyy');
    if (!grouped[dateText]) grouped[dateText] = [];
    grouped[dateText].push(record);
  }

  for (var key in grouped) {
    grouped[key].sort(function(a, b) {
      return parseDateTimeTR(a.tarih, a.saat) - parseDateTimeTR(b.tarih, b.saat);
    });
  }

  return grouped;
}

function calculateDailyProduction(records) {
  if (!records || records.length < 2) {
    return { kwh: 0, mwh: 0, recordCount: records ? records.length : 0 };
  }

  var first = parseMonthlyNumber(records[0].toplamAktifEnerji);
  var last = parseMonthlyNumber(records[records.length - 1].toplamAktifEnerji);
  var kwh = Math.max(0, last - first);
  return {
    kwh: kwh,
    mwh: kwh / 1000,
    recordCount: records.length
  };
}

function mapMonthlyEnergyRow(row) {
  return {
    tarih: row[0],
    saat: row[2],
    motor: row[3],
    toplamAktifEnerji: row[12],
    calismaSaati: row[13]
  };
}

function parseMonthlyNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  var normalized = String(value).trim();
  if (normalized.indexOf(',') !== -1) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  var parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function parseDateTR(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  var text = String(value).trim();
  var parts = text.indexOf('-') !== -1 ? text.split('-').reverse() : text.split('.');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
}

function parseDateTimeTR(tarih, saat) {
  var date = parseDateTR(tarih);
  if (!date) return new Date(0);
  var hourParts = String(saat || '00:00').split(':');
  date.setHours(parseInt(hourParts[0] || '0', 10));
  date.setMinutes(parseInt(hourParts[1] || '0', 10));
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}
