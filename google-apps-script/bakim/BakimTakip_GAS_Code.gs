// Bakım Takibi Google Apps Script
// Sheet ID ve Sheet Name olmadan dinamik çalışır

// Global değişkenler - Kullanıcı linkleri
const SPREADSHEET_NAME = "Bakım Takip Sistemi";
const SPREADSHEET_ID = "1NxlvD6drTjyB7l_kSeAtyXSdbigeu6HvyrwXJF9T7bk"; // Kullanıcı Sheets ID
const DRIVE_FOLDERS = {
  PERIODIC: "1TGrKfYHrayZmiGW1J8GQd70jPtByBKY9", // Periyodik Bakım Drive ID
  NORMAL: "10D4LgnGYN0TMdweTIfeMjoKSX2ZLaYCA",   // Normal Bakım Drive ID  
  FAULT: "1TGrKfYHrayZmiGW1J8GQd70jPtByBKY9"     // Arıza Bakım Drive ID (Periyodik ile aynı)
};

const SHEET_NAMES = {
  MAINTENANCE: "Bakımlar",
  STATISTICS: "İstatistikler",
  SETTINGS: "Ayarlar",
  MOTOR_HOURS: "Motor Saatleri"
};

// Ana doPost fonksiyonu
function doPost(e) {
  try {
    // e veya e.parameters undefined ise varsayılan değerler kullan
    if (!e) {
      Logger.log('UYARI: e parametresi undefined, test modu');
      e = { parameters: {} };
    }
    
    if (!e.parameters) {
      Logger.log('UYARI: e.parameters undefined, boş obje oluşturuluyor');
      e.parameters = {};
    }
    
    const params = e.parameters;
    // params.action bir array olduğu için ilk elemanı al
    const action = (params.action && params.action[0]) || 'save';
    
    Logger.log('İşlem: ' + action);
    Logger.log('Parametreler: ' + JSON.stringify(params));
    
    // Spreadsheet'i oluştur veya al
    const ss = getOrCreateSpreadsheet();
    
    switch(action) {
      case 'save':
        return saveMaintenanceRecord(ss, params);
      case 'getStats':
        return getMaintenanceStats(ss);
      case 'getReport':
        return getMaintenanceReport(ss, params);
      case 'getActiveRecords':
        return getActiveRecords(ss, params);
      case 'closeRecord':
        return closeRecord(ss, params);
      case 'getMotorHours':
        return getMotorHours(ss);
      case 'updateMotorHours':
        return updateMotorHours(ss, params);
      case 'updateOilSample':
        return updateOilSample(ss, params);
      case 'updateAlternatorGrease':
        return updateAlternatorGrease(ss, params);
      case 'init':
        return initializeSystem(ss);
      case 'test':
        return testConnection(ss);
      default:
        Logger.log('Geçersiz işlem: ' + action);
        return createResponse(false, "Geçersiz işlem: " + action);
    }
  } catch (error) {
    Logger.log('HATA: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return createResponse(false, "Sistem hatası: " + error.toString());
  }
}

// GET istekleri için doGet fonksiyonu
function doGet(e) {
  Logger.log('GET isteği alındı');
  if (!e) {
    Logger.log('UYARI: GET isteğinde e parametresi undefined');
    e = { parameter: {} };
  }
  return doPost(e);
}

// Spreadsheet'i oluştur veya mevcut olanı al
function getOrCreateSpreadsheet() {
  try {
    // Kullanıcının mevcut spreadsheet'ini kullan
    if (SPREADSHEET_ID) {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      Logger.log('Mevcut spreadsheet kullanılıyor: ' + SPREADSHEET_ID);
      
      // Sayfaları kontrol et ve gerekirse oluştur
      createSheets(ss);
      
      return ss;
    }
    
    // Eğer ID yoksa, isimle ara
    const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
    
    if (files.hasNext()) {
      // Mevcut spreadsheet'i kullan
      const file = files.next();
      const ss = SpreadsheetApp.openById(file.getId());
      Logger.log('Mevcut spreadsheet bulundu: ' + file.getId());
      
      createSheets(ss);
      return ss;
    } else {
      // Yeni spreadsheet oluştur
      const ss = SpreadsheetApp.create(SPREADSHEET_NAME);
      Logger.log('Yeni spreadsheet oluşturuldu: ' + ss.getId());
      
      // Sayfaları oluştur
      createSheets(ss);
      
      // Paylaşım ayarları (isteğe bağlı)
      ss.addEditor(Session.getActiveUser().getEmail());
      
      return ss;
    }
  } catch (error) {
    throw new Error('Spreadsheet oluşturulamadı: ' + error.toString());
  }
}

// Sayfaları oluştur
function createSheets(ss) {
  // Bakımlar sayfası
  let maintenanceSheet = ss.getSheetByName(SHEET_NAMES.MAINTENANCE);
  
  if (maintenanceSheet) {
    // Mevcut sayfayı kontrol et ve düzelt
    Logger.log('Mevcut Bakımlar sayfası kontrol ediliyor...');
    
    // Mevcut sütun sayısını kontrol et
    const lastColumn = maintenanceSheet.getLastColumn();
    Logger.log('Mevcut sütun sayısı: ' + lastColumn);
    
    if (lastColumn > 12) {
      // Fazla sütunları temizle
      Logger.log('Fazla sütunlar temizleniyor...');
      maintenanceSheet.deleteColumns(13, lastColumn - 12);
    }
    
    // Header'ları kontrol et ve güncelle
    const currentHeaders = maintenanceSheet.getRange('A1:L1').getValues()[0];
    const expectedHeaders = [
      'Kayıt No', 'Tarih', 'Saat', 'Motor', 'Bakım Türü', 'Bakım Tipi',
      'Teknisyen', 'Firma', 'Notlar', 'Dosyalar', 'Durum', 'Oluşturulma Tarihi'
    ];
    
    // Header'ları güncelle
    maintenanceSheet.getRange('A1:L1')
      .setValues([expectedHeaders])
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('white');
      
  } else {
    // Yeni sayfa oluştur
    maintenanceSheet = ss.insertSheet(SHEET_NAMES.MAINTENANCE);
    
    const maintenanceHeaders = [
      'Kayıt No',
      'Tarih',
      'Saat', 
      'Motor',
      'Bakım Türü',
      'Bakım Tipi',
      'Teknisyen',
      'Firma',
      'Notlar',
      'Dosyalar',
      'Durum',
      'Oluşturulma Tarihi'
    ];
    
    maintenanceSheet.getRange('A1:L1')
      .setValues([maintenanceHeaders])
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('white');
  }
  
  // Sütun genişlikleri (12 sütun)
  maintenanceSheet.setColumnWidth(1, 120);
  maintenanceSheet.setColumnWidth(2, 100);
  maintenanceSheet.setColumnWidth(3, 80);
  maintenanceSheet.setColumnWidth(4, 80);
  maintenanceSheet.setColumnWidth(5, 100);
  maintenanceSheet.setColumnWidth(6, 120);
  maintenanceSheet.setColumnWidth(7, 150);
  maintenanceSheet.setColumnWidth(8, 100);
  maintenanceSheet.setColumnWidth(9, 300);
  maintenanceSheet.setColumnWidth(10, 200);
  maintenanceSheet.setColumnWidth(11, 80);
  maintenanceSheet.setColumnWidth(12, 150);
  
  // İstatistikler sayfası
  let statsSheet = ss.getSheetByName(SHEET_NAMES.STATISTICS);
  
  if (statsSheet) {
    Logger.log('Mevcut İstatistikler sayfası kontrol ediliyor...');
    
    const lastColumn = statsSheet.getLastColumn();
    if (lastColumn > 8) {
      statsSheet.deleteColumns(9, lastColumn - 8);
    }
    
    const statsHeaders = [
      'Tarih', 'Toplam Bakım', 'Periyodik', 'Normal', 'Arıza', 'GM-1', 'GM-2', 'GM-3'
    ];
    
    statsSheet.getRange('A1:H1')
      .setValues([statsHeaders])
      .setFontWeight('bold')
      .setBackground('#34a853')
      .setFontColor('white');
      
  } else {
    statsSheet = ss.insertSheet(SHEET_NAMES.STATISTICS);
    
    const statsHeaders = [
      'Tarih',
      'Toplam Bakım',
      'Periyodik',
      'Normal',
      'Arıza',
      'GM-1',
      'GM-2',
      'GM-3'
    ];
    
    statsSheet.getRange('A1:H1')
      .setValues([statsHeaders])
      .setFontWeight('bold')
      .setBackground('#34a853')
      .setFontColor('white');
  }
  
  statsSheet.setColumnWidth(1, 100);
  statsSheet.setColumnWidth(2, 100);
  statsSheet.setColumnWidth(3, 100);
  statsSheet.setColumnWidth(4, 100);
  statsSheet.setColumnWidth(5, 100);
  statsSheet.setColumnWidth(6, 80);
  statsSheet.setColumnWidth(7, 80);
  statsSheet.setColumnWidth(8, 80);
  
  // Ayarlar sayfası
  let settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  
  if (settingsSheet) {
    Logger.log('Mevcut Ayarlar sayfası kontrol ediliyor...');
    
    const lastColumn = settingsSheet.getLastColumn();
    if (lastColumn > 3) {
      settingsSheet.deleteColumns(4, lastColumn - 3);
    }
    
    const settingsHeaders = ['Ayar', 'Değer', 'Açıklama'];
    settingsSheet.getRange('A1:C1')
      .setValues([settingsHeaders])
      .setFontWeight('bold')
      .setBackground('#fbbc04')
      .setFontColor('white');
      
  } else {
    settingsSheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
    
    const settingsHeaders = ['Ayar', 'Değer', 'Açıklama'];
    const settingsData = [
      ['Son Kayıt No', '0', 'Otomatik artan kayıt numarası'],
      ['Sistem Versiyonu', '1.0', 'Bakım takip sistemi versiyonu'],
      ['Oluşturulma Tarihi', new Date().toLocaleDateString('tr-TR'), 'Sistem kurulum tarihi']
    ];
    
    settingsSheet.getRange('A1:C1')
      .setValues([settingsHeaders])
      .setFontWeight('bold')
      .setBackground('#fbbc04')
      .setFontColor('white');
    
    settingsSheet.getRange('A2:C4')
      .setValues(settingsData);
  }
  
  settingsSheet.setColumnWidth(1, 150);
  settingsSheet.setColumnWidth(2, 200);
  settingsSheet.setColumnWidth(3, 300);
  
  // Motor Saatleri sayfası
  let motorHoursSheet = ss.getSheetByName(SHEET_NAMES.MOTOR_HOURS);
  
  if (motorHoursSheet) {
    Logger.log('Mevcut Motor Saatleri sayfası kontrol ediliyor...');
    
    const lastColumn = motorHoursSheet.getLastColumn();
    if (lastColumn > 10) {
      motorHoursSheet.deleteColumns(11, lastColumn - 10);
    }
    
    const motorHoursHeaders = ['Motor', 'Çalışma Saati', 'Son Yağ Numune Saati', 'Son Yağ Numune Tarihi', 'Bir Sonraki Yağ Numune', 'Notlar', 'Son Alternatör Gresleme Saati', 'Son Alternatör Gresleme Tarihi', 'Bir Sonraki Alternatör Gresleme', 'Alternatör Notlar'];
    motorHoursSheet.getRange('A1:J1')
      .setValues([motorHoursHeaders])
      .setFontWeight('bold')
      .setBackground('#ea4335')
      .setFontColor('white');
      
  } else {
    motorHoursSheet = ss.insertSheet(SHEET_NAMES.MOTOR_HOURS);
    
    const motorHoursHeaders = ['Motor', 'Çalışma Saati', 'Son Yağ Numune Saati', 'Son Yağ Numune Tarihi', 'Bir Sonraki Yağ Numune', 'Notlar', 'Son Alternatör Gresleme Saati', 'Son Alternatör Gresleme Tarihi', 'Bir Sonraki Alternatör Gresleme', 'Alternatör Notlar'];
    const motorHoursData = [
      ['GM-1', '0', '0', '', '500', 'Otomatik hesaplanır', '0', '', '1000', ''],
      ['GM-2', '0', '0', '', '500', 'Otomatik hesaplanır', '0', '', '1000', ''],
      ['GM-3', '0', '0', '', '500', 'Otomatik hesaplanır', '0', '', '1000', '']
    ];
    
    motorHoursSheet.getRange('A1:J1')
      .setValues([motorHoursHeaders])
      .setFontWeight('bold')
      .setBackground('#ea4335')
      .setFontColor('white');
    
    motorHoursSheet.getRange('A2:J4')
      .setValues(motorHoursData);
  }
  
  motorHoursSheet.setColumnWidth(1, 80);
  motorHoursSheet.setColumnWidth(2, 120);
  motorHoursSheet.setColumnWidth(3, 150);
  motorHoursSheet.setColumnWidth(4, 150);
  motorHoursSheet.setColumnWidth(5, 150);
  motorHoursSheet.setColumnWidth(6, 200);
  motorHoursSheet.setColumnWidth(7, 180);
  motorHoursSheet.setColumnWidth(8, 180);
  motorHoursSheet.setColumnWidth(9, 200);
  motorHoursSheet.setColumnWidth(10, 200);
  
  Logger.log('Tüm sayfalar başarılya kontrol edildi ve hazırlandı');
}

// Bakım kaydı kaydet
function saveMaintenanceRecord(ss, params) {
  try {
    Logger.log('=== BAKIM KAYDI BAŞLATILIYOR ===');
    Logger.log('Raw parametreler: ' + JSON.stringify(params));
    
    // Parametreleri array'den string'e çevir - güçlendirilmiş versiyon
    const getParam = (key) => {
      const val = params[key];
      Logger.log('getParam - ' + key + ': ' + JSON.stringify(val) + ' (type: ' + typeof val + ')');
      if (Array.isArray(val)) return val[0] || '';
      if (typeof val === 'undefined' || val === null) return '';
      return String(val);
    };
    
    const sheet = ss.getSheetByName(SHEET_NAMES.MAINTENANCE);
    if (!sheet) {
      throw new Error('Bakımlar sayfası bulunamadı');
    }
    
    Logger.log('Sayfa bulundu: ' + sheet.getName());
    
    // Kayıt numarasını al
    const lastRow = sheet.getLastRow();
    Logger.log('Son satır: ' + lastRow);
    
    const recordNo = lastRow === 1 ? 'BK-00001' : generateRecordNo(sheet.getRange(lastRow, 1).getValue());
    Logger.log('Kayıt numarası: ' + recordNo);
    
    // Dosya yükleme (varsa)
    let uploadedFiles = '';
    const filesParam = getParam('files');
    if (filesParam && filesParam !== 'undefined' && filesParam !== '' && filesParam !== '[]') {
      Logger.log('Dosyalar işleniyor...');
      uploadedFiles = uploadFilesToDrive(params, getParam('type') || 'normal');
      Logger.log('Dosyalar yüklendi: ' + uploadedFiles);
    }
    
    // Parametreleri al ve kontrol et
    const record = [
      recordNo || '',
      getParam('date') || new Date().toLocaleDateString('tr-TR'),
      getParam('time') || new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'}),
      getParam('motor') || '',
      getParam('type') || '',
      getParam('subtype') || '',
      getParam('technician') || '',
      getParam('company') || '',
      getParam('notes') || '',
      uploadedFiles,
      getParam('status') || 'Aktif',
      new Date().toLocaleString('tr-TR')
    ];
    
    Logger.log('Kayıt dizisi oluşturuldu, uzunluk: ' + record.length);
    Logger.log('Kayıt verisi: ' + JSON.stringify(record));
    
    // Yeni satır ekle
    sheet.appendRow(record);
    Logger.log('Satır eklendi');
    
    // Formatlama
    const newRow = sheet.getLastRow();
    sheet.getRange(newRow, 1, 1, 12).setFontFamily('Arial').setFontSize(10);
    Logger.log('Formatlama yapıldı');
    
    // Kayıt numarasını güncelle
    updateLastRecordNo(ss, recordNo);
    Logger.log('Kayıt numarası güncellendi');
    
    // İstatistikleri güncelle
    updateStatistics(ss, params);
    Logger.log('İstatistikler güncellendi');
    
    Logger.log('Bakım kaydı başarıyla eklendi: ' + recordNo);
    
    return createResponse(true, "Kayıt başarıyla eklendi", {
      recordNo: recordNo,
      timestamp: new Date().toLocaleString('tr-TR'),
      files: uploadedFiles
    });
    
  } catch (error) {
    Logger.log('KAYIT HATASI: ' + error.toString());
    Logger.log('Hata detayı: ' + error.stack);
    throw new Error('Kayıt eklenemedi: ' + error.toString());
  }
}

// Dosyaları Drive'a yükle - Klasör linki döndür
function uploadFilesToDrive(params, maintenanceType) {
  try {
    Logger.log('=== DOSYA YÜKLEME BAŞLATILIYOR ===');
    
    // maintenanceType'ı string'e çevir (array olabilir)
    const typeStr = Array.isArray(maintenanceType) ? maintenanceType[0] : maintenanceType;
    Logger.log('Maintenance type (string): ' + typeStr);
    
    // files parametresini array'den string'e çevir
    const filesParam = Array.isArray(params.files) ? params.files[0] : params.files;
    Logger.log('Files param: ' + filesParam);
    
    // Bakım türüne göre doğru Drive folder'ını seç
    let folderId = DRIVE_FOLDERS.NORMAL;
    let folderName = 'Normal Bakım';
    
    if (typeStr) {
      const typeLower = typeStr.toLowerCase();
      if (typeLower.includes('periyodik')) {
        folderId = DRIVE_FOLDERS.PERIODIC;
        folderName = 'Periyodik Bakım';
      } else if (typeLower.includes('normal')) {
        folderId = DRIVE_FOLDERS.NORMAL;
        folderName = 'Normal Bakım';
      } else if (typeLower.includes('ariza')) {
        folderId = DRIVE_FOLDERS.FAULT;
        folderName = 'Arıza Bakımı';
      }
    }
    
    Logger.log('Seçilen folder: ' + folderName + ' (' + folderId + ')');
    
    // Drive folder'ını al
    const folder = DriveApp.getFolderById(folderId);
    const folderUrl = 'https://drive.google.com/drive/folders/' + folderId;
    Logger.log('Folder URL: ' + folderUrl);
    
    // Dosya kontrolü
    let filesArray = [];
    if (filesParam && filesParam !== 'undefined' && filesParam !== '' && filesParam !== '[]') {
      try {
        filesArray = JSON.parse(filesParam);
        Logger.log('Parse edilen dosya sayısı: ' + filesArray.length);
      } catch (e) {
        Logger.log('JSON parse hatası: ' + e);
      }
    }
    
    // motor parametresini al
    const motorParam = Array.isArray(params.motor) ? params.motor[0] : params.motor;
    
    let uploadedCount = 0;
    
    // Dosyaları yükle
    if (filesArray && filesArray.length > 0) {
      filesArray.forEach((fileData, index) => {
        try {
          if (!fileData.base64) {
            Logger.log('Dosya ' + (index + 1) + ' için base64 yok');
            return;
          }
          
          let base64Data = fileData.base64;
          if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
          }
          
          const blob = Utilities.base64Decode(base64Data);
          const fileBlob = Utilities.newBlob(blob, fileData.type || 'application/octet-stream', fileData.name);
          
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const fileName = `${motorParam || 'Bilinmeyen'}_${typeStr || 'Bakim'}_${timestamp}_${fileData.name}`;
          
          const driveFile = folder.createFile(fileBlob.setName(fileName));
          driveFile.setSharing(DriveApp.Domain.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          
          uploadedCount++;
          Logger.log('✅ Yüklendi: ' + fileName);
          
        } catch (err) {
          Logger.log('❌ Dosya hatası: ' + err);
        }
      });
    }
    
    Logger.log('=== YÜKLEME TAMAMLANDI ===');
    Logger.log(uploadedCount + ' dosya yüklendi');
    
    // Klasör linkini döndür
    return folderUrl;
    
  } catch (error) {
    Logger.log('❌❌ Drive hatası: ' + error);
    return '';
  }
}

// Kayıt numarası oluştur
function generateRecordNo(lastRecordNo) {
  if (!lastRecordNo) return 'BK-00001';
  
  const match = lastRecordNo.match(/BK-(\d+)/);
  if (!match) return 'BK-00001';
  
  const nextNumber = parseInt(match[1]) + 1;
  return 'BK-' + nextNumber.toString().padStart(5, '0');
}

// Son kayıt numarasını güncelle
function updateLastRecordNo(ss, recordNo) {
  const settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const recordNoCell = settingsSheet.getRange('A2:B2');
  recordNoCell.setValues([['Son Kayıt No', recordNo]]);
}

// İstatistikleri güncelle
function updateStatistics(ss, params) {
  try {
    const statsSheet = ss.getSheetByName(SHEET_NAMES.STATISTICS);
    const today = new Date().toLocaleDateString('tr-TR');
    
    // Bugünün kaydını bul veya oluştur
    const lastRow = statsSheet.getLastRow();
    let todayRow = -1;
    
    for (let i = 2; i <= lastRow; i++) {
      if (statsSheet.getRange(i, 1).getValue() === today) {
        todayRow = i;
        break;
      }
    }
    
    if (todayRow === -1) {
      // Yeni gün kaydı oluştur
      statsSheet.appendRow([today, 0, 0, 0, 0, 0, 0, 0]);
      todayRow = statsSheet.getLastRow();
    }
    
    // İstatistikleri güncelle
    const currentValues = statsSheet.getRange(todayRow, 2, 1, 7).getValues()[0];
    
    currentValues[0]++; // Toplam bakım
    
    // Bakım türüne göre artır - array kontrolü ekle
    const maintenanceType = Array.isArray(params.type) ? params.type[0] : (params.type || '');
    Logger.log('updateStatistics - type: ' + maintenanceType);
    
    if (maintenanceType.toLowerCase().includes('periyodik')) {
      currentValues[1]++;
    } else if (maintenanceType.toLowerCase().includes('normal')) {
      currentValues[2]++;
    } else if (maintenanceType.toLowerCase().includes('ariza')) {
      currentValues[3]++;
    }
    
    // Motor bazında artır - array kontrolü ekle
    const motor = Array.isArray(params.motor) ? params.motor[0] : (params.motor || '');
    Logger.log('updateStatistics - motor: ' + motor);
    
    if (motor.toLowerCase() === 'gm1' || motor.toLowerCase().includes('gm-1')) {
      currentValues[4]++;
    } else if (motor.toLowerCase() === 'gm2' || motor.toLowerCase().includes('gm-2')) {
      currentValues[5]++;
    } else if (motor.toLowerCase() === 'gm3' || motor.toLowerCase().includes('gm-3')) {
      currentValues[6]++;
    }
    
    // Değerleri geri yaz
    statsSheet.getRange(todayRow, 2, 1, 7).setValues([currentValues]);
    Logger.log('İstatistikler güncellendi');
  } catch (error) {
    Logger.log('❌ updateStatistics hatası: ' + error.toString());
  }
}

// İstatistikleri al
function getMaintenanceStats(ss) {
  try {
    const statsSheet = ss.getSheetByName(SHEET_NAMES.STATISTICS);
    const maintenanceSheet = ss.getSheetByName(SHEET_NAMES.MAINTENANCE);
    
    // Eğer sheet yoksa boş yanıt dön
    if (!statsSheet || !maintenanceSheet) {
      Logger.log('Sheet bulunamadı, boş istatistik dönülüyor');
      return createResponse(true, "Henüz veri yok", {
        stats: { total: 0, monthly: 0, faults: 0, technicians: 0 },
        chartData: { labels: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'], data: [0, 0, 0, 0, 0, 0] }
      });
    }
    
    // Genel istatistikler
    const totalMaintenance = Math.max(0, maintenanceSheet.getLastRow() - 1); // Başlık satırını çıkar
    
    // Bu ayki bakımlar
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    let monthlyCount = 0;
    let faultCount = 0;
    
    const technicians = new Set();
    
    for (let i = 2; i <= maintenanceSheet.getLastRow(); i++) {
      const row = maintenanceSheet.getRange(i, 1, 1, 12).getValues()[0];
      const recordDate = new Date(row[1]); // Tarih kolonu
      
      if (recordDate.getMonth() === currentMonth && recordDate.getFullYear() === currentYear) {
        monthlyCount++;
      }
      
      if (row[4] && row[4].toLowerCase().includes('ariza')) {
        faultCount++;
      }
      
      if (row[6]) { // Teknisyen kolonu
        technicians.add(row[6]);
      }
    }
    
    const stats = {
      total: totalMaintenance,
      monthly: monthlyCount,
      faults: faultCount,
      technicians: technicians.size
    };
    
    // Grafik verisi (son 6 ay)
    const chartData = generateChartData(statsSheet);
    
    return createResponse(true, "İstatistikler alındı", {
      stats: stats,
      chartData: chartData
    });
    
  } catch (error) {
    Logger.log('❌ getMaintenanceStats hatası: ' + error.toString());
    // Hata durumunda boş ama geçerli bir yanıt dön
    return createResponse(true, "Henüz veri yok", {
      stats: { total: 0, monthly: 0, faults: 0, technicians: 0 },
      chartData: { labels: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'], data: [0, 0, 0, 0, 0, 0] }
    });
  }
}

// Grafik verisi oluştur
function generateChartData(statsSheet) {
  const labels = [];
  const data = [];
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'];
  
  // Son 6 ayın verisini al
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthStr = months[date.getMonth()];
    const dateStr = date.toLocaleDateString('tr-TR');
    
    labels.push(monthStr);
    
    // Bu ayın verisini bul
    let monthTotal = 0;
    const lastRow = statsSheet.getLastRow();
    
    for (let j = 2; j <= lastRow; j++) {
      if (statsSheet.getRange(j, 1).getValue() === dateStr) {
        monthTotal = statsSheet.getRange(j, 2).getValue();
        break;
      }
    }
    
    data.push(monthTotal || 0);
  }
  
  return {
    labels: labels,
    data: data
  };
}

// Rapor al
function getMaintenanceReport(ss, params) {
  try {
    const sheet = ss.getSheetByName(SHEET_NAMES.MAINTENANCE);
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return createResponse(true, "Kayıt bulunamadı", {
        summary: { total: 0, periodic: 0, normal: 0, fault: 0 },
        records: []
      });
    }
    
    // Filtreleme - array parametreleri düzelt
    let motor = (Array.isArray(params.motor) ? params.motor[0] : params.motor) || '';
    let type = (Array.isArray(params.type) ? params.type[0] : params.type) || '';
    const range = parseInt(Array.isArray(params.range) ? params.range[0] : params.range) || 30;
    
    // Tür filtresi mapping - frontend'den gelen değerleri sheet değerlerine çevir
    const typeMapping = {
      'periodic': 'Periyodik',
      'normal': 'Normal',
      'fault': 'Arıza'
    };
    
    // Eğer mapping varsa kullan, yoksa orijinal değeri kullan
    if (type && typeMapping[type.toLowerCase()]) {
      type = typeMapping[type.toLowerCase()];
    }
    
    Logger.log('Rapor filtresi - Motor: ' + motor + ', Tip: ' + type + ', Aralık: ' + range);
    
    // Tarih aralığı
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - range);
    
    const records = [];
    let summary = { total: 0, periodic: 0, normal: 0, fault: 0 };
    
    // Son kayıttan başlayarak geriye doğru oku (12 sütun)
    for (let i = lastRow; i >= 2; i--) {
      const row = sheet.getRange(i, 1, 1, 12).getValues()[0];
      const recordDate = new Date(row[1]);
      
      // Tarih aralığı kontrolü
      if (recordDate >= startDate && recordDate <= endDate) {
        // Motor filtresi
        if (motor && !row[3].toLowerCase().includes(motor.toLowerCase())) {
          continue;
        }
        
        // Tür filtresi
        if (type && !row[4].toLowerCase().includes(type.toLowerCase())) {
          continue;
        }
        
        // Özeti güncelle
        summary.total++;
        const maintenanceType = row[4] ? row[4].toLowerCase() : '';
        if (maintenanceType.includes('periyodik')) summary.periodic++;
        else if (maintenanceType.includes('normal')) summary.normal++;
        else if (maintenanceType.includes('ariza')) summary.fault++;
        
        // Kayıt ekle
        records.push({
          date: row[1],
          motor: row[3],
          type: row[4],
          technician: row[6],
          operation: row[5] || row[8] // Bakım tipi veya notlar
        });
      }
    }
    
    return createResponse(true, "Rapor oluşturuldu", {
      summary: summary,
      records: records.reverse() // Tarih sırasına göre
    });
    
  } catch (error) {
    throw new Error('Rapor alınamadı: ' + error.toString());
  }
}

