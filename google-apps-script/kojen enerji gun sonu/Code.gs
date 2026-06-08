/**
 * KOJEN ENERJI GUN SONU DEGERLERI - Google Apps Script
 *
 * Bu kod ayri bir Apps Script Web App olarak deploy edilecek.
 * Kayitlar aktif spreadsheet icinde motor bazli sayfalara yazilir:
 * EnerjiGunSonu-GM-1, EnerjiGunSonu-GM-2, EnerjiGunSonu-GM-3
 *
 * Web App ayarlari:
 * Execute as: Me
 * Who has access: Anyone
 */

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = String(params.action || 'health').trim();
  var lock = null;

  try {
    if (action === 'addEndOfDayValues' ||
        action === 'testAddEndOfDayValues' ||
        action === 'createEndOfDaySheets' ||
        action === 'autoCreateMissingEndOfDayValues' ||
        action === 'installEndOfDayAutoTrigger') {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    }

    var result;
    switch (action) {
      case '':
      case 'health':
        result = getApiHealth();
        break;
      case 'addEndOfDayValues':
        result = addEndOfDayValues(params);
        break;
      case 'testAddEndOfDayValues':
        result = testAddEndOfDayValues(params);
        break;
      case 'createEndOfDaySheets':
        result = createEndOfDaySheets(params.motor, params.includeMainEnergy);
        break;
      case 'getEndOfDayValues':
        result = getEndOfDayValues(params);
        break;
      case 'autoCreateMissingEndOfDayValues':
        result = autoCreateMissingEndOfDayValues(params);
        break;
      case 'installEndOfDayAutoTrigger':
        result = installEndOfDayAutoTrigger();
        break;
      case 'getEndOfDayAutoTriggerHealth':
        result = getEndOfDayAutoTriggerHealth();
        break;
      default:
        result = { success: false, error: 'Gecersiz islem: ' + action };
    }

    if (lock) lock.releaseLock();
    return jsonOutput(result);
  } catch (error) {
    if (lock) lock.releaseLock();
    return jsonOutput({ success: false, error: error.toString() });
  }
}

function getApiHealth() {
  return {
    success: true,
    service: 'Kojen Enerji Gun Sonu',
    message: 'API calisiyor.',
    checkedAt: new Date().toISOString(),
    availableActions: [
      'addEndOfDayValues',
      'testAddEndOfDayValues',
      'createEndOfDaySheets',
      'getEndOfDayValues',
      'autoCreateMissingEndOfDayValues',
      'installEndOfDayAutoTrigger',
      'getEndOfDayAutoTriggerHealth'
    ],
    sheetPattern: 'EnerjiGunSonu-GM-*'
  };
}

function getEnerjiEndOfDaySheetName(motor) {
  return 'EnerjiGunSonu-' + normalizeEnerjiMotorLabel(motor);
}

function getOrCreateEnerjiEndOfDaySheet(motor) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = getEnerjiEndOfDaySheetName(motor);
  var sheet = spreadsheet.getSheetByName(sheetName);
  var headers = ['Tarih', 'Saat', 'Motor', 'Toplam Aktif Enerji', 'Calisma Saati', 'Kalkis Sayisi', 'Kaydeden', 'Kayit Tarihi'];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#111827')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, 1000, 3).setNumberFormat('@');
    sheet.getRange(2, 4, 1000, 3).setNumberFormat('0.00');
    sheet.getRange(2, 7, 1000, 2).setNumberFormat('@');
    sheet.setColumnWidth(1, 110);
    sheet.setColumnWidth(2, 80);
    sheet.setColumnWidth(3, 90);
    sheet.setColumnWidth(4, 140);
    sheet.setColumnWidth(5, 110);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 120);
    sheet.setColumnWidth(8, 160);
  }

  return sheet;
}

