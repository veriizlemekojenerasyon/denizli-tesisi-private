/**
 * Kullanici Yonetimi - Google Apps Script
 * Google Sheets ile kullanici CRUD islemleri
 * 
 * KURULUM:
 * 1. Google Sheets'de yeni bir spreadsheet olustur
 * 2. Extensions > Apps Script ac
 * 3. Bu kodu yapistr
 * 4. Deploy > New Deployment > Web App
 * 5. Execute as: Me, Access: Anyone
 * 6. URL'i js/kullanici-yonetimi.js'deki USER_URL degiskenine yapistir
 */

// Sheet adi
const SHEET_NAME_KULLANICILAR = 'Kullanicilar';

/**
 * GET isteklerini handle et (CORS destekli)
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'test';
  
  // CORS header'lari
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    let result;
    
    switch(action) {
      case 'getAllUsers':
        result = getAllUsers();
        break;
      case 'test':
        result = { success: true, message: 'API calisiyor!' };
        break;
      default:
        result = { success: false, error: 'Bilinmeyen action: ' + action };
    }
    
    output.setContent(JSON.stringify(result));
    
  } catch(error) {
    output.setContent(JSON.stringify({
      success: false,
      error: error.toString()
    }));
  }
  
  return output;
}

/**
 * POST isteklerini handle et (CORS destekli)
 */
function doPost(e) {
  const action = (e && e.parameter && e.parameter.action) || '';
  let data = {};
  try {
    data = JSON.parse((e && e.parameter && e.parameter.data) || '{}');
  } catch (parseErr) {
    data = {};
  }
  
  // CORS header'lari
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    let result;
    
    switch(action) {
      case 'saveUser':
        result = saveUser(data);
        break;
      case 'updateUser':
        result = updateUser(data);
        break;
      case 'deleteUser':
        result = deleteUser(data);
        break;
      case 'validateLogin':
        result = validateLogin(data);
        break;
      default:
        result = { success: false, error: 'Bilinmeyen action: ' + action };
    }
    
    output.setContent(JSON.stringify(result));
    
  } catch(error) {
    output.setContent(JSON.stringify({
      success: false,
      error: error.toString()
    }));
  }
  
  return output;
}

/**
 * CORS preflight istekleri icin
 */
function doOptions(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  output.setContent(JSON.stringify({ success: true }));
  return output;
}

/**
 * Tüm kullanicilari getir
 */
function getAllUsers() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { success: true, users: [] };
  }
  
  const headers = data[0];
  const users = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const user = {};
    
    headers.forEach((header, index) => {
      const key = headerToKey(header);
      user[key] = row[index] || '';
    });
    
    // ID'yi sayiya cevir
    if (user.id) {
      user.id = parseInt(user.id) || user.id;
    }
    
    users.push(user);
  }
  
  return { success: true, users: users };
}

/**
 * Yeni kullanici kaydet
 */
function saveUser(data) {
  const sheet = getOrCreateSheet();
  
  // Data kontrolu
  if (!data || !data.email) {
    return { success: false, error: 'E-posta adresi gerekli!' };
  }
  
  // Email kontrolu - var mi?
  const existing = findUserByEmail(data.email);
  if (existing) {
    return { 
      success: false, 
      error: 'Bu e-posta adresi zaten kayitli!',
      duplicate: true 
    };
  }
  
  // ID ata
  data.id = data.id || Date.now();
  data.createdAt = data.createdAt || new Date().toLocaleDateString('tr-TR');
  
  // Satir olustur
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(header => {
    const key = headerToKey(header);
    return data[key] || '';
  });
  
  // Ekle
  sheet.appendRow(row);
  
  return { 
    success: true, 
    user: data,
    message: 'Kullanici basariyla kaydedildi!'
  };
}

/**
 * Kullanici guncelle
 */
function updateUser(data) {
  if (!data || !data.id) {
    return { success: false, error: 'Kullanici ID gerekli!' };
  }
  
  const sheet = getOrCreateSheet();
  const userData = getAllUsers();
  
  // Kullaniciyi bul
  const userIndex = userData.users.findIndex(u => u.id == data.id);
  if (userIndex === -1) {
    return { success: false, error: 'Kullanici bulunamadi!' };
  }
  
  // Email kontrolu (baska bir kullanici mi bu email'i kullaniyor?)
  const existing = findUserByEmail(data.email);
  if (existing && existing.id != data.id) {
    return { 
      success: false, 
      error: 'Bu e-posta adresi baska bir kullanici tarafindan kullaniliyor!'
    };
  }
  
  // Mevcut veriyi koru
  const existingUser = userData.users[userIndex];
  data.createdAt = existingUser.createdAt;
  data.password = data.password || existingUser.password; // Sifre guncellenmediyse koru
  
  // Sheet'te bul ve guncelle
  const allData = sheet.getDataRange().getValues();
  for (let i = 1; i < allData.length; i++) {
    if (allData[i][0] == data.id) {
      // ID sutun indexi 0 varsayimiyla
      const headers = allData[0];
      const row = headers.map((header, index) => {
        const key = headerToKey(header);
        return data[key] !== undefined ? data[key] : allData[i][index];
      });
      
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      break;
    }
  }
  
  return { 
    success: true, 
    user: data,
    message: 'Kullanici basariyla guncellendi!'
  };
}

