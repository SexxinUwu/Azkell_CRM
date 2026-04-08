// ============================================================
// Módulo: Configuración — window.init_configuracion
// ============================================================

window.init_configuracion = function() {
    // Navegar al panel solicitado desde el sidebar, o default 'perfil'
    const sectionTarget = window._pendingCfgSection || 'perfil';
    window._pendingCfgSection = null;
    window.showConfig(sectionTarget);

    // Poblar datos de perfil desde localStorage
    const nombre = localStorage.getItem('fleet_user') || '—';
    const correo = localStorage.getItem('fleet_correo') || localStorage.getItem('fleet_user') || '—';
    const rol    = localStorage.getItem('fleet_rol') || '—';
    const acceso = localStorage.getItem('fleet_ultimo_acceso') || null;

    const elNombre = document.getElementById('cfg-perfil-nombre');
    const elCorreo = document.getElementById('cfg-perfil-correo');
    const elRol    = document.getElementById('cfg-perfil-rol-badge');
    const elAcceso = document.getElementById('cfg-perfil-acceso');

    if (elNombre) elNombre.textContent = nombre;
    if (elCorreo) elCorreo.textContent = correo;
    if (elRol) {
        elRol.textContent = rol.charAt(0).toUpperCase() + rol.slice(1);
    }
    if (elAcceso) {
        if (acceso) {
            try {
                elAcceso.textContent = new Date(parseInt(acceso)).toLocaleString('es-PE', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            } catch(e) {
                elAcceso.textContent = acceso;
            }
        } else {
            elAcceso.textContent = 'No registrado';
        }
    }

    // Sincronizar switch dark mode con estado actual
    const switchDark = document.getElementById('cfg-switch-dark');
    if (switchDark) {
        switchDark.checked = document.body.classList.contains('dark');
    }

    // Sincronizar color de acento con el guardado
    const accentSaved = localStorage.getItem('fleet_accent');
    if (accentSaved) {
        _marcarSwatchActivo(accentSaved);
        const inputColor = document.getElementById('cfg-color-custom');
        if (inputColor) inputColor.value = accentSaved;
    } else {
        _marcarSwatchActivo('#007aff');
    }

    // Sincronizar slider de fuente
    const fontSaved = parseInt(localStorage.getItem('fleet_fontsize')) || 14;
    const slider = document.getElementById('cfg-font-slider');
    const label  = document.getElementById('cfg-font-label');
    if (slider) slider.value = fontSaved;
    if (label)  label.textContent = fontSaved + 'px';

    // Sincronizar tipo de fuente
    const fontFamilySaved = localStorage.getItem('fleet_fontfamily') || 'inter';
    if (window.applyFontFamily) window.applyFontFamily(fontFamilySaved, false);

    // Sincronizar switches accesibilidad
    const reduceAnims = localStorage.getItem('fleet_reduce_anims') === 'true';
    const compact     = localStorage.getItem('fleet_sidebar_compact') === 'true';
    const swAnims     = document.getElementById('cfg-switch-anims');
    const swCompact   = document.getElementById('cfg-switch-compact');
    if (swAnims)   swAnims.checked   = reduceAnims;
    if (swCompact) swCompact.checked = compact;

    // Sincronizar idioma activo en las lang-cards
    const langActual = localStorage.getItem('fleet_idioma') || 'es';
    document.querySelectorAll('.lang-card').forEach(c => {
        c.classList.toggle('lang-card-active', c.dataset.lang === langActual);
    });
};

// ---- Navegación de paneles ----
window.showConfig = function(panel) {
    const panels  = ['perfil', 'apariencia', 'accesibilidad', 'idioma'];
    const buttons = document.querySelectorAll('.config-nav-btn');

    panels.forEach(p => {
        const el = document.getElementById('cfg-panel-' + p);
        const btn = document.getElementById('cfg-btn-' + p);
        if (el)  el.classList.toggle('d-none', p !== panel);
        if (btn) {
            if (p === panel) {
                btn.style.background = 'var(--crm-accent)';
                btn.style.color = '#fff';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text)';
            }
        }
    });
};

