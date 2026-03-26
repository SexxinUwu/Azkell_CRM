// ================================================================
// MÓDULO: LOGIN — inicializar sesión solamente
// Cargado dinámicamente por cargarModuloAislado('login')
// ================================================================

async function iniciarSesion(event, formObj) {
    event.preventDefault();
    const btn = document.getElementById('btn-login');
    const msg = document.getElementById('mensaje-login');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Verificando...';
    msg.style.display = 'none';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo: formObj.correo.value, password: formObj.password.value })
        });

        const respuesta = await response.json();

        if (respuesta.exito) {
            localStorage.setItem('crm_user', respuesta.nombre);
            localStorage.setItem('crm_rol', respuesta.rol);
            localStorage.setItem('crm_correo', formObj.correo.value);
            localStorage.setItem('crm_permisos', respuesta.permisos || '{}');
            localStorage.setItem('crm_ultimo_acceso', Date.now());
            formObj.reset();
            btn.disabled = false;
            btn.innerHTML = 'Ingresar al Sistema';
            restaurarCascaronApp();
            verificarSesionGuardada();
        } else {
            msg.innerText = respuesta.mensaje;
            msg.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = 'Ingresar al Sistema';
        }
    } catch(error) {
        msg.innerText = 'Error de red: El servidor local no está encendido.';
        msg.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = 'Ingresar al Sistema';
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

