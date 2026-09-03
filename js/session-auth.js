/**
 * SESSION-AUTH.JS
 * Admin sayfaları için session token doğrulama sistemi.
 *
 * Kullanım:
 *   Admin sayfalarında DOMContentLoaded içinde validateAdminSession() çağrılır.
 *   Geçersiz/süresi dolmuş token → otomatik login'e yönlendirir.
 */

(function (root) {
    'use strict';

    var SESSION_TOKEN_KEY = 'sessionToken';
    var USER_KEY = 'loggedInUser';

    /**
     * localStorage'dan session token'ı döndürür.
     */
    function getSessionToken() {
        return localStorage.getItem(SESSION_TOKEN_KEY) || '';
    }

    /**
     * Session token'ı localStorage'a kaydeder.
     */
    function setSessionToken(token) {
        if (token) {
            localStorage.setItem(SESSION_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(SESSION_TOKEN_KEY);
        }
    }

    /**
     * Tüm oturum verisini temizler (logout).
     * Token'ı GAS'tan da siler, ardından login sayfasına yönlendirir.
     */
    function clearSession(redirectToLogin) {
        var token = getSessionToken();
        var userUrl = root.AppConfig ? root.AppConfig.getScriptUrl('kullanici') : '';

        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem('currentUser');
        localStorage.removeItem('rememberedEmail');

        if (token && userUrl) {
            // Fire-and-forget: GAS tarafında token'ı sil
            fetch(userUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=logout&data=' + encodeURIComponent(JSON.stringify({ token: token }))
            }).catch(function () { /* sessizce yoksay */ });
        }

        if (redirectToLogin !== false) {
            window.location.href = 'index.html';
        }
    }

    /**
     * Admin sayfası yüklenirken token'ı GAS'a doğrulattırır.
     *
     * - Token yoksa veya geçersizse → login sayfasına yönlendirir.
     * - Rol 'admin' değilse → login sayfasına yönlendirir.
     * - Geçerliyse → Promise<true> döner, sayfa normal yüklenmeye devam eder.
     */
    function validateAdminSession() {
        return new Promise(function (resolve) {
            var token = getSessionToken();
            var userUrl = root.AppConfig ? root.AppConfig.getScriptUrl('kullanici') : '';

            if (!token || !userUrl) {
                _redirectToLogin('Oturum bulunamadi.');
                return resolve(false);
            }

            var url = userUrl + '?action=validateToken&token=' + encodeURIComponent(token);

            fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache' })
                .then(function (res) { return res.json(); })
                .then(function (result) {
                    if (!result.success) {
                        _redirectToLogin(result.error || 'Oturum gecersiz.');
                        return resolve(false);
                    }

                    if (String(result.role || '').toLowerCase() !== 'admin') {
                        _redirectToLogin('Bu sayfa sadece admin kullanicilara aciktir.');
                        return resolve(false);
                    }

                    resolve(true);
                })
                .catch(function (err) {
                    console.warn('Session dogrulama hatasi:', err);
                    _redirectToLogin('Baglanti hatasi, oturum dogrulanamadi.');
                    resolve(false);
                });
        });
    }

    /**
     * Login sayfasına yönlendirir, konsola mesaj yazar.
     */
    function _redirectToLogin(reason) {
        console.warn('Session gecersiz:', reason);
        localStorage.removeItem(SESSION_TOKEN_KEY);
        window.location.href = 'index.html';
    }

    /**
     * localStorage'daki kullanıcı objesini döndürür.
     */
    function _getLocalUser() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    /**
     * Periyodik token kontrolü — admin sayfalarında çağrılır.
     * Her 5 dakikada bir token'ı GAS'a doğrulattırır.
     * 30 dakika kalmışsa uyarı gösterir.
     * Token geçersizleşince login'e yönlendirir.
     */
    function startTokenWatcher() {
        var CHECK_INTERVAL_MS = 5 * 60 * 1000;   // 5 dakikada bir kontrol
        var WARN_THRESHOLD_MS = 30 * 60 * 1000;  // 30 dk kalmışsa uyar
        var warningShown = false;

        function check() {
            var token = getSessionToken();
            var userUrl = root.AppConfig ? root.AppConfig.getScriptUrl('kullanici') : '';
            if (!token || !userUrl) return;

            var url = userUrl + '?action=validateToken&token=' + encodeURIComponent(token);
            fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache' })
                .then(function (res) { return res.json(); })
                .then(function (result) {
                    if (!result.success) {
                        _redirectToLogin('Oturum suresi doldu veya gecersiz hale geldi.');
                        return;
                    }

                    // expiresIn "X dakika" formatında geliyor
                    var minutes = parseInt(String(result.expiresIn || '0'), 10);
                    var remainingMs = minutes * 60 * 1000;

                    if (!warningShown && remainingMs > 0 && remainingMs <= WARN_THRESHOLD_MS) {
                        warningShown = true;
                        var msg = 'Oturum süresi ' + minutes + ' dakika sonra dolacak. Çalışmanızı kaydedin.';
                        if (root.Utils && root.Utils.showToast) {
                            root.Utils.showToast(msg, 'warning', 8000);
                        } else {
                            console.warn(msg);
                        }
                    }

                    // Uyarı zaten gösterildiyse ve süre uzadıysa (token yenilendi) sıfırla
                    if (warningShown && remainingMs > WARN_THRESHOLD_MS) {
                        warningShown = false;
                    }
                })
                .catch(function () {
                    // Ağ hatası — sessizce geç, sonraki kontrolde tekrar dene
                });
        }

        // İlk kontrolü hemen değil, 5 dk sonra başlat (sayfa yüklenince zaten validateAdminSession çalışıyor)
        var intervalId = root.setInterval(check, CHECK_INTERVAL_MS);
        return intervalId;
    }

    // Public API
    if (root) {
        root.SessionAuth = {
            getSessionToken: getSessionToken,
            setSessionToken: setSessionToken,
            clearSession: clearSession,
            validateAdminSession: validateAdminSession,
            startTokenWatcher: startTokenWatcher
        };
    }
})(typeof window !== 'undefined' ? window : null);