// ---- Color de acento ----
window.selectAccentColor = function(el) {
    const color = el.dataset.color;
    if (!color) return;
    if (window.applyAccent) window.applyAccent(color, true);
    _marcarSwatchActivo(color);
    const inputColor = document.getElementById('cfg-color-custom');
    if (inputColor) inputColor.value = color;
    _mostrarToast();
};

window.selectAccentColorCustom = function(hex) {
    if (!hex) return;
    if (window.applyAccent) window.applyAccent(hex, true);
    _marcarSwatchActivo(null); // ningún swatch queda activo con color custom
    const inputColor = document.getElementById('cfg-color-custom');
    if (inputColor) inputColor.value = hex;
    _mostrarToast();
};

window.resetAccentColor = function() {
    const defaultAccent = '#007aff';
    if (window.applyAccent) window.applyAccent(defaultAccent, true);
    _marcarSwatchActivo(defaultAccent);
    const inputColor = document.getElementById('cfg-color-custom');
    if (inputColor) inputColor.value = defaultAccent;
    localStorage.removeItem('fleet_accent');
    _mostrarToast();
};

function _marcarSwatchActivo(color) {
    const swatches = document.querySelectorAll('#cfg-swatches .cfg-swatch');
    swatches.forEach(s => {
        const esteColor = (s.dataset.color || '').toLowerCase();
        const isActive  = color && esteColor === color.toLowerCase();
        s.style.border    = isActive ? '3px solid var(--text)'   : '3px solid transparent';
        s.style.transform = isActive ? 'scale(1.15)' : 'scale(1)';
        s.style.boxShadow = isActive ? '0 0 0 2px var(--bg)' : 'none';
    });
}

// ---- Tamaño de fuente ----
window.applyFontSize = function(val, save) {
    document.documentElement.style.fontSize = val + 'px';
    const label = document.getElementById('cfg-font-label');
    if (label) label.textContent = val + 'px';
    if (save) {
        localStorage.setItem('fleet_fontsize', val);
        _mostrarToast();
    }
};

// ---- Tipo de fuente ----
window.applyFontFamily = function(key, save) {
    const FONTS = {
        inter:  "'Inter', system-ui, sans-serif",
        system: "system-ui, -apple-system, sans-serif",
        serif:  "Georgia, 'Times New Roman', serif",
        mono:   "'Consolas', 'Courier New', monospace"
    };
    const family = FONTS[key] || FONTS.inter;
    document.documentElement.style.setProperty('--font-family', family);
    document.documentElement.style.setProperty('--bs-body-font-family', family);
    document.querySelectorAll('#cfg-font-options .cfg-font-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.font === key);
    });
    if (save) {
        localStorage.setItem('fleet_fontfamily', key);
        _mostrarToast();
    }
};

// ---- Accesibilidad ----
window.setReduceMotion = function(val) {
    localStorage.setItem('fleet_reduce_anims', val ? 'true' : 'false');
    document.body.classList.toggle('reduce-motion', val);
    _mostrarToast();
};

window.setSidebarCompact = function(val) {
    localStorage.setItem('fleet_sidebar_compact', val ? 'true' : 'false');
    const sidebar = document.getElementById('sidebarMenu');
    if (sidebar) sidebar.classList.toggle('sidebar-compact', val);
    document.body.classList.toggle('sidebar-compact', val);
    _mostrarToast();
};

// ---- Toast ----
window._cfgToastTimer = window._cfgToastTimer || null;
function _mostrarToast() {
    const toast = document.getElementById('cfg-toast');
    if (!toast) return;
    if (window._cfgToastTimer) clearTimeout(window._cfgToastTimer);
    toast.classList.add('show');
    window._cfgToastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}