// Aktif kayıtları getir (Durum = Aktif)
function getActiveRecords(ss, params) {
  try {
    const sheet = ss.getSheetByName(SHEET_NAMES.MAINTENANCE);
    if (!sheet) {
      return createResponse(false, 'Bakımlar sayfası bulunamadı');
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return createResponse(true, 'Kayıt bulunamadı', { records: [] });
    }
    
    // Filtreleme parametreleri
    const motor = (Array.isArray(params.motor) ? params.motor[0] : params.motor) || '';
    const type = (Array.isArray(params.type) ? params.type[0] : params.type) || '';
    
    Logger.log('Aktif kayıtlar filtresi - Motor: ' + motor + ', Tip: ' + type);
    
    // Verileri oku
    const data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
    const records = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const recordStatus = row[10]; // Durum sütunu (11. sütun, index 10)
      
      // Sadece Aktif kayıtları göster
      if (recordStatus !== 'Aktif') continue;
      
      const recordMotor = row[3]; // Motor
      const recordType = row[4]; // Tür
      
      // Motor filtresi
      if (motor && recordMotor !== motor) continue;
      
      // Tür filtresi
      if (type && recordType !== type) continue;
      
      records.push({
        recordNo: row[0],
        date: row[1],
        time: row[2],
        motor: recordMotor,
        type: recordType,
        subtype: row[5],
        technician: row[6],
        company: row[7],
        notes: row[8],
        files: row[9],
        status: recordStatus,
        timestamp: row[11]
      });
    }
    
    Logger.log('Bulunan aktif kayıt sayısı: ' + records.length);
    
    return createResponse(true, 'Aktif kayıtlar getirildi', { records: records });
    
  } catch (error) {
    Logger.log('Aktif kayıtlar getirilirken hata: ' + error.toString());
    return createResponse(false, 'Kayıtlar getirilemedi: ' + error.toString());
  }
}

