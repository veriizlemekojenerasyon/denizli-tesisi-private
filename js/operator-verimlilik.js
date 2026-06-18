(function () {
    'use strict';

    const MODULES = {
        hourly: { label: 'Saatlik', expectedPerHour: 1 },
        motor: { label: 'Kojen Motor', expectedPerHour: 3 },
        energy: { label: 'Kojen Enerji', expectedPerHour: 3 },
        daily: { label: 'Gunluk', expectedPerHour: 0 },
        steam: { label: 'Buhar', expectedPerHour: 0 },
        shift: { label: 'Vardiya', expectedPerHour: 0 }
    };
    const MODULE_ORDER = ['hourly', 'motor', 'energy', 'daily', 'steam', 'shift'];
    const MOTOR_KEYS = ['gm1', 'gm2', 'gm3'];
    const MOTOR_LABELS = { gm1: 'GM-1', gm2: 'GM-2', gm3: 'GM-3' };
    const SHIFT_NAMES = ['24-08', '08-16', '16-24'];
    const MOTOR_CAPACITY_MW = 3.45;
    const MOTOR_TARGET_MW = 3;
    const MOTOR_DERATED_TARGET_MW = 2.8;
    const MOTOR_CHARGE_TEMP_CAUTION = 55;
    const MOTOR_CHARGE_TEMP_HIGH = 65;
    const MOTOR_WINDING_TEMP_CAUTION = 115;
    const MOTOR_WINDING_TEMP_HIGH = 125;
    const MOTOR_POWER_SCORE_WEIGHT = 8;
    const TIMELY_ENTRY_TOLERANCE_MINUTES = 15;
    const TIMELINESS_BONUS_MAX = 4;
    const TIMELINESS_PENALTY_MAX = 6;
    const REPEATED_VALUE_PENALTY_MAX = 3;
    const SHIFT_CLOSE_PENALTY_MAX = 5;
    const AUTO_OPERATOR_PATTERN = /(otomatik|automatic|system|sistem|kayit girilmedi|kayit yok)/i;
    const EXCLUDED_OPERATOR_NAME_KEYS = new Set(['MURAT COSKUN']);
    const HOURLY_REQUIRED_FIELDS = ['aktifMwh', 'reaktifMwh', 'aydemAktif', 'aydemReaktif'];
    const HOURLY_ACCURACY_PAIRS = [
        ['aktifMwh', 'aydemAktif'],
        ['reaktifMwh', 'aydemReaktif']
    ];
    const HOURLY_ACCURACY_TOLERANCE = 0.001;
    const DAILY_REQUIRED_FIELDS = [
        'yagSeviyesi',
        'kuplaj',
        'gm1',
        'gm2',
        'gm3',
        'icihtiyac',
        'redresor1',
        'redresor2',
        'kojenIcihtiyac',
        'servisTrafo'
    ];

    const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
    const integerFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

    const state = {
        period: 'weekly',
        module: 'all',
        records: [],
        reportDays: [],
        operatorRows: [],
        loadErrors: [],
        quality: createEmptyQuality(),
        motorAggregate: createMotorAggregate()
    };

    document.addEventListener('DOMContentLoaded', () => {
        try {
            initOperatorPage();
        } catch (error) {
            renderFatalError(error);
        }
    });

    function initOperatorPage() {
        const user = getCurrentUser();
        if (!isAdminUser(user)) {
            renderUnauthorized();
            return;
        }

        setCurrentUserName(user);
        applyCurrentRangeForPeriod(state.period);
        bindEvents();
        loadDashboard();
    }

    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('loggedInUser') || 'null');
        } catch (error) {
            return null;
        }
    }

    function setCurrentUserName(user) {
        const fullName = [user.firstName || user.ad || user.name || '', user.lastName || user.soyad || '']
            .join(' ')
            .trim() || user.email || 'Admin';
        document.querySelectorAll('#userNameDisplay, #sidebarUserNameDisplay').forEach(node => {
            node.textContent = fullName;
        });
    }

    function isAdminUser(user) {
        if (!user) return false;
        const role = normalizeLooseName(user.role || user.yetki || user.userRole || '');
        const type = normalizeLooseName(user.type || user.kullaniciTipi || '');
        const status = normalizeLooseName(user.status || user.durum || '');
        const fullName = [user.firstName || user.ad || user.name || '', user.lastName || user.soyad || '']
            .join(' ')
            .trim();
        return role === 'ADMIN' ||
            role === 'YONETICI' ||
            type === 'ADMIN' ||
            user.isAdmin === true ||
            user.admin === true ||
            isExcludedOperator(fullName || user.email || '') ||
            status === 'ADMIN';
    }

    function bindEvents() {
        document.querySelectorAll('[data-period]').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('[data-period]').forEach(item => {
                    item.classList.toggle('active', item === button);
                });
                state.period = button.dataset.period || 'weekly';
                applyCurrentRangeForPeriod(state.period);
                loadDashboard();
            });
        });

        const moduleFilter = document.getElementById('moduleFilter');
        const startInput = document.getElementById('startDateInput');
        const endInput = document.getElementById('endDateInput');
        const refreshButton = document.getElementById('refreshReportBtn');
        const exportButton = document.getElementById('exportCsvBtn');

        if (moduleFilter) {
            moduleFilter.addEventListener('change', event => {
                state.module = event.target.value || 'all';
                renderDashboard();
            });
        }
        if (startInput) startInput.addEventListener('change', loadDashboard);
        if (endInput) endInput.addEventListener('change', loadDashboard);
        if (refreshButton) refreshButton.addEventListener('click', loadDashboard);
        if (exportButton) exportButton.addEventListener('click', exportOperatorCsv);
    }

    function applyCurrentRangeForPeriod(period) {
        const today = getTodayDateOnly();
        let startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        let endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

        if (period === 'weekly') {
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
            endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        } else if (period === 'monthly') {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        }

        const startInput = document.getElementById('startDateInput');
        const endInput = document.getElementById('endDateInput');
        if (startInput) startInput.value = toIsoDate(startDate);
        if (endInput) endInput.value = toIsoDate(endDate);
    }

    async function loadDashboard() {
        const range = getSelectedDateRange();
        if (!range.valid) {
            showNotice('Baslangic tarihi bitis tarihinden buyuk olamaz.');
            renderEmptyDashboard();
            return;
        }

        setLoading(true);
        hideNotice();
        state.loadErrors = [];

        const recordTasks = [
            { label: 'Saatlik veri', module: 'hourly', key: 'saatlik', action: 'getRecords' },
            { label: 'Kojen motor', module: 'motor', key: 'motor', action: 'getRecords' },
            { label: 'Kojen enerji', module: 'energy', key: 'enerji', action: 'getRecords' },
            { label: 'Gunluk veri', module: 'daily', key: 'gunluk', action: 'getRecords' },
            { label: 'Buhar', module: 'steam', key: 'buhar', action: 'getRecords' },
            { label: 'Vardiya', module: 'shift', key: 'vardiya', action: 'getLastRecordsWithIslemler', params: { count: '500' } }
        ];

        const reportYears = listYearsInRange(range.startDate, range.endDate);
        const reportTasks = reportYears.map(year => ({
            label: `${year} enerji raporu`,
            year,
            action: 'getYearlyEnergyReportData'
        }));

        try {
            const recordResults = await Promise.allSettled(recordTasks.map(task => fetchRecordTask(task)));
            const records = [];
            recordResults.forEach((result, index) => {
                const task = recordTasks[index];
                if (result.status === 'fulfilled') {
                    records.push.apply(records, normalizeRecords(task.module, result.value.data || []));
                    if (result.value.fallbackMessage) {
                        state.loadErrors.push(result.value.fallbackMessage);
                    }
                } else {
                    state.loadErrors.push(`${task.label}: ${result.reason.message || result.reason}`);
                }
            });

            const reportResults = await Promise.allSettled(reportTasks.map(task => fetchReportTask(task.year)));
            const reportDays = [];
            reportResults.forEach((result, index) => {
                const task = reportTasks[index];
                if (result.status === 'fulfilled') {
                    reportDays.push.apply(reportDays, normalizeReportDays(result.value.days || []));
                } else {
                    state.loadErrors.push(`${task.label}: ${result.reason.message || result.reason}`);
                }
            });

            state.records = records;
            state.reportDays = reportDays;
            renderDashboard();
        } catch (error) {
            console.error('Operator verimlilik verisi alinamadi:', error);
            showNotice(error.message || String(error));
            renderEmptyDashboard();
        } finally {
            setLoading(false);
        }
    }

    async function fetchRecordTask(task) {
        const scriptUrl = window.AppConfig && window.AppConfig.getScriptUrl ? window.AppConfig.getScriptUrl(task.key) : '';
        if (!scriptUrl) throw new Error(`${task.key} API adresi bulunamadi.`);
        try {
            return await fetchJson(scriptUrl, Object.assign({ action: task.action }, task.params || {}));
        } catch (error) {
            if (task.module === 'shift' && task.action !== 'getRecords') {
                const fallback = await fetchJson(scriptUrl, { action: 'getRecords' });
                fallback.fallbackMessage = `${task.label}: islemler okunamadi, temel vardiya kayitlari kullanildi.`;
                return fallback;
            }
            throw error;
        }
    }

    async function fetchReportTask(year) {
        const scriptUrl = window.AppConfig && window.AppConfig.getScriptUrl ? window.AppConfig.getScriptUrl('yillikEnerjiRapor') : '';
        if (!scriptUrl) throw new Error('Yillik enerji rapor API adresi bulunamadi.');
        return fetchJson(scriptUrl, { action: 'getYearlyEnergyReportData', year: String(year) });
    }

    async function fetchJson(scriptUrl, params) {
        const url = new URL(scriptUrl);
        Object.keys(params || {}).forEach(key => url.searchParams.set(key, params[key]));
        const response = await fetch(url.toString());
        const text = await response.text();
        let result = null;
        try {
            result = JSON.parse(text);
        } catch (error) {
            throw new Error(`JSON okunamadi: ${text.slice(0, 160)}`);
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
        }
        if (result && result.success === false) {
            throw new Error(result.error || result.message || 'API basarisiz dondu.');
        }
        return result || {};
    }

    function normalizeRecords(module, rows) {
        if (!Array.isArray(rows)) return [];
        if (module === 'shift') {
            return rows.reduce((items, row) => {
                const shiftRows = normalizeShiftRecord(row);
                shiftRows.forEach(item => {
                    if (item) items.push(item);
                });
                return items;
            }, []);
        }
        return rows.map(row => normalizeOperationRecord(module, row)).filter(Boolean);
    }

    function normalizeOperationRecord(module, row) {
        const dateIso = normalizeDate(row.dateIso || row.tarih || row.date || row.Tarih);
        if (!dateIso) return null;
        const time = normalizeTime(row.saat || row.Saat || row.zaman || '');
        const hour = getHourFromTime(time);
        const fallbackShift = module === 'daily' || module === 'steam' ? '16-24' : getShiftFromHour(hour);
        const shift = normalizeShift(row.vardiya || row.Vardiya || fallbackShift);
        const operator = cleanName(row.kaydeden || row.kullanici || row.operator || row.createdBy || '');
        const notes = String(row.notlar || row.aciklama || row.durum || '');
        const automatic = isAutomaticOperator(operator) || AUTO_OPERATOR_PATTERN.test(notes) || !operator;
        const fieldQuality = assessRecordQuality(module, row);
        const hourlyAccuracy = module === 'hourly'
            ? assessHourlyAccuracy(row)
            : { checked: 0, matched: 0, mismatched: 0 };

        return {
            module,
            dateIso,
            dateText: isoToTrDate(dateIso),
            shift,
            time,
            hour,
            motor: normalizeMotorKey(row.motor || row.Motor || ''),
            operator,
            operatorKey: normalizeNameKey(operator),
            automatic,
            endOfDay: time === '23:59',
            fieldQuality,
            hourlyAccuracy,
            extraWorkCount: 0,
            raw: row
        };
    }

    function normalizeShiftRecord(row) {
        const dateIso = normalizeDate(row.dateIso || row.tarih || row.date || row.Tarih);
        if (!dateIso) return [];
        const shift = normalizeShift(row.vardiya || row.Vardiya || '');
        const islemKaydedenler = Array.isArray(row.islemler)
            ? row.islemler.map(item => item && item.kaydeden ? item.kaydeden : '')
            : [];
        const names = uniqueNames([
            row.operator,
            row.yardimciOperator,
            row.personel
        ].concat(islemKaydedenler));
        const extraWorkCount = getShiftExtraWorkCount(row);
        const extraShare = names.length ? extraWorkCount / names.length : 0;

        return names.map(name => ({
            module: 'shift',
            dateIso,
            dateText: isoToTrDate(dateIso),
            shift,
            time: normalizeTime(row.baslangicSaati || ''),
            hour: getHourFromTime(row.baslangicSaati || ''),
            motor: '',
            operator: name,
            operatorKey: normalizeNameKey(name),
            automatic: false,
            endOfDay: false,
            fieldQuality: { passed: 1, total: 1 },
            hourlyAccuracy: { checked: 0, matched: 0, mismatched: 0 },
            extraWorkCount: extraShare,
            raw: row
        }));
    }

    function assessRecordQuality(module, row) {
        if (module === 'hourly') {
            return countFilledFields(row, HOURLY_REQUIRED_FIELDS);
        }
        if (module === 'daily') {
            return countFilledFields(row, DAILY_REQUIRED_FIELDS);
        }
        if (module === 'steam') {
            return countFilledFields(row, ['buharMiktari']);
        }
        return { passed: 1, total: 1 };
    }

    function countFilledFields(row, fields) {
        const total = fields.length;
        const passed = fields.reduce((sum, field) => sum + (hasFilledValue(row[field]) ? 1 : 0), 0);
        return { passed, total };
    }

    function assessHourlyAccuracy(row) {
        return HOURLY_ACCURACY_PAIRS.reduce((result, pair) => {
            const enteredValue = row[pair[0]];
            const actualValue = row[pair[1]];
            if (!hasFilledValue(enteredValue) || !hasFilledValue(actualValue)) {
                return result;
            }

            const entered = toNumber(enteredValue);
            const actual = toNumber(actualValue);
            result.checked += 1;
            if (Math.abs(entered - actual) <= HOURLY_ACCURACY_TOLERANCE) {
                result.matched += 1;
            } else {
                result.mismatched += 1;
            }
            return result;
        }, { checked: 0, matched: 0, mismatched: 0 });
    }

    function getShiftExtraWorkCount(row) {
        const islemCount = Array.isArray(row.islemler)
            ? row.islemler.filter(item => cleanName((item && (item.islem || item.aciklama)) || '')).length
            : 0;
        const devredenCount = cleanName(row.devredenIsler || '') ? 1 : 0;
        return islemCount + devredenCount;
    }

    function normalizeReportDays(days) {
        if (!Array.isArray(days)) return [];
        return days.map(day => ({
            date: day.date || '',
            dateIso: day.dateIso || normalizeDate(day.date || ''),
            gm1: normalizeMetric(day.gm1),
            gm2: normalizeMetric(day.gm2),
            gm3: normalizeMetric(day.gm3),
            total: normalizeMetric(day.total)
        })).filter(day => day.dateIso);
    }

    function normalizeMetric(metric) {
        return {
            productionMwh: toNumber(metric && metric.productionMwh),
            hours: toNumber(metric && metric.hours),
            averageMw: toNumber(metric && metric.averageMw)
        };
    }

    function renderDashboard() {
        const range = getSelectedDateRange();
        if (!range.valid) {
            showNotice('Baslangic tarihi bitis tarihinden buyuk olamaz.');
            renderEmptyDashboard();
            return;
        }

        const rangeRecords = state.records.filter(record => isInRange(record.dateIso, range));
        const filteredRecords = rangeRecords.filter(record => moduleMatches(record.module));
        const ownerMap = buildShiftOwnerMap(rangeRecords);
        const expectedEvents = buildExpectedEvents(range);
        const quality = calculateQuality(filteredRecords, expectedEvents, ownerMap);
        const operatorRows = calculateOperatorRows(filteredRecords, expectedEvents, quality.missingEvents, ownerMap, range, rangeRecords);
        const motorAggregate = aggregateMotorReport(range);

        state.quality = quality;
        state.operatorRows = operatorRows;
        state.motorAggregate = motorAggregate;

        renderKpis(quality, operatorRows, motorAggregate);
        renderScoreBoard(operatorRows);
        renderOperatorTable(operatorRows);
        renderMotorEfficiency(motorAggregate);
        renderModuleSummary(quality);
        renderInsights(quality, operatorRows, motorAggregate);
        renderNotices(quality);
        updateLabels(range, operatorRows);
    }

    function renderEmptyDashboard() {
        state.operatorRows = [];
        state.quality = createEmptyQuality();
        state.motorAggregate = createMotorAggregate();
        renderKpis(state.quality, [], state.motorAggregate);
        renderScoreBoard([]);
        renderOperatorTable([]);
        renderMotorEfficiency(state.motorAggregate);
        renderModuleSummary(state.quality);
        renderInsights(state.quality, [], state.motorAggregate);
    }

    function buildShiftOwnerMap(records) {
        const map = new Map();
        records
            .filter(record => record.module === 'shift' && record.operatorKey && !isExcludedOperator(record.operator))
            .forEach(record => {
                const key = shiftKey(record.dateIso, record.shift);
                if (!map.has(key)) map.set(key, new Map());
                map.get(key).set(record.operatorKey, record.operator);
            });
        return map;
    }

    function buildExpectedEvents(range) {
        const selectedModules = getSelectedModules();
        const events = [];
        const todayIso = toIsoDate(getTodayDateOnly());
        const now = new Date();
        const endIso = minIso(range.endDate, todayIso);
        const dates = listDates(range.startDate, endIso);

        dates.forEach(dateIso => {
            const hourLimit = dateIso === todayIso ? now.getHours() : 24;
            for (let hour = 0; hour < hourLimit; hour += 1) {
                const shift = getShiftFromHour(hour);
                if (selectedModules.includes('hourly')) {
                    events.push(createExpectedEvent('hourly', dateIso, hour, '', shift));
                }
                if (selectedModules.includes('motor')) {
                    MOTOR_KEYS.forEach(motor => events.push(createExpectedEvent('motor', dateIso, hour, motor, shift)));
                }
                if (selectedModules.includes('energy')) {
                    MOTOR_KEYS.forEach(motor => events.push(createExpectedEvent('energy', dateIso, hour, motor, shift)));
                }
            }

            if (selectedModules.includes('shift')) {
                getExpectedShiftsForDate(dateIso, todayIso, now.getHours()).forEach(shift => {
                    events.push({
                        module: 'shift',
                        dateIso,
                        hour: -1,
                        motor: '',
                        shift,
                        slotKey: `shift|${dateIso}|${shift}`
                    });
                });
            }
            if (dateIso < todayIso && selectedModules.includes('daily')) {
                events.push({
                    module: 'daily',
                    dateIso,
                    hour: -1,
                    motor: '',
                    shift: '16-24',
                    slotKey: `daily|${dateIso}|day`
                });
            }
            if (dateIso < todayIso && selectedModules.includes('steam')) {
                events.push({
                    module: 'steam',
                    dateIso,
                    hour: -1,
                    motor: '',
                    shift: '16-24',
                    slotKey: `steam|${dateIso}|day`
                });
            }
        });

        return events;
    }

    function createExpectedEvent(module, dateIso, hour, motor, shift) {
        return {
            module,
            dateIso,
            hour,
            motor,
            shift,
            slotKey: `${module}|${dateIso}|${motor || 'site'}|${String(hour).padStart(2, '0')}`
        };
    }

    function calculateQuality(records, expectedEvents, ownerMap) {
        const quality = createEmptyQuality();
        const actualSlots = new Set();
        const selectedModules = getSelectedModules();

        selectedModules.forEach(module => {
            quality.moduleStats[module] = { manual: 0, auto: 0, missing: 0, expected: 0 };
        });

        expectedEvents.forEach(event => {
            if (!quality.moduleStats[event.module]) {
                quality.moduleStats[event.module] = { manual: 0, auto: 0, missing: 0, expected: 0 };
            }
            quality.moduleStats[event.module].expected += 1;
        });

        records.forEach(record => {
            const slotKey = slotKeyForRecord(record);
            if (slotKey) actualSlots.add(slotKey);
            if (!quality.moduleStats[record.module]) {
                quality.moduleStats[record.module] = { manual: 0, auto: 0, missing: 0, expected: 0 };
            }
            const excludedOperator = isExcludedOperator(record.operator);
            if (excludedOperator) {
                quality.adminExcludedCount += 1;
                quality.missingEvents.push(createMissingEvent(record, 'admin'));
            } else if (record.automatic) {
                quality.autoCount += 1;
                quality.moduleStats[record.module].auto += 1;
                quality.missingEvents.push(createMissingEvent(record, 'auto'));
            } else {
                quality.manualCount += 1;
                quality.moduleStats[record.module].manual += 1;
                quality.fieldCheckPassed += record.fieldQuality.passed;
                quality.fieldCheckTotal += record.fieldQuality.total;
                quality.hourlyAccuracyChecked += record.hourlyAccuracy.checked;
                quality.hourlyAccuracyMatched += record.hourlyAccuracy.matched;
                quality.hourlyAccuracyMismatched += record.hourlyAccuracy.mismatched;
                quality.extraWorkCount += record.extraWorkCount;
            }
        });

        expectedEvents.forEach(event => {
            quality.expectedCount += 1;
            if (!actualSlots.has(event.slotKey)) {
                quality.gapCount += 1;
                quality.missingEvents.push({
                    module: event.module,
                    dateIso: event.dateIso,
                    shift: event.shift,
                    hour: event.hour,
                    motor: event.motor,
                    reason: 'gap'
                });
            }
        });

        quality.missingEvents.forEach(event => {
            if (!quality.moduleStats[event.module]) {
                quality.moduleStats[event.module] = { manual: 0, auto: 0, missing: 0, expected: 0 };
            }
            quality.moduleStats[event.module].missing += 1;
            const owners = getOwnersForEvent(event, ownerMap);
            if (!owners.length) quality.unassignedMissing += 1;
        });

        quality.missingCount = quality.missingEvents.length;
        return quality;
    }

    function calculateOperatorRows(records, expectedEvents, missingEvents, ownerMap, range, allRangeRecords) {
        const stats = new Map();
        const selectedDays = Math.max(1, listDates(range.startDate, minIso(range.endDate, toIsoDate(getTodayDateOnly()))).length);
        const motorConditionIndex = buildMotorConditionIndex(allRangeRecords || records);
        const repeatedHourlySlots = buildRepeatedHourlyValueSlots(allRangeRecords || records);
        const closedShiftIndex = buildClosedShiftIndex(allRangeRecords || records);

        records.forEach(record => {
            if (record.automatic || !record.operatorKey || isExcludedOperator(record.operator)) return;
            const stat = ensureOperatorStat(stats, record.operatorKey, record.operator);
            stat.moduleCounts[record.module] += 1;
            stat.manualTotal += 1;
            stat.qualityPassed += record.fieldQuality.passed;
            stat.qualityTotal += record.fieldQuality.total;
            stat.hourlyAccuracyChecked += record.hourlyAccuracy.checked;
            stat.hourlyAccuracyMatched += record.hourlyAccuracy.matched;
            stat.hourlyAccuracyMismatched += record.hourlyAccuracy.mismatched;
            stat.extraWorkCount += record.extraWorkCount;
            applyMotorPowerScore(stat, record, motorConditionIndex);
            applyTimelinessScore(stat, record);
            applyRepeatedValueScore(stat, record, repeatedHourlySlots);
            stat.days.add(record.dateIso);
        });

        ownerMap.forEach(ownerSet => {
            ownerSet.forEach((name, key) => ensureOperatorStat(stats, key, name));
        });

        expectedEvents.forEach(event => {
            const owners = getOwnersForEvent(event, ownerMap);
            if (!owners.length) return;
            const share = 1 / owners.length;
            owners.forEach(owner => {
                const stat = ensureOperatorStat(stats, owner.key, owner.name);
                stat.assignedExpected += share;
            });
        });

        missingEvents.forEach(event => {
            const owners = getOwnersForEvent(event, ownerMap);
            if (!owners.length) return;
            const share = 1 / owners.length;
            owners.forEach(owner => {
                const stat = ensureOperatorStat(stats, owner.key, owner.name);
                stat.assignedMissing += share;
                if (closedShiftIndex.has(shiftKey(event.dateIso, event.shift))) {
                    stat.shiftCloseWarnings += share;
                }
            });
        });

        const rows = Array.from(stats.values());
        const maxManual = Math.max.apply(null, rows.map(row => row.manualTotal).concat([1]));

        rows.forEach(row => {
            const completion = row.assignedExpected > 0
                ? clamp(1 - (row.assignedMissing / row.assignedExpected), 0, 1)
                : 0;
            const qualityRatio = row.qualityTotal > 0 ? clamp(row.qualityPassed / row.qualityTotal, 0, 1) : 1;
            const volumeRatio = row.manualTotal / maxManual;
            const activeDayRatio = Math.min(1, row.days.size / selectedDays);
            const moduleBreadth = MODULE_ORDER.filter(module => row.moduleCounts[module] > 0).length / MODULE_ORDER.length;
            const extraWorkRatio = Math.min(1, row.extraWorkCount / Math.max(1, row.moduleCounts.shift));
            const baseScore = row.assignedExpected > 0
                ? (completion * 55) + (qualityRatio * 20) + (volumeRatio * 15) + (moduleBreadth * 5) + (extraWorkRatio * 5)
                : (qualityRatio * 35) + (volumeRatio * 45) + (activeDayRatio * 10) + (moduleBreadth * 5) + (extraWorkRatio * 5);
            const accuracyRatio = row.hourlyAccuracyChecked > 0
                ? clamp(row.hourlyAccuracyMatched / row.hourlyAccuracyChecked, 0, 1)
                : null;
            const accuracyAdjustment = accuracyRatio === null ? 0 : ((accuracyRatio - 0.5) * 20);
            const motorPowerAdjustment = row.motorPowerChecked > 0
                ? clamp((row.motorPowerScoreTotal / row.motorPowerChecked) * MOTOR_POWER_SCORE_WEIGHT, -MOTOR_POWER_SCORE_WEIGHT, MOTOR_POWER_SCORE_WEIGHT)
                : 0;
            const timelinessAdjustment = calculateTimelinessAdjustment(row);
            const repeatedValueAdjustment = -Math.min(REPEATED_VALUE_PENALTY_MAX, row.repeatedValueWarnings);
            const shiftCloseAdjustment = -Math.min(SHIFT_CLOSE_PENALTY_MAX, row.shiftCloseWarnings * 0.5);
            const score = baseScore + accuracyAdjustment + motorPowerAdjustment + timelinessAdjustment + repeatedValueAdjustment + shiftCloseAdjustment;

            row.completion = completion * 100;
            row.qualityPct = qualityRatio * 100;
            row.hourlyAccuracyPct = accuracyRatio === null ? null : accuracyRatio * 100;
            row.accuracyAdjustment = round(accuracyAdjustment);
            row.motorPowerAdjustment = round(motorPowerAdjustment);
            row.motorPowerChecked = round(row.motorPowerChecked);
            row.timelinessAdjustment = round(timelinessAdjustment);
            row.timelyEntryCount = round(row.timelyEntryCount);
            row.lateEntryCount = round(row.lateEntryCount);
            row.repeatedValueAdjustment = round(repeatedValueAdjustment);
            row.repeatedValueWarnings = round(row.repeatedValueWarnings);
            row.shiftCloseAdjustment = round(shiftCloseAdjustment);
            row.shiftCloseWarnings = round(row.shiftCloseWarnings);
            row.extraWorkCount = round(row.extraWorkCount);
            row.score = Math.round(clamp(score, 0, 100));
            row.assignedExpected = round(row.assignedExpected);
            row.assignedMissing = round(row.assignedMissing);
            row.level = getScoreLevel(row.score);
        });

        return rows
            .filter(row => row.manualTotal > 0 || row.assignedExpected > 0 || row.assignedMissing > 0)
            .sort((a, b) => b.score - a.score || b.manualTotal - a.manualTotal || a.name.localeCompare(b.name, 'tr'));
    }

    function buildMotorConditionIndex(records) {
        const index = new Map();
        (records || [])
            .filter(record => record.module === 'motor' && record.motor && record.hour >= 0)
            .forEach(record => {
                index.set(motorSlotKey(record), assessMotorCondition(record.raw || {}));
            });
        return index;
    }

    function applyMotorPowerScore(stat, record, motorConditionIndex) {
        if (record.module !== 'energy' || !record.motor || record.hour < 0) return;
        const powerMw = getEnergyPowerMw(record.raw || {});
        if (powerMw <= 0) return;

        const condition = motorConditionIndex.get(motorSlotKey(record)) || assessMotorCondition({});
        const result = assessMotorPower(powerMw, condition);
        stat.motorPowerChecked += 1;
        stat.motorPowerScoreTotal += result.score;
    }

    function assessMotorPower(powerMw, condition) {
        const targetMw = condition.derated ? MOTOR_DERATED_TARGET_MW : MOTOR_TARGET_MW;
        const distance = Math.abs(powerMw - targetMw);
        let score = 0;

        if (distance <= 0.08) {
            score = 1;
        } else if (distance <= 0.18) {
            score = 0.45;
        } else if (powerMw < targetMw) {
            score = -clamp((targetMw - powerMw) / 0.35, 0.25, 1);
        } else {
            score = condition.derated
                ? -clamp((powerMw - targetMw) / 0.35, 0.25, 1)
                : 0.15;
        }

        if (condition.high && powerMw > MOTOR_DERATED_TARGET_MW + 0.2) {
            score -= 0.35;
        }

        return {
            score: clamp(score, -1, 1),
            targetMw
        };
    }

    function assessMotorCondition(row) {
        const chargeTemp = toNumber(row.sarjSicaklik || row.sarjSicakligi || row.chargeTemp);
        const windingTemps = [
            toNumber(row.sargiSicaklik1 || row.sargi1),
            toNumber(row.sargiSicaklik2 || row.sargi2),
            toNumber(row.sargiSicaklik3 || row.sargi3)
        ];
        const maxWindingTemp = Math.max.apply(null, windingTemps.concat([0]));
        const caution = chargeTemp >= MOTOR_CHARGE_TEMP_CAUTION || maxWindingTemp >= MOTOR_WINDING_TEMP_CAUTION;
        const high = chargeTemp >= MOTOR_CHARGE_TEMP_HIGH || maxWindingTemp >= MOTOR_WINDING_TEMP_HIGH;

        return {
            chargeTemp,
            maxWindingTemp,
            caution,
            high,
            derated: caution || high
        };
    }

    function getEnergyPowerMw(row) {
        return toNumber(
            row.aktifGuc ||
            row.aktifGucMw ||
            row.anlikAktifGuc ||
            row.activePower ||
            row.guc ||
            row.AktifGuc ||
            row['Aktif Guc']
        );
    }

    function motorSlotKey(record) {
        return `${record.dateIso}|${record.motor}|${String(record.hour).padStart(2, '0')}`;
    }

    function applyTimelinessScore(stat, record) {
        if (!['hourly', 'motor', 'energy'].includes(record.module) || record.hour < 0) return;
        const createdAt = parseRecordDateTime(record.raw && (record.raw.kayitTarihi || record.raw.KayitTarihi || record.raw.createdAt));
        if (!createdAt) return;

        const expectedAt = getExpectedRecordDateTime(record.dateIso, record.hour);
        if (!expectedAt) return;
        const delayMinutes = (createdAt.getTime() - expectedAt.getTime()) / 60000;
        if (delayMinutes <= TIMELY_ENTRY_TOLERANCE_MINUTES) {
            stat.timelyEntryCount += 1;
        } else {
            stat.lateEntryCount += 1;
        }
        stat.timelinessChecked += 1;
    }

    function calculateTimelinessAdjustment(row) {
        if (row.timelinessChecked <= 0) return 0;
        const timelyRatio = clamp(row.timelyEntryCount / row.timelinessChecked, 0, 1);
        if (timelyRatio >= 0.9) return TIMELINESS_BONUS_MAX;
        if (timelyRatio >= 0.75) return 1;
        if (timelyRatio >= 0.5) return -3;
        return -TIMELINESS_PENALTY_MAX;
    }

    function buildRepeatedHourlyValueSlots(records) {
        const slots = new Set();
        const rows = (records || [])
            .filter(record => record.module === 'hourly' && record.hour >= 0)
            .slice()
            .sort((a, b) => getExpectedRecordDateTime(a.dateIso, a.hour) - getExpectedRecordDateTime(b.dateIso, b.hour));

        for (let index = 2; index < rows.length; index += 1) {
            const prev2 = rows[index - 2];
            const prev = rows[index - 1];
            const cur = rows[index];
            const prev2Time = getExpectedRecordDateTime(prev2.dateIso, prev2.hour).getTime();
            const prevTime = getExpectedRecordDateTime(prev.dateIso, prev.hour).getTime();
            const curTime = getExpectedRecordDateTime(cur.dateIso, cur.hour).getTime();
            const consecutive = prevTime - prev2Time === 3600000 && curTime - prevTime === 3600000;
            const values = [prev2, prev, cur].map(record => ({
                active: toNumber(record.raw && record.raw.aktifMwh),
                reactive: toNumber(record.raw && record.raw.reaktifMwh)
            }));
            const allSame = values.every(value =>
                value.active === values[0].active &&
                value.reactive === values[0].reactive
            );
            const allZero = values.every(value => value.active === 0 && value.reactive === 0);
            if (consecutive && allSame && !allZero) {
                slots.add(slotKeyForRecord(cur));
            }
        }
        return slots;
    }

    function applyRepeatedValueScore(stat, record, repeatedHourlySlots) {
        if (record.module !== 'hourly') return;
        if (repeatedHourlySlots.has(slotKeyForRecord(record))) {
            stat.repeatedValueWarnings += 1;
        }
    }

    function buildClosedShiftIndex(records) {
        const index = new Set();
        (records || [])
            .filter(record => record.module === 'shift' && record.shift)
            .forEach(record => {
                const status = normalizeLooseName((record.raw && record.raw.durum) || '');
                const endTime = normalizeTime((record.raw && record.raw.bitisSaati) || '');
                if (endTime || status === 'TAMAMLANDI' || status === 'BITTI' || status === 'KAPALI') {
                    index.add(shiftKey(record.dateIso, record.shift));
                }
            });
        return index;
    }

    function ensureOperatorStat(stats, key, name) {
        if (!stats.has(key)) {
            stats.set(key, {
                key,
                name: name || 'Bilinmeyen',
                moduleCounts: { hourly: 0, motor: 0, energy: 0, daily: 0, steam: 0, shift: 0 },
                manualTotal: 0,
                assignedExpected: 0,
                assignedMissing: 0,
                qualityPassed: 0,
                qualityTotal: 0,
                qualityPct: 0,
                hourlyAccuracyChecked: 0,
                hourlyAccuracyMatched: 0,
                hourlyAccuracyMismatched: 0,
                hourlyAccuracyPct: null,
                accuracyAdjustment: 0,
                motorPowerChecked: 0,
                motorPowerScoreTotal: 0,
                motorPowerAdjustment: 0,
                timelinessChecked: 0,
                timelyEntryCount: 0,
                lateEntryCount: 0,
                timelinessAdjustment: 0,
                repeatedValueWarnings: 0,
                repeatedValueAdjustment: 0,
                shiftCloseWarnings: 0,
                shiftCloseAdjustment: 0,
                extraWorkCount: 0,
                completion: 0,
                score: 0,
                level: getScoreLevel(0),
                days: new Set()
            });
        }
        return stats.get(key);
    }

    function aggregateMotorReport(range) {
        const aggregate = createMotorAggregate();
        const days = state.reportDays.filter(day => day.dateIso >= range.startDate && day.dateIso <= range.endDate);

        days.forEach(day => {
            MOTOR_KEYS.forEach(key => {
                aggregate[key].productionMwh += toNumber(day[key].productionMwh);
                aggregate[key].hours += toNumber(day[key].hours);
            });
        });

        MOTOR_KEYS.forEach(key => finalizeMotorMetric(aggregate[key]));
        aggregate.total.productionMwh = MOTOR_KEYS.reduce((sum, key) => sum + aggregate[key].productionMwh, 0);
        aggregate.total.hours = MOTOR_KEYS.reduce((sum, key) => sum + aggregate[key].hours, 0);
        finalizeMotorMetric(aggregate.total);
        aggregate.dayCount = days.length;
        aggregate.activeDayCount = days.filter(day => toNumber(day.total.productionMwh) > 0 || toNumber(day.total.hours) > 0).length;
        return aggregate;
    }

    function finalizeMotorMetric(metric) {
        metric.productionMwh = round(metric.productionMwh);
        metric.hours = round(metric.hours);
        metric.averageMw = metric.hours > 0 ? round(metric.productionMwh / metric.hours) : 0;
        metric.efficiency = metric.averageMw > 0 ? round((metric.averageMw / MOTOR_CAPACITY_MW) * 100) : 0;
    }

    function renderKpis(quality, rows, motorAggregate) {
        const avgScore = rows.length
            ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length
            : 0;
        setText('kpiManualData', formatInteger(quality.manualCount));
        setText('kpiMissingData', formatInteger(quality.missingCount));
        setText('kpiAverageScore', rows.length ? formatNumber(avgScore) : '--');
        setText('kpiMotorEfficiency', motorAggregate.total.efficiency > 0 ? `%${formatNumber(motorAggregate.total.efficiency)}` : '--');
    }

    function renderScoreBoard(rows) {
        const target = document.getElementById('scoreBoard');
        if (!target) return;
        if (!rows.length) {
            target.innerHTML = '<div class="empty-line">Secili aralikta operator verisi yok.</div>';
            return;
        }

        target.innerHTML = rows.slice(0, 8).map((row, index) => [
            '<div class="score-row">',
            `  <span class="score-rank">${index + 1}</span>`,
            '  <div class="score-main">',
            `    <strong>${escapeHtml(row.name)}</strong>`,
            `    <span>${formatInteger(row.manualTotal)} manuel kayit / %${formatNumber(row.qualityPct)} veri tamligi</span>`,
            '  </div>',
            `  <span class="score-pill ${getScoreClass(row.score)}">${formatInteger(row.score)}</span>`,
            '</div>'
        ].join('')).join('');
    }

    function renderOperatorTable(rows) {
        const body = document.getElementById('operatorTableBody');
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="23">Secili aralikta operator verisi yok.</td></tr>';
            return;
        }

        body.innerHTML = rows.map(row => [
            '<tr>',
            `<td>${escapeHtml(row.name)}</td>`,
            `<td>${formatInteger(row.moduleCounts.hourly)}</td>`,
            `<td>${formatInteger(row.moduleCounts.motor)}</td>`,
            `<td>${formatInteger(row.moduleCounts.energy)}</td>`,
            `<td>${formatInteger(row.moduleCounts.daily)}</td>`,
            `<td>${formatInteger(row.moduleCounts.steam)}</td>`,
            `<td>${formatInteger(row.moduleCounts.shift)}</td>`,
            `<td>${formatInteger(row.manualTotal)}</td>`,
            `<td>${formatNumber(row.assignedExpected)}</td>`,
            `<td>${formatNumber(row.assignedMissing)}</td>`,
            `<td>%${formatNumber(row.qualityPct)}</td>`,
            `<td>${formatInteger(row.hourlyAccuracyMatched)}</td>`,
            `<td>${formatInteger(row.hourlyAccuracyMismatched)}</td>`,
            `<td>${formatSignedNumber(row.motorPowerAdjustment)}</td>`,
            `<td>${formatInteger(row.motorPowerChecked)}</td>`,
            `<td>${formatSignedNumber(row.timelinessAdjustment)}</td>`,
            `<td>${formatInteger(row.lateEntryCount)}</td>`,
            `<td>${formatInteger(row.repeatedValueWarnings)}</td>`,
            `<td>${formatNumber(row.shiftCloseWarnings)}</td>`,
            `<td>${formatNumber(row.extraWorkCount)}</td>`,
            `<td>%${formatNumber(row.completion)}</td>`,
            `<td class="score-cell">${formatInteger(row.score)}</td>`,
            `<td><span class="level-pill ${row.level.className}">${escapeHtml(row.level.label)}</span></td>`,
            '</tr>'
        ].join('')).join('');
    }

    function renderMotorEfficiency(aggregate) {
        const target = document.getElementById('motorEfficiency');
        if (!target) return;
        const motors = MOTOR_KEYS.map(key => ({ key, label: MOTOR_LABELS[key], metric: aggregate[key] }));

        if (!aggregate.dayCount) {
            target.innerHTML = '<div class="empty-line">Secili aralikta enerji rapor verisi yok.</div>';
            return;
        }

        target.innerHTML = motors.map(item => {
            const metric = item.metric;
            const width = clamp(metric.efficiency, 0, 100);
            return [
                '<div class="motor-row">',
                '  <div class="motor-top">',
                `    <strong>${item.label}</strong>`,
                `    <span>%${formatNumber(metric.efficiency)}</span>`,
                '  </div>',
                '  <div class="efficiency-track">',
                `    <div class="efficiency-fill" style="width:${width}%"></div>`,
                '  </div>',
                '  <div class="motor-meta">',
                `    <span><b>${formatNumber(metric.productionMwh)}</b>MWh</span>`,
                `    <span><b>${formatNumber(metric.hours)}</b>saat</span>`,
                `    <span><b>${formatNumber(metric.averageMw)}</b>MW</span>`,
                '  </div>',
                '</div>'
            ].join('');
        }).join('');
    }

    function renderModuleSummary(quality) {
        const target = document.getElementById('moduleSummary');
        if (!target) return;
        const modules = getSelectedModules();
        if (!modules.length) {
            target.innerHTML = '';
            return;
        }

        target.innerHTML = modules.map(module => {
            const stats = quality.moduleStats[module] || { manual: 0, missing: 0, expected: 0 };
            const completion = stats.expected > 0
                ? clamp(((stats.expected - stats.missing) / stats.expected) * 100, 0, 100)
                : (stats.manual > 0 ? 100 : 0);
            return [
                '<div class="module-row">',
                '  <div class="module-top">',
                `    <strong>${MODULES[module].label}</strong>`,
                `    <span>%${formatNumber(completion)}</span>`,
                '  </div>',
                '  <div class="module-track">',
                `    <div class="module-fill" style="width:${clamp(completion, 0, 100)}%"></div>`,
                '  </div>',
                '  <div class="module-meta">',
                `    <span><b>${formatInteger(stats.manual)}</b>manuel</span>`,
                `    <span><b>${formatInteger(stats.missing)}</b>eksik/oto</span>`,
                '  </div>',
                '</div>'
            ].join('');
        }).join('');
    }

    function renderInsights(quality, rows, motorAggregate) {
        const target = document.getElementById('insightList');
        if (!target) return;
        const best = rows[0];
        const riskCount = rows.filter(row => row.score < 60).length;
        const missingRate = quality.expectedCount > 0 ? (quality.missingCount / quality.expectedCount) * 100 : 0;
        const fieldQuality = quality.fieldCheckTotal > 0
            ? (quality.fieldCheckPassed / quality.fieldCheckTotal) * 100
            : 0;
        const hourlyAccuracy = quality.hourlyAccuracyChecked > 0
            ? (quality.hourlyAccuracyMatched / quality.hourlyAccuracyChecked) * 100
            : 0;

        const insights = [
            {
                level: best ? 'ok' : 'warn',
                title: 'En yuksek puan',
                text: best ? `${best.name}: ${formatInteger(best.score)} puan, ${formatInteger(best.manualTotal)} manuel kayit.` : 'Operator verisi bulunamadi.'
            },
            {
                level: fieldQuality >= 95 ? 'ok' : 'warn',
                title: 'Veri tamligi',
                text: quality.fieldCheckTotal > 0
                    ? `%${formatNumber(fieldQuality)} alan dolu. Saatlik aktif/reaktif ve gunluk veri alanlari kontrol edildi.`
                    : 'Kontrol edilecek manuel veri alani bulunamadi.'
            },
            {
                level: quality.hourlyAccuracyChecked === 0 || hourlyAccuracy >= 95 ? 'ok' : 'warn',
                title: 'Saatlik fark kontrolu',
                text: quality.hourlyAccuracyChecked > 0
                    ? `%${formatNumber(hourlyAccuracy)} farksiz. ${formatInteger(quality.hourlyAccuracyMismatched)} farkli deger puani dusurdu.`
                    : 'Saatlik gercek/Aydem karsilastirmasi icin veri bulunamadi.'
            },
            {
                level: missingRate > 10 ? 'warn' : 'ok',
                title: 'Eksik kayit orani',
                text: `%${formatNumber(missingRate)} eksik/otomatik kayit etkisi gorunuyor.`
            },
            {
                level: quality.extraWorkCount > 0 ? 'ok' : 'warn',
                title: 'Vardiya ekstra is',
                text: `${formatNumber(quality.extraWorkCount)} ekstra is/devreden is puana dahil edildi.`
            },
            {
                level: riskCount > 0 ? 'warn' : 'ok',
                title: 'Riskteki operator',
                text: `${formatInteger(riskCount)} operator 60 puanin altinda.`
            },
            {
                level: motorAggregate.total.efficiency > 70 ? 'ok' : 'warn',
                title: 'Motor ortalama yuk',
                text: motorAggregate.total.efficiency > 0
                    ? `%${formatNumber(motorAggregate.total.efficiency)} verim, ${formatNumber(motorAggregate.total.averageMw)} MW ortalama.`
                    : 'Secili aralikta motor rapor verisi yok.'
            }
        ];

        target.innerHTML = insights.map(item => [
            `<div class="insight-item ${item.level}">`,
            '  <span class="insight-dot"></span>',
            '  <div>',
            `    <strong>${escapeHtml(item.title)}</strong>`,
            `    <span>${escapeHtml(item.text)}</span>`,
            '  </div>',
            '</div>'
        ].join('')).join('');
    }

    function renderNotices(quality) {
        const notices = state.loadErrors.slice();
        if (quality.unassignedMissing > 0) {
            notices.push(`${formatInteger(quality.unassignedMissing)} eksik/otomatik kayit vardiya operatoruyle eslesmedi.`);
        }
        if (quality.adminExcludedCount > 0) {
            notices.push(`${formatInteger(quality.adminExcludedCount)} Murat Coskun/admin kaydi operator puanindan haric tutuldu.`);
        }
        if (!notices.length) {
            hideNotice();
            return;
        }
        showNotice(notices.join(' | '));
    }

    function updateLabels(range, rows) {
        setText('scoreSubtitle', `${isoToTrDate(range.startDate)} - ${isoToTrDate(range.endDate)}`);
        setText('tableSubtitle', `${MODULE_LABEL_FOR_FILTER()} / manuel kayit ve eksik kayit etkisi`);
        setText('operatorCountChip', `${formatInteger(rows.length)} operator`);
    }

    function MODULE_LABEL_FOR_FILTER() {
        if (state.module === 'all') return 'Tum kayitlar';
        return MODULES[state.module] ? MODULES[state.module].label : 'Kayitlar';
    }

    function exportOperatorCsv() {
        if (!state.operatorRows.length) {
            showNotice('Disa aktarilacak operator verisi yok.');
            return;
        }

        const rows = [
            ['Operator', 'Saatlik', 'Motor', 'Enerji', 'Gunluk', 'Buhar', 'Vardiya', 'Manuel Toplam', 'Sorumlu Slot', 'Eksik/Oto', 'Veri Tamligi %', 'Farksiz', 'Farkli', 'Fark Puani', 'Motor Guc Puani', 'Kontrol Edilen Motor', 'Zaman Puani', 'Gec Kayit', 'Tekrar Uyarisi', 'Kapanis Uyarisi', 'Ekstra Is', 'Tamamlanma %', 'Puan', 'Seviye']
        ].concat(state.operatorRows.map(row => [
            row.name,
            row.moduleCounts.hourly,
            row.moduleCounts.motor,
            row.moduleCounts.energy,
            row.moduleCounts.daily,
            row.moduleCounts.steam,
            row.moduleCounts.shift,
            row.manualTotal,
            formatCsvNumber(row.assignedExpected),
            formatCsvNumber(row.assignedMissing),
            formatCsvNumber(row.qualityPct),
            row.hourlyAccuracyMatched,
            row.hourlyAccuracyMismatched,
            formatCsvNumber(row.accuracyAdjustment),
            formatCsvNumber(row.motorPowerAdjustment),
            formatCsvNumber(row.motorPowerChecked),
            formatCsvNumber(row.timelinessAdjustment),
            formatCsvNumber(row.lateEntryCount),
            formatCsvNumber(row.repeatedValueWarnings),
            formatCsvNumber(row.shiftCloseWarnings),
            formatCsvNumber(row.extraWorkCount),
            formatCsvNumber(row.completion),
            row.score,
            row.level.label
        ]));

        const csv = rows.map(row => row.map(csvCell).join(';')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `operator-verimlilik-${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
    }

    function createMissingEvent(record, reason) {
        return {
            module: record.module,
            dateIso: record.dateIso,
            shift: record.shift,
            hour: record.hour,
            motor: record.motor,
            reason
        };
    }

    function getOwnersForEvent(event, ownerMap) {
        const owners = ownerMap.get(shiftKey(event.dateIso, event.shift));
        if (!owners) return [];
        return Array.from(owners.entries()).map(([key, name]) => ({ key, name }));
    }

    function slotKeyForRecord(record) {
        if (!record || record.endOfDay) return '';
        if (record.module === 'shift') {
            return record.shift ? `shift|${record.dateIso}|${record.shift}` : '';
        }
        if (record.module === 'daily' || record.module === 'steam') {
            return `${record.module}|${record.dateIso}|day`;
        }
        if (record.hour < 0) return '';
        const motor = record.module === 'hourly' ? 'site' : record.motor;
        if (!motor) return '';
        return `${record.module}|${record.dateIso}|${motor}|${String(record.hour).padStart(2, '0')}`;
    }

    function getSelectedModules() {
        if (state.module === 'all') return MODULE_ORDER.slice();
        return MODULES[state.module] ? [state.module] : MODULE_ORDER.slice();
    }

    function moduleMatches(module) {
        return state.module === 'all' || module === state.module;
    }

    function getExpectedShiftsForDate(dateIso, todayIso, currentHour) {
        if (dateIso < todayIso) return SHIFT_NAMES.slice();
        if (dateIso > todayIso) return [];
        return SHIFT_NAMES.filter(shift => {
            if (shift === '24-08') return currentHour >= 0;
            if (shift === '08-16') return currentHour >= 8;
            return currentHour >= 16;
        });
    }

    function createEmptyQuality() {
        return {
            manualCount: 0,
            autoCount: 0,
            gapCount: 0,
            missingCount: 0,
            expectedCount: 0,
            unassignedMissing: 0,
            adminExcludedCount: 0,
            fieldCheckPassed: 0,
            fieldCheckTotal: 0,
            hourlyAccuracyChecked: 0,
            hourlyAccuracyMatched: 0,
            hourlyAccuracyMismatched: 0,
            extraWorkCount: 0,
            missingEvents: [],
            moduleStats: {
                hourly: { manual: 0, auto: 0, missing: 0, expected: 0 },
                motor: { manual: 0, auto: 0, missing: 0, expected: 0 },
                energy: { manual: 0, auto: 0, missing: 0, expected: 0 },
                daily: { manual: 0, auto: 0, missing: 0, expected: 0 },
                steam: { manual: 0, auto: 0, missing: 0, expected: 0 },
                shift: { manual: 0, auto: 0, missing: 0, expected: 0 }
            }
        };
    }

    function createMotorAggregate() {
        return {
            dayCount: 0,
            activeDayCount: 0,
            gm1: createMotorMetric(),
            gm2: createMotorMetric(),
            gm3: createMotorMetric(),
            total: createMotorMetric()
        };
    }

    function createMotorMetric() {
        return { productionMwh: 0, hours: 0, averageMw: 0, efficiency: 0 };
    }

    function getSelectedDateRange() {
        const today = toIsoDate(getTodayDateOnly());
        const startInput = document.getElementById('startDateInput');
        const endInput = document.getElementById('endDateInput');
        const start = startInput && startInput.value ? startInput.value : today;
        const end = endInput && endInput.value ? endInput.value : today;
        return {
            startDate: start,
            endDate: end,
            valid: !start || !end || start <= end
        };
    }

    function listYearsInRange(startIso, endIso) {
        const startYear = parseInt(String(startIso).slice(0, 4), 10) || new Date().getFullYear();
        const endYear = parseInt(String(endIso).slice(0, 4), 10) || startYear;
        const years = [];
        for (let year = startYear; year <= endYear; year += 1) {
            years.push(year);
        }
        return years;
    }

    function listDates(startIso, endIso) {
        if (!startIso || !endIso || startIso > endIso) return [];
        const dates = [];
        const current = parseIsoDate(startIso);
        const end = parseIsoDate(endIso);
        while (current <= end) {
            dates.push(toIsoDate(current));
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    function isInRange(dateIso, range) {
        return dateIso >= range.startDate && dateIso <= range.endDate;
    }

    function minIso(a, b) {
        if (!a) return b;
        if (!b) return a;
        return a <= b ? a : b;
    }

    function shiftKey(dateIso, shift) {
        return `${dateIso}|${normalizeShift(shift)}`;
    }

    function normalizeDate(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (isoMatch) {
            return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
        }
        const trMatch = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
        if (trMatch) {
            return `${trMatch[3]}-${trMatch[2].padStart(2, '0')}-${trMatch[1].padStart(2, '0')}`;
        }
        return '';
    }

    function normalizeTime(value) {
        const match = String(value || '').match(/(\d{1,2})[:.](\d{2})/);
        if (!match) return '';
        return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
    }

    function parseRecordDateTime(value) {
        const text = String(value || '').trim();
        if (!text) return null;

        const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/);
        if (iso) {
            return new Date(
                parseInt(iso[1], 10),
                parseInt(iso[2], 10) - 1,
                parseInt(iso[3], 10),
                parseInt(iso[4] || '0', 10),
                parseInt(iso[5] || '0', 10),
                parseInt(iso[6] || '0', 10)
            );
        }

        const tr = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/);
        if (tr) {
            return new Date(
                parseInt(tr[3], 10),
                parseInt(tr[2], 10) - 1,
                parseInt(tr[1], 10),
                parseInt(tr[4] || '0', 10),
                parseInt(tr[5] || '0', 10),
                parseInt(tr[6] || '0', 10)
            );
        }

        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function getExpectedRecordDateTime(dateIso, hour) {
        if (!dateIso || hour < 0) return null;
        const date = parseIsoDate(dateIso);
        date.setHours(hour, 0, 0, 0);
        return date;
    }

    function getHourFromTime(value) {
        const time = normalizeTime(value);
        if (!time) return -1;
        const hour = parseInt(time.slice(0, 2), 10);
        if (!Number.isFinite(hour)) return -1;
        return Math.max(0, Math.min(23, hour));
    }

    function getShiftFromHour(hour) {
        if (hour >= 8 && hour < 16) return '08-16';
        if (hour >= 16 && hour < 24) return '16-24';
        return '24-08';
    }

    function normalizeShift(value) {
        const text = String(value || '').trim();
        if (/08\s*[-/]\s*16/.test(text)) return '08-16';
        if (/16\s*[-/]\s*24/.test(text)) return '16-24';
        if (/24\s*[-/]\s*08|00\s*[-/]\s*08/.test(text)) return '24-08';
        return text || 'Bilinmeyen';
    }

    function normalizeMotorKey(value) {
        const text = String(value || '').toLowerCase();
        if (/gm\s*[-_ ]?\s*1/.test(text)) return 'gm1';
        if (/gm\s*[-_ ]?\s*2/.test(text)) return 'gm2';
        if (/gm\s*[-_ ]?\s*3/.test(text)) return 'gm3';
        return '';
    }

    function uniqueNames(values) {
        const map = new Map();
        values.forEach(value => {
            splitNames(value).forEach(name => map.set(normalizeNameKey(name), name));
        });
        return Array.from(map.values()).filter(Boolean);
    }

    function splitNames(value) {
        return String(value || '')
            .split(/[,;/+&]| ve /i)
            .map(cleanName)
            .filter(name => name && !isAutomaticOperator(name));
    }

    function cleanName(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function normalizeNameKey(value) {
        return cleanName(value).toLocaleUpperCase('tr-TR');
    }

    function isAutomaticOperator(value) {
        return AUTO_OPERATOR_PATTERN.test(String(value || ''));
    }

    function isExcludedOperator(value) {
        return EXCLUDED_OPERATOR_NAME_KEYS.has(normalizeLooseName(value));
    }

    function normalizeLooseName(value) {
        return cleanName(value)
            .toLocaleUpperCase('tr-TR')
            .replace(/\u0130/g, 'I')
            .replace(/\u015e/g, 'S')
            .replace(/\u011e/g, 'G')
            .replace(/\u00dc/g, 'U')
            .replace(/\u00d6/g, 'O')
            .replace(/\u00c7/g, 'C')
            .replace(/\u00c2/g, 'A')
            .replace(/\u00ce/g, 'I')
            .replace(/\u00db/g, 'U');
    }

    function getScoreLevel(score) {
        if (score >= 90) return { label: 'Mukemmel', className: 'good' };
        if (score >= 75) return { label: 'Iyi', className: 'watch' };
        if (score >= 60) return { label: 'Izlemede', className: 'warn' };
        return { label: 'Risk', className: 'risk' };
    }

    function getScoreClass(score) {
        if (score < 60) return 'risk';
        if (score < 75) return 'warn';
        return '';
    }

    function getTodayDateOnly() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function getWeekStart(date) {
        const day = date.getDay();
        const offset = day === 0 ? -6 : 1 - day;
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        start.setDate(start.getDate() + offset);
        return start;
    }

    function parseIsoDate(value) {
        const parts = String(value || '').split('-').map(Number);
        return new Date(parts[0] || new Date().getFullYear(), (parts[1] || 1) - 1, parts[2] || 1);
    }

    function toIsoDate(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    function isoToTrDate(value) {
        const parts = String(value || '').split('-');
        if (parts.length !== 3) return value || '';
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function toNumber(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (value === null || value === undefined || value === '') return 0;
        const text = String(value).trim();
        const normalized = text.includes(',')
            ? text.replace(/\./g, '').replace(',', '.')
            : text;
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function hasFilledValue(value) {
        if (value === null || value === undefined) return false;
        return String(value).trim() !== '';
    }

    function round(value) {
        return Math.round(toNumber(value) * 1000) / 1000;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, toNumber(value)));
    }

    function formatNumber(value) {
        return numberFormat.format(round(value));
    }

    function formatInteger(value) {
        return integerFormat.format(Math.round(toNumber(value)));
    }

    function formatSignedNumber(value) {
        const number = round(value);
        if (number > 0) return `+${formatNumber(number)}`;
        return formatNumber(number);
    }

    function formatCsvNumber(value) {
        return String(round(value)).replace('.', ',');
    }

    function csvCell(value) {
        const text = String(value === null || value === undefined ? '' : value);
        return `"${text.replace(/"/g, '""')}"`;
    }

    function setLoading(isLoading) {
        const button = document.getElementById('refreshReportBtn');
        if (!button) return;
        button.disabled = isLoading;
        button.classList.toggle('loading', isLoading);
    }

    function showNotice(message) {
        const notice = document.getElementById('operatorNotice');
        if (!notice) return;
        notice.hidden = false;
        notice.textContent = message;
    }

    function hideNotice() {
        const notice = document.getElementById('operatorNotice');
        if (!notice) return;
        notice.hidden = true;
        notice.textContent = '';
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    function renderUnauthorized() {
        document.body.innerHTML = [
            '<div class="lock-screen">',
            '  <section class="lock-panel">',
            '    <h1>Yetki Gerekli</h1>',
            '    <p>Bu sayfa sadece admin kullanicilar icindir.</p>',
            '    <a href="anasayfa.html">Ana Sayfaya Don</a>',
            '  </section>',
            '</div>'
        ].join('');
    }

    function renderFatalError(error) {
        const message = error && (error.stack || error.message) ? (error.stack || error.message) : String(error || 'Bilinmeyen hata');
        const notice = document.getElementById('operatorNotice');
        if (notice) {
            notice.hidden = false;
            notice.textContent = `Operator verimlilik sayfasi baslatilamadi: ${message}`;
            return;
        }
        document.body.innerHTML = [
            '<div class="lock-screen">',
            '  <section class="lock-panel">',
            '    <h1>Sayfa Hatasi</h1>',
            `    <p>${escapeHtml(message)}</p>`,
            '  </section>',
            '</div>'
        ].join('');
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();
