// Bakım Takibi JavaScript - ÇALIŞAN VERSİYON
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwtW5CrtGC-theyebfRhH5FnUMgfQGVrtx5K6oYHRszNLw04VXLDPHllLkj8Z7ZrfEK/exec";

// Sistem başlatma fonksiyonu
async function initializeSystem() {
    try {
        showNotification('Sistem Başlatılıyor', 'Google Sheets bağlantısı kuruluyor...', 'info');
        
        const response = await fetch(SCRIPT_URL + '?action=init');
        const result = await response.json();
        
        if (result.success) {
            showNotification('Başarılı', 'Sistem başarıyla başlatıldı!', 'success');
            console.log('Spreadsheet URL:', result.spreadsheetUrl);
            
            // İstatistikleri yenile
            setTimeout(() => {
                maintenanceStats.loadStats();
            }, 1000);
        } else {
            showNotification('Hata', result.message, 'error');
        }
    } catch (error) {
        console.error('Sistem başlatılamadı:', error);
        showNotification('Hata', 'Sistem başlatılamadı. Lütfen daha sonra tekrar deneyin.', 'error');
    }
}

// Bakım kaydetme fonksiyonu
async function saveMaintenanceData(formType, formElement) {
    try {
        const formData = new FormData(formElement);
        
        // DEBUG: Form verilerini kontrol et
        console.log('=== FORM DEBUG ===');
        console.log('Form type:', formType);
        for (let [key, value] of formData.entries()) {
            console.log(`FormData: ${key} = ${value}`);
        }
        
        // Dosyaları işle
        const files = await processFiles(formType);
        
        // Input değerlerini direkt al (FormData yerine)
        const getInputValue = (name) => {
            const input = formElement.querySelector(`[name="${name}"]`);
            return input ? input.value : '';
        };
        
        const params = {
            action: 'save',
            date: getInputValue(`${formType}-date`),
            time: new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'}),
            motor: getInputValue(`${formType}-equipment`),
            type: formType === 'periodic' ? 'Periyodik' : formType === 'normal' ? 'Normal' : 'Arıza',
            subtype: getInputValue(`${formType}-type`) || getInputValue(`${formType}-priority`) || getInputValue(`${formType}-code`),
            technician: getInputValue(`${formType}-technician`),
            company: getInputValue(`${formType}-technician-company`),
            notes: getInputValue(`${formType}-description`) || getInputValue(`${formType}-notes`),
            status: getInputValue(`${formType}-status`) || 'Aktif',
            files: files.length > 0 ? JSON.stringify(files) : ''
        };
        
        // DEBUG: Params kontrol
        console.log('=== PARAMS DEBUG ===');
        console.log('Params:', params);
        
        showNotification('Kaydediliyor', 'Bakım kaydı oluşturuluyor...', 'info');
        
        // DEBUG: Gönderilecek veriler
        console.log('=== POST VERİLERİ ===');
        console.log('Files JSON:', params.files);
        console.log('Files uzunluğu:', params.files ? params.files.length : 0);
        
        // URLSearchParams oluştur
        const urlParams = new URLSearchParams(params);
        console.log('URLSearchParams oluşturuldu');
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: urlParams
        });
        
        console.log('Response status:', response.status);
        
        const result = await response.json();
        console.log('Response result:', result);
        
        if (result.success) {
            const fileCount = files.length;
            let message = `Kayıt eklendi: ${result.recordNo}`;
            if (fileCount > 0) {
                message += ` (${fileCount} dosya yüklendi)`;
            }
            
            showNotification('Başarılı', message, 'success');
            formElement.reset();
            
            // Tarihleri yenile
            setAutoDate();
            
            // İstatistikleri yenile
            maintenanceStats.loadStats();
            
            // Raporu yenile
            if (maintenanceReporter) {
                maintenanceReporter.generateReport();
            }
            
            // Dosya listelerini temizle
            clearFileLists(formType);
            
        } else {
            showNotification('Hata', result.message, 'error');
        }
    } catch (error) {
        console.error('Kayıt hatası:', error);
        showNotification('Hata', 'Kayıt eklenemedi. Lütfen tekrar deneyin.', 'error');
    }
}

// Dosyaları işle
async function processFiles(formType) {
    const fileInput = document.getElementById(`${formType}-files`);
    console.log('Dosya input elementi:', fileInput);
    console.log('Dosya sayısı:', fileInput ? fileInput.files.length : 0);
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        console.log('Dosya bulunamadı');
        return [];
    }
    
    const files = [];
    
    for (let i = 0; i < fileInput.files.length; i++) {
        const file = fileInput.files[i];
        console.log(`Dosya ${i + 1}:`, file.name, 'Tip:', file.type, 'Boyut:', file.size);
        
        try {
            const base64 = await fileToBase64(file);
            console.log(`Dosya ${i + 1} Base64 uzunluğu:`, base64.length);
            
            files.push({
                name: file.name,
                type: file.type,
                size: file.size,
                base64: base64
            });
        } catch (error) {
            console.error(`Dosya işleme hatası (${file.name}):`, error);
        }
    }
    
    console.log('Toplam işlenen dosya:', files.length);
    return files;
}

// Dosyayı Base64'e çevir
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Dosya listelerini temizle
function clearFileLists(formType) {
    const fileInput = document.getElementById(`${formType}-files`);
    const fileList = document.getElementById(`${formType}-file-list`);
    
    if (fileInput) {
        fileInput.value = '';
    }
    
    if (fileList) {
        fileList.innerHTML = '';
    }
}

// İstatistik ve Grafik Fonksiyonları
class MaintenanceStats {
    constructor() {
        this.maintenanceData = [];
        this.chart = null;
    }

