/**
 * 00_VGenAuth.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * VGen / VTC Enerji ortak kimlik doğrulama katmanı.
 *
 * Tüm diğer modüller token almak için SADECE bu dosyadaki fonksiyonları çağırır.
 * Token Script Properties'te saklanır; süresi dolmak üzereyse otomatik yenilenir.
 *
 * Kurulum (bir kez çalıştırın):
 *   vgenKurulumYap('kullanici@eposta.com', 'sifre123')
 *
 * Token almak için:
 *   var token = vgenTokenAl();
 */

// ─── AUTH SABİTLERİ ───────────────────────────────────────────────────────────
// Bu değerlere dışarıdan erişilmez; yalnızca bu dosyadan okunur.

var _AUTH_LOGIN_URL  = 'https://login.vtcenerji.com/oauth/token';
var _AUTH_CLIENT_ID  = '6wgog3SuEZXxaA4GIjHfSzXnIQfPcy5v';
var _AUTH_AUDIENCE   = 'https://api.vgen.vtcenerji.com';
var _AUTH_SCOPE      = 'openid email offline_access';
var _AUTH_REALM      = 'Username-Password-Authentication';

var _PROP_TOKEN      = 'VGEN_ACCESS_TOKEN';
var _PROP_EXPIRY     = 'VGEN_ACCESS_TOKEN_EXPIRES_AT';
var _PROP_USERNAME   = 'VGEN_USERNAME';
var _PROP_PASSWORD   = 'VGEN_PASSWORD';

// ─── KURULUM ─────────────────────────────────────────────────────────────────

/**
 * Kullanıcı adı ve şifreyi Script Properties'e kaydeder, hemen token alır.
 * @param {string} kullanici  VTC kullanıcı e-postası
 * @param {string} sifre      VTC şifresi
 */