// Kayıt kapat (durumu Pasif yap)
function closeRecord(ss, params) {
  try {
    const recordNo = (Array.isArray(params.recordNo) ? params.recordNo[0] : params.recordNo) || '';
    
    if (!recordNo) {
      return createResponse(false, 'Kayıt numarası belirtilmedi');
    }
    
    Logger.log('Kayıt kapatılıyor: ' + recordNo);
    
    const sheet = ss.getSheetByName(SHEET_NAMES.MAINTENANCE);
    if (!sheet) {
      return createResponse(false, 'Bakımlar sayfası bulunamadı');
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return createResponse(false, 'Kayıt bulunamadı');
    }
    
    // Kayıt numarasını bul
    const data = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
    let foundRow = -1;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === recordNo) {
        foundRow = i + 2; // +2 çünkü başlık satırı var ve 1-indexed
        break;
      }
    }
    
    if (foundRow === -1) {
      return createResponse(false, 'Kayıt bulunamadı: ' + recordNo);
    }
    
    // Durum sütununu güncelle (11. sütun, index 10)
    sheet.getRange(foundRow, 11).setValue('Pasif');
    sheet.getRange(foundRow, 12).setValue(new Date().toLocaleString('tr-TR'));
    
    Logger.log('Kayıt kapatıldı: ' + recordNo + ' (Satır: ' + foundRow + ')');
    
    return createResponse(true, 'Kayıt başarıyla kapatıldı', { 
      recordNo: recordNo,
      closedAt: new Date().toLocaleString('tr-TR')
    });
    
  } catch (error) {
    Logger.log('Kayıt kapatılırken hata: ' + error.toString());
    return createResponse(false, 'Kayıt kapatılamadı: ' + error.toString());
  }
}

