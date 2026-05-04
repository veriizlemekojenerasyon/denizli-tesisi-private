// Kojen Enerji Veri JavaScript - Google Sheets Entegrasyonu

// ⏰ Otomatik yönlendirme kontrolü (15:59, 23:59, 07:59)
function checkAutoRedirect() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    
    // Yönlendirme saatleri: 15:59, 23:59, 07:59
    const redirectTimes = ['15:59', '23:59', '07:59'];
    
    if (redirectTimes.includes(currentTime)) {
        console.log(`⏰ Otomatik yönlendirme saati: ${currentTime}`);
        // Vardiya İşlem Kaydetme kontrolü için event gönder
        const event = new CustomEvent('beforeAutoRedirect', { 
            detail: { time: currentTime, shouldSave: true } 
        });
        document.dispatchEvent(event);
        
        // 2 saniye bekle ve yönlendir
        setTimeout(() => {
            localStorage.removeItem('loggedInUser');
            window.location.href = 'index.html';
        }, 2000);
        return true;
    }
    return false;
}

// 🔥 GLOBAL MESAJ GÖSTER FONKSİYONU
function showMessage(msg, type) {
    document.querySelectorAll('.message').forEach(m => m.remove());
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.textContent = msg;
    div.style.cssText = `position:fixed;top:20px;right:20px;padding:15px 20px;border-radius:8px;color:white;font-weight:500;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,0.2);background:${{success:'linear-gradient(135deg,#28a745,#20c997)',error:'linear-gradient(135deg,#dc3545,#c82333)',warning:'linear-gradient(135deg,#ff6b6b,#ee5a24)',info:'linear-gradient(135deg,#17a2b8,#138496)'}[type]};`;
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 3000);
}

// 🔥 GLOBAL DEĞİŞKENLER
let cachedRecords = [];
let recordMap = new Map();
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 dakika

// 👤 Giriş yapan kullanıcının adını al
function getCurrentUserName() {
    try {
        const loggedInUser = localStorage.getItem('loggedInUser');
        if (!loggedInUser) return 'Admin';
        const user = JSON.parse(loggedInUser);
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        return fullName || user.email || 'Admin';
    } catch (e) {
        console.error('Kullanıcı adı okunamadı:', e);
        return 'Admin';
    }
}

// 🔄 VARDİYA VERİLERİNİ YÜKLE (GLOBAL)
async function loadVardiyaData() {
    const vardiyaSecimi = document.getElementById('vardiyaSecimi');
    const tarihSecimi = document.getElementById('tarihSecimi');
    
    const vardiya = vardiyaSecimi?.value;
    const tarih = tarihSecimi?.value;
    const motor = window.selectedMotor || 'GM-1'; // Global selectedMotor kullan
    
    console.log('DEBUG loadVardiyaData:', { vardiya, tarih, motor });
    
    if (!vardiya || !tarih || !motor) { 
        console.log('DEBUG: Eksik parametre'); 
        return; 
    }
    
    const tableBody = document.getElementById('vardiyaTableBody');
    const noDataMessage = document.getElementById('noDataMessage');
    
    if (!tableBody) { 
        console.log('DEBUG: tableBody bulunamadı'); 
        return; 
    }
    
    tableBody.innerHTML = '';
    
    try {
        const result = await getAllEnerjiRecords();
        console.log('DEBUG getAllEnerjiRecords result:', result);
        
        if (!result.success || !result.data?.length) { 
            console.log('DEBUG: Veri yok veya başarısız'); 
            if (noDataMessage) noDataMessage.style.display = 'block'; 
            return; 
        }
        
        let searchTarih = tarih;
        if (searchTarih.includes('-')) { 
            const parts = searchTarih.split('-'); 
            searchTarih = `${parts[2]}.${parts[1]}.${parts[0]}`; 
        }
        
        console.log('DEBUG searchTarih:', searchTarih);
        
        const filtered = result.data.filter(r => {
            const matchTarih = (r.tarih || '') === searchTarih;
            const matchVardiya = kayitVardiyaAraligindaMi(r.saat || '', vardiya);
            const matchMotor = (r.motor || '') === motor;
            return matchTarih && matchVardiya && matchMotor;
        });
        
        console.log('DEBUG filtered:', filtered);
        
        filtered.sort((a, b) => (getSaatDegeri(a.saat) || 0) - (getSaatDegeri(b.saat) || 0));
        
        if (!filtered.length) { 
            if (noDataMessage) { 
                noDataMessage.textContent = `${motor} motoru için bu vardiya saat aralığında henüz kayıt bulunmamaktadır.`; 
                noDataMessage.style.display = 'block'; 
            } 
            return; 
        }
        
        if (noDataMessage) noDataMessage.style.display = 'none';
        
        // 🔍 MOTOR ÇALIŞMIYOR kayıtları için son normal kayıtları bul
        const sonNormalKayitlar = {};
        filtered.forEach(record => {
            if (record.durum !== 'MOTOR ÇALIŞMIYOR') {
                const motor = record.motor;
                const recDateTime = parseDateTime(record.tarih, record.saat);
                if (!sonNormalKayitlar[motor] || parseDateTime(sonNormalKayitlar[motor].tarih, sonNormalKayitlar[motor].saat) < recDateTime) {
                    sonNormalKayitlar[motor] = record;
                }
            }
        });
        
        filtered.forEach(record => {
            const row = document.createElement('tr');
            if (record.durum === 'MOTOR ÇALIŞMIYOR') row.classList.add('motor-calismiyor');
            
            // 🔍 MOTOR ÇALIŞMIYOR ise son değerleri kullan
            let toplamAktifEnerji = record.toplamAktifEnerji || '-';
            let calismaSaati = record.calismaSaati || '-';
            let kalkisSayisi = record.kalkisSayisi || '-';
            
            if (record.durum === 'MOTOR ÇALIŞMIYOR' && sonNormalKayitlar[record.motor]) {
                const sonKayit = sonNormalKayitlar[record.motor];
                toplamAktifEnerji = sonKayit.toplamAktifEnerji || '-';
                calismaSaati = sonKayit.calismaSaati || '-';
                kalkisSayisi = sonKayit.kalkisSayisi || '-';
            }
            
            row.innerHTML = `<td>${record.saat || '-'}</td><td>${record.motor || '-'}</td><td>${record.aydemVoltaji || '-'}</td><td>${record.aktifGuc || '-'}</td><td>${record.reaktifGuc || '-'}</td><td>${record.cosPhi || '-'}</td><td>${record.ortAkif || '-'}</td><td>${record.ortGerilim || '-'}</td><td>${record.notrAkim || '-'}</td><td>${record.tahrikGerilimi || '-'}</td><td>${toplamAktifEnerji}</td><td>${calismaSaati}</td><td>${kalkisSayisi}</td><td class="${record.durum === 'MOTOR ÇALIŞMIYOR' ? 'durum-calismiyor' : 'durum-normal'}">${record.durum === 'MOTOR ÇALIŞMIYOR' ? 'ÇALIŞMIYOR' : 'NORMAL'}</td>`;
            tableBody.appendChild(row);
        });
        
    } catch (error) { 
        console.error('Vardiya verileri yüklenirken hata:', error); 
    }
}

