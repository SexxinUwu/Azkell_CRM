// ============================================================
// 🚀 MÓDULO API GATEWAY & DESARROLLADORES — AZKELL ERP
// ============================================================

window._gwKeysData = [];
window._gwTabActivo = 'keys';
window._gwNuevoToken = '';

window.init_api_gateway = function() {
    window._gwTabActivo = 'keys';
    
    // Set base URL dynamically
    var baseUrlEl = document.getElementById('gw-base-url-text');
    if (baseUrlEl) {
        baseUrlEl.textContent = window.location.origin + '/api/v1/';
    }

    window.gwCargarKeys();
    window.gwCargarMetricasYLogs();
};

window.init_sistema_api_gateway = window.init_api_gateway;

// ── Cambio de Pestañas (Keys, Docs, Logs) ────────────────────
window.gwCambiarTab = function(tab, btn) {
    window._gwTabActivo = tab;
    
    document.querySelectorAll('#gw-tabs-container .gw-tab-btn').forEach(function(b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');

    var vKeys = document.getElementById('gw-view-keys');
    var vDocs = document.getElementById('gw-view-docs');
    var vLogs = document.getElementById('gw-view-logs');

    if (vKeys) vKeys.style.display = (tab === 'keys') ? 'block' : 'none';
    if (vDocs) vDocs.style.display = (tab === 'docs') ? 'block' : 'none';
    if (vLogs) vLogs.style.display = (tab === 'logs') ? 'block' : 'none';

    if (tab === 'logs') {
        window.gwCargarMetricasYLogs();
    }
};

// ── Cargar Listado de API Keys ──────────────────────────────
window.gwCargarKeys = async function() {
    var tbody = document.getElementById('gw-tabla-keys-body');
    if (!tbody) return;

    try {
        var res = await fetch('/api/sistema/api-keys');
        if (!res.ok) throw new Error('Fallo al obtener API Keys');
        var data = await res.json();
        window._gwKeysData = Array.isArray(data) ? data : [];
        window.gwRenderTablaKeys(window._gwKeysData);
        window.gwActualizarKpis();
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger"><i class="bi bi-exclamation-circle me-1"></i> Error al cargar llaves API: ${err.message}</td></tr>`;
    }
};

// ── Renderizar Tabla de Keys ────────────────────────────────
window.gwRenderTablaKeys = function(lista) {
    var tbody = document.getElementById('gw-tabla-keys-body');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-5 text-muted">
                    <i class="bi bi-key fs-2 d-block mb-2 text-secondary opacity-50"></i>
                    No hay API Keys generadas todavía.<br>
                    <button class="btn btn-sm btn-outline-primary fw-bold mt-2" onclick="window.gwAbrirModalNuevaKey()">
                        + Generar Primera API Key
                    </button>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = lista.map(function(k) {
        var scopes = [];
        try {
            scopes = typeof k.scopes === 'string' ? JSON.parse(k.scopes) : (k.scopes || []);
        } catch(e) {
            scopes = String(k.scopes || '').split(',').map(s => s.trim()).filter(Boolean);
        }

        var scopesBadges = scopes.map(function(sc) {
            return `<span class="gw-scope-badge">${sc}</span>`;
        }).join('');

        var estadoBadge = '';
        if (k.estado === 'activo') {
            estadoBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1 fw-bold">Activo</span>';
        } else if (k.estado === 'inactivo') {
            estadoBadge = '<span class="badge bg-warning-subtle text-warning border border-warning-subtle px-2.5 py-1 fw-bold">Inactivo</span>';
        } else {
            estadoBadge = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2.5 py-1 fw-bold">Revocado</span>';
        }

        var maskedKey = (k.api_key || '').substring(0, 12) + '••••••••••••••••••••';
        var safeKey = (k.api_key || '').replace(/'/g, "\\'");

        return `
            <tr>
                <td>
                    <div class="fw-bold text-dark">${_gwEsc(k.nombre)}</div>
                    <div class="text-secondary small" style="font-size:0.75rem;">${k.cliente_empresa ? _gwEsc(k.cliente_empresa) : 'Uso General'}</div>
                </td>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <span class="font-monospace text-muted small bg-light px-2 py-1 rounded border">${maskedKey}</span>
                        <button class="btn btn-sm btn-light border p-1" title="Copiar Token" onclick="window.gwCopiarTexto('${safeKey}', 'API Key copiada al portapapeles')">
                            <i class="bi bi-clipboard"></i>
                        </button>
                    </div>
                </td>
                <td>
                    <div style="max-width: 260px;">${scopesBadges || '<span class="text-muted small">Sin scopes</span>'}</div>
                </td>
                <td class="text-center font-monospace small">
                    <strong>${k.limite_rpm || 60}</strong> rpm
                </td>
                <td class="text-center font-monospace small">
                    <span class="badge bg-light text-dark border px-2 py-1">${(k.peticiones_total || 0).toLocaleString()}</span>
                </td>
                <td>${estadoBadge}</td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm">
                        ${k.estado === 'activo' ? `
                            <button class="btn btn-outline-warning" title="Pausar Key" onclick="window.gwCambiarEstadoKey(${k.id}, 'inactivo')">
                                <i class="bi bi-pause-fill"></i>
                            </button>
                        ` : `
                            <button class="btn btn-outline-success" title="Activar Key" onclick="window.gwCambiarEstadoKey(${k.id}, 'activo')">
                                <i class="bi bi-play-fill"></i>
                            </button>
                        `}
                        <button class="btn btn-outline-danger" title="Eliminar Key" onclick="window.gwEliminarKey(${k.id}, '${_gwEsc(k.nombre)}')">
                            <i class="bi bi-trash3-fill"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
};

// ── Filtrar Keys en Vivo ────────────────────────────────────
window.gwFiltrarKeys = function(q) {
    var query = (q || '').trim().toLowerCase();
    if (!query) {
        window.gwRenderTablaKeys(window._gwKeysData);
        return;
    }
    var filtrados = window._gwKeysData.filter(function(k) {
        return (k.nombre || '').toLowerCase().includes(query) ||
               (k.cliente_empresa || '').toLowerCase().includes(query) ||
               (k.api_key || '').toLowerCase().includes(query);
    });
    window.gwRenderTablaKeys(filtrados);
};

// ── Abrir Modal Crear Key ───────────────────────────────────
window.gwAbrirModalNuevaKey = function() {
    var form = document.getElementById('formGwNuevaKey');
    if (form) form.reset();
    var modalEl = document.getElementById('modalGwNuevaKey');
    if (modalEl && typeof bootstrap !== 'undefined') {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

// ── Guardar Nueva API Key ───────────────────────────────────
window.gwGuardarNuevaKey = async function(e) {
    if (e && e.preventDefault) e.preventDefault();
    var form = document.getElementById('formGwNuevaKey');
    if (!form) return;

    var btn = document.getElementById('btnGwCrearKey');
    if (btn) btn.disabled = true;

    var formData = new FormData(form);
    var scopesChecked = Array.from(form.querySelectorAll('input[name="scopes"]:checked')).map(function(c) { return c.value; });

    var payload = {
        nombre: formData.get('nombre'),
        cliente_empresa: formData.get('cliente_empresa'),
        limite_rpm: formData.get('limite_rpm'),
        scopes: scopesChecked
    };

    try {
        var res = await fetch('/api/sistema/api-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        var data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Error al crear API Key');

        // Cerrar modal de creación
        var modalEl = document.getElementById('modalGwNuevaKey');
        if (modalEl && typeof bootstrap !== 'undefined') {
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }

        // Mostrar modal con la nueva clave completa
        window._gwNuevoToken = data.api_key;
        var tokenDisp = document.getElementById('gw-token-display');
        if (tokenDisp) tokenDisp.textContent = data.api_key;

        var modalCreadaEl = document.getElementById('modalGwKeyCreada');
        if (modalCreadaEl && typeof bootstrap !== 'undefined') {
            var modalC = new bootstrap.Modal(modalCreadaEl);
            modalC.show();
        }

        window.gwCargarKeys();
        window.gwCargarMetricasYLogs();
    } catch(err) {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta(err.message, 'danger');
        } else {
            alert(err.message);
        }
    } finally {
        if (btn) btn.disabled = false;
    }
};

// ── Cambiar Estado de Key ───────────────────────────────────
window.gwCambiarEstadoKey = async function(id, nuevoEstado) {
    try {
        var res = await fetch(`/api/sistema/api-keys/${id}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        var data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Error al actualizar estado');
        window.gwCargarKeys();
    } catch(err) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta(err.message, 'danger');
    }
};

// ── Eliminar API Key ────────────────────────────────────────
window.gwEliminarKey = async function(id, nombre) {
    if (!confirm(`¿Estás seguro de eliminar permanentemente la API Key "${nombre}"? Los sistemas externos conectados con esta llave dejarán de funcionar.`)) {
        return;
    }
    try {
        var res = await fetch(`/api/sistema/api-keys/${id}`, { method: 'DELETE' });
        var data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Error al eliminar');
        window.gwCargarKeys();
    } catch(err) {
        if (typeof window.mostrarAlerta === 'function') window.mostrarAlerta(err.message, 'danger');
    }
};

// ── Cargar Métricas y Logs de Auditoría ─────────────────────
window.gwCargarMetricasYLogs = async function() {
    try {
        var res = await fetch('/api/sistema/api-keys/metrics');
        if (!res.ok) return;
        var data = await res.json();

        var kpiReq = document.getElementById('gw-kpi-requests');
        if (kpiReq) kpiReq.textContent = (data.peticiones_historicas || 0).toLocaleString();

        var tbodyLogs = document.getElementById('gw-tabla-logs-body');
        if (tbodyLogs && Array.isArray(data.logs)) {
            if (data.logs.length === 0) {
                tbodyLogs.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Sin peticiones registradas aún.</td></tr>';
            } else {
                tbodyLogs.innerHTML = data.logs.map(function(l) {
                    var statusBadge = (l.status_code >= 200 && l.status_code < 300)
                        ? `<span class="badge bg-success">${l.status_code} OK</span>`
                        : `<span class="badge bg-danger">${l.status_code} Error</span>`;
                    
                    var fStr = l.fecha ? new Date(l.fecha).toLocaleString() : '—';

                    return `
                        <tr>
                            <td><span class="text-secondary small font-monospace">${fStr}</span></td>
                            <td><strong class="text-dark">${_gwEsc(l.api_key_nombre || 'API Key')}</strong></td>
                            <td><span class="font-monospace text-primary fw-semibold">${_gwEsc(l.endpoint)}</span></td>
                            <td><span class="badge bg-light text-dark border">${l.metodo}</span></td>
                            <td><span class="font-monospace text-muted small">${_gwEsc(l.ip)}</span></td>
                            <td>${statusBadge}</td>
                            <td class="text-end font-monospace small"><strong>${l.tiempo_ms}</strong> ms</td>
                        </tr>`;
                }).join('');
            }
        }
    } catch(e) {}
};

window.gwActualizarKpis = function() {
    var kpiKeys = document.getElementById('gw-kpi-keys');
    if (kpiKeys) {
        var activas = window._gwKeysData.filter(function(k) { return k.estado === 'activo'; }).length;
        kpiKeys.textContent = activas;
    }
};

// ── Helpers de Copiado y Ejemplos de Código ──────────────────
window.gwCopiarTokenNuevo = function() {
    if (window._gwNuevoToken) {
        window.gwCopiarTexto(window._gwNuevoToken, '¡API Key copiada al portapapeles!');
    }
};

window.gwCopiarTexto = function(txt, msgSuccess) {
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(function() {
        if (typeof window.mostrarAlerta === 'function') {
            window.mostrarAlerta(msgSuccess || 'Copiado al portapapeles', 'success');
        } else {
            alert(msgSuccess || 'Copiado al portapapeles');
        }
    }).catch(function() {
        var t = document.createElement('textarea');
        t.value = txt;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
        alert(msgSuccess || 'Copiado al portapapeles');
    });
};

window.gwCopiarEjemplo = function(lang, endpoint) {
    var origin = window.location.origin;
    var url = origin + endpoint;
    var code = '';

    if (lang === 'curl') {
        code = `curl -X GET "${url}" \\\n  -H "Authorization: Bearer tu_api_key_aqui" \\\n  -H "Content-Type: application/json"`;
    } else if (lang === 'python') {
        code = `import requests\n\nurl = "${url}"\nheaders = {\n    "Authorization": "Bearer tu_api_key_aqui",\n    "Content-Type": "application/json"\n}\n\nresponse = requests.get(url, headers=headers)\ndata = response.json()\nprint(data)`;
    } else if (lang === 'js') {
        code = `fetch("${url}", {\n  method: "GET",\n  headers: {\n    "Authorization": "Bearer tu_api_key_aqui",\n    "Content-Type": "application/json"\n  }\n})\n.then(res => res.json())\n.then(data => console.log(data))\n.catch(err => console.error(err));`;
    }

    window.gwCopiarTexto(code, `Ejemplo de código en ${lang.toUpperCase()} copiado al portapapeles`);
};

var _gwEsc = function(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};
