/**
 * Ayarlar sayfasını otomatik güncellemek için trigger kurulumu
 */

/**
 * Her gün saat 08:00'de Ayarlar sayfasını günceller
 */
function updateSettingsDailyTrigger() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  try {
    // Motor saatlerini ve planları güncelle
    updateSettingsMotorHours(ss);
    
    Logger.log('Ayarlar sayfası başarıyla güncellendi: ' + new Date());
  } catch (error) {
    Logger.log('Ayarlar güncelleme hatası: ' + error.toString());
    
    // Hata durumunda mail gönder
    const email = getAlertEmail();
    if (email) {
      MailApp.sendEmail({
        to: email,
        subject: 'Ayarlar Sayfası Güncelleme Hatası',
        body: 'Ayarlar sayfası güncellenirken hata oluştu:\n\n' + error.toString()
      });
    }
  }
}

/**
 * Günlük trigger'ı kurar (her gün saat 08:00)
 */
function installDailySettingsUpdateTrigger() {
  // Önce mevcut trigger'ları temizle
  removeDailySettingsUpdateTrigger();
  
  // Yeni trigger kur - her gün saat 08:00
  ScriptApp.newTrigger('updateSettingsDailyTrigger')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
  
  Logger.log('Günlük Ayarlar güncelleme trigger\'ı kuruldu (her gün 08:00)');
}

/**
 * Saatlik trigger kurulumu (daha sık güncelleme için)
 */
function installHourlySettingsUpdateTrigger() {
  // Önce mevcut trigger'ları temizle
  removeDailySettingsUpdateTrigger();
  
  // Her 4 saatte bir güncelle
  ScriptApp.newTrigger('updateSettingsDailyTrigger')
    .timeBased()
    .everyHours(4)
    .create();
  
  Logger.log('4 saatlik Ayarlar güncelleme trigger\'ı kuruldu');
}

/**
 * Mevcut trigger'ları kaldırır
 */
function removeDailySettingsUpdateTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'updateSettingsDailyTrigger') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('Eski trigger silindi');
    }
  });
}

/**
 * Kurulu trigger'ları listeler
 */
function listSettingsTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let found = false;
  
  Logger.log('=== AYARLAR GÜNCELLEME TRİGGER\'LARI ===\n');
  
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'updateSettingsDailyTrigger') {
      found = true;
      Logger.log('Trigger ID: ' + trigger.getUniqueId());
      Logger.log('Fonksiyon: ' + trigger.getHandlerFunction());
      Logger.log('Tip: ' + trigger.getEventType());
      Logger.log('---');
    }
  });
  
  if (!found) {
    Logger.log('Ayarlar güncelleme için kurulu trigger bulunamadı.');
    Logger.log('Kurmak için: installDailySettingsUpdateTrigger() çalıştırın');
  }
}

/**
 * Manuel güncelleme - İstediğiniz zaman çalıştırabilirsiniz
 */
function manualUpdateSettings() {
  Logger.log('Manuel Ayarlar güncelleme başladı...');
  updateSettingsDailyTrigger();
  Logger.log('Manuel güncelleme tamamlandı!');
}
