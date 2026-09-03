/**
 * KOJEN MOTOR — Manuel Düzenleme Mirror Sync
 *
 * Bu dosya ANA MOTOR spreadsheet'inin (1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI)
 * GAS projesine eklenir.
 *
 * Kaynak spreadsheet'teki "Motor GM-1/2/3" sayfalarında elle yapılan
 * değişiklikleri (manuel düzenleme) otomatik olarak MirrorReader Web App
 * üzerinden mirror spreadsheet'e (Motor Mirror GM-1/2/3) yansıtır.
 *
 * AKIŞ:
 *   Kullanıcı "Motor GM-*" sayfasında hücre düzenler
 *   → motorMirror_onEdit tetiklenir
 *   → İlgili satır okunur
 *   → MirrorReader Web App'e updateRecord isteği gönderilir
 *   → Mirror sheet'teki kayıt güncellenir (veya yeni satır eklenir)
 *
 * KURULUM (tek seferlik):
 *   1. Bu kodu ana motor GAS projesine (kaynak spreadsheet) ekleyin
 *   2. Apps Script editöründen "motorMirror_installTrigger" fonksiyonunu seçin
 *   3. Run butonuna basın → onEdit trigger kurulur
 *   4. İzin isterse onaylayın
 *
 * NOT: Trigger kurulduktan sonra web app girişlerinden (kojen-motor-veri.html)
 *      gelen veriler zaten addRecord/updateRecord fonksiyonları içindeki
 *      mirrorAddRecord/mirrorUpdateRecord çağrılarıyla mirror'a yazılıyor.
 *      Bu trigger yalnızca Google Sheets'te DOĞRUDAN yapılan manuel
 *      değişiklikler için gereklidir.
 */

// ── Yapılandırma ──────────────────────────────────────────────────────────────

/**
 * MirrorReader Web App URL'i.
 * Deploy → Manage Deployments → URL'i buraya yapıştırın.
 * "Execute as: Me" + "Who has access: Anyone" olmalı.
 */
var MOTOR_MIRROR_READER_URL = 'https://script.google.com/macros/s/AKfycbzCbMnLTlKa3mV41AQT84al5L93qVQypbhPVcPENxwTsuuZNxcXLXAv9vOuzHy-rUXX/exec';

// ── onEdit Trigger Handler ────────────────────────────────────────────────────

/**
 * Kaynak spreadsheet'teki "Motor GM-*" sayfalarında yapılan manuel
 * düzenlemeleri mirror'a gönderir.
 *
 * Bu fonksiyon doğrudan çağrılmaz — installable onEdit trigger tarafından tetiklenir.
 */
function motorMirror_onEdit(e) {
  try {
    if (!e || !e.range) return;

    var sheet     = e.range.getSheet();
    var sheetName = sheet.getName();

    // Sadece "Motor GM-" ile başlayan KAYNAK sayfaları izle
    // "Motor Mirror GM-*" sayfaları bu trigger'ın konusu değil
    if (!/^Motor\s+GM-\d+$/i.test(sheetName)) return;

    var editedRow = e.range.getRow();
    if (editedRow < 2) return; // Başlık satırı — atla

    // Değişen satırın tüm verisini al (22 sütun)
    var rowData = sheet.getRange(editedRow, 1, 1, 22).getDisplayValues()[0];

    var tarih   = motorMirror_normalizeDateTR(rowData[0] || '');
    var vardiya = rowData[1] || '';
    var saat    = motorMirror_normalizeSaat(rowData[2] || '');
    var motor   = motorMirror_normalizeMotor(rowData[3] || '');

    // Zorunlu alanlar eksikse işlem yapma
    if (!tarih || !saat || !motor) {
      Logger.log('[MotorMirror] Eksik tarih/saat/motor, satir atlanadi: row=' + editedRow);
      return;
    }

    // Mirror'a gönderilecek parametreler
    // action=updateRecord: bulunamazsa yeni satır ekler (MirrorReader tarafında)
    var params = {
      action:                'updateRecord',
      type:                  'motor',
      tarih:                 tarih,           // DD.MM.YYYY formatında gönder
      vardiya:               vardiya,
      saat:                  saat,
      motor:                 motor,
      jenYatakSicaklikDE:    rowData[4]  || '0',
      jenYatakSicaklikNDE:   rowData[5]  || '0',
      sogutmaSuyuSicaklik:   rowData[6]  || '0',
      sogutmaSuyuBasinc:     rowData[7]  || '0',
      yagSicaklik:           rowData[8]  || '0',
      yagBasinc:             rowData[9]  || '0',
      sarjSicaklik:          rowData[10] || '0',
      sarjBasinc:            rowData[11] || '0',
      gazRegulatoru:         rowData[12] || '0',
      makineDairesiSicaklik: rowData[13] || '0',
      karterBasinc:          rowData[14] || '0',
      onKamaraFarkBasinc:    rowData[15] || '0',
      sargiSicaklik1:        rowData[16] || '0',
      sargiSicaklik2:        rowData[17] || '0',
      sargiSicaklik3:        rowData[18] || '0',
      durum:                 rowData[19] || 'NORMAL',
      kaydeden:              rowData[20] || '',
      kayitTarihi:           rowData[21] || ''
    };

    var queryParts = [];
    Object.keys(params).forEach(function(key) {
      queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    });

    var url = MOTOR_MIRROR_READER_URL + '?' + queryParts.join('&');

    try {
      var response = UrlFetchApp.fetch(url, {
        method:             'GET',
        muteHttpExceptions: true,
        followRedirects:    true
      });
      var code   = response.getResponseCode();
      var result = {};
      try {
        result = JSON.parse(response.getContentText() || '{}');
      } catch (parseErr) {
        Logger.log('[MotorMirror] JSON parse hatasi (HTTP ' + code + '): ' + response.getContentText().slice(0, 200));
        return;
      }

      if (result.success) {
        Logger.log('[MotorMirror] Sync basarili: ' + motor + ' ' + tarih + ' ' + saat);
      } else {
        Logger.log('[MotorMirror] Sync basarisiz: ' + (result.error || 'bilinmeyen hata') +
                   ' | motor=' + motor + ' tarih=' + tarih + ' saat=' + saat);
      }
    } catch (fetchErr) {
      Logger.log('[MotorMirror] Fetch hatasi: ' + fetchErr.toString());
    }

  } catch (err) {
    Logger.log('[MotorMirror] Genel hata (onEdit): ' + err.toString());
  }
}

