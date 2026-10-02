(function (global) {
    'use strict';

    const SCANNER_ELEMENT_ID = 'barcode-scanner-reader';
    const MODAL_ID = 'barcode-scanner-modal';

    let html5QrCode = null;
    let isScanning = false;
    let onSuccessCallback = null;
    let notificationFormat = 'title-first';

    function setNotificationFormat(format) {
        notificationFormat = format === 'type-first' ? 'type-first' : 'title-first';
    }

    function getSupportedFormats() {
        const F = global.Html5QrcodeSupportedFormats;
        if (!F) return undefined;
        return [
            F.QR_CODE,
            F.CODE_128,
            F.CODE_39,
            F.CODE_93,
            F.EAN_13,
            F.EAN_8,
            F.UPC_A,
            F.UPC_E,
            F.ITF,
            F.DATA_MATRIX,
            F.PDF_417,
            F.CODABAR
        ];
    }

    function notify(title, message, type) {
        if (typeof showNotification === 'function') {
            if (notificationFormat === 'type-first') {
                showNotification(type, title, message);
            } else {
                showNotification(title, message, type);
            }
        } else {
            alert(message);
        }
    }

    function isFileProtocol() {
        return global.location && global.location.protocol === 'file:';
    }

    function extractBarcodeCode(text) {
        const trimmed = (text || '').trim();
        if (!trimmed) return trimmed;

        try {
            const url = new URL(trimmed);
            const bParam = url.searchParams.get('b');
            if (bParam && /^b/i.test(bParam)) {
                return bParam;
            }
        } catch (e) {
            /* URL degilse asagidaki regex denenir */
        }

        const match = trimmed.match(/[?&]b=(b[^&#]*)/i);
        if (match && match[1]) {
            return decodeURIComponent(match[1]);
        }

        return trimmed;
    }

    function createModal() {
        const existing = document.getElementById(MODAL_ID);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'barcode-scanner-modal';
        modal.id = MODAL_ID;
        modal.innerHTML = `
            <div class="barcode-scanner-modal-content">
                <div class="barcode-scanner-header">
                    <h3>Barkod / Kare Kod Oku</h3>
                    <button type="button" class="barcode-scanner-close" id="barcode-scanner-close-btn" aria-label="Kapat">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="barcode-scanner-body">
                    <p class="barcode-scanner-hint">Barkodu veya kare kodu kameraya gösterin</p>
                    <div id="${SCANNER_ELEMENT_ID}" class="barcode-scanner-reader"></div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('barcode-scanner-close-btn').addEventListener('click', close);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) close();
        });
    }

    async function requestCameraPermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Tarayıcınız kamera erişimini desteklemiyor.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
        });
        stream.getTracks().forEach(function (track) {
            track.stop();
        });
    }

    async function getCameraCandidates() {
        const candidates = [];

        try {
            const cameras = await Html5Qrcode.getCameras();
            if (cameras && cameras.length) {
                const preferred = cameras.find(function (c) {
                    return /back|rear|environment|arka/i.test(c.label || '');
                });
                const ordered = preferred ? [preferred].concat(cameras.filter(function (c) {
                    return c !== preferred;
                })) : cameras.slice();

                ordered.forEach(function (camera) {
                    const id = camera.id || camera.deviceId;
                    if (id) candidates.push(id);
                });
            }
        } catch (err) {
            console.warn('Kamera listesi alınamadı:', err);
        }

        candidates.push({ facingMode: 'user' });
        candidates.push({ facingMode: 'environment' });
        candidates.push(true);

        return candidates;
    }

    function getScanConfig() {
        return {
            fps: 10,
            qrbox: function (viewfinderWidth, viewfinderHeight) {
                const width = Math.min(viewfinderWidth * 0.85, 360);
                const height = Math.min(viewfinderHeight * 0.45, 160);
                return { width: Math.floor(width), height: Math.floor(height) };
            }
        };
    }

    async function startScanner() {
        const candidates = await getCameraCandidates();
        const scanConfig = getScanConfig();
        let lastError = null;

        for (let i = 0; i < candidates.length; i += 1) {
            const cameraConfig = candidates[i];
            try {
                await html5QrCode.start(
                    cameraConfig,
                    scanConfig,
                    function (decodedText) {
                        if (onSuccessCallback) onSuccessCallback(decodedText);
                        close();
                    },
                    function () {}
                );
                return;
            } catch (err) {
                lastError = err;
                try {
                    if (html5QrCode.isScanning) {
                        await html5QrCode.stop();
                    }
                } catch (stopErr) {
                    /* ignore */
                }
            }
        }

        throw lastError || new Error('Kamera açılamadı.');
    }

    async function open(targetInputId, customCallback) {
        if (isScanning) return;

        if (!global.Html5Qrcode) {
            notify('Hata', 'Barkod okuma kütüphanesi yüklenemedi.', 'error');
            return;
        }

        if (isFileProtocol()) {
            notify(
                'Kamera kullanılamıyor',
                'Sayfa dosya olarak açıldığı için (file://) kamera çalışmaz. Projeyi bir web sunucusu ile açın, örneğin: python -m http.server 8080',
                'error'
            );
            return;
        }

        const input = targetInputId ? document.getElementById(targetInputId) : null;
        if (targetInputId && !input && typeof customCallback !== 'function') return;

        onSuccessCallback = function (text) {
            const barcodeValue = extractBarcodeCode(text);
            if (typeof customCallback === 'function') {
                customCallback(barcodeValue, text);
            } else if (input) {
                input.value = barcodeValue;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            notify('Başarılı', 'Barkod okundu: ' + barcodeValue, 'success');
        };

        createModal();
        isScanning = true;

        try {
            await requestCameraPermission();

            html5QrCode = new Html5Qrcode(SCANNER_ELEMENT_ID, {
                formatsToSupport: getSupportedFormats(),
                verbose: false
            });

            await startScanner();
        } catch (err) {
            console.error('Barkod tarayici hatasi:', err);
            let message = err && err.message ? err.message : 'Kamera açılamadı.';

            if (/NotAllowedError|Permission/i.test(message)) {
                message = 'Kamera izni verilmedi. Tarayıcı adres çubuğundaki kamera simgesinden izin verin.';
            } else if (/NotFoundError|DevicesNotFoundError/i.test(message)) {
                message = 'Kamera bulunamadı. Bilgisayarınıza bağlı bir kamera olduğundan emin olun.';
            }

            notify('Hata', message, 'error');
            close();
        }
    }

    async function close() {
        isScanning = false;
        onSuccessCallback = null;

        if (html5QrCode) {
            try {
                if (html5QrCode.isScanning) {
                    await html5QrCode.stop();
                }
            } catch (e) {
                /* ignore stop errors */
            }
            try {
                html5QrCode.clear();
            } catch (e) {
                /* ignore clear errors */
            }
            html5QrCode = null;
        }

        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.remove();
    }

    function initButton(buttonId, targetInputId, customCallback) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        btn.addEventListener('click', function () {
            open(targetInputId, customCallback);
        });
    }

    global.BarcodeScanner = {
        open: open,
        close: close,
        initButton: initButton,
        extractBarcodeCode: extractBarcodeCode,
        setNotificationFormat: setNotificationFormat
    };
})(window);