// Motor saatlerini getir
function getMotorHours(ss) {
  try {
    const sheet = ss.getSheetByName(SHEET_NAMES.MOTOR_HOURS);
    if (!sheet) {
      return createResponse(false, 'Motor Saatleri sayfası bulunamadı');
    }
    
    const data = sheet.getRange(2, 1, 3, 10).getValues();
    const motors = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const currentHours = parseInt(row[1]) || 0;
      
      // Yağ numune hesaplamaları
      const lastOilSample = parseInt(row[2]) || 0;
      const nextOilSample = parseInt(row[4]) || 500;
      const remainingOilHours = nextOilSample - (currentHours - lastOilSample);
      const needsOilSample = remainingOilHours <= 50; // 50 saat kala uyarı
      
      // Alternatör gresleme hesaplamaları
      const lastAlternatorGrease = parseInt(row[6]) || 0;
      const nextAlternatorGrease = parseInt(row[8]) || 1000;
      const remainingAltHours = nextAlternatorGrease - (currentHours - lastAlternatorGrease);
      const needsAlternatorGrease = remainingAltHours <= 100; // 100 saat kala uyarı
      
      motors.push({
        motor: row[0],
        currentHours: currentHours,
        // Yağ numune
        lastOilSampleHours: lastOilSample,
        lastOilSampleDate: row[3],
        nextOilSampleHours: nextOilSample,
        remainingOilHours: remainingOilHours,
        needsOilSample: needsOilSample,
        notes: row[5],
        // Alternatör gresleme
        lastAlternatorGreaseHours: lastAlternatorGrease,
        lastAlternatorGreaseDate: row[7],
        nextAlternatorGreaseHours: nextAlternatorGrease,
        remainingAltHours: remainingAltHours,
        needsAlternatorGrease: needsAlternatorGrease,
        alternatorNotes: row[9]
      });
    }
    
    return createResponse(true, 'Motor saatleri getirildi', { motors: motors });
    
  } catch (error) {
    Logger.log('Motor saatleri getirilirken hata: ' + error.toString());
    return createResponse(false, 'Motor saatleri getirilemedi: ' + error.toString());
  }
}

