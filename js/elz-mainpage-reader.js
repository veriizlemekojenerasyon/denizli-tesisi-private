(function (root) {
    'use strict';

    const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
    const CONFIG_KEY = 'elzMainpage';
    const TARGETS = {
        elz116117: {
            valueId: 'elz116117Value',
            metaId: 'elz116117Meta',
            title: 'ELZ 116-117'
        },
        elz119121: {
            valueId: 'elz119121Value',
            metaId: 'elz119121Meta',
            title: 'ELZ 119/121'
        }
    };

    let refreshTimer = null;
    let lastSuccessfulLoad = 0;

    function getProxyUrl() {
        if (!root.AppConfig || typeof root.AppConfig.getScriptUrl !== 'function') {
            return '';
        }
        return root.AppConfig.getScriptUrl(CONFIG_KEY) || '';
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const element = byId(id);
        if (element) element.textContent = value;
    }

    function setHtml(id, value) {
        const element = byId(id);
        if (element) element.innerHTML = value;
    }

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setStatus(text, state) {
        const status = byId('elzRefreshStatus');
        if (!status) return;
        status.textContent = text;
        status.className = 'elz-refresh-status is-' + (state || 'idle');
    }

    function formatNumber(value) {
        if (value === null || value === undefined || value === '') return '--';
        const numberValue = Number(String(value).replace(',', '.'));
        if (!Number.isFinite(numberValue)) return String(value);

        return numberValue.toLocaleString('tr-TR', {
            maximumFractionDigits: Math.abs(numberValue) >= 100 ? 1 : 2
        });
    }

    function formatValue(item) {
        if (!item) return '--';
        if (item.valueFormatted) return item.valueFormatted;

        const value = formatNumber(item.value);
        const unit = item.unit || item.measurement || '';
        return unit ? value + ' ' + unit : value;
    }

    function formatDateTime(value) {
        if (!value) return '--';
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);

        return date.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function renderTarget(key, item) {
        const target = TARGETS[key];
        if (!target) return;

        setText(target.valueId, formatValue(item));

        if (item && Array.isArray(item.items) && item.items.length) {
            const rows = item.items.map(function (row) {
                return [
                    '<span class="elz-card-row',
                    row.missing ? ' is-missing' : '',
                    '">',
                    '<span class="elz-card-row__label">',
                    escapeHtml(row.metric || row.label || 'Deger'),
                    '</span>',
                    '<span class="elz-card-row__value">',
                    escapeHtml(row.valueFormatted || formatValue(row)),
                    '</span>',
                    '</span>'
                ].join('');
            }).join('');
            setHtml(target.metaId, rows);
            return;
        }

        const parts = [];
        if (item && item.label) parts.push(item.label);
        if (item && item.lastUpdateTime) parts.push('Veri: ' + formatDateTime(item.lastUpdateTime));
        if (item && item.source) parts.push('Kaynak: ' + item.source);

        setText(target.metaId, parts.length ? parts.join(' | ') : 'Veri bulunamadi');
    }

    function renderEmpty(message) {
        Object.keys(TARGETS).forEach(function (key) {
            renderTarget(key, null);
        });
        setText('elzLastUpdate', '--');
        setText('elzSourceMeta', message || 'Proxy bekleniyor');
    }

    function buildUrl(proxyUrl) {
        const separator = proxyUrl.indexOf('?') === -1 ? '?' : '&';
        return proxyUrl + separator + 'action=getElzMainpageValues&_=' + Date.now();
    }

    async function loadElzMainpageValues() {
        const proxyUrl = getProxyUrl();
        if (!proxyUrl) {
            setStatus('Proxy URL yok', 'warning');
            renderEmpty('js/app-config.js icinde elzMainpage URL bekleniyor');
            return null;
        }

        setStatus('Guncelleniyor', 'loading');

        try {
            const response = await fetch(buildUrl(proxyUrl), {
                method: 'GET',
                cache: 'no-store'
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            const payload = await response.json();
            if (!payload || payload.success === false) {
                throw new Error((payload && payload.error) || 'ELZ verisi alinamadi');
            }

            const data = payload.data || payload.values || payload;
            renderTarget('elz116117', data.elz116117);
            renderTarget('elz119121', data.elz119121);

            lastSuccessfulLoad = Date.now();
            setText('elzLastUpdate', formatDateTime(payload.refreshedAt || new Date()));
            setText('elzSourceMeta', payload.source || 'ELZ ana sayfa proxy');
            setStatus('Guncel', 'success');
            return payload;
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            setStatus('Hata', 'error');
            setText('elzSourceMeta', message);
            return null;
        }
    }

    function init() {
        loadElzMainpageValues();

        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(loadElzMainpageValues, REFRESH_INTERVAL_MS);

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) return;
            if (Date.now() - lastSuccessfulLoad > REFRESH_INTERVAL_MS) {
                loadElzMainpageValues();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    root.ElzMainpageReader = {
        refresh: loadElzMainpageValues
    };
})(typeof window !== 'undefined' ? window : this);
