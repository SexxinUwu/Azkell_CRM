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
            localStorage.setItem('fleet_permisos', JSON.stringify(respuesta.permisos) || '{}');
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
};