function vgenKurulumYap(kullanici, sifre) {
  if (!kullanici || kullanici === 'BURAYA_EMAIL_YAZ') {
    throw new Error('vgenKurulumYap: geçerli bir e-posta adresi girin.');
  }
  if (!sifre || sifre === 'BURAYA_SIFRE_YAZ') {
    throw new Error('vgenKurulumYap: geçerli bir şifre girin.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty(_PROP_USERNAME, kullanici);
  props.setProperty(_PROP_PASSWORD, sifre);
  props.deleteProperty(_PROP_TOKEN);
  props.deleteProperty(_PROP_EXPIRY);

  var token = _vgenTokenYenile(props);
  Logger.log('✅ Kurulum tamamlandı. Token alındı. Artık tüm modüller çalışabilir.');
  return { success: true };
}

/**
 * Kolaylık fonksiyonu: Doğrudan kaynak kodda çağırarak kurulum yapabilirsiniz.
 * Kullanım: aşağıdaki satırları doldurup bu fonksiyonu çalıştırın.
 */
function vgenKurulum() {
  var KULLANICI_ADI = 'BURAYA_EMAIL_YAZ';  // ← değiştirin
  var SIFRE         = 'BURAYA_SIFRE_YAZ';  // ← değiştirin
  return vgenKurulumYap(KULLANICI_ADI, SIFRE);
}

// ─── TOKEN AL ────────────────────────────────────────────────────────────────

/**
 * Geçerli access token'ı döndürür.
 * Süre dolmak üzereyse (5 dakika) otomatik yeniler.
 * Hiç token yoksa login endpoint'ine gider.
 *
 * @param {GoogleAppsScript.Properties.Properties} [props]  İsteğe bağlı — test için inject edilebilir
 * @returns {string} Bearer token
 */
function vgenTokenAl(props) {
  props = props || PropertiesService.getScriptProperties();
  var token  = props.getProperty(_PROP_TOKEN)  || '';
  var expiry = props.getProperty(_PROP_EXPIRY) || '';

  if (token && expiry) {
    var expDate = new Date(expiry);
    // 5 dakika tampon — GAS execution süresi içinde token sona ermez
    if (!isNaN(expDate.getTime()) && Date.now() < expDate.getTime() - 5 * 60 * 1000) {
      return token;
    }
    Logger.log('VGen: token süresi dolmak üzere, yenileniyor...');
  } else {
    Logger.log('VGen: token bulunamadı, giriş yapılıyor...');
  }

  return _vgenTokenYenile(props);
}

/**
 * Token'ı zorla yeniler (401/403 sonrası çağrılır).
 * @returns {string} Yeni token
 */
function vgenTokenYenile() {
  return _vgenTokenYenile(PropertiesService.getScriptProperties());
}

// ─── İÇ FONKSİYON ────────────────────────────────────────────────────────────

function _vgenTokenYenile(props) {
  var username = props.getProperty(_PROP_USERNAME);
  var password = props.getProperty(_PROP_PASSWORD);

  if (!username || !password) {
    throw new Error(
      'VGen kimlik bilgisi eksik. Önce vgenKurulum() fonksiyonunu çalıştırın.'
    );
  }

  var resp = UrlFetchApp.fetch(_AUTH_LOGIN_URL, {
    method           : 'post',
    contentType      : 'application/json',
    muteHttpExceptions: true,
    payload          : JSON.stringify({
      grant_type : 'password',
      username   : username,
      password   : password,
      audience   : _AUTH_AUDIENCE,
      scope      : _AUTH_SCOPE,
      client_id  : _AUTH_CLIENT_ID,
      realm      : _AUTH_REALM
    })
  });

  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(
      'VGen login başarısız. HTTP ' + code + ': ' +
      resp.getContentText().substring(0, 300)
    );
  }

  var json  = JSON.parse(resp.getContentText());
  var token = json.access_token || '';
  if (!token) {
    throw new Error('VGen login: yanıtta access_token bulunamadı.');
  }

  props.setProperty(_PROP_TOKEN, token);
  if (json.expires_in) {
    var expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
    props.setProperty(_PROP_EXPIRY, expiresAt);
  }

  Logger.log('✅ VGen token yenilendi.');
  return token;
}

// ─── YARDIMCI: HTTP GET ───────────────────────────────────────────────────────

/**
 * VGen API'ye kimlik doğrulamalı GET isteği atar.
 * 401/403 alırsa token'ı otomatik yeniler ve bir kez daha dener.
 *
 * @param {string} url       Tam URL (query string dahil)
 * @param {string} tenantId  X-Tenant-Id başlığı
 * @returns {{ code: number, body: string }}
 */
function vgenApiGet(url, tenantId) {
  var props = PropertiesService.getScriptProperties();
  var token = vgenTokenAl(props);
  var resp  = _vgenFetch(url, token, tenantId);

  if (resp.code === 401 || resp.code === 403) {
    Logger.log('VGen: 401/403 alındı, token yenileniyor...');
    token = _vgenTokenYenile(props);
    resp  = _vgenFetch(url, token, tenantId);
  }

  return resp;
}

function _vgenFetch(url, token, tenantId) {
  var resp = UrlFetchApp.fetch(url, {
    method            : 'get',
    muteHttpExceptions: true,
    headers           : {
      'Authorization': 'Bearer ' + token,
      'Accept'       : 'application/json',
      'X-Tenant-Id'  : tenantId || '',
      'Origin'       : 'https://vgen.vtcenerji.com',
      'Referer'      : 'https://vgen.vtcenerji.com/'
    }
  });
  return { code: resp.getResponseCode(), body: resp.getContentText() };
}

// ─── TEST ─────────────────────────────────────────────────────────────────────

/** Token alınabiliyor mu kontrol eder. */
function vgenAuthTest() {
  try {
    var token = vgenTokenAl();
    Logger.log('✅ Token alındı: ' + token.substring(0, 30) + '...');
    return { success: true };
  } catch(e) {
    Logger.log('❌ ' + e.toString());
    return { success: false, error: e.toString() };
  }
}
