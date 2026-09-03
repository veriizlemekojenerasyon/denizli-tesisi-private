(function (root) {
    'use strict';

    console.log('🔄 app-config.js yükleniyor - v20260903144800');

    const SCRIPT_URLS = {
        saatlik: 'https://script.google.com/macros/s/AKfycbw7gTKX-mN5YJtOseDUr6R3qAYme9rEM5Lb0hYYm3RCKHD1Q2A6GZqlXihYCYtsPgBcXA/exec',
        motor: 'https://script.google.com/macros/s/AKfycbyrSjQAH5k8bDIQXf7g1hJ59xo2Kv7rLN_mstZxDZxK3wiXV5Fo2mkGzPyiMx9DoBmq/exec',
        enerji: 'https://script.google.com/macros/s/AKfycbwX9FSvBeBN5vpe3fX_encGid-5JZ0LrrQ_5bHn2wS7lzzU7NlDn95FTLnhWTn_FGsl/exec',
        enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbwSno62Ijw1RgvUdZTOCoBXV9NY3H-5bg1Po4WRG-sSuWM_nyZzP307scsyRvwZT1Ux/exec',
        yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxY0_SxJyIWp0TaDABKdhnPFmHmw7pRMUp33AQ7AujZN26mESmpTNr4Bqu81SY5u0F_/exec',
        buhar: 'https://script.google.com/macros/s/AKfycbxRCMHqXKVq-qHx8IxWxQgEqZtnU5RByCVHu6pxUFgIPq-8g-0NPTiJgnPM3glZd-UDvw/exec',
        gunluk: 'https://script.google.com/macros/s/AKfycbxsz-JYET2T_J9qzZqYvunHErwr8qu0868wEwErP3h_Vo6iH8u1RlbcAWWcrzdUEBlR/exec',
        bakim: 'https://script.google.com/macros/s/AKfycbyrBtgc3spsh4jCpVtojfiFac5La8WKzh0Hlazndj0w-O-GCpMzYwCNevUJReXUI_zV/exec',
        vardiya: 'https://script.google.com/macros/s/AKfycbzfcNufcJ8GB16pRxjOyLzGhMl_O2JLXasb8ONoTAjORjA_yvi3lDEfNwKiu8IP8iOt/exec',
        bildirim: 'https://script.google.com/macros/s/AKfycbx6kbSNPQV0hIj8aOeW1QamYe3R995vXg-3uSw4Qw5N0M8-RARL262cce3RdQFIbso/exec',
        kullanici: 'https://script.google.com/macros/s/AKfycbyVVSnEr1aBJLPMk8m7TvH55HR-mlOgTtPGcdtyBXXalzSha518mHBIbzsEd57RLe3q/exec',
        stok: 'https://script.google.com/macros/s/AKfycbwdgKAxZ9J4NdxKFvlTUPnr-pCGD7UfHXqM8q3VWR4OHgKXs0eCjVAy9LHU-EkcHVKv/exec',
        motorTakip: 'https://script.google.com/macros/s/AKfycbyxfk2wUCJVDzHETdYWf4-zTxeMMwwd4wJ1uPkgVSFy1x6Ujy-lkWAkqPRMQlt3ZyPx/exec',
        elzMainpage: 'https://script.google.com/macros/s/AKfycbza7E5qh7K1FCiCpotWe8M95Uzfb5sutcZTkpRkG4pzhjpmhBuvvXdaW16DmqKNlSpR/exec',
        kojenMaliyetRapor: 'https://script.google.com/macros/s/AKfycbysr-rbVD0zXbTu_ZEUdn3nEh07VvKiwJDfz10pI5oOn493NjuZFI_meMPmESTvNgbS/exec',
        // Mirror Reader — motor ve enerji mirror verileri aynı web app'ten, farklı action ile çekilir
        motorMirror:  'https://script.google.com/macros/s/AKfycbyBm2T2Ax5ltP-yfEDbR0kbTc7qI4CE5dXJpaxrjf5erv1m99ONHPx_xNb7N3SDiQ4/exec',
        enerjiMirror: 'https://script.google.com/macros/s/AKfycbyBm2T2Ax5ltP-yfEDbR0kbTc7qI4CE5dXJpaxrjf5erv1m99ONHPx_xNb7N3SDiQ4/exec'
    };

    function getScriptUrl(key) {
        return SCRIPT_URLS[key] || '';
    }

    function loadSharedAsset(tagName, id, attributes) {
        if (!root || !root.document || root.document.getElementById(id)) return;
        const element = root.document.createElement(tagName);
        element.id = id;
        Object.keys(attributes).forEach(function (key) {
            element.setAttribute(key, attributes[key]);
        });
        root.document.head.appendChild(element);
    }

    function loadThemeSystem() {
        loadSharedAsset('link', 'theme-system-style', {
            rel: 'stylesheet',
            href: 'css/theme-system.css'
        });
        loadSharedAsset('script', 'theme-system-script', {
            src: 'js/theme-system.js'
        });
    }

    if (root) {
        root.AppConfig = {
            SCRIPT_URLS: SCRIPT_URLS,
            getScriptUrl: getScriptUrl
        };
        loadThemeSystem();
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
