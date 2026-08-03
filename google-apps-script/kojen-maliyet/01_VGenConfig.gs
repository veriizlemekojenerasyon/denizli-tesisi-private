/**
 * 01_VGenConfig.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Proje genelinde kullanılan tüm sabitler tek yerde.
 * Spreadsheet ID, endpoint'ler, sayfa adları, varsayılan değerler.
 *
 * Başka bir dosyada sabit değiştirmeniz gerekirse BURAYA bakın.
 */

// ─── SPREADSHEET ─────────────────────────────────────────────────────────────

/** Ana Kojen Maliyet Google Sheets dosyası */
var CFG_SS_ID = '1lZ7HtzEdvRCk94JAMP63XAtI78AT_GABM2dsPkkEsdY';

/** Yıllık enerji üretim toplamları (harici dosya) */
var CFG_YILLIK_SS_ID  = '1ncEnE6vG76HIXFzJRRWz2yehiN2oolg4t2pzfbKt2vI';
var CFG_YILLIK_SAYFA  = 'YillikEnerjiToplam-2026';

// ─── API ENDPOINT'LERİ ───────────────────────────────────────────────────────

var CFG_API_BASE      = 'https://api.vgen.vtcenerji.com';

/** PTF/SMF piyasa fiyatları */
var CFG_PTF_URL       = CFG_API_BASE + '/common/electricitymarketprices';

/** AMR tüketim/üretim okumaları */
var CFG_AMR_URL       = CFG_API_BASE + '/vsensor/electricity/readings/reports/assetamrconsumptiongenerations';

/** VGen plan verileri (bağlantı noktaları) */
var CFG_PLAN_URL      = CFG_API_BASE + '/vplantmanager/plannings/assetplans/withdetails';

// ─── TENANT & ASSET ──────────────────────────────────────────────────────────

var CFG_TENANT_ID     = '26e3e75d-4a9c-4095-8e06-928d74dce07f';
var CFG_AMR_ASSET_ID  = 'ddf0cf67-b302-431f-999b-3de26cfac7c4';

// ─── SAYFA ADLARI ────────────────────────────────────────────────────────────

var CFG_SAYFA_PIYASA      = 'PiyasaFiyatlari';
var CFG_SAYFA_AMR_SAATLIK = 'AMR_Saatlik';
var CFG_SAYFA_BAGLANTI    = 'BaglantiNoktalari';
var CFG_SAYFA_MALIYET     = 'Maliyet';
var CFG_SAYFA_MALIYET_LOG = 'MaliyetDegisiklikLog';

// Aylık sayfa önekleri
var CFG_PREF_KOJEN_CALISMA = 'KojenCalisma_';
var CFG_PREF_DENGESIZLIK   = 'DengesizlikMaliyet_';
var CFG_PREF_FATURA        = 'Faturalasma_';

// ─── VERİ TOPLAYICI AYARLAR ──────────────────────────────────────────────────

/** Bağlantı noktası filtresinde kullanılan anahtar kelimeler (küçük harf) */
var CFG_ASSET_KEYWORDS = ['denizli'];

/** VGen plan verisi için 24 saatlik periyot listesi */
var CFG_SAATLER_24 = [
  '00:00:00','01:00:00','02:00:00','03:00:00','04:00:00','05:00:00',
  '06:00:00','07:00:00','08:00:00','09:00:00','10:00:00','11:00:00',
  '12:00:00','13:00:00','14:00:00','15:00:00','16:00:00','17:00:00',
  '18:00:00','19:00:00','20:00:00','21:00:00','22:00:00','23:00:00'
];

