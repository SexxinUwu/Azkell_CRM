// ================================================================
// MÓDULO: AUDITORÍA — Registro y Control de Actividad ERP
// ================================================================

window.dataAuditoria = window.dataAuditoria || [];
window._auditFilter  = window._auditFilter  || 'all';
window._auditSortAsc = false; // Descendente por defecto (más reciente primero)
window._auditPage    = 1;
window._auditPageSize = 50;

var _AUDIT_COLORS = ['#6366f1','#10b981','#06b6d4','#f59e0b','#8b5cf6','#ef4444','#ec4899','#0284c7','#14b8a6','#e11d48'];

function _getAuditUserColor(str) {
    var s = String(str || 'S');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFFFF;
    return _AUDIT_COLORS[Math.abs(h) % _AUDIT_COLORS.length];
}

function _getAuditUserInitials(str) {
    var raw = String(str || 'S').trim();
    if (!raw || raw.toLowerCase().includes('object') || raw.toLowerCase() === 'sistema') {
        return 'SYS';
    }
    var parts = raw.split(/[@.\s_-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || 'S').slice(0, 2).toUpperCase();
}

function _cleanAuditUser(val) {
    if (!val) return 'Sistema / Automático';
    var s = String(val).trim();
    if (s === '[object Object]' || s.includes('[object') || s === 'undefined' || s === 'null') {
        return 'Sistema / Automático';
    }
    return s;
}

function _formatAuditDate(dateStr) {
    if (!dateStr) return { full: '—', rel: '' };
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return { full: String(dateStr), rel: '' };

    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    var hours = String(d.getHours()).padStart(2, '0');
    var mins = String(d.getMinutes()).padStart(2, '0');
    var secs = String(d.getSeconds()).padStart(2, '0');

    var full = day + '/' + month + '/' + year + ' ' + hours + ':' + mins + ':' + secs;

    // Relative
    var diff = Date.now() - d.getTime();
    var rel = '';
    var m = Math.floor(diff / 60000);
    if (m < 1) rel = 'ahora';
    else if (m < 60) rel = 'hace ' + m + 'm';
    else {
        var h = Math.floor(m / 60);
        if (h < 24) rel = 'hace ' + h + 'h';
        else {
            var days = Math.floor(h / 24);
            if (days < 7) rel = 'hace ' + days + 'd';
        }
    }

    return { full: full, rel: rel };
}

function _getModuloStyle(mod) {
    var m = String(mod || 'SISTEMA').toUpperCase();
    if (m.includes('COMBUSTIBLE')) return { bg: 'rgba(245, 158, 11, 0.12)', color: '#b45309', border: 'rgba(245, 158, 11, 0.3)', icon: 'bi-fuel-pump', label: 'COMBUSTIBLE' };
    if (m.includes('OPERACION') || m.includes('VIAJE')) return { bg: 'rgba(2, 132, 199, 0.12)', color: '#0369a1', border: 'rgba(2, 132, 199, 0.3)', icon: 'bi-truck', label: 'OPERACIONES' };
    if (m.includes('TALLER') || m.includes('OT')) return { bg: 'rgba(139, 92, 246, 0.12)', color: '#6d28d9', border: 'rgba(139, 92, 246, 0.3)', icon: 'bi-wrench-adjustable', label: 'TALLER' };
    if (m.includes('MANTENIMIENTO') || m.includes('INCIDENCIA')) return { bg: 'rgba(6, 182, 212, 0.12)', color: '#0e7490', border: 'rgba(6, 182, 212, 0.3)', icon: 'bi-tools', label: 'MANTENIMIENTO' };
    if (m.includes('FLEETRUN')) return { bg: 'rgba(99, 102, 241, 0.12)', color: '#4338ca', border: 'rgba(99, 102, 241, 0.3)', icon: 'bi-speedometer2', label: 'FLEETRUN' };
    if (m.includes('PLACA') || m.includes('VEHICULO')) return { bg: 'rgba(16, 185, 129, 0.12)', color: '#047857', border: 'rgba(16, 185, 129, 0.3)', icon: 'bi-car-front-fill', label: 'PLACAS' };
    if (m.includes('INSPECCION') || m.includes('CHECKLIST')) return { bg: 'rgba(234, 179, 8, 0.15)', color: '#a16207', border: 'rgba(234, 179, 8, 0.3)', icon: 'bi-clipboard-check', label: 'INSPECCIONES' };
    if (m.includes('SEGURIDAD') || m.includes('GARITA')) return { bg: 'rgba(236, 72, 153, 0.12)', color: '#be185d', border: 'rgba(236, 72, 153, 0.3)', icon: 'bi-shield-lock-fill', label: 'SEGURIDAD' };
    if (m.includes('USUARIO') || m.includes('ROL')) return { bg: 'rgba(168, 85, 247, 0.12)', color: '#7e22ce', border: 'rgba(168, 85, 247, 0.3)', icon: 'bi-people-fill', label: m };
    if (m.includes('PERFIL')) return { bg: 'rgba(59, 130, 246, 0.12)', color: '#1d4ed8', border: 'rgba(59, 130, 246, 0.3)', icon: 'bi-person-circle', label: 'PERFIL' };
    return { bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: 'rgba(100, 116, 139, 0.3)', icon: 'bi-gear-wide-connected', label: m || 'GENERAL' };
}

function _getAccionBadge(acc) {
    var a = String(acc || '').toUpperCase();
    if (a.includes('CRE') || a.includes('INSERT') || a.includes('NUEV') || a.includes('REGISTR')) {
        return '<span class="audit-badge-action audit-badge-cre"><i class="bi bi-plus-circle-fill"></i> ' + (acc || 'CREÓ') + '</span>';
    }
    if (a.includes('MODIF') || a.includes('ACTUALIZ') || a.includes('EDIT') || a.includes('CAMBIO')) {
        return '<span class="audit-badge-action audit-badge-mod"><i class="bi bi-pencil-square"></i> ' + (acc || 'MODIFICÓ') + '</span>';
    }
    if (a.includes('ELIMIN') || a.includes('ANUL') || a.includes('CANCEL') || a.includes('DELETE')) {
        return '<span class="audit-badge-action audit-badge-del"><i class="bi bi-trash3-fill"></i> ' + (acc || 'ELIMINÓ') + '</span>';
    }
    if (a.includes('SYNC') || a.includes('SINCRONIZ')) {
        return '<span class="audit-badge-action audit-badge-sync"><i class="bi bi-cloud-arrow-down-fill"></i> ' + (acc || 'SINCRONIZÓ') + '</span>';
    }
    return '<span class="audit-badge-action audit-badge-mod" style="background:rgba(99,102,241,0.12);color:#4f46e5;border-color:rgba(99,102,241,0.3);"><i class="bi bi-activity"></i> ' + (acc || 'ACCIÓN') + '</span>';
}

window.cargarAuditoria = async function(forzar) {
    var reloadIcon = document.getElementById('audit-reload-icon');
    if (reloadIcon) reloadIcon.classList.add('bi-spin');
    
    var tbody = document.getElementById('auditTableBody');
    if (tbody && (!window.dataAuditoria || window.dataAuditoria.length === 0 || forzar)) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2 text-primary"></span>Cargando historial de auditoría...</td></tr>';
    }

    try {
        var res = await fetch('/api/auditoria?limit=1000');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        window.dataAuditoria = (json.data || []).map(function(r) {
            r.usuario = _cleanAuditUser(r.usuario);
            r.id = parseInt(r.id) || 0;
            return r;
        });
        window._auditPage = 1;
        window.actualizarKPIsAudit(window.dataAuditoria);
        window.renderAuditTable();
    } catch(e) {
        console.error('Error al cargar auditoría:', e);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-danger"><i class="bi bi-exclamation-triangle-fill fs-3 d-block mb-2"></i>Error al cargar registros: ' + e.message + '</td></tr>';
        }
    } finally {
        if (reloadIcon) reloadIcon.classList.remove('bi-spin');
    }
};

