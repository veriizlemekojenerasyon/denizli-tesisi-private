// ⏰ Otomatik yönlendirme kontrolü (15:59, 23:59, 07:59)
function checkAutoRedirect() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    
    // Yönlendirme saatleri: 15:59, 23:59, 07:59
    const redirectTimes = ['15:59', '23:59', '07:59'];
    
    if (redirectTimes.includes(currentTime)) {
        // Aktif vardiya varken kullanıcıyı otomatik çıkarma; kayıt akışını bozabilir.
        if (localStorage.getItem('mevcutVardiya')) {
            console.log('Aktif vardiya var, otomatik yönlendirme atlandı.');
            return false;
        }
        console.log(`⏰ Otomatik yönlendirme saati: ${currentTime}`);
        
        // Vardiya İşlem Kaydetme modal'ı açık mı kontrol et
        const islemModal = document.querySelector('.islem-detaylari-modal');
        if (islemModal) {
            console.log('Vardiya İşlem Kaydetme açık, kaydediliyor...');
            // Modal'ı kapat ve kaydet
            islemModal.remove();
        }
        
        // 2 saniye bekle ve yönlendir
        setTimeout(() => {
            localStorage.removeItem('loggedInUser');
            window.location.href = 'index.html';
        }, 2000);
        return true;
    }
    return false;
}

