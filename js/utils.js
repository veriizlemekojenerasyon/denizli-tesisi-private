/**
 * utils.js — Ortak yardımcı fonksiyonlar
 * Tüm sayfalarda app-config.js'ten hemen sonra yüklenir.
 */
(function (root) {
    'use strict';

    /**
     * XSS'e karşı HTML kaçış fonksiyonu.
     * admin-kontrol.js, admin-bildirim.js, kullanici-yonetimi.js'teki
     * yerel escapeHtml kopyalarının yerini alır.
     */
    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Bildirim göster (alert() yerine kullan).
     * @param {string} message  - Gösterilecek mesaj
     * @param {'success'|'error'|'warning'|'info'} type - Bildirim tipi
     * @param {number} [duration=4000] - Otomatik kapanma süresi (ms)
     */
    function showToast(message, type, duration) {
        var ms = duration !== undefined ? duration : 4000;
        var colors = {
            success: 'linear-gradient(135deg, #10b981, #059669)',
            error:   'linear-gradient(135deg, #ef4444, #dc2626)',
            warning: 'linear-gradient(135deg, #f59e0b, #d97706)',
            info:    'linear-gradient(135deg, #3b82f6, #2563eb)'
        };

        var div = document.createElement('div');
        div.textContent = message;
        div.style.cssText = [
            'position:fixed',
            'top:20px',
            'right:20px',
            'padding:14px 20px',
            'border-radius:10px',
            'color:#fff',
            'font-weight:500',
            'z-index:99999',
            'max-width:360px',
            'box-shadow:0 5px 20px rgba(0,0,0,0.25)',
            'font-size:14px',
            'line-height:1.4',
            'background:' + (colors[type] || colors.info)
        ].join(';');

        document.body.appendChild(div);
        setTimeout(function () {
            if (div.parentNode) div.parentNode.removeChild(div);
        }, ms);
        return div;
    }

    if (root) {
        root.Utils = { escapeHtml: escapeHtml, showToast: showToast };
    }
})(typeof window !== 'undefined' ? window : null);
