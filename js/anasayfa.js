document.addEventListener('DOMContentLoaded', function() {
    // Kullanıcı giriş kontrolü
    checkAuth();
    
    // Motor verileri
    const motorData = {
        gm1: {
            totalProduction: 0,
            hourlyProduction: 0,
            totalHours: 0,
            hourlyHours: 0,
            totalStarts: 0,
            status: 'stopped'
        },
        gm2: {
            totalProduction: 0,
            hourlyProduction: 0,
            totalHours: 0,
            hourlyHours: 0,
            totalStarts: 0,
            status: 'stopped'
        },
        gm3: {
            totalProduction: 0,
            hourlyProduction: 0,
            totalHours: 0,
            hourlyHours: 0,
            totalStarts: 0,
            status: 'stopped'
        }
    };

    // Günlük özet verileri
    const summaryData = {
        dailyProduction: 0,
        dailySteam: null, // Buhar verisinden çekilecek
        pendingMaintenance: 0,
        activeFaults: 0
    };

    // Buhar verisi config
    const BUHAR_APPS_SCRIPT_URL = window.AppConfig.getScriptUrl('buhar');
    const KOJEN_ENERJI_APPS_SCRIPT_URL = window.AppConfig.getScriptUrl('enerji');
    const YEARLY_ENERGY_REPORT_URL = window.AppConfig.getScriptUrl('yillikEnerjiRapor');
    const KOJEN_MOTOR_APPS_SCRIPT_URL = window.AppConfig.getScriptUrl('motor');
    const BAKIM_APPS_SCRIPT_URL = window.AppConfig.getScriptUrl('bakim');
    const SAATLIK_APPS_SCRIPT_URL = window.AppConfig.getScriptUrl('saatlik');
    const GUNLUK_APPS_SCRIPT_URL = window.AppConfig.getScriptUrl('gunluk');
    const ADMIN_TRIGGER_MODULES = [
        { key: 'saatlik', label: 'Saatlik Veri', url: SAATLIK_APPS_SCRIPT_URL },
        { key: 'motor', label: 'Kojen Motor', url: KOJEN_MOTOR_APPS_SCRIPT_URL },
        { key: 'enerji', label: 'Kojen Enerji', url: KOJEN_ENERJI_APPS_SCRIPT_URL },
        { key: 'buhar', label: 'Buhar', url: BUHAR_APPS_SCRIPT_URL },
        { key: 'gunluk', label: 'Gunluk Veri', url: GUNLUK_APPS_SCRIPT_URL }
    ];
    const ANNOUNCEMENTS_STORAGE_KEY = 'shiftAnnouncements';
    const MAINTENANCE_TOTAL_CACHE_KEY = 'dashboardMaintenanceTotal';
    const MOTOR_DATA_CACHE_KEY = 'dashboardMotorData';
    const DAILY_PRODUCTION_CACHE_KEY = 'dashboardDailyProduction';
    const DAILY_STEAM_CACHE_KEY = 'dashboardDailySteam';
    const SUMMARY_CACHE_DATE_KEY = 'dashboardSummaryCacheDate';
    const ANNOUNCEMENT_COUNT_CACHE_KEY = 'dashboardAnnouncementCount';
    const ANNOUNCEMENT_MODAL_PENDING_KEY = 'showHomeAnnouncementModal';
    const ANNOUNCEMENT_MODAL_SHOWN_KEY = 'homeAnnouncementModalShown';
    const defaultAnnouncements = [];
    let dashboardAnnouncements = null;
    let announcementsRefreshPromise = null;
    let dashboardSummaryRefreshPromise = null;
    let dashboardMotorCardsRefreshPromise = null;
    let maintenanceTotalRefreshPromise = null;
    let monthlyEnergyReportCache = null;
    let monthlyEnergyReportPromise = null;
    let steamRecordsCache = null;
    let steamRecordsPromise = null;
    let maintenanceHistoryCache = null;
    let maintenanceHistoryPromise = null;
    loadCachedMaintenanceTotal();
    loadCachedMotorData();
    loadCachedSummaryValues();
    loadCachedAnnouncementCount();

    // Sayfa yuklendiginde verileri bekletmeden goster
    updateMotorData();
    updateSummaryData();
    setTimeout(refreshDashboardMotorCardsInBackground, 100);
    setTimeout(refreshMaintenanceTotalInBackground, 150);
    setTimeout(loadDashboardData, 900);
    setTimeout(openLoginAnnouncementModalIfPending, 250);
    setInterval(loadDashboardData, 5 * 60 * 1000);
    setTimeout(ensureAdminTriggersAfterLogin, 10000);

    async function loadDashboardData() {
        updateMotorData();
        updateSummaryData();

        refreshMaintenanceTotalInBackground();
        await refreshDashboardMotorCardsInBackground();
        
        const tasks = [
            updateAnnouncementTicker(),
            loadBuharData().then(updateSummaryData),
            loadLatestEnergyData().then(updateMotorData),
            loadLatestMotorStatus().then(updateMotorData),
            loadMaintenanceData().then(updateSummaryData)
        ];

        await Promise.allSettled(tasks);
    }

    async function refreshDashboardSummaryInBackground() {
        if (dashboardSummaryRefreshPromise) return dashboardSummaryRefreshPromise;
        dashboardSummaryRefreshPromise = (async () => {
            const tasks = [
                loadBuharData().then(updateSummaryData),
                loadLatestEnergyData().then(updateMotorData),
                loadLatestMotorStatus().then(updateMotorData),
                loadMaintenanceData().then(updateSummaryData)
            ];
            await Promise.allSettled(tasks);
            updateMotorData();
            updateSummaryData();
        })().finally(() => {
            dashboardSummaryRefreshPromise = null;
        });
        return dashboardSummaryRefreshPromise;
    }

    async function refreshDashboardMotorCardsInBackground() {
        if (dashboardMotorCardsRefreshPromise) return dashboardMotorCardsRefreshPromise;
        dashboardMotorCardsRefreshPromise = loadDashboardMotorCards().then(cardsLoaded => {
            if (cardsLoaded) {
                updateMotorData();
                updateSummaryData();
            }
            return cardsLoaded;
        }).finally(() => {
            dashboardMotorCardsRefreshPromise = null;
        });
        return dashboardMotorCardsRefreshPromise;
    }

    async function refreshMaintenanceTotalInBackground() {
        if (maintenanceTotalRefreshPromise) return maintenanceTotalRefreshPromise;
        maintenanceTotalRefreshPromise = loadMaintenanceTotal().finally(() => {
            maintenanceTotalRefreshPromise = null;
        });
        return maintenanceTotalRefreshPromise;
    }

    // Motor verilerini güncelle
    async function updateAnnouncementTicker() {
        const tickerTrack = document.getElementById('announcementTickerTrack');
        if (!tickerTrack) return;

        const announcements = await getTodayAnnouncements();
        summaryData.activeFaults = announcements.length;
        updateSummaryData();
        showAnnouncementsOnLogin(announcements);
        tickerTrack.innerHTML = '';

        if (announcements.length === 0) {
            tickerTrack.appendChild(createTickerItem('Bugun icin aktif vardiya duyurusu bulunmuyor.', 'normal'));
            tickerTrack.style.animation = 'none';
            refreshAnnouncementsFromSheets();
            return;
        }

        const tickerItems = [...announcements, ...announcements];
        tickerItems.forEach(item => {
            tickerTrack.appendChild(createTickerItem(formatTickerText(item), item.priority, item.category));
        });

        tickerTrack.style.animation = announcements.length === 1 ? 'tickerScroll 24s linear infinite' : '';
        refreshAnnouncementsFromSheets();
    }

    function showAnnouncementsOnLogin(announcements) {
        if (sessionStorage.getItem(ANNOUNCEMENT_MODAL_PENDING_KEY) !== '1') return;
        sessionStorage.removeItem(ANNOUNCEMENT_MODAL_PENDING_KEY);
        sessionStorage.setItem(ANNOUNCEMENT_MODAL_SHOWN_KEY, '1');
        openAnnouncementModal(Array.isArray(announcements) ? announcements : []);
    }

    async function openLoginAnnouncementModalIfPending() {
        if (sessionStorage.getItem(ANNOUNCEMENT_MODAL_PENDING_KEY) !== '1') return;
        const announcements = await getTodayAnnouncements();
        showAnnouncementsOnLogin(announcements);
    }

    function createTickerItem(text, priority = 'normal', category = 'general') {
        const item = document.createElement('span');
        item.className = `ticker-item ${priority || 'normal'} category-${category || 'general'}`;
        item.textContent = text;
        return item;
    }

    function formatTickerText(item) {
        const category = formatAnnouncementCategory(item.category);
        const text = getAnnouncementText(item).replace(/\s+/g, ' ');
        return category ? `${category}: ${text}` : text;
    }

    function getAnnouncementText(item) {
        return item.message || item.title || 'Duyuru metni yok';
    }

    async function loadDashboardSummary() {
        try {
            const url = new URL(KOJEN_ENERJI_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getDashboardSummary');

            const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache' });
            const result = await response.json();

            if (!result.success) {
                const errorText = String(result.error || result.message || '');
                if (errorText.includes('Geçersiz işlem') || errorText.includes('Gecersiz islem')) {
                    console.warn('Dashboard ozeti bu Apps Script deployunda yok; getLastRecords fallback kullaniliyor.');
                } else {
                    console.error('Dashboard ozeti alinamadi:', result.error);
                }
                return false;
            }

            applyDashboardSummaryPayload(result);

            if (Array.isArray(result.announcements)) {
                dashboardAnnouncements = result.announcements;
                localStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(result.announcements));
                const announcements = filterTodayAnnouncements(result.announcements);
                updateAnnouncementCount(announcements);
                renderAnnouncementTicker(announcements);
                updateOpenAnnouncementModal(announcements);
            }

            if (Array.isArray(result.errors) && result.errors.length) {
                console.warn('Dashboard kismi hatalar:', result.errors);
            }

            return true;
        } catch (error) {
            console.error('Dashboard ozeti yuklenemedi:', error);
            return false;
        }
    }

    async function loadDashboardMotorCards() {
        try {
            const url = new URL(KOJEN_ENERJI_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getDashboardMotorCards');

            const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache' });
            const result = await response.json();

            if (!result.success) {
                const errorText = String(result.error || result.message || '');
                const normalizedErrorText = normalizeText(errorText);
                if (normalizedErrorText.includes('gecersiz') || normalizedErrorText.includes('invalid')) {
                    console.warn('Hizli motor kart endpointi bu deployda yok; son kayit fallback kullaniliyor.');
                    await Promise.allSettled([
                        loadLatestEnergyData(),
                        loadLatestMotorStatus()
                    ]);
                    return true;
                } else {
                    console.error('Motor kartlari hizli yuklenemedi:', result.error || result.message);
                }
                return false;
            }

            applyDashboardSummaryPayload(result);
            return true;
        } catch (error) {
            console.error('Motor kartlari hizli yuklenemedi:', error);
            return false;
        }
    }

    function applyDashboardSummaryPayload(result) {
        if (result.summary) {
            if (result.summary.dailyProduction !== undefined) {
                summaryData.dailyProduction = parseDashboardNumber(result.summary.dailyProduction);
            }
            if (Object.prototype.hasOwnProperty.call(result.summary, 'dailySteam')) {
                summaryData.dailySteam = result.summary.dailySteam === null || result.summary.dailySteam === undefined
                    ? null
                    : parseDashboardNumber(result.summary.dailySteam);
            }
            cacheSummaryValues();
        }

        if (result.motors) {
            Object.entries(result.motors).forEach(([key, data]) => {
                if (!motorData[key]) return;
                motorData[key].totalProduction = parseDashboardNumber(data.totalProduction);
                motorData[key].hourlyProduction = parseDashboardNumber(data.hourlyProduction);
                motorData[key].totalHours = parseDashboardNumber(data.totalHours);
                motorData[key].hourlyHours = parseDashboardNumber(data.hourlyHours);
                if (data.totalStarts !== undefined && data.totalStarts !== null && data.totalStarts !== '') {
                    motorData[key].totalStarts = parseDashboardNumber(data.totalStarts);
                }
                motorData[key].status = data.status === 'running' ? 'running' : 'stopped';
            });
            cacheMotorData();
        }
    }

    async function getTodayAnnouncements() {
        if (Array.isArray(dashboardAnnouncements)) {
            return filterTodayAnnouncements(dashboardAnnouncements);
        }

        const cached = getCachedAnnouncements();
        if (cached.length) {
            return cached;
        }

        return defaultAnnouncements;
    }

    function getCachedAnnouncements() {
        try {
            const stored = JSON.parse(localStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY) || '[]');
            if (!Array.isArray(stored) || stored.length === 0) return [];
            return filterTodayAnnouncements(stored);
        } catch (error) {
            console.error('Vardiya duyurulari cache okunamadi:', error);
            return [];
        }
    }

    async function refreshAnnouncementsFromSheets() {
        if (announcementsRefreshPromise) return announcementsRefreshPromise;
        announcementsRefreshPromise = refreshAnnouncementsFromSheetsInner();
        try {
            return await announcementsRefreshPromise;
        } finally {
            announcementsRefreshPromise = null;
        }
    }

    async function refreshAnnouncementsFromSheetsInner() {
        if (window.fetchAnnouncementsFromSheets && window.isBildirimSheetsEnabled?.()) {
            try {
                const result = await fetchAnnouncementsFromSheets({ active: 'true' });
                if (result.success && Array.isArray(result.data)) {
                    dashboardAnnouncements = result.data;
                    localStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(result.data));
                    const announcements = filterTodayAnnouncements(result.data);
                    renderAnnouncementTicker(announcements);
                    updateAnnouncementCount(announcements);
                    updateOpenAnnouncementModal(announcements);
                }
            } catch (error) {
                console.error('Sheets duyurulari okunamadi:', error);
            }
        }
    }

    function loadCachedAnnouncementCount() {
        const cachedCount = localStorage.getItem(ANNOUNCEMENT_COUNT_CACHE_KEY);
        if (cachedCount !== null) {
            const value = parseDashboardNumber(cachedCount);
            if (Number.isFinite(value)) {
                summaryData.activeFaults = value;
            }
        }
    }

    function updateAnnouncementCount(announcements) {
        summaryData.activeFaults = announcements.length;
        localStorage.setItem(ANNOUNCEMENT_COUNT_CACHE_KEY, String(summaryData.activeFaults));
        updateSummaryData();
    }

    function renderAnnouncementTicker(announcements) {
        const tickerTrack = document.getElementById('announcementTickerTrack');
        if (!tickerTrack) return;

        tickerTrack.innerHTML = '';
        if (!announcements.length) {
            tickerTrack.appendChild(createTickerItem('Bugun icin aktif vardiya duyurusu bulunmuyor.', 'normal'));
            tickerTrack.style.animation = 'none';
            return;
        }

        const tickerItems = [...announcements, ...announcements];
        tickerItems.forEach(item => {
            tickerTrack.appendChild(createTickerItem(formatTickerText(item), item.priority, item.category));
        });

        tickerTrack.style.animation = announcements.length === 1 ? 'tickerScroll 24s linear infinite' : '';
    }

    function filterTodayAnnouncements(items) {
        const today = new Date().toISOString().split('T')[0];
        const user = getLoggedInUser();
        const activeItems = items.filter(item => {
            const isActive = item.active !== false;
            return isActive &&
                !isDefaultAnnouncement(item) &&
                matchesDateRange(item, today) &&
                matchesTarget(item, user) &&
                matchesShift(item);
        });

        return activeItems;
    }

    function isDefaultAnnouncement(item) {
        const text = String(item?.title || item?.message || '').trim().toLowerCase();
        return [
            '08-16 vardiyasi: kojenerasyon saha kontrol listesi tamamlanacak',
            'gm motor yag ve sogutma degerleri saatlik kayitlarda dikkatle kontrol edilecek',
            'vardiya tesliminde yapilan isler ve bekleyen konular vardiya notuna yazilacak'
        ].includes(text);
    }

    function matchesDateRange(item, today) {
        const start = toIsoDate(item.startDate || item.date || '');
        const end = toIsoDate(item.endDate || '');
        if (start && today < start) return false;
        if (end && today > end) return false;
        return true;
    }

    function matchesTarget(item, user) {
        const target = item.target || 'all';
        if (target === 'all') return true;
        return user?.role === target;
    }

    function matchesShift(item) {
        const shift = String(item.shift || '').trim();
        if (!shift) return true;
        const normalized = normalizeShift(shift).toLowerCase();
        if (['all', 'tum', 'tüm', 'hepsi'].includes(normalized)) return true;
        return normalized === getCurrentShift();
    }

    function getCurrentShift() {
        const hour = new Date().getHours();
        if (hour >= 8 && hour < 16) return '08-16';
        if (hour >= 16 && hour < 24) return '16-24';
        return '24-08';
    }

    function normalizeShift(value) {
        return String(value || '').trim().replace('/', '-');
    }

    function toIsoDate(value) {
        if (!value) return '';
        const text = String(value);
        if (text.includes('-')) return text;
        const parts = text.split('.');
        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';
    }

    function getLoggedInUser() {
        try {
            return JSON.parse(localStorage.getItem('loggedInUser') || 'null');
        } catch (error) {
            return null;
        }
    }

    async function ensureAdminTriggersAfterLogin() {
        const user = getLoggedInUser();
        if (user?.role !== 'admin') return;
        if (sessionStorage.getItem('adminTriggerCheckPending') !== '1') return;

        try {
            const healthResults = await Promise.all(ADMIN_TRIGGER_MODULES.map(async module => ({
                module,
                result: await fetchTriggerJson(module.url, { action: 'getTriggerHealth' })
            })));
            const missing = healthResults.filter(item => item.result.success && !item.result.installed);
            const failedChecks = healthResults.filter(item => !item.result.success);

            if (!missing.length && !failedChecks.length) {
                showNotification('Tetikleyiciler kurulu.', 'success');
                return;
            }

            if (missing.length) {
                showNotification(
                    `Eksik tetikleyici: ${missing.map(item => item.module.label).join(', ')}. Kurulum baslatildi.`,
                    'warning'
                );

                const installResults = await Promise.all(missing.map(async item => ({
                    module: item.module,
                    result: await fetchTriggerJson(item.module.url, { action: 'installHourlyMissingRecordTrigger' })
                })));
                const installErrors = installResults.filter(item => !item.result.success);

                if (installErrors.length) {
                    showNotification(
                        `Tetikleyici kurulum hatasi: ${installErrors.map(item => item.module.label).join(', ')}`,
                        'error'
                    );
                } else {
                    showNotification('Eksik tetikleyiciler kuruldu.', 'success');
                }
            }

            if (failedChecks.length) {
                showNotification(
                    `Tetikleyici kontrol hatasi: ${failedChecks.map(item => item.module.label).join(', ')}`,
                    'error'
                );
            }
        } catch (error) {
            console.error('Admin tetikleyici kontrolu calisamadi:', error);
            showNotification('Tetikleyici kontrolu yapilamadi.', 'error');
        } finally {
            sessionStorage.removeItem('adminTriggerCheckPending');
        }
    }

    async function fetchTriggerJson(baseUrl, params) {
        try {
            const url = new URL(baseUrl);
            Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
            const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache' });
            const result = await response.json();
            return result.success ? result : { success: false, error: result.error || 'Servis hatasi' };
        } catch (error) {
            return { success: false, error: error.message || String(error) };
        }
    }

    const announcementDetailsBtn = document.getElementById('announcementDetailsBtn');
    if (announcementDetailsBtn) {
        announcementDetailsBtn.addEventListener('click', async function() {
            const announcements = await getTodayAnnouncements();
            await openAnnouncementModal(announcements);
        });
    }

    async function markVisibleAnnouncementsRead(announcements) {
        const user = getLoggedInUser();
        const reader = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Kullanici';

        let storedReads = {};
        try {
            storedReads = JSON.parse(localStorage.getItem('announcementReads') || '{}');
        } catch (error) {
            storedReads = {};
        }
        announcements.forEach(item => {
            if (item.id) storedReads[item.id] = true;
        });
        localStorage.setItem('announcementReads', JSON.stringify(storedReads));

        if (!window.markAnnouncementReadOnSheets || !window.isBildirimSheetsEnabled?.()) return;
        try {
            await Promise.all(announcements.filter(item => item.id).map(item =>
                markAnnouncementReadOnSheets(item.id, reader, user?.email || '')
            ));
        } catch (error) {
            console.error('Okundu bilgisi kaydedilemedi:', error);
        }
    }

    function formatAnnouncementCategory(value) {
        const labels = {
            operation: 'Isletme',
            maintenance: 'Bakim',
            safety: 'Guvenlik',
            shift: 'Vardiya',
            general: 'Genel'
        };
        return labels[value] || '';
    }

    function updateMotorData() {
        for (const [motorId, data] of Object.entries(motorData)) {
            // Toplam üretim
            const totalProductionEl = document.getElementById(`${motorId}-total-production`);
            if (totalProductionEl) {
                animateValue(totalProductionEl, 0, data.totalProduction, 1500, ' MWh', 1);
            }

            const hourlyProductionEl = document.getElementById(`${motorId}-hourly-production`);
            if (hourlyProductionEl) {
                animateValue(hourlyProductionEl, 0, data.hourlyProduction || 0, 1500, ' MWh', 1);
            }

            // Toplam çalışma
            const totalHoursEl = document.getElementById(`${motorId}-total-hours`);
            if (totalHoursEl) {
                animateValue(totalHoursEl, 0, data.totalHours, 1500, ' saat', 1);
            }

            const hourlyHoursEl = document.getElementById(`${motorId}-hourly-hours`);
            if (hourlyHoursEl) {
                animateValue(hourlyHoursEl, 0, data.hourlyHours || 0, 1500, ' saat', 1);
            }

            const totalStartsEl = document.getElementById(`${motorId}-total-starts`);
            if (totalStartsEl) {
                animateValue(totalStartsEl, 0, data.totalStarts || 0, 1500, ' adet');
            }

            // Motor durumunu güncelle
            const motorCard = document.querySelector(`[data-motor="${motorId}"]`);
            if (motorCard) {
                const statusEl = motorCard.querySelector('.motor-status');
                if (statusEl) {
                    statusEl.className = `motor-status ${data.status}`;
                    statusEl.textContent = data.status === 'running' ? 'Çalışıyor' : 'Durdu';
                }
            }
        }
    }

    // Özet verilerini güncelle
    function updateSummaryData() {
        const dailyProductionEl = document.getElementById('daily-production-value');
        if (dailyProductionEl) {
            animateValue(dailyProductionEl, 0, summaryData.dailyProduction, 1500, ' MWh', 1);
        }

        // Günlük buhar
        const dailySteamEl = document.getElementById('daily-steam-value');
        if (dailySteamEl && summaryData.dailySteam !== null) {
            dailySteamEl.textContent = summaryData.dailySteam.toFixed(2) + ' Ton';
        }

        // Toplam bakım formu
        const pendingMaintenanceEl = document.getElementById('pending-maintenance-value');
        if (pendingMaintenanceEl) {
            animateValue(pendingMaintenanceEl, 0, summaryData.pendingMaintenance, 1500, ' Form');
        }

        // Aktif arızalar
        const activeFaultsEl = document.getElementById('active-faults-value');
        if (activeFaultsEl) {
            animateValue(activeFaultsEl, 0, summaryData.activeFaults, 1500, ' Duyuru');
        }
    }

    // Buhar verisini çek (son kayıt)
    async function loadBuharData() {
        try {
            console.log('Buhar verisi yükleniyor...');
            const url = new URL(BUHAR_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getLastRecords');
            url.searchParams.append('count', '1');
            
            console.log('Buhar API URL:', url.toString());
            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            const result = await response.json();
            
            console.log('Buhar API yanıtı:', result);
            
            if (result.success && result.data && result.data.length > 0) {
                const lastRecord = result.data[0];
                console.log('Son buhar kaydı:', lastRecord);
                summaryData.dailySteam = parseFloat(lastRecord.buharMiktari) || 0;
                localStorage.setItem(DAILY_STEAM_CACHE_KEY, String(summaryData.dailySteam));
                localStorage.setItem(SUMMARY_CACHE_DATE_KEY, formatDashboardDateTR(new Date()));
                console.log('Buhar verisi kaydedildi:', summaryData.dailySteam);
            } else {
                console.log('Buhar verisi bulunamadı veya başarısız:', result);
                summaryData.dailySteam = null;
            }
        } catch (error) {
            console.error('Buhar verisi yüklenemedi:', error);
        }
    }
    async function loadMaintenanceData() {
        await refreshMaintenanceTotalInBackground();
    }

    async function loadMaintenanceTotal() {
        try {
            const result = await fetchMaintenanceSummary();
            const total = getMaintenanceSummaryTotal(result);

            if (result && result.success && Number.isFinite(total)) {
                summaryData.pendingMaintenance = total;
                localStorage.setItem(MAINTENANCE_TOTAL_CACHE_KEY, String(summaryData.pendingMaintenance));
                updateSummaryData();
            } else {
                console.error('Toplam bakim form adedi alinamadi:', result.message || result.error);
            }
        } catch (error) {
            console.error('Toplam bakim form adedi yuklenemedi:', error);
        }
    }

    async function fetchMaintenanceSummary() {
        const requests = [
            { action: 'getSummary', range: 'all' },
            { action: 'getReport', range: 'all', summaryOnly: 'true' },
            { action: 'getStats', period: '1' }
        ];

        for (const params of requests) {
            const url = new URL(BAKIM_APPS_SCRIPT_URL);
            Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

            try {
                const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache' });
                const result = await response.json();
                if (result.success && Number.isFinite(getMaintenanceSummaryTotal(result))) {
                    return result;
                }
            } catch (error) {
                console.warn('Bakim ozeti alternatifi basarisiz:', params.action, error);
            }
        }

        return { success: false, error: 'Bakim ozeti alinamadi' };
    }

    function getMaintenanceSummaryTotal(result) {
        if (!result) return NaN;
        if (result.summary && result.summary.total !== undefined) {
            return parseDashboardNumber(result.summary.total);
        }
        if (result.stats && result.stats.total !== undefined) {
            return parseDashboardNumber(result.stats.total);
        }
        return NaN;
    }

    async function loadActiveFaultCount() {
        try {
            const url = new URL(BAKIM_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getActiveRecords');

            const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache' });
            const result = await response.json();

            if (!result.success || !Array.isArray(result.records)) {
                console.error('Aktif ariza verisi alinamadi:', result.message || result.error);
                return;
            }

            const activeRecords = result.records.filter(record => {
                return String(record.status || '').toLowerCase() === 'aktif';
            });

            summaryData.activeFaults = activeRecords.filter(record => {
                return isFaultRecordType(record.type);
            }).length;
            updateSummaryData();
        } catch (error) {
            console.error('Aktif ariza verisi yuklenemedi:', error);
        }
    }

    function loadCachedMaintenanceTotal() {
        const cached = localStorage.getItem(MAINTENANCE_TOTAL_CACHE_KEY);
        if (cached === null) return;

        const total = parseDashboardNumber(cached);
        if (Number.isFinite(total)) {
            summaryData.pendingMaintenance = total;
        }
    }

    function loadCachedMotorData() {
        try {
            const cached = JSON.parse(localStorage.getItem(MOTOR_DATA_CACHE_KEY) || '{}');
            if (!cached || typeof cached !== 'object') return;

            Object.keys(motorData).forEach(key => {
                if (!cached[key]) return;
                motorData[key].totalProduction = parseDashboardNumber(cached[key].totalProduction);
                motorData[key].hourlyProduction = parseDashboardNumber(cached[key].hourlyProduction);
                motorData[key].totalHours = parseDashboardNumber(cached[key].totalHours);
                motorData[key].hourlyHours = parseDashboardNumber(cached[key].hourlyHours);
                motorData[key].totalStarts = parseDashboardNumber(cached[key].totalStarts);
                motorData[key].status = cached[key].status === 'running' ? 'running' : 'stopped';
            });
        } catch (error) {
            console.error('Motor kart cache okunamadi:', error);
        }
    }

    function cacheMotorData() {
        const data = {};
        Object.keys(motorData).forEach(key => {
            data[key] = {
                totalProduction: motorData[key].totalProduction || 0,
                hourlyProduction: motorData[key].hourlyProduction || 0,
                totalHours: motorData[key].totalHours || 0,
                hourlyHours: motorData[key].hourlyHours || 0,
                totalStarts: motorData[key].totalStarts || 0,
                status: motorData[key].status || 'stopped'
            };
        });
        localStorage.setItem(MOTOR_DATA_CACHE_KEY, JSON.stringify(data));
    }

    function loadCachedSummaryValues() {
        const today = formatDashboardDateTR(new Date());
        const cachedDate = localStorage.getItem(SUMMARY_CACHE_DATE_KEY);
        if (cachedDate !== today) return;

        const cachedProduction = localStorage.getItem(DAILY_PRODUCTION_CACHE_KEY);
        if (cachedProduction !== null) {
            const value = parseDashboardNumber(cachedProduction);
            if (Number.isFinite(value)) summaryData.dailyProduction = value;
        }

        const cachedSteam = localStorage.getItem(DAILY_STEAM_CACHE_KEY);
        if (cachedSteam !== null) {
            const value = parseDashboardNumber(cachedSteam);
            if (Number.isFinite(value)) summaryData.dailySteam = value;
        }
    }

    function loadCachedAnnouncementCount() {
        const cached = getCachedAnnouncements();
        summaryData.activeFaults = cached.length ? cached.length : defaultAnnouncements.length;
    }

    function cacheSummaryValues() {
        localStorage.setItem(SUMMARY_CACHE_DATE_KEY, formatDashboardDateTR(new Date()));
        localStorage.setItem(DAILY_PRODUCTION_CACHE_KEY, String(summaryData.dailyProduction));
        if (summaryData.dailySteam !== null) {
            localStorage.setItem(DAILY_STEAM_CACHE_KEY, String(summaryData.dailySteam));
        }
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ı/g, 'i')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ş/g, 's')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c');
    }

    function parseDashboardNumber(value) {
        if (value === null || value === undefined || value === '') return 0;
        if (typeof value === 'number') return value;

        let normalized = String(value).trim();
        if (normalized.includes(',')) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        }

        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function getMotorKey(value) {
        const text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
        const gmMatch = text.match(/GM-?(?:GM-?)?(\d+)$/);
        if (gmMatch) return `gm${gmMatch[1]}`;

        const numericMatch = text.match(/(\d+)$/);
        if (numericMatch) return `gm${numericMatch[1]}`;

        return text.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function formatDashboardDateTR(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}.${month}.${date.getFullYear()}`;
    }

    function normalizeDashboardDate(value) {
        const text = String(value || '').trim();
        if (!text) return '';

        if (text.includes('-')) {
            const parts = text.split('-');
            if (parts.length === 3) {
                return `${parts[2].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[0]}`;
            }
        }

        const parts = text.split('.');
        if (parts.length === 3) {
            return `${parts[0].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[2]}`;
        }

        return text;
    }

    function normalizeDashboardHour(value) {
        const text = String(value || '').trim();
        if (!text) return '';

        const parts = text.split(':');
        const hour = parseInt(parts[0], 10);
        if (!Number.isFinite(hour)) return text;

        return `${String(hour).padStart(2, '0')}:00`;
    }

    function findMotorRecordByDateHour(records, tarih, saat) {
        return (records || []).find(record => {
            return normalizeDashboardDate(record.tarih) === tarih &&
                normalizeDashboardHour(record.saat) === saat;
        }) || null;
    }

    function findLatestMotorRecordForDate(records, tarih) {
        return (records || []).find(record => normalizeDashboardDate(record.tarih) === tarih) || null;
    }

    function calculateDailyMotorHours(records, tarih) {
        const firstRecord = findMotorRecordByDateHour(records, tarih, '00:00');
        const lastRecord = findMotorRecordByDateHour(records, tarih, '23:00') ||
            findLatestMotorRecordForDate(records, tarih);

        if (!firstRecord || !lastRecord) return null;

        const firstHours = parseDashboardNumber(firstRecord.calismaSaati);
        const lastHours = parseDashboardNumber(lastRecord.calismaSaati);
        return Math.max(0, lastHours - firstHours);
    }

    function calculateDailyMotorProduction(records, tarih) {
        const todayRecords = (records || [])
            .filter(record => normalizeDashboardDate(record.tarih) === tarih)
            .slice()
            .sort((a, b) => normalizeDashboardHour(a.saat).localeCompare(normalizeDashboardHour(b.saat)));

        if (todayRecords.length < 2) return null;

        const firstEnergy = parseDashboardNumber(todayRecords[0].toplamAktifEnerji);
        const lastEnergy = parseDashboardNumber(todayRecords[todayRecords.length - 1].toplamAktifEnerji);
        return Math.max(0, lastEnergy - firstEnergy);
    }

    function isStoppedMotorStatus(value) {
        const status = normalizeText(value);
        const originalStatus = String(value || '').toLowerCase();
        return status.includes('calismiyor') ||
            originalStatus.includes('\u00E7al\u0131\u015Fm\u0131yor') ||
            status.includes('durdu') ||
            status.includes('stop');
    }

    function isFaultRecordType(value) {
        const type = normalizeText(value);
        const originalType = String(value || '').toLowerCase();
        return type === 'ariza' || originalType === 'ar\u0131za';
    }

    async function loadLatestEnergyData() {
        try {
            const url = new URL(KOJEN_ENERJI_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getLastRecords');
            url.searchParams.append('count', '200');

            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            const result = await response.json();

            if (!result.success || !Array.isArray(result.data)) {
                console.error('Son enerji kayitlari alinamadi:', result.error);
                return;
            }

            const latestByMotor = {};
            const recordsByMotor = {};
            result.data.forEach(record => {
                const key = getMotorKey(record.motor);
                if (!motorData[key]) return;
                if (!recordsByMotor[key]) recordsByMotor[key] = [];
                recordsByMotor[key].push(record);
                if (!latestByMotor[key]) latestByMotor[key] = record;
            });

            const today = formatDashboardDateTR(new Date());
            let dailyProductionTotal = 0;
            let dailyProductionMotorCount = 0;

            Object.entries(latestByMotor).forEach(([key, record]) => {
                const totalEnergyKwh = parseDashboardNumber(record.toplamAktifEnerji);
                const totalHours = parseDashboardNumber(record.calismaSaati);
                const totalStarts = parseDashboardNumber(record.kalkisSayisi);
                const previousRecord = recordsByMotor[key] && recordsByMotor[key][1] ? recordsByMotor[key][1] : null;
                const previousEnergyKwh = previousRecord ? parseDashboardNumber(previousRecord.toplamAktifEnerji) : totalEnergyKwh;
                const dailyHours = calculateDailyMotorHours(recordsByMotor[key], today);
                const dailyProduction = calculateDailyMotorProduction(recordsByMotor[key], today);

                motorData[key].totalProduction = totalEnergyKwh;
                motorData[key].hourlyProduction = Math.max(0, totalEnergyKwh - previousEnergyKwh);
                motorData[key].totalHours = totalHours;
                motorData[key].hourlyHours = dailyHours === null ? 0 : dailyHours;
                motorData[key].totalStarts = totalStarts;
                if (dailyProduction !== null) {
                    dailyProductionTotal += dailyProduction;
                    dailyProductionMotorCount++;
                }

                if (isStoppedMotorStatus(record.durum)) {
                    motorData[key].status = 'stopped';
                }
            });

            if (dailyProductionMotorCount > 0) {
                summaryData.dailyProduction = dailyProductionTotal;
                localStorage.setItem(DAILY_PRODUCTION_CACHE_KEY, String(summaryData.dailyProduction));
                localStorage.setItem(SUMMARY_CACHE_DATE_KEY, today);
                updateSummaryData();
            }

            cacheMotorData();
        } catch (error) {
            console.error('Son enerji verisi yuklenemedi:', error);
        }
    }

    async function loadLatestMotorStatus() {
        try {
            const url = new URL(KOJEN_MOTOR_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getLastRecords');
            url.searchParams.append('count', '100');

            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            const result = await response.json();

            if (!result.success || !Array.isArray(result.data)) {
                console.error('Son motor kayitlari alinamadi:', result.error);
                return;
            }

            const latestByMotor = {};
            result.data.forEach(record => {
                const key = getMotorKey(record.motor);
                if (!motorData[key] || latestByMotor[key]) return;
                latestByMotor[key] = record;
            });

            Object.entries(latestByMotor).forEach(([key, record]) => {
                motorData[key].status = isStoppedMotorStatus(record.durum) ? 'stopped' : 'running';
            });
            cacheMotorData();
        } catch (error) {
            console.error('Son motor durumu yuklenemedi:', error);
        }
    }

    // Sayısal değer animasyonu
    function formatDashboardNumber(value, decimals = null) {
        if (decimals !== null && decimals !== undefined) {
            return Number(value || 0).toLocaleString('tr-TR', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
                useGrouping: false
            });
        }

        return Number(value || 0).toLocaleString('tr-TR', {
            maximumFractionDigits: value % 1 !== 0 ? 1 : 0,
            useGrouping: false
        });
    }

    function animateValue(element, start, end, duration, suffix = '', decimals = null) {
        const currentText = String(element.textContent || '').replace(',', '.');
        const currentNumber = parseFloat(currentText);
        if (Number.isFinite(currentNumber)) {
            start = currentNumber;
        }

        duration = Math.min(duration || 500, 500);
        if (element._animationFrame) {
            cancelAnimationFrame(element._animationFrame);
        }

        const startTime = performance.now();
        const isFloat = end % 1 !== 0;

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing fonksiyonu
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            
            const currentValue = start + (end - start) * easeOutQuart;
            
            element.textContent = formatDashboardNumber(
                decimals !== null && decimals !== undefined ? currentValue : (isFloat ? currentValue : Math.round(currentValue)),
                decimals
            ) + suffix;

            if (progress < 1) {
                element._animationFrame = requestAnimationFrame(update);
            }
        }

        element._animationFrame = requestAnimationFrame(update);
    }

    // Çıkış yap butonları
    const sidebarLogout = document.getElementById('sidebarLogout');
    const headerLogout = document.getElementById('headerLogout');

    sidebarLogout.addEventListener('click', handleLogout);
    headerLogout.addEventListener('click', handleLogout);

    function handleLogout() {
        if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
            localStorage.removeItem('rememberedEmail');
            window.location.href = 'index.html';
        }
    }

    // Menü navigasyonu
    const menuLinks = document.querySelectorAll('.menu-link');
    menuLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Sadece # ise veya boşsa engelle, değilse normal yönlendirme yap
            if (href === '#' || !href) {
                e.preventDefault();
                
                // Aktif menü öğesini güncelle
                menuLinks.forEach(l => l.parentElement.classList.remove('active'));
                this.parentElement.classList.add('active');
                
                // Menü text'ine göre bildirim göster
                const menuText = this.querySelector('.menu-text').textContent;
                if (menuText !== 'Ana Sayfa') {
                    showNotification(`${menuText} sayfası yapım aşamasında.`, 'info');
                }
            }
            // Diğer durumlarda normal link davranışı devam etsin (sayfa yönlendirmesi)
        });
    });

    function handleMenuNavigation(menuText) {
        switch(menuText) {
            case 'Ana Sayfa':
                // Zaten ana sayfadayız
                break;
            case 'Motor Durumları':
                showNotification('Motor durumları sayfası yapım aşamasında.', 'info');
                break;
            case 'Raporlar':
                showNotification('Raporlar sayfası yapım aşamasında.', 'info');
                break;
            case 'Bakım':
                showNotification('Bakım sayfası yapım aşamasında.', 'info');
                break;
            case 'Arızalar':
                showNotification('Arızalar sayfası yapım aşamasında.', 'info');
                break;
            case 'Kullanıcı Yönetimi':
                window.location.href = 'kullanici-yonetimi.html';
                break;
            default:
                break;
        }
    }

    // Bildirim sistemi
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;

        // Bildirim renkleri
        switch(type) {
            case 'success':
                notification.style.background = '#10b981';
                break;
            case 'error':
                notification.style.background = '#ef4444';
                break;
            case 'warning':
                notification.style.background = '#f59e0b';
                break;
            case 'info':
            default:
                notification.style.background = '#3b82f6';
                break;
        }

        document.body.appendChild(notification);

        // Otomatik kaldır
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    async function openAnnouncementModal(announcements) {
        const modal = document.getElementById('announcementModal');
        const body = document.getElementById('announcementModalBody');
        if (!modal || !body) return;

        const items = Array.isArray(announcements) ? announcements : await getTodayAnnouncements();
        renderAnnouncementModalItems(body, items);
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        markVisibleAnnouncementsRead(items);
        refreshAnnouncementsFromSheets();
    }

    function closeAnnouncementModal() {
        const modal = document.getElementById('announcementModal');
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    function renderAnnouncementModalItems(body, announcements) {
        body.innerHTML = '';
        if (!announcements.length) {
            const empty = document.createElement('div');
            empty.className = 'announcement-empty';
            empty.textContent = 'Bugun icin aktif vardiya duyurusu bulunmuyor.';
            body.appendChild(empty);
            return;
        }

        const list = document.createElement('div');
        list.className = 'announcement-list';
        announcements.forEach(item => {
            const row = document.createElement('article');
            row.className = `announcement-item ${item.priority || 'normal'}`;

            const meta = document.createElement('div');
            meta.className = 'announcement-item__meta';
            const category = formatAnnouncementCategory(item.category) || 'Vardiya';
            meta.textContent = category;

            const text = document.createElement('div');
            text.className = 'announcement-item__text';
            text.textContent = getAnnouncementText(item);

            row.appendChild(meta);
            row.appendChild(text);

            // Görsel varsa otomatik göster
            if (item.attachmentUrl) {
                // Google Drive linkini görsel URL'sine çevir
                let imageUrl = item.attachmentUrl;
                let isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(item.attachmentUrl);
                
                // Google Drive link kontrolü ve dönüşüm
                if (!isImage && item.attachmentUrl.includes('drive.google.com/file/d/')) {
                    const match = item.attachmentUrl.match(/\/file\/d\/([^\/]+)/);
                    if (match && match[1]) {
                        // Google Drive preview kullan (iframe için)
                        imageUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
                        isImage = true;
                        console.log('Google Drive linki preview URL\'sine çevrildi:', imageUrl);
                    }
                }
                
                console.log('Duyuru ek kontrolü:', { url: item.attachmentUrl, isImage: isImage, imageUrl: imageUrl });
                
                if (isImage) {
                    // Google Drive dosyası için iframe kullan
                    if (imageUrl.includes('drive.google.com')) {
                        const imageContainer = document.createElement('div');
                        imageContainer.className = 'announcement-item__image-container';
                        imageContainer.style.cursor = 'pointer';
                        
                        const iframe = document.createElement('iframe');
                        iframe.src = imageUrl;
                        iframe.className = 'announcement-item__iframe';
                        iframe.style.width = '100%';
                        iframe.style.height = '300px';
                        iframe.style.border = 'none';
                        iframe.style.borderRadius = '6px';
                        iframe.style.pointerEvents = 'none'; // Tıklamayı container'a ilet
                        
                        // Container'a tıklandığında popup aç
                        imageContainer.addEventListener('click', function() {
                            console.log('Google Drive iframe tıklandı, popup açılıyor...');
                            showImagePopup(imageUrl, getAnnouncementText(item));
                        });
                        
                        imageContainer.appendChild(iframe);
                        row.appendChild(imageContainer);
                        console.log('Google Drive iframe eklendi');
                    } else {
                        // Normal görsel için img kullan
                        const imageContainer = document.createElement('div');
                        imageContainer.className = 'announcement-item__image-container';
                        
                        const image = document.createElement('img');
                        image.src = imageUrl;
                        image.alt = getAnnouncementText(item);
                        image.className = 'announcement-item__image';
                        
                        // Görsel yükleme hatası kontrolü
                        image.addEventListener('error', function() {
                            console.error('Görsel yüklenemedi:', imageUrl);
                            image.style.display = 'none';
                            const errorMsg = document.createElement('div');
                            errorMsg.className = 'announcement-item__error';
                            errorMsg.textContent = 'Görsel yüklenemedi';
                            errorMsg.style.color = '#dc2626';
                            errorMsg.style.fontSize = '12px';
                            errorMsg.style.padding = '8px';
                            imageContainer.appendChild(errorMsg);
                        });
                        
                        // Görsel başarıyla yüklendiğinde
                        image.addEventListener('load', function() {
                            console.log('Görsel başarıyla yüklendi:', imageUrl);
                        });
                        
                        // Görseli tıklandığında popup'ta büyük göster
                        image.addEventListener('click', function() {
                            console.log('Görsel tıklandı, popup açılıyor...');
                            showImagePopup(imageUrl, getAnnouncementText(item));
                        });
                        
                        imageContainer.appendChild(image);
                        row.appendChild(imageContainer);
                        console.log('Görsel container eklendi');
                    }
                } else {
                    // Görsel değilse eki aç linki ekle
                    const attachment = document.createElement('a');
                    attachment.className = 'announcement-item__attachment';
                    attachment.href = item.attachmentUrl;
                    attachment.target = '_blank';
                    attachment.rel = 'noopener noreferrer';
                    attachment.textContent = 'Eki aç';
                    row.appendChild(attachment);
                    console.log('Eki aç linki eklendi (görsel değil)');
                }
            }

            list.appendChild(row);
        });
        body.appendChild(list);
    }

    function updateOpenAnnouncementModal(announcements) {
        const modal = document.getElementById('announcementModal');
        const body = document.getElementById('announcementModalBody');
        if (!modal || !body || !modal.classList.contains('is-open')) return;
        renderAnnouncementModalItems(body, announcements);
    }

    function showImagePopup(imageUrl, title) {
        // Mevcut popup varsa kaldır
        const existingPopup = document.getElementById('imagePopup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // Google Drive URL'si için iframe kullan
        const isGoogleDrive = imageUrl.includes('drive.google.com');
        
        // Popup oluştur
        const popup = document.createElement('div');
        popup.id = 'imagePopup';
        popup.className = 'image-popup';
        
        let contentHtml = '';
        if (isGoogleDrive) {
            contentHtml = `
                <div class="image-popup__backdrop"></div>
                <div class="image-popup__panel">
                    <div class="image-popup__header">
                        <h3>${title || 'Duyuru Görseli'}</h3>
                        <button type="button" class="image-popup__close" aria-label="Kapat">×</button>
                    </div>
                    <div class="image-popup__body">
                        <iframe src="${imageUrl}" class="image-popup__iframe" style="width: 100%; height: 600px; border: none; border-radius: 8px;"></iframe>
                    </div>
                </div>
            `;
        } else {
            contentHtml = `
                <div class="image-popup__backdrop"></div>
                <div class="image-popup__panel">
                    <div class="image-popup__header">
                        <h3>${title || 'Duyuru Görseli'}</h3>
                        <button type="button" class="image-popup__close" aria-label="Kapat">×</button>
                    </div>
                    <div class="image-popup__body">
                        <img src="${imageUrl}" alt="${title || 'Duyuru Görseli'}" class="image-popup__image">
                    </div>
                </div>
            `;
        }
        
        popup.innerHTML = contentHtml;

        document.body.appendChild(popup);

        // Animasyonla göster
        setTimeout(() => {
            popup.classList.add('is-open');
        }, 10);

        // Kapatma fonksiyonları
        const closePopup = () => {
            popup.classList.remove('is-open');
            setTimeout(() => {
                popup.remove();
            }, 300);
        };

        // Event listener'lar
        popup.querySelector('.image-popup__backdrop').addEventListener('click', closePopup);
        popup.querySelector('.image-popup__close').addEventListener('click', closePopup);
        popup.addEventListener('click', function(e) {
            if (e.target === popup) {
                closePopup();
            }
        });

        // ESC tuşu ile kapat
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closePopup();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    async function openMonthlyEnergyModal() {
        const modal = document.getElementById('monthlyEnergyModal');
        const body = document.getElementById('monthlyEnergyModalBody');
        const subtitle = document.getElementById('monthlyEnergyModalSubtitle');
        if (!modal || !body) return;

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        body.innerHTML = renderEnergyLoadingState('Aylik enerji raporu yukleniyor...');
        if (subtitle) subtitle.textContent = `${new Date().getFullYear()} yili GM uretim, calisma ve kalkis ozeti`;

        try {
            const report = await loadMonthlyEnergyReport();
            renderMonthlyEnergyReport(body, report);
            if (subtitle) {
                subtitle.textContent = `${report.year} yili GM uretim, calisma ve kalkis ozeti`;
            }
        } catch (error) {
            console.error('Aylik enerji raporu yuklenemedi:', error);
            body.innerHTML = `<div class="monthly-energy-state">${escapeHtml(error.message || 'Aylik enerji raporu alinamadi.')}</div>`;
        }
    }

    function closeMonthlyEnergyModal() {
        const modal = document.getElementById('monthlyEnergyModal');
        if (!modal) return;
        if (modal.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    async function loadMonthlyEnergyReport() {
        if (monthlyEnergyReportCache) return monthlyEnergyReportCache;
        if (monthlyEnergyReportPromise) return monthlyEnergyReportPromise;
        if (!YEARLY_ENERGY_REPORT_URL) {
            throw new Error('Yillik enerji rapor API adresi bulunamadi.');
        }

        monthlyEnergyReportPromise = (async () => {
            const url = new URL(YEARLY_ENERGY_REPORT_URL);
            url.searchParams.set('action', 'getMonthlyEnergyMotorReportData');
            url.searchParams.set('year', String(new Date().getFullYear()));

            const response = await fetch(url.toString(), { method: 'GET', mode: 'cors', cache: 'no-cache' });
            const result = await response.json();
            if (!result.success) {
                if (isInvalidActionError(result.error || result.message)) {
                    return buildMonthlyEnergyReportFromEnergyRecords(new Date().getFullYear());
                }
                throw new Error(result.error || result.message || 'Aylik enerji raporu alinamadi.');
            }
            monthlyEnergyReportCache = result;
            return result;
        })();

        try {
            return await monthlyEnergyReportPromise;
        } finally {
            monthlyEnergyReportPromise = null;
        }
    }

    function isInvalidActionError(message) {
        const text = normalizeText(message || '');
        return text.includes('gecersiz') || text.includes('invalid');
    }

    async function buildMonthlyEnergyReportFromEnergyRecords(year) {
        const url = new URL(KOJEN_ENERJI_APPS_SCRIPT_URL);
        url.searchParams.set('action', 'getRecords');

        const response = await fetch(url.toString(), { method: 'GET', mode: 'cors', cache: 'no-cache' });
        const result = await response.json();
        if (!result.success || !Array.isArray(result.data)) {
            throw new Error(result.error || result.message || 'Kojen enerji kayitlari alinamadi.');
        }

        const motors = ['GM-1', 'GM-2', 'GM-3'];
        const recordsByMotor = {};
        motors.forEach(motor => {
            recordsByMotor[motor] = [];
        });

        result.data.forEach(record => {
            const motor = normalizeMotorLabelForReport(record.motor);
            if (!recordsByMotor[motor]) return;
            const timestamp = parseDashboardDateTime(record.tarih, record.saat);
            if (!Number.isFinite(timestamp)) return;
            const date = new Date(timestamp);
            if (date.getFullYear() < year - 1 || date.getFullYear() > year) return;
            recordsByMotor[motor].push({
                timestamp,
                tarih: normalizeDashboardDate(record.tarih),
                saat: normalizeDashboardHour(record.saat),
                toplamAktifEnerji: parseDashboardNumber(record.toplamAktifEnerji),
                calismaSaati: parseDashboardNumber(record.calismaSaati),
                kalkisSayisi: parseDashboardNumber(record.kalkisSayisi)
            });
        });

        motors.forEach(motor => {
            recordsByMotor[motor].sort((a, b) => a.timestamp - b.timestamp);
        });

        const months = [];
        for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const startDate = new Date(year, monthIndex, 1, 0, 0, 0, 0);
            const endDate = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
            const month = {
                monthIndex,
                monthName: getReportMonthName(monthIndex),
                startDate: formatDashboardDateTR(startDate),
                endDate: formatDashboardDateTR(new Date(year, monthIndex + 1, 0)),
                motors: {},
                total: { productionMwh: 0, hours: 0, starts: 0, recordCount: 0 }
            };

            motors.forEach(motor => {
                const metric = calculateMonthlyMetricFromRecords(recordsByMotor[motor], startDate.getTime(), endDate.getTime());
                month.motors[motor] = metric;
                month.total.productionMwh += metric.productionMwh;
                month.total.hours += metric.hours;
                month.total.starts += metric.starts;
                month.total.recordCount += metric.recordCount;
            });

            months.push(month);
        }

        return {
            success: true,
            source: 'kojen-energy-records',
            year,
            generatedAt: formatDashboardDateTR(new Date()),
            motors,
            months
        };
    }

    function calculateMonthlyMetricFromRecords(records, startTime, endTime) {
        let baseline = null;
        let firstInPeriod = null;
        let lastInPeriod = null;
        let count = 0;

        (records || []).forEach(record => {
            if (record.timestamp < startTime) {
                baseline = record;
                return;
            }
            if (record.timestamp >= endTime) return;
            if (!firstInPeriod) firstInPeriod = record;
            lastInPeriod = record;
            count++;
        });

        if (!lastInPeriod) {
            return { productionMwh: 0, hours: 0, starts: 0, recordCount: 0 };
        }

        const startRecord = baseline || firstInPeriod;
        return {
            productionMwh: Math.max(0, lastInPeriod.toplamAktifEnerji - startRecord.toplamAktifEnerji),
            hours: Math.max(0, lastInPeriod.calismaSaati - startRecord.calismaSaati),
            starts: Math.max(0, lastInPeriod.kalkisSayisi - startRecord.kalkisSayisi),
            recordCount: count
        };
    }

    function normalizeMotorLabelForReport(value) {
        const text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
        const match = text.match(/GM-?(\d+)$/);
        return match ? `GM-${match[1]}` : text;
    }

    function parseDashboardDateTime(tarih, saat) {
        const dateText = normalizeDashboardDate(tarih);
        const parts = dateText.split('.');
        if (parts.length !== 3) return NaN;
        const hourText = normalizeDashboardHour(saat);
        const hourParts = hourText.split(':');
        return new Date(
            parseInt(parts[2], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[0], 10),
            parseInt(hourParts[0] || '0', 10),
            parseInt(hourParts[1] || '0', 10)
        ).getTime();
    }

    function getReportMonthName(monthIndex) {
        return ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'][monthIndex] || '';
    }

    function renderMonthlyEnergyReport(body, report) {
        const months = Array.isArray(report.months) ? report.months : [];
        if (!months.length) {
            body.innerHTML = '<div class="monthly-energy-state">Aylik rapor verisi bulunamadi.</div>';
            return;
        }

        const totals = calculateMonthlyReportTotals(months);
        body.innerHTML = [
            '<div class="monthly-energy-summary">',
            renderMonthlySummaryItem('Yillik Uretim', `${formatDashboardNumber(totals.productionMwh, 1)} MWh`),
            renderMonthlySummaryItem('Calisma Saati', `${formatDashboardNumber(totals.hours, 1)} saat`),
            renderMonthlySummaryItem('Kalkis Sayisi', `${formatDashboardNumber(totals.starts, 0)} adet`),
            '</div>',
            '<div class="monthly-energy-table-wrap">',
            '<table class="monthly-energy-table">',
            '<thead><tr>',
            '<th>Ay</th>',
            '<th>GM-1 MWh</th><th>GM-1 Saat</th><th>GM-1 Kalkis</th>',
            '<th>GM-2 MWh</th><th>GM-2 Saat</th><th>GM-2 Kalkis</th>',
            '<th>GM-3 MWh</th><th>GM-3 Saat</th><th>GM-3 Kalkis</th>',
            '<th>Toplam MWh</th><th>Toplam Saat</th><th>Toplam Kalkis</th>',
            '</tr></thead>',
            '<tbody>',
            months.map(renderMonthlyEnergyRow).join(''),
            '</tbody>',
            '<tfoot>',
            renderMonthlyTotalRow(totals),
            '</tfoot>',
            '</table>',
            '</div>'
        ].join('');
    }

    function renderMonthlySummaryItem(label, value) {
        return [
            '<div class="monthly-energy-summary__item">',
            `<span class="monthly-energy-summary__label">${escapeHtml(label)}</span>`,
            `<span class="monthly-energy-summary__value">${escapeHtml(value)}</span>`,
            '</div>'
        ].join('');
    }

    function renderMonthlyEnergyRow(month) {
        const gm1 = getMonthlyMotorMetric(month, 'GM-1');
        const gm2 = getMonthlyMotorMetric(month, 'GM-2');
        const gm3 = getMonthlyMotorMetric(month, 'GM-3');
        const total = month.total || {};
        return [
            '<tr>',
            `<td>${escapeHtml(month.monthName || '')}</td>`,
            renderMonthlyMetricCells(gm1),
            renderMonthlyMetricCells(gm2),
            renderMonthlyMetricCells(gm3),
            `<td>${formatDashboardNumber(parseDashboardNumber(total.productionMwh), 1)}</td>`,
            `<td>${formatDashboardNumber(parseDashboardNumber(total.hours), 1)}</td>`,
            `<td>${formatDashboardNumber(parseDashboardNumber(total.starts), 0)}</td>`,
            '</tr>'
        ].join('');
    }

    function renderMonthlyMetricCells(metric) {
        return [
            `<td>${formatDashboardNumber(parseDashboardNumber(metric.productionMwh), 1)}</td>`,
            `<td>${formatDashboardNumber(parseDashboardNumber(metric.hours), 1)}</td>`,
            `<td>${formatDashboardNumber(parseDashboardNumber(metric.starts), 0)}</td>`
        ].join('');
    }

    function renderMonthlyTotalRow(totals) {
        return [
            '<tr>',
            '<td>YIL TOPLAMI</td>',
            renderMonthlyMetricCells(totals.motors['GM-1']),
            renderMonthlyMetricCells(totals.motors['GM-2']),
            renderMonthlyMetricCells(totals.motors['GM-3']),
            `<td>${formatDashboardNumber(totals.productionMwh, 1)}</td>`,
            `<td>${formatDashboardNumber(totals.hours, 1)}</td>`,
            `<td>${formatDashboardNumber(totals.starts, 0)}</td>`,
            '</tr>'
        ].join('');
    }

    function calculateMonthlyReportTotals(months) {
        const totals = {
            productionMwh: 0,
            hours: 0,
            starts: 0,
            motors: {
                'GM-1': { productionMwh: 0, hours: 0, starts: 0 },
                'GM-2': { productionMwh: 0, hours: 0, starts: 0 },
                'GM-3': { productionMwh: 0, hours: 0, starts: 0 }
            }
        };

        months.forEach(month => {
            ['GM-1', 'GM-2', 'GM-3'].forEach(motor => {
                const metric = getMonthlyMotorMetric(month, motor);
                totals.motors[motor].productionMwh += parseDashboardNumber(metric.productionMwh);
                totals.motors[motor].hours += parseDashboardNumber(metric.hours);
                totals.motors[motor].starts += parseDashboardNumber(metric.starts);
            });
            totals.productionMwh += parseDashboardNumber(month.total?.productionMwh);
            totals.hours += parseDashboardNumber(month.total?.hours);
            totals.starts += parseDashboardNumber(month.total?.starts);
        });

        return totals;
    }

    function getMonthlyMotorMetric(month, motor) {
        return month?.motors?.[motor] || { productionMwh: 0, hours: 0, starts: 0 };
    }

    async function openSteamDataModal() {
        const modal = document.getElementById('steamDataModal');
        const body = document.getElementById('steamDataModalBody');
        const subtitle = document.getElementById('steamDataModalSubtitle');
        if (!modal || !body) return;

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        body.innerHTML = renderEnergyLoadingState('Buhar kayitlari yukleniyor...');
        if (subtitle) subtitle.textContent = 'Son 32 buhar kaydi';

        try {
            const records = await loadSteamRecords();
            renderSteamDataReport(body, records);
            if (subtitle) {
                subtitle.textContent = records.length ? `Son ${records.length} buhar kaydi` : 'Buhar kaydi bulunamadi';
            }
        } catch (error) {
            console.error('Buhar kayitlari yuklenemedi:', error);
            body.innerHTML = `<div class="monthly-energy-state">${escapeHtml(error.message || 'Buhar kayitlari alinamadi.')}</div>`;
        }
    }

    function closeSteamDataModal() {
        const modal = document.getElementById('steamDataModal');
        if (!modal) return;
        if (modal.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    async function loadSteamRecords() {
        if (steamRecordsCache) return steamRecordsCache;
        if (steamRecordsPromise) return steamRecordsPromise;
        if (!BUHAR_APPS_SCRIPT_URL) {
            throw new Error('Buhar API adresi bulunamadi.');
        }

        steamRecordsPromise = (async () => {
            const url = new URL(BUHAR_APPS_SCRIPT_URL);
            url.searchParams.set('action', 'getLastRecords');
            url.searchParams.set('count', '32');

            const response = await fetch(url.toString(), { method: 'GET', mode: 'cors', cache: 'no-cache' });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || result.message || 'Buhar kayitlari alinamadi.');
            }
            steamRecordsCache = Array.isArray(result.data) ? result.data : [];
            return steamRecordsCache;
        })();

        try {
            return await steamRecordsPromise;
        } finally {
            steamRecordsPromise = null;
        }
    }

    function renderSteamDataReport(body, records) {
        const list = Array.isArray(records) ? records : [];
        if (!list.length) {
            body.innerHTML = '<div class="monthly-energy-state">Buhar kaydi bulunamadi.</div>';
            return;
        }

        const latest = list[0] || {};
        const total = list.reduce((sum, record) => sum + parseDashboardNumber(record.buharMiktari), 0);
        const average = list.length ? total / list.length : 0;

        body.innerHTML = [
            '<div class="steam-data-summary">',
            renderMonthlySummaryItem('Son Deger', `${formatDashboardNumber(parseDashboardNumber(latest.buharMiktari), 2)} Ton`),
            renderMonthlySummaryItem('Kayit Sayisi', `${list.length} gun`),
            renderMonthlySummaryItem('Ortalama', `${formatDashboardNumber(average, 2)} Ton`),
            '</div>',
            '<div class="monthly-energy-table-wrap">',
            '<table class="steam-data-table">',
            '<thead><tr><th>#</th><th>Tarih</th><th>Buhar (Ton)</th><th>Kaydeden</th><th>Kayit Zamani</th></tr></thead>',
            '<tbody>',
            list.map(renderSteamDataRow).join(''),
            '</tbody>',
            '</table>',
            '</div>'
        ].join('');
    }

    function renderSteamDataRow(record, index) {
        return [
            '<tr>',
            `<td>${index + 1}</td>`,
            `<td>${escapeHtml(normalizeDashboardDate(record.tarih || '-'))}</td>`,
            `<td>${formatDashboardNumber(parseDashboardNumber(record.buharMiktari), 2)}</td>`,
            `<td>${escapeHtml(record.kaydeden || '-')}</td>`,
            `<td>${escapeHtml(record.kayitTarihi || record.kayitZamani || '-')}</td>`,
            '</tr>'
        ].join('');
    }

    async function openMaintenanceHistoryModal() {
        const modal = document.getElementById('maintenanceHistoryModal');
        const body = document.getElementById('maintenanceHistoryModalBody');
        const subtitle = document.getElementById('maintenanceHistoryModalSubtitle');
        if (!modal || !body) return;

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        body.innerHTML = renderEnergyLoadingState('Bakim kayitlari yukleniyor...');
        if (subtitle) subtitle.textContent = 'Son 100 bakim kaydi';

        try {
            const report = await loadMaintenanceHistoryReport();
            renderMaintenanceHistoryReport(body, report);
            if (subtitle) {
                const count = Array.isArray(report.records) ? report.records.length : 0;
                subtitle.textContent = count ? `Son ${count} bakim kaydi` : 'Bakim kaydi bulunamadi';
            }
        } catch (error) {
            console.error('Bakim gecmisi yuklenemedi:', error);
            body.innerHTML = `<div class="monthly-energy-state">${escapeHtml(error.message || 'Bakim gecmisi alinamadi.')}</div>`;
        }
    }

    function closeMaintenanceHistoryModal() {
        const modal = document.getElementById('maintenanceHistoryModal');
        if (!modal) return;
        if (modal.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    async function loadMaintenanceHistoryReport() {
        if (maintenanceHistoryCache) return maintenanceHistoryCache;
        if (maintenanceHistoryPromise) return maintenanceHistoryPromise;
        if (!BAKIM_APPS_SCRIPT_URL) {
            throw new Error('Bakim API adresi bulunamadi.');
        }

        maintenanceHistoryPromise = (async () => {
            const url = new URL(BAKIM_APPS_SCRIPT_URL);
            url.searchParams.set('action', 'getReport');
            url.searchParams.set('range', 'all');
            url.searchParams.set('limit', '100');
            url.searchParams.set('skipSummary', '1');
            url.searchParams.set('fast', '1');

            const response = await fetch(url.toString(), { method: 'GET', mode: 'cors', cache: 'no-cache' });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || result.message || 'Bakim gecmisi alinamadi.');
            }
            maintenanceHistoryCache = result;
            return result;
        })();

        try {
            return await maintenanceHistoryPromise;
        } finally {
            maintenanceHistoryPromise = null;
        }
    }

    function renderMaintenanceHistoryReport(body, report) {
        const records = Array.isArray(report.records) ? report.records : [];
        if (!records.length) {
            body.innerHTML = '<div class="monthly-energy-state">Bakim kaydi bulunamadi.</div>';
            return;
        }

        const totals = records.reduce((acc, record) => {
            const type = normalizeText(record.type || '');
            if (type.includes('ariza')) acc.fault++;
            else if (type.includes('periyodik')) acc.periodic++;
            else acc.normal++;
            return acc;
        }, { periodic: 0, normal: 0, fault: 0 });

        body.innerHTML = [
            '<div class="steam-data-summary">',
            renderMonthlySummaryItem('Toplam Kayit', `${records.length} form`),
            renderMonthlySummaryItem('Periyodik', `${totals.periodic} form`),
            renderMonthlySummaryItem('Ariza', `${totals.fault} form`),
            '</div>',
            '<div class="monthly-energy-table-wrap">',
            '<table class="maintenance-history-table">',
            '<thead><tr><th>Kayıt No</th><th>Tarih</th><th>Saat</th><th>Motor</th><th>Tür</th><th>İşlem</th><th>Sorumlu</th><th>Durum</th><th>Açıklama</th></tr></thead>',
            '<tbody>',
            records.map(renderMaintenanceHistoryRow).join(''),
            '</tbody>',
            '</table>',
            '</div>'
        ].join('');
    }

    function renderMaintenanceHistoryRow(record) {
        const typeText = record.type || '-';
        const typeClass = getMaintenanceHistoryTypeClass(typeText);
        return [
            '<tr>',
            `<td>${escapeHtml(record.recordNo || '-')}</td>`,
            `<td>${escapeHtml(record.date || '-')}</td>`,
            `<td>${escapeHtml(record.time || '-')}</td>`,
            `<td>${escapeHtml(record.motor || '-')}</td>`,
            `<td><span class="maintenance-history-badge ${typeClass}">${escapeHtml(typeText)}</span></td>`,
            `<td>${escapeHtml(record.subtype || record.operation || '-')}</td>`,
            `<td>${escapeHtml(record.technician || '-')}</td>`,
            `<td>${escapeHtml(record.status || '-')}</td>`,
            `<td class="maintenance-history-table__note">${escapeHtml(record.notes || '-')}</td>`,
            '</tr>'
        ].join('');
    }

    function getMaintenanceHistoryTypeClass(typeText) {
        const type = normalizeText(typeText || '');
        if (type.includes('ariza')) return 'maintenance-history-badge--fault';
        if (type.includes('periyodik')) return 'maintenance-history-badge--periodic';
        return '';
    }

    function renderEnergyLoadingState(message) {
        return [
            '<div class="monthly-energy-state monthly-energy-state--loading">',
            '<div class="energy-loading-icon" aria-hidden="true">⚡</div>',
            `<div>${escapeHtml(message)}</div>`,
            '</div>'
        ].join('');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    document.querySelectorAll('[data-close-announcements]').forEach(item => {
        item.addEventListener('click', closeAnnouncementModal);
    });

    document.querySelectorAll('[data-close-monthly-energy]').forEach(item => {
        item.addEventListener('click', closeMonthlyEnergyModal);
    });

    document.querySelectorAll('[data-close-steam-data]').forEach(item => {
        item.addEventListener('click', closeSteamDataModal);
    });

    document.querySelectorAll('[data-close-maintenance-history]').forEach(item => {
        item.addEventListener('click', closeMaintenanceHistoryModal);
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAnnouncementModal();
            closeMonthlyEnergyModal();
            closeSteamDataModal();
            closeMaintenanceHistoryModal();
        }
    });

    function openSummaryCard(card) {
        if (card.dataset.target === 'monthly-energy-report') {
            openMonthlyEnergyModal();
            return;
        }

        if (card.dataset.target === 'steam-records') {
            openSteamDataModal();
            return;
        }

        if (card.classList.contains('maintenance') || card.dataset.target === 'maintenance-history') {
            openMaintenanceHistoryModal();
            return;
        }

        if (card.dataset.target === 'announcements') {
            openAnnouncementModal();
            return;
        }

        const cardTitle = card.querySelector('h3').textContent;
        showNotification(`${cardTitle} detayları için sayfa yapım aşamasında.`, 'info');
    }

    // Özet kartlarına tıklama olayı
    const summaryCards = document.querySelectorAll('.summary-card');
    summaryCards.forEach(card => {
        card.addEventListener('click', function() {
            openSummaryCard(this);
        });

        card.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openSummaryCard(this);
            }
        });
    });

    // Klavye kısayolları
    document.addEventListener('keydown', function(e) {
        // Ctrl + L: Çıkış yap
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            handleLogout();
        }
        
        // Ctrl + H: Ana sayfa
        if (e.ctrlKey && e.key === 'h') {
            e.preventDefault();
            window.location.href = 'anasayfa.html';
        }
        
        // Ctrl + U: Kullanıcı yönetimi
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            window.location.href = 'kullanici-yonetimi.html';
        }
    });

    // Sayfa görünürlük değişikliği
    document.addEventListener('visibilitychange', async function() {
        if (!document.hidden) {
            // Sayfa tekrar görünür olduğunda verileri güncelle
            await loadDashboardData();
        }
    });

    // Responsive menü kontrolü
    function checkResponsiveMenu() {
        if (window.innerWidth <= 768) {
            document.body.classList.add('mobile-view');
        } else {
            document.body.classList.remove('mobile-view');
        }
    }

    window.addEventListener('resize', checkResponsiveMenu);
    checkResponsiveMenu();
});

// CSS animasyonları için stil ekle
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .mobile-view .sidebar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: auto;
        width: 100%;
        z-index: 1000;
    }
    
    .mobile-view .main-content {
        margin-bottom: 80px;
    }
`;
document.head.appendChild(style);

// Kimlik doğrulama kontrolü
function checkAuth() {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (!loggedInUser) {
        window.location.href = 'index.html';
        return;
    }
    
    try {
        const user = JSON.parse(loggedInUser);
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        
        // Tüm userNameDisplay elementlerini güncelle
        const allUserNameDisplays = document.querySelectorAll('[id="userNameDisplay"]');
        
        allUserNameDisplays.forEach((element, index) => {
            element.textContent = fullName || user.email || 'Kullanici';
        });
        
        console.log('Ana Sayfa - Kullanici adi ayarlandi:', fullName || user.email || 'Kullanici');
    } catch (e) {
        console.error('Ana Sayfa - Kullanici bilgileri okunamadi:', e);
        const allElements = document.querySelectorAll('[id="userNameDisplay"]');
        allElements.forEach(element => {
            element.textContent = 'Kullanici';
        });
    }
}

// Buhar verisi kontrol sistemi
const STEAM_CHECK_STORAGE_KEY = 'steamCheckLastRun';
const STEAM_ANNOUNCEMENT_PREFIX = 'BUHAR_VERISI_EKSIK:';

// Basit tarih formatlama fonksiyonu
function formatSteamDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${date.getFullYear()}`;
}

// Basit tarih normalizasyon fonksiyonu
function normalizeSteamDate(dateStr) {
    if (!dateStr) return '';
    const str = String(dateStr).trim();
    // GG.AA.YYYY formatını kontrol et
    if (str.includes('.')) {
        return str;
    }
    // Diğer formatları dönüştürme gerekebilir
    return str;
}

async function checkPreviousDaySteamData() {
    try {
        const now = new Date();
        const hour = now.getHours();
        
        // Sadece 00:30'dan sonra çalıştır
        if (hour < 0 || (hour === 0 && now.getMinutes() < 30)) {
            return;
        }

        // Bugün zaten kontrol edildiyse atla
        const lastRun = localStorage.getItem(STEAM_CHECK_STORAGE_KEY);
        const today = formatSteamDate(now);
        if (lastRun === today) {
            return;
        }

        console.log('Buhar verisi kontrolü başlatılıyor...');
        
        // Bir önceki günün tarihini hesapla
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayDate = formatSteamDate(yesterday);
        
        console.log('Kontrol edilecek tarih:', yesterdayDate);

        // Buhar verilerini çek
        const buharUrl = window.AppConfig.getScriptUrl('buhar');
        const url = new URL(buharUrl);
        url.searchParams.append('action', 'getLastRecords');
        url.searchParams.append('count', '50');
        
        const response = await fetch(url, { method: 'GET', mode: 'cors' });
        const result = await response.json();
        
        if (!result.success || !Array.isArray(result.data)) {
            console.error('Buhar verileri alınamadı:', result.error);
            return;
        }

        // Bir önceki günün buhar verisini ara
        const yesterdayRecord = result.data.find(record => 
            normalizeSteamDate(record.tarih) === yesterdayDate
        );

        if (yesterdayRecord) {
            console.log('Buhar verisi bulundu:', yesterdayRecord);
            // Bildiriyi sil
            await deleteSteamMissingAnnouncement(yesterdayDate);
        } else {
            console.log('Buhar verisi bulunamadı, bildirim gönderiliyor...');
            // Bildirim gönder
            await createSteamMissingAnnouncement(yesterdayDate);
        }

        // Kontrol edildiğini kaydet
        localStorage.setItem(STEAM_CHECK_STORAGE_KEY, today);
        
    } catch (error) {
        console.error('Buhar verisi kontrol hatası:', error);
    }
}

async function createSteamMissingAnnouncement(date) {
    try {
        const announcementData = {
            title: `Buhar Verisi Eksik - ${date}`,
            message: `${date} tarihli buhar verisi girilmemiş. Lütfen veri girişi yapınız.`,
            priority: 'high',
            category: 'veri-eksik',
            active: true,
            createdBy: 'Sistem'
        };

        const result = await saveAnnouncementToSheets(announcementData);
        if (result.success) {
            console.log('Buhar eksik bildirimi gönderildi:', date);
        } else {
            console.error('Buhar eksik bildirimi gönderilemedi:', result.error);
        }
    } catch (error) {
        console.error('Buhar eksik bildirimi oluşturma hatası:', error);
    }
}

async function deleteSteamMissingAnnouncement(date) {
    try {
        // Mevcut duyuruları çek
        const result = await fetchAnnouncementsFromSheets({ active: 'true' });
        
        if (!result.success || !Array.isArray(result.data)) {
            console.error('Duyurular alınamadı');
            return;
        }

        // Buhar eksik bildirimini ara
        const announcementId = result.data.find(item => 
            item.title && item.title.includes(`Buhar Verisi Eksik - ${date}`)
        );

        if (announcementId && announcementId.id) {
            const deleteResult = await deleteAnnouncementFromSheets(announcementId.id);
            if (deleteResult.success) {
                console.log('Buhar eksik bildirimi silindi:', date);
            } else {
                console.error('Buhar eksik bildirimi silinemedi:', deleteResult.error);
            }
        }
    } catch (error) {
        console.error('Buhar eksik bildirimi silme hatası:', error);
    }
}

// Buhar kontrolünü başlat
setTimeout(checkPreviousDaySteamData, 60000); // Sayfa yüklendikten 1 dakika sonra
setInterval(checkPreviousDaySteamData, 30 * 60 * 1000); // Her 30 dakikada bir kontrol