window.actualizarKPIsAudit = function(datos) {
    var total = datos.length;
    var creo = 0, mod = 0, del = 0;
    datos.forEach(function(r) {
        var a = String(r.accion || '').toUpperCase();
        if (a.includes('CRE') || a.includes('INSERT') || a.includes('NUEV') || a.includes('REGISTR')) creo++;
        else if (a.includes('MODIF') || a.includes('ACTUALIZ') || a.includes('EDIT')) mod++;
        else if (a.includes('ELIMIN') || a.includes('ANUL') || a.includes('CANCEL')) del++;
    });

    var elTotal = document.getElementById('kpi-total-audit');
    if (elTotal) elTotal.textContent = total.toLocaleString();
    var elCreo = document.getElementById('kpi-creo-audit');
    if (elCreo) elCreo.textContent = creo.toLocaleString();
    var elMod = document.getElementById('kpi-mod-audit');
    if (elMod) elMod.textContent = mod.toLocaleString();
    var elDel = document.getElementById('kpi-del-audit');
    if (elDel) elDel.textContent = del.toLocaleString();
};

window.renderAuditTable = function() {
    var tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    var filter = window._auditFilter || 'all';
    var modFilter = ((document.getElementById('auditModuloFilter') || {}).value || '').toUpperCase();
    var search = ((document.getElementById('auditSearch') || {}).value || '').toLowerCase().trim();
    var fechaDesde = (document.getElementById('auditFechaDesde') || {}).value || '';
    var fechaHasta = (document.getElementById('auditFechaHasta') || {}).value || '';

    var filtered = (window.dataAuditoria || []).filter(function(r) {
        // Filtro por acción chip
        if (filter !== 'all') {
            var acc = String(r.accion || '').toUpperCase();
            if (filter === 'CREÓ' && !(acc.includes('CRE') || acc.includes('INSERT') || acc.includes('REGISTR'))) return false;
            if (filter === 'MODIFICÓ' && !(acc.includes('MODIF') || acc.includes('ACTUALIZ') || acc.includes('EDIT'))) return false;
            if (filter === 'ELIMINÓ' && !(acc.includes('ELIMIN') || acc.includes('ANUL') || acc.includes('CANCEL'))) return false;
            if (filter === 'SINCRONIZACION' && !(acc.includes('SYNC') || acc.includes('SINCRONIZ'))) return false;
        }

        // Filtro por módulo
        if (modFilter) {
            var m = String(r.modulo || '').toUpperCase();
            if (!m.includes(modFilter)) return false;
        }

        // Filtro por rango de fechas
        if (fechaDesde || fechaHasta) {
            if (r.fecha) {
                var fStr = r.fecha.substring(0, 10);
                if (fechaDesde && fStr < fechaDesde) return false;
                if (fechaHasta && fStr > fechaHasta) return false;
            }
        }

        // Buscador
        if (search) {
            var hay = (r.id + ' ' + (r.usuario || '') + ' ' + (r.modulo || '') + ' ' + (r.accion || '') + ' ' + (r.detalle || '') + ' ' + (r.fecha || '')).toLowerCase();
            if (!hay.includes(search)) return false;
        }

        return true;
    });

    // Ordenamiento
    filtered.sort(function(a, b) {
        if (window._auditSortAsc) return (a.id || 0) - (b.id || 0);
        return (b.id || 0) - (a.id || 0);
    });

    var sub = document.getElementById('audit-subtitle');
    if (sub) {
        sub.textContent = filtered.length + ' evento' + (filtered.length !== 1 ? 's' : '') + 
            (window.dataAuditoria.length !== filtered.length ? ' filtrados (de ' + window.dataAuditoria.length + ' totales)' : '');
    }

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 opacity-25 d-block mb-2"></i>No se encontraron eventos con los filtros seleccionados.</td></tr>';
        window.renderAuditPagination(0, 0, 0);
        return;
    }

    // Paginación
    var pageSize = parseInt(window._auditPageSize) || 50;
    var totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (window._auditPage > totalPages) window._auditPage = totalPages;
    if (window._auditPage < 1) window._auditPage = 1;

    var startIdx = (window._auditPage - 1) * pageSize;
    var endIdx = Math.min(startIdx + pageSize, filtered.length);
    var pagedData = filtered.slice(startIdx, endIdx);

    var html = '';
    pagedData.forEach(function(r) {
        var dt = _formatAuditDate(r.fecha);
        var uName = r.usuario || 'Sistema';
        var uColor = _getAuditUserColor(uName);
        var uInitials = _getAuditUserInitials(uName);
        var modStyle = _getModuloStyle(r.modulo);
        var accionBadge = _getAccionBadge(r.accion);
        var rawDetalle = r.detalle || '—';

        html += '<tr>'
            // 1. ID
            + '<td><span class="audit-id-badge">#' + r.id + '</span></td>'
            // 2. Fecha y hora
            + '<td>'
            +   '<div class="fw-semibold text-nowrap" style="font-size:0.83rem;">' + dt.full + '</div>'
            +   (dt.rel ? '<div class="text-muted" style="font-size:0.71rem;">' + dt.rel + '</div>' : '')
            + '</td>'
            // 3. Usuario
            + '<td>'
            +   '<div class="audit-user-cell">'
            +     '<div class="audit-avatar-circle" style="background:' + uColor + ';" title="' + uName + '">' + uInitials + '</div>'
            +     '<div class="audit-user-name" title="' + uName + '">' + uName + '</div>'
            +   '</div>'
            + '</td>'
            // 4. Módulo
            + '<td>'
            +   '<span class="audit-badge-module" style="background:' + modStyle.bg + ';color:' + modStyle.color + ';border:1px solid ' + modStyle.border + ';">'
            +     '<i class="bi ' + modStyle.icon + '"></i> ' + (r.modulo || 'GENERAL')
            +   '</span>'
            + '</td>'
            // 5. Acción
            + '<td>' + accionBadge + '</td>'
            // 6. Detalle
            + '<td><div class="audit-detail-cell">' + rawDetalle + '</div></td>'
            // 7. Botón Ver Detalle Modal
            + '<td class="text-center">'
            +   '<button class="btn btn-sm btn-outline-primary p-1 px-2" style="border-radius:6px; font-size:0.75rem;" onclick="window.verDetalleAudit(' + r.id + ')" title="Ver detalle completo">'
            +     '<i class="bi bi-eye"></i>'
            +   '</button>'
            + '</td>'
            + '</tr>';
    });

    tbody.innerHTML = html;
    window.renderAuditPagination(startIdx + 1, endIdx, filtered.length);
};

