/**
 * KOJEN ENERJİ — Manuel Düzenleme Mirror Sync
 *
 * Bu dosya ANA ENERJİ spreadsheet'inin (1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI)
 * GAS projesine eklenir.
 *
 * Kaynak spreadsheet'teki "Enerji GM-1/2/3" sayfalarında elle yapılan
 * değişiklikleri (manuel düzenleme) otomatik olarak MirrorReader Web App
 * üzerinden mirror spreadsheet'e (Enerji Mirror GM-1/2/3) yansıtır.
 *
 * AKIŞ:
 *   Kullanıcı "Enerji GM-*" sayfasında hücre düzenler
 *   → enerjiMirror_onEdit tetiklenir
 *   → İlgili satır okunur
 *   → MirrorReader Web App'e updateRecord isteği gönderilir
 *   → Mirror sheet'teki kayıt güncellenir (veya yeni satır eklenir)
 *
 * KURULUM (tek seferlik):
 *   1. Bu kodu ana enerji GAS projesine (kaynak spreadsheet) ekleyin
 *   2. Apps Script editöründen "enerjiMirror_installTrigger" fonksiyonunu seçin
 *   3. Run butonuna basın → onEdit trigger kurulur
 *   4. İzin isterse onaylayın
 *
 * NOT: Web app girişlerinden (kojen-enerji-veri.html) gelen veriler zaten
 *      addRecord/updateRecord fonksiyonları içindeki enerjiMirrorAddRecord /
 *      enerjiMirrorUpdateRecord çağrılarıyla mirror'a yazılıyor.
 *      Bu trigger yalnızca Google Sheets'te DOĞRUDAN yapılan manuel
 *      değişiklikler için gereklidir.
 */

// ── Yapılandırma ──────────────────────────────────────────────────────────────

/**
 * MirrorReader Web App URL'i.
 * Deploy → Manage Deployments → URL'i buraya yapıştırın.
 * "Execute as: Me" + "Who has access: Anyone" olmalı.
 */
var ENERJI_MIRROR_READER_URL = 'https://script.google.com/macros/s/AKfycbzo65rO1ogFwYSu0kpSKBRX-E4hOIlXHMjoYo3_SpvRc4_U1PTZMq65NbXo88RpXAKV/exec';

// ── onEdit Trigger Handler ────────────────────────────────────────────────────

/**
 * Kaynak spreadsheet'teki "Enerji GM-*" sayfalarında yapılan manuel
 * düzenlemeleri mirror'a gönderir.
 *
 * Bu fonksiyon doğrudan çağrılmaz — installable onEdit trigger tarafından tetiklenir.
 */
