(function () {
    'use strict';

    const SCRIPT_URLS = window.AppConfig ? window.AppConfig.SCRIPT_URLS : {};
    const PREVIEW_LIMIT = 120;
    const ID_COLUMN_KEYS = ['id', 'ID', 'kayitNo', 'recordNo'];

    const MODULES = [
        {
            key: 'saatlik',
            label: 'Saatlik Veri',
            shortLabel: 'Saatlik',
            description: 'Enerji sayac kayitlari',
            serviceKey: 'saatlik',
            params: { action: 'getRecords' },
            dateKeys: ['tarih'],
            columns: [
                ['id', 'ID'], ['tarih', 'Tarih'], ['saat', 'Saat'], ['vardiya', 'Vardiya'],
                ['aktifMwh', 'Aktif Enerji (MWh)'], ['reaktifMwh', 'Reaktif Enerji'],
                ['aydemAktif', 'Aydem Aktif'], ['aydemReaktif', 'Aydem Reaktif'],
                ['kaydeden', 'Kaydeden'], ['notlar', 'Notlar'], ['kayitTarihi', 'Kayit Tarihi']
            ]
        },
        {
            key: 'gunluk',
            label: 'Gunluk Veri',
            shortLabel: 'Gunluk',
            description: 'Gun sonu uretim ve ihtiyac degerleri',
            serviceKey: 'gunluk',
            params: { action: 'getRecords' },
            dateKeys: ['tarih'],
            columns: [
                ['id', 'ID'], ['tarih', 'Tarih'], ['yagSeviyesi', 'Yag Seviyesi'], ['kuplaj', 'Kuplaj'],
                ['gm1', 'GM-1'], ['gm2', 'GM-2'], ['gm3', 'GM-3'],
                ['icihtiyac', 'Ic Ihtiyac'], ['redresor1', 'Redresor 1'], ['redresor2', 'Redresor 2'],
                ['kojenIcihtiyac', 'Kojen Ic Ihtiyac'], ['servisTrafo', 'Servis Trafo'],
                ['kaydeden', 'Kaydeden'], ['kayitTarihi', 'Kayit Tarihi'], ['aciklama', 'Aciklama']
            ]
        },
        {
            key: 'buhar',
            label: 'Buhar Verisi',
            shortLabel: 'Buhar',
            description: 'Gunluk buhar miktari',
            serviceKey: 'buhar',
            params: { action: 'getRecords' },
            dateKeys: ['tarih'],
            columns: [
                ['tarih', 'Tarih'], ['buharMiktari', 'Buhar Miktari'],
                ['kaydeden', 'Kaydeden'], ['kayitTarihi', 'Kayit Tarihi']
            ]
        },
        {
            key: 'vardiya',
            label: 'Vardiya Takip',
            shortLabel: 'Vardiya',
            description: 'Vardiya acilis kapanis kayitlari',
            serviceKey: 'vardiya',
            params: { action: 'getRecords' },
            dateKeys: ['tarih'],
            columns: [
                ['id', 'ID'], ['tarih', 'Tarih'], ['vardiya', 'Vardiya'], ['personel', 'Personel'],
                ['operator', 'Operator'], ['yardimciOperator', 'Yardimci Operator'],
                ['baslangicSaati', 'Baslangic'], ['bitisSaati', 'Bitis'],
                ['durum', 'Durum'], ['devredenIsler', 'Devreden Isler'], ['kayitTarihi', 'Kayit Tarihi']
            ]
        },
        {
            key: 'motor',
            label: 'Kojen Motor Veri',
            shortLabel: 'Motor',
            description: 'GM motor sicaklik ve basinc degerleri',
            serviceKey: 'motor',
            params: { action: 'getRecords' },
            dateKeys: ['tarih'],
            columns: [
                ['tarih', 'Tarih'], ['saat', 'Saat'], ['vardiya', 'Vardiya'], ['motor', 'Motor'],
                ['jenYatakSicaklikDE', 'Jen Yatak DE'], ['jenYatakSicaklikNDE', 'Jen Yatak NDE'],
                ['sogutmaSuyuSicaklik', 'Sogutma Suyu Sicaklik'], ['sogutmaSuyuBasinc', 'Sogutma Suyu Basinc'],
                ['yagSicaklik', 'Yag Sicaklik'], ['yagBasinc', 'Yag Basinc'],
                ['sarjSicaklik', 'Sarj Sicaklik'], ['sarjBasinc', 'Sarj Basinc'],
                ['gazRegulatoru', 'Gaz Regulatoru'], ['makineDairesiSicaklik', 'Makine Dairesi Sicaklik'],
                ['karterBasinc', 'Karter Basinc'], ['onKamaraFarkBasinc', 'On Kamara Fark Basinc'],
                ['sargiSicaklik1', 'Sargi 1'], ['sargiSicaklik2', 'Sargi 2'], ['sargiSicaklik3', 'Sargi 3'],
                ['durum', 'Durum'], ['kaydeden', 'Kaydeden'], ['kayitTarihi', 'Kayit Tarihi']
            ]
        },
        {
            key: 'enerji',
            label: 'Kojen Enerji Veri',
            shortLabel: 'Enerji',
            description: 'GM elektriksel calisma degerleri',
            serviceKey: 'enerji',
            params: { action: 'getRecords' },
            dateKeys: ['tarih'],
            columns: [
                ['tarih', 'Tarih'], ['saat', 'Saat'], ['vardiya', 'Vardiya'], ['motor', 'Motor'],
                ['aydemVoltaji', 'Aydem Voltaji'], ['aktifGuc', 'Aktif Guc'], ['reaktifGuc', 'Reaktif Guc'],
                ['cosPhi', 'Cos Phi'], ['ortAkim', 'Ortalama Akim'], ['ortGerilim', 'Ortalama Gerilim'],
                ['notrAkim', 'Notr Akim'], ['tahrikGerilimi', 'Tahrik Gerilimi'],
                ['toplamAktifEnerji', 'Toplam Aktif Enerji'], ['calismaSaati', 'Calisma Saati'],
                ['kalkisSayisi', 'Kalkis Sayisi'], ['durum', 'Durum'], ['kaydeden', 'Kaydeden'], ['kayitTarihi', 'Kayit Tarihi']
            ]
        },
        {
            key: 'bakim',
            label: 'Bakim Takip',
            shortLabel: 'Bakim',
            description: 'Periyodik, normal ve ariza bakimlari',
            serviceKey: 'bakim',
            params: { action: 'getReport', range: 'all', skipSummary: '1' },
            dateKeys: ['date', 'startDate', 'timestamp'],
            columns: [
                ['recordNo', 'Kayit No'], ['date', 'Tarih'], ['time', 'Saat'], ['motor', 'Motor'],
                ['type', 'Ana Tur'], ['subtype', 'Alt Tur'], ['company', 'Destek Tipi'],
                ['technician', 'Sorumlu'], ['status', 'Durum'], ['currentHours', 'Motor Saati'],
                ['operation', 'Islem'], ['notes', 'Aciklama'], ['closedAt', 'Kapama Zamani'], ['sheetName', 'Sayfa']
            ]
        },
        {
            key: 'stok',
            label: 'Stok Takip',
            shortLabel: 'Stok',
            description: 'Malzeme listesi ve stok hareketleri',
            parts: [
                {
                    key: 'stokMalzemeler',
                    label: 'Stok Malzemeleri',
                    serviceKey: 'stok',
                    params: { action: 'getMaterials' },
                    skipDateFilter: true,
                    columns: [
                        ['id', 'ID'], ['code', 'Kod'], ['name', 'Malzeme'], ['category', 'Kategori'], ['quantity', 'Miktar'],
                        ['unit', 'Birim'], ['minStock', 'Min. Stok'], ['status', 'Durum'],
                        ['description', 'Aciklama'], ['createdBy', 'Olusturan'], ['createdDate', 'Olusturma'], ['lastUpdated', 'Son Guncelleme']
                    ]
                },
                {
                    key: 'stokIslemleri',
                    label: 'Stok Islemleri',
                    serviceKey: 'stok',
                    params: { action: 'getTransactions', limit: 'all' },
                    dateKeys: ['date', 'createdDate'],
                    columns: [
                        ['id', 'ID'], ['date', 'Tarih'], ['materialName', 'Malzeme'], ['materialId', 'Malzeme ID'],
                        ['type', 'Islem'], ['quantity', 'Miktar'], ['unit', 'Birim'],
                        ['person', 'Personel'], ['reason', 'Aciklama'], ['createdDate', 'Kayit Tarihi']
                    ]
                }
            ]
        }
    ];

    const state = {
        cache: {},
        sections: [],
        isDirty: true
    };

    document.addEventListener('DOMContentLoaded', function () {
        if (!requireAdmin()) return;
        initializeDates();
        renderModuleCards();
        bindEvents();
        updateSummary();
    });

    function bindEvents() {
        document.getElementById('refreshExportBtn')?.addEventListener('click', loadSelectedData);
        document.getElementById('exportSelectedBtn')?.addEventListener('click', exportSelectedData);
        document.getElementById('selectAllBtn')?.addEventListener('click', function () {
            setAllModules(true);
        });
        document.getElementById('clearAllBtn')?.addEventListener('click', function () {
            setAllModules(false);
        });
        document.getElementById('clearDateBtn')?.addEventListener('click', function () {
            setValue('startDateInput', '');
            setValue('endDateInput', '');
            markDirty();
            updateSummary();
        });
        document.getElementById('previewSectionSelect')?.addEventListener('change', renderPreview);
        document.getElementById('startDateInput')?.addEventListener('change', function () {
            markDirty();
            updateSummary();
        });
        document.getElementById('endDateInput')?.addEventListener('change', function () {
            markDirty();
            updateSummary();
        });
    }

    function requireAdmin() {
        const user = getCurrentUser();
        if (!user) {
            window.location.href = 'index.html';
            return false;
        }

        if (!isAdminUser(user)) {
            document.body.innerHTML = [
                '<main class="export-access-lock">',
                '  <section class="export-panel">',
                '    <h1>Yetki Gerekli</h1>',
                '    <p>Bu sayfa sadece admin kullanicilar icindir.</p>',
                '    <a class="btn ghost" href="anasayfa.html">Ana Sayfa</a>',
                '  </section>',
                '</main>'
            ].join('');
            return false;
        }

        const name = getUserName(user);
        setText('userNameDisplay', name);
        setText('sidebarUserNameDisplay', name);
        return true;
    }

    function getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem('loggedInUser') || 'null');
        } catch (error) {
            return null;
        }
    }

    function isAdminUser(user) {
        if (!user) return false;
        const role = normalizeLoose(user.role || user.yetki || user.userRole || '');
        const type = normalizeLoose(user.type || user.kullaniciTipi || '');
        const status = normalizeLoose(user.status || user.durum || '');
        const fullName = [user.firstName || user.ad || user.name || '', user.lastName || user.soyad || '']
            .join(' ')
            .trim();
        return role === 'ADMIN' ||
            role === 'YONETICI' ||
            type === 'ADMIN' ||
            status === 'ADMIN' ||
            user.isAdmin === true ||
            user.admin === true ||
            normalizeLoose(fullName || user.email || '') === 'MURAT COSKUN';
    }

    function normalizeLoose(value) {
        return String(value || '')
            .trim()
            .toUpperCase()
            .replace(/\u0130/g, 'I')
            .replace(/\u0049\u0307/g, 'I')
            .replace(/\u00C7/g, 'C')
            .replace(/\u011E/g, 'G')
            .replace(/\u00D6/g, 'O')
            .replace(/\u015E/g, 'S')
            .replace(/\u00DC/g, 'U');
    }

    function getUserName(user) {
        return [user.firstName || user.ad || user.name || '', user.lastName || user.soyad || '']
            .join(' ')
            .trim() || user.email || 'Admin';
    }

    function initializeDates() {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        setValue('startDateInput', formatIsoDate(firstDay));
        setValue('endDateInput', formatIsoDate(now));
    }

    function renderModuleCards() {
        const grid = document.getElementById('moduleGrid');
        if (!grid) return;

        grid.innerHTML = MODULES.map(module => [
            `<article class="export-module-card" data-module-card="${escapeAttr(module.key)}">`,
            '  <div class="export-module-top">',
            '    <label class="export-module-check">',
            `      <input type="checkbox" data-module-check="${escapeAttr(module.key)}" checked aria-label="${escapeAttr(module.label)} sec">`,
            '    </label>',
            '    <div class="export-module-title">',
            `      <strong>${escapeHtml(module.label)}</strong>`,
            `      <span class="export-module-meta-text">${escapeHtml(module.description)}</span>`,
            '    </div>',
            '  </div>',
            '  <div class="export-module-meta">',
            `    <span><small>Kayit</small><b id="count-${escapeAttr(module.key)}">-</b></span>`,
            `    <span><small>Bolum</small><b>${module.parts ? module.parts.length : 1}</b></span>`,
            '  </div>',
            '  <div class="export-module-actions">',
            `    <button type="button" class="btn ghost" data-module-export="${escapeAttr(module.key)}" disabled>Excel</button>`,
            '  </div>',
            `  <div class="export-module-status" id="status-${escapeAttr(module.key)}">Hazir</div>`,
            '</article>'
        ].join('')).join('');

        document.querySelectorAll('[data-module-check]').forEach(input => {
            input.addEventListener('change', function () {
                markDirty();
                updateCardSelection(input.dataset.moduleCheck, input.checked);
                updateSummary();
            });
        });

        document.querySelectorAll('[data-module-export]').forEach(button => {
            button.addEventListener('click', function () {
                exportSingleModule(button.dataset.moduleExport);
            });
        });
    }

    function setAllModules(checked) {
        document.querySelectorAll('[data-module-check]').forEach(input => {
            input.checked = checked;
            updateCardSelection(input.dataset.moduleCheck, checked);
        });
        markDirty();
        updateSummary();
    }

    function updateCardSelection(key, checked) {
        const card = document.querySelector(`[data-module-card="${cssEscape(key)}"]`);
        if (card) card.classList.toggle('is-disabled', !checked);
    }

    async function loadSelectedData() {
        const selected = getSelectedModules();
        if (!selected.length) {
            showNotice('En az bir modul secmelisin.');
            return false;
        }

        const range = getRange();
        if (!range.valid) {
            showNotice('Baslangic tarihi bitis tarihinden buyuk olamaz.');
            return false;
        }

        hideNotice();
        setStatus('Veri aliniyor', 'Servisler sirayla okunuyor');
        state.cache = {};
        state.sections = [];

        for (const module of selected) {
            setModuleStatus(module.key, 'Yukleniyor...', '');
            try {
                const result = await fetchModule(module, range);
                state.cache[module.key] = result;
                state.sections.push(...result.sections);
                setModuleCount(module.key, result.count);
                setModuleStatus(module.key, result.errors.length ? result.errors.join(' | ') : `${formatNumber(result.count)} kayit hazir`, result.errors.length ? 'warn' : 'ok');
                enableModuleExport(module.key, result.count > 0);
            } catch (error) {
                const message = error && error.message ? error.message : String(error);
                state.cache[module.key] = {
                    key: module.key,
                    label: module.label,
                    count: 0,
                    sections: [],
                    errors: [message]
                };
                setModuleCount(module.key, 0);
                setModuleStatus(module.key, message, 'error');
                enableModuleExport(module.key, false);
            }
            updateSummary();
        }

        state.isDirty = false;
        renderPreviewOptions();
        renderPreview();

        const total = state.sections.reduce((sum, section) => sum + section.rows.length, 0);
        setStatus('Hazir', `${formatNumber(total)} kayit yuklendi`);
        if (!total) {
            showNotice('Secili aralikta disa aktarilacak kayit bulunamadi.');
        }
        return true;
    }

    async function fetchModule(module, range) {
        const parts = module.parts || [module];
        const sections = [];
        const errors = [];

        for (const part of parts) {
            const serviceKey = part.serviceKey || module.serviceKey;
            const result = await fetchJson(SCRIPT_URLS[serviceKey], part.params || module.params || {});
            if (!result.success) {
                errors.push(`${part.label || module.label}: ${result.error || 'Servis hatasi'}`);
                sections.push(createSection(module, part, []));
                continue;
            }
            const rows = filterRows(extractRows(result), part, module, range);
            sections.push(createSection(module, part, rows));
        }

        return {
            key: module.key,
            label: module.label,
            count: sections.reduce((sum, section) => sum + section.rows.length, 0),
            sections,
            errors
        };
    }

    function createSection(module, part, rows) {
        const isPart = part.key && part.key !== module.key;
        return {
            key: isPart ? part.key : module.key,
            moduleKey: module.key,
            label: isPart ? `${module.label} - ${part.label}` : module.label,
            shortLabel: isPart ? part.label : module.shortLabel,
            rows,
            columns: normalizeColumns(part.columns || module.columns || [], rows)
        };
    }

    async function fetchJson(baseUrl, params) {
        let urlText = baseUrl || '';
        try {
            if (!baseUrl) {
                return { success: false, error: 'Servis URL tanimli degil' };
            }

            const url = new URL(baseUrl);
            Object.keys(params || {}).forEach(key => url.searchParams.set(key, params[key]));
            urlText = url.toString();

            const response = await fetch(url);
            const text = await response.text();
            const trimmed = text.trim();

            if (!response.ok) {
                return { success: false, error: `HTTP ${response.status}: ${extractServiceError(text)}`, url: urlText };
            }

            if (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[') {
                return { success: false, error: extractServiceError(text), url: urlText };
            }

            const result = JSON.parse(trimmed);
            if (!result.success) {
                return { success: false, error: result.error || result.message || 'Servis hatasi', url: urlText };
            }
            return { ...result, url: urlText };
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            const detail = message === 'Failed to fetch'
                ? 'Servisten JSON alinamadi. Apps Script deployment hata/izin sayfasi donduruyor olabilir.'
                : message;
            return { success: false, error: urlText ? `${detail} (${urlText})` : detail, url: urlText };
        }
    }

    function extractServiceError(text) {
        const clean = String(text || '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return clean.slice(0, 240) || 'Servis yaniti okunamadi';
    }

    function extractRows(result) {
        if (Array.isArray(result)) return result;
        if (Array.isArray(result.data)) return result.data;
        if (Array.isArray(result.records)) return result.records;
        if (result.data && Array.isArray(result.data.records)) return result.data.records;
        if (result.payload && Array.isArray(result.payload.records)) return result.payload.records;
        return [];
    }

    function filterRows(rows, part, module, range) {
        if (!Array.isArray(rows)) return [];
        if (part.skipDateFilter) return rows.slice();
        if (!range.start && !range.end) return rows.slice();

        const dateKeys = part.dateKeys || module.dateKeys || [];
        return rows.filter(row => {
            const iso = getRowIsoDate(row, dateKeys);
            if (!iso) return false;
            if (range.start && iso < range.start) return false;
            if (range.end && iso > range.end) return false;
            return true;
        });
    }

    function getRowIsoDate(row, dateKeys) {
        for (const key of dateKeys) {
            const iso = parseDateToIso(row && row[key]);
            if (iso) return iso;
        }
        return '';
    }

    function parseDateToIso(value) {
        if (value instanceof Date && !isNaN(value)) return formatIsoDate(value);
        const text = String(value || '').trim();
        if (!text) return '';

        const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

        const trMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        if (trMatch) {
            return `${trMatch[3]}-${trMatch[2].padStart(2, '0')}-${trMatch[1].padStart(2, '0')}`;
        }

        const parsed = new Date(text);
        if (!isNaN(parsed)) return formatIsoDate(parsed);
        return '';
    }

    async function exportSelectedData() {
        if (state.isDirty || !state.sections.length) {
            const loaded = await loadSelectedData();
            if (!loaded) return;
        }
        const sections = getSelectedSections();
        if (!sections.length) {
            showNotice('Excel icin hazir veri bulunamadi.');
            return;
        }
        downloadWorkbook(sections, `kojenerasyon-veri-disa-aktarim-${fileDateStamp()}.xls`);
    }

    function exportSingleModule(moduleKey) {
        const result = state.cache[moduleKey];
        if (!result || !result.sections || !result.sections.length) {
            showNotice('Bu modul icin once verileri getir.');
            return;
        }
        const sections = result.sections.filter(section => section.rows.length);
        if (!sections.length) {
            showNotice(`${result.label} icin aktarilacak kayit yok.`);
            return;
        }
        downloadWorkbook(sections, `kojenerasyon-${moduleKey}-${fileDateStamp()}.xls`);
    }

    function downloadWorkbook(sections, fileName) {
        const xml = buildExcelXml(sections);
        const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus('Indirildi', fileName);
    }

    function buildExcelXml(sections) {
        const workbookSections = [
            buildSummaryWorksheet(sections),
            ...sections.map(buildDataWorksheet)
        ].join('');

        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<?mso-application progid="Excel.Sheet"?>',
            '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
            ' xmlns:o="urn:schemas-microsoft-com:office:office"',
            ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
            ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
            '<Styles>',
            '<Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2563EB" ss:Pattern="Solid"/></Style>',
            '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>',
            '</Styles>',
            workbookSections,
            '</Workbook>'
        ].join('');
    }

    function buildSummaryWorksheet(sections) {
        const rows = [
            ['Kojenerasyon Veri Disa Aktarim'],
            ['Olusturma', new Date().toLocaleString('tr-TR')],
            ['Tarih Araligi', getRangeLabel()],
            [],
            ['Bolum', 'Kayit Sayisi']
        ];
        sections.forEach(section => rows.push([section.label, section.rows.length]));
        return buildWorksheet('Ozet', rows, 4);
    }

    function buildDataWorksheet(section) {
        const columns = section.columns.length ? section.columns : normalizeColumns([], section.rows);
        const rows = [
            columns.map(column => column.label)
        ];

        if (!section.rows.length) {
            rows.push(['Kayit yok']);
        } else {
            section.rows.forEach(row => {
                rows.push(columns.map(column => formatCell(row ? row[column.key] : '')));
            });
        }

        return buildWorksheet(section.label, rows, 0);
    }

    function buildWorksheet(name, rows, headerRowIndex) {
        const safeName = safeSheetName(name);
        return [
            `<Worksheet ss:Name="${escapeXml(safeName)}"><Table>`,
            rows.map((row, rowIndex) => {
                const style = rowIndex === headerRowIndex ? ' ss:StyleID="header"' : (rowIndex < headerRowIndex ? ' ss:StyleID="title"' : '');
                return `<Row>${row.map(cell => `<Cell${style}><Data ss:Type="String">${escapeXml(formatCell(cell))}</Data></Cell>`).join('')}</Row>`;
            }).join(''),
            '</Table></Worksheet>'
        ].join('');
    }

    function safeSheetName(name) {
        return String(name || 'Veri')
            .replace(/[\\/?*[\]:]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 31) || 'Veri';
    }

    function renderPreviewOptions() {
        const select = document.getElementById('previewSectionSelect');
        if (!select) return;
        const sections = state.sections;
        select.innerHTML = sections.length
            ? sections.map(section => `<option value="${escapeAttr(section.key)}">${escapeHtml(section.label)} (${formatNumber(section.rows.length)})</option>`).join('')
            : '<option value="">Veri yok</option>';
    }

    function renderPreview() {
        const select = document.getElementById('previewSectionSelect');
        const key = select ? select.value : '';
        const section = state.sections.find(item => item.key === key) || state.sections[0];
        const head = document.getElementById('previewTableHead');
        const body = document.getElementById('previewTableBody');
        if (!head || !body) return;

        if (!section) {
            head.innerHTML = '';
            body.innerHTML = '<tr><td class="export-empty">Henuz veri yuklenmedi.</td></tr>';
            setText('previewSubtitle', 'Verileri getirdikten sonra secili bolumun ilk kayitlari burada gorunur.');
            setText('previewCountChip', '0 kayit');
            return;
        }

        const columns = section.columns.length ? section.columns : normalizeColumns([], section.rows);
        const previewRows = section.rows.slice(0, PREVIEW_LIMIT);
        head.innerHTML = `<tr>${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>`;
        body.innerHTML = previewRows.length
            ? previewRows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(formatCell(row[column.key]))}</td>`).join('')}</tr>`).join('')
            : `<tr><td class="export-empty" colspan="${Math.max(1, columns.length)}">Kayit yok.</td></tr>`;

        setText('previewSubtitle', `${section.label} bolumu onizleniyor. Excel dosyasinda tum satirlar yer alir.`);
        setText('previewCountChip', `${formatNumber(section.rows.length)} kayit`);
    }

    function normalizeColumns(columns, rows) {
        const normalized = (columns || []).map(item => Array.isArray(item)
            ? { key: item[0], label: item[1] || item[0] }
            : item
        );
        const seen = new Set(normalized.map(column => column.key));
        (rows || []).slice(0, 20).forEach(row => {
            Object.keys(row || {}).forEach(key => {
                if (!seen.has(key)) {
                    seen.add(key);
                    normalized.push({ key, label: key });
                }
            });
        });
        return prioritizeIdColumns(normalized);
    }

    function prioritizeIdColumns(columns) {
        const list = columns || [];
        const idColumns = [];
        const otherColumns = [];
        list.forEach(column => {
            if (ID_COLUMN_KEYS.indexOf(column.key) !== -1) {
                idColumns.push(column);
            } else {
                otherColumns.push(column);
            }
        });
        return idColumns.concat(otherColumns);
    }

    function getSelectedModules() {
        const selected = new Set(Array.from(document.querySelectorAll('[data-module-check]:checked')).map(input => input.dataset.moduleCheck));
        return MODULES.filter(module => selected.has(module.key));
    }

    function getSelectedSections() {
        const selected = new Set(getSelectedModules().map(module => module.key));
        return state.sections.filter(section => selected.has(section.moduleKey) && section.rows.length);
    }

    function getRange() {
        const start = document.getElementById('startDateInput')?.value || '';
        const end = document.getElementById('endDateInput')?.value || '';
        return {
            start,
            end,
            valid: !start || !end || start <= end
        };
    }

    function getRangeLabel() {
        const range = getRange();
        if (range.start && range.end) return `${isoToTr(range.start)} - ${isoToTr(range.end)}`;
        if (range.start) return `${isoToTr(range.start)} sonrasi`;
        if (range.end) return `${isoToTr(range.end)} oncesi`;
        return 'Tum kayitlar';
    }

    function updateSummary() {
        const selectedCount = getSelectedModules().length;
        const total = state.sections.reduce((sum, section) => sum + section.rows.length, 0);
        setText('selectedModuleCount', selectedCount);
        setText('totalRecordCount', formatNumber(total));
        setText('rangeSummary', getRangeLabel());
    }

    function markDirty() {
        state.isDirty = true;
        setStatus('Guncelleme gerekli', 'Filtre veya secim degisti');
    }

    function showNotice(message) {
        const node = document.getElementById('exportNotice');
        if (!node) return;
        node.textContent = message;
        node.hidden = false;
    }

    function hideNotice() {
        const node = document.getElementById('exportNotice');
        if (node) node.hidden = true;
    }

    function setStatus(status, detail) {
        setText('exportStatusText', status);
        setText('exportStatusDetail', detail);
    }

    function setModuleStatus(key, text, stateName) {
        const node = document.getElementById(`status-${key}`);
        if (!node) return;
        node.textContent = text;
        node.className = `export-module-status ${stateName || ''}`.trim();
    }

    function setModuleCount(key, count) {
        setText(`count-${key}`, formatNumber(count));
    }

    function enableModuleExport(key, enabled) {
        const button = document.querySelector(`[data-module-export="${cssEscape(key)}"]`);
        if (button) button.disabled = !enabled;
    }

    function setText(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    }

    function setValue(id, value) {
        const node = document.getElementById(id);
        if (node) node.value = value;
    }

    function formatIsoDate(date) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    function isoToTr(iso) {
        const parts = String(iso || '').split('-');
        return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : iso;
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('tr-TR').format(Number(value) || 0);
    }

    function formatCell(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    function fileDateStamp() {
        const now = new Date();
        return [
            formatIsoDate(now),
            `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`
        ].join('_');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function escapeXml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(value);
        }
        return String(value).replace(/"/g, '\\"');
    }
})();