// Motor saatlerini güncelle
function updateMotorHours(ss, params) {
  try {
    const motor = (Array.isArray(params.motor) ? params.motor[0] : params.motor) || '';
    const hours = parseInt(Array.isArray(params.hours) ? params.hours[0] : params.hours) || 0;
    
    if (!motor || hours < 0) {
      return createResponse(false, 'Geçersiz motor veya saat değeri');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAMES.MOTOR_HOURS);
    if (!sheet) {
      return createResponse(false, 'Motor Saatleri sayfası bulunamadı');
    }
    
    // Motor satırını bul
    const data = sheet.getRange(2, 1, 3, 1).getValues();
    let foundRow = -1;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === motor) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return createResponse(false, 'Motor bulunamadı: ' + motor);
    }
    
    // Çalışma saatini güncelle
    sheet.getRange(foundRow, 2).setValue(hours);
    
    Logger.log('Motor saati güncellendi: ' + motor + ' = ' + hours + ' saat');
    
    return createResponse(true, 'Motor saati güncellendi', { 
      motor: motor,
      hours: hours
    });
    
  } catch (error) {
    Logger.log('Motor saati güncellenirken hata: ' + error.toString());
    return createResponse(false, 'Motor saati güncellenemedi: ' + error.toString());
  }
}