// Kimlik doğrulama kontrolü
function checkAuth() {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (!loggedInUser) {
        window.location.href = 'anasayfa.html';
        return;
    }
    
    try {
        const user = JSON.parse(loggedInUser);
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        
        // Tüm userNameDisplay elementlerini güncelle
        const allUserNameDisplays = document.querySelectorAll('[id="userNameDisplay"]');
        
        allUserNameDisplays.forEach((element, index) => {
            element.textContent = fullName || user.email || 'Kullanıcı';
        });
        
        console.log('Vardiya - Kullanıcı adı ayarlandı:', fullName || user.email || 'Kullanıcı');
    } catch (e) {
        console.error('Vardiya - Kullanıcı bilgileri okunamadı:', e);
        const allElements = document.querySelectorAll('[id="userNameDisplay"]');
        allElements.forEach(element => {
            element.textContent = 'Kullanıcı';
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Önce kimlik doğrulama kontrolü
    checkAuth();
    
    // ⏰ Otomatik yönlendirme kontrolünü başlat (her dakika kontrol et)
    checkAutoRedirect();
    setInterval(checkAutoRedirect, 60000); // Her 60 saniyede bir kontrol et
    
    // Vardiya Google Apps Script URL
    const VARDIYA_APPS_SCRIPT_URL = window.AppConfig.getScriptUrl('vardiya');
    const VARDIYA_CONTROL_URLS = {
        saatlik: window.AppConfig.getScriptUrl('saatlik'),
        motor: window.AppConfig.getScriptUrl('motor'),
        enerji: window.AppConfig.getScriptUrl('enerji'),
        bildirim: window.AppConfig.getScriptUrl('bildirim')
    };
    const VARDIYA_RECORD_FETCH_COUNT = '240';
    const VARDIYA_CLOSE_PRECHECK_ENABLED = false;

    function logVardiyaTiming(label, startedAt, result) {
        console.log(label, Math.round(performance.now() - startedAt), 'ms', {
            functionMs: result?.durationMs || '',
            totalMs: result?.totalDurationMs || '',
            lockWaitMs: result?.lockWaitMs || 0,
            lockSkipped: Boolean(result?.lockSkipped)
        });
    }

    function refreshWeeklyRecordsSoon(delayMs = 700) {
        window.setTimeout(() => haftalikVardiyaKayitlariniGoster(), delayMs);
    }

    function resetVardiyaBitirButton() {
        if (!vardiyaBitirBtn) return;
        vardiyaBitirBtn.textContent = 'VARDİYAYI BİTİR';
        vardiyaBitirBtn.disabled = false;
    }

    function reportVardiyaCloseBackgroundTasks(tasks) {
        if (!tasks || !tasks.length) return;
        Promise.all(tasks).then(results => {
            const failed = results.filter(item => !item.success);
            if (failed.length) {
                console.warn('Vardiya kapatma arka plan kayit uyarisi:', failed.map(item => item.error));
            }
        });
    }

    function makeVardiyaCloseTask(promise) {
        return Promise.resolve(promise)
            .then(value => ({ success: true, value }))
            .catch(error => ({ success: false, error }));
    }

    function runVardiyaCloseSideTasks(taskFactories, delayMs = 600) {
        if (!taskFactories || !taskFactories.length) return;
        window.setTimeout(() => {
            reportVardiyaCloseBackgroundTasks(taskFactories.map(factory => {
                try {
                    return factory();
                } catch (error) {
                    return Promise.resolve({ success: false, error });
                }
            }));
        }, delayMs);
    }

    function showVardiyaStatusMessage(message, type = 'info') {
        const div = document.createElement('div');
        const colors = {
            success: '#16a34a',
            error: '#dc2626',
            warning: '#d97706',
            info: '#2563eb'
        };
        div.textContent = message;
        div.style.cssText = [
            'position:fixed',
            'right:20px',
            'top:20px',
            'z-index:9999',
            'padding:12px 16px',
            'border-radius:8px',
            'color:#fff',
            'font-weight:600',
            'box-shadow:0 8px 24px rgba(15,23,42,.18)',
            `background:${colors[type] || colors.info}`
        ].join(';');
        document.body.appendChild(div);
        window.setTimeout(() => div.remove(), 3500);
    }
    
    // Tarih seçicisine otomatik bugünün tarihini atama
    const tarihInput = document.getElementById('tarih');
    const vardiyaSelect = document.getElementById('vardiya');
    const personelSelect = document.getElementById('personel');
    const operatorStatus = document.getElementById('operatorStatus');
    const kaydetBtn = document.getElementById('kaydetBtn');
    const temizleBtn = document.getElementById('temizleBtn');
    const islemKaydetBtn = document.getElementById('islemKaydetBtn');
    const vardiyaBitirBtn = document.getElementById('vardiyaBitirBtn');
    const devredenIslerInput = document.getElementById('devredenIsler');
    const temizlikChecklist = document.getElementById('temizlikChecklist');
    const temizlikGorevleri = document.getElementById('temizlikGorevleri');
    const temizlikChecklistMeta = document.getElementById('temizlikChecklistMeta');
    const temizlikSaveStatus = document.getElementById('temizlikSaveStatus');
    const temizlikAySecimi = document.getElementById('temizlikAySecimi');
    const temizlikAyYukleBtn = document.getElementById('temizlikAyYukleBtn');
    const temizlikAylikTableBody = document.getElementById('temizlikAylikTableBody');
    const temizlikAylikOzet = document.getElementById('temizlikAylikOzet');
    const CLEANING_TASKS = [
        { vardiya: '08-16', role: 'Ana Vardiya', area: 'Tuvalet/Banyo, Soyunma Odasi ve Mutfak' },
        { vardiya: '08-16', role: 'Yardimci Vardiya', area: 'Hucre Odasi ve Merdivenleri', helperOnly: true },
        { vardiya: '16-24', role: 'Ana Vardiya', area: 'Kontrol Odasi ve Koridor' },
        { vardiya: '24-08', role: 'Ana Vardiya', area: 'Motor Dairesi' }
    ];
    
    // Haftalık vardiya kayıtları elementleri
    const baslangicTarihInput = document.getElementById('baslangicTarih');
    const bitisTarihInput = document.getElementById('bitisTarih');
    const tarihFiltreBtn = document.getElementById('tarihFiltreBtn');
    const tarihSifirlaBtn = document.getElementById('tarihSifirlaBtn');
    
    // Yardımcı operatör elementleri
    const yardimciOperatorSection = document.getElementById('yardimciOperatorSection');
    const yardimciOperatorVar = document.getElementById('yardimciOperatorVar');
    const yardimciOperatorListesi = document.getElementById('yardimciOperatorListesi');
    const yardimciOperator = document.getElementById('yardimciOperator');

    
    // Bugünün tarihini al ve input'a ata (DD.MM.YYYY formatında)
    const today = new Date();
    tarihInput.value = formatDateTR(today);

    // Vardiya kayıtları için varsayılan tarih aralığı (son 30 gün)
    setDefaultDateRange();
    setDefaultCleaningMonth();
    loadMonthlyCleaningList();

    function formatDateTR(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${day}.${month}.${year}`;
    }

    function formatDateInputValue(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function setDefaultDateRange() {
        const bitis = new Date();
        const baslangic = new Date();
        baslangic.setDate(baslangic.getDate() - 30);
        baslangicTarihInput.value = formatDateInputValue(baslangic);
        bitisTarihInput.value = formatDateInputValue(bitis);
    }

    function parseDateValue(value) {
        if (!value) return null;
        const text = String(value).trim();
        const isoParts = text.split('-');
        if (isoParts.length === 3) {
            return new Date(Number(isoParts[0]), Number(isoParts[1]) - 1, Number(isoParts[2]));
        }

        const trParts = text.split('.');
        if (trParts.length === 3) {
            return new Date(Number(trParts[2]), Number(trParts[1]) - 1, Number(trParts[0]));
        }

        return null;
    }

    function toIsoDateParam(value) {
        const date = parseDateValue(value);
        return date ? formatDateInputValue(date) : value;
    }

    function isActiveStatus(value) {
        return String(value || '').trim().toLowerCase() === 'aktif';
    }

    function clearMevcutVardiyaDisplay() {
        localStorage.removeItem('mevcutVardiya');
        const mevcutVardiyaDiv = document.getElementById('mevcutVardiya');
        if (mevcutVardiyaDiv) {
            mevcutVardiyaDiv.style.display = 'none';
        }
        if (temizlikChecklist) {
            temizlikChecklist.style.display = 'none';
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getCleaningTasksForShift(vardiya, hasHelper) {
        return CLEANING_TASKS.filter(task => task.vardiya === vardiya && (!task.helperOnly || hasHelper));
    }

    function getCleaningStorageKey(vardiya) {
        return [
            'vardiyaTemizlik',
            vardiya.id || '',
            normalizeDateText(vardiya.tarih || tarihInput.value),
            vardiya.vardiya || vardiyaSelect.value
        ].join(':');
    }

    function setCleaningStatus(text, state) {
        if (!temizlikSaveStatus) return;
        temizlikSaveStatus.textContent = text;
        temizlikSaveStatus.className = 'temizlik-status' + (state ? ` ${state}` : '');
    }

    function readLocalCleaningState(vardiya) {
        try {
            return JSON.parse(localStorage.getItem(getCleaningStorageKey(vardiya)) || '{}');
        } catch (error) {
            return {};
        }
    }

    function writeLocalCleaningState(vardiya, tasks) {
        const state = {};
        tasks.forEach(task => {
            state[`${task.role}|${task.area}`] = {
                done: !!task.done,
                doneAt: task.doneAt || ''
            };
        });
        localStorage.setItem(getCleaningStorageKey(vardiya), JSON.stringify(state));
    }

    function collectCleaningTasksFromDom(vardiya) {
        const items = Array.from(temizlikGorevleri?.querySelectorAll('.temizlik-gorev-input') || []);
        return items.map(item => ({
            role: item.dataset.role || '',
            area: item.dataset.area || '',
            done: item.checked,
            doneAt: item.checked ? (item.dataset.doneAt || new Date().toLocaleString('tr-TR')) : ''
        }));
    }

    function hasCheckedCleaningTask() {
        return Array.from(temizlikGorevleri?.querySelectorAll('.temizlik-gorev-input') || [])
            .some(item => item.checked);
    }

    async function saveCleaningChecklist(vardiya) {
        if (!vardiya || !temizlikGorevleri) return;
        const tasks = collectCleaningTasksFromDom(vardiya);
        writeLocalCleaningState(vardiya, tasks);
        setCleaningStatus('Kaydediliyor...', '');

        try {
            const url = new URL(VARDIYA_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'saveCleaningChecklist');
            url.searchParams.append('vardiyaId', vardiya.id || '');
            url.searchParams.append('tarih', toIsoDateParam(vardiya.tarih));
            url.searchParams.append('vardiya', vardiya.vardiya || vardiyaSelect.value);
            url.searchParams.append('personel', vardiya.personelAdSoyad || '');
            url.searchParams.append('yardimciOperator', vardiya.yardimciOperator?.adSoyad || '');
            url.searchParams.append('kaydeden', vardiya.personelAdSoyad || 'Operator');
            url.searchParams.append('tasks', JSON.stringify(tasks));

            const response = await fetch(url);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Kayit basarisiz');

            setCleaningStatus('Kaydedildi', 'saved');
            loadMonthlyCleaningList();
        } catch (error) {
            console.error('Temizlik kayit hatasi:', error);
            setCleaningStatus('Yerelde tutuldu', 'error');
        }
    }

    async function renderCleaningChecklist(vardiya) {
        if (!temizlikChecklist || !temizlikGorevleri || !vardiya) return;

        const hasHelper = !!vardiya.yardimciOperator;
        let tasks = getCleaningTasksForShift(vardiya.vardiya, hasHelper).map(task => ({ ...task, done: false, doneAt: '' }));
        const localState = readLocalCleaningState(vardiya);
        tasks = tasks.map(task => {
            const saved = localState[`${task.role}|${task.area}`];
            return saved ? { ...task, done: !!saved.done, doneAt: saved.doneAt || '' } : task;
        });

        try {
            const url = new URL(VARDIYA_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getCleaningChecklist');
            url.searchParams.append('tarih', toIsoDateParam(vardiya.tarih));
            url.searchParams.append('vardiya', vardiya.vardiya);
            url.searchParams.append('hasHelper', String(hasHelper));
            const response = await fetch(url);
            const result = await response.json();
            if (result.success && Array.isArray(result.data)) {
                const remoteMap = new Map(result.data.map(item => [`${item.role}|${item.area}`, item]));
                tasks = tasks.map(task => {
                    const remote = remoteMap.get(`${task.role}|${task.area}`);
                    return remote ? { ...task, done: !!remote.done, doneAt: remote.doneAt || task.doneAt } : task;
                });
            }
        } catch (error) {
            console.warn('Temizlik listesi okunamadi, yerel durum kullaniliyor.', error);
        }

        temizlikChecklistMeta.textContent = `${normalizeDateText(vardiya.tarih)} - ${vardiya.vardiya} temizlik gorevleri`;
        temizlikGorevleri.innerHTML = tasks.map((task, index) => `
            <label class="temizlik-gorev">
                <input
                    type="checkbox"
                    class="temizlik-gorev-input"
                    data-role="${escapeHtml(task.role)}"
                    data-area="${escapeHtml(task.area)}"
                    data-done-at="${escapeHtml(task.doneAt || '')}"
                    ${task.done ? 'checked' : ''}
                >
                <span>
                    <strong>${escapeHtml(task.area)}</strong>
                    <span>${escapeHtml(task.role)}${task.doneAt ? ` - ${escapeHtml(task.doneAt)}` : ''}</span>
                </span>
            </label>
        `).join('');

        temizlikGorevleri.querySelectorAll('.temizlik-gorev-input').forEach(input => {
            input.addEventListener('change', function() {
                this.dataset.doneAt = this.checked ? new Date().toLocaleString('tr-TR') : '';
                saveCleaningChecklist(vardiya);
            });
        });

        temizlikChecklist.style.display = 'block';
        setCleaningStatus(tasks.every(task => task.done) ? 'Tamamlandi' : 'Bekliyor', tasks.every(task => task.done) ? 'saved' : '');
    }

    function setDefaultCleaningMonth() {
        if (!temizlikAySecimi) return;
        const now = new Date();
        temizlikAySecimi.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function getMonthlyCleaningVisibleRows(rows, year, month) {
        const now = new Date();
        const selectedYear = Number(year);
        const selectedMonth = Number(month);
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        if (selectedYear === currentYear && selectedMonth === currentMonth) {
            const todayText = formatDateTR(now);
            return (rows || []).filter(row => normalizeDateText(row.tarih) === todayText);
        }

        return rows || [];
    }

    async function loadMonthlyCleaningList() {
        if (!temizlikAySecimi || !temizlikAylikTableBody) return;
        const [year, month] = String(temizlikAySecimi.value || '').split('-');
        if (!year || !month) return;

        temizlikAylikTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:18px;">Temizlik listesi yükleniyor...</td></tr>';

        try {
            const url = new URL(VARDIYA_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getMonthlyCleaningList');
            url.searchParams.append('year', year);
            url.searchParams.append('month', month);
            const response = await fetch(url);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Liste yuklenemedi');

            const rows = result.data || [];
            const currentDate = new Date();
            const visibleRows = getMonthlyCleaningVisibleRows(rows, year, month);
            const doneCount = visibleRows.filter(row => row.yapildi === 'EVET').length;
            const isCurrentMonth = Number(year) === currentDate.getFullYear() && Number(month) === currentDate.getMonth() + 1;
            if (temizlikAylikOzet) {
                temizlikAylikOzet.textContent = isCurrentMonth
                    ? `${formatDateTR(currentDate)}: ${visibleRows.length} görev, ${doneCount} tamamlandı`
                    : `${result.sheetName}: ${visibleRows.length} görev, ${doneCount} tamamlandı`;
            }

            if (!visibleRows.length) {
                temizlikAylikTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:18px;">${isCurrentMonth ? 'Bugün için temizlik kaydı yok.' : 'Bu ay için temizlik kaydı yok.'}</td></tr>`;
                return;
            }

            temizlikAylikTableBody.innerHTML = visibleRows.map(row => {
                const done = row.yapildi === 'EVET';
                return `
                    <tr class="${done ? 'temizlik-done' : 'temizlik-pending'}">
                        <td>${escapeHtml(row.tarih)}</td>
                        <td>${escapeHtml(row.vardiya)}</td>
                        <td>${escapeHtml(row.rol)}</td>
                        <td>${escapeHtml(row.alan)}</td>
                        <td>${escapeHtml(row.sorumlu || row.yardimciOperator || '-')}</td>
                        <td><span class="durum-badge ${done ? 'done' : 'pending'}">${done ? 'Yapildi' : 'Bekliyor'}</span></td>
                        <td>${escapeHtml(row.yapilmaZamani || '-')}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Aylik temizlik listesi hatasi:', error);
            if (temizlikAylikOzet) temizlikAylikOzet.textContent = 'Liste yüklenemedi.';
            temizlikAylikTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#991b1b; padding:18px;">${escapeHtml(error.message)}</td></tr>`;
        }
    }

    async function fetchControlJson(baseUrl, params) {
        const url = new URL(baseUrl);
        Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
        const response = await fetch(url);
        return response.json();
    }

    function getShiftHours(vardiya) {
        if (vardiya === '08-16') return [8, 9, 10, 11, 12, 13, 14, 15];
        if (vardiya === '16-24') return [16, 17, 18, 19, 20, 21, 22, 23];
        return [0, 1, 2, 3, 4, 5, 6, 7];
    }

    function normalizeDateText(value) {
        const date = parseDateValue(value);
        return date ? formatDateTR(date) : String(value || '');
    }

    function recordMatchesDate(record, trDate) {
        const text = String(record.tarih || '');
        const parts = trDate.split('.');
        const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
        return text.includes(trDate) || text.startsWith(iso);
    }

    function buildMissingForShift(records, trDate, vardiya, moduleName) {
        const motors = moduleName === 'saatlik' ? [''] : ['GM-1', 'GM-2', 'GM-3'];
        const missing = [];
        getShiftHours(vardiya).forEach(hour => {
            const saat = `${String(hour).padStart(2, '0')}:00`;
            motors.forEach(motor => {
                const exists = records.some(record =>
                    recordMatchesDate(record, trDate) &&
                    record.saat === saat &&
                    (!motor || String(record.motor || '').trim() === motor)
                );
                if (!exists) missing.push(motor ? `${saat} ${motor}` : saat);
            });
        });
        return missing;
    }

    async function runVardiyaClosePrecheck(vardiya) {
        const trDate = normalizeDateText(vardiya.tarih || tarihInput.value);
        const selectedShift = vardiya.vardiya || vardiyaSelect.value;
        const [saatlik, motor, enerji, bildirim] = await Promise.all([
            fetchControlJson(VARDIYA_CONTROL_URLS.saatlik, { action: 'getLastRecords', count: '48' }),
            fetchControlJson(VARDIYA_CONTROL_URLS.motor, { action: 'getLastRecords', count: '120' }),
            fetchControlJson(VARDIYA_CONTROL_URLS.enerji, { action: 'getLastRecords', count: '120' }),
            fetchControlJson(VARDIYA_CONTROL_URLS.bildirim, { action: 'getAnnouncements', active: 'true' })
        ]);

        const warnings = [];
        if (saatlik.success) {
            const missing = buildMissingForShift(saatlik.data || [], trDate, selectedShift, 'saatlik');
            if (missing.length) warnings.push(`Saatlik eksik: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '...' : ''}`);
        }
        if (motor.success) {
            const missing = buildMissingForShift(motor.data || [], trDate, selectedShift, 'motor');
            if (missing.length) warnings.push(`Kojen motor eksik: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '...' : ''}`);
        }
        if (enerji.success) {
            const missing = buildMissingForShift(enerji.data || [], trDate, selectedShift, 'enerji');
            if (missing.length) warnings.push(`Kojen enerji eksik: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '...' : ''}`);
        }
        if (bildirim.success) {
            const critical = (bildirim.data || []).filter(item => item.priority === 'high' && !item.completed);
            if (critical.length) warnings.push(`Tamamlanmamis kritik duyuru: ${critical.map(item => item.title || item.message).join(', ')}`);
        }
        return warnings;
    }

    // Vardiya seçicisine otomatik değeri ata (saate göre)
    function setVardiyaByHour() {
        const now = new Date();
        const currentHour = now.getHours();
        
        console.log('Şu anki saat:', currentHour);
        console.log('Vardiya select elementi:', vardiyaSelect);
        
        // 08:00 - 16:00 arası: 08-16 vardiyası
        // 16:00 - 24:00 arası: 16-24 vardiyası  
        // 00:00 - 08:00 arası: 24-08 vardiyası
        if (currentHour >= 8 && currentHour < 16) {
            vardiyaSelect.value = '08-16';
            console.log('Gündüz vardiyası seçildi: 08-16');
        } else if (currentHour >= 16 && currentHour < 24) {
            vardiyaSelect.value = '16-24';
            console.log('Akşam vardiyası seçildi: 16-24');
        } else {
            vardiyaSelect.value = '24-08';
            console.log('Gece vardiyası seçildi: 24-08');
        }
        
        console.log('Vardiya değeri:', vardiyaSelect.value);
        
        // Vardiya değiştiğinde yardımcı operatör bölümünü kontrol et
        yardimciOperatorKontrolu();
    }
    setVardiyaByHour(); // Fonksiyonu sayfa yüklendikten sonra çağır

    // Vardiya başlat - Google Sheets
    kaydetBtn.addEventListener('click', async function() {
        const selectedPersonelId = personelSelect.value;
        const selectedVardiya = vardiyaSelect.value;
        const selectedTarih = tarihInput.value;
        
        if (!selectedPersonelId || !selectedVardiya || !selectedTarih) {
            alert('Lütfen tüm alanları doldurun!');
            return;
        }

        if (!operatorYetkisiKontrolu()) {
            alert('Seçilen personelin operatör yetkisi yok!');
            return;
        }

        const selectedPersonel = personelListesi.find(p => p.id == selectedPersonelId);
        const vardiyaAdi = vardiyaSelect.options[vardiyaSelect.selectedIndex].text;

        // Yardımcı operatör bilgisi
        let yardimciOperatorBilgisi = '';
        const yardimciOperatorId = yardimciOperator.value;
        const yardimciOperatorVarMi = yardimciOperatorVar.checked;

        if (yardimciOperatorId && yardimciOperatorVarMi) {
            const yardimciPersonel = personelListesi.find(p => p.id == yardimciOperatorId);
            yardimciOperatorBilgisi = yardimciPersonel.adSoyad;
        }

        // Buton loading durumu
        kaydetBtn.textContent = 'KAYDEDİLİYOR...';
        kaydetBtn.disabled = true;

        try {
            // Tarih formatını GG.AA.YYYY'den YYYY-AA-GG'ye çevir
            const formattedTarih = toIsoDateParam(selectedTarih);

            {
                const fastUrl = new URL(VARDIYA_APPS_SCRIPT_URL);
                fastUrl.searchParams.append('action', 'addRecord');
                fastUrl.searchParams.append('tarih', formattedTarih);
                fastUrl.searchParams.append('vardiya', selectedVardiya);
                fastUrl.searchParams.append('personel', selectedPersonel.adSoyad);
                fastUrl.searchParams.append('operator', selectedPersonel.adSoyad);
                fastUrl.searchParams.append('yardimciOperator', yardimciOperatorBilgisi);

                const fastStartedAt = performance.now();
                let fastResponse = await fetch(fastUrl);
                let fastResult = await fastResponse.json();

                if (!fastResult.success && fastResult.duplicateActive) {
                    if (!confirm('Bu tarih ve vardiya icin aktif kayit var. Eski aktif kayit kapatilip yeni vardiya baslatilsin mi?')) {
                        return;
                    }

                    fastUrl.searchParams.set('closeExisting', '1');
                    fastResponse = await fetch(fastUrl);
                    fastResult = await fastResponse.json();
                }

                logVardiyaTiming('Vardiya baslatma suresi:', fastStartedAt, fastResult);

                if (fastResult.success) {
                    const vardiyaBilgisi = {
                        id: fastResult.data.id,
                        vardiya: selectedVardiya,
                        vardiyaAdi: vardiyaAdi,
                        tarih: selectedTarih,
                        personelId: selectedPersonelId,
                        personelAdSoyad: selectedPersonel.adSoyad,
                        pozisyon: selectedPersonel.pozisyon,
                        baslangicZamani: new Date().toLocaleString('tr-TR'),
                        yardimciOperator: yardimciOperatorId && yardimciOperatorVarMi ? {
                            id: yardimciOperatorId,
                            adSoyad: yardimciOperatorBilgisi,
                            pozisyon: personelListesi.find(p => p.id == yardimciOperatorId).pozisyon
                        } : null,
                        islemler: []
                    };

                    localStorage.setItem('mevcutVardiya', JSON.stringify(vardiyaBilgisi));
                    window.SystemAuditLog?.write?.('Vardiya baslatildi', `${selectedVardiya} - ${selectedPersonel.adSoyad}`, 'ok');
                    mevcutVardiyaBilgisi();
                    alert('Vardiya basariyla baslatildi! (ID: ' + fastResult.data.id + ')');
                    refreshWeeklyRecordsSoon();
                } else {
                    alert('Hata: ' + (fastResult.error || 'Islem basarisiz!'));
                }
                return;
            }

            // Mevcut kayıt var mı kontrol et
            const checkUrl = new URL(VARDIYA_APPS_SCRIPT_URL);
            checkUrl.searchParams.append('action', 'getRecordByDateVardiya');
            checkUrl.searchParams.append('tarih', formattedTarih);
            checkUrl.searchParams.append('vardiya', selectedVardiya);

            const checkResponse = await fetch(checkUrl);
            const checkResult = await checkResponse.json();

            if (checkResult.found && checkResult.data && checkResult.data.durum === 'Aktif') {
                if (confirm('Bu tarih ve vardiya için aktif kayıt var. Devam edilsin mi?')) {
                    // Mevcut kaydı bitir
                    const endUrl = new URL(VARDIYA_APPS_SCRIPT_URL);
                    endUrl.searchParams.append('action', 'endVardiya');
                    endUrl.searchParams.append('id', checkResult.data.id || '');
                    endUrl.searchParams.append('tarih', formattedTarih);
                    endUrl.searchParams.append('vardiya', selectedVardiya);
                    
                    await fetch(endUrl);
                } else {
                    kaydetBtn.textContent = 'VARDİYA BAŞLAT';
                    kaydetBtn.disabled = false;
                    return;
                }
            }

            // Yeni kayıt ekle
            const url = new URL(VARDIYA_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'addRecord');
            url.searchParams.append('tarih', formattedTarih);
            url.searchParams.append('vardiya', selectedVardiya);
            url.searchParams.append('personel', selectedPersonel.adSoyad);
            url.searchParams.append('operator', selectedPersonel.adSoyad);
            url.searchParams.append('yardimciOperator', yardimciOperatorBilgisi);

            const response = await fetch(url);
            const result = await response.json();

            if (result.success) {
                const vardiyaBilgisi = {
                    id: result.data.id,
                    vardiya: selectedVardiya,
                    vardiyaAdi: vardiyaAdi,
                    tarih: selectedTarih,
                    personelId: selectedPersonelId,
                    personelAdSoyad: selectedPersonel.adSoyad,
                    pozisyon: selectedPersonel.pozisyon,
                    baslangicZamani: new Date().toLocaleString('tr-TR'),
                    yardimciOperator: yardimciOperatorId && yardimciOperatorVarMi ? {
                        id: yardimciOperatorId,
                        adSoyad: yardimciOperatorBilgisi,
                        pozisyon: personelListesi.find(p => p.id == yardimciOperatorId).pozisyon
                    } : null,
                    islemler: []
                };

                localStorage.setItem('mevcutVardiya', JSON.stringify(vardiyaBilgisi));
                window.SystemAuditLog?.write?.('Vardiya başlatıldı', `${selectedVardiya} - ${selectedPersonel.adSoyad}`, 'ok');
                mevcutVardiyaBilgisi();
                alert('Vardiya başarıyla başlatıldı! (ID: ' + result.data.id + ')');
                refreshWeeklyRecordsSoon();
            } else {
                alert('Hata: ' + (result.error || 'İşlem başarısız!'));
            }
        } catch (error) {
            console.error('Vardiya kayıt hatası:', error);
            alert('Bağlantı hatası!');
        } finally {
            kaydetBtn.textContent = 'VARDİYA BAŞLAT';
            kaydetBtn.disabled = false;
        }
    });

    // Vardiya bitir - Google Sheets
    vardiyaBitirBtn.addEventListener('click', async function() {
        if (confirm('Vardiya bitirilsin mi?')) {
            const mevcutVardiya = localStorage.getItem('mevcutVardiya');
            if (mevcutVardiya) {
                const vardiya = JSON.parse(mevcutVardiya);
                const pendingAciklamaInput = document.getElementById('islemAciklama');
                const pendingAciklama = pendingAciklamaInput?.value.trim() || '';
                const cleaningChecked = hasCheckedCleaningTask();
                const hasSavedOperation = Array.isArray(vardiya.islemler) && vardiya.islemler.length > 0;

                if (!pendingAciklama && !hasSavedOperation && !cleaningChecked) {
                    alert('Vardiya bitirilemez. Lütfen işlem açıklaması girin veya temizlik yapıldı tiklerinden en az birini işaretleyin!');
                    return;
                }

                // Buton loading durumu
                vardiyaBitirBtn.textContent = 'BİTİRİLİYOR...';
                vardiyaBitirBtn.disabled = true;
                const closeFlowStartedAt = performance.now();
                const closeSideTaskFactories = [];
                
                try {
                    if (pendingAciklama) {
                        const islemUrl = new URL(VARDIYA_APPS_SCRIPT_URL);
                        islemUrl.searchParams.append('action', 'addIslem');
                        islemUrl.searchParams.append('vardiyaId', vardiya.id);
                        islemUrl.searchParams.append('islem', pendingAciklama);
                        islemUrl.searchParams.append('zaman', new Date().toLocaleString('tr-TR'));
                        islemUrl.searchParams.append('kaydeden', vardiya.personelAdSoyad || 'Operator');

                        closeSideTaskFactories.push(function() {
                            const islemStartedAt = performance.now();
                            return makeVardiyaCloseTask(
                                fetch(islemUrl)
                                    .then(response => response.json())
                                    .then(islemResult => {
                                        console.log('Vardiya kapatma islem kaydi suresi:', Math.round(performance.now() - islemStartedAt), 'ms', islemResult);
                                        if (!islemResult.success) throw new Error(islemResult.error || 'Islem aciklamasi kaydedilemedi');
                                        return islemResult;
                                    })
                            );
                        });
                    }

                    if (cleaningChecked) {
                        closeSideTaskFactories.push(function() {
                            const cleaningStartedAt = performance.now();
                            return makeVardiyaCloseTask(
                                Promise.resolve(saveCleaningChecklist(vardiya)).then(result => {
                                    console.log('Vardiya kapatma temizlik kaydi suresi:', Math.round(performance.now() - cleaningStartedAt), 'ms');
                                    return result;
                                })
                            );
                        });
                    }

                    if (VARDIYA_CLOSE_PRECHECK_ENABLED) {
                        const warnings = await runVardiyaClosePrecheck(vardiya);
                        if (warnings.length) {
                            const devam = confirm('Vardiya kapatma on kontrolunde uyarilar var:\n\n' + warnings.join('\n') + '\n\nYine de vardiya bitirilsin mi?');
                            if (!devam) {
                                window.SystemAuditLog?.write?.('Vardiya kapatma durduruldu', warnings.join(' | '), 'warn');
                                return;
                            }
                        }
                    }

                    // Tarih formatını çevir
                    const formattedTarih = toIsoDateParam(vardiya.tarih);
                    
                    // Vardiya bitir API çağrısı
                    const url = new URL(VARDIYA_APPS_SCRIPT_URL);
                    url.searchParams.append('action', 'endVardiya');
                    url.searchParams.append('id', vardiya.id || '');
                    url.searchParams.append('tarih', formattedTarih);
                    url.searchParams.append('vardiya', vardiya.vardiya || vardiyaSelect.value);
                    url.searchParams.append('devredenIsler', devredenIslerInput?.value.trim() || '');
                    
                    const bitirStartedAt = performance.now();
                    const endVardiyaPromise = fetch(url)
                        .then(response => response.json())
                        .then(result => {
                            logVardiyaTiming('Vardiya bitirme suresi:', bitirStartedAt, result);
                            if (!result.success) throw result;
                            return result;
                        });

                    clearMevcutVardiyaDisplay();
                    if (temizlikChecklist) temizlikChecklist.style.display = 'none';
                    personelSelect.value = '';
                    if (devredenIslerInput) devredenIslerInput.value = '';
                    if (pendingAciklamaInput) pendingAciklamaInput.value = '';
                    operatorStatus.textContent = 'Personel seçiniz.';
                    operatorStatus.style.color = '#e74c3c';
                    resetVardiyaBitirButton();
                    showVardiyaStatusMessage('Vardiya bitirme isteği gönderildi.', 'success');

                    endVardiyaPromise
                        .then(result => {
                            window.SystemAuditLog?.write?.('Vardiya bitirildi', `${vardiya.vardiya || vardiyaSelect.value} - ${vardiya.personelAdSoyad || ''}`, 'ok');
                            console.log('Vardiya bitirme onaylandi:', result);
                            runVardiyaCloseSideTasks(closeSideTaskFactories);
                            refreshWeeklyRecordsSoon(500);
                        })
                        .catch(error => {
                            const errorText = error?.error || error?.message || String(error || '');
                            console.error('Vardiya bitirme arka plan hatasi:', error);

                            if (String(errorText).includes('Aktif vardiya')) {
                                clearMevcutVardiyaDisplay();
                                showVardiyaStatusMessage('Eski yerel vardiya kaydı temizlendi.', 'warning');
                                refreshWeeklyRecordsSoon();
                                return;
                            }

                            localStorage.setItem('mevcutVardiya', JSON.stringify(vardiya));
                            if (pendingAciklamaInput && pendingAciklama && !pendingAciklamaInput.value) {
                                pendingAciklamaInput.value = pendingAciklama;
                            }
                            mevcutVardiyaBilgisi();
                            showVardiyaStatusMessage('Vardiya bitirme doğrulanamadı: ' + errorText, 'error');
                        });

                    return;
                } catch (error) {
                    console.error('Vardiya bitirme hatası:', error);
                    resetVardiyaBitirButton();
                    alert('Bağlantı hatası!');
                } finally {
                    console.log('Vardiya kapatma toplam UI suresi:', Math.round(performance.now() - closeFlowStartedAt), 'ms');
                    resetVardiyaBitirButton();
                }
            }
        }
    });

    // Personel listesi (gerçek kullanıcı verileri)
    const personelListesi = [
        { id: 1771831539045, adSoyad: 'İBRAHİM OGÜN ŞAHİN', pozisyon: 'Operatör', operator: true },
        { id: 1771831665826, adSoyad: 'OGUZHAN YAYLALI', pozisyon: 'Operatör', operator: true },
        { id: 1771831695619, adSoyad: 'ALTAN HUNOĞLU', pozisyon: 'Operatör', operator: true },
        { id: 1771831749332, adSoyad: 'MURAT COŞKUN', pozisyon: 'Admin', operator: true },
        { id: 1773382635961, adSoyad: 'KADİR KORKMAZ', pozisyon: 'Admin', operator: true },
        { id: 1774245338572, adSoyad: 'ADMİN', pozisyon: 'Admin', operator: true },
        { id: 9999999999, adSoyad: 'YAKUP CAN CİN', pozisyon: 'Operatör', operator: true }
    ];

    // Personel listesini doldur (sadece operatör rolündeki kullanıcılar)
    function personelListesiniDoldur() {
        personelSelect.innerHTML = '<option value="">Personel seçin...</option>';
        const operatorler = personelListesi.filter(p => p.pozisyon === 'Operatör');
        operatorler.forEach(personel => {
            const option = document.createElement('option');
            option.value = personel.id;
            option.textContent = personel.adSoyad;
            personelSelect.appendChild(option);
        });
    }
    personelListesiniDoldur();

    // Yardımcı operatör listesini doldur (mevcut operatörler, ana operatör hariç)
    function yardimciOperatorListesiniDoldur() {
        yardimciOperator.innerHTML = '<option value="">Yardımcı operatör seçin...</option>';
        const anaOperatorId = personelSelect.value;
        
        // Mevcut operatörler (seçili olan hariç)
        const yardimciOperatorler = personelListesi.filter(p => 
            p.operator === true && p.id != anaOperatorId && p.pozisyon === 'Operatör'
        );
        
        if (yardimciOperatorler.length === 0) {
            // Yardımcı operatör yok
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "Diğer operatörler mevcut değil";
            option.disabled = true;
            yardimciOperator.appendChild(option);
        } else {
            yardimciOperatorler.forEach(personel => {
                const option = document.createElement('option');
                option.value = personel.id;
                option.textContent = `${personel.adSoyad} - ${personel.pozisyon}`;
                yardimciOperator.appendChild(option);
            });
        }
    }
    yardimciOperatorListesiniDoldur();

    // Yardımcı operatör kontrolü (sadece gündüz vardiyasında göster)
    function yardimciOperatorKontrolu() {
        const selectedVardiya = vardiyaSelect.value;
        
        if (selectedVardiya === '08-16') {
            yardimciOperatorSection.style.display = 'block';
        } else {
            yardimciOperatorSection.style.display = 'none';
            yardimciOperatorVar.checked = false;
            yardimciOperatorListesi.style.display = 'none';
        }
    }

    // Vardiya değiştiğinde yardımcı operatör kontrolü
    vardiyaSelect.addEventListener('change', yardimciOperatorKontrolu);

    // Yardımcı operatör checkbox'ı değiştiğinde
    yardimciOperatorVar.addEventListener('change', function() {
        if (this.checked) {
            yardimciOperatorListesi.style.display = 'block';
        } else {
            yardimciOperatorListesi.style.display = 'none';
            yardimciOperator.value = '';
        }
    });

    // Personel listesi tablosunu doldur (sadece operatör rolündeki kullanıcılar)
    function personelTablosunuDoldur() {
        const tbody = document.getElementById('personelTableBody');
        tbody.innerHTML = '';
        
        const operatorler = personelListesi.filter(p => p.pozisyon === 'Operatör');
        operatorler.forEach(personel => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${personel.adSoyad}</td>
                <td>${personel.pozisyon}</td>
                <td>${personel.operator ? '✅ Evet' : '❌ Hayır'}</td>
                <td><span class="status-badge ${personel.operator ? 'operator' : 'non-operator'}">${personel.operator ? 'Operatör' : 'Operatör Değil'}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
    personelTablosunuDoldur();

    // Operatör yetkisi kontrolü
    function operatorYetkisiKontrolu() {
        const selectedPersonelId = personelSelect.value;
        if (!selectedPersonelId) {
            operatorStatus.textContent = 'Personel seçiniz.';
            operatorStatus.style.color = '#e74c3c';
            return false;
        }

        const selectedPersonel = personelListesi.find(p => p.id == selectedPersonelId);
        if (selectedPersonel && selectedPersonel.operator) {
            operatorStatus.textContent = '✅ Operatör yetkisi var';
            operatorStatus.style.color = '#28a745';
            return true;
        } else {
            operatorStatus.textContent = '❌ Operatör yetkisi yok';
            operatorStatus.style.color = '#dc3545';
            return false;
        }
    }

    // Personel seçimi değiştiğinde yardımcı operatör listesini güncelle
    personelSelect.addEventListener('change', function() {
        operatorYetkisiKontrolu();
        yardimciOperatorListesiniDoldur();
    });

    // Vardiya seçimi değiştiğinde mevcut vardiya formunu güncelle
    vardiyaSelect.addEventListener('change', function() {
        yardimciOperatorKontrolu();
    });

    // Başlangıçta yetki kontrolü yap
    operatorYetkisiKontrolu();

    // Mevcut vardiya bilgisi (Google Sheets ile dogrula)
    mevcutVardiyaBilgisiDogrula();

    // Haftalık vardiya kayıtlarını göster
    haftalikVardiyaKayitlariniGoster();

    // Tarih filtrele butonu
    tarihFiltreBtn.addEventListener('click', function() {
        haftalikVardiyaKayitlariniGoster();
    });

    // Tarih sıfırla butonu
    tarihSifirlaBtn.addEventListener('click', function() {
        // Tarih alanlarını temizle
        setDefaultDateRange();
        
        haftalikVardiyaKayitlariniGoster();
    });

    // İşlem detaylarını göster
    if (temizlikAyYukleBtn) {
        temizlikAyYukleBtn.addEventListener('click', loadMonthlyCleaningList);
    }

    async function islemDetaylariniGoster() {
        // Modal oluştur (loading ile)
        const modal = document.createElement('div');
        modal.className = 'islem-detaylari-modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>İşlem Detayları</h2>
                    <button class="modal-close">✕</button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; padding: 20px; color: #6c757d;">
                        İşlemler yükleniyor...
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Modal kapatma butonuna event listener ekle
        const modalCloseBtn = modal.querySelector('.modal-close');
        const modalOverlay = modal.querySelector('.modal-overlay');
        
        modalCloseBtn.addEventListener('click', function() {
            modal.remove();
        });
        
        modalOverlay.addEventListener('click', function() {
            modal.remove();
        });
        
        try {
            console.log('Vardiya kayıtları ve işlemler tek seferde çekiliyor...');
            // Google Sheets'ten vardiya kayıtlarını ve işlemleri tek seferde çek
            const url = new URL(VARDIYA_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getLastRecordsWithIslemler');
            url.searchParams.append('count', VARDIYA_RECORD_FETCH_COUNT);
            
            const response = await fetch(url);
            const result = await response.json();
            
            console.log('Sonuç:', result);
            
            if (!result.success) {
                throw new Error(result.error || 'İşlemler yüklenemedi');
            }
            
            const tumVardiyaKayitlari = result.data || [];
            const mevcutVardiya = localStorage.getItem('mevcutVardiya');
            
            console.log('Toplam vardiya sayısı:', tumVardiyaKayitlari.length);
            
            // İşlemler her vardiya kaydının içinde (islemler) olarak geliyor
            // Map oluşturmaya gerek yok, direkt kullanabiliriz
            const vardiyaIslemleriMap = new Map();
            tumVardiyaKayitlari.forEach(vardiya => {
                if (vardiya.id) {
                    vardiyaIslemleriMap.set(vardiya.id, vardiya.islemler || []);
                }
            });
            
            console.log('İşlemler yüklendi');
            
            // Modal içeriğini güncelle
            const modalBody = modal.querySelector('.modal-body');
            modalBody.innerHTML = islemDetaylariHTML(tumVardiyaKayitlari, mevcutVardiya, vardiyaIslemleriMap);
            
        } catch (error) {
            console.error('❌ İşlem detayları yükleme hatası:', error);
            const modalBody = modal.querySelector('.modal-body');
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #e74c3c;">
                    İşlemler yüklenemedi: ${error.message}
                </div>
            `;
        }
    }

    // İşlem detayları HTML'i oluştur
    function islemDetaylariHTML(tumVardiyaKayitlari, mevcutVardiya, vardiyaIslemleriMap) {
        let html = '';
        
        // Mevcut vardiya işlemleri (localStorage'dan)
        if (mevcutVardiya) {
            const vardiya = JSON.parse(mevcutVardiya);
            html += `
                <div class="islem-grubu">
                    <h3>Mevcut Vardiya İşlemleri</h3>
                    <div class="islem-listesi">
                        ${vardiya.islemler && vardiya.islemler.length > 0 ? 
                            vardiya.islemler.map(islem => `
                                <div class="islem-item">
                                    <div class="islem-baslik">${islem.islem}</div>
                                    <div class="islem-zaman">${islem.zaman}</div>
                                    <div class="islem-kaydeden">Kaydeden: ${islem.kaydeden}</div>
                                </div>
                            `).join('') : 
                            '<div class="bos-mesaj">Henüz işlem kaydedilmemiş.</div>'
                        }
                    </div>
                </div>
            `;
        }
        
        // Arşivlenmiş vardiya işlemleri (Google Sheets'ten)
        if (tumVardiyaKayitlari.length > 0) {
            // İşlemi olan vardiyaları filtrele
            const islemliVardiyalar = tumVardiyaKayitlari.filter(vardiya => {
                const islemler = vardiyaIslemleriMap.get(vardiya.id);
                return (islemler && islemler.length > 0) || !!vardiya.devredenIsler;
            });
            
            if (islemliVardiyalar.length > 0) {
                html += `
                    <div class="islem-grubu">
                        <h3>Arşivlenmiş Vardiya İşlemleri</h3>
                        <div class="islem-listesi">
                            ${islemliVardiyalar.map(vardiya => {
                                const islemler = vardiyaIslemleriMap.get(vardiya.id) || [];
                                const vardiyaAdiMap = {
                                    '08-16': '08:00 - 16:00',
                                    '16-24': '16:00 - 24:00',
                                    '24-08': '24:00 - 08:00'
                                };
                                
                                return `
                                    <div class="vardiya-grubu">
                                        <div class="vardiya-baslik">
                                            ${vardiya.tarih} - ${vardiyaAdiMap[vardiya.vardiya] || vardiya.vardiya}
                                            <span class="personel-info">${vardiya.personel || '-'}</span>
                                        </div>
                                        <div class="vardiya-islemleri">
                                            ${islemler.length > 0 ? 
                                                islemler.map(islem => `
                                                    <div class="islem-item">
                                                        <div class="islem-baslik">${islem.islem}</div>
                                                        <div class="islem-zaman">${islem.zaman}</div>
                                                        <div class="islem-kaydeden">Kaydeden: ${islem.kaydeden}</div>
                                                    </div>
                                                `).join('') : 
                                                '<div class="bos-mesaj">Bu vardiya için işlem kaydedilmemiş.</div>'
                                            }
                                            ${vardiya.devredenIsler ? `
                                                <div class="islem-item">
                                                    <div class="islem-baslik">Devreden İşler</div>
                                                    <div class="islem-zaman">${vardiya.devredenIsler}</div>
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="islem-grubu">
                        <h3>Arşivlenmiş Vardiya İşlemleri</h3>
                        <div class="islem-listesi">
                            <div class="bos-mesaj">Arşivde işlem kaydı bulunamadı.</div>
                        </div>
                    </div>
                `;
            }
        }
        
        if (!mevcutVardiya && tumVardiyaKayitlari.length === 0) {
            html = '<div class="bos-mesaj">Henüz hiç vardiya kaydı bulunamadı.</div>';
        }
        
        return html;
    }

    // İşlem detayları linkine event listener ekle
    const islemDetayLink = document.getElementById('islemDetayLink');
    if (islemDetayLink) {
        islemDetayLink.addEventListener('click', function(e) {
            e.preventDefault();
            islemDetaylariniGoster();
        });
    }

    // Mevcut vardiya bilgisi (localStorage'dan)
    function mevcutVardiyaBilgisi() {
        const mevcutVardiya = localStorage.getItem('mevcutVardiya');
        if (mevcutVardiya) {
            const vardiya = JSON.parse(mevcutVardiya);
            const mevcutVardiyaDiv = document.getElementById('mevcutVardiya');
            
            document.getElementById('mevcutVardiyaAdi').textContent = vardiya.vardiyaAdi;
            document.getElementById('mevcutTarih').textContent = vardiya.tarih;
            document.getElementById('mevcutPersonel').textContent = vardiya.personelAdSoyad;
            document.getElementById('mevcutBaslangic').textContent = vardiya.baslangicZamani;
            
            // Yardımcı operatör bilgisini göster
            const yardimciOperatorInfo = document.getElementById('mevcutYardimciOperator');
            if (yardimciOperatorInfo) {
                if (vardiya.yardimciOperator) {
                    yardimciOperatorInfo.textContent = `${vardiya.yardimciOperator.adSoyad} - ${vardiya.yardimciOperator.pozisyon}`;
                } else {
                    yardimciOperatorInfo.textContent = 'Yok';
                }
            }
            
            mevcutVardiyaDiv.style.display = 'block';
            renderCleaningChecklist(vardiya);
            
            // Formu doldur
            tarihInput.value = vardiya.tarih;
            vardiyaSelect.value = vardiya.vardiya;
            personelSelect.value = vardiya.personelId;
            
            // Yardımcı operatör bilgisi
            if (vardiya.yardimciOperator) {
                yardimciOperatorVar.checked = true;
                yardimciOperatorListesi.style.display = 'block';
                yardimciOperator.value = vardiya.yardimciOperator.id;
            }
            
            operatorYetkisiKontrolu();
            
            return true;
        }
        return false;
    }

    // İşlem kaydetme - Google Sheets
    async function mevcutVardiyaBilgisiDogrula() {
        const mevcutVardiya = localStorage.getItem('mevcutVardiya');
        if (!mevcutVardiya) return false;

        try {
            const vardiya = JSON.parse(mevcutVardiya);
            const url = new URL(VARDIYA_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getRecordByDateVardiya');
            url.searchParams.append('tarih', toIsoDateParam(vardiya.tarih));
            url.searchParams.append('vardiya', vardiya.vardiya);

            const response = await fetch(url);
            const result = await response.json();
            const sheetRecord = result && result.success && result.found ? result.data : null;
            const sameRecord = sheetRecord && (!vardiya.id || !sheetRecord.id || String(sheetRecord.id) === String(vardiya.id));

            if (sameRecord && isActiveStatus(sheetRecord.durum)) {
                return mevcutVardiyaBilgisi();
            }

            clearMevcutVardiyaDisplay();
            console.warn('Yerel aktif vardiya kaydi Google Sheets ile eslesmedi, temizlendi.', vardiya, sheetRecord);
            return false;
        } catch (error) {
            console.error('Mevcut vardiya doğrulama hatası:', error);
            return mevcutVardiyaBilgisi();
        }
    }

    const islemKaydetmeBtn = document.getElementById('islemKaydetBtn');
    const islemAciklama = document.getElementById('islemAciklama');

    islemKaydetmeBtn.addEventListener('click', async function() {
        const aciklama = islemAciklama.value.trim();
        const devredenIsler = devredenIslerInput?.value.trim() || '';
        
        // Mevcut vardiya varsa işlemi kaydet
        const mevcutVardiya = localStorage.getItem('mevcutVardiya');
        if (!mevcutVardiya) {
            alert('Aktif vardiya bulunamadı!');
            return;
        }

        const vardiya = JSON.parse(mevcutVardiya);
        const cleaningChecked = hasCheckedCleaningTask();

        if (!aciklama && !cleaningChecked) {
            alert('Lütfen işlem açıklaması girin veya temizlik yapıldı tiklerinden en az birini işaretleyin!');
            return;
        }
        
        // Buton loading durumu
        islemKaydetmeBtn.textContent = 'KAYDEDİLİYOR...';
        islemKaydetmeBtn.disabled = true;
        
        try {
            if (!aciklama && cleaningChecked) {
                await saveCleaningChecklist(vardiya);

                if (devredenIsler) {
                    const devredenUrl = new URL(VARDIYA_APPS_SCRIPT_URL);
                    devredenUrl.searchParams.append('action', 'updateDevredenIsler');
                    devredenUrl.searchParams.append('vardiyaId', vardiya.id);
                    devredenUrl.searchParams.append('tarih', toIsoDateParam(vardiya.tarih));
                    devredenUrl.searchParams.append('vardiya', vardiya.vardiya || vardiyaSelect.value);
                    devredenUrl.searchParams.append('devredenIsler', devredenIsler);

                    const devredenResponse = await fetch(devredenUrl);
                    const devredenResult = await devredenResponse.json();

                    if (!devredenResult.success) {
                        alert('Hata: ' + (devredenResult.error || 'Devreden isler kaydedilemedi!'));
                        return;
                    }

                    vardiya.devredenIsler = devredenIsler;
                    localStorage.setItem('mevcutVardiya', JSON.stringify(vardiya));
                }

                window.SystemAuditLog?.write?.('Vardiya temizlik kontrolu kaydedildi', vardiya.vardiya || '', 'ok');
                alert('Temizlik kontrolu kaydedildi!');
                refreshWeeklyRecordsSoon();
                return;
            }

            // Google Sheets'e işlem kaydet
            const url = new URL(VARDIYA_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'addIslem');
            url.searchParams.append('vardiyaId', vardiya.id);
            url.searchParams.append('islem', aciklama);
            url.searchParams.append('zaman', new Date().toLocaleString('tr-TR'));
            url.searchParams.append('kaydeden', vardiya.personelAdSoyad || 'Operatör');
            
            const response = await fetch(url);
            const result = await response.json();

            let devredenResult = { success: true };
            if (devredenIsler) {
                const devredenUrl = new URL(VARDIYA_APPS_SCRIPT_URL);
                devredenUrl.searchParams.append('action', 'updateDevredenIsler');
                devredenUrl.searchParams.append('vardiyaId', vardiya.id);
                devredenUrl.searchParams.append('tarih', toIsoDateParam(vardiya.tarih));
                devredenUrl.searchParams.append('vardiya', vardiya.vardiya || vardiyaSelect.value);
                devredenUrl.searchParams.append('devredenIsler', devredenIsler);

                const devredenResponse = await fetch(devredenUrl);
                devredenResult = await devredenResponse.json();
            }
            
            if (result.success && devredenResult.success) {
                const yeniIslem = {
                    islem: aciklama,
                    zaman: new Date().toLocaleString('tr-TR'),
                    kaydeden: vardiya.personelAdSoyad || 'Operatör'
                };

                // Vardiya işlemlerini güncelle (localStorage)
                if (!vardiya.islemler) {
                    vardiya.islemler = [];
                }
                vardiya.islemler.push(yeniIslem);
                if (devredenIsler) {
                    vardiya.devredenIsler = devredenIsler;
                }
                localStorage.setItem('mevcutVardiya', JSON.stringify(vardiya));
                window.SystemAuditLog?.write?.('Vardiya işlemi/devreden işi kaydedildi', (aciklama || devredenIsler).slice(0, 80), 'ok');
                
                // Alanı temizle
                islemAciklama.value = '';
                refreshWeeklyRecordsSoon();
                
                alert('İşlem başarıyla kaydedildi! (ID: ' + result.data.id + ')');
            } else {
                alert('Hata: ' + (result.error || 'İşlem başarısız!'));
            }
        } catch (error) {
            console.error('İşlem kayıt hatası:', error);
            alert('Bağlantı hatası!');
        } finally {
            islemKaydetmeBtn.textContent = 'İŞLEMİ KAYDET';
            islemKaydetmeBtn.disabled = false;
        }
    });

    // Haftalık vardiya kayıtlarını göster - Google Sheets
    async function haftalikVardiyaKayitlariniGoster() {
        const haftalikVardiyaTableBody = document.getElementById('haftalikVardiyaTableBody');
        
        // Loading mesajı göster
        haftalikVardiyaTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: #6c757d; padding: 20px;">
                    Kayıtlar yükleniyor...
                </td>
            </tr>
        `;
        
        try {
            // Google Sheets'ten son kayıtları ve işlemleri tek seferde çek
            const url = new URL(VARDIYA_APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getLastRecordsWithIslemler');
            url.searchParams.append('count', VARDIYA_RECORD_FETCH_COUNT);
            
            const response = await fetch(url);
            const result = await response.json();
            
            if (!result.success) {
                haftalikVardiyaTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; color: #e74c3c; padding: 20px;">
                            Kayıtlar yüklenemedi: ${result.error || 'Bilinmeyen hata'}
                        </td>
                    </tr>
                `;
                return;
            }
            
            const tumIslemler = result.data || [];
            haftalikVardiyaTableBody.innerHTML = '';
            
            console.log('Google Sheets vardiya kayıtları:', tumIslemler);
            
            if (tumIslemler.length === 0) {
                haftalikVardiyaTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; color: #6c757d; padding: 20px;">
                            Vardiya kaydı bulunamadı.
                        </td>
                    </tr>
                `;
                return;
            }
            
            // İşlemler her vardiya kaydının içinde (islemler) olarak geliyor
            const vardiyaIslemleriMap = new Map();
            tumIslemler.forEach(vardiya => {
                if (vardiya.id) {
                    vardiyaIslemleriMap.set(vardiya.id, vardiya.islemler || []);
                }
            });
            
            // Tarih aralığına göre filtrele
            const baslangicTarihInput = document.getElementById('baslangicTarih').value;
            const bitisTarihInput = document.getElementById('bitisTarih').value;
            
            let filtrelenmisKayitlar = tumIslemler;
            
            if (baslangicTarihInput && bitisTarihInput) {
                // Kullanıcı tarih seçtiyse o aralıktaki kayıtları göster
                const baslangicDate = parseDateValue(baslangicTarihInput);
                const bitisDate = parseDateValue(bitisTarihInput);

                if (!baslangicDate || !bitisDate) {
                    haftalikVardiyaTableBody.innerHTML = `
                        <tr>
                            <td colspan="8" style="text-align: center; color: #e74c3c; padding: 20px;">
                                Tarih araligi gecersiz.
                            </td>
                        </tr>
                    `;
                    return;
                }
                    
                filtrelenmisKayitlar = tumIslemler.filter(vardiya => {
                    const vardiyaTarihi = parseDateValue(vardiya.tarih);
                    return vardiyaTarihi && vardiyaTarihi >= baslangicDate && vardiyaTarihi <= bitisDate;
                });
            } else {
                // Tarih girilmediyse kayıtları gösterme
                haftalikVardiyaTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; color: #6c757d; padding: 20px;">
                            Tarih aralığı seçin.
                        </td>
                    </tr>
                `;
                return;
            }
            
            if (filtrelenmisKayitlar.length === 0) {
                const mesaj = baslangicTarihInput && bitisTarihInput 
                    ? 'Seçilen tarih aralığında vardiya kaydı bulunamadı.' 
                    : 'Tarih aralığı seçin veya kayıt bulunamadı.';
                    
                haftalikVardiyaTableBody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; color: #6c757d; padding: 20px;">
                            ${mesaj}
                        </td>
                    </tr>
                `;
                return;
            }
            
            filtrelenmisKayitlar.forEach(vardiya => {
                const tr = document.createElement('tr');
                const vardiyaAdiMap = {
                    '08-16': '08:00 - 16:00',
                    '16-24': '16:00 - 24:00',
                    '24-08': '24:00 - 08:00'
                };
                
                // İşlem detaylarını formatla (VardiyaIslemleri sheet'inden)
                let islemDetaylariText = '-';
                const islemler = vardiyaIslemleriMap.get(vardiya.id) || [];
                const detaylar = [];
                const devredenIslerText = vardiya.devredenIsler || '-';
                
                if (islemler.length > 0) {
                    detaylar.push(...islemler.map(i => `${i.islem} (${i.zaman})`));
                }
                if (detaylar.length > 0) {
                    islemDetaylariText = detaylar.join(' | ');
                }
                
                tr.innerHTML = `
                    <td>${vardiya.tarih}</td>
                    <td>${vardiyaAdiMap[vardiya.vardiya] || vardiya.vardiya}</td>
                    <td>${vardiya.personel}</td>
                    <td>${vardiya.yardimciOperator || '-'}</td>
                    <td>${vardiya.baslangicSaati || '-'}</td>
                    <td>${vardiya.bitisSaati || '-'}</td>
                    <td>${islemDetaylariText}</td>
                    <td>${devredenIslerText}</td>
                `;
                
                haftalikVardiyaTableBody.appendChild(tr);
            });
        } catch (error) {
            console.error('Vardiya kayıtları yükleme hatası:', error);
            haftalikVardiyaTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: #e74c3c; padding: 20px;">
                        Bağlantı hatası! Kayıtlar yüklenemedi.
                    </td>
                </tr>
            `;
        }
    }

    // Çıkış yap butonları
    const sidebarLogout = document.getElementById('sidebarLogout');
    const headerLogout = document.getElementById('headerLogout');
    
    sidebarLogout.addEventListener('click', handleLogout);
    headerLogout.addEventListener('click', handleLogout);
    
    function handleLogout() {
        if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
            localStorage.removeItem('rememberedEmail');
            window.location.href = 'anasayfa.html';
        }
    }

    // Sayfa değiştiğinde vardiyanın otomatik bitirilmesini engelle
    window.addEventListener('beforeunload', function(e) {
        // Vardiya bitirme mesajını engelle
        return null;
    });

    // Sayfa kapatıldığında vardiyanın kalmasını sağla
    window.addEventListener('unload', function() {
        // Vardiya bilgilerini koru, bitirme işlemi yapma
        return;
    });
});