    // İstatistikleri yükle ve göster
    async loadStats() {
        try {
            const response = await fetch(SCRIPT_URL + '?action=getStats');
            const data = await response.json();
            
            if (data.success) {
                this.updateStatCards(data.stats);
                this.drawChart(data.chartData);
            }
        } catch (error) {
            console.error('İstatistikler yüklenemedi:', error);
            // Demo veri göster
            this.showDemoStats();
        }
    }

    // İstatistik kartlarını güncelle
    updateStatCards(stats) {
        if (!stats) {
            console.warn('Stats verisi yok, demo veriler gösteriliyor');
            this.showDemoStats();
            return;
        }
        document.getElementById('total-maintenance').textContent = stats.total || 0;
        document.getElementById('monthly-maintenance').textContent = stats.monthly || 0;
        document.getElementById('fault-count').textContent = stats.faults || 0;
        document.getElementById('technician-count').textContent = stats.technicians || 0;
    }

    // Demo istatistikler göster - SADECE hata durumunda
    showDemoStats() {
        console.warn('Demo veriler gösteriliyor - Google Sheets bağlantısı kurulamadı');
        // Boş değerler göster
        this.updateStatCards({
            total: 0,
            monthly: 0,
            faults: 0,
            technicians: 0
        });
        // Boş grafik çiz
        const canvas = document.getElementById('maintenance-chart');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            this.drawEmptyChart(ctx);
        }
    }

    // Grafik çiz
    drawChart(chartData) {
        const canvas = document.getElementById('maintenance-chart');
        if (!canvas) return;

        // Canvas boyutunu dinamik ayarla
        const container = canvas.parentElement;
        canvas.width = container.offsetWidth - 30;
        canvas.height = 220;

        const ctx = canvas.getContext('2d');
        
        // Eğer chartData yoksa boş grafik çiz
        if (!chartData || !chartData.labels || !chartData.data) {
            this.drawEmptyChart(ctx);
            return;
        }
        
        // Basit bar chart çizimi
        this.drawBarChart(ctx, chartData);
    }
    
    // Boş grafik çiz
    drawEmptyChart(ctx) {
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#999';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Henüz veri yok', canvas.width / 2, canvas.height / 2);
    }

    // Basit bar chart çizim fonksiyonu - Geliştirilmiş versiyon
    drawBarChart(ctx, data) {
        const canvas = ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        
        // Temizle
        ctx.clearRect(0, 0, width, height);
        
        // Grafik konfigürasyonu
        const config = {
            padding: { top: 40, right: 30, bottom: 60, left: 60 },
            barWidth: 0.5, // Bar genişliği (spacing'in yüzdesi)
            colors: {
                bars: ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'],
                grid: '#e0e0e0',
                text: '#333333',
                axis: '#666666',
                background: '#fafafa'
            },
            font: {
                family: 'Arial, sans-serif',
                size: {
                    title: 16,
                    axis: 12,
                    value: 11,
                    label: 12
                }
            },
            animation: {
                duration: 800,
                easing: 'easeOutQuart'
            },
            grid: {
                show: true,
                lines: 5,
                lineWidth: 0.5
            },
            legend: {
                show: true,
                position: 'top'
            }
        };
        
        const chartWidth = width - config.padding.left - config.padding.right;
        const chartHeight = height - config.padding.top - config.padding.bottom;
        
        // Arka plan
        ctx.fillStyle = config.colors.background;
        ctx.fillRect(config.padding.left, config.padding.top, chartWidth, chartHeight);
        
        const maxValue = Math.max(...data.data, 1); // En az 1 olsun
        
        // Eğer tüm değerler 0 ise boş grafik göster
        if (maxValue === 0) {
            ctx.fillStyle = '#999';
            ctx.font = `${config.font.size.title}px ${config.font.family}`;
            ctx.textAlign = 'center';
            ctx.fillText('Henüz veri yok', width / 2, height / 2);
            return;
        }
        
        // Grid çizgileri (Yatay)
        if (config.grid.show) {
            ctx.strokeStyle = config.colors.grid;
            ctx.lineWidth = config.grid.lineWidth;
            ctx.setLineDash([5, 5]); // Kesikli çizgi
            
            for (let i = 0; i <= config.grid.lines; i++) {
                const y = config.padding.top + (chartHeight / config.grid.lines) * i;
                ctx.beginPath();
                ctx.moveTo(config.padding.left, y);
                ctx.lineTo(width - config.padding.right, y);
                ctx.stroke();
                
                // Y ekseni değerleri
                const value = Math.round(maxValue - (maxValue / config.grid.lines) * i);
                ctx.fillStyle = config.colors.text;
                ctx.font = `${config.font.size.axis}px ${config.font.family}`;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(value.toString(), config.padding.left - 10, y);
            }
            ctx.setLineDash([]); // Kesikli çizgiyi resetle
        }
        
        // Eksen çizgileri
        ctx.strokeStyle = config.colors.axis;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        
        // X ekseni
        ctx.beginPath();
        ctx.moveTo(config.padding.left, height - config.padding.bottom);
        ctx.lineTo(width - config.padding.right, height - config.padding.bottom);
        ctx.stroke();
        
        // Y ekseni
        ctx.beginPath();
        ctx.moveTo(config.padding.left, config.padding.top);
        ctx.lineTo(config.padding.left, height - config.padding.bottom);
        ctx.stroke();
        
        // Bar çizimi
        const spacing = chartWidth / data.labels.length;
        const barWidth = spacing * config.barWidth;
        
        data.labels.forEach((label, index) => {
            const value = data.data[index];
            const barHeight = (value / maxValue) * chartHeight * 0.95; // %95 kapla
            const x = config.padding.left + index * spacing + (spacing - barWidth) / 2;
            const y = height - config.padding.bottom - barHeight;
            
            if (isNaN(y) || isNaN(barHeight)) return;
            
            // Bar rengi (döngüsel renk paleti)
            const colorIndex = index % config.colors.bars.length;
            const gradient = ctx.createLinearGradient(0, y, 0, height - config.padding.bottom);
            gradient.addColorStop(0, config.colors.bars[colorIndex]);
            gradient.addColorStop(1, this.hexToRgba(config.colors.bars[colorIndex], 0.7));
            
            // Bar gölgesi
            ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            
            // Bar çiz
            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Gölgeyi resetle
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Değer etiketi (barın üzerinde)
            if (value > 0) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${config.font.size.value}px ${config.font.family}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(value.toString(), x + barWidth / 2, y + barHeight - 5);
            }
            
            // X ekseni etiketi (döndürülmüş)
            ctx.save();
            ctx.translate(x + barWidth / 2, height - config.padding.bottom + 20);
            ctx.rotate(-Math.PI / 6); // -30 derece döndür
            ctx.fillStyle = config.colors.text;
            ctx.font = `${config.font.size.label}px ${config.font.family}`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 0, 0);
            ctx.restore();
        });
        
        // Başlık
        ctx.fillStyle = config.colors.text;
        ctx.font = `bold ${config.font.size.title}px ${config.font.family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Aylık Bakım İstatistikleri', width / 2, 10);
        
        // Y ekseni başlığı
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = config.colors.axis;
        ctx.font = `${config.font.size.axis}px ${config.font.family}`;
        ctx.textAlign = 'center';
        ctx.fillText('Bakım Sayısı', 0, 0);
        ctx.restore();
        
        // X ekseni başlığı
        ctx.fillStyle = config.colors.axis;
        ctx.font = `${config.font.size.axis}px ${config.font.family}`;
        ctx.textAlign = 'center';
        ctx.fillText('Ay', width / 2, height - 15);
    }
    
    // Hex rengi RGBA'ya çevir
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

// Global istatistik nesnesi
const maintenanceStats = new MaintenanceStats();

// Otomatik tarih atama - HTML input için ISO format (yyyy-MM-dd)
function setAutoDate() {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // yyyy-MM-dd format
    
    // Tüm tarih input'larını otomatik doldur
    const dateInputs = [
        'periodic-date',
        'normal-date', 
        'fault-date'
    ];
    
    dateInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input && !input.value) {
            input.value = dateString;
            console.log(`Otomatik tarih ayarlandı ${id}: ${dateString}`);
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Sayfa yüklendiğinde tarihleri ayarla
    setAutoDate();
    
    // İstatistikleri yükle
    maintenanceStats.loadStats();
    
    // Bakım hatırlatıcılarını kontrol et
    checkMaintenanceReminders();
    
    // Yağ numune kontrolünü başlat
    checkOilSamples();
    
    // Form submit olaylarını güncelle
    document.querySelector('#periodic-form form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveMaintenanceData('periodic', e.target);
    });
    document.querySelector('#normal-form form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveMaintenanceData('normal', e.target);
    });
    document.querySelector('#fault-form form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveMaintenanceData('fault', e.target);
    });
    
    // Sistem başlatma butonu ekle (header'a)
    addSystemInitButton();
    
    // Çıkış butonları
    const sidebarLogout = document.getElementById('sidebarLogout');
    const headerLogout = document.getElementById('headerLogout');

    if (sidebarLogout) {
        sidebarLogout.addEventListener('click', function() {
            if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
                window.location.href = 'anasayfa.html';
            }
        });
    }

    if (headerLogout) {
        headerLogout.addEventListener('click', function() {
            if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
                window.location.href = 'anasayfa.html';
            }
        });
    }

    // Form butonları
    const formButtons = document.querySelectorAll('.form-btn');
    const forms = document.querySelectorAll('.maintenance-form');

    function switchForm(formType) {
        forms.forEach(form => { form.style.display = 'none'; });
        formButtons.forEach(btn => { btn.classList.remove('active'); });
        const selectedForm = document.getElementById(formType + '-form');
        if (selectedForm) selectedForm.style.display = 'block';
        const selectedButton = document.querySelector(`[data-form="${formType}"]`);
        if (selectedButton) selectedButton.classList.add('active');
    }

    formButtons.forEach(button => {
        button.addEventListener('click', function() {
            switchForm(this.getAttribute('data-form'));
        });
    });

    // Alternatör Gresleme hesaplama
    const frontInput = document.getElementById('alternator-front');
    const rearInput = document.getElementById('alternator-rear');
    const totalInput = document.getElementById('alternator-total');
    if (frontInput && rearInput && totalInput) {
        function calculateTotal() {
            const frontValue = parseFloat(frontInput.value) || 0;
            const rearValue = parseFloat(rearInput.value) || 0;
            totalInput.value = (frontValue + rearValue).toFixed(1);
        }
        frontInput.addEventListener('input', calculateTotal);
        rearInput.addEventListener('input', calculateTotal);
    }

    // Dış destek/Iç destek seçimi - varsayılan teknisyen gizli, seçime göre göster
    function initCompanySelect(companyId, technicianId, externalId) {
        const companySelect = document.getElementById(companyId);
        const technicianSelect = document.getElementById(technicianId);
        const externalSelect = document.getElementById(externalId);
        if (companySelect && technicianSelect && externalSelect) {
            // Varsayılan: teknisyen gizli
            technicianSelect.style.display = 'none';
            technicianSelect.required = false;
            externalSelect.style.display = 'none';
            externalSelect.required = false;
            
            companySelect.addEventListener('change', function() {
                if (this.value === 'internal') {
                    technicianSelect.style.display = 'block';
                    technicianSelect.required = true;
                    externalSelect.style.display = 'none';
                    externalSelect.required = false;
                    externalSelect.value = '';
                } else if (this.value === 'external') {
                    technicianSelect.style.display = 'none';
                    technicianSelect.required = false;
                    technicianSelect.value = '';
                    externalSelect.style.display = 'block';
                    externalSelect.required = true;
                } else {
                    // Seçim yoksa - varsayılan gizli
                    technicianSelect.style.display = 'none';
                    technicianSelect.required = false;
                    technicianSelect.value = '';
                    externalSelect.style.display = 'none';
                    externalSelect.required = false;
                    externalSelect.value = '';
                }
            });
        }
    }
    initCompanySelect('periodic-technician-company', 'periodic-technician', 'periodic-external-company');
    initCompanySelect('normal-technician-company', 'normal-technician', 'normal-external-company');
    initCompanySelect('fault-technician-company', 'fault-technician', 'fault-external-company');

    // Dosya yükleme alanları
    function initFileUpload(areaId, inputId, listId) {
        const area = document.getElementById(areaId);
        const input = document.getElementById(inputId);
        const list = document.getElementById(listId);
                
        console.log(`[initFileUpload] ${areaId}:`, { area: !!area, input: !!input, list: !!list });
                
        if (!area || !input || !list) {
            console.warn(`[initFileUpload] ${areaId}: Elementler bulunamadi!`);
            return;
        }

        // Dosya seçimi için özel handler
        // Kullanıcı direkt input üzerine tıklayabilir (CSS z-index ile üstte) 
        // veya area üzerine tıklayabilir
        
        input.addEventListener('click', (e) => {
            console.log(`[${inputId}] Input click - deger temizleniyor`);
            // Her tıklamada değeri temizle ki change event çalışsın
            input.value = '';
        });
        
        // Area click - input'a yönlendir
        area.addEventListener('click', (e) => {
            // Input zaten üstte ve tıklanabilir durumda
            // Bu event sadece yedek olarak kalıyor
            console.log(`[${areaId}] Area click`);
        });
        
        input.addEventListener('change', (e) => {
            console.log(`[${inputId}] Change event tetiklendi, dosya sayısı:`, input.files ? input.files.length : 0);
                    
            // Dosya seçilmeden çıkıldıysa işlem yapma
            if (!input.files || input.files.length === 0) {
                console.log(`[${inputId}] Dosya seçilmedi, çıkılıyor`);
                return;
            }
            
            console.log(`[${inputId}] ${input.files.length} dosya seçildi, listeleniyor...`);
            
            list.innerHTML = '';
            Array.from(input.files).forEach(file => {
                const div = document.createElement('div');
                div.className = 'file-item';
                div.innerHTML = `<span>📄 ${file.name} (${(file.size/1024).toFixed(1)} KB)</span>
                                <button class="file-remove" data-name="${file.name}">&times;</button>`;
                list.appendChild(div);
            });
            
            console.log(`[${inputId}] Input temizleniyor...`);
            const selectedFiles = Array.from(input.files);
            const dt = new DataTransfer();
            selectedFiles.forEach(f => dt.items.add(f));
            input.files = dt.files;
        });
        
        area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('dragover'); });
        area.addEventListener('dragleave', () => { area.classList.remove('dragover'); });
        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('dragover');
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event('change'));
        });
    }
    
    initFileUpload('periodic-file-area', 'periodic-files', 'periodic-file-list');
    initFileUpload('normal-file-area', 'normal-files', 'normal-file-list');
    initFileUpload('fault-file-area', 'fault-files', 'fault-file-list');

    // Bakım tipine göre dinamik alanlar
    const prioritySelect = document.getElementById('normal-priority');
    if (prioritySelect) {
        prioritySelect.addEventListener('change', function() {
            document.getElementById('alternator-grease-fields').style.display = 'none';
            document.getElementById('oil-sample-fields').style.display = 'none';
            document.getElementById('oil-filter-fields').style.display = 'none';
            document.getElementById('ht-lt-jacket-fields').style.display = 'none';
            if (this.value === 'alternator-grease') document.getElementById('alternator-grease-fields').style.display = 'block';
            else if (this.value === 'oil-sample') document.getElementById('oil-sample-fields').style.display = 'block';
            else if (this.value === 'oil-filter') document.getElementById('oil-filter-fields').style.display = 'block';
            else if (this.value === 'ht-lt-jacket') document.getElementById('ht-lt-jacket-fields').style.display = 'block';
        });
    }

    // Yardımcı fonksiyonlar
    function getTechnicianName(val) {
        const map = { 'ibrahim-ogun': 'İbrahim Ogün Şahin', 'yakup-can': 'Yakup Can Cin', 
                      'oguzhan-yaylali': 'Oğuzhan Yaylalı', 'altan-hunoglu': 'Altan Hunoğlu' };
        return map[val] || val;
    }
    function getNormalPriorityText(val) {
        const map = { 'alternator-grease': 'Alternatör Gresleme', 'oil-sample': 'Yağ Numune Alma',
                      'oil-filter': 'Yağ Filtre Değişimi', 'heat-exchanger': 'Eşanjör Ölçümü',
                      'ht-lt-jacket': 'HT LT Ceket Suyu Sıcaklık Ölçümü', 'other': 'Diğer' };
        return map[val] || val;
    }
    function getFaultReasonText(val) {
        const map = { 'electrical': 'Elektriksel', 'mechanical': 'Mekanik', 'electronic': 'Elektronik',
                      'hydraulic': 'Hidrolik', 'pneumatic': 'Pnömatik', 'software': 'Yazılım',
                      'maintenance': 'Bakım kaynaklı', 'other': 'Diğer' };
        return map[val] || val;
    }
    function getExternalCompanyName(val) {
        const map = { 'topkapi': 'Topkapı', 'other': 'Diğer' };
        return map[val] || val;
    }

});

// Bakım Hatırlatıcı Fonksiyonları
function checkMaintenanceReminders() {
    const reminders = [
        {
            title: 'GM-1 2000 Saat Bakımı',
            message: 'GM-1 motoru için 2000 saatlik periyodik bakım zamanı yaklaşıyor!',
            type: 'warning'
        },
        {
            title: 'Yağ Numunesi Kontrolü',
            message: 'GM-2 ve GM-3 için yağ numunesi alma zamanı geldi.',
            type: 'info'
        }
    ];

    // Hatırlatıcıları göster
    setTimeout(() => {
        reminders.forEach(reminder => {
            showNotification(reminder.title, reminder.message, reminder.type);
        });
    }, 3000); // Sistem başlatma bildiriminden sonra göster
}

// Sistem başlatma butonu ekle
function addSystemInitButton() {
    const user_info = document.querySelector('.user-info');
    if (user_info) {
        const initButton = document.createElement('button');
        initButton.className = 'system-init-btn';
        initButton.innerHTML = '🚀 Sistemi Başlat';
        initButton.style.cssText = `
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-left: 10px;
            transition: all 0.3s ease;
        `;
        
        initButton.addEventListener('click', initializeSystem);
        initButton.addEventListener('mouseenter', () => {
            initButton.style.transform = 'translateY(-2px)';
            initButton.style.boxShadow = '0 4px 12px rgba(40, 167, 69, 0.3)';
        });
        initButton.addEventListener('mouseleave', () => {
            initButton.style.transform = 'translateY(0)';
            initButton.style.boxShadow = 'none';
        });
        
        user_info.appendChild(initButton);
        
        // Test butonu ekle
        const testButton = document.createElement('button');
        testButton.className = 'test-connection-btn';
        testButton.innerHTML = '🔗 Bağlantı Test';
        testButton.style.cssText = `
            background: linear-gradient(135deg, #007bff, #0056b3);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-left: 5px;
            transition: all 0.3s ease;
        `;
        
        testButton.addEventListener('click', testConnection);
        testButton.addEventListener('mouseenter', () => {
            testButton.style.transform = 'translateY(-2px)';
            testButton.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.3)';
        });
        testButton.addEventListener('mouseleave', () => {
            testButton.style.transform = 'translateY(0)';
            testButton.style.boxShadow = 'none';
        });
        
        user_info.appendChild(testButton);
    }
}

// Bağlantı test fonksiyonu
async function testConnection() {
    try {
        showNotification('Test Ediliyor', 'Google Apps Script bağlantısı kontrol ediliyor...', 'info');
        
        const response = await fetch(SCRIPT_URL + '?action=test');
        const result = await response.json();
        
        if (result.success) {
            showNotification('Bağlantı Başarılı', 'Google Apps Script ile bağlantı kuruldu!', 'success');
        } else {
            showNotification('Bağlantı Hatası', result.message || 'Bağlantı kurulamadı', 'error');
        }
    } catch (error) {
        console.error('Bağlantı test hatası:', error);
        showNotification('Bağlantı Hatası', 'Google Apps Script\'e ulaşılamıyor. URL\'i kontrol edin.', 'error');
    }
}

// Bildirim gösterme fonksiyonu - eski ve yeni kodla uyumlu
function showNotification(arg1, arg2, arg3) {
    // Eski format: showNotification(type, title, message)
    // Yeni format: showNotification(title, message, type)
    let title, message, type;
    
    if (['success', 'error', 'warning', 'info'].includes(arg1) && typeof arg2 === 'string') {
        // Eski format
        type = arg1;
        title = arg2;
        message = arg3 || '';
    } else {
        // Yeni format
        title = arg1;
        message = arg2 || '';
        type = arg3 || 'info';
    }
    
    // Mevcut bildirimleri temizle
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    // Renkleri belirle
    const colors = {
        success: { bg: '#28a745', text: 'white' },
        error: { bg: '#dc3545', text: 'white' },
        warning: { bg: '#ffc107', text: '#212529' },
        info: { bg: '#17a2b8', text: 'white' }
    };
    
    const color = colors[type] || colors.info;
    
    // Bildirim container'ı oluştur
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${color.bg};
        color: ${color.text};
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        max-width: 350px;
        animation: slideIn 0.3s ease;
        border-left: 4px solid ${type === 'success' ? '#20c997' : type === 'error' ? '#bd2130' : type === 'warning' ? '#e0a800' : '#138496'};
    `;
    
    notification.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px; font-size: 1rem;">
            ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'} ${title}
        </div>
        <div style="font-size: 0.9rem; line-height: 1.4;">${message}</div>
        <button onclick="this.parentElement.remove()" style="
            position: absolute;
            top: 5px;
            right: 10px;
            background: none;
            border: none;
            color: ${color.text};
            font-size: 18px;
            cursor: pointer;
            opacity: 0.8;
        ">×</button>
    `;
    
    document.body.appendChild(notification);
    
    // Otomatik kaldır (süreye göre)
    const timeout = type === 'error' ? 8000 : type === 'warning' ? 6000 : 4000;
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, timeout);
}

// Slide-out animasyonu ekle
const slideOutStyle = document.createElement('style');
slideOutStyle.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(slideOutStyle);

// Arama fonksiyonu
document.addEventListener('DOMContentLoaded', function() {
    // ... mevcut kodlar ...

    // Arama input'u için event listener
    const searchInput = document.getElementById('table-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const tbody = document.getElementById('maintenance-tbody');
            const rows = tbody.getElementsByTagName('tr');

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const text = row.textContent.toLowerCase();
                
                if (text.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            }
        });
    }

    // Sayfa yüklendiğinde demo rapor göster
    setTimeout(() => {
        maintenanceReporter.generateReport();
    }, 1000);
});

// Bakım Raporlama Sınıfı
class MaintenanceReporter {
    constructor() {
        this.records = [];
        this.filteredRecords = [];
        this.currentSort = { column: null, direction: 'asc' };
    }

    // Rapor oluştur
    async generateReport() {
        const motor = document.getElementById('report-motor')?.value || '';
        const type = document.getElementById('report-type')?.value || '';
        const dateRange = document.getElementById('report-date-range')?.value || '7';

        console.log('=== RAPOR OLUŞTURMA BAŞLATILIYOR ===');
        console.log('Motor:', motor, 'Tip:', type, 'Tarih aralığı:', dateRange);

        try {
            const url = `${SCRIPT_URL}?action=getReport&motor=${encodeURIComponent(motor)}&type=${encodeURIComponent(type)}&range=${encodeURIComponent(dateRange)}`;
            console.log('URL:', url);
            
            const response = await fetch(url);
            console.log('Response status:', response.status);
            
            const data = await response.json();
            console.log('API yanıtı:', data);
            
            if (data.success) {
                console.log('Başarılı - displayReport çağrılıyor');
                this.displayReport(data);
            } else {
                console.warn('API başarısız:', data.message);
                this.showDemoReport();
            }
        } catch (error) {
            console.error('Rapor alınamadı - HATA:', error);
            this.showDemoReport();
        }
    }

    // Raporu göster
    displayReport(data) {
        const summary = data.summary || {};
        const records = data.records || [];
        
        // Özet kartları güncelle - null kontrolü ile
        const totalEl = document.getElementById('summary-total');
        const periodicEl = document.getElementById('summary-periodic');
        const normalEl = document.getElementById('summary-normal');
        const faultEl = document.getElementById('summary-fault');
        
        if (totalEl) totalEl.textContent = summary.total || 0;
        if (periodicEl) periodicEl.textContent = summary.periodic || 0;
        if (normalEl) normalEl.textContent = summary.normal || 0;
        if (faultEl) faultEl.textContent = summary.fault || 0;
        
        // Tabloyu doldur
        this.populateTable(records);
    }

    // Demo rapor göster
    showDemoReport() {
        console.warn('Demo rapor gösteriliyor');
        
        // Boş özet - null kontrolü ile
        const totalEl = document.getElementById('summary-total');
        const periodicEl = document.getElementById('summary-periodic');
        const normalEl = document.getElementById('summary-normal');
        const faultEl = document.getElementById('summary-fault');
        
        if (totalEl) totalEl.textContent = '0';
        if (periodicEl) periodicEl.textContent = '0';
        if (normalEl) normalEl.textContent = '0';
        if (faultEl) faultEl.textContent = '0';
        
        // Boş tablo
        this.populateTable([]);
    }

    // Tabloyu doldur - 5 sütun: tarih, motor, tür, teknisyen, işlem
    populateTable(records) {
        const tbody = document.getElementById('maintenance-tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">Henüz kayıt bulunmamaktadır</td></tr>';
            return;
        }
        
        records.forEach(record => {
            const tr = document.createElement('tr');
            
            // Tarihi TR formatına çevir (dd.MM.yyyy)
            let dateStr = record.date || '-';
            if (dateStr && dateStr !== '-') {
                const dateObj = new Date(dateStr);
                if (!isNaN(dateObj)) {
                    dateStr = dateObj.toLocaleDateString('tr-TR');
                }
            }
            
            // Motor adını büyük harfe çevir
            const motorStr = (record.motor || '-').toString().toUpperCase();
            
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${motorStr}</td>
                <td><span class="badge badge-${(record.type || '').toLowerCase()}">${record.type || '-'}</span></td>
                <td>${record.technician || '-'}</td>
                <td>${record.subtype || record.notes || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Tabloyu sırala
    sortTable(columnIndex) {
        const tbody = document.getElementById('maintenance-tbody');
        if (!tbody) return;
        
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (rows.length === 0) return;
        
        // Sıralama yönünü belirle
        if (this.currentSort.column === columnIndex) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.column = columnIndex;
            this.currentSort.direction = 'asc';
        }
        
        // Sırala
        rows.sort((a, b) => {
            const aText = a.cells[columnIndex]?.textContent || '';
            const bText = b.cells[columnIndex]?.textContent || '';
            
            if (this.currentSort.direction === 'asc') {
                return aText.localeCompare(bText);
            } else {
                return bText.localeCompare(aText);
            }
        });
        
        // Tabloyu güncelle
        tbody.innerHTML = '';
        rows.forEach(row => tbody.appendChild(row));
    }

    // Excel'e export - Detaylı format (12 sütun)
    exportToExcel() {
        // Önce rapor verilerini al
        const motor = document.getElementById('report-motor')?.value || '';
        const type = document.getElementById('report-type')?.value || '';
        const dateRange = document.getElementById('report-date-range')?.value || '7';
        
        // API'den verileri çek ve export et
        const url = `${SCRIPT_URL}?action=getReport&motor=${encodeURIComponent(motor)}&type=${encodeURIComponent(type)}&range=${encodeURIComponent(dateRange)}`;
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (!data.success || !data.records) {
                    showNotification('Hata', 'Export için veri alınamadı', 'error');
                    return;
                }
                
                // CSV başlıkları (Türkçe) - noktalı virgül ile
                const headers = ['Kayıt No', 'Tarih', 'Saat', 'Motor', 'Tür', 'Alt Tür', 'Teknisyen', 'Firma', 'Notlar', 'Dosyalar', 'Durum', 'Oluşturulma Zamanı'];
                let csv = [headers.join(';')];
                
                // Verileri ekle - noktalı virgül ile
                data.records.forEach(record => {
                    const row = [
                        record.recordNo || '',
                        record.date || '',
                        record.time || '',
                        record.motor || '',
                        record.type || '',
                        record.subtype || '',
                        record.technician || '',
                        record.company || '',
                        record.notes || '',
                        record.files || '',
                        record.status || 'Aktif',
                        record.timestamp || ''
                    ];
                    
                    // Her hücreyi tırnak içine al ve içindeki tırnakları çiftleyerek escape et
                    const escapedRow = row.map(cell => {
                        const cellStr = String(cell || '').replace(/"/g, '""');
                        return `"${cellStr}"`;
                    });
                    
                    csv.push(escapedRow.join(';'));
                });
                
                // CSV dosyasını indir
                const csvContent = '\uFEFF' + csv.join('\n'); // BOM ekleyerek Türkçe karakterleri destekle
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                
                link.setAttribute('href', url);
                link.setAttribute('download', 'bakim_raporu_detayli_' + new Date().toISOString().split('T')[0] + '.csv');
                link.style.visibility = 'hidden';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                showNotification('Başarılı', `Rapor Excel olarak indirildi (${data.records.length} kayıt)`, 'success');
            })
            .catch(error => {
                console.error('Export hatası:', error);
                showNotification('Hata', 'Rapor indirilemedi', 'error');
            });
    }
}

// Global raporlama nesnesi
const maintenanceReporter = new MaintenanceReporter();

// Global rapor fonksiyonları
function generateReport() {
    maintenanceReporter.generateReport();
}

function refreshTable() {
    maintenanceReporter.generateReport();
}

function exportReport() {
    maintenanceReporter.exportToExcel();
}

function sortTable(columnIndex) {
    maintenanceReporter.sortTable(columnIndex);
}

// Aktif Kayıtlar Yönetimi - Listeleme ve Kapatma
async function loadActiveRecords() {
    const motor = document.getElementById('active-filter-motor')?.value || '';
    const type = document.getElementById('active-filter-type')?.value || '';
    
    console.log('Aktif kayıtlar yükleniyor... Motor:', motor, 'Tip:', type);
    
    try {
        // Aktif kayıtları getir (status=Aktif)
        const url = `${SCRIPT_URL}?action=getActiveRecords&motor=${encodeURIComponent(motor)}&type=${encodeURIComponent(type)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            displayActiveRecords(data.records || []);
        } else {
            showNotification('Hata', data.message || 'Kayıtlar yüklenemedi', 'error');
            document.getElementById('active-records-tbody').innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">Kayıt bulunamadı</td></tr>';
        }
    } catch (error) {
        console.error('Aktif kayıtlar yüklenirken hata:', error);
        showNotification('Hata', 'Bağlantı hatası', 'error');
    }
}

