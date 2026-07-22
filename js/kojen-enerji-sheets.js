/**
 * KOJEN ENERJİ VERİLERİ - Google Sheets Entegrasyonu
 * Bu dosya kojen-enerji-veri.js ile birlikte kullanılır
 */

const KojenEnerjiSheetsConfig = {
    WEB_APP_URL: window.AppConfig.getScriptUrl('enerji'),
    END_OF_DAY_WEB_APP_URL: window.AppConfig.getScriptUrl('enerjiGunSonu'),
    YEARLY_REPORT_WEB_APP_URL: window.AppConfig.getScriptUrl('yillikEnerjiRapor'),
    EMAIL_ENABLED: true,
    EMAIL_TO: 'mrtcsk0320@gmail.com',
    EMAIL_SUBJECT: 'Kojen Enerji Veri Uyarısı - Kayıt Girilmedi'
};

let yearlyEnergyUpdateQueue = [];
let yearlyEnergyUpdateTimer = null;

function buildYearlyEnergyRecordPayload(record) {
    if (!record) return null;
    const motor = String(record.motor || '').trim();
    const tarih = String(record.tarih || '').trim();
    const saat = String(record.saat || '').trim();
    if (!motor || !tarih || !saat) return null;
    return { motor, tarih, saat };
}

function dedupeYearlyEnergyRecords(records) {
    const seen = new Set();
    const unique = [];
    (records || []).forEach(record => {
        const payload = buildYearlyEnergyRecordPayload(record);
        if (!payload) return;
        const key = `${payload.motor}|${payload.tarih}|${payload.saat}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push(payload);
    });
    return unique;
}

function scheduleYearlyEnergyUpdateForRecords(records, delayMs = 4000) {
    const payload = dedupeYearlyEnergyRecords(records);
    if (!payload.length) return;

    yearlyEnergyUpdateQueue = yearlyEnergyUpdateQueue.concat(payload);
    if (yearlyEnergyUpdateTimer) {
        window.clearTimeout(yearlyEnergyUpdateTimer);
    }

    yearlyEnergyUpdateTimer = window.setTimeout(() => {
        const queued = dedupeYearlyEnergyRecords(yearlyEnergyUpdateQueue);
        yearlyEnergyUpdateQueue = [];
        yearlyEnergyUpdateTimer = null;

        updateYearlyEnergyForRecords(queued).then(result => {
            if (result && result.success) {
                console.log('Yillik enerji sayfasi guncellendi:', result);
            } else {
                console.warn('Yillik enerji guncellemesi tamamlanamadi:', result);
            }
        });
    }, delayMs);
}

async function updateYearlyEnergyForRecords(records) {
    try {
        const payload = dedupeYearlyEnergyRecords(records);
        const url = KojenEnerjiSheetsConfig.YEARLY_REPORT_WEB_APP_URL;
        if (!url) {
            return { success: false, error: 'Yillik enerji rapor URL eksik.' };
        }
        if (!payload.length) {
            return { success: true, skipped: true, message: 'Guncellenecek enerji kaydi yok.' };
        }

        const params = new URLSearchParams({
            action: 'updateYearlyEnergyForRecords',
            data: JSON.stringify(payload)
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        return await response.json();
    } catch (error) {
        console.error('Yillik enerji guncelleme hatasi:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Enerji verilerini Google Sheets'e kaydet
 * @param {Object} data - Kaydedilecek enerji verileri
 * @returns {Promise<Object>} - Kayıt sonucu
 */
async function saveEnerjiToSheets(data) {
    try {
        const url = KojenEnerjiSheetsConfig.WEB_APP_URL;
        
        // Tarih formatını düzelt (dd.MM.yyyy -> yyyy-MM-dd)
        let formattedTarih = data.tarih;
        if (formattedTarih && formattedTarih.includes('.')) {
            const parts = formattedTarih.split('.');
            formattedTarih = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else if (!formattedTarih) {
            formattedTarih = new Date().toISOString().split('T')[0]; // Bugün tarihi
        }
        
        // Parametreleri hazırla
        const params = new URLSearchParams({
            action: 'addRecord',
            tarih: formattedTarih,
            vardiya: data.vardiya || '',
            saat: data.saat || '',
            motor: data.motor || '',
            kaydeden: data.kaydeden || 'Admin',
            durum: data.durum || 'NORMAL',
            skipYearlyUpdate: 'true'
        });
        // Motor calismiyor durumunda diger veriler 0, ama son degerler korunur
        const durumText = String(data.durum || '').toUpperCase()
            .replace(/\u00C7/g, 'C')
            .replace(/\u011E/g, 'G')
            .replace(/\u0130/g, 'I')
            .replace(/\u015E/g, 'S')
            .replace(/\u00D6/g, 'O')
            .replace(/\u00DC/g, 'U');
        if (durumText.indexOf('MOTOR') !== -1 && durumText.indexOf('NORMAL') === -1) {
            // Diğer değerler 0
            params.append('aydemVoltaji', '0.00');
            params.append('aktifGuc', '0.00');
            params.append('reaktifGuc', '0.00');
            params.append('cosPhi', '0.00');
            params.append('ortAkim', '0.00');
            params.append('ortGerilim', '0.00');
            params.append('notrAkim', '0.00');
            params.append('tahrikGerilimi', '0.00');
            // Son değerler (kaydedilen)
            params.append('toplamAktifEnerji', data.toplamAktifEnerji || '0');
            params.append('calismaSaati', data.calismaSaati || '0');
            params.append('kalkisSayisi', data.kalkisSayisi || '0');
        } else {
            // Normal durumda tüm veriler
            params.append('aydemVoltaji', data.aydemVoltaji || '0');
            params.append('aktifGuc', data.aktifGuc || '0');
            params.append('reaktifGuc', data.reaktifGuc || '0');
            params.append('cosPhi', data.cosPhi || '0');
            params.append('ortAkim', data.ortAkim || '0');
            params.append('ortGerilim', data.ortGerilim || '0');
            params.append('notrAkim', data.notrAkim || '0');
            params.append('tahrikGerilimi', data.tahrikGerilimi || '0');
            params.append('toplamAktifEnerji', data.toplamAktifEnerji || '0');
            params.append('calismaSaati', data.calismaSaati || '0');
            params.append('kalkisSayisi', data.kalkisSayisi || '0');
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        });
        
        const result = await response.json();
        if (result.success) {
            scheduleYearlyEnergyUpdateForRecords([
                result.record || {
                    motor: data.motor || '',
                    tarih: formattedTarih,
                    saat: data.saat || ''
                }
            ]);
        }
        return result;
        
    } catch (error) {
        console.error('Sheets kayıt hatası:', error);
        return { success: false, error: error.message };
    }
}

async function saveEnerjiEndOfDayValues(data) {
    try {
        const url = KojenEnerjiSheetsConfig.END_OF_DAY_WEB_APP_URL;
        if (!url) {
            return {
                success: false,
                error: 'Gün sonu Google Sheets URL eksik. Ayrı Apps Script deploy URLini END_OF_DAY_WEB_APP_URL alanına ekleyin.'
            };
        }

        let formattedTarih = data.tarih;
        if (formattedTarih && formattedTarih.includes('.')) {
            const parts = formattedTarih.split('.');
            formattedTarih = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        const params = new URLSearchParams({
            action: 'addEndOfDayValues',
            tarih: formattedTarih || '',
            vardiya: data.vardiya || '24-08',
            motor: data.motor || '',
            toplamAktifEnerji: data.toplamAktifEnerji || '',
            calismaSaati: data.calismaSaati || '',
            kalkisSayisi: data.kalkisSayisi || '',
            kaydeden: data.kaydeden || 'Admin'
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        return await response.json();
    } catch (error) {
        console.error('Enerji gün sonu değerleri kayıt hatası:', error);
        return { success: false, error: error.message };
    }
}

async function getEnerjiEndOfDayValues(motor, tarih) {
    try {
        const url = KojenEnerjiSheetsConfig.END_OF_DAY_WEB_APP_URL;
        if (!url) {
            return {
                success: false,
                error: 'Gun sonu Google Sheets URL eksik.'
            };
        }

        let formattedTarih = tarih || '';
        if (formattedTarih && formattedTarih.includes('.')) {
            const parts = formattedTarih.split('.');
            formattedTarih = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        const params = new URLSearchParams({
            action: 'getEndOfDayValues',
            motor: motor || '',
            tarih: formattedTarih
        });

        const response = await fetch(`${url}?${params.toString()}`, {
            method: 'GET'
        });

        return await response.json();
    } catch (error) {
        console.error('Enerji gun sonu degerleri okuma hatasi:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Kayıt kontrolü - Belirli tarih, saat ve motor için kayıt var mı?
 * @param {string} motor - Motor adı (GM-1, GM-2, GM-3)
 * @param {string} tarih - Tarih (dd.MM.yyyy)
 * @param {string} saat - Saat (HH:MM)
 * @returns {Promise<Object>} - Kontrol sonucu
 */
async function checkExistingEnerjiRecord(motor, tarih, saat) {
    console.log('g��� checkExistingEnerjiRecord başlatıldı:', motor, tarih, saat);
    
    try {
        // Tarih formatını düzelt
        let formattedTarih = tarih;
        if (formattedTarih.includes('.')) {
            const parts = formattedTarih.split('.');
            formattedTarih = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        
        console.log('g��� Formatlanmış tarih:', formattedTarih);
        
        const url = KojenEnerjiSheetsConfig.WEB_APP_URL + 
            `?action=checkExistingRecord&motor=${encodeURIComponent(motor)}&tarih=${encodeURIComponent(formattedTarih)}&saat=${encodeURIComponent(saat)}`;
        
        console.log('g��� İstek URL:', url);
        console.log('g��� Fetch isteği gönderiliyor...');
        
        const response = await fetch(url);
        console.log('g��� Response status:', response.status);
        
        const result = await response.json();
        console.log('g��� Response result:', result.success ? 'SUCCESS' : 'FAILED');
        
        return result;
        
    } catch (error) {
        console.error('Kayıt kontrolü hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * g��� TOPLU KAYIT KONTROLÜ - Tek seferde çoklu kayıt kontrolü
 * @param {Array} kombinasyonlar - [{motor, tarih, saat}, ...]
 * @returns {Promise<Object>} - Kontrol sonuçları
 */
async function checkMultipleEnerjiRecords(kombinasyonlar) {
    console.log('g��� TOPLU KAYIT KONTROLÜ BA�?LATILIYOR:', kombinasyonlar.length, 'kombinasyon');
    console.log('g��� Gelen kombinasyonlar:', kombinasyonlar);
    
    try {
        // Tüm kombinasyonları tek bir string'e dönüştür
        const kontrolData = kombinasyonlar.map(k => `${k.motor}|${k.tarih}|${k.saat}`).join(',');
        
        console.log('g��� Oluşturulan kontrolData:', kontrolData);
        
        const url = KojenEnerjiSheetsConfig.WEB_APP_URL + 
            `?action=checkMultipleRecords&data=${encodeURIComponent(kontrolData)}`;
        
        console.log('g��� Toplu kontrol URL:', url);
        console.log('g��� Toplu fetch isteği gönderiliyor...');
        
        const response = await fetch(url);
        console.log('g��� Response status:', response.status);
        
        const result = await response.json();
        console.log('g��� Toplu kontrol sonucu:', result);
        
        return result;
        
    } catch (error) {
        console.error('Toplu kayıt kontrolü hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Motor ve tarihe göre kayıtları getir
 * @param {string} motor - Motor adı
 * @param {string} tarih - Tarih (dd.MM.yyyy)
 * @returns {Promise<Object>} - Kayıtlar
 */
async function getEnerjiRecordsByMotorAndDate(motor, tarih) {
    try {
        // Tarih formatını düzelt
        let formattedTarih = tarih;
        if (formattedTarih.includes('.')) {
            const parts = formattedTarih.split('.');
            formattedTarih = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        
        const url = KojenEnerjiSheetsConfig.WEB_APP_URL + 
            `?action=getRecordsByMotorAndDate&motor=${encodeURIComponent(motor)}&tarih=${encodeURIComponent(formattedTarih)}`;
        
        const response = await fetch(url);
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Veri getirme hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Son N kaydı getir
 * @param {number} count - Kayıt sayısı (varsayılan: 50)
 * @returns {Promise<Object>} - Kayıtlar
 */
async function getLastEnerjiRecords(count = 50) {
    try {
        const url = KojenEnerjiSheetsConfig.WEB_APP_URL + 
            `?action=getLastRecords&count=${count}`;
        
        const response = await fetch(url);
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Veri getirme hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Tüm kayıtları getir
 * @returns {Promise<Object>} - Tüm kayıtlar
 */
async function getAllEnerjiRecords() {
    try {
        const url = KojenEnerjiSheetsConfig.WEB_APP_URL + '?action=getRecords';
        
        const response = await fetch(url);
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Veri getirme hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Mail uyarısı gönder
 * @param {string} subject - Mail konusu
 * @param {string} body - Mail içeriği
 * @returns {Promise<Object>} - Mail sonucu
 */
async function sendKojenEnerjiEmailAlert(subject, body) {
    if (!KojenEnerjiSheetsConfig.EMAIL_ENABLED) {
        console.log('Kojen enerji mail gönderme kapalı');
        return { success: true, message: 'Mail gönderme kapalı' };
    }

    try {
        const url = new URL(KojenEnerjiSheetsConfig.WEB_APP_URL);
        url.searchParams.append('action', 'sendEmail');
        url.searchParams.append('to', KojenEnerjiSheetsConfig.EMAIL_TO);
        url.searchParams.append('subject', subject || KojenEnerjiSheetsConfig.EMAIL_SUBJECT);
        url.searchParams.append('body', body || '');

        const response = await fetch(url, { method: 'GET', mode: 'cors' });
        return await response.json();

    } catch (error) {
        console.error('Kojen enerji mail gönderme hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * g��� ÇOKLU KAYIT SİSTEMİ - Tek seferde çoklu enerji kaydı
 * @param {Array} records - Kaydedilecek enerji kayıtları
 * @returns {Promise<Object>} - Kayıt sonuçları
 */
async function runKojenEnerjiHourlyMissingRecordCheck() {
    try {
        const url = new URL(KojenEnerjiSheetsConfig.WEB_APP_URL);
        url.searchParams.append('action', 'checkHourlyMissingRecords');

        const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache' });
        return await response.json();
    } catch (error) {
        console.error('Kojen enerji otomatik kayit kontrolu hatasi:', error);
        return { success: false, error: error.message };
    }
}

async function addMultipleEnerjiRecords(records) {
    console.log('g��� Çoklu enerji kaydı gönderiliyor:', records.length, 'kayıt');
    
    try {
        const url = KojenEnerjiSheetsConfig.WEB_APP_URL;
        
        const urlParams = new URLSearchParams({
            action: 'addMultipleRecords',
            data: JSON.stringify(records.map(record => ({ ...record, skipYearlyUpdate: 'true' })))
        });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: urlParams.toString()
        });
        
        const result = await response.json();
        console.log('g��� Çoklu enerji kayıt sonucu:', result);
        if (result.success && result.addedRecords && result.addedRecords.length) {
            scheduleYearlyEnergyUpdateForRecords(result.addedRecords);
        }
        return result;
        
    } catch (error) {
        console.error('❌ Çoklu enerji kayıt hatası:', error);
        return { success: false, error: error.message };
    }
}

window.KojenEnerjiSheetsConfig = KojenEnerjiSheetsConfig;
window.saveEnerjiToSheets = saveEnerjiToSheets;
window.saveEnerjiEndOfDayValues = saveEnerjiEndOfDayValues;
window.updateYearlyEnergyForRecords = updateYearlyEnergyForRecords;
window.scheduleYearlyEnergyUpdateForRecords = scheduleYearlyEnergyUpdateForRecords;
window.getEnerjiEndOfDayValues = getEnerjiEndOfDayValues;
window.checkExistingEnerjiRecord = checkExistingEnerjiRecord;
window.checkMultipleEnerjiRecords = checkMultipleEnerjiRecords;
window.getEnerjiRecordsByMotorAndDate = getEnerjiRecordsByMotorAndDate;
window.getLastEnerjiRecords = getLastEnerjiRecords;
window.getAllEnerjiRecords = getAllEnerjiRecords;
window.addMultipleEnerjiRecords = addMultipleEnerjiRecords;
window.sendKojenEnerjiEmailAlert = sendKojenEnerjiEmailAlert;
window.runKojenEnerjiHourlyMissingRecordCheck = runKojenEnerjiHourlyMissingRecordCheck;

/**
 * Enerji kaydını güncelle
 * @param {Object} data - Güncellenecek enerji verileri
 * @returns {Promise<Object>} - Güncelleme sonucu
 */
async function updateEnerjiRecord(data) {
    try {
        const url = KojenEnerjiSheetsConfig.WEB_APP_URL;
        
        // Tarih formatını düzelt (dd.MM.yyyy -> yyyy-MM-dd)
        let formattedTarih = data.tarih;
        if (formattedTarih && formattedTarih.includes('.')) {
            const parts = formattedTarih.split('.');
            formattedTarih = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
        
        // Parametreleri hazırla
        const params = new URLSearchParams({
            action: 'updateRecord',
            tarih: formattedTarih,
            saat: data.saat || '',
            motor: data.motor || '',
            vardiya: data.vardiya || '',
            aydemVoltaji: data.aydemVoltaji || '0',
            aktifGuc: data.aktifGuc || '0',
            reaktifGuc: data.reaktifGuc || '0',
            cosPhi: data.cosPhi || '0',
            ortAkim: data.ortAkim || '0',
            ortGerilim: data.ortGerilim || '0',
            notrAkim: data.notrAkim || '0',
            tahrikGerilimi: data.tahrikGerilimi || '0',
            toplamAktifEnerji: data.toplamAktifEnerji || '0',
            calismaSaati: data.calismaSaati || '0',
            kalkisSayisi: data.kalkisSayisi || '0',
            durum: data.durum || 'NORMAL',
            duzenlemeNotu: data.duzenlemeNotu || '',
            duzenleyen: data.duzenleyen || 'Admin',
            duzenlemeTarihi: data.duzenlemeTarihi || new Date().toISOString()
        });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params
        });
        
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Kayıt güncelleme hatası:', error);
        return { success: false, error: error.message };
    }
}

window.updateEnerjiRecord = updateEnerjiRecord;
