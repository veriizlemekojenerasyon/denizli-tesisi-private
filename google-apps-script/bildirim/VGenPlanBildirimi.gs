/**
 * V-GEN ERTESI GUN PLAN BILDIRIMI
 *
 * Bu dosyayi Bildirim Apps Script projesine ayri bir .gs dosyasi olarak ekleyin.
 * Code.gs icindeki addAnnouncement/addSystemLog fonksiyonlarini ayni projeden kullanir.
 *
 * Script Properties:
 * - VGEN_ACCESS_TOKEN
 * - VGEN_MAIL_TO
 *
 * Opsiyonel:
 * - VGEN_NOTIFICATION_SHIFT           Bos veya all/tum ise tum gun gorunur. Varsayilan: tum gun
 * - VGEN_NOTIFICATION_PAGE_TARGET     Varsayilan: all
 * - VGEN_MESSAGE_MOTORS               Varsayilan: GM-1,GM-2,GM-3
 * - VGEN_PLAN_SOURCE                  api veya mail. Varsayilan: api
 * - VGEN_PLAN_MAIL_QUERY              Gmail arama sorgusu. Mail yedegi kullanilirsa.
 * - VGEN_PLAN_MAIL_SUBJECT            Varsayilan: Koruma Klor. Mail yedegi kullanilirsa.
 * - VGEN_PLAN_MAIL_LOOKBACK_DAYS      Varsayilan: 7. Mail yedegi kullanilirsa.
 * - VGEN_LOGIN_URL                    Token otomatik yenileme login URL'i.
 * - VGEN_USERNAME                     V-Gen kullanici adi.
 * - VGEN_PASSWORD                     V-Gen sifresi.
 * - VGEN_LOGIN_PAYLOAD_JSON           Opsiyonel login body sablonu. ${username}, ${password}, ${tenantId} kullanilabilir.
 * - VGEN_LOGIN_HEADERS_JSON           Opsiyonel login header JSON.
 * - VGEN_LOGIN_TOKEN_PATH             Varsayilan: access_token,token,data.accessToken,data.token
 * - VGEN_LOGIN_EXPIRES_IN_PATH        Varsayilan: expires_in,expiresIn,data.expires_in,data.expiresIn
 * - VGEN_ACCESS_TOKEN_EXPIRES_AT      Otomatik yazilir.
 * - VGEN_PLAN_HEADERS_JSON            Opsiyonel plan API ekstra header JSON.
 * - VGEN_PLAN_URL                     Opsiyonel plan API base URL override.
 * - VGEN_TARGET_PLANT_KEYWORDS        Varsayilan: denizli. Birden fazla icin virgul kullanin.
 */

var VGEN_PLAN_TRIGGER_HANDLER = 'runVgenPlanNotification';
var VGEN_PLAN_MODULE_NAME = 'V-Gen Plan';
var VGEN_DEFAULT_PLAN_SOURCE = 'api';
var VGEN_DEFAULT_TENANT_ID = '26e3e75d-4a9c-4095-8e06-928d74dce07f';
var VGEN_DEFAULT_PLAN_URL = 'https://api.vgen.vtcenerji.com/vplantmanager/plannings/assetplans/withdetails';

function installVgenPlanDailyTrigger() {
  deleteVgenPlanDailyTriggers();
  ScriptApp.newTrigger(VGEN_PLAN_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(15)
    .nearMinute(15)
    .inTimezone(Session.getScriptTimeZone())
    .create();

  return {
    success: true,
    message: 'V-Gen plan bildirimi her gun 15:15 civari calisacak sekilde kuruldu.'
  };
}

function deleteVgenPlanDailyTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === VGEN_PLAN_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }
  return { success: true, deletedCount: deleted };
}

function testVgenPlanPreview() {
  var result = runVgenPlanNotification({ dryRun: true, force: true });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testVgenTodayPlanPreview() {
  var result = runVgenPlanNotification({ dryRun: true, force: true, date: getVgenTodayDate() });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runVgenTodayPlanNotification() {
  var result = runVgenPlanNotification({ force: true, date: getVgenTodayDate() });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function runVgenTomorrowPlanNotification() {
  var result = runVgenPlanNotification({ force: true, date: getVgenTomorrowDate() });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function deleteVgenMailToProperty() {
  PropertiesService.getScriptProperties().deleteProperty('VGEN_MAIL_TO');
  return logVgenPlanSetup();
}

function setVgenMailToGmail() {
  PropertiesService.getScriptProperties().setProperty('VGEN_MAIL_TO', 'mrtcsk0320@gmail.com');
  return logVgenPlanSetup();
}

function setupVgenPlanMailSource() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('VGEN_PLAN_SOURCE', 'mail');
  props.setProperty('VGEN_PLAN_MAIL_SUBJECT', 'Koruma Klor');
  props.setProperty('VGEN_PLAN_MAIL_LOOKBACK_DAYS', '7');
  return logVgenPlanSetup();
}

function setupVgenPlanApiSource() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('VGEN_PLAN_SOURCE', VGEN_DEFAULT_PLAN_SOURCE);
  return logVgenPlanSetup();
}

function setVgenLoginPropertiesOnce() {
  var config = {
    VGEN_LOGIN_URL: 'https://login.vtcenerji.com/oauth/token',
    VGEN_USERNAME: 'BURAYA_KULLANICI_ADI_YAZ',
    VGEN_PASSWORD: 'BURAYA_SIFRE_YAZ',
    VGEN_AUTH_CLIENT_ID: '6wgog3SuEZXxaA4GIjHfSzXnIQfPcy5v',
    VGEN_AUTH_AUDIENCE: 'https://api.vgen.vtcenerji.com',
    VGEN_AUTH_SCOPE: 'openid email offline_access',
    VGEN_AUTH_GRANT_TYPE: 'password',
    VGEN_AUTH_REALM: 'Username-Password-Authentication',
    VGEN_TENANT_ID: VGEN_DEFAULT_TENANT_ID,
    VGEN_PLAN_URL: VGEN_DEFAULT_PLAN_URL,
    VGEN_LOGIN_CONTENT_TYPE: 'application/json',
    VGEN_LOGIN_PAYLOAD_JSON: '{"grant_type":"${grantType}","username":"${username}","password":"${password}","audience":"${audience}","scope":"${scope}","client_id":"${clientId}","realm":"${realm}"}',
    VGEN_LOGIN_TOKEN_PATH: 'access_token,token,data.accessToken,data.token',
    VGEN_LOGIN_EXPIRES_IN_PATH: 'expires_in,expiresIn,data.expires_in,data.expiresIn',
    VGEN_TARGET_PLANT_KEYWORDS: 'denizli',
    VGEN_REFRESH_BEFORE_SECONDS: '300'
  };

  var missing = [];
  if (config.VGEN_LOGIN_URL === 'BURAYA_LOGIN_URL_YAZ') missing.push('VGEN_LOGIN_URL');
  if (config.VGEN_USERNAME === 'BURAYA_KULLANICI_ADI_YAZ') missing.push('VGEN_USERNAME');
  if (config.VGEN_PASSWORD === 'BURAYA_SIFRE_YAZ') missing.push('VGEN_PASSWORD');
  if (missing.length) {
    throw new Error('Once setVgenLoginPropertiesOnce icindeki su alanlari doldurun: ' + missing.join(', '));
  }

  var props = PropertiesService.getScriptProperties();
  Object.keys(config).forEach(function(key) {
    props.setProperty(key, config[key]);
  });

  props.deleteProperty('VGEN_ACCESS_TOKEN');
  props.deleteProperty('VGEN_ACCESS_TOKEN_UPDATED_AT');
  props.deleteProperty('VGEN_ACCESS_TOKEN_EXPIRES_AT');

  return logVgenPlanSetup();
}

function deleteVgenLoginProperties() {
  var props = PropertiesService.getScriptProperties();
  var keys = [
    'VGEN_LOGIN_URL',
    'VGEN_USERNAME',
    'VGEN_PASSWORD',
    'VGEN_LOGIN_METHOD',
    'VGEN_LOGIN_CONTENT_TYPE',
    'VGEN_LOGIN_PAYLOAD_JSON',
    'VGEN_LOGIN_HEADERS_JSON',
    'VGEN_LOGIN_TOKEN_PATH',
    'VGEN_LOGIN_EXPIRES_AT_PATH',
    'VGEN_LOGIN_EXPIRES_IN_PATH',
    'VGEN_PLAN_URL',
    'VGEN_AUTH_CLIENT_ID',
    'VGEN_AUTH_CLIENT_SECRET',
    'VGEN_AUTH_AUDIENCE',
    'VGEN_AUTH_SCOPE',
    'VGEN_AUTH_GRANT_TYPE',
    'VGEN_AUTH_REALM',
    'VGEN_FORCE_LOGIN_EACH_RUN',
    'VGEN_REFRESH_BEFORE_SECONDS',
    'VGEN_ACCESS_TOKEN',
    'VGEN_ACCESS_TOKEN_UPDATED_AT',
    'VGEN_ACCESS_TOKEN_EXPIRES_AT'
  ];

  for (var i = 0; i < keys.length; i++) {
    props.deleteProperty(keys[i]);
  }

  return logVgenPlanSetup();
}

function deleteVgenAccessTokenOnly() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('VGEN_ACCESS_TOKEN');
  props.deleteProperty('VGEN_ACCESS_TOKEN_UPDATED_AT');
  props.deleteProperty('VGEN_ACCESS_TOKEN_EXPIRES_AT');
  return logVgenPlanSetup();
}

function setupVgenPlanAllDayNotification() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('VGEN_NOTIFICATION_SHIFT');
  props.setProperty('VGEN_NOTIFICATION_PAGE_TARGET', 'all');
  props.setProperty('VGEN_MESSAGE_MOTORS', props.getProperty('VGEN_MESSAGE_MOTORS') || 'GM-1,GM-2,GM-3');
  var setup = logVgenPlanSetup();
  setup.existingAnnouncements = makeExistingVgenPlanAnnouncementsAllDay();
  return setup;
}