// Yağ numune alma kaydı
function updateOilSample(ss, params) {
  try {
    const motor = (Array.isArray(params.motor) ? params.motor[0] : params.motor) || '';
    const currentHours = parseInt(Array.isArray(params.currentHours) ? params.currentHours[0] : params.currentHours) || 0;
    
    if (!motor) {
      return createResponse(false, 'Motor belirtilmedi');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAMES.MOTOR_HOURS);
    if (!sheet) {
      return createResponse(false, 'Motor Saatleri sayfası bulunamadı');
    }
    
    // Motor satırını bul
    const data = sheet.getRange(2, 1, 3, 1).getValues();
    let foundRow = -1;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === motor) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return createResponse(false, 'Motor bulunamadı: ' + motor);
    }
    
    const today = new Date().toLocaleDateString('tr-TR');
    const nextSample = currentHours + 500; // Bir sonraki yağ numune +500 saat
    
    // Yağ numune bilgilerini güncelle
    sheet.getRange(foundRow, 2).setValue(currentHours); // Mevcut saat
    sheet.getRange(foundRow, 3).setValue(currentHours); // Son yağ numune saati
    sheet.getRange(foundRow, 4).setValue(today); // Son yağ numune tarihi
    sheet.getRange(foundRow, 5).setValue(nextSample); // Bir sonraki yağ numune
    
    Logger.log('Yağ numune kaydı güncellendi: ' + motor + ' - ' + currentHours + ' saat');
    
    return createResponse(true, 'Yağ numune kaydı güncellendi', { 
      motor: motor,
      currentHours: currentHours,
      nextOilSample: nextSample,
      date: today
    });
    
  } catch (error) {
    Logger.log('Yağ numune kaydı güncellenirken hata: ' + error.toString());
    return createResponse(false, 'Yağ numune kaydı güncellenemedi: ' + error.toString());
  }
}