function displayActiveRecords(records) {
    const tbody = document.getElementById('active-records-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">Aktif kayıt bulunmamaktadır</td></tr>';
        return;
    }
    
    records.forEach(record => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${record.recordNo}</td>
            <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${record.date}</td>
            <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${record.motor}</td>
            <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${record.type}</td>
            <td style="padding: 10px; border-bottom: 1px solid #dee2e6;">${record.technician}</td>
            <td style="padding: 10px; border-bottom: 1px solid #dee2e6;"><span style="color: #28a745; font-weight: 500;">● ${record.status}</span></td>
            <td style="padding: 10px; border-bottom: 1px solid #dee2e6; text-align: center;">
                <button onclick="closeRecord('${record.recordNo}')" style="padding: 6px 12px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Kapat</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function closeRecord(recordNo) {
    if (!confirm(`Kayıt ${recordNo} kapatılacak. Emin misiniz?`)) {
        return;
    }
    
    console.log('Kayıt kapatılıyor:', recordNo);
    
    try {
        const params = new URLSearchParams();
        params.append('action', 'closeRecord');
        params.append('recordNo', recordNo);
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: params
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Başarılı', `Kayıt ${recordNo} kapatıldı`, 'success');
            // Listeyi yenile
            loadActiveRecords();
            // Ana raporu da yenile
            if (maintenanceReporter) {
                maintenanceReporter.generateReport();
            }
        } else {
            showNotification('Hata', data.message || 'Kayıt kapatılamadı', 'error');
        }
    } catch (error) {
        console.error('Kayıt kapatılırken hata:', error);
        showNotification('Hata', 'Bağlantı hatası', 'error');
    }
}