function makeExistingVgenPlanAnnouncementsAllDay() {
  try {
    var sheet = getOrCreateAnnouncementsSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: true, updatedCount: 0, message: 'Guncellenecek V-Gen bildirimi yok.' };
    }

    var rows = sheet.getRange(2, 1, lastRow - 1, ANNOUNCEMENT_HEADERS.length).getDisplayValues();
    var updated = 0;
    for (var i = 0; i < rows.length; i++) {
      var item = rowToAnnouncement(rows[i]);
      var isVgenAuto = String(item.id || '').indexOf('auto-vgen-plan-') === 0 ||
        String(item.createdBy || '') === 'V-Gen Otomatik Plan' ||
        /V-Gen/i.test(String(item.title || item.message || ''));
      if (!isVgenAuto) continue;

      var sheetRow = i + 2;
      sheet.getRange(sheetRow, 4).setValue('');
      sheet.getRange(sheetRow, 8).setValue('all');
      sheet.getRange(sheetRow, 16).setValue('all');
      sheet.getRange(sheetRow, 15).setValue(formatDateTimeTR(new Date()));
      updated++;
    }

    return {
      success: true,
      updatedCount: updated,
      message: 'Mevcut V-Gen bildirimleri tum gun ve tum sayfalar icin ayarlandi.'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function setVgenAccessTokenOnce() {
  var token = 'BURAYA_BEARER_TOKEN_YAPISTIR';
  if (token === 'BURAYA_BEARER_TOKEN_YAPISTIR' || token.indexOf('Bearer ') !== 0) {
    throw new Error('Token degerini Bearer ile baslayacak sekilde setVgenAccessTokenOnce icine yapistirin.');
  }
  PropertiesService.getScriptProperties().setProperty('VGEN_ACCESS_TOKEN', token);
  return logVgenPlanSetup();
}

function listVgenPlanProperties() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var keys = Object.keys(props).sort();
  var result = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.indexOf('VGEN_') !== 0 && key.indexOf('vgenPlanNotification:') !== 0) continue;
    result.push({
      key: key,
      value: maskVgenPropertyValue(key, props[key])
    });
  }
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function cleanupVgenPlanRunKeys() {
  return cleanupVgenPlanRunKeysOlderThan(14);
}

