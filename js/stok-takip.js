// Stok Takip JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Başlangıç değerlerini ayarla
    initializePage();
    
    // Event listener'ları ekle
    setupEventListeners();
    
    // Stok listesini yükle
    loadStockList();
    
    // Son işlemleri yükle
    loadRecentTransactions();
    
    // Özet kartları güncelle
    updateSummaryCards();
    
    // Kullanıcı adını göster
    displayUserName();
});

// Sayfa başlangıç ayarları
function initializePage() {
    // Tarih alanını bugün olarak ayarla
    const dateInputs = document.querySelectorAll('input[type="date"]');
    const today = new Date().toISOString().split('T')[0];
    dateInputs.forEach(input => {
        if (!input.value) {
            input.value = today;
        }
    });
    
    // İşlem formundaki malzeme select'ini doldur
    populateMaterialSelect();
}

// Event listener'ları ekle
function setupEventListeners() {
    // Malzeme ekleme formu
    const stockForm = document.getElementById('stock-form');
    if (stockForm) {
        stockForm.addEventListener('submit', handleStockSubmit);
    }
    
    // Stok giriş/çıkış formu
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleTransactionSubmit);
    }
    
    // Arama ve filtreleme
    const searchInput = document.getElementById('stock-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterStockList);
    }
    
    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', filterStockList);
    }
    
    // Excel export
    const exportBtn = document.getElementById('export-stock');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }
    
    // Çıkış butonları
    const sidebarLogout = document.getElementById('sidebarLogout');
    const headerLogout = document.getElementById('headerLogout');
    
    if (sidebarLogout) {
        sidebarLogout.addEventListener('click', handleLogout);
    }
    if (headerLogout) {
        headerLogout.addEventListener('click', handleLogout);
    }
}

// Malzeme ekleme formu gönderimi
function handleStockSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const material = {
        id: Date.now(),
        code: formData.get('material-code'),
        name: formData.get('material-name'),
        category: formData.get('material-category'),
        quantity: parseFloat(formData.get('material-quantity')),
        unit: formData.get('material-unit'),
        minStock: parseFloat(formData.get('min-stock')),
        description: formData.get('material-description'),
        createdAt: new Date().toISOString()
    };
    
    // Malzeme kodu benzersiz mi kontrol et
    const materials = getMaterials();
    if (materials.some(m => m.code === material.code)) {
        showNotification('error', 'Hata', 'Bu malzeme kodu zaten kullanılıyor!');
        return;
    }
    
    // Malzemeyi kaydet
    materials.push(material);
    localStorage.setItem('stockMaterials', JSON.stringify(materials));
    
    showNotification('success', 'Başarılı', 'Malzeme başarıyla eklendi!');
    
    // Formu temizle ve listeyi güncelle
    e.target.reset();
    loadStockList();
    populateMaterialSelect();
    updateSummaryCards();
}

// Stok giriş/çıkış formu gönderimi
function handleTransactionSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const materialId = formData.get('transaction-material');
    const type = formData.get('transaction-type');
    const quantity = parseFloat(formData.get('transaction-quantity'));
    
    const materials = getMaterials();
    const material = materials.find(m => m.id.toString() === materialId);
    
    if (!material) {
        showNotification('error', 'Hata', 'Malzeme bulunamadı!');
        return;
    }
    
    // Çıkış işlemi için yeterli stok var mı?
    if (type === 'out' && material.quantity < quantity) {
        showNotification('error', 'Yetersiz Stok', 
            `${material.name} için yeterli stok yok! Mevcut: ${material.quantity} ${material.unit}`);
        return;
    }
    
    // Stok miktarını güncelle
    if (type === 'in') {
        material.quantity += quantity;
    } else {
        material.quantity -= quantity;
    }
    
    // Malzemeyi güncelle
    const updatedMaterials = materials.map(m => 
        m.id.toString() === materialId ? material : m
    );
    localStorage.setItem('stockMaterials', JSON.stringify(updatedMaterials));
    
    // İşlemi kaydet
    const transaction = {
        id: Date.now(),
        materialId: material.id,
        materialName: material.name,
        materialCode: material.code,
        type: type,
        quantity: quantity,
        date: formData.get('transaction-date'),
        person: formData.get('transaction-person'),
        reason: formData.get('transaction-reason'),
        createdAt: new Date().toISOString()
    };
    
    const transactions = getTransactions();
    transactions.unshift(transaction);
    localStorage.setItem('stockTransactions', JSON.stringify(transactions));
    
    showNotification('success', 'Başarılı', 
        `${material.name} için ${type === 'in' ? 'giriş' : 'çıkış'} işlemi kaydedildi!`);
    
    // Formu temizle ve listeleri güncelle
    e.target.reset();
    document.getElementById('transaction-date').value = new Date().toISOString().split('T')[0];
    loadStockList();
    loadRecentTransactions();
    updateSummaryCards();
}

