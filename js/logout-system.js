(function() {
    const AUTO_LOGOUT_TIMES = ['00:03', '08:03', '16:03'];
    const AUTO_LOGOUT_CHECK_MS = 15 * 1000;
    const AUTO_LOGOUT_LAST_KEY = 'autoLogout:lastRunKey';

    function clearSession() {
        localStorage.removeItem('loggedInUser');
        localStorage.removeItem('rememberedEmail');
    }

    function logout() {
        if (!confirm('Cikis yapmak istediginizden emin misiniz?')) return;
        clearSession();
        window.location.href = 'index.html';
    }

    function autoLogout() {
        clearSession();
        window.location.href = 'index.html';
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function getAutoLogoutRunKey(date) {
        return date.getFullYear() + '-' +
            pad2(date.getMonth() + 1) + '-' +
            pad2(date.getDate()) + ' ' +
            pad2(date.getHours()) + ':' +
            pad2(date.getMinutes());
    }

    function checkAutoLogoutTime() {
        const now = new Date();
        const currentTime = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
        if (!AUTO_LOGOUT_TIMES.includes(currentTime)) return;

        const runKey = getAutoLogoutRunKey(now);
        if (sessionStorage.getItem(AUTO_LOGOUT_LAST_KEY) === runKey) return;
        sessionStorage.setItem(AUTO_LOGOUT_LAST_KEY, runKey);
        autoLogout();
    }

    document.addEventListener('click', function(event) {
        const target = event.target.closest('#sidebarLogout, #headerLogout, #btnLogout, .logout-btn');
        if (!target) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        logout();
    }, true);

    window.SystemLogout = {
        clearSession,
        logout,
        autoLogout
    };

    checkAutoLogoutTime();
    window.setInterval(checkAutoLogoutTime, AUTO_LOGOUT_CHECK_MS);
})();
