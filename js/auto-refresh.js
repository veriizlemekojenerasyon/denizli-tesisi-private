/**
 * Tüm sayfalarda verilerin ve saat alanlarının güncel kalması için
 * sayfayı dakikada bir yeniler.
 */
(function () {
    const REFRESH_INTERVAL_MS = 60 * 1000;

    window.setTimeout(function () {
        window.location.reload();
    }, REFRESH_INTERVAL_MS);
})();