// Malzeme select'ini doldur
function populateMaterialSelect() {
    const select = document.getElementById('transaction-material');
    if (!select) return;
    
    const materials = getMaterials();
    
    select.innerHTML = '<option value="">Malzeme seçin</option>';
    materials.forEach(material => {
        const option = document.createElement('option');
        option.value = material.id;
        option.textContent = `${material.code} - ${material.name} (${material.quantity} ${material.unit})`;
        select.appendChild(option);
    });
}

// Stok listesini yükle
function loadStockList() {
    const tbody = document.getElementById('stock-tbody');
    if (!tbody) return;
    
    const materials = getMaterials();
    
    if (materials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #7f8c8d;">Henüz malzeme eklenmemiş</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    materials.forEach(material => {
        const row = createStockRow(material);
        tbody.appendChild(row);
    });
}

// Stok satırı oluştur
function createStockRow(material) {
    const row = document.createElement('tr');
    
    const status = getStockStatus(material);
    
    row.innerHTML = `
        <td><strong>${material.code}</strong></td>
        <td>${material.name}</td>
        <td>${getCategoryName(material.category)}</td>
        <td>${material.quantity.toFixed(2)}</td>
        <td>${material.unit}</td>
        <td>${material.minStock.toFixed(2)}</td>
        <td><span class="status-badge ${status.class}">${status.text}</span></td>
        <td>
            <button class="action-btn edit" onclick="editMaterial(${material.id})">
                <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn delete" onclick="deleteMaterial(${material.id})">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    return row;
}

// Stok durumunu belirle
function getStockStatus(material) {
    if (material.quantity <= 0) {
        return { class: 'status-low', text: 'Tükendi' };
    } else if (material.quantity <= material.minStock) {
        return { class: 'status-warning', text: 'Kritik' };
    } else {
        return { class: 'status-normal', text: 'Normal' };
    }
}

// Kategori adını getir
function getCategoryName(category) {
    const categories = {
        'yag': 'Yağ',
        'filtre': 'Filtre',
        'yedek-parca': 'Yedek Parça',
        'kimyasal': 'Kimyasal',
        'elektrik': 'Elektrik Malzemesi',
        'sarf-malzeme': 'Sarf Malzeme',
        'diger': 'Diğer'
    };
    return categories[category] || category;
}

// Stok listesini filtrele
function filterStockList() {
    const searchTerm = document.getElementById('stock-search').value.toLowerCase();
    const categoryFilter = document.getElementById('category-filter').value;
    
    const materials = getMaterials();
    
    const filtered = materials.filter(material => {
        const matchesSearch = material.name.toLowerCase().includes(searchTerm) || 
                             material.code.toLowerCase().includes(searchTerm);
        const matchesCategory = !categoryFilter || material.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });
    
    const tbody = document.getElementById('stock-tbody');
    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #7f8c8d;">Filtreleme sonucu bulunamadı</td></tr>';
        return;
    }
    
    filtered.forEach(material => {
        tbody.appendChild(createStockRow(material));
    });
}

// Son işlemleri yükle
function loadRecentTransactions() {
    const tbody = document.getElementById('transactions-tbody');
    if (!tbody) return;
    
    const transactions = getTransactions().slice(0, 10); // Son 10 işlem
    
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #7f8c8d;">Henüz işlem yapılmamış</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    transactions.forEach(transaction => {
        const row = createTransactionRow(transaction);
        tbody.appendChild(row);
    });
}

// İşlem satırı oluştur
function createTransactionRow(transaction) {
    const row = document.createElement('tr');
    
    const typeClass = transaction.type === 'in' ? 'text-success' : 'text-danger';
    const typeText = transaction.type === 'in' ? 'Giriş' : 'Çıkış';
    const typeIcon = transaction.type === 'in' ? '↓' : '↑';
    
    row.innerHTML = `
        <td>${formatDate(transaction.date)}</td>
        <td>${transaction.materialName}</td>
        <td class="${typeClass}"><strong>${typeIcon} ${typeText}</strong></td>
        <td>${transaction.quantity.toFixed(2)}</td>
        <td>${transaction.person}</td>
        <td>${getReasonName(transaction.reason)}</td>
    `;
    
    return row;
}

// İşlem nedenini getir
function getReasonName(reason) {
    const reasons = {
        'satin-alma': 'Satın Alma',
        'kullanim': 'Kullanım',
        'bakim': 'Bakım',
        'degisim': 'Değişim',
        'diger': 'Diğer'
    };
    return reasons[reason] || reason;
}

// Özet kartları güncelle
function updateSummaryCards() {
    const materials = getMaterials();
    const transactions = getTransactions();
    
    // Toplam malzeme sayısı
    document.getElementById('total-materials').textContent = materials.length;
    
    // Kritik stok sayısı
    const lowStock = materials.filter(m => m.quantity <= m.minStock).length;
    document.getElementById('low-stock-count').textContent = lowStock;
    
    // Bu ay giriş/çıkış
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
    });
    
    const monthlyIn = monthlyTransactions
        .filter(t => t.type === 'in')
        .reduce((sum, t) => sum + t.quantity, 0);
    const monthlyOut = monthlyTransactions
        .filter(t => t.type === 'out')
        .reduce((sum, t) => sum + t.quantity, 0);
    
    document.getElementById('monthly-in').textContent = monthlyIn.toFixed(0);
    document.getElementById('monthly-out').textContent = monthlyOut.toFixed(0);
}

// Malzeme düzenle
function editMaterial(id) {
    const materials = getMaterials();
    const material = materials.find(m => m.id === id);
    
    if (!material) return;
    
    // Form alanlarını doldur
    document.getElementById('material-code').value = material.code;
    document.getElementById('material-name').value = material.name;
    document.getElementById('material-category').value = material.category;
    document.getElementById('material-quantity').value = material.quantity;
    document.getElementById('material-unit').value = material.unit;
    document.getElementById('min-stock').value = material.minStock;
    document.getElementById('material-description').value = material.description || '';
    
    // Malzemeyi sil (düzenleme sonrası yeniden eklenecek)
    deleteMaterial(id, false);
    
    showNotification('info', 'Düzenleme', 'Malzeme bilgileri forma yüklendi. Düzenlemeyi tamamlayıp kaydedin.');
}

// Malzeme sil
function deleteMaterial(id, showConfirm = true) {
    if (showConfirm && !confirm('Bu malzemeyi silmek istediğinizden emin misiniz?')) {
        return;
    }
    
    let materials = getMaterials();
    materials = materials.filter(m => m.id !== id);
    localStorage.setItem('stockMaterials', JSON.stringify(materials));
    
    if (showConfirm) {
        showNotification('success', 'Başarılı', 'Malzeme silindi!');
        loadStockList();
        populateMaterialSelect();
        updateSummaryCards();
    }
}

// Excel'e aktar
function exportToExcel() {
    const materials = getMaterials();
    
    if (materials.length === 0) {
        showNotification('warning', 'Uyarı', 'Aktarılacak malzeme bulunamadı!');
        return;
    }
    
    // CSV formatında hazırla
    const headers = ['Kod', 'Ad', 'Kategori', 'Miktar', 'Birim', 'Min. Stok', 'Durum'];
    const rows = materials.map(m => [
        m.code,
        m.name,
        getCategoryName(m.category),
        m.quantity,
        m.unit,
        m.minStock,
        getStockStatus(m).text
    ]);
    
    const csvContent = [headers, ...rows]
        .map(row => row.join(';'))
        .join('\n');
    
    // İndir
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `stok-listesi-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showNotification('success', 'Başarılı', 'Stok listesi Excel\'e aktarıldı!');
}

