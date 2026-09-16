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

    // 9. Sincronizar Notificaciones y SMTP
    _cargarConfigNotificaciones();
    _cargarDestinatariosAlertas();
};

// ---- Navegación de paneles ----
window.showConfig = function(panel) {
    const panels = ['apariencia', 'accesibilidad', 'idioma', 'empresa', 'notificaciones'];
    const titleMap = {
        'apariencia': 'Tema y Apariencia',
        'accesibilidad': 'Accesibilidad',
        'idioma': 'Idioma del Sistema',
        'empresa': 'Datos de la Empresa',
        'notificaciones': 'Notificaciones y Correo (SMTP)'
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
            const savedLogo = data.empresa_logo || window._tempLogoBase64 || '';
            if (window._tempLogoBase64 !== null) {
                localStorage.setItem('fleet_empresa_logo', savedLogo);
                window._tempLogoBase64 = null;
            }
            if (savedLogo) {
                const brandImg = document.querySelector('.brand-logo-icon img');
                if (brandImg) brandImg.src = savedLogo;
                const fav = document.getElementById('app-dynamic-favicon');
                if (fav) fav.href = savedLogo;
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

// ============================================================
// 📬 GESTIÓN DE NOTIFICACIONES Y SERVIDOR SMTP
// ============================================================
async function _cargarConfigNotificaciones() {
    try {
        const res = await fetch('/api/configuracion/email');
        const json = await res.json();
        if (json.ok && json.data) {
            const d = json.data;
            const h = document.getElementById('cfg-smtp-host');
            const p = document.getElementById('cfg-smtp-port');
            const u = document.getElementById('cfg-smtp-user');
            const fn = document.getElementById('cfg-smtp-fromname');
            const fe = document.getElementById('cfg-smtp-fromemail');
            const sec = document.getElementById('cfg-smtp-secure');
            const pwd = document.getElementById('cfg-smtp-pass');
            const badge = document.getElementById('cfg-smtp-badge-status');

            if (h) h.value = d.host || 'smtp.gmail.com';
            if (p) p.value = d.port || 587;
            if (u) u.value = d.user || '';
            if (fn) fn.value = d.from_name || 'Azkell ERP Alertas';
            if (fe) fe.value = d.from_email || '';
            if (sec) sec.checked = !!d.secure;
            if (pwd && d.has_pass) pwd.placeholder = '•••••••••••••••• (Guardada)';

            const swChk = document.getElementById('cfg-alert-checklist');
            const swVenc = document.getElementById('cfg-alert-vencimientos');
            const swPlanes = document.getElementById('cfg-alert-planes');
            if (swChk) swChk.checked = d.alertas_checklist !== false;
            if (swVenc) swVenc.checked = d.alertas_vencimientos !== false;
            if (swPlanes) swPlanes.checked = d.alertas_planes !== false;

            if (badge) {
                if (d.user && d.has_pass) {
                    badge.className = 'badge bg-success-subtle text-success px-3 py-2 rounded-pill fw-bold';
                    badge.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Estado: Configurado y Activo';
                } else {
                    badge.className = 'badge bg-warning-subtle text-warning-emphasis px-3 py-2 rounded-pill fw-bold';
                    badge.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1"></i> Estado: Requiere Credenciales';
                }
            }
        }
    } catch(err) {
        console.warn('Error cargando configuración SMTP:', err);
    }
}

window.toggleSmtpPassVisibility = function() {
    const input = document.getElementById('cfg-smtp-pass');
    const icon = document.getElementById('cfg-smtp-pass-icon');
    if (!input || !icon) return;
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
    }
};

window.guardarConfigSMTP = async function() {
    const host = (document.getElementById('cfg-smtp-host') || {}).value || '';
    const port = (document.getElementById('cfg-smtp-port') || {}).value || '587';
    const user = (document.getElementById('cfg-smtp-user') || {}).value || '';
    const pass = (document.getElementById('cfg-smtp-pass') || {}).value || '';
    const from_name = (document.getElementById('cfg-smtp-fromname') || {}).value || '';
    const from_email = (document.getElementById('cfg-smtp-fromemail') || {}).value || '';
    const secure = (document.getElementById('cfg-smtp-secure') || {}).checked;

    const alertas_checklist = (document.getElementById('cfg-alert-checklist') || {}).checked;
    const alertas_vencimientos = (document.getElementById('cfg-alert-vencimientos') || {}).checked;
    const alertas_planes = (document.getElementById('cfg-alert-planes') || {}).checked;

    try {
        const res = await fetch('/api/configuracion/email/smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host, port, secure, user, pass, from_name, from_email,
                alertas_checklist, alertas_vencimientos, alertas_planes
            })
        });
        const json = await res.json();
        if (json.ok) {
            _mostrarToast('Servidor SMTP guardado');
            if (typeof window.showToastNotification === 'function') {
                window.showToastNotification('Configuración SMTP actualizada con éxito.', 'success');
            }
            _cargarConfigNotificaciones();
        } else {
            throw new Error(json.error || 'Error al guardar');
        }
    } catch (err) {
        alert('Error al guardar configuración SMTP: ' + err.message);
    }
};