function cleanupVgenPlanRunKeysOlderThan(daysToKeep) {
  var keepDays = Math.max(1, parseInt(daysToKeep || 14, 10));
  var today = getVgenTodayDate();
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var deleted = [];

  for (var key in all) {
    if (!all.hasOwnProperty(key) || key.indexOf('vgenPlanNotification:') !== 0) continue;

    var dateText = key.substring('vgenPlanNotification:'.length);
    var date = parseVgenDateOnly(dateText);
    var ageDays = Math.floor((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays > keepDays) {
      props.deleteProperty(key);
      deleted.push(key);
    }
  }

  var result = { success: true, keepDays: keepDays, deletedCount: deleted.length, deletedKeys: deleted };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function maskVgenPropertyValue(key, value) {
  var text = String(value || '');
  if (/(PASSWORD|TOKEN|COOKIE|AUTH|SECRET|HEADER)/i.test(key)) return text ? '[gizli]' : '';
  return text.length > 120 ? text.substring(0, 120) + '...' : text;
}

function checkVgenPlanSetup() {
  var props = PropertiesService.getScriptProperties();
  var canAutoRefresh = canRefreshVgenAccessToken(props);
  var result = {
    success: true,
    source: props.getProperty('VGEN_PLAN_SOURCE') || VGEN_DEFAULT_PLAN_SOURCE,
    hasAccessToken: !!props.getProperty('VGEN_ACCESS_TOKEN'),
    accessTokenExpiresAt: props.getProperty('VGEN_ACCESS_TOKEN_EXPIRES_AT') || '',
    tenantId: props.getProperty('VGEN_TENANT_ID') || VGEN_DEFAULT_TENANT_ID,
    hasMailTo: !!props.getProperty('VGEN_MAIL_TO'),
    planMailSubject: props.getProperty('VGEN_PLAN_MAIL_SUBJECT') || 'Koruma Klor',
    planMailLookbackDays: props.getProperty('VGEN_PLAN_MAIL_LOOKBACK_DAYS') || '7',
    hasPlanMailQuery: !!props.getProperty('VGEN_PLAN_MAIL_QUERY'),
    planUrl: normalizeVgenPlanBaseUrl(props.getProperty('VGEN_PLAN_URL') || VGEN_DEFAULT_PLAN_URL),
    hasPlanHeadersJson: !!props.getProperty('VGEN_PLAN_HEADERS_JSON'),
    targetPlantKeywords: props.getProperty('VGEN_TARGET_PLANT_KEYWORDS') || 'denizli',
    hasLoginUrl: !!props.getProperty('VGEN_LOGIN_URL'),
    hasLoginPayloadJson: !!props.getProperty('VGEN_LOGIN_PAYLOAD_JSON'),
    hasLoginCredentials: !!(props.getProperty('VGEN_USERNAME') && props.getProperty('VGEN_PASSWORD')),
    loginTokenPath: props.getProperty('VGEN_LOGIN_TOKEN_PATH') || 'access_token,token,data.accessToken,data.token',
    authClientId: props.getProperty('VGEN_AUTH_CLIENT_ID') || '',
    hasAuthClientSecret: !!props.getProperty('VGEN_AUTH_CLIENT_SECRET'),
    authAudience: props.getProperty('VGEN_AUTH_AUDIENCE') || 'https://api.vgen.vtcenerji.com',
    authGrantType: props.getProperty('VGEN_AUTH_GRANT_TYPE') || 'password',
    authRealm: props.getProperty('VGEN_AUTH_REALM') || 'Username-Password-Authentication',
    canAutoRefreshToken: canAutoRefresh,
    notificationShift: normalizeVgenNotificationShift(props.getProperty('VGEN_NOTIFICATION_SHIFT')),
    notificationPageTarget: props.getProperty('VGEN_NOTIFICATION_PAGE_TARGET') || 'all',
    messageMotors: props.getProperty('VGEN_MESSAGE_MOTORS') || 'GM-1,GM-2,GM-3',
    note: canAutoRefresh
      ? 'Token suresi dolarsa otomatik login ile yenilenir; token loglarda gosterilmez.'
      : 'Otomatik token yenileme icin VGEN_LOGIN_URL ve login bilgileri Script Properties icinde tanimli olmali.'
  };

  return result;
}

function logVgenPlanSetup() {
  var result = checkVgenPlanSetup();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testVgenPlanFetchOnly() {
  var targetDate = getVgenTomorrowDate();
  try {
    var plan = getVgenPlanRowsForDate(targetDate);
    var rows = plan.rows;
    var summary = buildVgenMotorSummary(rows);
    var result = {
      success: true,
      source: plan.source,
      date: formatVgenDateTR(targetDate),
      rowCount: rows.length,
      motorNames: getUniqueVgenMotorNames(rows),
      nonZeroRows: getVgenNonZeroRows(rows, 5),
      firstRows: rows.slice(0, 3),
      summaryPreview: getVgenMessageSummary(summary),
      mail: plan.mail || '',
      workbookPreview: plan.workbookPreview || [],
      message: rows.length
        ? 'V-Gen plan verisi okundu ve satirlara ayrildi.'
        : 'Plan verisi okundu ama plan satiri bulunamadi.'
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    var errorResult = { success: false, date: formatVgenDateTR(targetDate), error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function testVgenAccessTokenRefresh() {
  try {
    var result = refreshVgenAccessToken('manuel test');
    var safeResult = {
      success: true,
      refreshed: result.refreshed,
      expiresAt: result.expiresAt || '',
      message: 'V-Gen token yenilendi. Token guvenlik nedeniyle loglanmadi.'
    };
    Logger.log(JSON.stringify(safeResult, null, 2));
    return safeResult;
  } catch (error) {
    var errorResult = { success: false, error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function testVgenPlanDebug() {
  var result = debugVgenPlanForDate(getVgenTomorrowDate());
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testVgenTodayPlanDebug() {
  var result = debugVgenPlanForDate(getVgenTodayDate());
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function debugVgenPlanForDate(targetDate) {
  try {
    var plan = getVgenPlanRowsForDate(targetDate);
    var rows = plan.rows;
    var summary = buildVgenMotorSummary(rows);
    return {
      success: true,
      source: plan.source,
      date: formatVgenDateTR(targetDate),
      rowCount: rows.length,
      nonZeroRows: getVgenNonZeroRows(rows, 30),
      summaryPreview: getVgenMessageSummary(summary),
      messageText: buildVgenPlanMessage(targetDate, summary, rows)
    };
  } catch (error) {
    return { success: false, date: formatVgenDateTR(targetDate), error: error.toString() };
  }
}

function runVgenPlanNotification(options) {
  var opts = options || {};
  var dryRun = opts.dryRun === true;
  var force = opts.force === true;
  var targetDate = opts.date ? parseVgenDateOnly(opts.date) : getVgenTomorrowDate();
  var targetDateIso = formatVgenIsoDate(targetDate);
  var targetDateTr = formatVgenDateTR(targetDate);
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    var props = PropertiesService.getScriptProperties();
    var runKey = 'vgenPlanNotification:' + targetDateIso;
    if (!force && props.getProperty(runKey)) {
      return {
        success: true,
        skipped: true,
        date: targetDateTr,
        message: 'Bu tarih icin V-Gen plan bildirimi daha once olusturulmus.'
      };
    }

    var plan = getVgenPlanRowsForDate(targetDate);
    var rows = plan.rows;
    var summary = buildVgenMotorSummary(rows);
    var message = buildVgenPlanMessage(targetDate, summary, rows);
    var subject = 'V-Gen ' + getVgenPlanDateLabel(targetDate) + ' Motor Plani - ' + targetDateTr;

    var mailResult = dryRun ? { success: true, skipped: true, message: 'Dry run: mail gonderilmedi' } : sendVgenPlanMail(subject, message);
    var announcementResult = dryRun
      ? { success: true, skipped: true, message: 'Dry run: bildirim olusturulmadi' }
      : upsertVgenPlanAnnouncement(targetDate, message);

    if (!dryRun && (mailResult.success || announcementResult.success)) {
      props.setProperty(runKey, new Date().toISOString());
      cleanupVgenPlanRunKeysOlderThan(14);
    }

    addVgenPlanSystemLog(targetDateTr, mailResult, announcementResult, rows.length, '');

    return {
      success: true,
      dryRun: dryRun,
      source: plan.source,
      date: targetDateTr,
      rowCount: rows.length,
      summary: summary,
      messageText: message,
      mail: mailResult,
      announcement: announcementResult
    };
  } catch (error) {
    addVgenPlanSystemLog(targetDateTr, { success: false, error: error.toString() }, null, 0, error.toString());
    return { success: false, date: targetDateTr, error: error.toString() };
  } finally {
    try {
      lock.releaseLock();
    } catch (ignore) {}
  }
}

function getVgenPlanRowsForDate(targetDate) {
  var source = String(PropertiesService.getScriptProperties().getProperty('VGEN_PLAN_SOURCE') || VGEN_DEFAULT_PLAN_SOURCE).toLowerCase();
  if (source === 'mail') return getVgenPlanRowsFromMail(targetDate);
  return getVgenPlanRowsFromApi(targetDate);
}

function getVgenPlanRowsFromApi(targetDate) {
  var payload = fetchVgenPlanApiForDate(targetDate);
  return {
    source: 'api',
    rows: extractVgenPlanRowsFromApiPayload(payload, targetDate)
  };
}

function fetchVgenPlanApiForDate(targetDate) {
  var props = PropertiesService.getScriptProperties();
  var tenantId = props.getProperty('VGEN_TENANT_ID') || VGEN_DEFAULT_TENANT_ID;
  var token = getVgenAccessTokenForPlan(props);
  var url = buildVgenPlanApiUrl(props, targetDate, tenantId);
  var result = fetchVgenPlanApiUrl(url, tenantId, token, props);

  if (!isVgenHttpSuccess(result.code) && shouldRefreshVgenTokenAfterApiError(result.code, result.text) && canRefreshVgenAccessToken(props)) {
    var refreshed = refreshVgenAccessToken('plan api yetki hatasi');
    result = fetchVgenPlanApiUrl(url, tenantId, refreshed.token, props);
  }

  if (!isVgenHttpSuccess(result.code)) {
    throw new Error(buildVgenPlanApiErrorMessage(result.code, result.text));
  }
  return parseVgenJsonResponse(result.text, 'V-Gen plan API cevabi JSON degil');
}

function buildVgenPlanApiUrl(props, targetDate, tenantId) {
  var baseUrl = normalizeVgenPlanBaseUrl(props.getProperty('VGEN_PLAN_URL') || VGEN_DEFAULT_PLAN_URL);
  return buildVgenUrlWithQuery(baseUrl, {
    tenantId: tenantId,
    deliveryDate: formatVgenIsoDate(targetDate),
    periodType: 'Hour',
    includeLockStatus: 'true',
    active: 'true',
    page: '1',
    results: '2147483647'
  });
}

function normalizeVgenPlanBaseUrl(value) {
  var url = String(value || VGEN_DEFAULT_PLAN_URL).trim();
  var queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.substring(0, queryIndex);
}

function fetchVgenPlanApiUrl(url, tenantId, token, props) {
  var headers = {
    Accept: 'application/json',
    Authorization: token.indexOf('Bearer ') === 0 ? token : 'Bearer ' + token,
    'X-Tenant-Id': tenantId
  };
  mergeVgenHeaders(headers, parseVgenJsonProperty(props.getProperty('VGEN_PLAN_HEADERS_JSON'), 'VGEN_PLAN_HEADERS_JSON'));

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true
  });

  return {
    code: response.getResponseCode(),
    text: response.getContentText()
  };
}

function getVgenAccessTokenForPlan(props) {
  var token = props.getProperty('VGEN_ACCESS_TOKEN') || '';
  if ((!token || shouldRefreshStoredVgenAccessToken(props)) && canRefreshVgenAccessToken(props)) {
    return refreshVgenAccessToken(!token ? 'token eksik' : 'token suresi yaklasti').token;
  }

  if (!token) {
    throw new Error('VGEN_ACCESS_TOKEN Script Properties icinde tanimli degil ve otomatik login ayarlari eksik.');
  }
  return token;
}

function shouldRefreshStoredVgenAccessToken(props) {
  if (String(props.getProperty('VGEN_FORCE_LOGIN_EACH_RUN') || '').toLowerCase() === 'true') return true;

  var expiresAt = props.getProperty('VGEN_ACCESS_TOKEN_EXPIRES_AT') || '';
  if (!expiresAt) return false;

  var expiresDate = new Date(expiresAt);
  if (isNaN(expiresDate.getTime())) return false;

  var refreshBeforeSeconds = Math.max(0, parseInt(props.getProperty('VGEN_REFRESH_BEFORE_SECONDS') || '300', 10));
  return new Date().getTime() >= (expiresDate.getTime() - (refreshBeforeSeconds * 1000));
}

function shouldRefreshVgenTokenAfterApiError(code, text) {
  var body = String(text || '').toLowerCase();
  return code === 401 || code === 403 ||
    (code === 400 && (
      body.indexOf('unauthorized') !== -1 ||
      body.indexOf('token') !== -1 ||
      body.indexOf('tenant') !== -1
    ));
}

function buildVgenPlanApiErrorMessage(code, text) {
  var body = String(text || '');
  var message = 'V-Gen plan API istegi basarisiz. HTTP ' + code + ': ' + body.substring(0, 500);
  if (/unauthorized_tenant|not authorized to access this tenant/i.test(body)) {
    message += ' | Tenant/token yetkisi reddedildi. VGEN_TENANT_ID dogru olmali; otomatik login ayarlandiysa yeni tokenla tekrar denendi.';
  }
  return message;
}

function isVgenHttpSuccess(code) {
  return code >= 200 && code < 300;
}

function canRefreshVgenAccessToken(props) {
  props = props || PropertiesService.getScriptProperties();
  if (!props.getProperty('VGEN_LOGIN_URL')) return false;
  if (props.getProperty('VGEN_LOGIN_PAYLOAD_JSON')) return true;
  return !!(props.getProperty('VGEN_USERNAME') && props.getProperty('VGEN_PASSWORD'));
}

function refreshVgenAccessToken(reason) {
  var props = PropertiesService.getScriptProperties();
  if (!canRefreshVgenAccessToken(props)) {
    throw new Error('V-Gen otomatik token yenileme ayarlari eksik. VGEN_LOGIN_URL ve VGEN_LOGIN_PAYLOAD_JSON veya VGEN_USERNAME/VGEN_PASSWORD tanimlanmali.');
  }

  var tenantId = props.getProperty('VGEN_TENANT_ID') || VGEN_DEFAULT_TENANT_ID;
  var loginUrl = props.getProperty('VGEN_LOGIN_URL');
  var method = String(props.getProperty('VGEN_LOGIN_METHOD') || 'post').toLowerCase();
  var contentType = props.getProperty('VGEN_LOGIN_CONTENT_TYPE') || 'application/json';
  var headers = parseVgenJsonProperty(props.getProperty('VGEN_LOGIN_HEADERS_JSON'), 'VGEN_LOGIN_HEADERS_JSON');
  var payload = buildVgenLoginPayload(props, tenantId, contentType);

  var options = {
    method: method,
    headers: headers,
    payload: payload,
    muteHttpExceptions: true
  };
  if (contentType) options.contentType = contentType;

  var response = UrlFetchApp.fetch(loginUrl, options);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (!isVgenHttpSuccess(code)) {
    throw new Error('V-Gen login/token yenileme basarisiz. HTTP ' + code + ': ' + String(text || '').substring(0, 500));
  }

  var parsed = parseVgenJsonResponse(text, 'V-Gen login cevabi JSON degil');
  var token = findVgenTokenInLoginResponse(parsed, props);
  if (!token) {
    throw new Error('V-Gen login cevabinda token bulunamadi. VGEN_LOGIN_TOKEN_PATH ayarini kontrol edin.');
  }

  props.setProperty('VGEN_ACCESS_TOKEN', token);
  props.setProperty('VGEN_ACCESS_TOKEN_UPDATED_AT', new Date().toISOString());

  var expiresAt = calculateVgenTokenExpiresAt(parsed, props);
  if (expiresAt) {
    props.setProperty('VGEN_ACCESS_TOKEN_EXPIRES_AT', expiresAt);
  } else {
    props.deleteProperty('VGEN_ACCESS_TOKEN_EXPIRES_AT');
  }

  addVgenAuthRefreshLog(reason || 'token yenileme', !!expiresAt ? expiresAt : '');
  return {
    refreshed: true,
    token: token,
    expiresAt: expiresAt
  };
}

function buildVgenLoginPayload(props, tenantId, contentType) {
  var rawPayload = props.getProperty('VGEN_LOGIN_PAYLOAD_JSON');
  var username = props.getProperty('VGEN_USERNAME') || '';
  var password = props.getProperty('VGEN_PASSWORD') || '';
  var clientId = props.getProperty('VGEN_AUTH_CLIENT_ID') || '';
  var clientSecret = props.getProperty('VGEN_AUTH_CLIENT_SECRET') || '';
  var audience = props.getProperty('VGEN_AUTH_AUDIENCE') || 'https://api.vgen.vtcenerji.com';
  var scope = props.getProperty('VGEN_AUTH_SCOPE') || 'openid email offline_access';
  var grantType = props.getProperty('VGEN_AUTH_GRANT_TYPE') || 'password';
  var realm = props.getProperty('VGEN_AUTH_REALM') || 'Username-Password-Authentication';
  var payloadObject;

  if (rawPayload) {
    payloadObject = parseVgenJsonProperty(replaceVgenTemplate(rawPayload, {
      username: username,
      password: password,
      tenantId: tenantId,
      clientId: clientId,
      clientSecret: clientSecret,
      audience: audience,
      scope: scope,
      grantType: grantType,
      realm: realm
    }), 'VGEN_LOGIN_PAYLOAD_JSON');
  } else {
    payloadObject = {
      grant_type: grantType,
      username: username,
      password: password,
      audience: audience,
      scope: scope,
      client_id: clientId,
      realm: realm
    };
    if (clientSecret) payloadObject.client_secret = clientSecret;
  }

  if (String(contentType || '').toLowerCase().indexOf('x-www-form-urlencoded') !== -1) {
    return encodeVgenFormPayload(payloadObject);
  }

  return JSON.stringify(payloadObject);
}

function findVgenTokenInLoginResponse(parsed, props) {
  var configured = props.getProperty('VGEN_LOGIN_TOKEN_PATH') || 'access_token,token,data.accessToken,data.token';
  var paths = splitVgenCsv(configured);
  var token = findVgenFirstValueAtPaths(parsed, paths);
  return token ? String(token) : '';
}

function calculateVgenTokenExpiresAt(parsed, props) {
  var explicitExpiresAt = findVgenFirstValueAtPaths(parsed, splitVgenCsv(props.getProperty('VGEN_LOGIN_EXPIRES_AT_PATH') || 'expires_at,expiresAt,data.expires_at,data.expiresAt'));
  if (explicitExpiresAt) {
    var parsedDate = new Date(explicitExpiresAt);
    if (!isNaN(parsedDate.getTime())) return parsedDate.toISOString();
  }

  var expiresIn = findVgenFirstValueAtPaths(parsed, splitVgenCsv(props.getProperty('VGEN_LOGIN_EXPIRES_IN_PATH') || 'expires_in,expiresIn,data.expires_in,data.expiresIn'));
  var seconds = parseInt(expiresIn || '', 10);
  if (!isNaN(seconds) && seconds > 0) {
    return new Date(new Date().getTime() + (seconds * 1000)).toISOString();
  }

  return '';
}

function addVgenAuthRefreshLog(reason, expiresAt) {
  try {
    addSystemLog({
      tarih: formatVgenDateTR(new Date()),
      saat: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'),
      modul: VGEN_PLAN_MODULE_NAME,
      eksikKayit: 'V-Gen token yenileme',
      otomatikKayitSonucu: 'Basarili',
      mailSonucu: 'Gonderilmedi',
      hataMesaji: '',
      detay: 'Sebep: ' + reason + (expiresAt ? ' | Bitis: ' + expiresAt : '')
    });
  } catch (ignore) {}
}

function parseVgenJsonResponse(text, errorPrefix) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(errorPrefix + ': ' + String(text || '').substring(0, 500));
  }
}

function parseVgenJsonProperty(value, propertyName) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(propertyName + ' JSON olarak okunamadi: ' + error.toString());
  }
}

function mergeVgenHeaders(target, extra) {
  extra = extra || {};
  for (var key in extra) {
    if (extra.hasOwnProperty(key) && extra[key] !== undefined && extra[key] !== null) {
      target[key] = String(extra[key]);
    }
  }
  return target;
}

function findVgenFirstValueAtPaths(source, paths) {
  for (var i = 0; i < paths.length; i++) {
    var value = getVgenValueAtPath(source, paths[i]);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function getVgenValueAtPath(source, path) {
  var current = source;
  var parts = String(path || '').split('.');
  for (var i = 0; i < parts.length; i++) {
    var key = parts[i];
    if (!key) continue;
    if (current === undefined || current === null || !Object.prototype.hasOwnProperty.call(current, key)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function buildVgenUrlWithQuery(baseUrl, params) {
  var parts = [];
  for (var key in params) {
    if (params.hasOwnProperty(key) && params[key] !== undefined && params[key] !== null && params[key] !== '') {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    }
  }

  var separator = baseUrl.indexOf('?') === -1 ? '?' : '&';
  return baseUrl + separator + parts.join('&');
}

function replaceVgenTemplate(text, values) {
  var result = String(text || '');
  for (var key in values) {
    if (values.hasOwnProperty(key)) {
      result = result.split('${' + key + '}').join(String(values[key] || ''));
    }
  }
  return result;
}

function encodeVgenFormPayload(payloadObject) {
  var parts = [];
  for (var key in payloadObject) {
    if (payloadObject.hasOwnProperty(key) && payloadObject[key] !== undefined && payloadObject[key] !== null) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(payloadObject[key]));
    }
  }
  return parts.join('&');
}

function splitVgenCsv(value) {
  var rawParts = String(value || '').split(',');
  var parts = [];
  for (var i = 0; i < rawParts.length; i++) {
    var part = String(rawParts[i] || '').trim();
    if (part) parts.push(part);
  }
  return parts;
}

function extractVgenPlanRowsFromApiPayload(payload, targetDate) {
  var items = Array.isArray(payload) ? payload : (payload && payload.items) || [];
  var rows = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var asset = item.asset || {};
    var assetName = asset.name || item.assetName || '';
    if (!isVgenTargetProductionAsset(assetName)) continue;

    var motor = normalizeVgenMotorName(assetName);
    if (getVgenMessageMotors().indexOf(motor) === -1) continue;

    var details = item.assetPlanDetails || item.details || [];
    for (var d = 0; d < details.length; d++) {
      var detail = details[d] || {};
      var amount = parseVgenNumber(detail.amount);
      var startMinutes = findVgenLineStartMinutes(detail.period);
      if (startMinutes === null) continue;
      rows.push(buildMailVgenPlanRow(targetDate, motor, 'V-Gen API', startMinutes, amount, 'api-amount'));
    }
  }
  rows.sort(function(a, b) {
    return String(a.motor).localeCompare(String(b.motor)) || a.startMinutes - b.startMinutes;
  });
  return dedupeVgenPlanRows(rows);
}

function isVgenTargetProductionAsset(assetName) {
  var text = normalizeVgenSearchText(assetName);
  if (text.indexOf('uretim') === -1 || text.indexOf('tuketim') !== -1) return false;

  var keywords = getVgenTargetPlantKeywords();
  if (!keywords.length) return true;

  for (var i = 0; i < keywords.length; i++) {
    if (text.indexOf(normalizeVgenSearchText(keywords[i])) !== -1) return true;
  }
  return false;
}

function getVgenTargetPlantKeywords() {
  var configured = PropertiesService.getScriptProperties().getProperty('VGEN_TARGET_PLANT_KEYWORDS') || 'denizli';
  return splitVgenCsv(configured);
}

function testVgenPlanMailFetchOnly() {
  var targetDate = getVgenTomorrowDate();
  try {
    var plan = getVgenPlanRowsFromMail(targetDate);
    var summary = buildVgenMotorSummary(plan.rows);
    var result = {
      success: true,
      source: plan.source,
      date: formatVgenDateTR(targetDate),
      rowCount: plan.rows.length,
      motorNames: getUniqueVgenMotorNames(plan.rows),
      nonZeroRows: getVgenNonZeroRows(plan.rows, 10),
      mail: plan.mail,
      workbookPreview: plan.workbookPreview,
      summaryPreview: getVgenMessageSummary(summary),
      messageText: buildVgenPlanMessage(targetDate, summary, plan.rows)
    };
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    var errorResult = { success: false, date: formatVgenDateTR(targetDate), error: error.toString() };
    Logger.log(JSON.stringify(errorResult, null, 2));
    return errorResult;
  }
}

function getVgenPlanRowsFromMail(targetDate) {
  var attachmentResult = findVgenPlanMailAttachment(targetDate);
  var workbook = readVgenPlanWorkbookFromAttachment(attachmentResult.attachment);
  var rows = extractVgenPlanRowsFromWorkbook(workbook, targetDate);
  return {
    source: 'mail',
    rows: rows,
    mail: {
      subject: attachmentResult.message.getSubject(),
      from: attachmentResult.message.getFrom(),
      date: formatDateTimeTR(attachmentResult.message.getDate()),
      attachmentName: attachmentResult.attachment.getName()
    },
    workbookPreview: buildVgenWorkbookPreview(workbook)
  };
}

function findVgenPlanMailAttachment(targetDate) {
  var props = PropertiesService.getScriptProperties();
  var query = props.getProperty('VGEN_PLAN_MAIL_QUERY') || buildDefaultVgenPlanMailQuery(targetDate);
  var threads = GmailApp.search(query, 0, 20);
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = messages.length - 1; m >= 0; m--) {
      var attachments = messages[m].getAttachments({ includeInlineImages: false, includeAttachments: true });
      for (var a = 0; a < attachments.length; a++) {
        if (isVgenPlanAttachment(attachments[a])) {
          return { message: messages[m], attachment: attachments[a], query: query };
        }
      }
    }
  }
  throw new Error('V-Gen plan mail eki bulunamadi. Gmail sorgusu: ' + query);
}

function buildDefaultVgenPlanMailQuery(targetDate) {
  var props = PropertiesService.getScriptProperties();
  var subject = props.getProperty('VGEN_PLAN_MAIL_SUBJECT') || 'Koruma Klor';
  var lookbackDays = Math.max(1, parseInt(props.getProperty('VGEN_PLAN_MAIL_LOOKBACK_DAYS') || '7', 10));
  return 'subject:"' + subject + '" newer_than:' + lookbackDays + 'd has:attachment';
}

function isVgenPlanAttachment(attachment) {
  var name = String(attachment.getName() || '').toLowerCase();
  var type = String(attachment.getContentType() || '').toLowerCase();
  return /\.(xlsx|xls|csv)$/.test(name) ||
    type.indexOf('spreadsheet') !== -1 ||
    type.indexOf('excel') !== -1 ||
    type.indexOf('csv') !== -1;
}

function readVgenPlanWorkbookFromAttachment(attachment) {
  var name = String(attachment.getName() || '');
  if (/\.csv$/i.test(name) || String(attachment.getContentType() || '').indexOf('csv') !== -1) {
    return [{
      name: name || 'CSV',
      values: Utilities.parseCsv(attachment.getDataAsString())
    }];
  }

  var convertedFile = null;
  try {
    if (typeof Drive === 'undefined' || !Drive.Files || (!Drive.Files.insert && !Drive.Files.create)) {
      throw new Error('Drive API advanced service acik degil. Apps Script > Services > Drive API ekleyin.');
    }

    var resourceV2 = {
      title: 'vgen-plan-temp-' + new Date().getTime() + '-' + name,
      mimeType: MimeType.GOOGLE_SHEETS
    };
    var resourceV3 = {
      name: resourceV2.title,
      mimeType: MimeType.GOOGLE_SHEETS
    };
    convertedFile = Drive.Files.insert
      ? Drive.Files.insert(resourceV2, attachment.copyBlob(), { convert: true })
      : Drive.Files.create(resourceV3, attachment.copyBlob(), { fields: 'id' });
    var tempSpreadsheet = SpreadsheetApp.openById(convertedFile.id);
    return tempSpreadsheet.getSheets().map(function(sheet) {
      var range = sheet.getDataRange();
      return {
        name: sheet.getName(),
        values: range.getDisplayValues()
      };
    });
  } finally {
    if (convertedFile && convertedFile.id) {
      try {
        DriveApp.getFileById(convertedFile.id).setTrashed(true);
      } catch (cleanupError) {}
    }
  }
}

function extractVgenPlanRowsFromWorkbook(workbook, targetDate) {
  var rows = [];
  for (var s = 0; s < workbook.length; s++) {
    rows = rows.concat(extractVgenPlanRowsFromSheetValues(workbook[s].values, workbook[s].name, targetDate));
  }
  rows.sort(function(a, b) {
    return String(a.motor).localeCompare(String(b.motor)) || a.startMinutes - b.startMinutes;
  });
  return rows;
}

function extractVgenPlanRowsFromSheetValues(values, sheetName, targetDate) {
  var rows = [];
  var headerInfo = findVgenMotorHeaderInfo(values);
  if (headerInfo.motorColumns.length) {
    rows = rows.concat(extractVgenRowsFromMotorColumns(values, sheetName, targetDate, headerInfo));
  }
  rows = rows.concat(extractVgenRowsFromLineText(values, sheetName, targetDate));
  return dedupeVgenPlanRows(rows);
}

function findVgenMotorHeaderInfo(values) {
  var info = { rowIndex: -1, motorColumns: [] };
  var limit = Math.min(values.length, 40);
  for (var r = 0; r < limit; r++) {
    var columns = [];
    for (var c = 0; c < values[r].length; c++) {
      var motor = normalizeVgenMotorName(values[r][c], {});
      if (getVgenMessageMotors().indexOf(motor) !== -1) {
        columns.push({ index: c, motor: motor });
      }
    }
    if (columns.length > info.motorColumns.length) {
      info = { rowIndex: r, motorColumns: columns };
    }
  }
  return info;
}

function extractVgenRowsFromMotorColumns(values, sheetName, targetDate, headerInfo) {
  var result = [];
  for (var r = headerInfo.rowIndex + 1; r < values.length; r++) {
    var row = values[r] || [];
    var startMinutes = findVgenRowStartMinutes(row);
    if (startMinutes === null) continue;

    for (var m = 0; m < headerInfo.motorColumns.length; m++) {
      var column = headerInfo.motorColumns[m];
      var power = parseVgenNumber(row[column.index]);
      if (power <= 0) continue;
      result.push(buildMailVgenPlanRow(targetDate, column.motor, sheetName, startMinutes, power, 'motor-column'));
    }
  }
  return result;
}

function extractVgenRowsFromLineText(values, sheetName, targetDate) {
  var result = [];
  var motors = getVgenMessageMotors();
  for (var r = 0; r < values.length; r++) {
    var rowText = (values[r] || []).join(' ');
    var startMinutes = findVgenLineStartMinutes(rowText);
    if (startMinutes === null) continue;

    for (var m = 0; m < motors.length; m++) {
      if (normalizeVgenSearchText(rowText).indexOf(normalizeVgenSearchText(motors[m])) === -1) continue;
      var power = findVgenLinePower(rowText);
      if (power <= 0) power = 1;
      result.push(buildMailVgenPlanRow(targetDate, motors[m], sheetName, startMinutes, power, 'line-text'));
    }
  }
  return result;
}

function buildMailVgenPlanRow(targetDate, motor, sheetName, startMinutes, power, sourceKey) {
  var endMinutes = Math.min(startMinutes + 60, 24 * 60);
  return {
    dateIso: formatVgenIsoDate(targetDate),
    motor: motor,
    rawMotor: motor,
    powerKey: sourceKey,
    endKey: '',
    startMinutes: startMinutes,
    endMinutes: endMinutes,
    start: minutesToVgenTime(startMinutes),
    end: minutesToVgenTime(endMinutes),
    powerMw: power,
    sheetName: sheetName
  };
}

function findVgenRowStartMinutes(row) {
  for (var c = 0; c < Math.min(row.length, 8); c++) {
    var minutes = findVgenLineStartMinutes(row[c]);
    if (minutes !== null) return minutes;
  }
  return null;
}

function findVgenLineStartMinutes(value) {
  var text = String(value || '');
  var rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/);
  if (rangeMatch) return parseInt(rangeMatch[1], 10) * 60 + parseInt(rangeMatch[2], 10);

  var timeMatch = text.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (timeMatch) return parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);

  var hourMatch = text.match(/\b(?:saat|hour|period|periyot)\D*(\d{1,2})\b/i);
  if (hourMatch) {
    var hour = parseInt(hourMatch[1], 10);
    if (hour >= 0 && hour <= 24) return hour === 24 ? 23 * 60 : hour * 60;
  }
  return null;
}

function findVgenLinePower(value) {
  var text = String(value || '').replace(/\s+/g, ' ');
  var mwMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:mw|mwh|kw|kwh)\b/i);
  if (mwMatch) return parseVgenNumber(mwMatch[1]);
  return 0;
}

function dedupeVgenPlanRows(rows) {
  var seen = {};
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    var key = rows[i].dateIso + '|' + rows[i].motor + '|' + rows[i].startMinutes + '|' + rows[i].endMinutes;
    if (seen[key]) continue;
    seen[key] = true;
    result.push(rows[i]);
  }
  return result;
}

