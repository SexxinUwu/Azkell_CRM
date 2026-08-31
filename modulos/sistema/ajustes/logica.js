// ============================================================
// ⚙️ MÓDULO AJUSTES - Lógica
// ============================================================

window.init_ajustes = function() {
    // Rellenar datos del usuario
    let nombreEl = document.getElementById('ajustes-user-name');
    let roleEl   = document.getElementById('ajustes-user-role');
    let emailEl  = document.getElementById('ajustes-user-email');
    let avatarEl = document.getElementById('ajustes-user-avatar');
    
    let lsUser = localStorage.getItem('fleet_nombre_usuario') || localStorage.getItem('fleet_user') || window.usuarioLogueado || 'Usuario';
    let lsRol = localStorage.getItem('fleet_rol') || window.rolLogueado || 'USUARIO';
    let lsCorreo = localStorage.getItem('fleet_correo') || '';
    let lsAvatar = localStorage.getItem('fleet_avatar');

    if (nombreEl) nombreEl.textContent = lsUser;
    if (roleEl)   roleEl.textContent   = lsRol && lsRol !== 'null' ? lsRol.toUpperCase() : 'USUARIO';
    if (emailEl)  emailEl.textContent  = lsCorreo && lsCorreo !== 'null' ? lsCorreo : '';
    if (avatarEl) {
        if (lsAvatar && lsAvatar !== 'null' && lsAvatar !== 'undefined' && (lsAvatar.startsWith('http') || lsAvatar.startsWith('data:') || lsAvatar.startsWith('/'))) {
            avatarEl.style.background = `url("${lsAvatar}") center/cover no-repeat`;
            avatarEl.textContent = '';
        } else {
            let partes = lsUser.trim().split(' ');
            let iniciales = partes.length > 1 ? (partes[0][0] + partes[1][0]) : lsUser.substring(0,2);
            avatarEl.textContent = iniciales.toUpperCase();
            avatarEl.style.background = 'linear-gradient(135deg, #0284c7, #2563eb)';
            avatarEl.style.color = '#ffffff';
        }
    }

    // Configurar Switch de Tema Oscuro
    let themeSwitch = document.getElementById('ajustes-theme-switch');
    if (themeSwitch) {
        let isDark = localStorage.getItem('theme') === 'dark' || document.body.classList.contains('dark');
        themeSwitch.checked = isDark;
    }

    // Mostrar u ocultar sección de administración y sus opciones según permisos
    let rol = (lsRol || '').toLowerCase();
    let isAdm = rol.includes('admin') || rol.includes('fundador') || (lsUser || '').toLowerCase().includes('admin');

    let _cL = function(k) { return window.checkPerm ? window.checkPerm(k, 'l') : false; };
    let vUsuarios   = isAdm || _cL('usuarios');
    let vAuditoria  = isAdm || _cL('mod_auditoria');
    let vAdminHub   = isAdm || _cL('administracion') || _cL('cfg_mant');

    let itemUsuarios   = document.getElementById('ajustes-item-usuarios');
    let itemAuditoria  = document.getElementById('ajustes-item-auditoria');
    let itemAdmin      = document.getElementById('ajustes-item-admin');
    let adminSecHeader = document.getElementById('ajustes-admin-section-header');
    let adminGroupBox  = document.getElementById('ajustes-admin-group-box');

    if (itemUsuarios)   itemUsuarios.style.display   = vUsuarios ? 'flex' : 'none';
    if (itemAuditoria)  itemAuditoria.style.display  = vAuditoria ? 'flex' : 'none';
    if (itemAdmin)      itemAdmin.style.display      = vAdminHub ? 'flex' : 'none';

    let hasAnyAdmin = vUsuarios || vAuditoria || vAdminHub;
    if (adminSecHeader) adminSecHeader.style.display = hasAnyAdmin ? 'flex' : 'none';
    if (adminGroupBox)  adminGroupBox.style.display  = hasAnyAdmin ? 'block' : 'none';

    // Configurar texto del idioma
    let langEl = document.getElementById('ajustes-lang-text');
    if (langEl) {
        let lang = localStorage.getItem('idioma') || 'es';
        langEl.textContent = lang === 'en' ? 'English' : 'Español';
    }
};
