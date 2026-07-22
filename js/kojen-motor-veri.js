// 🔥 GLOBAL MESAJ GÖSTER FONKSİYONU
function showMessage(message, type) {
    // Mevcut mesajları temizle
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());

    // Yeni mesaj oluştur
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    // Stiller
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 9999;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        transition: all 0.3s ease;
    `;
    
    // Renkler
    const colors = {
        success: 'linear-gradient(135deg, #28a745, #20c997)',
        error: 'linear-gradient(135deg, #dc3545, #c82333)',
        warning: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
        info: 'linear-gradient(135deg, #17a2b8, #138496)'
    };
    
    messageDiv.style.background = colors[type] || colors.info;
    document.body.appendChild(messageDiv);
    
    // 3 saniye sonra kaldır
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

// Kayit surelerini Console'da takip eder.
function startConsoleDurationTimer(label) {
    const timerLabel = label || 'Islem';
    const startedAt = performance.now();
    let seconds = 0;
    console.log(`[${timerLabel}] basladi`);

    const intervalId = setInterval(() => {
        seconds += 1;
        console.log(`[${timerLabel}] ${seconds} sn`);
    }, 1000);

    return function stopConsoleDurationTimer(status) {
        clearInterval(intervalId);
        const elapsedSeconds = ((performance.now() - startedAt) / 1000).toFixed(2);
        console.log(`[${timerLabel}] ${status || 'tamamlandi'} - toplam ${elapsedSeconds} sn`);
    };
}

// 🔥 GLOBAL DEĞİŞKENLER
let cachedRecords = [];
let recordMap = new Map();
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 dakika

// 🚀 ARKA PLAN KAYIT SİSTEMİ
let kayitKuyrugu = [];
let islemSirasi = 0;
let kayitIslemiDevamEdiyor = false;
const MAX_PARALEL_KAYIT = 3; // Aynı anda max 3 kayıt

// 🔥 GLOBAL MOTOR DEĞİŞKENİ
let selectedMotor = 'GM-1'; // Varsayılan motor

// � Giriş yapan kullanıcının adını al
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

// 🔍 MOTORUN SON KAYDINI GETİR (Motor Çalışmıyor için)
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
            const result = await getMotorRecordsByMotorAndDate(motor, document.getElementById('tarihSecimi')?.value || '');
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

// ⚡ KAYIT KONTROLÜ - GLOBAL - DEVRE DIŞI
async function checkExistingRecord(motor, tarih, saat) {
    // Cache devre dışı - her zaman null döndür
    return null;
}

// � GLOBAL loadVardiyaData FONKSİYONU
function normalizeMotorDateForCache(value) {
    const text = String(value || '').trim();
    if (text.includes('-')) {
        const parts = text.split('-');
        if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return text;
}

function normalizeMotorSaatForCache(value) {
    const text = String(value || '').trim();
    if (!text) return '00:00';
    const parts = text.split(':');
    const hour = String(parseInt(parts[0] || '0', 10) || 0).padStart(2, '0');
    const minute = String(parseInt(parts[1] || '0', 10) || 0).padStart(2, '0');
    return `${hour}:${minute}`;
}

function getCachedMotorRecord(motor, tarih, saat) {
    // Cache devre dışı - her zaman null döndür
    return null;
}

function rememberMotorRecord(record) {
    // Cache devre dışı - hiçbir şey yapma
    return;
}

// 🔥 CACHE YENİLEME FONKSİYONU (GLOBAL) - DEVRE DIŞI
async function refreshCache() {
    // Cache devre dışı - hiçbir şey yapma
    return;
}

// 🔥 BACKGROUND CACHE YENİLEME FONKSİYONU (GLOBAL) - DEVRE DIŞI
let cacheRefreshTimer = null;

function startBackgroundRefresh() {
    // Cache devre dışı - hiçbir şey yapma
    return;
}

// 🔥 TÜM INPUT DEĞERLERİNİ GETİR FONKSİYONU
function getAllInputValues() {
    const inputs = document.querySelectorAll('.data-input');
    const values = {};
    
    inputs.forEach(input => {
        values[input.id] = input.value;
    });
    
    // Saat değerini doğrudan currentHour elementinden al
    let saat = '';
    const currentHourElement = document.getElementById('currentHour');
    if (currentHourElement) {
        saat = currentHourElement.textContent.trim();
    }
    
    // Eğer currentHour'dan alınamazsa, sticky-col'den al
    if (!saat) {
        const stickyColElement = document.querySelector('.sticky-col');
        saat = stickyColElement?.textContent?.trim() || '';
    }
    
    return {
        motor: selectedMotor,
        tarih: document.getElementById('tarihSecimi').value,
        vardiya: document.getElementById('vardiyaSecimi').value,
        saat: saat,
        veriler: values
    };
}

// 🔥 DÜZENLEME MODAL FONKSİYONLARI
let currentEditRecord = null;

function openEditModal(record) {
    currentEditRecord = record;
    
    // Modal bilgilerini doldur
    document.getElementById('duzenleMotor').value = record.motor;
    document.getElementById('duzenleTarih').value = record.tarih;
    document.getElementById('duzenleSaat').value = record.saat;
    
    // Inputları mevcut değerlerle doldur
    const inputMapping = {
        'duzenleJenYatakSicaklikDE': record.jenYatakSicaklikDE,
        'duzenleJenYatakSicaklikNDE': record.jenYatakSicaklikNDE,
        'duzenleSogutmaSuyuSicaklik': record.sogutmaSuyuSicaklik,
        'duzenleSogutmaSuyuBasinc': record.sogutmaSuyuBasinc,
        'duzenleYagSicaklik': record.yagSicaklik,
        'duzenleYagBasinc': record.yagBasinc,
        'duzenleSarjSicaklik': record.sarjSicaklik,
        'duzenleSarjBasinc': record.sarjBasinc,
        'duzenleGazRegulatoru': record.gazRegulatoru,
        'duzenleMakineDairesiSicaklik': record.makineDairesiSicaklik,
        'duzenleKarterBasinc': record.karterBasinc,
        'duzenleOnKamaraFarkBasinc': record.onKamaraFarkBasinc,
        'duzenleSargiSicaklik1': record.sargiSicaklik1,
        'duzenleSargiSicaklik2': record.sargiSicaklik2,
        'duzenleSargiSicaklik3': record.sargiSicaklik3
    };
    
    Object.keys(inputMapping).forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input && inputMapping[inputId] !== undefined) {
            let value = inputMapping[inputId];
            if (typeof value === 'string' && value.includes(',')) {
                value = value.replace(',', '.');
            }
            input.value = value;
        }
    });
    
    // Durum seçeneğini ayarla
    const durumSelect = document.getElementById('duzenleDurum');
    if (durumSelect) {
        durumSelect.value = record.durum || 'NORMAL';
    }
    
    // Modal'ı göster
    document.getElementById('duzenleModal').style.display = 'block';
}

function closeDuzenleModal() {
    document.getElementById('duzenleModal').style.display = 'none';
    currentEditRecord = null;

    // Tüm input'ları temizle
    const inputIds = [
        'duzenleJenYatakSicaklikDE',
        'duzenleJenYatakSicaklikNDE',
        'duzenleSogutmaSuyuSicaklik',
        'duzenleSogutmaSuyuBasinc',
        'duzenleYagSicaklik',
        'duzenleYagBasinc',
        'duzenleSarjSicaklik',
        'duzenleSarjBasinc',
        'duzenleGazRegulatoru',
        'duzenleMakineDairesiSicaklik',
        'duzenleKarterBasinc',
        'duzenleOnKamaraFarkBasinc',
        'duzenleSargiSicaklik1',
        'duzenleSargiSicaklik2',
        'duzenleSargiSicaklik3',
        'duzenleNot'
    ];

    inputIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.value = '';
        }
    });

    // Durum select'ini varsayılan değere ayarla
    const durumSelect = document.getElementById('duzenleDurum');
    if (durumSelect) {
        durumSelect.value = 'NORMAL';
    }
}

async function handleDuzenleKaydet() {
    if (!currentEditRecord) return;
    
    const newData = {
        jenYatakSicaklikDE: document.getElementById('duzenleJenYatakSicaklikDE').value,
        jenYatakSicaklikNDE: document.getElementById('duzenleJenYatakSicaklikNDE').value,
        sogutmaSuyuSicaklik: document.getElementById('duzenleSogutmaSuyuSicaklik').value,
        sogutmaSuyuBasinc: document.getElementById('duzenleSogutmaSuyuBasinc').value,
        yagSicaklik: document.getElementById('duzenleYagSicaklik').value,
        yagBasinc: document.getElementById('duzenleYagBasinc').value,
        sarjSicaklik: document.getElementById('duzenleSarjSicaklik').value,
        sarjBasinc: document.getElementById('duzenleSarjBasinc').value,
        gazRegulatoru: document.getElementById('duzenleGazRegulatoru').value,
        makineDairesiSicaklik: document.getElementById('duzenleMakineDairesiSicaklik').value,
        karterBasinc: document.getElementById('duzenleKarterBasinc').value,
        onKamaraFarkBasinc: document.getElementById('duzenleOnKamaraFarkBasinc').value,
        sargiSicaklik1: document.getElementById('duzenleSargiSicaklik1').value,
        sargiSicaklik2: document.getElementById('duzenleSargiSicaklik2').value,
        sargiSicaklik3: document.getElementById('duzenleSargiSicaklik3').value,
        durum: document.getElementById('duzenleDurum').value
    };
    
    const kaydetBtn = document.querySelector('#duzenleModal .btn-primary');
    if (kaydetBtn) {
        kaydetBtn.disabled = true;
        kaydetBtn.textContent = 'KAYDEDİLİYOR...';
    }
    
    try {
        const updateData = {
            ...newData,
            motor: currentEditRecord.motor,
            tarih: currentEditRecord.tarih,
            vardiya: currentEditRecord.vardiya,
            saat: currentEditRecord.saat,
            kaydeden: getCurrentUserName()
        };
        
        // Eski kaydı log'a kaydet
        await logUpdate(currentEditRecord, newData);
        
        const result = await updateMotorRecord(updateData);
        
        if (result.success) {
            showMessage(`${currentEditRecord.motor} motoru ${currentEditRecord.saat} kaydı başarıyla güncellendi!`, 'success');
            
            // Vardiya tablosunu yeniden yükle
            await loadVardiyaData();
            
            // Modal'ı kapat
            closeDuzenleModal();
        } else {
            showMessage('Güncelleme hatası: ' + (result.error || 'Bilinmeyen hata'), 'error');
        }
    } catch (error) {
        console.error('Güncelleme hatası:', error);
        showMessage('Bağlantı hatası: ' + error.message, 'error');
    } finally {
        if (kaydetBtn) {
            kaydetBtn.disabled = false;
            kaydetBtn.textContent = '💾 KAYDET';
        }
    }
}

// 🔥 GÜNCELLEME LOG FONKSİYONU - DEVRE DIŞI
async function logUpdate(oldRecord, newRecord) {
    // Log fonksiyonu devre dışı - URL 404 veriyor
    console.log('Log kaydı (devre dışı):', oldRecord.motor, oldRecord.tarih, oldRecord.saat);
    return;
}


async function loadVardiyaData() {
    const vardiya = vardiyaSecimi.value;
    const tarih = tarihSecimi.value;
    const motor = selectedMotor; // Seçili motoru al
    
    if (!vardiya || !tarih || !motor) return;
    
    try {
        console.log(`📊 ${motor} motoru için ${tarih} tarih ${vardiya} vardiya verileri yükleniyor...`);
        console.log(`🔍 Parametreler: motor=${motor}, tarih=${tarih}, vardiya=${vardiya}`);
        
        // 🔥 ENERJİ VERİLERİNDEKİ GİBİ TÜM KAYITLARI ÇEK
        const result = await getMotorRecordsByMotorAndDate(motor, tarih);
        console.log(`📊 API sonucu:`, result);
        
        if (!result.success) {
            console.error('❌ Veriler yüklenemedi:', result.error);
            console.error('❌ Hata detayı:', JSON.stringify(result));
            return;
        }
        
        const allRecords = result.data || [];
        console.log(`📊 Toplam kayıt sayısı: ${allRecords ? allRecords.length : 0}`);
        
        // 🔥 TARİH VE VARDİYA FİLTRELEME (ENERJİ VERİLERİNDEKİ GİBİ)
        let searchTarih = tarih;
        if (searchTarih.includes('-')) { 
            const parts = searchTarih.split('-'); 
            searchTarih = `${parts[2]}.${parts[1]}.${parts[0]}`; 
        }
        
        console.log('🔍 Arama tarihi:', searchTarih);
        
        const filtered = allRecords.filter(r => {
            const matchTarih = (r.tarih || '') === searchTarih;
            const matchVardiya = kayitVardiyaAraligindaMi(r.saat || '', vardiya);
            const matchMotor = (r.motor || '') === motor;
            
            // Debug log
            if (!matchTarih || !matchVardiya || !matchMotor) {
                console.log(`🔍 Filtre - Kayıt:`, r.tarih, r.saat, r.motor, `| matchTarih:${matchTarih} matchVardiya:${matchVardiya} matchMotor:${matchMotor}`);
            }
            
            return matchTarih && matchVardiya && matchMotor;
        });
        
        console.log(`🔍 Filtrelenmiş kayıtlar:`, filtered);
        console.log(`🔍 Filtrelenmiş kayıt sayısı: ${filtered.length}`);
        
        // İlk 3 kayıt örneği
        if (allRecords.length > 0) {
            console.log(`🔍 İlk 3 kayıt örneği:`, allRecords.slice(0, 3).map(r => ({tarih: r.tarih, saat: r.saat, motor: r.motor})));
        }
        
        const tbody = document.getElementById('vardiyaTableBody');
        const noDataMessage = document.getElementById('noDataMessage');
        
        if (!tbody) {
            console.error('❌ vardiyaTableBody bulunamadı!');
            return;
        }
        
        // Mevcut satırları temizle
        tbody.innerHTML = '';
        
        if (noDataMessage) noDataMessage.style.display = 'none';
        
        // 🔥 VARDİYA SAAT ARALIĞINI GÜNCELLE
        const vardiyaAraliklari = {
            '08-16': { basla: '08:00', bit: '16:00' },
            '16-24': { basla: '16:00', bit: '24:00' },
            '24-08': { basla: '00:00', bit: '08:00' }
        };
        
        const aralik = vardiyaAraliklari[vardiya];
        const saatAraligiElement = document.getElementById('saatAraligi');
        const vardiyaBadgeElement = document.getElementById('vardiyaBadge');
        
        if (saatAraligiElement && aralik) {
            saatAraligiElement.textContent = `${aralik.basla} - ${aralik.bit}`;
        }
        
        if (vardiyaBadgeElement) {
            vardiyaBadgeElement.textContent = vardiya;
        }
        
        if (!filtered.length) { 
            if (noDataMessage) { 
                noDataMessage.textContent = `${motor} motoru için bu vardiya saat aralığında henüz kayıt bulunmamaktadır.`; 
                noDataMessage.style.display = 'block'; 
            }
            return;
        }
        
        // 🔥 SAATE GÖRE SIRALA
        filtered.sort((a, b) => (getSaatDegeri(a.saat) || 0) - (getSaatDegeri(b.saat) || 0));

        // 🔥 TABLOYU DOLDUR
        filtered.forEach(record => {
            const row = document.createElement('tr');
            if (record.durum === 'MOTOR ÇALIŞMIYOR') row.classList.add('motor-calismiyor');

            // Her kayıt kendi verisini gösterir
            let jenYatakSicaklikDE = record.jenYatakSicaklikDE || '-';
            let jenYatakSicaklikNDE = record.jenYatakSicaklikNDE || '-';
            let sogutmaSuyuSicaklik = record.sogutmaSuyuSicaklik || '-';
            let sogutmaSuyuBasinc = record.sogutmaSuyuBasinc || '-';
            let yagSicaklik = record.yagSicaklik || '-';
            let yagBasinc = record.yagBasinc || '-';
            let sarjSicaklik = record.sarjSicaklik || '-';
            let sarjBasinc = record.sarjBasinc || '-';
            let gazRegulatoru = record.gazRegulatoru || '-';
            let makineDairesiSicaklik = record.makineDairesiSicaklik || '-';
            let karterBasinc = record.karterBasinc || '-';
            let onKamaraFarkBasinc = record.onKamaraFarkBasinc || '-';
            let sargiSicaklik1 = record.sargiSicaklik1 || '-';
            let sargiSicaklik2 = record.sargiSicaklik2 || '-';
            let sargiSicaklik3 = record.sargiSicaklik3 || '-';

            row.innerHTML = `
                <td>${record.saat || '-'}</td>
                <td>${record.motor || '-'}</td>
                <td>${jenYatakSicaklikDE}</td>
                <td>${jenYatakSicaklikNDE}</td>
                <td>${sogutmaSuyuSicaklik}</td>
                <td>${sogutmaSuyuBasinc}</td>
                <td>${yagSicaklik}</td>
                <td>${yagBasinc}</td>
                <td>${sarjSicaklik}</td>
                <td>${sarjBasinc}</td>
                <td>${gazRegulatoru}</td>
                <td>${makineDairesiSicaklik}</td>
                <td>${karterBasinc}</td>
                <td>${onKamaraFarkBasinc}</td>
                <td>${sargiSicaklik1}</td>
                <td>${sargiSicaklik2}</td>
                <td>${sargiSicaklik3}</td>
                <td class="${record.durum === 'MOTOR ÇALIŞMIYOR' ? 'durum-calismiyor' : 'durum-normal'}">${record.durum === 'MOTOR ÇALIŞMIYOR' ? 'ÇALIŞMIYOR' : 'NORMAL'}</td>
                <td>
                    <button class="edit-btn" data-record='${JSON.stringify(record)}' style="padding: 4px 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">✏️ Düzenle</button>
                </td>
            `;
            
            // 🔥 DÜZENLE BUTONU TIKLAMA OLAYI - MODAL AÇ
            const editBtn = row.querySelector('.edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditModal(record);
                });
            }
            
            tbody.appendChild(row);
        });
        
        console.log(`✅ ${filtered.length} kayıt yüklendi`);
        
    } catch (error) {
        console.error('Vardiya verileri yüklenirken hata:', error);
    }
}


// � YARDIMCI FONKSİYONLAR (GLOBAL)
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

    // 16-24 vardiya için 24:00'yi de dahil et
    if (vardiya === '16-24') {
        return saatDegeri >= baslaDegeri && saatDegeri <= bitDegeri;
    }

    // 24-08 vardiya için özel mantık: 23:00 - 07:00
    if (vardiya === '24-08') {
        return saatDegeri >= 23 || saatDegeri < 7;
    }

    return saatDegeri >= baslaDegeri && saatDegeri < bitDegeri;
}

function getSaatDegeri(saat) {
    if (!saat) return 0;
    const [saatStr] = saat.split(':');
    return parseInt(saatStr) || 0;
}

function calculateVardiyaFromSaat(saat) {
    const saatDegeri = getSaatDegeri(saat);
    
    if (saatDegeri >= 8 && saatDegeri < 16) {
        return '08-16';
    } else if (saatDegeri >= 16 && saatDegeri < 24) {
        return '16-24';
    } else {
        return '24-08';
    }
}

// � ARKA PLAN KAYIT SİSTEMİ FONKSİYONLARI

// Kayıt kuyruğuna yeni işlem ekle
function kayitKuyrugunaEkle(kayitVerisi) {
    const islem = {
        id: ++islemSirasi,
        ...kayitVerisi,
        durum: 'beklemede',
        baslangicZamani: null,
        bitisZamani: null,
        hata: null
    };
    
    kayitKuyrugu.push(islem);
    console.log(`📝 Kayıt kuyruğa eklendi: #${islem.id} - ${islem.motor} - ${islem.saat}`);
    
    // Arka plan işlemi başlat
    if (!kayitIslemiDevamEdiyor) {
        arkaPlanKayitIsleminiBaslat();
    }
    
    return islem.id;
}