function createEndOfDaySheets(motor, includeMainEnergyValue) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var includeMainEnergy = String(includeMainEnergyValue || '').toLowerCase() === '1' ||
      String(includeMainEnergyValue || '').toLowerCase() === 'true';
    var sheets = [];

    for (var i = 0; i < motors.length; i++) {
      var currentMotor = normalizeEnerjiMotorLabel(motors[i]);
      var endOfDaySheetName = getEnerjiEndOfDaySheetName(currentMotor);
      var endOfDayExisted = !!spreadsheet.getSheetByName(endOfDaySheetName);
      var endOfDaySheet = getOrCreateEnerjiEndOfDaySheet(currentMotor);
      var result = {
        motor: currentMotor,
        endOfDaySheet: endOfDaySheet.getName(),
        endOfDayCreated: !endOfDayExisted
      };

      if (includeMainEnergy) {
        var mainSheetName = 'Enerji ' + currentMotor;
        var mainExisted = !!spreadsheet.getSheetByName(mainSheetName);
        var mainSheet = getOrCreateMainEnergySheet(currentMotor);
        result.mainEnergySheet = mainSheet.getName();
        result.mainEnergyCreated = !mainExisted;
      }

      sheets.push(result);
    }

    return {
      success: true,
      message: motors.length + ' motor icin gun sonu sayfalari hazirlandi.',
      includeMainEnergy: includeMainEnergy,
      sheets: sheets
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function addEndOfDayValues(data) {
  return saveEndOfDayValues(data, { enforceWindow: true });
}

function testAddEndOfDayValues(data) {
  return saveEndOfDayValues(data, { enforceWindow: false });
}

function saveEndOfDayValues(data, options) {
  try {
    if (!data.tarih || !data.motor ||
        data.toplamAktifEnerji === '' || data.toplamAktifEnerji === undefined ||
        data.calismaSaati === '' || data.calismaSaati === undefined ||
        data.kalkisSayisi === '' || data.kalkisSayisi === undefined) {
      return { success: false, error: 'Tarih, motor, toplam aktif enerji, calisma saati ve kalkis sayisi zorunludur!' };
    }

    var opts = options || {};
    var windowState = getEndOfDayWindowState();
    if (opts.enforceWindow !== false && !windowState.active) {
      return {
        success: false,
        error: 'Gun sonu degerleri sadece ' + windowState.windowText + ' arasinda kaydedilebilir.'
      };
    }

    var tarih = opts.enforceWindow === false ? normalizeDateTR(data.tarih) : windowState.tarih;
    var saat = '23:59';
    var motor = normalizeEnerjiMotorLabel(data.motor);
    var sheet = getOrCreateEnerjiEndOfDaySheet(motor);
    var toplamAktifEnerji = parseEnerjiNumber(data.toplamAktifEnerji);
    var calismaSaati = parseEnerjiNumber(data.calismaSaati);
    var kalkisSayisi = parseEnerjiNumber(data.kalkisSayisi);
    var kaydeden = data.kaydeden || 'Admin';
    var kayitTarihi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss');

    if (sheet.getLastRow() > 1) {
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
      for (var i = 0; i < rows.length; i++) {
        if (normalizeDateTR(rows[i][0]) === tarih &&
            String(rows[i][1] || '').trim() === saat &&
            normalizeEnerjiMotorLabel(rows[i][2]) === motor) {
          return { success: false, error: 'Bu tarih ve motor icin 23:59 gun sonu degerleri zaten var!' };
        }
      }
    }

    sheet.appendRow([tarih, saat, motor, toplamAktifEnerji, calismaSaati, kalkisSayisi, kaydeden, kayitTarihi]);
    var row = sheet.getLastRow();
    sheet.getRange(row, 1, 1, 8)
      .setHorizontalAlignment('center')
      .setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(row, 4, 1, 3).setNumberFormat('0.00');

    var mainEnergyResult = upsertMainEnergyEndOfDayRecord({
      tarih: tarih,
      saat: saat,
      motor: motor,
      toplamAktifEnerji: toplamAktifEnerji,
      calismaSaati: calismaSaati,
      kalkisSayisi: kalkisSayisi,
      kaydeden: kaydeden,
      kayitTarihi: kayitTarihi
    });
    var yearlyResult = updateYearlyEnergyEndOfDayRow(motor, tarih, calismaSaati, toplamAktifEnerji);

    return {
      success: true,
      message: motor + ' motoru icin 23:59 gun sonu degerleri kaydedildi.',
      sheetName: sheet.getName(),
      tarih: tarih,
      saat: saat,
      motor: motor,
      mainEnergy: mainEnergyResult,
      yearly: yearlyResult,
      testMode: opts.enforceWindow === false
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function upsertMainEnergyEndOfDayRecord(data) {
  try {
    var motor = normalizeEnerjiMotorLabel(data.motor);
    var sheet = getOrCreateMainEnergySheet(motor);
    var rowValues = buildMainEnergyEndOfDayRow(data);
    var targetRow = findMainEnergyRecordRow(sheet, data.tarih, data.saat);
    var action = 'updated';

    if (!targetRow) {
      sheet.appendRow(rowValues);
      targetRow = sheet.getLastRow();
      action = 'inserted';
    } else {
      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    }

    formatMainEnergyRecordRow(sheet, targetRow);

    return {
      success: true,
      action: action,
      sheetName: sheet.getName(),
      row: targetRow
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getOrCreateMainEnergySheet(motor) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = 'Enerji ' + normalizeEnerjiMotorLabel(motor);
  var sheet = spreadsheet.getSheetByName(sheetName);
  var headers = [
    'Tarih', 'Vardiya', 'Saat', 'Motor',
    'L1-L2 AYDEM VOLTAJI', '(P) AKTIF GUC', '(Q) REAKTIF GUC', 'Cos Phi',
    'ORT.AKIM', 'ORT.GERILIM', 'NOTR AKIMI', 'TAHRIK GERILIMI',
    'TOPLAM AKTIF ENERJI', 'CALISMA SAATI', 'KALKIS SAYISI',
    'Durum', 'Kaydeden', 'Kayit Tarihi'
  ];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#111827')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, 1000, 4).setNumberFormat('@');
    sheet.getRange(2, 5, 1000, 11).setNumberFormat('0.00');
    sheet.getRange(2, 16, 1000, 3).setNumberFormat('@');
  }

  return sheet;
}

function buildMainEnergyEndOfDayRow(data) {
  var zero = 0;
  return [
    data.tarih,
    '24-08',
    data.saat || '23:59',
    normalizeEnerjiMotorLabel(data.motor),
    zero, zero, zero, zero, zero, zero, zero, zero,
    parseEnerjiNumber(data.toplamAktifEnerji),
    parseEnerjiNumber(data.calismaSaati),
    parseEnerjiNumber(data.kalkisSayisi),
    'GUN SONU',
    data.kaydeden || 'Admin',
    data.kayitTarihi || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
  ];
}

function findMainEnergyRecordRow(sheet, tarih, saat) {
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var normalizedDate = normalizeDateTR(tarih);
  var normalizedSaat = String(saat || '23:59').trim();
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();

  for (var i = 0; i < rows.length; i++) {
    if (normalizeDateTR(rows[i][0]) === normalizedDate &&
        String(rows[i][2] || '').trim() === normalizedSaat) {
      return i + 2;
    }
  }

  return 0;
}

function formatMainEnergyRecordRow(sheet, row) {
  sheet.getRange(row, 1, 1, 18)
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(row, 5, 1, 11).setNumberFormat('0.00');
  sheet.getRange(row, 16).setFontWeight('bold').setBackground('#d9ead3');
}

function getEndOfDayValues(params) {
  try {
    var motor = params && params.motor ? normalizeEnerjiMotorLabel(params.motor) : '';
    var sheets = motor
      ? [getOrCreateEnerjiEndOfDaySheet(motor)]
      : getEnerjiEndOfDaySheets();
    var data = [];

    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      if (!sheet || sheet.getLastRow() < 2) continue;

      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getDisplayValues();
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        data.push({
          tarih: row[0],
          saat: row[1],
          motor: row[2],
          toplamAktifEnerji: row[3],
          calismaSaati: row[4],
          kalkisSayisi: row[5],
          kaydeden: row[6],
          kayitTarihi: row[7],
          sheetName: sheet.getName()
        });
      }
    }

    var tarih = params && params.tarih ? normalizeDateTR(params.tarih) : '';
    if (motor) data = data.filter(function(item) { return normalizeEnerjiMotorLabel(item.motor) === motor; });
    if (tarih) data = data.filter(function(item) { return normalizeDateTR(item.tarih) === tarih; });

    data.reverse();
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getEnerjiEndOfDaySheets() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = spreadsheet.getSheets();
  var output = [];
  for (var i = 0; i < sheets.length; i++) {
    if (/^EnerjiGunSonu-GM-/i.test(sheets[i].getName())) {
      output.push(sheets[i]);
    }
  }
  return output;
}

function autoCreateMissingEndOfDayValues(params) {
  try {
    var options = params || {};
    if (options && options.parameter) {
      options = options.parameter;
    }

    var now = new Date();
    var force = isTruthy(options.force) || !!options.tarih;
    if (!force && !isAfterEndOfDayManualWindow(now)) {
      return {
        success: true,
        skipped: true,
        reason: 'Manuel gun sonu penceresi henuz kapanmadi. Otomatik kayit 00:30 sonrasinda calisir.',
        checkedAt: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
      };
    }

    var targetDate = options.tarih
      ? normalizeDateTR(options.tarih)
      : getAutoEndOfDayTargetDate(now);
    var doneKey = 'endOfDayAutoDone:' + targetDate;
    var props = PropertiesService.getScriptProperties();
    if (!force && props.getProperty(doneKey)) {
      return {
        success: true,
        skipped: true,
        tarih: targetDate,
        reason: 'Bu tarih icin gun sonu otomatik kontrolu daha once tamamlandi.'
      };
    }

    var result = createMissingEndOfDayValuesForDate(targetDate, options.motor, options.kaydeden || 'OTOMATIK SISTEM');

    if (result.success && result.unresolvedCount === 0) {
      props.setProperty(
        doneKey,
        Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
      );
    }

    return result;
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function createMissingEndOfDayValuesForDate(tarih, motor, kaydeden) {
  try {
    var targetTarih = normalizeDateTR(tarih || '');
    if (!targetTarih) {
      return { success: false, error: 'Tarih zorunludur.' };
    }

    var motors = motor ? [normalizeEnerjiMotorLabel(motor)] : ['GM-1', 'GM-2', 'GM-3'];
    var added = [];
    var skipped = [];
    var errors = [];
    var details = [];

    for (var i = 0; i < motors.length; i++) {
      var currentMotor = normalizeEnerjiMotorLabel(motors[i]);
      if (endOfDayValueExists(currentMotor, targetTarih)) {
        skipped.push(currentMotor);
        details.push({
          motor: currentMotor,
          status: 'exists',
          message: 'Gun sonu kaydi zaten var.'
        });
        continue;
      }

      var source = getLatestMainEnergyRecordForDate(currentMotor, targetTarih);
      if (!source) {
        errors.push(currentMotor + ': ' + targetTarih + ' icin ana enerji kaydi bulunamadi.');
        details.push({
          motor: currentMotor,
          status: 'missingSource',
          message: 'Ana enerji kaydi bulunamadi.'
        });
        continue;
      }

      var saveResult = saveEndOfDayValues({
        tarih: targetTarih,
        motor: currentMotor,
        toplamAktifEnerji: source.toplamAktifEnerji,
        calismaSaati: source.calismaSaati,
        kalkisSayisi: source.kalkisSayisi,
        kaydeden: kaydeden || 'OTOMATIK SISTEM'
      }, { enforceWindow: false });

      if (saveResult.success) {
        added.push(currentMotor);
        details.push({
          motor: currentMotor,
          status: 'added',
          sourceSaat: source.saat,
          toplamAktifEnerji: source.toplamAktifEnerji,
          calismaSaati: source.calismaSaati,
          kalkisSayisi: source.kalkisSayisi,
          result: saveResult
        });
      } else if (String(saveResult.error || '').indexOf('zaten var') !== -1) {
        skipped.push(currentMotor);
        details.push({
          motor: currentMotor,
          status: 'existsAfterSave',
          message: saveResult.error
        });
      } else {
        errors.push(currentMotor + ': ' + saveResult.error);
        details.push({
          motor: currentMotor,
          status: 'error',
          message: saveResult.error
        });
      }
    }

    return {
      success: errors.length === 0,
      tarih: targetTarih,
      addedCount: added.length,
      skippedCount: skipped.length,
      unresolvedCount: errors.length,
      added: added,
      skipped: skipped,
      errors: errors,
      details: details,
      message: added.length
        ? added.length + ' motor icin otomatik gun sonu kaydi olusturuldu.'
        : 'Eksik gun sonu kaydi bulunmadi veya kaynak veri yok.'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function endOfDayValueExists(motor, tarih) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(getEnerjiEndOfDaySheetName(motor));
  if (!sheet || sheet.getLastRow() < 2) return false;

  var targetTarih = normalizeDateTR(tarih || '');
  var targetMotor = normalizeEnerjiMotorLabel(motor);
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (normalizeDateTR(rows[i][0]) === targetTarih &&
        String(rows[i][1] || '').trim() === '23:59' &&
        normalizeEnerjiMotorLabel(rows[i][2]) === targetMotor) {
      return true;
    }
  }
  return false;
}

function getMainEnergySheetIfExists(motor) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName('Enerji ' + normalizeEnerjiMotorLabel(motor));
}

function getLatestMainEnergyRecordForDate(motor, tarih) {
  var sheet = getMainEnergySheetIfExists(motor);
  if (!sheet || sheet.getLastRow() < 2) return null;

  var targetTarih = normalizeDateTR(tarih || '');
  var targetMotor = normalizeEnerjiMotorLabel(motor);
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 18).getDisplayValues();
  var best = null;
  var bestTime = -1;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var rowTarih = normalizeDateTR(row[0] || '');
    var rowMotor = normalizeEnerjiMotorLabel(row[3] || targetMotor);
    if (rowTarih !== targetTarih || rowMotor !== targetMotor) {
      continue;
    }

    var rowSaat = String(row[2] || '').trim();
    if (!rowSaat) continue;

    var recordTime = parseDateTimeTR(rowTarih, rowSaat).getTime();
    if (isNaN(recordTime) || recordTime < bestTime) {
      continue;
    }

    bestTime = recordTime;
    best = {
      tarih: rowTarih,
      saat: rowSaat,
      motor: targetMotor,
      toplamAktifEnerji: row[12],
      calismaSaati: row[13],
      kalkisSayisi: row[14]
    };
  }

  return best;
}

function isAfterEndOfDayManualWindow(date) {
  var now = date || new Date();
  var minutes = (now.getHours() * 60) + now.getMinutes();
  return minutes > 30;
}

function getAutoEndOfDayTargetDate(date) {
  var target = new Date((date || new Date()).getTime());
  target.setDate(target.getDate() - 1);
  return formatDateTR(target);
}

function installEndOfDayAutoTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoCreateMissingEndOfDayValues') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('autoCreateMissingEndOfDayValues')
    .timeBased()
    .everyMinutes(15)
    .create();

  return {
    success: true,
    message: 'Gun sonu otomatik kontrol tetikleyicisi kuruldu. 23:50-00:30 manuel pencere bittikten sonra eksik kayitlari tamamlar.'
  };
}

function getEndOfDayAutoTriggerHealth() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var matches = [];
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'autoCreateMissingEndOfDayValues') {
        matches.push({
          handler: triggers[i].getHandlerFunction(),
          source: String(triggers[i].getTriggerSource()),
          eventType: String(triggers[i].getEventType())
        });
      }
    }

    return {
      success: true,
      installed: matches.length > 0,
      triggerCount: matches.length,
      triggers: matches,
      checkedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm:ss')
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateYearlyEnergyEndOfDayRow(motor, tarih, calismaSaati, toplamAktifEnerji) {
  try {
    var date = parseDateTR(tarih);
    if (!date) {
      return { success: false, error: 'Yillik enerji icin tarih okunamadi: ' + tarih };
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var year = date.getFullYear();
    var normalizedMotor = normalizeEnerjiMotorLabel(motor);
    var sheetName = 'YillikEnerji-' + normalizedMotor + '-' + year;
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      return { success: true, skipped: true, reason: sheetName + ' sayfasi bulunamadi' };
    }

    var closingDate = new Date(date.getTime());
    var nextDate = new Date(date.getTime());
    nextDate.setDate(nextDate.getDate() + 1);
    var closingStartCol = getYearlyEnergyDayStartColumn(closingDate);
    var nextStartCol = getYearlyEnergyDayStartColumn(nextDate);

    if (closingStartCol + 2 > sheet.getLastColumn()) {
      return { success: false, error: sheetName + ' icinde tarih kolonu bulunamadi: ' + tarih };
    }

    var closingColumns = getYearlyEnergyMetricColumns(sheet, closingStartCol);
    var previousEnergy = getYearlyEnergyPreviousHourTotal(sheet, closingStartCol, closingColumns);
    var hourlyProduction = previousEnergy === null
      ? 0
      : Math.max(0, parseEnerjiNumber(toplamAktifEnerji) - previousEnergy);

    var metricValues = {
      calismaSaati: parseEnerjiNumber(calismaSaati),
      toplamAktifEnerji: parseEnerjiNumber(toplamAktifEnerji),
      saatlikUretim: hourlyProduction
    };

    var closingRow = 27;
    if (sheet.getLastRow() >= closingRow) {
      formatAndWriteYearlyEnergyEndOfDayRange(sheet, closingRow, closingStartCol, metricValues);
    }
    var closingTotalResult = updateYearlyEnergyDayTotalRow(sheet, closingStartCol);

    var nextDayResult = { success: true, skipped: false };
    var nextYear = nextDate.getFullYear();
    var nextSheet = sheet;
    var nextSheetName = sheetName;
    if (nextYear !== year) {
      nextSheetName = 'YillikEnerji-' + normalizedMotor + '-' + nextYear;
      nextSheet = spreadsheet.getSheetByName(nextSheetName);
      nextStartCol = getYearlyEnergyDayStartColumn(nextDate);
    }

    if (!nextSheet) {
      nextDayResult = { success: true, skipped: true, reason: nextSheetName + ' sayfasi bulunamadi' };
    } else if (nextStartCol + 2 > nextSheet.getLastColumn()) {
      nextDayResult = { success: false, error: nextSheetName + ' icinde ertesi gun kolonu bulunamadi: ' + formatDateTR(nextDate) };
    } else if (nextSheet.getLastRow() < 3) {
      nextDayResult = { success: false, error: nextSheetName + ' icinde 3. satir bulunamadi' };
    } else {
      formatAndWriteYearlyEnergyEndOfDayRange(nextSheet, 3, nextStartCol, metricValues);
      nextDayResult = {
        success: true,
        sheetName: nextSheetName,
        tarih: formatDateTR(nextDate),
        row: 3,
        startColumn: nextStartCol
      };
    }

    return {
      success: true,
      sheetName: sheetName,
      tarih: tarih,
      closingRow: closingRow,
      closingStartColumn: closingStartCol,
      closingTotal: closingTotalResult,
      nextDay: nextDayResult,
      saatlikUretim: hourlyProduction
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function updateYearlyEnergyDayTotalRow(sheet, startCol) {
  try {
    var totalRow = 28;
    var firstDataRow = 3;
    var lastDataRow = 27;

    if (!sheet || sheet.getLastRow() < totalRow) {
      return { success: false, error: 'Yillik enerji toplam satiri bulunamadi' };
    }

    var rowCount = lastDataRow - firstDataRow + 1;
    var columns = getYearlyEnergyMetricColumns(sheet, startCol);
    var values = sheet.getRange(firstDataRow, startCol, rowCount, 3).getDisplayValues();
    var calismaDiff = getYearlyEnergyCounterDiffFromValues(values, columns.calismaSaati);
    var enerjiDiff = getYearlyEnergyCounterDiffFromValues(values, columns.toplamAktifEnerji);
    var uretimToplam = getYearlyEnergyProductionTotalFromValues(values, columns.saatlikUretim);
    var output = buildYearlyEnergyMetricRowValues(columns, {
      calismaSaati: calismaDiff,
      toplamAktifEnerji: enerjiDiff,
      saatlikUretim: uretimToplam
    });

    var range = sheet.getRange(totalRow, startCol, 1, 3);
    range.setValues([output]);
    range.setNumberFormat('0.###');
    range.setHorizontalAlignment('center');
    range.setBackground('#ffe699');
    range.setFontWeight('bold');
    range.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);

    return {
      success: true,
      row: totalRow,
      calismaSaati: calismaDiff,
      toplamAktifEnerji: enerjiDiff,
      saatlikUretim: uretimToplam
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getYearlyEnergyCounterDiffFromValues(values, columnIndex) {
  if (!values || !values.length) return '';
  var firstValue = values[0][columnIndex];
  var lastValue = values[values.length - 1][columnIndex];
  if (String(firstValue || '').trim() === '' || String(lastValue || '').trim() === '') return '';
  return Math.max(0, parseEnerjiNumber(lastValue) - parseEnerjiNumber(firstValue));
}

function getYearlyEnergyProductionTotalFromValues(values, columnIndex) {
  var total = 0;
  for (var i = 0; i < (values || []).length; i++) {
    total += Math.max(0, parseEnerjiNumber(values[i][columnIndex]));
  }
  return total;
}

function formatAndWriteYearlyEnergyEndOfDayRange(sheet, row, startCol, metricValues) {
  var columns = getYearlyEnergyMetricColumns(sheet, startCol);
  var values = buildYearlyEnergyMetricRowValues(columns, metricValues);
  var range = sheet.getRange(row, startCol, 1, 3);
  range.setValues([values]);
  range.setNumberFormat('0.###');
  range.setHorizontalAlignment('center');
  range.setBackground('#d9ead3');
  range.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(row, startCol + columns.saatlikUretim)
    .setBackground(getYearlyEnergyProductionCellBackground(metricValues.saatlikUretim, '#d9ead3'));
}

function getYearlyEnergyProductionCellBackground(value, defaultColor) {
  var production = parseEnerjiNumber(value);
  if (production === 0) return '#d9d9d9';
  if (production < 2.5) return '#fff2cc';
  if (production > 3) return '#f4cccc';
  return defaultColor || '#ffffff';
}

function buildYearlyEnergyMetricRowValues(columns, metricValues) {
  var values = ['', '', ''];
  values[columns.calismaSaati] = metricValues.calismaSaati;
  values[columns.toplamAktifEnerji] = metricValues.toplamAktifEnerji;
  values[columns.saatlikUretim] = metricValues.saatlikUretim;
  return values;
}

function getYearlyEnergyMetricColumns(sheet, startCol) {
  var headers = sheet.getRange(2, startCol, 1, 3).getDisplayValues()[0];
  var columns = {
    calismaSaati: -1,
    toplamAktifEnerji: -1,
    saatlikUretim: -1
  };

  for (var i = 0; i < headers.length; i++) {
    var header = normalizeHeaderText(headers[i]);
    if (header.indexOf('CALISMA') !== -1) {
      columns.calismaSaati = i;
    } else if (header.indexOf('TOPLAM') !== -1 || header.indexOf('AKTIF') !== -1 || header.indexOf('ENERJI') !== -1) {
      columns.toplamAktifEnerji = i;
    } else if (header.indexOf('SAATLIK') !== -1 || header.indexOf('URETIM') !== -1) {
      columns.saatlikUretim = i;
    }
  }

  if (columns.calismaSaati === -1) columns.calismaSaati = 0;
  if (columns.toplamAktifEnerji === -1) columns.toplamAktifEnerji = 1;
  if (columns.saatlikUretim === -1) columns.saatlikUretim = 2;

  return columns;
}

function normalizeHeaderText(value) {
  return String(value || '')
    .replace(/\u0131/g, 'i')
    .replace(/\u0130/g, 'I')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function getYearlyEnergyPreviousHourTotal(sheet, startCol, columns) {
  var previousRow = findYearlyEnergySlotRow(sheet, '23:00');
  if (!previousRow) return null;

  var metricColumns = columns || getYearlyEnergyMetricColumns(sheet, startCol);
  var value = sheet.getRange(previousRow, startCol + metricColumns.toplamAktifEnerji).getDisplayValue();
  if (String(value || '').trim() === '') return null;
  return parseEnerjiNumber(value);
}

function findYearlyEnergySlotRow(sheet, slot) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return 0;

  var values = sheet.getRange(3, 1, lastRow - 2, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === slot) {
      return i + 3;
    }
  }

  return 0;
}

function getDayIndexInYear(date) {
  var start = new Date(date.getFullYear(), 0, 1);
  var current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((current.getTime() - start.getTime()) / 86400000);
}

function getYearlyEnergyDayStartColumn(date) {
  return 2 + (getDayIndexInYear(date) * 3);
}

function normalizeDateTR(tarih) {
  var value = String(tarih || '').trim();
  if (value.indexOf('-') !== -1) {
    var parts = value.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }
  if (value.indexOf('/') !== -1) {
    var slashParts = value.split('/');
    if (slashParts.length === 3) {
      if (String(slashParts[0]).length === 4) {
        return pad2(parseInt(slashParts[2], 10)) + '.' +
          pad2(parseInt(slashParts[1], 10)) + '.' +
          slashParts[0];
      }
      return pad2(parseInt(slashParts[0], 10)) + '.' +
        pad2(parseInt(slashParts[1], 10)) + '.' +
        slashParts[2];
    }
  }
  return value;
}

function parseDateTR(tarih) {
  var text = normalizeDateTR(tarih);
  var parts = text.split('.');
  if (parts.length !== 3) return null;

  var day = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  var year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  return new Date(year, month - 1, day);
}

function parseDateTimeTR(tarih, saat) {
  var date = parseDateTR(tarih);
  if (!date) return new Date(NaN);

  var text = String(saat || '00:00').trim();
  var parts = text.split(':');
  var hour = parseInt(parts[0] || '0', 10);
  var minute = parseInt(parts[1] || '0', 10);
  date.setHours(isNaN(hour) ? 0 : hour, isNaN(minute) ? 0 : minute, 0, 0);
  return date;
}

function getEndOfDayWindowState() {
  var now = new Date();
  var minutes = (now.getHours() * 60) + now.getMinutes();
  var lateStart = (23 * 60) + 50;
  var earlyEnd = 30;
  var active = minutes >= lateStart || minutes <= earlyEnd;
  var targetDate = new Date(now.getTime());

  if (minutes <= earlyEnd) {
    targetDate.setDate(targetDate.getDate() - 1);
  }

  var nextDate = new Date(targetDate.getTime());
  nextDate.setDate(nextDate.getDate() + 1);

  return {
    active: active,
    tarih: formatDateTR(targetDate),
    windowText: formatDateTR(targetDate) + ' 23:50 - ' + formatDateTR(nextDate) + ' 00:30'
  };
}

function formatDateTR(date) {
  return pad2(date.getDate()) + '.' + pad2(date.getMonth() + 1) + '.' + date.getFullYear();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isTruthy(value) {
  var text = String(value || '').toLowerCase();
  return text === '1' || text === 'true' || text === 'evet' || text === 'yes';
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

function parseEnerjiNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;

  var normalized = String(value).trim();
  if (normalized.indexOf(',') !== -1) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }

  var parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

function jsonOutput(result) {
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
