(function () {
    'use strict';

    const REPORT_URL = window.AppConfig?.getScriptUrl('yillikEnerjiRapor') || '';
    const PERIOD_LABELS = {
        daily: 'Gunluk',
        weekly: 'Haftalik',
        monthly: 'Aylik',
        yearly: 'Yillik'
    };
    const MOTOR_LABELS = {
        total: 'Toplam',
        gm1: 'GM-1',
        gm2: 'GM-2',
        gm3: 'GM-3'
    };
    const MONTH_LABELS = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
    const numberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
    const detailNumberFormat = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

    const state = {
        year: new Date().getFullYear(),
        period: 'daily',
        exportPeriod: 'daily',
        motor: 'total',
        report: null,
        periodItems: [],
        filteredDays: []
    };

    document.addEventListener('DOMContentLoaded', initEnergyReportPage);

    function initEnergyReportPage() {
        const user = getCurrentUser();
        if (!user || String(user.role || '').toLowerCase() !== 'admin') {
            renderUnauthorized();
            return;
        }

        setCurrentUserName(user);
        initializeFilters();
        bindEvents();
        loadReport();
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

    function initializeFilters() {
        applyCurrentRangeForPeriod(state.period);
        setExportPeriod(state.period);
        updateExportRangeLabel();
    }

    function bindEvents() {
        document.querySelectorAll('[data-period]').forEach(button => {
            button.addEventListener('click', () => {
                setActiveButton('[data-period]', button);
                state.period = button.dataset.period || 'monthly';
                setExportPeriod(state.period);
                const yearChanged = applyCurrentRangeForPeriod(state.period);
                if (yearChanged) {
                    loadReport();
                } else {
                    renderReport();
                }
            });
        });

        document.querySelectorAll('[data-motor]').forEach(button => {
            button.addEventListener('click', () => {
                setActiveButton('[data-motor]', button);
                state.motor = button.dataset.motor || 'total';
                renderReport();
            });
        });

        document.getElementById('yearInput')?.addEventListener('change', event => {
            const year = parseInt(event.target.value, 10) || new Date().getFullYear();
            state.year = year;
            const startInput = document.getElementById('startDateInput');
            const endInput = document.getElementById('endDateInput');
            if (startInput) startInput.value = `${year}-01-01`;
            if (endInput) endInput.value = getDefaultEndDate(year);
            loadReport();
        });

        document.getElementById('startDateInput')?.addEventListener('change', renderReport);
        document.getElementById('endDateInput')?.addEventListener('change', renderReport);
        document.getElementById('refreshReportBtn')?.addEventListener('click', loadReport);
        document.getElementById('exportCsvBtn')?.addEventListener('click', exportCurrentTableCsv);
        document.getElementById('reportExportPeriod')?.addEventListener('change', event => {
            state.exportPeriod = event.target.value || state.period;
        });
        document.getElementById('exportExcelBtn')?.addEventListener('click', () => exportEnergyReport('excel'));
        document.getElementById('exportPdfBtn')?.addEventListener('click', () => exportEnergyReport('pdf'));
    }

    function applyCurrentRangeForPeriod(period) {
        const today = getTodayDateOnly();
        let startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        let endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

        if (period === 'weekly') {
            startDate = getWeekStart(today);
            endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6);
        } else if (period === 'monthly') {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (period === 'yearly') {
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31);
        }

        setDateInputs(startDate, endDate);

        const selectedYear = today.getFullYear();
        const yearChanged = state.year !== selectedYear;
        state.year = selectedYear;

        const yearInput = document.getElementById('yearInput');
        if (yearInput) yearInput.value = String(selectedYear);

        return yearChanged;
    }

    function setDateInputs(startDate, endDate) {
        const startInput = document.getElementById('startDateInput');
        const endInput = document.getElementById('endDateInput');

        if (startInput) startInput.value = toIsoDate(startDate);
        if (endInput) endInput.value = toIsoDate(endDate);
    }

    function setActiveButton(selector, activeButton) {
        document.querySelectorAll(selector).forEach(button => {
            button.classList.toggle('active', button === activeButton);
        });
    }

    async function loadReport() {
        if (!REPORT_URL) {
            showNotice('Yillik enerji rapor API adresi bulunamadi.');
            renderEmptyReport();
            return;
        }

        setLoading(true);
        hideNotice();

        try {
            const url = new URL(REPORT_URL);
            url.searchParams.set('action', 'getYearlyEnergyReportData');
            url.searchParams.set('year', String(state.year));

            const response = await fetch(url.toString());
            const result = await response.json();
            if (!result.success) {
                throw new Error(getReportErrorMessage(result.error));
            }

            state.report = normalizeReport(result);
            renderReport();
        } catch (error) {
            console.error('Enerji rapor verisi alinamadi:', error);
            showNotice(error.message || String(error));
            renderEmptyReport();
        } finally {
            setLoading(false);
        }
    }

    function getReportErrorMessage(errorText) {
        const message = String(errorText || '').trim();
        if (message === 'Gecersiz islem') {
            return 'Yillik enerji rapor Apps Script deployu yeni getYearlyEnergyReportData actionini henuz tanimiyor. Code.gs dosyasini Apps Scriptte kaydedip web app deploymentini yeni surumle guncelleyin.';
        }
        return message || 'Rapor verisi alinamadi.';
    }

    function normalizeReport(result) {
        return {
            year: result.year,
            days: (result.days || []).map(day => ({
                date: day.date || '',
                dateIso: day.dateIso || dateTrToIso(day.date || ''),
                label: day.label || day.date || '',
                weekday: day.weekday || '',
                gm1: normalizeMetric(day.gm1),
                gm2: normalizeMetric(day.gm2),
                gm3: normalizeMetric(day.gm3),
                total: normalizeMetric(day.total)
            }))
        };
    }

    function normalizeMetric(metric) {
        return {
            productionMwh: toNumber(metric?.productionMwh),
            hours: toNumber(metric?.hours),
            averageMw: toNumber(metric?.averageMw)
        };
    }

    function renderReport() {
        if (!state.report) {
            renderEmptyReport();
            return;
        }

        const range = getSelectedDateRange();
        if (!range.valid) {
            showNotice('Baslangic tarihi bitis tarihinden buyuk olamaz.');
            renderEmptyReport();
            return;
        }

        hideNotice();
        const filteredDays = state.report.days.filter(day =>
            day.dateIso >= range.startDate && day.dateIso <= range.endDate
        );

        state.filteredDays = filteredDays;
        state.periodItems = buildPeriodItems(filteredDays, state.period);

        const aggregate = aggregateDays(filteredDays, 'Secili Aralik', range.startDate, range.endDate);
        renderKpis(aggregate);
        renderChart(state.periodItems, filteredDays);
        renderMotorMix(aggregate);
        renderTable(state.periodItems);
        renderInsights(aggregate, state.periodItems, filteredDays);
        updatePanelLabels();
        updateExportRangeLabel();
    }

    function renderEmptyReport() {
        state.periodItems = [];
        state.filteredDays = [];
        renderKpis(createAggregate('Bos', '', ''));
        renderChart([], []);
        renderMotorMix(createAggregate('Bos', '', ''));
        renderTable([]);
        renderInsights(createAggregate('Bos', '', ''), [], []);
        updateExportRangeLabel();
    }

    function renderKpis(aggregate) {
        const metric = getSelectedMetric(aggregate);
        setText('kpiProduction', formatNumber(metric.productionMwh));
        setText('kpiHours', formatNumber(metric.hours));
        setText('kpiAverage', formatNumber(metric.averageMw));
        setText('kpiActiveDays', formatNumber(aggregate.activeDayCount || 0));
    }

    function renderChart(items, days) {
        const chart = document.getElementById('productionChart');
        if (!chart) return;
        const chartItems = getChartItems(items, days || []);
        renderChartLegend();
        renderChartDetails(chartItems);

        if (!chartItems.length) {
            chart.innerHTML = '<div class="empty-state">Secili aralikta rapor verisi yok.</div>';
            return;
        }

        const values = chartItems.map(item => getSelectedMetric(item).productionMwh);
        const maxValue = Math.max.apply(null, values.concat([1]));
        const totalValue = values.reduce((sum, value) => sum + value, 0);
        const bestValue = Math.max.apply(null, values);

        chart.innerHTML = chartItems.map(item => {
            const value = getSelectedMetric(item).productionMwh;
            const height = Math.max(2, Math.round((value / maxValue) * 100));
            const share = totalValue > 0 ? (value / totalValue) * 100 : 0;
            const isBest = value === bestValue && value > 0;
            return [
                `<div class="bar-item ${isBest ? 'best' : ''}" title="${escapeHtml(item.label)} - ${formatDetail(value)} MWh">`,
                `  <div class="bar-value">${formatCompact(value)}</div>`,
                `  <div class="bar-track${state.motor === 'total' ? ' stacked' : ''}">`,
                renderBarBody(item, height),
                '  </div>',
                '  <div class="bar-label">',
                `    <strong>${escapeHtml(shortLabel(item))}</strong>`,
                `    <span>%${formatNumber(share)}</span>`,
                '  </div>',
                '</div>'
            ].join('');
        }).join('');
    }

    function getChartItems(items, days) {
        if (state.period === 'yearly') {
            return buildPeriodItems(days, 'monthly');
        }
        return items;
    }

    function renderBarBody(item, height) {
        if (state.motor !== 'total') {
            return `<div class="bar-fill" style="height:${height}%"></div>`;
        }

        const total = Math.max(item.total.productionMwh, 0);
        const segments = ['gm1', 'gm2', 'gm3'].map(key => {
            const value = Math.max(item[key].productionMwh, 0);
            const share = total > 0 ? (value / total) * 100 : 0;
            return `<span class="bar-segment ${key}${value > 0 ? ' active' : ''}" style="flex-basis:${share}%"></span>`;
        }).join('');

        return `<div class="bar-stack" style="height:${height}%">${segments}</div>`;
    }

    function renderChartDetails(items) {
        const target = document.getElementById('chartDetailStrip');
        if (!target) return;

        if (!items.length) {
            target.innerHTML = '';
            return;
        }

        const values = items.map(item => getSelectedMetric(item).productionMwh);
        const total = values.reduce((sum, value) => sum + value, 0);
        const average = total / Math.max(items.length, 1);
        const bestItem = items
            .slice()
            .sort((a, b) => getSelectedMetric(b).productionMwh - getSelectedMetric(a).productionMwh)[0];
        const bestValue = bestItem ? getSelectedMetric(bestItem).productionMwh : 0;
        const activeCount = values.filter(value => value > 0).length;
        const periodLabel = state.period === 'yearly' ? 'Ay' : 'Donem';

        target.innerHTML = [
            renderChartDetail('Toplam', `${formatNumber(total)} MWh`),
            renderChartDetail('En yuksek', bestValue > 0 ? `${bestItem.label} / ${formatNumber(bestValue)} MWh` : '--'),
            renderChartDetail('Ortalama', `${formatNumber(average)} MWh`),
            renderChartDetail(`Aktif ${periodLabel}`, formatNumber(activeCount))
        ].join('');
    }

    function renderChartDetail(label, value) {
        return [
            '<div class="chart-detail">',
            `  <span>${escapeHtml(label)}</span>`,
            `  <strong>${escapeHtml(value)}</strong>`,
            '</div>'
        ].join('');
    }

    function renderChartLegend() {
        const target = document.getElementById('chartLegend');
        if (!target) return;

        if (state.motor !== 'total') {
            target.innerHTML = '';
            return;
        }

        target.innerHTML = ['gm1', 'gm2', 'gm3'].map(key => [
            '<span class="legend-item">',
            `  <i class="${key}"></i>`,
            `  ${MOTOR_LABELS[key]}`,
            '</span>'
        ].join('')).join('');
    }

    function renderMotorMix(aggregate) {
        const target = document.getElementById('motorMix');
        if (!target) return;

        const motors = [
            { key: 'gm1', label: 'GM-1', metric: aggregate.gm1 },
            { key: 'gm2', label: 'GM-2', metric: aggregate.gm2 },
            { key: 'gm3', label: 'GM-3', metric: aggregate.gm3 }
        ];
        const total = Math.max(aggregate.total.productionMwh, 0);

        target.innerHTML = motors.map(motor => {
            const production = motor.metric.productionMwh;
            const share = total > 0 ? (production / total) * 100 : 0;
            return [
                '<div class="mix-row">',
                '  <div class="mix-top">',
                `    <span>${motor.label}</span>`,
                `    <span>${formatNumber(production)} MWh / %${formatNumber(share)}</span>`,
                '  </div>',
                '  <div class="mix-track">',
                `    <div class="mix-fill" style="width:${Math.max(0, Math.min(100, share))}%"></div>`,
                '  </div>',
                '</div>'
            ].join('');
        }).join('');
    }

    function renderTable(items) {
        const body = document.getElementById('reportTableBody');
        if (!body) return;
        if (!items.length) {
            body.innerHTML = '<tr><td colspan="7">Secili aralikta veri yok.</td></tr>';
            return;
        }

        body.innerHTML = items.map(item => [
            '<tr>',
            `<td>${escapeHtml(item.label)}</td>`,
            `<td>${formatNumber(item.gm1.productionMwh)}</td>`,
            `<td>${formatNumber(item.gm2.productionMwh)}</td>`,
            `<td>${formatNumber(item.gm3.productionMwh)}</td>`,
            `<td>${formatNumber(item.total.productionMwh)}</td>`,
            `<td>${formatNumber(item.total.hours)}</td>`,
            `<td>${formatNumber(item.total.averageMw)}</td>`,
            '</tr>'
        ].join('')).join('');
    }

    function renderInsights(aggregate, items, days) {
        const target = document.getElementById('insightList');
        if (!target) return;

        const selected = getSelectedMetric(aggregate);
        const bestItem = items
            .slice()
            .sort((a, b) => getSelectedMetric(b).productionMwh - getSelectedMetric(a).productionMwh)[0];
        const bestMotor = ['gm1', 'gm2', 'gm3']
            .map(key => ({ key, label: MOTOR_LABELS[key], value: aggregate[key].productionMwh }))
            .sort((a, b) => b.value - a.value)[0];
        const lowDays = days.filter(day => day.total.productionMwh === 0 && day.total.hours === 0).length;

        const insights = [
            {
                level: 'ok',
                title: 'En yuksek donem',
                text: bestItem ? `${bestItem.label}: ${formatNumber(getSelectedMetric(bestItem).productionMwh)} MWh` : 'Veri yok'
            },
            {
                level: 'ok',
                title: 'Motor lideri',
                text: bestMotor ? `${bestMotor.label}: ${formatNumber(bestMotor.value)} MWh` : 'Veri yok'
            },
            {
                level: lowDays > 0 ? 'warn' : 'ok',
                title: 'Bos gun kontrolu',
                text: `${formatNumber(lowDays)} gun uretim ve calisma saati sifir gorunuyor.`
            },
            {
                level: selected.averageMw > 0 ? 'ok' : 'warn',
                title: 'Yuk ortalamasi',
                text: `${MOTOR_LABELS[state.motor]} icin ortalama guc ${formatNumber(selected.averageMw)} MW.`
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

    function updatePanelLabels() {
        const chartPeriodLabel = state.period === 'yearly'
            ? 'Yillik uretim / aylik kirilim'
            : `${PERIOD_LABELS[state.period]} uretim`;
        setText('periodChip', PERIOD_LABELS[state.period]);
        setText('chartSubtitle', `${MOTOR_LABELS[state.motor]} - ${chartPeriodLabel}`);
        setText('tableSubtitle', `${PERIOD_LABELS[state.period]} rapor kirilimi`);
    }

    function setExportPeriod(period) {
        const nextPeriod = PERIOD_LABELS[period] ? period : 'daily';
        state.exportPeriod = nextPeriod;
        const select = document.getElementById('reportExportPeriod');
        if (select) select.value = nextPeriod;
    }

    function updateExportRangeLabel() {
        const range = getSelectedDateRange();
        const label = range.valid
            ? `${isoToTrDate(range.startDate)} - ${isoToTrDate(range.endDate)}`
            : 'Tarih araligi hatali';
        setText('exportRangeLabel', label);
    }

    function buildPeriodItems(days, period) {
        if (period === 'daily') {
            return days.map(day => aggregateDays([day], day.label || day.date, day.dateIso, day.dateIso));
        }
        if (period === 'weekly') {
            return groupDays(days, getWeekKey, getWeekLabel);
        }
        if (period === 'yearly') {
            return days.length ? [aggregateDays(days, String(state.year), `${state.year}-01-01`, `${state.year}-12-31`)] : [];
        }
        return groupDays(days, getMonthKey, getMonthLabel);
    }

    function groupDays(days, keyFn, labelFn) {
        const groups = new Map();
        days.forEach(day => {
            const key = keyFn(day.dateIso);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(day);
        });

        return Array.from(groups.entries()).map(([key, groupDaysList]) => {
            const sorted = groupDaysList.slice().sort((a, b) => a.dateIso.localeCompare(b.dateIso));
            return aggregateDays(
                sorted,
                labelFn(key, sorted),
                sorted[0].dateIso,
                sorted[sorted.length - 1].dateIso
            );
        });
    }

    function aggregateDays(days, label, startDate, endDate) {
        const aggregate = createAggregate(label, startDate, endDate);
        days.forEach(day => {
            aggregate.dayCount += 1;
            if (day.total.productionMwh > 0 || day.total.hours > 0) {
                aggregate.activeDayCount += 1;
            }
            addMetric(aggregate.gm1, day.gm1);
            addMetric(aggregate.gm2, day.gm2);
            addMetric(aggregate.gm3, day.gm3);
            addMetric(aggregate.total, day.total);
        });
        finalizeMetric(aggregate.gm1);
        finalizeMetric(aggregate.gm2);
        finalizeMetric(aggregate.gm3);
        finalizeMetric(aggregate.total);
        return aggregate;
    }

    function createAggregate(label, startDate, endDate) {
        return {
            label,
            startDate,
            endDate,
            dayCount: 0,
            activeDayCount: 0,
            gm1: { productionMwh: 0, hours: 0, averageMw: 0 },
            gm2: { productionMwh: 0, hours: 0, averageMw: 0 },
            gm3: { productionMwh: 0, hours: 0, averageMw: 0 },
            total: { productionMwh: 0, hours: 0, averageMw: 0 }
        };
    }

    function addMetric(target, source) {
        target.productionMwh += toNumber(source.productionMwh);
        target.hours += toNumber(source.hours);
    }

    function finalizeMetric(metric) {
        metric.productionMwh = round(metric.productionMwh);
        metric.hours = round(metric.hours);
        metric.averageMw = metric.hours > 0 ? round(metric.productionMwh / metric.hours) : 0;
    }

    function getSelectedMetric(item) {
        return item[state.motor] || item.total || { productionMwh: 0, hours: 0, averageMw: 0 };
    }

    function getSelectedDateRange() {
        const start = document.getElementById('startDateInput')?.value || `${state.year}-01-01`;
        const end = document.getElementById('endDateInput')?.value || `${state.year}-12-31`;
        return {
            startDate: start,
            endDate: end,
            valid: !start || !end || start <= end
        };
    }

    function getDefaultEndDate(year) {
        const now = new Date();
        if (year === now.getFullYear()) {
            return toIsoDate(now);
        }
        return `${year}-12-31`;
    }

    function getTodayDateOnly() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function getMonthKey(dateIso) {
        return dateIso.slice(0, 7);
    }

    function getMonthLabel(key) {
        const monthIndex = Math.max(0, Math.min(11, parseInt(key.slice(5, 7), 10) - 1));
        return MONTH_LABELS[monthIndex];
    }

    function getWeekKey(dateIso) {
        return toIsoDate(getWeekStart(parseIsoDate(dateIso)));
    }

    function getWeekLabel(key, days) {
        const first = days[0]?.date || isoToTrDate(key);
        const last = days[days.length - 1]?.date || first;
        return `${first} - ${last}`;
    }

    function getWeekStart(date) {
        const day = date.getDay();
        const offset = day === 0 ? -6 : 1 - day;
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        start.setDate(start.getDate() + offset);
        return start;
    }

    function shortLabel(item) {
        if (state.period === 'daily') return item.label.slice(0, 5);
        if (state.period === 'weekly') return item.startDate ? isoToTrDate(item.startDate).slice(0, 5) : item.label;
        return item.label;
    }

    function exportCurrentTableCsv() {
        if (!state.periodItems.length) {
            showNotice('Disa aktarilacak rapor verisi yok.');
            return;
        }

        const rows = [
            ['Donem', 'GM-1 MWh', 'GM-2 MWh', 'GM-3 MWh', 'Toplam MWh', 'Calisma Saati', 'Ort. MW']
        ].concat(state.periodItems.map(item => [
            item.label,
            formatCsvNumber(item.gm1.productionMwh),
            formatCsvNumber(item.gm2.productionMwh),
            formatCsvNumber(item.gm3.productionMwh),
            formatCsvNumber(item.total.productionMwh),
            formatCsvNumber(item.total.hours),
            formatCsvNumber(item.total.averageMw)
        ]));

        const csv = rows.map(row => row.map(csvCell).join(';')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `enerji-rapor-${state.year}-${state.period}.csv`;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
    }

    function exportEnergyReport(format) {
        const payload = buildEnergyExportPayload();
        if (!payload) return;

        if (format === 'pdf') {
            openEnergyPdfReport(payload);
            return;
        }

        downloadEnergyExcelReport(payload);
    }

    function buildEnergyExportPayload() {
        if (!state.report) {
            showNotice('Rapor verisi henuz yuklenmedi.');
            return null;
        }

        const range = getSelectedDateRange();
        if (!range.valid) {
            showNotice('Baslangic tarihi bitis tarihinden buyuk olamaz.');
            return null;
        }

        const period = state.exportPeriod || state.period || 'daily';
        const filteredDays = state.report.days.filter(day =>
            day.dateIso >= range.startDate && day.dateIso <= range.endDate
        );
        const items = buildPeriodItems(filteredDays, period);
        if (!items.length) {
            showNotice('Disa aktarilacak rapor verisi yok.');
            return null;
        }

        const aggregate = aggregateDays(filteredDays, 'Secili Aralik', range.startDate, range.endDate);
        const selectedMetric = getSelectedMetric(aggregate);
        const generatedAt = new Date();

        return {
            year: state.year,
            period,
            periodLabel: PERIOD_LABELS[period] || period,
            motorLabel: MOTOR_LABELS[state.motor] || 'Toplam',
            rangeLabel: `${isoToTrDate(range.startDate)} - ${isoToTrDate(range.endDate)}`,
            startDate: range.startDate,
            endDate: range.endDate,
            generatedAt: formatReportTimestamp(generatedAt),
            aggregate,
            selectedMetric,
            items
        };
    }

    function downloadEnergyExcelReport(payload) {
        const html = [
            '<!DOCTYPE html>',
            '<html><head><meta charset="UTF-8">',
            '<style>',
            getEnergyReportDocumentCss('excel'),
            '</style></head><body>',
            buildEnergyReportDocument(payload),
            '</body></html>'
        ].join('');
        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        downloadBlob(blob, buildEnergyReportFileName(payload, 'xls'));
    }

    function openEnergyPdfReport(payload) {
        const reportWindow = window.open('', '_blank');
        if (!reportWindow) {
            showNotice('PDF penceresi acilamadi. Tarayici popup iznini kontrol edin.');
            return;
        }

        reportWindow.document.write([
            '<!DOCTYPE html>',
            '<html><head><meta charset="UTF-8">',
            `<title>${escapeHtml(payload.periodLabel)} Enerji Raporu</title>`,
            '<style>',
            getEnergyReportDocumentCss('pdf'),
            '</style></head><body>',
            buildEnergyReportDocument(payload),
            '</body></html>'
        ].join(''));
        reportWindow.document.close();
        reportWindow.focus();
        setTimeout(() => reportWindow.print(), 300);
    }

    function buildEnergyReportDocument(payload) {
        return [
            '<main class="energy-report-document">',
            '  <header class="document-header">',
            '    <div>',
            '      <p>Yillik Enerji Sayfalari</p>',
            `      <h1>${escapeHtml(payload.periodLabel)} Enerji Raporu</h1>`,
            '    </div>',
            `    <strong>${escapeHtml(payload.rangeLabel)}</strong>`,
            '  </header>',
            buildEnergyReportMeta(payload),
            buildEnergyReportSummary(payload),
            buildEnergyReportTable(payload),
            '</main>'
        ].join('');
    }

    function buildEnergyReportMeta(payload) {
        const rows = [
            ['Yil', payload.year],
            ['Kirilim', payload.periodLabel],
            ['Motor Filtresi', payload.motorLabel],
            ['Olusturma Zamani', payload.generatedAt]
        ];

        return [
            '<section class="meta-grid">',
            rows.map(row => [
                '<div class="meta-item">',
                `  <span>${escapeHtml(row[0])}</span>`,
                `  <strong>${escapeHtml(row[1])}</strong>`,
                '</div>'
            ].join('')).join(''),
            '</section>'
        ].join('');
    }

    function buildEnergyReportSummary(payload) {
        const total = payload.aggregate.total;
        const selected = payload.selectedMetric;
        const cards = [
            ['Toplam Uretim', `${formatNumber(total.productionMwh)} MWh`],
            ['Calisma Saati', `${formatNumber(total.hours)} saat`],
            ['Ortalama Guc', `${formatNumber(total.averageMw)} MW`],
            ['Secili Motor', `${formatNumber(selected.productionMwh)} MWh`],
            ['Aktif Gun', formatNumber(payload.aggregate.activeDayCount || 0)]
        ];

        return [
            '<section class="summary-grid">',
            cards.map(card => [
                '<div class="summary-card">',
                `  <span>${escapeHtml(card[0])}</span>`,
                `  <strong>${escapeHtml(card[1])}</strong>`,
                '</div>'
            ].join('')).join(''),
            '</section>'
        ].join('');
    }

    function buildEnergyReportTable(payload) {
        const headers = [
            'Donem',
            'Tarih Araligi',
            'GM-1 MWh',
            'GM-1 Saat',
            'GM-1 Ort. MW',
            'GM-2 MWh',
            'GM-2 Saat',
            'GM-2 Ort. MW',
            'GM-3 MWh',
            'GM-3 Saat',
            'GM-3 Ort. MW',
            'Toplam MWh',
            'Toplam Saat',
            'Toplam Ort. MW'
        ];

        return [
            '<section class="table-section">',
            '  <table>',
            '    <thead><tr>',
            headers.map(header => `<th>${escapeHtml(header)}</th>`).join(''),
            '    </tr></thead>',
            '    <tbody>',
            payload.items.map(item => buildEnergyReportTableRow(item)).join(''),
            '    </tbody>',
            '  </table>',
            '</section>'
        ].join('');
    }

    function buildEnergyReportTableRow(item) {
        const cells = [
            item.label,
            getReportRangeText(item),
            item.gm1.productionMwh,
            item.gm1.hours,
            item.gm1.averageMw,
            item.gm2.productionMwh,
            item.gm2.hours,
            item.gm2.averageMw,
            item.gm3.productionMwh,
            item.gm3.hours,
            item.gm3.averageMw,
            item.total.productionMwh,
            item.total.hours,
            item.total.averageMw
        ];

        return [
            '<tr>',
            cells.map((cell, index) => {
                const value = index < 2 ? escapeHtml(cell) : formatExcelNumber(cell);
                return `<td>${value}</td>`;
            }).join(''),
            '</tr>'
        ].join('');
    }

    function getReportRangeText(item) {
        if (!item.startDate && !item.endDate) return '';
        if (item.startDate === item.endDate) return isoToTrDate(item.startDate);
        return `${isoToTrDate(item.startDate)} - ${isoToTrDate(item.endDate)}`;
    }

    function getEnergyReportDocumentCss(mode) {
        const pageCss = mode === 'pdf'
            ? '@page{size:A4 landscape;margin:12mm;}'
            : '';
        return [
            pageCss,
            'body{margin:0;background:#ffffff;color:#172033;font-family:Arial,sans-serif;font-size:11px;}',
            '.energy-report-document{padding:18px;}',
            '.document-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:12px;border-bottom:2px solid #2563eb;padding-bottom:10px;}',
            '.document-header p{margin:0 0 4px;color:#64748b;font-weight:700;}',
            '.document-header h1{margin:0;font-size:22px;color:#172033;}',
            '.document-header strong{font-size:14px;color:#2563eb;}',
            '.meta-grid,.summary-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px;}',
            '.meta-item,.summary-card{border:1px solid #d7e0ec;border-radius:6px;padding:8px;background:#f8fafc;}',
            '.meta-item span,.summary-card span{display:block;color:#64748b;font-size:10px;font-weight:700;margin-bottom:4px;}',
            '.meta-item strong,.summary-card strong{display:block;color:#172033;font-size:13px;}',
            'table{width:100%;border-collapse:collapse;}',
            'th,td{border:1px solid #d7e0ec;padding:6px 7px;text-align:right;white-space:nowrap;}',
            'th:first-child,td:first-child,th:nth-child(2),td:nth-child(2){text-align:left;}',
            'th{background:#e8f0ff;color:#172033;font-weight:700;}',
            'tbody tr:nth-child(even){background:#f8fafc;}',
            '@media print{.energy-report-document{padding:0;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}'
        ].join('');
    }

    function downloadBlob(blob, fileName) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
    }

    function buildEnergyReportFileName(payload, extension) {
        return [
            'enerji-rapor',
            payload.period,
            payload.startDate,
            payload.endDate,
            String(payload.motorLabel || 'toplam').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        ].join('-') + `.${extension}`;
    }

    function formatReportTimestamp(date) {
        return [
            toIsoDate(date),
            String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
        ].join(' ');
    }

    function formatExcelNumber(value) {
        return String(round(value)).replace('.', ',');
    }

    function csvCell(value) {
        const text = String(value ?? '');
        return `"${text.replace(/"/g, '""')}"`;
    }

    function formatCsvNumber(value) {
        return String(round(value)).replace('.', ',');
    }

    function setLoading(isLoading) {
        const button = document.getElementById('refreshReportBtn');
        if (!button) return;
        button.disabled = isLoading;
        button.classList.toggle('loading', isLoading);
    }

    function showNotice(message) {
        const notice = document.getElementById('reportNotice');
        if (!notice) return;
        notice.hidden = false;
        notice.textContent = message;
    }

    function hideNotice() {
        const notice = document.getElementById('reportNotice');
        if (!notice) return;
        notice.hidden = true;
        notice.textContent = '';
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

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
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

    function round(value) {
        return Math.round(toNumber(value) * 1000) / 1000;
    }

    function formatNumber(value) {
        return numberFormat.format(round(value));
    }

    function formatCompact(value) {
        const rounded = round(value);
        if (Math.abs(rounded) >= 1000) {
            return `${numberFormat.format(rounded / 1000)} bin`;
        }
        return numberFormat.format(rounded);
    }

    function formatDetail(value) {
        return detailNumberFormat.format(round(value));
    }

    function dateTrToIso(value) {
        const parts = String(value || '').split('.');
        if (parts.length !== 3) return '';
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }

    function isoToTrDate(value) {
        const parts = String(value || '').split('-');
        if (parts.length !== 3) return value || '';
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    function parseIsoDate(value) {
        const parts = String(value || '').split('-').map(Number);
        return new Date(parts[0] || state.year, (parts[1] || 1) - 1, parts[2] || 1);
    }

    function toIsoDate(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();
