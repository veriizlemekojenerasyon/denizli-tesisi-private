var ELZ_API_BASE = 'http://134.122.102.155:3000';
var ELZ_DASHBOARD_FOREIGN_KEY = 'mainpage';
var ELZ_TOKEN_SAFETY_MS = 60 * 1000;

var ELZ_WIDGET_ENDPOINTS = [
  { name: 'textTools', path: '/api/textTools', arrayKey: 'textTools' },
  { name: 'readOnlyInputs', path: '/api/readOnlyInputs', arrayKey: 'readOnlyInputs' },
  { name: 'gauges', path: '/api/gauges', arrayKey: 'gauges' },
  { name: 'linearGauges', path: '/api/linearGauges', arrayKey: 'linearGauges' },
  { name: 'messageBoxes', path: '/api/messageBoxes', arrayKey: 'messageBoxes' },
  { name: 'machineCounters', path: '/api/machineCounters', arrayKey: 'machineCounters' },
  { name: 'mathFormulaTools', path: '/api/mathFormulaTools', arrayKey: 'mathFormulaTools' }
];

var ELZ_TARGETS = [
  {
    key: 'elz116117',
    title: 'ELZ 116-117',
    aliases: ['elz 116', 'elz 116 117', 'elz116117', 'elz116 117', 'elektroliz116', '116 117', '116-117']
  },
  {
    key: 'elz119121',
    title: 'ELZ 119/121',
    aliases: ['elz 119', 'elz 119 121', 'elz119121', 'elz119 121', 'elektroliz119', '119 121', '119/121']
  }
];

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action ? e.parameter.action : 'getElzMainpageValues';

    if (action === 'debugElzWidgets') {
      return jsonOutput_(debugElzWidgets_());
    }

    if (action === 'refreshToken') {
      clearElzCachedToken_();
      getElzToken_();
      return jsonOutput_({
        success: true,
        refreshed: true,
        expiresAt: new Date(getElzTokenExpiresAt_()).toISOString(),
        message: 'ELZ token yenilendi. Token guvenlik nedeniyle loglanmadi.'
      });
    }

    return jsonOutput_(getElzMainpageValues());
  } catch (error) {
    return jsonOutput_({
      success: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function getElzMainpageValues() {
  var widgets = loadElzMainpageWidgets_();
  var values = {};

  ELZ_TARGETS.forEach(function (target) {
    values[target.key] = selectTargetValue_(target, widgets);
  });

  return {
    success: true,
    source: ELZ_API_BASE + ' dashboard=' + ELZ_DASHBOARD_FOREIGN_KEY,
    dashboardForeignKey: ELZ_DASHBOARD_FOREIGN_KEY,
    refreshedAt: new Date().toISOString(),
    widgetCount: widgets.length,
    data: values
  };
}

function debugElzWidgets_() {
  var widgets = loadElzMainpageWidgets_();
  return {
    success: true,
    source: ELZ_API_BASE + ' dashboard=' + ELZ_DASHBOARD_FOREIGN_KEY,
    refreshedAt: new Date().toISOString(),
    widgetCount: widgets.length,
    targets: ELZ_TARGETS.map(function (target) {
      return {
        key: target.key,
        title: target.title,
        selected: selectTargetValue_(target, widgets)
      };
    }),
    widgets: widgets.map(function (widget) {
      return {
        source: widget.source,
        id: widget.id,
        label: widget.label,
        value: widget.value,
        unit: widget.unit,
        x: widget.x,
        y: widget.y,
        lastUpdateTime: widget.lastUpdateTime
      };
    })
  };
}

function loadElzMainpageWidgets_() {
  var token = getElzToken_();
  var widgets = [];
  var errors = [];

  ELZ_WIDGET_ENDPOINTS.forEach(function (endpoint) {
    try {
      var payload = fetchElzJson_(endpoint.path, {
        dashboardForeignKey: ELZ_DASHBOARD_FOREIGN_KEY
      }, token, true);
      var list = payload[endpoint.arrayKey] || payload[endpoint.name] || [];
      if (!Array.isArray(list)) list = [];

      list.forEach(function (item) {
        widgets.push(normalizeWidget_(item, endpoint.name));
      });
    } catch (error) {
      errors.push(endpoint.name + ': ' + String(error && error.message ? error.message : error));
    }
  });

  if (!widgets.length && errors.length) {
    throw new Error('ELZ widget verisi alinamadi. ' + errors.join(' | '));
  }

  enrichWidgetsWithLiveData_(widgets, token);
  return widgets;
}

function normalizeWidget_(item, source) {
  var value = firstFilled_([
    item.currentState,
    item.currentData,
    item.value,
    item.counterValue,
    item.state
  ]);

  var label = joinFilled_([
    item.name,
    item.text,
    item.message,
    item.sensorName,
    item.deviceName,
    item.deviceId,
    item.sensorType,
    item.measurement
  ]);

  return {
    source: source,
    id: item._id || item.id || '',
    label: label,
    name: item.name || '',
    text: item.text || '',
    message: item.message || '',
    sensorName: item.sensorName || '',
    deviceName: item.deviceName || '',
    deviceIdForeignKey: item.deviceIdForeignKey || item.specialForeignKey || '',
    deviceId: item.deviceId || '',
    deviceType: item.deviceType || item.deviceId || '',
    sensorType: item.sensorType || '',
    metric: detectMetric_(label, item.measurement || item.unit || ''),
    value: value,
    valueNumber: parseNumeric_(value),
    unit: item.measurement || item.unit || '',
    x: toNumberOrNull_(item.x),
    y: toNumberOrNull_(item.y),
    lastUpdateTime: item.lastUpdateTime || item.updatedAt || item.periodTimeForSavingData || ''
  };
}

function enrichWidgetsWithLiveData_(widgets, token) {
  var payload;
  try {
    payload = fetchElzJson_('/api/allDevices', {}, token, true);
  } catch (error) {
    return;
  }

  var allDevices = payload.allDevices || payload || {};
  widgets.forEach(function (widget) {
    if (hasUsableValue_(widget)) return;

    var liveData = getLiveDataForWidget_(widget, allDevices);
    if (!liveData || liveData.currentData === null || liveData.currentData === undefined || liveData.currentData === '') return;

    widget.value = liveData.currentData;
    widget.valueNumber = parseNumeric_(liveData.currentData);
    widget.lastUpdateTime = liveData.lastUpdatedTime || liveData.lastUpdateTime || widget.lastUpdateTime;
    widget.source = widget.source + '+live';
  });
}

function getLiveDataForWidget_(widget, allDevices) {
  var deviceId = widget.deviceIdForeignKey || widget.deviceId;
  var sensorType = widget.sensorType;
  if (!deviceId || !sensorType) return null;

  return getDataFromDeviceList_(allDevices.devices, deviceId, [
    { key: 'sensors', idField: 'sensorType', valueFields: ['currentData'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] },
    { key: 'inputs', idField: 'inputCode', valueFields: ['currentState', 'currentData'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] },
    { key: 'counters', idField: 'counterCode', valueFields: ['currentCount', 'currentData'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] }
  ], sensorType) ||
    getDataFromDeviceList_(allDevices.hexAirDevices, deviceId, [
      { key: 'sensors', idField: 'sensorType', valueFields: ['currentData'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] }
    ], sensorType) ||
    getDataFromDeviceList_(allDevices.hexhmiDevices, deviceId, [
      { key: 'hexhmiRegisters', idField: 'registerValue', valueFields: ['currentData'], timeFields: ['lastUpdatedTime', 'lastUpdatedTime', 'lastSavedTime'] }
    ], sensorType) ||
    getDataFromDeviceList_(allDevices.modBusDevices, deviceId, [
      { key: 'registers', idField: 'registerValue', valueFields: ['currentData'], timeFields: ['lastUpdatedTime', 'lastUpdatedTime', 'lastSavedTime'] }
    ], sensorType) ||
    getDataFromDeviceList_(allDevices.hexMakDevices, deviceId, [
      { key: 'inputs', idField: 'inputCode', valueFields: ['currentState', 'currentData'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] },
      { key: 'counters', idField: 'counterCode', valueFields: ['currentCount', 'currentData'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] }
    ], sensorType) ||
    getDataFromDeviceList_(allDevices.specialDevices, deviceId, [
      { key: 'inputs', idField: 'topicName', valueFields: ['currentData', 'currentState'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] },
      { key: 'outputs', idField: 'topicName', valueFields: ['currentData', 'currentState'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] }
    ], sensorType) ||
    getDataFromDeviceList_(allDevices.localVariables, deviceId, [
      { key: 'mathFormulas', idField: 'name', valueFields: ['currentData'], timeFields: ['lastUpdatedTime', 'lastUpdateTime'] }
    ], sensorType);
}

function getDataFromDeviceList_(devices, deviceId, collections, sensorType) {
  if (!Array.isArray(devices)) return null;

  var device = devices.find(function (candidate) {
    return candidate && (candidate._id === deviceId || candidate.id === deviceId);
  });
  if (!device) return null;

  for (var i = 0; i < collections.length; i++) {
    var collectionInfo = collections[i];
    var collection = device[collectionInfo.key];
    if (!Array.isArray(collection)) continue;

    var item = collection.find(function (entry) {
      return entry && String(entry[collectionInfo.idField]) === String(sensorType);
    });
    if (!item) continue;

    return {
      currentData: firstExistingField_(item, collectionInfo.valueFields),
      lastUpdatedTime: firstExistingField_(item, collectionInfo.timeFields)
    };
  }

  return null;
}

function selectTargetValue_(target, widgets) {
  var groupMatches = widgets.filter(function (widget) {
    return isWidgetForTargetGroup_(widget, target);
  });

  if (groupMatches.length) {
    return toGroupedTargetResult_(target, groupMatches);
  }

  var directMatches = widgets.filter(function (widget) {
    return matchesTarget_(widget.label, target) ||
      matchesTarget_(widget.name, target) ||
      matchesTarget_(widget.text, target) ||
      matchesTarget_(widget.message, target) ||
      matchesTarget_(widget.sensorName, target);
  });

  var directValue = bestValueWidget_(directMatches);
  if (directValue) return toTargetResult_(target, directValue, 'direct');

  var nearbyValue = bestNearbyValue_(directMatches, widgets);
  if (nearbyValue) return toTargetResult_(target, nearbyValue, 'nearby');

  var numberMatch = bestValueWidget_(widgets.filter(function (widget) {
    return target.aliases.some(function (alias) {
      return normalizeText_(widget.label).indexOf(normalizeText_(alias)) > -1;
    });
  }));
  if (numberMatch) return toTargetResult_(target, numberMatch, 'number-match');

  return {
    title: target.title,
    value: '',
    valueFormatted: '--',
    unit: '',
    label: 'Eslesen widget bulunamadi',
    source: '',
    missing: true
  };
}

function isWidgetForTargetGroup_(widget, target) {
  var normalized = normalizeText_([
    widget.label,
    widget.name,
    widget.text,
    widget.message,
    widget.sensorName,
    widget.sensorType
  ].join(' '));

  if (!normalized || normalized.indexOf('total') > -1 || normalized.indexOf('toplam') > -1) {
    return false;
  }

  if (target.key === 'elz116117') {
    return (normalized.indexOf('elz 116') > -1 ||
      normalized.indexOf('elz116') > -1 ||
      normalized.indexOf('116 117') > -1 ||
      normalized.indexOf('elektroliz116') > -1) &&
      normalized.indexOf('119') === -1 &&
      normalized.indexOf('121') === -1;
  }

  if (target.key === 'elz119121') {
    return normalized.indexOf('elz 119') > -1 ||
      normalized.indexOf('elz119') > -1 ||
      normalized.indexOf('119 121') > -1 ||
      normalized.indexOf('elektroliz119') > -1;
  }

  return matchesTarget_(normalized, target);
}

function toGroupedTargetResult_(target, widgets) {
  var ordered = uniqueWidgetsByMetric_(widgets).sort(function (a, b) {
    return metricPriority_(a.metric) - metricPriority_(b.metric);
  });
  var primary = ordered.find(function (widget) {
    return widget.metric === 'Akim';
  }) || bestValueWidget_(ordered) || ordered[0];

  return {
    title: target.title,
    value: primary ? primary.value : '',
    valueFormatted: primary ? formatValue_(primary.value, primary.unit) : '--',
    unit: primary ? primary.unit : '',
    label: primary ? primary.metric : target.title,
    source: primary ? primary.source + ' / group' : '',
    widgetId: primary ? primary.id : '',
    lastUpdateTime: primary ? primary.lastUpdateTime : '',
    items: ordered.map(function (widget) {
      return {
        metric: widget.metric,
        value: widget.value,
        valueFormatted: formatValue_(widget.value, widget.unit),
        unit: widget.unit,
        label: widget.label,
        source: widget.source,
        widgetId: widget.id,
        lastUpdateTime: widget.lastUpdateTime,
        missing: !hasUsableValue_(widget)
      };
    })
  };
}

function uniqueWidgetsByMetric_(widgets) {
  var byMetric = {};
  widgets.forEach(function (widget) {
    var metric = widget.metric || detectMetric_(widget.label, widget.unit);
    widget.metric = metric;
    if (!byMetric[metric] || valuePriority_(widget) > valuePriority_(byMetric[metric])) {
      byMetric[metric] = widget;
    }
  });

  return Object.keys(byMetric).map(function (metric) {
    return byMetric[metric];
  });
}

function metricPriority_(metric) {
  if (metric === 'Akim') return 1;
  if (metric === 'Klor') return 2;
  if (metric === 'H2') return 3;
  if (metric === 'Kostik') return 4;
  return 9;
}

function bestValueWidget_(widgets) {
  var candidates = widgets.filter(hasUsableValue_);
  if (!candidates.length) return null;

  candidates.sort(function (a, b) {
    return valuePriority_(b) - valuePriority_(a);
  });

  return candidates[0];
}

function bestNearbyValue_(titleWidgets, widgets) {
  var titles = titleWidgets.filter(function (widget) {
    return widget.x !== null && widget.y !== null;
  });
  if (!titles.length) return null;

  var valueWidgets = widgets.filter(hasUsableValue_);
  var best = null;

  titles.forEach(function (titleWidget) {
    valueWidgets.forEach(function (valueWidget) {
      if (titleWidget.id && valueWidget.id && titleWidget.id === valueWidget.id) return;
      if (valueWidget.x === null || valueWidget.y === null) return;

      var dx = Math.abs(valueWidget.x - titleWidget.x);
      var dy = valueWidget.y - titleWidget.y;
      if (dx > 360 || dy < -40 || dy > 320) return;

      var score = dx + Math.max(0, dy) * 1.5 - valuePriority_(valueWidget) * 25;
      if (!best || score < best.score) {
        best = { widget: valueWidget, score: score };
      }
    });
  });

  return best ? best.widget : null;
}

function toTargetResult_(target, widget, matchType) {
  return {
    title: target.title,
    value: widget.value,
    valueFormatted: formatValue_(widget.value, widget.unit),
    unit: widget.unit,
    label: widget.label || target.title,
    source: widget.source + ' / ' + matchType,
    widgetId: widget.id,
    lastUpdateTime: widget.lastUpdateTime
  };
}

function hasUsableValue_(widget) {
  if (!widget) return false;
  if (widget.value === null || widget.value === undefined || widget.value === '') return false;
  if (String(widget.value).trim() === '--') return false;
  return true;
}

function valuePriority_(widget) {
  var score = 0;
  if (widget.valueNumber !== null) score += 4;
  if (widget.lastUpdateTime) score += 2;
  if (widget.unit) score += 1;
  if (widget.source === 'readOnlyInputs' || widget.source === 'gauges' || widget.source === 'linearGauges') score += 2;
  return score;
}

function detectMetric_(label, unit) {
  var normalized = normalizeText_(label);
  if (normalized.indexOf('h2') > -1) return 'H2';
  if (normalized.indexOf('klor') > -1 || normalized.indexOf('chlor') > -1) return 'Klor';
  if (normalized.indexOf('caustic') > -1 || normalized.indexOf('kostik') > -1) return 'Kostik';
  if (String(unit || '').toUpperCase() === 'KA' || normalized.indexOf('elektroliz') > -1) return 'Akim';
  return 'Deger';
}

function matchesTarget_(value, target) {
  var normalized = normalizeText_(value);
  if (!normalized) return false;

  return target.aliases.some(function (alias) {
    var normalizedAlias = normalizeText_(alias);
    return normalized.indexOf(normalizedAlias) > -1;
  });
}

function fetchElzJson_(path, query, token, retryOnUnauthorized) {
  var url = ELZ_API_BASE + path + buildQueryString_(query);
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  var statusCode = response.getResponseCode();
  var text = response.getContentText();

  if ((statusCode === 401 || statusCode === 403) && retryOnUnauthorized) {
    clearElzCachedToken_();
    return fetchElzJson_(path, query, getElzToken_(), false);
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(path + ' HTTP ' + statusCode + ': ' + text.slice(0, 250));
  }

  return text ? JSON.parse(text) : {};
}

function getElzToken_() {
  var props = PropertiesService.getScriptProperties();
  var cachedToken = props.getProperty('ELZ_TOKEN');
  var expiresAt = Number(props.getProperty('ELZ_TOKEN_EXPIRES_AT') || 0);

  if (cachedToken && expiresAt > Date.now() + ELZ_TOKEN_SAFETY_MS) {
    return cachedToken;
  }

  var username = props.getProperty('ELZ_USERNAME');
  var password = props.getProperty('ELZ_PASSWORD');

  if (!username || !password) {
    throw new Error('ELZ login ayarlari eksik. Script Properties icine ELZ_USERNAME ve ELZ_PASSWORD eklenmeli.');
  }

  var response = UrlFetchApp.fetch(ELZ_API_BASE + '/api/user/login', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      userName: username,
      password: password,
      role: null
    }),
    muteHttpExceptions: true
  });

  var statusCode = response.getResponseCode();
  var text = response.getContentText();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('ELZ login basarisiz. HTTP ' + statusCode + ': ' + text.slice(0, 250));
  }

  var payload = JSON.parse(text);
  if (!payload.token) {
    throw new Error('ELZ login cevabinda token yok.');
  }

  var ttlMs = Number(payload.expiresIn || 300) * 1000;
  var tokenExpiresAt = Date.now() + ttlMs - ELZ_TOKEN_SAFETY_MS;
  props.setProperties({
    ELZ_TOKEN: payload.token,
    ELZ_TOKEN_EXPIRES_AT: String(tokenExpiresAt)
  }, false);

  return payload.token;
}

