document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const forgotPasswordLink = document.getElementById('forgotPassword');
    const changePasswordLink = document.getElementById('changePassword');
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const changePasswordModal = document.getElementById('changePasswordModal');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const closeButtons = document.querySelectorAll('.close');

    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        const eyeIcon = this.querySelector('.eye-icon');
        eyeIcon.textContent = type === 'password' ? '👁️' : '👁️‍🗨️';
    });

    forgotPasswordLink.addEventListener('click', function(e) {
        e.preventDefault();
        openModal(forgotPasswordModal);
    });

    changePasswordLink.addEventListener('click', function(e) {
        e.preventDefault();
        openModal(changePasswordModal);
    });

    closeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            closeModal(modal);
        });
    });

    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target);
        }
    });

    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;

        if (validateLoginForm(email, password)) {
            performLogin(email, password, rememberMe);
        }
    });

    forgotPasswordForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const resetEmail = document.getElementById('resetEmail').value;
        
        if (validateEmail(resetEmail)) {
            sendPasswordResetLink(resetEmail);
        } else {
            showError('Lütfen geçerli bir e-posta adresi girin.');
        }
    });

    changePasswordForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (validatePasswordChange(currentPassword, newPassword, confirmNewPassword)) {
            performPasswordChange(currentPassword, newPassword);
        }
    });

    function openModal(modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    function validateLoginForm(email, password) {
        if (!validateEmail(email)) {
            showError('Lütfen geçerli bir e-posta adresi girin.');
            return false;
        }

        if (password.length < 6) {
            showError('Şifre en az 6 karakter olmalıdır.');
            return false;
        }

        return true;
    }

    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function validatePasswordChange(currentPassword, newPassword, confirmNewPassword) {
        if (currentPassword.length < 6) {
            showError('Mevcut şifre en az 6 karakter olmalıdır.');
            return false;
        }

        if (newPassword.length < 6) {
            showError('Yeni şifre en az 6 karakter olmalıdır.');
            return false;
        }

        if (newPassword !== confirmNewPassword) {
            showError('Yeni şifreler eşleşmiyor.');
            return false;
        }

        if (currentPassword === newPassword) {
            showError('Yeni şifre mevcut şifreden farklı olmalıdır.');
            return false;
        }

        return true;
    }

    async function performLogin(email, password, rememberMe) {
        const USER_URL = 'https://script.google.com/macros/s/AKfycby-XThkMXZTUa1Du2du9FZH57YZHrxnKrSAXCRClhD75f6j-8Ld3DpPL3wMUy2YfzH5/exec';
        
        try {
            const res = await fetch(USER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `action=validateLogin&data=${encodeURIComponent(JSON.stringify({ email, password }))}`
            });
            const result = await res.json();
            
            if (!result.success) {
                showError(result.error || 'Giriş başarısız!');
                return;
            }
            
            if (rememberMe) {
                localStorage.setItem('rememberedEmail', email);
            } else {
                localStorage.removeItem('rememberedEmail');
            }
            
            // Gerçek kullanıcı bilgilerini kaydet
            const userData = {
                email: email,
                firstName: result.user.firstName || result.user.ad || '',
                lastName: result.user.lastName || result.user.soyad || '',
                role: result.user.role || result.user.rol || 'operator'
            };
            localStorage.setItem('loggedInUser', JSON.stringify(userData));
            localStorage.setItem('currentUser', JSON.stringify(userData));

            showSuccess('Giriş başarılı! Yönlendiriliyorsunuz...');
            
            setTimeout(() => {
                window.location.href = 'anasayfa.html';
            }, 1500);
        } catch (e) {
            showError('Sunucu hatası: ' + e.message);
        }
    }

    function sendPasswordResetLink(email) {
        console.log('Şifre sıfırlama linki gönderiliyor:', email);
        
        showSuccess('Şifre sıfırlama linki e-posta adresinize gönderildi.');
        
        setTimeout(() => {
            closeModal(forgotPasswordModal);
            forgotPasswordForm.reset();
        }, 2000);
    }

    function performPasswordChange(currentPassword, newPassword) {
        const passwordData = {
            currentPassword: currentPassword,
            newPassword: newPassword
        };

        console.log('Şifre değiştirme bilgileri:', passwordData);

        showSuccess('Şifreniz başarıyla değiştirildi!');
        
        setTimeout(() => {
            closeModal(changePasswordModal);
            changePasswordForm.reset();
        }, 2000);
    }

    function showError(message) {
        showNotification(message, 'error');
    }

    function showSuccess(message) {
        showNotification(message, 'success');
    }

    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;

        if (type === 'error') {
            notification.style.background = '#e53e3e';
        } else if (type === 'success') {
            notification.style.background = '#38a169';
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
        document.getElementById('email').value = rememberedEmail;
        document.getElementById('rememberMe').checked = true;
    }
});

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