function buildVgenWorkbookPreview(workbook) {
  return (workbook || []).map(function(sheet) {
    return {
      sheetName: sheet.name,
      rowCount: sheet.values.length,
      firstRows: sheet.values.slice(0, 8).map(function(row) {
        return row.slice(0, 10);
      })
    };
  });
}

function buildVgenMotorSummary(rows) {
  var byMotor = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!byMotor[row.motor]) byMotor[row.motor] = [];
    if (row.powerMw > 0) {
      byMotor[row.motor].push({
        startMinutes: row.startMinutes,
        endMinutes: row.endMinutes,
        powerMw: row.powerMw
      });
    }
  }

  var motors = Object.keys(byMotor).sort();
  var summary = [];
  for (var m = 0; m < motors.length; m++) {
    var motor = motors[m];
    var intervals = mergeVgenIntervals(byMotor[motor]);
    summary.push({
      motor: motor,
      intervals: intervals,
      totalHours: roundVgenNumber(sumVgenIntervalHours(intervals), 2),
      maxMw: roundVgenNumber(maxVgenIntervalMw(intervals), 2)
    });
  }

  return summary;
}

function getUniqueVgenMotorNames(rows) {
  var seen = {};
  var names = [];
  for (var i = 0; i < rows.length; i++) {
    var motor = rows[i].motor || 'Santral';
    if (!seen[motor]) {
      seen[motor] = true;
      names.push(motor);
    }
  }
  return names.sort();
}