function enerjiMirror_onEdit(e) {
  try {
    if (!e || !e.range) return;

    var sheet     = e.range.getSheet();
    var sheetName = sheet.getName();

    // Sadece "Enerji GM-" ile başlayan KAYNAK sayfaları izle
    // "Enerji Mirror GM-*" sayfaları bu trigger'ın konusu değil
    if (!/^Enerji\s+GM-\d+$/i.test(sheetName)) return;

    var editedRow = e.range.getRow();
    if (editedRow < 2) return; // Başlık satırı — atla

    // Değişen satırın tüm verisini al (18 sütun)
    var rowData = sheet.getRange(editedRow, 1, 1, 18).getDisplayValues()[0];

    var tarih   = enerjiMirror_normalizeDateTR(rowData[0] || '');
    var vardiya = rowData[1] || '';
    var saat    = enerjiMirror_normalizeSaat(rowData[2] || '');
    var motor   = enerjiMirror_normalizeMotor(rowData[3] || '');

    // Zorunlu alanlar eksikse işlem yapma
    if (!tarih || !saat || !motor) {
      Logger.log('[EnerjiMirror] Eksik tarih/saat/motor, satir atlanadi: row=' + editedRow);
      return;
    }

    // Mirror'a gönderilecek parametreler
    // action=updateRecord: bulunamazsa yeni satır ekler (MirrorReader tarafında)
    var params = {
      action:            'updateRecord',
      type:              'enerji',
      tarih:             tarih,           // DD.MM.YYYY formatında gönder
      vardiya:           vardiya,
      saat:              saat,
      motor:             motor,
      aydemVoltaji:      rowData[4]  || '0',
      aktifGuc:          rowData[5]  || '0',
      reaktifGuc:        rowData[6]  || '0',
      cosPhi:            rowData[7]  || '0',
      ortAkim:           rowData[8]  || '0',
      ortGerilim:        rowData[9]  || '0',
      notrAkim:          rowData[10] || '0',
      tahrikGerilimi:    rowData[11] || '0',
      toplamAktifEnerji: rowData[12] || '0',
      calismaSaati:      rowData[13] || '0',
      kalkisSayisi:      rowData[14] || '0',
      durum:             rowData[15] || 'NORMAL',
      kaydeden:          rowData[16] || '',
      kayitTarihi:       rowData[17] || ''
    };

    var queryParts = [];
    Object.keys(params).forEach(function(key) {
      queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    });

    var url = ENERJI_MIRROR_READER_URL + '?' + queryParts.join('&');

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
        Logger.log('[EnerjiMirror] JSON parse hatasi (HTTP ' + code + '): ' + response.getContentText().slice(0, 200));
        return;
      }

      if (result.success) {
        Logger.log('[EnerjiMirror] Sync basarili: ' + motor + ' ' + tarih + ' ' + saat);
      } else {
        Logger.log('[EnerjiMirror] Sync basarisiz: ' + (result.error || 'bilinmeyen hata') +
                   ' | motor=' + motor + ' tarih=' + tarih + ' saat=' + saat);
      }
    } catch (fetchErr) {
      Logger.log('[EnerjiMirror] Fetch hatasi: ' + fetchErr.toString());
    }

  } catch (err) {
    Logger.log('[EnerjiMirror] Genel hata (onEdit): ' + err.toString());
  }
}

// ── Trigger Yönetimi ──────────────────────────────────────────────────────────

/**
 * Installable onEdit trigger'ı kurar.
 * Bir kez çalıştırın — izin onayladıktan sonra aktif olur.
 */
function enerjiMirror_installTrigger() {
  // Mevcut aynı isimli trigger'ları temizle (çift kurulumu önle)
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'enerjiMirror_onEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('enerjiMirror_onEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  Logger.log('[EnerjiMirror] Installable onEdit trigger kuruldu.');
  return {
    success: true,
    message: 'Enerji mirror onEdit trigger kuruldu. Enerji GM-* sayfalarındaki manuel değişiklikler mirror\'a yansıyacak.'
  };
}

/**
 * Trigger'ı kaldırır.
 */
function enerjiMirror_removeTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'enerjiMirror_onEdit') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('[EnerjiMirror] ' + removed + ' trigger kaldirildi.');
  return { success: true, message: removed + ' trigger kaldirildi.' };
}

/**
 * Trigger durumunu kontrol eder.
 */
function enerjiMirror_checkTrigger() {
  var triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'enerjiMirror_onEdit';
  });
  return {
    success:      true,
    installed:    triggers.length > 0,
    triggerCount: triggers.length,
    mirrorUrl:    ENERJI_MIRROR_READER_URL,
    checkedAt:    new Date().toISOString()
  };
}

// ── Yardımcı Fonksiyonlar ─────────────────────────────────────────────────────

/** DD.MM.YYYY veya YYYY-MM-DD → DD.MM.YYYY (mirror standardı) */
function enerjiMirror_normalizeDateTR(value) {
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
function enerjiMirror_normalizeSaat(value) {
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

/** Motor adı normalize: "GM1" / "gm-1" → "GM-1" */
function enerjiMirror_normalizeMotor(value) {
  var text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  var match = text.match(/GM-?(\d+)$/);
  return match ? 'GM-' + match[1] : text;
}
