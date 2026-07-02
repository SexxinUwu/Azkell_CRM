// ============================================================
// ⚙️ MÓDULO AJUSTES - Lógica
// ============================================================

window.init_ajustes = function() {
    // Rellenar datos del usuario
    let nombreEl = document.getElementById('ajustes-user-name');
    let roleEl   = document.getElementById('ajustes-user-role');
    let emailEl  = document.getElementById('ajustes-user-email');
    let avatarEl = document.getElementById('ajustes-user-avatar');
    
    let lsUser = localStorage.getItem('fleet_user');
    let lsRol = localStorage.getItem('fleet_rol');
    let lsCorreo = localStorage.getItem('fleet_correo');

    if (lsUser) {
        let nombre = lsUser;
        if (nombreEl) nombreEl.textContent = nombre;
        if (roleEl)   roleEl.textContent   = lsRol && lsRol !== 'null' ? lsRol : 'USUARIO';
        if (emailEl)  emailEl.textContent  = lsCorreo && lsCorreo !== 'null' ? lsCorreo : '';
        if (avatarEl) {
            let partes = nombre.trim().split(' ');
            let iniciales = partes.length > 1 ? (partes[0][0] + partes[1][0]) : nombre.substring(0,2);
            avatarEl.textContent = iniciales.toUpperCase();
        }
    }

    // Configurar Switch de Tema Oscuro
    let themeSwitch = document.getElementById('ajustes-theme-switch');
    if (themeSwitch) {
        let isDark = localStorage.getItem('theme') === 'dark' || document.body.classList.contains('dark');
        themeSwitch.checked = isDark;
    }

    // Mostrar u ocultar sección de administración según permisos
    let adminSec = document.getElementById('ajustes-admin-section');
    if (adminSec) {
        // Asumiendo que si tiene permiso de crear usuarios, es admin. Puedes ajustar esto.
        let isAdmin = window.checkPerm ? window.checkPerm('usuarios', 'l') : true;
        if (isAdmin || (userData && userData.rol === 'ADMINISTRADOR')) {
            adminSec.style.display = 'block';
        } else {
            adminSec.style.display = 'none';
        }
    }

    // Configurar texto del idioma
    let langEl = document.getElementById('ajustes-lang-text');
    if (langEl) {
        let lang = localStorage.getItem('idioma') || 'es';
        langEl.textContent = lang === 'en' ? 'English' : 'Español';
    }
};
