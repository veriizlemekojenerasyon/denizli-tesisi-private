/**
 * AYLIK ENERJI MOTOR RAPORU
 * Enerji GM-* kaynak sayfalarindan aylik uretim, calisma saati ve kalkis sayisi raporu uretir.
 */

function aylikEnerjiMotorRaporuOlustur() {
  return updateMonthlyEnergyMotorReport(new Date().getFullYear());
}

function aylikEnerjiMotorRaporu2026Olustur() {
  return updateMonthlyEnergyMotorReport(2026);
}

function updateMonthlyEnergyMotorReport(year) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var model = buildMonthlyEnergyMotorReportModel(targetYear);
    var sheet = getOrCreateMonthlyEnergyMotorReportSheet(targetYear);
    renderMonthlyEnergyMotorReportSheet(sheet, model);

    return {
      success: true,
      year: targetYear,
      sheetName: sheet.getName(),
      monthCount: model.months.length,
      message: 'Aylik enerji motor raporu guncellendi.'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getMonthlyEnergyMotorReportData(year) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var model = buildMonthlyEnergyMotorReportModel(targetYear);
    return {
      success: true,
      year: targetYear,
      generatedAt: Utilities.formatDate(model.generatedAt, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss'),
      motors: model.motors,
      months: model.months
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getOrCreateMonthlyEnergyMotorReportSheet(year) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = getMonthlyEnergyMotorReportSheetName(year);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function getMonthlyEnergyMotorReportSheetName(year) {
  return 'AylikEnerjiMotorRaporu-' + String(year || '').trim();
}

function buildMonthlyEnergyMotorReportModel(year) {
  var targetYear = parseInt(year, 10) || new Date().getFullYear();
  var motors = ['GM-1', 'GM-2', 'GM-3'];
  var motorRecords = {};

  for (var i = 0; i < motors.length; i++) {
    motorRecords[motors[i]] = readMonthlyEnergyMotorCounterRecords(motors[i], targetYear);
  }

  var months = [];
  for (var monthIndex = 0; monthIndex < 12; monthIndex++) {
    var startDate = new Date(targetYear, monthIndex, 1, 0, 0, 0, 0);
    var endDateExclusive = new Date(targetYear, monthIndex + 1, 1, 0, 0, 0, 0);
    var month = {
      monthIndex: monthIndex,
      monthName: getMonthlyEnergyMonthName(monthIndex),
      startDate: formatEnerjiDateTR(startDate),
      endDate: formatEnerjiDateTR(new Date(targetYear, monthIndex + 1, 0)),
      motors: {},
      total: createEmptyMonthlyEnergyMetric()
    };

    for (var m = 0; m < motors.length; m++) {
      var motor = motors[m];
      var metric = calculateMonthlyEnergyMetric(motorRecords[motor], startDate, endDateExclusive);
      month.motors[motor] = metric;
      addMonthlyEnergyMetric(month.total, metric);
    }

    months.push(month);
  }

  return {
    year: targetYear,
    motors: motors,
    months: months,
    generatedAt: new Date()
  };
}

function readMonthlyEnergyMotorCounterRecords(motor, year) {
  var sheet = getEnerjiSheetIfExists(motor);
  var records = [];
  if (!sheet || sheet.getLastRow() < 2) {
    return records;
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getDisplayValues();
  var minTime = new Date(year - 1, 11, 1, 0, 0, 0, 0).getTime();
  var maxTime = new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime();

  for (var i = 0; i < rows.length; i++) {
    var row = mapEnerjiRow(rows[i]);
    var timestamp = parseDateTimeTR(row.tarih, row.saat).getTime();
    if (isNaN(timestamp) || timestamp < minTime || timestamp >= maxTime) continue;

    records.push({
      timestamp: timestamp,
      tarih: normalizeDateTR(row.tarih),
      saat: normalizeEnerjiSaat(row.saat),
      toplamAktifEnerji: parseEnerjiNumber(row.toplamAktifEnerji),
      calismaSaati: parseEnerjiNumber(row.calismaSaati),
      kalkisSayisi: parseEnerjiNumber(row.kalkisSayisi)
    });
  }

  records.sort(function(a, b) {
    return a.timestamp - b.timestamp;
  });

  return records;
}

function calculateMonthlyEnergyMetric(records, startDate, endDateExclusive) {
  var startTime = startDate.getTime();
  var endTime = endDateExclusive.getTime();
  var baseline = null;
  var firstInPeriod = null;
  var lastInPeriod = null;
  var count = 0;

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    if (record.timestamp < startTime) {
      baseline = record;
      continue;
    }
    if (record.timestamp >= endTime) {
      break;
    }

    if (!firstInPeriod) firstInPeriod = record;
    lastInPeriod = record;
    count++;
  }

  if (!lastInPeriod) {
    return createEmptyMonthlyEnergyMetric();
  }

  var startRecord = baseline || firstInPeriod;
  var production = Math.max(0, lastInPeriod.toplamAktifEnerji - startRecord.toplamAktifEnerji);
  var hours = Math.max(0, lastInPeriod.calismaSaati - startRecord.calismaSaati);
  var starts = Math.max(0, lastInPeriod.kalkisSayisi - startRecord.kalkisSayisi);

  return {
    productionMwh: production,
    hours: hours,
    starts: starts,
    recordCount: count,
    baselineDateTime: startRecord ? startRecord.tarih + ' ' + startRecord.saat : '',
    firstDateTime: firstInPeriod ? firstInPeriod.tarih + ' ' + firstInPeriod.saat : '',
    lastDateTime: lastInPeriod ? lastInPeriod.tarih + ' ' + lastInPeriod.saat : ''
  };
}

function createEmptyMonthlyEnergyMetric() {
  return {
    productionMwh: 0,
    hours: 0,
    starts: 0,
    recordCount: 0,
    baselineDateTime: '',
    firstDateTime: '',
    lastDateTime: ''
  };
}

function addMonthlyEnergyMetric(total, metric) {
  total.productionMwh += parseEnerjiNumber(metric.productionMwh);
  total.hours += parseEnerjiNumber(metric.hours);
  total.starts += parseEnerjiNumber(metric.starts);
  total.recordCount += parseEnerjiNumber(metric.recordCount);
}

function renderMonthlyEnergyMotorReportSheet(sheet, model) {
  var motors = model.motors;
  var headers = ['Ay', 'Baslangic', 'Bitis'];
  for (var i = 0; i < motors.length; i++) {
    headers.push(motors[i] + ' Uretim (MWh)');
    headers.push(motors[i] + ' Calisma Saati');
    headers.push(motors[i] + ' Kalkis Sayisi');
  }
  headers.push('Toplam Uretim (MWh)');
  headers.push('Toplam Calisma Saati');
  headers.push('Toplam Kalkis Sayisi');
  headers.push('Kayit Sayisi');
  headers.push('Guncelleme Zamani');

  var values = [headers];
  for (var monthIndex = 0; monthIndex < model.months.length; monthIndex++) {
    var month = model.months[monthIndex];
    var row = [month.monthName, month.startDate, month.endDate];
    for (var m = 0; m < motors.length; m++) {
      var metric = month.motors[motors[m]] || createEmptyMonthlyEnergyMetric();
      row.push(roundMonthlyEnergyNumber(metric.productionMwh, 3));
      row.push(roundMonthlyEnergyNumber(metric.hours, 2));
      row.push(roundMonthlyEnergyNumber(metric.starts, 0));
    }
    row.push(roundMonthlyEnergyNumber(month.total.productionMwh, 3));
    row.push(roundMonthlyEnergyNumber(month.total.hours, 2));
    row.push(roundMonthlyEnergyNumber(month.total.starts, 0));
    row.push(month.total.recordCount);
    row.push(Utilities.formatDate(model.generatedAt, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss'));
    values.push(row);
  }

  var totalRow = buildMonthlyEnergyTotalRow(model, headers.length);
  values.push(totalRow);

  ensureSheetGridSize(sheet, values.length, headers.length);
  sheet.clear();
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  formatMonthlyEnergyMotorReportSheet(sheet, values.length, headers.length, motors.length);
}

function buildMonthlyEnergyTotalRow(model, columnCount) {
  var motors = model.motors;
  var row = ['YIL TOPLAMI', '01.01.' + model.year, '31.12.' + model.year];
  var yearlyTotal = createEmptyMonthlyEnergyMetric();

  for (var m = 0; m < motors.length; m++) {
    var motorTotal = createEmptyMonthlyEnergyMetric();
    for (var i = 0; i < model.months.length; i++) {
      addMonthlyEnergyMetric(motorTotal, model.months[i].motors[motors[m]]);
    }
    row.push(roundMonthlyEnergyNumber(motorTotal.productionMwh, 3));
    row.push(roundMonthlyEnergyNumber(motorTotal.hours, 2));
    row.push(roundMonthlyEnergyNumber(motorTotal.starts, 0));
    addMonthlyEnergyMetric(yearlyTotal, motorTotal);
  }

  row.push(roundMonthlyEnergyNumber(yearlyTotal.productionMwh, 3));
  row.push(roundMonthlyEnergyNumber(yearlyTotal.hours, 2));
  row.push(roundMonthlyEnergyNumber(yearlyTotal.starts, 0));
  row.push(yearlyTotal.recordCount);
  row.push('');

  while (row.length < columnCount) row.push('');
  return row;
}

function formatMonthlyEnergyMotorReportSheet(sheet, rowCount, columnCount, motorCount) {
  var headerRange = sheet.getRange(1, 1, 1, columnCount);
  headerRange
    .setBackground('#1f4e78')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  var dataRange = sheet.getRange(1, 1, rowCount, columnCount);
  dataRange
    .setBorder(true, true, true, true, true, true, '#b7b7b7', SpreadsheetApp.BorderStyle.SOLID)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  var totalRow = rowCount;
  sheet.getRange(totalRow, 1, 1, columnCount)
    .setBackground('#ffe699')
    .setFontWeight('bold');

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3);
  sheet.setColumnWidth(1, 110);
  sheet.setColumnWidth(2, 95);
  sheet.setColumnWidth(3, 95);

  for (var i = 0; i < motorCount; i++) {
    var startCol = 4 + (i * 3);
    sheet.setColumnWidth(startCol, 115);
    sheet.setColumnWidth(startCol + 1, 105);
    sheet.setColumnWidth(startCol + 2, 95);
    sheet.getRange(2, startCol, Math.max(rowCount - 1, 1), 1).setNumberFormat('0.000');
    sheet.getRange(2, startCol + 1, Math.max(rowCount - 1, 1), 1).setNumberFormat('0.00');
    sheet.getRange(2, startCol + 2, Math.max(rowCount - 1, 1), 1).setNumberFormat('0');
  }

  var totalStartCol = 4 + (motorCount * 3);
  sheet.setColumnWidth(totalStartCol, 120);
  sheet.setColumnWidth(totalStartCol + 1, 115);
  sheet.setColumnWidth(totalStartCol + 2, 105);
  sheet.setColumnWidth(totalStartCol + 3, 85);
  sheet.setColumnWidth(totalStartCol + 4, 145);
  sheet.getRange(2, totalStartCol, Math.max(rowCount - 1, 1), 1).setNumberFormat('0.000');
  sheet.getRange(2, totalStartCol + 1, Math.max(rowCount - 1, 1), 1).setNumberFormat('0.00');
  sheet.getRange(2, totalStartCol + 2, Math.max(rowCount - 1, 1), 1).setNumberFormat('0');
}

function getMonthlyEnergyMonthName(monthIndex) {
  var names = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
  return names[monthIndex] || '';
}

function roundMonthlyEnergyNumber(value, digits) {
  var factor = Math.pow(10, digits || 0);
  return Math.round(parseEnerjiNumber(value) * factor) / factor;
}