/**
 * Kullanici sil
 */
function deleteUser(data) {
  if (!data || !data.email) {
    return { success: false, error: 'E-posta adresi gerekli!' };
  }
  
  const sheet = getOrCreateSheet();
  const allData = sheet.getDataRange().getValues();
  
  // Email'e gore bul
  for (let i = 1; i < allData.length; i++) {
    const emailIndex = allData[0].indexOf('E-posta');
    if (emailIndex !== -1 && allData[i][emailIndex] === data.email) {
      sheet.deleteRow(i + 1);
      return { 
        success: true, 
        message: 'Kullanici basariyla silindi!'
      };
    }
  }
  
  return { success: false, error: 'Kullanici bulunamadi!' };
}

/**
 * Giris dogrulama
 */
function validateLogin(data) {
  if (!data || !data.email || !data.password) {
    return { success: false, error: 'E-posta ve sifre gerekli!' };
  }
  
  const userData = getAllUsers();
  const inputEmail = String(data.email).toLowerCase().trim();
  const inputPassword = String(data.password).trim();
  
  const user = userData.users.find(u => {
    const userEmail = String(u.email || '').toLowerCase().trim();
    const userPassword = String(u.password || '').trim();
    return userEmail === inputEmail && userPassword === inputPassword;
  });
  
  if (user) {
    // Aktif mi?
    if (user.status !== 'active') {
      return { success: false, error: 'Hesabiniz pasif durumda!' };
    }
    
    // Sifreyi response'tan kaldir
    const { password, ...userWithoutPassword } = user;
    
    return { 
      success: true, 
      user: userWithoutPassword,
      message: 'Giris basarili!'
    };
  }
  
  return { success: false, error: 'E-posta veya sifre hatali!' };
}

/**
 * Email'e gore kullanici bul
 */
function findUserByEmail(email) {
  const userData = getAllUsers();
  return userData.users.find(u => u.email === email);
}

/**
 * Sheet'i al veya olustur
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Aktif spreadsheet bulunamadi! Lutfen bu scripti bir Google Sheet ile baglayin.');
  }
  let sheet = ss.getSheetByName(SHEET_NAME_KULLANICILAR);
  
  if (!sheet) {
    // Sheet olustur
    sheet = ss.insertSheet(SHEET_NAME_KULLANICILAR);
    
    // Header'lari ekle
    const headers = [
      'ID',
      'Ad',
      'Soyad',
      'E-posta',
      'Sifre',
      'Rol',
      'Durum',
      'Fotograf',
      'Kayit Tarihi'
    ];
    
    sheet.appendRow(headers);
    
    // Header stili
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#667eea');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    
    // Sutun genislikleri
    sheet.setColumnWidth(1, 15);   // ID
    sheet.setColumnWidth(2, 15);   // Ad
    sheet.setColumnWidth(3, 15);   // Soyad
    sheet.setColumnWidth(4, 25);   // E-posta
    sheet.setColumnWidth(5, 15);   // Sifre
    sheet.setColumnWidth(6, 12);   // Rol
    sheet.setColumnWidth(7, 12);   // Durum
    sheet.setColumnWidth(8, 30);   // Fotograf
    sheet.setColumnWidth(9, 15);   // Kayit Tarihi
    
    // Varsayilan admin kullanicisi ekle
    sheet.appendRow([
      1,
      'Admin',
      'Kullanici',
      'admin@sistem.com',
      '123456',
      'admin',
      'active',
      '',
      new Date().toLocaleDateString('tr-TR')
    ]);
  }
  
  return sheet;
}

/**
 * Header ismini key'e cevir
 */
function headerToKey(header) {
  const mapping = {
    'ID': 'id',
    'Ad': 'firstName',
    'Soyad': 'lastName',
    'E-posta': 'email',
    'Sifre': 'password',
    'Rol': 'role',
    'Durum': 'status',
    'Fotograf': 'photo',
    'Kayit Tarihi': 'createdAt'
  };
  
  return mapping[header] || (header ? header.toLowerCase().replace(/\s+/g, '') : '');
}

/**
 * Test fonksiyonu (Apps Script editor'den calistir)
 */
function testAPI() {
  // Test: Kullanici listesi
  Logger.log('=== TUM KULLANICILAR ===');
  const users = getAllUsers();
  Logger.log(users);
  
  // Test: Yeni kullanici ekle
  Logger.log('=== YENI KULLANICI ===');
  const newUser = saveUser({
    firstName: 'Test',
    lastName: 'Kullanici',
    email: 'test@example.com',
    password: 'test123',
    role: 'operator',
    status: 'active'
  });
  Logger.log(newUser);
  
  // Test: Giris dogrulama
  Logger.log('=== GIRIS DOGRULAMA ===');
  const login = validateLogin({
    email: 'admin@sistem.com',
    password: 'admin123'
  });
  Logger.log(login);
}
