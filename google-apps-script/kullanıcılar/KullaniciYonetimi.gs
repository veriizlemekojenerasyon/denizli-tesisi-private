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
      case 'sendResetCode':
        result = sendResetCode(data);
        break;
      case 'verifyResetCode':
        result = verifyResetCode(data);
        break;
      case 'resetPassword':
        result = resetPassword(data);
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
 * Email ile kullanici bul
 */
function getUserByEmail(email) {
  const users = getAllUsers();
  if (!users.success) return null;
  
  return users.users.find(u => u.email === email) || null;
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

/**
 * 📧 SIFRE SIFIRLAMA - Kod gonderme
 * En basit yontem: 6 haneli kod gonderme
 */
function sendResetCode(data) {
  try {
    const email = data.email;
    if (!email) return { success: false, error: 'Email adresi gerekli!' };
    
    // Kullaniciyi bul
    const user = getUserByEmail(email);
    if (!user) return { success: false, error: 'Bu email adresi ile kayitli kullanici bulunamadi!' };
    
    // 6 haneli rastgele kod olustur
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 15); // 15 dakika gecerli
    
    // Kodu Properties'e kaydet (gecici)
    const codeKey = 'reset_' + email;
    PropertiesService.getScriptProperties().setProperty(codeKey, JSON.stringify({
      code: resetCode,
      expiry: expiryTime.getTime(),
      email: email
    }));
    
    // Email gonder - Gonderen adi: Denizli Tesisi Sistem
    const subject = 'Sifre Sifirlama Kodu - Denizli Tesisi';
    const body = `
Sayin ${user.firstName} ${user.lastName},

Sifre sifirlama talebiniz alindi.

Sifirlama Kodunuz: ${resetCode}

Bu kod 15 dakika gecerlidir.

Eger bu talebi siz yapmadisaniz, lutfen bu emaili dikkate almayin.

Saygilarimizla,
Denizli Tesisi Yonetim Sistemi
    `;
    
    // GmailApp otomatik olarak script sahibinin email adresini kullanir
    // Gonderen adi olarak "Denizli Tesisi Sistem" gosterilir
    GmailApp.sendEmail(email, subject, body, {
      name: 'Denizli Tesisi Sistem'
    });
    
    return { 
      success: true, 
      message: 'Sifirlama kodu email adresinize gonderildi!'
    };
    
  } catch (error) {
    return { success: false, error: 'Kod gonderme hatasi: ' + error.toString() };
  }
}

/**
 * 🔐 SIFRE SIFIRLAMA - Kod dogrulama
 */
function verifyResetCode(data) {
  try {
    const email = data.email;
    const code = data.code;
    
    if (!email || !code) return { success: false, error: 'Email ve kod gerekli!' };
    
    const codeKey = 'reset_' + email;
    const storedData = PropertiesService.getScriptProperties().getProperty(codeKey);
    
    if (!storedData) return { success: false, error: 'Kod bulunamadi veya suresi doldu!' };
    
    const resetData = JSON.parse(storedData);
    const now = new Date().getTime();
    
    if (now > resetData.expiry) {
      PropertiesService.getScriptProperties().deleteProperty(codeKey);
      return { success: false, error: 'Kod suresi doldu! Lutfen yeni kod talep edin.' };
    }
    
    if (resetData.code !== code) {
      return { success: false, error: 'Kod hatali!' };
    }
    
    return { success: true, message: 'Kod dogrulandi!' };
    
  } catch (error) {
    return { success: false, error: 'Dogrulama hatasi: ' + error.toString() };
  }
}

/**
 * 🔑 SIFRE SIFIRLAMA - Yeni sifre kaydetme
 */
function resetPassword(data) {
  try {
    const email = data.email;
    const code = data.code;
    const newPassword = data.newPassword;
    
    if (!email || !code || !newPassword) {
      return { success: false, error: 'Email, kod ve yeni sifre gerekli!' };
    }
    
    if (newPassword.length < 6) {
      return { success: false, error: 'Sifre en az 6 karakter olmali!' };
    }
    
    // Once kodu dogrula
    const verifyResult = verifyResetCode({ email: email, code: code });
    if (!verifyResult.success) return verifyResult;
    
    // Kullaniciyi bul ve guncelle
    const sheet = getOrCreateSheet();
    const users = getAllUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) return { success: false, error: 'Kullanici bulunamadi!' };
    
    // Yeni sifreyi hash'le ve kaydet
    const hashedPassword = hashPassword(newPassword);
    const rowIndex = user.rowIndex;
    sheet.getRange(rowIndex, 4).setValue(hashedPassword); // Sifre kolonu
    
    // Kodu sil
    PropertiesService.getScriptProperties().deleteProperty('reset_' + email);
    
    return { success: true, message: 'Sifreniz basariyla degistirildi!' };
    
  } catch (error) {
    return { success: false, error: 'Sifre degistirme hatasi: ' + error.toString() };
  }
}
