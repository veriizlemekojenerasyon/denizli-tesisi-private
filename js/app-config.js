(function (root) {
    'use strict';

    const SCRIPT_URLS = {
        saatlik: 'https://script.google.com/macros/s/AKfycbwpAgGwe5-AIJSmllURtAj_zNeVkKjkkTFW3_k5zlMcfXdsr9z-mA8HCDRhhC3NpkGH/exec',
        motor: 'https://script.google.com/macros/s/AKfycby3Tz0N4rSMWq-DbsJAnFwbb7qdHnpWmZfapCXHE6NUfAJLL2aMUmq7bBG0sh_FricE/exec',
        enerji: 'https://script.google.com/macros/s/AKfycbwyiQAGZGPm078frMx1tIfVjR140Q8-ecaDLgWPkz-xmeOWMulmAnYtrQ_qztX8FsHL/exec',
        enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',
        yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',
        buhar: 'https://script.google.com/macros/s/AKfycbwDlfLp36QguZqRH7_PYtSjWUJihU2dTxodkKiW58rhcK41jtvpS0NKnlw9kBBnZnTJ/exec',
        gunluk: 'https://script.google.com/macros/s/AKfycby-PF0-EVC4PJTNgxm6P09lda_v1DA1SmBGiB4JD3gSg34QKzXN0LT9zKHVXwgDbLB6/exec',
        bakim: 'https://script.google.com/macros/s/AKfycby2EIEvRXvSuoYMEBqKDBAvHlgADT43hCMb7vM-1Nas8jgqi5JfJldI8EwkPNfpneF5/exec',
        vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',
        bildirim: 'https://script.google.com/macros/s/AKfycbwgXq3XkSioVk7mzIqZdqiPrxF5UVNsDSTBMQ4Z5zl2WgDHGF2qQRoIwK0M388vW_U4/exec',
        kullanici: 'https://script.google.com/macros/s/AKfycbyUApo62cwpr6dZxOXv-Cyt2deGGiw3Eos_KOZ5I037BErj_qvE-Qa0mRCXgK2pRUjI/exec',
        stok: 'https://script.google.com/macros/s/AKfycbyGW2gUC5kqt6xH2Y6LJWM8-p2m6VxJ-C9ib9ZdqqlomsBxlvM1JEV2Yyx783jeQ6X2/exec',
        motorTakip: 'https://script.google.com/macros/s/AKfycbxLYn6NGBOdpgTCcbFbQJ815JFmoEsosjVmo9MRaSMqdZoc5UyLPq2X9eIV88OY77LN/exec',
        elzMainpage: 'https://script.google.com/macros/s/AKfycbww7IzvG3dgsQgzHTOtzjwDHCJ561KLRBWTCNW3oD5aLVNqj4iRk-FJXome4XTccV_Z/exec'
    };

    function getScriptUrl(key) {
        return SCRIPT_URLS[key] || '';
    }

    if (root) {
        root.AppConfig = {
            SCRIPT_URLS: SCRIPT_URLS,
            getScriptUrl: getScriptUrl
        };
    }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
