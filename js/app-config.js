(function (root) {
    'use strict';

    const SCRIPT_URLS = {
        saatlik: 'https://script.google.com/macros/s/AKfycbz8tCK7XmV3I-wnCiM2iv8UwbUOkmBwj6s3IXEBeU5AZ0cwXF2Le4sejT8j7oXOz-QR/exec',
        motor: 'https://script.google.com/macros/s/AKfycbyK7j7nVfMrtO0jmMAi2Bp4T0pY7Yxay_1keZ6reU739OlUUcRQfsGX2TIniry_d3fl/exec',
        enerji: 'https://script.google.com/macros/s/AKfycbzy-1yMXVLXxZiFnmpQDK4KnKTZSeVYWewsUNcw9Rd45yMhIjvljU_KPL5cMPm0QC6Y/exec',
        enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',
        yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',
        buhar: 'https://script.google.com/macros/s/AKfycbwDlfLp36QguZqRH7_PYtSjWUJihU2dTxodkKiW58rhcK41jtvpS0NKnlw9kBBnZnTJ/exec',
        gunluk: 'https://script.google.com/macros/s/AKfycbwObrja3MBernSzq6Q8PGlik0btKgA6DXCswp3atilbuU0Sd-hEc3M6KtWaDU4hhloN/exec',
        bakim: 'https://script.google.com/macros/s/AKfycby2EIEvRXvSuoYMEBqKDBAvHlgADT43hCMb7vM-1Nas8jgqi5JfJldI8EwkPNfpneF5/exec',
        vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
        bildirim: 'https://script.google.com/macros/s/AKfycbzeAMB16yCQ-8IWiE6Op0smrcE_qjvFEXT7qZ6Y5N32E742EYLsh1dJLC9B49ikGcpl/exec',
        kullanici: 'https://script.google.com/macros/s/AKfycbwXfLBUIZPExJm9nQnZyRXRRWlAPJvGggwL3gihg2Fal3YBHaVCwao53f3MT2zZGSFh/exec',
        stok: 'https://script.google.com/macros/s/AKfycbz8LKe17Xcly6_ujWrnLbD1BnprW19rGtrVssExet5iUgGkiZ23Cf25H--THCKOKWmE/exec',
        motorTakip: 'https://script.google.com/macros/s/AKfycbxLYn6NGBOdpgTCcbFbQJ815JFmoEsosjVmo9MRaSMqdZoc5UyLPq2X9eIV88OY77LN/exec',
        elzMainpage: 'https://script.google.com/macros/s/AKfycbww7IzvG3dgsQgzHTOtzjwDHCJ561KLRBWTCNW3oD5aLVNqj4iRk-FJXome4XTccV_Z/exec'
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