function getVgenNonZeroRows(rows, limit) {
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].powerMw > 0) {
      result.push(rows[i]);
      if (result.length >= limit) break;
    }
  }
  return result;
}

function getVgenGeneratorSummary(summary) {
  return summary.filter(function(item) {
    return isVgenGeneratorMotorName(item.motor);
  }).sort(function(a, b) {
    return compareVgenMotorNames(a.motor, b.motor);
  });
}

function getVgenMessageSummary(summary) {
  var messageMotors = getVgenMessageMotors();
  var byMotor = {};
  for (var i = 0; i < summary.length; i++) {
    byMotor[summary[i].motor] = summary[i];
  }

  var result = [];
  for (var m = 0; m < messageMotors.length; m++) {
    if (byMotor[messageMotors[m]]) result.push(byMotor[messageMotors[m]]);
  }
  return result;
}

function getVgenMessageMotors() {
  var configured = PropertiesService.getScriptProperties().getProperty('VGEN_MESSAGE_MOTORS') || 'GM-1,GM-2,GM-3';
  var parts = configured.split(',');
  var motors = [];
  for (var i = 0; i < parts.length; i++) {
    var motor = String(parts[i] || '').trim();
    if (motor) motors.push(normalizeVgenMotorName(motor, {}));
  }
  return motors.length ? motors : ['GM-1', 'GM-2', 'GM-3'];
}

