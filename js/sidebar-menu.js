// Standart sidebar menu yapisi.
// Sayfalardaki mevcut .sidebar-menu icerigini tek merkezden yeniden olusturur.

(function () {
    'use strict';

    const iconPaths = {
        home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
        steam: '<path d="M7 20h10"/><path d="M8 16h8a3 3 0 0 0 0-6H8v6Z"/><path d="M9 3c-1 1.4-1 2.6 0 4M13 3c-1 1.4-1 2.6 0 4"/>',
        shift: '<path d="M4 6h16M4 12h16M4 18h10"/><path d="m16 16 2 2 4-4"/>',
        engine: '<path d="M7 8h8l2 3h2v6h-3l-2 2H8l-2-2H4v-5h3V8Z"/><path d="M10 5h4M12 5v3"/>',
        bolt: '<path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/>',
        wrench: '<path d="M14.5 5.5a5 5 0 0 0-6.4 6.4L3 17l4 4 5.1-5.1a5 5 0 0 0 6.4-6.4l-3 3-3-3 3-3Z"/>',
        box: '<path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
        chart: '<path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5"/><rect x="12" y="7" width="3" height="9"/><rect x="17" y="9" width="3" height="7"/>',
        control: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
        bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>'
    };

    const standardMenu = [
        { id: 'anasayfa', icon: 'home', text: 'Ana Sayfa', href: 'anasayfa.html' },
        { id: 'saatlik', icon: 'clock', text: 'Saatlik Veri Girişi', href: 'saatlik-veri-giris.html' },
        { id: 'gunluk', icon: 'calendar', text: 'Günlük Veri Girişi', href: 'gunluk-veri-giris.html' },
        { id: 'buhar', icon: 'steam', text: 'Buhar Verisi', href: 'buhar-verisi.html' },
        { id: 'vardiya', icon: 'shift', text: 'Vardiya Takip', href: 'vardiya.html' },
        { id: 'motor-takip', icon: 'engine', text: 'Motor Takip', href: 'motor-takip.html', adminOnly: true },
        { id: 'kojen-motor', icon: 'engine', text: 'Kojen Motor Veri', href: 'kojen-motor-veri.html' },
        { id: 'kojen-enerji', icon: 'bolt', text: 'Kojen Enerji Veri', href: 'kojen-enerji-veri.html' },
        { id: 'enerji-rapor', icon: 'chart', text: 'Enerji Raporlari', href: 'enerji-rapor.html', adminOnly: true },
        { id: 'bakim', icon: 'wrench', text: 'Bakım Takibi', href: 'bakim-takibi.html' },
        { id: 'stok', icon: 'box', text: 'Stok Takip', href: 'stok-takip.html' },
        { id: 'admin-kontrol', icon: 'control', text: 'Merkezi Kontrol', href: 'admin-kontrol.html', adminOnly: true },
        { id: 'bildirim', icon: 'bell', text: 'Bildirim Yönetimi', href: 'admin-bildirim.html', adminOnly: true },
        { id: 'kullanici', icon: 'users', text: 'Kullanıcı Yönetimi', href: 'kullanici-yonetimi.html', adminOnly: true }
    ];

    const pageByFile = {
        'anasayfa.html': 'anasayfa',
        'saatlik-veri-giris.html': 'saatlik',
        'gunluk-veri-giris.html': 'gunluk',
        'buhar-verisi.html': 'buhar',
        'vardiya.html': 'vardiya',
        'motor-takip.html': 'motor-takip',
        'kojen-motor-veri.html': 'kojen-motor',
        'kojen-enerji-veri.html': 'kojen-enerji',
        'enerji-rapor.html': 'enerji-rapor',
        'bakim-takibi.html': 'bakim',
        'stok-takip.html': 'stok',
        'admin-kontrol.html': 'admin-kontrol',
        'admin-bildirim.html': 'bildirim',
        'kullanici-yonetimi.html': 'kullanici'
    };

    function getMenuUser() {
        try {
            return JSON.parse(localStorage.getItem('loggedInUser') || 'null');
        } catch (error) {
            return null;
        }
    }

    function getActivePage() {
        const fileName = (window.location.pathname.split('/').pop() || 'anasayfa.html').toLowerCase();
        return document.body.dataset.activePage || pageByFile[fileName] || '';
    }

    function renderIcon(name) {
        const paths = iconPaths[name] || iconPaths.home;
        return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
    }

    function generateMenuHTML(activePage) {
        const user = getMenuUser();
        const isAdmin = user && user.role === 'admin';

        return standardMenu
            .filter(item => !item.adminOnly || isAdmin)
            .map(item => {
                const isActive = item.id === activePage ? ' active' : '';
                return [
                    `<li class="menu-item${isActive}">`,
                    `  <a href="${item.href}" class="menu-link">`,
                    `    <span class="menu-icon">${renderIcon(item.icon)}</span>`,
                    `    <span class="menu-text">${item.text}</span>`,
                    '  </a>',
                    '</li>'
                ].join('');
            })
            .join('');
    }

    function ensureSidebarIconStyles() {
        if (document.getElementById('standard-sidebar-icon-style')) return;

        const style = document.createElement('style');
        style.id = 'standard-sidebar-icon-style';
        style.textContent = [
            '.menu-icon svg {',
            '  width: 20px;',
            '  height: 20px;',
            '  display: block;',
            '  fill: none;',
            '  stroke: currentColor;',
            '  stroke-width: 2;',
            '  stroke-linecap: round;',
            '  stroke-linejoin: round;',
            '}'
        ].join('');
        document.head.appendChild(style);
    }

    function renderSidebarMenu() {
        const menu = document.querySelector('.sidebar-menu');
        if (!menu) return;
        ensureSidebarIconStyles();
        menu.innerHTML = generateMenuHTML(getActivePage());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderSidebarMenu);
    } else {
        renderSidebarMenu();
    }

    window.StandardSidebarMenu = {
        items: standardMenu,
        render: renderSidebarMenu,
        generateMenuHTML: generateMenuHTML
    };
})();
