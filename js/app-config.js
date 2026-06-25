(function (root) {
    'use strict';

    const SCRIPT_URLS = {
        saatlik: 'https://script.google.com/macros/s/AKfycbxLg9svHtuKZ5jXP0fzFc1opOFwmzwjkHB9PZS61oG_wgH14dGerwnP1CaBMFEQFiMz/exec',
        motor: 'https://script.google.com/macros/s/AKfycbwh9mNNpPHtkWNfVIG7SGekiZTPEo16QNm_23LnWiqgpxE3MsjfsKVPCT_KIE1U5hJr/exec',
        enerji: 'https://script.google.com/macros/s/AKfycbxtekkSAWTq2ExH9mvzqLqkFU5kvjv8dgb0Y1l-HTj3Nwit7rckCC1gN-VHy2dzDyCo/exec',
        enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbwSno62Ijw1RgvUdZTOCoBXV9NY3H-5bg1Po4WRG-sSuWM_nyZzP307scsyRvwZT1Ux/exec',
        yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxY0_SxJyIWp0TaDABKdhnPFmHmw7pRMUp33AQ7AujZN26mESmpTNr4Bqu81SY5u0F_/exec',
        buhar: 'https://script.google.com/macros/s/AKfycbwKIqhZDvxJDWmFPf0CupJEke2eey9RkTl-WJ-Z8a9zTrdi9L8geBX9C-KCUHnc3s68/exec',
        gunluk: 'https://script.google.com/macros/s/AKfycbyrRVJCrgQ1N_-C-kqBW-OA6FIhwshUOgDGGs-YPyliz0CI7JXcakYnk-tEj0pwZMYT/exec',
        bakim: 'https://script.google.com/macros/s/AKfycbyPVtza6spDtgNUkDlPMvX-wlDTAw_1qDu0Ms78wUfeb2WC3zjqgzDoxe3hDYfKjxes/exec',
        vardiya: 'https://script.google.com/macros/s/AKfycbzfcNufcJ8GB16pRxjOyLzGhMl_O2JLXasb8ONoTAjORjA_yvi3lDEfNwKiu8IP8iOt/exec',
        bildirim: 'https://script.google.com/macros/s/AKfycbwxfc2103ITgtvplA9zPVF4C1sZfZtRoi2hyvL25jHK0SZhO0tSKFfybenzLHkzhQ71/exec',
        kullanici: 'https://script.google.com/macros/s/AKfycbzTBptAv4FoxIh1PTgoR207hxrV2EPuUTUyxUZluW1iPxDpV06I8HGRo7Jp0-9cPsnA/exec',
        stok: 'https://script.google.com/macros/s/AKfycbwdKIq4nFHsHTeyYqJm523rahSnm9gLXUaAUVE0UGnsD0aYAEsrBMuayBkESjLVw-dj/exec',
        motorTakip: 'https://script.google.com/macros/s/AKfycbyxfk2wUCJVDzHETdYWf4-zTxeMMwwd4wJ1uPkgVSFy1x6Ujy-lkWAkqPRMQlt3ZyPx/exec',
        elzMainpage: 'https://script.google.com/macros/s/AKfycbz4AvUGwSfpgVSEYDkaJs41fFWTFmfPQd3kuJzTr2N3SEWNdFsRD0l4K9K8KxyVtYSd/exec'
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
