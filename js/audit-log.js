(function() {
    const KEY = 'systemAuditLogs';
    const LIMIT = 300;

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem('loggedInUser') || 'null');
        } catch (error) {
            return null;
        }
    }

    function getUserName(user) {
        if (!user) return 'Bilinmeyen Kullanici';
        return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Kullanici';
    }

    function read() {
        try {
            const data = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(data) ? data : [];
        } catch (error) {
            return [];
        }
    }

    function write(action, detail, status) {
        const user = getUser();
        const logs = read();
        logs.unshift({
            id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            action: action || 'Islem',
            detail: detail || '',
            status: status || 'info',
            user: getUserName(user),
            email: user?.email || '',
            page: location.pathname.split('/').pop() || 'anasayfa.html',
            at: new Date().toLocaleString('tr-TR')
        });
        localStorage.setItem(KEY, JSON.stringify(logs.slice(0, LIMIT)));
    }

    function clear() {
        localStorage.removeItem(KEY);
    }

    window.SystemAuditLog = { read, write, clear };
})();
