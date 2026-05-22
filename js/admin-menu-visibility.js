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
