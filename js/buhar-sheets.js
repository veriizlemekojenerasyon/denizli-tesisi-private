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
        
        // Gece yarısı tarih güncelleme — tek atışlık, döngü yok
        this.scheduleMidnightRefresh();
        
        console.log('BuharApp baslatildi');
    },
    
    // Olay dinleyicileri
    setupEventListeners: function() {
        const form = document.getElementById('buharForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));

            // TEMIZLE butonu: sadece buhar miktarı alanını sıfırla,
            // gizli tarih alanına dokunma
            form.addEventListener('reset', (e) => {
                e.preventDefault();
                const buharInput = document.getElementById('buharMiktari');
                if (buharInput) { buharInput.value = ''; buharInput.focus(); }
            });
        }

        // Çikis butonlari
        const sidebarLogout = document.getElementById('sidebarLogout');
        const headerLogout  = document.getElementById('headerLogout');
        if (sidebarLogout) sidebarLogout.addEventListener('click', () => this.handleLogout());
        if (headerLogout)  headerLogout.addEventListener('click',  () => this.handleLogout());
    },
    
    // Varsayilan tarih ayarla
    setDefaultDate: function() {
        // Dünkü tarihi hesapla
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const isoVal = yesterday.toISOString().split('T')[0];           // 'YYYY-MM-DD'
        const trVal  = isoVal.split('-').reverse().join('.');            // 'DD.MM.YYYY'

        // Gizli input — form değeri
        const hiddenInput = document.getElementById('buharTarih');
        if (hiddenInput) hiddenInput.value = isoVal;

        // Görünür metin input — salt okunur, dokunulamaz
        const displayInput = document.getElementById('buharTarihDisplay');
        if (displayInput) {
            displayInput.value = trVal;
            // Mobil: her türlü etkileşimi engelle
            ['focus', 'click', 'touchstart', 'touchend', 'mousedown', 'keydown'].forEach(function(evt) {
                displayInput.addEventListener(evt, function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    displayInput.blur();
                }, { passive: false });
            });
        }

        // checkExistingRecord artık gizli input'u okur, değişiklik eventi gerekmiyor
        this.checkExistingRecord();
    },
    
    // Form gönderimi isleme
    handleFormSubmit: async function(e) {
        e.preventDefault();

        // Çift submit engeli
        if (this._submitting) return;

        // Tarih: gizli input'tan al — reset öncesi sakla
        const hiddenTarih = document.getElementById('buharTarih');
        const tarihDeger  = hiddenTarih ? hiddenTarih.value : '';
        const buharInput  = document.getElementById('buharMiktari');
        const buharDeger  = buharInput ? buharInput.value.trim() : '';

        // Validasyon
        if (!tarihDeger) {
            this.showNotification('error', 'Eksik Bilgi', 'Tarih alani bos. Sayfayi yenileyin.');
            return;
        }
        if (buharDeger === '' || isNaN(parseFloat(buharDeger.replace(',', '.')))) {
            this.showNotification('error', 'Eksik Bilgi', 'Gecerli bir buhar miktari girin.');
            if (buharInput) buharInput.focus();
            return;
        }

        const formData = {
            tarih        : tarihDeger,
            buharMiktari : buharDeger,
            kaydeden     : this.getUserName()
        };

        this._submitting = true;
        this.setSavingState(true);

        try {
            const result = await this.addRecord(formData);

            if (result.success) {
                this.showNotification('success', 'Basarili', result.message);
                // Sadece buhar miktarı alanını temizle — gizli tarih alanına dokunma
                if (buharInput) buharInput.value = '';
                this.loadLastRecords();
                this.checkExistingRecord(); // Kaydın gelip gelmediğini doğrula
            } else {
                this.showNotification('error', 'Hata', result.error || 'Kayit yapilamadi!');
            }
        } finally {
            this._submitting = false;
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
    
    // Kayit ekle (Google Sheets'e)
    addRecord: async function(data) {
        try {
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'addRecord');
            url.searchParams.append('tarih', data.tarih);
            url.searchParams.append('buharMiktari', data.buharMiktari);
            url.searchParams.append('kaydeden', data.kaydeden);
            
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors'
            });
            
            return await response.json();
            
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
            
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.renderTable(result.data);
            } else {
                console.error('Kayitlar yüklenemedi:', result.error);
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
    
    // Tarih kontrolü - ayni tarihte kayit varsa inputlari kilitle
    checkExistingRecord: async function() {
        // Tarih değerini gizli input'tan oku (kullanıcı değiştiremez)
        const hiddenInput = document.getElementById('buharTarih');
        if (!hiddenInput || !hiddenInput.value) return;

        // ISO formatı (YYYY-MM-DD) → TR formatına çevir (dd.MM.yyyy) — Sheets ile eşleşmesi için
        const isoVal  = hiddenInput.value;
        const trVal   = isoVal.split('-').reverse().join('.');

        try {
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getRecords');

            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            const result   = await response.json();

            if (result.success && result.data) {
                // Hem ISO hem TR formatında ara — hangisi gelirse eşleşsin
                const existingRecord = result.data.find(function(record) {
                    var t = String(record.tarih || '').trim();
                    return t === isoVal || t === trVal;
                });

                if (existingRecord) {
                    this.lockInputs(true);
                    this.showNotification('warning', 'Kayit Mevcut!',
                        trVal + ' tarihinde zaten bir kayit bulunuyor. Yeni kayit yapilamaz.');
                } else {
                    this.lockInputs(false);
                }
            }
        } catch (error) {
            console.warn('Tarih kontrol hatasi (CORS olabilir):', error.message);
            // CORS hatası durumunda inputları açık bırak — GAS zaten mükerrer kaydı reddeder
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
    
    // g��� Mail gönderme fonksiyonu
    sendEmailAlert: async function(subject, body) {
        if (!BUHAR_CONFIG.EMAIL_ENABLED) {
            console.log('g��� Mail gönderme kapalı');
            return { success: true, message: 'Mail gönderme kapalı' };
        }
        
        try {
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'sendEmail');
            url.searchParams.append('to', BUHAR_CONFIG.EMAIL_TO);
            url.searchParams.append('subject', subject || BUHAR_CONFIG.EMAIL_SUBJECT);
            url.searchParams.append('body', body);
            
            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            const result = await response.json();
            
            console.log('g��� Mail sonucu:', result);
            return result;
        } catch (error) {
            console.error('Mail gönderme hatası:', error);
            return { success: false, error: error.message };
        }
    },
    
    // OTOMATİK KAYIT KONTROLÜ — tarayıcı tarafı devre dışı
    // Asıl kontrol GAS trigger ile yapılıyor (her gün 01:00, Code.gs)
    // Tarayıcı kapalıyken de çalışması için GAS'a taşındı.
    startAutoRecordCheck: function() {
        console.log('Otomatik buhar kayıt kontrolü GAS tarafında (01:00 trigger). Tarayıcı kontrolü devre dışı.');
    },

    checkAndAutoRecord: async function() {
        // GAS tarafına taşındı — burada bir şey yapılmıyor
    },

    // ─── GECEYARISı TARİH GÜNCELLEMESİ ─────────────────────────────────────
    // Sayfa açık kalsa bile saat 00:00:05'te bir kez tetiklenir.
    // Operatör buhar miktarı girmeye başlamışsa forma dokunulmaz,
    // sadece gizli tarih alanı sessizce güncellenir.
    scheduleMidnightRefresh: function() {
        var now   = new Date();
        // Bugün gece yarısı + 5 saniyelik tampon
        var gece  = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
        var msKaldi = gece.getTime() - now.getTime();

        console.log('Gece yarısı tarih güncellemesi planlandı: ' +
                    Math.round(msKaldi / 1000) + ' saniye sonra.');

        setTimeout(function() {
            var buharInput = document.getElementById('buharMiktari');
            var doluMu     = buharInput &&
                             buharInput.value &&
                             buharInput.value.trim() !== '' &&
                             buharInput.value.trim() !== '0';

            // Dünkü (artık bugün olan) tarihi hesapla
            var hedef = new Date();
            hedef.setDate(hedef.getDate() - 1);
            var isoVal = hedef.toISOString().split('T')[0];          // YYYY-MM-DD
            var trVal  = isoVal.split('-').reverse().join('.');        // DD.MM.YYYY

            if (!doluMu) {
                // Alan boş — tarihi, göstergeyi ve tabloyu güncelle
                var hidden = document.getElementById('buharTarih');
                if (hidden) hidden.value = isoVal;

                var display = document.getElementById('buharTarihDisplay');
                if (display) display.value = trVal;

                BuharApp.checkExistingRecord();
                BuharApp.loadLastRecords();
                console.log('Gece yarısı: tarih ve tablo güncellendi → ' + trVal);
            } else {
                // Operatör veri giriyor — sadece gizli tarihi güncelle, formu bozma
                var hidden2 = document.getElementById('buharTarih');
                if (hidden2) hidden2.value = isoVal;

                var display2 = document.getElementById('buharTarihDisplay');
                if (display2) display2.value = trVal;

                console.log('Gece yarısı: operatör giriş yapıyor, sadece tarih güncellendi → ' + trVal);
            }

            // Sonraki gece yarısı için kendini yeniden planla
            // (sayfa 2. gün de açık kalırsa diye)
            BuharApp.scheduleMidnightRefresh();

        }, msKaldi);
    },
    
    // Kayıt var mı kontrol et
    isExistingRecord: async function(tarih) {
        try {
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getRecords');
            
            const response = await fetch(url, { method: 'GET', mode: 'cors' });
            const result = await response.json();
            
            if (result.success && result.data) {
                const existingRecord = result.data.find(record => record.tarih === tarih);
                return !!existingRecord;
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