// ── Trigger Yönetimi ──────────────────────────────────────────────────────────

/**
 * Installable onEdit trigger'ı kurar.
 * Bir kez çalıştırın — izin onayladıktan sonra aktif olur.
 */
function motorMirror_installTrigger() {
  // Mevcut aynı isimli trigger'ları temizle (çift kurulumu önle)
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'motorMirror_onEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('motorMirror_onEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  Logger.log('[MotorMirror] Installable onEdit trigger kuruldu.');
  return {
    success: true,
    message: 'Motor mirror onEdit trigger kuruldu. Motor GM-* sayfalarındaki manuel değişiklikler mirror\'a yansıyacak.'
  };
}

/**
 * Trigger'ı kaldırır.
 */
function motorMirror_removeTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'motorMirror_onEdit') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('[MotorMirror] ' + removed + ' trigger kaldirildi.');
  return { success: true, message: removed + ' trigger kaldirildi.' };
}

/**
 * Trigger durumunu kontrol eder.
 */
function motorMirror_checkTrigger() {
  var triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'motorMirror_onEdit';
  });
  return {
    success:      true,
    installed:    triggers.length > 0,
    triggerCount: triggers.length,
    mirrorUrl:    MOTOR_MIRROR_READER_URL,
    checkedAt:    new Date().toISOString()
  };
}

// ── Yardımcı Fonksiyonlar ─────────────────────────────────────────────────────

/** DD.MM.YYYY veya YYYY-MM-DD → DD.MM.YYYY (mirror standardı) */
function motorMirror_normalizeDateTR(value) {
  var text = String(value || '').trim();
  if (!text) return '';
  // YYYY-MM-DD → DD.MM.YYYY
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    var p = text.slice(0, 10).split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  // DD.MM.YYYY → olduğu gibi döndür
  return text;
}

/** Saat normalize: "8:00" → "08:00" */
function motorMirror_normalizeSaat(value) {
  var text = String(value || '').trim();
  if (!text) return '00:00';
  // 24:00 → 00:00
  if (text === '24:00' || text.indexOf('24:') === 0) return '00:00';
  var p = text.split(':');
  var h = parseInt(p[0] || '0', 10);
  var m = parseInt(p[1] || '0', 10);
  return (isNaN(h) ? '00' : String(h).padStart(2, '0')) + ':' +
         (isNaN(m) ? '00' : String(m).padStart(2, '0'));
}

/** Motor adı normalize: "GM1" / "gm-1" / "GM-1" → "GM-1" */
function motorMirror_normalizeMotor(value) {
  var text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  var match = text.match(/GM-?(\d+)$/);
  return match ? 'GM-' + match[1] : text;
}