// 🔄 YARDIMCI FONKSİYONLAR (GLOBAL)
function kayitVardiyaAraligindaMi(saat, vardiya) {
    const aralik = {
        '08-16': { basla: '08:00', bit: '16:00' },
        '16-24': { basla: '16:00', bit: '24:00' },
        '24-08': { basla: '00:00', bit: '08:00' }
    };
    
    if (!aralik[vardiya]) return false;
    
    const saatDegeri = getSaatDegeri(saat);
    const baslaDegeri = getSaatDegeri(aralik[vardiya].basla);
    const bitDegeri = getSaatDegeri(aralik[vardiya].bit);
    
    if (vardiya === '24-08') {
        return saatDegeri >= baslaDegeri || saatDegeri < bitDegeri;
    } else {
        return saatDegeri >= baslaDegeri && saatDegeri < bitDegeri;
    }
}

function getSaatDegeri(saat) {
    if (!saat) return 0;
    const [saatStr, dakikaStr] = saat.split(':');
    return parseInt(saatStr || 0) * 60 + parseInt(dakikaStr || 0);
}

// � MOTORUN SON KAYDINI GETİR (Motor Çalışmıyor için)
async function getLastRecordForMotor(motor) {
    try {
        let motorRecords = [];
        
        // Önce cache'den dene
        if (cachedRecords.length > 0) {
            motorRecords = cachedRecords.filter(record => 
                record.motor === motor && 
                record.durum !== 'MOTOR ÇALIŞMIYOR' // Sadece normal kayıtları al
            );
        }
        
        // Cache'de yoksa API'den çek
        if (motorRecords.length === 0) {
            console.log(`⚡ Cache'de kayıt yok, API'den çekiliyor: ${motor}`);
            const result = await getEnerjiRecordsByMotorAndDate(motor, document.getElementById('tarihSecimi')?.value || '');
            if (result.success && result.data) {
                motorRecords = result.data.filter(record => 
                    record.durum !== 'MOTOR ÇALIŞMIYOR'
                );
            }
        }
        
        if (motorRecords.length === 0) {
            console.log(`⚠️ ${motor} için normal kayıt bulunamadı`);
            return null;
        }
        
        // Tarih ve saate göre sırala (en son kayıt)
        motorRecords.sort((a, b) => {
            const dateA = parseDateTime(a.tarih, a.saat);
            const dateB = parseDateTime(b.tarih, b.saat);
            return dateB - dateA; // En son kayıt önce
        });
        
        const lastRecord = motorRecords[0];
        console.log(`✅ ${motor} için son kayıt bulundu:`, lastRecord);
        return lastRecord;
        
    } catch (error) {
        console.error('Son kayıt getirme hatası:', error);
        return null;
    }
}

// 📅 Tarih ve saat string'ini Date objesine çevir
function parseDateTime(tarih, saat) {
    try {
        // Tarih formatı: DD.MM.YYYY
        const [day, month, year] = tarih.split('.');
        // Saat formatı: HH:00
        const [hour, minute] = saat.split(':');
        
        return new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute || 0)
        );
    } catch (error) {
        console.error('Tarih parse hatası:', error);
        return new Date();
    }
}