// Alternatör gresleme kaydı
function updateAlternatorGrease(ss, params) {
  try {
    const motor = (Array.isArray(params.motor) ? params.motor[0] : params.motor) || '';
    const currentHours = parseInt(Array.isArray(params.currentHours) ? params.currentHours[0] : params.currentHours) || 0;
    
    if (!motor) {
      return createResponse(false, 'Motor belirtilmedi');
    }
    
    const sheet = ss.getSheetByName(SHEET_NAMES.MOTOR_HOURS);
    if (!sheet) {
      return createResponse(false, 'Motor Saatleri sayfası bulunamadı');
    }
    
    // Motor satırını bul
    const data = sheet.getRange(2, 1, 3, 1).getValues();
    let foundRow = -1;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === motor) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return createResponse(false, 'Motor bulunamadı: ' + motor);
    }
    
    const today = new Date().toLocaleDateString('tr-TR');
    const nextGrease = currentHours + 1000; // Bir sonraki alternatör gresleme +1000 saat
    
    // Alternatör gresleme bilgilerini güncelle (sütun 7, 8, 9)
    sheet.getRange(foundRow, 7).setValue(currentHours); // Son alternatör gresleme saati
    sheet.getRange(foundRow, 8).setValue(today); // Son alternatör gresleme tarihi
    sheet.getRange(foundRow, 9).setValue(nextGrease); // Bir sonraki alternatör gresleme
    
    Logger.log('Alternatör gresleme kaydı güncellendi: ' + motor + ' - ' + currentHours + ' saat');
    
    return createResponse(true, 'Alternatör gresleme kaydı güncellendi', { 
      motor: motor,
      currentHours: currentHours,
      nextAlternatorGrease: nextGrease,
      date: today
    });
    
  } catch (error) {
    Logger.log('Alternatör gresleme kaydı güncellenirken hata: ' + error.toString());
    return createResponse(false, 'Alternatör gresleme kaydı güncellenemedi: ' + error.toString());
  }
}