window.renderAuditPagination = function(from, to, total) {
    var info = document.getElementById('audit-pagination-info');
    if (info) {
        info.textContent = total > 0 ? 'Mostrando ' + from + ' - ' + to + ' de ' + total : 'Mostrando 0 de 0';
    }

    var controls = document.getElementById('audit-pagination-controls');
    if (!controls) return;

    var pageSize = parseInt(window._auditPageSize) || 50;
    var totalPages = Math.ceil(total / pageSize) || 1;
    var current = window._auditPage;

    var html = '';
    html += '<button class="btn btn-sm btn-outline-secondary px-2" style="border-radius:8px; font-size:0.75rem;" ' + (current <= 1 ? 'disabled' : '') + ' onclick="window.cambiarPaginaAudit(' + (current - 1) + ')"><i class="bi bi-chevron-left"></i></button>';

    // Render page numbers
    var maxButtons = 5;
    var startP = Math.max(1, current - 2);
    var endP = Math.min(totalPages, startP + maxButtons - 1);
    if (endP - startP < maxButtons - 1) {
        startP = Math.max(1, endP - maxButtons + 1);
    }

    if (startP > 1) {
        html += '<button class="btn btn-sm btn-outline-secondary px-2" style="border-radius:8px; font-size:0.75rem;" onclick="window.cambiarPaginaAudit(1)">1</button>';
        if (startP > 2) html += '<span class="px-1 text-muted">...</span>';
    }

    for (var p = startP; p <= endP; p++) {
        var isAct = p === current;
        html += '<button class="btn btn-sm ' + (isAct ? 'btn-primary' : 'btn-outline-secondary') + ' px-2" style="border-radius:8px; font-size:0.75rem; font-weight:' + (isAct ? '700' : '500') + ';" onclick="window.cambiarPaginaAudit(' + p + ')">' + p + '</button>';
    }

    if (endP < totalPages) {
        if (endP < totalPages - 1) html += '<span class="px-1 text-muted">...</span>';
        html += '<button class="btn btn-sm btn-outline-secondary px-2" style="border-radius:8px; font-size:0.75rem;" onclick="window.cambiarPaginaAudit(' + totalPages + ')">' + totalPages + '</button>';
    }

    html += '<button class="btn btn-sm btn-outline-secondary px-2" style="border-radius:8px; font-size:0.75rem;" ' + (current >= totalPages ? 'disabled' : '') + ' onclick="window.cambiarPaginaAudit(' + (current + 1) + ')"><i class="bi bi-chevron-right"></i></button>';

    controls.innerHTML = html;
};