window.abrirModalPruebaSMTP = function() {
    const user = (document.getElementById('cfg-smtp-user') || {}).value || '';
    const inputDest = document.getElementById('cfg-test-email-dest');
    if (inputDest && user) inputDest.value = user;

    const statusEl = document.getElementById('cfg-test-email-status');
    if (statusEl) statusEl.className = 'alert d-none small py-2 px-3 mb-0 rounded-3';

    const m = document.getElementById('modalPruebaSMTP');
    if (m && typeof bootstrap !== 'undefined') {
        bootstrap.Modal.getOrCreateInstance(m).show();
    }
};

window.ejecutarPruebaSMTP = async function() {
    const dest = (document.getElementById('cfg-test-email-dest') || {}).value || '';
    const statusEl = document.getElementById('cfg-test-email-status');
    const btn = document.getElementById('btn-ejecutar-prueba-smtp');

    if (!dest || !dest.includes('@')) {
        if (statusEl) {
            statusEl.className = 'alert alert-danger small py-2 px-3 mb-0 rounded-3 d-block';
            statusEl.textContent = 'Ingrese un correo de destino válido.';
        }
        return;
    }

    const host = (document.getElementById('cfg-smtp-host') || {}).value || '';
    const port = (document.getElementById('cfg-smtp-port') || {}).value || '587';
    const user = (document.getElementById('cfg-smtp-user') || {}).value || '';
    const pass = (document.getElementById('cfg-smtp-pass') || {}).value || '';
    const from_name = (document.getElementById('cfg-smtp-fromname') || {}).value || '';
    const from_email = (document.getElementById('cfg-smtp-fromemail') || {}).value || '';
    const secure = (document.getElementById('cfg-smtp-secure') || {}).checked;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enviando...';
    }
    if (statusEl) {
        statusEl.className = 'alert alert-info small py-2 px-3 mb-0 rounded-3 d-block';
        statusEl.innerHTML = '<i class="bi bi-arrow-repeat-spin me-1"></i> Conectando al servidor SMTP y enviando prueba...';
    }

    try {
        const res = await fetch('/api/configuracion/email/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                test_email: dest, host, port, secure, user, pass, from_name, from_email
            })
        });
        const json = await res.json();
        if (json.ok) {
            if (statusEl) {
                statusEl.className = 'alert alert-success small py-2 px-3 mb-0 rounded-3 d-block';
                statusEl.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> <b>¡Éxito!</b> ${json.message}`;
            }
        } else {
            throw new Error(json.error || 'Error al conectar con SMTP');
        }
    } catch (err) {
        if (statusEl) {
            statusEl.className = 'alert alert-danger small py-2 px-3 mb-0 rounded-3 d-block';
            statusEl.innerHTML = `<i class="bi bi-x-circle-fill me-1"></i> <b>Error:</b> ${err.message}`;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-send-fill me-1"></i> Enviar Ahora';
        }
    }
};

// ── DIRECTOTIO DE DESTINATARIOS DE ALERTAS ──────────────────────
async function _cargarDestinatariosAlertas() {
    const tbody = document.getElementById('cfg-tabla-destinatarios-body');
    if (!tbody) return;

    try {
        const res = await fetch('/api/configuracion/email/destinatarios');
        const json = await res.json();
        const items = (json && json.ok && json.data) ? json.data : [];

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-3 text-muted">
                        <i class="bi bi-people me-1"></i> No hay destinatarios registrados aún. Haz clic en <b>Añadir Destinatario</b>.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        items.forEach(d => {
            const chkBadge = d.notif_checklist ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Sí</span>' : '<span class="text-muted">No</span>';
            const vencBadge = d.notif_vencimientos ? '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Sí</span>' : '<span class="text-muted">No</span>';
            const planBadge = d.notif_1d || d.notif_3d || d.notif_7d ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Sí</span>' : '<span class="text-muted">No</span>';

            html += `
                <tr>
                    <td class="fw-bold text-dark">
                        ${d.nombre}
                        ${d.cargo ? `<div class="small text-muted fw-normal">${d.cargo}</div>` : ''}
                    </td>
                    <td class="text-primary fw-semibold">${d.correo}</td>
                    <td class="text-center">${chkBadge}</td>
                    <td class="text-center">${vencBadge}</td>
                    <td class="text-center">${planBadge}</td>
                    <td class="text-end">
                        <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1" onclick="window.eliminarDestinatarioAlertas(${d.id})" title="Eliminar destinatario">
                            <i class="bi bi-trash3"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-2">Error al cargar: ${err.message}</td></tr>`;
    }
}