// Arka plan kayıt işlemini başlat
async function arkaPlanKayitIsleminiBaslat() {
    if (kayitIslemiDevamEdiyor || kayitKuyrugu.length === 0) {
        return;
    }
    
    kayitIslemiDevamEdiyor = true;
    console.log('🚀 Arka plan kayıt işlemi başlatıldı...');
    
    let successCount = 0;
    let errorCount = 0;
    
    while (kayitKuyrugu.length > 0) {
        // Bekleyen işlemleri al (max paralel)
        const yapilacakIslemler = kayitKuyrugu
            .filter(islem => islem.durum === 'beklemede')
            .slice(0, MAX_PARALEL_KAYIT);
        
        if (yapilacakIslemler.length === 0) {
            break;
        }
        
        console.log(`🔄 ${yapilacakIslemler.length} işlem sıralı başlatılıyor...`);
        console.log(`📊 İşlem saatleri:`, yapilacakIslemler.map(i => i.saat));
        
        // İşlemleri sıralı çalıştır (saat sırası korunur)
        for (const islem of yapilacakIslemler) {
            try {
                console.log(`🔄 İşlem başlatılıyor: #${islem.id} - ${islem.motor} - ${islem.saat}`);
                const sonuc = await tekilKayitYap(islem);
                
                if (sonuc.status === 'success') {
                    islem.durum = 'basarili';
                    islem.bitisZamani = new Date();
                    successCount++;
                    console.log(`✅ İşlem tamamlandı: #${islem.id} - ${islem.motor} - ${islem.saat}`);
                } else {
                    islem.durum = 'hatali';
                    islem.bitisZamani = new Date();
                    islem.hata = sonuc.error || 'Bilinmeyen hata';
                    errorCount++;
                    console.log(`❌ İşlem hatalı: #${islem.id} - ${islem.motor} - ${islem.saat} - ${islem.hata}`);
                }
            } catch (error) {
                islem.durum = 'hatali';
                islem.bitisZamani = new Date();
                islem.hata = error.message;
                errorCount++;
                console.log(`💀 İşlem hatası: #${islem.id} - ${islem.motor} - ${islem.saat} - ${error.message}`);
            }
        }
        
        // Tamamlanan işlemleri kuyruktan temizle
        kayitKuyrugu = kayitKuyrugu.filter(islem => islem.durum === 'beklemede');
        
        // Kısa bekleme (API limitleri için)
        if (kayitKuyrugu.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
    
    kayitIslemiDevamEdiyor = false;
    console.log('🏁 Arka plan kayıt işlemi tamamlandı');
    console.log(`📊 Sonuç: ${successCount} başarılı, ${errorCount} hatalı`);
    
    // Verileri yenile
    loadVardiyaData();
}

// Tekil kayıt yap
async function tekilKayitYap(islem) {
    islem.durum = 'isleniyor';
    islem.baslangicZamani = Date.now();
    
    try {
        const sonuc = await saveMotorToSheets({
            motor: islem.motor,
            tarih: islem.tarih,
            vardiya: islem.vardiya,
            saat: islem.saat,
            kaydeden: islem.kaydeden,
            durum: 'MOTOR ÇALIŞMIYOR',
            not: islem.not,
            // Son kayıt değerleri (doğru alanlar)
            jenYatakSicaklikDE: islem.sonKayit?.jenYatakSicaklikDE || '0',
            jenYatakSicaklikNDE: islem.sonKayit?.jenYatakSicaklikNDE || '0',
            sogutmaSuyuSicaklik: islem.sonKayit?.sogutmaSuyuSicaklik || '0',
            sogutmaSuyuBasinc: islem.sonKayit?.sogutmaSuyuBasinc || '0',
            yagSicaklik: islem.sonKayit?.yagSicaklik || '0',
            yagBasinc: islem.sonKayit?.yagBasinc || '0',
            sarjSicaklik: islem.sonKayit?.sarjSicaklik || '0',
            sarjBasinc: islem.sonKayit?.sarjBasinc || '0',
            gazRegulatoru: islem.sonKayit?.gazRegulatoru || '0',
            makineDairesiSicaklik: islem.sonKayit?.makineDairesiSicaklik || '0',
            karterBasinc: islem.sonKayit?.karterBasinc || '0',
            onKamaraFarkBasinc: islem.sonKayit?.onKamaraFarkBasinc || '0',
            sargiSicaklik1: islem.sonKayit?.sargiSicaklik1 || '0',
            sargiSicaklik2: islem.sonKayit?.sargiSicaklik2 || '0',
            sargiSicaklik3: islem.sonKayit?.sargiSicaklik3 || '0'
        });
        
        if (!sonuc || !sonuc.success) {
            throw new Error(sonuc?.error || 'Kayıt başarısız');
        }
        
        return { success: true, islem };
        
    } catch (error) {
        console.error(`Tekil kayıt hatası #${islem.id}:`, error);
        throw error;
    }
}

// Kayıt durumunu göster
function kayitDurumunuGoster() {
    const bekleyen = kayitKuyrugu.filter(i => i.durum === 'beklemede').length;
    const islenen = kayitKuyrugu.filter(i => i.durum === 'isleniyor').length;
    const tamamlanan = kayitKuyrugu.filter(i => i.durum === 'tamamlandi').length;
    const hatali = kayitKuyrugu.filter(i => i.durum === 'hata').length;
    
    if (bekleyen > 0 || islenen > 0) {
        showMessage(`📊 Kayıt durumu: ${bekleyen} bekleyen, ${islenen} işleniyor, ${tamamlanan} tamamlandı, ${hatali} hatalı`, 'info');
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
        
        console.log('Kojen Motor Veri - Kullanici adi ayarlandi:', fullName || user.email || 'Kullanici');
    } catch (e) {
        console.error('Kojen Motor Veri - Kullanici bilgileri okunamadi:', e);
        const allElements = document.querySelectorAll('[id="userNameDisplay"]');
        allElements.forEach(element => {
            element.textContent = 'Kullanici';
        });
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Önce kimlik dogrulama kontrolü
    checkAuth();
    
    // 🔥 ENERJİ VERİ SAYFASINDAN GELEN YÖNLENDİRME KONTROLÜ
    const redirectMotor = localStorage.getItem('redirectMotor');
    const redirectFrom = localStorage.getItem('redirectFrom');
    
    if (redirectFrom === 'enerji-veri' && redirectMotor) {
        console.log(`🔥 Enerji veri sayfasından yönlendirme: ${redirectMotor}`);
        // Motor seçimi daha sonra yapılacak, localStorage'dan temizle
        localStorage.removeItem('redirectMotor');
        localStorage.removeItem('redirectFrom');
    }
    
    // 🔥 Vardiya verileri bölümünü göster
    showVardiyaVerileriSection();
    
    // Elementleri seç
    const tarihSecimi = document.getElementById('tarihSecimi');
    const vardiyaSecimi = document.getElementById('vardiyaSecimi');
    const currentHourElement = document.getElementById('currentHour');
    
    // Motor seçim butonları
    const motorButtons = document.querySelectorAll('.motor-btn');
    
    // Butonlar
    const kaydetBtn = document.getElementById('kaydetBtn');
    const temizleBtn = document.getElementById('temizleBtn');
    const motorCalismiyorKaydetBtn = document.getElementById('motorCalismiyorKaydetBtn');
    
    // Çıkış butonları
    const sidebarLogout = document.getElementById('sidebarLogout');
    const headerLogout = document.getElementById('headerLogout');

    // Form kilit durumu
    let isLocked = false; // Form kilit durumu

    // 🔥 GLOBAL MOTOR DEĞİŞKENİ - Yönlendirme varsa onu kullan
    selectedMotor = redirectMotor || 'GM-1';

    // 🔥 DÜZENLEME MODAL KAYDET BUTONU
    const editModalKaydetBtn = document.getElementById('editModalKaydetBtn');
    if (editModalKaydetBtn) {
        editModalKaydetBtn.addEventListener('click', saveEditModal);
    }

    // 🔒 TÜM FORM ELEMANLARINI PASİF YAP
    function disableAllFormElements() {
        console.log('🔒 Form pasif yapılıyor...');
        
        const allInputs = document.querySelectorAll('.data-input');
        allInputs.forEach(input => {
            input.disabled = true;
            input.style.background = '#f5f5f5';
            input.style.cursor = 'not-allowed';
        });
        
        const buttons = [kaydetBtn, temizleBtn];
        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        });
        
        if (motorCalismiyorKaydetBtn) {
            motorCalismiyorKaydetBtn.disabled = false;
            motorCalismiyorKaydetBtn.style.opacity = '1';
            motorCalismiyorKaydetBtn.style.cursor = 'pointer';
        }
        
        motorButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
    }
    
    // � TÜM FORM ELEMANLARINI AKTİF YAP
    function enableAllFormElements() {
        console.log('🔓 Form aktif yapılıyor...');
        
        const allInputs = document.querySelectorAll('.data-input');
        allInputs.forEach(input => {
            input.disabled = false;
            input.style.background = 'white';
            input.style.cursor = 'text';
        });
        
        const buttons = [kaydetBtn, temizleBtn, motorCalismiyorKaydetBtn];
        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        });
        
        motorButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
        
        showMessage('Yeni kayıt yapabilirsiniz.', 'success');
    }

    // �🔒 BAŞLANGIÇTA TÜM FORM PASİF YAP
    disableAllFormElements();
    
    // ⚡ CACHE BAŞLAT - DEVRE DIŞI
    // setTimeout(() => refreshCache(), 100);

    // 🔍 1 SN SONRA KAYIT KONTROLÜ VE AÇ/KİLİTLE
    setTimeout(async () => {
        await checkAndUnlockOrLockForm();
    }, 1000);

    // Klavye ile yazma sırasında büyük tablo render'ları ve arka-plan işlemlerini azaltmak için
    // typing mode handlers ekle (focus/blur).
    let typingModeTimer = null;
    window.isUserTyping = false;

    function enableTypingMode() {
        if (typingModeTimer) { clearTimeout(typingModeTimer); typingModeTimer = null; }
        window.isUserTyping = true;
        // Büyük tabloları gizle (reflow maliyetini azaltır)
        const vardiyaTable = document.getElementById('vardiyaTable');
        const kojenBody = document.getElementById('kojen-table-body');
        if (vardiyaTable) vardiyaTable.style.display = 'none';
        if (kojenBody) kojenBody.style.display = 'none';
    }

    function disableTypingMode() {
        if (typingModeTimer) clearTimeout(typingModeTimer);
        typingModeTimer = setTimeout(() => {
            window.isUserTyping = false;
            const vardiyaTable = document.getElementById('vardiyaTable');
            const kojenBody = document.getElementById('kojen-table-body');
            if (vardiyaTable) vardiyaTable.style.display = '';
            if (kojenBody) kojenBody.style.display = '';
            // Kullanıcı yazmayı bitirdikten sonra form durumunu yeniden kontrol et
            // Daha uzun gecikme ile performans için
            try { 
                setTimeout(() => {
                    checkAndUpdateFormStatus(); 
                }, 100);
            } catch (e) { /* ignore */ }
        }, 1200);
    }

    // Tüm input'lara odak/blur listener ekle
    document.querySelectorAll('.data-input').forEach(inp => {
        inp.addEventListener('focus', enableTypingMode);
        inp.addEventListener('blur', disableTypingMode);
        
        // Input event'i için debounce ekle
        let inputDebounce = null;
        inp.addEventListener('input', function() {
            // Yazma sırasında tabloları gizle
            if (!window.isUserTyping) {
                enableTypingMode();
            }
            
            // Debounce: Kullanıcı yazmayı bitirdikten 300ms sonra kontrol et
            if (inputDebounce) clearTimeout(inputDebounce);
            inputDebounce = setTimeout(() => {
                disableTypingMode();
            }, 300);
        });
    });

    // Mevcut saati güncelleme fonksiyonu
    function updateCurrentHour() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        currentHourElement.textContent = `${hours}:00`;
    }

    // ⚡ SUPER HIZLI Local cache için kayıt verileri
    // Global cache degiskenleri kullanilir.
    
    // 🔥 Memory Map için ultra hızlı arama
    // recordMap global olarak tanimlidir.
    
    // ⚡ Background cache yenileme timer
    let cacheRefreshTimer = null;

    
    // ⚡ Background cache yenileme - sessizce günceller
    function startBackgroundRefresh() {
        if (cacheRefreshTimer) {
            clearInterval(cacheRefreshTimer);
        }
        
        // 4 dakikada bir sessizce yenile
        cacheRefreshTimer = setInterval(async () => {
            try {
                const result = await getLastMotorRecords(150);
                if (result.success) {
                    cachedRecords = result.data || [];
                    recordMap.clear();
                    
                    cachedRecords.forEach(record => {
                        const mapKey = `${record.motor}|${normalizeMotorDateForCache(record.tarih)}|${normalizeMotorSaatForCache(record.saat)}`;
                        recordMap.set(mapKey, record);
                    });
                    
                    cacheTimestamp = Date.now();
                    console.log('🔄 Background cache güncellendi:', result.data.length, 'kayıt');
                }
            } catch (error) {
                console.error('Background cache hatası:', error);
            }
        }, 240000); // 4 dakika
    }

    // � VARDİYA VERİLERİ BÖLÜMÜNÜ GÖSTER
    function showVardiyaVerileriSection() {
        const vardiyaVerileriSection = document.getElementById('vardiyaVerileriSection');
        if (vardiyaVerileriSection) {
            vardiyaVerileriSection.style.display = 'block';
        }
    }

    // 🔍 KAYIT KONTROLÜ SONRASI AÇ/KİLİTLE MANTIĞI
    async function checkAndUnlockOrLockForm() {
        if (!selectedMotor || !tarihSecimi?.value || !currentHourElement?.textContent) {
            console.log('Kontrol: Eksik parametre');
            enableAllFormElements(); // Eksikse yine de aç
            return;
        }
        
        try {
            const saat = currentHourElement.textContent.trim();
            const existingRecord = await checkExistingRecord(selectedMotor, tarihSecimi.value, saat);
            
            if (existingRecord) {
                // 🔒 KAYIT VAR - Form kilitli kalır, veriler yüklenir
                console.log('🔒 Kayıt bulundu, form kilitli:', existingRecord);
                lockForm(false);
                loadExistingRecord(existingRecord);
                showMessage(`Mevcut kayıt yüklendi: ${existingRecord.durum || 'NORMAL'}`, 'info');
            } else {
                // 🔓 KAYIT YOK - Form açılır
                console.log('🔓 Kayıt yok, form açılıyor');
                enableAllFormElements();
            }
        } catch (error) {
            console.error('Kontrol hatası:', error);
            enableAllFormElements(); // Hata durumunda yine de aç
        }
    }

    // Tarih formatını düzeltme fonksiyonu (HTML input için)
    function formatTarihForInput(tarihStr) {
        // DD.MM.YYYY formatını YYYY-MM-DD formatına çevir
        if (tarihStr && tarihStr.includes('.')) {
            const parts = tarihStr.split('.');
            if (parts.length === 3) {
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
        }
        return tarihStr;
    }

    // Tarih formatını düzeltme fonksiyonu (gösterim için)
    function formatTarihForDisplay(tarihStr) {
        // YYYY-MM-DD formatını DD.MM.YYYY formatına çevir
        if (tarihStr && tarihStr.includes('-')) {
            const parts = tarihStr.split('-');
            if (parts.length === 3) {
                return `${parts[2]}.${parts[1]}.${parts[0]}`;
            }
        }
        return tarihStr;
    }

    // Otomatik tarih formatlama (nokta ekleme)
    function autoFormatTarih(input) {
        let value = input.value.replace(/\D/g, ''); // Sadece rakamları al
        let formattedValue = '';
        
        if (value.length >= 2) {
            formattedValue = value.substring(0, 2);
            if (value.length >= 4) {
                formattedValue += '.' + value.substring(2, 4);
                if (value.length >= 8) {
                    formattedValue += '.' + value.substring(4, 8);
                } else {
                    formattedValue += '.' + value.substring(4);
                }
            } else {
                formattedValue += '.' + value.substring(2);
            }
        } else {
            formattedValue = value;
        }
        
        input.value = formattedValue;
    }

    // Tarih validasyonu
    function validateTarih(tarihStr) {
        const regex = /^\d{2}\.\d{2}\.\d{4}$/;
        if (!regex.test(tarihStr)) return false;
        
        const parts = tarihStr.split('.');
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        if (day < 1 || day > 31) return false;
        if (month < 1 || month > 12) return false;
        if (year < 1900 || year > 2100) return false;
        
        return true;
    }

    // ⚡ HIZLI Form kilitleme fonksiyonu
    function lockForm(showMessageFlag = true) {
        isLocked = true;
        
        // 🔥 Input'ları batch kilitle - daha hızlı
        const allInputs = document.querySelectorAll('.data-input');
        const calismiyorInputs = [];
        const normalInputs = [];
        
        allInputs.forEach(input => {
            input.disabled = true;
            input.style.cursor = 'not-allowed';
            
            if (input.getAttribute('data-calismiyor') === 'true') {
                calismiyorInputs.push(input);
            } else {
                normalInputs.push(input);
            }
        });
        
        // 🔥 Batch style güncelleme - daha performanslı
        if (calismiyorInputs.length > 0) {
            calismiyorInputs.forEach(input => {
                input.style.background = '#ffebee';
                input.style.color = '#c62828';
            });
        }
        
        if (normalInputs.length > 0) {
            normalInputs.forEach(input => {
                input.style.background = '#f8f9fa';
            });
        }
        
        // ⚡ Butonları hızlıca kilitle (AMA MOTOR SEÇİM BUTONLARINI AKTIF TUT)
        const buttons = [kaydetBtn, temizleBtn, motorCalismiyorKaydetBtn];
        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            }
        });
        if (motorCalismiyorKaydetBtn) {
            motorCalismiyorKaydetBtn.style.opacity = '0.5';
            motorCalismiyorKaydetBtn.style.cursor = 'not-allowed';
        }
        
        // 🔥 MOTOR SEÇİM BUTONLARINI HER ZAMAN AKTIF TUT
        motorButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });
        
        // Sadece istendiğinde mesaj göster
        if (showMessageFlag) {
            showMessage('Bu tarih ve saat için kayıt zaten mevcut! Form kilitlendi.', 'error');
        }
    }

    // ⚡ HIZLI Form kilidini açma fonksiyonu
    function unlockForm() {
        isLocked = false;
        
        // 🔥 Input'ların kilidini batch aç
        const allInputs = document.querySelectorAll('.data-input');
        allInputs.forEach(input => {
            input.disabled = false;
            input.removeAttribute('data-calismiyor');
            input.style.background = 'white';
            input.style.color = '';
            input.style.cursor = 'text';
        });
        
        // ⚡ Butonların kilidini hızlıca aç
        const buttons = [kaydetBtn, temizleBtn, motorCalismiyorKaydetBtn];
        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        });
        
        // 🔥 Motor seçim butonlarının kilidini aç
        motorButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.cursor = 'pointer';
        });
    }

    // 🔥 HIZLI Kayıt kontrolü ve form durumunu güncelleme - Cache ile
    async function checkAndUpdateFormStatus() {
        // Eğer kullanıcı şu an bir input üzerinde yazıyorsa (tablet klavye), ağır kontrol işlemlerini atla
        try {
            const active = document.activeElement;
            if (active && active.classList && (active.classList.contains('data-input') || active.classList.contains('kojen-input'))) {
                // Kullanıcı yazıyor, kontrolü atla
                // console.log('checkAndUpdateFormStatus: input odaklıyken atlandı');
                return;
            }
        } catch (e) {
            // ignore
        }

        if (!selectedMotor || !tarihSecimi.value || !currentHourElement.textContent) {
            console.log('Form durumu: Eksik parametre', { selectedMotor, tarih: tarihSecimi.value, saat: currentHourElement.textContent });
            return;
        }

        console.log('🔥 Hızlı kayıt kontrolü yapılıyor:', { motor: selectedMotor, tarih: tarihSecimi.value, saat: currentHourElement.textContent });

        try {
            // ⚡ Önce cache'den kontrol et (devre dışı)
            const existingRecord = await checkExistingRecord(selectedMotor, tarihSecimi.value, currentHourElement.textContent);

            if (existingRecord) {
                console.log('🔥 Kayıt bulundu, form kilitleniyor:', existingRecord);
                lockForm(false);
                loadExistingRecord(existingRecord);
                return;
            }

            console.log('🔥 Kayıt bulunamadı, form açılıyor');
            unlockForm();
        } catch (error) {
            console.error('Form durumu güncelleme hatası:', error);
            unlockForm();
        }
    }

    // 🔥 Mevcut kaydı input'lara yükleme fonksiyonu
    function loadExistingRecord(existingRecord) {
        if (existingRecord.durum === 'MOTOR ÇALIŞMIYOR') {
            const allInputs = document.querySelectorAll('.data-input');
            allInputs.forEach(input => {
                input.value = '0';
                input.style.background = '#ffebee';
                input.style.color = '#c62828';
                input.setAttribute('data-calismiyor', 'true');
            });
        } else {
            // Normal verileri input'lara yükle - virgülü noktaya çevir
            document.getElementById('jenYatakSicaklikDE').value = (existingRecord.jenYatakSicaklikDE || '').replace(',', '.');
            document.getElementById('jenYatakSicaklikNDE').value = (existingRecord.jenYatakSicaklikNDE || '').replace(',', '.');
            document.getElementById('sogutmaSuyuSicaklik').value = (existingRecord.sogutmaSuyuSicaklik || '').replace(',', '.');
            document.getElementById('sogutmaSuyuBasinc').value = (existingRecord.sogutmaSuyuBasinc || '').replace(',', '.');
            document.getElementById('yagSicaklik').value = (existingRecord.yagSicaklik || '').replace(',', '.');
            document.getElementById('yagBasinc').value = (existingRecord.yagBasinc || '').replace(',', '.');
            document.getElementById('sarjSicaklik').value = (existingRecord.sarjSicaklik || '').replace(',', '.');
            document.getElementById('sarjBasinc').value = (existingRecord.sarjBasinc || '').replace(',', '.');
            document.getElementById('gazRegulatoru').value = (existingRecord.gazRegulatoru || '').replace(',', '.');
            document.getElementById('makineDairesiSicaklik').value = (existingRecord.makineDairesiSicaklik || '').replace(',', '.');
            document.getElementById('karterBasinc').value = (existingRecord.karterBasinc || '').replace(',', '.');
            document.getElementById('onKamaraFarkBasinc').value = (existingRecord.onKamaraFarkBasinc || '').replace(',', '.');
            document.getElementById('sargiSicaklik1').value = (existingRecord.sargiSicaklik1 || '').replace(',', '.');
            document.getElementById('sargiSicaklik2').value = (existingRecord.sargiSicaklik2 || '').replace(',', '.');
            document.getElementById('sargiSicaklik3').value = (existingRecord.sargiSicaklik3 || '').replace(',', '.');
            
            const allInputs = document.querySelectorAll('.data-input');
            allInputs.forEach(input => {
                input.removeAttribute('data-calismiyor');
                input.style.background = 'white';
                input.style.color = '';
            });
        }
    }

    // Motor butonu event listener'ları - Async güncelleme
    motorButtons.forEach(button => {
        button.addEventListener('click', async function() {
            // Active class'ını kaldır
            motorButtons.forEach(btn => btn.classList.remove('active'));
            // Tıklanana active class'ını ekle
            this.classList.add('active');
            // Seçili motoru güncelle
            selectedMotor = this.dataset.motor;
            
            // 🔥 TÜM INPUT'LARI TEMİZLE
            const allInputs = document.querySelectorAll('.data-input');
            allInputs.forEach(input => {
                input.value = '';
                input.style.background = 'white';
                input.style.color = '';
                input.removeAttribute('data-calismiyor');
                input.disabled = false;
            });
            
            // 🔥 VARDİYA TABLOSUNU SIFIRLA
            const tbody = document.getElementById('vardiyaTableBody');
            if (tbody) {
                tbody.innerHTML = '';
            }
            const noDataMessage = document.getElementById('noDataMessage');
            if (noDataMessage) {
                noDataMessage.style.display = 'block';
            }
            
            showMessage(`${selectedMotor} motoru seçildi!`, 'info');
            
            // Vardiya verilerini güncelle (seçili motor için)
            await loadVardiyaData();
            
            // Kayıt kontrolü yap (form durumunu güncelle)
            await checkAndUpdateFormStatus();
            
            // 🔥 KONTROL SONRASI INPUT'LARI TEKRAR AKTIF ET
            allInputs.forEach(input => {
                input.disabled = false;
                input.style.background = 'white';
                input.style.color = '';
            });
        });
    });

    // KAYDET butonu - Google Sheets'e kaydeder
    kaydetBtn.addEventListener('click', async function() {
        if (isLocked) {
            showMessage('Bu kayıt zaten mevcut!', 'error');
            return;
        }
        
        const data = getAllInputValues();
        
        if (!data.motor || !data.tarih) {
            showMessage('Lütfen motor ve tarih seçin!', 'error');
            return;
        }
        
        // Vardiya otomatik hesaplanacak
        if (!data.vardiya) {
            data.vardiya = calculateVardiyaFromSaat(data.saat);
        }
        
        // Tüm input'ların dolu olup olmadığını kontrol et
        const allInputs = document.querySelectorAll('.data-input');
        const emptyInputs = Array.from(allInputs).filter(input => !input.value);
        
        if (emptyInputs.length > 0) {
            showMessage('Lütfen tüm veri alanlarını doldurun!', 'error');
            return;
        }
        
        // Negatif değer kontrolü - Karter Basıncı ve Ön Kamara Fark Basıncı
        const karterBasinc = parseFloat(document.getElementById('karterBasinc').value);
        const onKamaraFarkBasinc = parseFloat(document.getElementById('onKamaraFarkBasinc').value);
        
        if (karterBasinc >= 0) {
            const onay = confirm(`Karter basıncı pozitif değer girildi (${karterBasinc}).\n\nNegatif olması bekleniyor. Yine de pozitif değeri kaydetmek istiyor musunuz?`);
            if (!onay) {
                document.getElementById('karterBasinc').value = -Math.abs(karterBasinc);
                showMessage('Karter basıncı otomatik olarak negatife çevrildi: ' + (-Math.abs(karterBasinc)), 'info');
                document.getElementById('karterBasinc').focus();
                return;
            }
        }
        
        if (onKamaraFarkBasinc >= 0) {
            const onay = confirm(`Ön kamara fark basıncı pozitif değer girildi (${onKamaraFarkBasinc}).\n\nNegatif olması bekleniyor. Yine de pozitif değeri kaydetmek istiyor musunuz?`);
            if (!onay) {
                document.getElementById('onKamaraFarkBasinc').value = -Math.abs(onKamaraFarkBasinc);
                showMessage('Ön kamara fark basıncı otomatik olarak negatife çevrildi: ' + (-Math.abs(onKamaraFarkBasinc)), 'info');
                document.getElementById('onKamaraFarkBasinc').focus();
                return;
            }
        }
        
        let stopKaydetTimer = null;
        let kaydetTimerStatus = 'tamamlandi';

        try {
            // 🔒 ÇİFT KAYIT KONTROLÜ - Cache devre dışı, sadece canlı kontrol
            kaydetBtn.disabled = true;
            kaydetBtn.textContent = 'KONTROL EDILIYOR...';

            // Canli kayit kontrolu: Google Sheets'ten kontrol et
            const liveCheck = await checkExistingMotorRecord(data.motor, data.tarih, data.saat);
            if (!liveCheck.success) {
                kaydetTimerStatus = `kontrol hatasi: ${liveCheck.error || 'Bilinmeyen hata'}`;
                showMessage('Kayit kontrolu yapilamadi: ' + (liveCheck.error || 'Bilinmeyen hata'), 'error');
                return;
            }

            if (liveCheck.exists) {
                if (liveCheck.record) {
                    rememberMotorRecord(liveCheck.record);
                    loadExistingRecord(liveCheck.record);
                }
                lockForm(false);
                showMessage(`Bu tarih, saat ve motor (${data.motor}) icin kayit zaten var!\nMevcut kayit: ${(liveCheck.record && liveCheck.record.durum) || 'NORMAL'}`, 'error');
                return;
            }

            stopKaydetTimer = startConsoleDurationTimer(`Kojen motor kaydet ${data.motor} ${data.tarih} ${data.saat}`);
            kaydetBtn.textContent = '💾 KAYDEDİLİYOR...';
            
            // Google Sheets'e kaydet
            const sheetsData = {
                ...data.veriler,
                motor: data.motor,
                tarih: data.tarih,
                vardiya: data.vardiya,
                saat: data.saat,
                kaydeden: getCurrentUserName(),
                durum: 'NORMAL'
            };
            
            const apiStartedAt = performance.now();
            const result = await saveMotorToSheets(sheetsData);
            const clientDuration = ((performance.now() - apiStartedAt) / 1000).toFixed(2);
            const serverDuration = typeof result.durationMs === 'number'
                ? `, sunucu ${(result.durationMs / 1000).toFixed(2)} sn`
                : '';
            console.log(`[Kojen motor addRecord] ${clientDuration} sn${serverDuration}`);
            
            if (result.success) {
                kaydetTimerStatus = 'basarili';
                console.log('Google Sheets kaydı:', result);
                
                // Sadece Google Sheets'ten dönen gerçek kaydı cache'e ekle
                if (result.record) {
                    rememberMotorRecord(result.record);
                }
                
                // Cache devre dışı - refresh çağrısı kaldırıldı
                
                // Pozitif değer kaydetme kontrolü
                const pozitifMesajlar = [];
                if (karterBasinc >= 0) {
                    pozitifMesajlar.push(`Karter basıncı: ${karterBasinc} (pozitif)`);
                }
                if (onKamaraFarkBasinc >= 0) {
                    pozitifMesajlar.push(`Ön kamara fark basıncı: ${onKamaraFarkBasinc} (pozitif)`);
                }
                
                if (pozitifMesajlar.length > 0) {
                    showMessage(`${data.motor} motoru için veriler kaydedildi! Pozitif değerler: ${pozitifMesajlar.join(', ')}`, 'warning');
                } else {
                    showMessage(`${data.motor} motoru için veriler başarıyla kaydedildi!`, 'success');
                }
                
                // Formu kilitle (mesaj göstermeden)
                lockForm(false);
                
                // 🔥 OTOMATİK ENERJİ VERİ SAYFASINA YÖNLENDİRME
                setTimeout(async () => {
                    await redirectToEnerjiVeri(data.motor);
                }, 500);
            } else {
                kaydetTimerStatus = `hata: ${result.error || 'Bilinmeyen hata'}`;
                showMessage('Kayıt hatası: ' + (result.error || 'Bilinmeyen hata'), 'error');
            }
        } catch (error) {
            kaydetTimerStatus = `hata: ${error.message || error}`;
            console.error('Kayıt hatası:', error);
            showMessage('Bağlantı hatası: ' + error.message, 'error');
        } finally {
            if (stopKaydetTimer) {
                stopKaydetTimer(kaydetTimerStatus);
            }
            // Kaydet butonunu geri aktif et
            if (!isLocked) {
                kaydetBtn.disabled = false;
            }
            kaydetBtn.textContent = '💾 KAYDET';
        }
    });

    // 🔥 AKILLI ENERJİ VERİ SAYFASINA YÖNLENDİRME FONKSİYONU
    async function redirectToEnerjiVeri(motor) {
        const tarih = document.getElementById('tarihSecimi').value;
        const saat = document.getElementById('currentHour').textContent;
        
        // Enerji kaydı kontrolü
        const enerjiKayitVar = await checkExistingEnerjiRecord(motor, tarih, saat);
        
        if (enerjiKayitVar && enerjiKayitVar.exists) {
            // Enerji kaydı varsa, sonraki motorun enerji sayfasına geç
            const motorOrder = ['GM-1', 'GM-2', 'GM-3'];
            const currentIndex = motorOrder.indexOf(motor);
            
            if (currentIndex < motorOrder.length - 1) {
                const nextMotor = motorOrder[currentIndex + 1];
                localStorage.setItem('redirectMotor', nextMotor);
                localStorage.setItem('redirectFrom', 'motor-veri');
                showMessage(`${motor} enerji kaydı zaten var. ${nextMotor} enerji sayfasına geçiliyor...`, 'info');
                window.location.href = 'kojen-enerji-veri.html';
            } else {
                // Son motor ise aynı motorun enerji sayfasına yönlendir
                localStorage.setItem('redirectMotor', motor);
                localStorage.setItem('redirectFrom', 'motor-veri');
                window.location.href = 'kojen-enerji-veri.html';
            }
        } else {
            // Enerji kaydı yoksa, enerji sayfasına yönlendir
            localStorage.setItem('redirectMotor', motor);
            localStorage.setItem('redirectFrom', 'motor-veri');
            window.location.href = 'kojen-enerji-veri.html';
        }
    }

    // 🔥 SONRAKİ MOTORA OTOMATİK GEÇİŞ FONKSİYONU
    function moveToNextMotor(currentMotor) {
        const motorOrder = ['GM-1', 'GM-2', 'GM-3'];
        const currentIndex = motorOrder.indexOf(currentMotor);
        
        if (currentIndex < motorOrder.length - 1) {
            // Sonraki motora geç
            const nextMotor = motorOrder[currentIndex + 1];
            const nextButton = document.querySelector(`[data-motor="${nextMotor}"]`);
            
            if (nextButton) {
                // 🔥 FORM KİLİDİNİ AÇ
                isLocked = false;
                
                // 🔥 TÜM INPUT'LARI TEMİZLE
                const allInputs = document.querySelectorAll('.data-input');
                allInputs.forEach(input => {
                    input.value = '';
                    input.style.background = 'white';
                    input.style.color = '';
                    input.removeAttribute('data-calismiyor');
                    input.disabled = false;
                });
                
                // 🔥 BUTONLARI AKTİF ET
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
                
                // Active class'ını kaldır
                motorButtons.forEach(btn => btn.classList.remove('active'));
                // Yeni motora active class'ını ekle
                nextButton.classList.add('active');
                // Seçili motoru güncelle
                selectedMotor = nextMotor;
                
                // 🔥 VARDİYA TABLOSUNU SIFIRLA
                const tbody = document.getElementById('vardiyaTableBody');
                if (tbody) {
                    tbody.innerHTML = '';
                }
                const noDataMessage = document.getElementById('noDataMessage');
                if (noDataMessage) {
                    noDataMessage.style.display = 'block';
                }
                
                showMessage(`Otomatik geçiş: ${nextMotor} motoru seçildi!`, 'info');
                
                // Vardiya verilerini güncelle
                setTimeout(() => {
                    loadVardiyaData();
                    
                    // 🔥 FORM DURUMUNU KONTROL ET AMA BUTONLARI AKTIF TUT
                    setTimeout(() => {
                        checkAndUpdateFormStatus();
                        
                        // 🔥 KONTROL SONRASI BUTONLARI TEKRAR AKTIF ET
                        motorButtons.forEach(btn => {
                            btn.disabled = false;
                            btn.style.opacity = '1';
                            btn.style.cursor = 'pointer';
                        });
                        
                        const buttons = [kaydetBtn, temizleBtn, motorCalismiyorKaydetBtn];
                        buttons.forEach(btn => {
                            if (btn) {
                                btn.disabled = false;
                                btn.style.opacity = '1';
                                btn.style.cursor = 'pointer';
                            }
                        });
                    }, 500);
                }, 300);
            }
        } else {
            // Son motor ise bildir
            showMessage('Tüm motorlar için kayıt tamamlandı!', 'success');
        }
    }

    // TEMİZLE butonu
    temizleBtn.addEventListener('click', function() {
        if (isLocked) {
            showMessage('Form kilitli! Kayıt silinemez.', 'error');
            return;
        }
        
        
        // Tüm input'ları temizle
        const allInputs = document.querySelectorAll('.data-input');
        allInputs.forEach(input => input.value = '');
        
        showMessage('Tüm veriler temizlendi!', 'info');
    });

    // MOTOR ÇALIŞMIYOR KAYDET butonu - Google Sheets'e kaydeder
    motorCalismiyorKaydetBtn.addEventListener('click', async function() {
        if (isLocked) {
            showMessage('Bu kayıt zaten mevcut!', 'error');
            return;
        }
        
        const data = getAllInputValues();
        
        if (!data.motor || !data.tarih) {
            showMessage('Lütfen motor ve tarih seçin!', 'error');
            return;
        }
        
        // Vardiya otomatik hesaplanacak
        if (!data.vardiya) {
            data.vardiya = calculateVardiyaFromSaat(data.saat);
        }
        
        let stopKaydetTimer = null;
        let kaydetTimerStatus = 'tamamlandi';

        try {
            // 🔒 ÇİFT KAYIT KONTROLÜ - Cache devre dışı, sadece canlı kontrol
            // Butonu devre dışı bırak
            motorCalismiyorKaydetBtn.disabled = true;
            motorCalismiyorKaydetBtn.textContent = '⚠️ KAYDEDİLİYOR...';
            stopKaydetTimer = startConsoleDurationTimer(`Kojen motor calismiyor kaydet ${data.motor} ${data.tarih} ${data.saat}`);
            
            // Google Sheets'e kaydet
            const sheetsData = {
                motor: data.motor,
                tarih: data.tarih,
                vardiya: data.vardiya,
                saat: data.saat,
                kaydeden: getCurrentUserName(),
                durum: 'MOTOR ÇALIŞMIYOR'
            };
            
            const apiStartedAt = performance.now();
            const result = await saveMotorToSheets(sheetsData);
            const clientDuration = ((performance.now() - apiStartedAt) / 1000).toFixed(2);
            const serverDuration = typeof result.durationMs === 'number'
                ? `, sunucu ${(result.durationMs / 1000).toFixed(2)} sn`
                : '';
            console.log(`[Kojen motor addRecord calismiyor] ${clientDuration} sn${serverDuration}`);
            
            if (result.success) {
                kaydetTimerStatus = 'basarili';
                console.log('Motor çalışmıyor kaydı:', result);
                rememberMotorRecord(result.record || sheetsData);
                
                // Cache devre dışı - refresh çağrısı kaldırıldı
                
                showMessage(`${data.motor} motoru için "ÇALIŞMIYOR" durumu kaydedildi!`, 'warning');
                
                // Input'lara işaretle ve formu kilitle
                const allInputs = document.querySelectorAll('.data-input');
                allInputs.forEach(input => {
                    input.value = '0';
                    input.style.background = '#ffebee';
                    input.style.color = '#c62828';
                    input.setAttribute('data-calismiyor', 'true');
                });
                
                lockForm(false);
                
                // 🔥 OTOMATİK ENERJİ VERİ SAYFASINA YÖNLENDİRME
                setTimeout(async () => {
                    await redirectToEnerjiVeri(data.motor);
                }, 500);
            } else {
                kaydetTimerStatus = `hata: ${result.error || 'Bilinmeyen hata'}`;
                showMessage('Kayıt hatası: ' + (result.error || 'Bilinmeyen hata'), 'error');
            }
        } catch (error) {
            kaydetTimerStatus = `hata: ${error.message || error}`;
            console.error('Kayıt hatası:', error);
            showMessage('Bağlantı hatası: ' + error.message, 'error');
        } finally {
            if (stopKaydetTimer) {
                stopKaydetTimer(kaydetTimerStatus);
            }
            // Butonu geri aktif et
            if (!isLocked) {
                motorCalismiyorKaydetBtn.disabled = false;
            }
            motorCalismiyorKaydetBtn.textContent = '⚠️ MOTOR ÇALIŞMIYOR KAYDET';
        }
    });

    // Otomatik ayarları yap
    async function otomatikAyarlar() {
        // Elementleri seç
        const tarihSecimi = document.getElementById('tarihSecimi');
        const vardiyaSecimi = document.getElementById('vardiyaSecimi');
        
        if (!tarihSecimi || !vardiyaSecimi) {
            console.error('Elementler bulunamadı');
            return;
        }
        
        // Bugünün tarihini ayarla (TR formatı)
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        tarihSecimi.value = `${day}.${month}.${year}`;

        // Saate göre vardiya ayarla
        const currentHour = today.getHours();
        if (currentHour >= 8 && currentHour < 16) {
            vardiyaSecimi.value = '08-16';
        } else if (currentHour >= 16 && currentHour < 24) {
            vardiyaSecimi.value = '16-24';
        } else {
            vardiyaSecimi.value = '24-08';
        }
        
        // Mevcut saati güncelle
        updateCurrentHour();
        
        // Vardiya bilgisini güncelle
        guncelleVardiyaBilgisi();
        
        // 🔥 YÖNLENDİRİLEN MOTORU OTOMATİK SEÇ
        if (redirectMotor) {
            const targetButton = document.querySelector(`[data-motor="${redirectMotor}"]`);
            if (targetButton) {
                // Active class'ını kaldır
                motorButtons.forEach(btn => btn.classList.remove('active'));
                // Yeni motora active class'ını ekle
                targetButton.classList.add('active');
                // Seçili motoru güncelle
                selectedMotor = redirectMotor;
                showMessage(`${redirectMotor} motoru için motor verileri sayfasına yönlendirildiniz!`, 'info');
            }
        }
        
        // Vardiya verilerini yükle
        await loadVardiyaData();
        
        // Kayıt kontrolü yap
        await checkAndUpdateFormStatus();
    }

    // Tarih ve vardiya değişiminde kontrol et
    let tarihInputDebounce = null;
    tarihSecimi.addEventListener('input', function() {
        autoFormatTarih(this);
        // Debounce: Kullanıcı yazmayı bitirdikten 500ms sonra kontrol et
        if (tarihInputDebounce) clearTimeout(tarihInputDebounce);
        tarihInputDebounce = setTimeout(async () => {
            await checkAndUpdateFormStatus();
        }, 500);
    });
    
    tarihSecimi.addEventListener('change', async function() {
        if (!validateTarih(this.value)) {
            showMessage('Lütfen geçerli bir tarih formatı girin (GG.AA.YYYY)', 'error');
            this.value = '';
            return;
        }
        await checkAndUpdateFormStatus();
    });
    
    vardiyaSecimi.addEventListener('change', async function() {
        await checkAndUpdateFormStatus();
    });

    // Çıkış butonları
    if (sidebarLogout) {
        sidebarLogout.addEventListener('click', function() {
            if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
                window.location.href = 'anasayfa.html';
            }
        });
    }

    if (headerLogout) {
        headerLogout.addEventListener('click', function() {
            if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
                window.location.href = 'anasayfa.html';
            }
        });
    }

    // Vardiya Verileri Görüntüleme Fonksiyonları
    
    // Vardiya saat aralıklarını tanımla
    const vardiyaSaatAraliklari = {
        '08-16': { baslangic: 8, bitis: 16, baslangicSaat: '08:00', bitisSaat: '16:00' },
        '16-24': { baslangic: 16, bitis: 24, baslangicSaat: '16:00', bitisSaat: '24:00' },
        '24-08': { baslangic: 0, bitis: 8, baslangicSaat: '00:00', bitisSaat: '08:00' }
    };
    
    // Saat değerini saat kısmına çevir (14:00 -> 14)
    function getSaatDegeri(saatStr) {
        if (!saatStr) return null;
        const parts = saatStr.split(':');
        return parseInt(parts[0]);
    }
    
    // Kaydın vardiya aralığında olup olmadığını kontrol et
    function kayitVardiyaAraligindaMi(saatStr, vardiya) {
        const saat = getSaatDegeri(saatStr);
        if (saat === null) return false;

        const aralik = vardiyaSaatAraliklari[vardiya];
        if (!aralik) return false;

        if (vardiya === '24-08') {
            // Gece vardiyası: 23:00 - 07:00
            return saat >= 23 || saat < 7;
        } else if (vardiya === '16-24') {
            // 16-24 vardiya için 24:00'yi de dahil et
            return saat >= aralik.baslangic && saat <= aralik.bitis;
        } else {
            // Normal vardiyalar
            return saat >= aralik.baslangic && saat < aralik.bitis;
        }
    }
    
    // Vardiya bilgisi gösterimini güncelle
    function guncelleVardiyaBilgisi() {
        const vardiya = vardiyaSecimi.value;
        const aralik = vardiyaSaatAraliklari[vardiya];
        
        const vardiyaBadge = document.getElementById('vardiyaBadge');
        const saatAraligi = document.getElementById('saatAraligi');
        
        if (vardiyaBadge && aralik) {
            vardiyaBadge.textContent = vardiya;
        }
        
        if (saatAraligi && aralik) {
            saatAraligi.textContent = `${aralik.baslangicSaat} - ${aralik.bitisSaat}`;
        }
    }

    // Motor verisi girilmediyse mail uyarısı gönder
    function getMissingMotorCheckTarget(date = new Date()) {
        const target = new Date(date);
        if (target.getMinutes() < 59) {
            target.setHours(target.getHours() - 1);
        }

        const hour = String(target.getHours()).padStart(2, '0');
        const day = String(target.getDate()).padStart(2, '0');
        const month = String(target.getMonth() + 1).padStart(2, '0');
        const year = target.getFullYear();

        return {
            tarih: `${day}.${month}.${year}`,
            saat: `${hour}:00`
        };
    }

    async function checkAndSendMissingMotorMail() {
        const { tarih, saat } = getMissingMotorCheckTarget(new Date());
        const sentKey = `kojenMotorMissingMailSent:${tarih}:${saat}`;

        if (typeof runKojenMotorHourlyMissingRecordCheck === 'function') {
            const serverResult = await runKojenMotorHourlyMissingRecordCheck();
            if (serverResult.success) {
                if ((serverResult.addedCount || 0) > 0) {
                    showMessage(`${serverResult.addedCount} otomatik kojen motor kaydi olusturuldu.`, 'warning');
                    await loadVardiyaData();
                }
                localStorage.setItem(sentKey, new Date().toISOString());
                return;
            }

            console.error('Kojen motor sunucu otomatik kayit kontrolu basarisiz:', serverResult.error);
        }

        if (localStorage.getItem(sentKey)) {
            return;
        }

        const motors = ['GM-1', 'GM-2', 'GM-3'];
        const kontrolListesi = motors.map(motor => ({ motor, tarih, saat }));
        const eksikMotorlar = [];

        try {
            const bulkResult = await checkMultipleMotorRecords(kontrolListesi);

            if (bulkResult.success && bulkResult.results) {
                kontrolListesi.forEach(({ motor }) => {
                    const key = `${motor}|${tarih}|${saat}`;
                    if (!bulkResult.results[key] || !bulkResult.results[key].exists) {
                        eksikMotorlar.push(motor);
                    }
                });
            } else {
                for (const motor of motors) {
                    const result = await checkExistingMotorRecord(motor, tarih, saat);
                    if (!result.success || !result.exists) {
                        eksikMotorlar.push(motor);
                    }
                }
            }

            if (eksikMotorlar.length === 0) {
                return;
            }

            const subject = `${KojenMotorSheetsConfig.EMAIL_SUBJECT} - ${tarih} ${saat}`;
            const body = `Kojen Motor Veri Uyarısı\n\nTarih: ${tarih}\nSaat: ${saat}\nEksik motor kayıtları: ${eksikMotorlar.join(', ')}\n\nBu saat için kojen motor veri kaydı girilmedi.\n\nLütfen ilgili personeli bilgilendirin.`;
            const mailResult = await sendKojenMotorEmailAlert(subject, body);

            if (mailResult.success) {
                localStorage.setItem(sentKey, new Date().toISOString());
                showMessage(`${saat} için eksik motor veri maili gönderildi.`, 'warning');
            } else {
                console.error('Kojen motor uyarı maili gönderilemedi:', mailResult.error);
            }
        } catch (error) {
            console.error('Kojen motor eksik kayıt mail kontrolü hatası:', error);
        }
    }

    function startMissingMotorMailCheck() {
        console.log('Kojen motor mail kontrolü başlatılıyor...');

        setInterval(() => {
            checkAndSendMissingMotorMail();
        }, 60 * 1000);

        setTimeout(() => {
            checkAndSendMissingMotorMail();
        }, 45000);
    }
    
        
    // Vardiya veya tarih değiştiğinde tabloyu güncelle
    vardiyaSecimi.addEventListener('change', async function() {
        guncelleVardiyaBilgisi();
        await loadVardiyaData();
        await checkAndUpdateFormStatus();
    });
    
    tarihSecimi.addEventListener('change', async function() {
        if (validateTarih(this.value)) {
            await loadVardiyaData();
        }
    });
    
    // Sayfa yüklendiğinde vardiya bilgisini güncelle
    guncelleVardiyaBilgisi();
    
    // Sayfa yüklendiğinde otomatik ayarları yap
    await otomatikAyarlar();
    startMissingMotorMailCheck();

    // Her 5 saniyede bir saati güncelle (tablet performansı için 1s'den 5s'e çıkarıldı)
    setInterval(async () => {
        const previousHour = currentHourElement.textContent;
        updateCurrentHour();
        const currentHour = currentHourElement.textContent;
        // Sadece saat değiştiğinde kontrol et
        if (previousHour !== currentHour) {
            await checkAndUpdateFormStatus();
        }
    }, 5000);

    // Her 30 saniyede bir vardiya ayarını kontrol et
    setInterval(() => {
        const currentHour = new Date().getHours();
        let yeniVardiya;
        
        if (currentHour >= 8 && currentHour < 16) {
            yeniVardiya = '08-16';
        } else if (currentHour >= 16 && currentHour < 24) {
            yeniVardiya = '16-24';
        } else {
            yeniVardiya = '24-08';
        }

        // Eğer vardiya değiştiyse güncelle (kullanıcı manuel değişmediyse)
        if (vardiyaSecimi.value !== yeniVardiya && !vardiyaSecimi.matches(':focus')) {
            vardiyaSecimi.value = yeniVardiya;
        }
    }, 30000);
});

