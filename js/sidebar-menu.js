// Standart sidebar menu yapisi.
// Admin sayfalari sadece admin rolundeki kullanicilara gosterilir.

const standardMenu = [
    { id: 'anasayfa', icon: 'HOME', text: 'Ana Sayfa', href: 'anasayfa.html' },
    { id: 'saatlik', icon: 'DATA', text: 'Saatlik Veri Girisi', href: 'saatlik-veri-giris.html' },
    { id: 'gunluk', icon: 'DAY', text: 'Gunluk Veri Girisi', href: 'gunluk-veri-giris.html' },
    { id: 'buhar', icon: 'STM', text: 'Buhar Verisi', href: 'buhar-verisi.html' },
    { id: 'vardiya', icon: 'V', text: 'Vardiya Takip', href: 'vardiya.html' },
    { id: 'motor-takip', icon: 'MT', text: 'Motor Takip', href: 'motor-takip.html', adminOnly: true },
    { id: 'kojen-motor', icon: 'GM', text: 'Kojen Motor Veri', href: 'kojen-motor-veri.html' },
    { id: 'kojen-enerji', icon: 'GE', text: 'Kojen Enerji Veri', href: 'kojen-enerji-veri.html' },
    { id: 'bakim', icon: 'BK', text: 'Bakim Takibi', href: 'bakim-takibi.html' },
    { id: 'stok', icon: 'ST', text: 'Stok Takip', href: 'stok-takip.html' },
    { id: 'admin-kontrol', icon: '⚙️', text: 'Merkezi Kontrol', href: 'admin-kontrol.html', adminOnly: true },
    { id: 'bildirim', icon: 'DUY', text: 'Bildirim Yonetimi', href: 'admin-bildirim.html', adminOnly: true },
    { id: 'kullanici', icon: 'USR', text: 'Kullanici Yonetimi', href: 'kullanici-yonetimi.html', adminOnly: true }
];

function getMenuUser() {
    try {
        return JSON.parse(localStorage.getItem('loggedInUser') || 'null');
    } catch (error) {
        return null;
    }
}

function generateMenuHTML(activePage) {
    const user = getMenuUser();
    const isAdmin = user?.role === 'admin';

    return standardMenu
        .filter(item => !item.adminOnly || isAdmin)
        .map(item => {
            const isActive = item.id === activePage ? 'active' : '';
            return `
                <li class="menu-item ${isActive}">
                    <a href="${item.href}" class="menu-link">
                        <span class="menu-icon">${item.icon}</span>
                        <span class="menu-text">${item.text}</span>
                    </a>
                </li>`;
        }).join('');
}
