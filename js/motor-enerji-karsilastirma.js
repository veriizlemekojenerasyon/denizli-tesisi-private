(function () {
    'use strict';

    const MOTORS = ['GM-1', 'GM-2', 'GM-3'];
    const MOTOR_CAPACITY_MW = 3.45;
    const MAX_TABLE_ROWS = 400;
    const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
    const integerFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

    const state = {
        period: 'weekly',
        motor: 'all',
        risk: 'all',
        comparisons: [],
        filtered: [],
        unmatched: [],
        loadErrors: []
    };

    document.addEventListener('DOMContentLoaded', () => {
        try {
            initPage();
        } catch (error) {
            renderFatalError(error);
        }
    });

    function initPage() {
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
            status === 'ADMIN' ||
            user.isAdmin === true ||
            user.admin === true ||
            normalizeLooseName(fullName || user.email || '') === 'MURAT COSKUN';
    }

    function setCurrentUserName(user) {
        const fullName = [user.firstName || user.ad || user.name || '', user.lastName || user.soyad || '']
            .join(' ')
            .trim() || user.email || 'Admin';
        document.querySelectorAll('#userNameDisplay, #sidebarUserNameDisplay').forEach(node => {
            node.textContent = fullName;
        });
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

        const startInput = document.getElementById('startDateInput');
        const endInput = document.getElementById('endDateInput');
        const motorFilter = document.getElementById('motorFilter');
        const riskFilter = document.getElementById('riskFilter');
        const refreshButton = document.getElementById('refreshReportBtn');
        const exportButton = document.getElementById('exportCsvBtn');

        if (startInput) startInput.addEventListener('change', loadDashboard);
        if (endInput) endInput.addEventListener('change', loadDashboard);
        if (refreshButton) refreshButton.addEventListener('click', loadDashboard);
        if (exportButton) exportButton.addEventListener('click', exportCsv);
        if (motorFilter) {
            motorFilter.addEventListener('change', event => {
                state.motor = event.target.value || 'all';
                renderDashboard();
            });
        }
        if (riskFilter) {
            riskFilter.addEventListener('change', event => {
                state.risk = event.target.value || 'all';
                renderDashboard();
            });
        }

        const motorCards = document.getElementById('motorCards');
        if (motorCards) {
            motorCards.addEventListener('click', event => {
                const trigger = event.target.closest('[data-detail-key]');
                if (!trigger) return;
                const row = state.filtered.find(item => item.key === trigger.dataset.detailKey);
                if (row) showRecordModal(row, trigger.dataset.metricLabel || '');
            });
        }
    }

    function applyCurrentRangeForPeriod(period) {
        const today = getTodayDateOnly();
        let startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        let endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

        if (period === 'weekly') {
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
        } else if (period === 'monthly') {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        }

        setInputValue('startDateInput', toIsoDate(startDate));
        setInputValue('endDateInput', toIsoDate(endDate));
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

        try {
            const [motorResult, energyResult] = await Promise.allSettled([
                fetchRecords('motor', 'Kojen motor'),
                fetchRecords('enerji', 'Kojen enerji')
            ]);

            const motorRows = unwrapRows(motorResult, 'Kojen motor').map(normalizeMotorRecord).filter(Boolean);
            const energyRows = unwrapRows(energyResult, 'Kojen enerji').map(normalizeEnergyRecord).filter(Boolean);
            const rangeMotorRows = motorRows.filter(row => isRecordInRange(row, range));
            const rangeEnergyRows = attachEnergyDeltas(energyRows).filter(row => isRecordInRange(row, range));

            const built = buildComparisons(rangeMotorRows, rangeEnergyRows);
            state.comparisons = built.comparisons;
            state.unmatched = built.unmatched;

            renderDashboard();
        } catch (error) {
            console.error('Motor enerji karsilastirma yuklenemedi:', error);
            showNotice(error.message || String(error));
            renderEmptyDashboard();
        } finally {
            setLoading(false);
        }
    }

    async function fetchRecords(key, label) {
        const scriptUrl = window.AppConfig && window.AppConfig.getScriptUrl ? window.AppConfig.getScriptUrl(key) : '';
        if (!scriptUrl) throw new Error(`${label} API adresi bulunamadi.`);
        const result = await fetchJson(scriptUrl, { action: 'getRecords' });
        return result.data || [];
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
            throw new Error(`JSON okunamadi: ${text.slice(0, 180)}`);
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
        }
        if (result && result.success === false) {
            throw new Error(result.error || result.message || 'API basarisiz dondu.');
        }
        return result || {};
    }

    function unwrapRows(result, label) {
        if (result.status === 'fulfilled') return Array.isArray(result.value) ? result.value : [];
        state.loadErrors.push(`${label}: ${result.reason.message || result.reason}`);
        return [];
    }

    function normalizeMotorRecord(row) {
        const date = normalizeDateValue(row.tarih || row.Tarih || row.date || '');
        const hour = normalizeHour(row.saat || row.Saat || row.hour || '');
        const motor = normalizeMotorName(row.motor || row.Motor || '');
        if (!date || !hour || !motor) return null;

        return {
            source: 'motor',
            key: buildKey(date, hour, motor),
            date,
            hour,
            motor,
            timestamp: parseDateTime(date, hour).getTime(),
            shift: row.vardiya || row.Vardiya || '',
            status: row.durum || row.Durum || '',
            savedBy: row.kaydeden || row.Kaydeden || '',
            bearingDE: parseNumber(row.jenYatakSicaklikDE),
            bearingNDE: parseNumber(row.jenYatakSicaklikNDE),
            coolingTemp: parseNumber(row.sogutmaSuyuSicaklik),
            coolingPressure: parseNumber(row.sogutmaSuyuBasinc),
            oilTemp: parseNumber(row.yagSicaklik),
            oilPressure: parseNumber(row.yagBasinc),
            chargeTemp: parseNumber(row.sarjSicaklik),
            chargePressure: parseNumber(row.sarjBasinc),
            gasRegulator: parseNumber(row.gazRegulatoru),
            roomTemp: parseNumber(row.makineDairesiSicaklik),
            crankPressure: parseNumber(row.karterBasinc),
            preChamberPressure: parseNumber(row.onKamaraFarkBasinc),
            winding1: parseNumber(row.sargiSicaklik1),
            winding2: parseNumber(row.sargiSicaklik2),
            winding3: parseNumber(row.sargiSicaklik3)
        };
    }

    function normalizeEnergyRecord(row) {
        const date = normalizeDateValue(row.tarih || row.Tarih || row.date || '');
        const hour = normalizeHour(row.saat || row.Saat || row.hour || '');
        const motor = normalizeMotorName(row.motor || row.Motor || '');
        if (!date || !hour || !motor) return null;

        return {
            source: 'energy',
            key: buildKey(date, hour, motor),
            date,
            hour,
            motor,
            timestamp: parseDateTime(date, hour).getTime(),
            shift: row.vardiya || row.Vardiya || '',
            status: row.durum || row.Durum || '',
            savedBy: row.kaydeden || row.Kaydeden || '',
            voltage: parseNumber(row.aydemVoltaji),
            activePower: parseNumber(row.aktifGuc),
            reactivePower: parseNumber(row.reaktifGuc),
            cosPhi: parseNumber(row.cosPhi),
            current: parseNumber(row.ortAkim),
            averageVoltage: parseNumber(row.ortGerilim),
            neutralCurrent: parseNumber(row.notrAkim),
            driveVoltage: parseNumber(row.tahrikGerilimi),
            totalEnergy: parseNumber(row.toplamAktifEnerji),
            runningHours: parseNumber(row.calismaSaati),
            startCount: parseNumber(row.kalkisSayisi),
            productionDelta: null,
            hoursDelta: null
        };
    }

    function attachEnergyDeltas(rows) {
        const sorted = rows.slice().sort((a, b) => a.timestamp - b.timestamp || a.motor.localeCompare(b.motor));
        const lastByMotor = {};
        sorted.forEach(row => {
            const previous = lastByMotor[row.motor];
            if (previous) {
                row.productionDelta = round(row.totalEnergy - previous.totalEnergy, 3);
                row.hoursDelta = round(row.runningHours - previous.runningHours, 3);
                row.previousStatus = previous.status || '';
                row.previousActivePower = previous.activePower;
                row.previousProductionDelta = previous.productionDelta;
            }
            lastByMotor[row.motor] = row;
        });
        return rows;
    }

    function buildComparisons(motorRows, energyRows) {
        const motorByKey = new Map();
        const energyByKey = new Map();
        motorRows.forEach(row => motorByKey.set(row.key, row));
        energyRows.forEach(row => energyByKey.set(row.key, row));

        const allKeys = new Set([].concat(Array.from(motorByKey.keys()), Array.from(energyByKey.keys())));
        const comparisons = [];
        const unmatched = [];

        allKeys.forEach(key => {
            const motor = motorByKey.get(key) || null;
            const energy = energyByKey.get(key) || null;
            if (motor && energy) {
                comparisons.push(analyzePair(motor, energy));
            } else {
                const record = motor || energy;
                unmatched.push({
                    key,
                    date: record.date,
                    hour: record.hour,
                    motor: record.motor,
                    source: motor ? 'Motor veri var, enerji veri yok' : 'Enerji veri var, motor veri yok',
                    severity: 'warn'
                });
            }
        });

        comparisons.sort((a, b) => b.timestamp - a.timestamp || a.motor.localeCompare(b.motor));
        unmatched.sort((a, b) => parseDateTime(b.date, b.hour) - parseDateTime(a.date, a.hour));
        return { comparisons, unmatched };
    }

    function analyzePair(motor, energy) {
        const issues = [];
        const motorStopped = isStoppedStatus(motor.status);
        const energyStopped = isStoppedStatus(energy.status);
        const running = !motorStopped && !energyStopped;
        const startupStatusTransition = !motorStopped &&
            energyStopped &&
            isStoppedStatus(energy.previousStatus);
        const shutdownStatusTransition = motorStopped &&
            !energyStopped &&
            energy.productionDelta !== null &&
            energy.productionDelta > 0 &&
            !isStoppedStatus(energy.previousStatus);
        const startupTransition = running &&
            energy.activePower <= 0.2 &&
            isStoppedStatus(energy.previousStatus);
        const shutdownTransition = (motorStopped || energyStopped) &&
            energy.activePower > 0.25 &&
            energy.productionDelta !== null &&
            energy.productionDelta > 0 &&
            !isStoppedStatus(energy.previousStatus);
        const windingValues = [motor.winding1, motor.winding2, motor.winding3].filter(value => value > 0);
        const windingAverage = windingValues.length ? average(windingValues) : 0;
        const windingMax = windingValues.length ? Math.max.apply(null, windingValues) : 0;
        const windingMin = windingValues.length ? Math.min.apply(null, windingValues) : 0;
        const windingSpread = windingValues.length ? windingMax - windingMin : 0;
        const motorAllZero = [
            motor.bearingDE, motor.bearingNDE, motor.coolingTemp, motor.coolingPressure,
            motor.oilTemp, motor.oilPressure, motor.chargeTemp, motor.chargePressure,
            motor.winding1, motor.winding2, motor.winding3
        ].every(value => value === 0);

        if (motorStopped !== energyStopped && !startupStatusTransition && !shutdownStatusTransition) {
            addIssue(issues, 'critical', 'Durum celiskisi', 'Motor veri ve enerji veri ayni calisma durumunu gostermiyor.');
        }
        if (running && energy.activePower <= 0.2 && !startupTransition) {
            addIssue(issues, 'critical', 'Normal ama guc yok', 'Durum normal gorunuyor ancak aktif guc dusuk.');
        }
        if ((motorStopped || energyStopped) && energy.activePower > 0.25 && !shutdownTransition) {
            addIssue(issues, 'critical', 'Calismiyor ama guc var', 'Durum calismiyor gorunurken enerji uretimi okunuyor.');
        }
        if (energy.activePower > MOTOR_CAPACITY_MW * 1.08) {
            addIssue(issues, 'critical', 'Aktif guc limit ustu', 'Aktif guc motor kapasitesinin uzerinde gorunuyor.');
        } else if (energy.activePower > MOTOR_CAPACITY_MW) {
            addIssue(issues, 'warn', 'Aktif guc yuksek', 'Aktif guc nominal sinira yakin.');
        }
        if (running && energy.cosPhi > 0 && energy.cosPhi < 0.8) {
            addIssue(issues, 'critical', 'Cos phi kritik', 'Guc faktoru kritik seviyede dusuk.');
        } else if (running && energy.cosPhi > 0 && energy.cosPhi < 0.9) {
            addIssue(issues, 'warn', 'Cos phi dusuk', 'Guc faktoru izlenmeli.');
        } else if (energy.cosPhi > 1.03) {
            addIssue(issues, 'warn', 'Cos phi supheli', 'Cos phi 1 uzerinde gorunuyor.');
        }
        if (energy.productionDelta !== null && energy.productionDelta < -0.01) {
            addIssue(issues, 'critical', 'Enerji sayaci geriye dusmus', 'Toplam aktif enerji onceki kayda gore azalmis.');
        }
        if (energy.hoursDelta !== null && energy.hoursDelta < -0.01) {
            addIssue(issues, 'critical', 'Calisma saati geriye dusmus', 'Calisma saati onceki kayda gore azalmis.');
        }
        if (running && energy.productionDelta !== null && energy.activePower > 0.5) {
            const productionGap = Math.abs(energy.productionDelta - energy.activePower);
            if (productionGap > Math.max(0.8, energy.activePower * 0.35)) {
                addIssue(issues, 'warn', 'Guc-uretim farki', 'Saatlik uretim farki aktif guc ile uyumsuz.');
            }
        }
        if (running && energy.hoursDelta !== null && energy.activePower > 0.5 && energy.hoursDelta < 0.4) {
            addIssue(issues, 'warn', 'Calisma saati artmamis', 'Motor yukteyken calisma saati beklenen kadar artmamis.');
        }
        if (running && motorAllZero) {
            addIssue(issues, 'critical', 'Motor olcumleri bos', 'Durum normal fakat motor sicaklik/basinc degerleri sifir.');
        }

        if (windingAverage >= 120) {
            addIssue(issues, 'critical', 'Sargi sicakligi kritik', 'Sargi ortalama sicakligi yuksek.');
        } else if (windingAverage >= 110) {
            addIssue(issues, 'warn', 'Sargi sicakligi yuksek', 'Sargi sicakligi izleme bolgesinde.');
        }
        if (windingSpread >= 30) {
            addIssue(issues, 'critical', 'Sargi dengesizligi kritik', 'Sargi sicakliklari arasinda belirgin fark var.');
        } else if (windingSpread >= 18) {
            addIssue(issues, 'warn', 'Sargi dengesizligi', 'Sargi faz sicakliklari dengeli degil.');
        }
        if (motor.chargeTemp >= 75) {
            addIssue(issues, 'critical', 'Sarj sicakligi kritik', 'Sarj hava sicakligi kritik seviyede.');
        } else if (motor.chargeTemp >= 65) {
            addIssue(issues, 'warn', 'Sarj sicakligi yuksek', 'Sarj hava sicakligi izlenmeli.');
        }
        if (motor.chargePressure > 0 && motor.chargePressure < 0.5) {
            addIssue(issues, 'critical', 'Sarj basinci dusuk', 'Sarj basinci kritik dusuk gorunuyor.');
        } else if (motor.chargePressure > 0 && motor.chargePressure < 0.8) {
            addIssue(issues, 'warn', 'Sarj basinci dusuk', 'Sarj basinci dusuk bolgede.');
        } else if (motor.chargePressure > 2.6) {
            addIssue(issues, 'warn', 'Sarj basinci yuksek', 'Sarj basinci normal ustu gorunuyor.');
        }
        if (motor.oilTemp >= 95) {
            addIssue(issues, 'critical', 'Yag sicakligi kritik', 'Yag sicakligi kritik seviyede.');
        } else if (motor.oilTemp >= 85) {
            addIssue(issues, 'warn', 'Yag sicakligi yuksek', 'Yag sicakligi izlenmeli.');
        }
        if (motor.oilPressure > 0 && motor.oilPressure < 2) {
            addIssue(issues, 'critical', 'Yag basinci kritik', 'Yag basinci kritik dusuk.');
        } else if (motor.oilPressure > 0 && motor.oilPressure < 2.5) {
            addIssue(issues, 'warn', 'Yag basinci dusuk', 'Yag basinci dusuk bolgede.');
        } else if (motor.oilPressure > 6) {
            addIssue(issues, 'warn', 'Yag basinci yuksek', 'Yag basinci normal ustu gorunuyor.');
        }
        if (motor.coolingTemp >= 95) {
            addIssue(issues, 'critical', 'Sogutma sicakligi kritik', 'Sogutma suyu sicakligi kritik seviyede.');
        } else if (motor.coolingTemp >= 88) {
            addIssue(issues, 'warn', 'Sogutma sicakligi yuksek', 'Sogutma suyu sicakligi izlenmeli.');
        }
        if (motor.coolingPressure > 0 && motor.coolingPressure < 0.8) {
            addIssue(issues, 'critical', 'Sogutma basinci kritik', 'Sogutma suyu basinci kritik dusuk.');
        } else if (motor.coolingPressure > 0 && motor.coolingPressure < 1) {
            addIssue(issues, 'warn', 'Sogutma basinci dusuk', 'Sogutma suyu basinci dusuk bolgede.');
        }
        if (Math.max(motor.bearingDE, motor.bearingNDE) >= 95) {
            addIssue(issues, 'critical', 'Jenerator yatak sicakligi kritik', 'Jenerator yatak sicakligi kritik seviyede.');
        } else if (Math.max(motor.bearingDE, motor.bearingNDE) >= 85) {
            addIssue(issues, 'warn', 'Jenerator yatak sicakligi yuksek', 'Jenerator yatak sicakligi izlenmeli.');
        }
        if (energy.activePower >= 2.8 && windingAverage >= 105) {
            addIssue(issues, 'warn', 'Yuksek yuk sicak calisma', 'Yuk ve sargi sicakligi birlikte yuksek.');
        }
        if (energy.activePower <= 0.3 && windingAverage >= 90 && running) {
            addIssue(issues, 'warn', 'Dusuk yukta sicaklik', 'Aktif guc dusukken motor sicakligi yuksek.');
        }

        const score = calculateScore(issues);
        const level = getRiskLevel(score, issues);

        return {
            key: motor.key,
            date: motor.date,
            hour: motor.hour,
            motor: motor.motor,
            timestamp: motor.timestamp,
            shift: motor.shift || energy.shift || '',
            motorStatus: motor.status || '',
            energyStatus: energy.status || '',
            activePower: energy.activePower,
            reactivePower: energy.reactivePower,
            cosPhi: energy.cosPhi,
            totalEnergy: energy.totalEnergy,
            runningHours: energy.runningHours,
            productionDelta: energy.productionDelta,
            hoursDelta: energy.hoursDelta,
            windingAverage,
            windingSpread,
            windingMax,
            chargeTemp: motor.chargeTemp,
            chargePressure: motor.chargePressure,
            oilTemp: motor.oilTemp,
            oilPressure: motor.oilPressure,
            coolingTemp: motor.coolingTemp,
            coolingPressure: motor.coolingPressure,
            bearingDE: motor.bearingDE,
            bearingNDE: motor.bearingNDE,
            winding1: motor.winding1,
            winding2: motor.winding2,
            winding3: motor.winding3,
            voltage: energy.voltage,
            current: energy.current,
            averageVoltage: energy.averageVoltage,
            neutralCurrent: energy.neutralCurrent,
            driveVoltage: energy.driveVoltage,
            startCount: energy.startCount,
            motorSavedBy: motor.savedBy || '',
            energySavedBy: energy.savedBy || '',
            score,
            level,
            behavior: level === 'critical' ? 'Normal degil' : (level === 'warn' ? 'Izle' : 'Normal'),
            issues
        };
    }

    function addIssue(issues, severity, title, detail) {
        issues.push({ severity, title, detail });
    }

    function calculateScore(issues) {
        let score = 100;
        issues.forEach(issue => {
            score -= issue.severity === 'critical' ? 18 : issue.severity === 'warn' ? 8 : 3;
        });
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    function getRiskLevel(score, issues) {
        if (issues.some(issue => issue.severity === 'critical') || score < 60) return 'critical';
        if (issues.some(issue => issue.severity === 'warn') || score < 85) return 'warn';
        return 'good';
    }

    function renderDashboard() {
        state.filtered = filterComparisons(state.comparisons);
        const normalTableRows = state.filtered.filter(isNormalTableRow);
        const aggregate = buildAggregate(state.filtered);
        renderKpis(aggregate, normalTableRows.length);
        renderMotorCards(aggregate);
        renderSignals(aggregate);
        renderTable(normalTableRows);
        renderIssues(state.filtered);
        renderUnmatched();

        if (state.loadErrors.length) {
            showNotice(state.loadErrors.join(' | '));
        } else {
            hideNotice();
        }
    }

    function filterComparisons(rows) {
        return rows.filter(row => {
            if (state.motor !== 'all' && row.motor !== state.motor) return false;
            if (state.risk !== 'all' && row.level !== state.risk) return false;
            return true;
        });
    }

    function isNormalTableRow(row) {
        return row.level === 'good' &&
            !isStoppedStatus(row.motorStatus) &&
            !isStoppedStatus(row.energyStatus);
    }

    function buildAggregate(rows) {
        const motorStats = {};
        MOTORS.forEach(motor => {
            motorStats[motor] = {
                motor,
                count: 0,
                scoreSum: 0,
                critical: 0,
                warn: 0,
                good: 0,
                powerSum: 0,
                production: 0,
                cosPhiSum: 0,
                cosPhiCount: 0,
                minCosPhi: null,
                windingAverageSum: 0,
                windingCount: 0,
                maxWinding: 0,
                maxWindingSpread: 0,
                chargeTempSum: 0,
                chargeTempCount: 0,
                maxChargeTemp: 0,
                chargePressureSum: 0,
                chargePressureCount: 0,
                minChargePressure: null,
                oilTempSum: 0,
                oilTempCount: 0,
                maxOilTemp: 0,
                oilPressureSum: 0,
                oilPressureCount: 0,
                minOilPressure: null,
                detailRefs: {},
                topIssues: {}
            };
        });

        const signals = {};
        let criticalSignals = 0;
        let scoreSum = 0;
        let production = 0;

        rows.forEach(row => {
            const stat = motorStats[row.motor] || motorStats[normalizeMotorName(row.motor)];
            if (!stat) return;
            stat.count++;
            stat.scoreSum += row.score;
            stat[row.level]++;
            stat.powerSum += row.activePower;
            if (row.productionDelta !== null && row.productionDelta > 0) {
                stat.production += row.productionDelta;
                production += row.productionDelta;
            }
            if (row.cosPhi > 0) {
                stat.cosPhiSum += row.cosPhi;
                stat.cosPhiCount++;
                stat.minCosPhi = minPositive(stat.minCosPhi, row.cosPhi);
            }
            if (row.windingAverage > 0) {
                stat.windingAverageSum += row.windingAverage;
                stat.windingCount++;
            }
            updateMaxDetail(stat, 'maxWinding', 'maxWinding', row.windingMax || row.windingAverage || 0, row);
            updateMaxDetail(stat, 'maxWindingSpread', 'maxWindingSpread', row.windingSpread || 0, row);
            if (row.chargeTemp > 0) {
                stat.chargeTempSum += row.chargeTemp;
                stat.chargeTempCount++;
            }
            updateMaxDetail(stat, 'maxChargeTemp', 'maxChargeTemp', row.chargeTemp || 0, row);
            if (row.chargePressure > 0) {
                stat.chargePressureSum += row.chargePressure;
                stat.chargePressureCount++;
            }
            updateMinPositiveDetail(stat, 'minChargePressure', 'minChargePressure', row.chargePressure, row);
            if (row.oilTemp > 0) {
                stat.oilTempSum += row.oilTemp;
                stat.oilTempCount++;
            }
            updateMaxDetail(stat, 'maxOilTemp', 'maxOilTemp', row.oilTemp || 0, row);
            if (row.oilPressure > 0) {
                stat.oilPressureSum += row.oilPressure;
                stat.oilPressureCount++;
            }
            updateMinPositiveDetail(stat, 'minOilPressure', 'minOilPressure', row.oilPressure, row);
            scoreSum += row.score;

            row.issues.forEach(issue => {
                if (issue.severity === 'critical') criticalSignals++;
                const key = issue.title + '|' + issue.severity;
                if (!signals[key]) {
                    signals[key] = {
                        title: issue.title,
                        severity: issue.severity,
                        count: 0,
                        motors: new Set(),
                        detail: issue.detail
                    };
                }
                signals[key].count++;
                signals[key].motors.add(row.motor);
                stat.topIssues[issue.title] = (stat.topIssues[issue.title] || 0) + 1;
            });
        });

        return {
            rows,
            matchedCount: rows.length,
            totalCompared: state.comparisons.length,
            unmatchedCount: state.unmatched.length,
            averageScore: rows.length ? Math.round(scoreSum / rows.length) : 0,
            criticalSignals,
            production,
            motorStats,
            signals: Object.values(signals).sort((a, b) => b.count - a.count)
        };
    }

    function updateMaxDetail(stat, field, refKey, value, row) {
        const number = Number(value || 0);
        if (number > stat[field]) {
            stat[field] = number;
            stat.detailRefs[refKey] = row.key;
        }
    }

    function updateMinPositiveDetail(stat, field, refKey, value, row) {
        const number = Number(value || 0);
        if (!number || number <= 0) return;
        if (stat[field] === null || number < stat[field]) {
            stat[field] = number;
            stat.detailRefs[refKey] = row.key;
        }
    }

    function renderKpis(aggregate, normalTableCount) {
        const matchRate = aggregate.totalCompared || state.unmatched.length
            ? Math.round((aggregate.totalCompared / (aggregate.totalCompared + state.unmatched.length)) * 100)
            : 0;
        setText('kpiMatched', integerFormat.format(aggregate.matchedCount));
        setText('kpiMatchRate', `%${matchRate} eslesme`);
        setText('kpiHealthScore', aggregate.averageScore ? `${aggregate.averageScore}` : '--');
        setText('kpiCriticalCount', integerFormat.format(aggregate.criticalSignals));
        setText('kpiProduction', `${formatNumber(aggregate.production)} MWh`);
        setText('tableSubtitle', `${integerFormat.format(normalTableCount || 0)} normal durum satiri, ${integerFormat.format(aggregate.matchedCount)} eslesen kayit icinden`);
        setText('motorCardsSubtitle', getRangeSubtitle());
    }

    function renderMotorCards(aggregate) {
        const container = document.getElementById('motorCards');
        if (!container) return;
        container.innerHTML = MOTORS.map(motor => {
            const stat = aggregate.motorStats[motor];
            const averageScore = stat.count ? Math.round(stat.scoreSum / stat.count) : 0;
            const level = stat.critical ? 'critical' : stat.warn ? 'warn' : 'good';
            const averagePower = stat.count ? stat.powerSum / stat.count : 0;
            const averageCosPhi = stat.cosPhiCount ? stat.cosPhiSum / stat.cosPhiCount : 0;
            const averageWinding = stat.windingCount ? stat.windingAverageSum / stat.windingCount : 0;
            const averageChargeTemp = stat.chargeTempCount ? stat.chargeTempSum / stat.chargeTempCount : 0;
            const averageChargePressure = stat.chargePressureCount ? stat.chargePressureSum / stat.chargePressureCount : 0;
            const averageOilTemp = stat.oilTempCount ? stat.oilTempSum / stat.oilTempCount : 0;
            const averageOilPressure = stat.oilPressureCount ? stat.oilPressureSum / stat.oilPressureCount : 0;
            const topNotes = Object.entries(stat.topIssues)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4);

            return [
                `<div class="motor-card ${level}">`,
                '  <div class="motor-card-head">',
                `    <h3>${escapeHtml(motor)}</h3>`,
                `    <span class="risk-pill ${level}">${riskLabel(level)}</span>`,
                '  </div>',
                '  <div class="motor-metrics">',
                `    <span>Kayit <b>${integerFormat.format(stat.count)}</b></span>`,
                `    <span>Puan <b>${stat.count ? averageScore : '--'}</b></span>`,
                `    <span>Ort. Guc <b>${formatNumber(averagePower)} MW</b></span>`,
                `    <span>Cos Phi <b>${stat.cosPhiCount ? formatNumber(averageCosPhi) : '--'}</b></span>`,
                `    <span>Min Cos <b>${stat.minCosPhi === null ? '--' : formatNumber(stat.minCosPhi)}</b></span>`,
                `    <span>Sargi Ort. <b>${stat.windingCount ? formatNumber(averageWinding) + ' C' : '--'}</b></span>`,
                renderMetric('Max Sargi', formatNumber(stat.maxWinding) + ' C', stat.detailRefs.maxWinding),
                renderMetric('Sargi Farki', formatNumber(stat.maxWindingSpread) + ' C', stat.detailRefs.maxWindingSpread),
                `    <span>Sarj Sic. <b>${stat.chargeTempCount ? formatNumber(averageChargeTemp) + ' C' : '--'}</b></span>`,
                renderMetric('Max Sarj Sic.', formatNumber(stat.maxChargeTemp) + ' C', stat.detailRefs.maxChargeTemp),
                `    <span>Sarj Bas. <b>${stat.chargePressureCount ? formatNumber(averageChargePressure) : '--'}</b></span>`,
                renderMetric('Min Sarj Bas.', stat.minChargePressure === null ? '--' : formatNumber(stat.minChargePressure), stat.detailRefs.minChargePressure),
                `    <span>Yag Sic. <b>${stat.oilTempCount ? formatNumber(averageOilTemp) + ' C' : '--'}</b></span>`,
                renderMetric('Max Yag Sic.', formatNumber(stat.maxOilTemp) + ' C', stat.detailRefs.maxOilTemp),
                `    <span>Yag Bas. <b>${stat.oilPressureCount ? formatNumber(averageOilPressure) : '--'}</b></span>`,
                renderMetric('Min Yag Bas.', stat.minOilPressure === null ? '--' : formatNumber(stat.minOilPressure), stat.detailRefs.minOilPressure),
                `    <span>Uretim <b>${formatNumber(stat.production)} MWh</b></span>`,
                `    <span>Kritik <b>${integerFormat.format(stat.critical)}</b></span>`,
                `    <span>Uyari <b>${integerFormat.format(stat.warn)}</b></span>`,
                '  </div>',
                '  <div class="score-track">',
                `    <div class="score-fill" style="width:${Math.max(2, averageScore)}%"></div>`,
                '  </div>',
                `  <div class="motor-notes">${topNotes.length ? topNotes.map(([title, count]) => `<span class="note-chip">${escapeHtml(title)}: ${count}</span>`).join('') : '<span class="note-chip">Belirgin sinyal yok</span>'}</div>`,
                '</div>'
            ].join('');
        }).join('');
    }

    function renderMetric(label, value, detailKey) {
        const safeLabel = escapeHtml(label);
        const safeValue = escapeHtml(value);
        if (!detailKey || value === '--') {
            return `<span>${safeLabel} <b>${safeValue}</b></span>`;
        }
        return [
            '<span class="metric-clickable">',
            `  <button type="button" class="metric-detail-btn" data-detail-key="${escapeHtml(detailKey)}" data-metric-label="${safeLabel}" title="Kaydi ac">`,
            `    <span>${safeLabel}</span>`,
            `    <b>${safeValue}</b>`,
            '  </button>',
            '</span>'
        ].join('');
    }

    function showRecordModal(row, metricLabel) {
        closeRecordModal();
        const modal = document.createElement('div');
        modal.className = 'comparison-record-modal is-open';
        modal.id = 'comparisonRecordModal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = [
            '<div class="comparison-record-modal__backdrop" data-close-record-modal></div>',
            '<section class="comparison-record-modal__panel">',
            '  <header class="comparison-record-modal__header">',
            '    <div>',
            `      <p>${escapeHtml(metricLabel || 'Kayit detayi')}</p>`,
            `      <h2>${escapeHtml(row.motor)} ${escapeHtml(formatDisplayDate(row.date))} ${escapeHtml(row.hour)}</h2>`,
            '    </div>',
            '    <button type="button" class="comparison-record-modal__close" data-close-record-modal aria-label="Kapat">x</button>',
            '  </header>',
            '  <div class="comparison-record-modal__body">',
            renderModalSummary(row),
            renderModalSection('Motor Olcumleri', [
                ['Durum', row.motorStatus || '-'],
                ['Kaydeden', row.motorSavedBy || '-'],
                ['JEN Yatak DE / NDE', `${formatNumber(row.bearingDE)} C / ${formatNumber(row.bearingNDE)} C`],
                ['Sargi 1 / 2 / 3', `${formatNumber(row.winding1)} C / ${formatNumber(row.winding2)} C / ${formatNumber(row.winding3)} C`],
                ['Sargi Ort. / Max / Fark', `${formatNumber(row.windingAverage)} C / ${formatNumber(row.windingMax)} C / ${formatNumber(row.windingSpread)} C`],
                ['Sarj Sic. / Bas.', `${formatNumber(row.chargeTemp)} C / ${formatNumber(row.chargePressure)}`],
                ['Yag Sic. / Bas.', `${formatNumber(row.oilTemp)} C / ${formatNumber(row.oilPressure)}`],
                ['Sogutma Sic. / Bas.', `${formatNumber(row.coolingTemp)} C / ${formatNumber(row.coolingPressure)}`]
            ]),
            renderModalSection('Enerji Olcumleri', [
                ['Durum', row.energyStatus || '-'],
                ['Kaydeden', row.energySavedBy || '-'],
                ['Aktif / Reaktif Guc', `${formatNumber(row.activePower)} MW / ${formatNumber(row.reactivePower)}`],
                ['Cos Phi', formatNumber(row.cosPhi)],
                ['Aydem Voltaji / Ort. Gerilim', `${formatNumber(row.voltage)} / ${formatNumber(row.averageVoltage)}`],
                ['Ortalama Akim / Notr Akimi', `${formatNumber(row.current)} / ${formatNumber(row.neutralCurrent)}`],
                ['Toplam Enerji', `${formatNumber(row.totalEnergy)} MWh`],
                ['Saatlik Uretim / Calisma', `${row.productionDelta === null ? '--' : formatNumber(row.productionDelta) + ' MWh'} / ${row.hoursDelta === null ? '--' : formatNumber(row.hoursDelta) + ' sa'}`]
            ]),
            renderModalIssues(row),
            '  </div>',
            '</section>'
        ].join('');
        document.body.appendChild(modal);
        modal.querySelectorAll('[data-close-record-modal]').forEach(node => {
            node.addEventListener('click', closeRecordModal);
        });
        document.addEventListener('keydown', handleRecordModalKeydown);
    }

    function renderModalSummary(row) {
        return [
            '<div class="record-modal-summary">',
            `  <span class="status-pill ${row.level}">${escapeHtml(row.behavior)}</span>`,
            `  <span>Puan <b>${row.score}</b></span>`,
            `  <span>Vardiya <b>${escapeHtml(row.shift || '-')}</b></span>`,
            '</div>'
        ].join('');
    }

    function renderModalSection(title, items) {
        return [
            '<section class="record-modal-section">',
            `  <h3>${escapeHtml(title)}</h3>`,
            '  <div class="record-detail-grid">',
            items.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join(''),
            '  </div>',
            '</section>'
        ].join('');
    }

    function renderModalIssues(row) {
        const issues = row.issues.length
            ? row.issues.map(issue => `<span class="note-chip ${issue.severity}">${escapeHtml(issue.title)}</span>`).join('')
            : '<span class="note-chip">Normal</span>';
        return [
            '<section class="record-modal-section">',
            '  <h3>Analiz</h3>',
            `  <div class="row-issues">${issues}</div>`,
            '</section>'
        ].join('');
    }

    function closeRecordModal() {
        const modal = document.getElementById('comparisonRecordModal');
        if (modal) modal.remove();
        document.removeEventListener('keydown', handleRecordModalKeydown);
    }

    function handleRecordModalKeydown(event) {
        if (event.key === 'Escape') closeRecordModal();
    }

    function renderSignals(aggregate) {
        const container = document.getElementById('signalPanel');
        if (!container) return;
        if (!aggregate.signals.length) {
            container.innerHTML = '<div class="empty-line">Secili aralikta teknik sinyal bulunmadi.</div>';
            return;
        }

        const maxCount = Math.max.apply(null, aggregate.signals.map(signal => signal.count));
        container.innerHTML = aggregate.signals.slice(0, 8).map(signal => {
            const width = Math.max(4, Math.round((signal.count / maxCount) * 100));
            const motors = Array.from(signal.motors).sort().join(', ');
            return [
                `<div class="signal-card ${signal.severity}">`,
                '  <div class="signal-head">',
                `    <h3>${escapeHtml(signal.title)}</h3>`,
                `    <span class="risk-pill ${signal.severity}">${integerFormat.format(signal.count)}</span>`,
                '  </div>',
                `  <div class="signal-meta">${escapeHtml(motors || 'Tum motorlar')} | ${escapeHtml(signal.detail)}</div>`,
                `  <div class="signal-bar"><span style="width:${width}%"></span></div>`,
                '</div>'
            ].join('');
        }).join('');
    }

    function renderTable(rows) {
        const tbody = document.getElementById('comparisonTableBody');
        if (!tbody) return;
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="15"><div class="empty-line">Secili filtrelerde normal durum eslesmesi bulunamadi.</div></td></tr>';
            return;
        }

        tbody.innerHTML = rows.slice(0, MAX_TABLE_ROWS).map(row => {
            const issueChips = row.issues.length
                ? row.issues.slice(0, 4).map(issue => `<span class="note-chip ${issue.severity}">${escapeHtml(issue.title)}</span>`).join('')
                : '<span class="note-chip">Normal</span>';
            return [
                `<tr class="${row.level}-row">`,
                `<td>${escapeHtml(formatDisplayDate(row.date))}</td>`,
                `<td>${escapeHtml(row.hour)}</td>`,
                `<td>${escapeHtml(row.motor)}</td>`,
                `<td><span class="status-pill ${row.level}">${escapeHtml(row.behavior)}</span></td>`,
                `<td>${formatNumber(row.activePower)} MW</td>`,
                `<td>${formatNumber(row.cosPhi)}</td>`,
                `<td>${row.productionDelta === null ? '--' : formatNumber(row.productionDelta) + ' MWh'}</td>`,
                `<td>${row.hoursDelta === null ? '--' : formatNumber(row.hoursDelta) + ' sa'}</td>`,
                `<td>${formatNumber(row.windingAverage)} C</td>`,
                `<td>${formatNumber(row.chargeTemp)} C</td>`,
                `<td>${formatNumber(row.chargePressure)}</td>`,
                `<td>${formatNumber(row.oilTemp)} C / ${formatNumber(row.oilPressure)}</td>`,
                `<td>${formatNumber(row.coolingTemp)} C / ${formatNumber(row.coolingPressure)}</td>`,
                `<td class="score-cell">${row.score}</td>`,
                `<td class="analysis-cell"><div class="row-issues">${issueChips}</div></td>`,
                '</tr>'
            ].join('');
        }).join('');
    }

    function renderIssues(rows) {
        const container = document.getElementById('issueList');
        if (!container) return;
        const riskyRows = rows
            .filter(row => row.level !== 'good')
            .sort((a, b) => severityRank(b.level) - severityRank(a.level) || a.score - b.score || b.timestamp - a.timestamp)
            .slice(0, 10);

        if (!riskyRows.length) {
            container.innerHTML = '<div class="empty-line">Oncelikli inceleme kaydi yok.</div>';
            return;
        }

        container.innerHTML = riskyRows.map(row => {
            const firstIssue = row.issues[0] || { title: 'Izleme', detail: 'Kayit izlenmeli.' };
            return [
                `<div class="issue-card ${row.level}">`,
                '  <div class="issue-head">',
                `    <h3>${escapeHtml(row.motor)} ${escapeHtml(formatDisplayDate(row.date))} ${escapeHtml(row.hour)}</h3>`,
                `    <span class="risk-pill ${row.level}">${row.score}</span>`,
                '  </div>',
                `  <div class="issue-meta">${escapeHtml(firstIssue.title)} | ${escapeHtml(firstIssue.detail)}</div>`,
                `  <div class="row-issues">${row.issues.slice(0, 5).map(issue => `<span class="note-chip ${issue.severity}">${escapeHtml(issue.title)}</span>`).join('')}</div>`,
                '</div>'
            ].join('');
        }).join('');
    }

    function renderUnmatched() {
        const container = document.getElementById('unmatchedList');
        if (!container) return;
        const rows = state.unmatched.filter(row => state.motor === 'all' || row.motor === state.motor).slice(0, 8);
        if (!rows.length) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = [
            '<div class="unmatched-card">',
            '  <div class="unmatched-head">',
            '    <h3>Eslesmeyen Kayitlar</h3>',
            `    <span class="risk-pill warn">${state.unmatched.length}</span>`,
            '  </div>',
            `  <div class="unmatched-meta">${rows.map(row => `${escapeHtml(row.motor)} ${escapeHtml(formatDisplayDate(row.date))} ${escapeHtml(row.hour)}: ${escapeHtml(row.source)}`).join('<br>')}</div>`,
            '</div>'
        ].join('');
    }

    function renderEmptyDashboard() {
        state.comparisons = [];
        state.filtered = [];
        state.unmatched = [];
        renderDashboard();
    }

    function renderUnauthorized() {
        const main = document.getElementById('comparisonApp');
        if (!main) return;
        main.innerHTML = [
            '<section class="locked-state">',
            '  <div class="locked-card">',
            '    <h2>Yetkisiz erisim</h2>',
            '    <p>Bu rapor sadece admin kullanicilara aciktir.</p>',
            '  </div>',
            '</section>'
        ].join('');
    }

    function renderFatalError(error) {
        console.error(error);
        const main = document.getElementById('comparisonApp');
        if (main) {
            main.innerHTML = `<section class="notice">${escapeHtml(error.message || String(error))}</section>`;
        }
    }

    function exportCsv() {
        const rows = state.filtered || [];
        if (!rows.length) {
            showNotice('CSV icin kayit bulunamadi.');
            return;
        }

        const headers = [
            'Tarih', 'Saat', 'Motor', 'Davranis', 'Puan', 'Aktif Guc MW', 'Reaktif Guc',
            'Cos Phi', 'Uretim Farki MWh', 'Calisma Farki', 'Sargi Ort', 'Sargi Fark',
            'Sarj Sic', 'Sarj Bas', 'Yag Sic', 'Yag Bas', 'Sogutma Sic', 'Sogutma Bas', 'Sinyaller'
        ];
        const csvRows = [headers].concat(rows.map(row => [
            formatDisplayDate(row.date),
            row.hour,
            row.motor,
            row.behavior,
            row.score,
            row.activePower,
            row.reactivePower,
            row.cosPhi,
            row.productionDelta === null ? '' : row.productionDelta,
            row.hoursDelta === null ? '' : row.hoursDelta,
            row.windingAverage,
            row.windingSpread,
            row.chargeTemp,
            row.chargePressure,
            row.oilTemp,
            row.oilPressure,
            row.coolingTemp,
            row.coolingPressure,
            row.issues.map(issue => issue.title).join('; ')
        ]));
        const csv = csvRows.map(cols => cols.map(escapeCsv).join(';')).join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `motor-enerji-karsilastirma-${toIsoDate(new Date())}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function getSelectedDateRange() {
        const startValue = document.getElementById('startDateInput')?.value || toIsoDate(getTodayDateOnly());
        const endValue = document.getElementById('endDateInput')?.value || startValue;
        const startDate = parseIsoDate(startValue);
        const endDate = parseIsoDate(endValue);
        endDate.setHours(23, 59, 59, 999);
        return {
            startDate,
            endDate,
            valid: startDate.getTime() <= endDate.getTime()
        };
    }

    function isRecordInRange(row, range) {
        return row.timestamp >= range.startDate.getTime() && row.timestamp <= range.endDate.getTime();
    }

    function getRangeSubtitle() {
        const range = getSelectedDateRange();
        return `${formatDisplayDate(toIsoDate(range.startDate))} - ${formatDisplayDate(toIsoDate(range.endDate))}`;
    }

    function normalizeDateValue(value) {
        if (!value) return '';
        if (value instanceof Date && !isNaN(value.getTime())) return toIsoDate(value);
        const text = String(value).trim();
        if (!text) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
        const trMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        if (trMatch) {
            return `${trMatch[3]}-${pad2(trMatch[2])}-${pad2(trMatch[1])}`;
        }
        const parsed = new Date(text);
        return isNaN(parsed.getTime()) ? '' : toIsoDate(parsed);
    }

    function normalizeHour(value) {
        if (value === null || value === undefined || value === '') return '';
        const text = String(value).trim();
        const match = text.match(/(\d{1,2})(?::(\d{1,2}))?/);
        if (!match) return '';
        const hour = Math.max(0, Math.min(23, parseInt(match[1], 10) || 0));
        const minute = Math.max(0, Math.min(59, parseInt(match[2] || '0', 10) || 0));
        return `${pad2(hour)}:${pad2(minute)}`;
    }

    function normalizeMotorName(value) {
        const text = normalizeLooseName(value);
        const match = text.match(/GM\s*-?\s*(\d)/) || text.match(/^(\d)$/);
        if (match) return `GM-${match[1]}`;
        return text.replace(/\s+/g, '-');
    }

    function buildKey(date, hour, motor) {
        return `${date}|${hour}|${motor}`;
    }

    function parseDateTime(date, hour) {
        return new Date(`${date}T${hour || '00:00'}:00`);
    }

    function parseIsoDate(value) {
        const parts = String(value || '').split('-').map(part => parseInt(part, 10));
        return new Date(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1);
    }

    function getTodayDateOnly() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function toIsoDate(date) {
        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    function formatDisplayDate(isoDate) {
        const date = normalizeDateValue(isoDate);
        if (!date) return '';
        const parts = date.split('-');
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function parseNumber(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return isNaN(value) ? 0 : value;
        let text = String(value).trim().replace(/\s/g, '');
        if (!text) return 0;
        const commaIndex = text.lastIndexOf(',');
        const dotIndex = text.lastIndexOf('.');
        if (commaIndex > -1 && dotIndex > -1) {
            text = commaIndex > dotIndex ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
        } else if (commaIndex > -1) {
            text = text.replace(',', '.');
        }
        const parsed = Number(text);
        return isNaN(parsed) ? 0 : parsed;
    }

    function normalizeLooseName(value) {
        return String(value || '')
            .trim()
            .toUpperCase()
            .replace(/İ/g, 'I')
            .replace(/İ/g, 'I')
            .replace(/Ç/g, 'C')
            .replace(/Ğ/g, 'G')
            .replace(/Ö/g, 'O')
            .replace(/Ş/g, 'S')
            .replace(/Ü/g, 'U');
    }

    function isStoppedStatus(value) {
        const text = normalizeLooseName(value);
        if (!text) return false;
        if (text.includes('NORMAL')) return false;
        return text.includes('CALISMIYOR') ||
            text.includes('MOTOR DURDU') ||
            text.includes('STOP') ||
            text.includes('DURUS');
    }

    function average(values) {
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    function minPositive(current, value) {
        if (!value || value <= 0) return current;
        if (current === null || value < current) return value;
        return current;
    }

    function round(value, digits) {
        const factor = Math.pow(10, digits || 0);
        return Math.round(value * factor) / factor;
    }

    function severityRank(level) {
        return level === 'critical' ? 3 : level === 'warn' ? 2 : 1;
    }

    function riskLabel(level) {
        if (level === 'critical') return 'Kritik';
        if (level === 'warn') return 'Uyari';
        return 'Normal';
    }

    function formatNumber(value) {
        return numberFormat.format(Number(value || 0));
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function setInputValue(id, value) {
        const node = document.getElementById(id);
        if (node) node.value = value;
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    function setLoading(loading) {
        document.querySelectorAll('#refreshReportBtn, #exportCsvBtn, #startDateInput, #endDateInput, #motorFilter, #riskFilter')
            .forEach(node => {
                node.disabled = !!loading;
            });
        if (loading) {
            setText('kpiMatched', '...');
            setText('kpiHealthScore', '...');
            setText('kpiCriticalCount', '...');
            setText('kpiProduction', '...');
        }
    }

    function showNotice(message) {
        const notice = document.getElementById('comparisonNotice');
        if (!notice) return;
        notice.textContent = message;
        notice.hidden = false;
    }

    function hideNotice() {
        const notice = document.getElementById('comparisonNotice');
        if (notice) notice.hidden = true;
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeCsv(value) {
        const text = String(value === null || value === undefined ? '' : value);
        if (/[;"\n\r]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }
})();
