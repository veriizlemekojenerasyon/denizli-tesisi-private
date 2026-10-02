(function () {
    'use strict';

    const STORAGE_KEY = 'kojenerasyon-theme-mode';
    const DARK = 'dark';
    const LIGHT = 'light';

    const icons = {
        moon: '<svg class="theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/></svg>',
        sun: '<svg class="theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    };

    function readMode() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored === DARK ? DARK : LIGHT;
        } catch (error) {
            return LIGHT;
        }
    }

    function writeMode(mode) {
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch (error) {}
    }

    function applyMode(mode) {
        document.documentElement.dataset.theme = mode;
        document.documentElement.style.colorScheme = mode;
        updateButtons(mode);
    }

    function toggleMode() {
        const next = document.documentElement.dataset.theme === DARK ? LIGHT : DARK;
        writeMode(next);
        applyMode(next);
    }

    function buttonLabel(mode) {
        return mode === DARK ? 'Gunduz Modu' : 'Gece Modu';
    }

    function updateButtons(mode) {
        document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
            button.setAttribute('aria-label', buttonLabel(mode));
            button.setAttribute('title', buttonLabel(mode));
            const text = button.querySelector('.theme-toggle-text');
            if (text) text.textContent = buttonLabel(mode);
        });
    }

    function createButton(extraClass) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-toggle-btn' + (extraClass ? ' ' + extraClass : '');
        button.dataset.themeToggle = 'true';
        button.innerHTML = [
            icons.moon,
            icons.sun,
            '<span class="theme-toggle-text"></span>'
        ].join('');
        button.addEventListener('click', toggleMode);
        return button;
    }

    function placeButton() {
        if (document.querySelector('[data-theme-toggle]')) {
            updateButtons(readMode());
            return;
        }

        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter) {
            const button = createButton('');
            const logout = sidebarFooter.querySelector('.logout-btn, #sidebarLogout');
            sidebarFooter.insertBefore(button, logout || sidebarFooter.firstChild);
            updateButtons(readMode());
            return;
        }

        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            const button = createButton('');
            headerActions.insertBefore(button, headerActions.firstChild);
            updateButtons(readMode());
            return;
        }

        const userInfo = document.querySelector('.user-info');
        if (userInfo) {
            const button = createButton('');
            userInfo.insertBefore(button, userInfo.firstChild);
            updateButtons(readMode());
            return;
        }

        document.body.appendChild(createButton('theme-toggle-floating'));
        updateButtons(readMode());
    }

    function init() {
        applyMode(readMode());
        placeButton();
    }

    applyMode(readMode());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.ThemeSystem = {
        apply: applyMode,
        toggle: toggleMode,
        current: function () {
            return document.documentElement.dataset.theme || readMode();
        }
    };
})();