// Kimlik dogrulama kontrolü
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
            element.textContent = fullName || user.email || 'Kullanici';
        });
        
        console.log('Kojen Enerji Veri - Kullanici adi ayarlandi:', fullName || user.email || 'Kullanici');
    } catch (e) {
        console.error('Kojen Enerji Veri - Kullanici bilgileri okunamadi:', e);
        const allElements = document.querySelectorAll('[id="userNameDisplay"]');
        allElements.forEach(element => {
            element.textContent = 'Kullanici';
        });
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Önce kimlik dogrulama kontrolü
    checkAuth();
    
    // ⏰ Otomatik yönlendirme kontrolünü başlat (her dakika kontrol et)
    checkAutoRedirect();
    setInterval(checkAutoRedirect, 60000); // Her 60 saniyede bir kontrol et
    
    // ⚡ SUPER HIZLI Cache sistemi
    let cachedRecords = [];
    let cacheTimestamp = 0;
    const CACHE_DURATION = 300000; // 5 dakika
    let recordMap = new Map(); // motor|tarih|saat -> record
    let cacheRefreshTimer = null;
    
    // Motor seçim butonları
    const motorButtons = document.querySelectorAll('.motor-btn');
    let selectedMotor = 'GM-1';
    let isLocked = false;
    
    // Elementler
    const tarihSecimi = document.getElementById('tarihSecimi');
    const vardiyaSecimi = document.getElementById('vardiyaSecimi');
    const currentHourElement = document.querySelector('.kojen-enerji-table-body .sticky-col');
    const kaydetBtn = document.getElementById('kaydetBtn');
    const temizleBtn = document.getElementById('temizleBtn');
    const motorCalismiyorKaydetBtn = document.getElementById('motorCalismiyorKaydetBtn');
    const sidebarLogout = document.getElementById('sidebarLogout');
    const headerLogout = document.getElementById('headerLogout');

    // ⚡ Cache'i yenile - Optimize edilmiş
    async function refreshCache() {
        try {
            const result = await getAllEnerjiRecords();
            if (result.success) {
                cachedRecords = result.data;
                recordMap.clear();
                
                result.data.forEach(record => {
                    const mapKey = `${record.motor}|${record.tarih}|${record.saat}`;
                    recordMap.set(mapKey, record);
                });
                
                cacheTimestamp = Date.now();
                console.log('⚡ Kojen Enerji cache yenilendi:', cachedRecords.length, 'kayıt');
                startBackgroundRefresh();
            }
        } catch (error) {
            console.error('Cache yenileme hatası:', error);
        }
    }
    
    // ⚡ Background cache yenileme
    function startBackgroundRefresh() {
        if (cacheRefreshTimer) clearInterval(cacheRefreshTimer);
        cacheRefreshTimer = setInterval(async () => {
            try {
                const result = await getAllEnerjiRecords();
                if (result.success) {
                    cachedRecords = result.data;
                    recordMap.clear();
                    result.data.forEach(record => {
                        const mapKey = `${record.motor}|${record.tarih}|${record.saat}`;
                        recordMap.set(mapKey, record);
                    });
                    cacheTimestamp = Date.now();
                }
            } catch (error) {
                console.error('Background cache hatası:', error);
            }
        }, 240000); // 4 dakika
    }
    
    // ⚡ ULTRA HIZLI çift kayıt kontrolü - Map tabanlı
    async function checkExistingRecord(motor, tarih, saat) {
        try {
            const now = Date.now();
            if (now - cacheTimestamp < CACHE_DURATION) {
                const mapKey = `${motor}|${tarih}|${saat}`;
                const cached = recordMap.get(mapKey);
                if (cached) {
                    console.log('⚡ Enerji cache hit!');
                    return cached;
                }
            }
            
            const result = await checkExistingEnerjiRecord(motor, tarih, saat);
            if (result.success && result.exists) {
                cachedRecords.push(result.record);
                const mapKey = `${result.record.motor}|${result.record.tarih}|${result.record.saat}`;
                recordMap.set(mapKey, result.record);
                return result.record;
            }
            return null;
        } catch (error) {
            console.error('Kayıt kontrolü hatası:', error);
            return null;
        }
    }
    
    // 🔒 BAŞLANGIÇTA TÜM FORM PASİF
    disableAllFormElements();
    
    // ⚡ CACHE BAŞLAT
    setTimeout(() => refreshCache(), 100);
    
    // 🔍 1 SN SONRA KAYIT KONTROLÜ VE AÇ/KİLİTLE
    setTimeout(async () => {
        await checkAndUnlockOrLockForm();
    }, 1000);
    
    // 🔥 HIZLI form durumu kontrolü
    async function checkAndUpdateFormStatus() {
        if (!selectedMotor || !tarihSecimi?.value || !currentHourElement?.textContent) {
            console.log('Enerji form: Eksik parametre');
            return;
        }
        
        try {
            const saat = currentHourElement.textContent.trim();
            const existingRecord = await checkExistingRecord(selectedMotor, tarihSecimi.value, saat);
            
            if (existingRecord) {
                console.log('🔥 Enerji kayıt bulundu, kilitleniyor:', existingRecord);
                lockForm(false);
                loadExistingRecord(existingRecord);
            } else {
                console.log('🔥 Enerji kayıt yok, form açık');
                unlockForm();
            }
        } catch (error) {
            console.error('Enerji form kontrol hatası:', error);
            unlockForm();
        }
    }
    
    // 🔥 Mevcut kaydı yükle
    function loadExistingRecord(existingRecord) {
        const inputs = document.querySelectorAll('.kojen-input');
        if (existingRecord.durum === 'MOTOR ÇALIŞMIYOR') {
            inputs.forEach(input => {
                input.value = '0';
                input.style.background = '#ffebee';
                input.style.color = '#c62828';
            });
        } else {
            inputs[0].value = (existingRecord.aydemVoltaji || '').replace(',', '.');
            inputs[1].value = (existingRecord.aktifGuc || '').replace(',', '.');
            inputs[2].value = (existingRecord.reaktifGuc || '').replace(',', '.');
            inputs[3].value = (existingRecord.cosPhi || '').replace(',', '.');
            inputs[4].value = (existingRecord.ortAkim || '').replace(',', '.');
            inputs[5].value = (existingRecord.ortGerilim || '').replace(',', '.');
            inputs[6].value = (existingRecord.notrAkim || '').replace(',', '.');
            inputs[7].value = (existingRecord.tahrikGerilimi || '').replace(',', '.');
            inputs[8].value = (existingRecord.toplamAktifEnerji || '').replace(',', '.');
            inputs[9].value = (existingRecord.calismaSaati || '').replace(',', '.');
            inputs[10].value = (existingRecord.kalkisSayisi || '').replace(',', '.');
            
            inputs.forEach(input => {
                input.style.background = 'white';
                input.style.color = '';
            });
        }
    }

    // BAŞLANGIÇTA TÜM FORM PASİF YAP
    function disableAllFormElements() {
        console.log('Enerji form başlangıçta pasif yapılıyor...');
        
        // Input'ları pasif yap
        const allInputs = document.querySelectorAll('.kojen-input');
        allInputs.forEach(input => {
            input.disabled = true;
            input.style.background = '#f5f5f5';
            input.style.cursor = 'not-allowed';
        });
        
        // Butonları pasif yap (AMA MOTOR ÇALIŞMIYOR BUTONUNU AKTİF TUT)
        const buttons = [kaydetBtn, temizleBtn];
        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        });
        
        // MOTOR ÇALIŞMIYOR BUTONUNU HER ZAMAN AKTİF TUT
        if (motorCalismiyorKaydetBtn) {
            motorCalismiyorKaydetBtn.disabled = false;
            motorCalismiyorKaydetBtn.style.opacity = '1';
            motorCalismiyorKaydetBtn.style.cursor = 'pointer';
        }
        
        // 🔥 MOTOR SEÇİM BUTONLARINI HER ZAMAN AKTİF TUT
        // Kullanıcı her zaman motor seçebilmeli
        motorButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }
    
    // TÜM FORM ELEMANLARINI AKTİF YAP (kayıt yoksa)
    function enableAllFormElements() {
        console.log('Enerji form aktif yapılıyor...');
        
        // Input'ları aktif yap
        const allInputs = document.querySelectorAll('.kojen-input');
        allInputs.forEach(input => {
            input.disabled = false;
            input.style.background = 'white';
            input.style.cursor = 'text';
        });
        
        // Butonları aktif yap
        const buttons = [kaydetBtn, temizleBtn, motorCalismiyorKaydetBtn];
        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        });
        
        // Motor seçim butonlarını aktif yap
        motorButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
        
        showMessage('Yeni kayıt yapabilirsiniz.', 'success');
    }
    
    // 🔍 KAYIT KONTROLÜ SONRASI AÇ/KİLİTLE MANTIĞI
    async function checkAndUnlockOrLockForm() {
        if (!selectedMotor || !tarihSecimi?.value || !currentHourElement?.textContent) {
            console.log('Enerji kontrol: Eksik parametre');
            enableAllFormElements(); // Eksikse yine de aç
            return;
        }
        
        try {
            const saat = currentHourElement.textContent.trim();
            const existingRecord = await checkExistingRecord(selectedMotor, tarihSecimi.value, saat);
            
            if (existingRecord) {
                // 🔒 KAYIT VAR - Form kilitli kalır, veriler yüklenir
                console.log('🔒 Enerji kayıt bulundu, form kilitli:', existingRecord);
                lockForm(false);
                loadExistingRecord(existingRecord);
                showMessage(`Mevcut kayıt yüklendi: ${existingRecord.durum || 'NORMAL'}`, 'info');
            } else {
                // 🔓 KAYIT YOK - Form açılır
                console.log('🔓 Enerji kayıt yok, form açılıyor');
                enableAllFormElements();
            }
        } catch (error) {
            console.error('Enerji kontrol hatası:', error);
            enableAllFormElements(); // Hata durumunda yine de aç
        }
    }

    // Vardiya aralıkları
    const vardiyaSaatAraliklari = {
        '08-16': { baslangic: 7, bitis: 16, baslangicSaat: '07:00', bitisSaat: '16:00' },
        '16-24': { baslangic: 15, bitis: 24, baslangicSaat: '15:00', bitisSaat: '24:00' },
        '24-08': { baslangic: 23, bitis: 7, baslangicSaat: '23:00', bitisSaat: '07:00' }
    };

    // Çıkış butonları
    sidebarLogout?.addEventListener('click', () => confirm('Çıkış yapmak istediğinizden emin misiniz?') && (window.location.href = 'index.html'));
    headerLogout?.addEventListener('click', () => confirm('Çıkış yapmak istediğinizden emin misiniz?') && (window.location.href = 'index.html'));

    // Input değerlerini al
    function getAllInputValues() {
        const inputs = document.querySelectorAll('.kojen-input');
        return {
            aydemVoltaji: inputs[0]?.value || '',
            aktifGuc: inputs[1]?.value || '',
            reaktifGuc: inputs[2]?.value || '',
            cosPhi: inputs[3]?.value || '',
            ortAkim: inputs[4]?.value || '',
            ortGerilim: inputs[5]?.value || '',
            notrAkim: inputs[6]?.value || '',
            tahrikGerilimi: inputs[7]?.value || '',
            toplamAktifEnerji: inputs[8]?.value || '',
            calismaSaati: inputs[9]?.value || '',
            kalkisSayisi: inputs[10]?.value || ''
        };
    }

    // Form kilit fonksiyonları
    function lockForm(showMsg = true) {
        isLocked = true;
        document.querySelectorAll('.kojen-input').forEach(input => {
            input.disabled = true;
            input.style.background = '#f8f9fa';
        });
        [kaydetBtn, temizleBtn, motorCalismiyorKaydetBtn].forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
        if (showMsg) showMessage('Bu tarih ve saat için kayıt zaten mevcut!', 'error');
    }

    function unlockForm() {
        isLocked = false;
        document.querySelectorAll('.kojen-input').forEach(input => {
            input.disabled = false;
            input.style.background = 'white';
        });
        [kaydetBtn, temizleBtn, motorCalismiyorKaydetBtn].forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });
    }

    
    // Kayıt kontrolü
    async function checkAndUpdateFormStatus() {
        if (!selectedMotor || !tarihSecimi.value) return;
        const saat = `${String(new Date().getHours()).padStart(2, '0')}:00`;
        try {
            const result = await checkExistingEnerjiRecord(selectedMotor, tarihSecimi.value, saat);
            if (result.success && result.exists && result.record) {
                const record = result.record;
                lockForm(false);
                const inputs = document.querySelectorAll('.kojen-input');
                if (record.durum === 'MOTOR ÇALIŞMIYOR') {
                    inputs.forEach(input => { input.value = '0'; input.style.background = '#ffebee'; input.style.color = '#c62828'; });
                } else {
                    inputs[0].value = (record.aydemVoltaji || '').replace(',', '.');
                    inputs[1].value = (record.aktifGuc || '').replace(',', '.');
                    inputs[2].value = (record.reaktifGuc || '').replace(',', '.');
                    inputs[3].value = (record.cosPhi || '').replace(',', '.');
                    inputs[4].value = (record.ortAkif || '').replace(',', '.');
                    inputs[5].value = (record.ortGerilim || '').replace(',', '.');
                    inputs[6].value = (record.notrAkim || '').replace(',', '.');
                    inputs[7].value = (record.tahrikGerilimi || '').replace(',', '.');
                    inputs[8].value = (record.toplamAktifEnerji || '').replace(',', '.');
                    inputs[9].value = (record.calismaSaati || '').replace(',', '.');
                    inputs[10].value = (record.kalkisSayisi || '').replace(',', '.');
                    inputs.forEach(input => { input.style.background = 'white'; input.style.color = ''; });
                }
            } else {
                unlockForm();
            }
        } catch (error) {
            unlockForm();
        }
    }

    // Kaydet butonu
    kaydetBtn?.addEventListener('click', async function() {
        if (isLocked) { showMessage('Bu kayıt zaten mevcut!', 'error'); return; }
        const data = getAllInputValues();
        const saat = `${String(new Date().getHours()).padStart(2, '0')}:00`;
        
        // 🔒 ÇİFT KAYIT KONTROLÜ
        const existingRecord = await checkExistingRecord(selectedMotor, tarihSecimi.value, saat);
        if (existingRecord) {
            showMessage(`Bu tarih, saat ve motor (${selectedMotor}) için kayıt zaten var!\nMevcut kayıt: ${existingRecord.durum || 'NORMAL'}`, 'error');
            return;
        }
        if (Object.values(data).filter(v => !v).length > 0) { showMessage('Lütfen tüm alanları doldurun!', 'error'); return; }
        
        kaydetBtn.disabled = true; kaydetBtn.textContent = '💾 KAYDEDİLİYOR...';
        try {
            const result = await saveEnerjiToSheets({...data, motor: selectedMotor, tarih: tarihSecimi.value, vardiya: vardiyaSecimi.value, saat, kaydeden: getCurrentUserName(), durum: 'NORMAL'});
            if (result.success) {
                // 🔥 CACHE'İ GÜNCELLE
                refreshCache();
                showMessage(`${selectedMotor} motoru için enerji verileri kaydedildi!`, 'success');
                lockForm(false);
                await loadVardiyaData();
            } else {
                showMessage('Kayıt hatası: ' + (result.error || 'Bilinmeyen hata'), 'error');
            }
        } catch (error) {
            showMessage('Bağlantı hatası: ' + error.message, 'error');
        } finally {
            if (!isLocked) kaydetBtn.disabled = false;
            kaydetBtn.textContent = '💾 KAYDET';
        }
    });

    // Temizle butonu
    temizleBtn?.addEventListener('click', () => {
        if (isLocked) { showMessage('Form kilitli!', 'error'); return; }
        document.querySelectorAll('.kojen-input').forEach(input => { input.value = ''; input.style.background = 'white'; input.style.color = '#2c3e50'; });
        showMessage('Tüm veriler temizlendi!', 'info');
    });

    // Motor çalışmıyor kaydet - Son değerleri kullanarak
    motorCalismiyorKaydetBtn?.addEventListener('click', async function() {
        if (isLocked) { showMessage('Bu kayıt zaten mevcut!', 'error'); return; }
        const saat = `${String(new Date().getHours()).padStart(2, '0')}:00`;
        
        // 🔒 ÇİFT KAYIT KONTROLÜ
        const existingRecord = await checkExistingRecord(selectedMotor, tarihSecimi.value, saat);
        if (existingRecord) {
            showMessage(`Bu tarih, saat ve motor (${selectedMotor}) için kayıt zaten var!\nMevcut kayıt: ${existingRecord.durum || 'NORMAL'}`, 'error');
            return;
        }
        
        // 🔍 SON KAYITTAN DEĞERLERİ AL
        const lastRecord = await getLastRecordForMotor(selectedMotor);
        
        // Son kayıt değerleri (yoksa 0)
        const toplamAktifEnerji = lastRecord?.toplamAktifEnerji || '0';
        const calismaSaati = lastRecord?.calismaSaati || '0';
        const kalkisSayisi = lastRecord?.kalkisSayisi || '0';
        
        console.log('🔍 Son kayıt değerleri:', { toplamAktifEnerji, calismaSaati, kalkisSayisi });
        
        // Input'lara değerleri yaz (görsel geri bildirim)
        const inputs = document.querySelectorAll('.kojen-input');
        inputs.forEach((input, index) => {
            input.style.background = '#ffebee';
            input.style.color = '#c62828';
            if (index === 8) input.value = toplamAktifEnerji; // TOPLAM AKTİF ENERJİ
            else if (index === 9) input.value = calismaSaati;  // ÇALIŞMA SAATİ
            else if (index === 10) input.value = kalkisSayisi; // KALKIŞ SAYISI
            else input.value = '0'; // Diğerleri 0
        });
        
        motorCalismiyorKaydetBtn.disabled = true; motorCalismiyorKaydetBtn.textContent = '⚠️ KAYDEDİLİYOR...';
        
        try {
            const result = await saveEnerjiToSheets({
                motor: selectedMotor, 
                tarih: tarihSecimi.value, 
                vardiya: vardiyaSecimi.value, 
                saat, 
                kaydeden: getCurrentUserName(), 
                durum: 'MOTOR ÇALIŞMIYOR',
                // Son kayıt değerleri
                toplamAktifEnerji: toplamAktifEnerji,
                calismaSaati: calismaSaati,
                kalkisSayisi: kalkisSayisi,
                // Diğer değerler 0
                aydemVoltaji: '0',
                aktifGuc: '0',
                reaktifGuc: '0',
                cosPhi: '0',
                ortAkim: '0',
                ortGerilim: '0',
                notrAkim: '0',
                tahrikGerilimi: '0'
            });
            
            if (result.success) {
                // 🔥 CACHE'İ GÜNCELLE
                refreshCache();
                showMessage(`${selectedMotor} motoru için "ÇALIŞMIYOR" durumu kaydedildi! (Son değerler: Enerji ${toplamAktifEnerji}, Saat ${calismaSaati}, Kalkış ${kalkisSayisi})`, 'warning');
                lockForm(false);
                await loadVardiyaData();
            } else {
                showMessage('Kayıt hatası: ' + (result.error || 'Bilinmeyen hata'), 'error');
            }
        } catch (error) {
            showMessage('Bağlantı hatası: ' + error.message, 'error');
        } finally {
            if (!isLocked) motorCalismiyorKaydetBtn.disabled = false;
            motorCalismiyorKaydetBtn.textContent = '⚠️ MOTOR ÇALIŞMIYOR KAYDET';
        }
    });

    // Vardiya fonksiyonları
    function getSaatDegeri(saatStr) { return saatStr ? parseInt(saatStr.split(':')[0]) : null; }
    function kayitVardiyaAraligindaMi(saatStr, vardiya) {
        const saat = getSaatDegeri(saatStr);
        if (saat === null) return false;
        const aralik = vardiyaSaatAraliklari[vardiya];
        if (!aralik) return false;
        return vardiya === '24-08' ? (saat >= 23 || saat < 7) : (saat >= aralik.baslangic && saat < aralik.bitis);
    }
    function guncelleVardiyaBilgisi() {
        const vardiya = vardiyaSecimi.value, aralik = vardiyaSaatAraliklari[vardiya];
        const badge = document.getElementById('vardiyaBadge'), saatAraligi = document.getElementById('saatAraligi');
        if (badge && aralik) badge.textContent = vardiya;
        if (saatAraligi && aralik) saatAraligi.textContent = `${aralik.baslangicSaat} - ${aralik.bitisSaat}`;
    }

    async function loadVardiyaData() {
        const vardiya = vardiyaSecimi.value, tarih = tarihSecimi.value, motor = selectedMotor;
        console.log('DEBUG loadVardiyaData:', { vardiya, tarih, motor });
        if (!vardiya || !tarih || !motor) { console.log('DEBUG: Eksik parametre'); return; }
        const tableBody = document.getElementById('vardiyaTableBody'), noDataMessage = document.getElementById('noDataMessage');
        if (!tableBody) { console.log('DEBUG: tableBody bulunamadı'); return; }
        tableBody.innerHTML = '';
        try {
            const result = await getAllEnerjiRecords();
            console.log('DEBUG getAllEnerjiRecords result:', result);
            if (!result.success || !result.data?.length) { console.log('DEBUG: Veri yok veya başarısız'); if (noDataMessage) noDataMessage.style.display = 'block'; return; }
            let searchTarih = tarih;
            if (searchTarih.includes('-')) { const parts = searchTarih.split('-'); searchTarih = `${parts[2]}.${parts[1]}.${parts[0]}`; }
            console.log('DEBUG searchTarih:', searchTarih);
            console.log('DEBUG result.data[0]:', result.data[0]);
            const filtered = result.data.filter(r => {
                const matchTarih = (r.tarih || '') === searchTarih;
                const matchVardiya = kayitVardiyaAraligindaMi(r.saat || '', vardiya);
                const matchMotor = (r.motor || '') === motor;
                console.log('DEBUG filter:', { rTarih: r.tarih, rSaat: r.saat, rMotor: r.motor, matchTarih, matchVardiya, matchMotor });
                return matchTarih && matchVardiya && matchMotor;
            });
            console.log('DEBUG filtered:', filtered);
            filtered.sort((a, b) => (getSaatDegeri(a.saat) || 0) - (getSaatDegeri(b.saat) || 0));
            if (!filtered.length) { if (noDataMessage) { noDataMessage.textContent = `${motor} motoru için bu vardiya saat aralığında henüz kayıt bulunmamaktadır.`; noDataMessage.style.display = 'block'; } return; }
            if (noDataMessage) noDataMessage.style.display = 'none';
            
            // 🔍 MOTOR ÇALIŞMIYOR kayıtları için son normal kayıtları bul
            const sonNormalKayitlar = {};
            filtered.forEach(record => {
                if (record.durum !== 'MOTOR ÇALIŞMIYOR') {
                    // Bu motor için son normal kaydı sakla
                    const motor = record.motor;
                    const recDateTime = parseDateTime(record.tarih, record.saat);
                    if (!sonNormalKayitlar[motor] || parseDateTime(sonNormalKayitlar[motor].tarih, sonNormalKayitlar[motor].saat) < recDateTime) {
                        sonNormalKayitlar[motor] = record;
                    }
                }
            });
            
            filtered.forEach(record => {
                const row = document.createElement('tr');
                if (record.durum === 'MOTOR ÇALIŞMIYOR') row.classList.add('motor-calismiyor');
                
                // 🔍 MOTOR ÇALIŞMIYOR ise son değerleri kullan
                let toplamAktifEnerji = record.toplamAktifEnerji || '-';
                let calismaSaati = record.calismaSaati || '-';
                let kalkisSayisi = record.kalkisSayisi || '-';
                
                if (record.durum === 'MOTOR ÇALIŞMIYOR' && sonNormalKayitlar[record.motor]) {
                    const sonKayit = sonNormalKayitlar[record.motor];
                    // Sadece bu kayıttan önceki son normal kayıt varsa kullan
                    const currentDateTime = parseDateTime(record.tarih, record.saat);
                    const sonKayitDateTime = parseDateTime(sonKayit.tarih, sonKayit.saat);
                    
                    if (sonKayitDateTime < currentDateTime) {
                        toplamAktifEnerji = sonKayit.toplamAktifEnerji || '-';
                        calismaSaati = sonKayit.calismaSaati || '-';
                        kalkisSayisi = sonKayit.kalkisSayisi || '-';
                    }
                }
                
                row.innerHTML = `<td>${record.saat || '-'}</td><td>${record.motor || '-'}</td><td>${record.aydemVoltaji || '-'}</td><td>${record.aktifGuc || '-'}</td><td>${record.reaktifGuc || '-'}</td><td>${record.cosPhi || '-'}</td><td>${record.ortAkif || '-'}</td><td>${record.ortGerilim || '-'}</td><td>${record.notrAkim || '-'}</td><td>${record.tahrikGerilimi || '-'}</td><td>${toplamAktifEnerji}</td><td>${calismaSaati}</td><td>${kalkisSayisi}</td><td class="${record.durum === 'MOTOR ÇALIŞMIYOR' ? 'durum-calismiyor' : 'durum-normal'}">${record.durum === 'MOTOR ÇALIŞMIYOR' ? 'ÇALIŞMIYOR' : 'NORMAL'}</td>`;
                tableBody.appendChild(row);
            });
        } catch (error) { console.error('Vardiya verileri yüklenirken hata:', error); }
    }

    // Event listeners
    motorButtons.forEach(button => button.addEventListener('click', async function() {
        motorButtons.forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        selectedMotor = this.dataset.motor;
        showMessage(`${selectedMotor} motoru seçildi!`, 'info');
        // Inputları temizle
        document.querySelectorAll('.kojen-input').forEach(input => {
            input.value = '';
            input.style.background = 'white';
            input.style.color = '#2c3e50';
        });
        await loadVardiyaData();
        await checkAndUpdateFormStatus();
    }));

    tarihSecimi?.addEventListener('input', function() {
        let value = this.value.replace(/\D/g, '');
        if (value.length >= 2) value = value.slice(0, 2) + '.' + value.slice(2);
        if (value.length >= 5) value = value.slice(0, 5) + '.' + value.slice(5);
        this.value = value.slice(0, 10);
    });

    vardiyaSecimi?.addEventListener('change', async () => { guncelleVardiyaBilgisi(); await loadVardiyaData(); await checkAndUpdateFormStatus(); });
    tarihSecimi?.addEventListener('change', async () => { await loadVardiyaData(); await checkAndUpdateFormStatus(); });

    // Otomatik ayarlar
    async function otomatikAyarlar() {
        const today = new Date();
        tarihSecimi.value = `${String(today.getDate()).padStart(2,'0')}.${String(today.getMonth()+1).padStart(2,'0')}.${today.getFullYear()}`;
        const hour = today.getHours();
        vardiyaSecimi.value = hour >= 8 && hour < 16 ? '08-16' : hour >= 16 && hour < 24 ? '16-24' : '24-08';
        if (currentHourElement) currentHourElement.textContent = `${String(hour).padStart(2,'0')}:00`;
        guncelleVardiyaBilgisi();
        await loadVardiyaData();
        await checkAndUpdateFormStatus();
    }

    await otomatikAyarlar();
    setInterval(async () => {
        const hours = String(new Date().getHours()).padStart(2, '0');
        if (currentHourElement && currentHourElement.textContent !== `${hours}:00`) {
            currentHourElement.textContent = `${hours}:00`;
            await checkAndUpdateFormStatus();
        }
    }, 60000);
});

