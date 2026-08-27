// ============================================================
// Módulo: Configuración — window.init_configuracion (v2)
// ============================================================

window.init_configuracion = function() {
    // 1. Identificar panel de destino
    const sectionTarget = window._pendingCfgSection || sessionStorage.getItem('pending_cfg_section') || 'apariencia';
    window._pendingCfgSection = null;
    sessionStorage.removeItem('pending_cfg_section');
    window.showConfig(sectionTarget);

    // 2. Sincronizar Switch Dark Mode
    const switchDark = document.getElementById('cfg-switch-dark');
    if (switchDark) {
        switchDark.checked = document.body.classList.contains('dark') || localStorage.getItem('theme') === 'dark';
    }

    // 3. Sincronizar Color de Acento
    const accentSaved = localStorage.getItem('fleet_accent') || localStorage.getItem('crm_accent') || '#2563eb';
    _marcarSwatchActivo(accentSaved);
    const inputColor = document.getElementById('cfg-color-custom');
    if (inputColor) inputColor.value = accentSaved;

    // 4. Sincronizar Slider de Fuente
    const fontSaved = parseInt(localStorage.getItem('fleet_fontsize')) || 14;
    const slider = document.getElementById('cfg-font-slider');
    const label  = document.getElementById('cfg-font-label');
    if (slider) slider.value = fontSaved;
    if (label)  label.textContent = fontSaved + 'px';

    // 5. Sincronizar Tipo de Fuente
    const fontFamilySaved = localStorage.getItem('fleet_fontfamily') || 'inter';
    if (window.applyFontFamily) window.applyFontFamily(fontFamilySaved, false);

    // 6. Sincronizar Switches de Accesibilidad
    const reduceAnims = localStorage.getItem('fleet_reduce_anims') === 'true';
    const compact     = localStorage.getItem('fleet_sidebar_compact') === 'true';
    const swAnims     = document.getElementById('cfg-switch-anims');
    const swCompact   = document.getElementById('cfg-switch-compact');
    if (swAnims)   swAnims.checked   = reduceAnims;
    if (swCompact) swCompact.checked = compact;

    // 7. Sincronizar Idioma
    const langActual = localStorage.getItem('fleet_idioma') || localStorage.getItem('idioma') || 'es';
    _actualizarVistaIdioma(langActual);
};

// ---- Navegación de paneles ----
window.showConfig = function(panel) {
    const panels = ['apariencia', 'accesibilidad', 'idioma'];
    const titleMap = {
        'apariencia': 'Tema y Apariencia',
        'accesibilidad': 'Accesibilidad',
        'idioma': 'Idioma del Sistema'
    };

    const headerTitle = document.getElementById('cfg-header-title');
    if (headerTitle && titleMap[panel]) {
        headerTitle.textContent = titleMap[panel];
    }

    panels.forEach(p => {
        const el = document.getElementById('cfg-panel-' + p);
        if (el) {
            if (p === panel) {
                el.classList.remove('d-none');
            } else {
                el.classList.add('d-none');
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
    _marcarSwatchActivo(null);
    _mostrarToast();
};

window.resetAccentColor = function() {
    const defaultAccent = '#2563eb';
    if (window.applyAccent) window.applyAccent(defaultAccent, true);
    _marcarSwatchActivo(defaultAccent);
    const inputColor = document.getElementById('cfg-color-custom');
    if (inputColor) inputColor.value = defaultAccent;
    localStorage.removeItem('fleet_accent');
    _mostrarToast();
};

function _marcarSwatchActivo(color) {
    const swatches = document.querySelectorAll('#cfg-swatches .cfg-swatch-circle');
    swatches.forEach(s => {
        const esteColor = (s.dataset.color || '').toLowerCase();
        const isActive  = color && esteColor === color.toLowerCase();
        s.classList.toggle('active', !!isActive);
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
        inter:  "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
        system: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        serif:  "Georgia, 'Times New Roman', serif",
        mono:   "'Consolas', 'Courier New', monospace"
    };
    const family = FONTS[key] || FONTS.inter;
    document.documentElement.style.setProperty('--font-family', family);
    document.documentElement.style.setProperty('--bs-body-font-family', family);
    document.querySelectorAll('#cfg-font-options .cfg-font-pill').forEach(b => {
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

// ---- Idioma ----
window.setLanguage = function(lang) {
    localStorage.setItem('fleet_idioma', lang);
    localStorage.setItem('idioma', lang);
    _actualizarVistaIdioma(lang);
    _mostrarToast('Idioma actualizado');
    if (typeof window.applyI18n === 'function') {
        window.applyI18n();
    }
};

function _actualizarVistaIdioma(lang) {
    document.querySelectorAll('.cfg-lang-item').forEach(el => {
        el.classList.toggle('active', el.dataset.lang === lang);
    });
}

// ---- Toast ----
window._cfgToastTimer = window._cfgToastTimer || null;
function _mostrarToast(msg) {
    const toast = document.getElementById('cfg-toast');
    if (!toast) return;
    if (msg) {
        const span = toast.querySelector('span');
        if (span) span.textContent = msg;
    }
    if (window._cfgToastTimer) clearTimeout(window._cfgToastTimer);
    toast.style.display = 'flex';
    window._cfgToastTimer = setTimeout(() => {
        toast.style.display = 'none';
    }, 2000);
}