window.cambiarPaginaAudit = function(p) {
    window._auditPage = p;
    window.renderAuditTable();
};

window.cambiarPageSizeAudit = function(sz) {
    window._auditPageSize = parseInt(sz) || 50;
    window._auditPage = 1;
    window.renderAuditTable();
};

window.setAuditFilter = function(f) {
    window._auditFilter = f;
    document.querySelectorAll('#auditChips .audit-chip-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.filter === f);
    });
    document.querySelectorAll('.audit-kpi-card').forEach(function(card) {
        card.classList.toggle('active', card.dataset.filter === f);
    });
    window._auditPage = 1;
    window.renderAuditTable();
};

window.filtrarAuditFeed = function() {
    window._auditPage = 1;
    window.renderAuditTable();
};

window.limpiarFiltrosFecha = function() {
    var f1 = document.getElementById('auditFechaDesde');
    var f2 = document.getElementById('auditFechaHasta');
    if (f1) f1.value = '';
    if (f2) f2.value = '';
    window.filtrarAuditFeed();
};

window.toggleOrdenAudit = function() {
    window._auditSortAsc = !window._auditSortAsc;
    var icon = document.getElementById('audit-sort-icon');
    if (icon) {
        icon.className = window._auditSortAsc ? 'bi bi-sort-numeric-up ms-1' : 'bi bi-sort-numeric-down ms-1';
    }
    window.renderAuditTable();
};