/** Türkçe kısa ay adları (index 1-12) */
var CFG_AYLAR_KISA = ['','Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

/** Türkçe uzun ay adları (index 1-12) */
var CFG_AYLAR_UZUN = ['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                      'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

// ─── ORTAK YARDIMCILAR ───────────────────────────────────────────────────────

/** Sayıyı 2 haneli stringe çevirir: 5 → '05' */
function cfgPad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** Date objesini 'YYYY-MM-DD' formatına çevirir */
function cfgIsoDate(d) {
  return d.getFullYear() + '-' + cfgPad2(d.getMonth() + 1) + '-' + cfgPad2(d.getDate());
}

/** Dünün Date objesini döner (saat 00:00:00) */
function cfgDunTarihi() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Sayıyı 3 ondalığa yuvarlar */
function cfgYuvarla(n) {
  return Math.round((parseFloat(n) || 0) * 1000) / 1000;
}

/** Virgülü noktaya çevirip float'a parse eder */
function cfgParseFloat(v) {
  return parseFloat(String(v || '0').replace(',', '.')) || 0;
}

/**
 * Ana spreadsheet'i açar.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function cfgSsAc() {
  return SpreadsheetApp.openById(CFG_SS_ID);
}

/**
 * Belirtilen sayfayı getirir; yoksa oluşturur.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} sayfaAdi
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function cfgGetOrCreateSheet(ss, sayfaAdi) {
  var sheet = ss.getSheetByName(sayfaAdi);
  if (!sheet) sheet = ss.insertSheet(sayfaAdi);
  return sheet;
}

/**
 * Belirtilen sayfayı siler ve yeniden oluşturur (merge kalıntısı kalmaz).
 */
function cfgSayfayiSifirla(ss, sayfaAdi) {
  var mevcut = ss.getSheetByName(sayfaAdi);
  if (mevcut) ss.deleteSheet(mevcut);
  return ss.insertSheet(sayfaAdi);
}

/**
 * Başlık satırı yazar.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} satir      Satır numarası (1-indexed)
 * @param {string[]} basliklar
 * @param {string} [bgRenk]   Arka plan rengi
 * @param {string} [fontRenk] Yazı rengi
 */
function cfgYazBaslik(sheet, satir, basliklar, bgRenk, fontRenk) {
  sheet.getRange(satir, 1, 1, basliklar.length)
    .setValues([basliklar])
    .setBackground(bgRenk  || '#2c5282')
    .setFontColor(fontRenk || '#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
}

/**
 * Bir aralığa tüm kenarlık çizer.
 */
function cfgSetBorder(sheet, ilkSatir, sonSatir, ilkSutun, sonSutun) {
  if (sonSatir < ilkSatir || sonSutun < ilkSutun) return;
  sheet.getRange(ilkSatir, ilkSutun, sonSatir - ilkSatir + 1, sonSutun - ilkSutun + 1)
    .setBorder(true, true, true, true, true, true,
               '#BBBBBB', SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * BaglantiNoktalari sayfasındaki "Veri Tarihi" hücresinden tarih okur.
 * Bulamazsa dünün tarihini döner.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {Date}
 */
function cfgBaglantiTarihiOku(ss) {
  try {
    var sheet = ss.getSheetByName(CFG_SAYFA_BAGLANTI);
    if (!sheet || sheet.getLastRow() < 2) return cfgDunTarihi();
    var veriler = sheet.getRange(1, 1, sheet.getLastRow(), 3).getValues();
    for (var i = 0; i < veriler.length; i++) {
      if (String(veriler[i][0]).indexOf('Veri Tarihi') !== -1) {
        var parcalar = String(veriler[i][1]).trim().split('.');
        if (parcalar.length === 3) {
          return new Date(parseInt(parcalar[2]), parseInt(parcalar[1]) - 1, parseInt(parcalar[0]));
        }
      }
    }
  } catch(e) { /* sessiz hata */ }
  return cfgDunTarihi();
}

/**
 * Maliyet sayfasında ay/yıl için satır numarasını bulur.
 * @returns {number} Satır numarası; bulunamazsa 0
 */
function cfgMaliyetSatiriBul(ss, ay, yil) {
  var sheet = ss.getSheetByName(CFG_SAYFA_MALIYET);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var veriler = sheet.getRange(2, 2, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < veriler.length; i++) {
    if (parseInt(veriler[i][0]) === ay && parseInt(veriler[i][1]) === yil) return i + 2;
  }
  return 0;
}

/**
 * Türkçe karakter normalizasyonu (asset adı eşleştirme için).
 */
function cfgNormalize(text) {
  return String(text || '').toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/Ü/g, 'u')
    .replace(/ş/g, 's').replace(/Ş/g, 's')
    .replace(/ö/g, 'o').replace(/Ö/g, 'o')
    .replace(/ç/g, 'c').replace(/Ç/g, 'c');
}
