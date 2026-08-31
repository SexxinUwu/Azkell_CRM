// ================================================================
// MÓDULO: AUDITORÍA — Registro y Control de Actividad ERP
// ================================================================

window.dataAuditoria = window.dataAuditoria || [];
window._auditFilter  = window._auditFilter  || 'all';
window._auditSortAsc = false; // Descendente por defecto (más reciente primero)
window._auditPage    = 1;
window._auditPageSize = 50;

var _AUDIT_COLORS = ['#6366f1','#10b981','#06b6d4','#f59e0b','#8b5cf6','#ef4444','#ec4899','#0284c7','#14b8a6','#e11d48'];

// Mapa de taxonomía ERP para Módulos y Submódulos
var _ERP_TAXONOMY = {
    'OPERACIONES': [
        { key: 'COMBUSTIBLE', label: '⛽ Combustible / Vales' },
        { key: 'ORDENES_VIAJE', label: '🚚 Órdenes de Viaje' },
        { key: 'MONITOREO', label: '📡 Monitoreo' }
    ],
    'MANTENIMIENTO': [
        { key: 'TALLER', label: '🔧 Taller & OT' },
        { key: 'FLEETRUN', label: '⏱ Fleetrun' },
        { key: 'INSPECCIONES', label: '🔍 Inspecciones' },
        { key: 'INCIDENCIAS', label: '⚠️ Incidencias Ruta' },
        { key: 'NEUMATICOS', label: '🛞 Neumáticos' },
        { key: 'PLANIFICACION', label: '📅 Planificación MP' }
    ],
    'SEGURIDAD': [
        { key: 'GARITA', label: '🛡 Control de Garita' },
        { key: 'CHECKLIST', label: '📋 Checklist Salida' }
    ],
    'FLOTA': [
        { key: 'PLACAS', label: '🚛 Placas / Unidades' },
        { key: 'STATUS', label: '🚦 Status Flota' }
    ],
    'SISTEMA': [
        { key: 'USUARIOS', label: '👥 Usuarios' },
        { key: 'ROLES', label: '🎭 Roles y Permisos' },
        { key: 'PERFIL', label: '👤 Perfil' },
        { key: 'AJUSTES', label: '⚙ Ajustes' }
    ]
};

function _getAuditUserColor(str) {
    var s = String(str || 'A');
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xFFFFFF;
    return _AUDIT_COLORS[Math.abs(h) % _AUDIT_COLORS.length];
}

function _getAuditUserInitials(str) {
    var raw = String(str || 'A').trim();
    var parts = raw.split(/[@.\s_-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0] || 'AD').slice(0, 2).toUpperCase();
}

function _getLoggedUserFallback() {
    try {
        var u = sessionStorage.getItem('usuario') || localStorage.getItem('usuario');
        if (u) {
            var parsed = JSON.parse(u);
            return parsed.nombre || parsed.correo || 'Administrador';
        }
    } catch(e) {}
    return 'Administrador';
}

