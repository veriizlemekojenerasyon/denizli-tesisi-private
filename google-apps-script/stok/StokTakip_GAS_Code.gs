/**
 * STOK TAKİP - Google Apps Script Kodu
 * - Malzeme yönetimi ve stok takibi
 * - Stok giriş/çıkış işlemleri
 * - Kritik stok uyarıları
 * - Otomatik ID atama
 */

// CORS ayarları
var STOK_WRITE_LOCK_WAIT_MS = 5000;

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function isStockWriteAction(action) {
  return [
    'addMaterial',
    'updateMaterial',
    'deleteMaterial',
    'addTransaction'
  ].indexOf(action) !== -1;
}

function handleRequest(e) {
  var action = e && e.parameter ? e.parameter.action : '';
  var lock = null;
  try {
    if (isStockWriteAction(action)) {
      lock = LockService.getScriptLock();
      lock.waitLock(STOK_WRITE_LOCK_WAIT_MS);
    }
    
    var result = {};
    
    switch(action) {
      case 'addMaterial':
        result = addMaterial(e.parameter);
        break;
      case 'updateMaterial':
        result = updateMaterial(e.parameter);
        break;
      case 'deleteMaterial':
        result = deleteMaterial(e.parameter);
        break;
      case 'getMaterials':
        result = getMaterials();
        break;
      case 'addTransaction':
        result = addTransaction(e.parameter);
        break;
      case 'getTransactions':
        result = getTransactions(e.parameter);
        break;
      case 'getStockSummary':
        result = getStockSummary();
        break;
      case 'getLowStockItems':
        result = getLowStockItems();
        break;
      case 'exportToExcel':
        result = exportToExcel();
        break;
      default:
        result = { success: false, error: 'Geçersiz işlem' };
    }
    
    if (lock) {
      lock.releaseLock();
      lock = null;
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    if (lock) {
      try {
        lock.releaseLock();
      } catch (releaseError) {}
    }
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Yeni malzeme ekle
function addMaterial(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('StokMalzemeler');
    
    // Sayfa yoksa otomatik oluştur
    if (!sheet) {
      sheet = createStokMalzemelerSheet();
    }
    
    // Aynı kodlu malzeme var mı kontrol et
    var lastRow = sheet.getLastRow();
    var nextID = 1;
    
    if (lastRow > 1) {
      var codes = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
      
      for (var i = 0; i < codes.length; i++) {
        if (codes[i][0] === data.materialCode) {
          return { success: false, error: 'Bu malzeme kodu zaten var!' };
        }
      }
      
      // Son ID'yi bul
      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
      var maxID = 0;
      for (var j = 0; j < ids.length; j++) {
        var idNum = parseInt(ids[j][0]) || 0;
        if (idNum > maxID) maxID = idNum;
      }
      nextID = maxID + 1;
    }
    
    // Malzeme ekle
    var kayitTarihi = formatDateTimeTR(new Date());
    
    sheet.appendRow([
      nextID.toString(),
      data.materialCode || '',
      data.materialName || '',
      data.materialCategory || '',
      parseFloat(data.materialQuantity) || 0,
      data.materialUnit || '',
      parseFloat(data.minStock) || 0,
      data.materialDescription || '',
      data.createdBy || 'Admin',
      kayitTarihi,
      kayitTarihi  // Son güncelleme tarihi
    ]);
    
    // Yeni satır formatı
    var newRow = sheet.getLastRow();
    sheet.getRange(newRow, 1, 1, 10).setHorizontalAlignment('center');
    sheet.getRange(newRow, 1, 1, 10).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    // Stok durumu kontrolü
    checkStockStatus(nextID.toString(), parseFloat(data.materialQuantity) || 0, parseFloat(data.minStock) || 0);
    
    return { success: true, message: 'Malzeme başarıyla eklendi! (ID: ' + nextID + ')' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Malzeme güncelle
function updateMaterial(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('StokMalzemeler');
    
    if (!sheet) {
      return { success: false, error: 'Sayfa bulunamadı!' };
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    // ID'yi bul
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    var foundRow = -1;
    
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === data.materialId) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return { success: false, error: 'Malzeme bulunamadı!' };
    }
    
    // Malzeme bilgilerini güncelle
    var guncellemeTarihi = formatDateTimeTR(new Date());
    
    if (data.materialName) sheet.getRange(foundRow, 3).setValue(data.materialName);
    if (data.materialCategory) sheet.getRange(foundRow, 4).setValue(data.materialCategory);
    if (data.materialQuantity) sheet.getRange(foundRow, 5).setValue(parseFloat(data.materialQuantity));
    if (data.materialUnit) sheet.getRange(foundRow, 6).setValue(data.materialUnit);
    if (data.minStock) sheet.getRange(foundRow, 7).setValue(parseFloat(data.minStock));
    if (data.materialDescription) sheet.getRange(foundRow, 8).setValue(data.materialDescription);
    
    sheet.getRange(foundRow, 10).setValue(guncellemeTarihi); // Son güncelleme tarihi
    
    // Stok durumu kontrolü
    var currentQuantity = parseFloat(sheet.getRange(foundRow, 5).getDisplayValue()) || 0;
    var minStock = parseFloat(sheet.getRange(foundRow, 7).getDisplayValue()) || 0;
    checkStockStatus(data.materialId, currentQuantity, minStock);
    
    return { success: true, message: 'Malzeme başarıyla güncellendi!' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Malzeme sil
function deleteMaterial(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('StokMalzemeler');
    
    if (!sheet) {
      return { success: false, error: 'Sayfa bulunamadı!' };
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, error: 'Kayıt bulunamadı!' };
    }
    
    // ID'yi bul
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    var foundRow = -1;
    
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === data.materialId) {
        foundRow = i + 2;
        break;
      }
    }
    
    if (foundRow === -1) {
      return { success: false, error: 'Malzeme bulunamadı!' };
    }
    
    // Malzemeyi sil
    sheet.deleteRow(foundRow);
    
    return { success: true, message: 'Malzeme başarıyla silindi!' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Tüm malzemeleri getir
function getMaterials() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('StokMalzemeler');
    
    if (!sheet) {
      return { success: true, data: [], message: 'Sayfa henüz oluşturulmamış.' };
    }
    
    if (sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getDisplayValues();
    var materials = [];
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var quantity = parseFloat(row[4]) || 0;
      var minStock = parseFloat(row[6]) || 0;
      var status = 'normal';
      
      if (quantity <= 0) {
        status = 'out';
      } else if (quantity <= minStock) {
        status = 'low';
      }
      
      materials.push({
        id: row[0],
        code: row[1],
        name: row[2],
        category: row[3],
        quantity: quantity,
        unit: row[5],
        minStock: minStock,
        description: row[7],
        createdBy: row[8],
        createdDate: row[9],
        lastUpdated: row[10],
        status: status
      });
    }
    
    return { success: true, data: materials };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Stok işlemi ekle
function addTransaction(data) {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('StokIslemleri');
    
    // Sayfa yoksa otomatik oluştur
    if (!sheet) {
      sheet = createStokIslemleriSheet();
    }
    
    // Malzeme var mı kontrol et
    var materialSheet = spreadsheet.getSheetByName('StokMalzemeler');
    if (!materialSheet) {
      return { success: false, error: 'Malzeme sayfası bulunamadı!' };
    }
    
    var materialRow = findMaterialRow(materialSheet, data.materialId);
    if (materialRow === -1) {
      return { success: false, error: 'Malzeme bulunamadı!' };
    }
    
    // İşlem miktarını kontrol et
    var transactionQuantity = parseFloat(data.transactionQuantity) || 0;
    var currentQuantity = parseFloat(materialSheet.getRange(materialRow, 5).getDisplayValue()) || 0;
    
    if (data.transactionType === 'out' && transactionQuantity > currentQuantity) {
      return { success: false, error: 'Yetersiz stok! Mevcut: ' + currentQuantity + ', İstenen: ' + transactionQuantity };
    }
    
    // İşlem ekle
    var nextID = getNextTransactionId(sheet);
    var formattedDate = formatDateTR(data.transactionDate);
    var kayitTarihi = formatDateTimeTR(new Date());
    
    // Personel adını büyük harf yap
    var personelAdi = (data.transactionPerson || '').toString().toUpperCase();
    
    // İşlem tipini Türkçe'ye çevir
    var islemTipi = data.transactionType === 'out' ? 'ÇIKIŞ' : 'GİRİŞ';
    
    sheet.appendRow([
      nextID.toString(),
      data.materialId || '',
      data.materialName || '',
      islemTipi,
      transactionQuantity,
      data.materialUnit || '',
      formattedDate,
      personelAdi,
      data.transactionReason || '',
      kayitTarihi
    ]);
    
    // Yeni satır formatı
    var newRow = sheet.getLastRow();
    sheet.getRange(newRow, 1, 1, 10).setHorizontalAlignment('center');
    sheet.getRange(newRow, 1, 1, 10).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
    
    // Malzeme stoğunu güncelle
    var newQuantity = currentQuantity;
    if (data.transactionType === 'in') {
      newQuantity += transactionQuantity;
    } else if (data.transactionType === 'out') {
      newQuantity -= transactionQuantity;
    }
    
    materialSheet.getRange(materialRow, 5).setValue(newQuantity);
    materialSheet.getRange(materialRow, 10).setValue(kayitTarihi); // Son güncelleme
    
    // Stok durumu kontrolü
    var minStock = parseFloat(materialSheet.getRange(materialRow, 7).getDisplayValue()) || 0;
    checkStockStatus(data.materialId, newQuantity, minStock);
    
    return { success: true, message: 'İşlem başarıyla kaydedildi! (ID: ' + nextID + ')' };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// İşlemleri getir
function getTransactions(params) {
  try {
    params = params || {};
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName('StokIslemleri');
    
    if (!sheet) {
      return { success: true, data: [], message: 'Sayfa henüz oluşturulmamış.' };
    }
    
    if (sheet.getLastRow() < 2) {
      return { success: true, data: [] };
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getDisplayValues();
    var transactions = [];
    var rawLimit = String(params.limit || params.count || '').toLowerCase();
    var readAll = rawLimit === 'all' || rawLimit === 'tum' || rawLimit === 'tumu' || rawLimit === '0';
    var limit = readAll ? data.length : (parseInt(rawLimit, 10) || 50);
    var startIndex = Math.max(0, data.length - Math.max(1, limit));

    if (rawLimit) {
      for (var limitedIndex = data.length - 1; limitedIndex >= startIndex; limitedIndex--) {
        var limitedRow = data[limitedIndex];
        transactions.push({
          id: limitedRow[0],
          materialId: limitedRow[1],
          materialName: limitedRow[2],
          type: limitedRow[3],
          quantity: parseFloat(limitedRow[4]) || 0,
          unit: limitedRow[5],
          date: limitedRow[6],
          person: limitedRow[7],
          reason: limitedRow[8],
          createdDate: limitedRow[9]
        });
      }

      return { success: true, data: transactions };
    }
    
    for (var i = data.length - 1; i >= Math.max(0, data.length - 50); i--) { // Son 50 işlem
      var row = data[i];
      transactions.push({
        id: row[0],
        materialId: row[1],
        materialName: row[2],
        type: row[3],
        quantity: parseFloat(row[4]) || 0,
        unit: row[5],
        date: row[6],
        person: row[7],
        reason: row[8],
        createdDate: row[9]
      });
    }
    
    return { success: true, data: transactions };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Stok özeti getir
function getStockSummary() {
  try {
    var materials = getMaterials();
    if (!materials.success) {
      return materials;
    }
    
    var totalMaterials = materials.data.length;
    var lowStockCount = 0;
    var outOfStockCount = 0;
    var monthlyIn = 0;
    var monthlyOut = 0;
    
    var currentMonth = new Date().getMonth();
    var currentYear = new Date().getFullYear();
    
    // Bu ayki işlemleri say
    var transactions = getTransactions();
    if (transactions.success) {
      for (var i = 0; i < transactions.data.length; i++) {
        var trans = transactions.data[i];
        var transDate = new Date(trans.date.split('.').reverse().join('-'));
        
        if (transDate.getMonth() === currentMonth && transDate.getFullYear() === currentYear) {
          if (trans.type === 'GİRİŞ') {
            monthlyIn += trans.quantity;
          } else if (trans.type === 'ÇIKIŞ') {
            monthlyOut += trans.quantity;
          }
        }
      }
    }
    
    // Stok durumlarını say
    for (var j = 0; j < materials.data.length; j++) {
      var material = materials.data[j];
      if (material.status === 'low') {
        lowStockCount++;
      } else if (material.status === 'out') {
        outOfStockCount++;
      }
    }
    
    return {
      success: true,
      data: {
        totalMaterials: totalMaterials,
        lowStockCount: lowStockCount,
        outOfStockCount: outOfStockCount,
        monthlyIn: monthlyIn,
        monthlyOut: monthlyOut
      }
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Kritik stoktaki malzemeleri getir
function getLowStockItems() {
  try {
    var materials = getMaterials();
    if (!materials.success) {
      return materials;
    }
    
    var lowStockItems = [];
    
    for (var i = 0; i < materials.data.length; i++) {
      var material = materials.data[i];
      if (material.status === 'low' || material.status === 'out') {
        lowStockItems.push(material);
      }
    }
    
    return { success: true, data: lowStockItems };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Excel'e aktar
function exportToExcel() {
  try {
    var materials = getMaterials();
    if (!materials.success) {
      return materials;
    }
    
    // CSV formatında veri oluştur
    var csvData = 'ID,Kod,Ad,Kategori,Miktar,Birim,Min.Stok,Açıklama,Durum\n';
    
    for (var i = 0; i < materials.data.length; i++) {
      var material = materials.data[i];
      var statusText = material.status === 'low' ? 'DÜŞÜK' : (material.status === 'out' ? 'YOK' : 'NORMAL');
      csvData += material.id + ',' + material.code + ',' + material.name + ',' + 
                 material.category + ',' + material.quantity + ',' + material.unit + ',' + 
                 material.minStock + ',' + material.description + ',' + statusText + '\n';
    }
    
    return { 
      success: true, 
      data: csvData,
      filename: 'Stok_Listesi_' + formatDateTR(new Date()) + '.csv'
    };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// Yardımcı fonksiyonlar
function createStokMalzemelerSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.insertSheet('StokMalzemeler');
  
  var headers = [
    'ID', 'Malzeme Kodu', 'Malzeme Adı', 'Kategori', 'Miktar', 'Birim', 
    'Minimum Stok', 'Açıklama', 'Oluşturan', 'Oluşturma Tarihi', 'Son Güncelleme'
  ];
  
  sheet.appendRow(headers);
  
  // Başlık formatı
  var headerRange = sheet.getRange(1, 1, 1, 11);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#27ae60');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  
  // Sütun genişlikleri
  sheet.setColumnWidth(1, 60);    // ID
  sheet.setColumnWidth(2, 120);   // Malzeme Kodu
  sheet.setColumnWidth(3, 200);   // Malzeme Adı
  sheet.setColumnWidth(4, 120);   // Kategori
  sheet.setColumnWidth(5, 100);   // Miktar
  sheet.setColumnWidth(6, 80);    // Birim
  sheet.setColumnWidth(7, 100);   // Minimum Stok
  sheet.setColumnWidth(8, 200);   // Açıklama
  sheet.setColumnWidth(9, 120);   // Oluşturan
  sheet.setColumnWidth(10, 140);  // Oluşturma Tarihi
  sheet.setColumnWidth(11, 140);  // Son Güncelleme
  
  headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  
  Logger.log('StokMalzemeler sayfası oluşturuldu.');
  return sheet;
}

function createStokIslemleriSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.insertSheet('StokIslemleri');
  
  var headers = [
    'ID', 'Malzeme ID', 'Malzeme Adı', 'İşlem Tipi', 'Miktar', 'Birim', 
    'Tarih', 'Personel', 'Neden', 'Kayıt Tarihi'
  ];
  
  sheet.appendRow(headers);
  
  // Başlık formatı
  var headerRange = sheet.getRange(1, 1, 1, 10);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#e74c3c');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');
  
  // Sütun genişlikleri
  sheet.setColumnWidth(1, 60);    // ID
  sheet.setColumnWidth(2, 100);   // Malzeme ID
  sheet.setColumnWidth(3, 180);   // Malzeme Adı
  sheet.setColumnWidth(4, 100);   // İşlem Tipi
  sheet.setColumnWidth(5, 80);    // Miktar
  sheet.setColumnWidth(6, 80);    // Birim
  sheet.setColumnWidth(7, 100);   // Tarih
  sheet.setColumnWidth(8, 120);   // Personel
  sheet.setColumnWidth(9, 120);   // Neden
  sheet.setColumnWidth(10, 140);  // Kayıt Tarihi
  
  headerRange.setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID);
  
  Logger.log('StokIslemleri sayfası oluşturuldu.');
  return sheet;
}

function findMaterialRow(sheet, materialId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === materialId) {
      return i + 2;
    }
  }
  
  return -1;
}

function getNextTransactionId(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  var maxID = 0;
  
  for (var i = 0; i < ids.length; i++) {
    var idNum = parseInt(ids[i][0]) || 0;
    if (idNum > maxID) maxID = idNum;
  }
  
  return maxID + 1;
}

function checkStockStatus(materialId, quantity, minStock) {
  // Kritik stok kontrolü - burada email bildirimi veya uyarı eklenebilir
  if (quantity <= minStock && quantity > 0) {
    Logger.log('UYARI: Malzeme ' + materialId + ' kritik stok seviyesinde! Mevcut: ' + quantity + ', Min: ' + minStock);
  } else if (quantity <= 0) {
    Logger.log('KRİTİK: Malzeme ' + materialId + ' stokta yok!');
  }
}

// Tarih formatı (dd.MM.yyyy)
function formatDateTR(dateString) {
  if (!dateString) return '';
  var date = new Date(dateString);
  var day = String(date.getDate()).padStart(2, '0');
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var year = date.getFullYear();
  return day + '.' + month + '.' + year;
}

// Tarih-saat formatı (dd.MM.yyyy HH:mm:ss)
function formatDateTimeTR(date) {
  if (!date) return '';
  var d = new Date(date);
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var year = d.getFullYear();
  var hours = String(d.getHours()).padStart(2, '0');
  var minutes = String(d.getMinutes()).padStart(2, '0');
  var seconds = String(d.getSeconds()).padStart(2, '0');
  return day + '.' + month + '.' + year + ' ' + hours + ':' + minutes + ':' + seconds;
}