window.abrirModalNuevoDestinatarioAlertas = function() {
    const nom = document.getElementById('cfg-dest-nombre');
    const cor = document.getElementById('cfg-dest-correo');
    const car = document.getElementById('cfg-dest-cargo');
    if (nom) nom.value = '';
    if (cor) cor.value = '';
    if (car) car.value = '';

    const m = document.getElementById('modalNuevoDestinatarioAlertas');
    if (m && typeof bootstrap !== 'undefined') {
        bootstrap.Modal.getOrCreateInstance(m).show();
    }
};

window.guardarDestinatarioAlertas = async function() {
    const nombre = (document.getElementById('cfg-dest-nombre') || {}).value || '';
    const correo = (document.getElementById('cfg-dest-correo') || {}).value || '';
    const cargo = (document.getElementById('cfg-dest-cargo') || {}).value || '';
    const notif_checklist = (document.getElementById('cfg-dest-notif-checklist') || {}).checked;
    const notif_vencimientos = (document.getElementById('cfg-dest-notif-vencimientos') || {}).checked;
    const notif_planes = (document.getElementById('cfg-dest-notif-planes') || {}).checked;

    if (!nombre || !correo || !correo.includes('@')) {
        alert('Nombre y correo válido son requeridos.');
        return;
    }

    try {
        const res = await fetch('/api/configuracion/email/destinatarios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre, correo, cargo,
                notif_checklist, notif_vencimientos,
                notif_1d: notif_planes, notif_3d: notif_planes, notif_7d: notif_planes
            })
        });
        const json = await res.json();
        if (json.ok) {
            const m = document.getElementById('modalNuevoDestinatarioAlertas');
            if (m && typeof bootstrap !== 'undefined') {
                bootstrap.Modal.getOrCreateInstance(m).hide();
            }
            _mostrarToast('Destinatario guardado');
            _cargarDestinatariosAlertas();
        } else {
            throw new Error(json.error || 'Error al guardar');
        }
    } catch(err) {
        alert('Error: ' + err.message);
    }
};

window.eliminarDestinatarioAlertas = async function(id) {
    if (!confirm('¿Desea eliminar este destinatario de las alertas?')) return;
    try {
        const res = await fetch(`/api/configuracion/email/destinatarios/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (json.ok) {
            _mostrarToast('Destinatario eliminado');
            _cargarDestinatariosAlertas();
        }
    } catch(err) {
        alert('Error: ' + err.message);
    }
};