function _cleanAuditUser(val) {
    if (!val) return _getLoggedUserFallback();
    var s = String(val).trim();
    var upper = s.toUpperCase();
    // Evitar que nombres de tecnicos/mecanicos/placeholders aparezcan como el usuario del sistema
    if (upper === 'NIXON' || upper === 'ELVIS' || upper === 'TECNICO' || upper === 'MECANICO' || upper === 'SISTEMA' || upper === 'SISTEMA / AUTOMÁTICO' || upper.includes('[OBJECT')) {
        return _getLoggedUserFallback();
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

// Formateador específico, claro y directo para el Detalle de la Operación
function _formatAuditDetalle(rawDetalle, rawModulo, rawAccion, rawUsuario) {
    var d = String(rawDetalle || '').trim();
    var m = String(rawModulo || '').toUpperCase();
    var a = String(rawAccion || '').toUpperCase();

    // 1. Patrón Inspecciones: "PLACA · AAAA-MM-DD" (ej. "BES829 · 2026-08-17")
    var matchInsp = d.match(/^([A-Z0-9]{5,8})\s*[·•-]\s*(\d{4}-\d{2}-\d{2})$/i);
    if (matchInsp) {
        var fParts = matchInsp[2].split('-');
        var fFormatted = fParts[2] + '/' + fParts[1] + '/' + fParts[0];
        var tech = (rawUsuario && rawUsuario.toUpperCase() === 'NIXON') ? ' (Técnico: Nixon)' : '';
        return 'Inspección técnica de unidad ' + matchInsp[1].toUpperCase() + ' · Fecha: ' + fFormatted + tech;
    }

    // 2. Patrón Garita Salida: "Registro unidad CHECK-2026-0017"
    if (d.toLowerCase().includes('registro unidad check-')) {
        var numCheck = d.replace(/.*registro unidad /i, '').trim();
        return 'Salida de garita registrada para unidad con Ticket #' + numCheck;
    }

    // 3. Patrón Garita Retorno: "Unidad retorno CHECK-2026-0002"
    if (d.toLowerCase().includes('unidad retorno check-')) {
        var numRetorno = d.replace(/.*unidad retorno /i, '').trim();
        return 'Ingreso y retorno a garita registrado para Ticket #' + numRetorno;
    }

    // 4. Patrón Sincronización Remota Vales
    if (d.toLowerCase().includes('sincronizados') && d.toLowerCase().includes('vales')) {
        return 'Sincronización remota: ' + d.replace(/^sincronizados /i, 'Importados ');
    }

    // 5. Patrón Sincronización Viajes
    if (d.toLowerCase().includes('sincronizados') && d.toLowerCase().includes('viajes')) {
        return 'Sincronización remota: ' + d;
    }

    // 6. Patrón Planificación Preventivo: "PM1 · PLACA -> fleetrun_id" o "Plan X: motivo"
    if (d.includes('→') && d.includes('·')) {
        return 'Plan preventivo completado y generado en Fleetrun: ' + d;
    }
    if (d.startsWith('Plan ') && d.includes(':')) {
        return 'Cancelación de plan de mantenimiento ' + d;
    }

    // 7. Patrón Edición OT
    if (d.toLowerCase().includes('editó fechas de ot')) {
        return 'Modificación de fechas operativas en Orden de Trabajo #' + d.replace(/.*ot /i, '');
    }

    // 8. Template checklist
    if (d.toLowerCase() === 'template checklist') {
        return 'Actualización de plantilla y preguntas del checklist de inspección';
    }

    // 9. Si el detalle está vacío, es una barra "/" o "—"
    if (!d || d === '—' || d === '/' || d === 'undefined' || d.length < 2) {
        if (m.includes('COMBUST')) return 'Actualización de registros en el módulo de combustible';
        if (m.includes('TALLER') || m.includes('OT')) return 'Actualización de estado y servicios en taller';
        if (m.includes('INSPEC')) return 'Actualización de registro de inspección técnica';
        if (m.includes('SEGURIDAD')) return 'Actualización de control vehicular en garita';
        if (m.includes('USUARIO')) return 'Actualización en administración de usuarios';
        if (m.includes('ROL')) return 'Actualización en catálogo de roles y permisos';
        return 'Actualización y verificación de datos en ' + (m || 'Sistema');
    }

    return d;
}

// Resolver inteligente de Módulo y Sub-Módulo
function _resolveModuloSubmodulo(rawModulo, rawSubmodulo, rawDetalle) {
    var m = String(rawModulo || '').toUpperCase().trim();
    var sm = String(rawSubmodulo || '').toUpperCase().trim();
    var det = String(rawDetalle || '').toUpperCase();

    var moduloFinal = 'GENERAL';
    var submoduloFinal = 'General';
    var iconSub = 'bi-circle';

    // 1. Si ya tiene sub-módulo explícito
    if (sm) {
        if (sm.includes('COMBUST') || sm.includes('VALE')) { moduloFinal = 'OPERACIONES'; submoduloFinal = 'Combustible / Vales'; iconSub = 'bi-fuel-pump'; }
        else if (sm.includes('VIAJE') || sm.includes('ORDEN')) { moduloFinal = 'OPERACIONES'; submoduloFinal = 'Órdenes de Viaje'; iconSub = 'bi-truck'; }
        else if (sm.includes('OT') || sm.includes('TALLER')) { moduloFinal = 'MANTENIMIENTO'; submoduloFinal = 'Taller & OT'; iconSub = 'bi-wrench-adjustable'; }
        else if (sm.includes('FLEETRUN')) { moduloFinal = 'MANTENIMIENTO'; submoduloFinal = 'Fleetrun'; iconSub = 'bi-speedometer2'; }
        else if (sm.includes('INSPEC')) { moduloFinal = 'MANTENIMIENTO'; submoduloFinal = 'Inspecciones'; iconSub = 'bi-clipboard-check'; }
        else if (sm.includes('INCIDENC')) { moduloFinal = 'MANTENIMIENTO'; submoduloFinal = 'Incidencias Ruta'; iconSub = 'bi-exclamation-triangle'; }
        else if (sm.includes('NEUMAT') || sm.includes('LLANTA')) { moduloFinal = 'MANTENIMIENTO'; submoduloFinal = 'Neumáticos'; iconSub = 'bi-circle-half'; }
        else if (sm.includes('PLANIF')) { moduloFinal = 'MANTENIMIENTO'; submoduloFinal = 'Planificación MP'; iconSub = 'bi-calendar-check'; }
        else if (sm.includes('GARITA') || sm.includes('SEGURIDAD') || sm.includes('SALIDA') || sm.includes('RETORNO')) { moduloFinal = 'SEGURIDAD'; submoduloFinal = 'Control Garita'; iconSub = 'bi-shield-lock'; }
        else if (sm.includes('CHECKLIST')) { moduloFinal = 'SEGURIDAD'; submoduloFinal = 'Checklist Salida'; iconSub = 'bi-check2-square'; }
        else if (sm.includes('PLACA') || sm.includes('VEHIC')) { moduloFinal = 'FLOTA'; submoduloFinal = 'Placas / Unidades'; iconSub = 'bi-car-front-fill'; }
        else if (sm.includes('STATUS')) { moduloFinal = 'FLOTA'; submoduloFinal = 'Status Flota'; iconSub = 'bi-traffic-light'; }
        else if (sm.includes('USUARIO')) { moduloFinal = 'SISTEMA'; submoduloFinal = 'Usuarios'; iconSub = 'bi-people-fill'; }
        else if (sm.includes('ROL')) { moduloFinal = 'SISTEMA'; submoduloFinal = 'Roles y Permisos'; iconSub = 'bi-person-badge'; }
        else if (sm.includes('PERFIL')) { moduloFinal = 'SISTEMA'; submoduloFinal = 'Perfil'; iconSub = 'bi-person-circle'; }
        else if (sm.includes('AJUSTE') || sm.includes('CONFIG')) { moduloFinal = 'SISTEMA'; submoduloFinal = 'Ajustes'; iconSub = 'bi-sliders'; }
        else { submoduloFinal = rawSubmodulo; }
    }

    // 2. Si no tiene sub-módulo explícito, inferir a partir de modulo o detalle
    if (!sm || submoduloFinal === 'General') {
        if (m.includes('COMBUSTIBLE')) {
            moduloFinal = 'OPERACIONES';
            submoduloFinal = 'Combustible / Vales';
            iconSub = 'bi-fuel-pump';
        } else if (m.includes('OPERACION')) {
            moduloFinal = 'OPERACIONES';
            if (det.includes('VIAJE') || det.includes('ORDEN')) { submoduloFinal = 'Órdenes de Viaje'; iconSub = 'bi-truck'; }
            else if (det.includes('VALE') || det.includes('COMBUSTIBLE')) { submoduloFinal = 'Combustible / Vales'; iconSub = 'bi-fuel-pump'; }
            else { submoduloFinal = 'Operaciones Generales'; iconSub = 'bi-truck'; }
        } else if (m === 'OT' || m.includes('TALLER')) {
            moduloFinal = 'MANTENIMIENTO';
            submoduloFinal = 'Taller & OT';
            iconSub = 'bi-wrench-adjustable';
        } else if (m.includes('FLEETRUN')) {
            moduloFinal = 'MANTENIMIENTO';
            submoduloFinal = 'Fleetrun';
            iconSub = 'bi-speedometer2';
        } else if (m.includes('INSPECCION')) {
            moduloFinal = 'MANTENIMIENTO';
            submoduloFinal = 'Inspecciones';
            iconSub = 'bi-clipboard-check';
        } else if (m.includes('INCIDENCIA')) {
            moduloFinal = 'MANTENIMIENTO';
            submoduloFinal = 'Incidencias Ruta';
            iconSub = 'bi-exclamation-triangle';
        } else if (m.includes('NEUMATICO')) {
            moduloFinal = 'MANTENIMIENTO';
            submoduloFinal = 'Neumáticos';
            iconSub = 'bi-circle-half';
        } else if (m.includes('PLANIFICACION')) {
            moduloFinal = 'MANTENIMIENTO';
            submoduloFinal = 'Planificación MP';
            iconSub = 'bi-calendar-check';
        } else if (m.includes('SEGURIDAD')) {
            moduloFinal = 'SEGURIDAD';
            if (det.includes('CHECKLIST')) { submoduloFinal = 'Checklist Salida'; iconSub = 'bi-check2-square'; }
            else { submoduloFinal = 'Control Garita'; iconSub = 'bi-shield-lock'; }
        } else if (m.includes('PLACA') || m.includes('VEHICULO')) {
            moduloFinal = 'FLOTA';
            submoduloFinal = 'Placas / Unidades';
            iconSub = 'bi-car-front-fill';
        } else if (m.includes('STATUS')) {
            moduloFinal = 'FLOTA';
            submoduloFinal = 'Status Flota';
            iconSub = 'bi-traffic-light';
        } else if (m.includes('USUARIO')) {
            moduloFinal = 'SISTEMA';
            submoduloFinal = 'Usuarios';
            iconSub = 'bi-people-fill';
        } else if (m.includes('ROL')) {
            moduloFinal = 'SISTEMA';
            submoduloFinal = 'Roles y Permisos';
            iconSub = 'bi-person-badge';
        } else if (m.includes('PERFIL')) {
            moduloFinal = 'SISTEMA';
            submoduloFinal = 'Perfil';
            iconSub = 'bi-person-circle';
        } else if (m.includes('AJUSTE') || m.includes('CONFIG')) {
            moduloFinal = 'SISTEMA';
            submoduloFinal = 'Ajustes';
            iconSub = 'bi-sliders';
        } else {
            moduloFinal = m || 'SISTEMA';
            submoduloFinal = 'General';
            iconSub = 'bi-gear';
        }
    }

    return {
        modulo: moduloFinal,
        submodulo: submoduloFinal,
        iconSub: iconSub
    };
}

function _getModuloStyle(mod) {
    var m = String(mod || 'GENERAL').toUpperCase();
    if (m === 'OPERACIONES') return { bg: 'rgba(2, 132, 199, 0.12)', color: '#0369a1', border: 'rgba(2, 132, 199, 0.3)', icon: 'bi-truck' };
    if (m === 'MANTENIMIENTO') return { bg: 'rgba(6, 182, 212, 0.12)', color: '#0e7490', border: 'rgba(6, 182, 212, 0.3)', icon: 'bi-tools' };
    if (m === 'SEGURIDAD') return { bg: 'rgba(236, 72, 153, 0.12)', color: '#be185d', border: 'rgba(236, 72, 153, 0.3)', icon: 'bi-shield-lock-fill' };
    if (m === 'FLOTA') return { bg: 'rgba(16, 185, 129, 0.12)', color: '#047857', border: 'rgba(16, 185, 129, 0.3)', icon: 'bi-car-front-fill' };
    if (m === 'SISTEMA') return { bg: 'rgba(168, 85, 247, 0.12)', color: '#7e22ce', border: 'rgba(168, 85, 247, 0.3)', icon: 'bi-cpu-fill' };
    return { bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: 'rgba(100, 116, 139, 0.3)', icon: 'bi-gear-wide-connected' };
}

function _getAccionBadge(acc) {
    var a = String(acc || '').toUpperCase();
    if (a.includes('CRE') || a.includes('INSERT') || a.includes('NUEV') || a.includes('REGISTR')) {
        return '<span class="audit-badge-action audit-badge-cre"><i class="bi bi-plus-circle-fill"></i> ' + (acc || 'CREÓ') + '</span>';
    }
    if (a.includes('MODIF') || a.includes('ACTUALIZ') || a.includes('EDIT') || a.includes('CAMBIO') || a === 'ACCIÓN') {
        return '<span class="audit-badge-action audit-badge-mod"><i class="bi bi-pencil-square"></i> ' + (acc === 'ACCIÓN' ? 'MODIFICÓ' : (acc || 'MODIFICÓ')) + '</span>';
    }
    if (a.includes('ELIMIN') || a.includes('ANUL') || a.includes('CANCEL') || a.includes('DELETE')) {
        return '<span class="audit-badge-action audit-badge-del"><i class="bi bi-trash3-fill"></i> ' + (acc || 'ELIMINÓ') + '</span>';
    }
    if (a.includes('SYNC') || a.includes('SINCRONIZ')) {
        return '<span class="audit-badge-action audit-badge-sync"><i class="bi bi-cloud-arrow-down-fill"></i> ' + (acc || 'SINCRONIZÓ') + '</span>';
    }
    return '<span class="audit-badge-action audit-badge-mod" style="background:rgba(99,102,241,0.12);color:#4f46e5;border-color:rgba(99,102,241,0.3);"><i class="bi bi-activity"></i> ' + (acc || 'MODIFICÓ') + '</span>';
}

window.onModuloFilterChange = function() {
    var modVal = ((document.getElementById('auditModuloFilter') || {}).value || '').toUpperCase();
    var subSelect = document.getElementById('auditSubmoduloFilter');
    
    if (subSelect) {
        subSelect.innerHTML = '<option value="">📁 Todos los sub-módulos</option>';
        if (modVal && _ERP_TAXONOMY[modVal]) {
            _ERP_TAXONOMY[modVal].forEach(function(item) {
                subSelect.innerHTML += '<option value="' + item.key + '">' + item.label + '</option>';
            });
        }
    }
    window.filtrarAuditFeed();
};

window.cargarAuditoria = async function(forzar) {
    var reloadIcon = document.getElementById('audit-reload-icon');
    if (reloadIcon) reloadIcon.classList.add('bi-spin');
    
    var tbody = document.getElementById('auditTableBody');
    if (tbody && (!window.dataAuditoria || window.dataAuditoria.length === 0 || forzar)) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2 text-primary"></span>Cargando historial de auditoría...</td></tr>';
    }

    try {
        var res = await fetch('/api/auditoria?limit=1000');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        window.dataAuditoria = (json.data || []).map(function(r) {
            var rawU = r.usuario;
            r.usuario = _cleanAuditUser(rawU);
            r.id = parseInt(r.id) || 0;
            var resTax = _resolveModuloSubmodulo(r.modulo, r.submodulo, r.detalle);
            r.moduloNorm = resTax.modulo;
            r.submoduloNorm = resTax.submodulo;
            r.iconSub = resTax.iconSub;
            r.detalleFormatted = _formatAuditDetalle(r.detalle, r.moduloNorm, r.accion, rawU);
            if (r.accion === 'ACCIÓN' || !r.accion) r.accion = 'MODIFICÓ';
            return r;
        });
        window._auditPage = 1;
        window.actualizarKPIsAudit(window.dataAuditoria);
        window.renderAuditTable();
    } catch(e) {
        console.error('Error al cargar auditoría:', e);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-danger"><i class="bi bi-exclamation-triangle-fill fs-3 d-block mb-2"></i>Error al cargar registros: ' + e.message + '</td></tr>';
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
        else if (a.includes('MODIF') || a.includes('ACTUALIZ') || a.includes('EDIT') || a === 'ACCIÓN') mod++;
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
    var subFilter = ((document.getElementById('auditSubmoduloFilter') || {}).value || '').toUpperCase();
    var search = ((document.getElementById('auditSearch') || {}).value || '').toLowerCase().trim();
    var fechaDesde = (document.getElementById('auditFechaDesde') || {}).value || '';
    var fechaHasta = (document.getElementById('auditFechaHasta') || {}).value || '';

    var filtered = (window.dataAuditoria || []).filter(function(r) {
        // Filtro por acción chip
        if (filter !== 'all') {
            var acc = String(r.accion || '').toUpperCase();
            if (filter === 'CREÓ' && !(acc.includes('CRE') || acc.includes('INSERT') || acc.includes('REGISTR'))) return false;
            if (filter === 'MODIFICÓ' && !(acc.includes('MODIF') || acc.includes('ACTUALIZ') || acc.includes('EDIT') || acc === 'ACCIÓN')) return false;
            if (filter === 'ELIMINÓ' && !(acc.includes('ELIMIN') || acc.includes('ANUL') || acc.includes('CANCEL'))) return false;
            if (filter === 'SINCRONIZACION' && !(acc.includes('SYNC') || acc.includes('SINCRONIZ'))) return false;
        }

        // Filtro por módulo
        if (modFilter && r.moduloNorm !== modFilter) return false;

        // Filtro por sub-módulo
        if (subFilter) {
            var smNorm = (r.submoduloNorm || '').toUpperCase();
            if (subFilter === 'COMBUSTIBLE' && !smNorm.includes('COMBUST')) return false;
            if (subFilter === 'ORDENES_VIAJE' && !smNorm.includes('VIAJE')) return false;
            if (subFilter === 'TALLER' && !smNorm.includes('TALLER')) return false;
            if (subFilter === 'FLEETRUN' && !smNorm.includes('FLEETRUN')) return false;
            if (subFilter === 'INSPECCIONES' && !smNorm.includes('INSPEC')) return false;
            if (subFilter === 'INCIDENCIAS' && !smNorm.includes('INCIDENC')) return false;
            if (subFilter === 'NEUMATICOS' && !smNorm.includes('NEUMAT')) return false;
            if (subFilter === 'PLANIFICACION' && !smNorm.includes('PLANIF')) return false;
            if (subFilter === 'GARITA' && !smNorm.includes('GARITA')) return false;
            if (subFilter === 'CHECKLIST' && !smNorm.includes('CHECKLIST')) return false;
            if (subFilter === 'PLACAS' && !smNorm.includes('PLACA')) return false;
            if (subFilter === 'STATUS' && !smNorm.includes('STATUS')) return false;
            if (subFilter === 'USUARIOS' && !smNorm.includes('USUARIO')) return false;
            if (subFilter === 'ROLES' && !smNorm.includes('ROL')) return false;
            if (subFilter === 'PERFIL' && !smNorm.includes('PERFIL')) return false;
            if (subFilter === 'AJUSTES' && !smNorm.includes('AJUSTE')) return false;
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
            var hay = (r.id + ' ' + (r.usuario || '') + ' ' + (r.moduloNorm || '') + ' ' + (r.submoduloNorm || '') + ' ' + (r.accion || '') + ' ' + (r.detalleFormatted || '') + ' ' + (r.detalle || '') + ' ' + (r.fecha || '')).toLowerCase();
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
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 opacity-25 d-block mb-2"></i>No se encontraron eventos con los filtros seleccionados.</td></tr>';
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
        var uName = r.usuario || 'Administrador';
        var uColor = _getAuditUserColor(uName);
        var uInitials = _getAuditUserInitials(uName);
        var modStyle = _getModuloStyle(r.moduloNorm);
        var accionBadge = _getAccionBadge(r.accion);
        var displayDetalle = r.detalleFormatted || r.detalle || '—';

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
            +     '<i class="bi ' + modStyle.icon + '"></i> ' + r.moduloNorm
            +   '</span>'
            + '</td>'
            // 5. Sub-Módulo
            + '<td>'
            +   '<span class="audit-badge-submodule">'
            +     '<i class="bi ' + (r.iconSub || 'bi-circle') + ' text-primary"></i> ' + r.submoduloNorm
            +   '</span>'
            + '</td>'
            // 6. Acción
            + '<td>' + accionBadge + '</td>'
            // 7. Detalle
            + '<td><div class="audit-detail-cell">' + displayDetalle + '</div></td>'
            // 8. Botón Ver Detalle Modal
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
            + '<div class="audit-detail-row"><div class="audit-detail-label">Usuario:</div><div class="audit-detail-val fw-semibold">' + (item.usuario || 'Administrador') + '</div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Módulo:</div><div class="audit-detail-val"><span class="badge bg-light text-dark border">' + (item.moduloNorm || 'GENERAL') + '</span></div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Sub-Módulo:</div><div class="audit-detail-val"><span class="badge bg-light text-primary border"><i class="bi ' + (item.iconSub || 'bi-circle') + ' me-1"></i>' + (item.submoduloNorm || 'General') + '</span></div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Acción:</div><div class="audit-detail-val">' + _getAccionBadge(item.accion) + '</div></div>'
            + '<div class="audit-detail-row"><div class="audit-detail-label">Descripción / Detalle:</div><div class="audit-detail-val p-3 bg-light rounded border mt-2" style="font-family:inherit; font-size:0.88rem; line-height:1.5;">' + (item.detalleFormatted || item.detalle || 'Sin detalle adicional') + '</div></div>'
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

    var headers = ['ID', 'Fecha', 'Usuario', 'Modulo', 'Submodulo', 'Accion', 'Detalle'];
    var rows = window.dataAuditoria.map(function(r) {
        return [
            r.id,
            '"' + (r.fecha || '').replace(/"/g, '""') + '"',
            '"' + (r.usuario || '').replace(/"/g, '""') + '"',
            '"' + (r.moduloNorm || '').replace(/"/g, '""') + '"',
            '"' + (r.submoduloNorm || '').replace(/"/g, '""') + '"',
            '"' + (r.accion || '').replace(/"/g, '""') + '"',
            '"' + (r.detalleFormatted || r.detalle || '').replace(/"/g, '""') + '"'
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
