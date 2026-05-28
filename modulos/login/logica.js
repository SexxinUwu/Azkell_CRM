// ================================================================
// MÓDULO: LOGIN — inicializar sesión solamente
// Cargado dinámicamente por cargarModuloAislado('login')
// ================================================================

async function iniciarSesion(event, formObj) {
    event.preventDefault();
    const btn = document.getElementById('btn-login');
    const msg = document.getElementById('mensaje-login');
    const btnText = document.getElementById('btn-text-content');
    const rememberCheckbox = document.getElementById('remember');
    
    btn.classList.add('loading');
    btn.disabled = true;
    if(msg) msg.style.display = 'none';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo: formObj.correo.value, password: formObj.password.value })
        });

        const respuesta = await response.json();

        if (respuesta.exito) {
            // Guardar o eliminar el correo según la opción "Recordarme"
            if (rememberCheckbox && rememberCheckbox.checked) {
                localStorage.setItem('azkell_saved_email', formObj.correo.value);
            } else {
                localStorage.removeItem('azkell_saved_email');
            }

            if(window.showLoginToast) window.showLoginToast('¡Iniciando sesión...', 'success');
            
            localStorage.setItem('fleet_user', respuesta.nombre);
            localStorage.setItem('fleet_rol', respuesta.rol);
            localStorage.setItem('fleet_correo', formObj.correo.value);
            localStorage.setItem('fleet_permisos', respuesta.permisos || '{}');
            window._permCache = null; // Invalidar cache de permisos
            localStorage.setItem('fleet_ultimo_acceso', Date.now());
            localStorage.setItem('fleet_token', respuesta.token || '');
            formObj.reset();
            
            setTimeout(() => {
                btn.classList.remove('loading');
                btn.disabled = false;
                restaurarCascaronApp();
                verificarSesionGuardada();
            }, 600); // Pequeño delay para que se vea el toast
        } else {
            if(window.showLoginToast) window.showLoginToast(respuesta.mensaje, 'error');
            else if(msg) { msg.innerText = respuesta.mensaje; msg.style.display = 'block'; }
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    } catch(error) {
        if(window.showLoginToast) window.showLoginToast('Error de red: El servidor local no está encendido.', 'error');
        else if(msg) { msg.innerText = 'Error de red: El servidor local no está encendido.'; msg.style.display = 'block'; }
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// ================================================================
// 🚀 FUNCIÓN DE ARRANQUE — llamada por el Router
// ================================================================
window.init_login = function() {
    const sb = document.getElementById('sidebarMenu');
    const tb = document.querySelector('.topbar');
    if(sb) sb.style.display = 'none';
    if(tb) tb.style.display = 'none';
    const main = document.querySelector('.main-area');
    if(main) main.style.padding = '0';

    // Funcionalidad extra de UI
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const eyeIcon = document.getElementById('eyeIcon');
    const themeToggleBtn = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const rememberCheckbox = document.getElementById('remember');
    const emailInput = document.getElementById('email');

    // Mostrar/Ocultar contraseña
    if(togglePasswordBtn) {
        // Remover listeners anteriores si el router recarga el módulo
        const newBtn = togglePasswordBtn.cloneNode(true);
        togglePasswordBtn.parentNode.replaceChild(newBtn, togglePasswordBtn);
        
        newBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            const currentEyeIcon = document.getElementById('eyeIcon');
            if (type === 'text') {
                currentEyeIcon.classList.replace('bi-eye-slash-fill', 'bi-eye-fill');
                currentEyeIcon.style.color = 'var(--login-primary)';
            } else {
                currentEyeIcon.classList.replace('bi-eye-fill', 'bi-eye-slash-fill');
                currentEyeIcon.style.color = '#9ca3af';
            }
        });
    }

    // Tema claro/oscuro local al login
    if(themeToggleBtn) {
        const newThemeBtn = themeToggleBtn.cloneNode(true);
        themeToggleBtn.parentNode.replaceChild(newThemeBtn, themeToggleBtn);
        
        const loginContainer = document.getElementById('pantalla-login');
        let currentLoginTheme = 'light';
        
        newThemeBtn.addEventListener('click', () => {
            const currentThemeIcon = document.getElementById('themeIcon');
            if (currentLoginTheme === 'dark') {
                loginContainer.removeAttribute('data-login-theme');
                currentLoginTheme = 'light';
                currentThemeIcon.classList.replace('bi-sun-fill', 'bi-moon-fill');
            } else {
                loginContainer.setAttribute('data-login-theme', 'dark');
                currentLoginTheme = 'dark';
                currentThemeIcon.classList.replace('bi-moon-fill', 'bi-sun-fill');
            }
        });
    }

    // Recordarme
    const savedEmail = localStorage.getItem('azkell_saved_email');
    if (savedEmail && emailInput) {
        emailInput.value = savedEmail;
        if(rememberCheckbox) rememberCheckbox.checked = true;
    }
};

window.showLoginToast = function(message, type = 'error') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    
    if (!toast) return;

    toastMessage.innerText = message;
    
    if (type === 'success') {
        toastIcon.className = 'bi bi-check-circle-fill text-success';
        toast.style.borderColor = 'var(--login-success)';
    } else {
        toastIcon.className = 'bi bi-x-circle-fill text-danger';
        toast.style.borderColor = 'var(--login-danger)';
    }

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
};


