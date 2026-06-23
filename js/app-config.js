<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
(function (root) {
    'use strict';

    const SCRIPT_URLS = {
        saatlik: 'https://script.google.com/macros/s/AKfycbxLg9svHtuKZ5jXP0fzFc1opOFwmzwjkHB9PZS61oG_wgH14dGerwnP1CaBMFEQFiMz/exec',
        motor: 'https://script.google.com/macros/s/AKfycbwwSPKPJCo2Xia4kgXQhjfn4ZMQq8ulDl6YQaXjLNUSVeC183NZ-qLeOmJiPRpm-KuJ/exec',
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
=======
(function (root) {

    'use strict';



    const SCRIPT_URLS = {

<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
        saatlik: 'https://script.google.com/macros/s/AKfycbz8tCK7XmV3I-wnCiM2iv8UwbUOkmBwj6s3IXEBeU5AZ0cwXF2Le4sejT8j7oXOz-QR/exec',

        motor: 'https://script.google.com/macros/s/AKfycbz1pIJxh6f_TGA5xthUlCD2bV3_DUP3jEwh_zM7yi0UPPrCnsC_LePu3UarOzz1Ojv0/exec',

        enerji: 'https://script.google.com/macros/s/AKfycbwhyAtlmzX2WJXlafVN-zAZdOj3cTJbTIDo7a1ktFVxoRh-UaJz5SE6iKxgxzd9SaOO/exec',

        enerjiGunSonu: 'https://script.google.com/macros/s/AKfycbxi4qHxf-EdltRpWAfEnM2qVQln66VPuuU-hnNk9g8T6_wosCrRakDEjSzeTNFqS3tQ/exec',

        yillikEnerjiRapor: 'https://script.google.com/macros/s/AKfycbxTOJuZuGXKTy2JoICtsgXMXjntSmkkWJAaUsiZg8pIwRWeDLjl027KzBTRTMYpsn8r/exec',

        buhar: 'https://script.google.com/macros/s/AKfycbwDlfLp36QguZqRH7_PYtSjWUJihU2dTxodkKiW58rhcK41jtvpS0NKnlw9kBBnZnTJ/exec',

        gunluk: 'https://script.google.com/macros/s/AKfycbwObrja3MBernSzq6Q8PGlik0btKgA6DXCswp3atilbuU0Sd-hEc3M6KtWaDU4hhloN/exec',

        bakim: 'https://script.google.com/macros/s/AKfycby2EIEvRXvSuoYMEBqKDBAvHlgADT43hCMb7vM-1Nas8jgqi5JfJldI8EwkPNfpneF5/exec',

        vardiya: 'https://script.google.com/macros/s/AKfycbxZE7LNlZRCbjI0PehXQN8-jhTyj5t735inYQ5b2ti6xN_ZNG23EASAbvf2SQUNCjat/exec',

        bildirim: 'https://script.google.com/macros/s/AKfycbw5OaqI6ttcPy1x78tD1ZjSTpg620xsbvPi5tpTIBJp5kp7JBcc9CASLI7K4ridf-Fl/exec',

        kullanici: 'https://script.google.com/macros/s/AKfycbx9vl-siC8bKbGlrX1bJ2LHluuafZ4WbUnM3wxiQ4opvDbD1_8ll34T2mfpIWFR2Nu7/exec',

        stok: 'https://script.google.com/macros/s/AKfycbz8LKe17Xcly6_ujWrnLbD1BnprW19rGtrVssExet5iUgGkiZ23Cf25H--THCKOKWmE/exec',

        motorTakip: 'https://script.google.com/macros/s/AKfycbxLYn6NGBOdpgTCcbFbQJ815JFmoEsosjVmo9MRaSMqdZoc5UyLPq2X9eIV88OY77LN/exec',

        elzMainpage: 'https://script.google.com/macros/s/AKfycbww7IzvG3dgsQgzHTOtzjwDHCJ561KLRBWTCNW3oD5aLVNqj4iRk-FJXome4XTccV_Z/exec'
=======
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
       saatlik: 'https://script.google.com/macros/s/AKfycbxLg9svHtuKZ5jXP0fzFc1opOFwmzwjkHB9PZS61oG_wgH14dGerwnP1CaBMFEQFiMz/exec',
  motor: 'https://script.google.com/macros/s/AKfycbwwSPKPJCo2Xia4kgXQhjfn4ZMQq8ulDl6YQaXjLNUSVeC183NZ-qLeOmJiPRpm-KuJ/exec',
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
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js

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

<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
<<<<<<< C:/Users/mcoskun/Desktop/Yeni klasör (2)/js/app-config.js
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
=======
>>>>>>> C:/Users/mcoskun/.windsurf/worktrees/Yeni klasör (2)/Yeni klasör (2)-bb14813a/js/app-config.js
