const AdminControlConfig = {
    saatlik: 'https://script.google.com/macros/s/AKfycbxzi0Shn7YvWSWzOv_rDiRHE6WlqiP6Tw7TDCyWC3_34AlFgB4-tzsZjn2JkRShqsd2jQ/exec',
    motor: 'https://script.google.com/macros/s/AKfycbwqMpjWZtjczxkbS2TwOSGIkE2SS2P27t1oDRxpZpAXRl6FwSXkGGhlrj2Ccj4wDl-IXw/exec',
    enerji: 'https://script.google.com/macros/s/AKfycbzrvkreNMp_hxgigiM-pbDXys6C127Jwx2dvqYJK8lub0BxwIFMXX4wU4vl_fKCkh-Dzg/exec',
    vardiya: 'https://script.google.com/macros/s/AKfycbxnCKSZtDelL04-ZQY3yx_ePSCK9Qy9R0WgFwtsFXj_B6HayfmwM8i_HYU-AAUETleSRA/exec',
    bildirim: 'https://script.google.com/macros/s/AKfycbwX6YHedLGqu6N5YEajQPFqVE1eV8Zj2TK0LlexESUkzM1ISNSBPKdnEtvG58VDnhXj/exec'
};

document.addEventListener('DOMContentLoaded', function() {
    if (!requireAdmin()) return;
    document.getElementById('refreshDashboardBtn').addEventListener('click', loadDashboard);
    document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
    loadDashboard();
    renderLogs();
});

function requireAdmin() {
    const user = getCurrentUser();
    if (!user) {
        location.href = 'anasayfa.html';
        return false;
    }

    if (user.role !== 'admin') {
        document.body.innerHTML = `
            <div class="admin-shell">
                <section class="panel">
                    <h1>Yetki Gerekli</h1>
                    <p>Bu sayfa sadece admin kullanıcılar içindir.</p>
                    <a class="btn ghost" href="anasayfa.html">Ana Sayfa</a>
                </section>
            </div>`;
        return false;
    }

    document.getElementById('adminUserName').textContent = getUserName(user);
    return true;
}

async function loadDashboard() {
    const statusGrid = document.getElementById('statusGrid');
    const checkList = document.getElementById('missingCheckList');
    statusGrid.innerHTML = loadingCard();
    checkList.innerHTML = '<div class="empty">Kontroller çalışıyor...</div>';

    const [saatlik, motor, enerji, vardiya, bildirim] = await Promise.all([
        fetchJson(AdminControlConfig.saatlik, { action: 'getLastRecords', count: '24' }),
        fetchJson(AdminControlConfig.motor, { action: 'getLastRecords', count: '60' }),
        fetchJson(AdminControlConfig.enerji, { action: 'getLastRecords', count: '60' }),
        fetchJson(AdminControlConfig.vardiya, { action: 'getLastRecordsWithIslemler', count: '12' }),
        fetchJson(AdminControlConfig.bildirim, { action: 'getAnnouncements', active: 'true' })
    ]);

    const checks = [
        buildSaatlikCheck(saatlik),
        buildMotorCheck(motor, 'Kojen Motor'),
        buildMotorCheck(enerji, 'Kojen Enerji'),
        buildVardiyaCheck(vardiya),
        buildBildirimCheck(bildirim)
    ];

    statusGrid.innerHTML = checks.map(renderStatusCard).join('');
    checkList.innerHTML = checks.map(renderCheckItem).join('');

    window.SystemAuditLog?.write?.('Merkezi kontrol yenilendi', `${checks.length} baslik kontrol edildi`, checks.some(item => item.level === 'danger') ? 'warn' : 'ok');
    renderLogs();
}

async function fetchJson(baseUrl, params) {
    try {
        const url = new URL(baseUrl);
        Object.keys(params).forEach(key => url.searchParams.set(key, params[key]));
        const response = await fetch(url);
        const result = await response.json();
        if (!result.success) {
            return { success: false, error: result.error || 'Servis hatasi' };
        }
        return result;
    } catch (error) {
        return { success: false, error: error.message || String(error) };
    }
}