function getElzTokenExpiresAt_() {
  return Number(PropertiesService.getScriptProperties().getProperty('ELZ_TOKEN_EXPIRES_AT') || 0);
}

function clearElzCachedToken_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('ELZ_TOKEN');
  props.deleteProperty('ELZ_TOKEN_EXPIRES_AT');
}

function setupElzLoginPropertiesOnce() {
  var username = 'korumadenizli';
  var password = 'KD2024kd';

  if (password === 'SIFREYI_BURAYA_YAZIP_BIR_KEZ_CALISTIR') {
    throw new Error('ELZ sifresi bu fonksiyon icine bir defalik yazilmali. Calistirdiktan sonra bu fonksiyonu silebilirsin.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    ELZ_USERNAME: username,
    ELZ_PASSWORD: password
  }, false);
  clearElzCachedToken_();
  getElzToken_();

  var result = {
    success: true,
    hasUsername: true,
    hasPassword: true,
    hasToken: true,
    expiresAt: new Date(getElzTokenExpiresAt_()).toISOString(),
    message: 'ELZ kullanici adi ve sifre Script Properties alanina yazildi, token test edildi. Simdi getElzMainpageValues test edilebilir.'
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function debugElzPropertiesStatus() {
  var props = PropertiesService.getScriptProperties();
  var username = props.getProperty('ELZ_USERNAME') || '';
  var password = props.getProperty('ELZ_PASSWORD') || '';
  var token = props.getProperty('ELZ_TOKEN') || '';
  var expiresAt = Number(props.getProperty('ELZ_TOKEN_EXPIRES_AT') || 0);
  var result = {
    success: true,
    scriptId: ScriptApp.getScriptId(),
    hasUsername: !!username,
    usernameLength: username.length,
    hasPassword: !!password,
    passwordLength: password.length,
    hasToken: !!token,
    tokenExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
    tokenExpired: expiresAt ? expiresAt <= Date.now() : true
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function clearElzLoginProperties() {
  var props = PropertiesService.getScriptProperties();
  ['ELZ_USERNAME', 'ELZ_PASSWORD', 'ELZ_TOKEN', 'ELZ_TOKEN_EXPIRES_AT'].forEach(function (key) {
    props.deleteProperty(key);
  });
  var result = {
    success: true,
    message: 'ELZ kullanici adi, sifre ve token bilgileri Script Properties alanindan silindi.'
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function buildQueryString_(query) {
  var parts = [];
  Object.keys(query || {}).forEach(function (key) {
    if (query[key] === null || query[key] === undefined || query[key] === '') return;
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(query[key]));
  });
  return parts.length ? '?' + parts.join('&') : '';
}

function firstFilled_(values) {
  for (var i = 0; i < values.length; i++) {
    if (values[i] !== null && values[i] !== undefined && values[i] !== '') return values[i];
  }
  return '';
}

function firstExistingField_(item, fields) {
  for (var i = 0; i < fields.length; i++) {
    var value = item[fields[i]];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return '';
}

function joinFilled_(values) {
  return values.filter(function (value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }).join(' ');
}

function normalizeText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u0131/g, 'i')
    .replace(/\u011f/g, 'g')
    .replace(/\u00fc/g, 'u')
    .replace(/\u015f/g, 's')
    .replace(/\u00f6/g, 'o')
    .replace(/\u00e7/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumberOrNull_(value) {
  var numberValue = Number(value);
  return isFinite(numberValue) ? numberValue : null;
}

function parseNumeric_(value) {
  if (value === null || value === undefined || value === '') return null;
  var normalized = String(value).replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!normalized) return null;
  var numberValue = Number(normalized[0]);
  return isFinite(numberValue) ? numberValue : null;
}

function formatValue_(value, unit) {
  if (value === null || value === undefined || value === '') return '--';
  var numericValue = parseNumeric_(value);
  var formatted = numericValue === null ? String(value) : numericValue.toLocaleString('tr-TR', {
    maximumFractionDigits: Math.abs(numericValue) >= 100 ? 1 : 2
  });
  return unit ? formatted + ' ' + unit : formatted;
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