function isVgenGeneratorMotorName(value) {
  return /^GM-\d+$/i.test(String(value || '').trim());
}

function compareVgenMotorNames(a, b) {
  var aMatch = String(a || '').match(/^GM-(\d+)$/i);
  var bMatch = String(b || '').match(/^GM-(\d+)$/i);
  if (aMatch && bMatch) return parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
  return String(a || '').localeCompare(String(b || ''));
}

function buildVgenPlanMessage(targetDate, summary, rows) {
  var dateText = formatVgenDateTR(targetDate);
  var lines = [];
  lines.push(dateText + ' V-Gen ' + getVgenPlanDateLabel(targetDate).toLowerCase() + ' motor plani');
  lines.push('');

  if (!rows.length) {
    lines.push('Plan verisi cekildi ancak motor/saat satiri okunamadi. V-Gen API cevabi parse ayari gerektiriyor.');
    return lines.join('\n');
  }

  var expectedMotors = getVgenMessageMotors();
  var summaryMap = {};
  for (var i = 0; i < summary.length; i++) {
    summaryMap[summary[i].motor] = summary[i];
  }

  for (var e = 0; e < expectedMotors.length; e++) {
    var motor = expectedMotors[e];
    var item = summaryMap[motor];
    if (!item || !item.intervals.length) {
      lines.push(motor + ': Planlanan calisma yok.');
      continue;
    }
    lines.push(motor + ': ' + formatVgenIntervalActions(item.intervals) + ' Toplam ' + item.totalHours + ' saat.');
  }

  lines.push('');
  lines.push('Kaynak: V-Plant Manager / V-Gen');
  return lines.join('\n');
}