// ========== YAĞ NUMUNE KONTROLÜ ==========

// Motor saatlerini getir ve kontrol et
async function checkOilSamples() {
    console.log('Yağ numune kontrolü başlatılıyor...');
    
    try {
        const url = `${SCRIPT_URL}?action=getMotorHours`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success && data.motors) {
            displayOilSampleNotifications(data.motors);
        } else {
            console.log('Motor saatleri alınamadı');
        }
    } catch (error) {
        console.error('Yağ numune kontrolünde hata:', error);
    }
}

// Yağ numune ve alternatör gresleme bildirimlerini göster
function displayOilSampleNotifications(motors) {
    const oilAlerts = [];
    const oilWarnings = [];
    const altAlerts = [];
    const altWarnings = [];
    
    motors.forEach(motor => {
        // Yağ numune kontrolü (50 saat kala uyarı)
        if (motor.needsOilSample) {
            oilAlerts.push({
                motor: motor.motor,
                message: `${motor.motor} için YAĞ NUMUNE alma zamanı geldi! Kalan: ${motor.remainingOilHours} saat`,
                type: 'urgent'
            });
        } else if (motor.remainingOilHours <= 100) {
            oilWarnings.push({
                motor: motor.motor,
                message: `${motor.motor} için yağ numune alma yaklaşıyor. Kalan: ${motor.remainingOilHours} saat`,
                type: 'warning'
            });
        }
        
        // Alternatör gresleme kontrolü (100 saat kala uyarı)
        if (motor.needsAlternatorGrease) {
            altAlerts.push({
                motor: motor.motor,
                message: `${motor.motor} için ALTERNATÖR GRESLEME zamanı geldi! Kalan: ${motor.remainingAltHours} saat`,
                type: 'urgent'
            });
        } else if (motor.remainingAltHours <= 200) {
            altWarnings.push({
                motor: motor.motor,
                message: `${motor.motor} için alternatör gresleme yaklaşıyor. Kalan: ${motor.remainingAltHours} saat`,
                type: 'warning'
            });
        }
    });
    
    // Yağ numune bildirimleri
    if (oilAlerts.length > 0) {
        oilAlerts.forEach(alert => {
            showNotification('⚠️ Yağ Numune Zamanı', alert.message, 'error', 10000);
        });
    }
    
    if (oilWarnings.length > 0) {
        oilWarnings.forEach(warning => {
            showNotification('ℹ️ Yağ Numune Yaklaşıyor', warning.message, 'warning', 8000);
        });
    }
    
    // Alternatör gresleme bildirimleri
    if (altAlerts.length > 0) {
        altAlerts.forEach(alert => {
            showNotification('🔧 Alternatör Gresleme Zamanı', alert.message, 'error', 10000);
        });
    }
    
    if (altWarnings.length > 0) {
        altWarnings.forEach(warning => {
            showNotification('ℹ️ Alternatör Gresleme Yaklaşıyor', warning.message, 'warning', 8000);
        });
    }
    
    console.log(`Kontrol tamamlandı: ${oilAlerts.length} yağ acil, ${oilWarnings.length} yağ uyarı, ${altAlerts.length} alternatör acil, ${altWarnings.length} alternatör uyarı`);
}