// 🔥 MOTOR ÇALIŞMIYOR MODAL FONKSİYONLARI (KOJEN MOTOR VERİLERİ İÇİN)
function openMotorCalismiyorModal() {
    const modal = document.getElementById('motorCalismiyorModal');
    const modalTarih = document.getElementById('modalTarih');
    const modalVardiya = document.getElementById('modalVardiya');
    
    // 🔥 OTOMATİK BUGÜN TARİHİNİ GETİR (HTML input için yyyy-MM-dd formatında)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const htmlDateStr = `${year}-${month}-${day}`; // HTML input formatı
    const displayDateStr = `${day}.${month}.${year}`; // Display formatı
    
    // Modal alanını doldur (HTML input formatı)
    modalTarih.value = htmlDateStr;
    console.log('📅 Modal tarihi ayarlandı (HTML):', htmlDateStr);
    console.log('📅 Modal tarihi (Display):', displayDateStr);
    
    // Display formatını data attribute olarak sakla
    modalTarih.setAttribute('data-display-date', displayDateStr);
    modalVardiya.value = vardiyaSecimi.value;
    
    // Vardiya saatlerini filtrele
    filterSaatByVardiya(vardiyaSecimi.value);
    
    // Modalı göster
    modal.style.display = 'flex';
    
    // Event listener'ı ekle
    document.getElementById('modalKaydetBtn').onclick = handleModalKaydet;
}