// Çıkış işlemi
function handleLogout() {
    if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
        localStorage.removeItem('loggedInUser');
        window.location.href = 'giris.html';
    }
}

// Kullanıcı adını göster
function displayUserName() {
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userNameDisplay) {
        const loggedInUser = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
        const firstName = loggedInUser.firstName || loggedInUser.ad || loggedInUser['Ad'] || loggedInUser.name || '';
        const lastName = loggedInUser.lastName || loggedInUser.soyad || loggedInUser['Soyad'] || loggedInUser.surname || '';
        const fullName = (firstName + ' ' + lastName).trim() || loggedInUser.email || 'Admin';
        userNameDisplay.textContent = fullName;
    }
}

// Yardımcı fonksiyonlar
function getMaterials() {
    return JSON.parse(localStorage.getItem('stockMaterials') || '[]');
}

function getTransactions() {
    return JSON.parse(localStorage.getItem('stockTransactions') || '[]');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Bildirim göster
function showNotification(type, title, message) {
    const modal = document.getElementById('notification-modal');
    const titleEl = document.getElementById('notification-title');
    const messageEl = document.getElementById('notification-message');
    
    if (!modal || !titleEl || !messageEl) {
        alert(message);
        return;
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    
    modal.classList.add('show');
    
    setTimeout(() => {
        closeNotification();
    }, 5000);
}

// Bildirim kapat
function closeNotification() {
    const modal = document.getElementById('notification-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}
