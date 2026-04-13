/**
 * BUHAR VERİSİ - Google Sheets Entegrasyonu
 * Bu dosya buhar-verisi.html için Google Sheets bağlantısını sağlar
 * 
 * KURULUM:
 * 1. Google Apps Script'i yayınlayın (Code.gs)
 * 2. Web App URL'ini aşağıdaki APPS_SCRIPT_URL değişkenine yapıştırın
 * 3. Bu dosyayı js/ klasörüne kaydedin
 */

// ============================================
// YAPILANDIRMA - BU ALANI DOLDURUN
// ============================================
const BUHAR_CONFIG = {
    // Google Apps Script Web App URL
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx-_7cvrmHCHCxoV9admm1_Drua5vNepfI9xK_hECfJJSIFSl6wZO5GAD0qVPSGgK2z/exec',
    
    // Sayfa başlığı
    PAGE_NAME: 'Buhar Verisi',
    
    // Varsayılan kullanıcı adı
    DEFAULT_USER: 'Admin'
};

// ============================================
// BUHAR SAYFASI ANA NESNESİ
// ============================================
const BuharApp = {
    // Başlangıç
    init: function() {
        console.log('BuharApp başlatılıyor...');
        
        if (!this.validateConfig()) {
            this.showNotification('error', 'Hata', 'Apps Script URL ayarlanmamış!');
            return;
        }
        
        this.setupEventListeners();
        this.setDefaultDate();
        this.checkExistingRecord(); // Tarih kontrolü ekle
        this.loadLastRecords();
        this.displayUserName();
        
        console.log('BuharApp başlatıldı');
    },
    
    // Konfigürasyon kontrolü
    validateConfig: function() {
        return BUHAR_CONFIG.APPS_SCRIPT_URL && BUHAR_CONFIG.APPS_SCRIPT_URL.length > 0;
    },
    
    // Olay dinleyicileri
    setupEventListeners: function() {
        // Form gönderimi
        const form = document.getElementById('buharForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }
        
        // Çıkış butonları
        const sidebarLogout = document.getElementById('sidebarLogout');
        const headerLogout = document.getElementById('headerLogout');
        
        if (sidebarLogout) {
            sidebarLogout.addEventListener('click', () => this.handleLogout());
        }
        if (headerLogout) {
            headerLogout.addEventListener('click', () => this.handleLogout());
        }
    },
    
    // Varsayılan tarih ayarla (bir gün önce) ve kontrol et
    setDefaultDate: function() {
        const tarihInput = document.getElementById('buharTarih');
        if (tarihInput) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            tarihInput.value = yesterday.toISOString().split('T')[0];
            
            // Tarih değiştiğinde kontrol et
            tarihInput.addEventListener('change', () => {
                this.checkExistingRecord();
            });
        }
    },
    
    // Form gönderimi işleme
    handleFormSubmit: async function(e) {
        e.preventDefault();
        
        const formData = {
            tarih: document.getElementById('buharTarih').value,
            buharMiktari: document.getElementById('buharMiktari').value,
            kaydeden: this.getUserName()
        };
        
        // Validasyon
        if (!formData.tarih || !formData.buharMiktari) {
            this.showNotification('error', 'Eksik Bilgi', 'Lütfen tüm alanları doldurun!');
            return;
        }
        
        // Kaydet
        const result = await this.addRecord(formData);
        
        if (result.success) {
            this.showNotification('success', 'Başarılı', result.message);
            e.target.reset();
            this.setDefaultDate();
            this.loadLastRecords();
        } else {
            this.showNotification('error', 'Hata', result.error || 'Kayıt yapılamadı!');
        }
    },
    
    // Kayıt ekle (Google Sheets'e)
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
            console.error('Kayıt hatası:', error);
            return { success: false, error: 'Bağlantı hatası: ' + error.message };
        }
    },
    
    // Son kayıtları yükle
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
                console.error('Kayıtlar yüklenemedi:', result.error);
            }
            
        } catch (error) {
            console.error('Kayıt yükleme hatası:', error);
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Kayıtlar yüklenemedi!</td></tr>';
        }
    },
    
    // Tablo render et
    renderTable: function(records) {
        const tableBody = document.getElementById('recordsTableBody');
        if (!tableBody) return;
        
        if (!records || records.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Henüz kayıt bulunmuyor.</td></tr>';
            return;
        }
        
        let html = '';
        records.forEach((record, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${this.formatDate(record.tarih)}</td>
                    <td>${parseFloat(record.buharMiktari).toFixed(2)}</td>
                    <td>${record.kaydeden || '-'}</td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = html;
    },
    
    // Tarih formatla
    formatDate: function(dateString) {
        if (!dateString) return '-';
        
        // dd.MM.yyyy formatını parse et (örn: 27.03.2026)
        var parts = dateString.split('.');
        if (parts.length === 3) {
            // Yeni Date oluştur: yıl, ay-1, gün
            var date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            return date.toLocaleDateString('tr-TR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }
        
        // Eğer başka formatta gelirse direkt göster
        return dateString;
    },
    
    // Kullanıcı adı göster
    displayUserName: function() {
        const display = document.getElementById('user-name-display');
        if (display) {
            display.textContent = this.getUserName();
        }
    },
    
    // Kullanıcı adı al
    getUserName: function() {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        return currentUser.name || currentUser.username || BUHAR_CONFIG.DEFAULT_USER;
    },
    
    // Tarih kontrolü - aynı tarihte kayıt varsa inputları kilitle
    checkExistingRecord: async function() {
        const tarihInput = document.getElementById('buharTarih');
        const buharInput = document.getElementById('buharMiktari');
        const submitBtn = document.querySelector('#buharForm button[type="submit"]');
        
        if (!tarihInput || !tarihInput.value) return;
        
        const currentDate = tarihInput.value;
        
        try {
            // Tüm kayıtları çek ve kontrol et
            const url = new URL(BUHAR_CONFIG.APPS_SCRIPT_URL);
            url.searchParams.append('action', 'getRecords');
            
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors'
            });
            
            const result = await response.json();
            
            if (result.success && result.data) {
                // Aynı tarihte kayıt var mı kontrol et
                const existingRecord = result.data.find(record => record.tarih === currentDate);
                
                if (existingRecord) {
                    // Kayıt varsa inputları kilitle
                    this.lockInputs(true);
                    this.showNotification('warning', 'Kayıt Mevcut!', 
                        `${this.formatDate(currentDate)} tarihinde zaten bir kayıt bulunuyor. Yeni kayıt yapılamaz.`);
                } else {
                    // Kayıt yoksa inputları aç
                    this.lockInputs(false);
                }
            }
            
        } catch (error) {
            console.error('Tarih kontrol hatası:', error);
        }
    },
    
    // Inputları kilitle/aç
    lockInputs: function(locked) {
        const buharInput = document.getElementById('buharMiktari');
        const submitBtn = document.querySelector('#buharForm button[type="submit"]');
        
        if (buharInput) {
            buharInput.disabled = locked;
            buharInput.style.background = locked ? '#f0f0f0' : '';
            buharInput.style.cursor = locked ? 'not-allowed' : '';
            buharInput.placeholder = locked ? 'Bu tarih için kayıt mevcut' : '0.00';
        }
        
        if (submitBtn) {
            submitBtn.disabled = locked;
            submitBtn.style.opacity = locked ? '0.5' : '1';
            submitBtn.style.cursor = locked ? 'not-allowed' : 'pointer';
        }
    },
    
    // Çıkış işlemi
    handleLogout: function() {
        if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
            localStorage.removeItem('loggedInUser');
            window.location.href = 'giris.html';
        }
    },
    
    // Bildirim göster
    showNotification: function(type, title, message) {
        // Basit alert kullan (daha gelişmiş bildirim için CSS modali eklenebilir)
        alert(`${title}: ${message}`);
    }
};

// ============================================
// SAYFA YÜKLENDİĞİNDE BAŞLAT
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    BuharApp.init();
});
