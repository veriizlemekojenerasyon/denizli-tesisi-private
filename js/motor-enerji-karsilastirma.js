(function () {
    'use strict';

    // ─── Sabitler ─────────────────────────────────────────────────────────────────

    const MOTORS = ['GM-1', 'GM-2', 'GM-3'];
    const numberFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

    const LIMITS = {
        windingWarn:   110,  windingCrit:   120,  windingSpread: 18,
        chargeWarn:     65,  chargeCrit:     75,
        oilWarn:        85,  oilCrit:        95,
        coolingWarn:    88,  coolingCrit:    95
    };

    // ─── State ───────────────────────────────────────────────────────────────────

    const state = { period:'weekly', motor:'all', durum:'all', records:[], filtered:[], loadErrors:[] };

    // ─── Init ─────────────────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        if (!checkAuth()) return;
        setUserName();
        applyCurrentRangeForPeriod(state.period);
        bindEvents();
        loadDashboard();
    });

    function checkAuth() {
        const user = getUser();
        if (!user) { window.location.href = 'anasayfa.html'; return false; }
        return true;
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem('loggedInUser') || 'null'); } catch { return null; }
    }

    function setUserName() {
        const u = getUser();
        if (!u) return;
        const name = [u.firstName || u.ad || '', u.lastName || u.soyad || ''].join(' ').trim() || u.email || 'Admin';
        document.querySelectorAll('#userNameDisplay, #sidebarUserNameDisplay').forEach(el => el.textContent = name);
    }

    // ─── Events ──────────────────────────────────────────────────────────────────

    function bindEvents() {
        document.querySelectorAll('[data-period]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-period]').forEach(b => b.classList.toggle('active', b === btn));
                state.period = btn.dataset.period;
                applyCurrentRangeForPeriod(state.period);
                loadDashboard();
            });
        });

        const start   = document.getElementById('startDateInput');
        const end     = document.getElementById('endDateInput');
        const mFilter = document.getElementById('motorFilter');
        const dFilter = document.getElementById('durumFilter');
        const refresh = document.getElementById('refreshReportBtn');
        const expBtn  = document.getElementById('exportCsvBtn');

        if (start)   start.addEventListener('change', loadDashboard);
        if (end)     end.addEventListener('change', loadDashboard);
        if (refresh) refresh.addEventListener('click', loadDashboard);
        if (expBtn)  expBtn.addEventListener('click', exportCsv);
        if (mFilter) mFilter.addEventListener('change', e => { state.motor = e.target.value; applyFiltersAndRender(); });
        if (dFilter) dFilter.addEventListener('change', e => { state.durum = e.target.value; applyFiltersAndRender(); });
    }

    // ─── Tarih ───────────────────────────────────────────────────────────────────

    function toIsoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
    function pad2(n) { return String(n).padStart(2,'0'); }
    function getTodayDateOnly() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
    function parseIsoDate(str) { const p = String(str||'').split('-').map(Number); return new Date(p[0]||1970,(p[1]||1)-1,p[2]||1); }

    function applyCurrentRangeForPeriod(period) {
        const today = getTodayDateOnly();
        let start = new Date(today);
        if (period === 'weekly')  start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
        if (period === 'monthly') start = new Date(today.getFullYear(), today.getMonth(), 1);
        setInputValue('startDateInput', toIsoDate(start));
        setInputValue('endDateInput',   toIsoDate(today));
    }

    function setInputValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

    function getSelectedDateRange() {
        const sv = document.getElementById('startDateInput')?.value || toIsoDate(getTodayDateOnly());
        const ev = document.getElementById('endDateInput')?.value   || sv;
        const startDate = parseIsoDate(sv);
        const endDate   = parseIsoDate(ev);
        endDate.setHours(23,59,59,999);
        return { startDate, endDate, valid: startDate <= endDate };
    }

    function formatDisplayDate(iso) {
        if (!iso) return '';
        const [y,m,d] = iso.split('-');
        return `${d}.${m}.${y}`;
    }

    // ─── Veri yükleme ─────────────────────────────────────────────────────────────

    async function loadDashboard() {
        const range = getSelectedDateRange();
        if (!range.valid) { showNotice('Baslangic tarihi bitis tarihinden buyuk olamaz.'); return; }

        setLoading(true);
        hideNotice();

        try {
            const url = window.AppConfig?.getScriptUrl('motorMirror') || '';
            if (!url) throw new Error('motorMirror URL tanimli degil.');

            const startIso = toIsoDate(range.startDate);
            const endIso   = toIsoDate(range.endDate);

            const promises = MOTORS.map(motor =>
                fetchJson(url, { 
                    action: 'getMotorRecords',
                    motor: motor,
                    startDate: startIso,
                    endDate: endIso
                })
                    .then(r => {
                        console.log(`🔍 Motor ${motor} API yanıtı:`, r);
                        const records = r.data || [];
                        console.log(`🔍 Motor ${motor} için ${records.length} kayıt geldi`);
                        return records;
                    })
                    .catch(err => {
                        console.error(`❌ Motor ${motor} API hatası:`, err);
                        return [];
                    })
            );

            const results = await Promise.all(promises);
            console.log('📦 Toplam API yanıtı sayısı:', results.length);
            console.log('📦 Her motor için kayıt sayısı:', results.map(r => Array.isArray(r) ? r.length : 0));

            state.records = results.flat().map(normalizeRecord).filter(Boolean);
            console.log('✅ Toplam kayıt yüklendi:', state.records.length);
            if (state.records.length > 0) {
                console.log('✅ İlk kayıt örneği:', state.records[0]);
            }
            applyFiltersAndRender();
        } catch (err) {
            showNotice(err.message || String(err));
            renderEmptyDashboard();
        } finally {
            setLoading(false);
        }
    }

    async function fetchJson(scriptUrl, params) {
        const url = new URL(scriptUrl);
        Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
        url.searchParams.set('_', Date.now().toString());
        console.log('🌐 API çağrısı:', url.toString());
        try {
            const resp = await fetch(url.toString(), {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });
            if (!resp.ok) {
                const text = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${text.slice(0, 180)}`);
            }
            const text = await resp.text();
            console.log('📄 API yanıt text (ilk 500 karakter):', text.slice(0, 500));
            let result;
            try { result = JSON.parse(text); }
            catch { throw new Error('JSON okunamadi: ' + text.slice(0, 120)); }
            console.log('📄 API yanıt JSON:', result);
            if (result && result.success === false) throw new Error(result.error || 'API hatasi');
            return result || {};
        } catch (error) {
            console.error('❌ fetchJson hatası:', error);
            throw error;
        }
    }

    // ─── Normalize ───────────────────────────────────────────────────────────────

    function normalizeRecord(row) {
        // Hem büyük harfli hem de camelCase alan adlarını destekle
        const date  = normalizeDateValue(row.tarih || row.Tarih || '');
        const hour  = normalizeHour(row.saat || row.Saat || '');
        const motor = normalizeMotorName(row.motor || row.Motor || '');
        if (!date || !motor) return null;

        const winding1 = parseNum(row.sargiSicaklik1 || row.SargiSicaklik1);
        const winding2 = parseNum(row.sargiSicaklik2 || row.SargiSicaklik2);
        const winding3 = parseNum(row.sargiSicaklik3 || row.SargiSicaklik3);
        const windings = [winding1, winding2, winding3].filter(v => v > 0);
        const windingAvg    = windings.length ? average(windings) : 0;
        const windingMax    = windings.length ? Math.max(...windings) : 0;
        const windingMin    = windings.length ? Math.min(...windings) : 0;
        const windingSpread = windings.length ? windingMax - windingMin : 0;

        const chargeTemp      = parseNum(row.sarjSicaklik || row.SarjSicaklik);
        const chargePressure  = parseNum(row.sarjBasinc || row.SarjBasinc);
        const oilTemp         = parseNum(row.yagSicaklik || row.YagSicaklik);
        const oilPressure     = parseNum(row.yagBasinc || row.YagBasinc);
        const coolingTemp     = parseNum(row.sogutmaSuyuSicaklik || row.SogutmaSuyuSicaklik);
        const coolingPressure = parseNum(row.sogutmaSuyuBasinc || row.SogutmaSuyuBasinc);
        const crankPressure   = parseNum(row.karterBasinc || row.KarterBasinc);
        const roomTemp        = parseNum(row.makineDairesiSicaklik || row.MakineDairesiSicaklik);
        const bearingDE       = parseNum(row.jenYatakSicaklikDE || row.JenYatakSicaklikDE);
        const bearingNDE      = parseNum(row.jenYatakSicaklikNDE || row.JenYatakSicaklikNDE);
        const gasReg          = parseNum(row.gazRegulatoru || row.GazRegulatoru);
        const chamberPressure = parseNum(row.onKamaraFarkBasinc || row.OnKamaraFarkBasinc);

        // Durum tespiti: hem metin hem de tüm değerlerin sıfır olması
        const isStopped = isStoppedStatus(row.durum || row.Durum || '') || isAllZero({
            winding1, winding2, winding3, coolingTemp, oilTemp, chargeTemp
        });

        const issues = analyzeRecord({
            isStopped, windingAvg, windingSpread,
            chargeTemp, chargePressure,
            oilTemp, oilPressure,
            coolingTemp, coolingPressure
        });

        const score = calcScore(issues);
        const level = getLevel(score, issues);

        return {
            key: buildKey(date, hour, motor),
            date, hour, motor,
            timestamp: parseDateTime(date, hour).getTime(),
            shift:   row.vardiya || row.Vardiya || '',
            durum:   row.durum || row.Durum || 'NORMAL',
            savedBy: row.kaydeden || row.Kaydeden || '',
            isStopped,
            winding1, winding2, winding3,
            windingAvg, windingMax, windingMin, windingSpread,
            chargeTemp, chargePressure,
            oilTemp, oilPressure,
            coolingTemp, coolingPressure,
            crankPressure, roomTemp,
            bearingDE, bearingNDE,
            gasReg, chamberPressure,
            issues, score, level
        };
    }

    function normalizeDateValue(value) {
        if (!value) return '';
        const text = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0,10);
        const m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
        return '';
    }

    function normalizeHour(value) {
        if (!value) return '00:00';
        const text = String(value).trim();
        if (text === '24:00' || text.startsWith('24:')) return '00:00';
        const m = text.match(/(\d{1,2})(?::(\d{1,2}))?/);
        if (!m) return '00:00';
        return `${pad2(Math.min(23, parseInt(m[1]||'0')))}:${pad2(Math.min(59, parseInt(m[2]||'0')))}`;
    }

    function normalizeMotorName(value) {
        const m = String(value||'').toUpperCase().replace(/\s/g,'').match(/GM-?(\d)/);
        return m ? `GM-${m[1]}` : '';
    }

    function parseDateTime(date, hour) { return new Date(`${date}T${hour||'00:00'}:00`); }
    function buildKey(date, hour, motor) { return `${date}|${hour}|${motor}`; }

    function parseNum(v) {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return isNaN(v) ? 0 : v;
        let t = String(v).trim().replace(/\s/g,'');
        const ci = t.lastIndexOf(','), di = t.lastIndexOf('.');
        if (ci > -1 && di > -1) t = ci > di ? t.replace(/\./g,'').replace(',','.') : t.replace(/,/g,'');
        else if (ci > -1) t = t.replace(',','.');
        const n = parseFloat(t);
        return isNaN(n) ? 0 : n;
    }

    function trUpper(s) {
        return String(s||'')
            .replace(/ı/g,'i').replace(/i/g,'i')
            .replace(/ş/g,'s').replace(/Ş/g,'S')
            .replace(/ğ/g,'g').replace(/Ğ/g,'G')
            .replace(/ü/g,'u').replace(/Ü/g,'U')
            .replace(/ö/g,'o').replace(/Ö/g,'O')
            .replace(/ç/g,'c').replace(/Ç/g,'C')
            .replace(/İ/g,'I')
            .toUpperCase();
    }

    function isStoppedStatus(s) {
        const u = trUpper(s);
        return u.includes('CALISIYOR') || u.includes('CALISMIYOR') || u.includes('DURDU') || u.includes('KAPALI');
    }

    function isAllZero(vals) {
        return Object.values(vals).every(v => v === 0);
    }

    function average(arr) { return arr.reduce((a,b)=>a+b,0)/arr.length; }

    // ─── Analiz ───────────────────────────────────────────────────────────────────

    function analyzeRecord(r) {
        const issues = [];
        if (r.isStopped) return issues;

        if      (r.windingAvg >= LIMITS.windingCrit)                           addIssue(issues,'critical','Sargi sicakligi kritik',`Ort. ${r.windingAvg.toFixed(1)} °C`);
        else if (r.windingAvg >= LIMITS.windingWarn)                           addIssue(issues,'warn','Sargi sicakligi yuksek',`Ort. ${r.windingAvg.toFixed(1)} °C`);

        if      (r.windingSpread >= 30)                                        addIssue(issues,'critical','Sargi dengesizligi kritik',`Fark ${r.windingSpread.toFixed(1)} °C`);
        else if (r.windingSpread >= LIMITS.windingSpread)                      addIssue(issues,'warn','Sargi dengesizligi',`Fark ${r.windingSpread.toFixed(1)} °C`);

        if      (r.chargeTemp >= LIMITS.chargeCrit)                            addIssue(issues,'critical','Sarj sicakligi kritik',`${r.chargeTemp.toFixed(1)} °C`);
        else if (r.chargeTemp >= LIMITS.chargeWarn)                            addIssue(issues,'warn','Sarj sicakligi yuksek',`${r.chargeTemp.toFixed(1)} °C`);

        if      (r.chargePressure > 0 && r.chargePressure < 0.5)              addIssue(issues,'critical','Sarj basinci kritik dusuk',`${r.chargePressure.toFixed(2)} bar`);
        else if (r.chargePressure > 0 && r.chargePressure < 0.8)              addIssue(issues,'warn','Sarj basinci dusuk',`${r.chargePressure.toFixed(2)} bar`);

        if      (r.oilTemp >= LIMITS.oilCrit)                                  addIssue(issues,'critical','Yag sicakligi kritik',`${r.oilTemp.toFixed(1)} °C`);
        else if (r.oilTemp >= LIMITS.oilWarn)                                  addIssue(issues,'warn','Yag sicakligi yuksek',`${r.oilTemp.toFixed(1)} °C`);

        if      (r.oilPressure > 0 && r.oilPressure < 2)                      addIssue(issues,'critical','Yag basinci kritik dusuk',`${r.oilPressure.toFixed(2)} bar`);
        else if (r.oilPressure > 0 && r.oilPressure < 2.5)                    addIssue(issues,'warn','Yag basinci dusuk',`${r.oilPressure.toFixed(2)} bar`);

        if      (r.coolingTemp >= LIMITS.coolingCrit)                          addIssue(issues,'critical','Sogutma sicakligi kritik',`${r.coolingTemp.toFixed(1)} °C`);
        else if (r.coolingTemp >= LIMITS.coolingWarn)                          addIssue(issues,'warn','Sogutma sicakligi yuksek',`${r.coolingTemp.toFixed(1)} °C`);

        if      (r.coolingPressure > 0 && r.coolingPressure < 0.8)            addIssue(issues,'critical','Sogutma basinci kritik',`${r.coolingPressure.toFixed(2)} bar`);
        else if (r.coolingPressure > 0 && r.coolingPressure < 1)              addIssue(issues,'warn','Sogutma basinci dusuk',`${r.coolingPressure.toFixed(2)} bar`);

        return issues;
    }

    function addIssue(arr, sev, title, detail) { arr.push({ severity:sev, title, detail }); }

    function calcScore(issues) {
        let s = 100;
        issues.forEach(i => { s -= i.severity === 'critical' ? 18 : 8; });
        return Math.max(0, Math.min(100, Math.round(s)));
    }

    function getLevel(score, issues) {
        if (issues.some(i => i.severity === 'critical') || score < 60) return 'critical';
        if (issues.some(i => i.severity === 'warn')     || score < 85) return 'warn';
        return 'good';
    }

    // ─── Filtre & render ─────────────────────────────────────────────────────────

    function applyFiltersAndRender() {
        state.filtered = state.records.filter(r => {
            if (state.motor !== 'all' && r.motor !== state.motor) return false;
            if (state.durum === 'NORMAL'     &&  r.isStopped) return false;
            if (state.durum === 'CALISMIYOR' && !r.isStopped) return false;
            return true;
        });
        renderDashboard();
    }

    function renderDashboard() {
        renderKPIs();
        renderMotorCards();
        renderSignals();
        renderTable();
    }

    function renderEmptyDashboard() {
        ['kpiTotal','kpiRunning','kpiStopped','kpiAvgWinding'].forEach(id => setText(id,'--'));
        setHtml('motorCards','');
        setHtml('signalPanel','');
        setHtml('comparisonTableBody','');
    }

    // ─── KPI ─────────────────────────────────────────────────────────────────────

    function renderKPIs() {
        const recs    = state.filtered;
        const total   = recs.length;
        const running = recs.filter(r => !r.isStopped).length;
        const stopped = total - running;

        const windings   = recs.filter(r => !r.isStopped && r.windingAvg > 0).map(r => r.windingAvg);
        const avgWinding = windings.length ? average(windings) : 0;

        const range    = getSelectedDateRange();
        setText('kpiTotal',      total.toLocaleString('tr-TR'));
        setText('kpiPeriod',     `${formatDisplayDate(toIsoDate(range.startDate))} – ${formatDisplayDate(toIsoDate(range.endDate))}`);
        setText('kpiRunning',    running.toLocaleString('tr-TR'));
        setText('kpiStopped',    stopped.toLocaleString('tr-TR'));
        setText('kpiAvgWinding', avgWinding > 0 ? `${numberFmt.format(avgWinding)} °C` : '--');
    }

    // ─── Motor Kartları ───────────────────────────────────────────────────────────

    function renderMotorCards() {
        const container = document.getElementById('motorCards');
        if (!container) return;

        const range = getSelectedDateRange();
        setText('motorCardsSubtitle', `${formatDisplayDate(toIsoDate(range.startDate))} – ${formatDisplayDate(toIsoDate(range.endDate))}`);

        const motors = state.motor === 'all' ? MOTORS : [state.motor];
        setText('motorCountChip', `${motors.length} motor`);

        // state.records'dan motor bazlı hesapla (filtre bağımsız doğru istatistik için)
        container.innerHTML = motors.map(motor => {
            const allRecs = state.records.filter(r => r.motor === motor);
            const total   = allRecs.length;

            if (total === 0) {
                return `
                <div class="motor-card status-good">
                    <div class="motor-card-header">
                        <span class="motor-name">${motor}</span>
                        <span class="status-badge badge-good">Veri Yok</span>
                    </div>
                    <p style="color:var(--muted,#64748b);font-size:13px;margin:8px 0 0;">Secili tarih araliginda kayit bulunamadi.</p>
                </div>`;
            }

            const running = allRecs.filter(r => !r.isStopped).length;
            const stopped = total - running;
            const runPct  = total > 0 ? Math.round(running / total * 100) : 0;

            const critRecs = allRecs.filter(r => !r.isStopped && r.level === 'critical').length;
            const warnRecs = allRecs.filter(r => !r.isStopped && r.level === 'warn').length;

            const runRecs = allRecs.filter(r => !r.isStopped);

            const avgWind  = runRecs.filter(r => r.windingAvg > 0).length
                ? average(runRecs.filter(r => r.windingAvg > 0).map(r => r.windingAvg)) : 0;
            const maxWind  = runRecs.length ? Math.max(0, ...runRecs.map(r => r.windingMax)) : 0;
            const maxWindRecords = runRecs.filter(r => r.windingMax > 0 && Math.abs(r.windingMax - maxWind) < 0.01);

            const maxCharge = runRecs.filter(r => r.chargeTemp > 0).length
                ? Math.max(...runRecs.filter(r => r.chargeTemp > 0).map(r => r.chargeTemp)) : 0;
            const avgCharge = runRecs.filter(r => r.chargeTemp > 0).length
                ? average(runRecs.filter(r => r.chargeTemp > 0).map(r => r.chargeTemp)) : 0;
            const maxChargeRecords = runRecs.filter(r => r.chargeTemp > 0 && Math.abs(r.chargeTemp - maxCharge) < 0.01);

            const maxOil = runRecs.filter(r => r.oilTemp > 0).length
                ? Math.max(...runRecs.filter(r => r.oilTemp > 0).map(r => r.oilTemp)) : 0;
            const avgOil = runRecs.filter(r => r.oilTemp > 0).length
                ? average(runRecs.filter(r => r.oilTemp > 0).map(r => r.oilTemp)) : 0;
            const maxOilRecords = runRecs.filter(r => r.oilTemp > 0 && Math.abs(r.oilTemp - maxOil) < 0.01);

            const maxCooling = runRecs.filter(r => r.coolingTemp > 0).length
                ? Math.max(...runRecs.filter(r => r.coolingTemp > 0).map(r => r.coolingTemp)) : 0;
            const avgCooling = runRecs.filter(r => r.coolingTemp > 0).length
                ? average(runRecs.filter(r => r.coolingTemp > 0).map(r => r.coolingTemp)) : 0;
            const maxCoolingRecords = runRecs.filter(r => r.coolingTemp > 0 && Math.abs(r.coolingTemp - maxCooling) < 0.01);

            const maxCoolingPressure = runRecs.filter(r => r.coolingPressure > 0).length
                ? Math.max(...runRecs.filter(r => r.coolingPressure > 0).map(r => r.coolingPressure)) : 0;
            const maxCoolingPressureRecords = runRecs.filter(r => r.coolingPressure > 0 && Math.abs(r.coolingPressure - maxCoolingPressure) < 0.01);

            const avgChargePressure = runRecs.filter(r => r.chargePressure > 0).length
                ? average(runRecs.filter(r => r.chargePressure > 0).map(r => r.chargePressure)) : 0;
            const avgOilPressure = runRecs.filter(r => r.oilPressure > 0).length
                ? average(runRecs.filter(r => r.oilPressure > 0).map(r => r.oilPressure)) : 0;
            const avgCoolingPressure = runRecs.filter(r => r.coolingPressure > 0).length
                ? average(runRecs.filter(r => r.coolingPressure > 0).map(r => r.coolingPressure)) : 0;

            const statusClass = critRecs > 0 ? 'critical' : warnRecs > 0 ? 'warn' : 'good';
            const statusLabel = critRecs > 0 ? 'Kritik' : warnRecs > 0 ? 'Uyari' : 'Normal';

            function val(v, unit) { return v > 0 ? `${numberFmt.format(v)} ${unit}` : '--'; }
            function cls(v, warn, crit) { return v >= crit ? 'text-critical' : v >= warn ? 'text-warn' : ''; }

            // Sağlık çubuğu genişliği
            const healthPct = total > 0
                ? Math.round(((total - critRecs * 2 - warnRecs) / total) * 100)
                : 100;
            const healthWidth = Math.max(2, Math.min(100, healthPct));
            const healthColor = critRecs > 0 ? '#dc2626' : warnRecs > 0 ? '#d97706' : '#16a34a';

            // Sinyal özeti
            const signalText = critRecs > 0
                ? `${critRecs} kritik, ${warnRecs} uyari sinyal`
                : warnRecs > 0
                    ? `${warnRecs} uyari sinyal`
                    : 'Belirgin sinyal yok';

            function m(label, value, colorCls, clickType = null, records = []) {
                const clickable = clickType && records.length > 0;
                const clickAttr = clickable ? `data-max-type="${clickType}" data-motor="${motor}" style="cursor:pointer;text-decoration:underline;"` : '';
                const recordsJson = clickable ? `data-records='${JSON.stringify(records.map(r => ({
                    date: r.date,
                    hour: r.hour,
                    shift: r.shift,
                    savedBy: r.savedBy
                })))}'` : '';
                
                return `<span class="motor-metric ${colorCls||''}" ${clickAttr} ${recordsJson}>
                    <b>${label}</b>
                    ${value || '--'}
                </span>`;
            }
            function fv(v, unit) { return v > 0 ? `${numberFmt.format(v)} ${unit}` : '--'; }

            return `
            <div class="motor-card status-${statusClass}">
                <div class="motor-card-header">
                    <span class="motor-name">${motor}</span>
                    <span class="status-badge badge-${statusClass}">${statusLabel}</span>
                </div>

                <div class="motor-metrics-grid">
                    ${m('Kayit', String(total))}
                    ${m('Puan', total > 0 ? String(Math.round((running/total)*100))+'%' : '--')}
                    ${m('Calisma', String(running)+' sa')}
                    ${m('Calismiyor', String(stopped)+' sa')}
                    ${m('Kritik', String(critRecs), critRecs > 0 ? 'text-critical' : '')}
                    ${m('Uyari', String(warnRecs), warnRecs > 0 ? 'text-warn' : '')}

                    ${m('Sargi Ort.', fv(avgWind,'°C'), cls(avgWind, LIMITS.windingWarn, LIMITS.windingCrit))}
                    ${m('Max Sargi', fv(maxWind,'°C'), cls(maxWind, LIMITS.windingWarn, LIMITS.windingCrit), 'max-winding', maxWindRecords)}
                    ${m('Sargi Farki', runRecs.length ? fv(Math.max(0,...runRecs.map(r=>r.windingSpread)),'°C') : '--', '')}

                    ${m('Sarj Sic.', fv(avgCharge,'°C'), cls(avgCharge, LIMITS.chargeWarn, LIMITS.chargeCrit))}
                    ${m('Max Sarj Sic.', fv(maxCharge,'°C'), cls(maxCharge, LIMITS.chargeWarn, LIMITS.chargeCrit), 'max-charge', maxChargeRecords)}
                    ${m('Sarj Bas.', fv(avgChargePressure,'bar'))}

                    ${m('Yag Sic.', fv(avgOil,'°C'), cls(avgOil, LIMITS.oilWarn, LIMITS.oilCrit))}
                    ${m('Max Yag Sic.', fv(maxOil,'°C'), cls(maxOil, LIMITS.oilWarn, LIMITS.oilCrit), 'max-oil', maxOilRecords)}
                    ${m('Yag Bas.', fv(avgOilPressure,'bar'))}

                    ${m('Sog. Sic.', fv(avgCooling,'°C'), cls(avgCooling, LIMITS.coolingWarn, LIMITS.coolingCrit))}
                    ${m('Max Sog. Sic.', fv(maxCooling,'°C'), cls(maxCooling, LIMITS.coolingWarn, LIMITS.coolingCrit), 'max-cooling', maxCoolingRecords)}
                    ${m('Sog. Bas.', fv(avgCoolingPressure,'bar'), '', 'max-cooling-pressure', maxCoolingPressureRecords)}
                </div>

                <div class="motor-health-bar">
                    <div class="motor-health-fill" style="width:${healthWidth}%;background:${healthColor};"></div>
                </div>
                <p class="motor-signal-text">${signalText}</p>
            </div>`;
        }).join('');

        // Maksimum değer tıklama olayları
        const motorCardsContainer = document.getElementById('motorCards');
        if (motorCardsContainer) {
            motorCardsContainer.addEventListener('click', event => {
                const trigger = event.target.closest('[data-max-type]');
                if (!trigger) return;
                
                const maxType = trigger.dataset.maxType;
                const motor = trigger.dataset.motor;
                const records = JSON.parse(trigger.dataset.records || '[]');
                
                if (records.length > 0) {
                    openMaxValueModal(maxType, motor, records);
                }
            });
        }
    }

    // ─── Sinyaller ────────────────────────────────────────────────────────────────

    function renderSignals() {
        const container = document.getElementById('signalPanel');
        if (!container) return;

        const issueMap = {};
        state.filtered.forEach(r => {
            r.issues.forEach(issue => {
                const key = issue.title + '|' + issue.severity;
                if (!issueMap[key]) issueMap[key] = { ...issue, count:0, motors: new Set() };
                issueMap[key].count++;
                issueMap[key].motors.add(r.motor);
            });
        });

        const sorted = Object.values(issueMap).sort((a,b) => {
            if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
            return b.count - a.count;
        });

        if (!sorted.length) {
            container.innerHTML = '<p class="empty-state">Limit astan olcum bulunamadi.</p>';
            return;
        }

        container.innerHTML = sorted.slice(0,15).map(s => `
            <div class="signal-item signal-${s.severity}">
                <div class="signal-header">
                    <span class="signal-title">${s.title}</span>
                    <span class="signal-count">${s.count}x</span>
                </div>
                <div class="signal-meta">
                    <span>${[...s.motors].join(', ')}</span>
                    <span>${s.detail || ''}</span>
                </div>
            </div>`
        ).join('');    }

    // ─── Tablo ───────────────────────────────────────────────────────────────────

    function renderTable() {
        const tbody    = document.getElementById('comparisonTableBody');
        const subtitle = document.getElementById('tableSubtitle');
        if (!tbody) return;

        // Sadece çalışan saatleri göster
        const rows = [...state.filtered]
            .filter(r => !r.isStopped)
            .sort((a,b) => b.timestamp - a.timestamp)
            .slice(0, 500);

        if (subtitle) subtitle.textContent = `${rows.length} kayit gosteriliyor (motor calisiyor)`;

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:20px;color:#888;">Veri bulunamadi</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((r, idx) => {
            const levelClass = r.isStopped ? 'row-stopped' : r.level === 'critical' ? 'row-critical' : r.level === 'warn' ? 'row-warn' : '';
            const wc = cls(r.windingAvg,  LIMITS.windingWarn,  LIMITS.windingCrit);
            const cc = cls(r.chargeTemp,  LIMITS.chargeWarn,   LIMITS.chargeCrit);
            const oc = cls(r.oilTemp,     LIMITS.oilWarn,      LIMITS.oilCrit);
            const sc = cls(r.coolingTemp, LIMITS.coolingWarn,  LIMITS.coolingCrit);

            const durumBadge = r.isStopped
                ? '<span class="durum-badge durum-calismiyor">Çalışmıyor</span>'
                : '<span class="durum-badge durum-normal">Normal</span>';

            return `
            <tr class="table-row-clickable ${levelClass}" data-idx="${idx}">
                <td>${formatDisplayDate(r.date)}</td>
                <td>${r.hour}</td>
                <td><strong>${r.motor}</strong></td>
                <td>${durumBadge}</td>
                <td class="${wc}">${r.windingAvg > 0 ? numberFmt.format(r.windingAvg) : '--'}</td>
                <td class="${cc}">${r.chargeTemp  > 0 ? numberFmt.format(r.chargeTemp)  : '--'}</td>
                <td>${r.chargePressure > 0 ? numberFmt.format(r.chargePressure) : '--'}</td>
                <td class="${oc}">${r.oilTemp     > 0 ? numberFmt.format(r.oilTemp)     : '--'}</td>
                <td>${r.oilPressure > 0 ? numberFmt.format(r.oilPressure) : '--'}</td>
                <td class="${sc}">${r.coolingTemp > 0 ? numberFmt.format(r.coolingTemp) : '--'}</td>
                <td>${r.coolingPressure > 0 ? numberFmt.format(r.coolingPressure) : '--'}</td>
                <td>${r.crankPressure !== 0 ? numberFmt.format(r.crankPressure) : '--'}</td>
                <td>${r.roomTemp > 0 ? numberFmt.format(r.roomTemp) : '--'}</td>
                <td class="td-savedby">${r.savedBy || '--'}</td>
            </tr>`;
        }).join('');

        // Tıklama — detay modal
        tbody.querySelectorAll('.table-row-clickable').forEach(tr => {
            tr.addEventListener('click', () => {
                const idx = parseInt(tr.dataset.idx);
                const record = rows[idx];
                if (record) openDetailModal(record);
            });
        });
    }

    function cls(v, warn, crit) { return v >= crit ? 'text-critical' : v >= warn ? 'text-warn' : ''; }

    // ─── Detay Modal ─────────────────────────────────────────────────────────────

    function openDetailModal(r) {
        // Varsa eski modal'ı kaldır
        const old = document.getElementById('motorDetailModal');
        if (old) old.remove();

        const statusLabel = r.isStopped ? 'Çalışmıyor' : 'Normal';
        const statusClass = r.isStopped ? 'badge-stopped' : r.level === 'critical' ? 'badge-critical' : r.level === 'warn' ? 'badge-warn' : 'badge-good';

        function row(label, value, colorCls) {
            return `<div class="detail-row">
                <span class="detail-label">${label}</span>
                <span class="detail-value ${colorCls||''}">${value || '--'}</span>
            </div>`;
        }

        function val(v, unit, warn, crit) {
            const formatted = v > 0 || v < 0 ? `${numberFmt.format(v)} ${unit}` : '--';
            const color = crit && v > 0 ? cls(v, warn, crit) : '';
            return { formatted, color };
        }

        const winding1v = val(r.winding1,   '°C', LIMITS.windingWarn, LIMITS.windingCrit);
        const winding2v = val(r.winding2,   '°C', LIMITS.windingWarn, LIMITS.windingCrit);
        const winding3v = val(r.winding3,   '°C', LIMITS.windingWarn, LIMITS.windingCrit);
        const windAvgV  = val(r.windingAvg, '°C', LIMITS.windingWarn, LIMITS.windingCrit);
        const chargeTv  = val(r.chargeTemp, '°C', LIMITS.chargeWarn,  LIMITS.chargeCrit);
        const oilTv     = val(r.oilTemp,    '°C', LIMITS.oilWarn,     LIMITS.oilCrit);
        const coolingTv = val(r.coolingTemp,'°C', LIMITS.coolingWarn, LIMITS.coolingCrit);

        const issuesHtml = r.issues.length
            ? r.issues.map(i => `<span class="note-chip ${i.severity}">${i.title}: ${i.detail}</span>`).join('')
            : '<span class="note-chip">Anormallik yok</span>';

        const modal = document.createElement('div');
        modal.id = 'motorDetailModal';
        modal.className = 'motor-detail-modal';
        modal.innerHTML = `
        <div class="motor-detail-modal__backdrop"></div>
        <div class="motor-detail-modal__panel" role="dialog" aria-modal="true">
            <div class="motor-detail-modal__header">
                <div>
                    <p class="modal-eyebrow">${r.motor} — ${r.shift || 'Vardiya bilgisi yok'}</p>
                    <h2>${formatDisplayDate(r.date)} saat ${r.hour}</h2>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                    <button class="motor-detail-modal__close" id="modalCloseBtn" aria-label="Kapat">✕</button>
                </div>
            </div>
            <div class="motor-detail-modal__body">

                <div class="detail-section">
                    <h3>Sargi Sicakliklari</h3>
                    ${row('Sargi 1 (U)', winding1v.formatted, winding1v.color)}
                    ${row('Sargi 2 (V)', winding2v.formatted, winding2v.color)}
                    ${row('Sargi 3 (W)', winding3v.formatted, winding3v.color)}
                    ${row('Sargi Ortalama', windAvgV.formatted, windAvgV.color)}
                    ${row('Sargi Fark (max-min)', r.windingSpread > 0 ? numberFmt.format(r.windingSpread)+' °C' : '--', r.windingSpread >= 30 ? 'text-critical' : r.windingSpread >= LIMITS.windingSpread ? 'text-warn' : '')}
                </div>

                <div class="detail-section">
                    <h3>Sarj (Turbo) Verileri</h3>
                    ${row('Sarj Sicakligi', chargeTv.formatted, chargeTv.color)}
                    ${row('Sarj Basinci', r.chargePressure > 0 ? numberFmt.format(r.chargePressure)+' bar' : '--', '')}
                </div>

                <div class="detail-section">
                    <h3>Yag Verileri</h3>
                    ${row('Yag Sicakligi', oilTv.formatted, oilTv.color)}
                    ${row('Yag Basinci', r.oilPressure > 0 ? numberFmt.format(r.oilPressure)+' bar' : '--', '')}
                </div>

                <div class="detail-section">
                    <h3>Sogutma Suyu</h3>
                    ${row('Sogutma Sicakligi', coolingTv.formatted, coolingTv.color)}
                    ${row('Sogutma Basinci', r.coolingPressure > 0 ? numberFmt.format(r.coolingPressure)+' bar' : '--', '')}
                </div>

                <div class="detail-section">
                    <h3>Diger Olcumler</h3>
                    ${row('Karter Basinci', r.crankPressure !== 0 ? numberFmt.format(r.crankPressure)+' mbar' : '--', '')}
                    ${row('On Kamara Fark Basinci', r.chamberPressure !== 0 ? numberFmt.format(r.chamberPressure)+' Pa' : '--', '')}
                    ${row('Jenerator Yatak Sic. DE', r.bearingDE > 0 ? numberFmt.format(r.bearingDE)+' °C' : '--', '')}
                    ${row('Jenerator Yatak Sic. NDE', r.bearingNDE > 0 ? numberFmt.format(r.bearingNDE)+' °C' : '--', '')}
                    ${row('Gaz Regulatoru', r.gasReg > 0 ? numberFmt.format(r.gasReg)+' rpm' : '--', '')}
                    ${row('Makine Dairesi Sic.', r.roomTemp > 0 ? numberFmt.format(r.roomTemp)+' °C' : '--', '')}
                </div>

                <div class="detail-section">
                    <h3>Analiz</h3>
                    <div class="motor-notes">${issuesHtml}</div>
                </div>

                <div class="detail-section detail-footer">
                    ${row('Kaydeden', r.savedBy || '--', '')}
                </div>

            </div>
        </div>`;

        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('is-open'));

        document.getElementById('modalCloseBtn').addEventListener('click', closeDetailModal);
        modal.querySelector('.motor-detail-modal__backdrop').addEventListener('click', closeDetailModal);
        document.addEventListener('keydown', onModalKeyDown);
    }

    function closeDetailModal() {
        const modal = document.getElementById('motorDetailModal');
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.addEventListener('transitionend', () => modal.remove(), { once:true });
        document.removeEventListener('keydown', onModalKeyDown);
    }

    function onModalKeyDown(e) { if (e.key === 'Escape') closeDetailModal(); }

    // ─── Maksimum Değer Modal ───────────────────────────────────────────────────────

    function openMaxValueModal(maxType, motor, records) {
        // Varsa eski modal'ı kaldır
        const old = document.getElementById('maxValueModal');
        if (old) old.remove();

        const typeLabels = {
            'max-winding': 'Maksimum Sargı Sıcaklığı',
            'max-charge': 'Maksimum Şarj Sıcaklığı',
            'max-oil': 'Maksimum Yağ Sıcaklığı',
            'max-cooling': 'Maksimum Soğutma Suyu Sıcaklığı',
            'max-cooling-pressure': 'Maksimum Soğutma Suyu Basıncı'
        };

        const title = typeLabels[maxType] || 'Maksimum Değer';

        const modal = document.createElement('div');
        modal.id = 'maxValueModal';
        modal.className = 'motor-detail-modal';
        modal.innerHTML = `
        <div class="motor-detail-modal__backdrop"></div>
        <div class="motor-detail-modal__panel" role="dialog" aria-modal="true">
            <div class="motor-detail-modal__header">
                <div>
                    <p class="modal-eyebrow">${motor}</p>
                    <h2>${title}</h2>
                </div>
                <button class="motor-detail-modal__close" id="maxValueModalCloseBtn" aria-label="Kapat">✕</button>
            </div>
            <div class="motor-detail-modal__body">
                <div class="detail-section">
                    <h3>Bu Değer Hangi Tarih ve Saatte Girildi</h3>
                    ${records.length === 0 ? '<p>Kayıt bulunamadı</p>' : `
                        <table class="max-value-table">
                            <thead>
                                <tr>
                                    <th>Tarih</th>
                                    <th>Saat</th>
                                    <th>Vardiya</th>
                                    <th>Kaydeden</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${records.map(r => `
                                    <tr>
                                        <td>${formatDisplayDate(r.date)}</td>
                                        <td>${r.hour}</td>
                                        <td>${r.shift || '--'}</td>
                                        <td>${r.savedBy || '--'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        </div>`;

        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('is-open'));

        document.getElementById('maxValueModalCloseBtn').addEventListener('click', closeMaxValueModal);
        modal.querySelector('.motor-detail-modal__backdrop').addEventListener('click', closeMaxValueModal);
        document.addEventListener('keydown', onMaxValueModalKeyDown);
    }

    function closeMaxValueModal() {
        const modal = document.getElementById('maxValueModal');
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.addEventListener('transitionend', () => modal.remove(), { once:true });
        document.removeEventListener('keydown', onMaxValueModalKeyDown);
    }

    function onMaxValueModalKeyDown(e) { if (e.key === 'Escape') closeMaxValueModal(); }

    // ─── Export CSV ───────────────────────────────────────────────────────────────

    function exportCsv() {
        const headers = ['Tarih','Saat','Motor','Durum','Sargi Ort.','Sarj Sic.','Sarj Bas.','Yag Sic.','Yag Bas.','Sog.Sic.','Sog.Bas.','Karter Bas.','Mak.Dairesi','Kaydeden'];
        const rows = state.filtered.map(r => [
            formatDisplayDate(r.date), r.hour, r.motor,
            r.isStopped ? 'CALISMIYOR' : 'NORMAL',
            r.windingAvg    > 0 ? numberFmt.format(r.windingAvg)      : '',
            r.chargeTemp    > 0 ? numberFmt.format(r.chargeTemp)       : '',
            r.chargePressure> 0 ? numberFmt.format(r.chargePressure)   : '',
            r.oilTemp       > 0 ? numberFmt.format(r.oilTemp)          : '',
            r.oilPressure   > 0 ? numberFmt.format(r.oilPressure)      : '',
            r.coolingTemp   > 0 ? numberFmt.format(r.coolingTemp)       : '',
            r.coolingPressure>0 ? numberFmt.format(r.coolingPressure)   : '',
            r.crankPressure !== 0 ? numberFmt.format(r.crankPressure)  : '',
            r.roomTemp      > 0 ? numberFmt.format(r.roomTemp)          : '',
            r.savedBy || ''
        ]);

        const csv  = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
        const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `motor-veri-karsilastirma-${toIsoDate(new Date())}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    // ─── UI yardımcılar ───────────────────────────────────────────────────────────

    function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
    function setHtml(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }

    function setLoading(on) {
        const btn = document.getElementById('refreshReportBtn');
        if (btn) {
            btn.disabled = on;
            btn.textContent = on ? 'Yukleniyor...' : 'Yenile';
        }
    }

    function showNotice(msg) {
        const el = document.getElementById('comparisonNotice');
        if (!el) return;
        el.textContent = msg;
        el.hidden = false;
    }

    function hideNotice() {
        const el = document.getElementById('comparisonNotice');
        if (el) el.hidden = true;
    }

})();