window.verDetalleAudit = function(id) {
    var item = (window.dataAuditoria || []).find(function(x) { return x.id === id; });
    if (!item) return;

    var dt = _formatAuditDate(item.fecha);
    var content = document.getElementById('modalAuditContent');
    var title = document.getElementById('modalAuditTitle');
    if (title) title.textContent = 'Detalle de Auditoría #' + item.id;

    if (content) {
        content.innerHTML = '<div class="audit-detail-modal-card">'
            + '<div class="audit-detail-row"><div class="audit-detail-label">ID Evento:</div><div class="audit-detail-val fw-bold text-primary">#' + item.id + '</div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Fecha y Hora:</div><div class="audit-detail-val">' + dt.full + ' ' + (dt.rel ? '<span class="badge bg-secondary ms-1">' + dt.rel + '</span>' : '') + '</div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Usuario:</div><div class="audit-detail-val fw-semibold">' + (item.usuario || 'Sistema') + '</div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Módulo:</div><div class="audit-detail-val"><span class="badge bg-light text-dark border">' + (item.modulo || 'GENERAL') + '</span></div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Acción:</div><div class="audit-detail-val">' + _getAccionBadge(item.accion) + '</div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Descripción / Detalle:</div><div class="audit-detail-val p-3 bg-light rounded border mt-2" style="font-family:monospace; white-space:pre-wrap; font-size:0.85rem;">' + (item.detalle || 'Sin detalle adicional') + '</div></div>'
            + '</div>';
    }

    var modalEl = document.getElementById('modalDetalleAudit');
    if (modalEl && window.bootstrap && window.bootstrap.Modal) {
        var modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
};

window.exportarAuditoriaCSV = function() {
    if (!window.dataAuditoria || !window.dataAuditoria.length) {
        if (window.Swal) Swal.fire('Sin datos', 'No hay registros para exportar', 'info');
        else alert('No hay registros de auditoría para exportar');
        return;
    }

    var headers = ['ID', 'Fecha', 'Usuario', 'Modulo', 'Accion', 'Detalle'];
    var rows = window.dataAuditoria.map(function(r) {
        return [
            r.id,
            '"' + (r.fecha || '').replace(/"/g, '""') + '"',
            '"' + (r.usuario || '').replace(/"/g, '""') + '"',
            '"' + (r.modulo || '').replace(/"/g, '""') + '"',
            '"' + (r.accion || '').replace(/"/g, '""') + '"',
            '"' + (r.detalle || '').replace(/"/g, '""') + '"'
        ];
    });

    var csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.map(function(e) { return e.join(','); }).join('\n');
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Auditoria_Azkell_ERP_' + new Date().toISOString().slice(0,10) + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.init_auditoria = function() {
    if (!window.checkPerm('mod_auditoria', 'l') && !window.checkPerm('admin', '')) {
        var wrap = document.getElementById('moduloAuditoria') || document.querySelector('.container-fluid');
        if (wrap && window.showNoPermMsg) window.showNoPermMsg(wrap);
        return;
    }
    window.dataAuditoria = [];
    window._auditFilter = 'all';
    window._auditSortAsc = false;
    window._auditPage = 1;
    window.cargarAuditoria(true);
};
