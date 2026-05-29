// ============================================================
// ⚙️ MÓDULO AJUSTES - Lógica
// ============================================================

window.init_ajustes = function() {
    // Rellenar datos del usuario
    let nombreEl = document.getElementById('ajustes-user-name');
    let roleEl   = document.getElementById('ajustes-user-role');
    
    let userData = typeof getSessionData === 'function' ? getSessionData() : null;
    if (userData) {
        if (nombreEl) nombreEl.textContent = userData.nombre || userData.user || 'Usuario';
        if (roleEl)   roleEl.textContent   = userData.rol || 'Rol Desconocido';
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