function sendVgenPlanMail(subject, body) {
  var props = PropertiesService.getScriptProperties();
  var to = props.getProperty('VGEN_MAIL_TO') || '';
  if (!to) {
    return { success: true, skipped: true, message: 'VGEN_MAIL_TO tanimli degil; mail gonderilmedi.' };
  }

  try {
    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: body
    });
    return { success: true, to: to, message: 'Mail gonderildi' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function upsertVgenPlanAnnouncement(targetDate, message) {
  var dateIso = formatVgenIsoDate(targetDate);
  var dateText = formatVgenDateTR(targetDate);
  var props = PropertiesService.getScriptProperties();
  var id = 'auto-vgen-plan-' + dateIso;
  var shift = normalizeVgenNotificationShift(props.getProperty('VGEN_NOTIFICATION_SHIFT'));
  var pageTarget = props.getProperty('VGEN_NOTIFICATION_PAGE_TARGET') || 'all';

  try {
    var record = {
      id: id,
      startDate: formatVgenDateTR(new Date()),
      endDate: dateText,
      shift: shift,
      title: message,
      category: 'plan',
      priority: 'medium',
      target: 'all',
      active: 'TRUE',
      createdBy: 'V-Gen Otomatik Plan',
      createdAt: formatDateTimeTR(new Date()),
      pageTarget: pageTarget,
      completed: 'FALSE'
    };

    var existing = getAnnouncementById(id);
    if (existing) {
      return updateAnnouncement(record);
    }

    return addAnnouncement(record);
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function normalizeVgenNotificationShift(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  var normalized = text.toLowerCase().replace('ü', 'u').replace('/', '-');
  if (normalized === 'all' || normalized === 'tum' || normalized === 'tumu' || normalized === 'tum-gun') {
    return '';
  }
  return text.replace('/', '-');
}

function addVgenPlanSystemLog(dateText, mailResult, announcementResult, rowCount, error) {
  try {
    addSystemLog({
      tarih: dateText,
      saat: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'),
      modul: VGEN_PLAN_MODULE_NAME,
      eksikKayit: 'Ertesi gun plan bildirimi',
      otomatikKayitSonucu: announcementResult && announcementResult.success ? 'Bildirim olusturuldu' : 'Bildirim yok',
      mailSonucu: mailResult && mailResult.skipped ? 'Gonderilmedi' : (mailResult && mailResult.success ? 'Basarili' : 'Basarisiz'),
      hataMesaji: error || (mailResult && mailResult.error) || (announcementResult && announcementResult.error) || '',
      detay: 'Okunan plan satiri: ' + rowCount
    });
  } catch (ignore) {}
}

function normalizeVgenMotorName(value, map) {
  map = map || {};
  var text = String(value || '').trim();
  if (map[text]) return map[text];
  var upper = text.toUpperCase();
  if (map[upper]) return map[upper];

  var gmMatch = upper.match(/GM\s*-?\s*(\d+)/);
  if (gmMatch) return 'GM-' + gmMatch[1];

  var numberMatch = upper.match(/(?:UNIT|UNITE|MOTOR|GENERATOR|JEN|GEN)\D*(\d+)/);
  if (numberMatch) return 'GM-' + numberMatch[1];

  return text || 'Santral';
}

function normalizeVgenSearchTextLegacy(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c');
}

function normalizeVgenSearchText(value) {
  var text = String(value || '').toLowerCase().replace(/\u0131/g, 'i');
  try {
    text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (ignore) {}
  return text;
}

function mergeVgenIntervals(intervals) {
  if (!intervals || !intervals.length) return [];
  intervals.sort(function(a, b) {
    return a.startMinutes - b.startMinutes;
  });

  var merged = [];
  for (var i = 0; i < intervals.length; i++) {
    var item = intervals[i];
    if (!merged.length || item.startMinutes > merged[merged.length - 1].endMinutes) {
      merged.push({
        startMinutes: item.startMinutes,
        endMinutes: item.endMinutes,
        maxMw: item.powerMw
      });
      continue;
    }

    var last = merged[merged.length - 1];
    last.endMinutes = Math.max(last.endMinutes, item.endMinutes);
    last.maxMw = Math.max(last.maxMw, item.powerMw);
  }
  return merged;
}

function formatVgenIntervals(intervals) {
  var parts = [];
  for (var i = 0; i < intervals.length; i++) {
    parts.push(formatVgenRunInterval(intervals[i]));
  }
  return parts.join(', ');
}

function formatVgenRunInterval(interval) {
  var start = minutesToVgenTime(interval.startMinutes);
  var end = minutesToVgenTime(interval.endMinutes);
  return start + '-' + end;
}

function formatVgenIntervalActions(intervals) {
  var parts = [];
  for (var i = 0; i < intervals.length; i++) {
    var start = minutesToVgenTime(intervals[i].startMinutes);
    var end = minutesToVgenTime(intervals[i].endMinutes);
    parts.push(start + ' de devreye girecek, ' + end + ' de devreden cikacaktir.');
  }
  return parts.join(' ');
}

function sumVgenIntervalHours(intervals) {
  var total = 0;
  for (var i = 0; i < intervals.length; i++) {
    total += Math.max(0, intervals[i].endMinutes - intervals[i].startMinutes) / 60;
  }
  return total;
}

function maxVgenIntervalMw(intervals) {
  var max = 0;
  for (var i = 0; i < intervals.length; i++) {
    max = Math.max(max, intervals[i].maxMw || 0);
  }
  return max;
}

function parseVgenNumber(value) {
  if (typeof value === 'number') return value;
  var text = String(value || '').trim();
  if (text.indexOf(',') !== -1) text = text.replace(/\./g, '').replace(',', '.');
  var parsed = parseFloat(text);
  return isNaN(parsed) ? 0 : parsed;
}

function roundVgenNumber(value, digits) {
  var factor = Math.pow(10, digits || 2);
  return Math.round(parseVgenNumber(value) * factor) / factor;
}

function minutesToVgenTime(minutes) {
  var safe = Math.max(0, Math.min(24 * 60, minutes));
  if (safe === 24 * 60) return '24:00';
  var hour = Math.floor(safe / 60);
  var minute = safe % 60;
  return padVgen2(hour) + ':' + padVgen2(minute);
}

function getVgenTomorrowDate() {
  var date = new Date();
  date.setDate(date.getDate() + 1);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getVgenTodayDate() {
  var date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getVgenPlanDateLabel(date) {
  var today = getVgenTodayDate();
  var tomorrow = getVgenTomorrowDate();
  var iso = formatVgenIsoDate(date);
  if (iso === formatVgenIsoDate(today)) return 'Bugun';
  if (iso === formatVgenIsoDate(tomorrow)) return 'Ertesi Gun';
  return 'Gunluk';
}

function parseVgenDateOnly(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  var text = String(value || '').trim();
  var parts = text.indexOf('-') !== -1 ? text.split('-') : text.split('.').reverse();
  if (parts.length !== 3) throw new Error('Tarih formati okunamadi: ' + text);
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function formatVgenIsoDate(date) {
  return date.getFullYear() + '-' + padVgen2(date.getMonth() + 1) + '-' + padVgen2(date.getDate());
}

function formatVgenDateTR(date) {
  return padVgen2(date.getDate()) + '.' + padVgen2(date.getMonth() + 1) + '.' + date.getFullYear();
}

function padVgen2(value) {
  return String(value).padStart(2, '0');
}