function closeMotorCalismiyorModal() {
    console.log('🚪 closeMotorCalismiyorModal çağrıldı...');
    
    const modal = document.getElementById('motorCalismiyorModal');
    if (!modal) {
        console.log('❌ Modal bulunamadı!');
        return;
    }
    
    console.log('✅ Modal bulundu, kapatılıyor...');
    modal.style.display = 'none';
    
    // Formu temizle
    setTimeout(() => {
        // Motor seçimlerini temizle
        document.querySelectorAll('input[name="motor"]:checked').forEach(cb => {
            cb.checked = false;
        });
        
        // Saat seçimlerini temizle
        document.querySelectorAll('input[name="saat"]:checked').forEach(cb => {
            cb.checked = false;
        });
        
        // Not alanını temizle
        const modalNot = document.getElementById('modalNot');
        if (modalNot) {
            modalNot.value = '';
        }
        
        console.log('🧹 Modal form temizlendi');
    }, 100);
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
    const kaydetBtn = document.getElementById('modalKaydetBtn');
    const originalText = kaydetBtn.textContent;
    let stopKaydetTimer = null;
    let kaydetTimerStatus = 'tamamlandi';
    
    try {
        // Seçili motorları al
        const selectedMotors = Array.from(document.querySelectorAll('input[name="motor"]:checked'))
            .map(cb => cb.value);
        
        if (selectedMotors.length === 0) {
            showMessage('Lütfen en az bir motor seçin!', 'error');
            return;
        }
        
        // Seçili saatleri al ve sıralı olarak düzenle
        const selectedSaatler = Array.from(document.querySelectorAll('input[name="saat"]:checked:not(:disabled)'))
            .map(cb => cb.value)
            .sort((a, b) => {
                // Saatleri sayısal olarak karşılaştır (00:00, 01:00, 02:00...)
                const hourA = parseInt(a.split(':')[0]);
                const hourB = parseInt(b.split(':')[0]);
                return hourA - hourB;
            });
        
        console.log('📋 Seçili saatler (sıralı):', selectedSaatler);
        
        if (selectedSaatler.length === 0) {
            showMessage('Lütfen en az bir saat seçin!', 'error');
            return;
        }
        
        // Butonu devre dışı bırak
        kaydetBtn.disabled = true;
        kaydetBtn.textContent = '⚠️ KAYDEDİLİYOR...';
        stopKaydetTimer = startConsoleDurationTimer(`Kojen motor toplu kaydet ${selectedMotors.length} motor ${selectedSaatler.length} saat`);
        
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
        
        console.log('📅 Modal değerleri:', { 
            modalTarih: modalTarih, 
            modalTarihRaw: modalTarihInput.value,
            modalVardiya, 
            modalNot 
        });
        
        let successCount = 0;
        let errorCount = 0;
        let errors = [];
        
        console.log('🚀 HIZLI TOPLU MOTOR KAYIT SİSTEMİ BAŞLIYOR...');
        
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
        
        console.log(`📋 ${kontrolListesi.length} motor kombinasyonu hazırlandı...`);
        
        // 🚀 SÜPER HIZLI TOPLU KAYIT KONTROLÜ (TEK API ÇAĞRISI)
        console.log('🔍 Tüm motor kayıtları tek seferde kontrol ediliyor...');
        const kontrolStartedAt = performance.now();
        const bulkKontrolResult = await checkMultipleMotorRecords(kontrolListesi);
        console.log(`[Kojen motor checkMultipleRecords] ${((performance.now() - kontrolStartedAt) / 1000).toFixed(2)} sn`);
        
        // 🚀 KAYIT EDİLECEKLERİ FİLTRELE
        const kayitEdilecekler = [];
        
        if (bulkKontrolResult.success) {
            console.log(`📊 Toplu motor kontrol sonucu: ${bulkKontrolResult.existingCount} var, ${bulkKontrolResult.totalCount - bulkKontrolResult.existingCount} yok`);
            
            kontrolListesi.forEach(({ motor, saat }) => {
                const key = `${motor}|${modalTarih}|${saat}`;
                const sonuc = bulkKontrolResult.results[key];
                
                if (sonuc && !sonuc.exists) {
                    kayitEdilecekler.push({ motor, saat });
                } else if (sonuc && sonuc.exists) {
                    console.log(`⏭️ ${motor} - ${saat} için kayıt zaten var`);
                } else {
                    console.log(`❌ ${motor} - ${saat} kontrol hatası`);
                    errors.push(`${motor} - ${saat}: Kontrol hatası`);
                }
            });
        } else {
            console.log('❌ Toplu motor kontrol başarısız, tek tek deneniyor...');
            // Fallback: Tek tek kontrol et
            for (const motor of selectedMotors) {
                for (const saat of selectedSaatler) {
                    try {
                        const existingRecord = await checkExistingRecord(motor, modalTarih, saat);
                        if (!existingRecord) {
                            kayitEdilecekler.push({ motor, saat });
                        } else {
                            console.log(`${motor} - ${modalTarih} ${saat} için kayıt zaten var`);
                        }
                    } catch (error) {
                        console.log(`❌ ${motor} - ${saat} kontrol hatası:`, error);
                        errors.push(`${motor} - ${saat}: Kontrol hatası`);
                    }
                }
            }
        }
        
        console.log(`📊 ${kayitEdilecekler.length} motor kaydı yapılacak...`);
        
        if (kayitEdilecekler.length === 0) {
            console.log('⏭️ Kayıt yapılacak şey yok, işlem tamamlandı');
            kaydetTimerStatus = 'kayit yok';
            showMessage('Tüm seçili saatler için zaten kayıt mevcut! Modal kapatılıyor...', 'info');
            kaydetBtn.disabled = false;
            kaydetBtn.textContent = originalText;
            
            // Modalı otomatik kapat
            setTimeout(() => {
                closeMotorCalismiyorModal();
            }, 1500);
            
            return;
        }
        
        // 🚀 HIZLI ÇOKLU KAYIT SİSTEMİ - Tüm verileri tek seferde gönder
        console.log('🚀 Çoklu kayıt sistemi başlatılıyor...');
        
        // Kayıt verilerini hazırla
        const recordsToSave = kayitEdilecekler.map(({ motor, saat }) => {
            return {
                motor: motor,
                tarih: modalTarih,
                vardiya: modalVardiya,
                saat: saat,
                jenYatakSicaklikDE: '0',
                jenYatakSicaklikNDE: '0',
                sogutmaSuyuSicaklik: '0',
                sogutmaSuyuBasinc: '0',
                yagSicaklik: '0',
                yagBasinc: '0',
                sarjSicaklik: '0',
                sarjBasinc: '0',
                gazRegulatoru: '0',
                makineDairesiSicaklik: '0',
                karterBasinc: '0',
                onKamaraFarkBasinc: '0',
                sargiSicaklik1: '0',
                sargiSicaklik2: '0',
                sargiSicaklik3: '0',
                durum: 'MOTOR ÇALIŞMIYOR',
                not: modalNot || '',
                kullanici: getCurrentUserName()
            };
        });
        
        try {
            // Çoklu kayıt gönder
            const apiStartedAt = performance.now();
            const bulkResult = await addMultipleMotorRecords(recordsToSave);
            const clientDuration = ((performance.now() - apiStartedAt) / 1000).toFixed(2);
            const serverDuration = typeof bulkResult.durationMs === 'number'
                ? `, sunucu ${(bulkResult.durationMs / 1000).toFixed(2)} sn`
                : '';
            console.log(`[Kojen motor addMultipleRecords] ${clientDuration} sn${serverDuration}`);
            
            if (bulkResult.success) {
                kaydetTimerStatus = `basarili (${bulkResult.addedCount}/${bulkResult.totalCount})`;
                console.log(`✅ ${bulkResult.addedCount}/${bulkResult.totalCount} kayıt başarıyla eklendi`);
                showMessage(`${bulkResult.addedCount} kayıt başarıyla eklendi!`, 'success');
                
                const addedKeys = new Set((bulkResult.addedRecords || []).map(record =>
                    `${record.motor}|${normalizeMotorDateForCache(record.tarih)}|${normalizeMotorSaatForCache(record.saat)}`
                ));
                const savedRecords = addedKeys.size
                    ? recordsToSave.filter(record => addedKeys.has(`${record.motor}|${normalizeMotorDateForCache(record.tarih)}|${normalizeMotorSaatForCache(record.saat)}`))
                    : recordsToSave;
                savedRecords.forEach(record => rememberMotorRecord(record));
                
                // Formu kapat
                closeMotorCalismiyorModal();
                
            } else {
                kaydetTimerStatus = `hata: ${bulkResult.error || 'Bilinmeyen hata'}`;
                console.error('❌ Çoklu kayıt hatası:', bulkResult.error);
                showMessage('Kayıt hatası: ' + bulkResult.error, 'error');
            }
            
        } catch (error) {
            kaydetTimerStatus = `hata: ${error.message || error}`;
            console.error('❌ Çoklu kayıt gönderme hatası:', error);
            showMessage('Kayıt gönderilemedi: ' + error.message, 'error');
        }
        
        // Durum güncellemelerini göster
        const durumInterval = setInterval(() => {
            kayitDurumunuGoster();
            
            // Tüm işlemler bittiğinde interval'i temizle
            const bekleyen = kayitKuyrugu.filter(i => i.durum === 'beklemede').length;
            const islenen = kayitKuyrugu.filter(i => i.durum === 'isleniyor').length;
            
            if (bekleyen === 0 && islenen === 0) {
                clearInterval(durumInterval);
                
                // Son durum mesajı
                const tamamlanan = kayitKuyrugu.filter(i => i.durum === 'tamamlandi').length;
                const hatali = kayitKuyrugu.filter(i => i.durum === 'hata').length;
                
                if (tamamlanan > 0) {
                    showMessage(`🎉 Tüm kayıtlar tamamlandı! ${tamamlanan} başarılı, ${hatali} hatalı`, 'success');
                }
                
                // Kuyruğu temizle (sadece son 10 işlemi tut)
                kayitKuyrugu = kayitKuyrugu.slice(-10);
            }
        }, 2000); // Her 2 saniyede bir durum göster
        
    } catch (error) {
        kaydetTimerStatus = `hata: ${error.message || error}`;
        showMessage('İşlem hatası: ' + error.message, 'error');
    } finally {
        if (stopKaydetTimer) {
            stopKaydetTimer(kaydetTimerStatus);
        }
        kaydetBtn.disabled = false;
        kaydetBtn.textContent = originalText;
    }
}

// Event listener'ları ekle
document.addEventListener('DOMContentLoaded', function() {
    // Motor çalışmıyor butonuna modal açma event listener'ı ekle
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