// Sistemi başlat
function initializeSystem(ss) {
  try {
    createSheets(ss);
    
    const spreadsheetId = ss.getId();
    const spreadsheetUrl = ss.getUrl();
    
    return createResponse(true, "Sistem başarıyla başlatıldı", {
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: spreadsheetUrl,
      message: "Google Sheets başarıyla oluşturuldu ve hazırlandı."
    });
    
  } catch (error) {
    throw new Error('Sistem başlatılamadı: ' + error.toString());
  }
}

// Bağlantı testi
function testConnection(ss) {
  try {
    if (!ss) {
      // Eğer ss gönderilmemişse, spreadsheet'i al
      ss = getOrCreateSpreadsheet();
    }
    
    const spreadsheetId = ss.getId();
    const spreadsheetUrl = ss.getUrl();
    const sheetNames = [];
    
    // Tüm sayfaları kontrol et
    const sheets = ss.getSheets();
    sheets.forEach(sheet => {
      sheetNames.push(sheet.getName());
    });
    
    return createResponse(true, "Bağlantı başarılı", {
      spreadsheetId: spreadsheetId,
      spreadsheetUrl: spreadsheetUrl,
      sheetNames: sheetNames,
      totalSheets: sheets.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    throw new Error('Bağlantı testi başarısız: ' + error.toString());
  }
}

// Yanıt oluştur
function createResponse(success, message, data = null) {
  const response = {
    success: success,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  if (data) {
    // Veriyi direkt response objesine spread et (data.data içine değil)
    Object.assign(response, data);
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// Test fonksiyonları
function testSystem() {
  try {
    Logger.log('=== SİSTEM TEST BAŞLATILIYOR ===');
    
    const ss = getOrCreateSpreadsheet();
    Logger.log('Spreadsheet ID: ' + ss.getId());
    Logger.log('URL: ' + ss.getUrl());
    
    // Sayfaları kontrol et
    const sheets = ss.getSheets();
    Logger.log('Toplam sayfa sayısı: ' + sheets.length);
    
    sheets.forEach(sheet => {
      Logger.log('Sayfa: ' + sheet.getName() + ' (Son satır: ' + sheet.getLastRow() + ')');
    });
    
    // Test kaydı ekle
    Logger.log('Test kaydı ekleniyor...');
    const testParams = {
      action: 'save',
      date: new Date().toLocaleDateString('tr-TR'),
      time: new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'}),
      motor: 'GM-1',
      type: 'Periyodik',
      subtype: '2000 Saat',
      technician: 'Test Teknisyen',
      company: 'İç Destek',
      notes: 'Test kaydı'
    };
    
    const result = saveMaintenanceRecord(ss, testParams);
    Logger.log('Test sonucu: ' + result.getContent());
    
    // Bağlantı testi
    Logger.log('Bağlantı testi yapılıyor...');
    const testResult = testConnection(ss);
    Logger.log('Bağlantı testi: ' + testResult.getContent());
    
    Logger.log('=== SİSTEM TEST BAŞARILI ===');
    
  } catch (error) {
    Logger.log('Test hatası: ' + error.toString());
    Logger.log('Hata detayı: ' + error.stack);
  }
}

// Manuel kurulum fonksiyonu
function manualSetup() {
  const ss = getOrCreateSpreadsheet();
  const result = initializeSystem(ss);
  
  Logger.log('=== BAKIM TAKİP SİSTEMİ KURULUMU ===');
  Logger.log('Spreadsheet ID: ' + ss.getId());
  Logger.log('URL: ' + ss.getUrl());
  Logger.log('Sonuç: ' + result.getContent());
  
  return ss.getId();
}

// Drive folder test fonksiyonu
function testDriveFolders() {
  try {
    Logger.log('=== DRIVE FOLDER TEST ===');
    
    Object.keys(DRIVE_FOLDERS).forEach(key => {
      const folderId = DRIVE_FOLDERS[key];
      const folder = DriveApp.getFolderById(folderId);
      Logger.log(`${key}: ${folder.getName()} (${folderId})`);
    });
    
    Logger.log('Tüm Drive folder\'ları başarıyla ulaşıldı');
    
  } catch (error) {
    Logger.log('Drive folder hatası: ' + error.toString());
  }
}

// Basit kayıt test fonksiyonu
function testSimpleSave() {
  try {
    Logger.log('=== BASİT KAYIT TESTİ ===');
    
    const ss = getOrCreateSpreadsheet();
    Logger.log('Spreadsheet: ' + ss.getUrl());
    
    const testParams = {
      action: 'save',
      date: '06.04.2026',
      time: '13:43',
      motor: 'GM-1',
      type: 'Periyodik',
      subtype: '2000 Saat',
      technician: 'ibrahim-ogun',
      company: 'internal',
      notes: 'Test kaydı',
      status: 'Aktif',
      files: '[]'
    };
    
    Logger.log('Test params: ' + JSON.stringify(testParams));
    
    const result = saveMaintenanceRecord(ss, testParams);
    Logger.log('Test sonucu: ' + result.getContent());
    
    Logger.log('=== BASİT KAYIT TESTİ BAŞARILI ===');
    
  } catch (error) {
    Logger.log('Basit kayıt test hatası: ' + error.toString());
    Logger.log('Hata detayı: ' + error.stack);
  }
}
