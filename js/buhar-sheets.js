/**
 * BUHAR VERISI - Google Sheets Entegrasyonu
 * Bu dosya buhar-verisi.html için Google Sheets baglantisini saglar
 * 
 * KURULUM:
 * 1. Google Apps Script'i yayinlayin (Code.gs)
 * 2. Web App URL'ini asagidaki APPS_SCRIPT_URL degiskenine yapistirin
 * 3. Bu dosyayi js/ klasörüne kaydedin
 */

// ============================================
// YAPILANDIRMA - BU ALANI DOLDURUN
// ============================================
const BUHAR_CONFIG = {
    // Google Apps Script Web App URL
    APPS_SCRIPT_URL: window.AppConfig.getScriptUrl('buhar'),
    
    // Sayfa basligi
    PAGE_NAME: 'Buhar Verisi',
    
    // Varsayilan kullanici adi
    DEFAULT_USER: 'Admin',
    
    // g��� Mail uyarı ayarları
    EMAIL_ENABLED: true, // Mail gönderme aç/kapa
    EMAIL_TO: 'mrtcsk0320@gmail.com', // Uyarı maili gönderilecek adres
    EMAIL_SUBJECT: 'Buhar Verisi Uyarısı - Değer Girilmedi'
};

// ============================================
// BUHAR SAYFASI ANA NESNESI
// ============================================
const BuharApp = {
    // Baslangic
    init: function() {
        console.log('BuharApp baslatiliyor...');
        
        this.setupEventListeners();
        this.setDefaultDate();
        this.checkExistingRecord();
        this.loadLastRecords();
        
        // NOT: Otomatik kayıt GAS sunucu trigger'ı ile yapılıyor (startAutoRecordCheck devre dışı)
        
        console.log('BuharApp baslatildi');
    },
    
    // Olay dinleyicileri
    setupEventListeners: function() {
        const form = document.getElementById('buharForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        
        // Çikis butonlari
        const sidebarLogout = document.getElementById('sidebarLogout');
        const headerLogout = document.getElementById('headerLogout');
        
        if (sidebarLogout) {
            sidebarLogout.addEventListener('click', () => this.handleLogout());
        }
        if (headerLogout) {
            headerLogout.addEventListener('click', () => this.handleLogout());
        }
    },
    
    // Varsayilan tarih ayarla
    setDefaultDate: function() {
        const tarihInput = document.getElementById('buharTarih');
        const tarihDisplay = document.getElementById('buharTarihDisplay');
        if (tarihInput) {
            // Bir gün önceki tarihi ayarla — yerel saat kullan, UTC değil
            const now = new Date();
            const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const yyyy = yesterday.getFullYear();
            const mm   = String(yesterday.getMonth() + 1).padStart(2, '0');
            const dd   = String(yesterday.getDate()).padStart(2, '0');
            const isoDate = yyyy + '-' + mm + '-' + dd;
            tarihInput.value = isoDate;

            // Görünür alana TR formatında yaz
            if (tarihDisplay) {
                tarihDisplay.value = dd + '.' + mm + '.' + yyyy;
            }
        }
    },
    
    // Form gönderimi isleme
    handleFormSubmit: async function(e) {
        e.preventDefault();
        
        const formData = {
            tarih: document.getElementById('buharTarih').value,
            buharMiktari: document.getElementById('buharMiktari').value,
            kaydeden: this.getUserName()
        };
        
        // Validasyon
        if (!formData.tarih || !formData.buharMiktari) {
            this.showNotification('error', 'Eksik Bilgi', 'Lütfen tüm alanlari doldurun!');
            return;
        }
        
        this.setSavingState(true);

        try {
            // Kaydet
            const result = await this.addRecord(formData);
            
            if (result.success) {
                this.showNotification('success', 'Basarili', result.message);
                e.target.reset();
                this.setDefaultDate();
                this.loadLastRecords();
            } else {
                this.showNotification('error', 'Hata', result.error || 'Kayit yapilamadi!');
            }
        } finally {
            this.setSavingState(false);
        }
    },

    setSavingState: function(isSaving) {
        const form = document.getElementById('buharForm');
        const submitBtn = document.querySelector('#buharForm button[type="submit"]');
        const resetBtn = document.querySelector('#buharForm button[type="reset"]');
        const status = document.getElementById('buharSaveStatus');

        if (submitBtn) {
            if (!submitBtn.dataset.defaultText) {
                submitBtn.dataset.defaultText = submitBtn.textContent;
            }
            submitBtn.disabled = isSaving;
            submitBtn.textContent = isSaving ? 'KAYDEDILIYOR...' : submitBtn.dataset.defaultText;
            submitBtn.classList.toggle('is-saving', isSaving);
            submitBtn.style.cursor = isSaving ? 'wait' : 'pointer';
            submitBtn.style.opacity = '1';
        }

        if (resetBtn) {
            resetBtn.disabled = isSaving;
            resetBtn.style.opacity = isSaving ? '0.6' : '1';
            resetBtn.style.cursor = isSaving ? 'not-allowed' : 'pointer';
        }

        if (form) {
            form.setAttribute('aria-busy', isSaving ? 'true' : 'false');
        }

        if (status) {
            status.textContent = isSaving ? 'Kaydediliyor, lutfen bekleyin...' : '';
        }
    },
    
    // JSONP yardımcı — file:// ve CORS sorunlarını aşar
    _jsonp: function(url, params) {
        return new Promise(function(resolve, reject) {
            var cbName = 'buharCb' + Date.now();
            var timer = setTimeout(function() {
                var s = document.getElementById(cbName);
                if (s && s.parentNode) s.parentNode.removeChild(s);
                try { delete window[cbName]; } catch(e) {}
                reject(new Error('Zaman aşımı'));
            }, 20000);

            window[cbName] = function(json) {
                clearTimeout(timer);
                var s = document.getElementById(cbName);
                if (s && s.parentNode) s.parentNode.removeChild(s);
                try { delete window[cbName]; } catch(e) {}
                resolve(json);
            };

            var fullUrl = url + '?' + params + '&callback=' + encodeURIComponent(cbName) + '&_t=' + Date.now();
            var script = document.createElement('script');
            script.id = cbName;
            script.src = fullUrl;
            script.onerror = function() {
                clearTimeout(timer);
                if (script.parentNode) script.parentNode.removeChild(script);
                try { delete window[cbName]; } catch(e) {}
                reject(new Error('GAS\'a bağlanılamadı'));
            };
            document.body.appendChild(script);
        });
    },

    _buildParams: function(obj) {
        return Object.keys(obj).map(function(k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
        }).join('&');
    },

    // Kayit ekle (Google Sheets'e)
    addRecord: async function(data) {
        try {
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'addRecord');
            url.searchParams.append('tarih', data.tarih);
            url.searchParams.append('buharMiktari', data.buharMiktari);
            url.searchParams.append('kaydeden', data.kaydeden);

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Kayit hatasi:', error);
            return { success: false, error: 'Baglanti hatasi: ' + error.message };
        }
    },

    // Son kayitlari yükle
    loadLastRecords: async function() {
        const tableBody = document.getElementById('recordsTableBody');
        if (!tableBody) return;

        try {
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getLastRecords');
            url.searchParams.append('count', '32');

            console.log('Buhar loadLastRecords URL:', url.toString());

            const response = await fetch(url.toString());

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Buhar loadLastRecords result:', result);

            if (result.success) {
                this.renderTable(result.data);
            } else {
                console.error('Kayitlar yüklenemedi:', result.error);
                tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Kayıtlar yüklenemedi.</td></tr>';
            }
        } catch (error) {
            console.error('Kayit yükleme hatasi:', error);
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Kayitlar yüklenemedi!</td></tr>';
        }
    },
    
    // Tablo render et
    renderTable: function(records) {
        const tableBody = document.getElementById('recordsTableBody');
        if (!tableBody) return;

        if (!records || records.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Henüz kayit bulunmuyor.</td></tr>';
            return;
        }

        let html = '';
        records.forEach((record, index) => {
            // buharMiktari: GAS artık number döndürüyor ama eski kayıtlar string gelebilir
            const miktarRaw = record.buharMiktari;
            const miktar = (typeof miktarRaw === 'number')
                ? miktarRaw
                : parseFloat(String(miktarRaw || '0').replace(',', '.'));
            const miktarStr = isNaN(miktar) ? '0.00' : miktar.toFixed(2);

            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${this.formatDate(record.tarih)}</td>
                    <td>${miktarStr}</td>
                    <td>${record.kaydeden || '-'}</td>
                </tr>
            `;
        });

        tableBody.innerHTML = html;
    },
    
    // Tarih formatla
    formatDate: function(dateString) {
        if (!dateString) return '-';
        
        // dd.MM.yyyy formatini parse et (örn: 27.03.2026)
        var parts = dateString.split('.');
        if (parts.length === 3) {
            // Yeni Date olustur: yil, ay-1, gün
            var date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            return date.toLocaleDateString('tr-TR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }
        
        // Eger baska formatta gelirse direkt göster
        return dateString;
    },
    
    // Kullanici adi göster
    displayUserName: function() {
        const display = document.getElementById('user-name-display');
        if (display) {
            display.textContent = this.getUserName();
        }
    },
    
    // Kullanici adi al
    getUserName: function() {
        const loggedInUser = localStorage.getItem('loggedInUser');
        
        if (loggedInUser) {
            try {
                const user = JSON.parse(loggedInUser);
                const fullName = `${user.firstName || user.ad || ''} ${user.lastName || user.soyad || ''}`.trim();
                return fullName || user.email || BUHAR_CONFIG.DEFAULT_USER;
            } catch (e) {
                console.error('Kullanıcı bilgileri okunamadı:', e);
            }
        }
        
        // Fallback: eski currentUser kontrolü
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        return currentUser.name || currentUser.username || BUHAR_CONFIG.DEFAULT_USER;
    },
    
    // ISO tarih string'ini TR formatına çevir: "2026-03-27" → "27.03.2026"
    isoToTR: function(isoStr) {
        if (!isoStr) return '';
        const parts = isoStr.split('-');
        if (parts.length !== 3) return isoStr;
        return parts[2] + '.' + parts[1] + '.' + parts[0];
    },

    // Tarih kontrolü - ayni tarihte kayit varsa inputlari kilitle
    checkExistingRecord: async function() {
        const tarihInput = document.getElementById('buharTarih');
        if (!tarihInput || !tarihInput.value) return;

        const currentDateTR = this.isoToTR(tarihInput.value);

        try {
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getRecords');

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            if (result.success && Array.isArray(result.data)) {
                const existingRecord = result.data.find(function(record) {
                    return String(record.tarih || '').trim() === currentDateTR;
                });

                if (existingRecord) {
                    this.lockInputs(true);
                    this.showNotification('warning', 'Kayit Mevcut!',
                        currentDateTR + ' tarihinde zaten bir kayit bulunuyor. Yeni kayit yapilamaz.');
                } else {
                    this.lockInputs(false);
                }
            }
        } catch (error) {
            console.error('Tarih kontrol hatasi:', error);
            this.lockInputs(false);
        }
    },
    
    // Inputlari kilitle/aç
    lockInputs: function(locked) {
        const buharInput = document.getElementById('buharMiktari');
        const submitBtn = document.querySelector('#buharForm button[type="submit"]');
        
        if (buharInput) {
            buharInput.disabled = locked;
            buharInput.style.background = locked ? '#f0f0f0' : '';
            buharInput.style.cursor = locked ? 'not-allowed' : '';
            buharInput.placeholder = locked ? 'Bu tarih için kayit mevcut' : '0.00';
        }
        
        if (submitBtn) {
            submitBtn.disabled = locked;
            submitBtn.style.opacity = locked ? '0.5' : '1';
            submitBtn.style.cursor = locked ? 'not-allowed' : 'pointer';
        }
    },
    
    // Çikis islemi
    handleLogout: function() {
        if (confirm('Çikis yapmak istediginizden emin misiniz?')) {
            localStorage.removeItem('loggedInUser');
            window.location.href = 'anasayfa.html';
        }
    },
    
    // Mail gönderme fonksiyonu
    sendEmailAlert: async function(subject, body) {
        if (!BUHAR_CONFIG.EMAIL_ENABLED) {
            console.log('Mail gönderme kapalı');
            return { success: true, message: 'Mail gönderme kapalı' };
        }

        try {
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'sendEmail');
            url.searchParams.append('to', BUHAR_CONFIG.EMAIL_TO);
            url.searchParams.append('subject', subject || BUHAR_CONFIG.EMAIL_SUBJECT);
            url.searchParams.append('body', body);

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            console.log('Mail sonucu:', result);
            return result;
        } catch (error) {
            console.error('Mail gönderme hatası:', error);
            return { success: false, error: error.message };
        }
    },
    
    // OTOMATİK KAYIT KONTROLÜ (sadece bildirim — gerçek kayıt GAS trigger ile yapılır)
    startAutoRecordCheck: function() {
        console.log('Buhar otomatik kontrol başlatılıyor (yalnızca bildirim modu)...');
        // NOT: Otomatik kayıt sunucu tarafında GAS time-based trigger ile yapılır.
        // Clientside bu fonksiyon yalnızca kullanıcıya uyarı gösterir, kayıt göndermez.
        // Bu sayede tarayıcı saat kaymasından kaynaklanan çift kayıt / yanlış saat sorunu önlenir.
    },
    
    // OTOMATİK KAYIT KONTROLÜ VE GÖNDERİM (devre dışı — GAS trigger kullanılıyor)
    checkAndAutoRecord: async function() {
        // Bu fonksiyon artık çağrılmıyor.
        // Sunucu tarafı GAS trigger (installHourlyMissingRecordTrigger) tarayıcıdan bağımsız çalışır.
        console.log('checkAndAutoRecord: GAS trigger tarafından yönetiliyor, istemci tarafı devre dışı.');
    },
    
    // Kayıt var mı kontrol et (tarih ISO veya TR formatında gelebilir)
    isExistingRecord: async function(tarih) {
        try {
            const tarihTR = this.isoToTR(tarih);

            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getRecords');

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();

            if (result.success && Array.isArray(result.data)) {
                return result.data.some(function(record) {
                    return String(record.tarih || '').trim() === tarihTR;
                });
            }
            return false;
        } catch (error) {
            console.error('Kayıt kontrolü hatası:', error);
            return false;
        }
    },
    
    // Bildirim göster
    showNotification: function(type, title, message) {
        // Basit alert kullan (daha gelismis bildirim için CSS modali eklenebilir)
        alert(`${title}: ${message}`);
    }
};

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
        
        console.log('Buhar Veri - Kullanici adi ayarlandi:', fullName || user.email || 'Kullanici');
    } catch (e) {
        console.error('Buhar Veri - Kullanici bilgileri okunamadi:', e);
        const allElements = document.querySelectorAll('[id="userNameDisplay"]');
        allElements.forEach(element => {
            element.textContent = 'Kullanici';
        });
    }
}

// ============================================
// SAYFA YÜKLENDIÐINDE BA�?LAT
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Önce kimlik dogrulama kontrolü
    checkAuth();
    
    BuharApp.init();
});
