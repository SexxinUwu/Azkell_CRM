// ============================================================
// Módulo: Configuración — window.init_configuracion (v2)
// ============================================================

window.init_configuracion = function() {
    // 1. Identificar panel de destino con persistencia
    const sectionTarget = window._activeConfigSection || sessionStorage.getItem('active_config_section') || 'apariencia';
    window._activeConfigSection = sectionTarget;
    sessionStorage.setItem('active_config_section', sectionTarget);
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

    // 8. Sincronizar Datos de Empresa
    _cargarDatosEmpresaEnFormulario();
};

// ---- Navegación de paneles ----
window.showConfig = function(panel) {
    const panels = ['apariencia', 'accesibilidad', 'idioma', 'empresa'];
    const titleMap = {
        'apariencia': 'Tema y Apariencia',
        'accesibilidad': 'Accesibilidad',
        'idioma': 'Idioma del Sistema',
        'empresa': 'Datos de la Empresa'
    };

    window._activeConfigSection = panel;
    sessionStorage.setItem('active_config_section', panel);

    const headerTitle = document.getElementById('cfg-header-title');
    if (headerTitle && titleMap[panel]) {
        headerTitle.textContent = titleMap[panel];
    }

    panels.forEach(p => {
        const el = document.getElementById('cfg-panel-' + p);
        if (el) {
            if (p === panel) {
                el.classList.remove('d-none');
                el.style.display = 'block';
            } else {
                el.classList.add('d-none');
                el.style.display = 'none';
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

// ---- Datos de la Empresa ----
window._tempLogoBase64 = null;

function _cargarDatosEmpresaEnFormulario() {
    const inputNombre = document.getElementById('cfg-empresa-nombre');
    const previewImg  = document.getElementById('cfg-empresa-logo-preview');
    const placeholder = document.getElementById('cfg-empresa-logo-placeholder');
    const delBtn      = document.getElementById('cfg-empresa-logo-del-btn');

    const nombreGuardado = localStorage.getItem('fleet_empresa_nombre') || '';
    const logoGuardado   = localStorage.getItem('fleet_empresa_logo') || '';

    if (inputNombre) inputNombre.value = nombreGuardado;

    if (previewImg && logoGuardado) {
        previewImg.src = logoGuardado;
        previewImg.style.display = 'inline-block';
        if (placeholder) placeholder.style.display = 'none';
        if (delBtn) delBtn.style.display = 'inline-block';
    } else {
        if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
        if (placeholder) placeholder.style.display = 'inline-block';
        if (delBtn) delBtn.style.display = 'none';
    }

    // Sincronizar desde API en background si hace falta
    fetch('/api/configuracion')
        .then(r => r.json())
        .then(data => {
            if (data.empresa_nombre !== undefined && inputNombre && !inputNombre.value) {
                inputNombre.value = data.empresa_nombre;
                localStorage.setItem('fleet_empresa_nombre', data.empresa_nombre);
            }
            if (data.empresa_logo !== undefined && data.empresa_logo && previewImg && !previewImg.src) {
                previewImg.src = data.empresa_logo;
                previewImg.style.display = 'inline-block';
                if (placeholder) placeholder.style.display = 'none';
                if (delBtn) delBtn.style.display = 'inline-block';
                localStorage.setItem('fleet_empresa_logo', data.empresa_logo);
            }
        })
        .catch(e => console.warn("Error obteniendo config empresa:", e));
}

window.handleEmpresaLogoSelected = function(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('El logotipo no debe superar 1MB.', 'warning');
        } else {
            alert('El logotipo no debe superar 1MB.');
        }
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        window._tempLogoBase64 = e.target.result;
        const previewImg  = document.getElementById('cfg-empresa-logo-preview');
        const placeholder = document.getElementById('cfg-empresa-logo-placeholder');
        const delBtn      = document.getElementById('cfg-empresa-logo-del-btn');

        if (previewImg) {
            previewImg.src = window._tempLogoBase64;
            previewImg.style.display = 'inline-block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (delBtn) delBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
};

window.eliminarLogoEmpresa = function() {
    window._tempLogoBase64 = '';
    const fileInput   = document.getElementById('cfg-empresa-logo-file');
    const previewImg  = document.getElementById('cfg-empresa-logo-preview');
    const placeholder = document.getElementById('cfg-empresa-logo-placeholder');
    const delBtn      = document.getElementById('cfg-empresa-logo-del-btn');

    if (fileInput) fileInput.value = '';
    if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
    if (placeholder) placeholder.style.display = 'inline-block';
    if (delBtn) delBtn.style.display = 'none';
};

window.guardarDatosEmpresa = async function() {
    const btn = document.getElementById('btn-guardar-empresa');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Guardando...';
    }

    try {
        const inputNombre = document.getElementById('cfg-empresa-nombre');
        const nombreVal = inputNombre ? inputNombre.value.trim() : '';

        const payload = {
            empresa_nombre: nombreVal
        };

        if (window._tempLogoBase64 !== null) {
            payload.empresa_logo = window._tempLogoBase64;
        }

        const res = await fetch('/api/configuracion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success || res.ok) {
            localStorage.setItem('fleet_empresa_nombre', nombreVal);
            if (window._tempLogoBase64 !== null) {
                localStorage.setItem('fleet_empresa_logo', window._tempLogoBase64);
                window._tempLogoBase64 = null;
            }

            _mostrarToast('Datos de empresa guardados');
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('Datos de la empresa actualizados con éxito.', 'success');
            }
        } else {
            throw new Error(data.error || 'Error al guardar');
        }
    } catch (err) {
        console.error("Error guardando empresa:", err);
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta('Error al guardar datos: ' + (err.message || err), 'danger');
        } else {
            alert('Error al guardar datos de la empresa');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
};