// 🔥 MOTOR ÇALIŞMIYOR MODAL FONKSİYONLARI
function openMotorCalismiyorModal() {
    const modal = document.getElementById('motorCalismiyorModal');
    const modalTarih = document.getElementById('modalTarih');
    const modalVardiya = document.getElementById('modalVardiya');
    
    // 🔥 OTOMATİK BUGÜN TARİHİNİ GETİR
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    // Modal alanlarını doldur
    modalTarih.value = todayStr; // Otomatik bugünün tarihi
    modalVardiya.value = vardiyaSecimi.value;
    
    // Vardiya saatlerini filtrele
    filterSaatByVardiya(vardiyaSecimi.value);
    
    // Modalı göster
    modal.style.display = 'flex';
    
    // Event listener'ı ekle
    document.getElementById('modalKaydetBtn').onclick = handleModalKaydet;
}

function closeMotorCalismiyorModal() {
    const modal = document.getElementById('motorCalismiyorModal');
    modal.style.display = 'none';
}

function filterSaatByVardiya(vardiya) {
    const saatCheckboxes = document.querySelectorAll('input[name="saat"]');
    const vardiyaSaatleri = {
        '08-16': ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
        '16-24': ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'],
        '24-08': ['00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00']
    };
    
    saatCheckboxes.forEach(checkbox => {
        const saat = checkbox.value;
        if (vardiyaSaatleri[vardiya].includes(saat)) {
            checkbox.checked = true;
            checkbox.disabled = false;
            checkbox.parentElement.style.opacity = '1';
        } else {
            checkbox.checked = false;
            checkbox.disabled = true;
            checkbox.parentElement.style.opacity = '0.5';
        }
    });
}

