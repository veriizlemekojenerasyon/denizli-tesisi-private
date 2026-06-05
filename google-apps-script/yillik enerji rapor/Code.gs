/**
 * YILLIK ENERJI RAPORLARI - Google Apps Script
 * Bu dosya YillikEnerji-* ve YillikEnerjiToplam-* sayfalarini yonetir.
 * Kojen enerji veri kayit API'sinden ayridir.
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function onEdit(e) {
  return;
}

function yearlyEnergyInstallableOnEdit(e) {
  return handleYearlyEnergyEdit(e);
}

function handleYearlyEnergyEdit(e) {
  try {
    if (!e || !e.range) return;

    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    if (!/^Enerji\s+GM-/i.test(sheetName)) return;

    var firstRow = e.range.getRow();
    var rowCount = e.range.getNumRows();
    if (firstRow < 2 && firstRow + rowCount - 1 < 2) return;

    var startRow = Math.max(2, firstRow);
    var readableRowCount = (firstRow + rowCount) - startRow;
    if (readableRowCount <= 0) return;

    var rows = sheet.getRange(startRow, 1, readableRowCount, 4).getDisplayValues();
    var recordsToUpdate = [];
    var fallbackMotor = normalizeEnerjiMotorLabel(sheetName.replace(/^Enerji\s+/i, ''));

    for (var i = 0; i < rows.length; i++) {
      var tarih = normalizeDateTR(rows[i][0] || '');
      var rawSaat = String(rows[i][2] || '').trim();
      if (!tarih || !rawSaat) continue;
      var saat = normalizeEnerjiSaat(rawSaat);

      recordsToUpdate.push({
        motor: rows[i][3] ? normalizeEnerjiMotorLabel(rows[i][3]) : fallbackMotor,
        tarih: tarih,
        saat: saat
      });
    }

    if (recordsToUpdate.length) {
      updateYearlyEnergyAfterAddedRecords(recordsToUpdate);
    }
  } catch (error) {
    Logger.log('Yillik enerji onEdit guncelleme hatasi: ' + error.toString());
  }
}

function installYearlyEnergyEditTrigger() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;

    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'yearlyEnergyInstallableOnEdit') {
        ScriptApp.deleteTrigger(triggers[i]);
        removed++;
      }
    }

    var trigger = ScriptApp.newTrigger('yearlyEnergyInstallableOnEdit')
      .forSpreadsheet(spreadsheet)
      .onEdit()
      .create();

    return {
      success: true,
      spreadsheetName: spreadsheet.getName(),
      spreadsheetId: spreadsheet.getId(),
      handler: trigger.getHandlerFunction(),
      eventType: String(trigger.getEventType()),
      removedExisting: removed,
      message: 'Yillik enerji edit tetikleyicisi kuruldu.'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function manuelEditKontrol() {
  return checkYearlyEnergyManualEditSetup();
}

function manuelYillikGuncellemeTest() {
  return testYearlyEnergyManualEditUpdate('GM-1');
}

function yillikDijitalAktarimOnizleme() {
  return importYearlyEnergyDigitalSheets(2026, '', { dryRun: true });
}

function yillikDijitalAktarim() {
  return importYearlyEnergyDigitalSheets(2026, '', { dryRun: false });
}

function yillikDijitalAktarimGM1Onizleme() {
  return importYearlyEnergyDigitalSheets(2026, 'GM-1', { dryRun: true });
}

function yillikDijitalAktarimGM1() {
  return importYearlyEnergyDigitalSheets(2026, 'GM-1', { dryRun: false });
}

function gecmisEnerjiGM1SablonHazirla() {
  return createYearlyEnergyHistoricalInputTemplate(2026, 'GM-1', '01.01.2026', '31.05.2026');
}

function gecmisEnerjiSablonHazirla() {
  return createYearlyEnergyHistoricalInputTemplate(2026, '', '01.01.2026', '31.05.2026');
}

function gecmisEnerjiGM1YilligaAktar() {
  return updateYearlyEnergySheet(2026, 'GM-1');
}

function gecmisEnerjiYilligaAktar() {
  return updateYearlyEnergy2026Sheets();
}

function handleRequest(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = String(params.action || '').trim();
  var lock = null;

  try {
    if (isWriteAction(action)) {
      lock = LockService.getScriptLock();
      lock.waitLock(5000);
    }

    var result;
    switch (action) {
      case '':
      case 'health':
        result = getApiHealth();
        break;
      case 'updateYearlyEnergyForRecords':
        result = updateYearlyEnergyForRecords(params.data);
        break;
      case 'updateYearlyEnergySheet':
        result = updateYearlyEnergySheet(params.year, params.motor);
        break;
      case 'updateYearlyEnergy2026Sheets':
        result = updateYearlyEnergy2026Sheets();
        break;
      case 'updateYearlyEnergySummarySheet':
        result = updateYearlyEnergySummarySheet(params.year);
        break;
      case 'updateYearlyEnergySummaryFromExistingSheets':
        result = updateYearlyEnergySummaryFromExistingSheets(params.year);
        break;
      case 'updateMonthlyEnergyMotorReport':
        result = updateMonthlyEnergyMotorReport(params.year);
        break;
      case 'getMonthlyEnergyMotorReportData':
        result = getMonthlyEnergyMotorReportData(params.year);
        break;
      case 'getYearlyEnergyReportData':
        result = getYearlyEnergyReportData(params.year);
        break;
      case 'checkYearlyEnergyManualEditSetup':
        result = checkYearlyEnergyManualEditSetup();
        break;
      case 'installYearlyEnergyEditTrigger':
        result = installYearlyEnergyEditTrigger();
        break;
      case 'testYearlyEnergyManualEditUpdate':
        result = testYearlyEnergyManualEditUpdate(params.motor);
        break;
      case 'previewYearlyEnergyDigitalImport':
        result = importYearlyEnergyDigitalSheets(params.year, params.motor, { dryRun: true });
        break;
      case 'importYearlyEnergyDigitalRecords':
        result = importYearlyEnergyDigitalSheets(params.year, params.motor, {
          dryRun: String(params.dryRun || '').toLowerCase() === 'true'
        });
        break;
      case 'createYearlyEnergyHistoricalInputTemplate':
        result = createYearlyEnergyHistoricalInputTemplate(params.year, params.motor, params.startDate, params.endDate);
        break;
      case 'applyYearlyEnergyTotalRows':
        result = applyYearlyEnergyTotalRows(params.year, params.motor);
        break;
      case 'backupYearlyEnergySheets':
        result = backupYearlyEnergySheets(params.year);
        break;
      default:
        result = { success: false, error: 'Gecersiz islem' };
    }

    if (lock) lock.releaseLock();
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    if (lock) lock.releaseLock();
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function isWriteAction(action) {
  return ['updateYearlyEnergyForRecords', 'updateYearlyEnergySheet', 'updateYearlyEnergy2026Sheets', 'updateYearlyEnergySummarySheet', 'updateYearlyEnergySummaryFromExistingSheets', 'updateMonthlyEnergyMotorReport', 'testYearlyEnergyManualEditUpdate', 'importYearlyEnergyDigitalRecords', 'createYearlyEnergyHistoricalInputTemplate', 'applyYearlyEnergyTotalRows', 'backupYearlyEnergySheets', 'installYearlyEnergyEditTrigger'].indexOf(action) !== -1;
}

function getApiHealth() {
  return {
    success: true,
    service: 'Yillik Enerji Raporlari',
    message: 'API calisiyor. Yillik enerji raporlari icin action parametresi ekleyin.',
    checkedAt: new Date().toISOString(),
    availableActions: [
      'updateYearlyEnergyForRecords',
      'updateYearlyEnergySheet',
      'updateYearlyEnergy2026Sheets',
      'updateYearlyEnergySummarySheet',
      'updateYearlyEnergySummaryFromExistingSheets',
      'updateMonthlyEnergyMotorReport',
      'getMonthlyEnergyMotorReportData',
      'getYearlyEnergyReportData',
      'checkYearlyEnergyManualEditSetup',
      'installYearlyEnergyEditTrigger',
      'testYearlyEnergyManualEditUpdate',
      'previewYearlyEnergyDigitalImport',
      'importYearlyEnergyDigitalRecords',
      'createYearlyEnergyHistoricalInputTemplate',
      'applyYearlyEnergyTotalRows',
      'backupYearlyEnergySheets'
    ]
  };
}

function checkYearlyEnergyManualEditSetup() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = spreadsheet.getSheets();
    var enerjiSheets = [];
    var yearlySheets = [];

    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName();
      if (/^Enerji\s+GM-/i.test(name)) {
        enerjiSheets.push({
          name: name,
          lastRow: sheets[i].getLastRow(),
          lastColumn: sheets[i].getLastColumn()
        });
      }
      if (name.indexOf('YillikEnerji') === 0) {
        yearlySheets.push(name);
      }
    }

    var triggers = [];
    try {
      var projectTriggers = ScriptApp.getProjectTriggers();
      for (var t = 0; t < projectTriggers.length; t++) {
        triggers.push({
          handler: projectTriggers[t].getHandlerFunction(),
          eventType: String(projectTriggers[t].getEventType())
        });
      }
    } catch (triggerError) {
      triggers.push({ error: triggerError.toString() });
    }

    var result = {
      success: true,
      spreadsheetName: spreadsheet.getName(),
      spreadsheetId: spreadsheet.getId(),
      simpleOnEditFunctionExists: true,
      enerjiSheetCount: enerjiSheets.length,
      enerjiSheets: enerjiSheets,
      yearlySheetCount: yearlySheets.length,
      yearlySheets: yearlySheets,
      installableTriggers: triggers,
      note: 'Manuel hucre degisikligi icin bu Apps Script projesi ilgili Google Sheet dosyasina bagli olmalidir. Bagliysa onEdit otomatik calisir.'
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    var errorResult = { success: false, error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function runCheckYearlyEnergyManualEditSetup() {
  return checkYearlyEnergyManualEditSetup();
}

function testYearlyEnergyManualEditUpdate(motor) {
  try {
    var targetMotor = normalizeEnerjiMotorLabel(motor || 'GM-1');
    var sheet = getEnerjiSheetIfExists(targetMotor);
    if (!sheet || sheet.getLastRow() < 2) {
      return { success: false, error: targetMotor + ' icin Enerji GM sayfasinda test edilecek kayit bulunamadi.' };
    }

    var lastRow = sheet.getLastRow();
    var row = sheet.getRange(lastRow, 1, 1, 4).getDisplayValues()[0];
    var tarih = normalizeDateTR(row[0] || '');
    var saat = normalizeEnerjiSaat(row[2] || '');
    var rowMotor = row[3] ? normalizeEnerjiMotorLabel(row[3]) : targetMotor;

    if (!tarih || !saat) {
      return {
        success: false,
        error: 'Son satirda tarih veya saat eksik.',
        sheetName: sheet.getName(),
        row: lastRow,
        values: row
      };
    }

    var record = {
      motor: rowMotor,
      tarih: tarih,
      saat: saat
    };
    var updateResult = updateYearlyEnergyAfterAddedRecords([record]);

    var result = {
      success: updateResult.success !== false,
      message: 'Son Enerji GM satiri ile yillik enerji guncellemesi test edildi.',
      sheetName: sheet.getName(),
      row: lastRow,
      record: record,
      updateResult: updateResult
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    var errorResult = { success: false, error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function runTestYearlyEnergyManualEditUpdate() {
  return testYearlyEnergyManualEditUpdate('GM-1');
}

function updateYearlyEnergyForRecords(dataString) {
  try {
    var records = JSON.parse(dataString || '[]');
    if (!Array.isArray(records)) {
      return { success: false, error: 'Veri formati hatali' };
    }
    return updateYearlyEnergyAfterAddedRecords(records);
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function normalizeDateTR(tarih) {
  var value = String(tarih || '').trim();
  if (value.indexOf('-') !== -1) {
    var parts = value.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  return value;
}

function normalizeEnerjiMotorLabel(motor) {
  var value = String(motor || 'GM-1').trim().toUpperCase();
  if (!value) return 'GM-1';
  value = value.replace(/\s+/g, '');
  var gmMatch = value.match(/GM-?(\d+)$/);
  if (gmMatch) return 'GM-' + gmMatch[1];
  if (/^\d+$/.test(value)) return 'GM-' + value;
  return 'GM-' + value;
}

function getEnerjiSheetName(motor) {
  return 'Enerji ' + normalizeEnerjiMotorLabel(motor);
}

function getEnerjiSheetIfExists(motor) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var targetMotor = normalizeEnerjiMotorLabel(motor);
  var exactSheet = spreadsheet.getSheetByName(getEnerjiSheetName(targetMotor));
  if (exactSheet) {
    return exactSheet;
  }

  var sheets = spreadsheet.getSheets();
  var bestSheet = null;
  var bestScore = -1;
  var bestRowCount = -1;

  for (var i = 0; i < sheets.length; i++) {
    var currentSheet = sheets[i];
    var sheetName = currentSheet.getName();
    if (sheetName.indexOf('YillikEnerji') === 0 || sheetName === 'SistemLoglari') {
      continue;
    }

    if (!/^Enerji\s+/i.test(sheetName)) {
      continue;
    }

    if (currentSheet.getLastColumn() < 4) {
      continue;
    }

    var score = 0;
    var dataRowCount = Math.max(0, currentSheet.getLastRow() - 1);
    var normalizedSheetMotor = normalizeEnerjiMotorLabel(sheetName.replace(/^Enerji\s+/i, ''));
    if (normalizedSheetMotor === targetMotor) {
      score += 10;
    }

    if (currentSheet.getLastRow() >= 2) {
      var rowCount = Math.min(currentSheet.getLastRow() - 1, 500);
      var motorValues = currentSheet.getRange(2, 4, rowCount, 1).getDisplayValues();
      for (var j = 0; j < motorValues.length; j++) {
        var rawMotor = String(motorValues[j][0] || '').trim();
        if (rawMotor && normalizeEnerjiMotorLabel(rawMotor) === targetMotor) {
          score++;
        }
      }
    }

    if (score > bestScore || (score === bestScore && dataRowCount > bestRowCount)) {
      bestScore = score;
      bestRowCount = dataRowCount;
      bestSheet = currentSheet;
    }
  }

  if (bestScore > 0) {
    return bestSheet;
  }

  return null;
}

function mapEnerjiRow(row) {
  return {
    tarih: row[0],
    vardiya: row[1],
    saat: row[2],
    motor: row[3],
    aydemVoltaji: row[4],
    aktifGuc: row[5],
    reaktifGuc: row[6],
    cosPhi: row[7],
    ortAkim: row[8],
    ortGerilim: row[9],
    notrAkim: row[10],
    tahrikGerilimi: row[11],
    toplamAktifEnerji: row[12],
    calismaSaati: row[13],
    kalkisSayisi: row[14],
    durum: row[15],
    kaydeden: row[16],
    kayitTarihi: row[17]
  };
}

function parseEnerjiNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  var normalized = String(value).trim();
  if (normalized.indexOf(',') !== -1) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }
  var parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function parseDateTimeTR(tarih, saat) {
  if (Object.prototype.toString.call(tarih) === '[object Date]' && !isNaN(tarih.getTime())) {
    var dateHourParts = String(saat || '00:00').split(':');
    return new Date(
      tarih.getFullYear(),
      tarih.getMonth(),
      tarih.getDate(),
      parseInt(dateHourParts[0] || '0', 10),
      parseInt(dateHourParts[1] || '0', 10)
    );
  }

  var text = String(tarih || '');
  var parts;
  if (text.indexOf('-') !== -1) {
    parts = text.split('-').reverse();
  } else if (text.indexOf('/') !== -1) {
    var slashParts = text.split('/');
    parts = slashParts[0].length === 4
      ? [slashParts[2], slashParts[1], slashParts[0]]
      : [slashParts[1], slashParts[0], slashParts[2]];
  } else {
    parts = text.split('.');
  }
  var hourParts = String(saat || '00:00').split(':');
  return new Date(
    parseInt(parts[2], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[0], 10),
    parseInt(hourParts[0] || '0', 10),
    parseInt(hourParts[1] || '0', 10)
  );
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

// Yillik enerji sayfasi guncelleme
function updateYearlyEnergySheet(year, motor) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var results = [];

    for (var i = 0; i < motors.length; i++) {
      var currentMotor = motors[i];
      var model = buildYearlyEnergySheetModel(currentMotor, targetYear);
      var sheet = getOrCreateYearlyEnergySheet(currentMotor, targetYear);
      renderYearlyEnergySheet(sheet, model);

      results.push({
        motor: currentMotor,
        year: targetYear,
        sheetName: sheet.getName(),
        dayCount: model.days.length,
        slotCount: model.slots.length
      });
    }

    var summaryResult = updateYearlyEnergySummarySheet(targetYear);
    var monthlyResult = typeof updateMonthlyEnergyMotorReport === 'function'
      ? updateMonthlyEnergyMotorReport(targetYear)
      : { success: true, skipped: true, message: 'Aylik enerji motor raporu fonksiyonu bulunamadi.' };

    return {
      success: true,
      year: targetYear,
      results: results,
      summary: summaryResult,
      monthly: monthlyResult,
      message: results.length + ' adet yillik enerji sayfasi guncellendi.'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateYearlyEnergy2026Sheets() {
  return updateYearlyEnergySheet(2026, '');
}

function getOrCreateYearlyEnergySheet(motor, year) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'YillikEnerji-' + normalizeEnerjiMotorLabel(motor) + '-' + String(year || '').trim();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function buildYearlyEnergySheetModel(motor, year) {
  var slots = getYearlyEnergyHourSlots();
  var lookup = buildYearlyEnergyRecordLookup(motor, year);
  var sortedRecords = lookup.sortedRecords;
  var exactMap = lookup.exactMap;
  var historicalInputMap = buildYearlyEnergyHistoricalInputMap(motor, year);
  var days = [];
  var dayCount = Math.round((new Date(year + 1, 0, 1) - new Date(year, 0, 1)) / 86400000);
  var pointer = -1;
  var lastRecordTimestamp = sortedRecords.length ? sortedRecords[sortedRecords.length - 1].timestamp : null;

  for (var dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    var currentDate = new Date(year, 0, dayIndex + 1);
    var nextDate = new Date(year, 0, dayIndex + 2);
    var dateKey = formatEnerjiDateTR(currentDate);
    var nextDateKey = formatEnerjiDateTR(nextDate);
    var startOfDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 0, 0, 0, 0).getTime();

    while (pointer + 1 < sortedRecords.length && sortedRecords[pointer + 1].timestamp <= startOfDay) {
      pointer++;
    }

    var previousRecord = pointer >= 0 && (lastRecordTimestamp === null || startOfDay <= lastRecordTimestamp)
      ? sortedRecords[pointer]
      : null;
    var previousEnergy = previousRecord ? previousRecord.toplamAktifEnerji : null;
    var previousHours = previousRecord ? previousRecord.calismaSaati : null;
    var startHistoricalRecord = historicalInputMap[dateKey + '|23:59'] || null;
    var rows = [];

    if (startHistoricalRecord) {
      var startHistoricalOutput = buildYearlyEnergyHistoricalSlotOutput(startHistoricalRecord, previousEnergy, previousHours);
      previousEnergy = startHistoricalOutput.nextEnergy;
      previousHours = startHistoricalOutput.nextHours;
      rows.push({
        saat: '23:59',
        calismaSaati: startHistoricalOutput.calismaSaati,
        toplamAktifEnerji: startHistoricalOutput.toplamAktifEnerji,
        saatlikUretim: startHistoricalOutput.saatlikUretim
      });
    } else {
      rows.push({
        saat: '23:59',
        calismaSaati: previousHours,
        toplamAktifEnerji: previousEnergy,
        saatlikUretim: 0
      });
    }

    for (var hour = 1; hour <= 23; hour++) {
      var slot = pad2(hour) + ':00';
      var historicalRecord = historicalInputMap[dateKey + '|' + slot] || null;
      var record = historicalRecord || exactMap[dateKey + '|' + slot] || null;
      var slotTime = parseDateTimeTR(dateKey, slot).getTime();
      var output = historicalRecord
        ? buildYearlyEnergyHistoricalSlotOutput(record, previousEnergy, previousHours)
        : buildYearlyEnergySlotOutput(
          record,
          previousEnergy,
          previousHours,
          lastRecordTimestamp === null || slotTime <= lastRecordTimestamp
        );
      previousEnergy = output.nextEnergy;
      previousHours = output.nextHours;
      rows.push({
        saat: slot,
        calismaSaati: output.calismaSaati,
        toplamAktifEnerji: output.toplamAktifEnerji,
        saatlikUretim: output.saatlikUretim
      });
    }

    var midnightHistoricalRecord = historicalInputMap[dateKey + '|00:00'] || null;
    var midnightRecord = midnightHistoricalRecord || exactMap[nextDateKey + '|00:00'] || null;
    var midnightTime = parseDateTimeTR(nextDateKey, '00:00').getTime();
    var midnightOutput = midnightHistoricalRecord
      ? buildYearlyEnergyHistoricalSlotOutput(midnightRecord, previousEnergy, previousHours)
      : buildYearlyEnergySlotOutput(
        midnightRecord,
        previousEnergy,
        previousHours,
        lastRecordTimestamp === null || midnightTime <= lastRecordTimestamp
      );
    rows.push({
      saat: '00:00',
      calismaSaati: midnightOutput.calismaSaati,
      toplamAktifEnerji: midnightOutput.toplamAktifEnerji,
      saatlikUretim: midnightOutput.saatlikUretim
    });

    days.push({
      dateKey: dateKey,
      headerText: formatEnerjiHeaderDate(currentDate),
      rows: rows
    });
  }

  return {
    motor: motor,
    year: year,
    slots: slots,
    days: days
  };
}

function buildYearlyEnergyRecordLookup(motor, year) {
  var sheet = getEnerjiSheetIfExists(motor);
  var sortedRecords = [];
  var exactMap = {};
  if (!sheet || sheet.getLastRow() < 2) {
    return { sortedRecords: sortedRecords, exactMap: exactMap };
  }

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getDisplayValues();
  var minTime = new Date(year - 1, 11, 31, 0, 0, 0, 0).getTime();
  var maxTime = new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime();

  for (var i = 0; i < rows.length; i++) {
    var row = mapEnerjiRow(rows[i]);
    var tarihObj = parseEnerjiDateOnly(row.tarih);
    if (!tarihObj) continue;

    var tarih = formatEnerjiDateTR(tarihObj);
    var saat = normalizeEnerjiSaat(row.saat);
    var timestamp = parseDateTimeTR(tarih, saat).getTime();

    if (timestamp < minTime || timestamp > maxTime) {
      continue;
    }

    var record = {
      tarih: tarih,
      saat: saat,
      timestamp: timestamp,
      calismaSaati: parseEnerjiNumber(row.calismaSaati),
      toplamAktifEnerji: parseEnerjiNumber(row.toplamAktifEnerji)
    };

    sortedRecords.push(record);
    exactMap[tarih + '|' + saat] = record;
  }

  sortedRecords.sort(function(a, b) {
    return a.timestamp - b.timestamp;
  });

  return {
    sortedRecords: sortedRecords,
    exactMap: exactMap
  };
}

function buildYearlyEnergySlotOutput(record, previousEnergy, previousHours, allowCarry) {
  if (record) {
    var hourlyMwh = previousEnergy === null ? 0 : Math.max(0, record.toplamAktifEnerji - previousEnergy);
    return {
      calismaSaati: record.calismaSaati,
      toplamAktifEnerji: record.toplamAktifEnerji,
      saatlikUretim: hourlyMwh,
      nextEnergy: record.toplamAktifEnerji,
      nextHours: record.calismaSaati
    };
  }

  if (allowCarry === false) {
    return {
      calismaSaati: null,
      toplamAktifEnerji: null,
      saatlikUretim: '',
      nextEnergy: previousEnergy,
      nextHours: previousHours
    };
  }

  return {
    calismaSaati: previousHours,
    toplamAktifEnerji: previousEnergy,
    saatlikUretim: 0,
    nextEnergy: previousEnergy,
    nextHours: previousHours
  };
}

function buildYearlyEnergyHistoricalSlotOutput(record, previousEnergy, previousHours) {
  var nextEnergy = record.toplamAktifEnerji === null ? previousEnergy : record.toplamAktifEnerji;
  var nextHours = record.calismaSaati === null ? previousHours : record.calismaSaati;
  var hourlyMwh = record.saatlikUretim;
  if ((hourlyMwh === null || hourlyMwh === '') && record.toplamAktifEnerji !== null) {
    hourlyMwh = previousEnergy === null ? 0 : Math.max(0, record.toplamAktifEnerji - previousEnergy);
  }

  return {
    calismaSaati: record.calismaSaati,
    toplamAktifEnerji: record.toplamAktifEnerji,
    saatlikUretim: hourlyMwh,
    nextEnergy: nextEnergy,
    nextHours: nextHours
  };
}

function renderYearlyEnergySheet(sheet, model) {
  var totalRows = getYearlyEnergySheetRowCount(model);
  var totalRow = getYearlyEnergyTotalRow(model);
  var totalCols = 1 + (model.days.length * 3);
  var values = [];
  var backgrounds = [];

  backupSheetBeforeFullRender(sheet, 'Yillik enerji tam guncelleme');
  ensureSheetGridSize(sheet, totalRows, totalCols);
  sheet.getDataRange().breakApart();
  sheet.clear();

  for (var rowIndex = 0; rowIndex < totalRows; rowIndex++) {
    var rowValues = [];
    var rowBackgrounds = [];
    for (var colIndex = 0; colIndex < totalCols; colIndex++) {
      rowValues.push('');
      rowBackgrounds.push('#ffffff');
    }
    values.push(rowValues);
    backgrounds.push(rowBackgrounds);
  }

  values[0][0] = model.motor;
  values[1][0] = 'Saat';
  values[totalRow - 1][0] = 'TOPLAM';
  backgrounds[0][0] = '#ffe699';
  backgrounds[1][0] = '#f3f3f3';
  backgrounds[totalRow - 1][0] = '#ffe699';

  for (var slotIndex = 0; slotIndex < model.slots.length; slotIndex++) {
    values[slotIndex + 2][0] = model.slots[slotIndex];
  }

  for (var dayIndex = 0; dayIndex < model.days.length; dayIndex++) {
    var day = model.days[dayIndex];
    var startCol = 1 + (dayIndex * 3);

    values[0][startCol] = day.headerText;
    values[1][startCol] = 'Calisma Saati';
    values[1][startCol + 1] = 'Toplam Aktif Enerji (MWh)';
    values[1][startCol + 2] = 'Saatlik Uretim (MW)';
    backgrounds[0][startCol] = '#c4d79b';
    backgrounds[0][startCol + 1] = '#c4d79b';
    backgrounds[0][startCol + 2] = '#c4d79b';
    backgrounds[1][startCol] = '#f3f3f3';
    backgrounds[1][startCol + 1] = '#f3f3f3';
    backgrounds[1][startCol + 2] = '#f3f3f3';

    for (var itemIndex = 0; itemIndex < day.rows.length; itemIndex++) {
      var item = day.rows[itemIndex];
      var targetRow = itemIndex + 2;
      values[targetRow][startCol] = item.calismaSaati === null ? '' : item.calismaSaati;
      values[targetRow][startCol + 1] = item.toplamAktifEnerji === null ? '' : item.toplamAktifEnerji;
      values[targetRow][startCol + 2] = item.saatlikUretim;

      backgrounds[targetRow][startCol + 2] = getYearlyEnergyProductionCellBackground(item.saatlikUretim, '#ffffff');
    }

    values[totalRow - 1][startCol] = getYearlyEnergyCounterDiffFromRows(day.rows, 'calismaSaati');
    values[totalRow - 1][startCol + 1] = getYearlyEnergyCounterDiffFromRows(day.rows, 'toplamAktifEnerji');
    values[totalRow - 1][startCol + 2] = getYearlyEnergyProductionTotalFromRows(day.rows);
    backgrounds[totalRow - 1][startCol] = '#ffe699';
    backgrounds[totalRow - 1][startCol + 1] = '#ffe699';
    backgrounds[totalRow - 1][startCol + 2] = '#ffe699';
  }

  var fullRange = sheet.getRange(1, 1, totalRows, totalCols);
  fullRange.setValues(values);
  fullRange.setBackgrounds(backgrounds);
  fullRange.setHorizontalAlignment('center');
  fullRange.setVerticalAlignment('middle');
  fullRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange(1, 1, 1, 1).setFontWeight('bold');
  sheet.getRange(2, 1, totalRows - 1, 1).setFontWeight('bold');
  sheet.getRange(totalRow, 1, 1, totalCols).setFontWeight('bold');
  sheet.getRange(2, 1, 1, totalCols).setFontWeight('bold');
  sheet.getRange(2, 1, 1, totalCols).setWrap(true);

  for (var mergeIndex = 0; mergeIndex < model.days.length; mergeIndex++) {
    var mergeStartCol = 2 + (mergeIndex * 3);
    var titleRange = sheet.getRange(1, mergeStartCol, 1, 3);
    titleRange.merge();
    titleRange.setValue(model.days[mergeIndex].headerText);
    titleRange.setFontWeight('bold');
  }

  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 70);

  for (var widthIndex = 0; widthIndex < model.days.length; widthIndex++) {
    var widthStartCol = 2 + (widthIndex * 3);
    sheet.setColumnWidth(widthStartCol, 90);
    sheet.setColumnWidth(widthStartCol + 1, 115);
    sheet.setColumnWidth(widthStartCol + 2, 95);
    sheet.getRange(3, widthStartCol, model.slots.length, 1).setNumberFormat('0.##');
    sheet.getRange(3, widthStartCol + 1, model.slots.length, 1).setNumberFormat('0.##');
    sheet.getRange(3, widthStartCol + 2, model.slots.length, 1).setNumberFormat('0.###');
    sheet.getRange(totalRow, widthStartCol, 1, 3).setNumberFormat('0.###');
  }
}

function updateYearlyEnergyAfterRecord(motor, tarih, saat) {
  try {
    var affectedDates = getYearlyEnergyAffectedDates(tarih, saat);
    return updateYearlyEnergyDayBlocks(motor, affectedDates);
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateYearlyEnergyAfterAddedRecords(addedRecords) {
  try {
    var grouped = {};

    for (var i = 0; i < addedRecords.length; i++) {
      var record = addedRecords[i];
      var affectedDates = getYearlyEnergyAffectedDates(record.tarih, record.saat);
      for (var j = 0; j < affectedDates.length; j++) {
        var date = parseEnerjiDateOnly(affectedDates[j]);
        if (!date) continue;

        var motor = normalizeEnerjiMotorLabel(record.motor);
        var year = date.getFullYear();
        var groupKey = motor + '|' + year;
        if (!grouped[groupKey]) {
          grouped[groupKey] = {
            motor: motor,
            year: year,
            dates: {}
          };
        }
        grouped[groupKey].dates[formatEnerjiDateTR(date)] = true;
      }
    }

    var results = [];
    var monthlyYears = {};
    for (var key in grouped) {
      var group = grouped[key];
      var dates = Object.keys(group.dates).sort(function(a, b) {
        return parseEnerjiDateOnly(a).getTime() - parseEnerjiDateOnly(b).getTime();
      });
      results.push(updateYearlyEnergyDayBlocksForYear(group.motor, group.year, dates));
      monthlyYears[group.year] = true;
    }

    var monthlyResults = [];
    for (var yearKey in monthlyYears) {
      if (typeof updateMonthlyEnergyMotorReport === 'function') {
        monthlyResults.push(updateMonthlyEnergyMotorReport(parseInt(yearKey, 10)));
      }
    }

    return { success: true, results: results, monthlyResults: monthlyResults };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getYearlyEnergyAffectedDates(tarih, saat) {
  var date = parseEnerjiDateOnly(tarih);
  if (!date) return [];

  var dateMap = {};
  dateMap[formatEnerjiDateTR(date)] = true;

  if (normalizeEnerjiSaat(saat) === '00:00') {
    var previousDate = new Date(date.getTime());
    previousDate.setDate(previousDate.getDate() - 1);
    dateMap[formatEnerjiDateTR(previousDate)] = true;
  }

  return Object.keys(dateMap);
}

function updateYearlyEnergyDayBlocks(motor, dates) {
  var grouped = {};
  for (var i = 0; i < dates.length; i++) {
    var date = parseEnerjiDateOnly(dates[i]);
    if (!date) continue;

    var year = date.getFullYear();
    if (!grouped[year]) grouped[year] = {};
    grouped[year][formatEnerjiDateTR(date)] = true;
  }

  var results = [];
  for (var yearKey in grouped) {
    results.push(updateYearlyEnergyDayBlocksForYear(
      motor,
      parseInt(yearKey, 10),
      Object.keys(grouped[yearKey]).sort(function(a, b) {
        return parseEnerjiDateOnly(a).getTime() - parseEnerjiDateOnly(b).getTime();
      })
    ));
  }

  return { success: true, results: results };
}

function updateYearlyEnergyDayBlocksForYear(motor, year, dates) {
  var model = buildYearlyEnergySheetModel(motor, year);
  var sheet = getOrCreateYearlyEnergySheet(motor, year);
  var totalRows = getYearlyEnergySheetRowCount(model);
  var totalCols = 1 + (model.days.length * 3);

  if (shouldRenderFullYearlyEnergySheet(sheet, model, totalRows, totalCols)) {
    renderYearlyEnergySheet(sheet, model);
    var fullSummaryResult = updateYearlyEnergySummaryDayBlocks(year, dates);
    return {
      success: true,
      motor: motor,
      year: year,
      sheetName: sheet.getName(),
      fullRender: true,
      updatedDates: dates,
      summary: fullSummaryResult
    };
  }

  ensureSheetGridSize(sheet, totalRows, totalCols);
  renderYearlyEnergyBaseColumn(sheet, model);

  var updatedDates = [];
  for (var i = 0; i < dates.length; i++) {
    var date = parseEnerjiDateOnly(dates[i]);
    if (!date || date.getFullYear() !== year) continue;

    var dayIndex = getYearlyEnergyDayIndex(date);
    if (dayIndex < 0 || dayIndex >= model.days.length) continue;

    var updated = renderYearlyEnergyDayBlock(sheet, model, dayIndex);
    if (updated) updatedDates.push(updated.date);
  }

  var summaryResult = updateYearlyEnergySummaryDayBlocks(year, updatedDates);

  return {
    success: true,
    motor: motor,
    year: year,
    sheetName: sheet.getName(),
    fullRender: false,
    updatedDates: updatedDates,
    summary: summaryResult
  };
}

function shouldRenderFullYearlyEnergySheet(sheet, model, totalRows, totalCols) {
  if (sheet.getLastRow() < 2) return true;
  if (sheet.getLastColumn() < totalCols) return true;
  if (sheet.getMaxRows() < totalRows || sheet.getMaxColumns() < totalCols) return true;
  if (String(sheet.getRange(1, 1).getDisplayValue()).trim() !== String(model.motor || '').trim()) return true;
  if (String(sheet.getRange(2, 1).getDisplayValue()).trim() !== 'Saat') return true;
  return false;
}

function renderYearlyEnergyBaseColumn(sheet, model) {
  var totalRow = getYearlyEnergyTotalRow(model);
  var slotValues = [];
  for (var i = 0; i < model.slots.length; i++) {
    slotValues.push([model.slots[i]]);
  }

  sheet.getRange(1, 1).setValue(model.motor);
  sheet.getRange(2, 1).setValue('Saat');
  sheet.getRange(3, 1, model.slots.length, 1).setValues(slotValues);
  sheet.getRange(totalRow, 1).setValue('TOPLAM');
  sheet.getRange(1, 1).setBackground('#ffe699').setFontWeight('bold');
  sheet.getRange(2, 1).setBackground('#f3f3f3').setFontWeight('bold');
  sheet.getRange(totalRow, 1).setBackground('#ffe699').setFontWeight('bold');
  sheet.getRange(1, 1, getYearlyEnergySheetRowCount(model), 1)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 70);
}

function renderYearlyEnergyDayBlock(sheet, model, dayIndex) {
  var day = model.days[dayIndex];
  if (!day) return null;

  var startCol = 2 + (dayIndex * 3);
  var totalRows = getYearlyEnergySheetRowCount(model);
  var totalRow = getYearlyEnergyTotalRow(model);
  var titleRange = sheet.getRange(1, startCol, 1, 3);
  titleRange.breakApart();
  titleRange.merge();
  titleRange.setValue(day.headerText);
  titleRange.setFontWeight('bold');
  titleRange.setHorizontalAlignment('center');
  titleRange.setBackground('#c4d79b');

  var headerRange = sheet.getRange(2, startCol, 1, 3);
  headerRange.setValues([['Calisma Saati', 'Toplam Aktif Enerji (MWh)', 'Saatlik Uretim (MW)']]);
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');
  headerRange.setWrap(true);
  headerRange.setBackground('#f3f3f3');

  var values = [];
  var backgrounds = [];
  for (var i = 0; i < day.rows.length; i++) {
    var item = day.rows[i];
    values.push([
      item.calismaSaati === null ? '' : item.calismaSaati,
      item.toplamAktifEnerji === null ? '' : item.toplamAktifEnerji,
      item.saatlikUretim
    ]);

    var rowBackgrounds = ['#ffffff', '#ffffff', getYearlyEnergyProductionCellBackground(item.saatlikUretim, '#ffffff')];
    backgrounds.push(rowBackgrounds);
  }

  var dataRange = sheet.getRange(3, startCol, model.slots.length, 3);
  dataRange.setValues(values);
  dataRange.setBackgrounds(backgrounds);
  dataRange.setHorizontalAlignment('center');
  dataRange.setVerticalAlignment('middle');

  sheet.getRange(1, startCol, totalRows, 3)
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(totalRow, startCol, 1, 3)
    .setBackground('#ffe699')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.getRange(totalRow, startCol, 1, 3)
    .setValues([[
      getYearlyEnergyCounterDiffFromRows(day.rows, 'calismaSaati'),
      getYearlyEnergyCounterDiffFromRows(day.rows, 'toplamAktifEnerji'),
      getYearlyEnergyProductionTotalFromRows(day.rows)
    ]])
    .setNumberFormat('0.###');
  sheet.setColumnWidth(startCol, 90);
  sheet.setColumnWidth(startCol + 1, 115);
  sheet.setColumnWidth(startCol + 2, 95);
  sheet.getRange(3, startCol, model.slots.length, 1).setNumberFormat('0.##');
  sheet.getRange(3, startCol + 1, model.slots.length, 1).setNumberFormat('0.##');
  sheet.getRange(3, startCol + 2, model.slots.length, 1).setNumberFormat('0.###');

  return { date: day.dateKey, startColumn: startCol };
}

function getYearlyEnergyProductionCellBackground(value, defaultColor) {
  var production = parseEnerjiNumber(value);
  if (production === 0) return '#d9d9d9';
  if (production < 2.5) return '#fff2cc';
  if (production > 3) return '#f4cccc';
  return defaultColor || '#ffffff';
}

function updateYearlyEnergySummarySheet(year) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var model = buildYearlyEnergySummaryModelFromYearlySheets(targetYear);
    var sheet = getOrCreateYearlyEnergySummarySheet(targetYear);
    renderYearlyEnergySummarySheet(sheet, model, { skipBackup: true });

    return {
      success: true,
      year: targetYear,
      sheetName: sheet.getName(),
      dayCount: model.days.length,
      message: 'Yillik enerji toplam sayfasi guncellendi.'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateYearlyEnergySummaryFromExistingSheets(year) {
  return updateYearlyEnergySummarySheet(year);
}

function applyYearlyEnergyTotalRows(year, motor) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var results = [];

    for (var i = 0; i < motors.length; i++) {
      results.push(applyYearlyEnergyTotalRow(targetYear, motors[i]));
    }

    return {
      success: true,
      year: targetYear,
      results: results,
      message: 'Yillik enerji toplam satirlari guncellendi.'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function applyYearlyEnergyTotalRow(year, motor) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'YillikEnerji-' + normalizeEnerjiMotorLabel(motor) + '-' + String(year || '').trim();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    return {
      success: false,
      motor: motor,
      sheetName: sheetName,
      error: 'Yillik enerji sayfasi bulunamadi'
    };
  }

  var model = {
    slots: getYearlyEnergyHourSlots(),
    days: new Array(Math.round((new Date(year + 1, 0, 1) - new Date(year, 0, 1)) / 86400000))
  };
  var totalRow = getYearlyEnergyTotalRow(model);
  var totalCols = 1 + (model.days.length * 3);

  ensureSheetGridSize(sheet, totalRow, totalCols);
  sheet.getRange(totalRow, 1).setValue('TOPLAM');
  sheet.getRange(totalRow, 1, 1, totalCols)
    .setBackground('#ffe699')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

  for (var dayIndex = 0; dayIndex < model.days.length; dayIndex++) {
    var hoursColumn = 2 + (dayIndex * 3);
    var energyColumn = hoursColumn + 1;
    var productionColumn = hoursColumn + 2;
    var values = sheet.getRange(3, hoursColumn, model.slots.length, 3).getDisplayValues();
    sheet.getRange(totalRow, hoursColumn, 1, 3)
      .setValues([[
        getYearlyEnergyCounterDiffFromDisplayValues(values, 0),
        getYearlyEnergyCounterDiffFromDisplayValues(values, 1),
        getYearlyEnergyProductionTotalFromDisplayValues(values, 2)
      ]])
      .setNumberFormat('0.###');
  }

  return {
    success: true,
    motor: motor,
    sheetName: sheetName,
    totalRow: totalRow,
    firstTotalCell: 'D' + totalRow,
    lastTotalCell: sheet.getRange(totalRow, 4 + ((model.days.length - 1) * 3)).getA1Notation()
  };
}

function createYearlyEnergyHistoricalInputTemplate(year, motor, startDate, endDate) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var start = parseEnerjiDateOnly(startDate || ('01.01.' + targetYear));
    var end = parseEnerjiDateOnly(endDate || ('31.05.' + targetYear));
    if (!start || !end || start.getTime() > end.getTime()) {
      return { success: false, error: 'Baslangic veya bitis tarihi hatali.' };
    }

    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var results = [];
    var createdCount = 0;
    var skippedCount = 0;

    for (var i = 0; i < motors.length; i++) {
      var result = createYearlyEnergyHistoricalInputTemplateForMotor(targetYear, motors[i], start, end);
      results.push(result);
      if (result.success && !result.skipped) createdCount++;
      if (result.skipped) skippedCount++;
    }

    var response = {
      success: true,
      year: targetYear,
      startDate: formatEnerjiDateTR(start),
      endDate: formatEnerjiDateTR(end),
      createdCount: createdCount,
      skippedCount: skippedCount,
      results: results,
      message: createdCount + ' adet gecmis enerji giris sablonu hazirlandi.'
    };
    Logger.log(JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    var errorResult = { success: false, error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function createYearlyEnergyHistoricalInputTemplateForMotor(year, motor, startDate, endDate) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var targetMotor = normalizeEnerjiMotorLabel(motor);
  var sheetName = getYearlyEnergyHistoricalInputSheetName(targetMotor, year);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  } else if (sheetHasHistoricalInputUserData(sheet)) {
    return {
      success: true,
      skipped: true,
      motor: targetMotor,
      sheetName: sheetName,
      message: 'Sablon sayfasinda girilmis veri oldugu icin uzerine yazilmadi.'
    };
  }

  var slots = getYearlyEnergyHourSlots();
  var headers = [['Tarih', 'Saat', 'Motor', 'Calisma Saati', 'Toplam Aktif Enerji (MWh)', 'Saatlik Uretim (MWh)', 'Not']];
  var rows = [];
  var currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  while (currentDate.getTime() <= endDate.getTime()) {
    var dateText = formatEnerjiDateTR(currentDate);
    for (var i = 0; i < slots.length; i++) {
      rows.push([dateText, slots[i], targetMotor, '', '', '', '']);
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  ensureSheetGridSize(sheet, rows.length + 1, headers[0].length);
  sheet.clear();
  sheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers[0].length).setValues(rows);
  }

  formatYearlyEnergyHistoricalInputTemplateSheet(sheet, rows.length + 1);

  return {
    success: true,
    skipped: false,
    motor: targetMotor,
    sheetName: sheetName,
    rowCount: rows.length,
    startDate: formatEnerjiDateTR(startDate),
    endDate: formatEnerjiDateTR(endDate),
    slotsPerDay: slots.length
  };
}

function formatYearlyEnergyHistoricalInputTemplateSheet(sheet, rowCount) {
  var lastRow = Math.max(rowCount, 1);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 105);
  sheet.setColumnWidth(2, 70);
  sheet.setColumnWidth(3, 70);
  sheet.setColumnWidth(4, 105);
  sheet.setColumnWidth(5, 145);
  sheet.setColumnWidth(6, 130);
  sheet.setColumnWidth(7, 180);
  sheet.getRange(1, 1, 1, 7)
    .setBackground('#c4d79b')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 3).setNumberFormat('@');
    sheet.getRange(2, 4, lastRow - 1, 3).setNumberFormat('0.###');
    sheet.getRange(2, 1, lastRow - 1, 7)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true, '#d9d9d9', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(2, 4, lastRow - 1, 3).setBackground('#fff2cc');
  }
}

function sheetHasHistoricalInputUserData(sheet) {
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 5) {
    return false;
  }

  var columnCount = Math.min(Math.max(sheet.getLastColumn() - 3, 2), 3);
  var values = sheet.getRange(2, 4, sheet.getLastRow() - 1, columnCount).getDisplayValues();
  for (var row = 0; row < values.length; row++) {
    for (var col = 0; col < values[row].length; col++) {
      if (String(values[row][col] || '').trim() !== '') {
        return true;
      }
    }
  }
  return false;
}

function getYearlyEnergyHistoricalInputSheetName(motor, year) {
  return 'YillikEnerjiGecmis-' + normalizeEnerjiMotorLabel(motor) + '-' + String(year || '').trim();
}

function buildYearlyEnergyHistoricalInputMap(motor, year) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(getYearlyEnergyHistoricalInputSheetName(motor, year));
  var recordMap = {};
  if (!sheet || sheet.getLastRow() < 2) {
    return recordMap;
  }

  addYearlyEnergyHistoricalListRowsToMap(recordMap, sheet, year);
  addYearlyEnergyHistoricalBlockRowsToMap(recordMap, sheet, motor, year);
  return recordMap;
}

function addYearlyEnergyHistoricalListRowsToMap(recordMap, sheet, year) {
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 5) {
    return;
  }

  var columnCount = Math.min(sheet.getLastColumn(), 6);
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, columnCount).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    var date = parseEnerjiDateOnly(values[i][0]);
    if (!date || date.getFullYear() !== year) continue;

    var saat = normalizeEnerjiSaat(values[i][1]);
    var rawHours = String(values[i][3] || '').trim();
    var rawTotalEnergy = String(values[i][4] || '').trim();
    var rawHourlyProduction = String(values[i][5] || '').trim();
    var record = buildYearlyEnergyHistoricalInputRecord(rawHours, rawTotalEnergy, rawHourlyProduction);
    if (!record) continue;

    var key = formatEnerjiDateTR(date) + '|' + saat;
    recordMap[key] = record;
  }
}

function addYearlyEnergyHistoricalBlockRowsToMap(recordMap, sheet, motor, year) {
  var values = sheet.getDataRange().getDisplayValues();
  if (!values || values.length < 3) return;

  var header = findYearlyEnergyHistoricalBlockHeader(values);
  if (!header) return;

  var slotColumn = header.slotColumn;
  var dateRowIndex = Math.max(0, header.headerRow - 1);
  var firstDataColumn = slotColumn + 1;

  for (var startCol = firstDataColumn; startCol + 2 < values[header.headerRow].length; startCol += 3) {
    var blockDate = parseYearlyEnergyHistoricalBlockDate(values[dateRowIndex], startCol);
    if (!blockDate || blockDate.getFullYear() !== year) continue;

    for (var rowIndex = header.headerRow + 1; rowIndex < values.length; rowIndex++) {
      var rawSaat = String(values[rowIndex][slotColumn] || '').trim();
      if (!rawSaat || /^TOPLAM$/i.test(rawSaat)) break;

      var saat = normalizeEnerjiSaat(rawSaat);
      var rawHours = String(values[rowIndex][startCol] || '').trim();
      var rawTotalEnergy = String(values[rowIndex][startCol + 1] || '').trim();
      var rawHourlyProduction = String(values[rowIndex][startCol + 2] || '').trim();
      var record = buildYearlyEnergyHistoricalInputRecord(rawHours, rawTotalEnergy, rawHourlyProduction);
      if (!record) continue;

      recordMap[formatEnerjiDateTR(blockDate) + '|' + saat] = record;
    }
  }
}

function findYearlyEnergyHistoricalBlockHeader(values) {
  var maxRowsToScan = Math.min(values.length, 10);
  for (var row = 0; row < maxRowsToScan; row++) {
    for (var col = 0; col < values[row].length; col++) {
      if (String(values[row][col] || '').trim().toUpperCase() === 'SAAT') {
        return { headerRow: row, slotColumn: col };
      }
    }
  }
  return null;
}

function parseYearlyEnergyHistoricalBlockDate(rowValues, startCol) {
  for (var offset = 0; offset < 3; offset++) {
    var date = parseEnerjiDateOnly(rowValues[startCol + offset]);
    if (date) return date;
  }
  return null;
}

function buildYearlyEnergyHistoricalInputRecord(rawHours, rawTotalEnergy, rawHourlyProduction) {
  var hoursText = String(rawHours || '').trim();
  var totalText = String(rawTotalEnergy || '').trim();
  var productionText = String(rawHourlyProduction || '').trim();

  if (!totalText && productionText && Math.abs(parseEnerjiNumber(productionText)) > 100) {
    totalText = productionText;
    productionText = '';
  }

  if (!hoursText && !totalText && !productionText) {
    return null;
  }

  return {
    calismaSaati: hoursText ? parseEnerjiNumber(hoursText) : null,
    toplamAktifEnerji: totalText ? parseEnerjiNumber(totalText) : null,
    saatlikUretim: productionText ? parseEnerjiNumber(productionText) : ''
  };
}

function importYearlyEnergyDigitalSheets(year, motor, options) {
  try {
    var opts = options || {};
    var dryRun = opts.dryRun === true;
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var results = [];
    var sourceRecordCount = 0;
    var importedCount = 0;
    var skippedExistingCount = 0;
    var duplicateImportCount = 0;
    var missingImportSheetCount = 0;

    for (var i = 0; i < motors.length; i++) {
      var result = importYearlyEnergyDigitalSheet(targetYear, motors[i], dryRun);
      results.push(result);
      sourceRecordCount += result.sourceRecordCount || 0;
      importedCount += result.importedCount || 0;
      skippedExistingCount += result.skippedExistingCount || 0;
      duplicateImportCount += result.duplicateImportCount || 0;
      if (result.missingImportSheet) missingImportSheetCount++;
    }

    var response = {
      success: true,
      dryRun: dryRun,
      year: targetYear,
      sourceRecordCount: sourceRecordCount,
      importedCount: importedCount,
      skippedExistingCount: skippedExistingCount,
      duplicateImportCount: duplicateImportCount,
      missingImportSheetCount: missingImportSheetCount,
      results: results,
      nextStep: dryRun
        ? 'Sonuc uygunsa yillikDijitalAktarim fonksiyonunu calistirin.'
        : 'Aktarim bittikten sonra updateYearlyEnergy2026Sheets fonksiyonunu calistirin.',
      message: dryRun
        ? importedCount + ' kayit aktarima hazir gorunuyor.'
        : importedCount + ' kayit Enerji GM kaynak sayfalarina aktarildi.'
    };
    Logger.log(JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    var errorResult = { success: false, error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function importYearlyEnergyDigitalSheet(year, motor, dryRun) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var targetMotor = normalizeEnerjiMotorLabel(motor);
  var importSheetName = getYearlyEnergyDigitalImportSheetName(targetMotor, year);
  var importSheet = spreadsheet.getSheetByName(importSheetName);
  if (!importSheet) {
    return {
      success: false,
      missingImportSheet: true,
      motor: targetMotor,
      year: year,
      importSheetName: importSheetName,
      error: 'Yillik dijital aktarim sayfasi bulunamadi'
    };
  }

  var enerjiSheet = getEnerjiSheetIfExists(targetMotor);
  if (!enerjiSheet) {
    return {
      success: false,
      motor: targetMotor,
      year: year,
      importSheetName: importSheetName,
      error: targetMotor + ' icin Enerji GM kaynak sayfasi bulunamadi'
    };
  }

  var sourceRecords = readYearlyEnergyDigitalImportRecords(importSheet, targetMotor, year);
  var existingKeys = buildEnerjiExistingRecordKeyMap(enerjiSheet, targetMotor);
  var importKeys = {};
  var rowsToAppend = [];
  var skippedExistingCount = 0;
  var duplicateImportCount = 0;

  for (var i = 0; i < sourceRecords.length; i++) {
    var record = sourceRecords[i];
    var key = getYearlyEnergyRecordKey(record.motor, record.tarih, record.saat);
    if (!key) continue;

    if (importKeys[key]) {
      duplicateImportCount++;
      continue;
    }
    importKeys[key] = true;

    if (existingKeys[key]) {
      skippedExistingCount++;
      continue;
    }

    rowsToAppend.push(createEnerjiImportRowFromYearlyRecord(record));
    existingKeys[key] = true;
  }

  var appendStartRow = null;
  if (!dryRun && rowsToAppend.length) {
    appendStartRow = Math.max(2, enerjiSheet.getLastRow() + 1);
    ensureSheetGridSize(enerjiSheet, appendStartRow + rowsToAppend.length - 1, 18);
    enerjiSheet.getRange(appendStartRow, 1, rowsToAppend.length, 18).setValues(rowsToAppend);
  }

  return {
    success: true,
    dryRun: dryRun,
    motor: targetMotor,
    year: year,
    importSheetName: importSheetName,
    targetSheetName: enerjiSheet.getName(),
    sourceRecordCount: sourceRecords.length,
    importedCount: rowsToAppend.length,
    skippedExistingCount: skippedExistingCount,
    duplicateImportCount: duplicateImportCount,
    firstImportedRow: appendStartRow,
    lastImportedRow: appendStartRow ? appendStartRow + rowsToAppend.length - 1 : null
  };
}

function getYearlyEnergyDigitalImportSheetName(motor, year) {
  return 'YillikEnerjiAktarim-' + normalizeEnerjiMotorLabel(motor) + '-' + String(year || '').trim();
}

function readYearlyEnergyDigitalImportRecords(sheet, motor, year) {
  var records = [];
  var slots = getYearlyEnergyHourSlots();
  var dayCount = Math.round((new Date(year + 1, 0, 1) - new Date(year, 0, 1)) / 86400000);
  var lastColumn = sheet.getLastColumn();
  var targetMotor = normalizeEnerjiMotorLabel(motor);

  if (sheet.getLastRow() < 3 || lastColumn < 3) {
    return records;
  }

  for (var dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    var startCol = 2 + (dayIndex * 3);
    if (startCol + 2 > lastColumn) break;

    var headerDate = parseEnerjiDateOnly(sheet.getRange(1, startCol).getDisplayValue());
    var currentDate = headerDate || new Date(year, 0, dayIndex + 1);
    var values = sheet.getRange(3, startCol, slots.length, 3).getDisplayValues();

    for (var slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      var rawHours = String(values[slotIndex][0] || '').trim();
      var rawEnergy = String(values[slotIndex][1] || '').trim();
      var rawProduction = String(values[slotIndex][2] || '').trim();
      if (!rawEnergy && rawProduction && Math.abs(parseEnerjiNumber(rawProduction)) > 100) {
        rawEnergy = rawProduction;
      }
      if (!rawHours && !rawEnergy) continue;

      var slot = slots[slotIndex];
      var recordDate = getYearlyEnergyDigitalImportRecordDate(currentDate, slotIndex, slots.length);
      records.push({
        motor: targetMotor,
        tarih: formatEnerjiDateTR(recordDate),
        saat: slot,
        calismaSaati: rawHours ? parseEnerjiNumber(rawHours) : '',
        toplamAktifEnerji: rawEnergy ? parseEnerjiNumber(rawEnergy) : ''
      });
    }
  }

  return records;
}

function getYearlyEnergyDigitalImportRecordDate(dayDate, slotIndex, slotCount) {
  var recordDate = new Date(dayDate.getTime());
  if (slotIndex === 0) {
    recordDate.setDate(recordDate.getDate() - 1);
  } else if (slotIndex === slotCount - 1) {
    recordDate.setDate(recordDate.getDate() + 1);
  }
  return recordDate;
}

function buildEnerjiExistingRecordKeyMap(sheet, fallbackMotor) {
  var keys = {};
  if (!sheet || sheet.getLastRow() < 2) {
    return keys;
  }

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getDisplayValues();
  var targetMotor = normalizeEnerjiMotorLabel(fallbackMotor);
  for (var i = 0; i < values.length; i++) {
    var tarih = normalizeDateTR(values[i][0] || '');
    var saat = normalizeEnerjiSaat(values[i][2] || '');
    var motor = values[i][3] ? normalizeEnerjiMotorLabel(values[i][3]) : targetMotor;
    var key = getYearlyEnergyRecordKey(motor, tarih, saat);
    if (key) keys[key] = true;
  }

  return keys;
}

function getYearlyEnergyRecordKey(motor, tarih, saat) {
  var date = parseEnerjiDateOnly(tarih);
  if (!date) return '';
  return normalizeEnerjiMotorLabel(motor) + '|' + formatEnerjiDateTR(date) + '|' + normalizeEnerjiSaat(saat);
}

function createEnerjiImportRowFromYearlyRecord(record) {
  var row = [];
  for (var i = 0; i < 18; i++) {
    row.push('');
  }

  row[0] = record.tarih;
  row[1] = getYearlyEnergyImportVardiya(record.saat);
  row[2] = record.saat;
  row[3] = normalizeEnerjiMotorLabel(record.motor);
  row[12] = record.toplamAktifEnerji;
  row[13] = record.calismaSaati;
  row[16] = 'Yillik dijital aktarim';
  row[17] = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');
  return row;
}

function getYearlyEnergyImportVardiya(saat) {
  var parts = normalizeEnerjiSaat(saat).split(':');
  var hour = parseInt(parts[0] || '0', 10);
  if (hour >= 8 && hour < 16) return '08-16';
  if (hour >= 16 && hour < 24) return '16-24';
  return '24-08';
}

function buildYearlyEnergySummaryModelFromYearlySheets(year) {
  var targetYear = parseInt(year, 10) || new Date().getFullYear();
  var motors = ['GM-1', 'GM-2', 'GM-3'];
  var dayCount = Math.round((new Date(targetYear + 1, 0, 1) - new Date(targetYear, 0, 1)) / 86400000);
  var motorMetrics = {};
  var days = [];

  for (var i = 0; i < motors.length; i++) {
    motorMetrics[motors[i]] = readYearlyEnergyMotorDailyMetricsFromSheet(motors[i], targetYear, dayCount);
  }

  for (var dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    var currentDate = new Date(targetYear, 0, dayIndex + 1);
    var gm1 = motorMetrics['GM-1'][dayIndex] || createEmptyYearlyEnergyDailyMetric();
    var gm2 = motorMetrics['GM-2'][dayIndex] || createEmptyYearlyEnergyDailyMetric();
    var gm3 = motorMetrics['GM-3'][dayIndex] || createEmptyYearlyEnergyDailyMetric();
    var totalProductionMwh = gm1.productionMwh + gm2.productionMwh + gm3.productionMwh;
    var totalHours = gm1.hours + gm2.hours + gm3.hours;

    days.push({
      dateKey: formatEnerjiDateTR(currentDate),
      headerText: formatEnerjiHeaderDate(currentDate),
      gm1: gm1,
      gm2: gm2,
      gm3: gm3,
      total: {
        productionMwh: totalProductionMwh,
        hours: totalHours,
        averageMw: totalHours > 0 ? totalProductionMwh / totalHours : 0
      }
    });
  }

  return {
    year: targetYear,
    days: days
  };
}

function getYearlyEnergyReportData(year) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var model = buildYearlyEnergySummaryModelFromYearlySheets(targetYear);
    var report = buildYearlyEnergyReportPayload(model);

    return {
      success: true,
      year: targetYear,
      source: 'YillikEnerji motor sayfalari',
      generatedAt: new Date().toISOString(),
      days: report.days,
      weeks: report.weeks,
      months: report.months,
      yearTotal: report.yearTotal
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function buildYearlyEnergyReportPayload(model) {
  var days = [];
  var weeksByKey = {};
  var weeks = [];
  var months = buildYearlyEnergyMonthBuckets(model.year);
  var yearTotal = createYearlyEnergyReportAggregate('Yil Toplami', String(model.year), null, null);

  for (var i = 0; i < model.days.length; i++) {
    var day = model.days[i];
    var date = parseEnerjiDateOnly(day.dateKey);
    if (!date) continue;

    var dayItem = {
      date: day.dateKey,
      dateIso: formatYearlyEnergyIsoDate(date),
      label: day.headerText,
      weekday: getYearlyEnergyWeekdayLabel(date),
      gm1: normalizeYearlyEnergyReportMetric(day.gm1),
      gm2: normalizeYearlyEnergyReportMetric(day.gm2),
      gm3: normalizeYearlyEnergyReportMetric(day.gm3),
      total: normalizeYearlyEnergyReportMetric(day.total)
    };
    days.push(dayItem);

    addYearlyEnergyDayToReportAggregate(months[date.getMonth()], dayItem);
    addYearlyEnergyDayToReportAggregate(yearTotal, dayItem);

    var weekKey = getYearlyEnergyWeekKey(date);
    if (!weeksByKey[weekKey]) {
      weeksByKey[weekKey] = createYearlyEnergyWeekBucket(date, weeks.length + 1);
      weeks.push(weeksByKey[weekKey]);
    }
    addYearlyEnergyDayToReportAggregate(weeksByKey[weekKey], dayItem);
  }

  for (var w = 0; w < weeks.length; w++) {
    finalizeYearlyEnergyReportAggregate(weeks[w]);
  }
  for (var m = 0; m < months.length; m++) {
    finalizeYearlyEnergyReportAggregate(months[m]);
  }
  finalizeYearlyEnergyReportAggregate(yearTotal);

  return {
    days: days,
    weeks: weeks,
    months: months,
    yearTotal: yearTotal
  };
}

function buildYearlyEnergyMonthBuckets(year) {
  var labels = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
  var months = [];
  for (var i = 0; i < 12; i++) {
    var start = new Date(year, i, 1);
    var end = new Date(year, i + 1, 0);
    months.push(createYearlyEnergyReportAggregate(
      labels[i],
      year + '-' + pad2(i + 1),
      formatYearlyEnergyIsoDate(start),
      formatYearlyEnergyIsoDate(end)
    ));
  }
  return months;
}

function createYearlyEnergyWeekBucket(date, index) {
  var start = getYearlyEnergyWeekStart(date);
  var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return createYearlyEnergyReportAggregate(
    'Hafta ' + index,
    getYearlyEnergyWeekKey(date),
    formatYearlyEnergyIsoDate(start),
    formatYearlyEnergyIsoDate(end)
  );
}

function createYearlyEnergyReportAggregate(label, key, startDateIso, endDateIso) {
  return {
    key: key,
    label: label,
    startDate: startDateIso,
    endDate: endDateIso,
    dayCount: 0,
    activeDayCount: 0,
    gm1: createYearlyEnergyReportMetric(),
    gm2: createYearlyEnergyReportMetric(),
    gm3: createYearlyEnergyReportMetric(),
    total: createYearlyEnergyReportMetric()
  };
}

function createYearlyEnergyReportMetric() {
  return {
    productionMwh: 0,
    hours: 0,
    averageMw: 0
  };
}

function normalizeYearlyEnergyReportMetric(metric) {
  return {
    productionMwh: metric ? parseEnerjiNumber(metric.productionMwh) : 0,
    hours: metric ? parseEnerjiNumber(metric.hours) : 0,
    averageMw: metric ? parseEnerjiNumber(metric.averageMw) : 0
  };
}

function addYearlyEnergyDayToReportAggregate(aggregate, day) {
  aggregate.dayCount++;
  addYearlyEnergyMetricToReportMetric(aggregate.gm1, day.gm1);
  addYearlyEnergyMetricToReportMetric(aggregate.gm2, day.gm2);
  addYearlyEnergyMetricToReportMetric(aggregate.gm3, day.gm3);
  addYearlyEnergyMetricToReportMetric(aggregate.total, day.total);
  if (day.total.productionMwh > 0 || day.total.hours > 0) {
    aggregate.activeDayCount++;
  }
}

function addYearlyEnergyMetricToReportMetric(target, source) {
  target.productionMwh += parseEnerjiNumber(source.productionMwh);
  target.hours += parseEnerjiNumber(source.hours);
}

function finalizeYearlyEnergyReportAggregate(aggregate) {
  finalizeYearlyEnergyReportMetric(aggregate.gm1);
  finalizeYearlyEnergyReportMetric(aggregate.gm2);
  finalizeYearlyEnergyReportMetric(aggregate.gm3);
  finalizeYearlyEnergyReportMetric(aggregate.total);
}

function finalizeYearlyEnergyReportMetric(metric) {
  metric.productionMwh = roundYearlyEnergyReportNumber(metric.productionMwh, 3);
  metric.hours = roundYearlyEnergyReportNumber(metric.hours, 3);
  metric.averageMw = metric.hours > 0
    ? roundYearlyEnergyReportNumber(metric.productionMwh / metric.hours, 3)
    : 0;
}

function roundYearlyEnergyReportNumber(value, digits) {
  var factor = Math.pow(10, digits || 3);
  return Math.round(parseEnerjiNumber(value) * factor) / factor;
}

function getYearlyEnergyWeekStart(date) {
  var day = date.getDay();
  var offset = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function getYearlyEnergyWeekKey(date) {
  return formatYearlyEnergyIsoDate(getYearlyEnergyWeekStart(date));
}

function getYearlyEnergyWeekdayLabel(date) {
  var labels = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
  return labels[date.getDay()];
}

function formatYearlyEnergyIsoDate(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function readYearlyEnergyMotorDailyMetricsFromSheet(motor, year, dayCount) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'YillikEnerji-' + normalizeEnerjiMotorLabel(motor) + '-' + String(year || '').trim();
  var sheet = spreadsheet.getSheetByName(sheetName);
  var metrics = [];
  var slotCount = getYearlyEnergyHourSlots().length;

  for (var emptyIndex = 0; emptyIndex < dayCount; emptyIndex++) {
    metrics.push(createEmptyYearlyEnergyDailyMetric());
  }

  if (!sheet || sheet.getLastRow() < 3) {
    return metrics;
  }

  var rowCount = Math.min(slotCount, sheet.getLastRow() - 2);
  var lastColumn = sheet.getLastColumn();
  var dataColumnCount = Math.min(lastColumn - 1, dayCount * 3);
  if (rowCount <= 0 || dataColumnCount <= 0) {
    return metrics;
  }

  var allValues = sheet.getRange(3, 2, rowCount, dataColumnCount).getDisplayValues();

  for (var dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    var dayOffset = dayIndex * 3;
    if (dayOffset + 2 >= dataColumnCount) {
      break;
    }

    var firstHours = null;
    var lastHours = null;
    var previousHours = null;
    var productionMwh = 0;

    for (var rowIndex = 0; rowIndex < allValues.length; rowIndex++) {
      var hours = allValues[rowIndex][dayOffset] === '' ? null : parseEnerjiNumber(allValues[rowIndex][dayOffset]);
      var totalEnergy = allValues[rowIndex][dayOffset + 1] === '' ? null : parseEnerjiNumber(allValues[rowIndex][dayOffset + 1]);
      var hourlyProduction = parseEnerjiNumber(allValues[rowIndex][dayOffset + 2]);
      var hasValidCounter = (hours !== null && hours > 0) || (totalEnergy !== null && totalEnergy > 0);

      productionMwh += Math.max(0, hourlyProduction);

      if (!hasValidCounter) continue;
      if (previousHours !== null && hours !== null && hours < previousHours) continue;

      if (firstHours === null && hours !== null) firstHours = hours;
      if (hours !== null) {
        lastHours = hours;
        previousHours = hours;
      }
    }

    var hoursDiff = firstHours === null || lastHours === null ? 0 : Math.max(0, lastHours - firstHours);
    metrics[dayIndex] = {
      productionMwh: productionMwh,
      hours: hoursDiff,
      averageMw: hoursDiff > 0 ? productionMwh / hoursDiff : 0
    };
  }

  return metrics;
}

function createEmptyYearlyEnergyDailyMetric() {
  return {
    productionMwh: 0,
    hours: 0,
    averageMw: 0
  };
}

function updateYearlyEnergySummaryDayBlocks(year, dates) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var model = buildYearlyEnergySummaryModel(targetYear);
    var sheet = getOrCreateYearlyEnergySummarySheet(targetYear);

    if (!dates || !dates.length || shouldRenderFullYearlyEnergySummarySheet(sheet, model)) {
      renderYearlyEnergySummarySheet(sheet, model);
      return {
        success: true,
        year: targetYear,
        sheetName: sheet.getName(),
        fullRender: true,
        updatedDates: dates || []
      };
    }

    var updatedDates = [];
    ensureSheetGridSize(sheet, getYearlyEnergySummaryRowCount(), getYearlyEnergySummaryColumnCount(model));
    renderYearlyEnergySummaryLabels(sheet);

    for (var i = 0; i < dates.length; i++) {
      var date = parseEnerjiDateOnly(dates[i]);
      if (!date || date.getFullYear() !== targetYear) continue;

      var dayIndex = getYearlyEnergyDayIndex(date);
      if (dayIndex < 0 || dayIndex >= model.days.length) continue;

      renderYearlyEnergySummaryBlock(sheet, model.days[dayIndex], dayIndex);
      updatedDates.push(model.days[dayIndex].dateKey);
    }

    formatYearlyEnergySummarySheet(sheet, model.days.length);

    return {
      success: true,
      year: targetYear,
      sheetName: sheet.getName(),
      fullRender: false,
      updatedDates: updatedDates
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getOrCreateYearlyEnergySummarySheet(year) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'YillikEnerjiToplam-' + String(year || '').trim();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function buildYearlyEnergySummaryModel(year) {
  var targetYear = parseInt(year, 10) || new Date().getFullYear();
  var motors = ['GM-1', 'GM-2', 'GM-3'];
  var motorModels = {};
  var days = [];

  for (var i = 0; i < motors.length; i++) {
    motorModels[motors[i]] = buildYearlyEnergySheetModel(motors[i], targetYear);
  }

  var dayCount = Math.round((new Date(targetYear + 1, 0, 1) - new Date(targetYear, 0, 1)) / 86400000);
  for (var dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    var currentDate = new Date(targetYear, 0, dayIndex + 1);
    var gm1 = buildYearlyEnergyDailyMetric(motorModels['GM-1'].days[dayIndex].rows);
    var gm2 = buildYearlyEnergyDailyMetric(motorModels['GM-2'].days[dayIndex].rows);
    var gm3 = buildYearlyEnergyDailyMetric(motorModels['GM-3'].days[dayIndex].rows);
    var totalProductionMwh = gm1.productionMwh + gm2.productionMwh + gm3.productionMwh;
    var totalHours = gm1.hours + gm2.hours + gm3.hours;

    days.push({
      dateKey: formatEnerjiDateTR(currentDate),
      headerText: formatEnerjiHeaderDate(currentDate),
      gm1: gm1,
      gm2: gm2,
      gm3: gm3,
      total: {
        productionMwh: totalProductionMwh,
        hours: totalHours,
        averageMw: totalHours > 0 ? totalProductionMwh / totalHours : 0
      }
    });
  }

  return {
    year: targetYear,
    days: days
  };
}

function buildYearlyEnergyDailyMetric(rows) {
  var firstHours = null;
  var lastHours = null;
  var previousHours = null;
  var productionMwh = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var hours = row.calismaSaati === null ? null : parseEnerjiNumber(row.calismaSaati);
    var energy = row.toplamAktifEnerji === null ? null : parseEnerjiNumber(row.toplamAktifEnerji);
    var hasValidCounter = (hours !== null && hours > 0) || (energy !== null && energy > 0);

    if (!hasValidCounter) continue;
    if (previousHours !== null && hours !== null && hours < previousHours) continue;

    if (firstHours === null && hours !== null) firstHours = hours;
    if (hours !== null) {
      lastHours = hours;
      previousHours = hours;
    }

    productionMwh += Math.max(0, parseEnerjiNumber(row.saatlikUretim));
  }

  var hoursDiff = firstHours === null || lastHours === null ? 0 : Math.max(0, lastHours - firstHours);

  return {
    productionMwh: productionMwh,
    hours: hoursDiff,
    averageMw: hoursDiff > 0 ? productionMwh / hoursDiff : 0
  };
}

function renderYearlyEnergySummarySheet(sheet, model, options) {
  var opts = options || {};
  var totalRows = getYearlyEnergySummaryRowCount();
  var totalCols = getYearlyEnergySummaryColumnCount(model);
  if (opts.skipBackup !== true) {
    backupSheetBeforeFullRender(sheet, 'Yillik enerji toplam tam guncelleme');
  }
  ensureSheetGridSize(sheet, totalRows, totalCols);
  sheet.getDataRange().breakApart();
  sheet.clear();
  renderYearlyEnergySummaryLabels(sheet);

  for (var i = 0; i < model.days.length; i++) {
    renderYearlyEnergySummaryBlock(sheet, model.days[i], i);
  }

  formatYearlyEnergySummarySheet(sheet, model.days.length);
}

function renderYearlyEnergySummaryBlock(sheet, day, dayIndex) {
  var startCol = 2 + (dayIndex * 4);
  var values = [
    [day.headerText, '', '', ''],
    ['GM1', 'GM2', 'GM3', 'TOPLAM'],
    [day.gm1.productionMwh, day.gm2.productionMwh, day.gm3.productionMwh, day.total.productionMwh],
    [day.gm1.hours, day.gm2.hours, day.gm3.hours, day.total.hours],
    [day.gm1.averageMw, day.gm2.averageMw, day.gm3.averageMw, day.total.averageMw]
  ];
  var backgrounds = [
    ['#ffffff', '#ffffff', '#ffffff', '#cfe2f3'],
    ['#f3f3f3', '#f3f3f3', '#f3f3f3', '#cfe2f3'],
    ['#ffffff', '#ffffff', '#ffffff', '#cfe2f3'],
    ['#ffffff', '#ffffff', '#ffffff', '#cfe2f3'],
    ['#ffffff', '#ffffff', '#ffffff', '#cfe2f3']
  ];

  var titleRange = sheet.getRange(1, startCol, 1, 4);
  titleRange.breakApart();
  sheet.getRange(1, startCol, 5, 4).setValues(values);
  sheet.getRange(1, startCol, 5, 4).setBackgrounds(backgrounds);
  titleRange.merge();
  titleRange.setValue(day.headerText);
  titleRange.setFontWeight('bold');
  titleRange.setHorizontalAlignment('center');
  sheet.getRange(2, startCol, 1, 4).setFontWeight('bold');
  sheet.getRange(1, startCol, 5, 4)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(3, startCol, 1, 4).setNumberFormat('0.#');
  sheet.getRange(4, startCol, 1, 4).setNumberFormat('0.#');
  sheet.getRange(5, startCol, 1, 4).setNumberFormat('0.##');
}

function shouldRenderFullYearlyEnergySummarySheet(sheet, model) {
  return sheet.getLastRow() < getYearlyEnergySummaryRowCount() ||
    sheet.getLastColumn() < getYearlyEnergySummaryColumnCount(model) ||
    String(sheet.getRange(3, 1).getDisplayValue()).trim() !== 'Uretim (MWh)';
}

function formatYearlyEnergySummarySheet(sheet, dayCount) {
  var totalCols = 1 + (dayCount * 4);
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(1);
  sheet.setColumnWidth(1, 125);
  for (var i = 0; i < dayCount; i++) {
    var startCol = 2 + (i * 4);
    sheet.setColumnWidth(startCol, 75);
    sheet.setColumnWidth(startCol + 1, 75);
    sheet.setColumnWidth(startCol + 2, 75);
    sheet.setColumnWidth(startCol + 3, 90);
  }
  sheet.getRange(1, 1, getYearlyEnergySummaryRowCount(), Math.max(totalCols, 1)).setFontSize(10);
}

function renderYearlyEnergySummaryLabels(sheet) {
  var values = [
    ['Tarih'],
    ['Motor'],
    ['Uretim (MWh)'],
    ['Calisma Saati'],
    ['Ort. Guc (MW)']
  ];
  var backgrounds = [
    ['#ffffff'],
    ['#f3f3f3'],
    ['#f3f3f3'],
    ['#f3f3f3'],
    ['#f3f3f3']
  ];
  var range = sheet.getRange(1, 1, getYearlyEnergySummaryRowCount(), 1);
  range.setValues(values);
  range.setBackgrounds(backgrounds);
  range.setFontWeight('bold');
  range.setHorizontalAlignment('center');
  range.setVerticalAlignment('middle');
  range.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
}

function getYearlyEnergySummaryRowCount() {
  return 5;
}

function getYearlyEnergySummaryColumnCount(model) {
  return 1 + ((model.days || []).length * 4);
}

function backupYearlyEnergySheets(year) {
  try {
    var targetYear = parseInt(year, 10) || new Date().getFullYear();
    var yearText = String(targetYear);
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = spreadsheet.getSheets();
    var backups = [];
    var createdCount = 0;

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var name = sheet.getName();
      if (name.indexOf('-Yedek-') !== -1) continue;

      var isMotorYearly = name.indexOf('YillikEnerji-') === 0 &&
        name.substring(name.length - yearText.length) === yearText;
      var isSummaryYearly = name === 'YillikEnerjiToplam-' + yearText;
      if (!isMotorYearly && !isSummaryYearly) continue;

      var backup = backupSheetBeforeFullRender(sheet, 'Manuel yillik enerji yedegi');
      if (backup.success && !backup.skipped) createdCount++;
      backups.push({
        sourceSheet: name,
        backupSheet: backup.sheetName || '',
        skipped: !!backup.skipped,
        success: backup.success !== false,
        error: backup.error || ''
      });
    }

    return {
      success: true,
      year: targetYear,
      matchedCount: backups.length,
      backupCount: createdCount,
      backups: backups,
      message: createdCount + ' adet yillik enerji sayfasi yedeklendi.'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function backupSheetBeforeFullRender(sheet, reason) {
  try {
    if (!sheet || !sheetHasDisplayData(sheet)) {
      return { success: true, skipped: true, message: 'Yedeklenecek veri yok' };
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var baseName = sheet.getName();
    var maxBaseLength = 100 - ('-Yedek-' + timestamp).length;
    var backupName = baseName.substring(0, maxBaseLength) + '-Yedek-' + timestamp;
    var suffix = 2;

    while (spreadsheet.getSheetByName(backupName)) {
      var suffixText = '-' + suffix;
      backupName = baseName.substring(0, maxBaseLength - suffixText.length) + '-Yedek-' + timestamp + suffixText;
      suffix++;
    }

    var backupSheet = sheet.copyTo(spreadsheet);
    backupSheet.setName(backupName);
    backupSheet.setTabColor('#f4b183');
    spreadsheet.setActiveSheet(sheet);

    return {
      success: true,
      sheetName: backupName,
      sourceSheet: baseName,
      reason: reason || ''
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function sheetHasDisplayData(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  for (var row = 0; row < values.length; row++) {
    for (var col = 0; col < values[row].length; col++) {
      if (String(values[row][col] || '').trim() !== '') {
        return true;
      }
    }
  }
  return false;
}

function getYearlyEnergyDayIndex(date) {
  var startOfYear = new Date(date.getFullYear(), 0, 1);
  var startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startOfDay.getTime() - startOfYear.getTime()) / 86400000);
}

function parseEnerjiDateOnly(tarih) {
  if (Object.prototype.toString.call(tarih) === '[object Date]' && !isNaN(tarih.getTime())) {
    return new Date(tarih.getFullYear(), tarih.getMonth(), tarih.getDate());
  }

  var text = normalizeDateTR(tarih);
  var parts;
  if (text.indexOf('/') !== -1) {
    var slashParts = text.split('/');
    parts = slashParts[0].length === 4
      ? [slashParts[2], slashParts[1], slashParts[0]]
      : [slashParts[0], slashParts[1], slashParts[2]];
  } else {
    parts = text.split('.');
  }

  if (parts.length !== 3) return null;

  var day = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  var year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  return new Date(year, month - 1, day);
}

function ensureSheetGridSize(sheet, rowCount, columnCount) {
  if (sheet.getMaxRows() < rowCount) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columnCount) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columnCount - sheet.getMaxColumns());
  }
}

function getYearlyEnergyHourSlots() {
  var slots = ['23:59'];
  for (var hour = 1; hour <= 23; hour++) {
    slots.push(pad2(hour) + ':00');
  }
  slots.push('00:00');
  return slots;
}

function getYearlyEnergyTotalRow(model) {
  return model.slots.length + 3;
}

function getYearlyEnergySheetRowCount(model) {
  return getYearlyEnergyTotalRow(model);
}

function buildYearlyEnergyTotalFormula(sheet, productionColumn, slotCount) {
  var startCell = sheet.getRange(3, productionColumn).getA1Notation();
  var endCell = sheet.getRange(slotCount + 2, productionColumn).getA1Notation();
  return '=SUM(' + startCell + ':' + endCell + ')';
}

function getYearlyEnergyCounterDiffFromRows(rows, fieldName) {
  if (!rows || !rows.length) return '';
  var firstValue = rows[0][fieldName];
  var lastValue = rows[rows.length - 1][fieldName];
  if (firstValue === null || firstValue === '' || lastValue === null || lastValue === '') return '';
  return Math.max(0, parseEnerjiNumber(lastValue) - parseEnerjiNumber(firstValue));
}

function getYearlyEnergyProductionTotalFromRows(rows) {
  var total = 0;
  for (var i = 0; i < (rows || []).length; i++) {
    total += Math.max(0, parseEnerjiNumber(rows[i].saatlikUretim));
  }
  return total;
}

function getYearlyEnergyCounterDiffFromDisplayValues(values, columnIndex) {
  if (!values || !values.length) return '';
  var firstValue = values[0][columnIndex];
  var lastValue = values[values.length - 1][columnIndex];
  if (firstValue === '' || lastValue === '') return '';
  return Math.max(0, parseEnerjiNumber(lastValue) - parseEnerjiNumber(firstValue));
}

function getYearlyEnergyProductionTotalFromDisplayValues(values, columnIndex) {
  var total = 0;
  for (var i = 0; i < (values || []).length; i++) {
    total += Math.max(0, parseEnerjiNumber(values[i][columnIndex]));
  }
  return total;
}

function normalizeEnerjiSaat(value) {
  var text = String(value || '').trim();
  if (!text) return '00:00';
  var parts = text.split(':');
  var hour = parseInt(parts[0] || '0', 10);
  var minute = parseInt(parts[1] || '0', 10);
  return pad2(isNaN(hour) ? 0 : hour) + ':' + pad2(isNaN(minute) ? 0 : minute);
}

function formatEnerjiDateTR(date) {
  return pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
}

function formatEnerjiHeaderDate(date) {
  return date.getDate() + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
}