function buildSaatlikCheck(result) {
    if (!result.success) return makeCheck('Saatlik Veri', 'Hata', result.error, 'danger');
    const records = Array.isArray(result.data) ? result.data : [];
    const slot = getExpectedSlot();
    const exists = records.some(record => matchesDate(record.tarih, slot.trDate) && record.saat === slot.hour);
    return makeCheck('Saatlik Veri', exists ? 'Tamam' : 'Kontrol Et', exists ? `${slot.trDate} ${slot.hour} kaydı mevcut` : `${slot.trDate} ${slot.hour} kaydı görünmüyor`, exists ? 'ok' : 'warn');
}

function buildMotorCheck(result, title) {
    if (!result.success) return makeCheck(title, 'Hata', result.error, 'danger');
    const records = Array.isArray(result.data) ? result.data : [];
    const slot = getExpectedSlot();
    const motors = ['GM-1', 'GM-2', 'GM-3'];
    const missing = motors.filter(motor => !records.some(record => matchesDate(record.tarih, slot.trDate) && record.saat === slot.hour && String(record.motor || '').trim() === motor));
    return makeCheck(title, missing.length ? `${missing.length} Eksik` : 'Tamam', missing.length ? `${slot.trDate} ${slot.hour}: ${missing.join(', ')}` : `${slot.trDate} ${slot.hour} kayıtları mevcut`, missing.length ? 'warn' : 'ok');
}

function buildVardiyaCheck(result) {
    if (!result.success) return makeCheck('Vardiya', 'Hata', result.error, 'danger');
    const records = Array.isArray(result.data) ? result.data : [];
    const active = records.find(record => String(record.durum || '').toLowerCase() === 'aktif');
    return makeCheck('Vardiya', active ? 'Aktif' : 'Pasif', active ? `${active.vardiya} - ${active.personel}` : 'Aktif vardiya görünmüyor', active ? 'ok' : 'warn');
}

function buildBildirimCheck(result) {
    if (!result.success) return makeCheck('Duyurular', 'Hata', result.error, 'danger');
    const records = Array.isArray(result.data) ? result.data : [];
    return makeCheck('Duyurular', `${records.length} Aktif`, records.length ? 'Aktif duyuru yayında' : 'Aktif duyuru yok', records.length ? 'ok' : 'warn');
}

function makeCheck(title, value, detail, level) {
    return { title, value, detail, level };
}

function renderStatusCard(item) {
    return `
        <article class="status-card ${item.level}">
            <span class="card-label">${escapeHtml(item.title)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            <p>${escapeHtml(item.detail)}</p>
        </article>`;
}

function renderCheckItem(item) {
    return `
        <div class="check-item ${item.level}">
            <span class="check-dot"></span>
            <div>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.detail)}</p>
            </div>
            <span class="badge ${item.level}">${escapeHtml(item.value)}</span>
        </div>`;
}

function loadingCard() {
    return `
        <article class="status-card loading">
            <span class="card-label">Sistem</span>
            <strong>Kontrol</strong>
            <p>Veriler okunuyor.</p>
        </article>`;
}

function renderLogs() {
    const body = document.getElementById('logTableBody');
    const logs = window.SystemAuditLog?.read?.() || [];
    if (!logs.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty">Henüz log yok.</td></tr>';
        return;
    }

    body.innerHTML = logs.slice(0, 80).map(log => `
        <tr>
            <td>${escapeHtml(log.at)}</td>
            <td>${escapeHtml(log.user)}</td>
            <td>${escapeHtml(log.page)}</td>
            <td>${escapeHtml(log.action)}</td>
            <td>${escapeHtml(log.detail)}</td>
            <td><span class="badge ${log.status || 'ok'}">${escapeHtml(log.status || 'info')}</span></td>
        </tr>`).join('');
}

function clearLogs() {
    if (!confirm('Sistem logları temizlensin mi?')) return;
    window.SystemAuditLog?.clear?.();
    renderLogs();
}

function getExpectedSlot() {
    const now = new Date();
    if (now.getMinutes() < 55) {
        now.setHours(now.getHours() - 1);
    }
    return {
        hour: `${String(now.getHours()).padStart(2, '0')}:00`,
        trDate: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`,
        isoDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    };
}

function matchesDate(value, trDate) {
    const parts = trDate.split('.');
    const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    return String(value || '').includes(trDate) || String(value || '').startsWith(isoDate);
}

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('loggedInUser') || 'null');
    } catch (error) {
        return null;
    }
}

function getUserName(user) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Admin';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