async function handleModalKaydet() {
    console.log('🔥 handleModalKaydet başlatıldı...');
    
    const kaydetBtn = document.getElementById('modalKaydetBtn');
    const originalText = kaydetBtn.textContent;
    
    try {
        console.log('🔍 Seçili motorları alınıyor...');
        // Seçili motorları al
        const selectedMotors = Array.from(document.querySelectorAll('input[name="motor"]:checked'))
            .map(cb => cb.value);
        
        console.log('📋 Seçili motorlar:', selectedMotors);
        
        if (selectedMotors.length === 0) {
            console.log('❌ Hiç motor seçilmedi');
            showMessage('Lütfen en az bir motor seçin!', 'error');
            return;
        }
        
        console.log('🔍 Seçili saatler alınıyor...');
        // Seçili saatleri al
        const selectedSaatler = Array.from(document.querySelectorAll('input[name="saat"]:checked:not(:disabled)'))
            .map(cb => cb.value);
        
        console.log('📋 Seçili saatler:', selectedSaatler);
        
        if (selectedSaatler.length === 0) {
            console.log('❌ Hiç saat seçilmedi');
            showMessage('Lütfen en az bir saat seçin!', 'error');
            return;
        }
        
        // Butonu devre dışı bırak
        console.log('🔒 Buton devre dışı bırakılıyor...');
        kaydetBtn.disabled = true;
        kaydetBtn.textContent = '⚠️ KAYDEDİLİYOR...';
        
        // 🔥 TARİH FORMAT DÖNÜŞTÜRME - HTML yyyy-MM-dd -> DD.MM.YYYY
        const modalTarihInput = document.getElementById('modalTarih');
        let modalTarih = modalTarihInput.value;
        
        // HTML formatından display formatına çevir
        if (modalTarih && modalTarih.includes('-')) {
            const parts = modalTarih.split('-');
            modalTarih = `${parts[2]}.${parts[1]}.${parts[0]}`; // DD.MM.YYYY
        }
        
        const modalVardiya = document.getElementById('modalVardiya').value;
        const modalNot = document.getElementById('modalNot').value;
        
        console.log('📅 Modal verileri:', { 
            modalTarih: modalTarih, 
            modalTarihRaw: modalTarihInput.value,
            modalVardiya, 
            modalNot 
        });
        
        let successCount = 0;
        let errorCount = 0;
        let errors = [];
        
        console.log('� HIZLI TOPLU KAYIT SİSTEMİ BAŞLIYOR...');
        
        // 🚀 TOPLU KAYIT İÇİN HAZIRLIK
        const kayitlar = [];
        const kontrolListesi = [];
        
        // Tüm kombinasyonları hazırla
        for (const motor of selectedMotors) {
            for (const saat of selectedSaatler) {
                kontrolListesi.push({ motor, tarih: modalTarih, saat });
            }
        }
        
        console.log('📊 Kontrol listesi:', kontrolListesi);
        console.log(`📋 ${kontrolListesi.length} kombinasyon hazırlandı...`);
        
        // 🚀 SÜPER HIZLI TOPLU KAYIT KONTROLÜ (TEK API ÇAĞRISI)
        console.log('🔍 Tüm kayıtlar tek seferde kontrol ediliyor...');
        
        // ⚡ CACHE ÖN KONTROLÜ - Hızlı lokal kontrol
        const lokalKontrolEdilecekler = [];
        const cacheKontrolEdilecekler = [];
        
        kontrolListesi.forEach(({ motor, tarih, saat }) => {
            const key = `${motor}|${tarih}|${saat}`;
            const cached = recordMap.get(key);
            
            if (cached) {
                console.log(`⚡ Cache hit: ${motor} - ${saat} (kayıt var)`);
            } else {
                cacheKontrolEdilecekler.push({ motor, tarih, saat });
            }
        });
        
        console.log(`📊 Cache sonucu: ${kontrolListesi.length - cacheKontrolEdilecekler.length} cache'te, ${cacheKontrolEdilecekler.length} API'den kontrol edilecek`);
        
        // Sadece cache'de olmayanları API'den kontrol et
        let bulkKontrolResult;
        if (cacheKontrolEdilecekler.length > 0) {
            bulkKontrolResult = await checkMultipleEnerjiRecords(cacheKontrolEdilecekler);
        } else {
            bulkKontrolResult = { success: true, results: {}, existingCount: 0, totalCount: 0 };
        }
        
        // 🚀 KAYIT EDİLECEKLERİ FİLTRELE
        const kayitEdilecekler = [];
        
        if (bulkKontrolResult.success) {
            console.log(`📊 Toplu kontrol sonucu: ${bulkKontrolResult.existingCount} var, ${bulkKontrolResult.totalCount - bulkKontrolResult.existingCount} yok`);
            
            kontrolListesi.forEach(({ motor, saat }) => {
                const key = `${motor}|${modalTarih}|${saat}`;
                const cached = recordMap.get(key);
                
                // Önce cache'te kontrol et
                if (cached) {
                    console.log(`⏭️ ${motor} - ${saat} için kayıt zaten var (cache)`);
                    return;
                }
                
                // Sonra API sonucunu kontrol et
                const sonuc = bulkKontrolResult.results[key];
                
                if (sonuc && !sonuc.exists) {
                    kayitEdilecekler.push({ motor, saat });
                } else if (sonuc && sonuc.exists) {
                    console.log(`⏭️ ${motor} - ${saat} için kayıt zaten var (API)`);
                    // Cache'e ekle
                    recordMap.set(key, sonuc.record);
                } else {
                    console.log(`❌ ${motor} - ${saat} kontrol hatası`);
                    errors.push(`${motor} - ${saat}: Kontrol hatası`);
                }
            });
        } else {
            console.log('❌ Toplu kontrol başarısız, tek tek deneniyor...');
            // Fallback: Tek tek kontrol et
            const kontrolSonuclari = await Promise.allSettled(
                kontrolListesi.map(({ motor, saat }) => 
                    checkExistingEnerjiRecord(motor, modalTarih, saat)
                )
            );
            
            kontrolSonuclari.forEach((sonuc, index) => {
                const { motor, saat } = kontrolListesi[index];
                
                if (sonuc.status === 'fulfilled' && sonuc.value.success) {
                    if (!sonuc.value.exists) {
                        kayitEdilecekler.push({ motor, saat });
                    } else {
                        console.log(`⏭️ ${motor} - ${saat} için kayıt zaten var`);
                    }
                } else {
                    console.log(`❌ ${motor} - ${saat} kontrol hatası:`, sonuc.reason);
                    errors.push(`${motor} - ${saat}: Kontrol hatası`);
                }
            });
        }
        
        console.log(`📊 ${kayitEdilecekler.length} kayıt yapılacak...`);
        
        if (kayitEdilecekler.length === 0) {
            console.log('⏭️ Kayıt yapılacak şey yok, işlem tamamlandı');
            showMessage('Tüm seçili saatler için zaten kayıt mevcut!', 'info');
            kaydetBtn.disabled = false;
            kaydetBtn.textContent = originalText;
            return;
        }
        
        // 🚀 SON KAYIT DEĞERLERİNİ TOPLU AL (PARALEL)
        console.log('📊 Son kayıt değerleri toplanıyor...');
        const motorlar = [...new Set(kayitEdilecekler.map(k => k.motor))];
        const sonKayitSonuclari = await Promise.allSettled(
            motorlar.map(motor => getLastRecordForMotor(motor))
        );
        
        const sonKayitlar = {};
        sonKayitSonuclari.forEach((sonuc, index) => {
            const motor = motorlar[index];
            if (sonuc.status === 'fulfilled') {
                sonKayitlar[motor] = sonuc.value || {};
            } else {
                sonKayitlar[motor] = {};
                console.log(`❌ ${motor} son kayıt hatası:`, sonuc.reason);
            }
        });
        
        // 🚀 OPTİMİZE TOPLU KAYIT İŞLEMİ (BATCH PARALEL)
        console.log('💾 Optimize toplu kayıt işlemi başlıyor...');
        
        // ⚡ BATCH SIZE OPTİMİZASYONU - Aynı anda max 6 istek
        const BATCH_SIZE = 6;
        const batches = [];
        
        for (let i = 0; i < kayitEdilecekler.length; i += BATCH_SIZE) {
            batches.push(kayitEdilecekler.slice(i, i + BATCH_SIZE));
        }
        
        console.log(`📊 ${batches.length} batch'e bölündü (her batch max ${BATCH_SIZE} kayıt)`);
        
        const allKayitSonuclari = [];
        
        // Batch'leri sırayla ama her batch içinde paralel çalıştır
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            console.log(`🔄 Batch ${batchIndex + 1}/${batches.length} işleniyor (${batch.length} kayıt)`);
            
            const batchSonuclari = await Promise.allSettled(
                batch.map(({ motor, saat }) => {
                    const sonKayit = sonKayitlar[motor] || {};
                    
                    // ⚡ KAYIT ÖNCESİ CACHE KONTROLÜ - Son kontrol
                    const key = `${motor}|${modalTarih}|${saat}`;
                    if (recordMap.has(key)) {
                        console.log(`⚡ Kayıt öncesi cache hit: ${motor} - ${saat}`);
                        return { success: true, skipped: true, reason: 'Cache\'de zaten var' };
                    }
                    
                    return saveEnerjiToSheets({
                        motor: motor,
                        tarih: modalTarih,
                        vardiya: modalVardiya,
                        saat: saat,
                        kaydeden: getCurrentUserName(),
                        durum: 'MOTOR ÇALIŞMIYOR',
                        not: modalNot || 'Motor çalışmıyor',
                        // Son kayıt değerleri
                        toplamAktifEnerji: sonKayit.toplamAktifEnerji || '0',
                        toplamReaktifEnerji: sonKayit.toplamReaktifEnerji || '0',
                        ortakPuan: sonKayit.ortakPuan || '0',
                        yakitTuketimi: sonKayit.yakitTuketimi || '0',
                        suSicakligi: sonKayit.suSicakligi || '0',
                        egzostGazSicakligi: sonKayit.egzostGazSicakligi || '0',
                        karterBasinc: sonKayit.karterBasinc || '0',
                        onKamaraFarkBasinc: sonKayit.onKamaraFarkBasinc || '0',
                        calismaSaati: sonKayit.calismaSaati || '0',
                        kalkisSayisi: sonKayit.kalkisSayisi || '0'
                    });
                })
            );
            
            allKayitSonuclari.push(...batchSonuclari);
            
            // ⚡ BATCH ARASI KISA BEKLEME - API limitlerini aşmamak için
            if (batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        const kayitSonuclari = allKayitSonuclari;
        
        // 🚀 OPTİMİZE SONUÇ DEĞERLENDİRME
        let kayitEdilecekIndex = 0;
        
        kayitSonuclari.forEach((sonuc, batchIndex) => {
            // Batch içindeki index'i hesapla
            const batchNumber = Math.floor(batchIndex / BATCH_SIZE);
            const indexInBatch = batchIndex % BATCH_SIZE;
            const globalIndex = batchNumber * BATCH_SIZE + indexInBatch;
            
            if (globalIndex >= kayitEdilecekler.length) return;
            
            const { motor, saat } = kayitEdilecekler[globalIndex];
            
            if (sonuc.status === 'fulfilled' && sonuc.value.success) {
                if (sonuc.value.skipped) {
                    console.log(`⚡ Atlandı: ${motor} - ${saat} (${sonuc.value.reason})`);
                } else {
                    successCount++;
                    console.log(`✅ Başarılı: ${motor} - ${saat}`);
                    
                    // ⚡ BAŞARILI KAYDI CACHE'E EKLE
                    const key = `${motor}|${modalTarih}|${saat}`;
                    const newRecord = {
                        motor,
                        tarih: modalTarih,
                        saat,
                        durum: 'MOTOR ÇALIŞMIYOR',
                        kaydeden: getCurrentUserName(),
                        not: modalNot || 'Motor çalışmıyor'
                    };
                    recordMap.set(key, newRecord);
                }
            } else {
                errorCount++;
                const errorMsg = sonuc.status === 'fulfilled' 
                    ? `${motor} - ${saat}: ${sonuc.value.error}`
                    : `${motor} - ${saat}: ${sonuc.reason.message}`;
                errors.push(errorMsg);
                console.log(`❌ Hata: ${errorMsg}`);
            }
            
            kayitEdilecekIndex++;
        });
        
        console.log(`📊 Sonuçlar: ${successCount} başarılı, ${errorCount} hatalı`);
        
        // Sonuç mesajı
        if (successCount > 0) {
            console.log('🎉 Başarılı kayıtlar var, mesaj gösteriliyor...');
            showMessage(`${successCount} kayıt başarıyla eklendi!${errorCount > 0 ? ` ${errorCount} hata var.` : ''}`, 'success');
            loadVardiyaData(); // Verileri yenile
            closeMotorCalismiyorModal();
        } else {
            console.log('❌ Başarılı kayıt yok, hata mesajı gösteriliyor...');
            showMessage('Kayıt eklenemedi!', 'error');
            if (errors.length > 0) {
                console.error('🚨 Tüm hatalar:', errors);
            }
        }
        
    } catch (error) {
        console.error('💀 Ana hata:', error);
        showMessage('İşlem hatası: ' + error.message, 'error');
    } finally {
        console.log('🔓 Buton tekrar aktif ediliyor...');
        kaydetBtn.disabled = false;
        kaydetBtn.textContent = originalText;
        console.log('✅ handleModalKaydet tamamlandı');
    }
}

// Event listener'ları ekle
document.addEventListener('DOMContentLoaded', function() {
    // Motor çalışmıyor butonuna modal açma事件 listener'ı ekle
    const motorCalismiyorKaydetBtn = document.getElementById('motorCalismiyorKaydetBtn');
    if (motorCalismiyorKaydetBtn) {
        // Eski listener'ı kaldır
        motorCalismiyorKaydetBtn.replaceWith(motorCalismiyorKaydetBtn.cloneNode(true));
        
        // Yeni listener'ı ekle
        document.getElementById('motorCalismiyorKaydetBtn').addEventListener('click', function() {
            openMotorCalismiyorModal();
        });
    }
    
    // Vardiya değiştiğinde saatleri filtrele
    document.getElementById('modalVardiya')?.addEventListener('change', function() {
        filterSaatByVardiya(this.value);
    });
});