// Motor saati güncelle
async function updateMotorHours(motor, hours) {
    console.log(`Motor saati güncelleniyor: ${motor} = ${hours}`);
    
    try {
        const params = new URLSearchParams();
        params.append('action', 'updateMotorHours');
        params.append('motor', motor);
        params.append('hours', hours);
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: params
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Başarılı', `${motor} saati güncellendi: ${hours} saat`, 'success');
            // Tekrar kontrol et
            checkOilSamples();
        } else {
            showNotification('Hata', data.message || 'Saat güncellenemedi', 'error');
        }
    } catch (error) {
        console.error('Motor saati güncellenirken hata:', error);
        showNotification('Hata', 'Bağlantı hatası', 'error');
    }
}

// Yağ numune alma kaydı
async function recordOilSample(motor, currentHours) {
    console.log(`Yağ numune kaydı: ${motor} - ${currentHours} saat`);
    
    if (!confirm(`${motor} için yağ numune alındı mı?\nMevcut saat: ${currentHours}\nBir sonraki: ${currentHours + 500} saat`)) {
        return;
    }
    
    try {
        const params = new URLSearchParams();
        params.append('action', 'updateOilSample');
        params.append('motor', motor);
        params.append('currentHours', currentHours);
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: params
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Başarılı', `${motor} yağ numune kaydı güncellendi. Bir sonraki: ${data.nextOilSample} saat`, 'success');
            checkOilSamples();
        } else {
            showNotification('Hata', data.message || 'Kayıt güncellenemedi', 'error');
        }
    } catch (error) {
        console.error('Yağ numune kaydı güncellenirken hata:', error);
        showNotification('Hata', 'Bağlantı hatası', 'error');
    }
}

// Alternatör gresleme kaydı
async function recordAlternatorGrease(motor, currentHours) {
    console.log(`Alternatör gresleme kaydı: ${motor} - ${currentHours} saat`);
    
    if (!confirm(`${motor} için alternatör greslemesi yapıldı mı?\nMevcut saat: ${currentHours}\nBir sonraki: ${parseInt(currentHours) + 1000} saat`)) {
        return;
    }
    
    try {
        const params = new URLSearchParams();
        params.append('action', 'updateAlternatorGrease');
        params.append('motor', motor);
        params.append('currentHours', currentHours);
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: params
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Başarılı', `${motor} alternatör gresleme kaydı güncellendi. Bir sonraki: ${data.nextAlternatorGrease} saat`, 'success');
            checkOilSamples();
        } else {
            showNotification('Hata', data.message || 'Kayıt güncellenemedi', 'error');
        }
    } catch (error) {
        console.error('Alternatör gresleme kaydı güncellenirken hata:', error);
        showNotification('Hata', 'Bağlantı hatası', 'error');
    }
}
