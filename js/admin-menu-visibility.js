/**
 * admin-menu-visibility.js
 *
 * NOT: sidebar-menu.js, standart sidebar menüdeki adminOnly öğeleri
 * kendi içinde yönetir. Bu dosya ise sayfalarda manuel olarak
 * '.admin-menu-item' class'ı verilmiş öğeleri (sidebar dışı butonlar,
 * linkler vb.) admin/operatör rolüne göre gösterir/gizler.
 * İki mekanizma birbiriyle çakışmaz, farklı öğeleri hedefler.
 */
(function() {
    function isAdmin() {
        try {
            const user = JSON.parse(localStorage.getItem('loggedInUser') || 'null');
            return user?.role === 'admin';
        } catch (error) {
            return false;
        }
    }

    function applyVisibility() {
        const visible = isAdmin();
        document.querySelectorAll('.admin-menu-item').forEach(item => {
            item.style.display = visible ? '' : 'none';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyVisibility);
    } else {
        applyVisibility();
    }
})();