(function (root) {
    'use strict';

    console.log('🔄 app-config.js yükleniyor - v20260904150000');

    const SCRIPT_URLS = {
        saatlik: 'https://script.google.com/macros/s/AKfycbw7gTKX-mN5YJtOseDUr6R3qAYme9rEM5Lb0hYYm3RCKHD1Q2A6GZqlXihYCYtsPgBcXA/exec',
        motor: 'https://script.google.com/macros/s/AKfycbyrSjQAH5k8bDIQXf7g1hJ59xo2Kv7rLN_mstZxDZxK3wiXV5Fo2mkGzPyiMx9DoBmq/exec',
        enerji: 'https://script.google.com/macros/s/AKfycbwX9FSvBeBN5vpe3fX_encGid-5JZ0LrrQ_5bHn2wS7lzzU7NlDn95FTLnhWTn_FGsl/exec',
        enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',
        enerjiGunSonuToplam: 'https://script.google.com/macros/s/AKfycbx_-k0z644sgGpB2Iu4AWgWwJKMY4kjMbd5ly1baWcs_-vQGoMU6yCYtD0e-DECQ3OP/exec',
        yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',
        buhar: 'https://script.google.com/macros/s/AKfycbxRCMHqXKVq-qHx8IxWxQgEqZtnU5RByCVHu6pxUFgIPq-8g-0NPTiJgnPM3glZd-UDvw/exec',
        gunluk: 'https://script.google.com/macros/s/AKfycbygWsxTYiiu78JjYzEP4_Erk9qpK4ceXQ3JSWZrkCvX908Qtt920ReBMn-jBgqrAbSwlw/exec',
        bakim: 'https://script.google.com/macros/s/AKfycbyvOaxXEvvR1oyncVM69QJjzrs3uj9VHWKysBwjI-pfiFunasfondK8CFxUFBaEVYIOmg/exec',
        vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
        bildirim: 'https://script.google.com/macros/s/AKfycbx6kbSNPQV0hIj8aOeW1QamYe3R995vXg-3uSw4Qw5N0M8-RARL262cce3RdQFIbso/exec',
        kullanici: 'https://script.google.com/macros/s/AKfycbx0cj7AcYyf3SiVmLdJVrutOR_VA6P_1XhvyAmINXs5JUMfIr0NnPHtRfC_p7TJKhzD/exec',
        stok: 'https://script.google.com/macros/s/AKfycbz_z8IbFwlLpqMjnfmMksV_KWYoeZIedoMUUBc5b96TR5AyvXtRuqHQBcDghf8fmiburQ/exec',
        motorTakip: 'https://script.google.com/macros/s/AKfycbyxfk2wUCJVDzHETdYWf4-zTxeMMwwd4wJ1uPkgVSFy1x6Ujy-lkWAkqPRMQlt3ZyPx/exec',
        elzMainpage: 'https://script.google.com/macros/s/AKfycbww7IzvG3dgsQgzHTOtzjwDHCJ561KLRBWTCNW3oD5aLVNqj4iRk-FJXome4XTccV_Z/exec',
        kojenMaliyetRapor: 'https://script.google.com/macros/s/AKfycbysr-rbVD0zXbTu_ZEUdn3nEh07VvKiwJDfz10pI5oOn493NjuZFI_meMPmESTvNgbS/exec',
        // Mirror Reader — motor ve enerji mirror verileri aynı web app'ten, farklı action ile çekilir
        motorMirror:  'https://script.google.com/macros/s/AKfycbwrr41mFgxOkxu-XGgEg-f_dUuZyMc0G9V02p4Z7Aji0WiG2_PdFL9K8PJKUUfIGtQ3/exec',
        enerjiMirror: 'https://script.google.com/macros/s/AKfycbwrr41mFgxOkxu-XGgEg-f_dUuZyMc0G9V02p4Z7Aji0WiG2_PdFL9K8PJKUUfIGtQ3/exec'
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
